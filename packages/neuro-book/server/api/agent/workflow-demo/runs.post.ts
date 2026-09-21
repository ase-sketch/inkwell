import {createError, readBody} from "h3";
import {useWorkflowDemoService} from "nbook/server/agent/workflow/workflow-demo-service";
import type {JsonValue} from "@notnotype/nb-workflow";

/** Workflow demo：启动一次 run（立即返回 runId，执行在后台） */
export default defineEventHandler(async (event) => {
    const body = await readBody<{scenarioKey?: string; args?: JsonValue; speedFactor?: number}>(event);
    if (!body?.scenarioKey || typeof body.scenarioKey !== "string") {
        throw createError({statusCode: 400, message: "scenarioKey 必填"});
    }
    try {
        return await useWorkflowDemoService().startRun(body.scenarioKey, body.args ?? null, typeof body.speedFactor === "number" ? body.speedFactor : undefined);
    } catch (error) {
        throw createError({statusCode: 400, message: error instanceof Error ? error.message : String(error)});
    }
});
