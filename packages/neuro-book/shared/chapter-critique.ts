import {z} from "zod";

/**
 * M3 审稿质疑卡：submit_critiques 结构化质疑契约（server 与前端共用的唯一事实源）。
 *
 * 机制：审稿 profile 只挑刺、不改正文；LLM 通过 profile 级自定义工具 submit_critiques
 * 返回一份「章节质疑单」，前端在主聊天流里渲染成质疑卡，作者逐条处置
 * （认可 / 驳回 / 记下）。处置结果只落在本机浏览器存储里，不写回项目文件、
 * 也不改变任何正文。
 *
 * 字段口径由 M3 契约固定，改这里等于改契约。
 */

/** submit_critiques 工具名（审稿 profile 级自定义工具，唯一注册名）。 */
export const SUBMIT_CRITIQUES_TOOL = "submit_critiques";

/** 章节名长度上限。 */
export const MAX_CRITIQUE_CHAPTER_LENGTH = 200;

/** 单条质疑正文长度上限。 */
export const MAX_CRITIQUE_QUESTION_LENGTH = 2_000;

/** 单条原文引用长度上限；引用必须是章节正文里的真实片段。 */
export const MAX_CRITIQUE_QUOTE_LENGTH = 2_000;

/** 整章小结长度上限。 */
export const MAX_CRITIQUE_SUMMARY_LENGTH = 2_000;

/** 伏笔名 / 规则脚注长度上限。 */
export const MAX_CRITIQUE_RULE_ID_LENGTH = 200;

/** 处置附言长度上限。 */
export const MAX_CRITIQUE_NOTE_LENGTH = 500;

/**
 * 单份质疑单的条目上限。
 *
 * 定这个数的是公开投影的节点预算：submit_critiques 不是内置工具，它的参数走
 * generic 有界预览（最多 256 个结构节点），每条质疑连同 evidence 约占 10 个节点，
 * 超出预算的条目会被投影截掉，历史回看时整份质疑单解析不出来。20 条留了足够余量，
 * 一章挑出 20 处以上站不住的地方本就不常见——真到那个量级，本该分轴分批审。
 */
export const MAX_CRITIQUE_ITEMS = 20;

/** 三轴：动机 / 伏笔 / AI 味。 */
export const CritiqueCategorySchema = z.enum(["motivation", "foreshadowing", "ai-flavor"]);

/** 单条质疑的严重度。 */
export const CritiqueSeveritySchema = z.enum(["low", "medium", "high"]);

/** 作者对单条质疑的处置。 */
export const CritiqueDispositionSchema = z.enum(["accepted", "rejected", "noted"]);

/**
 * 原文证据。
 *
 * quote 是唯一锚点：行号会随编辑漂移，定位一律以 quote 现算，line 只作为
 * 模型给出的提示值，缺失或过期都不影响跳转。
 */
export const CritiqueEvidenceSchema = z.object({
    /** 章节正文里的真实片段（区分大小写）。 */
    quote: z.string().trim().min(1).max(MAX_CRITIQUE_QUOTE_LENGTH),
    /** 模型给出的 1-based 行号提示；不作为持久锚点。 */
    line: z.number().int().optional(),
});

/** 单条质疑。 */
export const CritiqueItemSchema = z.object({
    /** 质疑落在哪一轴。 */
    category: CritiqueCategorySchema,
    /** 质疑内容，问句形式，面向作者。 */
    question: z.string().trim().min(1).max(MAX_CRITIQUE_QUESTION_LENGTH),
    /** 原文证据。 */
    evidence: CritiqueEvidenceSchema,
    /** 严重度。 */
    severity: CritiqueSeveritySchema,
    /** AI 味轴的文风检查规则 id。 */
    llmLintRuleId: z.string().trim().min(1).max(MAX_CRITIQUE_RULE_ID_LENGTH).optional(),
    /** 伏笔轴的伏笔 id。 */
    promiseId: z.number().int().optional(),
});

/** submit_critiques 工具输入 payload。 */
export const ChapterCritiqueInputSchema = z.object({
    /**
     * 被审的章节。三种写法都合法，消费端必须全认：
     * Plot 章节名（「第一章 启程」）、manuscript 目录名（001-departure）、
     * 以及章节正文的完整相对路径（manuscript/001-vol/001-departure/index.md）。
     *
     * 第三种是工具参数描述明说允许的，模型真的会传——消费端只认前两种就是缺陷。
     */
    chapter: z.string().trim().min(1).max(MAX_CRITIQUE_CHAPTER_LENGTH),
    /** 一句话小结（作者可读）。 */
    summary: z.string().trim().min(1).max(MAX_CRITIQUE_SUMMARY_LENGTH).optional(),
    /** 质疑条目（逐条处置粒度）。 */
    items: z.array(CritiqueItemSchema).min(1).max(MAX_CRITIQUE_ITEMS),
});

/** 单条质疑的处置结果。 */
export const CritiqueOutcomeSchema = z.object({
    /** 对应质疑条目的下标（0-based，对齐 items 顺序）。 */
    index: z.number().int().nonnegative(),
    /** 处置方式。 */
    disposition: CritiqueDispositionSchema,
    /** 作者附言（可空）。 */
    note: z.string().trim().max(MAX_CRITIQUE_NOTE_LENGTH).optional(),
});

/** 质疑落在哪一轴。 */
export type CritiqueCategory = z.infer<typeof CritiqueCategorySchema>;

/** 单条质疑的严重度。 */
export type CritiqueSeverity = z.infer<typeof CritiqueSeveritySchema>;

/** 作者对单条质疑的处置。 */
export type CritiqueDisposition = z.infer<typeof CritiqueDispositionSchema>;

/** 原文证据。 */
export type CritiqueEvidence = z.infer<typeof CritiqueEvidenceSchema>;

/** 单条质疑。 */
export type CritiqueItem = z.infer<typeof CritiqueItemSchema>;

/** submit_critiques 工具输入 payload。 */
export type ChapterCritiqueInput = z.infer<typeof ChapterCritiqueInputSchema>;

/** 单条质疑的处置结果。 */
export type CritiqueOutcome = z.infer<typeof CritiqueOutcomeSchema>;
