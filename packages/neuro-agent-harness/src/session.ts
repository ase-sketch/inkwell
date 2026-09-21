import type {AgentCaller, MessageIdentity} from "./caller.js";
import type {ApprovalRequest} from "./approval.js";
import type {JsonObject, JsonValue} from "./json.js";

/** Session identity supported by custom Store Adapters. */
export type SessionId = string | number;

/** Session status projected from append-only facts and active Invocation state. */
export type SessionStatus = "idle" | "running" | "waiting" | "aborting" | "interrupted" | "archived";

/** Invocation status. Terminal values must never transition back to running. */
export type InvocationStatus = "running" | "waiting" | "completed" | "failed" | "aborted" | "interrupted";

/** Completed Invocation 的稳定终止原因。 */
export type InvocationTerminationReason = "tool_terminate" | "natural_stop" | "max_turns";

/** Structured error persisted for a failed Invocation. */
export interface InvocationError {
    readonly name: string;
    readonly message: string;
    readonly phase?: string;
    readonly retryable?: boolean;
}

/** Persistent Session metadata owned jointly by Core and the host Adapter. */
export interface SessionMetadata<
    TSessionId extends SessionId,
    THostContext extends JsonObject,
> {
    readonly sessionId: TSessionId;
    readonly profileKey: string;
    /** Parsed Value produced from SessionCreateInput.initial. */
    readonly initial: JsonValue;
    readonly hostContext: THostContext;
    readonly title?: string;
    readonly parentSessionId?: TSessionId;
    readonly createdAt: number;
}

/** Draft entry returned by Profile, Tool, Workflow or Core. */
export interface SessionEntryDraft {
    readonly kind: string;
    readonly payload: JsonValue;
    readonly invocationId?: string;
    /** undefined means append after the current active leaf. */
    readonly parentId?: string | null;
}

/** Persisted append-only Session entry. */
export interface SessionEntry extends SessionEntryDraft {
    readonly id: string;
    readonly parentId: string | null;
    readonly timestamp: number;
}

/** Persisted Invocation fact. */
export interface InvocationRecord<TSessionId extends SessionId> {
    readonly id: string;
    readonly sessionId: TSessionId;
    readonly profileKey: string;
    /** Missing values from older snapshots have effective Profile Version 1. */
    readonly profileVersion?: number;
    readonly caller: AgentCaller<TSessionId>;
    /** Missing values from older snapshots are treated as "user" at runtime boundaries. */
    readonly messageIdentity?: MessageIdentity;
    /** Parsed Value admitted for this Invocation; it is not raw caller input. */
    readonly input: JsonValue;
    readonly retryOf?: string;
    readonly status: InvocationStatus;
    readonly turnCount: number;
    /** 仅 completed Invocation 存在，用于恢复业务层的终止语义。 */
    readonly terminationReason?: InvocationTerminationReason;
    readonly output?: JsonValue;
    readonly error?: InvocationError;
    /** waiting 时存在；恢复成功或进入 terminal 后清除。 */
    readonly pendingApprovals?: readonly ApprovalRequest[];
    readonly createdAt: number;
    readonly finishedAt?: number;
}

/** Full persisted Session state returned by a Store Adapter. */
export interface SessionSnapshot<
    TSessionId extends SessionId = number,
    THostContext extends JsonObject = JsonObject,
> {
    readonly metadata: SessionMetadata<TSessionId, THostContext>;
    readonly version: number;
    readonly status: SessionStatus;
    readonly activeLeafId: string | null;
    readonly activeInvocationId: string | null;
    readonly entries: readonly SessionEntry[];
    readonly invocations: readonly InvocationRecord<TSessionId>[];
}

/** Input used by a Store to create a new Session. */
export interface SessionCreateInput<
    TSessionId extends SessionId,
    THostContext extends JsonObject,
> {
    readonly sessionId?: TSessionId;
    readonly profileKey: string;
    /** Raw external value parsed by the selected Profile before Store creation. */
    readonly initial: JsonValue;
    readonly hostContext: THostContext;
    readonly title?: string;
    readonly parentSessionId?: TSessionId;
}

/** One atomic append-only Session mutation. */
export type SessionWriteOperation<
    TSessionId extends SessionId,
    THostContext extends JsonObject,
> =
    | {
        readonly type: "appendEntries";
        readonly entries: readonly SessionEntryDraft[];
    }
    | {
        readonly type: "startInvocation";
        readonly invocation: Omit<InvocationRecord<TSessionId>, "status" | "turnCount" | "finishedAt" | "output" | "error" | "pendingApprovals">;
    }
    | {
        readonly type: "finishInvocation";
        readonly invocationId: string;
        readonly status: Extract<InvocationStatus, "completed" | "failed" | "aborted" | "interrupted">;
        readonly turnCount: number;
        /** completed 时必须存在，其他 terminal 状态不得携带。 */
        readonly terminationReason?: InvocationTerminationReason;
        readonly output?: JsonValue;
        readonly error?: InvocationError;
    }
    | {
        readonly type: "waitInvocation";
        readonly invocationId: string;
        readonly turnCount: number;
        readonly pendingApprovals: readonly ApprovalRequest[];
    }
    | {
        readonly type: "resumeInvocation";
        readonly invocationId: string;
    }
    | {
        /** Must remain compatible with the durable active Invocation; aborting is the only overlay state. */
        readonly type: "setStatus";
        readonly status: SessionStatus;
    }
    | {
        readonly type: "moveLeaf";
        readonly leafId: string | null;
    }
    | {
        readonly type: "setHostContext";
        readonly hostContext: THostContext;
    };

/** Stable write contract used by Core and custom Store Adapters. */
export interface SessionWritePlan<
    TSessionId extends SessionId = number,
    THostContext extends JsonObject = JsonObject,
> {
    readonly target: TSessionId;
    /** 省略表示 Adapter 在自己的串行或事务语义下应用到最新版本。 */
    readonly expectedVersion?: number;
    /** 仅用于 CAS 冲突诊断；与 expectedVersion 一起从同一观察点传递。 */
    readonly expectedActiveLeafId?: string | null;
    /** 省略表示不检查；null 要求没有 active Invocation，字符串要求精确匹配。 */
    readonly expectedActiveInvocationId?: string | null;
    readonly cause: string;
    readonly durability?: "immediate" | "savePoint";
    readonly operations: readonly SessionWriteOperation<TSessionId, THostContext>[];
}

/** Result of one successful Store commit. */
export interface SessionCommitResult<
    TSessionId extends SessionId,
    THostContext extends JsonObject,
> {
    readonly snapshot: SessionSnapshot<TSessionId, THostContext>;
    readonly entries: readonly SessionEntry[];
}

/** Runtime-only cancellation guard for a Store commit; it is never persisted. */
export interface SessionCommitOptions {
    readonly signal?: AbortSignal;
}

/** Raised when a Store observes cancellation before its durable write boundary. */
export class SessionCommitAbortedError extends Error {
    constructor(readonly sessionId: SessionId) {
        super(`Session ${String(sessionId)} commit 已取消`);
        this.name = "SessionCommitAbortedError";
    }
}

export function assertSessionCommitNotAborted(
    sessionId: SessionId,
    options?: SessionCommitOptions,
): void {
    if (options?.signal?.aborted) {
        throw new SessionCommitAbortedError(sessionId);
    }
}

/** Durable commit notification consumed by materialized views and Workflow schedulers. */
export interface SessionCommitNotification<
    TSessionId extends SessionId = number,
    THostContext extends JsonObject = JsonObject,
> {
    readonly plan: SessionWritePlan<TSessionId, THostContext>;
    readonly result: SessionCommitResult<TSessionId, THostContext>;
}

/** Derived-state observer. It runs after durability and therefore cannot veto a commit. */
export interface SessionCommitObserver<
    TSessionId extends SessionId = number,
    THostContext extends JsonObject = JsonObject,
> {
    readonly name: string;
    afterCommit(notification: SessionCommitNotification<TSessionId, THostContext>): void | Promise<void>;
}

/** Storage Seam implemented by Memory, JSONL and future Prisma Adapters. */
export interface SessionStore<
    TSessionId extends SessionId = number,
    THostContext extends JsonObject = JsonObject,
> {
    /**
     * Adapter 的 read/create 返回的 Snapshot 必须已通过
     * `normalizeSessionSnapshot`（第一方 Memory/JSONL 在边界内执行）；
     * Core 的 admission（entry graph、Invocation/approval coherence）依赖
     * 该合同，违反它的第三方 Adapter 会在安全边界（如 approval resume）
     * 被防御性归一化拒绝，而不是静默绕过。
     */
    allocateId(): Promise<TSessionId>;
    create(input: SessionCreateInput<TSessionId, THostContext>): Promise<SessionSnapshot<TSessionId, THostContext>>;
    read(sessionId: TSessionId): Promise<SessionSnapshot<TSessionId, THostContext>>;
    commit(
        plan: SessionWritePlan<TSessionId, THostContext>,
        options?: SessionCommitOptions,
    ): Promise<SessionCommitResult<TSessionId, THostContext>>;
    /** Marks observed active running Invocations interrupted; returns only transitions committed by this call. */
    reconcileInterrupted(): Promise<readonly InvocationRecord<TSessionId>[]>;
    dispose?(): Promise<void>;
}

/** Applies additive compatibility defaults at the Store boundary without changing provider messages. */
export function normalizeSessionSnapshot<
    TSessionId extends SessionId,
    THostContext extends JsonObject,
>(
    snapshot: SessionSnapshot<TSessionId, THostContext>,
): SessionSnapshot<TSessionId, THostContext> {
    // 缺失的 activeInvocationId 与 legacy 可选字段一样按 null 归一，
    // 避免 admission 报出 "active Invocation undefined 不存在" 的误导消息。
    const snapshotWithDefaults: SessionSnapshot<TSessionId, THostContext> = {
        ...snapshot,
        activeInvocationId: snapshot.activeInvocationId ?? null,
    };
    assertSessionEntryGraph(snapshotWithDefaults);
    assertSessionInvocationCoherence(snapshotWithDefaults);
    return {
        ...snapshotWithDefaults,
        entries: snapshotWithDefaults.entries.map((entry) => normalizeSessionEntry(entry)),
        invocations: snapshotWithDefaults.invocations.map((invocation) => ({
            ...invocation,
            profileVersion: invocationProfileVersion(invocation),
            messageIdentity: invocation.messageIdentity ?? "user",
        })),
    };
}

/** 读侧 admission：拒绝 reducer 永远无法产生的矛盾 Invocation/Session 状态组合。 */
function assertSessionInvocationCoherence<
    TSessionId extends SessionId,
    THostContext extends JsonObject,
>(snapshot: SessionSnapshot<TSessionId, THostContext>): void {
    const activeId = snapshot.activeInvocationId;
    const ids = new Set<string>();
    let active: InvocationRecord<TSessionId> | undefined;
    for (const invocation of snapshot.invocations) {
        if (ids.has(invocation.id)) {
            throw new SessionInvariantError(`Invocation ${invocation.id} 重复`);
        }
        ids.add(invocation.id);
        if (invocation.id === activeId) {
            active = invocation;
        }
    }
    if (activeId !== null && active === undefined) {
        throw new SessionInvariantError(`active Invocation ${activeId} 不存在`);
    }
    if (active !== undefined && active.status !== "running" && active.status !== "waiting") {
        throw new SessionInvariantError(
            `active Invocation ${active.id} 状态为 ${active.status}，不能作为 active owner`,
        );
    }
    for (const invocation of snapshot.invocations) {
        if (invocation.id === activeId) continue;
        if (invocation.status === "running" || invocation.status === "waiting") {
            throw new SessionInvariantError(`非 active Invocation ${invocation.id} 不能是 ${invocation.status}`);
        }
    }
    if (activeId === null) {
        if (snapshot.status === "running" || snapshot.status === "waiting" || snapshot.status === "aborting") {
            throw new SessionInvariantError(`Session 状态 ${snapshot.status} 必须有 active Invocation`);
        }
        return;
    }
    if (snapshot.status === "idle" || snapshot.status === "interrupted" || snapshot.status === "archived") {
        throw new SessionInvariantError(`Session 状态 ${snapshot.status} 不能有 active Invocation`);
    }
    if (active !== undefined
        && ((snapshot.status === "running" && active.status !== "running")
            || (snapshot.status === "waiting" && active.status !== "waiting"))) {
        throw new SessionInvariantError(
            `Session 状态 ${snapshot.status} 与 active Invocation ${active.id} 状态 ${active.status} 不一致`,
        );
    }
    for (const invocation of snapshot.invocations) {
        if (invocation.status !== "waiting") continue;
        const approvals = invocation.pendingApprovals;
        if (approvals === undefined || approvals.length === 0) {
            throw new SessionInvariantError(`waiting Invocation ${invocation.id} 必须包含 pending approval`);
        }
        const requestIds = new Set<string>();
        for (const request of approvals) {
            if (requestIds.has(request.toolCallId)) {
                throw new SessionInvariantError(
                    `Invocation ${invocation.id} pendingApprovals 包含重复 toolCallId ${request.toolCallId}`,
                );
            }
            requestIds.add(request.toolCallId);
        }
        if (!Number.isInteger(invocation.turnCount) || invocation.turnCount < 0) {
            throw new SessionInvariantError(`waiting Invocation ${invocation.id} turnCount 必须是非负整数`);
        }
        let maxTurn = -1;
        for (const entry of activeSessionPath(snapshot)) {
            if (entry.kind !== "agent.message" || entry.invocationId !== invocation.id) continue;
            const turn = (entry.payload as {turn?: unknown} | null | undefined)?.turn;
            if (typeof turn === "number" && Number.isInteger(turn) && turn > maxTurn) {
                maxTurn = turn;
            }
        }
        if (maxTurn > invocation.turnCount) {
            throw new SessionInvariantError(
                `waiting Invocation ${invocation.id} turnCount 回退（已提交最大 turn ${maxTurn}）`,
            );
        }
    }
}

/** Returns the append-only entries on the currently selected branch. */
export function activeSessionPath<
    TSessionId extends SessionId,
    THostContext extends JsonObject,
>(snapshot: SessionSnapshot<TSessionId, THostContext>): SessionEntry[] {
    const entries = assertSessionEntryGraph(snapshot);
    if (!snapshot.activeLeafId) {
        return [];
    }
    const path: SessionEntry[] = [];
    let cursor: string | null = snapshot.activeLeafId;
    while (cursor) {
        const entry = entries.get(cursor);
        if (!entry) throw new SessionInvariantError(`active path entry ${cursor} 不存在`);
        path.push(entry);
        cursor = entry.parentId;
    }
    return path.reverse();
}

/** Thrown when optimistic Session version validation fails. */
export class SessionConflictError extends Error {
    readonly expectedActiveLeafId: string | null | undefined;
    readonly actualActiveLeafId: string | null | undefined;

    constructor(
        readonly sessionId: SessionId,
        readonly expectedVersion: number,
        readonly actualVersion: number,
        anchor?: {
            readonly expectedActiveLeafId: string | null;
            readonly actualActiveLeafId: string | null;
        },
    ) {
        super([
            `Session ${String(sessionId)} version 冲突：expected=${expectedVersion}, actual=${actualVersion}`,
            anchor ? `expectedLeaf=${String(anchor.expectedActiveLeafId)}, actualLeaf=${String(anchor.actualActiveLeafId)}` : undefined,
        ].filter((part): part is string => part !== undefined).join(", "));
        this.name = "SessionConflictError";
        this.expectedActiveLeafId = anchor?.expectedActiveLeafId;
        this.actualActiveLeafId = anchor?.actualActiveLeafId;
    }
}

/** Thrown when a Session cannot be found. */
export class SessionNotFoundError extends Error {
    constructor(readonly sessionId: SessionId) {
        super(`Session ${String(sessionId)} 不存在`);
        this.name = "SessionNotFoundError";
    }
}

/** Thrown when an append-only lifecycle invariant is violated. */
export class SessionInvariantError extends Error {
    constructor(message: string) {
        super(message);
        this.name = "SessionInvariantError";
    }
}

/** Returns the durable Profile Version, including the legacy version-1 default. */
export function invocationProfileVersion<TSessionId extends SessionId>(
    invocation: Pick<InvocationRecord<TSessionId>, "id" | "profileVersion">,
): number {
    const version = invocation.profileVersion === undefined ? 1 : invocation.profileVersion;
    if (!Number.isInteger(version) || version <= 0) {
        throw new SessionInvariantError(`Invocation ${invocation.id} profileVersion 必须是正整数`);
    }
    return version;
}

/** 同一 Session 已存在 active Invocation。 */
export class InvocationConflictError extends Error {
    readonly sessionId: SessionId;
    readonly invocationId: string | undefined;

    constructor(sessionId: SessionId, invocationId?: string) {
        super(`Session ${String(sessionId)} 已有 active Invocation${invocationId !== undefined ? `：${invocationId}` : ""}`);
        this.name = "InvocationConflictError";
        this.sessionId = sessionId;
        this.invocationId = invocationId;
    }
}

/** Invocation-owned 写入的 durable owner 条件不匹配。 */
export class InvocationOwnershipError extends Error {
    constructor(
        readonly sessionId: SessionId,
        readonly expectedActiveInvocationId: string | null,
        readonly actualActiveInvocationId: string | null,
    ) {
        super(`Session ${String(sessionId)} Invocation owner 冲突：expected=${String(expectedActiveInvocationId)}, actual=${String(actualActiveInvocationId)}`);
        this.name = "InvocationOwnershipError";
    }
}

/** 目标 Invocation 当前状态不允许 retry。 */
export class InvocationNotRetryableError extends Error {
    readonly invocationId: string;
    readonly status: InvocationStatus;

    constructor(invocationId: string, status: InvocationStatus) {
        super(`Invocation ${invocationId} 状态为 ${status}，不能 retry`);
        this.name = "InvocationNotRetryableError";
        this.invocationId = invocationId;
        this.status = status;
    }
}

/** Dependencies used by Store Adapters while applying one plan. */
export interface SessionReducerDependencies {
    readonly now: () => number;
    readonly entryId: () => string;
}

/** Pure append-only reducer shared by Memory and JSONL Store Adapters. */
export function reduceSessionWritePlan<
    TSessionId extends SessionId,
    THostContext extends JsonObject,
>(
    current: SessionSnapshot<TSessionId, THostContext>,
    plan: SessionWritePlan<TSessionId, THostContext>,
    dependencies: SessionReducerDependencies,
): SessionCommitResult<TSessionId, THostContext> {
    const isSingleStartInvocationPlan = plan.operations.length === 1 && plan.operations[0]?.type === "startInvocation";
    if (plan.expectedActiveInvocationId !== undefined
        && !(isSingleStartInvocationPlan && plan.expectedActiveInvocationId === null)
        && current.activeInvocationId !== plan.expectedActiveInvocationId) {
        throw new InvocationOwnershipError(plan.target, plan.expectedActiveInvocationId, current.activeInvocationId);
    }
    if (plan.expectedVersion !== undefined && current.version !== plan.expectedVersion) {
        throw new SessionConflictError(plan.target, plan.expectedVersion, current.version, plan.expectedActiveLeafId === undefined ? undefined : {
            expectedActiveLeafId: plan.expectedActiveLeafId,
            actualActiveLeafId: current.activeLeafId,
        });
    }
    if (!plan.cause.trim()) {
        throw new SessionInvariantError("SessionWritePlan.cause 不能为空");
    }
    if (current.status === "aborting" && !allowsPlanDuringAborting(current, plan)) {
        throw new SessionInvariantError(`Session ${String(plan.target)} 正在 aborting，不能接受迟到写入`);
    }

    let metadata = current.metadata;
    let status = current.status;
    let activeLeafId = current.activeLeafId;
    let activeInvocationId = current.activeInvocationId;
    const entries = [...current.entries];
    const entriesById = assertSessionEntryGraph(current);
    const invocations = current.invocations.map((invocation) => ({
        ...invocation,
        profileVersion: invocationProfileVersion(invocation),
        messageIdentity: invocation.messageIdentity ?? "user",
    }));
    const appended: SessionEntry[] = [];

    for (const operation of plan.operations) {
        if (operation.type === "appendEntries") {
            for (const draft of operation.entries) {
                const normalizedDraft = normalizeSessionEntryDraft(draft);
                const parentId = normalizedDraft.parentId === undefined ? activeLeafId : normalizedDraft.parentId;
                if (parentId !== null && (typeof parentId !== "string" || !parentId.trim())) {
                    throw new SessionInvariantError("Entry parent 不能为空");
                }
                if (parentId !== null && !entriesById.has(parentId)) {
                    throw new SessionInvariantError(`Entry parent ${parentId} 不存在`);
                }
                const entryId = dependencies.entryId();
                if (typeof entryId !== "string" || !entryId.trim()) {
                    throw new SessionInvariantError("Entry ID 不能为空");
                }
                if (entriesById.has(entryId)) {
                    throw new SessionInvariantError(`Entry ID ${entryId} 已存在`);
                }
                const entry: SessionEntry = {
                    ...normalizedDraft,
                    id: entryId,
                    parentId,
                    timestamp: dependencies.now(),
                };
                entries.push(entry);
                entriesById.set(entry.id, entry);
                appended.push(entry);
                activeLeafId = entry.id;
            }
            continue;
        }
        if (operation.type === "startInvocation") {
            if (activeInvocationId !== null) {
                throw new InvocationConflictError(plan.target, activeInvocationId);
            }
            if (invocations.some((item) => item.id === operation.invocation.id)) {
                throw new SessionInvariantError(`Invocation ${operation.invocation.id} 已存在`);
            }
            invocations.push({
                ...operation.invocation,
                profileVersion: invocationProfileVersion(operation.invocation),
                messageIdentity: operation.invocation.messageIdentity ?? "user",
                status: "running",
                turnCount: 0,
            });
            activeInvocationId = operation.invocation.id;
            status = "running";
            continue;
        }
        if (operation.type === "finishInvocation") {
            const index = invocations.findIndex((item) => item.id === operation.invocationId);
            const invocation = invocations[index];
            if (!invocation) {
                throw new SessionInvariantError(`Invocation ${operation.invocationId} 不存在`);
            }
            if (invocation.status !== "running" && invocation.status !== "waiting") {
                throw new SessionInvariantError(`terminal Invocation ${operation.invocationId} 不得再次完成`);
            }
            if (operation.status === "completed" && operation.terminationReason === undefined) {
                throw new SessionInvariantError(`completed Invocation ${operation.invocationId} 必须包含 terminationReason`);
            }
            if (operation.status !== "completed" && operation.terminationReason !== undefined) {
                throw new SessionInvariantError(`非 completed Invocation ${operation.invocationId} 不得包含 terminationReason`);
            }
            const {pendingApprovals: _pendingApprovals, ...terminalInvocation} = invocation;
            invocations[index] = {
                ...terminalInvocation,
                status: operation.status,
                turnCount: operation.turnCount,
                ...(operation.terminationReason ? {terminationReason: operation.terminationReason} : {}),
                ...(operation.output !== undefined ? {output: operation.output} : {}),
                ...(operation.error ? {error: operation.error} : {}),
                finishedAt: dependencies.now(),
            };
            activeInvocationId = null;
            status = operation.status === "interrupted" ? "interrupted" : "idle";
            continue;
        }
        if (operation.type === "waitInvocation") {
            const index = invocations.findIndex((item) => item.id === operation.invocationId);
            const invocation = invocations[index];
            if (!invocation || invocation.status !== "running") {
                throw new SessionInvariantError(`只有 running Invocation 可以进入 waiting：${operation.invocationId}`);
            }
            if (operation.pendingApprovals.length === 0) {
                throw new SessionInvariantError("waiting Invocation 必须包含 pending approval");
            }
            const requestIds = new Set<string>();
            for (const request of operation.pendingApprovals) {
                if (requestIds.has(request.toolCallId)) {
                    throw new SessionInvariantError(
                        `Invocation ${operation.invocationId} pendingApprovals 包含重复 toolCallId ${request.toolCallId}`,
                    );
                }
                requestIds.add(request.toolCallId);
            }
            if (!Number.isInteger(operation.turnCount) || operation.turnCount < 0) {
                throw new SessionInvariantError(`waiting Invocation ${operation.invocationId} turnCount 必须是非负整数`);
            }
            let maxTurn = -1;
            if (activeLeafId !== null) {
                const byId = new Map(entries.map((entry) => [entry.id, entry]));
                let cursor: string | null = activeLeafId;
                while (cursor) {
                    const entry = byId.get(cursor);
                    if (!entry) break;
                    if (entry.kind === "agent.message" && entry.invocationId === operation.invocationId) {
                        const turn = (entry.payload as {turn?: unknown} | null | undefined)?.turn;
                        if (typeof turn === "number" && Number.isInteger(turn) && turn > maxTurn) {
                            maxTurn = turn;
                        }
                    }
                    cursor = entry.parentId;
                }
            }
            if (maxTurn > operation.turnCount) {
                throw new SessionInvariantError(
                    `waiting Invocation ${operation.invocationId} turnCount 回退（已提交最大 turn ${maxTurn}）`,
                );
            }
            invocations[index] = {...invocation, status: "waiting", turnCount: operation.turnCount, pendingApprovals: operation.pendingApprovals};
            status = "waiting";
            continue;
        }
        if (operation.type === "resumeInvocation") {
            const index = invocations.findIndex((item) => item.id === operation.invocationId);
            const invocation = invocations[index];
            if (!invocation || invocation.status !== "waiting") {
                throw new SessionInvariantError(`只有 waiting Invocation 可以恢复：${operation.invocationId}`);
            }
            const {pendingApprovals: _pendingApprovals, ...resumedInvocation} = invocation;
            invocations[index] = {...resumedInvocation, status: "running"};
            activeInvocationId = invocation.id;
            status = "running";
            continue;
        }
        if (operation.type === "setStatus") {
            if (activeInvocationId !== null) {
                const activeInvocation = invocations.find((invocation) => invocation.id === activeInvocationId);
                if (!activeInvocation
                    || (activeInvocation.status !== "running" && activeInvocation.status !== "waiting")
                    || (operation.status !== activeInvocation.status && operation.status !== "aborting")) {
                    throw new SessionInvariantError(
                        `active Invocation ${activeInvocationId} 与 Session Status ${operation.status} 不一致`,
                    );
                }
            }
            if (activeInvocationId === null
                && (operation.status === "running" || operation.status === "waiting" || operation.status === "aborting")) {
                throw new SessionInvariantError(`没有 active Invocation 时 Session Status 不能是 ${operation.status}`);
            }
            status = operation.status;
            continue;
        }
        if (operation.type === "moveLeaf") {
            if (operation.leafId !== null && !entries.some((entry) => entry.id === operation.leafId)) {
                throw new SessionInvariantError(`leaf ${operation.leafId} 不存在`);
            }
            activeLeafId = operation.leafId;
            continue;
        }
        metadata = {...metadata, hostContext: operation.hostContext};
    }

    return {
        snapshot: {
            metadata,
            version: current.version + 1,
            status,
            activeLeafId,
            activeInvocationId,
            entries,
            invocations,
        },
        entries: appended,
    };
}

function assertSessionEntryGraph<
    TSessionId extends SessionId,
    THostContext extends JsonObject,
>(
    snapshot: SessionSnapshot<TSessionId, THostContext>,
): Map<string, SessionEntry> {
    const entries = new Map<string, SessionEntry>();
    for (const entry of snapshot.entries) {
        if (typeof entry.id !== "string" || !entry.id.trim()) {
            throw new SessionInvariantError("Entry ID 不能为空");
        }
        if (entries.has(entry.id)) {
            throw new SessionInvariantError(`Entry ID ${entry.id} 重复`);
        }
        if (entry.parentId !== null && (typeof entry.parentId !== "string" || !entry.parentId.trim())) {
            throw new SessionInvariantError("Entry parent 不能为空");
        }
        entries.set(entry.id, entry);
    }
    if (snapshot.activeLeafId !== null && !entries.has(snapshot.activeLeafId)) {
        throw new SessionInvariantError(`active leaf ${snapshot.activeLeafId} 不存在`);
    }
    const settled = new Set<string>();
    for (const entry of entries.values()) {
        if (settled.has(entry.id)) continue;
        const path: string[] = [];
        let cursor: string | null = entry.id;
        const visiting = new Set<string>();
        while (cursor !== null && !settled.has(cursor)) {
            if (visiting.has(cursor)) {
                throw new SessionInvariantError(`Entry parent cycle detected at ${cursor}`);
            }
            visiting.add(cursor);
            path.push(cursor);
            const current = entries.get(cursor);
            if (!current) {
                throw new SessionInvariantError(`Entry parent ${cursor} 不存在`);
            }
            cursor = current.parentId;
        }
        for (const id of path) settled.add(id);
    }
    return entries;
}

function allowsPlanDuringAborting<
    TSessionId extends SessionId,
    THostContext extends JsonObject,
>(
    current: SessionSnapshot<TSessionId, THostContext>,
    plan: SessionWritePlan<TSessionId, THostContext>,
): boolean {
    if (plan.operations.length === 1 && plan.operations[0]?.type === "setStatus") {
        return true;
    }
    const terminal = plan.operations[0];
    if (terminal?.type !== "finishInvocation"
        || terminal.status !== "aborted"
        || terminal.invocationId !== current.activeInvocationId) {
        return false;
    }
    return plan.operations.slice(1).every((operation) => {
        return operation.type === "appendEntries"
            && operation.entries.every((entry) => {
                return entry.invocationId === terminal.invocationId
                    && (entry.kind === "harness.invocation.usage" || entry.kind === "harness.invocation.partial");
            });
    });
}

function normalizeSessionEntry(entry: SessionEntry): SessionEntry {
    return {
        ...entry,
        payload: normalizeSessionEntryPayload(entry.kind, entry.payload),
    };
}

function normalizeSessionEntryDraft(entry: SessionEntryDraft): SessionEntryDraft {
    return {
        ...entry,
        payload: normalizeSessionEntryPayload(entry.kind, entry.payload),
    };
}

function normalizeSessionEntryPayload(kind: string, payload: JsonValue): JsonValue {
    if (kind !== "agent.message" || payload === null || typeof payload !== "object" || Array.isArray(payload)) {
        return payload;
    }
    const message = payload.message;
    if (message === null || typeof message !== "object" || Array.isArray(message) || message.role !== "user") {
        return payload;
    }
    return {
        ...payload,
        messageIdentity: payload.messageIdentity === "system" ? "system" : "user",
    };
}
