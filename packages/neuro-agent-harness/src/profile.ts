import type {AgentCaller} from "./caller.js";
import type {CapabilityScope, CapabilityToken} from "./capability.js";
import type {CompactionSettings} from "./compaction.js";
import type {ContextMessageSections, ContextProvider} from "./context.js";
import type {JsonObject, JsonValue} from "./json.js";
import type {AgentMessage} from "./model.js";
import type {ValueSchema} from "./schema.js";
import type {InvocationTerminationReason, SessionId, SessionSnapshot, SessionWritePlan} from "./session.js";
import type {ToolDefinition} from "./tool.js";

/** Stable Profile metadata shown by a host and used for Invocation compatibility. */
export interface ProfileManifest {
    readonly key: string;
    readonly name: string;
    readonly description?: string;
    /** Positive approval-resume compatibility version. Missing values have effective version 1. */
    readonly version?: number;
}

/** Metadata that Core stores and passes through without interpreting it. */
export interface ProfileFacet<TName extends string = string, TValue extends JsonValue = JsonValue> {
    readonly name: TName;
    readonly value: TValue;
}

/** Defines a typed Profile facet such as Low-Code Form or Profile Home metadata. */
export function defineProfileFacet<TName extends string, TValue extends JsonValue>(name: TName, value: TValue): ProfileFacet<TName, TValue> {
    if (!name.trim()) {
        throw new Error("Profile facet name 不能为空");
    }
    return {name, value};
}

/** Run policy chosen by one Profile. */
export interface ProfileRunLimits {
    readonly maxTurns: number;
    readonly maxConsecutiveToolErrorTurns?: number;
}

/** Profile preparation context created once per Invocation. */
export interface ProfilePrepareContext<
    TInitial extends JsonValue,
    TPayload extends JsonValue,
    TSessionId extends SessionId,
    THostContext extends JsonObject,
> {
    readonly sessionId: TSessionId;
    readonly invocationId: string;
    readonly caller: AgentCaller<TSessionId>;
    /** Validated Parsed Value from durable Session metadata. */
    readonly initial: TInitial;
    /** Validated Parsed Value admitted for this Invocation. */
    readonly payload: TPayload;
    readonly hostContext: THostContext;
    readonly snapshot: SessionSnapshot<TSessionId, THostContext>;
    readonly capabilities: CapabilityScope;
    readonly signal: AbortSignal;
}

/** Frozen Run material produced by a Profile. */
export interface PreparedRun<
    TSessionId extends SessionId,
    THostContext extends JsonObject,
    TModelConfig extends JsonValue,
> {
    readonly systemPrompt: string;
    readonly modelConfig: TModelConfig;
    /** Optional provider-neutral sections around the durable Session transcript. */
    readonly context?: ContextMessageSections;
    /** Read-only model-only context resolved against the latest Snapshot on every model turn. */
    readonly contextProviders?: readonly ContextProvider<TSessionId, THostContext>[];
    /** 覆盖默认的 JSON payload user message；用于宿主把用户意图与上下文编排成稳定提示。 */
    readonly userMessage?: string;
    readonly messages?: readonly AgentMessage[];
    /** Tool names are provider-visible identities and must be unique in this PreparedRun. */
    readonly tools?: readonly ToolDefinition<JsonValue, TSessionId, THostContext>[];
    /** parallel 只并发执行未声明 sequential 的 Tool；结果仍按 provider call 顺序提交。 */
    readonly toolExecution?: "sequential" | "parallel";
    readonly compaction?: CompactionSettings;
    readonly limits?: ProfileRunLimits;
    readonly prepareWrites?: readonly SessionWritePlan<TSessionId, THostContext>[];
}

/** Effects returned by Profile hooks. */
export interface RuntimeEffect<
    TSessionId extends SessionId,
    THostContext extends JsonObject,
> {
    /** Optional provider-neutral sections for the current/next model turn. */
    readonly context?: ContextMessageSections;
    readonly runtimeMessages?: readonly AgentMessage[];
    readonly writePlans?: readonly SessionWritePlan<TSessionId, THostContext>[];
    readonly output?: JsonValue;
}

/** Runtime hook stages supported by the first standalone Kernel. */
export type RuntimeHookStage = "prepareRun" | "beforeTurn" | "afterTurn" | "settleRun" | "settleFailure";

/** Context passed to one Profile runtime hook. */
export interface RuntimeHookContext<
    TSessionId extends SessionId,
    THostContext extends JsonObject,
> {
    readonly stage: RuntimeHookStage;
    readonly sessionId: TSessionId;
    readonly invocationId: string;
    readonly caller: AgentCaller<TSessionId>;
    readonly hostContext: THostContext;
    readonly snapshot: SessionSnapshot<TSessionId, THostContext>;
    readonly capabilities: CapabilityScope;
    readonly signal: AbortSignal;
    readonly turn?: number;
    readonly messages?: readonly AgentMessage[];
    /** 仅 settleRun 存在。 */
    readonly terminationReason?: InvocationTerminationReason;
    readonly output?: JsonValue;
    readonly error?: Error;
}

/** Profile runtime hook. Hooks return effects and never access the Store directly. */
export interface RuntimeHook<
    TSessionId extends SessionId,
    THostContext extends JsonObject,
> {
    readonly name: string;
    readonly stage: RuntimeHookStage;
    run(context: RuntimeHookContext<TSessionId, THostContext>): RuntimeEffect<TSessionId, THostContext> | Promise<RuntimeEffect<TSessionId, THostContext>>;
}

/** Public Profile definition. */
export interface AgentProfile<
    TInitial extends JsonValue,
    TPayload extends JsonValue,
    TOutput extends JsonValue,
    TSessionId extends SessionId = number,
    THostContext extends JsonObject = JsonObject,
    TModelConfig extends JsonValue = JsonValue,
> {
    readonly manifest: ProfileManifest;
    readonly initial: ValueSchema<TInitial>;
    readonly payload: ValueSchema<TPayload>;
    readonly output?: ValueSchema<TOutput>;
    readonly requiredCapabilities?: readonly CapabilityToken<string, object>[];
    readonly facets?: readonly ProfileFacet[];
    readonly hooks?: readonly RuntimeHook<TSessionId, THostContext>[];
    prepare(context: ProfilePrepareContext<TInitial, TPayload, TSessionId, THostContext>): PreparedRun<TSessionId, THostContext, TModelConfig> | Promise<PreparedRun<TSessionId, THostContext, TModelConfig>>;
}

/** Defines a Profile and validates stable manifest invariants. */
export function defineProfile<
    TInitial extends JsonValue,
    TPayload extends JsonValue,
    TOutput extends JsonValue,
    TSessionId extends SessionId = number,
    THostContext extends JsonObject = JsonObject,
    TModelConfig extends JsonValue = JsonValue,
>(
    profile: AgentProfile<TInitial, TPayload, TOutput, TSessionId, THostContext, TModelConfig>,
): AgentProfile<TInitial, TPayload, TOutput, TSessionId, THostContext, TModelConfig> {
    if (!profile.manifest.key.trim()) {
        throw new Error("Profile manifest.key 不能为空");
    }
    if (!profile.manifest.name.trim()) {
        throw new Error(`Profile ${profile.manifest.key} manifest.name 不能为空`);
    }
    if (profile.manifest.version !== undefined && (!Number.isInteger(profile.manifest.version) || profile.manifest.version <= 0)) {
        throw new Error(`Profile ${profile.manifest.key} manifest.version 必须是正整数`);
    }
    return profile;
}
