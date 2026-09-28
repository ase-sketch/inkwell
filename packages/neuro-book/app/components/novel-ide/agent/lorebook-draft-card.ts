import {
    LOREBOOK_DRAFT_CATEGORIES,
    LOREBOOK_DRAFT_CATEGORY_LABELS,
    LOREBOOK_DRAFT_SLUG_PATTERN,
    LorebookDraftInputSchema,
    lorebookDraftSlugFromTitle,
    type LorebookDraftCategory,
    type LorebookDraftInput,
} from "nbook/shared/lorebook-draft";
import {parseToolArgsObject} from "nbook/app/components/novel-ide/agent/tool-args-stream";

/**
 * 设定卡确认卡的纯逻辑层（M6-T-B）。
 *
 * 视图组件只负责渲染与把点击转成这里的调用；草稿解析、卡上字段、三态迁移、
 * 确认消息构造与本机状态存取全部收在这里，便于 vitest 直测
 * （仓内 vitest 没有 plugin-vue，.vue 不能进测试）。
 *
 * 四条已定口径（改这里等于改契约，务必同步测试）：
 * - 确认以卡上当前值为准：确认消息由卡上字段现算，不复读工具参数原文——
 *   作者在卡上改过的类目与文字必须原样落进消息。
 * - 卡片与确认链路本身绝不写文件：本模块唯一的输出是一条给会话里 AI 看的消息，
 *   落盘仍走 AI 的既有写工具（红线见 M6 决策笔记）。
 * - 取消零副作用：取消只把卡标成已取消并记住这个状态，不产生任何消息。
 * - 卡片状态只落本机浏览器存储（不写项目文件）：同一条草稿重开时保持原状态与
 *   作者改过的字段，读不出来一律当没动过。
 */

/** 存进本机存储的卡片状态版本；结构变了就升版本，旧记录直接被丢弃。 */
export const LOREBOOK_DRAFT_CARD_SCHEMA = 1 as const;

/** 卡片状态的存储键前缀。 */
export const LOREBOOK_DRAFT_CARD_STORAGE_PREFIX = "agent:lorebook-draft-card";

/** 只读取写所需的最小存储接口；测试直接喂普通对象即可。 */
export type LorebookCardStorage = Pick<Storage, "getItem" | "setItem" | "removeItem">;

/** 卡片三态：待确认 / 已确认 / 已取消。 */
export type LorebookCardStatus = "pending" | "confirmed" | "cancelled";

/** 三个合法状态，供读回时校验。 */
export const LOREBOOK_DRAFT_CARD_STATUSES: readonly LorebookCardStatus[] = ["pending", "confirmed", "cancelled"];

/**
 * 卡上字段（作者可改）。
 *
 * 这是确认消息的唯一来源：类目走下拉（九个登记值），文字字段是卡上输入框的当前值，
 * 别名在这里是数组（卡上以顿号/逗号分隔文本呈现）。
 */
export type LorebookDraftFields = {
    title: string;
    category: LorebookDraftCategory;
    aliases: string[];
    summary: string;
    body: string;
    sourceExcerpt: string;
    /** 模型建议的目录名（可选）；缺省或不合形态时按标题现算。 */
    suggestedSlug?: string;
};

/** 落进本机存储的卡片状态。 */
export type LorebookCardState = {
    schema: typeof LOREBOOK_DRAFT_CARD_SCHEMA;
    status: LorebookCardStatus;
    fields: LorebookDraftFields;
};

/** 确认前卡上还缺什么；null 表示齐了。 */
export type LorebookDraftIssue = "title" | "summary" | "body" | null;

/** 卡片动作的判定结果。 */
export type LorebookCardActionOutcome =
    | {kind: "ignored"}
    | {kind: "invalid"; issue: Exclude<LorebookDraftIssue, null>}
    | {kind: "cancelled"; status: "cancelled"; fields: LorebookDraftFields}
    | {kind: "confirm"; status: "confirmed"; fields: LorebookDraftFields; message: string};

/**
 * 从 tool call 的参数文本解析设定卡草稿。
 *
 * 完整 JSON 与流式半截 JSON 都吃（parseToolArgsObject 内部先 JSON.parse 再 partial-json），
 * 但只有通过契约校验的结果才算数：解析失败、字段缺失、类目不在九类里一律返回 null，
 * 界面据此不渲染卡片，而不是渲染一张空壳。
 */
export function parseLorebookDraftInput(rawArgsText?: string): LorebookDraftInput | null {
    const parsed = parseToolArgsObject<Record<string, unknown>>(rawArgsText);
    if (!parsed) {
        return null;
    }
    const result = LorebookDraftInputSchema.safeParse(parsed);
    return result.success ? result.data : null;
}

/** 草稿 → 卡上初始字段；别名拷成新数组，改了卡不会碰到原草稿对象。 */
export function lorebookDraftFields(input: LorebookDraftInput): LorebookDraftFields {
    return {
        title: input.title,
        category: input.category,
        aliases: [...input.aliases],
        summary: input.summary,
        body: input.body,
        sourceExcerpt: input.sourceExcerpt,
        ...input.suggestedSlug !== undefined ? {suggestedSlug: input.suggestedSlug} : {},
    };
}

/** 类目下拉的选项：顺序与契约里的九类一致，显示的是一眼能懂的中文标签。 */
export function lorebookDraftCategoryOptions(): ReadonlyArray<{value: LorebookDraftCategory; label: string}> {
    return LOREBOOK_DRAFT_CATEGORIES.map((category) => ({
        value: category,
        label: LOREBOOK_DRAFT_CATEGORY_LABELS[category],
    }));
}

/**
 * 卡上别名文本 → 别名列表。
 *
 * 作者习惯用顿号或逗号连着写，也会一行一个；三种分隔都认。空白项丢掉，
 * 重复项只留第一次出现的那个（同一张卡里重复没有意义）。
 */
export function parseLorebookDraftAliases(text: string | undefined | null): string[] {
    const raw = typeof text === "string" ? text : "";
    const seen = new Set<string>();
    const aliases: string[] = [];
    for (const piece of raw.split(/[、,，;；\n]+/u)) {
        const alias = piece.trim();
        if (!alias || seen.has(alias)) {
            continue;
        }
        seen.add(alias);
        aliases.push(alias);
    }
    return aliases;
}

/** 别名列表 → 卡上文本（用顿号连接，和作者写法一致）。 */
export function formatLorebookDraftAliases(aliases: readonly string[] | undefined): string {
    return (aliases ?? []).map((alias) => String(alias ?? "").trim()).filter(Boolean).join("、");
}

/**
 * 这张卡最终落到哪个条目目录。
 *
 * 建议目录名合法就直接用；否则按标题现算（ASCII 标题有效）；中文标题算不出目录名时
 * 返回空串，确认消息里会写明「按名称取一个小写英文目录名」交给会话里的 AI 定——
 * 机器音译中文不可靠，宁可显式留空也不猜。
 */
export function resolveLorebookDraftSlug(fields: Pick<LorebookDraftFields, "title" | "suggestedSlug">): string {
    const suggested = String(fields?.suggestedSlug ?? "").trim();
    if (suggested && LOREBOOK_DRAFT_SLUG_PATTERN.test(suggested)) {
        return suggested;
    }
    return lorebookDraftSlugFromTitle(String(fields?.title ?? ""));
}

/** 确认前卡上还缺什么：名称、一句话摘要、条目正文缺一不可（类目只能从九个登记值里选，不会缺）。 */
export function lorebookDraftIssue(fields: LorebookDraftFields | null | undefined): LorebookDraftIssue {
    if (!fields) {
        return "title";
    }
    if (!String(fields.title ?? "").trim()) {
        return "title";
    }
    if (!String(fields.summary ?? "").trim()) {
        return "summary";
    }
    if (!String(fields.body ?? "").trim()) {
        return "body";
    }
    return null;
}

/**
 * 作者确认后的结构化消息：把卡上最终字段交给会话里的 AI，由它按既有写工具落盘。
 *
 * 消息里必须同时给全两样东西，缺一样都会让落盘走形：
 * - 全部最终字段（名称、类别、别名、摘要、条目正文、原文摘录、条目目录名）；
 * - 落盘口径（写到哪、frontmatter 怎么填、来源怎么标）。
 * 字段不全时抛错（调用方先问 lorebookDraftIssue，正常流程到不了这里）。
 */
export function buildLorebookConfirmMessage(fields: LorebookDraftFields): string {
    const issue = lorebookDraftIssue(fields);
    if (issue) {
        throw new Error("这张设定卡还缺内容，补齐之后再确认");
    }
    const title = fields.title.trim();
    const summary = fields.summary.trim();
    const body = fields.body.trim();
    const excerpt = String(fields.sourceExcerpt ?? "").trim();
    const aliases = parseLorebookDraftAliases(formatLorebookDraftAliases(fields.aliases));
    const label = LOREBOOK_DRAFT_CATEGORY_LABELS[fields.category];
    const slug = resolveLorebookDraftSlug(fields);
    const directory = slug || "（留空，请按名称取一个小写英文目录名）";
    const target = slug
        ? `lorebook/${fields.category}/${slug}/index.md`
        : `lorebook/${fields.category}/<条目目录>/index.md（条目目录名由你按名称取一个小写英文目录名）`;
    const aliasLine = aliases.length > 0 ? aliases.join("、") : "（暂时没有别的叫法，留空列表）";
    const excerptBlock = excerpt ? ["原文摘录（照抄，不要改写）：", "```", excerpt, "```", ""] : [];

    return [
        "这张设定卡我已经确认过，请把它写进设定集。",
        "",
        `- 名称：${title}`,
        `- 类别：${label}`,
        `- 别名：${aliasLine}`,
        `- 一句话摘要：${summary}`,
        `- 条目目录名：${directory}`,
        "",
        "条目正文：",
        "```",
        body,
        "```",
        "",
        ...excerptBlock,
        "写法（按设定条目的既有口径）：",
        `1. 条目写在 ${target}。`,
        "2. frontmatter 按设定条目的既有模板补全：title 用上面的名称，type 用上面的类别，status: active，aliases 用上面列的别名，summary 用一句话摘要，governance.source: manual。",
        "3. 只写我确认过的内容，不要自行添加或改写。",
        "4. 写完之后用一句话告诉我这条设定写到了哪里。",
    ].join("\n");
}

/**
 * 卡片动作的状态迁移。
 *
 * - 已确认 / 已取消的卡不再受理任何动作（ignored），重开历史也不会被再点一次。
 * - 确认：先过卡面校验（缺名称/摘要/正文时 invalid，界面提示补哪个），
 *   再算出结构化确认消息；返回的 confirmed 状态由调用方在消息**确实发出去之后**才采用——
 *   发失败要留在待确认，让作者能重试。
 * - 取消：只给出 cancelled 状态，不产生消息（零副作用，见文件头口径），也不需要会话在线。
 */
export function applyLorebookCardAction(input: {
    action: "confirm" | "cancel";
    status: LorebookCardStatus;
    fields: LorebookDraftFields;
}): LorebookCardActionOutcome {
    if (input.status !== "pending") {
        return {kind: "ignored"};
    }
    if (input.action === "cancel") {
        return {kind: "cancelled", status: "cancelled", fields: input.fields};
    }
    const issue = lorebookDraftIssue(input.fields);
    if (issue) {
        return {kind: "invalid", issue};
    }
    return {
        kind: "confirm",
        status: "confirmed",
        fields: input.fields,
        message: buildLorebookConfirmMessage(input.fields),
    };
}

/**
 * 构造卡片状态的存储键。
 *
 * scope 只按 Workspace/Project 身份分区（与会话记忆同一口径），会话与 tool call
 * 都进 key：换会话、重开同一条草稿都不会串状态。sessionId 拿不到时退化为 "none"，
 * 这样 live 阶段（还没拿到 durable id）也能先记住，拿到 id 后再按新键继续。
 */
export function lorebookCardStorageKey(scopeKey: string, sessionId: number | null, toolCallId: string): string {
    const scope = (scopeKey ?? "").trim() || "workspace-root";
    const session = typeof sessionId === "number" && Number.isFinite(sessionId) && sessionId > 0 ? String(sessionId) : "none";
    const toolCall = (toolCallId ?? "").trim() || "unknown";
    return `${LOREBOOK_DRAFT_CARD_STORAGE_PREFIX}:${scope}:${session}:${toolCall}`;
}

/** 卡上字段的结构校验；任一字段不对就丢弃整条记录（宁可当没动过，不摆一张半截的卡）。 */
function readLorebookDraftFields(value: unknown): LorebookDraftFields | null {
    if (!value || typeof value !== "object" || Array.isArray(value)) {
        return null;
    }
    const record = value as Record<string, unknown>;
    const category = record.category;
    if (typeof category !== "string" || !(LOREBOOK_DRAFT_CATEGORIES as readonly string[]).includes(category)) {
        return null;
    }
    for (const key of ["title", "summary", "body", "sourceExcerpt"] as const) {
        if (typeof record[key] !== "string") {
            return null;
        }
    }
    if (!Array.isArray(record.aliases) || record.aliases.some((alias) => typeof alias !== "string")) {
        return null;
    }
    const suggestedSlug = record.suggestedSlug;
    return {
        title: record.title as string,
        category: category as LorebookDraftCategory,
        aliases: [...(record.aliases as string[])],
        summary: record.summary as string,
        body: record.body as string,
        sourceExcerpt: record.sourceExcerpt as string,
        ...typeof suggestedSlug === "string" && suggestedSlug ? {suggestedSlug} : {},
    };
}

/**
 * 读回卡片状态。
 *
 * 与会话记忆同一口径：没写过、结构不对、版本不符、读取抛错，一律返回 null，
 * 绝不把损坏的记录当成「作者确认过」。
 */
export function readLorebookCardState(storage: LorebookCardStorage, key: string): LorebookCardState | null {
    let raw: string | null;
    try {
        raw = storage.getItem(key);
    } catch {
        return null;
    }
    if (raw === null) {
        return null;
    }
    try {
        const parsed: unknown = JSON.parse(raw);
        if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
            return null;
        }
        const value = parsed as Partial<LorebookCardState>;
        if (value.schema !== LOREBOOK_DRAFT_CARD_SCHEMA) {
            return null;
        }
        if (typeof value.status !== "string" || !LOREBOOK_DRAFT_CARD_STATUSES.includes(value.status as LorebookCardStatus)) {
            return null;
        }
        const fields = readLorebookDraftFields(value.fields);
        if (!fields) {
            return null;
        }
        return {
            schema: LOREBOOK_DRAFT_CARD_SCHEMA,
            status: value.status as LorebookCardStatus,
            fields,
        };
    } catch {
        return null;
    }
}

/** 写卡片状态；失败（隐私模式、配额满）只影响下次回看的记忆，不打断这次确认。 */
export function writeLorebookCardState(storage: LorebookCardStorage, key: string, state: LorebookCardState): boolean {
    try {
        storage.setItem(key, JSON.stringify(state));
        return true;
    } catch {
        return false;
    }
}
