import {randomUUID} from "node:crypto";
import type {ApprovalRequest, ApprovalResolution} from "./approval.js";
import type {CompactionSettings, ContextCompactor} from "./compaction.js";
import {
    composeContextMessages,
    mergeContextMessageSections,
    type ContextMessageSections,
    type ContextProvider,
} from "./context.js";
import type {FollowUpQueueState, QueuedInvocationInput} from "./coordination.js";
import {
    beginDurableSessionCreation,
    cancelDurableSessionCreation,
    captureDurablePublication,
    completeDurableSessionCreation,
    publishDurableCommit,
} from "./event-publication.js";
import {
    canRebaseFollowUp,
    projectFollowUps,
    queuedInputJson,
    truncateUtf8Bytes,
} from "./follow-up-ledger.js";
import type {AgentCaller, InvocationInputOptions, MessageIdentity} from "./caller.js";
import {
    InvocationCapabilityScope,
    type CapabilityOpenContext,
    type CapabilityProvider,
    type CapabilityToken,
} from "./capability.js";
import {
    SessionEventHub,
    type EventCursor,
    type EventSubscription,
} from "./events.js";
import type {JsonObject, JsonValue} from "./json.js";
import {
    assistantText,
    assistantToolCalls,
    isModelTurnError,
    type AgentMessage,
    type ModelRuntime,
    type ModelTurnResult,
    type TokenUsage,
} from "./model.js";
import {ProfileVersionConflictError, type ResolvedProfile, type ProfileRegistry} from "./profile-registry.js";
import type {RuntimeEffect, RuntimeHookContext} from "./profile.js";
import {parseSchemaValue, validateParsedSchemaValue} from "./schema.js";
import {
    addTokenUsage,
    assertNoPendingToolCalls,
    INVOCATION_PARTIAL_ENTRY_KIND,
    INVOCATION_USAGE_ENTRY_KIND,
    invocationPartial,
    invocationPartialEntryDraft,
    invocationUsage,
    invocationUsageEntryDraft,
    messageEntryPayload,
    messageFromEntry,
    pendingToolCalls,
    projectSessionTranscript,
    sessionMessages,
    type InvocationPartial,
} from "./session-transcript.js";
import {
    activeSessionPath,
    SessionConflictError,
    type InvocationError,
    type InvocationRecord,
    type InvocationTerminationReason,
    InvocationConflictError,
    InvocationNotRetryableError,
    InvocationOwnershipError,
    invocationProfileVersion,
    normalizeSessionSnapshot,
    reduceSessionWritePlan,
    SessionInvariantError,
    type SessionCreateInput,
    type SessionCommitNotification,
    type SessionId,
    type SessionSnapshot,
    type SessionStore,
    type SessionCommitObserver,
    type SessionEntryDraft,
    type SessionWritePlan,
    type SessionWriteOperation,
} from "./session.js";
import {modelToolSpec, type ToolDefinition, type ToolResult} from "./tool.js";

/** Session plus a replay-safe cursor captured no later than that durable projection. */
export interface HarnessSnapshot<TSessionId extends SessionId, THostContext extends JsonObject> {
    readonly session: SessionSnapshot<TSessionId, THostContext>;
    readonly cursor: Required<EventCursor>;
}

/** Request that starts one Invocation on an existing Session. */
export interface InvokeRequest<TSessionId extends SessionId> {
    readonly sessionId: TSessionId;
    /** Raw external value parsed by the current Profile before durable start. */
    readonly payload: JsonValue;
    readonly caller?: AgentCaller<TSessionId>;
    readonly messageIdentity?: MessageIdentity;
    /** Runtime-only parent cancellation; never persisted in the Invocation input. */
    readonly signal?: AbortSignal;
}

/** Snapshot position required by a Workflow-triggered Invocation. */
export interface InvocationAnchor {
    readonly version: number;
    readonly activeLeafId: string | null;
}

/** Starts an Invocation only if the Session is still at the observed Snapshot position. */
export interface InvokeAtRequest<TSessionId extends SessionId> extends InvokeRequest<TSessionId> {
    readonly anchor: InvocationAnchor;
}

/** Overrides applied when deriving a persistent Session fork. */
export interface ForkSessionOptions<TSessionId extends SessionId, THostContext extends JsonObject> {
    readonly profileKey?: string;
    readonly initial?: JsonValue;
    readonly hostContext?: THostContext;
    readonly title?: string;
}

/** Options for a bounded durable Invocation wait. */
export interface WaitForInvocationOptions {
    /** 正有限超时毫秒数；到期时抛 InvocationWaitTimeoutError。 */
    readonly timeoutMs: number;
    readonly signal?: AbortSignal;
    /** 轮询间隔，默认 25ms。 */
    readonly pollIntervalMs?: number;
}

/** Host-driven compaction of an idle Session. */
export interface CompactSessionOptions {
    /** 手动压缩的保留窗口（最近 N 个 token），必须为正整数。 */
    readonly keepRecentTokens: number;
    /** 可选摘要提示，原样传给 ContextCompactor.summarize。 */
    readonly instructions?: string;
    readonly signal?: AbortSignal;
}

/** Thrown when waitForInvocation reaches its deadline before a settled result. */
export class InvocationWaitTimeoutError extends Error {
    constructor(
        readonly invocationId: string,
        readonly timeoutMs: number,
        readonly lastStatus: string | undefined,
    ) {
        super(`Invocation ${invocationId} 等待超时（${timeoutMs}ms）${lastStatus !== undefined ? `，最后状态 ${lastStatus}` : ""}`);
        this.name = "InvocationWaitTimeoutError";
    }
}

/** Thrown when waitForFollowUpQueueDrain reaches its deadline. */
export class FollowUpDrainTimeoutError extends Error {
    constructor(
        readonly sessionId: SessionId,
        readonly timeoutMs: number,
        readonly lastItems: number,
        readonly lastActiveStatus: string | null,
    ) {
        super(`Session ${String(sessionId)} follow-up 队列排空等待超时（${timeoutMs}ms），剩余 ${lastItems} 项，active ${lastActiveStatus ?? "无"}`);
        this.name = "FollowUpDrainTimeoutError";
    }
}

/** Options for retry(); the legacy AgentCaller + messageIdentity overload remains supported. Top-level `kind` (AgentCaller) selects the legacy caller branch. */
export interface RetryOptions<TSessionId extends SessionId = number> extends InvocationInputOptions<TSessionId> {
    /** Runtime-only parent cancellation for the retried Invocation; never persisted. */
    readonly signal?: AbortSignal;
}

/** Bounded follow-up drain wait options (same shape as WaitForInvocationOptions). */
export type WaitForFollowUpQueueDrainOptions = WaitForInvocationOptions;

/** Public admission/usage failure with a stable error class; message text is the contract. */
export class HarnessAdmissionError extends Error {
    constructor(message: string) {
        super(message);
        this.name = "HarnessAdmissionError";
    }
}

/** Invocation outcome returned by a handle; persistence reports Store confirmation. */
export interface InvocationResult<TSessionId extends SessionId> {
    readonly sessionId: TSessionId;
    readonly invocationId: string;
    readonly status: "completed" | "waiting" | "failed" | "aborted";
    /** Whether this Invocation state and usage can be recovered from the current Store Snapshot. */
    readonly persistence: "confirmed" | "unknown";
    /** 仅 completed 时存在。 */
    readonly terminationReason?: InvocationTerminationReason;
    readonly output?: JsonValue;
    readonly error?: InvocationError;
    readonly usage: TokenUsage;
    readonly partial?: InvocationPartial;
    readonly pendingApprovals?: readonly ApprovalRequest[];
}

/** Handle returned immediately while the Invocation continues asynchronously. */
export interface InvocationHandle<TSessionId extends SessionId> {
    readonly sessionId: TSessionId;
    readonly invocationId: string;
    result(): Promise<InvocationResult<TSessionId>>;
    abort(): void;
}

/** Core-owned internal facts are never copied into a Session fork. */
function isCoreOwnedForkFact(kind: string): boolean {
    return kind === INVOCATION_USAGE_ENTRY_KIND
        || kind === INVOCATION_PARTIAL_ENTRY_KIND
        || kind === "agent.compaction"
        || kind.startsWith("harness.followUp.");
}

/**
 * 从 Store Snapshot 投影一个 Invocation 的 durable 终态或 waiting 状态，
 * 供宿主编排器在进程重启后重建结果视图（与 invocationUsage /
 * invocationPartial 同级，不读取 Store、不启动任何运行）。
 * running / interrupted / 不存在的 Invocation 返回 undefined。
 * Snapshot 含非法 usage/partial fact 时按 fail-closed 抛
 * SessionInvariantError（与 invocationUsage / invocationPartial 同合同）。
 */
export function invocationResultFromSnapshot<
    TSessionId extends SessionId,
    THostContext extends JsonObject,
>(
    snapshot: SessionSnapshot<TSessionId, THostContext>,
    invocationId: string,
): InvocationResult<TSessionId> | undefined {
    const invocation = snapshot.invocations.find((item) => item.id === invocationId);
    if (!invocation) {
        return undefined;
    }
    if (invocation.status === "running" || invocation.status === "interrupted") {
        return undefined;
    }
    if (invocation.status === "waiting") {
        return {
            sessionId: snapshot.metadata.sessionId,
            invocationId,
            status: "waiting",
            persistence: "confirmed",
            usage: invocationUsage(snapshot, invocationId),
            ...(invocation.pendingApprovals ? {pendingApprovals: invocation.pendingApprovals} : {}),
        };
    }
    const partial = invocationPartial(snapshot, invocationId);
    return {
        sessionId: snapshot.metadata.sessionId,
        invocationId,
        status: invocation.status,
        persistence: "confirmed",
        ...(invocation.terminationReason !== undefined ? {terminationReason: invocation.terminationReason} : {}),
        ...(invocation.output !== undefined ? {output: invocation.output} : {}),
        ...(invocation.status !== "aborted" && invocation.error !== undefined ? {error: invocation.error} : {}),
        usage: invocationUsage(snapshot, invocationId),
        ...(partial ? {partial} : {}),
    };
}

/** Construction dependencies for the standalone Harness. */
export interface NeuroAgentHarnessOptions<
    TSessionId extends SessionId,
    THostContext extends JsonObject,
    TModelConfig extends JsonValue,
> {
    readonly store: SessionStore<TSessionId, THostContext>;
    readonly profiles: ProfileRegistry<TSessionId, THostContext, TModelConfig>;
    readonly model: ModelRuntime<TModelConfig>;
    readonly capabilities?: readonly CapabilityProvider<string, object, TSessionId, THostContext>[];
    readonly events?: SessionEventHub<TSessionId>;
    readonly now?: () => number;
    readonly invocationId?: () => string;
    /** 取消后等待合作式外部依赖的宽限期；到期后强制完成 Invocation。 */
    readonly abortGraceMs?: number;
    readonly compactor?: ContextCompactor;
    readonly commitObservers?: readonly SessionCommitObserver<TSessionId, THostContext>[];
    readonly onObserverError?: (observerName: string, error: Error) => void | Promise<void>;
}

type ActiveInvocation<TSessionId extends SessionId> = {
    readonly sessionId: TSessionId;
    readonly invocationId: string;
    readonly controller: AbortController;
    readonly attempt: InvocationAttempt;
    readonly result: Promise<InvocationResult<TSessionId>>;
    readonly resolveCompletion: (result: InvocationResult<TSessionId>) => void;
    /** Exact Profile parser captured for this running attempt. */
    readonly parsePayload: (value: JsonValue) => JsonValue;
    readonly steers: QueuedInvocationInput<TSessionId>[];
    acceptingSteer: boolean;
    completionSettled: boolean;
    abortRequested: boolean;
    abortTimer: ReturnType<typeof setTimeout> | undefined;
    terminalEventPublished: boolean;
};

type CommitObserverOutcome =
    | {readonly kind: "completed"}
    | {readonly kind: "failed"; readonly error: unknown};

type ActiveCompletionOptions = {
    readonly allowUnconfirmedAbort?: boolean;
};

type InvocationAttempt = {
    readonly invocationId: string;
    invalidated: "abort" | "ownership-lost" | null;
    closed: boolean;
    writeFence: "open" | "sealed";
};

type InvocationCommitOptions = {
    readonly allowSealedInvocationTerminal?: boolean;
    readonly allowInvocationUsageFact?: boolean;
    readonly allowInvocationPartialFact?: boolean;
    readonly allowCompactionFact?: boolean;
    readonly allowAbortedSignal?: boolean;
    readonly allowFollowUpFact?: boolean;
};

type InvocationStartOptions<TSessionId extends SessionId, THostContext extends JsonObject> = {
    readonly postStartOperations?: readonly SessionWriteOperation<TSessionId, THostContext>[];
    readonly observedSnapshot?: SessionSnapshot<TSessionId, THostContext>;
    readonly expectedFollowUpId?: string;
    /** Parsed durable inputs are validated but never decoded again. */
    readonly payloadAdmission?: "raw" | "parsed";
};

type ApprovalResume<TSessionId extends SessionId, THostContext extends JsonObject> = {
    readonly prepareSnapshot: SessionSnapshot<TSessionId, THostContext>;
    readonly requests: readonly ApprovalRequest[];
    readonly resolutions: readonly ApprovalResolution[];
};
class FollowUpAdmissionError extends Error {
    constructor(readonly itemId: string, readonly cause: unknown) {
        super(cause instanceof Error ? cause.message : String(cause));
        this.name = "FollowUpAdmissionError";
    }
}

class FollowUpAdmissionRaceError extends FollowUpAdmissionError {
    constructor(itemId: string) {
        super(itemId, new Error(`follow-up ${itemId} 已不再是 queue head`));
        this.name = "FollowUpAdmissionRaceError";
    }
}

const MAX_FOLLOW_UP_REBASE_ATTEMPTS = 3;

/** Deep Facade that owns Invocation ordering, persistence and extension lifecycles. */
export class NeuroAgentHarness<
    TSessionId extends SessionId = number,
    THostContext extends JsonObject = JsonObject,
    TModelConfig extends JsonValue = JsonValue,
> {
    private readonly store: SessionStore<TSessionId, THostContext>;
    private readonly profiles: ProfileRegistry<TSessionId, THostContext, TModelConfig>;
    private readonly model: ModelRuntime<TModelConfig>;
    private readonly events: SessionEventHub<TSessionId>;
    private readonly ownsEvents: boolean;
    private readonly now: () => number;
    private readonly invocationId: () => string;
    private readonly abortGraceMs: number;
    private readonly compactor: ContextCompactor | undefined;
    private readonly commitObservers: readonly SessionCommitObserver<TSessionId, THostContext>[];
    private readonly onObserverError: ((observerName: string, error: Error) => void | Promise<void>) | undefined;
    private readonly providers = new Map<symbol, CapabilityProvider<string, object, TSessionId, THostContext>>();
    private readonly active = new Map<TSessionId, ActiveInvocation<TSessionId>>();
    private readonly invocationSessions = new Map<string, TSessionId>();
    private readonly invocationWriteFences = new Map<string, "open" | "sealed">();
    private readonly terminalEventInvocations = new Set<string>();
    private readonly shutdownAdmissions = new Set<Promise<unknown>>();
    private readonly background = new Set<Promise<void>>();
    private readonly shutdownStarted = new AbortController();
    private disposed = false;
    private disposePromise: Promise<void> | undefined;

    constructor(options: NeuroAgentHarnessOptions<TSessionId, THostContext, TModelConfig>) {
        this.store = options.store;
        this.profiles = options.profiles;
        this.model = options.model;
        this.ownsEvents = options.events === undefined;
        this.events = options.events ?? new SessionEventHub<TSessionId>();
        this.now = options.now ?? Date.now;
        this.invocationId = options.invocationId ?? randomUUID;
        this.abortGraceMs = options.abortGraceMs ?? 150;
        if (!Number.isFinite(this.abortGraceMs) || this.abortGraceMs < 0) {
            throw new Error("abortGraceMs 必须是非负有限数");
        }
        const contextWindow = options.model.contextWindow;
        if (contextWindow !== undefined && (!Number.isFinite(contextWindow) || contextWindow <= 0)) {
            throw new Error("Model contextWindow 必须是正有限数");
        }
        this.compactor = options.compactor;
        this.commitObservers = options.commitObservers ?? [];
        this.onObserverError = options.onObserverError;
        for (const provider of options.capabilities ?? []) {
            if (this.providers.has(provider.capability.identity)) {
                throw new Error(`Capability ${provider.capability.name} Provider 重复`);
            }
            this.providers.set(provider.capability.identity, provider);
        }
    }

    /** Creates a Session after Profile initial data validation. */
    async createSession(input: SessionCreateInput<TSessionId, THostContext>): Promise<HarnessSnapshot<TSessionId, THostContext>> {
        this.assertUsable();
        return this.trackShutdownAdmission(this.createSessionOnce(input));
    }

    private async createSessionOnce(
        input: SessionCreateInput<TSessionId, THostContext>,
        initialAdmission: "raw" | "parsed" = "raw",
    ): Promise<HarnessSnapshot<TSessionId, THostContext>> {
        const profile = this.profiles.resolve(input.profileKey);
        const initial = initialAdmission === "parsed"
            ? validateResolvedProfileInitial(profile, input.initial)
            : profile.parseInitial(input.initial);
        this.assertUsable();
        const creation = beginDurableSessionCreation(this.store, input.sessionId);
        let session;
        try {
            session = await this.store.create({...input, initial});
        } catch (error) {
            cancelDurableSessionCreation(creation);
            throw error;
        }
        completeDurableSessionCreation(creation, session.metadata.sessionId);
        return this.snapshotOnce(session.metadata.sessionId);
    }

    /** Starts an Invocation and returns a handle without waiting for model completion. */
    async invoke(request: InvokeRequest<TSessionId>): Promise<InvocationHandle<TSessionId>> {
        this.assertUsable();
        return this.start(request, undefined);
    }

    /** Starts an Invocation from an explicitly observed Snapshot position. */
    async invokeAt(request: InvokeAtRequest<TSessionId>): Promise<InvocationHandle<TSessionId>> {
        this.assertUsable();
        return this.start(request, undefined, request.anchor);
    }

    /** Queues input for the next safe turn of the currently running Invocation. */
    async steer(
        sessionId: TSessionId,
        payload: JsonValue,
        options: InvocationInputOptions<TSessionId> = {},
    ): Promise<QueuedInvocationInput<TSessionId>> {
        this.assertUsable();
        return this.trackShutdownAdmission(this.steerOnce(sessionId, payload, options));
    }

    private async steerOnce(
        sessionId: TSessionId,
        payload: JsonValue,
        options: InvocationInputOptions<TSessionId>,
    ): Promise<QueuedInvocationInput<TSessionId>> {
        const active = this.active.get(sessionId);
        if (!active?.acceptingSteer) throw new HarnessAdmissionError(`Session ${String(sessionId)} 当前不可 steer`);
        await this.store.read(sessionId);
        this.assertUsable();
        if (this.active.get(sessionId) !== active || !active.acceptingSteer) {
            throw new HarnessAdmissionError(`Session ${String(sessionId)} 当前不可 steer`);
        }
        const parsed = active.parsePayload(payload);
        this.assertUsable();
        if (this.active.get(sessionId) !== active || !active.acceptingSteer) {
            throw new HarnessAdmissionError(`Session ${String(sessionId)} 当前不可 steer`);
        }
        const item: QueuedInvocationInput<TSessionId> = {
            id: randomUUID(),
            kind: "steer",
            payload: parsed,
            caller: options.caller ?? {kind: "user"},
            messageIdentity: options.messageIdentity ?? "user",
            createdAt: this.now(),
        };
        active.steers.push(item);
        this.events.publish({sessionId, invocationId: active.invocationId, kind: "session", event: {type: "steer_queued", item}});
        return item;
    }

    /** Durably queues input to start a new Invocation after the current durable owner completes. */
    async followUp(
        sessionId: TSessionId,
        payload: JsonValue,
        options: InvocationInputOptions<TSessionId> = {},
    ): Promise<QueuedInvocationInput<TSessionId>> {
        this.assertUsable();
        return this.trackShutdownAdmission(this.followUpOnce(sessionId, payload, options));
    }

    private async followUpOnce(
        sessionId: TSessionId,
        payload: JsonValue,
        options: InvocationInputOptions<TSessionId>,
    ): Promise<QueuedInvocationInput<TSessionId>> {
        const snapshot = await this.store.read(sessionId);
        this.assertUsable();
        const activeInvocationId = snapshot.activeInvocationId;
        if (activeInvocationId === null) throw new HarnessAdmissionError(`Session ${String(sessionId)} 没有 active Invocation`);
        const parsed = this.profiles.resolve(snapshot.metadata.profileKey).parsePayload(payload);
        this.assertUsable();
        const item: QueuedInvocationInput<TSessionId> = {
            id: randomUUID(),
            kind: "followUp",
            payload: parsed,
            caller: options.caller ?? {kind: "user"},
            messageIdentity: options.messageIdentity ?? "user",
            createdAt: this.now(),
        };
        await this.commit({
            target: sessionId,
            expectedActiveInvocationId: activeInvocationId,
            cause: "harness.followUp.queue",
            operations: [{type: "appendEntries", entries: [{kind: "harness.followUp.queued", payload: queuedInputJson(item)}]}],
        }, undefined, {allowFollowUpFact: true});
        this.events.publish({sessionId, kind: "session", event: {type: "follow_up_queued", item}});
        return item;
    }

    /** Returns the durable follow-up queue projection. */
    async followUpState(sessionId: TSessionId): Promise<FollowUpQueueState<TSessionId>> {
        this.assertUsable();
        return this.followUpStateOnce(sessionId);
    }

    private async followUpStateOnce(sessionId: TSessionId): Promise<FollowUpQueueState<TSessionId>> {
        return projectFollowUps<TSessionId>((await this.store.read(sessionId)).entries);
    }

    /** Pauses automatic follow-up admission without deleting queued inputs. */
    async pauseFollowUps(sessionId: TSessionId): Promise<FollowUpQueueState<TSessionId>> {
        this.assertUsable();
        return this.trackShutdownAdmission(this.pauseFollowUpsOnce(sessionId));
    }

    private async pauseFollowUpsOnce(sessionId: TSessionId): Promise<FollowUpQueueState<TSessionId>> {
        await this.commit(
            {target: sessionId, cause: "harness.followUp.pause", operations: [{type: "appendEntries", entries: [{kind: "harness.followUp.paused", payload: {paused: true}}]}]},
            undefined,
            {allowFollowUpFact: true},
        );
        return this.publishFollowUpState(sessionId);
    }

    /** Cancels one queued follow-up by durable item ID. */
    async cancelFollowUp(sessionId: TSessionId, itemId: string): Promise<FollowUpQueueState<TSessionId>> {
        this.assertUsable();
        return this.trackShutdownAdmission(this.cancelFollowUpOnce(sessionId, itemId));
    }

    private async cancelFollowUpOnce(sessionId: TSessionId, itemId: string): Promise<FollowUpQueueState<TSessionId>> {
        const snapshot = await this.store.read(sessionId);
        this.assertUsable();
        const state = projectFollowUps<TSessionId>(snapshot.entries);
        if (!state.items.some((item) => item.id === itemId)) throw new HarnessAdmissionError(`follow-up ${itemId} 不存在`);
        await this.commit({
            target: sessionId,
            expectedVersion: snapshot.version,
            cause: "harness.followUp.cancel",
            operations: [{type: "appendEntries", entries: [{kind: "harness.followUp.cancelled", payload: {id: itemId}}]}],
        }, undefined, {allowFollowUpFact: true});
        return this.publishFollowUpState(sessionId);
    }

    /** Reorders all pending follow-ups; IDs must be an exact permutation. */
    async reorderFollowUps(sessionId: TSessionId, itemIds: readonly string[]): Promise<FollowUpQueueState<TSessionId>> {
        this.assertUsable();
        return this.trackShutdownAdmission(this.reorderFollowUpsOnce(sessionId, itemIds));
    }

    private async reorderFollowUpsOnce(sessionId: TSessionId, itemIds: readonly string[]): Promise<FollowUpQueueState<TSessionId>> {
        const snapshot = await this.store.read(sessionId);
        this.assertUsable();
        const state = projectFollowUps<TSessionId>(snapshot.entries);
        const current = state.items.map((item) => item.id);
        if (itemIds.length !== current.length || new Set(itemIds).size !== current.length || itemIds.some((id) => !current.includes(id))) {
            throw new HarnessAdmissionError("follow-up reorder IDs 必须与 pending queue 完全一致");
        }
        await this.commit({
            target: sessionId,
            expectedVersion: snapshot.version,
            cause: "harness.followUp.reorder",
            operations: [{type: "appendEntries", entries: [{kind: "harness.followUp.ordered", payload: {ids: [...itemIds]}}]}],
        }, undefined, {allowFollowUpFact: true});
        return this.publishFollowUpState(sessionId);
    }

    /** Restarts a durable follow-up queue after a failed run or process restart. */
    resumeFollowUps(sessionId: TSessionId): Promise<InvocationHandle<TSessionId> | null> {
        this.assertUsable();
        return this.trackShutdownAdmission(this.resumeFollowUpsOnce(sessionId));
    }

    private async resumeFollowUpsOnce(sessionId: TSessionId): Promise<InvocationHandle<TSessionId> | null> {
        const state = await this.followUpState(sessionId);
        if (this.disposed) return null;
        if (state.paused) {
            await this.commit(
                {target: sessionId, cause: "harness.followUp.resume", operations: [{type: "appendEntries", entries: [{kind: "harness.followUp.paused", payload: {paused: false}}]}]},
                undefined,
                {allowFollowUpFact: true},
            );
            await this.publishFollowUpState(sessionId);
        }
        return this.startNextFollowUp(sessionId);
    }

    /** Resumes one waiting Invocation after all durable approval requests are resolved. */
    resume(sessionId: TSessionId, invocationId: string, resolutions: readonly ApprovalResolution[]): Promise<InvocationHandle<TSessionId>> {
        this.assertUsable();
        return this.trackShutdownAdmission(this.resumeOnce(sessionId, invocationId, resolutions));
    }

    private async resumeOnce(
        sessionId: TSessionId,
        invocationId: string,
        resolutions: readonly ApprovalResolution[],
    ): Promise<InvocationHandle<TSessionId>> {
        if (this.active.has(sessionId)) {
            throw new InvocationConflictError(sessionId, this.active.get(sessionId)?.invocationId);
        }
        // 读侧 admission 由第一方 Store 在 read 内执行；这里对第三方 Adapter
        // 防御性归一化，确保空/重复 approval fact 在任何 Store 上都无法绕过
        // 审批门禁到达 Tool 执行。
        const snapshot = normalizeSessionSnapshot(await this.store.read(sessionId));
        const invocation = snapshot.invocations.find((item) => item.id === invocationId);
        if (!invocation || invocation.status !== "waiting") {
            throw new HarnessAdmissionError(`Invocation ${invocationId} 不是 waiting`);
        }
        const pendingApprovals = invocation.pendingApprovals ?? [];
        const pendingIds = new Set(pendingApprovals.map((request) => request.toolCallId));
        const resolutionIds = new Set(resolutions.map((resolution) => resolution.toolCallId));
        if (
            pendingIds.size !== pendingApprovals.length
            || resolutions.length !== pendingIds.size
            || resolutionIds.size !== resolutions.length
            || resolutions.some((resolution) => !pendingIds.has(resolution.toolCallId))
        ) {
            throw new HarnessAdmissionError(`Invocation ${invocationId} approval resolution 不完整或不匹配`);
        }
        const profile = this.profiles.resolve(invocation.profileKey);
        const expectedProfileVersion = invocationProfileVersion(invocation);
        if (profile.version !== expectedProfileVersion) {
            throw new ProfileVersionConflictError(profile.key, invocationId, expectedProfileVersion, profile.version);
        }
        validateResolvedProfileInitial(profile, snapshot.metadata.initial);
        validateResolvedProfilePayload(profile, invocation.input);
        if (this.active.has(sessionId)) {
            throw new InvocationConflictError(sessionId, this.active.get(sessionId)?.invocationId);
        }
        const controller = new AbortController();
        const attempt = this.createAttempt(sessionId, invocationId);
        const active = this.createActive(sessionId, invocationId, controller, attempt, profile);
        let admitted: SessionSnapshot<TSessionId, THostContext>;
        try {
            admitted = await this.commit({
                target: sessionId,
                expectedVersion: snapshot.version,
                expectedActiveInvocationId: invocationId,
                cause: "harness.invocation.resumeApproval.admit",
                operations: [{type: "resumeInvocation", invocationId}],
            }, invocationId);
        } catch (error) {
            this.releaseActiveReservation(active, error);
            this.forgetInvocationSession(invocationId);
            throw error;
        }
        const runResult = this.observeRunResult(this.run(
            profile,
            admitted,
            invocationId,
            invocation.input,
            invocation.caller,
            invocation.messageIdentity ?? "user",
            controller.signal,
            attempt,
            {
                prepareSnapshot: snapshot,
                requests: pendingApprovals,
                resolutions,
            },
        ), sessionId, invocationId);
        this.attachActiveRun(active, runResult);
        this.watchFollowUps(sessionId, active.result);
        return {sessionId, invocationId, result: () => active.result, abort: () => this.requestAbort(sessionId, invocationId)};
    }

    /** Returns durable recovery truth after capturing a replay-safe event cursor. */
    async snapshot(sessionId: TSessionId): Promise<HarnessSnapshot<TSessionId, THostContext>> {
        this.assertUsable();
        return this.snapshotOnce(sessionId);
    }

    private async snapshotOnce(sessionId: TSessionId): Promise<HarnessSnapshot<TSessionId, THostContext>> {
        const cursor = this.events.cursor(sessionId);
        return {session: await this.store.read(sessionId), cursor};
    }

    /** Executes a host or Workflow plan from a cursor that may replay overlapping durable events. */
    async write(plan: SessionWritePlan<TSessionId, THostContext>): Promise<HarnessSnapshot<TSessionId, THostContext>> {
        this.assertUsable();
        return this.trackShutdownAdmission(this.writeOnce(plan));
    }

    private async writeOnce(plan: SessionWritePlan<TSessionId, THostContext>): Promise<HarnessSnapshot<TSessionId, THostContext>> {
        const cursor = this.events.cursor(plan.target);
        const session = await this.commit(plan);
        return {session, cursor};
    }

    /** Appends host-authored entries without hand-assembling a SessionWritePlan; Core-owned kinds are still rejected by write admission. */
    async appendEntries(
        sessionId: TSessionId,
        drafts: readonly SessionEntryDraft[],
        options: {
            readonly cause?: string;
            readonly expectedVersion?: number;
            readonly expectedActiveInvocationId?: string | null;
        } = {},
    ): Promise<HarnessSnapshot<TSessionId, THostContext>> {
        this.assertUsable();
        if (drafts.length === 0) {
            throw new HarnessAdmissionError("appendEntries 至少需要一条 entry");
        }
        return this.trackShutdownAdmission(this.writeOnce({
            target: sessionId,
            cause: options.cause ?? "host.appendEntries",
            ...(options.expectedVersion !== undefined ? {expectedVersion: options.expectedVersion} : {}),
            ...(options.expectedActiveInvocationId !== undefined ? {expectedActiveInvocationId: options.expectedActiveInvocationId} : {}),
            operations: [{type: "appendEntries", entries: [...drafts]}],
        }));
    }

    /**
     * 从源 Session 的 active path 派生一个持久 fork：复制 transcript 条目
     * （agent.message 与宿主 kinds），丢弃 Core-owned 内部事实
     * （harness.* 与 agent.compaction），不复制 Invocation/approval/queue。
     * 新 Session 以 parentSessionId 记录源；不修改源。
     */
    async forkSession(
        sourceSessionId: TSessionId,
        options: ForkSessionOptions<TSessionId, THostContext> = {},
    ): Promise<HarnessSnapshot<TSessionId, THostContext>> {
        this.assertUsable();
        return this.trackShutdownAdmission(this.forkSessionOnce(sourceSessionId, options));
    }

    private async forkSessionOnce(
        sourceSessionId: TSessionId,
        options: ForkSessionOptions<TSessionId, THostContext>,
    ): Promise<HarnessSnapshot<TSessionId, THostContext>> {
        const source = await this.store.read(sourceSessionId);
        this.assertUsable();
        const drafts = activeSessionPath(source)
            .filter((entry) => !isCoreOwnedForkFact(entry.kind))
            .map((entry) => ({
                kind: entry.kind,
                payload: entry.payload,
            }));
        const usesSourceInitial = options.initial === undefined;
        const created = await this.createSessionOnce({
            profileKey: options.profileKey ?? source.metadata.profileKey,
            initial: options.initial !== undefined ? options.initial : source.metadata.initial,
            hostContext: options.hostContext !== undefined ? options.hostContext : source.metadata.hostContext,
            ...(options.title !== undefined ? {title: options.title} : {}),
            parentSessionId: sourceSessionId,
        }, usesSourceInitial ? "parsed" : "raw");
        if (drafts.length === 0) {
            return created;
        }
        return this.writeOnce({
            target: created.session.metadata.sessionId,
            cause: "harness.fork",
            operations: [{type: "appendEntries", entries: drafts}],
        });
    }

    /**
     * 有界等待一个 Invocation 的 durable 结果：以 invocationResultFromSnapshot
     * 为判据，terminal 或 waiting 都返回（waiting 由宿主决定是否 resume），
     * running/interrupted 视为未终态继续等待。纯读侧，不启动任何运行、不新增
     * Job/Lease/Heartbeat 语义；Session 缺失或 Store 错误立即传播，signal
     * 中止以 reason reject。超时上界约为 timeoutMs + 一轮 read + 一个轮询
     * 间隔（deadline 后已可见的终态会返回而非抛超时）。
     */
    async waitForInvocation(
        sessionId: TSessionId,
        invocationId: string,
        options: WaitForInvocationOptions,
    ): Promise<InvocationResult<TSessionId>> {
        this.assertUsable();
        const {timeoutMs, signal, pollIntervalMs = 25} = options;
        if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) {
            throw new Error("waitForInvocation timeoutMs 必须是正有限数");
        }
        if (!Number.isInteger(pollIntervalMs) || pollIntervalMs <= 0) {
            throw new Error("waitForInvocation pollIntervalMs 必须是正整数");
        }
        const deadline = Date.now() + timeoutMs;
        let lastStatus: string | undefined;
        while (true) {
            signal?.throwIfAborted();
            this.assertUsable();
            const snapshot = await this.store.read(sessionId);
            this.assertUsable();
            const result = invocationResultFromSnapshot(snapshot, invocationId);
            if (result) {
                return result;
            }
            lastStatus = snapshot.invocations.find((item) => item.id === invocationId)?.status;
            if (Date.now() >= deadline) {
                throw new InvocationWaitTimeoutError(invocationId, timeoutMs, lastStatus);
            }
            await new Promise<void>((resolve) => setTimeout(resolve, pollIntervalMs));
        }
    }

    /**
     * 有界等待 follow-up 队列排空：队列为空且无 active Invocation 时返回；
     * 队列已暂停（paused）或 active Invocation 处于 waiting（审批待决）视为
     * 稳定态直接返回，由宿主决定后续；其余（运行中链、空闲但有待处理队列）
     * 继续轮询（interrupted 视为未终态，与 waitForInvocation 一致）。
     * 纯读侧；超时抛 FollowUpDrainTimeoutError（上界约为 timeoutMs + 一轮
     * read + 一个轮询间隔），signal 中止以 reason reject。
     */
    async waitForFollowUpQueueDrain(
        sessionId: TSessionId,
        options: WaitForFollowUpQueueDrainOptions,
    ): Promise<FollowUpQueueState<TSessionId>> {
        this.assertUsable();
        const {timeoutMs, signal, pollIntervalMs = 25} = options;
        if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) {
            throw new Error("waitForFollowUpQueueDrain timeoutMs 必须是正有限数");
        }
        if (!Number.isInteger(pollIntervalMs) || pollIntervalMs <= 0) {
            throw new Error("waitForFollowUpQueueDrain pollIntervalMs 必须是正整数");
        }
        const deadline = Date.now() + timeoutMs;
        while (true) {
            signal?.throwIfAborted();
            this.assertUsable();
            const snapshot = await this.store.read(sessionId);
            this.assertUsable();
            const state = projectFollowUps<TSessionId>(snapshot.entries);
            const active = snapshot.invocations.find((item) => item.id === snapshot.activeInvocationId);
            if (snapshot.activeInvocationId === null && state.items.length === 0) {
                return state;
            }
            if (state.paused || active?.status === "waiting") {
                return state;
            }
            if (Date.now() >= deadline) {
                throw new FollowUpDrainTimeoutError(sessionId, timeoutMs, state.items.length, active?.status ?? null);
            }
            await new Promise<void>((resolve) => setTimeout(resolve, pollIntervalMs));
        }
    }

    /**
     * 宿主驱动的手动压缩：在 idle Session 上按 keepRecentTokens 窗口折叠
     * 历史并写入 `agent.compaction` entry（复用自动压缩的切分/摘要/落盘
     * 语义与 pending Tool Call 守卫）。有 active Invocation 时抛
     * `InvocationConflictError`；空窗口时返回 `{compacted: false}` 且不写
     * entry；摘要失败抛错且不落盘。不创建 Invocation、不发布
     * invocation-scoped runtime 事件。ADR-0037。
     */
    async compactSession(
        sessionId: TSessionId,
        options: CompactSessionOptions,
    ): Promise<{compacted: boolean}> {
        this.assertUsable();
        return this.trackShutdownAdmission(this.compactSessionOnce(sessionId, options));
    }

    private async compactSessionOnce(
        sessionId: TSessionId,
        options: CompactSessionOptions,
    ): Promise<{compacted: boolean}> {
        if (!Number.isInteger(options.keepRecentTokens) || options.keepRecentTokens <= 0) {
            throw new Error("compactSession keepRecentTokens 必须是正整数");
        }
        if (!this.compactor) {
            throw new HarnessAdmissionError("Harness 未配置 ContextCompactor，不能手动压缩");
        }
        if (options.signal) {
            this.throwIfAborted(options.signal);
        }
        const snapshot = await this.store.read(sessionId);
        this.assertUsable();
        if (options.signal) {
            this.throwIfAborted(options.signal);
        }
        if (snapshot.activeInvocationId !== null) {
            throw new InvocationConflictError(sessionId, snapshot.activeInvocationId);
        }
        const outcome = await this.compactTranscript(
            snapshot,
            options.keepRecentTokens,
            options.signal ?? new AbortController().signal,
            {
                ...(options.instructions !== undefined ? {instructions: options.instructions} : {}),
            },
        );
        return {compacted: outcome.compacted};
    }

    /** Requests cancellation of the currently active Invocation on a Session. */
    async abort(sessionId: TSessionId): Promise<void> {
        this.assertUsable();
        return this.trackShutdownAdmission(this.abortOnce(sessionId));
    }

    private async abortOnce(sessionId: TSessionId): Promise<void> {
        const active = this.active.get(sessionId);
        if (active) {
            this.requestAbort(sessionId, active.invocationId);
            await active.result;
            return;
        }
        const snapshot = await this.store.read(sessionId);
        this.assertUsable();
        const invocation = snapshot.invocations.find((item) => item.id === snapshot.activeInvocationId);
        if (invocation?.status === "running" || invocation?.status === "waiting") {
            let current = snapshot;
            let finished = false;
            let lastError: unknown;
            for (let retry = 0; retry < 3; retry += 1) {
                const latestInvocation = current.invocations.find((item) => item.id === invocation.id);
                if (
                    !latestInvocation
                    || (latestInvocation.status !== "running" && latestInvocation.status !== "waiting")
                    || current.activeInvocationId !== invocation.id
                ) {
                    finished = true;
                    break;
                }
                try {
                    current = await this.finishInvocationOwnerCas(sessionId, invocation.id, "aborted", latestInvocation.turnCount, invocationUsage(current, invocation.id), undefined, {
                        name: "AbortError",
                        message: `${latestInvocation.status} Invocation 已由 durable owner CAS 取消`,
                        phase: latestInvocation.status === "waiting" ? "approval" : "abort",
                    }, "harness.invocation.abort");
                    finished = true;
                    lastError = undefined;
                    break;
                } catch (error) {
                    if (!(error instanceof SessionConflictError) && !(error instanceof InvocationOwnershipError)) {
                        throw error;
                    }
                    lastError = error;
                    current = await this.store.read(sessionId);
                    this.assertUsable();
                }
            }
            if (!finished && this.ownsActiveInvocation(current, invocation.id)) {
                throw new AbortBoundaryError(invocation.id, lastError ?? new Error("durable Invocation 取消状态无法确认"));
            }
            const durableResult = this.resultFromSnapshot(current, invocation.id);
            if (durableResult?.status === "aborted") {
                this.publishTerminalEvent(sessionId, invocation.id, "aborted", durableResult.usage);
            }
        }
    }

    /** Creates a new Invocation from a terminal Invocation's durable Parsed Value. */
    async retry(
        sessionId: TSessionId,
        invocationId: string,
        callerOrOptions: AgentCaller<TSessionId> | RetryOptions<TSessionId> = {kind: "user"},
        messageIdentity?: MessageIdentity,
    ): Promise<InvocationHandle<TSessionId>> {
        this.assertUsable();
        const snapshot = await this.store.read(sessionId);
        const previous = snapshot.invocations.find((item) => item.id === invocationId);
        if (!previous) {
            throw new HarnessAdmissionError(`Invocation ${invocationId} 不存在`);
        }
        if (previous.status === "running" || previous.status === "waiting") {
            throw new InvocationNotRetryableError(invocationId, previous.status);
        }
        const options = "kind" in callerOrOptions
            ? {caller: callerOrOptions, ...(messageIdentity !== undefined ? {messageIdentity} : {})}
            : {
                ...callerOrOptions,
                ...(messageIdentity !== undefined ? {messageIdentity} : {}),
            };
        return this.start({
            sessionId,
            payload: previous.input,
            ...(options.caller !== undefined ? {caller: options.caller} : {}),
            ...(options.messageIdentity !== undefined ? {messageIdentity: options.messageIdentity} : {}),
            ...(!("kind" in callerOrOptions) && callerOrOptions.signal !== undefined ? {signal: callerOrOptions.signal} : {}),
        }, invocationId, undefined, {payloadAdmission: "parsed"});
    }

    /** Subscribes to replayable Session events; transports remain host Adapters. */
    subscribe(sessionId: TSessionId, cursor: EventCursor = {}): EventSubscription<TSessionId> {
        this.assertUsable();
        return this.events.subscribe(sessionId, cursor);
    }

    /** Aborts active work and releases the Store Adapter; repeated calls share one completion barrier. */
    dispose(): Promise<void> {
        if (this.disposePromise) {
            return this.disposePromise;
        }
        let resolveDispose!: () => void;
        let rejectDispose!: (error: unknown) => void;
        this.disposePromise = new Promise<void>((resolve, reject) => {
            resolveDispose = resolve;
            rejectDispose = reject;
        });
        this.shutdownStarted.abort();
        void this.disposeOnce().then(resolveDispose, rejectDispose);
        return this.disposePromise;
    }

    private async disposeOnce(): Promise<void> {
        this.disposed = true;
        while (true) {
            const active = [...this.active.values()];
            for (const invocation of active) {
                this.requestAbort(invocation.sessionId, invocation.invocationId);
            }
            await Promise.allSettled([
                ...active.map((invocation) => invocation.result),
                ...this.shutdownAdmissions,
            ]);
            if (this.active.size > 0 || this.shutdownAdmissions.size > 0) {
                continue;
            }
            const background = [...this.background];
            if (background.length === 0) {
                break;
            }
            await Promise.allSettled(background);
        }
        if (this.ownsEvents) {
            this.events.close();
        }
        await this.store.dispose?.();
    }

    private start(
        request: InvokeRequest<TSessionId>,
        retryOf: string | undefined,
        anchor?: InvocationAnchor,
        options: InvocationStartOptions<TSessionId, THostContext> = {},
    ): Promise<InvocationHandle<TSessionId>> {
        this.assertUsable();
        return this.trackShutdownAdmission(this.startOnce(request, retryOf, anchor, options));
    }

    private async startOnce(
        request: InvokeRequest<TSessionId>,
        retryOf: string | undefined,
        anchor: InvocationAnchor | undefined,
        options: InvocationStartOptions<TSessionId, THostContext>,
    ): Promise<InvocationHandle<TSessionId>> {
        if (request.signal) {
            this.throwIfAborted(request.signal);
        }
        if (!anchor && this.active.has(request.sessionId)) {
            throw new InvocationConflictError(request.sessionId, this.active.get(request.sessionId)?.invocationId);
        }
        const snapshot = options.observedSnapshot ?? await this.store.read(request.sessionId);
        if (request.signal) {
            this.throwIfAborted(request.signal);
        }
        if (anchor && (snapshot.version !== anchor.version || snapshot.activeLeafId !== anchor.activeLeafId)) {
            throw new SessionConflictError(request.sessionId, anchor.version, snapshot.version, {
                expectedActiveLeafId: anchor.activeLeafId,
                actualActiveLeafId: snapshot.activeLeafId,
            });
        }
        if (options.expectedFollowUpId !== undefined) {
            const queue = projectFollowUps<TSessionId>(snapshot.entries);
            if (queue.items[0]?.id !== options.expectedFollowUpId) {
                throw new FollowUpAdmissionRaceError(options.expectedFollowUpId);
            }
        }
        // 全新 Invocation（invoke/invokeAt/retry/follow-up 启动）不得从
        // 悬挂 Tool Call 的 transcript 开始：assistant 消息在 Tool 执行前
        // 提交，forced abort / Store 失败会留下「有 call 无 result」的
        // durable 状态，直接喂给 provider 会造成重复副作用或模型报错。
        // 仅检查 idle Session（activeInvocationId 为 null）；waiting 的
        // 待批 approval call 由 resume 路径处理，不经由此处。
        if (snapshot.activeInvocationId === null) {
            const pending = pendingToolCalls(sessionMessages(snapshot))[0];
            if (pending) {
                throw new HarnessAdmissionError(
                    `Session ${String(request.sessionId)} 存在未完成 Tool Call，不能启动新 Invocation：${pending.name}`,
                );
            }
        }
        const profile = this.profiles.resolve(snapshot.metadata.profileKey);
        validateResolvedProfileInitial(profile, snapshot.metadata.initial);
        const payload = options.payloadAdmission === "parsed"
            ? validateResolvedProfilePayload(profile, request.payload)
            : profile.parsePayload(request.payload);
        const id = this.invocationId();
        const caller = request.caller ?? {kind: "user"};
        const messageIdentity = request.messageIdentity ?? "user";
        this.rememberInvocationSession(id, request.sessionId);
        let started: SessionSnapshot<TSessionId, THostContext>;
        try {
            started = await this.commit({
                target: request.sessionId,
                expectedVersion: anchor?.version ?? snapshot.version,
                ...(anchor ? {expectedActiveLeafId: anchor.activeLeafId} : {}),
                expectedActiveInvocationId: null,
                cause: "harness.invocation.start",
                operations: [{
                    type: "startInvocation",
                    invocation: {
                        id,
                        sessionId: request.sessionId,
                        profileKey: profile.key,
                        profileVersion: profile.version,
                        caller,
                        messageIdentity,
                        input: payload,
                        ...(retryOf ? {retryOf} : {}),
                        createdAt: this.now(),
                    },
                }, ...(options.postStartOperations ?? [])],
            }, id, {allowFollowUpFact: options.expectedFollowUpId !== undefined});
        } catch (error) {
            this.forgetInvocationSession(id);
            throw error;
        }
        const controller = new AbortController();
        if (request.signal?.aborted) {
            controller.abort();
        }
        const attempt = this.createAttempt(request.sessionId, id);
        const active = this.createActive(request.sessionId, id, controller, attempt, profile);
        const runResult = this.observeRunResult(this.run(
            profile,
            started,
            id,
            payload,
            caller,
            messageIdentity,
            controller.signal,
            attempt,
        ), request.sessionId, id);
        this.attachActiveRun(active, runResult);
        this.linkInvocationSignal(request.signal, active);
        this.watchFollowUps(request.sessionId, active.result);
        return {
            sessionId: request.sessionId,
            invocationId: id,
            result: () => active.result,
            abort: () => this.requestAbort(request.sessionId, id),
        };
    }

    private trackShutdownAdmission<TResult>(admission: Promise<TResult>): Promise<TResult> {
        // An async operation can reenter dispose before its wrapper reaches this line.
        // disposeOnce rechecks the live Set after every awaited snapshot before closing resources.
        this.shutdownAdmissions.add(admission);
        void admission.then(
            () => {
                this.shutdownAdmissions.delete(admission);
            },
            () => {
                this.shutdownAdmissions.delete(admission);
            },
        );
        return admission;
    }

    private observeRunResult(
        runResult: Promise<InvocationResult<TSessionId>>,
        sessionId: TSessionId,
        invocationId: string,
    ): Promise<InvocationResult<TSessionId>> {
        return runResult.then(async (result) => {
            if (result.persistence === "confirmed") {
                return result;
            }
            return await this.confirmedResult(sessionId, invocationId) ?? result;
        }, async (error) => {
            return await this.confirmedResult(sessionId, invocationId) ?? {
                sessionId,
                invocationId,
                status: "failed" as const,
                persistence: "unknown" as const,
                error: toInvocationError(error, "run"),
                usage: {input: 0, output: 0, total: 0},
            };
        });
    }
    private createActive(
        sessionId: TSessionId,
        invocationId: string,
        controller: AbortController,
        attempt: InvocationAttempt,
        profile: ResolvedProfile<TSessionId, THostContext, TModelConfig>,
    ): ActiveInvocation<TSessionId> {
        let resolveCompletion!: (result: InvocationResult<TSessionId>) => void;
        const completion = new Promise<InvocationResult<TSessionId>>((resolve) => {
            resolveCompletion = resolve;
        });
        const result = completion.finally(() => {
            const current = this.active.get(sessionId);
            if (current?.attempt === attempt) {
                this.active.delete(sessionId);
            }
        });
        const active: ActiveInvocation<TSessionId> = {
            sessionId,
            invocationId,
            controller,
            attempt,
            result,
            resolveCompletion,
            parsePayload: (value) => profile.parsePayload(value),
            steers: [],
            acceptingSteer: true,
            completionSettled: false,
            abortRequested: false,
            abortTimer: undefined,
            terminalEventPublished: false,
        };
        this.active.set(sessionId, active);
        return active;
    }

    private attachActiveRun(
        active: ActiveInvocation<TSessionId>,
        runResult: Promise<InvocationResult<TSessionId>>,
    ): void {
        void runResult.then((outcome) => {
            this.completeActive(active.sessionId, active.invocationId, outcome);
        });
    }

    private releaseActiveReservation(active: ActiveInvocation<TSessionId>, error: unknown): void {
        active.attempt.invalidated = "ownership-lost";
        active.completionSettled = true;
        active.resolveCompletion({
            sessionId: active.sessionId,
            invocationId: active.invocationId,
            status: "failed",
            persistence: "unknown",
            error: toInvocationError(error, "run"),
            usage: {input: 0, output: 0, total: 0},
        });
        const current = this.active.get(active.sessionId);
        if (current?.attempt === active.attempt) {
            this.active.delete(active.sessionId);
        }
    }

    private linkInvocationSignal(
        signal: AbortSignal | undefined,
        active: ActiveInvocation<TSessionId>,
    ): void {
        if (!signal) return;
        const onAbort = () => {
            this.requestAbort(active.sessionId, active.invocationId);
        };
        signal.addEventListener("abort", onAbort, {once: true});
        if (signal.aborted) {
            onAbort();
        }
        void active.result.then(() => {
            signal.removeEventListener("abort", onAbort);
        });
    }

    private completeActive(
        sessionId: TSessionId,
        invocationId: string,
        result: InvocationResult<TSessionId>,
        options: ActiveCompletionOptions = {},
    ): void {
        const active = this.active.get(sessionId);
        if (!active || active.invocationId !== invocationId || active.completionSettled) {
            return;
        }
        if (active.abortRequested
            && (result.persistence !== "confirmed" || result.status === "waiting")
            && !options.allowUnconfirmedAbort) {
            return;
        }
        active.completionSettled = true;
        if (active.abortTimer !== undefined) {
            clearTimeout(active.abortTimer);
            active.abortTimer = undefined;
        }
        active.resolveCompletion(result);
    }

    private requestAbort(sessionId: TSessionId, invocationId: string): void {
        const active = this.active.get(sessionId);
        if (!active || active.invocationId !== invocationId || active.completionSettled || active.abortRequested) {
            return;
        }
        active.abortRequested = true;
        this.invalidateAttempt(active.attempt, "abort");
        const abortRequest = this.persistAbortRequest(sessionId, invocationId).catch((error: unknown) => {
            if (error instanceof SessionConflictError
                || error instanceof InvocationOwnershipError
                || error instanceof InvocationWriteFenceError) {
                return;
            }
            this.events.publish({
                sessionId,
                invocationId,
                kind: "host",
                event: {
                    type: "host",
                    name: "abort_request_error",
                    payload: error instanceof Error ? error.message : String(error),
                },
            });
        });
        this.background.add(abortRequest);
        void abortRequest.then(
            () => this.background.delete(abortRequest),
            () => this.background.delete(abortRequest),
        );
        active.controller.abort();
        if (this.abortGraceMs === 0) {
            void this.forceAbort(sessionId, invocationId);
            return;
        }
        active.abortTimer = setTimeout(() => {
            active.abortTimer = undefined;
            void this.forceAbort(sessionId, invocationId);
        }, this.abortGraceMs);
    }

    private async persistAbortRequest(sessionId: TSessionId, invocationId: string): Promise<void> {
        await this.commit({
            target: sessionId,
            expectedActiveInvocationId: invocationId,
            cause: "harness.invocation.abort.request",
            operations: [{type: "setStatus", status: "aborting"}],
        });
    }

    private async finishInvocationOwnerCas(
        sessionId: TSessionId,
        invocationId: string,
        status: "completed" | "failed" | "aborted",
        turnCount: number,
        usage: TokenUsage,
        output: JsonValue | undefined,
        error: InvocationError | undefined,
        cause: string,
        options?: InvocationCommitOptions,
    ): Promise<SessionSnapshot<TSessionId, THostContext>> {
        return this.commit({
            target: sessionId,
            expectedActiveInvocationId: invocationId,
            cause,
            operations: terminalInvocationOperations({
                invocationId,
                status,
                turnCount,
                usage,
                ...(output !== undefined ? {output} : {}),
                ...(error ? {error} : {}),
            }),
        }, invocationId, {
            ...options,
            allowInvocationUsageFact: true,
            ...(status === "aborted" ? {allowAbortedSignal: true} : {}),
        });
    }

    private async forceAbort(sessionId: TSessionId, invocationId: string): Promise<void> {
        const active = this.active.get(sessionId);
        if (!active || active.invocationId !== invocationId || active.completionSettled) {
            return;
        }
        try {
            this.sealInvocationWriteFence(invocationId);
            active.attempt.closed = true;
            let current = await this.store.read(sessionId);
            const invocation = current.invocations.find((item) => item.id === invocationId);
            if (invocation?.status === "running" || invocation?.status === "waiting") {
                let lastError: unknown;
                for (let retry = 0; retry < 3; retry += 1) {
                    const latestInvocation = current.invocations.find((item) => item.id === invocationId);
                    if (!latestInvocation || (latestInvocation.status !== "running" && latestInvocation.status !== "waiting")) {
                        break;
                    }
                    try {
                        current = await this.finishInvocationOwnerCas(sessionId, invocationId, "aborted", latestInvocation.turnCount, invocationUsage(current, invocationId), undefined, {
                            name: "AbortError",
                            message: "Invocation 超过取消宽限期后被强制终止",
                            phase: "abort",
                        }, "harness.invocation.forceAbort", {
                            allowSealedInvocationTerminal: true,
                        });
                        lastError = undefined;
                        break;
                    } catch (error) {
                        if (!(error instanceof SessionConflictError) && !(error instanceof InvocationOwnershipError)) {
                            throw error;
                        }
                        lastError = error;
                        current = await this.store.read(sessionId);
                        if (!this.ownsActiveInvocation(current, invocationId)) {
                            break;
                        }
                    }
                }
                if (lastError !== undefined && this.ownsActiveInvocation(current, invocationId)) {
                    throw new AbortBoundaryError(invocationId, lastError);
                }
            }
            const durableResult = this.resultFromSnapshot(current, invocationId);
            if (durableResult) {
                this.publishTerminalEvent(sessionId, invocationId, durableResult.status, durableResult.usage, undefined, true);
                this.completeActive(sessionId, invocationId, durableResult, {allowUnconfirmedAbort: true});
                return;
            }
            this.completeActive(sessionId, invocationId, {
                sessionId,
                invocationId,
                status: "failed",
                persistence: "unknown",
                error: {
                    name: "AbortBoundaryError",
                    message: "取消宽限期结束时无法读取 Invocation 的 terminal 状态",
                    phase: "abort",
                },
                usage: {input: 0, output: 0, total: 0},
            }, {allowUnconfirmedAbort: true});
        } catch (error) {
            const result: InvocationResult<TSessionId> = {
                sessionId,
                invocationId,
                status: "failed",
                persistence: "unknown",
                error: toInvocationError(error, "abort"),
                usage: {input: 0, output: 0, total: 0},
            };
            this.completeActive(sessionId, invocationId, result, {allowUnconfirmedAbort: true});
        }
    }

    private resultFromSnapshot(
        snapshot: SessionSnapshot<TSessionId, THostContext>,
        invocationId: string,
    ): (InvocationResult<TSessionId> & {status: "completed" | "failed" | "aborted"}) | undefined {
        const result = invocationResultFromSnapshot(snapshot, invocationId);
        return result && result.status !== "waiting"
            ? result as InvocationResult<TSessionId> & {status: "completed" | "failed" | "aborted"}
            : undefined;
    }

    private async confirmedResult(
        sessionId: TSessionId,
        invocationId: string,
    ): Promise<InvocationResult<TSessionId> | undefined> {
        try {
            const snapshot = await this.store.read(sessionId);
            return invocationResultFromSnapshot(snapshot, invocationId);
        } catch {
            return undefined;
        }
    }

    private ownsActiveInvocation(
        snapshot: SessionSnapshot<TSessionId, THostContext>,
        invocationId: string,
    ): boolean {
        const invocation = snapshot.invocations.find((item) => item.id === invocationId);
        return snapshot.activeInvocationId === invocationId
            && (invocation?.status === "running" || invocation?.status === "waiting");
    }

    private async run(
        profile: ResolvedProfile<TSessionId, THostContext, TModelConfig>,
        initialSnapshot: SessionSnapshot<TSessionId, THostContext>,
        invocationId: string,
        payload: JsonValue,
        caller: AgentCaller<TSessionId>,
        messageIdentity: MessageIdentity,
        signal: AbortSignal,
        attempt: InvocationAttempt,
        approvalResume?: ApprovalResume<TSessionId, THostContext>,
    ): Promise<InvocationResult<TSessionId>> {
        const sessionId = initialSnapshot.metadata.sessionId;
        const capabilities = new InvocationCapabilityScope();
        let snapshot = initialSnapshot;
        const invocation = initialSnapshot.invocations.find((item) => item.id === invocationId);
        let turn = approvalResume ? invocation?.turnCount ?? 0 : 0;
        let output: JsonValue | undefined;
        let usage: TokenUsage = approvalResume
            ? invocationUsage(initialSnapshot, invocationId)
            : {input: 0, output: 0, total: 0};
        let partial: InvocationPartial | undefined;
        let durableTerminal = false;
        let openTurn: number | undefined;
        try {
            this.throwIfAborted(signal);
            const prepareSnapshot = approvalResume?.prepareSnapshot ?? snapshot;
            await this.openCapabilities(profile.requiredCapabilities, prepareSnapshot, invocationId, caller, signal, attempt, capabilities);
            this.publishRuntime(sessionId, invocationId, {type: "agent_start", profileKey: profile.key}, attempt);
            const prepared = await profile.prepare({
                sessionId,
                invocationId,
                caller,
                initial: prepareSnapshot.metadata.initial,
                payload,
                hostContext: prepareSnapshot.metadata.hostContext,
                snapshot: prepareSnapshot,
                capabilities,
                signal,
            });
            this.assertAttemptActive(attempt);
            const tools = prepared.tools ?? [];
            assertPreparedToolIdentities(tools);
            const messages: AgentMessage[] = sessionMessages(snapshot);
            const runtimeMessages: AgentMessage[] = [...(prepared.messages ?? [])];
            let baseContext: ContextMessageSections = prepared.context ?? {};
            if (approvalResume) {
                const resumed = await this.resolveApprovals(
                    snapshot,
                    invocationId,
                    turn,
                    caller,
                    capabilities,
                    signal,
                    attempt,
                    tools,
                    approvalResume.requests,
                    approvalResume.resolutions,
                    messages,
                );
                snapshot = resumed;
            } else {
                if (prepared.prepareWrites && prepared.prepareWrites.length > 0) {
                    snapshot = await this.commitWritePlans(prepared.prepareWrites, snapshot, invocationId);
                }
                this.assertAttemptActive(attempt);
                // ADR-0039：prepareWrites 中的 agent.message 贡献在成功落盘后注入
                // 当前 Invocation 的 work-copy（先于随后提交的当前用户消息，与
                // durable transcript 顺序一致）；Tool/hook writePlans 不注入。
                messages.push(...prepareContributionMessages(prepared.prepareWrites ?? []));
                const userMessage: AgentMessage = {
                    role: "user",
                    content: prepared.userMessage ?? (typeof payload === "string" ? payload : JSON.stringify(payload)),
                    timestamp: this.now(),
                };
                messages.push(userMessage);
                const prepareEffect = await this.runHooks(profile, "prepareRun", snapshot, invocationId, caller, capabilities, signal, attempt, {messages: [...runtimeMessages, ...messages]});
                baseContext = mergeContextMessageSections(baseContext, prepareEffect.context);
                snapshot = await this.applyEffect(prepareEffect, snapshot, invocationId, runtimeMessages, attempt);
                snapshot = await withRunStage("ingest", () => this.commitMessages(snapshot, invocationId, 0, [userMessage], attempt, [messageIdentity]));
            }
            let nextTurnContext = baseContext;
            const maxTurns = prepared.limits?.maxTurns ?? 20;
            const maxToolErrors = prepared.limits?.maxConsecutiveToolErrorTurns ?? 3;
            let consecutiveToolErrors = 0;
            let terminated = false;
            let terminationReason: InvocationTerminationReason | undefined;

            while (turn < maxTurns && !terminated) {
                this.throwIfAborted(signal);
                snapshot = await this.drainSteers(snapshot, invocationId, turn, messages, attempt);
                turn += 1;
                this.publishRuntime(sessionId, invocationId, {type: "turn_start", turn}, attempt);
                openTurn = turn;
                snapshot = await withRunStage("compaction", () => this.compactIfNeeded(snapshot, invocationId, messages, prepared.compaction, signal, attempt));
                const beforeTurn = await this.runHooks(profile, "beforeTurn", snapshot, invocationId, caller, capabilities, signal, attempt, {turn, messages: [...runtimeMessages, ...messages]});
                snapshot = await this.applyEffect({
                    ...(beforeTurn.writePlans ? {writePlans: beforeTurn.writePlans} : {}),
                }, snapshot, invocationId, messages, attempt);
                const providerContext = await this.resolveContextProviders(prepared.contextProviders ?? [], snapshot, invocationId, caller, capabilities, signal, attempt, turn);
                const turnContext = mergeContextMessageSections(nextTurnContext, beforeTurn.context, providerContext);
                const requestMessages = [
                    ...runtimeMessages,
                    ...composeContextMessages(messages, turnContext),
                    ...(beforeTurn.runtimeMessages ?? []),
                ];
                const contextWindow = this.model.contextWindow;
                const compactor = this.compactor;
                if (contextWindow !== undefined && compactor) {
                    const estimated = requestMessages.reduce((total, message) => total + compactor.estimate(message), 0);
                    if (estimated > contextWindow) {
                        throw new Error(`当前 profile ${profile.key} 的上下文 ${estimated} tokens 已超过模型窗口 ${contextWindow} token 限制。`);
                    }
                }
                let result: ModelTurnResult;
                result = await withRunStage("model", async () => {
                    try {
                        return await this.model.runTurn({
                            profileKey: profile.key,
                            turn,
                            systemPrompt: prepared.systemPrompt,
                            messages: requestMessages,
                            tools: tools.map((tool) => modelToolSpec(tool)),
                            modelConfig: prepared.modelConfig,
                            signal,
                            onEvent: (event) => {
                                this.publishRuntime(sessionId, invocationId, {type: "model_event", turn, event}, attempt);
                            },
                        });
                    } catch (error) {
                        if (isModelTurnError(error) && error.usage !== undefined) {
                            // Abort request can invalidate the attempt before a cooperative Provider reports its final usage.
                            // The durable owner/sealed-terminal checks below still decide whether that observation can commit.
                            usage = addTokenUsage(usage, error.usage);
                        }
                        if (isModelTurnError(error) && error.partial !== undefined) {
                            partial = {turn, content: error.partial.content};
                        }
                        throw error;
                    }
                });
                this.assertAttemptActive(attempt);
                usage = addTokenUsage(usage, result.message.usage);
                assertMessageToolCallIdentities(messages, result.message);
                messages.push(result.message);
                snapshot = await withRunStage("ingest", () => this.commitMessages(snapshot, invocationId, turn, [result.message], attempt));
                const calls = assistantToolCalls(result.message);
                if (calls.length === 0) {
                    this.publishRuntime(sessionId, invocationId, {type: "turn_end", turn, status: "completed"}, attempt);
                    openTurn = undefined;
                    const active = this.active.get(sessionId);
                    if (active?.steers.length) continue;
                    if (active) active.acceptingSteer = false;
                    output = assistantText(result.message);
                    terminationReason = "natural_stop";
                    break;
                }

                const pendingApprovals = await this.collectApprovals(calls, tools, snapshot, invocationId, turn, caller, capabilities, signal, attempt);
                if (pendingApprovals.length > 0) {
                    const active = this.active.get(sessionId);
                    if (active) active.acceptingSteer = false;
                    snapshot = await this.commit({
                        target: sessionId,
                        expectedVersion: snapshot.version,
                        cause: "harness.invocation.waitApproval",
                        operations: [{type: "waitInvocation", invocationId, turnCount: turn, pendingApprovals}],
                    }, invocationId);
                    this.assertAttemptActive(attempt);
                    this.publishRuntime(sessionId, invocationId, {type: "approval_required", requests: pendingApprovals}, attempt);
                    // 进入 approval waiting 的 turn 是「工具待批」而非完成，
                    // 以 turn_end(waiting) 闭合（对齐 NeuroBook）；resume 后
                    // 从下一 turn 继续。
                    this.publishRuntime(sessionId, invocationId, {type: "turn_end", turn, status: "waiting"}, attempt);
                    openTurn = undefined;
                    this.publishRuntime(sessionId, invocationId, {type: "agent_end", status: "waiting", usage}, attempt);
                    return {sessionId, invocationId, status: "waiting", persistence: "confirmed", usage, pendingApprovals};
                }

                let turnHadError = false;
                const parallel = prepared.toolExecution === "parallel" && calls.every((call) => {
                    return tools.find((candidate) => candidate.name === call.name)?.executionMode !== "sequential";
                });
                if (parallel) {
                    const settledExecutions = await Promise.allSettled(calls.map(async (call) => {
                        this.throwIfAborted(signal);
                        const tool = tools.find((candidate) => candidate.name === call.name);
                        this.publishRuntime(sessionId, invocationId, {
                            type: "tool_execution_start",
                            turn,
                            toolCallId: call.id,
                            toolName: call.name,
                            arguments: call.arguments,
                        }, attempt);
                        const toolResult = tool
                            ? await this.executeTool(tool, call.arguments, call, snapshot, invocationId, turn, caller, capabilities, signal)
                            : {content: `未知 Tool：${call.name}`, isError: true};
                        if (toolResult.writePlans && toolResult.writePlans.length > 0) {
                            throw new Error(`parallel Tool ${call.name} 不得返回 SessionWritePlan；请声明 executionMode=sequential`);
                        }
                        this.publishRuntime(sessionId, invocationId, {
                            type: "tool_execution_end",
                            turn,
                            toolCallId: call.id,
                            toolName: call.name,
                            result: toolResult.content,
                            isError: toolResult.isError ?? false,
                        }, attempt);
                        return {call, toolResult};
                    }));
                    this.assertAttemptActive(attempt);
                    const rejected = settledExecutions.find((execution) => execution.status === "rejected");
                    if (rejected?.status === "rejected") throw rejected.reason;
                    const executions = settledExecutions.flatMap((execution) => execution.status === "fulfilled" ? [execution.value] : []);
                    const toolMessages = executions.map(({call, toolResult}): AgentMessage => ({
                        role: "toolResult",
                        toolCallId: call.id,
                        toolName: call.name,
                        content: toolResult.content,
                        isError: toolResult.isError ?? false,
                        timestamp: this.now(),
                        ...(toolResult.details !== undefined ? {details: toolResult.details} : {}),
                    }));
                    messages.push(...toolMessages);
                    snapshot = await withRunStage("ingest", () => this.commitMessages(snapshot, invocationId, turn, toolMessages, attempt));
                    for (const {toolResult} of executions) {
                        turnHadError ||= toolResult.isError ?? false;
                        if (toolResult.output !== undefined) output = toolResult.output;
                        if (toolResult.terminate) {
                            terminated = true;
                            terminationReason = "tool_terminate";
                        }
                    }
                } else for (const call of calls) {
                    this.throwIfAborted(signal);
                    const tool = tools.find((candidate) => candidate.name === call.name);
                    this.publishRuntime(sessionId, invocationId, {
                        type: "tool_execution_start",
                        turn,
                        toolCallId: call.id,
                        toolName: call.name,
                        arguments: call.arguments,
                    }, attempt);
                    const toolResult = tool
                        ? await this.executeTool(tool, call.arguments, call, snapshot, invocationId, turn, caller, capabilities, signal)
                        : {content: `未知 Tool：${call.name}`, isError: true};
                    this.assertAttemptActive(attempt);
                    if (toolResult.writePlans && toolResult.writePlans.length > 0) {
                        snapshot = await this.commitWritePlans(toolResult.writePlans, snapshot, invocationId);
                    }
                    this.assertAttemptActive(attempt);
                    const toolMessage: AgentMessage = {
                        role: "toolResult",
                        toolCallId: call.id,
                        toolName: call.name,
                        content: toolResult.content,
                        isError: toolResult.isError ?? false,
                        timestamp: this.now(),
                        ...(toolResult.details !== undefined ? {details: toolResult.details} : {}),
                    };
                    messages.push(toolMessage);
                    snapshot = await withRunStage("ingest", () => this.commitMessages(snapshot, invocationId, turn, [toolMessage], attempt));
                    this.publishRuntime(sessionId, invocationId, {
                        type: "tool_execution_end",
                        turn,
                        toolCallId: call.id,
                        toolName: call.name,
                        result: toolResult.content,
                        isError: toolResult.isError ?? false,
                    }, attempt);
                    turnHadError ||= toolResult.isError ?? false;
                    if (toolResult.output !== undefined) {
                        output = toolResult.output;
                    }
                    if (toolResult.terminate) {
                        terminated = true;
                        terminationReason = "tool_terminate";
                    }
                }
                consecutiveToolErrors = turnHadError ? consecutiveToolErrors + 1 : 0;
                if (consecutiveToolErrors >= maxToolErrors) {
                    throw new Error(`连续 ${consecutiveToolErrors} 个 turn 的 Tool 执行失败`);
                }
                const afterTurn = await this.runHooks(profile, "afterTurn", snapshot, invocationId, caller, capabilities, signal, attempt, {turn, messages: [...runtimeMessages, ...messages]});
                nextTurnContext = mergeContextMessageSections(baseContext, afterTurn.context);
                snapshot = await this.applyEffect(afterTurn, snapshot, invocationId, runtimeMessages, attempt);
                this.publishRuntime(sessionId, invocationId, {type: "turn_end", turn, status: "completed"}, attempt);
                openTurn = undefined;
            }

            if (turn >= maxTurns && !terminated && terminationReason === undefined) {
                terminationReason = "max_turns";
            }
            if (terminationReason === undefined) {
                throw new Error("Invocation 完成时缺少 terminationReason");
            }
            const active = this.active.get(sessionId);
            if (active) active.acceptingSteer = false;
            let settledOutput: JsonValue = output ?? null;
            snapshot = await withRunStage("settleRun", async () => {
                const settleEffect = await this.runHooks(profile, "settleRun", snapshot, invocationId, caller, capabilities, signal, attempt, {
                    turn,
                    messages: [...runtimeMessages, ...messages],
                    terminationReason,
                    ...(output !== undefined ? {output} : {}),
                });
                snapshot = await this.applyEffect(settleEffect, snapshot, invocationId, messages, attempt);
                settledOutput = profile.parseOutput(settleEffect.output ?? output ?? null);
                return this.finish(snapshot, invocationId, "completed", turn, usage, settledOutput, undefined, terminationReason);
            });
            output = settledOutput;
            durableTerminal = true;
            this.publishTerminalEvent(sessionId, invocationId, "completed", usage, attempt, true);
            return {sessionId, invocationId, status: "completed", persistence: "confirmed", terminationReason, output, usage};
        } catch (error) {
            const active = this.active.get(sessionId);
            if (active) active.acceptingSteer = false;
            const aborted = signal.aborted;
            const ownershipLost = attempt.invalidated === "ownership-lost";
            const invocationError = toInvocationError(error, aborted ? "abort" : "run");
            let failureOutput: JsonValue | undefined;
            if (openTurn !== undefined) {
                this.publishRuntime(sessionId, invocationId, {type: "turn_end", turn: openTurn, status: "failed"}, attempt);
                openTurn = undefined;
            }
            try {
                let current = await this.store.read(sessionId);
                if (!ownershipLost && this.ownsActiveInvocation(current, invocationId)) {
                    const allowInvalidatedSettlement = aborted && attempt.invalidated === "abort";
                    try {
                        if (!allowInvalidatedSettlement) {
                            this.assertAttemptActive(attempt);
                        }
                        const beforeSettlement = await this.store.read(sessionId);
                        if (!this.ownsActiveInvocation(beforeSettlement, invocationId)) {
                            throw new InvocationAttemptInvalidatedError(invocationId, "ownership-lost");
                        }
                        const settleFailure = await this.runHooks(profile, "settleFailure", current, invocationId, caller, capabilities, signal, attempt, {turn, error: error instanceof Error ? error : new Error(String(error))}, allowInvalidatedSettlement);
                        const afterSettlement = await this.store.read(sessionId);
                        if (!this.ownsActiveInvocation(afterSettlement, invocationId)) {
                            throw new InvocationAttemptInvalidatedError(invocationId, "ownership-lost");
                        }
                        current = await this.applyEffect(settleFailure, afterSettlement, invocationId, [], attempt, allowInvalidatedSettlement);
                        const afterEffect = await this.store.read(sessionId);
                        if (!this.ownsActiveInvocation(afterEffect, invocationId)) {
                            throw new InvocationAttemptInvalidatedError(invocationId, "ownership-lost");
                        }
                        if (settleFailure.output !== undefined) failureOutput = profile.parseOutput(settleFailure.output);
                        current = afterEffect;
                    } catch {
                        // settlement 不能掩盖原始错误，也不能阻止 Invocation 进入 terminal。
                    }
                    if (this.ownsActiveInvocation(current, invocationId)) {
                        snapshot = await this.finish(current, invocationId, aborted ? "aborted" : "failed", turn, usage, failureOutput, invocationError, undefined, partial);
                        durableTerminal = true;
                    }
                }
            } catch {
                // 原始运行错误优先；Store 仍保留 running 事实，重启后可 reconcileInterrupted。
            }
            if (durableTerminal) {
                this.publishTerminalEvent(sessionId, invocationId, aborted ? "aborted" : "failed", usage, attempt, true);
            }
            return {
                sessionId,
                invocationId,
                status: aborted ? "aborted" : "failed",
                persistence: durableTerminal ? "confirmed" : "unknown",
                ...(failureOutput !== undefined ? {output: failureOutput} : {}),
                error: invocationError,
                usage,
                ...(partial ? {partial} : {}),
            };
        } finally {
            attempt.closed = true;
            try {
                try {
                    await capabilities.close();
                } catch {
                    // Capability Providers must report cleanup diagnostics themselves; cleanup cannot overwrite the Invocation outcome.
                }
            } finally {
                this.forgetInvocationSession(invocationId);
            }
        }
    }

    private async openCapabilities(
        tokens: readonly CapabilityToken<string, object>[],
        snapshot: SessionSnapshot<TSessionId, THostContext>,
        invocationId: string,
        caller: AgentCaller<TSessionId>,
        signal: AbortSignal,
        attempt: InvocationAttempt,
        scope: InvocationCapabilityScope,
    ): Promise<void> {
        const context: CapabilityOpenContext<TSessionId, THostContext> = {
            sessionId: snapshot.metadata.sessionId,
            invocationId,
            profileKey: snapshot.metadata.profileKey,
            caller,
            hostContext: snapshot.metadata.hostContext,
            snapshot,
            signal,
        };
        for (const token of tokens) {
            const provider = this.providers.get(token.identity);
            if (!provider) {
                throw new Error(`缺少必需 Capability Provider：${token.name}`);
            }
            const value = await provider.open(context);
            try {
                this.assertAttemptActive(attempt);
            } catch (error) {
                await provider.close?.(value);
                throw error;
            }
            scope.add(token, value, provider.close ? () => provider.close?.(value) : undefined);
        }
    }

    private async drainSteers(
        snapshot: SessionSnapshot<TSessionId, THostContext>,
        invocationId: string,
        turn: number,
        messages: AgentMessage[],
        attempt: InvocationAttempt,
    ): Promise<SessionSnapshot<TSessionId, THostContext>> {
        const active = this.active.get(snapshot.metadata.sessionId);
        if (!active || active.invocationId !== invocationId || active.steers.length === 0) return snapshot;
        const items = active.steers.splice(0, active.steers.length);
        const steerMessages: AgentMessage[] = items.map((item) => ({
            role: "user",
            content: `<user_steer>\n${typeof item.payload === "string" ? item.payload : JSON.stringify(item.payload)}\n</user_steer>`,
            timestamp: item.createdAt,
        }));
        messages.push(...steerMessages);
        const committed = await withRunStage("ingest", () => this.commitMessages(
            snapshot,
            invocationId,
            turn,
            steerMessages,
            attempt,
            items.map((item) => item.messageIdentity ?? "user"),
        ));
        this.assertAttemptActive(attempt);
        for (const item of items) {
            this.events.publish({sessionId: snapshot.metadata.sessionId, invocationId, kind: "session", event: {type: "steer_drained", item}});
        }
        return committed;
    }

    private watchFollowUps(sessionId: TSessionId, result: Promise<InvocationResult<TSessionId>>): void {
        const task = result.then(async (settled) => {
            if (this.disposed) return;
            if (settled.status === "completed") {
                await this.startNextFollowUp(sessionId, true);
                return;
            }
            if (settled.status === "failed" || settled.status === "aborted") {
                // 对齐 NeuroBook pauseFollowUps（队列空则跳过；pause 失败不掩盖终态）。
                await this.pauseFollowUpsOnTerminal(sessionId, settled.invocationId, settled.status === "aborted" ? "aborted" : "error");
            }
        }).catch(async (error) => {
            const message = error instanceof Error ? error.message : String(error);
            this.events.publish({
                sessionId,
                kind: "host",
                event: {type: "host", name: "follow_up_error", payload: message},
            });
            // 自动 drain 失败时 durable 自动 pause（对齐 NeuroBook
            // pausedBy 语义）：队首 item 卡住队列，宿主据 pausedBy
            // cancel/reorder 后 resume。手动 resumeFollowUps 的失败仍
            // 原样抛出，由宿主决定是否 pause。
            const attemptedItemId = this.followUpAttemptItemId(error);
            try {
                if (this.disposed || attemptedItemId === undefined) return;
                const snapshot = await this.store.read(sessionId);
                const state = projectFollowUps<TSessionId>(snapshot.entries);
                const head = state.items[0];
                if (!state.paused && head?.id === attemptedItemId) {
                    await this.commit({
                        target: sessionId,
                        expectedVersion: snapshot.version,
                        cause: "harness.followUp.autoPause",
                        operations: [{
                            type: "appendEntries",
                            entries: [{
                                kind: "harness.followUp.paused",
                                payload: {
                                    paused: true,
                                    itemId: attemptedItemId,
                                    reason: "admission_failed",
                                    message: truncateUtf8Bytes(message, 500),
                                },
                            }],
                        }],
                    }, undefined, {allowFollowUpFact: true});
                    await this.publishFollowUpState(sessionId);
                }
            } catch {
                // 自动 pause 失败不掩盖原始 follow_up_error（已发布）。
            }
        });
        this.background.add(task);
        void task.finally(() => this.background.delete(task));
    }

    private followUpAttemptItemId(error: unknown): string | undefined {
        return error instanceof FollowUpAdmissionError ? error.itemId : undefined;
    }

    private async pauseFollowUpsOnTerminal(
        sessionId: TSessionId,
        invocationId: string,
        reason: "error" | "aborted",
    ): Promise<void> {
        try {
            const snapshot = await this.store.read(sessionId);
            const state = projectFollowUps<TSessionId>(snapshot.entries);
            if (state.paused || state.items.length === 0) return;
            const head = state.items[0];
            if (!head) return;
            await this.commit({
                target: sessionId,
                expectedVersion: snapshot.version,
                cause: "harness.followUp.autoPauseTerminal",
                operations: [{
                    type: "appendEntries",
                    entries: [{
                        kind: "harness.followUp.paused",
                        payload: {
                            paused: true,
                            itemId: head.id,
                            reason,
                            invocationId,
                        },
                    }],
                }],
            }, undefined, {allowFollowUpFact: true});
            await this.publishFollowUpState(sessionId);
        } catch {
            // 终态自动 pause 失败不掩盖原始终态（已发布的 follow_up_error/agent_end 不受影响）。
        }
    }

    private async startNextFollowUp(sessionId: TSessionId, fromWatcher = false): Promise<InvocationHandle<TSessionId> | null> {
        if (this.disposed || this.active.has(sessionId)) return null;
        const snapshot = await this.store.read(sessionId);
        if (this.disposed) return null;
        if (snapshot.activeInvocationId !== null) return null;
        const queue = projectFollowUps<TSessionId>(snapshot.entries);
        if (queue.paused) return null;
        const item = queue.items[0];
        if (!item) return null;
        const caller: AgentCaller<TSessionId> = item.caller ?? {kind: "user"};
        try {
            const handle = await this.start({
                sessionId,
                payload: item.payload,
                caller,
                messageIdentity: item.messageIdentity ?? "user",
            }, undefined, undefined, {
                observedSnapshot: snapshot,
                expectedFollowUpId: item.id,
                postStartOperations: [{
                    type: "appendEntries",
                    entries: [{kind: "harness.followUp.consumed", payload: {id: item.id}}],
                }],
                payloadAdmission: "parsed",
            });
            this.events.publish({sessionId, invocationId: handle.invocationId, kind: "session", event: {type: "follow_up_started", item}});
            return handle;
        } catch (error) {
            if (!fromWatcher) throw error;
            throw new FollowUpAdmissionError(item.id, error);
        }
    }

    private async publishFollowUpState(sessionId: TSessionId): Promise<FollowUpQueueState<TSessionId>> {
        const state = await this.followUpStateOnce(sessionId);
        this.events.publish({sessionId, kind: "session", event: {type: "follow_up_state", state}});
        return state;
    }

    private async compactIfNeeded(
        snapshot: SessionSnapshot<TSessionId, THostContext>,
        invocationId: string,
        messages: AgentMessage[],
        settings: CompactionSettings | undefined,
        signal: AbortSignal,
        attempt: InvocationAttempt,
    ): Promise<SessionSnapshot<TSessionId, THostContext>> {
        if (!settings) return snapshot;
        if (!this.compactor) throw new Error("Profile 启用了 compaction，但 Harness 未配置 ContextCompactor");
        if (!Number.isInteger(settings.triggerTokens) || !Number.isInteger(settings.keepRecentTokens)
            || settings.triggerTokens <= 0 || settings.keepRecentTokens <= 0 || settings.keepRecentTokens >= settings.triggerTokens) {
            throw new Error("compaction 要求 0 < keepRecentTokens < triggerTokens");
        }
        // 触发阈值在自动路径评估；切分/摘要/落盘语义与手动路径共享。
        const projection = projectSessionTranscript(snapshot);
        const tokensBefore = projection.messages.reduce(
            (total, message) => total + this.compactor!.estimate(message),
            0,
        );
        if (tokensBefore < settings.triggerTokens) return snapshot;
        const outcome = await this.compactTranscript(
            snapshot,
            settings.keepRecentTokens,
            signal,
            {invocationId, attempt},
        );
        if (!outcome.compacted) return snapshot;
        messages.splice(0, messages.length, ...sessionMessages(outcome.snapshot));
        return outcome.snapshot;
    }

    /**
     * 共享切分/摘要/落盘核心（自动与手动路径共用）。使用当前 Snapshot 的
     * 对齐投影（而非 run 的 messages 工作副本）做切分：prepareWrites /
     * hook / Tool writePlans 提交的宿主贡献已落盘但不在工作副本里，用工作
     * 副本会让索引与 path 错位——firstKeptEntryId 指向错误 entry，贡献被
     * 投影丢弃、被摘要消息重复保留（第九十一轮探针复现）。
     */
    private async compactTranscript(
        snapshot: SessionSnapshot<TSessionId, THostContext>,
        keepRecentTokens: number,
        signal: AbortSignal,
        options: {
            readonly instructions?: string;
            readonly invocationId?: string;
            readonly attempt?: InvocationAttempt;
        } = {},
    ): Promise<{
        compacted: boolean;
        snapshot: SessionSnapshot<TSessionId, THostContext>;
        tokensBefore: number;
    }> {
        const compactor = this.compactor;
        if (!compactor) throw new Error("Harness 未配置 ContextCompactor");
        const projection = projectSessionTranscript(snapshot);
        const alignedMessages = projection.messages;
        const tokensBefore = alignedMessages.reduce(
            (total, message) => total + compactor.estimate(message),
            0,
        );
        assertNoPendingToolCalls(alignedMessages);

        let keptTokens = 0;
        let keepIndex = alignedMessages.length;
        for (let index = alignedMessages.length - 1; index >= 0; index -= 1) {
            keptTokens += compactor.estimate(alignedMessages[index]!);
            keepIndex = index;
            if (keptTokens >= keepRecentTokens) break;
        }
        const firstKept = alignedMessages[keepIndex]!;
        if (firstKept?.role === "toolResult") {
            for (let index = keepIndex - 1; index >= 0; index -= 1) {
                const candidate = alignedMessages[index];
                if (candidate?.role === "assistant"
                    && assistantToolCalls(candidate).some((call) => call.id === firstKept.toolCallId)) {
                    keepIndex = index;
                    break;
                }
            }
        }
        if (keepIndex <= 0) return {compacted: false, snapshot, tokensBefore};
        const summaryOffset = projection.previousSummary && projection.entries[0] === null ? 1 : 0;
        const toSummarize = alignedMessages.slice(summaryOffset, keepIndex);
        if (toSummarize.length === 0) return {compacted: false, snapshot, tokensBefore};
        const invocationId = options.invocationId;
        const attempt = options.attempt;
        if (invocationId !== undefined && attempt) {
            this.publishRuntime(
                snapshot.metadata.sessionId,
                invocationId,
                {type: "compaction_start", tokensBefore},
                attempt,
            );
        }
        const summary = (await compactor.summarize({
            messages: toSummarize,
            ...(projection.previousSummary ? {previousSummary: projection.previousSummary} : {}),
            ...(options.instructions !== undefined ? {instructions: options.instructions} : {}),
            signal,
        })).trim();
        signal.throwIfAborted();
        if (attempt) this.assertAttemptActive(attempt);
        if (!summary) throw new Error("ContextCompactor 返回了空 summary");

        const firstKeptEntryId = projection.entries[keepIndex]?.id ?? null;
        const compacted = invocationId !== undefined
            ? await this.commitWithFollowUpRebase(
                snapshot,
                invocationId,
                (current) => ({
                    target: current.metadata.sessionId,
                    expectedVersion: current.version,
                    cause: "harness.compaction",
                    operations: [{
                        type: "appendEntries",
                        entries: [{
                            kind: "agent.compaction",
                            invocationId,
                            payload: {summary, firstKeptEntryId, tokensBefore},
                        }],
                    }],
                }),
                attempt,
                {allowCompactionFact: true},
            )
            : await this.commit({
                target: snapshot.metadata.sessionId,
                expectedVersion: snapshot.version,
                cause: "harness.compaction",
                operations: [{
                    type: "appendEntries",
                    entries: [{
                        kind: "agent.compaction",
                        payload: {summary, firstKeptEntryId, tokensBefore},
                    }],
                }],
            }, undefined, {allowCompactionFact: true});
        if (attempt) this.assertAttemptActive(attempt);
        if (invocationId !== undefined && attempt) {
            this.publishRuntime(snapshot.metadata.sessionId, invocationId, {
                type: "compaction_end",
                tokensBefore,
                keptMessages: sessionMessages(compacted).length - 1,
            }, attempt);
        }
        return {compacted: true, snapshot: compacted, tokensBefore};
    }

    private async collectApprovals(
        calls: readonly Parameters<ToolDefinition<JsonValue, TSessionId, THostContext>["execute"]>[2][],
        tools: readonly ToolDefinition<JsonValue, TSessionId, THostContext>[],
        snapshot: SessionSnapshot<TSessionId, THostContext>,
        invocationId: string,
        turn: number,
        caller: AgentCaller<TSessionId>,
        capabilities: InvocationCapabilityScope,
        signal: AbortSignal,
        attempt: InvocationAttempt,
    ): Promise<ApprovalRequest[]> {
        const requests: ApprovalRequest[] = [];
        for (const call of calls) {
            const tool = tools.find((candidate) => candidate.name === call.name);
            if (!tool?.approval) continue;
            const argumentsValue = parseSchemaValue(tool.parameters, call.arguments);
            const prompt = await tool.approval.request(argumentsValue, {
                sessionId: snapshot.metadata.sessionId,
                invocationId,
                profileKey: snapshot.metadata.profileKey,
                turn,
                caller,
                hostContext: snapshot.metadata.hostContext,
                snapshot,
                capabilities,
                signal,
            }, call);
            this.assertAttemptActive(attempt);
            if (prompt) {
                requests.push({
                    toolCallId: call.id,
                    toolName: call.name,
                    prompt: prompt.prompt,
                    arguments: call.arguments,
                    ...(prompt.details !== undefined ? {details: prompt.details} : {}),
                });
            }
        }
        return requests;
    }

    private async resolveApprovals(
        initialSnapshot: SessionSnapshot<TSessionId, THostContext>,
        invocationId: string,
        turn: number,
        caller: AgentCaller<TSessionId>,
        capabilities: InvocationCapabilityScope,
        signal: AbortSignal,
        attempt: InvocationAttempt,
        tools: readonly ToolDefinition<JsonValue, TSessionId, THostContext>[],
        pending: readonly ApprovalRequest[],
        resolutions: readonly ApprovalResolution[],
        messages: AgentMessage[],
    ): Promise<SessionSnapshot<TSessionId, THostContext>> {
        let snapshot = initialSnapshot;
        const pendingById = new Map(pending.map((request) => [request.toolCallId, request]));
        const resolutionById = new Map(resolutions.map((resolution) => [resolution.toolCallId, resolution]));
        const unresolvedCalls = pendingToolCalls(messages);
        const toolMessages: AgentMessage[] = [];

        for (const call of unresolvedCalls) {
            this.throwIfAborted(signal);
            this.assertAttemptActive(attempt);
            const tool = tools.find((candidate) => candidate.name === call.name);
            const request = pendingById.get(call.id);
            const resolution = request ? resolutionById.get(call.id) : undefined;
            if (request && !resolution) {
                throw new Error(`Tool ${call.name} 缺少 approval resolution`);
            }
            this.publishRuntime(snapshot.metadata.sessionId, invocationId, {
                type: "tool_execution_start",
                turn,
                toolCallId: call.id,
                toolName: call.name,
                arguments: call.arguments,
            }, attempt);
            const toolResult: ToolResult<TSessionId, THostContext> = request && resolution && !resolution.approved
                ? {
                    content: resolution.message ?? "Rejected.",
                    isError: true,
                    ...(resolution.data !== undefined ? {details: resolution.data} : {}),
                }
                : tool
                    ? await this.executeTool(tool, call.arguments, call, snapshot, invocationId, turn, caller, capabilities, signal, resolution)
                    : {content: `未知 Tool：${call.name}`, isError: true};
            this.assertAttemptActive(attempt);
            if (toolResult.writePlans && toolResult.writePlans.length > 0) {
                snapshot = await this.commitWritePlans(toolResult.writePlans, snapshot, invocationId);
            }
            this.assertAttemptActive(attempt);
            const message: AgentMessage = {
                role: "toolResult",
                toolCallId: call.id,
                toolName: call.name,
                content: toolResult.content,
                isError: toolResult.isError ?? false,
                timestamp: this.now(),
                ...(toolResult.details !== undefined ? {details: toolResult.details} : {}),
            };
            toolMessages.push(message);
            this.publishRuntime(snapshot.metadata.sessionId, invocationId, {
                type: "tool_execution_end",
                turn,
                toolCallId: call.id,
                toolName: call.name,
                result: toolResult.content,
                isError: toolResult.isError ?? false,
            }, attempt);
        }
        this.assertAttemptActive(attempt);
        const committed = await this.commit({
            target: snapshot.metadata.sessionId,
            expectedVersion: snapshot.version,
            cause: "harness.invocation.resumeApproval",
            operations: [{
                type: "appendEntries",
                entries: toolMessages.map((message) => ({kind: "agent.message", invocationId, payload: messageEntryPayload(message, turn)})),
            }],
        }, invocationId);
        this.assertAttemptActive(attempt);
        for (const message of toolMessages) {
            this.publishRuntime(
                committed.metadata.sessionId,
                invocationId,
                {type: "message_committed", turn, message},
                attempt,
            );
        }
        messages.push(...toolMessages);
        this.publishRuntime(snapshot.metadata.sessionId, invocationId, {type: "approval_resolved", resolutions}, attempt);
        return committed;
    }

    private async runHooks(
        profile: ResolvedProfile<TSessionId, THostContext, TModelConfig>,
        stage: RuntimeHookContext<TSessionId, THostContext>["stage"],
        snapshot: SessionSnapshot<TSessionId, THostContext>,
        invocationId: string,
        caller: AgentCaller<TSessionId>,
        capabilities: InvocationCapabilityScope,
        signal: AbortSignal,
        attempt: InvocationAttempt,
        details: Pick<RuntimeHookContext<TSessionId, THostContext>, "turn" | "messages" | "terminationReason" | "output" | "error">,
        allowInvalidated = false,
    ): Promise<RuntimeEffect<TSessionId, THostContext>> {
        const context: RuntimeHookContext<TSessionId, THostContext> = {
            stage,
            sessionId: snapshot.metadata.sessionId,
            invocationId,
            caller,
            hostContext: snapshot.metadata.hostContext,
            snapshot,
            capabilities,
            signal,
            ...defined(details),
        };
        const effects: RuntimeEffect<TSessionId, THostContext>[] = [];
        for (const hook of profile.hooks.filter((item) => item.stage === stage)) {
            const effect = await hook.run(context);
            if (!allowInvalidated) {
                this.assertAttemptActive(attempt);
            }
            effects.push(effect);
        }
        return mergeEffects(effects);
    }

    private async resolveContextProviders(
        providers: readonly ContextProvider<TSessionId, THostContext>[],
        snapshot: SessionSnapshot<TSessionId, THostContext>,
        invocationId: string,
        caller: AgentCaller<TSessionId>,
        capabilities: InvocationCapabilityScope,
        signal: AbortSignal,
        attempt: InvocationAttempt,
        turn: number,
    ): Promise<ContextMessageSections | undefined> {
        if (providers.length === 0) return undefined;
        const results: ContextMessageSections[] = [];
        for (const provider of providers) {
            this.throwIfAborted(signal);
            try {
                const result = await provider.resolve({
                    sessionId: snapshot.metadata.sessionId,
                    invocationId,
                    caller,
                    hostContext: snapshot.metadata.hostContext,
                    snapshot,
                    capabilities,
                    signal,
                    turn,
                });
                this.assertAttemptActive(attempt);
                const sections: ContextMessageSections = {
                    ...(result?.modelContext && result.modelContext.length > 0 ? {modelContext: result.modelContext} : {}),
                    ...(result?.modelContextAppending && result.modelContextAppending.length > 0
                        ? {modelContextAppending: result.modelContextAppending}
                        : {}),
                };
                if (Object.keys(sections).length > 0) {
                    results.push(sections);
                }
            } catch (error) {
                const message = error instanceof Error ? error.message : String(error);
                throw new Error(`ContextProvider ${provider.name} 解析失败：${message}`);
            }
        }
        return results.length > 0 ? mergeContextMessageSections(...results) : undefined;
    }

    private async applyEffect(
        effect: RuntimeEffect<TSessionId, THostContext>,
        snapshot: SessionSnapshot<TSessionId, THostContext>,
        invocationId: string,
        messages: AgentMessage[],
        attempt: InvocationAttempt,
        allowInvalidated = false,
    ): Promise<SessionSnapshot<TSessionId, THostContext>> {
        if (!allowInvalidated) {
            this.assertAttemptActive(attempt);
        }
        if (effect.runtimeMessages) {
            messages.push(...effect.runtimeMessages);
        }
        let current = snapshot;
        if (effect.writePlans && effect.writePlans.length > 0) {
            current = await this.commitWritePlans(effect.writePlans, current, invocationId);
        }
        if (!allowInvalidated) {
            this.assertAttemptActive(attempt);
        }
        return current;
    }

    private async executeTool(
        tool: ToolDefinition<JsonValue, TSessionId, THostContext>,
        argumentsValue: JsonValue,
        call: Parameters<ToolDefinition<JsonValue, TSessionId, THostContext>["execute"]>[2],
        snapshot: SessionSnapshot<TSessionId, THostContext>,
        invocationId: string,
        turn: number,
        caller: AgentCaller<TSessionId>,
        capabilities: InvocationCapabilityScope,
        signal: AbortSignal,
        approval?: ApprovalResolution,
    ): Promise<ToolResult<TSessionId, THostContext>> {
        try {
            const parsed = parseSchemaValue(tool.parameters, argumentsValue);
            return await tool.execute(parsed, {
                sessionId: snapshot.metadata.sessionId,
                invocationId,
                profileKey: snapshot.metadata.profileKey,
                turn,
                caller,
                hostContext: snapshot.metadata.hostContext,
                snapshot,
                capabilities,
                signal,
                ...(approval ? {approval} : {}),
            }, call);
        } catch (error) {
            return {content: error instanceof Error ? error.message : String(error), isError: true};
        }
    }

    private async commitMessages(
        snapshot: SessionSnapshot<TSessionId, THostContext>,
        invocationId: string,
        turn: number,
        messages: readonly AgentMessage[],
        attempt: InvocationAttempt,
        messageIdentities: readonly (MessageIdentity | undefined)[] = [],
    ): Promise<SessionSnapshot<TSessionId, THostContext>> {
        this.assertAttemptActive(attempt);
        const plan = (current: SessionSnapshot<TSessionId, THostContext>): SessionWritePlan<TSessionId, THostContext> => ({
            target: current.metadata.sessionId,
            expectedVersion: current.version,
            cause: "harness.transcript.commit",
            durability: "savePoint",
            operations: [{
                type: "appendEntries",
                entries: messages.map((message, index) => ({
                    kind: "agent.message",
                    invocationId,
                    payload: messageEntryPayload(message, turn, messageIdentities[index]),
                })),
            }],
        });
        const committed = await this.commitWithFollowUpRebase(snapshot, invocationId, plan, attempt);
        for (const message of messages) {
            this.publishRuntime(
                committed.metadata.sessionId,
                invocationId,
                {type: "message_committed", turn, message},
                attempt,
            );
        }
        return committed;
    }

    private async finish(
        snapshot: SessionSnapshot<TSessionId, THostContext>,
        invocationId: string,
        status: "completed" | "failed" | "aborted",
        turnCount: number,
        usage: TokenUsage,
        output?: JsonValue,
        error?: InvocationError,
        terminationReason?: InvocationTerminationReason,
        partial?: InvocationPartial,
    ): Promise<SessionSnapshot<TSessionId, THostContext>> {
        const plan = (current: SessionSnapshot<TSessionId, THostContext>): SessionWritePlan<TSessionId, THostContext> => ({
            target: current.metadata.sessionId,
            expectedVersion: current.version,
            cause: "harness.invocation.finish",
            operations: terminalInvocationOperations({
                invocationId,
                status,
                turnCount,
                usage,
                ...(terminationReason ? {terminationReason} : {}),
                ...(output !== undefined ? {output} : {}),
                ...(error ? {error} : {}),
                ...(partial ? {partial} : {}),
            }),
        });
        const committed = await this.commitWithFollowUpRebase(
            snapshot,
            invocationId,
            plan,
            undefined,
            {
                allowInvocationUsageFact: true,
                allowInvocationPartialFact: true,
                ...(status === "aborted" ? {allowAbortedSignal: true} : {}),
            },
        );
        this.sealInvocationWriteFence(invocationId);
        return committed;
    }

    private async commitWithFollowUpRebase(
        initial: SessionSnapshot<TSessionId, THostContext>,
        invocationId: string,
        plan: (current: SessionSnapshot<TSessionId, THostContext>) => SessionWritePlan<TSessionId, THostContext>,
        attempt?: InvocationAttempt,
        options?: InvocationCommitOptions,
    ): Promise<SessionSnapshot<TSessionId, THostContext>> {
        let current = initial;
        for (let commitAttempt = 0; commitAttempt < MAX_FOLLOW_UP_REBASE_ATTEMPTS; commitAttempt += 1) {
            try {
                const committed = await this.commit(plan(current), invocationId, options);
                if (attempt) {
                    this.assertAttemptActive(attempt);
                }
                return committed;
            } catch (error) {
                if (!(error instanceof SessionConflictError) || commitAttempt === MAX_FOLLOW_UP_REBASE_ATTEMPTS - 1) {
                    throw error;
                }
                const latest = await this.store.read(initial.metadata.sessionId);
                if (attempt) {
                    this.assertAttemptActive(attempt);
                }
                if (!canRebaseFollowUp(current, latest) || latest.activeInvocationId !== invocationId) {
                    throw error;
                }
                current = latest;
            }
        }
        throw new Error("follow-up rebase attempts exhausted");
    }

    /**
     * Admits one plan-array batch (Tool writePlans, Profile prepareWrites or hook
     * effect writePlans) before any durable write: every plan must pass the same
     * guards as commit() and must apply cleanly to the projected snapshot produced
     * by the previous plans. The guards run here before the pure projection so
     * guard-level rejection also happens before any durable write; commit()
     * repeats them as its per-plan safety net. Commit-time CAS conflicts caused by
     * concurrent writers can still leave earlier plans durable; plan-internal
     * invalidity never produces a partial batch.
     */
    private async commitWritePlans(
        plans: readonly SessionWritePlan<TSessionId, THostContext>[],
        snapshot: SessionSnapshot<TSessionId, THostContext>,
        invocationId: string,
    ): Promise<SessionSnapshot<TSessionId, THostContext>> {
        const effectivePlans = plans.map((plan) => {
            this.assertInvocationUsageFact(plan, invocationId, false);
            this.assertInvocationPartialFact(plan, invocationId, false);
            this.assertCompactionFact(plan, invocationId, false);
            this.assertFollowUpFact(plan, false);
            this.assertInvocationTarget(plan, invocationId, false);
            return plan.expectedActiveInvocationId === undefined
                ? {...plan, expectedActiveInvocationId: invocationId}
                : plan;
        });
        let projected = snapshot;
        for (const plan of effectivePlans) {
            projected = reduceSessionWritePlan(projected, plan, {
                now: this.now,
                entryId: () => randomUUID(),
            }).snapshot;
        }
        let committed = snapshot;
        for (const plan of effectivePlans) {
            committed = await this.commit(plan, invocationId);
        }
        return committed;
    }

    private async commit(
        plan: SessionWritePlan<TSessionId, THostContext>,
        invocationId?: string,
        options?: InvocationCommitOptions,
    ): Promise<SessionSnapshot<TSessionId, THostContext>> {
        this.assertInvocationUsageFact(plan, invocationId, options?.allowInvocationUsageFact ?? false);
        this.assertInvocationPartialFact(plan, invocationId, options?.allowInvocationPartialFact ?? false);
        this.assertCompactionFact(plan, invocationId, options?.allowCompactionFact ?? false);
        this.assertFollowUpFact(plan, options?.allowFollowUpFact ?? false);
        if (invocationId !== undefined) {
            this.assertInvocationTarget(plan, invocationId, options?.allowSealedInvocationTerminal ?? false);
        }
        const effectivePlan = invocationId !== undefined && plan.expectedActiveInvocationId === undefined
            ? {...plan, expectedActiveInvocationId: invocationId}
            : plan;
        const publication = captureDurablePublication(this.store, effectivePlan.target);
        const active = invocationId === undefined ? undefined : this.active.get(effectivePlan.target);
        const signal = options?.allowAbortedSignal
            ? undefined
            : active && active.invocationId === invocationId ? active.controller.signal : undefined;
        let result;
        try {
            result = await this.store.commit(effectivePlan, signal ? {signal} : undefined);
        } catch (error) {
            if (error instanceof InvocationOwnershipError && invocationId !== undefined) {
                const active = this.active.get(plan.target);
                if (active?.invocationId === invocationId) {
                    this.invalidateAttempt(active.attempt, "ownership-lost");
                }
            }
            throw error;
        }
        const notification = {plan: effectivePlan, result};
        for (const observer of this.commitObservers) {
            await this.notifyCommitObserver(observer, notification);
        }
        publishDurableCommit(this.events, publication, invocationId, result);
        return result.snapshot;
    }

    private async notifyCommitObserver(
        observer: SessionCommitObserver<TSessionId, THostContext>,
        notification: SessionCommitNotification<TSessionId, THostContext>,
    ): Promise<void> {
        let returned: void | Promise<void>;
        try {
            returned = observer.afterCommit(notification);
        } catch (error) {
            await this.reportCommitObserverError(observer.name, error);
            return;
        }
        const outcome: Promise<CommitObserverOutcome> = Promise.resolve(returned).then(
            (): CommitObserverOutcome => ({kind: "completed"}),
            (error: unknown): CommitObserverOutcome => ({kind: "failed", error}),
        );
        const observed = await this.waitForCommitCallbackOrShutdown(outcome);
        if (observed.kind === "shutdown") {
            // Observer 可重入并等待 dispose；publication 不能与 shutdown admission 形成环。
            void outcome.then((late) => {
                if (late.kind === "failed") {
                    void this.reportCommitObserverError(observer.name, late.error);
                }
            });
            return;
        }
        if (observed.kind === "failed") {
            await this.reportCommitObserverError(observer.name, observed.error);
        }
    }

    private waitForCommitCallbackOrShutdown(
        outcome: Promise<CommitObserverOutcome>,
    ): Promise<CommitObserverOutcome | {readonly kind: "shutdown"}> {
        const signal = this.shutdownStarted.signal;
        if (signal.aborted) {
            return Promise.resolve({kind: "shutdown"});
        }
        return new Promise((resolve) => {
            let settled = false;
            const onShutdown = () => {
                if (settled) return;
                settled = true;
                resolve({kind: "shutdown"});
            };
            signal.addEventListener("abort", onShutdown, {once: true});
            void outcome.then((result) => {
                if (settled) return;
                settled = true;
                signal.removeEventListener("abort", onShutdown);
                resolve(result);
            });
        });
    }

    private async reportCommitObserverError(observerName: string, error: unknown): Promise<void> {
        let returned: void | Promise<void>;
        try {
            returned = this.onObserverError?.(observerName, error instanceof Error ? error : new Error(String(error)));
        } catch {
            return;
        }
        const outcome: Promise<CommitObserverOutcome> = Promise.resolve(returned).then(
            (): CommitObserverOutcome => ({kind: "completed"}),
            (reportError: unknown): CommitObserverOutcome => ({kind: "failed", error: reportError}),
        );
        await this.waitForCommitCallbackOrShutdown(outcome);
        // commit 已持久化；错误报告器失败也不能把成功事实伪装成失败。
    }

    private assertInvocationUsageFact(
        plan: SessionWritePlan<TSessionId, THostContext>,
        invocationId: string | undefined,
        allowed: boolean,
    ): void {
        const containsUsage = plan.operations.some((operation) => {
            return operation.type === "appendEntries"
                && operation.entries.some((entry) => entry.kind === INVOCATION_USAGE_ENTRY_KIND);
        });
        if (!containsUsage) {
            return;
        }
        if (!allowed || invocationId === undefined || !this.isInvocationTerminalFactPlan(plan, invocationId)) {
            throw new SessionInvariantError(`${INVOCATION_USAGE_ENTRY_KIND} 是 Harness 保留的 terminal fact`);
        }
    }

    private assertInvocationPartialFact(
        plan: SessionWritePlan<TSessionId, THostContext>,
        invocationId: string | undefined,
        allowed: boolean,
    ): void {
        const containsPartial = plan.operations.some((operation) => {
            return operation.type === "appendEntries"
                && operation.entries.some((entry) => entry.kind === INVOCATION_PARTIAL_ENTRY_KIND);
        });
        if (!containsPartial) return;
        if (!allowed || invocationId === undefined || !this.isInvocationTerminalFactPlan(plan, invocationId)) {
            throw new SessionInvariantError(`${INVOCATION_PARTIAL_ENTRY_KIND} 是 Harness 保留的 terminal fact`);
        }
    }

    private assertCompactionFact(
        plan: SessionWritePlan<TSessionId, THostContext>,
        invocationId: string | undefined,
        allowed: boolean,
    ): void {
        const containsCompaction = plan.operations.some((operation) => {
            return operation.type === "appendEntries"
                && operation.entries.some((entry) => entry.kind === "agent.compaction");
        });
        if (!containsCompaction) return;
        // allowed 只由 Harness 内部 commit 传入（宿主 write/writePlans 永远
        // 不设该标志）；精确 plan 校验允许「entry.invocationId 与 commit
        // invocationId 一致」，手动压缩（ADR-0037）两者皆为 undefined。
        if (!allowed || !this.isCompactionFactPlan(plan, invocationId)) {
            throw new SessionInvariantError("agent.compaction 是 Harness 保留的 compaction fact");
        }
    }

    private isCompactionFactPlan(
        plan: SessionWritePlan<TSessionId, THostContext>,
        invocationId: string | undefined,
    ): boolean {
        if (plan.cause !== "harness.compaction" || plan.operations.length !== 1) {
            return false;
        }
        const operation = plan.operations[0];
        if (operation?.type !== "appendEntries" || operation.entries.length !== 1) {
            return false;
        }
        const entry = operation.entries[0];
        return entry?.kind === "agent.compaction" && entry.invocationId === invocationId;
    }

    private assertFollowUpFact(
        plan: SessionWritePlan<TSessionId, THostContext>,
        allowed: boolean,
    ): void {
        const containsFollowUp = plan.operations.some((operation) => {
            return operation.type === "appendEntries"
                && operation.entries.some((entry) => entry.kind.startsWith("harness.followUp."));
        });
        if (containsFollowUp && !allowed) {
            throw new SessionInvariantError("harness.followUp.* 是 Harness 保留的 coordination fact");
        }
    }

    private isInvocationTerminalFactPlan(
        plan: SessionWritePlan<TSessionId, THostContext>,
        invocationId: string,
    ): boolean {
        if (plan.operations.length !== 2) {
            return false;
        }
        const terminal = plan.operations[0];
        const append = plan.operations[1];
        if (terminal?.type !== "finishInvocation"
            || terminal.invocationId !== invocationId
            || append?.type !== "appendEntries"
            || append.entries.length < 1
            || append.entries.length > 2) {
            return false;
        }
        const kinds = new Set<string>();
        for (const entry of append.entries) {
            if (entry.invocationId !== invocationId || kinds.has(entry.kind)) return false;
            kinds.add(entry.kind);
            if (entry.kind === INVOCATION_USAGE_ENTRY_KIND) {
                if (entry.payload === null || typeof entry.payload !== "object" || Array.isArray(entry.payload)
                    || ![entry.payload.input, entry.payload.output, entry.payload.total].every((value) => {
                        return typeof value === "number" && Number.isFinite(value) && value >= 0;
                    })) return false;
                continue;
            }
            if (entry.kind === INVOCATION_PARTIAL_ENTRY_KIND
                && (terminal.status === "failed" || terminal.status === "aborted")) {
                try {
                    const partial = entry.payload as unknown as InvocationPartial;
                    invocationPartialEntryDraft(invocationId, partial);
                    if (partial.turn !== terminal.turnCount) return false;
                    continue;
                } catch {
                    return false;
                }
            }
            return false;
        }
        return true;
    }

    private assertInvocationTarget(
        plan: SessionWritePlan<TSessionId, THostContext>,
        invocationId: string,
        allowSealedInvocationTerminal: boolean,
    ): void {
        const active = [...this.active.values()].find((candidate) => candidate.invocationId === invocationId);
        const fence = this.invocationWriteFences.get(invocationId) ?? (active?.attempt.writeFence === "sealed" ? "sealed" : undefined);
        const operation = plan.operations[0];
        const isForcedAbortTerminal = plan.cause === "harness.invocation.forceAbort"
            && (plan.operations.length === 1 || this.isInvocationTerminalFactPlan(plan, invocationId))
            && operation?.type === "finishInvocation"
            && operation.invocationId === invocationId
            && operation.status === "aborted"
            && plan.expectedActiveInvocationId === invocationId;
        if (fence === "sealed" && !(allowSealedInvocationTerminal && isForcedAbortTerminal)) {
            throw new InvocationWriteFenceError(invocationId);
        }
        if (allowSealedInvocationTerminal && !isForcedAbortTerminal) {
            throw new SessionInvariantError(`Invocation ${invocationId} 的 sealed write fence 只允许 forced abort terminal plan`);
        }
        const started = plan.operations.find((operation) => operation.type === "startInvocation" && operation.invocation.id === invocationId);
        const ownerSessionId = active?.sessionId
            ?? this.invocationSessions.get(invocationId)
            ?? (started?.type === "startInvocation" ? started.invocation.sessionId : undefined);
        if (ownerSessionId !== undefined && plan.target !== ownerSessionId) {
            throw new SessionInvariantError(`Invocation-owned write 不能跨 Session：invocation=${invocationId}, owner=${String(ownerSessionId)}, target=${String(plan.target)}`);
        }
        const firstOperation = plan.operations[0];
        const postStartOperations = plan.operations.slice(1);
        const isStartAdmissionPlan = firstOperation?.type === "startInvocation"
            && firstOperation.invocation.id === invocationId
            && plan.expectedActiveInvocationId === null;
        const isFollowUpAdmissionPlan = isStartAdmissionPlan
            && postStartOperations.every((candidate) => candidate.type === "appendEntries"
                && candidate.entries.length > 0
                && candidate.entries.every((entry) => entry.kind === "harness.followUp.consumed"));
        if (ownerSessionId !== undefined
            && !(isStartAdmissionPlan && isFollowUpAdmissionPlan)
            && plan.expectedActiveInvocationId !== undefined
            && plan.expectedActiveInvocationId !== invocationId) {
            throw new SessionInvariantError(`Invocation-owned write 不能覆盖 owner：invocation=${invocationId}, expected=${String(plan.expectedActiveInvocationId)}`);
        }
    }

    private publishRuntime(
        sessionId: TSessionId,
        invocationId: string,
        event: Parameters<SessionEventHub<TSessionId>["publish"]>[0] extends {event: infer TEvent} ? TEvent : never,
        attempt?: InvocationAttempt,
    ): void {
        if (attempt && (attempt.closed || attempt.invalidated !== null)) {
            return;
        }
        this.events.publish({sessionId, invocationId, kind: "runtime", event} as Parameters<SessionEventHub<TSessionId>["publish"]>[0]);
    }

    private publishTerminalEvent(
        sessionId: TSessionId,
        invocationId: string,
        status: "completed" | "failed" | "aborted",
        usage: TokenUsage,
        attempt?: InvocationAttempt,
        allowInvalidated = false,
    ): void {
        const active = this.active.get(sessionId);
        const eventKey = this.terminalEventKey(sessionId, invocationId);
        if (this.terminalEventInvocations.has(eventKey)) {
            return;
        }
        if (active && (active.invocationId !== invocationId || active.terminalEventPublished)) {
            return;
        }
        if (!active && attempt !== undefined) {
            return;
        }
        if (!allowInvalidated && attempt && (attempt.closed || attempt.invalidated !== null)) {
            return;
        }
        this.terminalEventInvocations.add(eventKey);
        if (active) {
            active.terminalEventPublished = true;
        }
        this.events.publish({
            sessionId,
            invocationId,
            kind: "runtime",
            event: {type: "agent_end", status, usage},
        });
    }

    private createAttempt(sessionId: TSessionId, invocationId: string): InvocationAttempt {
        this.rememberInvocationSession(invocationId, sessionId);
        return {invocationId, invalidated: null, closed: false, writeFence: "open"};
    }

    private rememberInvocationSession(invocationId: string, sessionId: TSessionId): void {
        const existing = this.invocationSessions.get(invocationId);
        if (existing !== undefined && existing !== sessionId) {
            throw new SessionInvariantError(`Invocation ${invocationId} 不能绑定多个 Session`);
        }
        if (existing !== undefined && this.invocationWriteFences.get(invocationId) === "sealed") {
            throw new SessionInvariantError(`Invocation ${invocationId} 的 write fence 已封闭`);
        }
        if (existing === undefined) {
            this.terminalEventInvocations.delete(this.terminalEventKey(sessionId, invocationId));
        }
        this.invocationSessions.set(invocationId, sessionId);
        this.invocationWriteFences.set(invocationId, this.invocationWriteFences.get(invocationId) ?? "open");
    }

    private forgetInvocationSession(invocationId: string): void {
        this.invocationSessions.delete(invocationId);
        this.invocationWriteFences.delete(invocationId);
    }

    private sealInvocationWriteFence(invocationId: string): void {
        this.invocationWriteFences.set(invocationId, "sealed");
        const active = [...this.active.values()].find((candidate) => candidate.invocationId === invocationId);
        if (active) {
            active.attempt.writeFence = "sealed";
        }
    }

    private terminalEventKey(sessionId: TSessionId, invocationId: string): string {
        return JSON.stringify([typeof sessionId, String(sessionId), invocationId]);
    }

    private invalidateAttempt(attempt: InvocationAttempt, reason: Exclude<InvocationAttempt["invalidated"], null>): void {
        if (attempt.invalidated === null) {
            attempt.invalidated = reason;
        }
    }

    private assertAttemptActive(attempt: InvocationAttempt): void {
        if (attempt.invalidated !== null) {
            throw new InvocationAttemptInvalidatedError(attempt.invocationId, attempt.invalidated);
        }
    }

    private throwIfAborted(signal: AbortSignal): void {
        if (signal.aborted) {
            throw signal.reason instanceof Error ? signal.reason : new Error("Invocation 已取消");
        }
    }

    private assertUsable(): void {
        if (this.disposed) {
            throw new Error("NeuroAgentHarness 已 dispose");
        }
    }
}

function terminalInvocationOperations<
    TSessionId extends SessionId,
    THostContext extends JsonObject,
>(input: {
    readonly invocationId: string;
    readonly status: "completed" | "failed" | "aborted";
    readonly turnCount: number;
    readonly usage: TokenUsage;
    readonly partial?: InvocationPartial;
    readonly output?: JsonValue;
    readonly error?: InvocationError;
    readonly terminationReason?: InvocationTerminationReason;
}): readonly SessionWriteOperation<TSessionId, THostContext>[] {
    const terminal: SessionWriteOperation<TSessionId, THostContext> = {
        type: "finishInvocation",
        invocationId: input.invocationId,
        status: input.status,
        turnCount: input.turnCount,
        ...(input.terminationReason ? {terminationReason: input.terminationReason} : {}),
        ...(input.output !== undefined ? {output: input.output} : {}),
        ...(input.status !== "aborted" && input.error ? {error: input.error} : {}),
    };
    const entries = [
        ...(input.usage.input === 0 && input.usage.output === 0 && input.usage.total === 0
            ? []
            : [invocationUsageEntryDraft(input.invocationId, input.usage)]),
        ...(input.partial ? [invocationPartialEntryDraft(input.invocationId, input.partial)] : []),
    ];
    if (entries.length === 0) {
        return [terminal];
    }
    return [
        terminal,
        {type: "appendEntries", entries},
    ];
}

/** Extracts provider-visible messages from a successfully committed prepareWrites batch (ADR-0039 injection). */
function prepareContributionMessages<
    TSessionId extends SessionId,
    THostContext extends JsonObject,
>(plans: readonly SessionWritePlan<TSessionId, THostContext>[]): AgentMessage[] {
    const messages: AgentMessage[] = [];
    for (const plan of plans) {
        for (const operation of plan.operations) {
            if (operation.type !== "appendEntries") continue;
            for (const entry of operation.entries) {
                const message = messageFromEntry(entry);
                if (message !== undefined) messages.push(message);
            }
        }
    }
    return messages;
}

class InvocationAttemptInvalidatedError extends Error {
    constructor(readonly invocationId: string, readonly reason: Exclude<InvocationAttempt["invalidated"], null>) {
        super(`Invocation ${invocationId} attempt 已失效：${reason}`);
        this.name = "InvocationAttemptInvalidatedError";
    }
}

export class InvocationWriteFenceError extends Error {
    constructor(readonly invocationId: string) {
        super(`Invocation ${invocationId} write fence 已封闭`);
        this.name = "InvocationWriteFenceError";
    }
}

export class AbortBoundaryError extends Error {
    constructor(readonly invocationId: string, cause: unknown) {
        super(`Invocation ${invocationId} 在取消宽限期内无法完成 durable terminal：${cause instanceof Error ? cause.message : String(cause)}`);
        this.name = "AbortBoundaryError";
    }
}


async function withRunStage<T>(stage: string, action: () => Promise<T>): Promise<T> {
    try {
        return await action();
    } catch (error) {
        if (error instanceof RunStageError) throw error;
        throw new RunStageError(stage, error);
    }
}

class RunStageError extends Error {
    readonly stage: string;
    readonly cause: unknown;

    constructor(stage: string, cause: unknown) {
        super(cause instanceof Error ? cause.message : String(cause));
        this.name = "RunStageError";
        this.stage = stage;
        this.cause = cause;
    }
}


function toInvocationError(error: unknown, phase: string): InvocationError {
    if (error instanceof RunStageError) {
        const cause = error.cause;
        return {
            name: cause instanceof Error ? cause.name : "Error",
            message: error.message,
            phase: error.stage,
            retryable: cause instanceof SessionConflictError,
        };
    }
    if (error instanceof Error) {
        return {name: error.name, message: error.message, phase, retryable: error instanceof SessionConflictError};
    }
    return {name: "Error", message: String(error), phase};
}

function mergeEffects<TSessionId extends SessionId, THostContext extends JsonObject>(
    effects: readonly RuntimeEffect<TSessionId, THostContext>[],
): RuntimeEffect<TSessionId, THostContext> {
    const context = mergeContextMessageSections(...effects.map((effect) => effect.context));
    const runtimeMessages = effects.flatMap((effect) => effect.runtimeMessages ?? []);
    const writePlans = effects.flatMap((effect) => effect.writePlans ?? []);
    const output = effects.findLast((effect) => effect.output !== undefined)?.output;
    return {
        ...(Object.keys(context).length > 0 ? {context} : {}),
        ...(runtimeMessages.length > 0 ? {runtimeMessages} : {}),
        ...(writePlans.length > 0 ? {writePlans} : {}),
        ...(output !== undefined ? {output} : {}),
    };
}

function defined<TValue extends object>(value: TValue): Partial<TValue> {
    return Object.fromEntries(Object.entries(value).filter(([, item]) => item !== undefined)) as Partial<TValue>;
}

function validateResolvedProfileInitial<
    TSessionId extends SessionId,
    THostContext extends JsonObject,
    TModelConfig extends JsonValue,
>(
    profile: ResolvedProfile<TSessionId, THostContext, TModelConfig>,
    value: JsonValue,
): JsonValue {
    if (profile.validateInitial) {
        return profile.validateInitial(value);
    }
    return validateParsedSchemaValue({parse: (candidate) => profile.parseInitial(candidate)}, value);
}

function validateResolvedProfilePayload<
    TSessionId extends SessionId,
    THostContext extends JsonObject,
    TModelConfig extends JsonValue,
>(
    profile: ResolvedProfile<TSessionId, THostContext, TModelConfig>,
    value: JsonValue,
): JsonValue {
    if (profile.validatePayload) {
        return profile.validatePayload(value);
    }
    return validateParsedSchemaValue({parse: (candidate) => profile.parsePayload(candidate)}, value);
}

function assertMessageToolCallIdentities(
    messages: readonly AgentMessage[],
    message: Extract<AgentMessage, {role: "assistant"}>,
): void {
    const identities = new Set(messages.flatMap((candidate) => {
        return candidate.role === "assistant"
            ? assistantToolCalls(candidate).map((call) => call.id)
            : [];
    }));
    for (const call of assistantToolCalls(message)) {
        if (typeof call.id !== "string") {
            throw new Error("Model Runtime 返回的 Tool Call ID 必须是非空字符串");
        }
        if (!call.id.trim()) {
            throw new Error("Model Runtime 返回的 Tool Call ID 不能为空");
        }
        if (identities.has(call.id)) {
            throw new Error(`Model Runtime 返回重复 Tool Call ID：${call.id}`);
        }
        identities.add(call.id);
    }
}

function assertPreparedToolIdentities<
    TSessionId extends SessionId,
    THostContext extends JsonObject,
>(
    tools: readonly ToolDefinition<JsonValue, TSessionId, THostContext>[],
): void {
    const identities = new Set<string>();
    for (const tool of tools) {
        if (identities.has(tool.name)) {
            throw new Error(`PreparedRun 返回重复 Tool name：${tool.name}`);
        }
        identities.add(tool.name);
    }
}
