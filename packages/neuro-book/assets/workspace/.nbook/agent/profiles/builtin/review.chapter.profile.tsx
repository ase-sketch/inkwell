/** @jsxImportSource nbook/profile-sdk */
/** @jsxRuntime automatic */
import {spawn} from "node:child_process";
import {existsSync, realpathSync} from "node:fs";
import {basename, dirname, isAbsolute, join, relative, resolve} from "node:path";
import {Type, type ProfileJsonValue, type ProfileToolResult, type Static} from "nbook/profile-sdk";
// 质疑工具名走 SDK 统一注册名（唯一事实源是 shared/chapter-critique.ts）。
import {SUBMIT_CRITIQUES_TOOL} from "nbook/profile-sdk";
import {defineAgentProfile, defineProfileTool} from "nbook/profile-sdk";
import {builtin, plotReadBindings, toolset} from "nbook/profile-sdk";
import {
    AgentCatalog,
    AppendingSet,
    HistorySet,
    Import,
    LinkedAgentsReminder,
    MentionedEntities,
    Message,
    ProfilePrompt,
    PromiseLedger,
    SkillActivation,
    System,
    WorkspaceFocusReminder,
} from "nbook/profile-sdk";
import {profileText} from "nbook/profile-sdk";

export const profileManifest = {
    key: "review.chapter",
    name: "审这一章",
    description: "审稿 agent：对写完的一章做动机、伏笔、AI 味三轴质疑，每条质疑都带正文原文引用，经 submit_critiques 登记后逐条交给作者处置，绝不代改正文。",
} as const;

export const InitialSchema = Type.Object({});
export const OutputSchema = Type.Object({
    result: Type.Optional(Type.String({description: "本章审稿的结论摘要：三轴各抓到什么、哪些交给作者处置了。"})),
});

export type Initial = Static<typeof InitialSchema>;
export type Output = Static<typeof OutputSchema>;

/** llmlint 窄工具名（AI 味轴唯一证据入口）。 */
const LLMLINT_CHECK_TOOL = "llmlint_check";
/** 单次规则检查的超时；超时即失败，不给半截结果。 */
const LLMLINT_CHECK_TIMEOUT_MS = 60_000;

interface LlmlintCheckInput {
    targetPath: string;
    review?: string;
}

interface LlmlintCheckSummary {
    total: number;
    high: number;
    medium: number;
    low: number;
    visibleChars?: number;
}

interface LlmlintCheckIssue {
    ruleId: string;
    line: number;
    column: number;
    match: string;
    context: {before: string; current: string; after: string};
}

interface LlmlintRuleMeta {
    ruleId: string;
    title?: string;
    level?: string;
    note?: string;
}

interface LlmlintCheckOutcome {
    summary: LlmlintCheckSummary;
    issues: LlmlintCheckIssue[];
    rulesMeta: LlmlintRuleMeta[];
    note: string | null;
}

/**
 * 定位 llmlint 命令入口。
 *
 * 只走两条已登记的资产路径，不做通用模块解析：① 仓库检出里与主应用平级的
 * packages/llmlint/skill（与 llmlint 技能投影同锚点）；② 程序资产里的 llmlint 技能投影。
 * 源码检出只有前者，独立程序只有后者，所以两条都要在。
 */
function resolveLlmlintBinPath(): string | null {
    const applicationRoot = process.env.NEURO_BOOK_APPLICATION_ROOT?.trim() || process.cwd();
    const repositoryRoot = process.env.NEURO_BOOK_REPOSITORY_ROOT?.trim();
    const candidates = [
        process.env.NEURO_BOOK_LLMLINT_BIN?.trim(),
        repositoryRoot ? join(repositoryRoot, "packages", "llmlint", "skill", "bin", "llmlint.ts") : null,
        join(applicationRoot, "..", "llmlint", "skill", "bin", "llmlint.ts"),
        join(applicationRoot, "assets", "workspace", ".nbook", "agent", "skills", "llmlint", "bin", "llmlint.ts"),
    ];
    for (const candidate of candidates) {
        if (candidate && existsSync(candidate)) {
            return candidate;
        }
    }
    return null;
}

/** 只接受正文与纯文本目标；其余扩展名一律拒绝。 */
function isReviewableTarget(relativePath: string): boolean {
    const lower = relativePath.toLowerCase();
    return lower.endsWith(".md") || lower.endsWith(".markdown") || lower.endsWith(".txt");
}

/**
 * 把目标路径解析到当前作品目录内。
 *
 * 两层检查：先做词法归一的包含判定拦住 `..` 与目录外绝对路径，再用真实路径判定
 * 拦住软链/联接点逃逸。两层都过才允许交给 llmlint。
 */
function resolveTargetPath(root: string, inputPath: string): string {
    const normalized = inputPath.trim().replaceAll("\\", "/");
    if (!normalized) {
        throw new Error("缺少要检查的章节文件：请给出本章正文在作品目录内的路径。");
    }
    const resolvedRoot = resolve(root);
    const resolved = isAbsolute(normalized) ? resolve(normalized) : resolve(resolvedRoot, normalized);
    const lexicalRelative = relative(resolvedRoot, resolved).replaceAll("\\", "/");
    if (!lexicalRelative || lexicalRelative.startsWith("../") || lexicalRelative === "..") {
        throw new Error("拒绝检查作品目录以外的文件：" + inputPath + "。只能检查当前作品目录内的正文。");
    }
    if (!isReviewableTarget(lexicalRelative)) {
        throw new Error("只接受 .md / .markdown / .txt 目标：" + inputPath + "。");
    }
    const realRoot = tryRealPath(resolvedRoot);
    const realTarget = tryRealPath(resolved) ?? tryRealPath(dirname(resolved));
    if (realRoot && realTarget) {
        const realRelative = relative(realRoot, realTarget).replaceAll("\\", "/");
        if (realRelative === ".." || realRelative.startsWith("../")) {
            throw new Error("拒绝检查作品目录以外的文件（真实路径越界）：" + inputPath + "。");
        }
    }
    return resolved;
}

function tryRealPath(target: string): string | null {
    try {
        return realpathSync(target);
    } catch {
        return null;
    }
}

/** 归一化审查受众；未登记的值一律拒绝，不做前缀匹配或大小写放宽。 */
function normalizeReview(review: unknown): string {
    if (review === undefined || review === null || review === "") {
        return "agent";
    }
    if (review === "agent" || review === "human" || review === "all") {
        return review;
    }
    throw new Error("不认识的审查受众：" + String(review) + "。只支持 agent / human / all。");
}

/**
 * 执行 bun <入口> <固定参数>。
 *
 * 命令面固定为 `check <目标> --format json --review <受众>`：不经过 shell，参数由本函数
 * 拼装，调用方无法追加子命令；detect / fix / config 一律不可达。退出码非零时 stdout
 * 仍是完整 JSON（有命中即退出码 1），因此按 stdout 内容判定。
 */
async function runLlmlintCheck(root: string, input: LlmlintCheckInput): Promise<LlmlintCheckOutcome> {
    const targetPath = resolveTargetPath(root, input.targetPath);
    const review = normalizeReview(input.review);
    const binPath = resolveLlmlintBinPath();
    if (!binPath) {
        throw new Error("找不到规则检查命令入口：llmlint 技能包未就绪。请靠读全文判断 AI 味线索，并如实告诉作者这一步没跑成。");
    }
    const executable = /^bun(\.exe)?$/iu.test(basename(process.execPath)) ? process.execPath : "bun";
    const outcome = await execProcess(executable, [binPath, "--format", "json", "check", targetPath, "--review", review]);
    if (!outcome.stdout.trim()) {
        throw new Error("规则检查没有输出结果：" + (outcome.stderr.trim() || "未提供原因") + "。");
    }
    let parsed: unknown;
    try {
        parsed = JSON.parse(outcome.stdout) as unknown;
    } catch {
        throw new Error("规则检查返回的内容不是可解析的结果（目标 " + input.targetPath + "）。");
    }
    if (!parsed || typeof parsed !== "object" || (parsed as {kind?: unknown}).kind !== "check") {
        throw new Error("规则检查返回的内容不是检查结果（目标 " + input.targetPath + "）。");
    }
    const report = parsed as {
        summary?: LlmlintCheckSummary;
        issues?: LlmlintCheckIssue[];
        rules?: Record<string, {title?: string; level?: string; note?: string}>;
    };
    const issues = (report.issues ?? []).map((issue) => ({
        ruleId: String(issue.ruleId),
        line: Number(issue.line),
        column: Number(issue.column),
        match: String(issue.match ?? ""),
        context: {
            before: String(issue.context?.before ?? ""),
            current: String(issue.context?.current ?? ""),
            after: String(issue.context?.after ?? ""),
        },
    }));
    const rules = report.rules ?? {};
    // 只回传真正命中到的规则元数据；整张规则表有几百条，不进对话上下文。
    const rulesMeta: LlmlintRuleMeta[] = [...new Set(issues.map((issue) => issue.ruleId))]
        .sort((left, right) => left.localeCompare(right))
        .map((ruleId) => {
            const rule = rules[ruleId];
            return {
                ruleId,
                ...rule?.title ? {title: rule.title} : {},
                ...rule?.level ? {level: rule.level} : {},
                ...rule?.note ? {note: rule.note} : {},
            };
        });
    return {
        summary: report.summary ?? {total: issues.length, high: 0, medium: 0, low: 0},
        issues,
        rulesMeta,
        note: "llmlint 以退出码 " + String(outcome.exitCode ?? "未知") + " 结束（有命中即非零，属正常）。",
    };
}

function execProcess(executable: string, args: string[]): Promise<{stdout: string; stderr: string; exitCode: number | null}> {
    return new Promise((resolvePromise, rejectPromise) => {
        const child = spawn(executable, args, {windowsHide: true});
        let stdout = "";
        let stderr = "";
        let settled = false;
        const timer = setTimeout(() => {
            if (!settled) {
                settled = true;
                child.kill();
                rejectPromise(new Error("规则检查超时（60 秒）。请缩小检查范围后重试。"));
            }
        }, LLMLINT_CHECK_TIMEOUT_MS);
        child.stdout.setEncoding("utf8");
        child.stderr.setEncoding("utf8");
        child.stdout.on("data", (chunk: string) => { stdout += chunk; });
        child.stderr.on("data", (chunk: string) => { stderr += chunk; });
        child.on("error", (error: Error) => {
            if (!settled) {
                settled = true;
                clearTimeout(timer);
                rejectPromise(new Error("规则检查没能启动：" + error.message));
            }
        });
        child.on("close", (code: number | null) => {
            if (!settled) {
                settled = true;
                clearTimeout(timer);
                resolvePromise({stdout, stderr, exitCode: code});
            }
        });
    });
}

const NL = String.fromCharCode(10);

/** 把检查结果渲染成模型可读的短报告。 */
function renderLlmlintResult(input: LlmlintCheckInput, result: LlmlintCheckOutcome): string {
    const lines = [
        "LLMLINT_CHECK_RESULT",
        "",
        "目标文件：" + input.targetPath + "（受众：" + normalizeReview(input.review) + "）",
        "命中总数：" + String(result.summary.total) + "（高 " + String(result.summary.high) + " / 中 " + String(result.summary.medium) + " / 低 " + String(result.summary.low) + "）",
        result.note,
    ];
    if (result.issues.length === 0) {
        lines.push("", "这次没有静态规则命中。AI 味轴接着靠你自己读全文判断语义问题。");
        return lines.join(NL);
    }
    lines.push("", "逐条命中：");
    for (const issue of result.issues) {
        const meta = result.rulesMeta.find((item) => item.ruleId === issue.ruleId);
        const label = meta?.title ? "（" + meta.title + (meta.level ? "，" + meta.level : "") + "）" : "";
        lines.push("- [" + issue.ruleId + "] 第 " + String(issue.line) + " 行第 " + String(issue.column) + " 列，命中「" + issue.match + "」" + label);
        lines.push("  上下文：…" + issue.context.before + "【" + issue.context.current + "】" + issue.context.after + "…");
        if (meta?.note) {
            lines.push("  规则说明：" + meta.note);
        }
    }
    lines.push("", "提醒：命中只是线索。确认它确实是没有功能的模板负担，才提成质疑；它承担剧情、人物、声音的话就别提。");
    return lines.join(NL);
}

/** llmlint_check 窄工具：只跑规则检查，不开放 detect / fix / config。 */
export const llmlintCheckTool = defineProfileTool<typeof LLMLINT_CHECK_TOOL>({
    key: LLMLINT_CHECK_TOOL,
    name: LLMLINT_CHECK_TOOL,
    label: "检查这一章的 AI 味线索",
    description: "对本章正文跑一次规则检查，拿到具体命中的规则名、原文命中的那几个字、所在行与规则说明。这是 AI 味轴唯一的证据来源；命中是证据不是判决，要不要提成质疑由你判断。只检查当前作品目录内的 .md / .markdown / .txt 文件。",
    parameters: Type.Object({
        targetPath: Type.String({
            description: "要检查的章节文件路径，相对当前作品目录，例如 manuscript/chapter-01.md。",
        }),
        review: Type.Optional(Type.String({
            description: "审查受众：agent（默认，需要结合上下文判断的条目）、human（偏作者风格偏好的条目）、all（两边都要）。",
        })),
    }, {additionalProperties: false}),
    async executeWithContext(context, _toolCallId, params: unknown): Promise<ProfileToolResult> {
        const input = params as LlmlintCheckInput;
        const root = context?.currentProject?.workspace?.root ?? context?.workspaceRoot ?? process.cwd();
        const result = await runLlmlintCheck(root, input);
        const details = JSON.parse(JSON.stringify({
            ...result,
            targetPath: input.targetPath,
            review: normalizeReview(input.review),
        })) as ProfileJsonValue;
        return {
            content: [{type: "text", text: renderLlmlintResult(input, result)}],
            details,
        };
    },
});

/**
 * submit_critiques 入参。
 *
 * 形状与长度上限照抄 shared/chapter-critique.ts（M3 契约的唯一事实源）。profile 编译
 * 只放行 nbook/profile-sdk 与 node builtin，不能 import zod，所以这里按同一份契约手写校验；
 * 改契约时两边必须一起改。
 */
interface CritiqueEvidence {
    quote: string;
    line?: number;
}

interface CritiqueItem {
    category: string;
    question: string;
    evidence: CritiqueEvidence;
    severity: string;
    llmLintRuleId?: string;
    promiseId?: number;
}

interface CritiqueInput {
    chapter: string;
    summary?: string;
    items: CritiqueItem[];
}

/** 抄自 shared/chapter-critique.ts 的长度上限。 */
const MAX_CRITIQUE_CHAPTER_LENGTH = 200;
const MAX_CRITIQUE_QUESTION_LENGTH = 2000;
const MAX_CRITIQUE_QUOTE_LENGTH = 2000;
const MAX_CRITIQUE_SUMMARY_LENGTH = 2000;
const MAX_CRITIQUE_RULE_ID_LENGTH = 200;
/** 单份质疑单的条目上限：与契约同口径，超出会让公开投影截断整份清单。 */
const MAX_CRITIQUE_ITEMS = 20;

const CRITIQUE_CATEGORY_LABELS: Record<string, string> = {
    "motivation": "动机",
    "foreshadowing": "伏笔",
    "ai-flavor": "AI 味",
};

const CRITIQUE_SEVERITY_LABELS: Record<string, string> = {
    "low": "轻",
    "medium": "中",
    "high": "重",
};

/**
 * 校验一份质疑清单。
 *
 * 这里只校验与登记：不写任何文件、不改正文。校验失败当场抛错，讲清哪一条哪个字段
 * 不对，让模型修正后重提。
 */
function isPlainObject(value: unknown): value is Record<string, unknown> {
    return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** 字符串字段：非空字符串，且不超过契约给的长度上限。 */
function requireText(value: unknown, at: string, what: string, maxLength: number): string {
    if (typeof value !== "string" || !value.trim()) {
        throw new Error(at + "缺少" + what + "。");
    }
    if (value.trim().length > maxLength) {
        throw new Error(at + "的" + what + "太长（上限 " + String(maxLength) + " 字），请精简后重提。");
    }
    return value.trim();
}

function validateCritique(raw: unknown): CritiqueInput {
    if (!isPlainObject(raw)) {
        throw new Error("质疑清单没有被提交：入参不是对象。");
    }
    const chapter = requireText(raw.chapter, "质疑清单", "章节名", MAX_CRITIQUE_CHAPTER_LENGTH);
    if (raw["summary"] !== undefined) {
        requireText(raw["summary"], "质疑清单", "整体印象", MAX_CRITIQUE_SUMMARY_LENGTH);
    }
    if (!Array.isArray(raw.items) || raw.items.length === 0) {
        throw new Error("质疑清单里一条都没有。三轴都没抓到问题的话，直接告诉作者这章没抓到，不要提交空清单。");
    }
    if (raw.items.length > MAX_CRITIQUE_ITEMS) {
        throw new Error("质疑清单有 " + String(raw.items.length) + " 条，超过单次上限 " + String(MAX_CRITIQUE_ITEMS) + " 条。请按轴分批提交，先把最站不住的这一批交给作者。");
    }
    const items = raw.items.map((rawItem, index) => {
        const at = "第 " + String(index + 1) + " 条质疑";
        if (!isPlainObject(rawItem)) {
            throw new Error(at + "不是对象。");
        }
        const category = requireText(rawItem.category, at, "分类", 32);
        if (!(category in CRITIQUE_CATEGORY_LABELS)) {
            throw new Error(at + "的分类不对：" + category + "。只能是 motivation（动机）/ foreshadowing（伏笔）/ ai-flavor（AI 味）。");
        }
        const question = requireText(rawItem.question, at, "质疑内容", MAX_CRITIQUE_QUESTION_LENGTH);
        if (!isPlainObject(rawItem.evidence)) {
            throw new Error(at + "缺少原文引用：quote 必须照抄正文里真实存在的那一段。");
        }
        const quote = requireText(rawItem.evidence.quote, at, "原文引用", MAX_CRITIQUE_QUOTE_LENGTH);
        let line: number | undefined;
        if (rawItem.evidence.line !== undefined) {
            line = rawItem.evidence.line as number;
            if (!Number.isInteger(line) || line < 1) {
                throw new Error(at + "的行号不合法：line 要么不写，要么是正整数。");
            }
        }
        const severity = requireText(rawItem.severity, at, "分量", 16);
        if (!(severity in CRITIQUE_SEVERITY_LABELS)) {
            throw new Error(at + "的分量不对：" + severity + "。只能是 low / medium / high。");
        }
        let llmLintRuleId: string | undefined;
        if (rawItem.llmLintRuleId !== undefined) {
            llmLintRuleId = requireText(rawItem.llmLintRuleId, at, "规则名", MAX_CRITIQUE_RULE_ID_LENGTH);
        }
        let promiseId: number | undefined;
        if (rawItem.promiseId !== undefined) {
            promiseId = rawItem.promiseId as number;
            if (!Number.isInteger(promiseId)) {
                throw new Error(at + "的伏笔编号不合法：promiseId 必须是整数。");
            }
        }
        return {
            category,
            question,
            evidence: {...line !== undefined ? {line} : {}, quote},
            severity,
            ...llmLintRuleId !== undefined ? {llmLintRuleId} : {},
            ...promiseId !== undefined ? {promiseId} : {},
        };
    });
    return {
        chapter,
        ...raw["summary"] !== undefined ? {summary: (raw["summary"] as string).trim()} : {},
        items,
    };
}

/** submit_critiques 工具：校验并登记质疑清单，绝不写盘。 */
export const submitCritiquesTool = defineProfileTool<typeof SUBMIT_CRITIQUES_TOOL>({
    key: SUBMIT_CRITIQUES_TOOL,
    name: SUBMIT_CRITIQUES_TOOL,
    label: "提交审稿质疑清单",
    description: "把本章的质疑清单交给作者处置。每条质疑必须写清分类（动机 / 伏笔 / AI 味）、问句形式的质疑、正文原文引用与分量。本工具不写任何文件，只登记质疑；提交后作者会在卡片上逐条认可、驳回或记下。",
    parameters: Type.Object({
        chapter: Type.String({description: "被审的章节名或章节文件路径。"}),
        summary: Type.Optional(Type.String({description: "一句话说明本轮审下来整体印象（面向作者可读）。"})),
        items: Type.Array(
            Type.Object({
                category: Type.String({description: "分类：motivation（动机）/ foreshadowing（伏笔）/ ai-flavor（AI 味）。"}),
                question: Type.String({description: "问句形式的质疑，指向具体的一句话或一个动作。"}),
                evidence: Type.Object({
                    quote: Type.String({description: "照抄正文里真实存在的原文片段，不得转述或拼贴。"}),
                    line: Type.Optional(Type.Number({description: "该片段所在行号，仅作跳转加速，可省略。"})),
                }, {additionalProperties: false}),
                severity: Type.String({description: "分量：low / medium / high。"}),
                llmLintRuleId: Type.Optional(Type.String({description: "AI 味轴专用：规则检查报出来的规则名。"})),
                promiseId: Type.Optional(Type.Number({description: "伏笔轴专用：伏笔账本里的编号。"})),
            }, {additionalProperties: false}),
            {description: "质疑条目列表，逐条交给作者处置。"},
        ),
    }, {additionalProperties: false}),
    async executeWithContext(_context, _toolCallId, params: unknown): Promise<ProfileToolResult> {
        const input = validateCritique(params);
        const lines = [
            "CRITIQUES_PENDING_AUTHOR_REVIEW",
            "",
            "已登记 " + String(input.items.length) + " 条质疑（等待作者逐条处置，未写任何文件）：",
            "- 章节：" + input.chapter,
            ...input.summary ? ["- 整体印象：" + input.summary] : [],
            "",
            ...input.items.flatMap((item, index) => [
                "### 质疑 " + String(index + 1) + "（" + (CRITIQUE_CATEGORY_LABELS[item.category] ?? item.category) + "，分量 " + item.severity + "）",
                item.question,
                "- 原文引用：",
                "```",
                item.evidence.quote,
                "```",
                ...item.evidence.line !== undefined ? ["- 行号：" + String(item.evidence.line)] : [],
                ...item.llmLintRuleId ? ["- 规则：" + item.llmLintRuleId] : [],
                ...item.promiseId !== undefined ? ["- 伏笔编号：" + String(item.promiseId)] : [],
                "",
            ]),
            "接下来请用 request_user_input 逐条请作者处置（认可 / 驳回 / 记下），一次一条，不要一次抛完，也不要替作者决定。",
        ];
        const details = JSON.parse(JSON.stringify({
            marker: "CRITIQUES_PENDING_AUTHOR_REVIEW",
            chapter: input.chapter,
            ...input.summary ? {summary: input.summary} : {},
            items: input.items,
        })) as ProfileJsonValue;
        return {
            content: [{type: "text", text: lines.join(NL)}],
            details,
        };
    },
});

export default defineAgentProfile({
    manifest: profileManifest,
    initialSchema: InitialSchema,
    outputSchema: OutputSchema,
    tools: toolset(
        // 只读正文：审稿不改稿。本 profile 不持有任何写文件工具，也没有 bash。
        builtin.file.read,
        llmlintCheckTool,
        submitCritiquesTool,
        builtin.control.requestUserInput,
        builtin.agent.getSession,
        builtin.agent.getProfile,
        // Plot 只读 bundle：伏笔轴读账本与剧情结构，不写 Plot。
        ...plotReadBindings,
    ),
    context(_ctx) {
        return (
            <ProfilePrompt>
                <System>{REVIEW_CHAPTER_SYSTEM_PROMPT}</System>
                <HistorySet>
                    <Message><AgentCatalog /></Message>
                    <Message><Import path="AGENTS.md" /></Message>
                    <Message><Import path="reference/agent/profile-routing.md" /></Message>
                </HistorySet>
                <AppendingSet>
                    <WorkspaceFocusReminder />
                    <LinkedAgentsReminder />
                    <PromiseLedger />
                    <MentionedEntities />
                    <SkillActivation />
                </AppendingSet>
            </ProfilePrompt>
        );
    },
});

const REVIEW_CHAPTER_SYSTEM_PROMPT = profileText`
    你现在在 Inkwell 中作为审稿 Agent (review.chapter) 工作。
    你的职责是：作者写完一章，你在稿子对面坐下来，把站不住的地方一条条指出来，然后等他回应。

    # 红线（最高优先级，先于以下全部内容）

    - skill（技能包）仅作分析参照，一律不输出正文：skill 里的写法、范例、模板都只能用来指导提问、分析和结构整理，不得作为正文内容直接产出或粘贴。
    - 你没有正文目录的写入权限：manuscript/ 对你永久只读。你也没有任何写文件的工具，也没有 bash——你能做的只有读正文、跑一次规则检查、把质疑交给作者。
    - 审稿的产出是质疑清单，不是修改稿：绝不代改正文，绝不写「建议改成……」，正文的每个字都归作者。
    - 面向作者说话与写进文件严格区分：对作者说话一律使用创作人话，禁止在对话回复中出现字段名或英文技术词——分类说成「动机 / 伏笔 / AI 味」，分量说成「轻 / 中 / 重」，原文引用说成「原文」，设定集说成「设定卡」，编号这类字段名只在调用工具时出现，绝不出现在对作者说的话里。

    # 核心契约与原则

    1. **三轴审稿，每条质疑都要有原文**
       - 开审前先读全章正文，再读本轮注入的未决伏笔账本与提到的设定条目。作者只划了一段发过来时，焦点收到那一段，三轴照走。
       - 每条质疑都必须带**原文引用**——照抄正文里真实存在的那一句。指不出原句，是你没读细，不是稿子的问题。
       - 三轴不必凑数。某轴这一章确实没抓到问题，说一句「动机这轴这章没抓到问题」比硬挤一条强。

    2. **动机轴：这个人为什么这么做**
       - 挑出有分量的行动——做出选择、说出关键的话、放弃某样东西——逐个追问：他想要的是什么？这个想要的东西在前面正文或设定里出现过吗？他有没有更省事的选择，为什么没选？这一步的代价由谁承担，正文里写出来了吗？
       - 先找反证再开口：作者可能早在前几章埋过动机，只是这一章没提。问之前先确认它不是「你还没读到」。

    3. **伏笔轴：照账本逐条问埋 / 呼 / 收**
       - 数据源是本轮注入的未决伏笔账本。账本每条给的是名字、编号、重要度、摘要和兑现期限章，末尾还可能写着「还有 N 条未注入」——**没展开不等于不存在**，需要时请作者翻账本或点名要那一条。
       - 问**埋**：这一章新起了什么钩子？新钩子有没有对应的账本条目？没有条目，是作者还没记，还是它根本不打算兑现？
       - 问**呼**：这一章碰到的老伏笔，账本里是什么状态？已经隔了几章没动它了？
       - 问**收**：有兑现期限的，离那一章还有几章？这一章该不该往前递一格？
       - 口径：兑现期限和节奏提示都只是参考，不是硬约束——写晚了、写密了都可能是作者的选择。你要报告的是「已经很久没动了」「期限就在眼前而这一章没接上」这个事实，不判它违规。提伏笔质疑时带上那条伏笔的编号，作者才能对着账本看。

    4. **AI 味轴：先拿证据，再开口**
       - **必须先调用 llmlint_check 拿规则命中，再成质疑**：目标指向这一章的正文路径，受众建议用 all。这是本轴唯一的证据来源，不要凭感觉自己列一份「AI 味清单」。
       - 命中是证据，不是判决。每处命中先分流：**修**（确认是没有功能的模板负担）、**留**（它承担剧情、人物、声音，是你读漏了）、**问**（证据不够，交给作者）。只有「修」和「问」够格提成质疑，「留」的直接别提。
       - 提成质疑时必须引用规则名，并说清原文实际命中的那几个字；不要因为一句话好听就报它——金句、长句、抽象表达都可能是作者的声音。
       - 静态规则查不到语义问题，下面八条要靠你自己读全文判断：空泛总结段（hollow-summary-paragraph）、隐藏行动者（hidden-actor）、段尾机械升华（mechanical-elevation-ending）、过度解释（over-explaining-reader）、金句感（quotable-punchline）、语体错位（register-mismatch）、节奏单调（monotone-rhythm）、缺少具体信息（low-specificity）。

    5. **产出契约：质疑必须经 submit_critiques 提交**
       - 想清楚了就调用 submit_critiques，把每条质疑按结构化条目交上去：分类、问句形式的质疑、原文引用、分量；AI 味轴的带上规则名，伏笔轴的带上那条伏笔的编号。
       - 不要把质疑清单只在回复里用文字列一遍就完事——没有经工具提交的质疑，作者的卡片上不会出现。提交工具只登记质疑，不写任何文件。
       - 提交前逐条自检：这条引得出原文吗？它是问句吗？它说的是稿子而不是作者吗？

    6. **逐条回应闸门（强指令：提交后必须用 request_user_input 逐条引导处置）**
       - **这是本 profile 的执行铁律**：submit_critiques 提交之后，**每轮回复的末尾必须调用 request_user_input**，**一次一条**请作者处置，选项是「认可」「驳回」「记下」三个，允许作者附言。
       - **绝对禁止把全部质疑一口气抛出来就结束回合**，也不要仅在普通回复文本里留下问句。纯文本提问会导致非阻塞状态，破坏前端交互流程。
       - 作者选了就往下走：**不追问、不辩解、不代改正文**。作者回「驳回」就接受，不要辩论第二次；作者回「记下」就放下，下一轮别再提。
       - 全部处置完，用 report_result 简短收尾：三轴各抓到什么、哪些被驳回或记下。

    # 语气

    - 语气是问句：「这里要不要再想想」比「这里动机不足」有用得多。
    - 说清它是哪一轴的问题、为什么站不住，只谈稿子，不评价作者。
`;

