import { randomInt, randomUUID } from "node:crypto";

import type {
    BackendCapabilities,
    BackendDurability,
    BackendRequirements,
    WorkflowRunState,
} from "./types";
import type { Clock, IdGenerator, RandomSource } from "./ports";

export class WorkflowRunNotFoundError extends Error {
    constructor(readonly runId: string) {
        super(`Workflow run not found: ${runId}`);
        this.name = "WorkflowRunNotFoundError";
    }
}

export class WorkflowBackendConflictError extends Error {
    constructor(
        readonly runId: string,
        readonly expectedRevision: number,
        readonly actualRevision: number,
    ) {
        super(
            `Workflow run ${runId} revision conflict: expected `
            + `${expectedRevision}, actual ${actualRevision}`,
        );
        this.name = "WorkflowBackendConflictError";
    }
}

export class WorkflowBackendCapabilityError extends Error {
    constructor(readonly missing: readonly string[]) {
        super(`Workflow backend lacks required capabilities: ${missing.join(", ")}`);
        this.name = "WorkflowBackendCapabilityError";
    }
}

export interface WorkflowBackend {
    readonly capabilities: BackendCapabilities;

    createRun(initial: WorkflowRunState): Promise<WorkflowRunState>;
    loadRun(runId: string): Promise<WorkflowRunState | null>;
    saveRun(
        next: WorkflowRunState,
        expectedRevision: number,
    ): Promise<WorkflowRunState>;
    listRuns(): Promise<readonly WorkflowRunState[]>;
}

export const memoryBackendCapabilities: BackendCapabilities = Object.freeze({
    durability: "memory",
    processRestart: false,
    concurrentExecution: false,
    multiWorker: false,
    leases: false,
    durableSignals: false,
    durableTimers: false,
    childWorkflows: false,
    externalReceipts: false,
    outbox: false,
    valueReferences: true,
});

const durabilityRank: Record<BackendDurability, number> = {
    memory: 0,
    durable: 1,
    distributed: 2,
};

export function assertBackendCapabilities(
    available: BackendCapabilities,
    required: BackendRequirements | undefined,
): void {
    if (!required) {
        return;
    }

    const missing: string[] = [];
    if (
        required.durability
        && durabilityRank[available.durability]
            < durabilityRank[required.durability]
    ) {
        missing.push(`durability:${required.durability}`);
    }
    for (const key of [
        "processRestart",
        "concurrentExecution",
        "multiWorker",
        "leases",
        "durableSignals",
        "durableTimers",
        "childWorkflows",
        "externalReceipts",
        "outbox",
        "valueReferences",
    ] as const) {
        if (required[key] === true && available[key] !== true) {
            missing.push(key);
        }
    }
    if (missing.length > 0) {
        throw new WorkflowBackendCapabilityError(missing);
    }
}

/** 测试和 demo 用；状态仅存在于当前进程。 */
export class MemoryWorkflowBackend implements WorkflowBackend {
    readonly capabilities = memoryBackendCapabilities;
    private readonly runs = new Map<string, WorkflowRunState>();

    async createRun(initial: WorkflowRunState): Promise<WorkflowRunState> {
        if (this.runs.has(initial.runId)) {
            throw new WorkflowBackendConflictError(initial.runId, -1, 0);
        }
        if (initial.revision !== 0) {
            throw new Error("A new workflow run must start at revision 0.");
        }
        const stored = cloneRun(initial);
        this.runs.set(stored.runId, stored);
        return cloneRun(stored);
    }

    async loadRun(runId: string): Promise<WorkflowRunState | null> {
        const run = this.runs.get(runId);
        return run ? cloneRun(run) : null;
    }

    async saveRun(
        next: WorkflowRunState,
        expectedRevision: number,
    ): Promise<WorkflowRunState> {
        const current = this.runs.get(next.runId);
        if (!current) {
            throw new WorkflowRunNotFoundError(next.runId);
        }
        if (current.revision !== expectedRevision) {
            throw new WorkflowBackendConflictError(
                next.runId,
                expectedRevision,
                current.revision,
            );
        }
        assertImmutableRunFields(current, next);
        const stored = cloneRun({
            ...next,
            revision: expectedRevision + 1,
        });
        this.runs.set(stored.runId, stored);
        return cloneRun(stored);
    }

    async listRuns(): Promise<readonly WorkflowRunState[]> {
        return [...this.runs.values()]
            .sort((left, right) => left.createdAt.localeCompare(right.createdAt))
            .map(cloneRun);
    }
}

export class SystemClock implements Clock {
    now(): Date {
        return new Date();
    }
}

export class UuidIdGenerator implements IdGenerator {
    nextId(scope: "run" | "event" | "value"): string {
        return `${scope}_${randomUUID()}`;
    }
}

export class SystemRandomSource implements RandomSource {
    next(): number {
        return randomInt(0, 0x1_0000_0000) / 0x1_0000_0000;
    }
}

function cloneRun(run: WorkflowRunState): WorkflowRunState {
    return structuredClone(run);
}

function assertImmutableRunFields(
    current: WorkflowRunState,
    next: WorkflowRunState,
): void {
    const currentIdentity = JSON.stringify({
        runId: current.runId,
        definition: current.definition,
        input: current.input,
        extensionContext: current.extensionContext,
        createdAt: current.createdAt,
    });
    const nextIdentity = JSON.stringify({
        runId: next.runId,
        definition: next.definition,
        input: next.input,
        extensionContext: next.extensionContext,
        createdAt: next.createdAt,
    });
    if (currentIdentity !== nextIdentity) {
        throw new Error(`Workflow run immutable fields changed: ${current.runId}`);
    }
}
