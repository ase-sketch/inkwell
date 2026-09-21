import type {JsonValue} from "./json.js";

/** Durable request emitted when Harness pauses before a gated Tool batch. */
export interface ApprovalRequest {
    readonly toolCallId: string;
    readonly toolName: string;
    readonly prompt: string;
    readonly arguments: JsonValue;
    readonly details?: JsonValue;
}

/** Host response used to resume one waiting Invocation. */
export interface ApprovalResolution {
    readonly toolCallId: string;
    readonly approved: boolean;
    readonly message?: string;
    readonly data?: JsonValue;
}

/** Tool-produced approval description before Harness enters waiting. */
export interface ApprovalPrompt {
    readonly prompt: string;
    readonly details?: JsonValue;
}
