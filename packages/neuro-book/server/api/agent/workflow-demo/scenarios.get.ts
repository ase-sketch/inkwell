import {useWorkflowDemoService} from "nbook/server/agent/workflow/workflow-demo-service";

/** Workflow demo：场景列表（含骨架与 CFG 投影） */
export default defineEventHandler(async () => {
    return await useWorkflowDemoService().listScenarios();
});
