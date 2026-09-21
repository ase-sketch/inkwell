import {lstat, realpath} from "node:fs/promises";
import path from "node:path";

type AbsoluteFsPath = string;

type StateRootIntegrityBase = Readonly<{
    installationRoot: AbsoluteFsPath;
    stateRoot: AbsoluteFsPath;
    expectedWorkspaceRoot: AbsoluteFsPath;
}>;

export type SameStateRootIntegrity = StateRootIntegrityBase & Readonly<{kind: "same-state-root"}>;
export type CleanStateRootIntegrity = StateRootIntegrityBase & Readonly<{kind: "clean"; checkedWorkspaceRoot: AbsoluteFsPath}>;
export type SameTargetWorkspaceIntegrity = StateRootIntegrityBase & Readonly<{
    kind: "same-target-link";
    checkedWorkspaceRoot: AbsoluteFsPath;
    realWorkspaceRoot: AbsoluteFsPath;
}>;
export type ShadowWorkspaceIntegrity = StateRootIntegrityBase & Readonly<{
    kind: "shadow-workspace";
    checkedWorkspaceRoot: AbsoluteFsPath;
    checkedRealPath: AbsoluteFsPath;
    expectedRealPath: AbsoluteFsPath;
}>;
export type StateRootInspectionError = StateRootIntegrityBase & Readonly<{
    kind: "inspection-error";
    checkedWorkspaceRoot: AbsoluteFsPath;
    operation: "lstat" | "realpath-checked" | "realpath-expected";
    errorPath: AbsoluteFsPath;
    errorCode: string | null;
    errorMessage: string;
}>;

export type StateRootIntegrityResult =
    | SameStateRootIntegrity
    | CleanStateRootIntegrity
    | SameTargetWorkspaceIntegrity
    | ShadowWorkspaceIntegrity
    | StateRootInspectionError;
export type StateRootIntegrityFailure = ShadowWorkspaceIntegrity | StateRootInspectionError;

/** Manager 只读检查 Installation Root 下的影子 Workspace，不修改用户数据。 */
export async function inspectStateRootIntegrity(input: {
    installationRoot: string;
    stateRoot: string;
}): Promise<StateRootIntegrityResult> {
    const installationRoot = absoluteFsPath(path.resolve(input.installationRoot));
    const stateRoot = absoluteFsPath(path.resolve(input.stateRoot));
    const expectedWorkspaceRoot = absoluteFsPath(path.join(stateRoot, "workspace"));
    const base = {installationRoot, stateRoot, expectedWorkspaceRoot};
    if (pathKey(installationRoot) === pathKey(stateRoot)) return {kind: "same-state-root", ...base};

    const checkedWorkspaceRoot = absoluteFsPath(path.join(installationRoot, "workspace"));
    try {
        await lstat(checkedWorkspaceRoot);
    } catch (error) {
        if (errorCode(error) === "ENOENT") return {kind: "clean", ...base, checkedWorkspaceRoot};
        return inspectionError(base, checkedWorkspaceRoot, "lstat", checkedWorkspaceRoot, error);
    }

    const checkedRealPath = await resolveRealPath(base, checkedWorkspaceRoot, "realpath-checked");
    if (checkedRealPath.kind === "inspection-error") return checkedRealPath;
    const expectedRealPath = await resolveRealPath(base, checkedWorkspaceRoot, "realpath-expected", expectedWorkspaceRoot);
    if (expectedRealPath.kind === "inspection-error") return expectedRealPath;
    if (pathKey(checkedRealPath.path) === pathKey(expectedRealPath.path)) {
        return {kind: "same-target-link", ...base, checkedWorkspaceRoot, realWorkspaceRoot: checkedRealPath.path};
    }
    return {
        kind: "shadow-workspace",
        ...base,
        checkedWorkspaceRoot,
        checkedRealPath: checkedRealPath.path,
        expectedRealPath: expectedRealPath.path,
    };
}

export function inspectInstallationStateIntegrity(root: string, stateRoot: string): Promise<StateRootIntegrityResult> {
    return inspectStateRootIntegrity({installationRoot: absoluteFsPath(path.resolve(root)), stateRoot: absoluteFsPath(path.resolve(stateRoot))});
}

export function stateRootIntegrityFailed(result: StateRootIntegrityResult): result is StateRootIntegrityFailure {
    return result.kind === "shadow-workspace" || result.kind === "inspection-error";
}

export function formatStateRootIntegrityWarning(result: StateRootIntegrityFailure): string {
    if (result.kind === "inspection-error") {
        return [
            "无法完整验证Installation Root与State Root的Workspace Root关系。",
            `检查路径：${result.errorPath}`,
            `检查操作：${result.operation}`,
            `文件系统错误：${result.errorCode ?? "UNKNOWN"} ${result.errorMessage}`,
            `真实目录：${result.expectedWorkspaceRoot}`,
            "请先检查链接目标和目录权限；Manager不会自动复制、合并、删除或重命名用户数据。",
        ].join("\n");
    }
    return [
        "检测到Installation Root下存在错误的影子Workspace Root。",
        `错误目录：${result.checkedWorkspaceRoot}`,
        `真实目录：${result.expectedWorkspaceRoot}`,
        "请先备份并人工比较两个目录；Manager不会自动复制、合并、删除或重命名用户数据。",
    ].join("\n");
}

async function resolveRealPath(
    base: StateRootIntegrityBase,
    checkedWorkspaceRoot: AbsoluteFsPath,
    operation: "realpath-checked" | "realpath-expected",
    target: AbsoluteFsPath = checkedWorkspaceRoot,
): Promise<{kind: "resolved"; path: AbsoluteFsPath} | StateRootInspectionError> {
    try {
        return {kind: "resolved", path: absoluteFsPath(await realpath(target))};
    } catch (error) {
        return inspectionError(base, checkedWorkspaceRoot, operation, target, error);
    }
}

function inspectionError(
    base: StateRootIntegrityBase,
    checkedWorkspaceRoot: AbsoluteFsPath,
    operation: StateRootInspectionError["operation"],
    errorPath: AbsoluteFsPath,
    error: unknown,
): StateRootInspectionError {
    return {
        kind: "inspection-error",
        ...base,
        checkedWorkspaceRoot,
        operation,
        errorPath,
        errorCode: errorCode(error),
        errorMessage: error instanceof Error ? error.message : String(error),
    };
}

function absoluteFsPath(value: string): AbsoluteFsPath {
    return value;
}

function errorCode(error: unknown): string | null {
    return typeof error === "object" && error !== null && "code" in error && typeof error.code === "string" ? error.code : null;
}

function pathKey(filePath: string): string {
    const normalized = path.resolve(filePath).replaceAll("\\", "/").replace(/\/+$/u, "");
    return process.platform === "win32" ? normalized.toLowerCase() : normalized;
}
