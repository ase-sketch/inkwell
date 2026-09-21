import {describe, expect, test} from "bun:test";
import {mkdir, mkdtemp, rm, writeFile} from "node:fs/promises";
import {join} from "node:path";
import {tmpdir} from "node:os";
import type {JsonObject} from "../src/json.js";
import {
    NeuroAgentHarness,
    ProfileRegistry,
    defineProfile,
    defineSchema,
    defineTool,
} from "../src/index.js";
import {
    normalizeSessionSnapshot,
    reduceSessionWritePlan,
    type SessionEntry,
    type InvocationRecord,
    type SessionCommitResult,
    type SessionSnapshot,
    type SessionStore,
    type SessionWritePlan,
} from "../src/session.js";
import type {ApprovalRequest} from "../src/approval.js";
import {JsonlSessionStore} from "../src/storage/jsonl.js";

// Session Invocation coherence admission（第 66 轮）：
// 第四十四轮只收紧写侧 setStatus；读侧 normalizeSessionSnapshot 目前接受
// 重复 Invocation ID、悬挂 active Invocation、idle Session 配 running
// Invocation 等 reducer 永远无法产生的矛盾状态，reconcile/abort 对这类
// 损坏文件出现盲区。本文件锁定「矛盾 Invocation 状态必须 read fail closed」，
// 只检查结构性矛盾，不检查旧记录缺失的可选字段（profileVersion、
// messageIdentity、turnCount 等由 normalize 兼容）。

function invocation(id: string, status: InvocationRecord<number>["status"]): InvocationRecord<number> {
    return {
        id,
        sessionId: 1,
        profileKey: "coherence",
        caller: {kind: "user"},
        input: {},
        status,
        turnCount: status === "running" ? 0 : 1,
        createdAt: 1,
        ...(status === "completed" ? {finishedAt: 2} : {}),
    };
}

function approval(id: string): ApprovalRequest {
    return {toolCallId: id, toolName: "gated", prompt: "approve", arguments: {}};
}

function messageEntry(id: string, invocationId: string, turn: number): SessionEntry {
    return {
        id,
        kind: "agent.message",
        invocationId,
        parentId: null,
        timestamp: 1,
        payload: {
            turn,
            message: {
                role: "assistant",
                content: [{type: "text", text: "t"}],
                timestamp: 1,
            },
        },
    };
}

function snapshot(overrides: Partial<SessionSnapshot<number, JsonObject>>): SessionSnapshot<number, JsonObject> {
    return {
        metadata: {sessionId: 1, profileKey: "coherence", initial: {}, hostContext: {}, createdAt: 1},
        version: 0,
        status: "idle",
        activeLeafId: null,
        activeInvocationId: null,
        entries: [],
        invocations: [],
        ...overrides,
    };
}

async function readJsonl(snapshot: SessionSnapshot<number, JsonObject>): Promise<void> {
    const directory = await mkdtemp(join(tmpdir(), "harness-coherence-"));
    try {
        const sessionsDirectory = join(directory, "sessions");
        await mkdir(sessionsDirectory, {recursive: true});
        await writeFile(
            join(sessionsDirectory, "1.jsonl"),
            `${JSON.stringify({kind: "snapshot", cause: "test.coherence", snapshot, appendedEntryIds: []})}\n`,
            "utf8",
        );
        const store = new JsonlSessionStore<JsonObject>({directory});
        await store.read(1);
    } finally {
        await rm(directory, {recursive: true, force: true});
    }
}

describe("Session Invocation coherence admission", () => {
    test("重复 Invocation ID 拒绝", () => {
        expect(() => normalizeSessionSnapshot(snapshot({
            invocations: [invocation("i1", "completed"), invocation("i1", "failed")],
        }))).toThrow("Invocation i1 重复");
    });

    test("悬挂 activeInvocationId 拒绝", () => {
        expect(() => normalizeSessionSnapshot(snapshot({
            status: "running",
            activeInvocationId: "ghost",
            invocations: [],
        }))).toThrow("active Invocation ghost 不存在");
    });

    test("active Invocation 指向 terminal 状态拒绝", () => {
        expect(() => normalizeSessionSnapshot(snapshot({
            activeInvocationId: "i1",
            invocations: [invocation("i1", "completed")],
        }))).toThrow("active Invocation i1 状态为 completed，不能作为 active owner");
    });

    test("Session running 但无 active Invocation 拒绝", () => {
        expect(() => normalizeSessionSnapshot(snapshot({
            status: "running",
            invocations: [],
        }))).toThrow("Session 状态 running 必须有 active Invocation");
    });

    test("Session idle 配 running Invocation 拒绝", () => {
        expect(() => normalizeSessionSnapshot(snapshot({
            invocations: [invocation("i1", "running")],
        }))).toThrow("非 active Invocation i1 不能是 running");
    });

    test("Session waiting 与 running active Invocation 矛盾拒绝", () => {
        expect(() => normalizeSessionSnapshot(snapshot({
            status: "waiting",
            activeInvocationId: "i1",
            invocations: [invocation("i1", "running")],
        }))).toThrow("Session 状态 waiting 与 active Invocation i1 状态 running 不一致");
    });

    test("Session aborting 必须指向 running/waiting active Invocation", () => {
        expect(() => normalizeSessionSnapshot(snapshot({
            status: "aborting",
            activeInvocationId: "i1",
            invocations: [invocation("i1", "completed")],
        }))).toThrow("active Invocation i1 状态为 completed，不能作为 active owner");
    });

    test("两个 running Invocation 拒绝（非 active 僵尸）", () => {
        expect(() => normalizeSessionSnapshot(snapshot({
            status: "running",
            activeInvocationId: "i1",
            invocations: [invocation("i1", "running"), invocation("i2", "running")],
        }))).toThrow("非 active Invocation i2 不能是 running");
    });

    test("缺失 activeInvocationId 按 null 归一，不报误导消息", () => {
        const legacy = JSON.parse(JSON.stringify(snapshot({})));
        delete legacy.activeInvocationId;
        expect(normalizeSessionSnapshot(legacy).activeInvocationId).toBeNull();
        const runningWithoutOwner = JSON.parse(JSON.stringify(snapshot({status: "running"})));
        delete runningWithoutOwner.activeInvocationId;
        expect(() => normalizeSessionSnapshot(runningWithoutOwner))
            .toThrow("Session 状态 running 必须有 active Invocation");
    });

    test("合法状态组合全部通过", () => {
        expect(normalizeSessionSnapshot(snapshot({})).invocations).toHaveLength(0);
        const running = normalizeSessionSnapshot(snapshot({
            status: "running",
            activeInvocationId: "i1",
            invocations: [invocation("i1", "running")],
        }));
        expect(running.status).toBe("running");
        const waiting = normalizeSessionSnapshot(snapshot({
            status: "waiting",
            activeInvocationId: "i1",
            invocations: [{
                ...invocation("i1", "waiting"),
                pendingApprovals: [approval("approval-1")],
            }],
        }));
        expect(waiting.status).toBe("waiting");
        const abortingRunning = normalizeSessionSnapshot(snapshot({
            status: "aborting",
            activeInvocationId: "i1",
            invocations: [invocation("i1", "running")],
        }));
        expect(abortingRunning.status).toBe("aborting");
        const abortingWaiting = normalizeSessionSnapshot(snapshot({
            status: "aborting",
            activeInvocationId: "i1",
            invocations: [{
                ...invocation("i1", "waiting"),
                pendingApprovals: [approval("approval-1")],
            }],
        }));
        expect(abortingWaiting.status).toBe("aborting");
        const interrupted = normalizeSessionSnapshot(snapshot({
            status: "interrupted",
            invocations: [invocation("i1", "interrupted")],
        }));
        expect(interrupted.status).toBe("interrupted");
        const archived = normalizeSessionSnapshot(snapshot({
            status: "archived",
            invocations: [invocation("i1", "completed")],
        }));
        expect(archived.status).toBe("archived");
        const multiTerminal = normalizeSessionSnapshot(snapshot({
            invocations: [invocation("i1", "completed"), invocation("i2", "failed"), invocation("i3", "aborted"), invocation("i4", "interrupted")],
        }));
        expect(multiTerminal.invocations).toHaveLength(4);
    });

    test("JSONL read 对矛盾 Invocation 状态 fail closed，且合法状态可读", async () => {
        await expect(readJsonl(snapshot({
            status: "idle",
            invocations: [invocation("i1", "running")],
        }))).rejects.toThrow("非 active Invocation i1 不能是 running");
        await readJsonl(snapshot({
            status: "running",
            activeInvocationId: "i1",
            invocations: [invocation("i1", "running")],
        }));
    });
});

describe("Approval fact coherence admission", () => {
    test("waiting 且 pendingApprovals 显式为空数组拒绝（审批门禁绕过）", () => {
        expect(() => normalizeSessionSnapshot(snapshot({
            status: "waiting",
            activeInvocationId: "i1",
            invocations: [{...invocation("i1", "waiting"), pendingApprovals: []}],
        }))).toThrow("waiting Invocation i1 必须包含 pending approval");
    });

    test("waiting 且缺失 pendingApprovals 拒绝（同一绕过面）", () => {
        const waiting = JSON.parse(JSON.stringify(snapshot({
            status: "waiting",
            activeInvocationId: "i1",
            invocations: [invocation("i1", "waiting")],
        })));
        delete waiting.invocations[0].pendingApprovals;
        expect(() => normalizeSessionSnapshot(waiting))
            .toThrow("waiting Invocation i1 必须包含 pending approval");
    });

    test("pendingApprovals 内重复 toolCallId 拒绝", () => {
        expect(() => normalizeSessionSnapshot(snapshot({
            status: "waiting",
            activeInvocationId: "i1",
            invocations: [{
                ...invocation("i1", "waiting"),
                pendingApprovals: [approval("approval-1"), approval("approval-1")],
            }],
        }))).toThrow("Invocation i1 pendingApprovals 包含重复 toolCallId approval-1");
    });

    test("waiting turnCount 低于自身已提交最大 turn 拒绝", () => {
        expect(() => normalizeSessionSnapshot(snapshot({
            status: "waiting",
            activeInvocationId: "i1",
            activeLeafId: "e5",
            invocations: [{
                ...invocation("i1", "waiting"),
                turnCount: 2,
                pendingApprovals: [approval("approval-1")],
            }],
            entries: [
                messageEntry("e0", "i1", 0),
                messageEntry("e1", "i1", 1),
                messageEntry("e5", "i1", 5),
            ],
        }))).toThrow("waiting Invocation i1 turnCount 回退（已提交最大 turn 5）");
    });

    test("waiting turnCount 缺失或负数拒绝", () => {
        const missingTurnCount = JSON.parse(JSON.stringify(snapshot({
            status: "waiting",
            activeInvocationId: "i1",
            invocations: [{
                ...invocation("i1", "waiting"),
                pendingApprovals: [approval("approval-1")],
            }],
        })));
        delete missingTurnCount.invocations[0].turnCount;
        expect(() => normalizeSessionSnapshot(missingTurnCount))
            .toThrow("waiting Invocation i1 turnCount 必须是非负整数");
        expect(() => normalizeSessionSnapshot(snapshot({
            status: "waiting",
            activeInvocationId: "i1",
            invocations: [{
                ...invocation("i1", "waiting"),
                turnCount: -1,
                pendingApprovals: [approval("approval-1")],
            }],
        }))).toThrow("waiting Invocation i1 turnCount 必须是非负整数");
    });

    test("合法 waiting 组合通过", () => {
        const waiting = normalizeSessionSnapshot(snapshot({
            status: "waiting",
            activeInvocationId: "i1",
            activeLeafId: "e1",
            invocations: [{
                ...invocation("i1", "waiting"),
                turnCount: 1,
                pendingApprovals: [approval("approval-1")],
            }],
            entries: [
                messageEntry("e0", "i1", 0),
                messageEntry("e1", "i1", 1),
            ],
        }));
        expect(waiting.status).toBe("waiting");
        expect(waiting.invocations[0]?.pendingApprovals).toHaveLength(1);
    });

    test("JSONL read 与 harness.resume 对空 pendingApprovals fail closed，不执行 Tool", async () => {
        const directory = await mkdtemp(join(tmpdir(), "harness-approval-empty-"));
        try {
            const sessionsDirectory = join(directory, "sessions");
            await mkdir(sessionsDirectory, {recursive: true});
            await writeFile(
                join(sessionsDirectory, "1.jsonl"),
                `${JSON.stringify({
                    kind: "snapshot",
                    cause: "test.empty-approvals",
                    snapshot: {
                        ...snapshot({
                            status: "waiting",
                            activeInvocationId: "i1",
                            activeLeafId: "e0",
                            invocations: [{...invocation("i1", "waiting"), pendingApprovals: []}],
                            entries: [messageEntry("e0", "i1", 0)],
                        }),
                    },
                    appendedEntryIds: ["e0"],
                })}\n`,
                "utf8",
            );
            const store = new JsonlSessionStore<JsonObject>({directory});
            await expect(store.read(1)).rejects.toThrow("waiting Invocation i1 必须包含 pending approval");

            const objectSchema = defineSchema<JsonObject>((value) => {
                if (value === null || typeof value !== "object" || Array.isArray(value)) {
                    throw new Error("必须是 object");
                }
                return value;
            });
            let toolExecutions = 0;
            const approvalTool = defineTool({
                name: "gated",
                description: "gated",
                parameters: objectSchema,
                approval: {request: () => ({prompt: "approve"})},
                execute: () => {
                    toolExecutions += 1;
                    return {content: "executed"};
                },
            });
            const harness = new NeuroAgentHarness({
                store,
                profiles: new ProfileRegistry().add(
                    defineProfile({
                        manifest: {key: "empty-approvals", name: "empty-approvals"},
                        initial: objectSchema,
                        payload: objectSchema,
                        prepare: () => ({systemPrompt: "p", modelConfig: {}, tools: [approvalTool]}),
                    }),
                ),
                model: {
                    runTurn: async () => {
                        throw new Error("model must not run");
                    },
                },
            });
            await expect(harness.resume(1, "i1", [])).rejects.toThrow(
                "waiting Invocation i1 必须包含 pending approval",
            );
            expect(toolExecutions).toBe(0);
            await harness.dispose();
        } finally {
            await rm(directory, {recursive: true, force: true});
        }
    });
});

describe("waitInvocation 写侧 admission", () => {
    const dependencies = {now: () => 1, entryId: () => "generated"};

    function waitingPlan(turnCount: number, pendingApprovals: ApprovalRequest[]) {
        return {
            target: 1,
            cause: "test.wait-admission",
            operations: [{type: "waitInvocation" as const, invocationId: "i1", turnCount, pendingApprovals}],
        };
    }

    test("重复 toolCallId 在写边界拒绝", () => {
        expect(() => reduceSessionWritePlan(snapshot({
            status: "running",
            activeInvocationId: "i1",
            invocations: [invocation("i1", "running")],
        }), waitingPlan(1, [approval("approval-1"), approval("approval-1")]), dependencies))
            .toThrow("Invocation i1 pendingApprovals 包含重复 toolCallId approval-1");
    });

    test("turnCount 回退与负数在写边界拒绝", () => {
        const current = snapshot({
            status: "running",
            activeInvocationId: "i1",
            activeLeafId: "e1",
            invocations: [invocation("i1", "running")],
            entries: [
                messageEntry("e0", "i1", 0),
                messageEntry("e1", "i1", 1),
            ],
        });
        expect(() => reduceSessionWritePlan(current, waitingPlan(0, [approval("approval-1")]), dependencies))
            .toThrow("waiting Invocation i1 turnCount 回退（已提交最大 turn 1）");
        expect(() => reduceSessionWritePlan(current, waitingPlan(-1, [approval("approval-1")]), dependencies))
            .toThrow("waiting Invocation i1 turnCount 必须是非负整数");
    });

    test("合法 waiting plan 通过并投影 waiting", () => {
        const result = reduceSessionWritePlan(snapshot({
            status: "running",
            activeInvocationId: "i1",
            activeLeafId: "e1",
            invocations: [invocation("i1", "running")],
            entries: [
                messageEntry("e0", "i1", 0),
                messageEntry("e1", "i1", 1),
            ],
        }), waitingPlan(1, [approval("approval-1")]), dependencies);
        expect(result.snapshot.status).toBe("waiting");
        expect(result.snapshot.invocations[0]?.status).toBe("waiting");
    });
});

describe("第三方 Store 防御性归一化", () => {
    class UnnormalizedStore implements SessionStore<number, JsonObject> {
        constructor(private readonly snapshot: SessionSnapshot<number, JsonObject>) {}
        async allocateId(): Promise<number> {
            return 1;
        }
        async create(): Promise<SessionSnapshot<number, JsonObject>> {
            return this.snapshot;
        }
        async read(): Promise<SessionSnapshot<number, JsonObject>> {
            return this.snapshot;
        }
        async commit(plan: SessionWritePlan<number, JsonObject>): Promise<SessionCommitResult<number, JsonObject>> {
            return {snapshot: this.snapshot, entries: []};
        }
        async reconcileInterrupted(): Promise<readonly InvocationRecord<number>[]> {
            return [];
        }
    }

    test("未归一化的空 approvals Snapshot 在 resume 边界 fail closed", async () => {
        const store = new UnnormalizedStore(snapshot({
            status: "waiting",
            activeInvocationId: "i1",
            activeLeafId: "e0",
            invocations: [{...invocation("i1", "waiting"), pendingApprovals: []}],
            entries: [messageEntry("e0", "i1", 0)],
        }));
        const objectSchema = defineSchema<JsonObject>((value) => {
            if (value === null || typeof value !== "object" || Array.isArray(value)) {
                throw new Error("必须是 object");
            }
            return value;
        });
        let toolExecutions = 0;
        const harness = new NeuroAgentHarness({
            store,
            profiles: new ProfileRegistry().add(defineProfile({
                manifest: {key: "unnormalized", name: "unnormalized"},
                initial: objectSchema,
                payload: objectSchema,
                prepare: () => ({systemPrompt: "p", modelConfig: {}, tools: [defineTool({
                    name: "gated",
                    description: "gated",
                    parameters: objectSchema,
                    approval: {request: () => ({prompt: "approve"})},
                    execute: () => {
                        toolExecutions += 1;
                        return {content: "executed"};
                    },
                })]}),
            })),
            model: {
                runTurn: async () => {
                    throw new Error("model must not run");
                },
            },
        });
        await expect(harness.resume(1, "i1", [])).rejects.toThrow(
            "waiting Invocation i1 必须包含 pending approval",
        );
        expect(toolExecutions).toBe(0);
        await harness.dispose();
    });
});
