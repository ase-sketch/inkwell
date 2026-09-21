import {readFile, readdir, rm} from "node:fs/promises";
import {join, resolve} from "node:path";

import {ensureDirectory, pathExists, removePath, safeTarget} from "#manager/files";
import {extractZip} from "#manager/download";
import {run, runCapture} from "#manager/process";

export const DEFAULT_REPOSITORY = "https://github.com/notnotype/neuro-book.git";
export const DEFAULT_BRANCH = "master";
const MANAGER_OWNED_ENTRIES = new Set([".deploy", ".runtime", "data"]);

export type GitUpdateTarget = {previousRevision: string; targetRevision: string; branch: string};

/** 将 NeuroBook Git 仓库物化到 Installation Root。 */
export async function materializeRepository(root: string, repository = DEFAULT_REPOSITORY, branch = DEFAULT_BRANCH): Promise<void> {
    await ensureDirectory(root);
    if (await pathExists(join(root, ".git"))) {
        await validateRepository(root, repository, branch);
        await assertCleanWorktree(root);
        return;
    }
    const entries = await readdir(root);
    const unknown = entries.filter((entry) => !MANAGER_OWNED_ENTRIES.has(entry));
    if (unknown.length > 0) throw new Error(`Installation Root 非空且包含非 Manager 文件：${unknown.join(", ")}`);
    try {
        await run("git", ["init", "-b", branch], {cwd: root});
        await run("git", ["remote", "add", "origin", repository], {cwd: root});
        await run("git", ["fetch", "--depth", "1", "origin", branch], {cwd: root});
        await run("git", ["switch", "-c", branch, "--track", `origin/${branch}`], {cwd: root});
        await validateRepository(root, repository, branch);
    } catch (error) {
        await cleanupFailedMaterialize(root);
        throw error;
    }
}

/** 验证 checkout 确实属于 NeuroBook 且 branch/upstream 合法。 */
export async function validateRepository(root: string, repository = DEFAULT_REPOSITORY, branch = DEFAULT_BRANCH): Promise<void> {
    const packageJson = JSON.parse(await readFile(join(root, "package.json"), "utf8")) as {name?: string};
    if (packageJson.name !== "neuro-book") throw new Error(`Git checkout 不是 NeuroBook：package.json.name=${packageJson.name ?? "<missing>"}`);
    const origin = (await runCapture("git", ["remote", "get-url", "origin"], {cwd: root})).trim();
    if (normalizeRepository(origin) !== normalizeRepository(repository)) throw new Error(`Git origin 不是受支持的 NeuroBook repository：${origin}`);
    const currentBranch = (await runCapture("git", ["branch", "--show-current"], {cwd: root})).trim();
    if (currentBranch !== branch) throw new Error(`Git branch 必须是 ${branch}，当前为 ${currentBranch || "detached HEAD"}`);
    const upstream = (await runCapture("git", ["rev-parse", "--abbrev-ref", "--symbolic-full-name", "@{upstream}"], {cwd: root})).trim();
    if (upstream !== `origin/${branch}`) throw new Error(`Git upstream 必须是 origin/${branch}，当前为 ${upstream}`);
}

/** 确认 tracked/untracked worktree 均干净。 */
export async function assertCleanWorktree(root: string, allowedUntracked: string[] = []): Promise<void> {
    const lines = (await runCapture("git", ["status", "--porcelain"], {cwd: root})).split(/\r?\n/u).filter(Boolean);
    const allowed = allowedUntracked.map((path) => path.replaceAll("\\", "/").replace(/\/$/u, ""));
    const unexpected = lines.filter((line) => {
        if (!line.startsWith("?? ")) return true;
        const path = line.slice(3).replaceAll("\\", "/").replace(/\/$/u, "");
        return !allowed.some((prefix) => path === prefix || path.startsWith(`${prefix}/`));
    });
    if (unexpected.length) throw new Error(`Git worktree 有未提交或未跟踪改动，Manager 不会自动 restore、stash 或 reset：\n${unexpected.join("\n")}`);
}

/** fetch 并验证 fast-forward，但不修改主 checkout。 */
export async function fetchUpdateTarget(root: string, branch = DEFAULT_BRANCH, allowedUntracked: string[] = []): Promise<GitUpdateTarget> {
    await validateRepository(root, DEFAULT_REPOSITORY, branch);
    await assertCleanWorktree(root, allowedUntracked);
    await run("git", ["fetch", "origin", branch], {cwd: root});
    const previousRevision = await repositoryRevision(root);
    const targetRevision = (await runCapture("git", ["rev-parse", `origin/${branch}`], {cwd: root})).trim();
    const base = (await runCapture("git", ["merge-base", "HEAD", `origin/${branch}`], {cwd: root})).trim();
    if (base !== previousRevision) throw new Error("本地分支不能 fast-forward 到远端，Manager 已停止更新。" );
    return {previousRevision, targetRevision, branch};
}

/** 创建用于依赖安装和 build 的固定 revision staged checkout。 */
export async function createStagedWorktree(root: string, path: string, revision: string): Promise<void> {
    await removePath(path);
    await ensureDirectory(resolve(path, ".."));
    if (process.platform === "win32") {
        // Bun 1.3.14 在Windows linked worktree中首次frozen install会误判lockfile变化；
        // 完整local clone又会复制庞大的Git对象库。tracked snapshot保留固定revision和隔离语义，
        // 同时不把主checkout的untracked文件或.git对象带进构建上下文。
        const archivePath = `${path}.zip`;
        try {
            await run("git", ["archive", "--format=zip", `--output=${archivePath}`, revision], {cwd: root});
            await extractZip(archivePath, path);
        } finally {
            await removePath(archivePath);
        }
        return;
    }
    await run("git", ["worktree", "add", "--detach", path, revision], {cwd: root});
}

/** 清理 staged worktree 注册和目录。 */
export async function removeStagedWorktree(root: string, path: string): Promise<void> {
    if (process.platform === "win32") {
        await removePath(path);
        return;
    }
    await run("git", ["worktree", "remove", "--force", path], {cwd: root}).catch(async () => removePath(path));
    await run("git", ["worktree", "prune"], {cwd: root});
}

/** 在 commit point 最后 fast-forward 主 checkout，不允许 HEAD 或 worktree 被并发修改。 */
export async function commitFastForward(root: string, target: GitUpdateTarget): Promise<void> {
    await assertCleanWorktree(root);
    const current = await repositoryRevision(root);
    if (current !== target.previousRevision) throw new Error("Git HEAD 在 staged build 期间发生变化，停止提交更新。" );
    await run("git", ["merge", "--ff-only", target.targetRevision], {cwd: root});
}

/** 兼容 source-dev 只更新 Source 的路径。 */
export async function updateRepository(root: string, branch = DEFAULT_BRANCH): Promise<string> {
    const target = await fetchUpdateTarget(root, branch);
    await commitFastForward(root, target);
    return target.targetRevision;
}

/** 读取当前 Source revision。 */
export async function repositoryRevision(root: string): Promise<string> {
    return (await runCapture("git", ["rev-parse", "HEAD"], {cwd: root})).trim();
}

async function cleanupFailedMaterialize(root: string): Promise<void> {
    const files = await runCapture("git", ["ls-files", "-z"], {cwd: root}).then((value) => value.split("\0").filter(Boolean)).catch(() => []);
    for (const file of files) await rm(safeTarget(root, file), {recursive: true, force: true});
    await removePath(join(root, ".git"));
}

/** 删除Fresh Install本次创建的Git checkout，只保留其他Manager-owned目录。 */
export async function removeMaterializedRepository(root: string): Promise<void> {
    await cleanupFailedMaterialize(root);
}

function normalizeRepository(repository: string): string {
    return repository.trim()
        .replace(/^git@github\.com:/u, "https://github.com/")
        .replace(/^ssh:\/\/git@github\.com\//u, "https://github.com/")
        .replace(/\.git$/u, "")
        .replace(/\/$/u, "")
        .toLowerCase();
}
