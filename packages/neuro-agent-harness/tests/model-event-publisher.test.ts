import {describe, expect, test} from "bun:test";
import {
    NeuroAgentHarness,
    ProfileRegistry,
    defineProfile,
    defineSchema,
    type HarnessEvent,
    type JsonObject,
    type ModelRuntime,
} from "../src/index.js";
import {MemorySessionStore} from "../src/storage/memory.js";

const objectSchema = defineSchema<JsonObject>((value) => {
    if (value === null || typeof value !== "object" || Array.isArray(value)) {
        throw new Error("必须是 object");
    }
    return value;
}, {type: "object"});

function profile(key: string) {
    return defineProfile({
        manifest: {key, name: key},
        initial: objectSchema,
        payload: objectSchema,
        prepare: () => ({systemPrompt: key, modelConfig: {}}),
    });
}

// 第八十二轮：第 73 轮审计明示的覆盖缺口——model_event 发布路径此前只有
// 代码引用审计，无运行时 smoke。真实 Adapter 在 runTurn 内通过 request.onEvent
// 转发 provider 流式事件，Harness 应发布 model_event。
describe("model_event 发布路径", () => {
    test("runTurn 的 onEvent 逐条转发为 model_event，且不进入 durable transcript", async () => {
        const model: ModelRuntime = {
            runTurn: async (request) => {
                request.onEvent?.({type: "message_start"});
                request.onEvent?.({type: "text_delta", delta: "hel"});
                request.onEvent?.({type: "thinking_delta", delta: "hmm"});
                request.onEvent?.({type: "text_delta", delta: "lo"});
                const message = {
                    role: "assistant" as const,
                    content: [{type: "text" as const, text: "hello"}],
                    timestamp: 1,
                };
                request.onEvent?.({type: "message_end", message});
                return {message};
            },
        };
        const harness = new NeuroAgentHarness({
            store: new MemorySessionStore(),
            profiles: new ProfileRegistry().add(profile("model-event")),
            model,
        });
        const created = await harness.createSession({profileKey: "model-event", initial: {}, hostContext: {}});
        const sessionId = created.session.metadata.sessionId;
        const received: HarnessEvent<number>[] = [];
        const subscription = harness.subscribe(sessionId, {});
        const collector = (async () => {
            for await (const event of subscription) {
                received.push(event);
                if (event.kind === "runtime" && event.event.type === "agent_end") {
                    break;
                }
            }
        })();
        await (await harness.invoke({sessionId, payload: {}})).result();
        await collector;

        const modelEvents = received.filter((event) => {
            return event.kind === "runtime" && event.event.type === "model_event";
        });
        expect(modelEvents).toHaveLength(5);
        expect(modelEvents.map((event) => event.event.type === "model_event" ? event.event.event.type : undefined))
            .toEqual(["message_start", "text_delta", "thinking_delta", "text_delta", "message_end"]);
        expect(modelEvents.every((event) => {
            return event.event.type === "model_event" && event.event.turn === 1;
        })).toBe(true);
        expect(modelEvents[1]).toMatchObject({event: {event: {type: "text_delta", delta: "hel"}}});
        expect(modelEvents[2]).toMatchObject({event: {event: {type: "thinking_delta", delta: "hmm"}}});
        expect(modelEvents[3]).toMatchObject({event: {event: {type: "text_delta", delta: "lo"}}});
        expect(modelEvents[4]).toMatchObject({
            event: {event: {type: "message_end", message: {role: "assistant"}}},
        });

        // 流式事件先于同 turn 的 message_committed；不进入 durable entries。
        const committedIndex = received.findIndex((event) => {
            return event.kind === "runtime"
                && event.event.type === "message_committed"
                && event.event.message.role === "assistant";
        });
        const lastModelEventIndex = received.findLastIndex((event) => {
            return event.kind === "runtime" && event.event.type === "model_event";
        });
        expect(lastModelEventIndex).toBeGreaterThanOrEqual(0);
        expect(committedIndex).toBeGreaterThan(lastModelEventIndex);

        const snapshot = await harness.snapshot(sessionId);
        expect(snapshot.session.entries.length).toBeGreaterThanOrEqual(2);
        expect(snapshot.session.entries.some((entry) => {
            return entry.kind === "agent.message"
                && JSON.stringify((entry.payload as {message?: unknown}).message).includes("hello");
        })).toBe(true);
        expect(snapshot.session.entries.every((entry) => entry.kind === "agent.message")).toBe(true);
        await harness.dispose();
    });

    test("tool_call_delta 流式事件精确转发（五种 ModelRuntimeEvent 全覆盖）", async () => {
        const model: ModelRuntime = {
            runTurn: async (request) => {
                request.onEvent?.({type: "message_start"});
                request.onEvent?.({
                    type: "tool_call_delta",
                    toolCallId: "call-1",
                    toolName: "calc",
                    arguments: {a: 1},
                });
                const message = {
                    role: "assistant" as const,
                    content: [{type: "text" as const, text: "done"}],
                    timestamp: 1,
                };
                request.onEvent?.({type: "message_end", message});
                return {message};
            },
        };
        const harness = new NeuroAgentHarness({
            store: new MemorySessionStore(),
            profiles: new ProfileRegistry().add(profile("model-event-tool")),
            model,
        });
        const created = await harness.createSession({profileKey: "model-event-tool", initial: {}, hostContext: {}});
        const sessionId = created.session.metadata.sessionId;
        const received: HarnessEvent<number>[] = [];
        const subscription = harness.subscribe(sessionId, {});
        const collector = (async () => {
            for await (const event of subscription) {
                received.push(event);
                if (event.kind === "runtime" && event.event.type === "agent_end") {
                    break;
                }
            }
        })();
        await (await harness.invoke({sessionId, payload: {}})).result();
        await collector;
        await harness.dispose();

        const modelEvents = received.filter((event) => {
            return event.kind === "runtime" && event.event.type === "model_event";
        });
        expect(modelEvents).toHaveLength(3);
        expect(modelEvents.map((event) => event.event.type === "model_event" ? event.event.event.type : undefined))
            .toEqual(["message_start", "tool_call_delta", "message_end"]);
        expect(modelEvents[1]).toMatchObject({
            event: {
                event: {
                    type: "tool_call_delta",
                    toolCallId: "call-1",
                    toolName: "calc",
                    arguments: {a: 1},
                },
            },
        });
    });
});
