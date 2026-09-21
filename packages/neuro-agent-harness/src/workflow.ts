import type {JsonValue} from "./json.js";
import type {SessionCommitNotification, SessionCommitObserver, SessionId} from "./session.js";
import type {JsonObject} from "./json.js";

/** One idempotent Workflow job selected from a durable Session commit. */
export interface CommitWorkflowJob<TPayload extends JsonValue> {
    readonly key: string;
    readonly payload: TPayload;
}

/** Workflow definition used by the coalescing commit scheduler. */
export interface CommitWorkflowDefinition<
    TPayload extends JsonValue,
    TSessionId extends SessionId = number,
    THostContext extends JsonObject = JsonObject,
> {
    readonly name: string;
    select(notification: SessionCommitNotification<TSessionId, THostContext>): CommitWorkflowJob<TPayload> | null;
    run(job: CommitWorkflowJob<TPayload>, signal: AbortSignal): Promise<void>;
    onError?(job: CommitWorkflowJob<TPayload>, error: Error): void | Promise<void>;
}

/** Lifecycle options for the in-process commit Workflow scheduler. */
export interface CommitWorkflowSchedulerOptions {
    /** Grace period for cooperative run/onError shutdown before Scheduler-owned state detaches. */
    readonly abortGraceMs?: number;
}

type WorkflowState<TPayload extends JsonValue> = {
    pending: CommitWorkflowJob<TPayload> | undefined;
    running: Promise<void> | undefined;
};

type WorkflowOperationOutcome =
    | {readonly status: "fulfilled"}
    | {readonly status: "rejected"; readonly error: unknown}
    | {readonly status: "detached"};

/** Non-blocking observer that coalesces commits by idempotency key. */
export class CommitWorkflowScheduler<
    TPayload extends JsonValue,
    TSessionId extends SessionId = number,
    THostContext extends JsonObject = JsonObject,
> implements SessionCommitObserver<TSessionId, THostContext> {
    readonly name: string;
    private readonly definition: CommitWorkflowDefinition<TPayload, TSessionId, THostContext>;
    private readonly states = new Map<string, WorkflowState<TPayload>>();
    private readonly controller = new AbortController();
    private readonly forcedCompletion = new AbortController();
    private readonly abortGraceMs: number;
    private disposePromise: Promise<void> | undefined;

    constructor(
        definition: CommitWorkflowDefinition<TPayload, TSessionId, THostContext>,
        options: CommitWorkflowSchedulerOptions = {},
    ) {
        this.name = definition.name;
        this.definition = definition;
        this.abortGraceMs = options.abortGraceMs ?? 150;
        if (!Number.isFinite(this.abortGraceMs) || this.abortGraceMs < 0) {
            throw new Error("abortGraceMs 必须是非负有限数");
        }
    }

    afterCommit(notification: SessionCommitNotification<TSessionId, THostContext>): void {
        if (this.controller.signal.aborted) return;
        const job = this.definition.select(notification);
        if (!job || this.controller.signal.aborted) return;
        const state = this.states.get(job.key) ?? {pending: undefined, running: undefined};
        state.pending = job;
        this.states.set(job.key, state);
        if (!state.running) {
            state.running = this.runState(job.key, state);
        }
    }

    /** Waits until all currently queued and dirty rerun jobs settle. */
    async drain(): Promise<void> {
        while (this.states.size > 0) {
            await Promise.allSettled([...this.states.values()].flatMap((state) => state.running ? [state.running] : []));
        }
    }

    /** Stops accepting jobs and bounds waiting for cooperative handlers. */
    dispose(): Promise<void> {
        if (this.disposePromise) {
            return this.disposePromise;
        }
        let resolveDispose!: () => void;
        let rejectDispose!: (error: unknown) => void;
        this.disposePromise = new Promise<void>((resolve, reject) => {
            resolveDispose = resolve;
            rejectDispose = reject;
        });
        void this.disposeOnce().then(resolveDispose, rejectDispose);
        return this.disposePromise;
    }

    private async disposeOnce(): Promise<void> {
        this.controller.abort();
        for (const state of this.states.values()) {
            state.pending = undefined;
        }
        const draining = this.drain();
        if (this.states.size === 0) {
            await draining;
            return;
        }
        if (this.abortGraceMs === 0) {
            this.forceCompletion();
            await draining;
            return;
        }
        let timeout: ReturnType<typeof setTimeout> | undefined;
        const expired = new Promise<"expired">((resolve) => {
            timeout = setTimeout(() => resolve("expired"), this.abortGraceMs);
        });
        const outcome = await Promise.race([
            draining.then(() => "drained" as const),
            expired,
        ]);
        if (timeout !== undefined) {
            clearTimeout(timeout);
        }
        if (outcome === "expired") {
            this.forceCompletion();
            await draining;
        }
    }

    private async runState(key: string, state: WorkflowState<TPayload>): Promise<void> {
        try {
            while (!this.controller.signal.aborted && state.pending) {
                const job = state.pending;
                state.pending = undefined;
                const run = Promise.resolve().then(() => this.definition.run(job, this.controller.signal));
                const runOutcome = await this.awaitOperation(run);
                if (runOutcome.status === "detached") {
                    return;
                }
                if (runOutcome.status === "rejected" && !this.forcedCompletion.signal.aborted) {
                    const error = runOutcome.error instanceof Error
                        ? runOutcome.error
                        : new Error(String(runOutcome.error));
                    const onError = Promise.resolve().then(() => this.definition.onError?.(job, error));
                    const onErrorOutcome = await this.awaitOperation(onError);
                    if (onErrorOutcome.status === "detached") {
                        return;
                    }
                }
            }
        } finally {
            state.running = undefined;
            if (state.pending && !this.controller.signal.aborted) {
                state.running = this.runState(key, state);
                return;
            }
            this.states.delete(key);
        }
    }

    private awaitOperation(operation: Promise<void>): Promise<WorkflowOperationOutcome> {
        const signal = this.forcedCompletion.signal;
        return new Promise<WorkflowOperationOutcome>((resolve) => {
            let settled = false;
            const finish = (outcome: WorkflowOperationOutcome): void => {
                if (settled) {
                    return;
                }
                settled = true;
                signal.removeEventListener("abort", detach);
                resolve(outcome);
            };
            const detach = (): void => {
                finish({status: "detached"});
            };
            void operation.then(
                () => finish({status: "fulfilled"}),
                (error: unknown) => finish({status: "rejected", error}),
            );
            if (signal.aborted) {
                detach();
                return;
            }
            signal.addEventListener("abort", detach, {once: true});
        });
    }

    private forceCompletion(): void {
        this.forcedCompletion.abort();
    }
}
