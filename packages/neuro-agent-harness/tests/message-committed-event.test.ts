import {describe, expect, test} from "bun:test";
import {
    NeuroAgentHarness,
    ProfileRegistry,
    createAgentMessageEntryDraft,
    defineProfile,
    defineSchema,
    defineTool,
    type HarnessEvent,
    type JsonObject,
    type SessionId,
} from "../src/index.js";
import {MemorySessionStore} from "../src/storage/memory.js";
import {ScriptedModelRuntime} from "../src/testing/index.js";

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

function committedEvents(events: HarnessEvent<number>[]) {
    return events.filter((event) => {
        return event.kind === "runtime" && event.event.type === "message_committed";
    }).map((event) => event.event.type === "message_committed" ? event.event : undefined);
}

async function collectUntilTerminal<TSessionId extends SessionId>(
    harness: NeuroAgentHarness<TSessionId, JsonObject>,
    sessionId: TSessionId,
): Promise<HarnessEvent<TSessionId>[]> {
    const received: HarnessEvent<TSessionId>[] = [];
    const subscription = harness.subscribe(sessionId, {});
    const collector = (async () => {
        for await (const event of subscription) {
            received.push(event);
            if (event.kind === "runtime" && event.event.type === "agent_end") {
                break;
            }
        }
    })();
    await collector;
    return received;
}

describe("message_committed runtime event", () => {
    test("正常运行按序发布 user（turn 0）与 assistant（turn N）消息", async () => {
        const harness = new NeuroAgentHarness({
            store: new MemorySessionStore(),
            profiles: new ProfileRegistry().add(profile("committed-basic")),
            model: new ScriptedModelRuntime([completed("hi")]),
        });
        const created = await harness.createSession({profileKey: "committed-basic", initial: {}, hostContext: {}});
        const sessionId = created.session.metadata.sessionId;
        const eventsPromise = collectUntilTerminal(harness, sessionId);
        await (await harness.invoke({sessionId, payload: {}})).result();
        const events = await eventsPromise;

        const committed = committedEvents(events);
        expect(committed).toHaveLength(2);
        expect(committed[0]).toMatchObject({turn: 0, message: {role: "user", content: "{}"}});
        expect(committed[1]).toMatchObject({
            turn: 1,
            message: {role: "assistant", content: [{type: "text", text: "hi"}]},
        });
        const indexOf = (predicate: (event: HarnessEvent<number>) => boolean) => events.findIndex(predicate);
        const turnStart = indexOf((event) => event.kind === "runtime" && event.event.type === "turn_start" && event.event.turn === 1);
        const assistantCommitted = indexOf((event) => {
            return event.kind === "runtime"
                && event.event.type === "message_committed"
                && event.event.message.role === "assistant";
        });
        const turnEnd = indexOf((event) => event.kind === "runtime" && event.event.type === "turn_end" && event.event.turn === 1);
        expect(turnStart).toBeGreaterThanOrEqual(0);
        expect(assistantCommitted).toBeGreaterThan(turnStart);
        expect(turnEnd).toBeGreaterThan(assistantCommitted);
        await harness.dispose();
    });

    test("message_committed 在 durable commit 之后发布", async () => {
        const harness = new NeuroAgentHarness({
            store: new MemorySessionStore(),
            profiles: new ProfileRegistry().add(profile("committed-durable")),
            model: new ScriptedModelRuntime([completed("durable")]),
        });
        const created = await harness.createSession({profileKey: "committed-durable", initial: {}, hostContext: {}});
        const sessionId = created.session.metadata.sessionId;
        const checks: Promise<void>[] = [];
        const subscription = harness.subscribe(sessionId, {});
        const collector = (async () => {
            for await (const event of subscription) {
                if (event.kind === "runtime" && event.event.type === "message_committed") {
                    const committedMessage = event.event.message;
                    checks.push((async () => {
                        const snapshot = await harness.snapshot(sessionId);
                        const expected = JSON.stringify(committedMessage);
                        expect(snapshot.session.entries.some((entry) => {
                            return entry.kind === "agent.message"
                                && JSON.stringify((entry.payload as {message?: unknown}).message) === expected;
                        })).toBe(true);
                    })());
                }
                if (event.kind === "runtime" && event.event.type === "agent_end") {
                    break;
                }
            }
        })();
        await (await harness.invoke({sessionId, payload: {}})).result();
        await collector;
        await Promise.all(checks);
        expect(checks.length).toBeGreaterThanOrEqual(1);
        await harness.dispose();
    });

    test("宿主 write 的非消息条目不发布 message_committed", async () => {
        const harness = new NeuroAgentHarness({
            store: new MemorySessionStore(),
            profiles: new ProfileRegistry().add(profile("committed-host")),
            model: new ScriptedModelRuntime([completed("done")]),
        });
        const created = await harness.createSession({profileKey: "committed-host", initial: {}, hostContext: {}});
        const sessionId = created.session.metadata.sessionId;
        const eventsPromise = collectUntilTerminal(harness, sessionId);
        await (await harness.invoke({sessionId, payload: {}})).result();
        await harness.write({
            target: sessionId,
            cause: "test.host-entry",
            operations: [{
                type: "appendEntries",
                entries: [{kind: "host.custom", payload: {note: "not a message"}}],
            }],
        });
        const events = await eventsPromise;
        expect(committedEvents(events)).toHaveLength(2);
        expect(events.some((event) => event.kind === "session" && event.event.type === "session_entry")).toBe(true);
        await harness.dispose();
    });

    test("宿主 write 的 agent.message 条目不发布 message_committed（仅 Harness 发起的提交发布）", async () => {
        const harness = new NeuroAgentHarness({
            store: new MemorySessionStore(),
            profiles: new ProfileRegistry().add(profile("committed-host-message")),
            model: new ScriptedModelRuntime([completed("done")]),
        });
        const created = await harness.createSession({profileKey: "committed-host-message", initial: {}, hostContext: {}});
        const sessionId = created.session.metadata.sessionId;
        const eventsPromise = collectUntilTerminal(harness, sessionId);
        await (await harness.invoke({sessionId, payload: {}})).result();
        const eventsBeforeHostWrite = await eventsPromise;
        expect(committedEvents(eventsBeforeHostWrite)).toHaveLength(2);

        const cursorBeforeWrite = (await harness.snapshot(sessionId)).cursor;
        await harness.write({
            target: sessionId,
            cause: "test.host-message",
            operations: [{
                type: "appendEntries",
                entries: [createAgentMessageEntryDraft(
                    {role: "user", content: "host-injected", timestamp: 9},
                    {turn: 2},
                )],
            }],
        });
        const afterWrite = await harness.snapshot(sessionId);
        expect(afterWrite.session.entries.some((entry) => {
            return entry.kind === "agent.message"
                && JSON.stringify((entry.payload as {message?: unknown}).message) === JSON.stringify({
                    role: "user",
                    content: "host-injected",
                    timestamp: 9,
                });
        })).toBe(true);
        // 宿主写入的消息只经 session_entry 投递，不发布 message_committed。
        const subscription = harness.subscribe(sessionId, cursorBeforeWrite);
        const next = await subscription.next();
        expect(next.done).toBe(false);
        expect(next.value?.kind).toBe("session");
        expect(next.value && next.value.kind === "runtime" && next.value.event.type === "message_committed")
            .toBe(false);
        await subscription.close();
        await harness.dispose();
    });

    test("sequential Tool 结果发布 toolResult 角色消息", async () => {
        const echoTool = defineTool({
            name: "echo",
            description: "echo",
            parameters: objectSchema,
            execute: () => ({content: "echoed"}),
        });
        const harness = new NeuroAgentHarness({
            store: new MemorySessionStore(),
            profiles: new ProfileRegistry().add(defineProfile({
                manifest: {key: "committed-tool", name: "committed-tool"},
                initial: objectSchema,
                payload: objectSchema,
                prepare: () => ({systemPrompt: "committed-tool", modelConfig: {}, tools: [echoTool]}),
            })),
            model: new ScriptedModelRuntime([toolCallMessage("call-1", "echo"), completed("done")]),
        });
        const created = await harness.createSession({profileKey: "committed-tool", initial: {}, hostContext: {}});
        const sessionId = created.session.metadata.sessionId;
        const eventsPromise = collectUntilTerminal(harness, sessionId);
        await (await harness.invoke({sessionId, payload: {}})).result();
        const events = await eventsPromise;
        const committed = committedEvents(events);
        const toolCommitted = committed.find((event) => event?.message.role === "toolResult");
        expect(toolCommitted).toMatchObject({
            turn: 1,
            message: {
                role: "toolResult",
                toolCallId: "call-1",
                toolName: "echo",
                content: "echoed",
            },
        });
        await harness.dispose();
    });

    test("approval resume 恢复的 Tool 结果也发布消息", async () => {
        const gatedTool = defineTool({
            name: "gated",
            description: "gated",
            parameters: objectSchema,
            approval: {request: () => ({prompt: "approve"})},
            execute: () => ({content: "approved run"}),
        });
        const harness = new NeuroAgentHarness({
            store: new MemorySessionStore(),
            profiles: new ProfileRegistry().add(defineProfile({
                manifest: {key: "committed-resume", name: "committed-resume"},
                initial: objectSchema,
                payload: objectSchema,
                prepare: () => ({systemPrompt: "committed-resume", modelConfig: {}, tools: [gatedTool]}),
            })),
            model: new ScriptedModelRuntime([toolCallMessage("approval-1", "gated"), completed("after approval")]),
        });
        const created = await harness.createSession({profileKey: "committed-resume", initial: {}, hostContext: {}});
        const sessionId = created.session.metadata.sessionId;
        const subscription = harness.subscribe(sessionId, {});
        const received: HarnessEvent<number>[] = [];
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
            {toolCallId: "approval-1", approved: true},
        ]);
        await (await resumed).result();
        await collector;
        const committed = committedEvents(received);
        expect(committed.some((event) => event?.message.role === "toolResult" && event.message.content === "approved run"))
            .toBe(true);
        await harness.dispose();
    });
});
