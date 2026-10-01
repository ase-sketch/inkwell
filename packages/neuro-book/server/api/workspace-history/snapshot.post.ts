import {getQuery} from "h3";
import {z} from "zod";
import {ProjectRootDtoSchema} from "nbook/shared/dto/project.dto";
import {ChapterSnapshotCreateDtoSchema} from "nbook/shared/dto/chapter-snapshot.dto";
import {withProjectHandlesOperation} from "nbook/server/workspace-files/project-open-guard";
import {
    assertHistoryTrackedPath,
    historyDisabledError,
} from "nbook/server/workspace-history/chapter-snapshot-guards";
import {
    createChapterSnapshot,
    readChapterSnapshotList,
    readCurrentTextEntry,
} from "nbook/server/workspace-history/chapter-snapshots";
import type {ChapterSnapshotListDto} from "nbook/shared/dto/chapter-snapshot.dto";

/**
 * 给当前章节的正文打一枚快照（作者主动标记的命名存档点）。
 *
 * 快照不存正文，只存「这一章 + 它当前对应的那次保存」这枚指针；正文永远由历史库提供。
 * 落表失败必须如实报错给作者（打快照是作者主动要的存档点，静默失败等于骗人），
 * 但它不碰正文文件，绝不阻断作者继续码字。
 *
 * 返回该章节的完整快照列表（含刚打的那枚），界面据此就地刷新，免一次往返。
 */
export default defineEventHandler(async (event): Promise<ChapterSnapshotListDto> => {
    // projectRoot 走 query（与既有 workspace-files 写入口一致），业务入参走 body。
    const {projectRoot} = z.object({projectRoot: ProjectRootDtoSchema}).parse(getQuery(event));
    const body = ChapterSnapshotCreateDtoSchema.parse(await readBody(event));
    return withProjectHandlesOperation(projectRoot, async (projectHandles) => {
        assertHistoryTrackedPath(projectHandles, body.path);
        await projectHandles.history.waitForWarmup();
        const history = await projectHandles.history.history;
        if (!history) {
            throw historyDisabledError();
        }
        // 只能标记「此刻这一版」：快照挂在当前正文的末态上，不能由调用方指定历史版本。
        const current = await readCurrentTextEntry({history, path: body.path});
        await createChapterSnapshot({path: body.path, entryId: current.entry.id, note: body.note});
        return readChapterSnapshotList({history, path: body.path});
    });
});
