import {z} from "zod";
import {WorkspaceHistoryDiffDtoSchema} from "nbook/shared/dto/workspace-history.dto";

/**
 * 章节快照 DTO（M7：章节快照时光机）。
 *
 * 概念：正文每次保存都已被 nb-history 全量留痕，但那是机器的审计账本。
 * 「快照」= 作者主动给正文的某个历史版本打的一枚**可命名存档点**。
 *
 * 存储口径（决策笔记拍板）：快照表在**宿主 app-sqlite**，每条快照只存
 * 「章节路径 + 指向的 nb-history entryId + 可选备注 + 拍摄时间」，
 * **不存正文**——正文与版本内容永远由 nb-history 快照提供（唯一事实源）。
 * 因此快照 = 指向现有历史时间线的一枚指针，基座 nb-history 不动。
 *
 * 与 M5「演进」区块的分工：演进回答「谁在什么时候改的」（自动留痕）；
 * 快照回答「我特意留了哪几个版本」（作者主动标记）。
 *
 * 纪律：DTO 只载事实。「这条快照叫什么」「这条改了什么」等人话判断归前端纯模块，
 * 服务端不得把工程词（entryId/时间线/哈希）透给作者界面。
 */

/** 一次打快照的入参。note 留空即由前端/服务端用时间戳兜底成默认标题。 */
export const ChapterSnapshotCreateDtoSchema = z.object({
    /** 要打快照的章节正文路径（项目相对路径，正斜杠）。 */
    path: z.string().min(1),
    /** 作者备注；可空/留空表示不命名，由界面按拍摄时间兜底显示。 */
    note: z.string().trim().max(200).optional(),
});
export type ChapterSnapshotCreateDto = z.infer<typeof ChapterSnapshotCreateDtoSchema>;

/**
 * 一条快照。
 *
 * restorable：该 entryId 指向的版本内容当前是否仍可取。
 * false = 该版本已被 nb-history 保留策略清理 / 超限未存 body，
 * 界面据此把「看差异」「还原」置灰并如实说明，不让作者点进去看空白。
 */
export const ChapterSnapshotDtoSchema = z.object({
    /** 快照自身 id（还原时的目标标识）。 */
    id: z.number().int().positive(),
    /** 拍摄时该章节的路径。 */
    path: z.string(),
    /** 指向 nb-history 的版本条目 id——快照内容由它提供，界面不直接展示。 */
    entryId: z.number().int().positive(),
    /** 作者备注；null = 作者没起名，界面按拍摄时间兜底标题。 */
    note: z.string().nullable(),
    /** ISO-8601 UTC 拍摄时间。 */
    createdAt: z.string(),
    /** 该版本内容当前是否仍可取（可看差异 / 可还原）。 */
    restorable: z.boolean(),
});
export type ChapterSnapshotDto = z.infer<typeof ChapterSnapshotDtoSchema>;

/** 某章节的快照列表，按拍摄时间倒序（最近打的在最前）。 */
export const ChapterSnapshotListDtoSchema = z.object({
    path: z.string(),
    snapshots: z.array(ChapterSnapshotDtoSchema),
});
export type ChapterSnapshotListDto = z.infer<typeof ChapterSnapshotListDtoSchema>;

/** 快照 diff 的目标：与当前正文比，或与另一个快照比。 */
export const ChapterSnapshotDiffRequestDtoSchema = z.object({
    /** 基准快照（比较的「前」侧）。 */
    snapshotId: z.number().int().positive(),
    /**
     * 对比侧：省略 / null = 与**当前正文**比；
     * 给另一个 snapshotId = 两个快照互比。
     */
    againstSnapshotId: z.number().int().positive().nullable().optional(),
});
export type ChapterSnapshotDiffRequestDto = z.infer<typeof ChapterSnapshotDiffRequestDtoSchema>;

/** 快照 diff 响应：直接复用 workspace-history 的安全 diff 契约（不新造，安全分支不携正文）。 */
export const ChapterSnapshotDiffDtoSchema = WorkspaceHistoryDiffDtoSchema;
export type ChapterSnapshotDiffDto = z.infer<typeof ChapterSnapshotDiffDtoSchema>;

/** 一键还原的入参。必须带作者确认语义（confirm = true）。 */
export const ChapterSnapshotRestoreDtoSchema = z.object({
    /** 要还原到的目标快照 id。 */
    snapshotId: z.number().int().positive(),
    /** 作者已确认破坏性还原；未确认不得执行（服务端校验）。 */
    confirm: z.literal(true),
});
export type ChapterSnapshotRestoreDto = z.infer<typeof ChapterSnapshotRestoreDtoSchema>;

/**
 * 还原结果。
 *
 * 还原前会自动为当前正文留一枚「还原前」快照（可在界面反悔回去）；
 * safetySnapshotId 即那枚快照的 id，restoredEntryId 是还原后落历史的新条目。
 */
export const ChapterSnapshotRestoreResultDtoSchema = z.object({
    /** 还原完成。 */
    status: z.literal("restored"),
    /** 还原前自动留的「还原前」快照 id；作者可据此再还原回去。 */
    safetySnapshotId: z.number().int().positive(),
    /** 还原完成后落历史的新条目 id（供界面刷新用）。 */
    restoredEntryId: z.number().int().positive(),
    /** 还原后该章节的完整快照列表（含新的「还原前」快照），供界面免二次请求刷新。 */
    snapshots: ChapterSnapshotListDtoSchema,
});
export type ChapterSnapshotRestoreResultDto = z.infer<typeof ChapterSnapshotRestoreResultDtoSchema>;
