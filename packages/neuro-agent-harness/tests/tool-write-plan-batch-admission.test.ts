import {describe, expect, test} from "bun:test";
import {
    NeuroAgentHarness,
    ProfileRegistry,
    SessionConflictError,
    SessionInvariantError,
    defineProfile,
    defineSchema,
    defineTool,
    type JsonObject,
    type JsonValue,
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

function toolResultMessageCount(snapshot: {entries: ReadonlyArray<{kind: string; payload: JsonValue | null}>}): number {
    return snapshot.entries.filter((entry) => {
        return entry.kind === "agent.message"
            && entry.payload !== null
            && typeof entry.payload === "object"
            && !Array.isArray(entry.payload)
            && (entry.payload as {message?: {role?: string}}).message?.role === "toolResult";
    }).length;
}

describe("Tool writePlans batch admission", () => {
    test("多 plan 内部版本冲突在任意 durable 写入前拒绝", async () => {
        let toolExecutions = 0;
        const tool = defineTool({
            name: "batch_stale",
            description: "batch stale",
            parameters: objectSchema,
            execute: (_argumentsValue, context) => {
                toolExecutions += 1;
                return {
                    content: "batch",
                    writePlans: [
                        {
                            target: context.sessionId,
                            cause: "tool.batch.first",
                            operations: [{type: "appendEntries", entries: [{kind: "tool.batch.first", payload: {step: 1}}]}],
                        },
                        {
                            target: context.sessionId,
                            expectedVersion: context.snapshot.version,
                            cause: "tool.batch.second",
                            operations: [{type: "appendEntries", entries: [{kind: "tool.batch.second", payload: {step: 2}}]}],
                        },
                    ],
                };
            },
        });
        const profiles = new ProfileRegistry();
        profiles.define({
            manifest: {key: "tool-batch-stale", name: "Tool Batch Stale"},
            initial: objectSchema,
            payload: objectSchema,
            prepare: () => ({
                systemPrompt: "batch",
                modelConfig: {},
                tools: [tool],
            }),
        });
        const model = new ScriptedModelRuntime([{
            message: {
                role: "assistant",
                content: [{type: "toolCall", call: {id: "batch-1", name: "batch_stale", arguments: {}}}],
                timestamp: 1,
            },
        }]);
        const harness = new NeuroAgentHarness({
            store: new MemorySessionStore(),
            profiles,
            model,
        });

        try {
            const created = await harness.createSession({
                profileKey: "tool-batch-stale",
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
                toolExecutions,
                firstCommitted: snapshot.session.entries.some((entry) => entry.kind === "tool.batch.first"),
                secondCommitted: snapshot.session.entries.some((entry) => entry.kind === "tool.batch.second"),
                toolResults: toolResultMessageCount(snapshot.session),
            }).toEqual({
                resultStatus: "failed",
                resultErrorName: SessionConflictError.name,
                toolExecutions: 1,
                firstCommitted: false,
                secondCommitted: false,
                toolResults: 0,
            });
        } finally {
            await harness.dispose();
        }
    });

    test("多 plan 合法序列全部提交且 toolResult 正常持久化", async () => {
        let toolExecutions = 0;
        const tool = defineTool({
            name: "batch_valid",
            description: "batch valid",
            parameters: objectSchema,
            execute: (_argumentsValue, context) => {
                toolExecutions += 1;
                return {
                    content: "batch ok",
                    writePlans: [
                        {
                            target: context.sessionId,
                            cause: "tool.batch.valid.first",
                            operations: [{type: "appendEntries", entries: [{kind: "tool.batch.valid.first", payload: {step: 1}}]}],
                        },
                        {
                            target: context.sessionId,
                            cause: "tool.batch.valid.second",
                            operations: [{type: "appendEntries", entries: [{kind: "tool.batch.valid.second", payload: {step: 2}}]}],
                        },
                    ],
                };
            },
        });
        const profiles = new ProfileRegistry();
        profiles.define({
            manifest: {key: "tool-batch-valid", name: "Tool Batch Valid"},
            initial: objectSchema,
            payload: objectSchema,
            prepare: () => ({
                systemPrompt: "batch",
                modelConfig: {},
                tools: [tool],
            }),
        });
        const model = new ScriptedModelRuntime([
            {
                message: {
                    role: "assistant",
                    content: [{type: "toolCall", call: {id: "batch-2", name: "batch_valid", arguments: {}}}],
                    timestamp: 1,
                },
            },
            assistant("batch done", 2),
        ]);
        const harness = new NeuroAgentHarness({
            store: new MemorySessionStore(),
            profiles,
            model,
        });

        try {
            const created = await harness.createSession({
                profileKey: "tool-batch-valid",
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
                toolExecutions,
                firstCommitted: snapshot.session.entries.some((entry) => entry.kind === "tool.batch.valid.first"),
                secondCommitted: snapshot.session.entries.some((entry) => entry.kind === "tool.batch.valid.second"),
                toolResults: toolResultMessageCount(snapshot.session),
            }).toEqual({
                resultStatus: "completed",
                toolExecutions: 1,
                firstCommitted: true,
                secondCommitted: true,
                toolResults: 1,
            });
        } finally {
            await harness.dispose();
        }
    });

    test("多 plan 中投影非法的操作不产生部分写入", async () => {
        let toolExecutions = 0;
        const tool = defineTool({
            name: "batch_invalid_operation",
            description: "batch invalid operation",
            parameters: objectSchema,
            execute: (_argumentsValue, context) => {
                toolExecutions += 1;
                return {
                    content: "batch",
                    writePlans: [
                        {
                            target: context.sessionId,
                            cause: "tool.batch.invalid.first",
                            operations: [{type: "appendEntries", entries: [{kind: "tool.batch.invalid.first", payload: {step: 1}}]}],
                        },
                        {
                            target: context.sessionId,
                            cause: "tool.batch.invalid.second",
                            operations: [{type: "moveLeaf", leafId: "missing-leaf"}],
                        },
                    ],
                };
            },
        });
        const profiles = new ProfileRegistry();
        profiles.define({
            manifest: {key: "tool-batch-invalid-operation", name: "Tool Batch Invalid Operation"},
            initial: objectSchema,
            payload: objectSchema,
            prepare: () => ({
                systemPrompt: "batch",
                modelConfig: {},
                tools: [tool],
            }),
        });
        const model = new ScriptedModelRuntime([{
            message: {
                role: "assistant",
                content: [{type: "toolCall", call: {id: "batch-3", name: "batch_invalid_operation", arguments: {}}}],
                timestamp: 1,
            },
        }]);
        const harness = new NeuroAgentHarness({
            store: new MemorySessionStore(),
            profiles,
            model,
        });

        try {
            const created = await harness.createSession({
                profileKey: "tool-batch-invalid-operation",
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
                toolExecutions,
                firstCommitted: snapshot.session.entries.some((entry) => entry.kind === "tool.batch.invalid.first"),
                secondCommitted: snapshot.session.entries.some((entry) => entry.kind === "tool.batch.invalid.second"),
                toolResults: toolResultMessageCount(snapshot.session),
            }).toEqual({
                resultStatus: "failed",
                resultErrorName: SessionInvariantError.name,
                toolExecutions: 1,
                firstCommitted: false,
                secondCommitted: false,
                toolResults: 0,
            });
        } finally {
            await harness.dispose();
        }
    });

    test("首个 plan 的 expectedVersion 过期时整批在任何写入前拒绝", async () => {
        let toolExecutions = 0;
        const tool = defineTool({
            name: "batch_first_stale",
            description: "batch first stale",
            parameters: objectSchema,
            execute: (_argumentsValue, context) => {
                toolExecutions += 1;
                return {
                    content: "batch",
                    writePlans: [
                        {
                            target: context.sessionId,
                            expectedVersion: context.snapshot.version - 1,
                            cause: "tool.batch.first.stale",
                            operations: [{type: "appendEntries", entries: [{kind: "tool.batch.first.stale", payload: {step: 1}}]}],
                        },
                        {
                            target: context.sessionId,
                            cause: "tool.batch.first.stale.second",
                            operations: [{type: "appendEntries", entries: [{kind: "tool.batch.first.stale.second", payload: {step: 2}}]}],
                        },
                    ],
                };
            },
        });
        const profiles = new ProfileRegistry();
        profiles.define({
            manifest: {key: "tool-batch-first-stale", name: "Tool Batch First Stale"},
            initial: objectSchema,
            payload: objectSchema,
            prepare: () => ({
                systemPrompt: "batch",
                modelConfig: {},
                tools: [tool],
            }),
        });
        const model = new ScriptedModelRuntime([{
            message: {
                role: "assistant",
                content: [{type: "toolCall", call: {id: "batch-5", name: "batch_first_stale", arguments: {}}}],
                timestamp: 1,
            },
        }]);
        const harness = new NeuroAgentHarness({
            store: new MemorySessionStore(),
            profiles,
            model,
        });

        try {
            const created = await harness.createSession({
                profileKey: "tool-batch-first-stale",
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
                toolExecutions,
                firstCommitted: snapshot.session.entries.some((entry) => entry.kind === "tool.batch.first.stale"),
                secondCommitted: snapshot.session.entries.some((entry) => entry.kind === "tool.batch.first.stale.second"),
                toolResults: toolResultMessageCount(snapshot.session),
            }).toEqual({
                resultStatus: "failed",
                resultErrorName: SessionConflictError.name,
                toolExecutions: 1,
                firstCommitted: false,
                secondCommitted: false,
                toolResults: 0,
            });
        } finally {
            await harness.dispose();
        }
    });

    test("空 writePlans 数组视为无写入并正常持久化 toolResult", async () => {
        let toolExecutions = 0;
        const tool = defineTool({
            name: "batch_empty",
            description: "batch empty",
            parameters: objectSchema,
            execute: () => {
                toolExecutions += 1;
                return {content: "no plans", writePlans: []};
            },
        });
        const profiles = new ProfileRegistry();
        profiles.define({
            manifest: {key: "tool-batch-empty", name: "Tool Batch Empty"},
            initial: objectSchema,
            payload: objectSchema,
            prepare: () => ({
                systemPrompt: "batch",
                modelConfig: {},
                tools: [tool],
            }),
        });
        const model = new ScriptedModelRuntime([
            {
                message: {
                    role: "assistant",
                    content: [{type: "toolCall", call: {id: "batch-empty", name: "batch_empty", arguments: {}}}],
                    timestamp: 1,
                },
            },
            assistant("empty done", 2),
        ]);
        const harness = new NeuroAgentHarness({
            store: new MemorySessionStore(),
            profiles,
            model,
        });

        try {
            const created = await harness.createSession({
                profileKey: "tool-batch-empty",
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
                toolExecutions,
                toolResults: toolResultMessageCount(snapshot.session),
            }).toEqual({
                resultStatus: "completed",
                toolExecutions: 1,
                toolResults: 1,
            });
        } finally {
            await harness.dispose();
        }
    });

    test("approval resume 的多 plan 同样在任意 durable 写入前拒绝", async () => {
        let toolExecutions = 0;
        const tool = defineTool({
            name: "batch_approval",
            description: "batch approval",
            parameters: objectSchema,
            approval: {
                request: () => ({prompt: "approve batch"}),
            },
            execute: (_argumentsValue, context) => {
                toolExecutions += 1;
                return {
                    content: "batch",
                    writePlans: [
                        {
                            target: context.sessionId,
                            cause: "tool.batch.approval.first",
                            operations: [{type: "appendEntries", entries: [{kind: "tool.batch.approval.first", payload: {step: 1}}]}],
                        },
                        {
                            target: context.sessionId,
                            expectedVersion: context.snapshot.version,
                            cause: "tool.batch.approval.second",
                            operations: [{type: "appendEntries", entries: [{kind: "tool.batch.approval.second", payload: {step: 2}}]}],
                        },
                    ],
                };
            },
        });
        const profiles = new ProfileRegistry();
        profiles.define({
            manifest: {key: "tool-batch-approval", name: "Tool Batch Approval"},
            initial: objectSchema,
            payload: objectSchema,
            prepare: () => ({
                systemPrompt: "batch",
                modelConfig: {},
                tools: [tool],
            }),
        });
        const model = new ScriptedModelRuntime([{
            message: {
                role: "assistant",
                content: [{type: "toolCall", call: {id: "batch-4", name: "batch_approval", arguments: {}}}],
                timestamp: 1,
            },
        }]);
        const harness = new NeuroAgentHarness({
            store: new MemorySessionStore(),
            profiles,
            model,
        });

        try {
            const created = await harness.createSession({
                profileKey: "tool-batch-approval",
                initial: {},
                hostContext: {},
            });
            const sessionId = created.session.metadata.sessionId;
            const waiting = await harness.invoke({sessionId, payload: {}});
            expect((await waiting.result()).status).toBe("waiting");
            const resumed = await harness.resume(sessionId, waiting.invocationId, [
                {toolCallId: "batch-4", approved: true},
            ]);
            const result = await resumed.result();
            const snapshot = await harness.snapshot(sessionId);

            expect({
                resultStatus: result.status,
                resultErrorName: result.error?.name,
                toolExecutions,
                firstCommitted: snapshot.session.entries.some((entry) => entry.kind === "tool.batch.approval.first"),
                secondCommitted: snapshot.session.entries.some((entry) => entry.kind === "tool.batch.approval.second"),
                toolResults: toolResultMessageCount(snapshot.session),
            }).toEqual({
                resultStatus: "failed",
                resultErrorName: SessionConflictError.name,
                toolExecutions: 1,
                firstCommitted: false,
                secondCommitted: false,
                toolResults: 0,
            });
        } finally {
            await harness.dispose();
        }
    });
});
