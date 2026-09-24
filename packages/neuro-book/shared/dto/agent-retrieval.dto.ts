import {z} from "zod";

/**
 * 检索注入的结构化归因契约（M2.7a）。
 *
 * 与注入正文的关系：正文是给模型看的，这里是给界面看的旁路元数据，
 * 两者由同一次物化产出，字段直接取自真实命中，**不允许**事后解析正文反推。
 */

/** promise-ledger / mentioned-entities 两类检索注入的 kind。 */
export const RetrievalKindSchema = z.enum(["promise-ledger", "mentioned-entities"]);

/**
 * 单条被检索注入的条目。
 *
 * 字段按类目可选，不设「按 kind 必填」的联合校验：服务端物化器是唯一写入方，
 * 契约保持宽容以免新增一类检索时被迫改 schema。
 */
export const RetrievalItemDtoSchema = z.object({
    /** 条目显示名：mentioned-entities 用设定卡标题，promise-ledger 用伏笔名。 */
    title: z.string(),
    /**
     * 设定集一级类目，如 character / location / faction。
     * 口径 = 条目目录去掉 `lorebook/` 前缀后的第一段；仅 mentioned-entities 有。
     */
    category: z.string().optional(),
    /** 条目目录路径（不含 /index.md），如 `lorebook/character/erina`；仅 mentioned-entities 有。 */
    path: z.string().optional(),
    /** 实际命中的词：标题、别名或目录 slug 中的某一个；仅 mentioned-entities 有。 */
    trigger: z.string().optional(),
    /** 伏笔 id；仅 promise-ledger 有。 */
    promiseId: z.number().optional(),
});

/**
 * 一轮检索注入的汇总。只在真实注入发生时产出——零命中不注入，也就没有 summary。
 */
export const RetrievalSummaryDtoSchema = z.object({
    kind: RetrievalKindSchema,
    items: z.array(RetrievalItemDtoSchema),
    /** 被预算截断、未注入的条数；全部注入时为 0 或省略。 */
    omittedCount: z.number().int().nonnegative().optional(),
});

export type RetrievalKindDto = z.infer<typeof RetrievalKindSchema>;
export type RetrievalItemDto = z.infer<typeof RetrievalItemDtoSchema>;
export type RetrievalSummaryDto = z.infer<typeof RetrievalSummaryDtoSchema>;
