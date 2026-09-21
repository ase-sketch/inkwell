import {describe, expect, test} from "bun:test";
import {NeuroAgentHarness, ProfileRegistry, defineSchema, type JsonObject} from "../src/index.js";
import {MemorySessionStore} from "../src/storage/memory.js";
import {ScriptedModelRuntime} from "../src/testing/index.js";

const schema = defineSchema<JsonObject>((value) => {
    if (value === null || typeof value !== "object" || Array.isArray(value)) throw new Error("必须是 object");
    return value;
});

function registry(): ProfileRegistry {
    const profiles = new ProfileRegistry();
    profiles.define({manifest: {key: "coordination", name: "Coordination"}, initial: schema, payload: schema, prepare: () => ({systemPrompt: "x", modelConfig: {}, limits: {maxTurns: 4}})});
    return profiles;
}

describe("Invocation Coordinator", () => {
    test("steer 在当前 Invocation 的下一安全 turn 注入并持久化", async () => {
        let markStarted!: () => void;
        let release!: () => void;
        const started = new Promise<void>((resolve) => { markStarted = resolve; });
        const gate = new Promise<void>((resolve) => { release = resolve; });
        const model = new ScriptedModelRuntime([
            async () => {
                markStarted();
                await gate;
                return {message: {role: "assistant", content: [{type: "text", text: "initial final"}], timestamp: 1}};
            },
            (request) => {
                expect(JSON.stringify(request.messages)).toContain("user_steer");
                expect(JSON.stringify(request.messages)).toContain("change direction");
                return {message: {role: "assistant", content: [{type: "text", text: "steered final"}], timestamp: 2}};
            },
        ]);
        const harness = new NeuroAgentHarness({store: new MemorySessionStore(), profiles: registry(), model});
        const session = await harness.createSession({profileKey: "coordination", initial: {}, hostContext: {}});
        const handle = await harness.invoke({sessionId: session.session.metadata.sessionId, payload: {prompt: "start"}});
        await started;
        await harness.steer(session.session.metadata.sessionId, {prompt: "change direction"});
        release();
        const result = await handle.result();
        expect(result.output).toBe("steered final");
        const snapshot = await harness.snapshot(session.session.metadata.sessionId);
        expect(snapshot.session.invocations).toHaveLength(1);
        expect(snapshot.session.entries.some((entry) => JSON.stringify(entry.payload).includes("user_steer"))).toBe(true);
    });

    test("follow-up durable 入队，当前 Invocation 完成后自动启动新 Invocation", async () => {
        let markStarted!: () => void;
        let release!: () => void;
        const started = new Promise<void>((resolve) => { markStarted = resolve; });
        const gate = new Promise<void>((resolve) => { release = resolve; });
        const model = new ScriptedModelRuntime([
            async () => {
                markStarted();
                await gate;
                return {message: {role: "assistant", content: [{type: "text", text: "first complete"}], timestamp: 1}};
            },
            (request) => {
                expect(JSON.stringify(request.messages)).toContain("follow-up payload");
                return {message: {role: "assistant", content: [{type: "text", text: "follow-up complete"}], timestamp: 2}};
            },
        ]);
        const harness = new NeuroAgentHarness({store: new MemorySessionStore(), profiles: registry(), model});
        const session = await harness.createSession({profileKey: "coordination", initial: {}, hostContext: {}});
        const first = await harness.invoke({sessionId: session.session.metadata.sessionId, payload: {prompt: "first"}});
        await started;
        const queued = await harness.followUp(session.session.metadata.sessionId, {prompt: "follow-up payload"});
        expect(queued.kind).toBe("followUp");
        release();
        expect((await first.result()).status).toBe("completed");
        const snapshot = await waitForInvocations(harness, session.session.metadata.sessionId, 2);
        expect(snapshot.session.invocations[1]?.status).toBe("completed");
        expect(snapshot.session.entries.some((entry) => entry.kind === "harness.followUp.consumed")).toBe(true);
    });

    test("follow-up pause/cancel/reorder 控制面由 durable ledger 恢复", async () => {
        let markStarted!: () => void;
        let release!: () => void;
        const started = new Promise<void>((resolve) => { markStarted = resolve; });
        const gate = new Promise<void>((resolve) => { release = resolve; });
        const model = new ScriptedModelRuntime([
            async () => {
                markStarted();
                await gate;
                return {message: {role: "assistant", content: [{type: "text", text: "base"}], timestamp: 1}};
            },
            (request) => {
                expect(JSON.stringify(request.messages)).toContain("third");
                return {message: {role: "assistant", content: [{type: "text", text: "third done"}], timestamp: 2}};
            },
            (request) => {
                expect(JSON.stringify(request.messages)).toContain("second");
                return {message: {role: "assistant", content: [{type: "text", text: "second done"}], timestamp: 3}};
            },
        ]);
        const harness = new NeuroAgentHarness({store: new MemorySessionStore(), profiles: registry(), model});
        const session = await harness.createSession({profileKey: "coordination", initial: {}, hostContext: {}});
        const first = await harness.invoke({sessionId: session.session.metadata.sessionId, payload: {prompt: "base"}});
        await started;
        const one = await harness.followUp(session.session.metadata.sessionId, {prompt: "first"});
        const two = await harness.followUp(session.session.metadata.sessionId, {prompt: "second"});
        const three = await harness.followUp(session.session.metadata.sessionId, {prompt: "third"});
        await harness.pauseFollowUps(session.session.metadata.sessionId);
        release();
        await first.result();
        await new Promise((resolve) => setTimeout(resolve, 10));
        expect((await harness.followUpState(session.session.metadata.sessionId)).paused).toBe(true);
        expect((await harness.snapshot(session.session.metadata.sessionId)).session.invocations).toHaveLength(1);

        const reordered = await harness.reorderFollowUps(session.session.metadata.sessionId, [three.id, one.id, two.id]);
        expect(reordered.items.map((item) => item.id)).toEqual([three.id, one.id, two.id]);
        const cancelled = await harness.cancelFollowUp(session.session.metadata.sessionId, one.id);
        expect(cancelled.items.map((item) => item.id)).toEqual([three.id, two.id]);
        const resumed = await harness.resumeFollowUps(session.session.metadata.sessionId);
        expect(resumed).not.toBeNull();
        await resumed!.result();
        const snapshot = await waitForInvocations(harness, session.session.metadata.sessionId, 3);
        expect(snapshot.session.invocations).toHaveLength(3);
        expect((await harness.followUpState(session.session.metadata.sessionId)).items).toHaveLength(0);
    });
});

async function waitForInvocations(harness: NeuroAgentHarness, sessionId: number, count: number) {
    for (let attempt = 0; attempt < 50; attempt += 1) {
        const snapshot = await harness.snapshot(sessionId);
        if (snapshot.session.invocations.length >= count && snapshot.session.invocations.at(-1)?.status === "completed") return snapshot;
        await new Promise((resolve) => setTimeout(resolve, 5));
    }
    throw new Error("follow-up Invocation 未完成");
}
