import {readFile, stat} from "node:fs/promises";
import {isAbsolute, relative, resolve} from "node:path";

import {parseReleaseStateMigration, type ReleaseManifest} from "@notnotype/neuro-book-contracts/release";
import {APPLICATION_STATE_MIGRATION_STEP_IDS} from "@notnotype/neuro-book/build";

export const RELEASE_STATE_MIGRATION_DECLARATION = "release-state-migration.json";

const APPLICATION_ROOT_RELATIVE_PATH = "packages/neuro-book";
const REQUIRED_SOURCE_MIGRATION_FILES = [
    `${APPLICATION_ROOT_RELATIVE_PATH}/${RELEASE_STATE_MIGRATION_DECLARATION}`,
    `${APPLICATION_ROOT_RELATIVE_PATH}/docs/migrations/README.md`,
    `${APPLICATION_ROOT_RELATIVE_PATH}/scripts/db/migrate-application-state.ts`,
    `${APPLICATION_ROOT_RELATIVE_PATH}/server/runtime/application-state-command.ts`,
    `${APPLICATION_ROOT_RELATIVE_PATH}/server/runtime/application-state-migration/app-sqlite-step.ts`,
    `${APPLICATION_ROOT_RELATIVE_PATH}/server/runtime/application-state-migration/catalog-registry.ts`,
    `${APPLICATION_ROOT_RELATIVE_PATH}/server/runtime/application-state-migration/catalog.ts`,
    `${APPLICATION_ROOT_RELATIVE_PATH}/server/runtime/application-state-migration/lease.ts`,
    `${APPLICATION_ROOT_RELATIVE_PATH}/server/runtime/application-state-migration/runner.ts`,
    `${APPLICATION_ROOT_RELATIVE_PATH}/server/runtime/application-state-migration/types.ts`,
    `${APPLICATION_ROOT_RELATIVE_PATH}/server/agent/session/migrations/session-v2-review-repair/journal.ts`,
    `${APPLICATION_ROOT_RELATIVE_PATH}/server/agent/session/migrations/session-v2-review-repair/migration.ts`,
    `${APPLICATION_ROOT_RELATIVE_PATH}/server/agent/session/migrations/session-v2-review-repair/types.ts`,
] as const;

/**
 * 读取当前版本的有状态升级声明。缺失或不合法时必须在构建 Release Manifest 前失败。
 */
export async function readReleaseStateMigrationDeclaration(
    repositoryRoot: string,
): Promise<ReleaseManifest["stateMigration"]> {
    const root = resolve(repositoryRoot);
    const applicationRoot = resolve(root, APPLICATION_ROOT_RELATIVE_PATH);
    const declarationPath = resolve(applicationRoot, RELEASE_STATE_MIGRATION_DECLARATION);
    let value: unknown;
    try {
        value = JSON.parse(await readFile(declarationPath, "utf8")) as unknown;
    } catch (error) {
        if (isNodeError(error, "ENOENT")) {
            throw new Error(`Release 缺少有状态升级声明：${declarationPath}`, {cause: error});
        }
        throw new Error(`Release 有状态升级声明无法解析：${declarationPath}`, {cause: error});
    }

    const declaration = parseReleaseStateMigration(value);
    if (declaration.policy === "automatic") {
        const catalog = new Set<string>(APPLICATION_STATE_MIGRATION_STEP_IDS);
        const unknownSteps = declaration.steps.filter((step) => !catalog.has(step));
        if (unknownSteps.length > 0) {
            throw new Error(`state migration catalog 不存在的 step：${unknownSteps.join(", ")}`);
        }
    }

    if (declaration.guide) {
        const migrationsRoot = resolve(applicationRoot, "docs", "migrations");
        const guidePath = resolve(migrationsRoot, declaration.guide.replace(/^packages[\\/]neuro-book[\\/]docs[\\/]migrations[\\/]/u, ""));
        const guideRelativePath = relative(migrationsRoot, guidePath);
        if (!guideRelativePath || guideRelativePath === ".." || guideRelativePath.startsWith(`..${process.platform === "win32" ? "\\" : "/"}`)
            || isAbsolute(guideRelativePath)) {
            throw new Error("state migration guide 必须位于 packages/neuro-book/docs/migrations/。");
        }
        const guideStat = await stat(guidePath).catch(() => null);
        if (!guideStat?.isFile()) {
            throw new Error(`state migration guide 不存在：${declaration.guide}`);
        }
    }

    return declaration;
}

/** Source archive 必须携带统一迁移入口、runner 与当前 Release 的用户说明。 */
export function assertStateMigrationSourceFiles(
    files: readonly string[],
    declaration: ReleaseManifest["stateMigration"],
): void {
    const included = new Set(files.map((path) => path.replaceAll("\\", "/")));
    const required = [
        ...REQUIRED_SOURCE_MIGRATION_FILES,
        ...(declaration.guide ? [declaration.guide] : []),
    ];
    const missing = required.filter((path) => !included.has(path));
    if (missing.length > 0) {
        throw new Error(`Source archive 缺少 Application State migration 文件：${missing.join(", ")}`);
    }
}

function isNodeError(error: unknown, code: string): error is NodeJS.ErrnoException {
    return error instanceof Error && "code" in error && error.code === code;
}
