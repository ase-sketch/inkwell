import {existsSync} from "node:fs";
import {dirname, resolve} from "node:path";
import {fileURLToPath} from "node:url";

export const SOURCE_APPLICATION_RELATIVE_PATH = "packages/neuro-book" as const;

export type WorkspaceRoots = Readonly<{
    repositoryRoot: string;
    applicationSourceRoot: string;
    deployRoot: string;
}>;

/**
 * 从当前脚本模块位置计算仓库根；不依赖调用方的 cwd。
 * scripts/utils 位于仓库根下两层，因此该函数也适合被入口脚本复用。
 */
export function repositoryRootFromModule(moduleUrl: string = import.meta.url): string {
    return resolve(dirname(fileURLToPath(moduleUrl)), "..", "..");
}

/**
 * 在显式起点向上查找 NeuroBook repository root。
 * 只接受同时拥有根 package manifest、根 lockfile 和 scripts 目录的目录，避免
 * 在应用包迁移后把 application root 误当作 repository root。
 */
export function findRepositoryRoot(startPath: string = repositoryRootFromModule()): string {
    let current = resolve(startPath);
    while (true) {
        if (
            existsSync(resolve(current, "package.json"))
            && existsSync(resolve(current, "bun.lock"))
            && existsSync(resolve(current, "scripts"))
        ) {
            return current;
        }
        const parent = resolve(current, "..");
        if (parent === current) break;
        current = parent;
    }
    throw new Error(`无法从 ${startPath} 定位 NeuroBook repository root。`);
}

/**
 * 返回物理迁移期间的双根：repository root 负责 workspace/Git/lock，application
 * source root 负责 Nuxt/Prisma/Source Dev。S5 中应用代码仍在根；S6 迁移完成后
 * 由 nuxt.config.ts 这一应用身份文件自动切换到 packages/neuro-book。
 */
export function resolveWorkspaceRoots(input: {
    repositoryRoot?: string;
    applicationSourceRoot?: string;
    deployRoot?: string;
} = {}): WorkspaceRoots {
    const repositoryRoot = resolve(input.repositoryRoot ?? findRepositoryRoot());
    const applicationSourceRoot = resolve(
        input.applicationSourceRoot
        ?? detectApplicationSourceRoot(repositoryRoot),
    );
    const deployRoot = resolve(input.deployRoot ?? resolve(repositoryRoot, ".deploy"));
    return Object.freeze({repositoryRoot, applicationSourceRoot, deployRoot});
}

function detectApplicationSourceRoot(repositoryRoot: string): string {
    const migratedRoot = resolve(repositoryRoot, SOURCE_APPLICATION_RELATIVE_PATH);
    return existsSync(resolve(migratedRoot, "nuxt.config.ts")) ? migratedRoot : repositoryRoot;
}
