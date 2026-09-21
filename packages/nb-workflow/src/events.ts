import { fingerprint } from "./fingerprint";
import type {
    ActivityExecutionContext,
    EventSink,
    EventSinkRequest,
} from "./ports";
import type { WorkflowEventEnvelope } from "./types";

export class EventSinkNotConfiguredError extends Error {
    constructor() {
        super("No EventSink is configured for this WorkflowRunner.");
        this.name = "EventSinkNotConfiguredError";
    }
}

export class EventSinkConflictError extends Error {
    constructor(readonly idempotencyKey: string) {
        super(`Event idempotency conflict: ${idempotencyKey}`);
        this.name = "EventSinkConflictError";
    }
}

export class UnsupportedEventSink implements EventSink {
    async emit(): Promise<void> {
        throw new EventSinkNotConfiguredError();
    }
}

export type MemoryEventRecord = {
    event: WorkflowEventEnvelope;
    context: Omit<ActivityExecutionContext, "signal">;
};

/** 测试/demo 用幂等 Sink；相同 Activity identity 只保存一次。 */
export class MemoryEventSink implements EventSink {
    private readonly records = new Map<string, MemoryEventRecord>();

    async emit(request: EventSinkRequest): Promise<void> {
        const record: MemoryEventRecord = {
            event: structuredClone(request.event),
            context: {
                runId: request.context.runId,
                activity: structuredClone(request.context.activity),
                idempotencyKey: request.context.idempotencyKey,
            },
        };
        const current = this.records.get(request.context.idempotencyKey);
        if (current) {
            if (
                fingerprint(current.event.payload)
                    !== fingerprint(record.event.payload)
                || current.event.type !== record.event.type
                || current.event.version !== record.event.version
            ) {
                throw new EventSinkConflictError(
                    request.context.idempotencyKey,
                );
            }
            return;
        }
        this.records.set(request.context.idempotencyKey, record);
    }

    list(): readonly MemoryEventRecord[] {
        return [...this.records.values()].map((record) =>
            structuredClone(record)
        );
    }
}

export function validateWorkflowEvent(
    event: WorkflowEventEnvelope,
): WorkflowEventEnvelope {
    if (
        event === null
        || typeof event !== "object"
        || Array.isArray(event)
    ) {
        throw new Error(
            "Workflow events must be an event envelope object.",
        );
    }
    if (
        typeof event.type !== "string"
        || !event.type.trim()
    ) {
        throw new Error(
            "Workflow events require a non-empty string type.",
        );
    }
    if (
        typeof event.version !== "string"
        || !event.version.trim()
    ) {
        throw new Error(
            "Workflow events require a non-empty string version.",
        );
    }
    return structuredClone(event);
}
