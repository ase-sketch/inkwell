import type {FollowUpQueueState, QueuedInvocationInput} from "./coordination.js";
import type {JsonObject, JsonValue} from "./json.js";
import type {AgentCaller, MessageIdentity} from "./caller.js";
import type {SessionEntry, SessionId, SessionSnapshot} from "./session.js";

export function queuedInputJson<TSessionId extends SessionId>(item: QueuedInvocationInput<TSessionId>): JsonValue {
    return {
        id: item.id,
        kind: item.kind,
        payload: item.payload,
        ...(item.caller !== undefined ? {caller: item.caller} : {}),
        ...(item.messageIdentity !== undefined ? {messageIdentity: item.messageIdentity} : {}),
        createdAt: item.createdAt,
    };
}

/** 截断字符串使其 UTF-8 编码不超过 maxBytes（不切在 surrogate pair 中间）。 */
export function truncateUtf8Bytes(value: string, maxBytes: number): string {
    const encoder = new TextEncoder();
    if (encoder.encode(value).length <= maxBytes) return value;
    let low = 0;
    let high = value.length;
    while (low < high) {
        const mid = Math.ceil((low + high) / 2);
        if (encoder.encode(value.slice(0, mid)).length <= maxBytes) {
            low = mid;
        } else {
            high = mid - 1;
        }
    }
    // 二分按 UTF-16 code unit 计数，可能在 astral 字符的代理对中间截断；
    // 末尾是孤立高位代理时回退一个 code unit，保持完整字符。
    if (low > 0 && value.charCodeAt(low - 1) >= 0xd800 && value.charCodeAt(low - 1) <= 0xdbff) {
        low -= 1;
    }
    return value.slice(0, low);
}

/** Projects the session-level follow-up ledger independently from active branch selection. */
export function projectFollowUps<TSessionId extends SessionId = number>(entries: readonly SessionEntry[]): FollowUpQueueState<TSessionId> {
    const items = new Map<string, QueuedInvocationInput<TSessionId>>();
    let order: string[] = [];
    let paused = false;
    let pausedBy: FollowUpQueueState<TSessionId>["pausedBy"];
    for (const entry of entries) {
        if (entry.payload === null || typeof entry.payload !== "object" || Array.isArray(entry.payload)) continue;
        if (entry.kind === "harness.followUp.queued") {
            const {id, kind, payload, caller, messageIdentity, createdAt} = entry.payload;
            if (typeof id === "string" && kind === "followUp" && payload !== undefined && typeof createdAt === "number") {
                const parsedCaller = parseCaller<TSessionId>(caller);
                items.set(id, {
                    id,
                    kind,
                    payload,
                    ...(parsedCaller ? {caller: parsedCaller} : {}),
                    messageIdentity: messageIdentity === "system" ? "system" : "user",
                    createdAt,
                });
                if (!order.includes(id)) order.push(id);
            }
            continue;
        }
        if (entry.kind === "harness.followUp.consumed" || entry.kind === "harness.followUp.cancelled") {
            const id = entry.payload.id;
            if (typeof id === "string") {
                items.delete(id);
                order = order.filter((itemId) => itemId !== id);
            }
            continue;
        }
        if (entry.kind === "harness.followUp.paused" && typeof entry.payload.paused === "boolean") {
            paused = entry.payload.paused;
            pausedBy = entry.payload.paused
                && typeof entry.payload.itemId === "string"
                && typeof entry.payload.reason === "string"
                ? {
                    itemId: entry.payload.itemId,
                    reason: entry.payload.reason,
                    ...(typeof entry.payload.invocationId === "string" ? {invocationId: entry.payload.invocationId} : {}),
                    ...(typeof entry.payload.message === "string" ? {message: entry.payload.message} : {}),
                }
                : undefined;
            continue;
        }
        if (entry.kind === "harness.followUp.ordered" && Array.isArray(entry.payload.ids)) {
            const requested = entry.payload.ids.filter((id): id is string => typeof id === "string" && items.has(id));
            order = [...new Set([...requested, ...order.filter((id) => !requested.includes(id))])];
        }
    }
    return {
        paused,
        ...(pausedBy !== undefined ? {pausedBy} : {}),
        items: order.flatMap((id) => items.has(id) ? [items.get(id)!] : []),
    };
}

/** Allows an active Invocation to rebase only across session-level follow-up ledger writes. */
export function canRebaseFollowUp<TSessionId extends SessionId, THostContext extends JsonObject>(
    previous: SessionSnapshot<TSessionId, THostContext>,
    current: SessionSnapshot<TSessionId, THostContext>,
): boolean {
    if (current.entries.length < previous.entries.length) return false;
    for (let index = 0; index < previous.entries.length; index += 1) {
        if (previous.entries[index]?.id !== current.entries[index]?.id) return false;
    }
    return current.entries.slice(previous.entries.length).every((entry) => entry.kind.startsWith("harness.followUp."));
}

function parseCaller<TSessionId extends SessionId>(value: JsonValue | undefined): AgentCaller<TSessionId> | undefined {
    if (value === null || typeof value !== "object" || Array.isArray(value)) return undefined;
    if (value.kind === "user") return {kind: "user"};
    if (value.kind === "system" && typeof value.name === "string") return {kind: "system", name: value.name};
    if (value.kind === "agent"
        && (typeof value.sessionId === "string" || typeof value.sessionId === "number")
        && typeof value.profileKey === "string") {
        return {
            kind: "agent",
            sessionId: value.sessionId as TSessionId,
            profileKey: value.profileKey,
            ...(typeof value.toolCallId === "string" ? {toolCallId: value.toolCallId} : {}),
        };
    }
    return undefined;
}
