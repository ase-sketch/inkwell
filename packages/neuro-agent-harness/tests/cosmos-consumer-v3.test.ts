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
    type FollowUpQueueState,
    type JsonObject,
} from "../src/index.js";
import {projectSessionTranscript} from "../src/session-transcript.js";
import {JsonlSessionStore} from "../src/storage/jsonl.js";
import {MemorySessionStore} from "../src/storage/memory.js";
import {ScriptedModelRuntime} from "../src/testing/index.js";

const objectSchema = defineSchema<JsonObject>((value) => {
    if (value === null || typeof value !== "object" || Array.isArray(value)) {
        throw new Error("必须是 object");
    }
    return value;
}, {type: "object"});

const strictSchema = defineSchema<JsonObject>((value) => {
    if (value === null || typeof value !== "object" || Array.isArray(value) || value.bad === true) {
        throw new Error("payload 必须包含 text");
    }
    return value;
});

function completed(text: string, timestamp = 1) {
    return {
        message: {
            role: "assistant" as const,
            content: [{type: "text" as const, text}],
            timestamp,
        },
    };
}

function textOf(message: {role: string; content: unknown}): string {
    if (typeof message.content === "string") return message.content;
    return (message.content as Array<{text?: string; type?: string}>)
        .map((block) => block.text ?? block.type)
        .join("|");
}

function compactor(summary: string) {
    return {
        estimate: () => 1,
        summarize: async () => summary,
    };
}

async function waitForPaused(
    harness: {followUpState(sessionId: number): Promise<FollowUpQueueState<number>>},
    sessionId: number,
): Promise<FollowUpQueueState<number>> {
    const deadline = Date.now() + 2_000;
    while (Date.now() < deadline) {
        const state = await harness.followUpState(sessionId);
        if (state.paused) return state;
        await new Promise<void>((resolve) => setTimeout(resolve, 10));
    }
    return harness.followUpState(sessionId);
}

// 第九十六轮：Cosmos 消费切片 v3——手动 compact（ADR-0037）与 follow-up
// auto-pause（pausedBy）在编排器真实流程中的组合验证。
describe("Cosmos 编排消费 v3：手动压缩 → fork → 锚定回写", () => {
    test("长会话手动压缩后 fork（无 compaction 残留）并在分支回写", async () => {
        const harness = new NeuroAgentHarness({
            store: new MemorySessionStore(),
            profiles: new ProfileRegistry().add(defineProfile({
                manifest: {key: "cosmos-v3", name: "Cosmos V3"},
                initial: objectSchema,
                payload: objectSchema,
                prepare: () => ({systemPrompt: "cosmos-v3", modelConfig: {}}),
            })),
            model: new ScriptedModelRuntime([
                completed("a1", 1),
                completed("a2", 2),
                completed("a3", 3),
                completed("fork result", 4),
            ]),
            compactor: compactor("S-manual"),
        });
        const main = await harness.createSession({profileKey: "cosmos-v3", initial: {}, hostContext: {}});
        const mainId = main.session.metadata.sessionId;
        for (let step = 1; step <= 3; step += 1) {
            await (await harness.invoke({sessionId: mainId, payload: {step}})).result();
        }

        // 编排器在长会话上手动压缩（保留最近 1 条）。
        const outcome = await harness.compactSession(mainId, {
            keepRecentTokens: 1,
            instructions: "保持关键信息",
        });
        expect(outcome.compacted).toBe(true);
        const mainSnapshot = await harness.snapshot(mainId);
        expect(mainSnapshot.session.entries.some((entry) => entry.kind === "agent.compaction")).toBe(true);

        // 派生探索分支：fork 丢弃 compaction fact，但保留原始消息。
        const fork = await harness.forkSession(mainId, {title: "v3-exploration"});
        expect(fork.session.entries.some((entry) => entry.kind === "agent.compaction")).toBe(false);
        const forkMessages = fork.session.entries
            .filter((entry) => entry.kind === "agent.message")
            .map((entry) => JSON.stringify(entry.payload));
        expect(forkMessages.some((payload) => payload.includes("a1"))).toBe(true);
        expect(forkMessages.some((payload) => payload.includes("a3"))).toBe(true);
        const forkInvocation = await (await harness.invoke({
            sessionId: fork.session.metadata.sessionId,
            payload: {task: "explore"},
        })).result();
        expect(forkInvocation.status).toBe("completed");
        const forkSnapshot = await harness.snapshot(fork.session.metadata.sessionId);
        const projected = invocationResultFromSnapshot(forkSnapshot.session, forkInvocation.invocationId);
        expect(projected?.status).toBe("completed");

        // 锚定回写主会话（压缩后的 leaf 为 compaction entry）。
        const mainBeforeWrite = await harness.snapshot(mainId);
        await harness.write({
            target: mainId,
            expectedVersion: mainBeforeWrite.session.version,
            expectedActiveLeafId: mainBeforeWrite.session.activeLeafId,
            cause: "cosmos.v3.writeback",
            operations: [{
                type: "appendEntries",
                entries: [{
                    kind: "cosmos.v3.exploration",
                    payload: {output: projected?.output ?? null},
                }],
            }],
        });
        const mainAfter = await harness.snapshot(mainId);
        const writeback = mainAfter.session.entries.findLast((entry) => entry.kind === "cosmos.v3.exploration");
        expect(writeback?.payload).toEqual({output: "fork result"});
        expect(mainAfter.session.activeLeafId).toBe(writeback?.id ?? null);
        await harness.dispose();
    });

    test("手动压缩后 follow-up 坏项自动 pause → cancel → 好项 resume → JSONL 重启恢复", async () => {
        const directory = await mkdtemp(join(tmpdir(), "harness-cosmos-v3-"));
        try {
            let releaseA!: () => void;
            const gateA = new Promise<void>((resolve) => {
                releaseA = resolve;
            });
            let releaseB!: () => void;
            const gateB = new Promise<void>((resolve) => {
                releaseB = resolve;
            });
            const registry = new ProfileRegistry();
            registry.define({
                manifest: {key: "cosmos-v3b", name: "Cosmos V3B"},
                initial: objectSchema,
                payload: objectSchema,
                prepare: () => ({systemPrompt: "cosmos-v3b", modelConfig: {}}),
            });
            const harness = new NeuroAgentHarness({
                store: new JsonlSessionStore<JsonObject>({directory}),
                profiles: registry,
                model: new ScriptedModelRuntime([
                    completed("first", 1),
                    completed("second", 2),
                    async () => {
                        await gateA;
                        return completed("first again", 1);
                    },
                    async () => {
                        await gateB;
                        return completed("second again", 2);
                    },
                    completed("follow-up done", 3),
                ]),
                compactor: compactor("S-v3"),
            });
            const created = await harness.createSession({profileKey: "cosmos-v3b", initial: {}, hostContext: {}});
            const sessionId = created.session.metadata.sessionId;
            await (await harness.invoke({sessionId, payload: {}})).result();
            await (await harness.invoke({sessionId, payload: {}})).result();
            // 长会话手动压缩。
            const outcome = await harness.compactSession(sessionId, {keepRecentTokens: 1});
            expect(outcome.compacted).toBe(true);

            // 坏项：队列时接受（v1），自动启动时被当前 Profile（v2）拒绝。
            const handleA = await harness.invoke({sessionId, payload: {}});
            const badItem = await harness.followUp(sessionId, {bad: true});
            registry.replace(defineProfile({
                manifest: {key: "cosmos-v3b", name: "Cosmos V3B", version: 2},
                initial: objectSchema,
                payload: strictSchema,
                prepare: () => ({systemPrompt: "cosmos-v3b", modelConfig: {}}),
            }));
            releaseA();
            await handleA.result();
            const pausedState = await waitForPaused(harness, sessionId);
            expect(pausedState.paused).toBe(true);
            expect(pausedState.pausedBy).toEqual({
                itemId: badItem.id,
                reason: "admission_failed",
                message: "payload 必须包含 text",
            });

            // 好项：入队（v2 接受），cancel 坏项后 resume 消费。
            const handleB = await harness.invoke({sessionId, payload: {}});
            const goodItem = await harness.followUp(sessionId, {text: "ok"});
            releaseB();
            await handleB.result();
            expect((await harness.followUpState(sessionId)).items.map((item) => item.id))
                .toEqual([badItem.id, goodItem.id]);
            await harness.cancelFollowUp(sessionId, badItem.id);
            const resumedHandle = await harness.resumeFollowUps(sessionId);
            expect(resumedHandle).not.toBeNull();
            await (await resumedHandle!).result();
            const finalState = await harness.followUpState(sessionId);
            expect(finalState.paused).toBe(false);
            expect(finalState.pausedBy).toBeUndefined();
            expect(finalState.items).toHaveLength(0);

            // JSONL 重启：新 Harness 实例看到压缩投影、队列清空、Invocation 链。
            await harness.dispose();
            const restored = new NeuroAgentHarness({
                store: new JsonlSessionStore<JsonObject>({directory}),
                profiles: new ProfileRegistry().add(defineProfile({
                    manifest: {key: "cosmos-v3b", name: "Cosmos V3B", version: 2},
                    initial: objectSchema,
                    payload: strictSchema,
                    prepare: () => ({systemPrompt: "cosmos-v3b", modelConfig: {}}),
                })),
                model: new ScriptedModelRuntime([]),
                compactor: compactor("unused"),
            });
            const restoredSnapshot = await restored.snapshot(sessionId);
            const projection = projectSessionTranscript(restoredSnapshot.session);
            expect(projection.messages.map((message) => textOf(message)))
                .toEqual([
                    "S-v3",
                    "second",
                    "{}",
                    "first again",
                    "{}",
                    "second again",
                    '{"text":"ok"}',
                    "follow-up done",
                ]);
            expect((await restored.followUpState(sessionId)).items).toHaveLength(0);
            expect(restoredSnapshot.session.entries.some((entry) => entry.kind === "agent.compaction")).toBe(true);
            await restored.dispose();
        } finally {
            await rm(directory, {recursive: true, force: true});
        }
    });
});
