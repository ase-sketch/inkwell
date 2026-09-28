import {z} from "zod";

/**
 * M6 设定卡沉淀：submit_lorebook_draft 结构化草稿契约（server 与前端共用的唯一事实源）。
 *
 * 机制：作者在 agent 消息上点「提取为设定」，当前会话的 AI 把这段讨论消化成一张规范
 * 设定条目草稿（标题 / 类目 / 别名 / 摘要 / 正文），经 profile 级自定义工具
 * submit_lorebook_draft 提交；前端在主聊天流里渲染成确认卡，作者改完确认后才由会话内
 * AI 走既有文件写工具落盘。
 *
 * **工具本身绝不写文件**：它只把草稿交给渲染层，与 M3 的 submit_critiques 同构。
 * 字段口径由本契约固定，改这里等于改契约（profile 源码里的手写校验与前端卡片解析
 * 各有一份同构实现，三处必须一起改）。
 */

/** submit_lorebook_draft 工具名（profile 级自定义工具，唯一注册名）。 */
export const SUBMIT_LOREBOOK_DRAFT_TOOL = "submit_lorebook_draft";

/**
 * 草稿提交后的悬挂标记。
 *
 * 与 M3 的 CRITIQUES_PENDING_AUTHOR_REVIEW、M2.5b 的 PROPOSAL_PENDING_AUTHOR_REVIEW
 * 同口径：工具结果正文带这个标记，表示「草稿已交，等作者在卡上确认，尚未落盘」。
 */
export const LOREBOOK_DRAFT_PENDING_MARKER = "LOREBOOK_DRAFT_PENDING_AUTHOR_REVIEW";

/**
 * 设定类目：与设定集（lorebook/）下真实存在的 9 个目录一一对应。
 *
 * 对齐 app/utils/ide-shell-layout.ts 的 LOREBOOK_CATEGORIES：那边是作者视角的呈现
 * 顺序与图标，这边是写入路径与校验口径，两边取值必须一致。
 */
export const LOREBOOK_DRAFT_CATEGORIES = [
    "character",
    "faction",
    "location",
    "item",
    "system",
    "world",
    "event",
    "note",
    "instruction",
] as const;

/** 设定条目标题长度上限。 */
export const MAX_LOREBOOK_DRAFT_TITLE_LENGTH = 100;

/** 单个别名长度上限。 */
export const MAX_LOREBOOK_DRAFT_ALIAS_LENGTH = 50;

/** 别名条数上限：别名是检索命中的关键，但铺太长的列表会把小模型带偏。 */
export const MAX_LOREBOOK_DRAFT_ALIASES = 12;

/** 条目摘要长度上限（卡片上给作者一眼看的那句话）。 */
export const MAX_LOREBOOK_DRAFT_SUMMARY_LENGTH = 200;

/** 条目正文长度上限。 */
export const MAX_LOREBOOK_DRAFT_BODY_LENGTH = 4_000;

/**
 * 被提取的原文摘录长度上限。
 *
 * 摘录必须来自作者实际划选或点选的那段讨论，不是模型的概括；超过这个长度的讨论
 * 本就该分次提取，而不是把一大段原样塞进卡片。
 */
export const MAX_LOREBOOK_DRAFT_SOURCE_EXCERPT_LENGTH = 2_000;

/** 建议目录名长度上限。 */
export const MAX_LOREBOOK_DRAFT_SLUG_LENGTH = 60;

/** 目录名形态：小写字母数字，词间用连字符（与 manuscript/ 章节目录名同口径）。 */
export const LOREBOOK_DRAFT_SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/u;

/** 设定类目 schema。 */
export const LorebookDraftCategorySchema = z.enum(LOREBOOK_DRAFT_CATEGORIES);

/**
 * 建议目录名（可选）。
 *
 * 缺省时由落盘方按标题生成；给了就必须是合法目录名形态——中文标题的拉丁化没有
 * 通用答案，转写交给模型判断比机械音译准，但转写结果仍要过这道形态校验。
 */
export const LorebookDraftSlugSchema = z.string().trim().min(1).max(MAX_LOREBOOK_DRAFT_SLUG_LENGTH).regex(LOREBOOK_DRAFT_SLUG_PATTERN, "目录名只能用小写字母、数字与中划线");

/**
 * submit_lorebook_draft 工具输入 payload：一次一张卡。
 *
 * 一张卡对应一个设定条目；讨论里同时聊出三件事时，分三次提交、分三张卡确认，
 * 不合并成一张多条目卡——标题与别名是逐条目的，合并会让检索命中失真。
 */
export const LorebookDraftInputSchema = z.object({
    /** 条目标题（写进 frontmatter 的 title）。 */
    title: z.string().trim().min(1).max(MAX_LOREBOOK_DRAFT_TITLE_LENGTH),
    /** 设定类目（决定落在 lorebook/<类目>/ 下）。 */
    category: LorebookDraftCategorySchema,
    /** 别名列表：正文与对话里真实会出现的称呼、简称、职务、绰号、代称。 */
    aliases: z.array(z.string().trim().min(1).max(MAX_LOREBOOK_DRAFT_ALIAS_LENGTH)).max(MAX_LOREBOOK_DRAFT_ALIASES),
    /** 一句话摘要（frontmatter 的 summary，也是卡片上给作者看的那句）。 */
    summary: z.string().trim().min(1).max(MAX_LOREBOOK_DRAFT_SUMMARY_LENGTH),
    /** 条目正文（Markdown，不含 frontmatter）。 */
    body: z.string().trim().min(1).max(MAX_LOREBOOK_DRAFT_BODY_LENGTH),
    /** 被提取的原文摘录（作者划选或点选的那段讨论原文）。 */
    sourceExcerpt: z.string().trim().min(1).max(MAX_LOREBOOK_DRAFT_SOURCE_EXCERPT_LENGTH),
    /** 建议目录名；缺省时由落盘方按标题生成。 */
    suggestedSlug: LorebookDraftSlugSchema.optional(),
});

/** 设定类目。 */
export type LorebookDraftCategory = z.infer<typeof LorebookDraftCategorySchema>;

/** submit_lorebook_draft 工具输入 payload。 */
export type LorebookDraftInput = z.infer<typeof LorebookDraftInputSchema>;

/**
 * 类目的作者可读说法。
 *
 * 面向前端卡片的类目选择与落盘后的自然语言回报；界面文案说人话，不出现
 * character / instruction 这类内部目录名。
 */
export const LOREBOOK_DRAFT_CATEGORY_LABELS: Readonly<Record<LorebookDraftCategory, string>> = {
    character: "角色",
    faction: "势力",
    location: "地点",
    item: "物品",
    system: "体系",
    world: "世界",
    event: "事件",
    note: "笔记",
    instruction: "写作规范",
};

/**
 * 按标题生成建议目录名。
 *
 * 只对 ASCII 标题有效：中文标题会被清成空串，此时返回空串并由落盘方交给模型补一个
 * 拉丁化目录名（机器音译中文不可靠，宁可显式留空也不猜）。
 */
export function lorebookDraftSlugFromTitle(title: string): string {
    const slug = String(title ?? "")
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9]+/gu, "-")
        .replace(/^-+|-+$/gu, "")
        .slice(0, MAX_LOREBOOK_DRAFT_SLUG_LENGTH)
        .replace(/-+$/gu, "");
    return LOREBOOK_DRAFT_SLUG_PATTERN.test(slug) ? slug : "";
}
