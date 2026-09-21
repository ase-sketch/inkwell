import {describe, expect, test} from "bun:test";
import {
    NeuroAgentHarness,
    ProfileRegistry,
    SessionEventHub,
    defineProfile,
    defineSchema,
    type EventSubscription,
    type HarnessRuntimeEvent,
    type JsonObject,
    type SessionCommitResult,
    type SessionWritePlan,
} from "../src/index.js";
import {MemorySessionStore} from "../src/storage/memory.js";
import {ScriptedModelRuntime} from "../src/testing/index.js";

const objectSchema = defineSchema<JsonObject>((value) => {
    if (value === null || typeof value !== "object" || Array.isArray(value)) {
        throw new Error("必须是 object");
    }
    return value;
});

class FailingTerminalStore extends MemorySessionStore<number, JsonObject> {
    override async commit(plan: SessionWritePlan<number, JsonObject>): Promise<SessionCommitResult<number, JsonObject>> {
        if (plan.cause === "harness.invocation.finish") {
            throw new Error("terminal store unavailable");
        }
        return super.commit(plan);
    }
}

async function drainRuntimeEvents(subscription: EventSubscription<number>): Promise<HarnessRuntimeEvent[]> {
    await subscription.close();
    const events: HarnessRuntimeEvent[] = [];
    for await (const event of subscription) {
        if (event.kind === "runtime") {
            events.push(event.event);
        }
    }
    return events;
}

function turnBoundaries(events: readonly HarnessRuntimeEvent[]): string[] {
    return events.flatMap((event) => {
        if (event.type === "turn_start") return [`turn_start:${event.turn}`];
        if (event.type === "turn_end") return [`turn_end:${event.turn}:${event.status}`];
        if (event.type === "agent_end") return [`agent_end:${event.status}`];
        return [];
    });
}

describe("failed turn runtime event boundary", () => {
    test("Model 抛错时先闭合 started turn，再发布 failed Invocation terminal", async () => {
        const profile = defineProfile({
            manifest: {key: "model-failure", name: "Model Failure"},
            initial: objectSchema,
            payload: objectSchema,
            prepare: () => ({systemPrompt: "fail", modelConfig: {}}),
        });
        const eventHub = new SessionEventHub<number>({eventEpoch: "model-failure"});
        const harness = new NeuroAgentHarness({
            store: new MemorySessionStore(),
            profiles: new ProfileRegistry().add(profile),
            model: new ScriptedModelRuntime([new Error("provider unavailable")]),
            events: eventHub,
        });
        const created = await harness.createSession({profileKey: "model-failure", initial: {}, hostContext: {}});
        const subscription = harness.subscribe(created.session.metadata.sessionId, created.cursor);

        const result = await (await harness.invoke({
            sessionId: created.session.metadata.sessionId,
            payload: {},
        })).result();
        const events = await drainRuntimeEvents(subscription);

        expect(result.status).toBe("failed");
        expect(turnBoundaries(events)).toEqual([
            "turn_start:1",
            "turn_end:1:failed",
            "agent_end:failed",
        ]);
    });

    test("Profile prepare 在首个 turn 前失败时不伪造 turn_end", async () => {
        const profile = defineProfile({
            manifest: {key: "prepare-failure", name: "Prepare Failure"},
            initial: objectSchema,
            payload: objectSchema,
            prepare: () => {
                throw new Error("prepare unavailable");
            },
        });
        const eventHub = new SessionEventHub<number>({eventEpoch: "prepare-failure"});
        const harness = new NeuroAgentHarness({
            store: new MemorySessionStore(),
            profiles: new ProfileRegistry().add(profile),
            model: new ScriptedModelRuntime([]),
            events: eventHub,
        });
        const created = await harness.createSession({profileKey: "prepare-failure", initial: {}, hostContext: {}});
        const subscription = harness.subscribe(created.session.metadata.sessionId, created.cursor);

        const result = await (await harness.invoke({
            sessionId: created.session.metadata.sessionId,
            payload: {},
        })).result();
        const events = await drainRuntimeEvents(subscription);

        expect(result.status).toBe("failed");
        expect(turnBoundaries(events)).toEqual(["agent_end:failed"]);
    });

    test("beforeTurn Hook 失败也闭合当前 turn，且不调用 Model", async () => {
        const profile = defineProfile({
            manifest: {key: "hook-failure", name: "Hook Failure"},
            initial: objectSchema,
            payload: objectSchema,
            hooks: [{
                name: "fail-before-turn",
                stage: "beforeTurn",
                run: () => {
                    throw new Error("hook unavailable");
                },
            }],
            prepare: () => ({systemPrompt: "hook", modelConfig: {}}),
        });
        const eventHub = new SessionEventHub<number>({eventEpoch: "hook-failure"});
        const model = new ScriptedModelRuntime([]);
        const harness = new NeuroAgentHarness({
            store: new MemorySessionStore(),
            profiles: new ProfileRegistry().add(profile),
            model,
            events: eventHub,
        });
        const created = await harness.createSession({profileKey: "hook-failure", initial: {}, hostContext: {}});
        const subscription = harness.subscribe(created.session.metadata.sessionId, created.cursor);

        const result = await (await harness.invoke({
            sessionId: created.session.metadata.sessionId,
            payload: {},
        })).result();
        const events = await drainRuntimeEvents(subscription);

        expect(result.status).toBe("failed");
        expect(model.requests).toHaveLength(0);
        expect(turnBoundaries(events)).toEqual([
            "turn_start:1",
            "turn_end:1:failed",
            "agent_end:failed",
        ]);
    });

    test("failed terminal commit 未确认时不伪造 agent_end", async () => {
        const profile = defineProfile({
            manifest: {key: "terminal-failure", name: "Terminal Failure"},
            initial: objectSchema,
            payload: objectSchema,
            prepare: () => ({systemPrompt: "terminal", modelConfig: {}}),
        });
        const eventHub = new SessionEventHub<number>({eventEpoch: "terminal-failure"});
        const harness = new NeuroAgentHarness({
            store: new FailingTerminalStore(),
            profiles: new ProfileRegistry().add(profile),
            model: new ScriptedModelRuntime([new Error("provider unavailable")]),
            events: eventHub,
        });
        const created = await harness.createSession({profileKey: "terminal-failure", initial: {}, hostContext: {}});
        const subscription = harness.subscribe(created.session.metadata.sessionId, created.cursor);

        const handle = await harness.invoke({
            sessionId: created.session.metadata.sessionId,
            payload: {},
        });
        const result = await handle.result();
        const events = await drainRuntimeEvents(subscription);
        const snapshot = await harness.snapshot(created.session.metadata.sessionId);

        expect(result.status).toBe("failed");
        expect(turnBoundaries(events)).toEqual([
            "turn_start:1",
            "turn_end:1:failed",
        ]);
        expect(snapshot.session.activeInvocationId).toBe(handle.invocationId);
        expect(snapshot.session.invocations[0]?.status).toBe("running");
    });

    test("settleRun 失败不把已 completed 的 turn 重写为 failed", async () => {
        const profile = defineProfile({
            manifest: {key: "settle-failure", name: "Settle Failure"},
            initial: objectSchema,
            payload: objectSchema,
            hooks: [{
                name: "fail-settlement",
                stage: "settleRun",
                run: () => {
                    throw new Error("settlement unavailable");
                },
            }],
            prepare: () => ({systemPrompt: "settle", modelConfig: {}}),
        });
        const eventHub = new SessionEventHub<number>({eventEpoch: "settle-failure"});
        const harness = new NeuroAgentHarness({
            store: new MemorySessionStore(),
            profiles: new ProfileRegistry().add(profile),
            model: new ScriptedModelRuntime([{
                message: {
                    role: "assistant",
                    content: [{type: "text", text: "turn completed"}],
                    timestamp: 1,
                },
            }]),
            events: eventHub,
        });
        const created = await harness.createSession({profileKey: "settle-failure", initial: {}, hostContext: {}});
        const subscription = harness.subscribe(created.session.metadata.sessionId, created.cursor);

        const result = await (await harness.invoke({
            sessionId: created.session.metadata.sessionId,
            payload: {},
        })).result();
        const events = await drainRuntimeEvents(subscription);

        expect(result.status).toBe("failed");
        expect(turnBoundaries(events)).toEqual([
            "turn_start:1",
            "turn_end:1:completed",
            "agent_end:failed",
        ]);
    });
});
