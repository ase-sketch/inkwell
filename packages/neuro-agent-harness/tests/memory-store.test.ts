import {describe, expect, test} from "bun:test";
import type {JsonObject} from "../src/json.js";
import {
    SessionConflictError,
    type SessionCommitResult,
    type SessionWritePlan,
} from "../src/session.js";
import {MemorySessionStore} from "../src/storage/memory.js";
import {verifyNumericStore} from "./store-contract.js";

class ContinuallyMutatingRecoveryStore extends MemorySessionStore<number, JsonObject> {
    recoveryAttempts = 0;

    override async commit(
        plan: SessionWritePlan<number, JsonObject>,
    ): Promise<SessionCommitResult<number, JsonObject>> {
        if (plan.cause === "store.reconcileInterrupted") {
            this.recoveryAttempts += 1;
            const current = await this.read(plan.target);
            await super.commit({
                target: plan.target,
                expectedVersion: current.version,
                expectedActiveInvocationId: current.activeInvocationId,
                cause: `test.keep-recovery-conflicting.${this.recoveryAttempts}`,
                operations: [{
                    type: "appendEntries",
                    entries: [{
                        kind: "test.concurrent",
                        payload: this.recoveryAttempts,
                        ...(current.activeInvocationId === null ? {} : {invocationId: current.activeInvocationId}),
                    }],
                }],
            });
        }
        return super.commit(plan);
    }
}

describe("MemorySessionStore", () => {
    test("满足公共 Store 合同", async () => {
        await verifyNumericStore(new MemorySessionStore());
    });

    test("支持 string Session ID Adapter", async () => {
        const store = new MemorySessionStore<string>({idKind: "custom", allocateId: () => "session-a"});
        const snapshot = await store.create({profileKey: "p", initial: null, hostContext: {}});
        expect(snapshot.metadata.sessionId).toBe("session-a");
    });

    test("重启协调将 running Invocation 标记为 interrupted", async () => {
        const store = new MemorySessionStore();
        const session = await store.create({profileKey: "p", initial: null, hostContext: {}});
        await store.commit({
            target: session.metadata.sessionId,
            expectedVersion: 0,
            cause: "test.start",
            operations: [{
                type: "startInvocation",
                invocation: {
                    id: "active",
                    sessionId: session.metadata.sessionId,
                    profileKey: "p",
                    caller: {kind: "system", name: "test"},
                    input: null,
                    createdAt: 1,
                },
            }],
        });
        const reconciled = await store.reconcileInterrupted();
        expect(reconciled).toHaveLength(1);
        expect(reconciled[0]?.status).toBe("interrupted");
    });

    test("并发重启协调收敛到一次 interrupted transition", async () => {
        const store = new MemorySessionStore();
        const session = await store.create({profileKey: "p", initial: null, hostContext: {}});
        await store.commit({
            target: session.metadata.sessionId,
            expectedVersion: 0,
            cause: "test.start.concurrent-reconcile",
            operations: [{
                type: "startInvocation",
                invocation: {
                    id: "active",
                    sessionId: session.metadata.sessionId,
                    profileKey: "p",
                    caller: {kind: "system", name: "test"},
                    input: null,
                    createdAt: 1,
                },
            }],
        });

        const reconciled = await Promise.all([
            store.reconcileInterrupted(),
            store.reconcileInterrupted(),
        ]);

        expect(reconciled.flat()).toHaveLength(1);
        expect(reconciled.flat()[0]?.status).toBe("interrupted");
        const restored = await store.read(session.metadata.sessionId);
        expect(restored.version).toBe(2);
        expect(restored.status).toBe("interrupted");
        expect(restored.activeInvocationId).toBeNull();
        expect(restored.invocations[0]?.status).toBe("interrupted");
    });

    test("重启协调在同一 owner 的并发写入后刷新 Snapshot 并重试", async () => {
        const store = new MemorySessionStore();
        const session = await store.create({profileKey: "p", initial: null, hostContext: {}});
        await store.commit({
            target: session.metadata.sessionId,
            expectedVersion: 0,
            cause: "test.start.reconcile-retry",
            operations: [{
                type: "startInvocation",
                invocation: {
                    id: "active",
                    sessionId: session.metadata.sessionId,
                    profileKey: "p",
                    caller: {kind: "system", name: "test"},
                    input: null,
                    createdAt: 1,
                },
            }],
        });

        const reconciliation = store.reconcileInterrupted();
        const concurrentWrite = store.commit({
            target: session.metadata.sessionId,
            expectedVersion: 1,
            cause: "test.concurrent-write-before-reconcile",
            operations: [{
                type: "appendEntries",
                entries: [{kind: "test.concurrent", payload: true, invocationId: "active"}],
            }],
        });
        const [reconciled] = await Promise.all([reconciliation, concurrentWrite]);

        expect(reconciled).toHaveLength(1);
        expect(reconciled[0]?.status).toBe("interrupted");
        const restored = await store.read(session.metadata.sessionId);
        expect(restored.version).toBe(3);
        expect(restored.entries.map((entry) => entry.kind)).toEqual(["test.concurrent"]);
        expect(restored.status).toBe("interrupted");
        expect(restored.activeInvocationId).toBeNull();
    });

    test("一个 benign recovery race 不阻止继续协调后续 Session", async () => {
        const store = new MemorySessionStore();
        for (const invocationId of ["first", "second"]) {
            const session = await store.create({profileKey: "p", initial: null, hostContext: {}});
            await store.commit({
                target: session.metadata.sessionId,
                expectedVersion: 0,
                cause: `test.start.${invocationId}`,
                operations: [{
                    type: "startInvocation",
                    invocation: {
                        id: invocationId,
                        sessionId: session.metadata.sessionId,
                        profileKey: "p",
                        caller: {kind: "system", name: "test"},
                        input: null,
                        createdAt: 1,
                    },
                }],
            });
        }

        const reconciled = await Promise.all([
            store.reconcileInterrupted(),
            store.reconcileInterrupted(),
        ]);

        expect(reconciled.flat().map((invocation) => invocation.id).sort()).toEqual(["first", "second"]);
        for (const sessionId of [1, 2]) {
            const restored = await store.read(sessionId);
            expect(restored.version).toBe(2);
            expect(restored.status).toBe("interrupted");
            expect(restored.activeInvocationId).toBeNull();
        }
    });

    test("持续的同 owner version 冲突有界失败且不伪造 reconciliation 成功", async () => {
        const store = new ContinuallyMutatingRecoveryStore();
        const session = await store.create({profileKey: "p", initial: null, hostContext: {}});
        await store.commit({
            target: session.metadata.sessionId,
            expectedVersion: 0,
            cause: "test.start.exhausted-reconcile",
            operations: [{
                type: "startInvocation",
                invocation: {
                    id: "active",
                    sessionId: session.metadata.sessionId,
                    profileKey: "p",
                    caller: {kind: "system", name: "test"},
                    input: null,
                    createdAt: 1,
                },
            }],
        });

        await expect(store.reconcileInterrupted()).rejects.toBeInstanceOf(SessionConflictError);
        expect(store.recoveryAttempts).toBe(3);
        const restored = await store.read(session.metadata.sessionId);
        expect(restored.version).toBe(4);
        expect(restored.status).toBe("running");
        expect(restored.activeInvocationId).toBe("active");
        expect(restored.entries.map((entry) => entry.payload)).toEqual([1, 2, 3]);
    });
});
