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

async function runWaitingWorker(directory: string): Promise<WorkerMarker> {
    return (await runWorkerFixture<WorkerMarker>(
        directory,
        "waiting-resume-worker.ts",
        "waiting-resume-worker.mjs",
        [directory],
        "worker-waiting",
    )).marker;
}

describe("跨进程 waiting 控制面（真实子进程）", () => {
    test("新进程 abort 另一进程的 durable waiting Invocation", async () => {
        const directory = await mkdtemp(join(tmpdir(), "harness-waiting-abort-"));
        try {
            const marker = await runWaitingWorker(directory);
            const store = new JsonlSessionStore<JsonObject>({directory});
            const harness = new NeuroAgentHarness({
                store,
                profiles: new ProfileRegistry().add(waitingProfile()),
                model: {
                    runTurn: async () => {
                        throw new Error("abort 不应运行模型");
                    },
                },
            });
            await harness.abort(marker.sessionId);
            const snapshot = await harness.snapshot(marker.sessionId);
            expect(snapshot.session.status).toBe("idle");
            expect(snapshot.session.activeInvocationId).toBeNull();
            expect(snapshot.session.invocations[0]?.id).toBe(marker.invocationId);
            expect(snapshot.session.invocations[0]?.status).toBe("aborted");
            const projected = invocationResultFromSnapshot(snapshot.session, marker.invocationId);
            expect(projected?.status).toBe("aborted");
            expect(projected).not.toHaveProperty("error");
            await harness.dispose();
        } finally {
            await rm(directory, {recursive: true, force: true});
        }
    });

    test("新进程拒绝 approval：不执行 Tool，以 error 结果继续并完成", async () => {
        const directory = await mkdtemp(join(tmpdir(), "harness-waiting-reject-"));
        try {
            const marker = await runWaitingWorker(directory);
            const toolCallId = marker.toolCallId;
            if (toolCallId !== "call-1") {
                throw new Error(`worker toolCallId 异常：${toolCallId}`);
            }
            const store = new JsonlSessionStore<JsonObject>({directory});
            const harness = new NeuroAgentHarness({
                store,
                profiles: new ProfileRegistry().add(waitingProfile()),
                model: new ScriptedModelRuntime([completed("after rejection")]),
            });
            const resumed = await harness.resume(marker.sessionId, marker.invocationId, [
                {toolCallId, approved: false},
            ]);
            const result = await (await resumed).result();
            expect(result.status).toBe("completed");
            expect(result.output).toBe("after rejection");
            const snapshot = await harness.snapshot(marker.sessionId);
            expect(snapshot.session.entries.some((entry) => {
                const message = (entry.payload as {message?: {role?: string; content?: unknown; isError?: boolean}}).message;
                return message?.role === "toolResult"
                    && message.isError === true
                    && String(message.content).includes("Rejected.");
            })).toBe(true);
            expect(snapshot.session.entries.some((entry) => {
                const message = (entry.payload as {message?: {content?: unknown}}).message;
                return String(JSON.stringify(message?.content)).includes("approved run");
            })).toBe(false);
            await harness.dispose();
        } finally {
            await rm(directory, {recursive: true, force: true});
        }
    });
});
