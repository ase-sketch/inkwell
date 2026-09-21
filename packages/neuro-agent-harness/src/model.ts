import type {JsonObject, JsonValue} from "./json.js";

const MODEL_TURN_ERROR_BRAND = Symbol.for("@notnotype/neuro-agent-harness/ModelTurnError");

/** Usage accumulated across one or more model turns. */
export interface TokenUsage {
    readonly input: number;
    readonly output: number;
    readonly total: number;
}

/** Complete provider-neutral blocks that are safe to retain from one failed turn. */
export type ModelTurnPartialContent =
    | {readonly type: "text"; readonly text: string}
    | {readonly type: "thinking"; readonly thinking: string};

/** Last frozen text/thinking output observed before one model turn failed. */
export interface ModelTurnPartial {
    readonly content: readonly ModelTurnPartialContent[];
}

/** Optional provider-neutral facts attached to one failed model turn. */
export interface ModelTurnErrorOptions {
    /** Usage observed for this failed turn only, not the Invocation aggregate. */
    readonly usage?: TokenUsage;
    readonly partial?: ModelTurnPartial;
    readonly cause?: unknown;
}

/** Typed failure thrown by a ModelRuntime when the failed turn produced retainable facts. */
export class ModelTurnError extends Error {
    readonly usage?: TokenUsage;
    readonly partial?: ModelTurnPartial;

    constructor(message: string, options: ModelTurnErrorOptions = {}) {
        super(message, options.cause === undefined ? undefined : {cause: options.cause});
        this.name = "ModelTurnError";
        Object.defineProperty(this, MODEL_TURN_ERROR_BRAND, {value: true});
        if (options.usage !== undefined) {
            assertTokenUsage(options.usage);
            this.usage = Object.freeze({...options.usage});
        }
        if (options.partial !== undefined) {
            this.partial = freezeModelTurnPartial(options.partial);
        }
    }
}

/** Recognizes ModelTurnError instances across duplicate package copies in one JavaScript realm. */
export function isModelTurnError(error: unknown): error is ModelTurnError {
    return error instanceof Error && Reflect.get(error, MODEL_TURN_ERROR_BRAND) === true;
}

/** Provider-neutral tool call emitted by an assistant message. */
export interface AgentToolCall {
    /** Non-empty correlation ID, unique within the current active durable transcript. */
    readonly id: string;
    readonly name: string;
    readonly arguments: JsonValue;
}

/** Provider-neutral assistant content. */
export type AssistantContent =
    | {
        readonly type: "text";
        readonly text: string;
    }
    | {
        readonly type: "thinking";
        readonly thinking: string;
    }
    | {
        readonly type: "toolCall";
        readonly call: AgentToolCall;
    };

/** Provider-neutral reference to a host-managed attachment. Blob storage, authorization, admission, hydration and size policy stay in the host. */
export interface AgentAttachmentRef {
    readonly id: string;
    readonly mimeType: string;
    readonly bytes: number;
}

/** Provider-neutral user content block. Non-visual paths (display/estimation) should use userMessageText markers instead of reading blobs. */
export type AgentUserContentBlock =
    | {
        readonly type: "text";
        readonly text: string;
    }
    | {
        readonly type: "attachment";
        readonly attachment: AgentAttachmentRef;
        readonly name?: string;
    };

/** Provider-neutral model message persisted by the Harness. */
export type AgentMessage =
    | {
        readonly role: "user";
        readonly content: string | readonly AgentUserContentBlock[];
        readonly timestamp: number;
    }
    | {
        readonly role: "assistant";
        readonly content: readonly AssistantContent[];
        readonly timestamp: number;
        readonly usage?: TokenUsage;
    }
    | {
        readonly role: "toolResult";
        readonly toolCallId: string;
        readonly toolName: string;
        readonly content: string;
        readonly isError: boolean;
        readonly timestamp: number;
        readonly details?: JsonValue;
    };

/** Provider-visible Tool declaration. */
export interface ModelToolSpec {
    readonly name: string;
    readonly description: string;
    readonly parameters: JsonObject;
}

/**
 * Provisional Provider stream events emitted while one model turn is active.
 * Tool-call deltas precede final-message admission and cannot authorize Tool or approval side effects.
 */
export type ModelRuntimeEvent =
    | {
        readonly type: "message_start";
    }
    | {
        readonly type: "text_delta";
        readonly delta: string;
    }
    | {
        readonly type: "thinking_delta";
        readonly delta: string;
    }
    | {
        readonly type: "tool_call_delta";
        readonly toolCallId: string;
        readonly toolName: string;
        readonly arguments: JsonValue;
    }
    | {
        readonly type: "message_end";
        readonly message: Extract<AgentMessage, {role: "assistant"}>;
    };

/** One frozen model request created by the Run Kernel. */
export interface ModelTurnRequest<TModelConfig extends JsonValue = JsonValue> {
    readonly profileKey: string;
    readonly turn: number;
    readonly systemPrompt: string;
    readonly messages: readonly AgentMessage[];
    readonly tools: readonly ModelToolSpec[];
    readonly modelConfig: TModelConfig;
    readonly signal: AbortSignal;
    readonly onEvent?: (event: ModelRuntimeEvent) => void | Promise<void>;
}

/** Result of one completed model turn. */
export interface ModelTurnResult {
    readonly message: Extract<AgentMessage, {role: "assistant"}>;
}

/** True external dependency Seam implemented by Pi or another provider runtime. */
export interface ModelRuntime<TModelConfig extends JsonValue = JsonValue> {
    /** 可选模型上下文窗口（token）；声明后 Harness 在配置了 ContextCompactor 时对超窗请求 fail closed（对齐 NeuroBook assertContextWithinWindow）。 */
    readonly contextWindow?: number;
    runTurn(request: ModelTurnRequest<TModelConfig>): Promise<ModelTurnResult>;
}

/** Returns all tool calls in their provider order. */
export function assistantToolCalls(message: Extract<AgentMessage, {role: "assistant"}>): AgentToolCall[] {
    return message.content.flatMap((block) => block.type === "toolCall" ? [block.call] : []);
}

/** Returns the text representation of a user message; attachment blocks degrade to a marker without reading blobs. */
export function userMessageText(message: Extract<AgentMessage, {role: "user"}>): string {
    if (typeof message.content === "string") return message.content;
    return message.content.map((block) => {
        if (block.type === "text") return block.text;
        const name = block.name !== undefined ? `, ${block.name}` : "";
        return `[attachment omitted: ${block.attachment.mimeType}, ${block.attachment.bytes} bytes${name}]`;
    }).join("");
}

/** Returns visible text from an assistant message. */
export function assistantText(message: Extract<AgentMessage, {role: "assistant"}>): string {
    return message.content.flatMap((block) => block.type === "text" ? [block.text] : []).join("");
}

function assertTokenUsage(usage: TokenUsage): void {
    if (![usage.input, usage.output, usage.total].every((value) => Number.isFinite(value) && value >= 0)) {
        throw new Error("TokenUsage 必须包含有限非负数");
    }
}

function freezeModelTurnPartial(partial: ModelTurnPartial): ModelTurnPartial {
    if (partial === null || typeof partial !== "object" || !Array.isArray(partial.content)) {
        throw new Error("ModelTurnError partial 必须包含 content 数组");
    }
    let hasContent = false;
    const content = partial.content.map((block): ModelTurnPartialContent => {
        if (block?.type === "text" && typeof block.text === "string") {
            hasContent ||= block.text.trim().length > 0;
            return Object.freeze({type: "text", text: block.text});
        }
        if (block?.type === "thinking" && typeof block.thinking === "string") {
            hasContent ||= block.thinking.trim().length > 0;
            return Object.freeze({type: "thinking", thinking: block.thinking});
        }
        throw new Error("ModelTurnError partial 只允许 text/thinking block");
    });
    if (!hasContent) {
        throw new Error("ModelTurnError partial 必须包含非空 text/thinking");
    }
    return Object.freeze({content: Object.freeze(content)});
}
