import {
    WorkflowRunner,
    type WorkflowDefinition,
} from "../dist/index.js";

const definition: WorkflowDefinition = {
    key: "package-type-consumer",
    manifestHash: "sha256:package-type-consumer-v1",
    run: async (workflow) => ({
        now: await workflow.now(),
    }),
};

const runner = new WorkflowRunner();
const result = await runner.start(definition, null);
result.workflowManifestHash satisfies string;
