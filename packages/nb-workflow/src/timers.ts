import type {
    TimerStore,
    TimerWaitInput,
    TimerWaitResult,
} from "./ports";

export class TimerStoreNotConfiguredError extends Error {
    constructor() {
        super("No TimerStore is configured for this WorkflowRunner.");
        this.name = "TimerStoreNotConfiguredError";
    }
}

export class TimerConflictError extends Error {
    constructor(readonly idempotencyKey: string) {
        super(`Timer idempotency conflict: ${idempotencyKey}`);
        this.name = "TimerConflictError";
    }
}

export type MemoryTimerRecord = {
    runId: string;
    idempotencyKey: string;
    durationMs: number;
    dueAt: string;
};

export class UnsupportedTimerStore implements TimerStore {
    async wait(): Promise<TimerWaitResult> {
        throw new TimerStoreNotConfiguredError();
    }
}

/** 当前进程内 Timer Store；首次 dueAt 按 Activity identity 固定。 */
export class MemoryTimerStore implements TimerStore {
    private readonly records = new Map<string, MemoryTimerRecord>();

    async wait(input: TimerWaitInput): Promise<TimerWaitResult> {
        validateDuration(input.durationMs);
        const now = parseTime(input.now, "Timer now");
        const key = input.context.idempotencyKey;
        let record = this.records.get(key);
        if (!record) {
            record = {
                runId: input.runId,
                idempotencyKey: key,
                durationMs: input.durationMs,
                dueAt: new Date(now + input.durationMs).toISOString(),
            };
            this.records.set(key, record);
        } else if (
            record.runId !== input.runId
            || record.durationMs !== input.durationMs
        ) {
            throw new TimerConflictError(key);
        }
        return now >= parseTime(record.dueAt, "Timer dueAt")
            ? { status: "ready", dueAt: record.dueAt }
            : { status: "waiting", dueAt: record.dueAt };
    }

    list(): readonly MemoryTimerRecord[] {
        return [...this.records.values()].map((record) => ({ ...record }));
    }
}

export function validateTimerDuration(durationMs: number): number {
    validateDuration(durationMs);
    return durationMs;
}

function validateDuration(durationMs: number): void {
    if (!Number.isSafeInteger(durationMs) || durationMs < 0) {
        throw new Error(
            "Workflow timer durationMs must be a non-negative integer.",
        );
    }
}

function parseTime(value: string, label: string): number {
    const parsed = Date.parse(value);
    if (!Number.isFinite(parsed)) {
        throw new Error(`${label} must be an ISO timestamp.`);
    }
    return parsed;
}
