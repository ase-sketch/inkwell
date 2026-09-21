import {randomUUID} from "node:crypto";
import {clearDurablePublicationState, publishEventBatch} from "./event-publication.js";
import type {JsonValue} from "./json.js";
import type {ApprovalRequest, ApprovalResolution} from "./approval.js";
import type {FollowUpQueueState, QueuedInvocationInput} from "./coordination.js";
import type {AgentMessage, ModelRuntimeEvent, TokenUsage} from "./model.js";
import type {SessionEntry, SessionId, SessionStatus} from "./session.js";

/** Recoverable Session event cursor. */
export interface EventCursor {
    readonly eventEpoch?: string;
    readonly after?: number;
}

/** Stable runtime event contract independent from a provider SDK. */
export type HarnessRuntimeEvent =
    | {
        readonly type: "agent_start";
        readonly profileKey: string;
    }
    | {
        readonly type: "agent_end";
        readonly status: "completed" | "waiting" | "failed" | "aborted" | "interrupted";
        readonly usage?: TokenUsage;
    }
    | {
        readonly type: "turn_start";
        readonly turn: number;
    }
    | {
        readonly type: "turn_end";
        readonly turn: number;
        readonly status: "completed" | "failed" | "waiting";
    }
    | {
        readonly type: "model_event";
        readonly turn: number;
        readonly event: ModelRuntimeEvent;
    }
    | {
        /**
         * 仅 Harness 发起的 transcript 提交发布（user/assistant/Tool 结果与
         * approval resume），保证消息已 durable 提交；宿主通过 write /
         * prepareWrites / writePlans / forkSession 提交的消息只经
         * session_entry 投递。跨事件类型的相对顺序不作承诺。
         */
        readonly type: "message_committed";
        readonly turn: number;
        readonly message: AgentMessage;
    }
    | {
        readonly type: "tool_execution_start";
        readonly turn: number;
        readonly toolCallId: string;
        readonly toolName: string;
        readonly arguments: JsonValue;
    }
    | {
        readonly type: "tool_execution_end";
        readonly turn: number;
        readonly toolCallId: string;
        readonly toolName: string;
        readonly result: string;
        readonly isError: boolean;
    }
    | {
        readonly type: "compaction_start";
        readonly tokensBefore: number;
    }
    | {
        readonly type: "compaction_end";
        readonly tokensBefore: number;
        readonly keptMessages: number;
    }
    | {
        readonly type: "approval_required";
        readonly requests: readonly ApprovalRequest[];
    }
    | {
        readonly type: "approval_resolved";
        readonly resolutions: readonly ApprovalResolution[];
    };

/** Stable Session-control events emitted after durable commits. */
export type HarnessSessionEvent<TSessionId extends SessionId = number> =
    | {
        readonly type: "session_entry";
        readonly entry: SessionEntry;
    }
    | {
        readonly type: "session_status";
        readonly status: SessionStatus;
        readonly activeInvocationId: string | null;
        readonly version: number;
    }
    | {
        /**
         * 订阅期（陈旧 epoch/游标越界/replay 过期）的恢复由
         * `EventConnected.snapshotRequired` 标志表达，不发布事件；
         * 该事件只用于 durable publication batch 的 commit-order 异常。
         */
        readonly type: "snapshot_required";
        readonly reason: "commit_order";
    }
    | {
        readonly type: "steer_queued" | "steer_drained" | "follow_up_queued" | "follow_up_started";
        readonly item: QueuedInvocationInput<TSessionId>;
    }
    | {
        readonly type: "follow_up_state";
        readonly state: FollowUpQueueState<TSessionId>;
    };

/** Optional host event carried without teaching Core its product meaning. */
export interface HarnessHostEvent {
    readonly type: "host";
    readonly name: string;
    readonly payload: JsonValue;
}

/** Event envelope used by SSE or another transport Adapter. */
export type HarnessEvent<TSessionId extends SessionId = number> = {
    readonly eventEpoch: string;
    readonly seq: number;
    readonly sessionId: TSessionId;
    readonly invocationId?: string;
} & (
    | {
        readonly kind: "runtime";
        readonly event: HarnessRuntimeEvent;
    }
    | {
        readonly kind: "session";
        readonly event: HarnessSessionEvent<TSessionId>;
    }
    | {
        readonly kind: "host";
        readonly event: HarnessHostEvent;
    }
);

/** Connected handshake returned before replay/live events. */
export interface EventConnected<TSessionId extends SessionId> {
    readonly sessionId: TSessionId;
    readonly eventEpoch: string;
    readonly latestSeq: number;
    readonly snapshotRequired: boolean;
}

export type EventSubscriptionCloseReason = "consumer_closed" | "queue_overflow" | "hub_closed";

/** Async event subscription consumed by HTTP/SSE or tests. */
export interface EventSubscription<TSessionId extends SessionId>
    extends AsyncIterable<HarnessEvent<TSessionId>>, AsyncIterator<HarnessEvent<TSessionId>> {
    readonly connected: EventConnected<TSessionId>;
    readonly signal: AbortSignal;
    readonly closeReason: EventSubscriptionCloseReason | null;
    return(): Promise<IteratorResult<HarnessEvent<TSessionId>>>;
    throw(error?: unknown): Promise<IteratorResult<HarnessEvent<TSessionId>>>;
    /** Stops accepting live events, then allows already queued replay/live events to drain. */
    close(reason?: EventSubscriptionCloseReason): Promise<void>;
}

type EventDraft<TSessionId extends SessionId> = Omit<HarnessEvent<TSessionId>, "eventEpoch" | "seq">;

type StoredHarnessEvent<TSessionId extends SessionId> = {
    readonly event: HarnessEvent<TSessionId>;
    readonly serializedBytes: number;
};

class EventQueue<TSessionId extends SessionId> implements AsyncIterator<HarnessEvent<TSessionId>> {
    readonly signal: AbortSignal;
    private readonly abortController = new AbortController();
    private readonly replayValues: StoredHarnessEvent<TSessionId>[];
    private readonly liveValues: StoredHarnessEvent<TSessionId>[] = [];
    private liveBytes = 0;
    private readonly resolvers: Array<(result: IteratorResult<HarnessEvent<TSessionId>>) => void> = [];
    private closed = false;
    private _closeReason: EventSubscriptionCloseReason | null = null;

    constructor(input: {
        replay: StoredHarnessEvent<TSessionId>[];
        queueLimit: number;
        queueByteLimit: number;
        onClose: () => void;
    }) {
        this.replayValues = input.replay;
        this.queueLimit = input.queueLimit;
        this.queueByteLimit = input.queueByteLimit;
        this.onClose = input.onClose;
        this.signal = this.abortController.signal;
    }

    private readonly queueLimit: number;
    private readonly queueByteLimit: number;
    private readonly onClose: () => void;

    get closeReason(): EventSubscriptionCloseReason | null {
        return this._closeReason;
    }

    push(stored: StoredHarnessEvent<TSessionId>): void {
        if (this.closed) {
            return;
        }
        if (this.resolvers.length > 0 && this.replayValues.length === 0) {
            const resolve = this.resolvers.shift()!;
            resolve({done: false, value: stored.event});
            return;
        }
        if (this.liveValues.length + 1 > this.queueLimit
            || this.liveBytes + stored.serializedBytes > this.queueByteLimit) {
            this.close("queue_overflow", true);
            return;
        }
        this.liveValues.push(stored);
        this.liveBytes += stored.serializedBytes;
    }

    async next(): Promise<IteratorResult<HarnessEvent<TSessionId>>> {
        const replay = this.replayValues.shift();
        if (replay) {
            return {done: false, value: replay.event};
        }
        const live = this.liveValues.shift();
        if (live) {
            this.liveBytes -= live.serializedBytes;
            return {done: false, value: live.event};
        }
        if (this.closed) {
            return {done: true, value: undefined};
        }
        return new Promise((resolve) => {
            this.resolvers.push(resolve);
        });
    }

    close(reason: EventSubscriptionCloseReason = "hub_closed", discard = false): void {
        if (!this.closed) {
            this.closed = true;
            this._closeReason = reason;
            this.abortController.abort(reason);
            this.onClose();
        }
        if (discard) {
            this.replayValues.length = 0;
            this.liveValues.length = 0;
            this.liveBytes = 0;
        }
        for (const resolve of this.resolvers.splice(0)) {
            resolve({done: true, value: undefined});
        }
    }

    async return(): Promise<IteratorResult<HarnessEvent<TSessionId>>> {
        this.close("consumer_closed", true);
        return {done: true, value: undefined};
    }

    async throw(error?: unknown): Promise<IteratorResult<HarnessEvent<TSessionId>>> {
        this.close("consumer_closed", true);
        throw error;
    }

    metrics(): Pick<SessionEventHubMetrics, "queuedCount" | "queuedBytes" | "pendingReplayCount" | "pendingReplayBytes"> {
        return {
            queuedCount: this.liveValues.length,
            queuedBytes: this.liveBytes,
            pendingReplayCount: this.replayValues.length,
            pendingReplayBytes: this.replayValues.reduce((total, stored) => total + stored.serializedBytes, 0),
        };
    }
}

export interface SessionEventHubOptions {
    /** Maximum replay events retained per Session. Defaults to 500. */
    readonly replayLimit?: number;
    /** Maximum serialized replay bytes retained per Session. Defaults to 4 MiB. */
    readonly replayByteLimit?: number;
    /** Maximum queued live events retained per subscriber. Defaults to 128. */
    readonly subscriberQueueLimit?: number;
    /** Maximum serialized live-event bytes retained per subscriber. Defaults to 1 MiB. */
    readonly subscriberQueueByteLimit?: number;
    readonly eventEpoch?: string;
}

export interface SessionEventHubMetrics {
    readonly replayCount: number;
    readonly replayBytes: number;
    readonly subscriberCount: number;
    readonly queuedCount: number;
    readonly queuedBytes: number;
    readonly pendingReplayCount: number;
    readonly pendingReplayBytes: number;
}

/** In-process event hub with process epoch, per-Session seq and bounded replay. */
export class SessionEventHub<TSessionId extends SessionId = number> {
    readonly eventEpoch: string;
    private readonly replayLimit: number;
    private readonly replayByteLimit: number;
    private readonly subscriberQueueLimit: number;
    private readonly subscriberQueueByteLimit: number;
    private readonly replay = new Map<TSessionId, StoredHarnessEvent<TSessionId>[]>();
    private readonly replayBytes = new Map<TSessionId, number>();
    private readonly seq = new Map<TSessionId, number>();
    private readonly subscribers = new Map<TSessionId, Set<EventQueue<TSessionId>>>();
    private closed = false;
    private publishing = false;
    private readonly pendingBatches: Array<readonly StoredHarnessEvent<TSessionId>[]> = [];

    constructor(options: SessionEventHubOptions = {}) {
        this.replayLimit = options.replayLimit ?? 500;
        this.replayByteLimit = options.replayByteLimit ?? 4 * 1024 * 1024;
        this.subscriberQueueLimit = options.subscriberQueueLimit ?? 128;
        this.subscriberQueueByteLimit = options.subscriberQueueByteLimit ?? 1024 * 1024;
        this.eventEpoch = options.eventEpoch ?? randomUUID();
        if (!Number.isInteger(this.replayLimit) || this.replayLimit <= 0) {
            throw new Error("event replayLimit 必须是正整数");
        }
        if (!Number.isInteger(this.replayByteLimit) || this.replayByteLimit <= 0) {
            throw new Error("event replayByteLimit 必须是正整数");
        }
        if (!Number.isInteger(this.subscriberQueueLimit) || this.subscriberQueueLimit <= 0) {
            throw new Error("event subscriberQueueLimit 必须是正整数");
        }
        if (!Number.isInteger(this.subscriberQueueByteLimit) || this.subscriberQueueByteLimit <= 0) {
            throw new Error("event subscriberQueueByteLimit 必须是正整数");
        }
    }

    /** Publishes one event and returns its assigned cursor. */
    publish(draft: EventDraft<TSessionId>): HarnessEvent<TSessionId> {
        return this[publishEventBatch]([draft])[0]!;
    }

    /** @internal Stages serialization for an entire batch before mutating replay or notifying subscribers. */
    [publishEventBatch](drafts: readonly EventDraft<TSessionId>[]): readonly HarnessEvent<TSessionId>[] {
        this.assertOpen();
        const storedBatch = this.stageEventBatch(drafts);
        if (this.publishing) {
            this.pendingBatches.push(storedBatch);
            return storedBatch.map((stored) => stored.event);
        }

        this.publishing = true;
        try {
            this.dispatchEventBatch(storedBatch);
            while (this.pendingBatches.length > 0) {
                const pending = this.pendingBatches.shift();
                if (pending) this.dispatchEventBatch(pending);
            }
            return storedBatch.map((stored) => stored.event);
        } finally {
            this.publishing = false;
        }
    }

    private stageEventBatch(drafts: readonly EventDraft<TSessionId>[]): readonly StoredHarnessEvent<TSessionId>[] {
        const detachedDrafts = drafts.map((draft) => detachEventDraft(draft));
        this.assertOpen();
        const nextSeq = new Map<TSessionId, number>();
        const storedBatch = detachedDrafts.map((draft) => {
            const seq = (nextSeq.get(draft.sessionId) ?? this.latestSeq(draft.sessionId)) + 1;
            nextSeq.set(draft.sessionId, seq);
            return storeEvent({
                ...draft,
                eventEpoch: this.eventEpoch,
                seq,
            } as HarnessEvent<TSessionId>);
        });
        const stagedReplay = new Map<TSessionId, StoredHarnessEvent<TSessionId>[]>();
        const stagedReplayBytes = new Map<TSessionId, number>();
        for (const stored of storedBatch) {
            const sessionId = stored.event.sessionId;
            let replay = stagedReplay.get(sessionId);
            if (!replay) {
                replay = [...(this.replay.get(sessionId) ?? [])];
                stagedReplay.set(sessionId, replay);
                stagedReplayBytes.set(sessionId, this.replayBytes.get(sessionId) ?? 0);
            }
            replay.push(stored);
            let replayBytes = (stagedReplayBytes.get(sessionId) ?? 0) + stored.serializedBytes;
            while (replay.length > this.replayLimit || replayBytes > this.replayByteLimit) {
                const removed = replay.shift();
                if (!removed) break;
                replayBytes -= removed.serializedBytes;
            }
            stagedReplayBytes.set(sessionId, replayBytes);
        }
        for (const [sessionId, seq] of nextSeq) {
            this.seq.set(sessionId, seq);
        }
        for (const [sessionId, replay] of stagedReplay) {
            this.replay.set(sessionId, replay);
            this.replayBytes.set(sessionId, stagedReplayBytes.get(sessionId) ?? 0);
        }
        return storedBatch;
    }

    private dispatchEventBatch(storedBatch: readonly StoredHarnessEvent<TSessionId>[]): void {
        for (const stored of storedBatch) {
            for (const subscriber of [...(this.subscribers.get(stored.event.sessionId) ?? [])]) {
                subscriber.push(stored);
            }
        }
    }

    /** Returns the current cursor for a Snapshot. */
    cursor(sessionId: TSessionId): Required<EventCursor> {
        this.assertOpen();
        return {
            eventEpoch: this.eventEpoch,
            after: this.latestSeq(sessionId),
        };
    }

    /** Subscribes from a cursor; invalid cursors require Snapshot recovery. */
    subscribe(sessionId: TSessionId, cursor: EventCursor = {}): EventSubscription<TSessionId> {
        this.assertOpen();
        const replay = this.replay.get(sessionId) ?? [];
        const latestSeq = this.latestSeq(sessionId);
        const oldestSeq = replay[0]?.event.seq ?? latestSeq + 1;
        const missingEpoch = cursor.eventEpoch === undefined
            && cursor.after !== undefined
            && cursor.after > 0;
        const epochMatches = !missingEpoch
            && (cursor.eventEpoch === undefined || cursor.eventEpoch === this.eventEpoch);
        const after = cursor.after ?? latestSeq;
        const snapshotRequired = !epochMatches || after > latestSeq || after < oldestSeq - 1;
        const pendingReplay = snapshotRequired ? [] : replay.filter((stored) => stored.event.seq > after);

        const subscribers = this.subscribers.get(sessionId) ?? new Set<EventQueue<TSessionId>>();
        let queue!: EventQueue<TSessionId>;
        queue = new EventQueue<TSessionId>({
            replay: pendingReplay,
            queueLimit: this.subscriberQueueLimit,
            queueByteLimit: this.subscriberQueueByteLimit,
            onClose: () => {
                subscribers.delete(queue);
                if (subscribers.size === 0 && this.subscribers.get(sessionId) === subscribers) {
                    this.subscribers.delete(sessionId);
                }
            },
        });
        subscribers.add(queue);
        this.subscribers.set(sessionId, subscribers);

        const subscription: EventSubscription<TSessionId> = {
            connected: {
                sessionId,
                eventEpoch: this.eventEpoch,
                latestSeq,
                snapshotRequired,
            },
            get signal() {
                return queue.signal;
            },
            get closeReason() {
                return queue.closeReason;
            },
            next() {
                return queue.next();
            },
            return() {
                return queue.return();
            },
            throw(error?: unknown) {
                return queue.throw(error);
            },
            [Symbol.asyncIterator]() {
                return subscription;
            },
            async close(reason = "consumer_closed") {
                queue.close(reason, reason !== "consumer_closed");
            },
        };
        return subscription;
    }

    latestSeq(sessionId: TSessionId): number {
        return this.seq.get(sessionId) ?? 0;
    }

    /** Returns payload-free counters for replay and subscriptions still owned by this Hub. */
    metrics(sessionId: TSessionId): SessionEventHubMetrics {
        const subscribers = this.subscribers.get(sessionId);
        let queuedCount = 0;
        let queuedBytes = 0;
        let pendingReplayCount = 0;
        let pendingReplayBytes = 0;
        for (const subscriber of subscribers ?? []) {
            const metrics = subscriber.metrics();
            queuedCount += metrics.queuedCount;
            queuedBytes += metrics.queuedBytes;
            pendingReplayCount += metrics.pendingReplayCount;
            pendingReplayBytes += metrics.pendingReplayBytes;
        }
        return {
            replayCount: this.replay.get(sessionId)?.length ?? 0,
            replayBytes: this.replayBytes.get(sessionId) ?? 0,
            subscriberCount: subscribers?.size ?? 0,
            queuedCount,
            queuedBytes,
            pendingReplayCount,
            pendingReplayBytes,
        };
    }

    /** Closes all subscriptions and releases every in-process event reference. */
    close(): void {
        if (this.closed) {
            return;
        }
        this.closed = true;
        for (const subscribers of this.subscribers.values()) {
            for (const subscriber of [...subscribers]) {
                subscriber.close("hub_closed", true);
            }
        }
        this.subscribers.clear();
        this.replay.clear();
        this.replayBytes.clear();
        this.seq.clear();
        clearDurablePublicationState(this);
    }

    private assertOpen(): void {
        if (this.closed) {
            throw new Error("event_hub_closed");
        }
    }
}

const utf8Encoder = new TextEncoder();

function detachEventDraft<TSessionId extends SessionId>(draft: EventDraft<TSessionId>): EventDraft<TSessionId> {
    return JSON.parse(JSON.stringify(draft)) as EventDraft<TSessionId>;
}

function storeEvent<TSessionId extends SessionId>(event: HarnessEvent<TSessionId>): StoredHarnessEvent<TSessionId> {
    const json = JSON.stringify(event);
    return {
        event: deepFreeze(JSON.parse(json) as HarnessEvent<TSessionId>),
        serializedBytes: utf8Encoder.encode(json).byteLength,
    };
}

function deepFreeze<T>(value: T): T {
    if (value === null || typeof value !== "object" || Object.isFrozen(value)) {
        return value;
    }
    for (const child of Object.values(value)) {
        deepFreeze(child);
    }
    return Object.freeze(value);
}
