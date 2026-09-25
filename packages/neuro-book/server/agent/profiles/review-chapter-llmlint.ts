import {execFile} from "node:child_process";
import {existsSync} from "node:fs";
import path from "node:path";
import {promisify} from "node:util";
import {
    absoluteFsPath,
    relativeRealPathInside,
    resolveContainedFilePath,
    type AbsoluteFsPath,
} from "nbook/server/runtime/paths/file-path";

const execFileAsync = promisify(execFile);

/** llmlint_check 的审查受众白名单：只接受 check 已有的三个审查桶。 */
export const LLMLINT_CHECK_REVIEWS = ["agent", "human", "all"] as const;
export type LlmlintCheckReview = typeof LLMLINT_CHECK_REVIEWS[number];

/** 单次 llmlint check 的超时与 stdout 上限；超限即失败，不做截断后解析。 */
const LLMLINT_CHECK_TIMEOUT_MS = 60_000;
const LLMLINT_CHECK_MAX_BUFFER_BYTES = 16 * 1024 * 1024;

/** 只接受正文与纯文本目标；二进制或其他扩展名一律拒绝。 */
const TARGET_EXTENSION_PATTERN = /\.(md|markdown|txt)$/iu;

/** llmlint_check 入参。 */
export type LlmlintCheckInput = Readonly<{
    /** 目标文件；相对于 Current Project Workspace，必须落在该根内。 */
    targetPath: string;
    /** 审查受众；缺省 agent（与 llmlint check 的默认一致）。 */
    review?: LlmlintCheckReview;
}>;

/** 一条规则命中的结构化投影（只保留质疑需要的字段）。 */
export type LlmlintCheckIssue = Readonly<{
    ruleId: string;
    line: number;
    column: number;
    match: string;
    context: Readonly<{before: string; current: string; after: string}>;
}>;

/** issues 实际引用到的规则元数据；未引用到的 266 条规则不进结果。 */
export type LlmlintCheckRuleMeta = Readonly<{
    ruleId: string;
    title?: string;
    level?: string;
    note?: string;
}>;

/** llmlint_check 的结构化结果。 */
export type LlmlintCheckResult = Readonly<{
    targetPath: string;
    review: LlmlintCheckReview;
    summary: Readonly<{total: number; high: number; medium: number; low: number; visibleChars?: number}>;
    issues: readonly LlmlintCheckIssue[];
    rulesMeta: readonly LlmlintCheckRuleMeta[];
}>;

/**
 * 定位 llmlint CLI 入口。
 *
 * 只走两条已登记的资产路径，不做通用模块解析：① 仓库检出里与主应用平级的
 * packages/llmlint/skill（与 llmlint 技能投影同锚点）；② 程序资产里的 llmlint
 * 技能投影。生产运行态只有后者，因此两条都要在。
 */
export function resolveLlmlintBinPath(applicationRoot = process.env.NEURO_BOOK_APPLICATION_ROOT ?? process.cwd()): AbsoluteFsPath {
    const repositoryRoot = process.env.NEURO_BOOK_REPOSITORY_ROOT?.trim();
    const candidates = [
        process.env.NEURO_BOOK_LLMLINT_BIN?.trim(),
        repositoryRoot ? path.resolve(repositoryRoot, "packages", "llmlint", "skill", "bin", "llmlint.ts") : undefined,
        path.resolve(applicationRoot, "..", "llmlint", "skill", "bin", "llmlint.ts"),
        path.resolve(applicationRoot, "assets", "workspace", ".nbook", "agent", "skills", "llmlint", "bin", "llmlint.ts"),
    ].filter((candidate): candidate is string => Boolean(candidate));
    for (const candidate of candidates) {
        if (existsSync(candidate)) {
            return absoluteFsPath(candidate);
        }
    }
    throw new Error(`找不到 llmlint 命令入口（已尝试 ${candidates.join("、")}）。llmlint 技能包未安装或资产未就绪。`);
}

/** 解析 Bun 可执行文件：运行在 Bun 下时直接用自身，否则回落到 PATH 上的 bun。 */
export function resolveBunExecutable(): string {
    return /^bun(\.exe)?$/iu.test(path.basename(process.execPath)) ? process.execPath : "bun";
}

/**
 * 把入参路径解析到 workspace 根内。
 *
 * 两层检查：lexical containment 拦 \`..\` 与绝对越界，realpath containment 拦
 * symlink/junction 逃逸。两者都过才允许交给 llmlint。
 */
export async function resolveLlmlintTargetPath(root: AbsoluteFsPath, inputPath: string): Promise<AbsoluteFsPath> {
    const normalized = inputPath.trim().replaceAll("\\", "/");
    if (!normalized) {
        throw new Error("llmlint_check 缺少目标文件：请给出本章正文在项目内的路径。");
    }
    const resolved = resolveContainedFilePath(root, normalized);
    const relativePath = await relativeRealPathInside(root, resolved);
    if (relativePath === null || relativePath === ".") {
        throw new Error(`llmlint_check 拒绝项目外的目标：${inputPath}。只能检查当前作品目录内的文件。`);
    }
    if (!TARGET_EXTENSION_PATTERN.test(relativePath)) {
        throw new Error(`llmlint_check 只接受 .md / .markdown / .txt 目标：${inputPath}。`);
    }
    return resolved;
}

/** 归一化 review 入参；未登记的值一律拒绝，不做前缀匹配或大小写放宽。 */
export function normalizeLlmlintReview(review: unknown): LlmlintCheckReview {
    if (review === undefined || review === null || review === "") {
        return "agent";
    }
    if (typeof review === "string" && (LLMLINT_CHECK_REVIEWS as readonly string[]).includes(review)) {
        return review as LlmlintCheckReview;
    }
    throw new Error(`llmlint_check 不认识的审查受众：${String(review)}。只支持 ${LLMLINT_CHECK_REVIEWS.join(" / ")}。`);
}

/**
 * 跑一次 llmlint check 并返回结构化结果。
 *
 * 命令面固定为 \`--format json check <target> --review <bucket>\`：不暴露 detect、
 * fix、config 等其余子命令，也不接受调用方拼接参数。退出码 1 表示「有命中」，
 * stdout 仍是完整 JSON，因此按 stdout 内容判定而不是按退出码。
 */
export async function runLlmlintCheck(input: {
    root: AbsoluteFsPath;
    input: LlmlintCheckInput;
    binPath?: AbsoluteFsPath;
}): Promise<LlmlintCheckResult> {
    const targetPath = await resolveLlmlintTargetPath(input.root, input.input.targetPath);
    const review = normalizeLlmlintReview(input.input.review);
    const binPath = input.binPath ?? resolveLlmlintBinPath();
    const args = ["--format", "json", "check", targetPath, "--review", review];
    const stdout = await execLlmlint(binPath, args);
    const parsed = parseCheckJson(stdout, input.input.targetPath);
    const issues = parsed.issues.map((issue) => ({
        ruleId: issue.ruleId,
        line: issue.line,
        column: issue.column,
        match: issue.match,
        context: issue.context,
    }));
    return {
        targetPath: input.input.targetPath,
        review,
        summary: parsed.summary,
        issues,
        rulesMeta: projectRulesMeta(issues, parsed.rules),
    };
}

async function execLlmlint(binPath: AbsoluteFsPath, args: readonly string[]): Promise<string> {
    try {
        const result = await execFileAsync(resolveBunExecutable(), [binPath, ...args], {
            encoding: "utf8",
            maxBuffer: LLMLINT_CHECK_MAX_BUFFER_BYTES,
            timeout: LLMLINT_CHECK_TIMEOUT_MS,
            windowsHide: true,
        });
        return result.stdout;
    } catch (error) {
        const failed = error as {code?: number | null; stdout?: string; stderr?: string; killed?: boolean};
        // 退出码 1 = 有命中；stdout 仍是合法 JSON，不能当失败处理。
        if (typeof failed.stdout === "string" && failed.stdout.trim()) {
            return failed.stdout;
        }
        const detail = failed.stderr?.trim() || (error instanceof Error ? error.message : String(error));
        throw new Error(`llmlint 检查没能跑完：${detail}`);
    }
}

type RawCheckReport = Readonly<{
    summary: LlmlintCheckResult["summary"];
    issues: ReadonlyArray<LlmlintCheckIssue>;
    rules: Record<string, Readonly<{title?: string; level?: string; note?: string}>>;
}>;

/** 解析 CLI 的 JSON 报告；未知形状或坏 JSON 都当场失败，不猜。 */
function parseCheckJson(stdout: string, inputPath: string): {
    summary: LlmlintCheckResult["summary"];
    issues: LlmlintCheckIssue[];
    rules: RawCheckReport["rules"];
} {
    let parsed: unknown;
    try {
        parsed = JSON.parse(stdout) as unknown;
    } catch {
        throw new Error(`llmlint 没有返回可解析的 JSON 报告（目标 ${inputPath}）。`);
    }
    if (!parsed || typeof parsed !== "object" || (parsed as {kind?: unknown}).kind !== "check") {
        throw new Error(`llmlint 返回的报告不是 check 结果（目标 ${inputPath}）。`);
    }
    const report = parsed as RawCheckReport;
    return {
        summary: report.summary,
        issues: [...(report.issues ?? [])],
        rules: report.rules ?? {},
    };
}

/** 只保留 issues 真正引用到的规则元数据，避免把整个规则表塞进对话上下文。 */
function projectRulesMeta(
    issues: readonly LlmlintCheckIssue[],
    rules: RawCheckReport["rules"],
): LlmlintCheckRuleMeta[] {
    const referenced = [...new Set(issues.map((issue) => issue.ruleId))].sort((left, right) => left.localeCompare(right));
    return referenced.map((ruleId) => {
        const rule = rules[ruleId];
        return {
            ruleId,
            ...rule?.title ? {title: rule.title} : {},
            ...rule?.level ? {level: rule.level} : {},
            ...rule?.note ? {note: rule.note} : {},
        };
    });
}
