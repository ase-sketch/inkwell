import type {AgentCaller} from "./caller.js";
import type {CapabilityScope} from "./capability.js";
import type {JsonObject} from "./json.js";
import type {AgentMessage} from "./model.js";
import type {SessionId, SessionSnapshot} from "./session.js";

/** Provider-neutral message partitions inspired by TSX Profile context sets. */
export interface ContextMessageSections {
    /** Messages placed before the durable Session transcript. */
    readonly history?: readonly AgentMessage[];
    /** Dynamic messages placed after the durable transcript. */
    readonly modelContext?: readonly AgentMessage[];
    /** Current-request messages placed after modelContext and before appending. */
    readonly modelContextAppending?: readonly AgentMessage[];
    /** Messages appended after modelContext for the current request/turn. */
    readonly appending?: readonly AgentMessage[];
}

/** The current-request result produced by a read-only ContextProvider. */
export interface ContextProviderResult {
    readonly modelContext?: readonly AgentMessage[];
    readonly modelContextAppending?: readonly AgentMessage[];
}

/** Read-only input visible to one per-turn ContextProvider resolution. */
export interface ContextProviderContext<
    TSessionId extends SessionId,
    THostContext extends JsonObject,
> {
    readonly sessionId: TSessionId;
    readonly invocationId: string;
    readonly caller: AgentCaller<TSessionId>;
    readonly hostContext: THostContext;
    readonly snapshot: SessionSnapshot<TSessionId, THostContext>;
    readonly capabilities: CapabilityScope;
    readonly signal: AbortSignal;
    readonly turn: number;
}

/** Resolves model-only context for the current provider request. */
export interface ContextProvider<
    TSessionId extends SessionId,
    THostContext extends JsonObject,
> {
    readonly name: string;
    resolve(context: ContextProviderContext<TSessionId, THostContext>): ContextProviderResult | undefined | Promise<ContextProviderResult | undefined>;
}

/** Concatenates section values without changing their declared section order. */
export function mergeContextMessageSections(
    ...sections: readonly (ContextMessageSections | undefined)[]
): ContextMessageSections {
    const history = sections.flatMap((section) => section?.history ?? []);
    const modelContext = sections.flatMap((section) => section?.modelContext ?? []);
    const modelContextAppending = sections.flatMap((section) => section?.modelContextAppending ?? []);
    const appending = sections.flatMap((section) => section?.appending ?? []);
    return {
        ...(history.length > 0 ? {history} : {}),
        ...(modelContext.length > 0 ? {modelContext} : {}),
        ...(modelContextAppending.length > 0 ? {modelContextAppending} : {}),
        ...(appending.length > 0 ? {appending} : {}),
    };
}

/** Places provider-neutral sections around the durable Session transcript. */
export function composeContextMessages(
    transcript: readonly AgentMessage[],
    sections?: ContextMessageSections,
): AgentMessage[] {
    return [
        ...(sections?.history ?? []),
        ...transcript,
        ...(sections?.modelContext ?? []),
        ...(sections?.modelContextAppending ?? []),
        ...(sections?.appending ?? []),
    ];
}
