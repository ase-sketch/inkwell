import {describe, expect, test} from "bun:test";
import {
    NeuroAgentHarness,
    ProfileRegistry,
    defineProfile,
    defineSchema,
    defineTool,
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

// 第八十八轮：悬挂 Tool Call 的启动闭合 admission（对照 NeuroBook
// assertNoUnclosedToolCallsForModel）。assistant 消息在 Tool 执行前提交，
// forced abort / Store 失败会留下「有 call 无 result」的 durable transcript；
// 全新 Invocation（invoke/retry/follow-up 启动）不得把悬挂 call 喂给 provider。
describe("closed Tool Call start admission", () => {
    async function danglingSession() {
        let markStarted!: () => void;
        const started = new Promise<void>((resolve) => {
            markStarted = resolve;
        });
        const hanging = defineTool({
            name: "hanging",
            description: "hanging",
            parameters: objectSchema,
            async execute() {
                markStarted();
                return new Promise<never>(() => {});
            },
        });
        const harness = new NeuroAgentHarness({
            abortGraceMs: 20,
            store: new MemorySessionStore(),
            profiles: new ProfileRegistry().add(defineProfile({
                manifest: {key: "closed-call", name: "Closed Call"},
                initial: objectSchema,
                payload: objectSchema,
                prepare: () => ({systemPrompt: "closed", modelConfig: {}, tools: [hanging]}),
            })),
            model: new ScriptedModelRuntime([toolCallMessage("hanging-1", "hanging")]),
        });
        const created = await harness.createSession({
            profileKey: "closed-call",
            initial: {},
            hostContext: {},
        });
        const sessionId = created.session.metadata.sessionId;
        const handle = await harness.invoke({sessionId, payload: {}});
        await started;
        handle.abort();
        const result = await handle.result();
        expect(result.status).toBe("aborted");
        const snapshot = await harness.snapshot(sessionId);
        const messages = snapshot.session.entries
            .filter((entry) => entry.kind === "agent.message")
            .map((entry) => JSON.stringify(entry.payload));
        // durable 前置条件自文档化：assistant toolCall 已落盘（悬挂），
        // 且没有任何 toolResult 闭合它。
        expect(messages.some((payload) => payload.includes('"role":"assistant"')
            && payload.includes('"toolCall"')
            && payload.includes('"hanging-1"'))).toBe(true);
        expect(messages.some((payload) => payload.includes('"role":"toolResult"'))).toBe(false);
        return {harness, sessionId, invocationId: handle.invocationId};
    }

    test("forced abort 留下的悬挂 Tool Call 使 retry 显式失败", async () => {
        const {harness, sessionId, invocationId} = await danglingSession();
        await expect(harness.retry(sessionId, invocationId))
            .rejects.toThrow(/存在未完成 Tool Call，不能启动新 Invocation/);
        await harness.dispose();
    });

    test("forced abort 留下的悬挂 Tool Call 使新 invoke 显式失败", async () => {
        const {harness, sessionId} = await danglingSession();
        await expect(harness.invoke({sessionId, payload: {}}))
            .rejects.toThrow(/存在未完成 Tool Call，不能启动新 Invocation/);
        await harness.dispose();
    });

    test("干净 transcript 的新 Invocation 不受影响", async () => {
        const harness = new NeuroAgentHarness({
            store: new MemorySessionStore(),
            profiles: new ProfileRegistry().add(defineProfile({
                manifest: {key: "clean-call", name: "Clean Call"},
                initial: objectSchema,
                payload: objectSchema,
                prepare: () => ({systemPrompt: "clean", modelConfig: {}}),
            })),
            model: new ScriptedModelRuntime([
                {message: {
                    role: "assistant",
                    content: [{type: "text", text: "done"}],
                    timestamp: 1,
                }},
                {message: {
                    role: "assistant",
                    content: [{type: "text", text: "done again"}],
                    timestamp: 2,
                }},
            ]),
        });
        const created = await harness.createSession({
            profileKey: "clean-call",
            initial: {},
            hostContext: {},
        });
        const sessionId = created.session.metadata.sessionId;
        await (await harness.invoke({sessionId, payload: {}})).result();
        const second = await harness.invoke({sessionId, payload: {second: true}});
        expect((await second.result()).status).toBe("completed");
        await harness.dispose();
    });

});
