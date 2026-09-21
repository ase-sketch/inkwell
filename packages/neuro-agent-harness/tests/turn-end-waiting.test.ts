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

function toolCallMessage(callId: string, toolName: string, timestamp = 1) {
    return {
        message: {
            role: "assistant" as const,
            content: [{type: "toolCall" as const, call: {id: callId, name: toolName, arguments: {}}}],
            timestamp,
        },
    };
}

function completed(text: string, timestamp = 2) {
    return {
        message: {
            role: "assistant" as const,
            content: [{type: "text" as const, text}],
            timestamp,
        },
    };
}

// 第九十二轮：进入 approval waiting 的 turn 以 turn_end(waiting) 闭合
// （此前标 completed，与「工具待批、turn 未完成」语义不符，对齐 NeuroBook
// dto 的 turn_end status 含 waiting）；resume 后从下一 turn 继续。
describe("turn_end waiting 语义", () => {
    test("waiting 轮发布 turn_end(waiting)，resume 后新 turn 以 completed 闭合", async () => {
        const gated = defineTool({
            name: "gated",
            description: "gated",
            parameters: objectSchema,
            approval: {request: () => ({prompt: "approve"})},
            execute: () => ({content: "run"}),
        });
        const harness = new NeuroAgentHarness({
            store: new MemorySessionStore(),
            profiles: new ProfileRegistry().add(defineProfile({
                manifest: {key: "turn-waiting", name: "Turn Waiting"},
                initial: objectSchema,
                payload: objectSchema,
                prepare: () => ({systemPrompt: "waiting", modelConfig: {}, tools: [gated]}),
            })),
            model: new ScriptedModelRuntime([
                toolCallMessage("call-1", "gated"),
                completed("done"),
            ]),
        });
        const created = await harness.createSession({
            profileKey: "turn-waiting",
            initial: {},
            hostContext: {},
        });
        const sessionId = created.session.metadata.sessionId;
        const received: HarnessEvent<number>[] = [];
        const subscription = harness.subscribe(sessionId, {});
        const collector = (async () => {
            for await (const event of subscription) {
                received.push(event);
                if (event.kind === "runtime"
                    && event.event.type === "agent_end"
                    && event.event.status === "completed") {
                    break;
                }
            }
        })();
        const handle = await harness.invoke({sessionId, payload: {}});
        expect((await handle.result()).status).toBe("waiting");
        const resumed = await harness.resume(sessionId, handle.invocationId, [
            {toolCallId: "call-1", approved: true},
        ]);
        expect((await resumed.result()).status).toBe("completed");
        await collector;
        await harness.dispose();

        const runtimeEvents = received
            .filter((event) => event.kind === "runtime")
            .map((event) => event.event);
        const turnEnds = runtimeEvents.filter((event) => event.type === "turn_end");
        expect(turnEnds).toHaveLength(2);
        expect(turnEnds[0]).toMatchObject({turn: 1, status: "waiting"});
        expect(turnEnds[1]).toMatchObject({turn: 2, status: "completed"});
        expect(runtimeEvents.filter((event) => event.type === "agent_end").map((event) => event.status))
            .toEqual(["waiting", "completed"]);
    });
});
