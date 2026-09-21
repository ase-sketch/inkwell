import {describe, expect, test} from "bun:test";
import {
    NeuroAgentHarness,
    ProfileRegistry,
    defineProfile,
    defineSchema,
    defineTool,
    type HarnessEvent,
    type JsonObject,
} from "../src/index.js";
import {MemorySessionStore} from "../src/storage/memory.js";
import {ScriptedModelRuntime} from "../src/testing/index.js";

const objectSchema = defineSchema<JsonObject>((value) => {
    if (value === null || typeof value !== "object" || Array.isArray(value)) {
        throw new Error("必须是 object");
    }
    return value;
}, {type: "object"});

function completed(text: string, timestamp = 1) {
    return {
        message: {
            role: "assistant" as const,
            content: [{type: "text" as const, text}],
            timestamp,
        },
    };
}

function toolCallMessage(callId: string, toolName: string, timestamp = 1) {
    return {
        message: {
            role: "assistant" as const,
            content: [{type: "toolCall" as const, call: {id: callId, name: toolName, arguments: {}}}],
            timestamp,
        },
    };
}

// 事件发布点覆盖 smoke（第七十三轮）：富会话流程（审批门控 Tool）实际发布
// 的核心 runtime 事件类型集合；完整发布点清单见 docs/events-inventory.md。
describe("runtime 事件发布覆盖", () => {
    test("真实流程发布核心 runtime 事件类型", async () => {
        const gatedTool = defineTool({
            name: "gated",
            description: "gated",
            parameters: objectSchema,
            approval: {request: () => ({prompt: "approve"})},
            execute: () => ({content: "run"}),
        });
        const harness = new NeuroAgentHarness({
            store: new MemorySessionStore(),
            profiles: new ProfileRegistry().add(defineProfile({
                manifest: {key: "publisher-coverage", name: "publisher-coverage"},
                initial: objectSchema,
                payload: objectSchema,
                prepare: () => ({systemPrompt: "coverage", modelConfig: {}, tools: [gatedTool]}),
            })),
            model: new ScriptedModelRuntime([toolCallMessage("call-1", "gated"), completed("done")]),
        });
        const created = await harness.createSession({profileKey: "publisher-coverage", initial: {}, hostContext: {}});
        const sessionId = created.session.metadata.sessionId;
        const received: HarnessEvent<number>[] = [];
        const subscription = harness.subscribe(sessionId, {});
        const collector = (async () => {
            for await (const event of subscription) {
                received.push(event);
                if (event.kind === "runtime"
                    && event.event.type === "agent_end"
                    && event.event.status !== "waiting") {
                    break;
                }
            }
        })();
        const handle = await harness.invoke({sessionId, payload: {}});
        expect((await handle.result()).status).toBe("waiting");
        const resumed = await harness.resume(sessionId, handle.invocationId, [
            {toolCallId: "call-1", approved: true},
        ]);
        await (await resumed).result();
        await collector;
        await harness.dispose();

        const runtimeTypes = new Set(received
            .filter((event) => event.kind === "runtime")
            .map((event) => event.event.type));
        for (const expected of [
            "agent_start",
            "turn_start",
            "message_committed",
            "tool_execution_start",
            "tool_execution_end",
            "approval_required",
            "approval_resolved",
            "turn_end",
            "agent_end",
        ] as const) {
            expect(runtimeTypes.has(expected)).toBe(true);
        }
        expect(received.some((event) => event.kind === "session" && event.event.type === "session_entry"))
            .toBe(true);
        expect(received.some((event) => event.kind === "session" && event.event.type === "session_status"))
            .toBe(true);
    });
});
