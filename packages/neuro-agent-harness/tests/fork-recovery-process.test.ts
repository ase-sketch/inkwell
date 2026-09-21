import {describe, expect, test} from "bun:test";
import {mkdtemp, rm} from "node:fs/promises";
import {join} from "node:path";
import {tmpdir} from "node:os";
import {
    NeuroAgentHarness,
    ProfileRegistry,
    defineProfile,
    defineSchema,
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

type WorkerMarker = {
    readonly status: "worker-done";
    readonly sessionId: number;
    readonly invocationId: string;
    readonly output: string;
};

describe("跨进程 fork/恢复（真实子进程）", () => {
    test("worker 完成运行后，主进程投影终态、fork 会话并继续", async () => {
        const directory = await mkdtemp(join(tmpdir(), "harness-fork-process-"));
        try {
            const {marker} = await runWorkerFixture<WorkerMarker>(
                directory,
                "fork-recovery-worker.ts",
                "fork-recovery-worker.mjs",
                [directory],
                "worker-done",
            );

            // 主进程：新 Store 实例读取并投影 worker 的终态（不依赖 handle）。
            const store = new JsonlSessionStore<JsonObject>({directory});
            const snapshot = await store.read(marker.sessionId);
            const projected = invocationResultFromSnapshot(snapshot, marker.invocationId);
            expect(projected?.status).toBe("completed");
            expect(projected?.output).toBe("worker done");
            expect(projected?.persistence).toBe("confirmed");

            // 主进程：fork worker 的会话并继续跑旁路 Invocation。
            const harness = new NeuroAgentHarness({
                store,
                profiles: new ProfileRegistry().add(profile("fork-worker")),
                model: new ScriptedModelRuntime([completed("fork done")]),
            });
            const fork = await harness.forkSession(marker.sessionId);
            expect(fork.session.metadata.parentSessionId).toBe(marker.sessionId);
            expect(fork.session.entries.some((entry) => entry.kind === "agent.message")).toBe(true);
            expect(fork.session.invocations).toHaveLength(0);
            const forkResult = await (await harness.invoke({
                sessionId: fork.session.metadata.sessionId,
                payload: {},
            })).result();
            expect(forkResult.status).toBe("completed");
            const forkSnapshot = await harness.snapshot(fork.session.metadata.sessionId);
            expect(invocationResultFromSnapshot(forkSnapshot.session, forkResult.invocationId)?.output)
                .toBe("fork done");
            expect((await harness.snapshot(marker.sessionId)).session.entries).toHaveLength(snapshot.entries.length);
            await harness.dispose();
        } finally {
            await rm(directory, {recursive: true, force: true});
        }
    });
});
