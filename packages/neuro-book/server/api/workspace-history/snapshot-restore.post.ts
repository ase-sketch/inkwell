import {z} from "zod";
import {createError, getQuery} from "h3";
import {ProjectRootDtoSchema} from "nbook/shared/dto/project.dto";
import {ChapterSnapshotRestoreDtoSchema} from "nbook/shared/dto/chapter-snapshot.dto";
import {resolveWorkspaceFileTarget} from "nbook/server/workspace-files/novel-workspace";
import {withProjectTargetMutation} from "nbook/server/workspace-files/project-open-guard";
import {runtimePathsFromEnv} from "nbook/server/runtime/paths/runtime-paths";
import {
    assertHistoryTrackedPath,
    historyDisabledError,
} from "nbook/server/workspace-history/chapter-snapshot-guards";
import {
    createChapterSnapshot,
    findChapterSnapshotRow,
    readChapterSnapshotBody,
    readChapterSnapshotList,
    readCurrentTextEntry,
    resolveSnapshotEntry,
} from "nbook/server/workspace-history/chapter-snapshots";
import {USER_LOCAL_ACTOR, writeWorkspaceTextFileTracked} from "nbook/server/workspace-history/tracked-workspace-files";
import type {ChapterSnapshotRestoreResultDto} from "nbook/shared/dto/chapter-snapshot.dto";

/**
 * 一键把章节还原到某份快照指向的版本。
 *
 * 破坏性操作的三重防护（决策笔记拍板）：
 * 1. 必须作者确认——confirm 恒为 true，缺省即拒（DTO 层 z.literal(true) 已在边界拒绝）。
 * 2. 执行前自动为**当前正文**留一枚「还原前」快照：任何误还原都能反悔回去。
 * 3. 还原本身进历史：走既有作者写通道落盘并记账，作者在「演进」里看得见这次改动。
 *
 * 与记账的 fail-open 语义相反：还原失败必须如实报错给作者。
 * 作者点了还原却什么都没发生却不说一声，比报错危险得多。
 *
 * 守卫用写入口那一套（withProjectTargetMutation + Project handles），
 * 与 workspace-files/write.put.ts 同口径：还原要落盘并与 File Index 缓存失效串行。
 */
export default defineEventHandler(async (event): Promise<ChapterSnapshotRestoreResultDto> => {
    // projectRoot 走 query（与既有 workspace-files 写入口一致），业务入参走 body。
    const {projectRoot} = z.object({projectRoot: ProjectRootDtoSchema}).parse(getQuery(event));
    const body = ChapterSnapshotRestoreDtoSchema.parse(await readBody(event));
    const target = await resolveWorkspaceFileTarget(runtimePathsFromEnv(), {projectRoot});
    return withProjectTargetMutation(target, async (projectHandles) => {
        if (!projectHandles) {
            throw createError({statusCode: 400, message: "还原章节需要先打开项目"});
        }
        await projectHandles.history.waitForWarmup();
        const history = await projectHandles.history.history;
        if (!history) {
            throw historyDisabledError();
        }
        const snapshot = await findChapterSnapshotRow(body.snapshotId);
        if (!snapshot) {
            throw createError({statusCode: 404, message: "找不到这份快照"});
        }
        const path = snapshot.path;
        assertHistoryTrackedPath(projectHandles, path);
        // 授权：这份快照指向的条目必须仍在该章节的历史时间线里。
        const targetEntry = await resolveSnapshotEntry({history, path, entryId: snapshot.entryId});
        const content = await readChapterSnapshotBody({history, entry: targetEntry, path});

        // 还原前先给当前正文留一枚「还原前」快照——留不下来就不还原，绝不没有退路地覆盖。
        const currentEntry = await readCurrentTextEntry({history, path});
        const safety = await createChapterSnapshot({
            path,
            entryId: currentEntry.entry.id,
            note: SAFETY_SNAPSHOT_NOTE,
        });

        await writeWorkspaceTextFileTracked({
            target,
            history: projectHandles.history,
            filePath: path,
            content,
            actor: USER_LOCAL_ACTOR,
        });
        // 还原落盘后新产生的那条历史条目即本次还原的留痕。
        const restoredEntry = await readCurrentTextEntry({history, path});

        return {
            status: "restored" as const,
            safetySnapshotId: safety.id,
            restoredEntryId: restoredEntry.entry.id,
            snapshots: await readChapterSnapshotList({history, path}),
        };
    });
});

/**
 * 还原前自动留的那枚快照的备注。
 * 面向作者说人话：一眼看出这是误操作前的退路，不掺任何工程词。
 */
const SAFETY_SNAPSHOT_NOTE = "还原前";
