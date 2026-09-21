import {describe, expect, test} from "bun:test";
import {mkdtemp, rm} from "node:fs/promises";
import {join} from "node:path";
import {tmpdir} from "node:os";
import {
    NeuroAgentHarness,
    ProfileRegistry,
    defineProfile,
    defineSchema,
    defineTool,
    invocationResultFromSnapshot,
    type JsonObject,
} from "../src/index.js";
import {JsonlSessionStore} from "../src/storage/jsonl.js";
import {ScriptedModelRuntime} from "../src/testing/index.js";
import {runWorkerFixture} from "./fixtures/process-test-utils.js";

const objectSchema = defineSchema<JsonObject>((value) => {
    if (value === null || typeof value !== "object" || Array.isArray(value)) {
        throw new Error("必须是 object");
    }
    return value;
}, {type: "object"});

function workerProfile() {
    const gatedTool = defineTool({
        name: "gated",
        description: "gated",
        parameters: objectSchema,
        approval: {request: () => ({prompt: "approve"})},
        execute: () => ({content: "approved run"}),
    });
    return defineProfile({
        manifest: {key: "follow-up-worker", name: "follow-up-worker"},
        initial: objectSchema,
        payload: objectSchema,
        prepare: () => ({systemPrompt: "follow-up-worker", modelConfig: {}, tools: [gatedTool]}),
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

type WorkerMarker = {
    readonly status: "worker-waiting-followup";
    readonly sessionId: number;
    readonly invocationId: string;
    readonly toolCallId: string | undefined;
    readonly followUpId: string;
};

describe("跨进程 follow-up 注入与自动启动（真实子进程）", () => {
    test("worker 在 waiting 期间入队的 follow-up 由主进程 resume 后自动消费", async () => {
        const directory = await mkdtemp(join(tmpdir(), "harness-followup-process-"));
        try {
            const {marker} = await runWorkerFixture<WorkerMarker>(
                directory,
                "follow-up-worker.ts",
                "follow-up-worker.mjs",
                [directory],
                "worker-waiting-followup",
            );
            const store = new JsonlSessionStore<JsonObject>({directory});
            const harness = new NeuroAgentHarness({
                store,
                profiles: new ProfileRegistry().add(workerProfile()),
                model: new ScriptedModelRuntime([completed("after approval"), completed("follow-up done")]),
            });

            // 主进程先看到 worker 写入的 durable 队列。
            const queueBefore = await harness.followUpState(marker.sessionId);
            expect(queueBefore.items).toHaveLength(1);
            expect(queueBefore.items[0]?.id).toBe(marker.followUpId);
            expect(queueBefore.items[0]?.payload).toEqual({text: "cross-process follow-up"});
            expect(queueBefore.items[0]?.caller).toEqual({kind: "system", name: "worker"});
            if (marker.toolCallId !== "call-1") {
                throw new Error(`worker toolCallId 异常：${marker.toolCallId}`);
            }

            // resume 第一个 Invocation（worker 发起的 waiting）。
            const resumed = await harness.resume(marker.sessionId, marker.invocationId, [
                {toolCallId: marker.toolCallId, approved: true},
            ]);
            const firstResult = await (await resumed).result();
            expect(firstResult.status).toBe("completed");
            expect(firstResult.output).toBe("after approval");

            // watchFollowUps 自动启动 follow-up Invocation 并跑完整条链。
            const drained = await harness.waitForFollowUpQueueDrain(marker.sessionId, {
                timeoutMs: 10_000,
            });
            expect(drained.items).toHaveLength(0);
            expect(drained.paused).toBe(false);

            const snapshot = await harness.snapshot(marker.sessionId);
            const second = snapshot.session.invocations.find((item) => item.id !== marker.invocationId);
            expect(second).toBeDefined();
            if (!second) {
                throw new Error("follow-up Invocation 缺失");
            }
            expect(second.status).toBe("completed");
            expect(invocationResultFromSnapshot(snapshot.session, second.id)?.output).toBe("follow-up done");
            expect(snapshot.session.entries.some((entry) => {
                return entry.kind === "agent.message"
                    && JSON.stringify((entry.payload as {message?: unknown}).message)
                        .includes("cross-process follow-up");
            })).toBe(true);
            expect((await harness.followUpState(marker.sessionId)).items).toHaveLength(0);
            await harness.dispose();
        } finally {
            await rm(directory, {recursive: true, force: true});
        }
    });
});
