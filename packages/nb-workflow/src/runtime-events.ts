import type { WorkspacePort } from "./ports";
import type {
    ActivityRecord,
    ChartOp,
    PendingAsk,
    ProgressState,
    RunStatus,
} from "./types";

export type WorkflowEvent =
    | { type: "status"; runId: string; status: RunStatus }
    | {
        type: "activity_started";
        runId: string;
        key: string;
        path: string;
        seq: number;
        kind: string;
        fingerprint: string;
        /** canonical JSON 观测参数；公共投影可省略。 */
        params?: string;
    }
    | {
        type: "activity";
        runId: string;
        record: ActivityRecord;
        cached: boolean;
    }
    | { type: "ask_pending"; runId: string; ask: PendingAsk }
    | { type: "log"; runId: string; message: string }
    | { type: "progress"; runId: string; state: ProgressState }
    | {
        type: "control_error";
        runId: string;
        operation: "external_cancel";
        error: string;
    }
    | { type: "chart"; runId: string; op: ChartOp };

export type RunEnv = {
    workspace?: WorkspacePort;
    onEvent?: (event: WorkflowEvent) => void;
    onEventError?: (
        error: unknown,
        event: WorkflowEvent,
    ) => void;
};

export function emitWorkflowEvent(
    env: RunEnv,
    event: WorkflowEvent,
): void {
    try {
        env.onEvent?.(event);
    } catch (error) {
        try {
            env.onEventError?.(error, event);
        } catch {
            // Observation hooks cannot control Workflow execution.
        }
    }
}
