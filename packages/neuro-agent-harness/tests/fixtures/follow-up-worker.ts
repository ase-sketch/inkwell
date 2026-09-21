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
    throw new Error("follow-up-worker 需要 directory 参数");
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
        manifest: {key: "follow-up-worker", name: "follow-up-worker"},
        initial: objectSchema,
        payload: objectSchema,
        prepare: () => ({systemPrompt: "follow-up-worker", modelConfig: {}, tools: [gatedTool]}),
    })),
    model: new ScriptedModelRuntime([{
        message: {
            role: "assistant",
            content: [{type: "toolCall", call: {id: "call-1", name: "gated", arguments: {}}}],
            timestamp: 1,
        },
    }]),
});
const created = await harness.createSession({profileKey: "follow-up-worker", initial: {}, hostContext: {}});
const sessionId = created.session.metadata.sessionId;
const handle = await harness.invoke({sessionId, payload: {}});
const result = await handle.result();
if (result.status !== "waiting") {
    throw new Error(`worker 未进入 waiting：${result.status}`);
}
// waiting 期间由本进程（worker）写入 durable follow-up 队列。
const queued = await harness.followUp(sessionId, {text: "cross-process follow-up"}, {
    caller: {kind: "system", name: "worker"},
});
console.log(JSON.stringify({
    status: "worker-waiting-followup",
    sessionId,
    invocationId: result.invocationId,
    toolCallId: result.pendingApprovals?.[0]?.toolCallId,
    followUpId: queued.id,
}));
await harness.dispose();
