import {z} from "zod";

/**
 * Workspace 文件历史（Task 95）收件箱 DTO。
 * 收件箱只传摘要与 hash 引用；正文必须通过按当前 inbox path 授权的安全 diff 接口按需读取。
 */

/** 收件箱条目摘要。 */
export const WorkspaceHistoryEntryDtoSchema = z.object({
    id: z.number(),
    /** ISO-8601 UTC */
    occurredAt: z.string(),
    actorKind: z.enum(["user", "agent", "system", "external"]),
    /** 归因细节：agent = sessionId、system = source、user = userId；external 为 null */
    actorDetail: z.string().nullable(),
    /** file.create / file.edit / file.delete / file.rename / file.revert / file.restore */
    operationType: z.string(),
});
export type WorkspaceHistoryEntryDto = z.infer<typeof WorkspaceHistoryEntryDtoSchema>;

/** 收件箱分组（每文件一组）。 */
export const WorkspaceHistoryInboxGroupDtoSchema = z.object({
    /** 现名（rename 已跟随） */
    path: z.string(),
    /** 当前分组最后一条 entry id；diff / accept / revert 的并发前置条件 */
    revision: z.number().int().positive(),
    /** diff 基准内容 hash；null = 基准是「文件不存在」（按空文本 diff） */
    baseHash: z.string().nullable(),
    /** 账面末态内容 hash；null = 文件现已删除（按空文本 diff） */
    endHash: z.string().nullable(),
    entries: z.array(WorkspaceHistoryEntryDtoSchema),
});
export type WorkspaceHistoryInboxGroupDto = z.infer<typeof WorkspaceHistoryInboxGroupDtoSchema>;

export const WorkspaceHistoryInboxDtoSchema = z.object({
    /** 当前收件箱内最大的 group revision；空收件箱为 0 */
    revision: z.number().int().nonnegative(),
    groups: z.array(WorkspaceHistoryInboxGroupDtoSchema),
});
export type WorkspaceHistoryInboxDto = z.infer<typeof WorkspaceHistoryInboxDtoSchema>;

/**
 * 条目「演进」时间线 DTO（M5）。
 *
 * 与收件箱 DTO 的分工：收件箱面向「待审查的 agent 变更」，本组面向「这条设定一路怎么变成今天这样」——
 * 覆盖全部四类归因与全部六型操作，且每条自带该次修改的两侧快照可取性。
 * 正文仍不在这里：正文只经按路径授权的安全 diff 接口按需读取。
 */

/** agent 归因的解析结果；会话已删除或读不出来时 title / profileKey 为 null，界面降级显示。 */
export const WorkspaceHistoryAgentAttributionDtoSchema = z.object({
    /** 会话编号；历史库里的归因细节不是合法编号时为 null。 */
    sessionId: z.number().int().positive().nullable(),
    /** 会话标题；查不到会话时为 null。 */
    title: z.string().nullable(),
    /** 会话档案键（如 interview.new-book）；界面据此把「访谈」与「对话」分开说话，查不到时为 null。 */
    profileKey: z.string().nullable(),
    /** 该会话是否还在。false = 记录已删除，界面把归因显示成纯文本、不给跳转入口。 */
    sessionExists: z.boolean(),
});
export type WorkspaceHistoryAgentAttributionDto = z.infer<typeof WorkspaceHistoryAgentAttributionDtoSchema>;

/**
 * 时间线上的一条变更。
 *
 * actorKind / actorDetail 与收件箱条目同口径（agent = sessionId、system = source、user = userId）；
 * agent 另带解析后的会话标题。bodyAvailable 的某一侧为 false 表示该侧快照不可取
 * （超限 / 二进制 / 已被保留策略清理），界面据此不给「展开差异」入口。
 */
export const WorkspaceHistoryTimelineEntryDtoSchema = WorkspaceHistoryEntryDtoSchema.extend({
    bodyAvailable: z.object({
        before: z.boolean(),
        after: z.boolean(),
    }),
    /**
     * 这次修改能不能看前后差异。
     *
     * 与 bodyAvailable 的区别是「文件不存在」这一侧：新建（file.create）天然没有「修改前」，
     * 但它照样能和空文本对比出差异，所以 bodyAvailable.before = false 而这里为 true。
     * 只有「内容存在过、快照却没留下」（超限 / 二进制 / 已被保留策略清理）才算不可展开。
     */
    diffAvailable: z.boolean(),
    /** 仅 actorKind = agent 时非空。 */
    agent: WorkspaceHistoryAgentAttributionDtoSchema.nullable(),
});
export type WorkspaceHistoryTimelineEntryDto = z.infer<typeof WorkspaceHistoryTimelineEntryDtoSchema>;

/**
 * 单文件版本时间线，**按时间倒序**（最近一次在最前）——作者打开详情先看最近一次改动。
 */
export const WorkspaceHistoryTimelineDtoSchema = z.object({
    path: z.string(),
    entries: z.array(WorkspaceHistoryTimelineEntryDtoSchema),
});
export type WorkspaceHistoryTimelineDto = z.infer<typeof WorkspaceHistoryTimelineDtoSchema>;

export const WorkspaceHistoryDiffChangeDtoSchema = z.object({
    value: z.string(),
    added: z.boolean().optional(),
    removed: z.boolean().optional(),
    count: z.number().optional(),
});
export type WorkspaceHistoryDiffChangeDto = z.infer<typeof WorkspaceHistoryDiffChangeDtoSchema>;

/**
 * 安全 diff 契约：blocked / too_large / unavailable 分支绝不携带文件正文。
 */
export const WorkspaceHistoryDiffDtoSchema = z.discriminatedUnion("status", [
    z.object({
        status: z.literal("available"),
        original: z.string(),
        modified: z.string(),
        changes: z.array(WorkspaceHistoryDiffChangeDtoSchema),
        byteSize: z.number(),
        changedLineCount: z.number(),
    }),
    z.object({
        status: z.literal("blocked"),
        reason: z.literal("sensitive_path"),
    }),
    z.object({
        status: z.literal("too_large"),
        reason: z.literal("inline_limit"),
        byteSize: z.number(),
        changedLineCount: z.number(),
    }),
    z.object({
        status: z.literal("unavailable"),
        reason: z.enum(["before-missing", "after-missing", "binary", "history_disabled"]),
    }),
]);
export type WorkspaceHistoryDiffDto = z.infer<typeof WorkspaceHistoryDiffDtoSchema>;