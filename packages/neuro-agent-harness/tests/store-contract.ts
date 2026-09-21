import {expect} from "bun:test";
import type {JsonObject} from "../src/json.js";
import {
    SessionCommitAbortedError,
    SessionConflictError,
    SessionInvariantError,
    type SessionStore,
} from "../src/session.js";

interface TestHostContext extends JsonObject {
    workspace: string;
}

/** Runs the public Session Store contract against any numeric Adapter. */
export async function verifyNumericStore(store: SessionStore<number, TestHostContext>): Promise<void> {
    const created = await store.create({
        profileKey: "rewrite",
        initial: {document: "a.md"},
        hostContext: {workspace: "novel-a"},
    });
    expect(created.metadata.sessionId).toBeGreaterThan(0);
    expect(created.version).toBe(0);

    const abortedCommit = new AbortController();
    abortedCommit.abort();
    await expect(store.commit({
        target: created.metadata.sessionId,
        expectedVersion: 0,
        cause: "test.aborted-commit",
        operations: [{type: "appendEntries", entries: [{kind: "test.aborted", payload: true}]}],
    }, {signal: abortedCommit.signal})).rejects.toBeInstanceOf(SessionCommitAbortedError);
    const untouched = await store.read(created.metadata.sessionId);
    expect(untouched.version).toBe(0);
    expect(untouched.entries).toHaveLength(0);

    const started = await store.commit({
        target: created.metadata.sessionId,
        expectedVersion: 0,
        cause: "test.start",
        operations: [{
            type: "startInvocation",
            invocation: {
                id: "inv-1",
                sessionId: created.metadata.sessionId,
                profileKey: "rewrite",
                caller: {kind: "user"},
                input: {instruction: "改写"},
                createdAt: 2,
            },
        }, {
            type: "appendEntries",
            entries: [{kind: "test", payload: {value: 1}, invocationId: "inv-1"}],
        }],
    });
    expect(started.snapshot.status).toBe("running");
    expect(started.snapshot.activeInvocationId).toBe("inv-1");
    expect(started.entries).toHaveLength(1);

    await expect(store.commit({
        target: created.metadata.sessionId,
        expectedVersion: 1,
        cause: "test.reject-idle-with-active-owner",
        operations: [{type: "setStatus", status: "idle"}],
    })).rejects.toBeInstanceOf(SessionInvariantError);
    const stillRunning = await store.read(created.metadata.sessionId);
    expect(stillRunning.version).toBe(1);
    expect(stillRunning.status).toBe("running");
    expect(stillRunning.activeInvocationId).toBe("inv-1");

    await expect(store.commit({
        target: created.metadata.sessionId,
        expectedVersion: 1,
        cause: "test.reject-waiting-with-running-owner",
        operations: [{type: "setStatus", status: "waiting"}],
    })).rejects.toBeInstanceOf(SessionInvariantError);

    await expect(store.commit({
        target: created.metadata.sessionId,
        expectedVersion: 0,
        cause: "test.conflict",
        operations: [],
    })).rejects.toBeInstanceOf(SessionConflictError);

    const finished = await store.commit({
        target: created.metadata.sessionId,
        expectedVersion: 1,
        cause: "test.finish",
        operations: [{
            type: "finishInvocation",
            invocationId: "inv-1",
            status: "completed",
            turnCount: 1,
            terminationReason: "tool_terminate",
            output: "完成",
        }],
    });
    expect(finished.snapshot.status).toBe("idle");
    expect(finished.snapshot.invocations[0]?.status).toBe("completed");

    await expect(store.commit({
        target: created.metadata.sessionId,
        expectedVersion: 2,
        cause: "test.reject-running-without-active-owner",
        operations: [{type: "setStatus", status: "running"}],
    })).rejects.toBeInstanceOf(SessionInvariantError);
    const stillIdle = await store.read(created.metadata.sessionId);
    expect(stillIdle.version).toBe(2);
    expect(stillIdle.status).toBe("idle");
    expect(stillIdle.activeInvocationId).toBeNull();

    await expect(store.commit({
        target: created.metadata.sessionId,
        expectedVersion: 2,
        cause: "test.reject-waiting-without-active-owner",
        operations: [{type: "setStatus", status: "waiting"}],
    })).rejects.toBeInstanceOf(SessionInvariantError);

    await expect(store.commit({
        target: created.metadata.sessionId,
        expectedVersion: 2,
        cause: "test.reject-aborting-without-active-owner",
        operations: [{type: "setStatus", status: "aborting"}],
    })).rejects.toBeInstanceOf(SessionInvariantError);

    await expect(store.commit({
        target: created.metadata.sessionId,
        expectedVersion: 2,
        cause: "test.terminal",
        operations: [{
            type: "finishInvocation",
            invocationId: "inv-1",
            status: "failed",
            turnCount: 2,
        }],
    })).rejects.toBeInstanceOf(SessionInvariantError);

    const archived = await store.commit({
        target: created.metadata.sessionId,
        expectedVersion: 2,
        cause: "test.archive-without-active-owner",
        operations: [{type: "setStatus", status: "archived"}],
    });
    expect(archived.snapshot.status).toBe("archived");
    expect(archived.snapshot.activeInvocationId).toBeNull();

    const abortingCreated = await store.create({
        profileKey: "rewrite",
        initial: {document: "b.md"},
        hostContext: {workspace: "novel-b"},
    });
    await store.commit({
        target: abortingCreated.metadata.sessionId,
        expectedVersion: 0,
        cause: "test.start-aborting",
        operations: [{
            type: "startInvocation",
            invocation: {
                id: "inv-aborting",
                sessionId: abortingCreated.metadata.sessionId,
                profileKey: "rewrite",
                caller: {kind: "system", name: "test"},
                input: null,
                createdAt: 3,
            },
        }],
    });
    const aborting = await store.commit({
        target: abortingCreated.metadata.sessionId,
        expectedVersion: 1,
        cause: "test.mark-aborting",
        operations: [{type: "setStatus", status: "aborting"}],
    });
    expect(aborting.snapshot.status).toBe("aborting");
    expect(aborting.snapshot.activeInvocationId).toBe("inv-aborting");
    expect(aborting.snapshot.invocations[0]?.status).toBe("running");
    await store.commit({
        target: abortingCreated.metadata.sessionId,
        expectedVersion: 2,
        cause: "test.finish-aborting",
        operations: [{
            type: "finishInvocation",
            invocationId: "inv-aborting",
            status: "aborted",
            turnCount: 0,
        }],
    });

    const waitingCreated = await store.create({
        profileKey: "rewrite",
        initial: {document: "c.md"},
        hostContext: {workspace: "novel-c"},
    });
    await store.commit({
        target: waitingCreated.metadata.sessionId,
        expectedVersion: 0,
        cause: "test.start-waiting",
        operations: [{
            type: "startInvocation",
            invocation: {
                id: "inv-waiting",
                sessionId: waitingCreated.metadata.sessionId,
                profileKey: "rewrite",
                caller: {kind: "system", name: "test"},
                input: null,
                createdAt: 4,
            },
        }],
    });
    await store.commit({
        target: waitingCreated.metadata.sessionId,
        expectedVersion: 1,
        cause: "test.wait",
        operations: [{
            type: "waitInvocation",
            invocationId: "inv-waiting",
            turnCount: 1,
            pendingApprovals: [{
                toolCallId: "call-waiting",
                toolName: "waiting_tool",
                prompt: "wait",
                arguments: {},
            }],
        }],
    });
    const waitingAborting = await store.commit({
        target: waitingCreated.metadata.sessionId,
        expectedVersion: 2,
        cause: "test.mark-waiting-aborting",
        operations: [{type: "setStatus", status: "aborting"}],
    });
    expect(waitingAborting.snapshot.status).toBe("aborting");
    expect(waitingAborting.snapshot.invocations[0]?.status).toBe("waiting");
    const waitingAgain = await store.commit({
        target: waitingCreated.metadata.sessionId,
        expectedVersion: 3,
        cause: "test.restore-waiting-status",
        operations: [{type: "setStatus", status: "waiting"}],
    });
    expect(waitingAgain.snapshot.status).toBe("waiting");
    await expect(store.commit({
        target: waitingCreated.metadata.sessionId,
        expectedVersion: 4,
        cause: "test.reject-running-with-waiting-owner",
        operations: [{type: "setStatus", status: "running"}],
    })).rejects.toBeInstanceOf(SessionInvariantError);
    await store.commit({
        target: waitingCreated.metadata.sessionId,
        expectedVersion: 4,
        cause: "test.finish-waiting",
        operations: [{
            type: "finishInvocation",
            invocationId: "inv-waiting",
            status: "aborted",
            turnCount: 1,
        }],
    });
}
