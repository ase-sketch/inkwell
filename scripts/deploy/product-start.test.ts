import {once} from "node:events";
import {spawn, type ChildProcess} from "node:child_process";
import {createServer} from "node:http";
import {existsSync} from "node:fs";
import {cp, mkdir, mkdtemp, readFile, rm, writeFile} from "node:fs/promises";
import {randomUUID} from "node:crypto";
import {join, resolve} from "node:path";
import {testHostPath} from "@notnotype/neuro-book-test-support/test-path";
import {afterEach, describe, expect, it} from "vitest";
import {
    PRODUCT_BUN_RUNTIME_ARGS,
    PRODUCT_RUNTIME_COMMAND_BOOTSTRAP,
    PRODUCT_SHUTDOWN_PATH,
    PRODUCT_SHUTDOWN_TOKEN_ENVIRONMENT,
    productRuntimeBuildPolicy,
} from "@notnotype/neuro-book-contracts/product-runtime";
import {
    buildProductRuntimePayload,
    prepareProductRuntimeSource,
    productBuildEnvironment,
} from "#scripts/build/build-product-runtime-image";
import {ProductRuntimeImageBuilder} from "#scripts/build/product-runtime-image-builder";
import {readProductRuntimeContract, ProductRuntimeImageVerifier} from "nbook/server/interfaces/product-runtime-image-verifier";

const roots: string[] = [];

afterEach(async () => {
    await Promise.all(roots.splice(0).map((root) => rm(root, {recursive: true, force: true})));
});

describe("Product start生命周期", () => {
    it("空 State Root 先执行真实 migration gate 与 preflight，再启动真实 Nitro", async () => {
        const root = await mkdtemp(testHostPath("nbook-product-seed-start-"));
        roots.push(root);
        const outputRoot = join(root, ".output");
        const stateRoot = join(root, "state");
        const productCommandEntry = await createVerifiedProductImage(root, outputRoot);
        expect(existsSync(stateRoot)).toBe(false);
        const port = await freeLoopbackPort();
        const commandEnvironment = createProductEnvironment(root, stateRoot, outputRoot, port);
        await runProductCommand(productCommandEntry, commandEnvironment, "command", "migrate-database");
        await runProductCommand(productCommandEntry, commandEnvironment, "command", "migrate-application-state", "--apply", "--run-id", "product-start-smoke");
        expect(existsSync(resolve(stateRoot, "workspace", ".nbook", "agent", "migrations", "application-state.json"))).toBe(true);
        expect(existsSync(resolve(stateRoot, "workspace", ".nbook", "agent", "migrations", "session-store.json"))).toBe(true);

        const shutdownToken = "product-start-smoke-shutdown-token";
        const launcher = launchProduct(productCommandEntry, root, stateRoot, outputRoot, port, shutdownToken);
        const stderr: string[] = [];
        launcher.stderr?.on("data", (chunk: Buffer) => stderr.push(chunk.toString("utf8")));
        try {
            const version = await waitForVersion(port, launcher, () => stderr.join(""));
            expect(version.versionLabel).toMatch(/^v/u);
            await expectInstalledRuntimeAssets(stateRoot);
            const shutdown = await fetch(`http://127.0.0.1:${port}${PRODUCT_SHUTDOWN_PATH}`, {
                method: "POST",
                headers: {authorization: `Bearer ${shutdownToken}`},
                signal: AbortSignal.timeout(5_000),
            });
            expect(shutdown.status).toBe(202);
            await waitForExit(launcher, () => stderr.join(""));
            expect(launcher.exitCode).toBe(0);
        } finally {
            if (launcher.exitCode === null && launcher.signalCode === null) launcher.kill("SIGKILL");
        }
    }, 300_000);
    it("父 stdout/stderr 断开后仍保持 HTTP ready 并可正常 shutdown", async () => {
        const root = await mkdtemp(testHostPath("nbook-product-stdio-disconnect-"));
        roots.push(root);
        const outputRoot = join(root, ".output");
        const stateRoot = join(root, "state");
        const productCommandEntry = await createVerifiedProductImage(root, outputRoot);
        const port = await freeLoopbackPort();
        const commandEnvironment = createProductEnvironment(root, stateRoot, outputRoot, port);
        await mkdirStateConfig(stateRoot);
        await runProductCommand(productCommandEntry, commandEnvironment, "command", "migrate-database");
        await runProductCommand(productCommandEntry, commandEnvironment, "command", "migrate-application-state", "--apply", "--run-id", "product-stdio-disconnect");

        await runProductCommand(productCommandEntry, commandEnvironment, "command", "workspace", "project", "create", "product-stdio-disconnect", "--title", "Product Stdio Disconnect", "--json");

        const launcher = launchProductWithClosedOutput(productCommandEntry, root, stateRoot, outputRoot, port, "product-stdio-disconnect-shutdown");
        try {
            const version = await waitForVersion(port, launcher, () => "");
            expect(version.versionLabel).toMatch(/^v/u);
            await assertWorldEngineReadPaths(port, "product-stdio-disconnect");
            const shutdown = await fetch(`http://127.0.0.1:${port}${PRODUCT_SHUTDOWN_PATH}`, {
                method: "POST",
                headers: {authorization: "Bearer product-stdio-disconnect-shutdown"},
                signal: AbortSignal.timeout(5_000),
            });
            expect(shutdown.status).toBe(202);
            await waitForExit(launcher, () => "");
            expect(launcher.exitCode).toBe(0);
            const logText = await readFile(resolve(stateRoot, "logs", "server-current.jsonl"), "utf8");
            expect(logText).toContain('"event":"app.logs.ready"');
            expect(logText).not.toContain("EPIPE");
            expect(logText).not.toContain("process.uncaughtException");
        } finally {
            if (launcher.exitCode === null && launcher.signalCode === null) {
                launcher.kill("SIGKILL");
                await waitForExit(launcher, () => "").catch(() => undefined);
            }
        }
    }, 300_000);

    it.skipIf(process.platform === "win32")("SIGTERM会转发给真实Nitro子进程并在超时前退出", async () => {
        const root = await mkdtemp(testHostPath("nbook-product-signal-"));
        roots.push(root);
        const outputRoot = join(root, ".output");
        const stateRoot = join(root, "state");
        const productCommandEntry = await createVerifiedProductImage(root, outputRoot);
        expect(existsSync(stateRoot)).toBe(false);
        const port = await freeLoopbackPort();
        const commandEnvironment = createProductEnvironment(root, stateRoot, outputRoot, port);
        await runProductCommand(productCommandEntry, commandEnvironment, "command", "migrate-database");
        await runProductCommand(productCommandEntry, commandEnvironment, "command", "migrate-application-state", "--apply", "--run-id", "product-signal-smoke");
        const launcher = launchProduct(productCommandEntry, root, stateRoot, outputRoot, port, "product-signal-shutdown-token");
        const stderr: string[] = [];
        launcher.stderr?.on("data", (chunk: Buffer) => stderr.push(chunk.toString("utf8")));
        try {
            await waitForVersion(port, launcher, () => stderr.join(""));
            launcher.kill("SIGTERM");
            await waitForExit(launcher, () => stderr.join(""));
            expect(launcher.exitCode).toBe(0);
        } finally {
            if (launcher.exitCode === null && launcher.signalCode === null) launcher.kill("SIGKILL");
        }
    }, 300_000);
});

async function createVerifiedProductImage(root: string, outputRoot: string): Promise<string> {
    const repositoryRoot = resolve(import.meta.dirname, "../..");
    const applicationRoot = resolve(repositoryRoot, "packages", "neuro-book");
    const buildEnvironment = {
        ...productBuildEnvironment(process.env, repositoryRoot),
        NEURO_BOOK_APPLICATION_ROOT: applicationRoot,
    };
    await prepareProductRuntimeSource(buildEnvironment);

    const builder = new ProductRuntimeImageBuilder({
        repositoryRoot,
        applicationSourceRoot: applicationRoot,
        deployRoot: resolve(root, ".deploy"),
    });
    const policy = productRuntimeBuildPolicy("windows-x64");
    const image = await builder.buildCandidate({
        operationId: `product-start-smoke-${randomUUID()}`,
        platform: "windows-x64",
        owners: policy.owners,
        budget: policy.budget,
        async build(context) {
            await buildProductRuntimePayload(context, buildEnvironment);
        },
    });

    await rm(outputRoot, {recursive: true, force: true});
    await cp(image.path, outputRoot, {recursive: true, dereference: false});
    await new ProductRuntimeImageVerifier().openSelfVerified(outputRoot);
    const contract = await readProductRuntimeContract(outputRoot);
    expect(contract.commands["migrate-database"].entry).toBeTruthy();
    return resolve(outputRoot, ...PRODUCT_RUNTIME_COMMAND_BOOTSTRAP.split("/"));
}
function createProductEnvironment(root: string, stateRoot: string, outputRoot: string, port: number): NodeJS.ProcessEnv {
    return {
        ...process.env,
        NODE_ENV: "production",
        DATABASE_KIND: "sqlite",
        DATABASE_URL: "file:./workspace/.nbook/neuro-book.sqlite",
        NEURO_BOOK_APPLICATION_ROOT: root,
        NEURO_BOOK_PRODUCT_IMAGE_ROOT: outputRoot,
        NEURO_BOOK_STATE_ROOT: stateRoot,
        NEURO_BOOK_CACHE_ROOT: join(root, "cache"),
        HOST: "127.0.0.1",
        NITRO_HOST: "127.0.0.1",
        PORT: String(port),
        NUXT_PORT: String(port),
        NUXT_SESSION_PASSWORD: "product-start-smoke-session-password",
    };
}
async function mkdirStateConfig(stateRoot: string): Promise<void> {
    await mkdir(stateRoot, {recursive: true});
    await writeFile(join(stateRoot, "config.yaml"), "auth:\n  enabled: false\n", "utf8");
}

async function runProductCommand(commandEntry: string, environment: NodeJS.ProcessEnv, mode: "command" | "check", id: string, ...args: string[]): Promise<void> {
    const bunExecutable = process.versions.bun ? process.execPath : process.env.BUN || "bun";
    const result = await new Promise<{code: number | null; signal: NodeJS.Signals | null}>((resolvePromise, rejectPromise) => {
        const child = spawn(bunExecutable, [...PRODUCT_BUN_RUNTIME_ARGS, commandEntry, mode, id, ...args], {
            cwd: environment.NEURO_BOOK_APPLICATION_ROOT,
            env: environment,
            stdio: "inherit",
        });
        child.once("error", rejectPromise);
        child.once("exit", (code, signal) => resolvePromise({code, signal}));
    });
    if (result.signal) throw new Error(`Product command ${id} 被信号终止：${result.signal}`);
    if (result.code !== 0) throw new Error(`Product command ${id} 失败：${result.code}`);
}

function launchProduct(
    commandEntry: string,
    applicationRoot: string,
    stateRoot: string,
    outputRoot: string,
    port: number,
    shutdownToken: string,
): ChildProcess {
    const bunExecutable = process.versions.bun ? process.execPath : process.env.BUN || "bun";
    return spawn(bunExecutable, [...PRODUCT_BUN_RUNTIME_ARGS, commandEntry, "command", "start"], {
        cwd: applicationRoot,
        env: {
            ...createProductEnvironment(applicationRoot, stateRoot, outputRoot, port),
            [PRODUCT_SHUTDOWN_TOKEN_ENVIRONMENT]: shutdownToken,
        },
        stdio: ["ignore", "ignore", "pipe"],
    });
}
function launchProductWithClosedOutput(
    commandEntry: string,
    applicationRoot: string,
    stateRoot: string,
    outputRoot: string,
    port: number,
    shutdownToken: string,
): ChildProcess {
    const bunExecutable = process.versions.bun ? process.execPath : process.env.BUN || "bun";
    const child = spawn(bunExecutable, [...PRODUCT_BUN_RUNTIME_ARGS, commandEntry, "command", "start"], {
        cwd: applicationRoot,
        env: {
            ...createProductEnvironment(applicationRoot, stateRoot, outputRoot, port),
            [PRODUCT_SHUTDOWN_TOKEN_ENVIRONMENT]: shutdownToken,
        },
        stdio: ["ignore", "pipe", "pipe"],
    });
    child.stdout?.destroy();
    child.stderr?.destroy();
    return child;
}
async function expectInstalledRuntimeAssets(stateRoot: string): Promise<void> {
    for (const relativePath of [
        "workspace/.nbook/agent/skills/tsx-profile-editing/SKILL.md",
        "workspace/.nbook/agent/workflows/write-review-loop/workflow.ts",
        "workspace/.nbook/agent/profiles/builtin/researcher.profile.tsx",
        "workspace/.nbook/reference/agent/profile-import.md",
        "workspace/.nbook/agent/installed.json",
        "workspace/.nbook/reference/reference-manifest.json",
    ]) {
        expect(existsSync(resolve(stateRoot, relativePath))).toBe(true);
    }
}

async function freeLoopbackPort(): Promise<number> {
    const server = createServer();
    server.listen(0, "127.0.0.1");
    await once(server, "listening");
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("Product smoke 无法分配 loopback 端口。");
    const port = address.port;
    await new Promise<void>((resolvePromise, rejectPromise) => {
        server.close((error) => error ? rejectPromise(error) : resolvePromise());
    });
    return port;
}

async function waitForVersion(port: number, child: ChildProcess, stderr: () => string): Promise<{versionLabel: string}> {
    const deadline = Date.now() + 90_000;
    while (Date.now() < deadline) {
        if (child.exitCode !== null && child.exitCode !== undefined) {
            throw new Error(`Product launcher 在 HTTP ready 前退出：${child.exitCode}\n${stderr()}`);
        }
        if (child.signalCode) {
            throw new Error(`Product launcher 在 HTTP ready 前被信号终止：${child.signalCode}\n${stderr()}`);
        }
        try {
            const response = await fetch(`http://127.0.0.1:${port}/api/app/version`, {signal: AbortSignal.timeout(2_000)});
            if (response.ok) {
                const value: unknown = await response.json();
                if (isVersionResponse(value)) return value;
            }
        } catch {
            // Nitro 尚未监听或启动门禁尚未完成；继续等待同一进程。
        }
        await new Promise((resolvePromise) => setTimeout(resolvePromise, 200));
    }
    throw new Error(`Product HTTP ready 超时：${stderr()}`);
}

async function waitForExit(child: ChildProcess, stderr: () => string): Promise<void> {
    if (child.exitCode !== null || child.signalCode !== null) return;
    await Promise.race([
        once(child, "exit").then(() => undefined),
        new Promise<never>((_resolvePromise, rejectPromise) => setTimeout(() => rejectPromise(new Error(`Product launcher 退出超时：${stderr()}`)), 30_000)),
    ]);
}
async function assertWorldEngineReadPaths(port: number, projectRoot: string): Promise<void> {
    const open = await fetch(`http://127.0.0.1:${port}/api/projects/open`, {
        method: "POST",
        headers: {"content-type": "application/json"},
        body: JSON.stringify({projectRoot}),
        signal: AbortSignal.timeout(10_000),
    });
    expect(open.status).toBe(200);
    await open.arrayBuffer();
    for (const path of ["schema", "subjects", "slices"] as const) {
        const response = await fetch(`http://127.0.0.1:${port}/api/projects/world-engine/${path}?projectRoot=${encodeURIComponent(projectRoot)}`, {
            signal: AbortSignal.timeout(10_000),
        });
        expect(response.status).toBe(200);
        await response.arrayBuffer();
    }
}

function isVersionResponse(value: unknown): value is {versionLabel: string} {
    return typeof value === "object"
        && value !== null
        && "versionLabel" in value
        && typeof value.versionLabel === "string";
}
