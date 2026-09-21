import {useWorkflowDemoService} from "nbook/server/agent/workflow/workflow-demo-service";

/** Workflow demo：run 概览列表 */
export default defineEventHandler(() => {
    return useWorkflowDemoService().listRuns();
});
