import {describe, expect, test} from "bun:test";
import {mkdtemp, rm} from "node:fs/promises";
import {join} from "node:path";
import {tmpdir} from "node:os";
import {
    NeuroAgentHarness,
    InvocationConflictError,
    ProfileRegistry,
    SessionConflictError,
    defineProfile,
    defineSchema,
    type JsonObject,
    type SessionCommitResult,
    type SessionWritePlan,
} from "../src/index.js";
import {MemorySessionStore} from "../src/storage/memory.js";
import {JsonlSessionStore} from "../src/storage/jsonl.js";
import {ScriptedModelRuntime} from "../src/testing/index.js";

const objectSchema = defineSchema<JsonObject>((value) => {
    if (value === null || typeof value !== "object" || Array.isArray(value)) {
        throw new Error("必须是 object");
    }
    return value;
});

class ExternalWriteBeforeInvocationStartStore extends MemorySessionStore<number, JsonObject> {
    private injected = false;

    override async commit(plan: SessionWritePlan<number, JsonObject>): Promise<SessionCommitResult<number, JsonObject>> {
        if (plan.cause === "harness.invocation.start" && !this.injected) {
            this.injected = true;
            await super.commit({
                target: plan.target,
                ...(plan.expectedVersion !== undefined ? {expectedVersion: plan.expectedVersion} : {}),
                cause: "test.external.write",
                operations: [{type: "appendEntries", entries: [{kind: "test.external.write", payload: {source: "external"}}]}],
            });
        }
        return super.commit(plan);
    }
}

class CasConflictThenWriteStore extends MemorySessionStore<number, JsonObject> {
    private injected = false;

    override async commit(plan: SessionWritePlan<number, JsonObject>): Promise<SessionCommitResult<number, JsonObject>> {
        if (plan.cause !== "harness.invocation.start" || this.injected) {
            return super.commit(plan);
        }
        this.injected = true;
        await super.commit({
            target: plan.target,
            cause: "test.external.first-write",
            operations: [{type: "appendEntries", entries: [{kind: "test.external.write", payload: {order: "first"}}]}],
        });
        try {
            return await super.commit(plan);
        } catch (error) {
            if (error instanceof SessionConflictError) {
                await super.commit({
                    target: plan.target,
                    cause: "test.external.second-write",
                    operations: [{type: "appendEntries", entries: [{kind: "test.external.write", payload: {order: "second"}}]}],
                });
            }
            throw error;
        }
    }
}

describe("Workflow anchored Invocation", () => {
    test("按 Snapshot version 和 active leaf 启动旁路 Invocation，并拒绝旧锚点", async () => {
        const profile = defineProfile({
            manifest: {key: "workflow-anchor", name: "Workflow anchor"},
            initial: objectSchema,
            payload: objectSchema,
            prepare: () => ({systemPrompt: "workflow", modelConfig: {}}),
        });
        const harness = new NeuroAgentHarness({
            store: new MemorySessionStore(),
            profiles: new ProfileRegistry().add(profile),
            model: new ScriptedModelRuntime([
                {message: {role: "assistant", content: [{type: "text", text: "anchored"}], timestamp: 1}},
            ]),
        });

        const created = await harness.createSession({profileKey: "workflow-anchor", initial: {}, hostContext: {}});
        const observed = await harness.write({
            target: created.session.metadata.sessionId,
            expectedVersion: created.session.version,
            cause: "workflow.anchor.seed",
            operations: [{type: "appendEntries", entries: [{kind: "workflow.seed", payload: {ready: true}}]}],
        });
        const anchor = {
            version: observed.session.version,
            activeLeafId: observed.session.activeLeafId,
        };

        const result = await (await harness.invokeAt({
            sessionId: created.session.metadata.sessionId,
            payload: {instruction: "run"},
            caller: {kind: "system", name: "workflow.test"},
            anchor,
        })).result();

        expect(result.status).toBe("completed");
        expect(result.output).toBe("anchored");

        const current = await harness.snapshot(created.session.metadata.sessionId);
        await harness.write({
            target: created.session.metadata.sessionId,
            expectedVersion: current.session.version,
            cause: "workflow.anchor.advance",
            operations: [{type: "appendEntries", entries: [{kind: "workflow.advance", payload: {ready: false}}]}],
        });

        await expect(harness.invokeAt({
            sessionId: created.session.metadata.sessionId,
            payload: {instruction: "stale"},
            anchor,
        })).rejects.toMatchObject({
            name: "SessionConflictError",
            expectedVersion: anchor.version,
            expectedActiveLeafId: anchor.activeLeafId,
        });
        await harness.dispose();
    });

    test("read 到 start commit 之间发生外部写入时保留实际 leaf 冲突诊断", async () => {
        const profile = defineProfile({
            manifest: {key: "workflow-anchor-external-write", name: "Workflow anchor external write"},
            initial: objectSchema,
            payload: objectSchema,
            prepare: () => ({systemPrompt: "workflow", modelConfig: {}}),
        });
        const harness = new NeuroAgentHarness({
            store: new ExternalWriteBeforeInvocationStartStore(),
            profiles: new ProfileRegistry().add(profile),
            model: new ScriptedModelRuntime([]),
        });

        const created = await harness.createSession({profileKey: "workflow-anchor-external-write", initial: {}, hostContext: {}});
        const anchor = {
            version: created.session.version,
            activeLeafId: created.session.activeLeafId,
        };
        const conflict = await harness.invokeAt({
            sessionId: created.session.metadata.sessionId,
            payload: {instruction: "run"},
            anchor,
        }).then(
            () => {
                throw new Error("过期 anchor 应拒绝启动 Invocation");
            },
            (error: unknown) => error,
        );

        expect(conflict).toBeInstanceOf(SessionConflictError);
        expect(conflict).toMatchObject({
            expectedVersion: anchor.version,
            actualVersion: anchor.version + 1,
            expectedActiveLeafId: anchor.activeLeafId,
        });
        const current = await harness.snapshot(created.session.metadata.sessionId);
        expect(current.session.activeLeafId).not.toBe(anchor.activeLeafId);
        expect((conflict as SessionConflictError).actualActiveLeafId).toBe(current.session.activeLeafId);
        expect(current.session.invocations).toHaveLength(0);
        await harness.dispose();
    });

    test("CAS 失败后再次写入时不拼接跨版本冲突诊断", async () => {
        let entryIndex = 0;
        const store = new CasConflictThenWriteStore({
            idKind: "number",
            entryId: () => ["first-leaf", "second-leaf"][entryIndex++] ?? "unexpected-leaf",
        });
        const profile = defineProfile({
            manifest: {key: "workflow-anchor-atomic-conflict", name: "Workflow anchor atomic conflict"},
            initial: objectSchema,
            payload: objectSchema,
            prepare: () => ({systemPrompt: "workflow", modelConfig: {}}),
        });
        const harness = new NeuroAgentHarness({
            store,
            profiles: new ProfileRegistry().add(profile),
            model: new ScriptedModelRuntime([]),
        });

        const created = await harness.createSession({profileKey: "workflow-anchor-atomic-conflict", initial: {}, hostContext: {}});
        const anchor = {
            version: created.session.version,
            activeLeafId: created.session.activeLeafId,
        };
        const conflict = await harness.invokeAt({
            sessionId: created.session.metadata.sessionId,
            payload: {instruction: "run"},
            anchor,
        }).then(
            () => {
                throw new Error("CAS 冲突时不应启动 Invocation");
            },
            (error: unknown) => error,
        );

        expect(conflict).toBeInstanceOf(SessionConflictError);
        expect(conflict).toMatchObject({
            expectedVersion: 0,
            actualVersion: 1,
            expectedActiveLeafId: null,
            actualActiveLeafId: "first-leaf",
        });
        const current = await harness.snapshot(created.session.metadata.sessionId);
        expect(current.session.version).toBe(2);
        expect(current.session.activeLeafId).toBe("second-leaf");
        expect((conflict as SessionConflictError).actualVersion).toBe(1);
        expect((conflict as SessionConflictError).actualActiveLeafId).toBe("first-leaf");
        await harness.dispose();
    });

    test("过期 anchor 与 active Invocation 同时存在时优先返回 SessionConflictError", async () => {
        const profile = defineProfile({
            manifest: {key: "workflow-anchor-active", name: "Workflow anchor active"},
            initial: objectSchema,
            payload: objectSchema,
            prepare: () => ({systemPrompt: "workflow", modelConfig: {}}),
        });
        let release!: () => void;
        const blocked = new Promise<void>((resolve) => {
            release = resolve;
        });
        const harness = new NeuroAgentHarness({
            store: new MemorySessionStore(),
            profiles: new ProfileRegistry().add(profile),
            model: new ScriptedModelRuntime([
                async () => {
                    await blocked;
                    return {message: {role: "assistant", content: [{type: "text", text: "active"}], timestamp: 1}};
                },
            ]),
        });

        const created = await harness.createSession({profileKey: "workflow-anchor-active", initial: {}, hostContext: {}});
        const anchor = {
            version: created.session.version,
            activeLeafId: created.session.activeLeafId,
        };
        const active = await harness.invoke({
            sessionId: created.session.metadata.sessionId,
            payload: {instruction: "active"},
        });

        try {
            const conflict = await harness.invokeAt({
                sessionId: created.session.metadata.sessionId,
                payload: {instruction: "stale"},
                anchor,
            }).then(
                () => {
                    throw new Error("过期 anchor 应优先拒绝");
                },
                (error: unknown) => error,
            );

            expect(conflict).toBeInstanceOf(SessionConflictError);
            expect(conflict).toMatchObject({
                expectedVersion: anchor.version,
                actualVersion: anchor.version + 1,
                expectedActiveLeafId: anchor.activeLeafId,
                actualActiveLeafId: anchor.activeLeafId,
            });
            const current = await harness.snapshot(created.session.metadata.sessionId);
            expect(current.session.activeInvocationId).toBe(active.invocationId);
        } finally {
            release();
            await active.result();
            await harness.dispose();
        }
    });

    test("当前 anchor 与已持久化 active Invocation 冲突时返回 InvocationConflictError", async () => {
        const profile = defineProfile({
            manifest: {key: "workflow-anchor-persisted-active", name: "Workflow anchor persisted active"},
            initial: objectSchema,
            payload: objectSchema,
            prepare: () => ({systemPrompt: "workflow", modelConfig: {}}),
        });
        let markStarted!: () => void;
        const started = new Promise<void>((resolve) => {
            markStarted = resolve;
        });
        let release!: () => void;
        const blocked = new Promise<void>((resolve) => {
            release = resolve;
        });
        const harness = new NeuroAgentHarness({
            store: new MemorySessionStore(),
            profiles: new ProfileRegistry().add(profile),
            model: new ScriptedModelRuntime([
                async () => {
                    markStarted();
                    await blocked;
                    return {message: {role: "assistant", content: [{type: "text", text: "active"}], timestamp: 1}};
                },
            ]),
        });

        const created = await harness.createSession({profileKey: "workflow-anchor-persisted-active", initial: {}, hostContext: {}});
        const active = await harness.invoke({
            sessionId: created.session.metadata.sessionId,
            payload: {instruction: "active"},
        });
        await started;
        const observed = await harness.snapshot(created.session.metadata.sessionId);

        try {
            const conflict = await harness.invokeAt({
                sessionId: created.session.metadata.sessionId,
                payload: {instruction: "conflicting"},
                anchor: {
                    version: observed.session.version,
                    activeLeafId: observed.session.activeLeafId,
                },
            }).then(
                () => {
                    throw new Error("已有 active Invocation 时不应启动第二个 Invocation");
                },
                (error: unknown) => error,
            );

            expect(conflict).toBeInstanceOf(InvocationConflictError);
            expect((conflict as InvocationConflictError).invocationId).toBe(active.invocationId);
        } finally {
            release();
            await active.result();
            await harness.dispose();
        }
    });

    test("同一 anchor 的并发调用只允许一个 Invocation，并保留 CAS 冲突诊断", async () => {
        const profile = defineProfile({
            manifest: {key: "workflow-anchor-concurrent", name: "Workflow anchor concurrent"},
            initial: objectSchema,
            payload: objectSchema,
            prepare: () => ({systemPrompt: "workflow", modelConfig: {}}),
        });
        const harness = new NeuroAgentHarness({
            store: new MemorySessionStore(),
            profiles: new ProfileRegistry().add(profile),
            model: new ScriptedModelRuntime([
                {message: {role: "assistant", content: [{type: "text", text: "winner"}], timestamp: 1}},
            ]),
        });
        const created = await harness.createSession({profileKey: "workflow-anchor-concurrent", initial: {}, hostContext: {}});
        const request = {
            sessionId: created.session.metadata.sessionId,
            payload: {instruction: "run"},
            anchor: {
                version: created.session.version,
                activeLeafId: created.session.activeLeafId,
            },
        };

        const outcomes = await Promise.allSettled([
            harness.invokeAt(request),
            harness.invokeAt(request),
        ]);
        const fulfilled = outcomes.filter((outcome): outcome is PromiseFulfilledResult<Awaited<ReturnType<typeof harness.invokeAt>>> => outcome.status === "fulfilled");
        const rejected = outcomes.filter((outcome): outcome is PromiseRejectedResult => outcome.status === "rejected");
        expect(fulfilled).toHaveLength(1);
        expect(rejected).toHaveLength(1);
        expect(rejected[0]?.reason).toMatchObject({
            name: "SessionConflictError",
            expectedVersion: request.anchor.version,
            actualVersion: request.anchor.version + 1,
            expectedActiveLeafId: request.anchor.activeLeafId,
            actualActiveLeafId: request.anchor.activeLeafId,
        });
        await fulfilled[0]!.value.result();

        const snapshot = await harness.snapshot(created.session.metadata.sessionId);
        expect(snapshot.session.invocations).toHaveLength(1);
        await harness.dispose();
    });

    test("独立 JSONL Harness 并发消费同一 anchor，并可由新实例恢复获胜 Invocation", async () => {
        const directory = await mkdtemp(join(tmpdir(), "neuro-harness-workflow-anchor-jsonl-"));
        const profile = defineProfile({
            manifest: {key: "workflow-anchor-jsonl", name: "Workflow anchor JSONL"},
            initial: objectSchema,
            payload: objectSchema,
            prepare: () => ({systemPrompt: "workflow", modelConfig: {}}),
        });
        const profiles = new ProfileRegistry().add(profile);
        const firstHarness = new NeuroAgentHarness({
            store: new JsonlSessionStore({directory}),
            profiles,
            model: new ScriptedModelRuntime([
                {message: {role: "assistant", content: [{type: "text", text: "jsonl winner"}], timestamp: 1}},
            ]),
        });
        const secondHarness = new NeuroAgentHarness({
            store: new JsonlSessionStore({directory}),
            profiles,
            model: new ScriptedModelRuntime([
                {message: {role: "assistant", content: [{type: "text", text: "jsonl loser"}], timestamp: 1}},
            ]),
        });

        try {
            const created = await firstHarness.createSession({profileKey: "workflow-anchor-jsonl", initial: {}, hostContext: {}});
            const request = {
                sessionId: created.session.metadata.sessionId,
                payload: {instruction: "run"},
                anchor: {
                    version: created.session.version,
                    activeLeafId: created.session.activeLeafId,
                },
            };
            const outcomes = await Promise.allSettled([
                firstHarness.invokeAt(request),
                secondHarness.invokeAt(request),
            ]);
            const fulfilled = outcomes.filter((outcome): outcome is PromiseFulfilledResult<Awaited<ReturnType<typeof firstHarness.invokeAt>>> => outcome.status === "fulfilled");
            const rejected = outcomes.filter((outcome): outcome is PromiseRejectedResult => outcome.status === "rejected");

            expect(fulfilled).toHaveLength(1);
            expect(rejected).toHaveLength(1);
            const conflict = rejected[0]!.reason as SessionConflictError;
            expect(conflict).toBeInstanceOf(SessionConflictError);
            expect(conflict.expectedVersion).toBe(request.anchor.version);
            expect(conflict.actualVersion).toBeGreaterThan(request.anchor.version);
            expect(conflict.expectedActiveLeafId).toBe(request.anchor.activeLeafId);
            if (conflict.actualVersion === request.anchor.version + 1) {
                expect(conflict.actualActiveLeafId).toBe(request.anchor.activeLeafId);
            } else {
                expect(conflict.actualActiveLeafId).not.toBeNull();
            }
            const winner = await fulfilled[0]!.value.result();
            if (typeof winner.output !== "string") {
                throw new Error("JSONL anchor winner 缺少文本 output");
            }
            const winnerOutput = winner.output;
            expect(["jsonl winner", "jsonl loser"]).toContain(winnerOutput);

            const restoredHarness = new NeuroAgentHarness({
                store: new JsonlSessionStore({directory}),
                profiles,
                model: new ScriptedModelRuntime([]),
            });
            try {
                const restored = await restoredHarness.snapshot(created.session.metadata.sessionId);
                expect(restored.session.invocations).toHaveLength(1);
                expect(restored.session.invocations[0]?.status).toBe("completed");
                expect(restored.session.invocations[0]?.output).toBe(winnerOutput);
            } finally {
                await restoredHarness.dispose();
            }
        } finally {
            await Promise.allSettled([firstHarness.dispose(), secondHarness.dispose()]);
            await rm(directory, {recursive: true, force: true});
        }
    });
});
