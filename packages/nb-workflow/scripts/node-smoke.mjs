import {
    WorkflowRunner,
} from "../dist/index.js";

const runner = new WorkflowRunner();
const result = await runner.start({
    key: "node-smoke",
    manifestHash: "sha256:node-smoke-v1",
    run: async (workflow) => ({
        now: await workflow.now(),
    }),
}, null);

if (
    result.status !== "completed"
    || typeof result.result?.now !== "string"
) {
    throw new Error(`Node package smoke failed: ${JSON.stringify(result)}`);
}

console.log("NODE_PACKAGE_SMOKE_OK");
