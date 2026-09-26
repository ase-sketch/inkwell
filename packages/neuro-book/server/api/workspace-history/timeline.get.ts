import {getQuery} from "h3";
import {z} from "zod";
import {ProjectRootDtoSchema} from "nbook/shared/dto/project.dto";
import {withProjectHandlesOperation} from "nbook/server/workspace-files/project-open-guard";
import {
    readWorkspaceHistoryTimeline,
    resolveTimelineAgentAttributions,
    toWorkspaceHistoryTimelineDto,
} from "nbook/server/workspace-history/history-timeline";
import type {WorkspaceHistoryTimelineDto} from "nbook/shared/dto/workspace-history.dto";

/**
 * 单文件版本时间线（条目「演进」）：按 Project 授权返回该路径的变更记录，倒序。
 *
 * 归因解析在服务端：agent 条目把会话编号解析成会话标题与档案键（会话已删除则给 null，
 * 由界面降级成纯文本）。正文一律不在这里——差异按路径授权走 /api/workspace-history/entry-diff。
 * history 未启用时返回空时间线，界面显示空态而不是报错。
 */
export default defineEventHandler(async (event): Promise<WorkspaceHistoryTimelineDto> => {
    const query = z.object({
        projectRoot: ProjectRootDtoSchema,
        path: z.string().trim().min(1, "path 不能为空"),
        limit: z.coerce.number().int().positive().optional(),
    }).parse(getQuery(event));
    return withProjectHandlesOperation(query.projectRoot, async (projectHandles) => {
        await projectHandles.history.waitForWarmup();
        const history = await projectHandles.history.history;
        if (!history) {
            return {path: query.path, entries: []};
        }
        const {path, timeline} = await readWorkspaceHistoryTimeline({
            history,
            path: query.path,
            limit: query.limit,
        });
        return toWorkspaceHistoryTimelineDto({
            path,
            timeline,
            attributions: await resolveTimelineAgentAttributions(timeline),
        });
    });
});
