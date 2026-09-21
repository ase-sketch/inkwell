import {describe, expect, test} from "bun:test";
import {NeuroAgentHarness, ProfileRegistry, defineProfile, defineSchema, type JsonObject} from "../src/index.js";
import {MemorySessionStore} from "../src/storage/memory.js";
import {ScriptedModelRuntime} from "../src/testing/index.js";

const schema = defineSchema<JsonObject>((value) => {
    if (value === null || typeof value !== "object" || Array.isArray(value)) throw new Error("必须是 object");
    return value;
});

describe("ProfileRegistry", () => {
    test("宿主 watcher 可替换 Profile，后续 Invocation 使用新版本", async () => {
        const registry = new ProfileRegistry();
        registry.define({
            manifest: {key: "hot", name: "Hot", version: 1},
            initial: schema,
            payload: schema,
            prepare: () => ({systemPrompt: "version-1", modelConfig: {}}),
        });
        const model = new ScriptedModelRuntime([
            (request) => {
                expect(request.systemPrompt).toBe("version-1");
                return {message: {role: "assistant", content: [{type: "text", text: "v1"}], timestamp: 1}};
            },
            (request) => {
                expect(request.systemPrompt).toBe("version-2");
                return {message: {role: "assistant", content: [{type: "text", text: "v2"}], timestamp: 2}};
            },
        ]);
        const harness = new NeuroAgentHarness({store: new MemorySessionStore(), profiles: registry, model});
        const session = await harness.createSession({profileKey: "hot", initial: {}, hostContext: {}});
        expect((await (await harness.invoke({sessionId: session.session.metadata.sessionId, payload: {}})).result()).output).toBe("v1");

        registry.replace(defineProfile({
            manifest: {key: "hot", name: "Hot", version: 2},
            initial: schema,
            payload: schema,
            prepare: () => ({systemPrompt: "version-2", modelConfig: {}}),
        }));
        expect((await (await harness.invoke({sessionId: session.session.metadata.sessionId, payload: {}})).result()).output).toBe("v2");
    });
});
