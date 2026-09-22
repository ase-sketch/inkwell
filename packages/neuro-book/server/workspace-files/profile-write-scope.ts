import type {AuthorizedFileOperation, ResolvedFileTarget} from "nbook/server/workspace-files/authorized-file-operation";

/**
 * 交互型 profile 的写入域白名单（M2c 红线）。
 *
 * 交互型 profile 直接和作者对话、直接落盘，因此它们只能写入 Project Workspace 内
 * 的「设定与结构」区域；正文目录 manuscript/ 对它们永久只读。Plan Mode 的计划文件
 * （`.agent/plan/`）是另一套与正文无关的写路径，一并放行以保持 Plan Mode 行为不变。
 * 非交互 profile（派发出来的世界引擎、检索、资产维护等）不在此表内，写入域不受本约束。
 */
const INTERACTIVE_WRITE_PREFIXES = [
    "lorebook/",
    "outline/",
    "references/",
    "agents/",
    // Plan Mode 的计划文件：与正文无关，红线不覆盖；harness 本身也为该目录开了写审批豁免。
    ".agent/plan/",
] as const;

/** 持有写入域白名单的 profile key。未登记即「无写入域策略」。 */
const INTERACTIVE_PROFILE_KEYS: readonly string[] = Object.freeze([
    "leader.default",
    "interview.new-book",
]);

/** 写操作才会被写入域约束；读操作不受限。 */
const WRITE_OPERATIONS: readonly AuthorizedFileOperation[] = Object.freeze(["write", "edit", "apply_patch"]);

/** 人类可读的允许范围描述，直接进错误信息。 */
const ALLOWED_SCOPE_TEXT = `${INTERACTIVE_WRITE_PREFIXES.join("、")} 下的文件，或项目根目录下的 *.md 文件`;

/** 该 profile 是否持有写入域白名单。 */
export function hasProfileWriteScope(profileKey: string | undefined): boolean {
    return typeof profileKey === "string" && INTERACTIVE_PROFILE_KEYS.includes(profileKey);
}

/**
 * 校验一次写操作是否落在 profile 的写入域内。
 *
 * 判定依据是解析后的 canonical Project 相对路径（`../`、反斜杠、绝对路径都已在
 * 解析阶段归一化），因此「名字像白名单」不构成放行理由。不携带 Project 身份的
 * 目标（项目外绝对路径、Workspace Root `.nbook` 控制面）不进入本判定，维持既有
 * containment 语义。
 */
export function assertProfileWriteScope(input: {
    profileKey: string | undefined;
    operation: AuthorizedFileOperation;
    target: ResolvedFileTarget;
}): void {
    const {profileKey, operation, target} = input;
    if (!hasProfileWriteScope(profileKey) || !WRITE_OPERATIONS.includes(operation)) {
        return;
    }
    if (target.project === null) {
        return;
    }
    const relativePath = target.relativePath;
    if (!relativePath) {
        return;
    }
    if (isAllowedWritePath(relativePath)) {
        return;
    }
    throw new Error(
        `profile ${profileKey} 的写入域白名单拒绝写入 ${relativePath}：被拒前缀 ${rejectedPrefix(relativePath)}；`
        + `该 profile 只能写入 ${ALLOWED_SCOPE_TEXT}；正文目录 manuscript/ 一律禁止写入。`,
    );
}

/** 命中放行前缀，或项目根目录下一层的 Markdown。 */
function isAllowedWritePath(relativePath: string): boolean {
    if (INTERACTIVE_WRITE_PREFIXES.some((prefix) => relativePath.startsWith(prefix))) {
        return true;
    }
    return !relativePath.includes("/") && relativePath.endsWith(".md");
}

/** 报错时点名被拒的那一段：目录前缀带 `/`，根目录一层文件用文件名本身。 */
function rejectedPrefix(relativePath: string): string {
    const separatorIndex = relativePath.indexOf("/");
    return separatorIndex === -1 ? relativePath : `${relativePath.slice(0, separatorIndex)}/`;
}
