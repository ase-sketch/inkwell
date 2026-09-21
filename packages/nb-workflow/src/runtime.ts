import { AsyncLocalStorage } from "node:async_hooks";
import { createHash } from "node:crypto";

import {
    UnsupportedActivityExecutor,
    assertVersionedReference,
} from "./activities";
import { ChildWorkflowTerminalError } from "./children";
import { canonicalJson, fingerprintFromCanonicalJson } from "./fingerprint";
import type {
    ActivityExecutionContext,
    ActivityExecutor,
    ChildWorkflowStore,
    Clock,
    EventSink,
    RandomSource,
    SignalStore,
    TimerStore,
    WorkflowPorts,
} from "./ports";
import type { RunRecord } from "./run-record";
import {
    emitWorkflowEvent,
    type RunEnv,
} from "./runtime-events";
import { validateSignalReference } from "./signals";
import { validateTimerDuration } from "./timers";
import type {
    ActivityRecord,
    AskSpec,
    ChildWorkflowOptions,
    JsonValue,
    PendingAsk,
    SessionId,
    WorkflowValue,
} from "./types";
import { WorkflowValueCodec } from "./values";

export class SuspendSignal extends Error {
    constructor() {
        super("workflow 挂起等待外部输入");
        this.name = "SuspendSignal";
    }
}

export class WorkflowCancelledError extends Error {
    constructor() {
        super("workflow run 被取消");
        this.name = "WorkflowCancelledError";
    }
}

const branchContext = new AsyncLocalStorage<{ path: string }>();

export class ExecutionState {
    readonly counters = new Map<string, number>();
    readonly dirtyFrom = new Map<string, number>();

    nextSeq(path: string): number {
        const seq = this.counters.get(path) ?? 0;
        this.counters.set(path, seq + 1);
        return seq;
    }
}

export class Runtime {
    constructor(
        readonly run: RunRecord,
        readonly exec: ExecutionState,
        readonly ports: WorkflowPorts,
        readonly activities: ActivityExecutor,
        readonly children: ChildWorkflowStore,
        readonly events: EventSink,
        readonly signals: SignalStore,
        readonly timers: TimerStore,
        readonly values: WorkflowValueCodec,
        readonly clock: Clock,
        readonly random: RandomSource,
        readonly defaultConcurrency: number,
        readonly maxConcurrency: number,
        readonly env: RunEnv,
        readonly persist: () => Promise<void>,
    ) {}

    path(): string {
        return branchContext.getStore()?.path ?? "root";
    }

    peekSequence(path: string): number {
        return this.exec.counters.get(path) ?? 0;
    }

    async runBranch<T>(path: string, fn: () => Promise<T>): Promise<T> {
        return await branchContext.run({ path }, fn);
    }

    get signal(): AbortSignal {
        return this.run.abortController.signal;
    }

    async activity<T extends JsonValue>(
        kind: string,
        params: JsonValue,
        fn: (context: ActivityExecutionContext) => Promise<T>,
        project?: (stored: WorkflowValue) => void,
    ): Promise<T> {
        this.assertRunning();
        const path = this.path();
        const seq = this.exec.nextSeq(path);
        const key = `${path}#${seq}`;
        const canonicalParams = canonicalJson(params);
        const activityFingerprint = fingerprintFromCanonicalJson(canonicalParams);
        const dirty = this.exec.dirtyFrom.get(path);
        const cached = this.run.journal.get(key);
        if (cached && (dirty === undefined || seq < dirty)) {
            if (
                cached.kind === kind
                && cached.fingerprint === activityFingerprint
            ) {
                emitWorkflowEvent(this.env, {
                    type: "activity",
                    runId: this.run.runId,
                    record: cached,
                    cached: true,
                });
                const value = await this.values.decode(cached.result) as T;
                this.assertRunning();
                project?.(structuredClone(cached.result));
                return value;
            }
            this.exec.dirtyFrom.set(path, seq);
            this.invalidateSuffix(path, seq);
        }
        const activity = {
            key,
            path,
            seq,
            kind,
            fingerprint: activityFingerprint,
        };
        emitWorkflowEvent(this.env, {
            type: "activity_started",
            runId: this.run.runId,
            ...activity,
            params: canonicalParams,
        });
        const result = await fn({
            runId: this.run.runId,
            activity,
            idempotencyKey: activityIdempotencyKey(
                this.run.runId,
                activity,
            ),
            signal: this.signal,
        });
        this.assertRunning();
        const encodedResult = await this.values.encode(result);
        this.assertRunning();
        project?.(structuredClone(encodedResult));
        const record: ActivityRecord = {
            ...activity,
            params: canonicalParams,
            result: encodedResult,
        };
        this.run.journal.set(key, record);
        await this.persist();
        emitWorkflowEvent(this.env, {
            type: "activity",
            runId: this.run.runId,
            record,
            cached: false,
        });
        return result;
    }
    async askActivity(spec: AskSpec): Promise<JsonValue> {
        validateAskSpec(spec);
        this.assertRunning();
        const path = this.path();
        const seq = this.exec.nextSeq(path);
        const key = `${path}#${seq}`;
        const canonicalParams = canonicalJson(spec);
        const activityFingerprint = fingerprintFromCanonicalJson(canonicalParams);
        const dirty = this.exec.dirtyFrom.get(path);
        const cached = this.run.journal.get(key);
        if (cached && (dirty === undefined || seq < dirty)) {
            if (
                cached.kind === "ask"
                && cached.fingerprint === activityFingerprint
            ) {
                emitWorkflowEvent(this.env, {
                    type: "activity",
                    runId: this.run.runId,
                    record: cached,
                    cached: true,
                });
                const value = await this.values.decode(cached.result);
                this.assertRunning();
                return value;
            }
            this.exec.dirtyFrom.set(path, seq);
            this.invalidateSuffix(path, seq);
        }
        const pending: PendingAsk = {
            key,
            path,
            seq,
            fingerprint: activityFingerprint,
            spec,
        };
        this.run.pendingAsks.push(pending);
        await this.persist();
        emitWorkflowEvent(this.env, {
            type: "ask_pending",
            runId: this.run.runId,
            ask: pending,
        });
        throw new SuspendSignal();
    }

    async waitForSignalActivity(reference: string): Promise<JsonValue> {
        validateSignalReference(reference);
        return await this.activity(
            "signal",
            { reference },
            async (context): Promise<JsonValue> => {
                const result = await this.signals.consume({
                    runId: this.run.runId,
                    reference,
                    context,
                });
                if (result.status === "available") {
                    return result.value;
                }
                this.addPendingWait("signal", context, reference);
                await this.persist();
                throw new SuspendSignal();
            },
        );
    }

    async waitForTimerActivity(durationMs: number): Promise<void> {
        validateTimerDuration(durationMs);
        await this.activity(
            "timer",
            { durationMs },
            async (context) => {
                const result = await this.timers.wait({
                    runId: this.run.runId,
                    durationMs,
                    now: this.clock.now().toISOString(),
                    context,
                });
                if (result.status === "ready") {
                    return null;
                }
                this.addPendingWait("timer", context, result.dueAt);
                await this.persist();
                throw new SuspendSignal();
            },
        );
    }

    async startChildWorkflowActivity(
        workflowReference: string,
        input: JsonValue,
        options: ChildWorkflowOptions,
    ): Promise<JsonValue> {
        assertVersionedReference(workflowReference);
        const normalized = {
            key: options.key,
            wait: options.wait ?? false,
            cancelPolicy: options.cancelPolicy ?? "propagate" as const,
        };
        return await this.activity(
            "child",
            {
                workflowReference,
                input,
                options: {
                    key: normalized.key ?? null,
                    wait: normalized.wait,
                    cancelPolicy: normalized.cancelPolicy,
                },
            },
            async (context): Promise<JsonValue> => {
                const result = await this.children.start({
                    parentRunId: this.run.runId,
                    workflowReference,
                    input,
                    options: normalized,
                    context,
                });
                if (this.run.abortRequested) {
                    // start 是异步宿主调用：取消可能发生在记录落库之前，
                    // 需要按 parent 补扫一次，避免留下 propagate 孤儿。
                    await this.children.cancelForParent(
                        this.run.runId,
                    );
                    throw new WorkflowCancelledError();
                }
                if (result.status === "running") {
                    if (!normalized.wait) {
                        return {
                            runId: result.runId,
                            status: "started",
                        };
                    }
                    this.addPendingWait(
                        "child",
                        context,
                        result.runId,
                    );
                    await this.persist();
                    throw new SuspendSignal();
                }
                if (result.status === "completed") {
                    return {
                        runId: result.runId,
                        status: "completed",
                        result: result.result,
                    };
                }
                throw new ChildWorkflowTerminalError(
                    result.runId,
                    result.status,
                    result.error,
                );
            },
        );
    }

    async lock(sessionId: SessionId): Promise<void> {
        const sessions = this.ports.sessions;
        if (!sessions) {
            throw new Error("Agent Session extension is not configured.");
        }
        await sessions.lock(sessionId, this.run.runId);
    }

    private assertRunning(): void {
        if (this.run.abortRequested || this.signal.aborted) {
            throw new WorkflowCancelledError();
        }
    }

    private addPendingWait(
        kind: "signal" | "timer" | "child",
        context: ActivityExecutionContext,
        reference: string,
    ): void {
        const activity = context.activity;
        this.run.pendingWaits.push({
            kind,
            key: activity.key,
            path: activity.path,
            seq: activity.seq,
            fingerprint: activity.fingerprint,
            reference,
        });
    }

    private invalidateSuffix(path: string, sequence: number): void {
        for (const [key, record] of this.run.journal) {
            if (
                (
                    record.path === path
                    && record.seq >= sequence
                )
                || descendantSequence(record.path, path) >= sequence
            ) {
                this.run.journal.delete(key);
            }
        }
    }
}

function validateAskSpec(spec: AskSpec): void {
    if (
        spec === null
        || typeof spec !== "object"
        || Array.isArray(spec)
    ) {
        throw new Error("Workflow ask spec must be an object.");
    }
    const allowedKinds = new Set(["select", "text", "approve"]);
    if (
        typeof spec.kind !== "string"
        || !allowedKinds.has(spec.kind)
    ) {
        throw new Error(
            "Workflow ask kind must be one of select, text or approve.",
        );
    }
    if (
        typeof spec.title !== "string"
        || !spec.title.trim()
    ) {
        throw new Error(
            "Workflow ask title must be a non-empty string.",
        );
    }
    if (
        spec.description !== undefined
        && typeof spec.description !== "string"
    ) {
        throw new Error(
            "Workflow ask description must be a string.",
        );
    }
    if (
        spec.multi !== undefined
        && typeof spec.multi !== "boolean"
    ) {
        throw new Error("Workflow ask multi must be a boolean.");
    }
    if (spec.options !== undefined) {
        if (!Array.isArray(spec.options)) {
            throw new Error(
                "Workflow ask options must be an array.",
            );
        }
        for (const option of spec.options) {
            if (
                option === null
                || typeof option !== "object"
                || typeof option.id !== "string"
                || !option.id.trim()
                || typeof option.label !== "string"
            ) {
                throw new Error(
                    "Workflow ask options require non-empty id "
                    + "and label strings.",
                );
            }
        }
    }
}

export async function runAtWorkflowRoot<T>(
    fn: () => Promise<T>,
): Promise<T> {
    return await branchContext.run({ path: "root" }, fn);
}

function descendantSequence(candidate: string, parent: string): number {
    const prefix = `${parent}/`;
    if (!candidate.startsWith(prefix)) {
        return -1;
    }
    const segment = candidate.slice(prefix.length).split("/", 1)[0] ?? "";
    const separator = segment.indexOf(":");
    if (separator <= 0) {
        return -1;
    }
    const sequence = Number(segment.slice(0, separator));
    return Number.isSafeInteger(sequence) ? sequence : -1;
}

function activityIdempotencyKey(
    runId: string,
    activity: ActivityExecutionContext["activity"],
): string {
    const digest = createHash("sha256")
        .update(activity.kind)
        .update("\0")
        .update(activity.fingerprint)
        .digest("hex");
    return `${runId}:${activity.key}:${digest}`;
}

export function unsupportedActivities(): ActivityExecutor {
    return new UnsupportedActivityExecutor();
}
