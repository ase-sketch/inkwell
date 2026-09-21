import {describe, expect, test} from "bun:test";
import {randomUUID} from "node:crypto";
import {
    assertSessionCommitNotAborted,
    NeuroAgentHarness,
    ProfileRegistry,
    createAgentMessageEntryDraft,
    defineSchema,
    reduceSessionWritePlan,
    type InvocationRecord,
    type JsonObject,
    type SessionCommitOptions,
    type SessionCommitResult,
    type SessionCreateInput,
    type SessionSnapshot,
    type SessionStore,
    type SessionWritePlan,
} from "../src/index.js";
import {MemorySessionStore} from "../src/storage/memory.js";
import {ScriptedModelRuntime} from "../src/testing/index.js";

function deferred<T>(): {promise: Promise<T>; resolve(value: T): void} {
    let resolve!: (value: T) => void;
    const promise = new Promise<T>((resolvePromise) => {
        resolve = resolvePromise;
    });
    return {promise, resolve};
}

class GatedCompactionCommitStore implements SessionStore<number, JsonObject> {
    private readonly delegate = new MemorySessionStore<number, JsonObject>();
    private readonly queues = new Map<number, Promise<void>>();
    readonly compactionCommitStarted = deferred<void>();
    readonly releaseCompactionCommit = deferred<void>();

    allocateId(): Promise<number> {
        return this.delegate.allocateId();
    }

    create(input: SessionCreateInput<number, JsonObject>): Promise<SessionSnapshot<number, JsonObject>> {
        return this.delegate.create(input);
    }

    read(sessionId: number): Promise<SessionSnapshot<number, JsonObject>> {
        return this.delegate.read(sessionId);
    }

    async commit(
        plan: SessionWritePlan<number, JsonObject>,
        options?: SessionCommitOptions,
    ): Promise<SessionCommitResult<number, JsonObject>> {
        return this.withLock(plan.target, async () => {
            if (plan.cause === "harness.compaction") {
                const current = await this.delegate.read(plan.target);
                reduceSessionWritePlan(current, plan, {
                    now: Date.now,
                    entryId: randomUUID,
                });
                this.compactionCommitStarted.resolve(undefined);
                await this.releaseCompactionCommit.promise;
                assertSessionCommitNotAborted(plan.target, options);
            }
            return this.delegate.commit(plan, options);
        });
    }

    reconcileInterrupted(): Promise<readonly InvocationRecord<number>[]> {
        return this.delegate.reconcileInterrupted();
    }

    private async withLock<TResult>(sessionId: number, task: () => Promise<TResult>): Promise<TResult> {
        const previous = this.queues.get(sessionId) ?? Promise.resolve();
        let release!: () => void;
        const current = new Promise<void>((resolve) => {
            release = resolve;
        });
        const tail = previous.catch(() => undefined).then(() => current);
        this.queues.set(sessionId, tail);
        await previous.catch(() => undefined);
        try {
            return await task();
        } finally {
            release();
            if (this.queues.get(sessionId) === tail) {
                this.queues.delete(sessionId);
            }
        }
    }
}

const schema = defineSchema<JsonObject>((value) => {
    if (value === null || typeof value !== "object" || Array.isArray(value)) {
        throw new Error("必须是 object");
    }
    return value;
});

describe("Core-owned entry admission", () => {
    test("public write cannot forge an agent.compaction projection fact", async () => {
        const registry = new ProfileRegistry();
        registry.define({
            manifest: {key: "core-owned-entry", name: "Core-owned entry"},
            initial: schema,
            payload: schema,
            prepare: () => ({systemPrompt: "test", modelConfig: {}}),
        });
        const harness = new NeuroAgentHarness({
            store: new MemorySessionStore<number, JsonObject>(),
            profiles: registry,
            model: new ScriptedModelRuntime([]),
        });
        try {
            const created = await harness.createSession({
                profileKey: "core-owned-entry",
                initial: {},
                hostContext: {},
            });
            const sessionId = created.session.metadata.sessionId;
            const withMessage = await harness.write({
                target: sessionId,
                expectedVersion: created.session.version,
                cause: "host.append-message",
                operations: [{
                    type: "appendEntries",
                    entries: [createAgentMessageEntryDraft({
                        role: "user",
                        content: "old durable message",
                        timestamp: 1,
                    }, {turn: 0})],
                }],
            });
            const messageEntryId = withMessage.session.entries[0]!.id;

            await expect(harness.write({
                target: sessionId,
                expectedVersion: withMessage.session.version,
                cause: "host.forge-compaction",
                operations: [{
                    type: "appendEntries",
                    entries: [{
                        kind: "agent.compaction",
                        parentId: messageEntryId,
                        payload: {
                            summary: "forged summary",
                            firstKeptEntryId: messageEntryId,
                            tokensBefore: 1,
                        },
                    }],
                }],
            })).rejects.toThrow("Harness 保留");

            const after = await harness.snapshot(sessionId);
            expect(after.session.version).toBe(withMessage.session.version);
            expect(after.session.entries).toHaveLength(1);
            expect(after.session.entries[0]?.kind).toBe("agent.message");
        } finally {
            await harness.dispose();
        }
    });

    test("Profile effect cannot forge an agent.compaction projection fact", async () => {
        const registry = new ProfileRegistry();
        registry.define({
            manifest: {key: "core-owned-effect", name: "Core-owned effect"},
            initial: schema,
            payload: schema,
            hooks: [{
                name: "forge-compaction",
                stage: "beforeTurn",
                run(context) {
                    return {
                        writePlans: [{
                            target: context.sessionId,
                            expectedVersion: context.snapshot.version,
                            cause: "profile.forge-compaction",
                            operations: [{
                                type: "appendEntries",
                                entries: [{
                                    kind: "agent.compaction",
                                    invocationId: context.invocationId,
                                    payload: {
                                        summary: "forged summary",
                                        firstKeptEntryId: null,
                                        tokensBefore: 1,
                                    },
                                }],
                            }],
                        }],
                    };
                },
            }],
            prepare: () => ({systemPrompt: "test", modelConfig: {}}),
        });
        const model = new ScriptedModelRuntime([{
            message: {
                role: "assistant",
                content: [{type: "text", text: "must not run"}],
                timestamp: 1,
            },
        }]);
        const harness = new NeuroAgentHarness({
            store: new MemorySessionStore<number, JsonObject>(),
            profiles: registry,
            model,
        });
        try {
            const created = await harness.createSession({
                profileKey: "core-owned-effect",
                initial: {},
                hostContext: {},
            });
            const result = await (await harness.invoke({
                sessionId: created.session.metadata.sessionId,
                payload: {prompt: "forge"},
            })).result();

            expect(result.status).toBe("failed");
            expect(result.error?.message).toContain("Harness 保留");
            expect(model.requests).toHaveLength(0);
            const snapshot = await harness.snapshot(created.session.metadata.sessionId);
            expect(snapshot.session.entries.some((entry) => entry.kind === "agent.compaction")).toBe(false);
        } finally {
            await harness.dispose();
        }
    });

    test("abort during compaction commit cannot persist a late compaction fact", async () => {
        const registry = new ProfileRegistry();
        registry.define({
            manifest: {key: "compaction-abort-race", name: "Compaction abort race"},
            initial: schema,
            payload: schema,
            prepare: () => ({
                systemPrompt: "test",
                modelConfig: {},
                compaction: {triggerTokens: 3, keepRecentTokens: 1},
            }),
        });
        const store = new GatedCompactionCommitStore();
        const harness = new NeuroAgentHarness({
            store,
            profiles: registry,
            model: new ScriptedModelRuntime([
                {message: {role: "assistant", content: [{type: "text", text: "old"}], timestamp: 1}},
                {message: {role: "assistant", content: [{type: "text", text: "new"}], timestamp: 2}},
            ]),
            compactor: {
                estimate: () => 1,
                summarize: async () => "late summary",
            },
            abortGraceMs: 1000,
        });
        try {
            const created = await harness.createSession({
                profileKey: "compaction-abort-race",
                initial: {},
                hostContext: {},
            });
            const sessionId = created.session.metadata.sessionId;
            expect((await (await harness.invoke({sessionId, payload: {old: true}})).result()).status).toBe("completed");

            const handle = await harness.invoke({sessionId, payload: {new: true}});
            await store.compactionCommitStarted.promise;
            handle.abort();
            store.releaseCompactionCommit.resolve(undefined);

            expect((await handle.result()).status).toBe("aborted");
            const snapshot = await harness.snapshot(sessionId);
            expect(snapshot.session.entries.some((entry) => entry.kind === "agent.compaction")).toBe(false);
        } finally {
            await harness.dispose();
        }
    });
});
