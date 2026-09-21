import type {JsonValue} from "./json.js";
import type {AgentCaller, MessageIdentity} from "./caller.js";
import type {SessionId} from "./session.js";

/** Input queued for the current or a future Invocation. */
export interface QueuedInvocationInput<TSessionId extends SessionId = number> {
    readonly id: string;
    readonly kind: "steer" | "followUp";
    /** Parsed Value accepted at queue admission; durable follow-up reuse does not decode it again. */
    readonly payload: JsonValue;
    /** Caller is optional only for compatibility with older durable queue entries. */
    readonly caller?: AgentCaller<TSessionId>;
    /** Missing values in older queue entries are normalized to "user" by the ledger projection. */
    readonly messageIdentity?: MessageIdentity;
    readonly createdAt: number;
}

/** Durable follow-up control projection derived from Session ledger entries. */
export interface FollowUpQueueState<TSessionId extends SessionId = number> {
    readonly paused: boolean;
    /** 自动 drain 失败或 Invocation 终态（error/aborted）时的 durable 暂停原因；invocationId 仅终态暂停携带。 */
    readonly pausedBy?: {
        readonly itemId: string;
        readonly reason: string;
        readonly invocationId?: string;
        readonly message?: string;
    };
    readonly items: readonly QueuedInvocationInput<TSessionId>[];
}
