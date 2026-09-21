import { randomUUID } from "node:crypto";

import { fingerprint } from "./fingerprint";
import type {
    ChildWorkflowStartInput,
    ChildWorkflowStartResult,
    ChildWorkflowStore,
} from "./ports";
import type { JsonValue } from "./types";

export class ChildWorkflowStoreNotConfiguredError extends Error {
    constructor() {
        super("No ChildWorkflowStore is configured for this WorkflowRunner.");
        this.name = "ChildWorkflowStoreNotConfiguredError";
    }
}

export class ChildWorkflowConflictError extends Error {
    constructor(readonly idempotencyKey: string) {
        super(`Child Workflow idempotency conflict: ${idempotencyKey}`);
        this.name = "ChildWorkflowConflictError";
    }
}

export class ChildWorkflowTerminalError extends Error {
    constructor(
        readonly runId: string,
        readonly status: "failed" | "cancelled",
        message: string,
    ) {
        super(`Child Workflow ${runId} ${status}: ${message}`);
        this.name = "ChildWorkflowTerminalError";
    }
}

export type MemoryChildWorkflowRecord = {
    runId: string;
    parentRunId: string;
    workflowReference: string;
    input: JsonValue;
    key: string | null;
    wait: boolean;
    cancelPolicy: "propagate" | "abandon";
    idempotencyKey: string;
    status: "running" | "completed" | "failed" | "cancelled";
    result?: JsonValue;
    error?: string;
};

export class UnsupportedChildWorkflowStore implements ChildWorkflowStore {
    async start(): Promise<ChildWorkflowStartResult> {
        throw new ChildWorkflowStoreNotConfiguredError();
    }

    async cancelForParent(): Promise<void> {
        // 没有 Child Workflow 能力时，普通父 Run 的取消仍应可用。
    }
}

/** 测试/demo Child Store；只建模稳定 parent-child binding 和终态。 */
export class MemoryChildWorkflowStore implements ChildWorkflowStore {
    private readonly records = new Map<string, MemoryChildWorkflowRecord>();

    async start(
        input: ChildWorkflowStartInput,
    ): Promise<ChildWorkflowStartResult> {
        const key = input.context.idempotencyKey;
        let record = this.records.get(key);
        if (!record) {
            record = {
                runId: `child_${randomUUID()}`,
                parentRunId: input.parentRunId,
                workflowReference: input.workflowReference,
                input: structuredClone(input.input),
                key: input.options.key ?? null,
                wait: input.options.wait,
                cancelPolicy: input.options.cancelPolicy,
                idempotencyKey: key,
                status: "running",
            };
            this.records.set(key, record);
        } else if (
            record.parentRunId !== input.parentRunId
            || record.workflowReference !== input.workflowReference
            || fingerprint(record.input) !== fingerprint(input.input)
            || record.key !== (input.options.key ?? null)
            || record.wait !== input.options.wait
            || record.cancelPolicy !== input.options.cancelPolicy
        ) {
            throw new ChildWorkflowConflictError(key);
        }
        return toStartResult(record);
    }

    async complete(runId: string, result: JsonValue): Promise<void> {
        const record = this.byRunId(runId);
        if (record.status === "completed") {
            if (fingerprint(record.result ?? null) !== fingerprint(result)) {
                throw new ChildWorkflowConflictError(record.idempotencyKey);
            }
            return;
        }
        if (record.status !== "running") {
            throw new Error(
                `Child Workflow ${runId} is already ${record.status}.`,
            );
        }
        record.status = "completed";
        record.result = structuredClone(result);
    }

    async fail(runId: string, error: string): Promise<void> {
        const record = this.byRunId(runId);
        if (record.status !== "running") {
            throw new Error(
                `Child Workflow ${runId} is already ${record.status}.`,
            );
        }
        record.status = "failed";
        record.error = error;
    }

    async cancelForParent(parentRunId: string): Promise<void> {
        for (const record of this.records.values()) {
            if (
                record.parentRunId === parentRunId
                && record.status === "running"
                && record.cancelPolicy === "propagate"
            ) {
                record.status = "cancelled";
                record.error = "parent workflow cancelled";
            }
        }
    }

    list(): readonly MemoryChildWorkflowRecord[] {
        return [...this.records.values()].map((record) =>
            structuredClone(record)
        );
    }

    private byRunId(runId: string): MemoryChildWorkflowRecord {
        const record = [...this.records.values()].find(
            (candidate) => candidate.runId === runId,
        );
        if (!record) {
            throw new Error(`Unknown Child Workflow: ${runId}`);
        }
        return record;
    }
}

function toStartResult(
    record: MemoryChildWorkflowRecord,
): ChildWorkflowStartResult {
    if (record.status === "running") {
        return { status: "running", runId: record.runId };
    }
    if (record.status === "completed") {
        return {
            status: "completed",
            runId: record.runId,
            result: structuredClone(record.result ?? null),
        };
    }
    return {
        status: record.status,
        runId: record.runId,
        error: record.error ?? `child workflow ${record.status}`,
    };
}
