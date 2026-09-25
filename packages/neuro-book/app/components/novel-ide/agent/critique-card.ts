import {
    ChapterCritiqueInputSchema,
    CritiqueItemSchema,
    CritiqueOutcomeSchema,
    type ChapterCritiqueInput,
    type CritiqueCategory,
    type CritiqueDisposition,
    type CritiqueItem,
    type CritiqueOutcome,
    type CritiqueSeverity,
} from "nbook/shared/chapter-critique";
import {splitMarkdownFrontmatter} from "nbook/shared/editor-workbench";
import {parseToolArgsObject} from "nbook/app/components/novel-ide/agent/tool-args-stream";
import {
    collectWorkspaceNodes,
    resolveManuscriptChapterNode,
} from "nbook/app/components/novel-ide/knowledge/knowledge-view-state";
import type {WorkspaceFileNode} from "nbook/app/stores/novel-ide";
import {parseManuscriptChapterPath} from "nbook/app/utils/review-entry";

/**
 * 审稿质疑卡的纯逻辑层（M3-T-C1）。
 *
 * 视图组件只负责渲染与把点击转成这里的调用；质疑单解析、三轴计数、逐条处置
 * 状态机、原文定位与处置状态的本机存储全部在这里，便于 vitest 直测
 * （仓内 vitest 没有 plugin-vue，.vue 不能进测试）。
 *
 * 三条已定口径（改这里等于改契约，务必同步测试）：
 * - quote 是唯一锚点，行号不是：跳转一律拿当前章节正文现算 quote 所在行，
 *   item.evidence.line 只在 quote 找不到时当提示值兜底。编辑会让行号漂移，
 *   所以处置状态里不保存行号。
 * - 处置状态只落本机浏览器存储（不写项目文件、不随项目走）：同一条质疑
 *   （scope + 会话 + tool call + 下标）重开时保持原处置，读不出来一律当没处置过。
 * - 三轴计数只数 items 本身，和处置进度无关：卡头显示的是「这一章被挑了几处」。
 * - chapter 入参按「生产端实际会传什么」兼容：工具参数描述写的是「章节名或章节文件路径」，
 *   模型两种都传过，所以名字、目录名、manuscript 全路径三种形态都要认得出（见
 *   resolveCritiqueChapterNode）。消费端兼容生产端的全部合法形态，不反过来要求模型改写法。
 */

/** 存进本机存储的处置快照版本；结构变了就升版本，旧记录直接被丢弃。 */
export const CRITIQUE_OUTCOME_SCHEMA = 1 as const;

/** 处置快照的存储键前缀。 */
export const CRITIQUE_OUTCOME_STORAGE_PREFIX = "agent:critique-outcome";

/** 只读取写所需的最小存储接口；测试直接喂普通对象即可。 */
export type CritiqueStorage = Pick<Storage, "getItem" | "setItem" | "removeItem">;

/** 存进本机存储的处置快照。 */
export type StoredCritiqueOutcomes = {
    schema: typeof CRITIQUE_OUTCOME_SCHEMA;
    outcomes: CritiqueOutcome[];
};

/** 三轴计数。 */
export type CritiqueAxisCounts = {
    total: number;
    motivation: number;
    foreshadowing: number;
    "ai-flavor": number;
};

/** 处置进度。 */
export type CritiqueProgress = {
    total: number;
    resolved: number;
    pending: number;
    accepted: number;
    rejected: number;
    noted: number;
    /** 全部处置完（且确实有条目）时为 true。 */
    allResolved: boolean;
};

/** 卡片里的一条质疑：原始内容 + 下标 + 当前处置。 */
export type CritiqueItemView = {
    index: number;
    item: CritiqueItem;
    /** 未处置时为 null。 */
    disposition: CritiqueDisposition | null;
    note: string;
};

/** 卡片视图模型。 */
export type CritiqueCardView = {
    /** 章节名，只用于卡头展示：路径形态会被归一化成读得懂的短名（见 critiqueChapterLabel）。 */
    chapter: string;
    summary: string;
    axes: CritiqueAxisCounts;
    items: CritiqueItemView[];
    progress: CritiqueProgress;
};

/** 处置表：下标 → 处置结果。 */
export type CritiqueOutcomeMap = Readonly<Record<number, CritiqueOutcome>>;

/**
 * 卡头展示用的章节短名。
 *
 * chapter 允许三种形态，路径形态整条贴到卡头上又长又吵，所以：
 * 路径 → 章节目录名（manuscript/001-vol/001-departure/index.md → 001-departure）；
 * 其余（Plot 章节名、裸目录名）原样返回。
 */
export function critiqueChapterLabel(chapter: string | undefined | null): string {
    const value = typeof chapter === "string" ? chapter.trim() : "";
    if (!value) {
        return "";
    }
    const parsed = parseManuscriptChapterPath(value);
    if (parsed) {
        return parsed.chapter;
    }
    const segments = value.replace(/\\/g, "/").replace(/\/+$/, "").split("/").filter(Boolean);
    return segments.length > 1 ? (segments[segments.length - 1] ?? value) : value;
}

/**
 * 从 tool call 的参数文本解析质疑单。
 *
 * 完整 JSON 与流式半截 JSON 都吃（parseToolArgsObject 内部先 JSON.parse 再 partial-json），
 * 但只有通过契约校验的结果才算数：解析失败、字段缺失、条目为空一律返回 null，
 * 界面据此不渲染卡片，而不是渲染一张空壳。
 */
export function parseChapterCritiqueInput(rawArgsText?: string): ChapterCritiqueInput | null {
    const parsed = parseToolArgsObject<Record<string, unknown>>(rawArgsText);
    if (!parsed) {
        return null;
    }
    const result = ChapterCritiqueInputSchema.safeParse(parsed);
    return result.success ? result.data : null;
}

/** 三轴计数。 */
export function countCritiqueAxes(items: readonly CritiqueItem[]): CritiqueAxisCounts {
    const counts: CritiqueAxisCounts = {total: 0, motivation: 0, foreshadowing: 0, "ai-flavor": 0};
    for (const item of items ?? []) {
        if (!item) {
            continue;
        }
        counts.total += 1;
        counts[item.category] += 1;
    }
    return counts;
}

/** 三轴顺序固定为契约里的声明顺序，空轴也要占位，卡头才不会跳来跳去。 */
export const CRITIQUE_CATEGORY_ORDER: readonly CritiqueCategory[] = ["motivation", "foreshadowing", "ai-flavor"];

/** 严重度按从重到轻展示。 */
export const CRITIQUE_SEVERITY_ORDER: readonly CritiqueSeverity[] = ["high", "medium", "low"];

/** 三轴的中文口径（motivation=动机、foreshadowing=伏笔、ai-flavor=AI 味）。 */
export function critiqueCategoryLabelKey(category: CritiqueCategory): string {
    return `ide.critique.category.${category}`;
}

/** 严重度的 i18n key。 */
export function critiqueSeverityLabelKey(severity: CritiqueSeverity): string {
    return `ide.critique.severity.${severity}`;
}

/** 处置方式的 i18n key。 */
export function critiqueDispositionLabelKey(disposition: CritiqueDisposition): string {
    return `ide.critique.disposition.${disposition}`;
}

/** 严重度对应的状态色（只消费已登记的主题变量）。 */
export function critiqueSeverityClass(severity: CritiqueSeverity): string {
    switch (severity) {
        case "high":
            return "border-[var(--status-danger-border)] bg-[var(--status-danger-bg)] text-[var(--status-danger)]";
        case "medium":
            return "border-[var(--status-warning-border)] bg-[var(--status-warning-bg)] text-[var(--status-warning)]";
        case "low":
            return "border-[var(--border-color)] bg-[var(--bg-input)] text-[var(--text-muted)]";
    }
}

/** 处置后的条目配色。 */
export function critiqueDispositionClass(disposition: CritiqueDisposition | null): string {
    switch (disposition) {
        case "accepted":
            return "border-[var(--status-success-border)] bg-[var(--status-success-bg)]/20";
        case "rejected":
            return "border-[var(--border-color)] bg-[var(--bg-subtle)] opacity-70";
        case "noted":
            return "border-[var(--status-info-border)] bg-[var(--status-info-bg)]/20";
        default:
            return "border-[var(--border-color)] bg-[var(--bg-panel)]";
    }
}

/**
 * 在纯文本里定位 quote 所在的 1-based 行号。
 *
 * 取第一次出现的位置；找不到返回 null（调用方据此提示作者「这段话在正文里找不到了」，
 * 而不是跳到猜出来的行）。
 */
export function locateQuoteLine(text: string, quote: string): number | null {
    const body = typeof text === "string" ? text : "";
    const needle = typeof quote === "string" ? quote : "";
    if (!body || !needle) {
        return null;
    }
    const index = body.indexOf(needle);
    if (index < 0) {
        return null;
    }
    let line = 1;
    for (let cursor = 0; cursor < index; cursor += 1) {
        if (body.charCodeAt(cursor) === 10) {
            line += 1;
        }
    }
    return line;
}

/**
 * 取出章节文件正文。
 *
 * 编辑器只拿正文（frontmatter 走单独的面板），所以定位也必须以正文为基准，
 * 否则带 frontmatter 的章节会整体偏移。没有完整 frontmatter 时原样返回。
 */
export function critiqueChapterBody(rawMarkdown: string): string {
    return splitMarkdownFrontmatter(typeof rawMarkdown === "string" ? rawMarkdown : "").body;
}

/**
 * 归一化工作区路径，用于章节路径的等值匹配。
 *
 * 与工作区树里的路径写法对齐：统一斜杠、去掉 ./ 与 workspace/ 前缀、压掉重复斜杠。
 */
function normalizeCritiquePath(filePath: string): string {
    return String(filePath ?? "")
        .trim()
        .replace(/\\/g, "/")
        .replace(/^\.\//, "")
        .replace(/^workspace\//, "")
        .replace(/\/{2,}/g, "/")
        .replace(/^\/+/, "")
        .replace(/\/+$/, "");
}

/** 从任意写法里取出 manuscript/ 开头的相对路径；没有这一层就返回归一化后的原值。 */
function manuscriptRelativePath(filePath: string): string {
    const normalized = normalizeCritiquePath(filePath);
    const index = normalized.indexOf("manuscript/");
    return index === -1 ? normalized : normalized.slice(index);
}

/**
 * 按 chapter 入参找出对应的章节正文文件节点。
 *
 * 工具参数描述写的是「被审的章节名或章节文件路径」，模型两种都传过（真实验收就撞上
 * 传全路径导致反查落空）。消费端必须兼容生产端会传的全部合法形态：
 *
 * - 章节文件路径（manuscript/{卷}/{章}/index.md）：按归一化路径等值匹配工作区节点。
 *   指到具体文件就只认这个文件——对不上宁可返回 null，也不拿章名去猜同名的另一章。
 * - 纯章名（Plot 章节名或 manuscript 目录名）：走既有反查
 *   resolveManuscriptChapterNode（frontmatter.chapter 优先，目录名兜底）。
 * - 章节目录路径（没带 index.md）：取末段目录名再按纯章名反查一次。
 *
 * 都落空返回 null，调用方提示作者找不到，而不是跳到一个猜出来的文件。
 */
export function resolveCritiqueChapterNode(
    nodes: readonly WorkspaceFileNode[] | undefined | null,
    chapter: string | undefined | null,
): WorkspaceFileNode | null {
    const list = collectWorkspaceNodes(nodes ?? []);
    const raw = typeof chapter === "string" ? chapter : "";
    const stripped = normalizeCritiquePath(raw);
    if (!stripped) {
        return null;
    }

    // 形态一：章节文件路径。按归一化后的 manuscript 相对路径等值匹配，最精确，不受章名歧义影响。
    if (parseManuscriptChapterPath(stripped)) {
        const expected = manuscriptRelativePath(stripped);
        return list.find((item) => !item.isDirectory && manuscriptRelativePath(item.path) === expected) ?? null;
    }

    // 形态二：纯章名（Plot 章节名或 manuscript 目录名），走既有反查（frontmatter.chapter 优先）。
    const node = resolveManuscriptChapterNode(list, stripped);
    if (node) {
        return node;
    }

    // 形态三：章节目录路径（没带 index.md）。取末段目录名再反查一次。
    const segments = stripped.split("/").filter(Boolean);
    const directory = segments[segments.length - 1] ?? "";
    if (!directory || directory === stripped) {
        return null;
    }
    return resolveManuscriptChapterNode(list, directory);
}

/** 跳转目标：行号 + 这个行号是不是由 quote 现算出来的。 */
export type CritiqueJumpTarget = {
    line: number;
    fromQuote: boolean;
};

/**
 * 算出点 quote 该跳到哪一行。
 *
 * 优先级：正文里的 quote 实际位置 → 模型给的提示行号。两者都没有就返回 null，
 * 界面提示找不到原文，不发跳转事件。
 */
export function resolveCritiqueJumpTarget(chapterBody: string, evidence: {quote: string; line?: number}): CritiqueJumpTarget | null {
    const quoted = locateQuoteLine(chapterBody, evidence?.quote ?? "");
    if (quoted !== null) {
        return {line: quoted, fromQuote: true};
    }
    const hint = evidence?.line;
    if (typeof hint === "number" && Number.isFinite(hint) && hint >= 1) {
        return {line: Math.floor(hint), fromQuote: false};
    }
    return null;
}

/** 处置表 → 存盘数组（按下标升序，保证同一状态写出同一份快照）。 */
export function critiqueOutcomesFromMap(map: CritiqueOutcomeMap): CritiqueOutcome[] {
    return Object.keys(map ?? {})
        .map((key) => map[Number(key)])
        .filter((outcome): outcome is CritiqueOutcome => Boolean(outcome))
        .sort((left, right) => left.index - right.index);
}

/** 存盘数组 → 处置表；非法项直接丢弃。 */
export function critiqueOutcomeMapFromList(outcomes: readonly CritiqueOutcome[] | undefined): Record<number, CritiqueOutcome> {
    const map: Record<number, CritiqueOutcome> = {};
    for (const candidate of outcomes ?? []) {
        const parsed = CritiqueOutcomeSchema.safeParse(candidate);
        if (parsed.success) {
            map[parsed.data.index] = parsed.data;
        }
    }
    return map;
}

/**
 * 处置一条质疑（状态机：任何当前处置都能改判，附言只在给定时覆盖）。
 *
 * 返回新表，不改入参：调用方拿返回值继续渲染与写盘。
 */
export function applyCritiqueDisposition(
    map: CritiqueOutcomeMap,
    index: number,
    disposition: CritiqueDisposition,
    note?: string,
): Record<number, CritiqueOutcome> {
    const next: Record<number, CritiqueOutcome> = {...(map ?? {})};
    const trimmed = (note ?? "").trim();
    next[index] = trimmed ? {index, disposition, note: trimmed} : {index, disposition};
    return next;
}

/** 撤销某条的处置，让它回到未处置。 */
export function clearCritiqueDisposition(map: CritiqueOutcomeMap, index: number): Record<number, CritiqueOutcome> {
    const next: Record<number, CritiqueOutcome> = {...(map ?? {})};
    delete next[index];
    return next;
}

/** 处置进度；只统计确实存在的条目，越界的处置记录不算数。 */
export function critiqueProgress(
    items: readonly CritiqueItem[],
    map: CritiqueOutcomeMap,
): CritiqueProgress {
    const list = items ?? [];
    const progress: CritiqueProgress = {
        total: list.length,
        resolved: 0,
        pending: 0,
        accepted: 0,
        rejected: 0,
        noted: 0,
        allResolved: false,
    };
    list.forEach((item, index) => {
        if (!item) {
            return;
        }
        const outcome = map?.[index];
        if (!outcome) {
            progress.pending += 1;
            return;
        }
        progress.resolved += 1;
        progress[outcome.disposition] += 1;
    });
    progress.allResolved = progress.total > 0 && progress.pending === 0;
    return progress;
}

/** 组装卡片视图模型；质疑单非法时返回 null。 */
export function buildCritiqueCardView(
    input: ChapterCritiqueInput | null,
    map: CritiqueOutcomeMap,
): CritiqueCardView | null {
    if (!input) {
        return null;
    }
    const items: CritiqueItemView[] = input.items.map((item, index) => {
        const outcome = map?.[index];
        return {
            index,
            item,
            disposition: outcome?.disposition ?? null,
            note: outcome?.note ?? "",
        };
    });
    return {
        chapter: critiqueChapterLabel(input.chapter),
        summary: input.summary ?? "",
        axes: countCritiqueAxes(input.items),
        items,
        progress: critiqueProgress(input.items, map),
    };
}

/**
 * 构造处置快照的存储键。
 *
 * scope 只按 Workspace/Project 身份分区（与 session 记忆同一口径），会话与 tool call
 * 都进 key：换会话、重跑同一条质疑都不会串状态。sessionId 拿不到时退化为 "none"，
 * 这样 live 阶段（还没拿到 durable id）也能先记住，拿到 id 后再按新键继续。
 */
export function critiqueOutcomeStorageKey(scopeKey: string, sessionId: number | null, toolCallId: string): string {
    const scope = (scopeKey ?? "").trim() || "workspace-root";
    const session = typeof sessionId === "number" && Number.isFinite(sessionId) && sessionId > 0 ? String(sessionId) : "none";
    const toolCall = (toolCallId ?? "").trim() || "unknown";
    return `${CRITIQUE_OUTCOME_STORAGE_PREFIX}:${scope}:${session}:${toolCall}`;
}

/**
 * 读处置快照。
 *
 * 与 readRememberedSession 同一口径：没写过、结构不对、版本不符、读取抛错，
 * 一律返回空表，绝不把损坏的记录当成「作者处置过」。
 */
export function readCritiqueOutcomes(storage: CritiqueStorage, key: string): CritiqueOutcome[] {
    let raw: string | null;
    try {
        raw = storage.getItem(key);
    } catch {
        return [];
    }
    if (raw === null) {
        return [];
    }
    try {
        const parsed: unknown = JSON.parse(raw);
        if (!parsed || typeof parsed !== "object") {
            return [];
        }
        const value = parsed as Partial<StoredCritiqueOutcomes>;
        if (value.schema !== CRITIQUE_OUTCOME_SCHEMA || !Array.isArray(value.outcomes)) {
            return [];
        }
        return critiqueOutcomesFromMap(critiqueOutcomeMapFromList(value.outcomes as CritiqueOutcome[]));
    } catch {
        return [];
    }
}

/**
 * 写处置快照；失败（隐私模式、配额满）只影响下次回看的记忆，不打断当前处置。
 */
export function writeCritiqueOutcomes(storage: CritiqueStorage, key: string, map: CritiqueOutcomeMap): boolean {
    const outcomes = critiqueOutcomesFromMap(map);
    try {
        if (outcomes.length === 0) {
            storage.removeItem(key);
            return true;
        }
        const snapshot: StoredCritiqueOutcomes = {schema: CRITIQUE_OUTCOME_SCHEMA, outcomes};
        storage.setItem(key, JSON.stringify(snapshot));
        return true;
    } catch {
        return false;
    }
}

/** 单条质疑是否带脚注（AI 味轴的规则 id / 伏笔轴的书名）。 */
export function critiqueItemHasFootnote(item: CritiqueItem): boolean {
    return Boolean(item?.llmLintRuleId) || typeof item?.promiseId === "number";
}

/** 校验单条质疑；组件在流式阶段拿它判断这条是否已经成型。 */
export function isCompleteCritiqueItem(value: unknown): value is CritiqueItem {
    return CritiqueItemSchema.safeParse(value).success;
}
