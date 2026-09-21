import {createError, getQuery, getRouterParam} from "h3";
import {useWorkflowDemoService} from "nbook/server/agent/workflow/workflow-demo-service";

/** Workflow demo：run 快照 + 增量事件（?after=游标）。
 * 返回类型显式收窄为 unknown：RunView 含递归 JsonValue，进 Nuxt 类型化路由表会让消费端 TS2589 爆栈；
 * 线上边界按无类型 JSON 处理，前端用 WorkflowDemoRunState 断言。 */
export default defineEventHandler(async (event): Promise<unknown> => {
    const runId = getRouterParam(event, "runId");
    if (!runId) throw createError({statusCode: 400, message: "runId 必填"});
    const after = Number(getQuery(event).after ?? 0);
    try {
        return await useWorkflowDemoService().runState(runId, Number.isFinite(after) ? after : 0);
    } catch (error) {
        throw createError({statusCode: 404, message: error instanceof Error ? error.message : String(error)});
    }
});
