#!/usr/bin/env bun
import {access, mkdtemp, readFile, realpath, rm} from "node:fs/promises";
import {createServer} from "node:net";
import {tmpdir} from "node:os";
import {basename, dirname, join, resolve} from "node:path";
import {fileURLToPath} from "node:url";
import {parseArgs} from "node:util";

import {spawnOwnedProcess, type OwnedProcessTerminationReason} from "#owned-process/index";

const {values} = parseArgs({
    args: Bun.argv.slice(2),
    options: {bash: {type: "string"}},
    strict: true,
});
if (process.platform !== "win32" || process.arch !== "x64") {
    throw new Error("Windows Release Owned Process smoke仅支持Windows x64。");
}
const bash = values.bash ? resolve(values.bash) : await defaultGitBash();
await access(bash);
const systemTempRoot = await realpath(tmpdir());
const delegatedRoot = process.env.NEURO_BOOK_WINDOWS_RELEASE_SMOKE_ROOT;
if (!delegatedRoot) {
    const root = await mkdtemp(join(systemTempRoot, "nbook-owned-release-smoke-"));
    const worker = Bun.spawn([
        process.execPath,
        fileURLToPath(import.meta.url),
        "--bash",
        bash,
    ], {
        cwd: process.cwd(),
        env: {...process.env, NEURO_BOOK_WINDOWS_RELEASE_SMOKE_ROOT: root},
        stdin: "inherit",
        stdout: "inherit",
        stderr: "inherit",
    });
    let exitCode = 1;
    try {
        exitCode = await worker.exited;
    } finally {
        await rm(root, {recursive: true, force: true});
    }
    process.exitCode = exitCode;
} else {
    const root = await realpath(delegatedRoot);
    if (dirname(root).toLowerCase() !== systemTempRoot.toLowerCase()
        || !basename(root).startsWith("nbook-owned-release-smoke-")) {
        throw new Error(`Windows Release Owned Process worker root非法：${root}`);
    }
    await verifyTermination("timeout", bash, root);
    await verifyTermination("abort", bash, root);
    await verifyNestedProduct(root, bash);
    console.log(JSON.stringify({status: "passed", bash, runtime: process.execPath}));
}

/** 验证Portable Product外层Job可以容纳并收口Agent Bash内层Job。 */
async function verifyNestedProduct(root: string, bash: string): Promise<void> {
    const statePath = join(root, "nested.json");
    const fixture = fileURLToPath(new URL("./fixtures/nested-owned-root.ts", import.meta.url));
    const outer = spawnOwnedProcess({
        command: process.execPath,
        args: [fixture, statePath, bash],
        stdout: "pipe",
        stderr: "pipe",
        graceMs: 250,
        hardKillWaitMs: 3_000,
    });
    const state = await Promise.race([
        waitForState(statePath),
        outer.completion.then(
            (result) => Promise.reject(new Error(`嵌套Job在fixture就绪前退出：${JSON.stringify(result)}`)),
            (error) => Promise.reject(error),
        ),
    ]);

    await outer.terminate("host-disconnect");
    await waitForPidExit(state.pid);
    await waitForPortRelease(state.port);
}

/** 用真实Git Bash验证两种终止原因都由同一个Job lease完成资源收口。 */
async function verifyTermination(reason: OwnedProcessTerminationReason, bash: string, root: string): Promise<void> {
    const statePath = join(root, `${reason}.json`);
    const fixture = fileURLToPath(new URL("./fixtures/owned-root.ts", import.meta.url));
    const command = [process.execPath, fixture]
        .map((path) => `'${windowsPathForBash(path).replaceAll("'", "'\\''")}'`)
        .join(" ");
    const lease = spawnOwnedProcess({
        command: bash,
        args: ["-lc", command],
        cwd: root,
        env: {...process.env, OWNED_PROCESS_STATE_PATH: statePath},
        stdout: "pipe",
        stderr: "pipe",
        graceMs: 250,
        hardKillWaitMs: 3_000,
    });
    let stderr = "";
    lease.stderr?.on("data", (chunk: Buffer) => stderr += chunk.toString());
    const state = await Promise.race([
        waitForState(statePath),
        lease.completion.then(
            (result) => Promise.reject(new Error(`${reason}在fixture就绪前退出：${JSON.stringify(result)} ${stderr}`)),
            (error) => Promise.reject(error),
        ),
    ]);

    const result = await lease.terminate(reason);
    if (result.terminationReason !== reason) {
        throw new Error(`Owned Process终止原因错误：expected=${reason} actual=${String(result.terminationReason)}`);
    }
    await waitForPidExit(state.pid);
    await waitForPortRelease(state.port);
}

/** 默认宿主Git Bash仅用于开发验证；Release workflow显式传PortableGit。 */
async function defaultGitBash(): Promise<string> {
    const candidates = [
        process.env.ProgramFiles ? join(process.env.ProgramFiles, "Git", "bin", "bash.exe") : "",
        process.env.USERPROFILE ? join(process.env.USERPROFILE, "scoop", "apps", "git", "current", "bin", "bash.exe") : "",
    ].filter(Boolean);
    for (const candidate of candidates) {
        try {
            await access(candidate);
            return candidate;
        } catch {
            // 继续检查下一个标准位置。
        }
    }
    throw new Error("未找到Git Bash，必须显式传--bash。");
}

/** 把Windows路径转换为Git Bash路径。 */
function windowsPathForBash(path: string): string {
    const normalized = path.replaceAll("\\", "/");
    const drive = /^([A-Za-z]):\/(.*)$/u.exec(normalized);
    return drive ? `/${drive[1]?.toLowerCase()}/${drive[2]}` : normalized;
}

/** 等待fixture写出孙进程状态。 */
async function waitForState(path: string): Promise<{pid: number; port: number}> {
    const deadline = Date.now() + 5_000;
    while (Date.now() < deadline) {
        try {
            return JSON.parse(await readFile(path, "utf8")) as {pid: number; port: number};
        } catch {
            await Bun.sleep(25);
        }
    }
    throw new Error(`等待Release fixture超时：${path}`);
}

/** 等待孙进程退出。 */
async function waitForPidExit(pid: number): Promise<void> {
    const deadline = Date.now() + 3_000;
    while (Date.now() < deadline) {
        try {
            process.kill(pid, 0);
        } catch {
            return;
        }
        await Bun.sleep(25);
    }
    throw new Error(`Release fixture孙进程仍存活：${pid}`);
}

/** 要求Windows在有界窗口内释放孙进程监听端口。 */
async function waitForPortRelease(port: number): Promise<void> {
    const deadline = Date.now() + 3_000;
    while (Date.now() < deadline) {
        try {
            await bindPort(port);
            return;
        } catch (error) {
            if ((error as NodeJS.ErrnoException).code !== "EADDRINUSE") throw error;
            await Bun.sleep(25);
        }
    }
    throw new Error(`Release fixture端口仍未释放：${port}`);
}

/** 尝试独占监听fixture端口。 */
async function bindPort(port: number): Promise<void> {
    await new Promise<void>((resolvePromise, rejectPromise) => {
        const server = createServer();
        server.once("error", rejectPromise);
        server.listen(port, "127.0.0.1", () => server.close(() => resolvePromise()));
    });
}
