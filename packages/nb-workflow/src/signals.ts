import { fingerprint } from "./fingerprint";
import type {
    SignalConsumeInput,
    SignalConsumeResult,
    SignalPublishInput,
    SignalStore,
} from "./ports";
import type { JsonValue } from "./types";

export class SignalStoreNotConfiguredError extends Error {
    constructor() {
        super("No SignalStore is configured for this WorkflowRunner.");
        this.name = "SignalStoreNotConfiguredError";
    }
}

export class SignalConflictError extends Error {
    constructor(
        readonly runId: string,
        readonly idempotencyKey: string,
    ) {
        super(`Signal idempotency conflict: ${runId}/${idempotencyKey}`);
        this.name = "SignalConflictError";
    }
}

export type MemorySignalRecord = {
    runId: string;
    reference: string;
    value: JsonValue;
    idempotencyKey: string;
    consumedBy: string | null;
};

export class UnsupportedSignalStore implements SignalStore {
    async publish(): Promise<void> {
        throw new SignalStoreNotConfiguredError();
    }

    async consume(): Promise<SignalConsumeResult> {
        throw new SignalStoreNotConfiguredError();
    }
}

/**
 * 当前进程内 Signal Store。
 *
 * consume 会把 Signal 绑定到稳定 Activity idempotency key；即使 Kernel 在写
 * journal 前崩溃，同一 Activity replay 仍取得同一值。
 */
export class MemorySignalStore implements SignalStore {
    private readonly records: MemorySignalRecord[] = [];

    async publish(input: SignalPublishInput): Promise<void> {
        validateReference(input.reference);
        const existing = this.records.find((record) =>
            record.runId === input.runId
            && record.idempotencyKey === input.idempotencyKey
        );
        if (existing) {
            if (
                existing.reference !== input.reference
                || fingerprint(existing.value) !== fingerprint(input.value)
            ) {
                throw new SignalConflictError(
                    input.runId,
                    input.idempotencyKey,
                );
            }
            return;
        }
        this.records.push({
            runId: input.runId,
            reference: input.reference,
            value: structuredClone(input.value),
            idempotencyKey: input.idempotencyKey,
            consumedBy: null,
        });
    }

    async consume(input: SignalConsumeInput): Promise<SignalConsumeResult> {
        validateReference(input.reference);
        const consumer = input.context.idempotencyKey;
        const assigned = this.records.find((record) =>
            record.runId === input.runId
            && record.reference === input.reference
            && record.consumedBy === consumer
        );
        if (assigned) {
            return {
                status: "available",
                value: structuredClone(assigned.value),
            };
        }
        const available = this.records.find((record) =>
            record.runId === input.runId
            && record.reference === input.reference
            && record.consumedBy === null
        );
        if (!available) {
            return { status: "waiting" };
        }
        available.consumedBy = consumer;
        return {
            status: "available",
            value: structuredClone(available.value),
        };
    }

    list(): readonly MemorySignalRecord[] {
        return structuredClone(this.records);
    }
}

export function validateSignalReference(reference: string): string {
    validateReference(reference);
    return reference;
}

function validateReference(reference: string): void {
    if (!reference.trim() || reference.trim() !== reference) {
        throw new Error("Signal reference must be a non-empty trimmed string.");
    }
}
