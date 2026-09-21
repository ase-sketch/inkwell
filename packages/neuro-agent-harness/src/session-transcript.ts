import type {JsonObject, JsonValue} from "./json.js";
import {
    assistantToolCalls,
    type AgentMessage,
    type AgentToolCall,
    type ModelTurnPartial,
    type ModelTurnPartialContent,
    type TokenUsage,
} from "./model.js";
import type {MessageIdentity} from "./caller.js";
import {activeSessionPath, SessionInvariantError, type SessionEntry, type SessionEntryDraft, type SessionId, type SessionSnapshot} from "./session.js";

export type TranscriptProjection = {
    readonly messages: AgentMessage[];
    readonly entries: Array<SessionEntry | null>;
    readonly previousSummary?: string;
};

export const INVOCATION_USAGE_ENTRY_KIND = "harness.invocation.usage";
export const INVOCATION_PARTIAL_ENTRY_KIND = "harness.invocation.partial";

/** Durable terminal partial projected without adding it to Provider transcript. */
export interface InvocationPartial extends ModelTurnPartial {
    readonly turn: number;
}

/** Options for one canonical provider-visible Session message draft. */
export interface AgentMessageEntryDraftOptions {
    readonly turn: number;
    readonly invocationId?: string;
    readonly parentId?: string | null;
    readonly messageIdentity?: MessageIdentity;
}

/** Serializes one provider-neutral message into the canonical Session entry payload. */
export function messageEntryPayload(message: AgentMessage, turn: number, messageIdentity?: MessageIdentity): JsonValue {
    return JSON.parse(JSON.stringify({
        turn,
        message,
        ...(messageIdentity !== undefined && messageIdentity !== "user" ? {messageIdentity} : {}),
    })) as JsonValue;
}

/** Creates a canonical agent.message draft for a Profile, Tool, or Workflow write plan. */
export function createAgentMessageEntryDraft(
    message: AgentMessage,
    options: AgentMessageEntryDraftOptions,
): SessionEntryDraft {
    if (!Number.isInteger(options.turn) || options.turn < 0) {
        throw new Error("agent.message turn 必须是非负整数");
    }
    return {
        kind: "agent.message",
        payload: messageEntryPayload(message, options.turn, options.messageIdentity),
        ...(options.invocationId !== undefined ? {invocationId: options.invocationId} : {}),
        ...(options.parentId !== undefined ? {parentId: options.parentId} : {}),
    };
}

/** Creates the internal durable usage fact committed atomically with Invocation terminal state. */
export function invocationUsageEntryDraft(invocationId: string, usage: TokenUsage): SessionEntryDraft {
    assertTokenUsage(usage);
    return {
        kind: INVOCATION_USAGE_ENTRY_KIND,
        invocationId,
        payload: {...usage},
    };
}

/** Creates the internal partial fact committed atomically with Invocation terminal state. */
export function invocationPartialEntryDraft(
    invocationId: string,
    partial: InvocationPartial,
): SessionEntryDraft {
    const validated = validateInvocationPartial(partial);
    return {
        kind: INVOCATION_PARTIAL_ENTRY_KIND,
        invocationId,
        payload: {turn: validated.turn, content: validated.content.map((block) => ({...block}))},
    };
}

/** Projects the selected branch, applying the newest durable compaction record. */
export function projectSessionTranscript<TSessionId extends SessionId, THostContext extends JsonObject>(
    snapshot: SessionSnapshot<TSessionId, THostContext>,
): TranscriptProjection {
    const path = activeSessionPath(snapshot);
    const compactionIndex = path.findLastIndex((entry) => entry.kind === "agent.compaction");
    const compaction = compactionIndex >= 0 ? compactionFromEntry(path[compactionIndex]!) : undefined;
    const firstKeptIndex = compaction?.firstKeptEntryId ? path.findIndex((entry) => entry.id === compaction.firstKeptEntryId) : -1;
    if (compaction?.firstKeptEntryId && firstKeptIndex < 0) throw new Error(`compaction firstKeptEntryId 不存在：${compaction.firstKeptEntryId}`);
    const selected = compaction ? path.slice(compaction.firstKeptEntryId ? firstKeptIndex : compactionIndex + 1) : path;
    const messageEntries = selected.flatMap((entry) => {
        const message = messageFromEntry(entry);
        return message ? [{entry, message}] : [];
    });
    return {
        messages: [
            ...(compaction ? [{role: "user" as const, content: compaction.summary, timestamp: path[compactionIndex]!.timestamp}] : []),
            ...messageEntries.map((item) => item.message),
        ],
        entries: [...(compaction ? [null] : []), ...messageEntries.map((item) => item.entry)],
        ...(compaction ? {previousSummary: compaction.summary} : {}),
    };
}

export function sessionMessages<TSessionId extends SessionId, THostContext extends JsonObject>(
    snapshot: SessionSnapshot<TSessionId, THostContext>,
): AgentMessage[] {
    return projectSessionTranscript(snapshot).messages;
}

export function invocationUsage<TSessionId extends SessionId, THostContext extends JsonObject>(
    snapshot: SessionSnapshot<TSessionId, THostContext>,
    invocationId: string,
): TokenUsage {
    const terminalUsage = snapshot.entries
        .findLast((entry) => entry.kind === INVOCATION_USAGE_ENTRY_KIND && entry.invocationId === invocationId);
    if (terminalUsage) {
        const usage = tokenUsageFromEntry(terminalUsage);
        if (!usage) {
            throw new SessionInvariantError(`Invocation ${invocationId} usage fact 非法`);
        }
        return usage;
    }
    return activeSessionPath(snapshot).reduce<TokenUsage>((usage, entry) => {
        if (entry.invocationId !== invocationId) return usage;
        const message = messageFromEntry(entry);
        return message?.role === "assistant" ? addTokenUsage(usage, message.usage) : usage;
    }, {input: 0, output: 0, total: 0});
}

/** Returns the newest durable terminal partial for one Invocation. */
export function invocationPartial<TSessionId extends SessionId, THostContext extends JsonObject>(
    snapshot: SessionSnapshot<TSessionId, THostContext>,
    invocationId: string,
): InvocationPartial | undefined {
    const entry = snapshot.entries.findLast((candidate) => {
        return candidate.kind === INVOCATION_PARTIAL_ENTRY_KIND && candidate.invocationId === invocationId;
    });
    if (!entry) return undefined;
    const partial = partialFromEntry(entry);
    const invocation = snapshot.invocations.find((candidate) => candidate.id === invocationId);
    if (!partial
        || !invocation
        || (invocation.status !== "failed" && invocation.status !== "aborted")
        || partial.turn !== invocation.turnCount) {
        throw new SessionInvariantError(`Invocation ${invocationId} partial fact 非法`);
    }
    return partial;
}

function tokenUsageFromEntry(entry: SessionEntry): TokenUsage | undefined {
    const payload = entry.payload;
    if (payload === null || typeof payload !== "object" || Array.isArray(payload)) {
        return undefined;
    }
    const {input, output, total} = payload;
    if (!isTokenCount(input) || !isTokenCount(output) || !isTokenCount(total)) {
        return undefined;
    }
    return {input, output, total};
}

function partialFromEntry(entry: SessionEntry): InvocationPartial | undefined {
    const payload = entry.payload;
    if (payload === null || typeof payload !== "object" || Array.isArray(payload)) return undefined;
    try {
        return validateInvocationPartial({
            turn: payload.turn as number,
            content: payload.content as unknown as readonly ModelTurnPartialContent[],
        });
    } catch {
        return undefined;
    }
}

function validateInvocationPartial(partial: InvocationPartial): InvocationPartial {
    if (!Number.isInteger(partial.turn) || partial.turn < 1 || !Array.isArray(partial.content)) {
        throw new Error("Invocation partial turn/content 非法");
    }
    let hasContent = false;
    const content = partial.content.map((block): ModelTurnPartialContent => {
        if (block?.type === "text" && typeof block.text === "string") {
            hasContent ||= block.text.trim().length > 0;
            return {type: "text", text: block.text};
        }
        if (block?.type === "thinking" && typeof block.thinking === "string") {
            hasContent ||= block.thinking.trim().length > 0;
            return {type: "thinking", thinking: block.thinking};
        }
        throw new Error("Invocation partial 只允许 text/thinking");
    });
    if (!hasContent) throw new Error("Invocation partial 内容为空");
    return {turn: partial.turn, content};
}

export function assertNoPendingToolCalls(messages: readonly AgentMessage[]): void {
    const pending = pendingToolCalls(messages)[0];
    if (pending) throw new Error(`存在未完成 Tool Call，不能 compaction：${pending.name}`);
}

/** Matches each Tool result to one earlier call occurrence in transcript order. */
export function pendingToolCalls(messages: readonly AgentMessage[]): AgentToolCall[] {
    const pending: AgentToolCall[] = [];
    for (const message of messages) {
        if (message.role === "assistant") {
            pending.push(...assistantToolCalls(message));
            continue;
        }
        if (message.role !== "toolResult") {
            continue;
        }
        const matched = pending.findIndex((call) => call.id === message.toolCallId);
        if (matched >= 0) {
            pending.splice(matched, 1);
        }
    }
    return pending;
}

export function addTokenUsage(total: TokenUsage, current?: TokenUsage): TokenUsage {
    assertTokenUsage(total);
    if (!current) {
        return total;
    }
    assertTokenUsage(current);
    const combined = {input: total.input + current.input, output: total.output + current.output, total: total.total + current.total};
    assertTokenUsage(combined);
    return combined;
}

function assertTokenUsage(usage: TokenUsage): void {
    if (!isTokenCount(usage.input) || !isTokenCount(usage.output) || !isTokenCount(usage.total)) {
        throw new Error("TokenUsage 必须包含有限非负数");
    }
}

function isTokenCount(value: unknown): value is number {
    return typeof value === "number" && Number.isFinite(value) && value >= 0;
}

function compactionFromEntry(entry: SessionEntry): {summary: string; firstKeptEntryId: string | null} | undefined {
    if (entry.kind !== "agent.compaction" || entry.payload === null || typeof entry.payload !== "object" || Array.isArray(entry.payload)) return undefined;
    const summary = entry.payload.summary;
    const firstKeptEntryId = entry.payload.firstKeptEntryId;
    if (typeof summary !== "string" || (firstKeptEntryId !== null && typeof firstKeptEntryId !== "string")) return undefined;
    return {summary, firstKeptEntryId};
}

export function messageFromEntry(entry: {kind: string; payload: JsonValue}): AgentMessage | undefined {
    if (entry.kind !== "agent.message" || entry.payload === null || typeof entry.payload !== "object" || Array.isArray(entry.payload)) return undefined;
    const message = entry.payload.message;
    return message === undefined ? undefined : JSON.parse(JSON.stringify(message)) as AgentMessage;
}
