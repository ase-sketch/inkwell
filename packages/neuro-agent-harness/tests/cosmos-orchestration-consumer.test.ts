import {describe, expect, test} from "bun:test";
import {mkdtemp, rm} from "node:fs/promises";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {
    NeuroAgentHarness,
    ProfileRegistry,
    defineProfile,
    defineSchema,
    invocationResultFromSnapshot,
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

describe("Cosmos 编排消费：fork → 投影 → 锚定回写", () => {
    test("主会话派生探索分支，投影分支结果后以 CAS 回写主会话", async () => {
        const harness = new NeuroAgentHarness({
            store: new MemorySessionStore(),
            profiles: new ProfileRegistry().add(profile("cosmos-orchestration")),
            model: new ScriptedModelRuntime([completed("main done"), completed("explore result")]),
        });
        const main = await harness.createSession({profileKey: "cosmos-orchestration", initial: {}, hostContext: {}});
        const mainResult = await (await harness.invoke({
            sessionId: main.session.metadata.sessionId,
            payload: {},
        })).result();
        expect(mainResult.status).toBe("completed");

        // 宿主派生探索分支（fork），在分支上跑旁路 Agent。
        const fork = await harness.forkSession(main.session.metadata.sessionId, {title: "exploration"});
        expect(fork.session.metadata.parentSessionId).toBe(main.session.metadata.sessionId);
        expect(fork.session.metadata.title).toBe("exploration");
        const forkInvocation = await (await harness.invoke({
            sessionId: fork.session.metadata.sessionId,
            payload: {task: "explore"},
        })).result();
        expect(forkInvocation.status).toBe("completed");

        // 宿主用公开投影重建分支结果（编排器视图）。
        const forkSnapshot = await harness.snapshot(fork.session.metadata.sessionId);
        const projected = invocationResultFromSnapshot(forkSnapshot.session, forkInvocation.invocationId);
        expect(projected?.status).toBe("completed");
        expect(projected?.output).toBe("explore result");
        expect(projected?.persistence).toBe("confirmed");

        // 锚定回写主会话（ADR-0009 模式）：版本/leaf CAS 防并发覆盖。
        const mainSnapshot = await harness.snapshot(main.session.metadata.sessionId);
        await harness.write({
            target: main.session.metadata.sessionId,
            expectedVersion: mainSnapshot.session.version,
            expectedActiveLeafId: mainSnapshot.session.activeLeafId,
            cause: "cosmos.exploration.writeback",
            operations: [{
                type: "appendEntries",
                entries: [{
                    kind: "cosmos.exploration",
                    payload: {
                        forkSessionId: fork.session.metadata.sessionId,
                        output: projected?.output ?? null,
                    },
                }],
            }],
        });

        const mainAfter = await harness.snapshot(main.session.metadata.sessionId);
        const writeback = mainAfter.session.entries.findLast((entry) => entry.kind === "cosmos.exploration");
        expect(mainAfter.session.version).toBe(mainSnapshot.session.version + 1);
        expect(mainAfter.session.activeLeafId).toBe(writeback?.id ?? null);
        expect(writeback?.payload).toEqual({
            forkSessionId: fork.session.metadata.sessionId,
            output: "explore result",
        });
        // 源与分支互相独立：回写不改变分支。
        expect((await harness.snapshot(fork.session.metadata.sessionId)).session.entries)
            .toHaveLength(forkSnapshot.session.entries.length);
        await harness.dispose();
    });
});

describe("Cosmos 编排消费：重启恢复（新 Store 实例）投影与 fork", () => {
    test("重启后从 Snapshot 投影终态并派生恢复分支", async () => {
        const directory = await mkdtemp(join(tmpdir(), "harness-cosmos-restart-"));
        try {
            const harness = new NeuroAgentHarness({
                store: new JsonlSessionStore<JsonObject>({directory}),
                profiles: new ProfileRegistry().add(profile("cosmos-restart")),
                model: new ScriptedModelRuntime([completed("sidecar done")]),
            });
            const created = await harness.createSession({profileKey: "cosmos-restart", initial: {}, hostContext: {}});
            const controller = new AbortController();
            const result = await (await harness.invoke({
                sessionId: created.session.metadata.sessionId,
                payload: {},
                signal: controller.signal,
            })).result();
            expect(result.status).toBe("completed");
            await harness.dispose();

            // 新进程：仅用 Store 读取即可投影（不依赖 handle/内存 active）。
            const restartedStore = new JsonlSessionStore<JsonObject>({directory});
            const snapshot = await restartedStore.read(created.session.metadata.sessionId);
            const projected = invocationResultFromSnapshot(snapshot, result.invocationId);
            expect(projected?.status).toBe("completed");
            expect(projected?.output).toBe("sidecar done");
            expect(projected?.persistence).toBe("confirmed");

            // 新进程继续派生恢复分支，并在分支上继续跑。
            const restarted = new NeuroAgentHarness({
                store: restartedStore,
                profiles: new ProfileRegistry().add(profile("cosmos-restart")),
                model: new ScriptedModelRuntime([completed("recovered fork done")]),
            });
            const fork = await restarted.forkSession(created.session.metadata.sessionId);
            expect(fork.session.metadata.parentSessionId).toBe(created.session.metadata.sessionId);
            expect(fork.session.entries).toHaveLength(snapshot.entries.length);
            expect(fork.session.entries.some((entry) => entry.kind === "agent.message")).toBe(true);
            const forkResult = await (await restarted.invoke({
                sessionId: fork.session.metadata.sessionId,
                payload: {task: "recover"},
            })).result();
            expect(forkResult.status).toBe("completed");
            const forkSnapshot = await restarted.snapshot(fork.session.metadata.sessionId);
            expect(invocationResultFromSnapshot(forkSnapshot.session, forkResult.invocationId)?.output)
                .toBe("recovered fork done");
            await restarted.dispose();
        } finally {
            await rm(directory, {recursive: true, force: true});
        }
    });
});
