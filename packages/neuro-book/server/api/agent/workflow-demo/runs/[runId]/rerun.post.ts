import {createError, getRouterParam, readBody} from "h3";
import {useWorkflowDemoService} from "nbook/server/agent/workflow/workflow-demo-service";

/** Workflow demo：rerun 重放恢复；styleMode 提供时先改"脚本参数"演示局部失效 */
export default defineEventHandler(async (event) => {
    const runId = getRouterParam(event, "runId");
    if (!runId) throw createError({statusCode: 400, message: "runId 必填"});
    const body = await readBody<{styleMode?: string} | undefined>(event).catch(() => undefined);
    try {
        useWorkflowDemoService().rerun(runId, body?.styleMode);
        return {ok: true};
    } catch (error) {
        throw createError({statusCode: 400, message: error instanceof Error ? error.message : String(error)});
    }
});
