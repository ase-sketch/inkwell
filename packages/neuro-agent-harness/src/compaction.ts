import type {AgentMessage} from "./model.js";

/** Profile-selected automatic compaction thresholds. */
export interface CompactionSettings {
    readonly triggerTokens: number;
    readonly keepRecentTokens: number;
}

/** Request sent to a host-supplied summary generator. */
export interface CompactionRequest {
    readonly messages: readonly AgentMessage[];
    readonly previousSummary?: string;
    /** 宿主驱动压缩（compactSession）时的可选摘要提示。 */
    readonly instructions?: string;
    readonly signal: AbortSignal;
}

/** Summary Adapter; Harness retains trigger, cut-point and persistence semantics. */
export interface ContextCompactor {
    estimate(message: AgentMessage): number;
    summarize(request: CompactionRequest): Promise<string>;
}
