import {describe, expect, test} from "bun:test";
import {mkdtemp, rm} from "node:fs/promises";
import {join} from "node:path";
import {tmpdir} from "node:os";
import {
    FollowUpDrainTimeoutError,
    NeuroAgentHarness,
    ProfileRegistry,
    defineProfile,
    defineSchema,
    defineTool,
    type JsonObject,
} from "../src/index.js";
import {JsonlSessionStore} from "../src/storage/jsonl.js";
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

describe("waitForFollowUpQueueDrain", () => {
    test("follow-up 链全部完成后返回空队列", async () => {
        let release!: () => void;
        const gate = new Promise<void>((resolve) => {
            release = resolve;
        });
        const harness = new NeuroAgentHarness({
            store: new MemorySessionStore(),
            profiles: new ProfileRegistry().add(profile("drain-chain")),
            model: new ScriptedModelRuntime([
                async () => {
                    await gate;
                    return completed("main done");
                },
                completed("follow-up done"),
            ]),
        });
        const created = await harness.createSession({profileKey: "drain-chain", initial: {}, hostContext: {}});
        const sessionId = created.session.metadata.sessionId;
        const handle = await harness.invoke({sessionId, payload: {}});
        await harness.followUp(sessionId, {text: "chain"});
        const drainPromise = harness.waitForFollowUpQueueDrain(sessionId, {timeoutMs: 10_000});
        await new Promise<void>((resolve) => setTimeout(resolve, 50));
        release();
        const drained = await drainPromise;
        expect(drained.items).toHaveLength(0);
        expect(drained.paused).toBe(false);
        await handle.result();
        await harness.dispose();
    });

    test("暂停队列视为稳定态直接返回", async () => {
        let release!: () => void;
        const gate = new Promise<void>((resolve) => {
            release = resolve;
        });
        const harness = new NeuroAgentHarness({
            store: new MemorySessionStore(),
            profiles: new ProfileRegistry().add(profile("drain-paused")),
            model: new ScriptedModelRuntime([async () => {
                await gate;
                return completed("done");
            }]),
        });
        const created = await harness.createSession({profileKey: "drain-paused", initial: {}, hostContext: {}});
        const sessionId = created.session.metadata.sessionId;
        await harness.invoke({sessionId, payload: {}});
        await harness.followUp(sessionId, {text: "pending"});
        await harness.pauseFollowUps(sessionId);
        const state = await harness.waitForFollowUpQueueDrain(sessionId, {timeoutMs: 5_000});
        expect(state.paused).toBe(true);
        expect(state.items).toHaveLength(1);
        release();
        await harness.dispose();
    });

    test("waiting（审批待决）视为稳定态返回", async () => {
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
                manifest: {key: "drain-waiting", name: "drain-waiting"},
                initial: objectSchema,
                payload: objectSchema,
                prepare: () => ({systemPrompt: "drain-waiting", modelConfig: {}, tools: [gatedTool]}),
            })),
            model: new ScriptedModelRuntime([{
                message: {
                    role: "assistant",
                    content: [{type: "toolCall", call: {id: "call-1", name: "gated", arguments: {}}}],
                    timestamp: 1,
                },
            }]),
        });
        const created = await harness.createSession({profileKey: "drain-waiting", initial: {}, hostContext: {}});
        const sessionId = created.session.metadata.sessionId;
        const handle = await harness.invoke({sessionId, payload: {}});
        const state = await harness.waitForFollowUpQueueDrain(sessionId, {timeoutMs: 5_000});
        expect(state.items).toHaveLength(0);
        const snapshot = await harness.snapshot(sessionId);
        expect(snapshot.session.invocations[0]?.id).toBe(handle.invocationId);
        expect(snapshot.session.invocations[0]?.status).toBe("waiting");
        expect(snapshot.session.invocations[0]?.pendingApprovals?.[0]?.toolCallId).toBe("call-1");
        await harness.abort(sessionId);
        await harness.dispose();
    });

    test("运行中链超时抛 FollowUpDrainTimeoutError", async () => {
        const harness = new NeuroAgentHarness({
            store: new MemorySessionStore(),
            profiles: new ProfileRegistry().add(profile("drain-timeout")),
            model: new ScriptedModelRuntime([async () => {
                await new Promise<void>(() => {});
                return completed("never");
            }]),
            abortGraceMs: 0,
        });
        const created = await harness.createSession({profileKey: "drain-timeout", initial: {}, hostContext: {}});
        const sessionId = created.session.metadata.sessionId;
        const handle = await harness.invoke({sessionId, payload: {}});
        await harness.followUp(sessionId, {text: "pending"});
        await expect(harness.waitForFollowUpQueueDrain(sessionId, {timeoutMs: 60})).rejects.toMatchObject({
            name: "FollowUpDrainTimeoutError",
            sessionId,
            lastItems: 1,
            lastActiveStatus: "running",
        });
        await harness.abort(sessionId);
        await handle.result().catch(() => undefined);
        await harness.dispose();
    });

    test("signal 中止以 reason reject", async () => {
        const harness = new NeuroAgentHarness({
            store: new MemorySessionStore(),
            profiles: new ProfileRegistry().add(profile("drain-signal")),
            model: new ScriptedModelRuntime([async () => {
                await new Promise<void>(() => {});
                return completed("never");
            }]),
            abortGraceMs: 0,
        });
        const created = await harness.createSession({profileKey: "drain-signal", initial: {}, hostContext: {}});
        const sessionId = created.session.metadata.sessionId;
        await harness.invoke({sessionId, payload: {}});
        await harness.followUp(sessionId, {text: "pending"});
        const controller = new AbortController();
        const waitPromise = harness.waitForFollowUpQueueDrain(sessionId, {
            timeoutMs: 5_000,
            signal: controller.signal,
        });
        await new Promise<void>((resolve) => setTimeout(resolve, 50));
        controller.abort(new Error("host cancelled drain"));
        await expect(waitPromise).rejects.toThrow("host cancelled drain");
        await harness.dispose();
    });

    test("非法 options 拒绝", async () => {
        const harness = new NeuroAgentHarness({
            store: new MemorySessionStore(),
            profiles: new ProfileRegistry().add(profile("drain-invalid")),
            model: new ScriptedModelRuntime([completed("done")]),
        });
        await expect(harness.waitForFollowUpQueueDrain(1, {timeoutMs: 0})).rejects.toThrow(
            "timeoutMs 必须是正有限数",
        );
        await harness.dispose();
    });

    test("等待期间 dispose 以已 dispose 拒绝；Session 缺失传播 SessionNotFoundError", async () => {
        const harness = new NeuroAgentHarness({
            store: new MemorySessionStore(),
            profiles: new ProfileRegistry().add(profile("drain-dispose")),
            model: new ScriptedModelRuntime([async () => {
                await new Promise<void>(() => {});
                return completed("never");
            }]),
            abortGraceMs: 0,
        });
        const created = await harness.createSession({profileKey: "drain-dispose", initial: {}, hostContext: {}});
        const sessionId = created.session.metadata.sessionId;
        await harness.invoke({sessionId, payload: {}});
        await harness.followUp(sessionId, {text: "pending"});
        const waitPromise = harness.waitForFollowUpQueueDrain(sessionId, {timeoutMs: 5_000});
        await new Promise<void>((resolve) => setTimeout(resolve, 50));
        await harness.dispose();
        await expect(waitPromise).rejects.toThrow("NeuroAgentHarness 已 dispose");

        const directory = await mkdtemp(join(tmpdir(), "harness-drain-missing-"));
        try {
            const missing = new NeuroAgentHarness({
                store: new JsonlSessionStore<JsonObject>({directory}),
                profiles: new ProfileRegistry().add(profile("drain-missing")),
                model: new ScriptedModelRuntime([completed("done")]),
            });
            await expect(missing.waitForFollowUpQueueDrain(999, {timeoutMs: 100}))
                .rejects.toThrow("Session 999 不存在");
            await missing.dispose();
        } finally {
            await rm(directory, {recursive: true, force: true});
        }
    });
});
