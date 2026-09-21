import { definitionReference } from "./definitions";
import { createAgentExtensionContext } from "./agent-run-context";
import type { WorkspacePort } from "./ports";
import type {
    ActivityRecord,
    AnyWorkflowDefinition,
    JsonValue,
    PendingAsk,
    PendingWait,
    ProgressState,
    RunStatus,
    RunView,
    SessionId,
    WorkflowRunState,
    WorkflowValue,
} from "./types";

export type RunRecord = {
    runId: string;
    def: AnyWorkflowDefinition;
    /** Run 创建时固定的输入快照；每次执行给脚本传新的 clone。 */
    args: JsonValue;
    storedArgs?: WorkflowValue;
    callerSessionId: SessionId | null;
    abortRequested?: boolean;
    abortController: AbortController;
    removeExternalAbort?: () => void;
    defaultModel: string | null;
    workspace: WorkspacePort | null;
    /** 本进程内待归档的 ephemeral Session；waiting 挂起时保留，终态归档后清空。 */
    ephemeralSessions: Set<SessionId>;
    status: RunStatus;
    cancelRequestedAt: string | null;
    budget: JsonValue | null;
    checkpoint: WorkflowValue | null;
    result?: JsonValue;
    storedResult?: WorkflowValue;
    error?: string;
    journal: Map<string, ActivityRecord>;
    pendingAsks: PendingAsk[];
    pendingWaits: PendingWait[];
    logs: string[];
    progress: ProgressState | null;
    revision: number;
    createdAt: string;
    updatedAt: string;
    /** 首次 createRun 完成后才允许后续 CAS save。 */
    initialization: Promise<void>;
    persistence: Promise<void>;
    /** 持久化失败后保存首次原因：后续 save 直接拒绝，阻止业务成功与 journal 分叉。 */
    persistencePoisoned?: unknown;
};

export function runRecordToView(run: RunRecord): RunView {
    const reference = definitionReference(run.def);
    return {
        runId: run.runId,
        workflowKey: reference.key,
        workflowVersion: reference.version,
        workflowManifestHash: reference.manifestHash,
        status: run.status,
        cancelRequestedAt: run.cancelRequestedAt,
        budget: cloneNullable(run.budget),
        checkpoint: cloneNullable(run.checkpoint),
        result: run.result === undefined
            ? undefined
            : structuredClone(run.result),
        error: run.error,
        pendingAsks: structuredClone(run.pendingAsks),
        pendingWaits: structuredClone(run.pendingWaits),
        logs: [...run.logs],
        progress: run.progress ? { ...run.progress } : null,
        journal: sortedJournal(run.journal.values()),
        revision: run.revision,
        createdAt: run.createdAt,
        updatedAt: run.updatedAt,
    };
}

export function workflowStateToView(
    state: WorkflowRunState,
    decodedResult: JsonValue | undefined,
): RunView {
    return {
        runId: state.runId,
        workflowKey: state.definition.key,
        workflowVersion: state.definition.version,
        workflowManifestHash: state.definition.manifestHash,
        status: state.status,
        cancelRequestedAt: state.cancelRequestedAt,
        budget: cloneNullable(state.budget),
        checkpoint: cloneNullable(state.checkpoint),
        result: decodedResult === undefined
            ? undefined
            : structuredClone(decodedResult),
        error: state.error,
        pendingAsks: structuredClone(state.pendingAsks),
        pendingWaits: structuredClone(state.pendingWaits),
        logs: [...state.logs],
        progress: state.progress ? { ...state.progress } : null,
        journal: structuredClone(state.journal),
        revision: state.revision,
        createdAt: state.createdAt,
        updatedAt: state.updatedAt,
    };
}

export function runRecordToState(run: RunRecord): WorkflowRunState {
    if (!run.storedArgs) {
        throw new Error(`Run input has not been encoded: ${run.runId}`);
    }
    return {
        runId: run.runId,
        definition: definitionReference(run.def),
        input: structuredClone(run.storedArgs),
        extensionContext: createAgentExtensionContext(
            run.callerSessionId,
            run.defaultModel,
        ),
        status: run.status,
        cancelRequestedAt: run.cancelRequestedAt,
        budget: cloneNullable(run.budget),
        checkpoint: cloneNullable(run.checkpoint),
        result: run.storedResult === undefined
            ? undefined
            : structuredClone(run.storedResult),
        error: run.error,
        pendingAsks: structuredClone(run.pendingAsks),
        pendingWaits: structuredClone(run.pendingWaits),
        logs: [...run.logs],
        progress: run.progress ? { ...run.progress } : null,
        journal: sortedJournal(run.journal.values()),
        revision: run.revision,
        createdAt: run.createdAt,
        updatedAt: run.updatedAt,
    };
}

function sortedJournal(records: Iterable<ActivityRecord>): ActivityRecord[] {
    return [...records]
        .sort((left, right) => (
            left.path === right.path
                ? left.seq - right.seq
                : left.path.localeCompare(right.path)
        ))
        .map((record) => structuredClone(record));
}

function cloneNullable<T>(value: T | null): T | null {
    return value === null ? null : structuredClone(value);
}
