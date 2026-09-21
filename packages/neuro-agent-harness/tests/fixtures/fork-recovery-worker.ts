import {
    NeuroAgentHarness,
    ProfileRegistry,
    defineProfile,
    defineSchema,
    type JsonObject,
} from "../../src/index.js";
import {JsonlSessionStore} from "../../src/storage/jsonl.js";
import {ScriptedModelRuntime} from "../../src/testing/index.js";

const [directory] = process.argv.slice(2);
if (!directory) {
    throw new Error("fork-recovery-worker 需要 directory 参数");
}

const objectSchema = defineSchema<JsonObject>((value) => {
    if (value === null || typeof value !== "object" || Array.isArray(value)) {
        throw new Error("必须是 object");
    }
    return value;
}, {type: "object"});

const harness = new NeuroAgentHarness({
    store: new JsonlSessionStore<JsonObject>({directory}),
    profiles: new ProfileRegistry().add(defineProfile({
        manifest: {key: "fork-worker", name: "fork-worker"},
        initial: objectSchema,
        payload: objectSchema,
        prepare: () => ({systemPrompt: "fork-worker", modelConfig: {}}),
    })),
    model: new ScriptedModelRuntime([{
        message: {
            role: "assistant" as const,
            content: [{type: "text" as const, text: "worker done"}],
            timestamp: 1,
        },
    }]),
});
const created = await harness.createSession({profileKey: "fork-worker", initial: {}, hostContext: {}});
const result = await (await harness.invoke({sessionId: created.session.metadata.sessionId, payload: {}})).result();
console.log(JSON.stringify({
    status: "worker-done",
    sessionId: created.session.metadata.sessionId,
    invocationId: result.invocationId,
    output: result.output,
}));
await harness.dispose();
