import {describe, expect, test} from "bun:test";
import {mkdir, mkdtemp, rm, writeFile} from "node:fs/promises";
import {join} from "node:path";
import {tmpdir} from "node:os";
import {
    InvocationWaitTimeoutError,
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
import {runWorkerFixture} from "./fixtures/process-test-utils.js";

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

describe("waitForInvocation", () => {
    test("等待已完成 Invocation 直接返回终态", async () => {
        const harness = new NeuroAgentHarness({
            store: new MemorySessionStore(),
            profiles: new ProfileRegistry().add(profile("wait-done")),
            model: new ScriptedModelRuntime([completed("done")]),
        });
        const created = await harness.createSession({profileKey: "wait-done", initial: {}, hostContext: {}});
        const handle = await harness.invoke({sessionId: created.session.metadata.sessionId, payload: {}});
        const result = await harness.waitForInvocation(
            created.session.metadata.sessionId,
            handle.invocationId,
            {timeoutMs: 5_000},
        );
        expect(result.status).toBe("completed");
        expect(result.output).toBe("done");
        await harness.dispose();
    });

    test("等待进行中完成的 Invocation（轮询直到终态）", async () => {
        let release!: () => void;
        const gate = new Promise<void>((resolve) => {
            release = resolve;
        });
        const harness = new NeuroAgentHarness({
            store: new MemorySessionStore(),
            profiles: new ProfileRegistry().add(profile("wait-poll")),
            model: new ScriptedModelRuntime([async () => {
                await gate;
                return completed("released");
            }]),
        });
        const created = await harness.createSession({profileKey: "wait-poll", initial: {}, hostContext: {}});
        const handle = await harness.invoke({sessionId: created.session.metadata.sessionId, payload: {}});
        const waitPromise = harness.waitForInvocation(
            created.session.metadata.sessionId,
            handle.invocationId,
            {timeoutMs: 5_000},
        );
        await new Promise<void>((resolve) => setTimeout(resolve, 50));
        release();
        const result = await waitPromise;
        expect(result.status).toBe("completed");
        expect(result.output).toBe("released");
        await harness.dispose();
    });

    test("waiting 态返回 pendingApprovals，由宿主决定 resume", async () => {
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
                manifest: {key: "wait-waiting", name: "wait-waiting"},
                initial: objectSchema,
                payload: objectSchema,
                prepare: () => ({systemPrompt: "wait-waiting", modelConfig: {}, tools: [gatedTool]}),
            })),
            model: new ScriptedModelRuntime([{
                message: {
                    role: "assistant",
                    content: [{type: "toolCall", call: {id: "call-1", name: "gated", arguments: {}}}],
                    timestamp: 1,
                },
            }]),
        });
        const created = await harness.createSession({profileKey: "wait-waiting", initial: {}, hostContext: {}});
        const handle = await harness.invoke({sessionId: created.session.metadata.sessionId, payload: {}});
        const result = await harness.waitForInvocation(
            created.session.metadata.sessionId,
            handle.invocationId,
            {timeoutMs: 5_000},
        );
        expect(result.status).toBe("waiting");
        expect(result.pendingApprovals?.[0]?.toolCallId).toBe("call-1");
        await harness.abort(created.session.metadata.sessionId);
        await harness.dispose();
    });

    test("超时抛 InvocationWaitTimeoutError 并携带最后状态", async () => {
        const harness = new NeuroAgentHarness({
            store: new MemorySessionStore(),
            profiles: new ProfileRegistry().add(profile("wait-timeout")),
            model: new ScriptedModelRuntime([async () => {
                await new Promise<void>(() => {});
                return completed("never");
            }]),
            abortGraceMs: 0,
        });
        const created = await harness.createSession({profileKey: "wait-timeout", initial: {}, hostContext: {}});
        const handle = await harness.invoke({sessionId: created.session.metadata.sessionId, payload: {}});
        await expect(harness.waitForInvocation(
            created.session.metadata.sessionId,
            handle.invocationId,
            {timeoutMs: 60},
        )).rejects.toMatchObject({
            name: "InvocationWaitTimeoutError",
            invocationId: handle.invocationId,
            lastStatus: "running",
        });
        await harness.dispose();
    });

    test("signal 中止以 reason reject", async () => {
        const harness = new NeuroAgentHarness({
            store: new MemorySessionStore(),
            profiles: new ProfileRegistry().add(profile("wait-signal")),
            model: new ScriptedModelRuntime([async () => {
                await new Promise<void>(() => {});
                return completed("never");
            }]),
            abortGraceMs: 0,
        });
        const created = await harness.createSession({profileKey: "wait-signal", initial: {}, hostContext: {}});
        const handle = await harness.invoke({sessionId: created.session.metadata.sessionId, payload: {}});
        const controller = new AbortController();
        const waitPromise = harness.waitForInvocation(
            created.session.metadata.sessionId,
            handle.invocationId,
            {timeoutMs: 5_000, signal: controller.signal},
        );
        await new Promise<void>((resolve) => setTimeout(resolve, 50));
        controller.abort(new Error("host cancelled wait"));
        await expect(waitPromise).rejects.toThrow("host cancelled wait");
        await harness.dispose();
    });

    test("等待期间 dispose 以已 dispose 拒绝", async () => {
        const harness = new NeuroAgentHarness({
            store: new MemorySessionStore(),
            profiles: new ProfileRegistry().add(profile("wait-dispose")),
            model: new ScriptedModelRuntime([async () => {
                await new Promise<void>(() => {});
                return completed("never");
            }]),
            abortGraceMs: 0,
        });
        const created = await harness.createSession({profileKey: "wait-dispose", initial: {}, hostContext: {}});
        const handle = await harness.invoke({sessionId: created.session.metadata.sessionId, payload: {}});
        const waitPromise = harness.waitForInvocation(
            created.session.metadata.sessionId,
            handle.invocationId,
            {timeoutMs: 5_000},
        );
        await new Promise<void>((resolve) => setTimeout(resolve, 50));
        await harness.dispose();
        await expect(waitPromise).rejects.toThrow("NeuroAgentHarness 已 dispose");
    });

    test("interrupted 视为未终态，等待至超时并携带 lastStatus", async () => {
        const directory = await mkdtemp(join(tmpdir(), "harness-wait-interrupted-"));
        try {
            const sessionsDirectory = join(directory, "sessions");
            await mkdir(sessionsDirectory, {recursive: true});
            await writeFile(
                join(sessionsDirectory, "1.jsonl"),
                `${JSON.stringify({
                    kind: "snapshot",
                    cause: "test.interrupted",
                    snapshot: {
                        metadata: {sessionId: 1, profileKey: "wait-interrupted", initial: {}, hostContext: {}, createdAt: 1},
                        version: 0,
                        status: "interrupted",
                        activeLeafId: null,
                        activeInvocationId: null,
                        entries: [],
                        invocations: [{
                            id: "i1",
                            sessionId: 1,
                            profileKey: "wait-interrupted",
                            caller: {kind: "user"},
                            input: {},
                            status: "interrupted",
                            turnCount: 0,
                            createdAt: 1,
                            error: {name: "InterruptedError", message: "interrupted", retryable: true},
                        }],
                    },
                    appendedEntryIds: [],
                })}\n`,
                "utf8",
            );
            const harness = new NeuroAgentHarness({
                store: new JsonlSessionStore<JsonObject>({directory}),
                profiles: new ProfileRegistry().add(profile("wait-interrupted")),
                model: new ScriptedModelRuntime([]),
            });
            await expect(harness.waitForInvocation(1, "i1", {timeoutMs: 60})).rejects.toMatchObject({
                name: "InvocationWaitTimeoutError",
                invocationId: "i1",
                lastStatus: "interrupted",
            });
            await harness.dispose();
        } finally {
            await rm(directory, {recursive: true, force: true});
        }
    });

    test("非法 options 拒绝；Session 缺失传播 SessionNotFoundError", async () => {
        const harness = new NeuroAgentHarness({
            store: new MemorySessionStore(),
            profiles: new ProfileRegistry().add(profile("wait-invalid")),
            model: new ScriptedModelRuntime([completed("done")]),
        });
        await expect(harness.waitForInvocation(1, "i1", {timeoutMs: 0})).rejects.toThrow(
            "timeoutMs 必须是正有限数",
        );
        await expect(harness.waitForInvocation(1, "i1", {
            timeoutMs: 100,
            pollIntervalMs: 0,
        })).rejects.toThrow("pollIntervalMs 必须是正整数");
        await expect(harness.waitForInvocation(999, "i1", {timeoutMs: 100}))
            .rejects.toThrow("Session 999 不存在");
        await harness.dispose();
    });

    test("跨进程：等待另一进程完成的 Invocation", async () => {
        const directory = await mkdtemp(join(tmpdir(), "harness-wait-process-"));
        try {
            const {marker} = await runWorkerFixture<{
                status: "worker-done";
                sessionId: number;
                invocationId: string;
            }>(
                directory,
                "fork-recovery-worker.ts",
                "fork-recovery-worker.mjs",
                [directory],
                "worker-done",
            );
            const harness = new NeuroAgentHarness({
                store: new JsonlSessionStore<JsonObject>({directory}),
                profiles: new ProfileRegistry().add(profile("fork-worker")),
                model: new ScriptedModelRuntime([]),
            });
            const result = await harness.waitForInvocation(marker.sessionId, marker.invocationId, {
                timeoutMs: 10_000,
            });
            expect(result.status).toBe("completed");
            expect(result.output).toBe("worker done");
            await harness.dispose();
        } finally {
            await rm(directory, {recursive: true, force: true});
        }
    });
});
