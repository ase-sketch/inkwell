import {describe, expect, test} from "bun:test";
import {
    NeuroAgentHarness,
    ProfileRegistry,
    SessionConflictError,
    SessionInvariantError,
    defineProfile,
    defineSchema,
    type JsonObject,
} from "../src/index.js";
import {MemorySessionStore} from "../src/storage/memory.js";
import {ScriptedModelRuntime} from "../src/testing/index.js";

const objectSchema = defineSchema<JsonObject>((value) => {
    if (value === null || typeof value !== "object" || Array.isArray(value)) {
        throw new Error("必须是 object");
    }
    return value;
});

function assistant(text: string, timestamp: number) {
    return {
        message: {
            role: "assistant" as const,
            content: [{type: "text" as const, text}],
            timestamp,
        },
    };
}

function hasKind(snapshot: {entries: ReadonlyArray<{kind: string}>}, kind: string): boolean {
    return snapshot.entries.some((entry) => entry.kind === kind);
}

describe("plan 数组批量 admission（prepareWrites / hook effects）", () => {
    test("prepareWrites 批尾 expectedVersion 过期时整批在任何 durable 写入前拒绝", async () => {
        const profile = defineProfile({
            manifest: {key: "prepare-batch-stale", name: "Prepare Batch Stale"},
            initial: objectSchema,
            payload: objectSchema,
            prepare: (context) => ({
                systemPrompt: "batch",
                modelConfig: {},
                prepareWrites: [
                    {
                        target: context.sessionId,
                        cause: "test.prepare.batch.first",
                        operations: [{type: "appendEntries", entries: [{kind: "test.prepare.batch.first", payload: {step: 1}}]}],
                    },
                    {
                        target: context.sessionId,
                        expectedVersion: context.snapshot.version,
                        cause: "test.prepare.batch.second",
                        operations: [{type: "appendEntries", entries: [{kind: "test.prepare.batch.second", payload: {step: 2}}]}],
                    },
                ],
            }),
        });
        const model = new ScriptedModelRuntime<JsonObject>([assistant("prepare done", 1)]);
        const harness = new NeuroAgentHarness({
            store: new MemorySessionStore(),
            profiles: new ProfileRegistry().add(profile),
            model,
        });

        try {
            const created = await harness.createSession({
                profileKey: profile.manifest.key,
                initial: {},
                hostContext: {},
            });
            const result = await (await harness.invoke({
                sessionId: created.session.metadata.sessionId,
                payload: {},
            })).result();
            const snapshot = await harness.snapshot(created.session.metadata.sessionId);

            expect({
                resultStatus: result.status,
                resultErrorName: result.error?.name,
                firstCommitted: hasKind(snapshot.session, "test.prepare.batch.first"),
                secondCommitted: hasKind(snapshot.session, "test.prepare.batch.second"),
            }).toEqual({
                resultStatus: "failed",
                resultErrorName: SessionConflictError.name,
                firstCommitted: false,
                secondCommitted: false,
            });
        } finally {
            await harness.dispose();
        }
    });

    test("prepareWrites 批内非法操作不产生部分写入", async () => {
        const profile = defineProfile({
            manifest: {key: "prepare-batch-invalid", name: "Prepare Batch Invalid"},
            initial: objectSchema,
            payload: objectSchema,
            prepare: (context) => ({
                systemPrompt: "batch",
                modelConfig: {},
                prepareWrites: [
                    {
                        target: context.sessionId,
                        cause: "test.prepare.invalid.first",
                        operations: [{type: "appendEntries", entries: [{kind: "test.prepare.invalid.first", payload: {step: 1}}]}],
                    },
                    {
                        target: context.sessionId,
                        cause: "test.prepare.invalid.second",
                        operations: [{type: "moveLeaf", leafId: "missing-leaf"}],
                    },
                ],
            }),
        });
        const model = new ScriptedModelRuntime<JsonObject>([assistant("prepare done", 1)]);
        const harness = new NeuroAgentHarness({
            store: new MemorySessionStore(),
            profiles: new ProfileRegistry().add(profile),
            model,
        });

        try {
            const created = await harness.createSession({
                profileKey: profile.manifest.key,
                initial: {},
                hostContext: {},
            });
            const result = await (await harness.invoke({
                sessionId: created.session.metadata.sessionId,
                payload: {},
            })).result();
            const snapshot = await harness.snapshot(created.session.metadata.sessionId);

            expect({
                resultStatus: result.status,
                resultErrorName: result.error?.name,
                firstCommitted: hasKind(snapshot.session, "test.prepare.invalid.first"),
                secondCommitted: hasKind(snapshot.session, "test.prepare.invalid.second"),
            }).toEqual({
                resultStatus: "failed",
                resultErrorName: SessionInvariantError.name,
                firstCommitted: false,
                secondCommitted: false,
            });
        } finally {
            await harness.dispose();
        }
    });

    test("prepareWrites 批首 expectedVersion 过期时整批在任何 durable 写入前拒绝", async () => {
        const profile = defineProfile({
            manifest: {key: "prepare-batch-head-stale", name: "Prepare Batch Head Stale"},
            initial: objectSchema,
            payload: objectSchema,
            prepare: (context) => ({
                systemPrompt: "batch",
                modelConfig: {},
                prepareWrites: [
                    {
                        target: context.sessionId,
                        expectedVersion: context.snapshot.version - 1,
                        cause: "test.prepare.head-stale.first",
                        operations: [{type: "appendEntries", entries: [{kind: "test.prepare.head-stale.first", payload: {step: 1}}]}],
                    },
                    {
                        target: context.sessionId,
                        cause: "test.prepare.head-stale.second",
                        operations: [{type: "appendEntries", entries: [{kind: "test.prepare.head-stale.second", payload: {step: 2}}]}],
                    },
                ],
            }),
        });
        const model = new ScriptedModelRuntime<JsonObject>([assistant("prepare done", 1)]);
        const harness = new NeuroAgentHarness({
            store: new MemorySessionStore(),
            profiles: new ProfileRegistry().add(profile),
            model,
        });

        try {
            const created = await harness.createSession({
                profileKey: profile.manifest.key,
                initial: {},
                hostContext: {},
            });
            const result = await (await harness.invoke({
                sessionId: created.session.metadata.sessionId,
                payload: {},
            })).result();
            const snapshot = await harness.snapshot(created.session.metadata.sessionId);

            expect({
                resultStatus: result.status,
                resultErrorName: result.error?.name,
                firstCommitted: hasKind(snapshot.session, "test.prepare.head-stale.first"),
                secondCommitted: hasKind(snapshot.session, "test.prepare.head-stale.second"),
            }).toEqual({
                resultStatus: "failed",
                resultErrorName: SessionConflictError.name,
                firstCommitted: false,
                secondCommitted: false,
            });
        } finally {
            await harness.dispose();
        }
    });

    test("beforeTurn effect 批尾 expectedVersion 过期时整批在任何 durable 写入前拒绝", async () => {
        const profile = defineProfile({
            manifest: {key: "before-turn-batch-stale", name: "Before Turn Batch Stale"},
            initial: objectSchema,
            payload: objectSchema,
            hooks: [{
                name: "persist-batch",
                stage: "beforeTurn",
                run: (context) => ({
                    writePlans: [
                        {
                            target: context.sessionId,
                            cause: "test.before-turn.batch.first",
                            operations: [{type: "appendEntries", entries: [{kind: "test.before-turn.batch.first", payload: {step: 1}}]}],
                        },
                        {
                            target: context.sessionId,
                            expectedVersion: context.snapshot.version,
                            cause: "test.before-turn.batch.second",
                            operations: [{type: "appendEntries", entries: [{kind: "test.before-turn.batch.second", payload: {step: 2}}]}],
                        },
                    ],
                }),
            }],
            prepare: () => ({
                systemPrompt: "batch",
                modelConfig: {},
            }),
        });
        const model = new ScriptedModelRuntime<JsonObject>([assistant("turn done", 1)]);
        const harness = new NeuroAgentHarness({
            store: new MemorySessionStore(),
            profiles: new ProfileRegistry().add(profile),
            model,
        });

        try {
            const created = await harness.createSession({
                profileKey: profile.manifest.key,
                initial: {},
                hostContext: {},
            });
            const result = await (await harness.invoke({
                sessionId: created.session.metadata.sessionId,
                payload: {},
            })).result();
            const snapshot = await harness.snapshot(created.session.metadata.sessionId);

            expect({
                resultStatus: result.status,
                resultErrorName: result.error?.name,
                firstCommitted: hasKind(snapshot.session, "test.before-turn.batch.first"),
                secondCommitted: hasKind(snapshot.session, "test.before-turn.batch.second"),
            }).toEqual({
                resultStatus: "failed",
                resultErrorName: SessionConflictError.name,
                firstCommitted: false,
                secondCommitted: false,
            });
        } finally {
            await harness.dispose();
        }
    });

    test("beforeTurn effect 批内非法操作不产生部分写入", async () => {
        const profile = defineProfile({
            manifest: {key: "before-turn-batch-invalid", name: "Before Turn Batch Invalid"},
            initial: objectSchema,
            payload: objectSchema,
            hooks: [{
                name: "persist-batch",
                stage: "beforeTurn",
                run: (context) => ({
                    writePlans: [
                        {
                            target: context.sessionId,
                            cause: "test.before-turn.invalid.first",
                            operations: [{type: "appendEntries", entries: [{kind: "test.before-turn.invalid.first", payload: {step: 1}}]}],
                        },
                        {
                            target: context.sessionId,
                            cause: "test.before-turn.invalid.second",
                            operations: [{type: "moveLeaf", leafId: "missing-leaf"}],
                        },
                    ],
                }),
            }],
            prepare: () => ({
                systemPrompt: "batch",
                modelConfig: {},
            }),
        });
        const model = new ScriptedModelRuntime<JsonObject>([assistant("turn done", 1)]);
        const harness = new NeuroAgentHarness({
            store: new MemorySessionStore(),
            profiles: new ProfileRegistry().add(profile),
            model,
        });

        try {
            const created = await harness.createSession({
                profileKey: profile.manifest.key,
                initial: {},
                hostContext: {},
            });
            const result = await (await harness.invoke({
                sessionId: created.session.metadata.sessionId,
                payload: {},
            })).result();
            const snapshot = await harness.snapshot(created.session.metadata.sessionId);

            expect({
                resultStatus: result.status,
                resultErrorName: result.error?.name,
                firstCommitted: hasKind(snapshot.session, "test.before-turn.invalid.first"),
                secondCommitted: hasKind(snapshot.session, "test.before-turn.invalid.second"),
            }).toEqual({
                resultStatus: "failed",
                resultErrorName: SessionInvariantError.name,
                firstCommitted: false,
                secondCommitted: false,
            });
        } finally {
            await harness.dispose();
        }
    });

    test("settleFailure effect 批尾 expectedVersion 过期时整批在任何 durable 写入前拒绝", async () => {
        let settleFailureRuns = 0;
        const profile = defineProfile({
            manifest: {key: "settle-failure-batch-stale", name: "Settle Failure Batch Stale"},
            initial: objectSchema,
            payload: objectSchema,
            hooks: [{
                name: "persist-batch",
                stage: "settleFailure" as const,
                run: (context) => {
                    settleFailureRuns += 1;
                    return {
                        writePlans: [
                            {
                                target: context.sessionId,
                                cause: "test.settle-failure.batch.first",
                                operations: [{type: "appendEntries", entries: [{kind: "test.settle-failure.batch.first", payload: {step: 1}}]}],
                            },
                            {
                                target: context.sessionId,
                                expectedVersion: context.snapshot.version,
                                cause: "test.settle-failure.batch.second",
                                operations: [{type: "appendEntries", entries: [{kind: "test.settle-failure.batch.second", payload: {step: 2}}]}],
                            },
                        ],
                    };
                },
            }],
            prepare: () => ({
                systemPrompt: "batch",
                modelConfig: {},
            }),
        });
        const model = new ScriptedModelRuntime<JsonObject>([async () => {
            throw new Error("boom");
        }]);
        const harness = new NeuroAgentHarness({
            store: new MemorySessionStore(),
            profiles: new ProfileRegistry().add(profile),
            model,
        });

        try {
            const created = await harness.createSession({
                profileKey: profile.manifest.key,
                initial: {},
                hostContext: {},
            });
            const result = await (await harness.invoke({
                sessionId: created.session.metadata.sessionId,
                payload: {},
            })).result();
            const snapshot = await harness.snapshot(created.session.metadata.sessionId);

            expect({
                resultStatus: result.status,
                settleFailureRuns,
                originalErrorPreserved: result.error?.message.includes("boom"),
                firstCommitted: hasKind(snapshot.session, "test.settle-failure.batch.first"),
                secondCommitted: hasKind(snapshot.session, "test.settle-failure.batch.second"),
            }).toEqual({
                resultStatus: "failed",
                settleFailureRuns: 1,
                originalErrorPreserved: true,
                firstCommitted: false,
                secondCommitted: false,
            });
        } finally {
            await harness.dispose();
        }
    });

    test("abort settlement（allowInvalidated）的批尾 stale 同样在写入前拒绝且不破坏 abort terminal", async () => {
        let settleFailureRuns = 0;
        const profile = defineProfile({
            manifest: {key: "abort-settlement-batch-stale", name: "Abort Settlement Batch Stale"},
            initial: objectSchema,
            payload: objectSchema,
            hooks: [{
                name: "persist-batch",
                stage: "settleFailure" as const,
                run: (context) => {
                    settleFailureRuns += 1;
                    return {
                        writePlans: [
                            {
                                target: context.sessionId,
                                cause: "test.abort-settlement.batch.first",
                                operations: [{type: "appendEntries", entries: [{kind: "test.abort-settlement.batch.first", payload: {step: 1}}]}],
                            },
                            {
                                target: context.sessionId,
                                expectedVersion: context.snapshot.version,
                                cause: "test.abort-settlement.batch.second",
                                operations: [{type: "appendEntries", entries: [{kind: "test.abort-settlement.batch.second", payload: {step: 2}}]}],
                            },
                        ],
                    };
                },
            }],
            prepare: () => ({
                systemPrompt: "batch",
                modelConfig: {},
            }),
        });
        const model = new ScriptedModelRuntime<JsonObject>([async (request) => new Promise((_, reject) => {
            request.signal.addEventListener("abort", () => reject(new Error("aborted")), {once: true});
        })]);
        const harness = new NeuroAgentHarness({
            store: new MemorySessionStore(),
            profiles: new ProfileRegistry().add(profile),
            model,
        });

        try {
            const created = await harness.createSession({
                profileKey: profile.manifest.key,
                initial: {},
                hostContext: {},
            });
            const handle = await harness.invoke({
                sessionId: created.session.metadata.sessionId,
                payload: {},
            });
            handle.abort();
            const result = await handle.result();
            const snapshot = await harness.snapshot(created.session.metadata.sessionId);

            expect({
                resultStatus: result.status,
                settleFailureRuns,
                firstCommitted: hasKind(snapshot.session, "test.abort-settlement.batch.first"),
                secondCommitted: hasKind(snapshot.session, "test.abort-settlement.batch.second"),
            }).toEqual({
                resultStatus: "aborted",
                settleFailureRuns: 1,
                firstCommitted: false,
                secondCommitted: false,
            });
        } finally {
            await harness.dispose();
        }
    });

    test("合法多 plan 数组全部提交且 Invocation 正常完成", async () => {
        const profile = defineProfile({
            manifest: {key: "plan-array-valid", name: "Plan Array Valid"},
            initial: objectSchema,
            payload: objectSchema,
            hooks: [{
                name: "persist-batch",
                stage: "beforeTurn",
                run: (context) => ({
                    writePlans: [
                        {
                            target: context.sessionId,
                            cause: "test.plan-array.valid.first",
                            operations: [{type: "appendEntries", entries: [{kind: "test.plan-array.valid.first", payload: {step: 1}}]}],
                        },
                        {
                            target: context.sessionId,
                            cause: "test.plan-array.valid.second",
                            operations: [{type: "appendEntries", entries: [{kind: "test.plan-array.valid.second", payload: {step: 2}}]}],
                        },
                    ],
                }),
            }],
            prepare: () => ({
                systemPrompt: "batch",
                modelConfig: {},
            }),
        });
        const model = new ScriptedModelRuntime<JsonObject>([assistant("turn done", 1)]);
        const harness = new NeuroAgentHarness({
            store: new MemorySessionStore(),
            profiles: new ProfileRegistry().add(profile),
            model,
        });

        try {
            const created = await harness.createSession({
                profileKey: profile.manifest.key,
                initial: {},
                hostContext: {},
            });
            const result = await (await harness.invoke({
                sessionId: created.session.metadata.sessionId,
                payload: {},
            })).result();
            const snapshot = await harness.snapshot(created.session.metadata.sessionId);
            const batchEntries = snapshot.session.entries.filter((entry) => {
                return entry.kind === "test.plan-array.valid.first" || entry.kind === "test.plan-array.valid.second";
            });

            expect({
                resultStatus: result.status,
                firstCommitted: hasKind(snapshot.session, "test.plan-array.valid.first"),
                secondCommitted: hasKind(snapshot.session, "test.plan-array.valid.second"),
                batchPayloadOrder: batchEntries.map((entry) => (entry.payload as {step: number}).step),
            }).toEqual({
                resultStatus: "completed",
                firstCommitted: true,
                secondCommitted: true,
                batchPayloadOrder: [1, 2],
            });
        } finally {
            await harness.dispose();
        }
    });
});
