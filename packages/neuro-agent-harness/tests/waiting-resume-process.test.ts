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

function waitingProfile() {
    const gatedTool = defineTool({
        name: "gated",
        description: "gated",
        parameters: objectSchema,
        approval: {request: () => ({prompt: "approve"})},
        execute: () => ({content: "approved run"}),
    });
    return defineProfile({
        manifest: {key: "waiting-worker", name: "waiting-worker"},
        initial: objectSchema,
        payload: objectSchema,
        prepare: () => ({systemPrompt: "waiting-worker", modelConfig: {}, tools: [gatedTool]}),
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
    readonly status: "worker-waiting";
    readonly sessionId: number;
    readonly invocationId: string;
    readonly toolCallId: string | undefined;
};

describe("跨进程 waiting 恢复与 resume（真实子进程）", () => {
    test("worker 进入 waiting 后退出，主进程投影 waiting、resume 并完成", async () => {
        const directory = await mkdtemp(join(tmpdir(), "harness-waiting-process-"));
        try {
            const {marker} = await runWorkerFixture<WorkerMarker>(
                directory,
                "waiting-resume-worker.ts",
                "waiting-resume-worker.mjs",
                [directory],
                "worker-waiting",
            );
            expect(marker.toolCallId).toBe("call-1");
            if (marker.toolCallId !== "call-1") {
                throw new Error(`worker toolCallId 异常：${marker.toolCallId}`);
            }

            // 主进程：新 Store 实例投影 waiting 状态（含 durable pendingApprovals）。
            const store = new JsonlSessionStore<JsonObject>({directory});
            const snapshot = await store.read(marker.sessionId);
            const projected = invocationResultFromSnapshot(snapshot, marker.invocationId);
            expect(projected?.status).toBe("waiting");
            expect(projected?.persistence).toBe("confirmed");
            expect(projected?.pendingApprovals?.[0]?.toolCallId).toBe("call-1");

            // 主进程：resume 同一 Invocation（owner CAS claim），运行完成。
            const harness = new NeuroAgentHarness({
                store,
                profiles: new ProfileRegistry().add(waitingProfile()),
                model: new ScriptedModelRuntime([completed("after approval")]),
            });
            const resumed = await harness.resume(marker.sessionId, marker.invocationId, [
                {toolCallId: marker.toolCallId, approved: true},
            ]);
            const resumedResult = await (await resumed).result();
            expect(resumedResult.status).toBe("completed");
            expect(resumedResult.output).toBe("after approval");

            const finalSnapshot = await harness.snapshot(marker.sessionId);
            expect(invocationResultFromSnapshot(finalSnapshot.session, marker.invocationId)?.status)
                .toBe("completed");
            expect(finalSnapshot.session.invocations[0]?.status).toBe("completed");
            expect(finalSnapshot.session.invocations[0]?.id).toBe(marker.invocationId);
            expect(finalSnapshot.session.entries.some((entry) => {
                return entry.kind === "agent.message"
                    && JSON.stringify((entry.payload as {message?: unknown}).message).includes("approved run");
            })).toBe(true);

            // 主进程：fork 恢复后的会话并继续。
            const fork = await harness.forkSession(marker.sessionId);
            expect(fork.session.metadata.parentSessionId).toBe(marker.sessionId);
            expect(fork.session.entries.some((entry) => entry.kind === "agent.message")).toBe(true);
            expect(fork.session.invocations).toHaveLength(0);
            await harness.dispose();
        } finally {
            await rm(directory, {recursive: true, force: true});
        }
    });
});
