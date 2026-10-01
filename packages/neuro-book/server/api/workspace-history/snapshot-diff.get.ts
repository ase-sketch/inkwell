import {createError, getQuery} from "h3";
import {z} from "zod";
import {ProjectRootDtoSchema} from "nbook/shared/dto/project.dto";
import {withProjectHandlesOperation} from "nbook/server/workspace-files/project-open-guard";
import {
    assertHistoryTrackedPath,
    historyDisabledError,
} from "nbook/server/workspace-history/chapter-snapshot-guards";
import {
    findChapterSnapshotRow,
    readChapterSnapshotAgainstCurrentDiff,
    readChapterSnapshotAgainstSnapshotDiff,
} from "nbook/server/workspace-history/chapter-snapshots";
import type {WorkspaceHistoryDiffMode} from "nbook/server/workspace-history/history-diff";
import type {ChapterSnapshotDiffDto} from "nbook/shared/dto/chapter-snapshot.dto";

/**
 * 读一份快照的「这版 vs 现在（或 vs 另一份快照）」安全 diff。
 *
 * 授权边界与 M5 条目 diff 同一口径：快照 id 必须先在快照表里查到，
 * 且它指向的 entryId 必须出现在该 path 的历史时间线里（服务端反查）——
 * 不接受任何裸 hash，外部无法用一枚 id 换取任意章节的正文。
 *
 * 安全分支（敏感路径 / 超限 / 正文不可取）沿用 readWorkspaceHistoryDiff 的同一份实现，
 * 与收件箱 diff、条目 diff 共用一条边界：安全分支绝不携带正文。
 */
export default defineEventHandler(async (event): Promise<ChapterSnapshotDiffDto> => {
    const query = z.object({
        projectRoot: ProjectRootDtoSchema,
        path: z.string().trim().min(1, "path 不能为空"),
        snapshotId: z.coerce.number().int().positive("snapshotId 必须是正整数"),
        /** 省略 = 与当前正文比；给另一个 snapshotId = 两份快照互比。 */
        againstSnapshotId: z.coerce.number().int().positive("againstSnapshotId 必须是正整数").optional(),
        mode: z.enum(["inline", "full"]).default("inline"),
    }).parse(getQuery(event));
    const mode: WorkspaceHistoryDiffMode = query.mode;
    return withProjectHandlesOperation(query.projectRoot, async (projectHandles) => {
        assertHistoryTrackedPath(projectHandles, query.path);
        await projectHandles.history.waitForWarmup();
        const history = await projectHandles.history.history;
        if (!history) {
            return {status: "unavailable", reason: "history_disabled"};
        }
        const snapshot = await findChapterSnapshotRow(query.snapshotId);
        if (!snapshot || snapshot.path !== query.path) {
            throw createError({statusCode: 404, message: "找不到这份快照"});
        }
        if (query.againstSnapshotId === undefined) {
            return readChapterSnapshotAgainstCurrentDiff({
                history,
                path: query.path,
                baseEntryId: snapshot.entryId,
                mode,
            });
        }
        const against = await findChapterSnapshotRow(query.againstSnapshotId);
        if (!against || against.path !== query.path) {
            throw createError({statusCode: 404, message: "找不到要对比的那份快照"});
        }
        return readChapterSnapshotAgainstSnapshotDiff({
            history,
            path: query.path,
            baseEntryId: snapshot.entryId,
            againstEntryId: against.entryId,
            mode,
        });
    });
});
