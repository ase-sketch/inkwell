import type {AgentCaller} from "./caller.js";
import type {ApprovalPrompt, ApprovalResolution} from "./approval.js";
import type {CapabilityScope} from "./capability.js";
import type {JsonObject, JsonValue} from "./json.js";
import type {AgentToolCall, ModelToolSpec} from "./model.js";
import type {ValueSchema} from "./schema.js";
import type {SessionId, SessionSnapshot, SessionWritePlan} from "./session.js";

/** Result returned by one Tool execution. */
export interface ToolResult<
    TSessionId extends SessionId,
    THostContext extends JsonObject,
> {
    readonly content: string;
    readonly isError?: boolean;
    readonly terminate?: boolean;
    readonly details?: JsonValue;
    readonly output?: JsonValue;
    readonly writePlans?: readonly SessionWritePlan<TSessionId, THostContext>[];
}

/** Restricted Tool context. Tools never receive the full Harness or Store. */
export interface ToolExecutionContext<
    TSessionId extends SessionId,
    THostContext extends JsonObject,
> {
    readonly sessionId: TSessionId;
    readonly invocationId: string;
    readonly profileKey: string;
    readonly turn: number;
    readonly caller: AgentCaller<TSessionId>;
    readonly hostContext: THostContext;
    readonly snapshot: SessionSnapshot<TSessionId, THostContext>;
    readonly capabilities: CapabilityScope;
    readonly signal: AbortSignal;
    /** 仅在 waiting Invocation 获批后重新执行 Tool 时存在。 */
    readonly approval?: ApprovalResolution;
}

/** Typed Tool definition normalized by a Profile. */
export interface ToolDefinition<
    TArguments extends JsonValue,
    TSessionId extends SessionId = number,
    THostContext extends JsonObject = JsonObject,
> {
    /** Provider-visible identity; it must be unique within one PreparedRun. */
    readonly name: string;
    readonly description: string;
    readonly parameters: ValueSchema<TArguments>;
    /** 会生成 SessionWritePlan 或依赖前序 Tool 状态时必须使用 sequential。 */
    readonly executionMode?: "sequential" | "parallel";
    /** 返回非空 Prompt 时，Harness 在执行当前 Tool batch 前进入 waiting。 */
    readonly approval?: {
        request(
            argumentsValue: TArguments,
            context: ToolExecutionContext<TSessionId, THostContext>,
            call: AgentToolCall,
        ): ApprovalPrompt | null | Promise<ApprovalPrompt | null>;
    };
    execute(
        argumentsValue: TArguments,
        context: ToolExecutionContext<TSessionId, THostContext>,
        call: AgentToolCall,
    ): ToolResult<TSessionId, THostContext> | Promise<ToolResult<TSessionId, THostContext>>;
}

/** Defines a Tool and validates its public name. */
export function defineTool<
    TArguments extends JsonValue,
    TSessionId extends SessionId = number,
    THostContext extends JsonObject = JsonObject,
>(
    definition: ToolDefinition<TArguments, TSessionId, THostContext>,
): ToolDefinition<TArguments, TSessionId, THostContext> {
    if (!definition.name.trim()) {
        throw new Error("Tool name 不能为空");
    }
    if (!definition.description.trim()) {
        throw new Error(`Tool ${definition.name} description 不能为空`);
    }
    return definition;
}

/** Converts a typed Tool into a provider-visible declaration. */
export function modelToolSpec<
    TArguments extends JsonValue,
    TSessionId extends SessionId,
    THostContext extends JsonObject,
>(tool: ToolDefinition<TArguments, TSessionId, THostContext>): ModelToolSpec {
    return {
        name: tool.name,
        description: tool.description,
        parameters: tool.parameters.jsonSchema ?? {type: "object"},
    };
}
