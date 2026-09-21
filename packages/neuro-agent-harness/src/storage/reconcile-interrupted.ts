import type {JsonObject} from "../json.js";
import {
    InvocationOwnershipError,
    SessionConflictError,
    type InvocationRecord,
    type SessionId,
    type SessionStore,
} from "../session.js";

const MAX_RECONCILIATION_ATTEMPTS = 3;

type ReconciliationStore<
    TSessionId extends SessionId,
    THostContext extends JsonObject,
> = Pick<SessionStore<TSessionId, THostContext>, "read" | "commit">;

/** Reconciles one observed running owner while preserving first-party Store CAS failures. */
export async function reconcileInterruptedSession<
    TSessionId extends SessionId,
    THostContext extends JsonObject,
>(
    store: ReconciliationStore<TSessionId, THostContext>,
    sessionId: TSessionId,
): Promise<InvocationRecord<TSessionId> | undefined> {
    let snapshot = await store.read(sessionId);
    for (let attempt = 0; attempt < MAX_RECONCILIATION_ATTEMPTS; attempt += 1) {
        const active = snapshot.invocations.find((invocation) => invocation.id === snapshot.activeInvocationId);
        const aborting = snapshot.status === "aborting";
        if (!active || (active.status !== "running" && !(aborting && active.status === "waiting"))) {
            return undefined;
        }
        try {
            const result = await store.commit({
                target: sessionId,
                expectedVersion: snapshot.version,
                expectedActiveInvocationId: active.id,
                cause: aborting ? "store.reconcileAborting" : "store.reconcileInterrupted",
                operations: [{
                    type: "finishInvocation",
                    invocationId: active.id,
                    status: aborting ? "aborted" : "interrupted",
                    turnCount: active.turnCount,
                    ...(!aborting ? {
                        error: {
                            name: "InterruptedError",
                            message: "运行进程已重启，Invocation 被标记为 interrupted",
                            retryable: true,
                        },
                    } : {}),
                }],
            });
            return result.snapshot.invocations.find((invocation) => invocation.id === active.id);
        } catch (error) {
            if (!(error instanceof InvocationOwnershipError) && !(error instanceof SessionConflictError)) {
                throw error;
            }
            const latest = await store.read(sessionId);
            const latestInvocation = latest.invocations.find((invocation) => invocation.id === active.id);
            if (latestInvocation && latestInvocation.status !== "running") {
                return undefined;
            }
            if (latest.activeInvocationId !== active.id || latestInvocation?.status !== "running") {
                throw error;
            }
            if (attempt === MAX_RECONCILIATION_ATTEMPTS - 1) {
                throw error;
            }
            snapshot = latest;
        }
    }
    return undefined;
}
