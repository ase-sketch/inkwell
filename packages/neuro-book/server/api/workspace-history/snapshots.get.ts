import {getQuery} from "h3";
import {z} from "zod";
import {ProjectRootDtoSchema} from "nbook/shared/dto/project.dto";
import {withProjectHandlesOperation} from "nbook/server/workspace-files/project-open-guard";
import {
    assertHistoryTrackedPath,
    historyDisabledError,
} from "nbook/server/workspace-history/chapter-snapshot-guards";
import {readChapterSnapshotList} from "nbook/server/workspace-history/chapter-snapshots";
import type {ChapterSnapshotListDto} from "nbook/shared/dto/chapter-snapshot.dto";

/**
 * 列某章节的快照（最近打的在最前）。
 *
 * 每条都带 restorable：该版本内容当前是否仍可取。false 时界面把「看差异 / 还原」置灰
 * 并如实说明原因，而不是让作者点进去看一个空白。
 */
export default defineEventHandler(async (event): Promise<ChapterSnapshotListDto> => {
    const query = z.object({
        projectRoot: ProjectRootDtoSchema,
        path: z.string().trim().min(1, "path 不能为空"),
    }).parse(getQuery(event));
    return withProjectHandlesOperation(query.projectRoot, async (projectHandles) => {
        assertHistoryTrackedPath(projectHandles, query.path);
        await projectHandles.history.waitForWarmup();
        const history = await projectHandles.history.history;
        if (!history) {
            throw historyDisabledError();
        }
        return readChapterSnapshotList({history, path: query.path});
    });
});
