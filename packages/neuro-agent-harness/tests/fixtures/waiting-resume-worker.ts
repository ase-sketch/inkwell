import {
    NeuroAgentHarness,
    ProfileRegistry,
    defineProfile,
    defineSchema,
    defineTool,
    type JsonObject,
} from "../../src/index.js";
import {JsonlSessionStore} from "../../src/storage/jsonl.js";
import {ScriptedModelRuntime} from "../../src/testing/index.js";

const [directory] = process.argv.slice(2);
if (!directory) {
    throw new Error("waiting-resume-worker 需要 directory 参数");
}

const objectSchema = defineSchema<JsonObject>((value) => {
    if (value === null || typeof value !== "object" || Array.isArray(value)) {
        throw new Error("必须是 object");
    }
    return value;
}, {type: "object"});

const gatedTool = defineTool({
    name: "gated",
    description: "gated",
    parameters: objectSchema,
    approval: {request: () => ({prompt: "approve"})},
    execute: () => ({content: "approved run"}),
});

const harness = new NeuroAgentHarness({
    store: new JsonlSessionStore<JsonObject>({directory}),
    profiles: new ProfileRegistry().add(defineProfile({
        manifest: {key: "waiting-worker", name: "waiting-worker"},
        initial: objectSchema,
        payload: objectSchema,
        prepare: () => ({systemPrompt: "waiting-worker", modelConfig: {}, tools: [gatedTool]}),
    })),
    model: new ScriptedModelRuntime([{
        message: {
            role: "assistant" as const,
            content: [{type: "toolCall" as const, call: {id: "call-1", name: "gated", arguments: {}}}],
            timestamp: 1,
        },
    }]),
});
const created = await harness.createSession({profileKey: "waiting-worker", initial: {}, hostContext: {}});
const handle = await harness.invoke({sessionId: created.session.metadata.sessionId, payload: {}});
const result = await handle.result();
if (result.status !== "waiting") {
    throw new Error(`worker 未进入 waiting：${result.status}`);
}
console.log(JSON.stringify({
    status: "worker-waiting",
    sessionId: created.session.metadata.sessionId,
    invocationId: result.invocationId,
    toolCallId: result.pendingApprovals?.[0]?.toolCallId,
}));
await harness.dispose();
