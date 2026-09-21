import {
    assertBackendCapabilities,
    type WorkflowBackend,
} from "./backend";
import { readAgentExtensionContext } from "./agent-run-context";
import type { DefinitionRegistry } from "./ports";
import {
    runRecordToState,
    runRecordToView,
    workflowStateToView,
    type RunRecord,
} from "./run-record";
import { unbindExternalAbort } from "./runner-support";
import { WorkflowCancelledError } from "./runtime";
import type {
    Clock,
} from "./ports";
import type {
    BackendCapabilities,
    JsonValue,
    RunView,
    WorkflowRunState,
} from "./types";
import type { WorkflowValueCodec } from "./values";

export class WorkflowPersistenceError extends Error {
    constructor(
        readonly runId: string,
        cause: unknown,
    ) {
        super(
            cause instanceof Error
                ? cause.message
                : String(cause),
            { cause },
        );
        this.name = "WorkflowPersistenceError";
    }
}

/** Runner 进程内投影与 WorkflowBackend CAS 之间的唯一同步边界。 */
export class RunnerRunStore {
    private readonly records = new Map<string, RunRecord>();

    constructor(
        private readonly backend: WorkflowBackend,
        private readonly definitions: DefinitionRegistry,
        private readonly values: WorkflowValueCodec,
        private readonly clock: Clock,
        private readonly capabilities: BackendCapabilities,
    ) {}

    add(run: RunRecord): void {
        this.records.set(run.runId, run);
    }

    delete(runId: string): void {
        this.records.delete(runId);
    }

    view(runId: string): RunView {
        return runRecordToView(this.record(runId));
    }

    async loadView(runId: string): Promise<RunView> {
        const local = this.records.get(runId);
        if (local) {
            return runRecordToView(local);
        }
        const state = await this.backend.loadRun(runId);
        if (!state) {
            throw new Error(`run ${runId} 不存在`);
        }
        return workflowStateToView(
            state,
            await this.decodeStoredResult(state),
        );
    }

    list(): RunView[] {
        return [...this.records.values()].map(runRecordToView);
    }

    async listStored(): Promise<RunView[]> {
        return await Promise.all((await this.backend.listRuns()).map(
            async (state) => workflowStateToView(
                state,
                await this.decodeStoredResult(state),
            ),
        ));
    }

    async initialize(run: RunRecord): Promise<void> {
        run.storedArgs = await this.values.encode(run.args);
        const stored = await this.backend.createRun(
            runRecordToState(run),
        );
        run.revision = stored.revision;
        run.updatedAt = stored.updatedAt;
    }

    async loadRecord(runId: string): Promise<RunRecord> {
        const local = this.records.get(runId);
        if (local) {
            return local;
        }
        const state = await this.backend.loadRun(runId);
        if (!state) {
            throw new Error(`run ${runId} 不存在`);
        }
        const run = await this.hydrate(state);
        assertBackendCapabilities(
            this.capabilities,
            run.def.requires,
        );
        this.records.set(runId, run);
        return run;
    }

    async persist(run: RunRecord): Promise<void> {
        await run.initialization;
        if (run.persistencePoisoned) {
            throw new WorkflowPersistenceError(
                run.runId,
                run.persistencePoisoned,
            );
        }
        const operation = run.persistence.then(async () => {
            run.updatedAt = this.clock.now().toISOString();
            const stored = await this.backend.saveRun(
                runRecordToState(run),
                run.revision,
            );
            run.revision = stored.revision;
            run.updatedAt = stored.updatedAt;
        });
        run.persistence = operation.catch(() => undefined);
        try {
            await operation;
        } catch (error) {
            run.persistencePoisoned = error;
            // 保留本地投影：view()/loadView() 保持一致地返回最后已知
            // 快照，后续 persist 由 poisoned 标志直接拒绝。
            unbindExternalAbort(run);
            throw error instanceof WorkflowPersistenceError
                ? error
                : new WorkflowPersistenceError(run.runId, error);
        }
    }

    private record(runId: string): RunRecord {
        const run = this.records.get(runId);
        if (!run) {
            throw new Error(`run ${runId} 不存在`);
        }
        return run;
    }

    private async hydrate(state: WorkflowRunState): Promise<RunRecord> {
        const abortController = new AbortController();
        const agentContext = readAgentExtensionContext(
            state.extensionContext,
        );
        if (state.cancelRequestedAt !== null) {
            abortController.abort(new WorkflowCancelledError());
        }
        return {
            runId: state.runId,
            def: this.definitions.resolve(state.definition),
            args: await this.values.decode(state.input),
            storedArgs: structuredClone(state.input),
            callerSessionId: agentContext.callerSessionId,
            abortRequested: state.cancelRequestedAt !== null,
            abortController,
            defaultModel: agentContext.defaultModel,
            workspace: null,
            ephemeralSessions: new Set(),
            status: state.status,
            cancelRequestedAt: state.cancelRequestedAt,
            budget: structuredClone(state.budget),
            checkpoint: state.checkpoint
                ? structuredClone(state.checkpoint)
                : null,
            result: await this.decodeStoredResult(state),
            storedResult: state.result === undefined
                ? undefined
                : structuredClone(state.result),
            error: state.error,
            journal: new Map(state.journal.map(
                (record) => [record.key, structuredClone(record)],
            )),
            pendingAsks: structuredClone(state.pendingAsks),
            pendingWaits: structuredClone(state.pendingWaits),
            logs: [...state.logs],
            progress: state.progress ? { ...state.progress } : null,
            revision: state.revision,
            createdAt: state.createdAt,
            updatedAt: state.updatedAt,
            initialization: Promise.resolve(),
            persistence: Promise.resolve(),
        };
    }

    private async decodeStoredResult(
        state: WorkflowRunState,
    ): Promise<JsonValue | undefined> {
        return state.result === undefined
            ? undefined
            : await this.values.decode(state.result);
    }
}
