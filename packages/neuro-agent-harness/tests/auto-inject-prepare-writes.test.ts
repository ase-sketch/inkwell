import {describe, expect, test} from "bun:test";
import {
    NeuroAgentHarness,
    ProfileRegistry,
    createAgentMessageEntryDraft,
    defineProfile,
    defineSchema,
    defineTool,
    type AgentMessage,
    type JsonObject,
    type JsonValue,
} from "../src/index.js";
import {MemorySessionStore} from "../src/storage/memory.js";
import {ScriptedModelRuntime} from "../src/testing/index.js";

const objectSchema = defineSchema<JsonObject>((value) => {
    if (value === null || typeof value !== "object" || Array.isArray(value)) {
        throw new Error("必须是 object");
    }
    return value;
});

function user(content: string, timestamp: number): Extract<AgentMessage, {role: "user"}> {
    return {role: "user", content, timestamp};
}

function assistant(content: string, timestamp: number): Extract<AgentMessage, {role: "assistant"}> {
    return {role: "assistant", content: [{type: "text", text: content}], timestamp};
}

function textCount(messages: readonly AgentMessage[], text: string): number {
    return JSON.stringify(messages).split(text).length - 1;
}

// 第一百零三轮（ADR-0039）：prepareWrites 自动注入的范围钉住。
describe("prepareWrites 自动注入范围", () => {
    test("agent.message 注入同轮请求，custom 事实不注入", async () => {
        const profile = defineProfile({
            manifest: {key: "auto-inject-mix", name: "Auto Inject Mix"},
            initial: objectSchema,
            payload: objectSchema,
            prepare: (context) => {
                return {
                    systemPrompt: "inject",
                    modelConfig: {},
                    prepareWrites: [{
                        target: context.sessionId,
                        expectedVersion: context.snapshot.version,
                        cause: "test.auto-inject.mix",
                        operations: [{
                            type: "appendEntries",
                            entries: [
                                {kind: "test.custom-fact", payload: {marker: "custom-marker"}},
                                createAgentMessageEntryDraft(user("injected-message", 10), {
                                    turn: 0,
                                    invocationId: context.invocationId,
                                }),
                            ],
                        }],
                    }],
                };
            },
        });
        const model = new ScriptedModelRuntime<JsonValue>([{message: assistant("done", 100)}]);
        const harness = new NeuroAgentHarness({
            store: new MemorySessionStore(),
            profiles: new ProfileRegistry().add(profile),
            model,
        });
        const created = await harness.createSession({profileKey: "auto-inject-mix", initial: {}, hostContext: {}});
        const result = await (await harness.invoke({sessionId: created.session.metadata.sessionId, payload: {}})).result();

        expect(result.status).toBe("completed");
        const request = model.requests[0]!.messages;
        expect(textCount(request, "injected-message")).toBe(1);
        expect(textCount(request, "custom-marker")).toBe(0);
        const snapshot = await harness.snapshot(created.session.metadata.sessionId);
        expect(snapshot.session.entries.some((entry) => entry.kind === "test.custom-fact")).toBe(true);
        await harness.dispose();
    });

    test("Tool writePlans 同轮不注入，下一 Invocation 可见（维持第九十一轮合同）", async () => {
        const writer = defineTool({
            name: "writer",
            description: "Writes a durable message.",
            parameters: objectSchema,
            execute(_arguments, context) {
                return {
                    content: "written",
                    writePlans: [{
                        target: context.sessionId,
                        expectedVersion: context.snapshot.version,
                        cause: "test.auto-inject.tool",
                        operations: [{
                            type: "appendEntries",
                            entries: [createAgentMessageEntryDraft(user("tool-written", 20), {
                                turn: context.turn,
                                invocationId: context.invocationId,
                            })],
                        }],
                    }],
                };
            },
        });
        const profile = defineProfile({
            manifest: {key: "auto-inject-tool", name: "Auto Inject Tool"},
            initial: objectSchema,
            payload: objectSchema,
            prepare: () => ({systemPrompt: "inject", modelConfig: {}, tools: [writer]}),
        });
        const model = new ScriptedModelRuntime<JsonValue>([
            {
                message: {
                    role: "assistant",
                    content: [{type: "toolCall", call: {id: "w-1", name: "writer", arguments: {}}}],
                    timestamp: 1,
                },
            },
            {message: assistant("first done", 100)},
            {message: assistant("second done", 200)},
        ]);
        const harness = new NeuroAgentHarness({
            store: new MemorySessionStore(),
            profiles: new ProfileRegistry().add(profile),
            model,
        });
        const created = await harness.createSession({profileKey: "auto-inject-tool", initial: {}, hostContext: {}});
        const sessionId = created.session.metadata.sessionId;
        const first = await harness.invoke({sessionId, payload: {first: true}});
        await first.result();

        // 同 Invocation 的第二轮模型请求不包含 Tool 刚写入的消息。
        expect(textCount(model.requests[1]!.messages, "tool-written")).toBe(0);
        const second = await harness.invoke({sessionId, payload: {second: true}});
        await second.result();
        // 下一 Invocation 从 transcript 重建后可见。
        expect(textCount(model.requests[2]!.messages, "tool-written")).toBe(1);
        await harness.dispose();
    });
});
