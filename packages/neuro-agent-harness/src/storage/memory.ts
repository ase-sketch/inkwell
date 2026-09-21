import {randomUUID} from "node:crypto";
import type {JsonObject} from "../json.js";
import {
    assertSessionCommitNotAborted,
    reduceSessionWritePlan,
    normalizeSessionSnapshot,
    SessionInvariantError,
    SessionNotFoundError,
    type InvocationRecord,
    type SessionCommitOptions,
    type SessionCommitResult,
    type SessionCreateInput,
    type SessionId,
    type SessionSnapshot,
    type SessionStore,
    type SessionWritePlan,
} from "../session.js";
import {reconcileInterruptedSession} from "./reconcile-interrupted.js";

/** Options for the deterministic in-memory Store Adapter. */
interface MemorySessionStoreBaseOptions<TSessionId extends SessionId> {
    readonly allocateId?: () => TSessionId;
    readonly now?: () => number;
    readonly entryId?: () => string;
}

/** Numeric IDs are built in; custom ID types must provide an explicit allocator. */
export type MemorySessionStoreOptions<TSessionId extends SessionId> = TSessionId extends number
    ? MemorySessionStoreBaseOptions<TSessionId> & {readonly idKind?: "number"}
    : Omit<MemorySessionStoreBaseOptions<TSessionId>, "allocateId"> & {readonly idKind: "custom"; readonly allocateId: () => TSessionId};

/** Memory Store used by tests, prototypes and custom Adapter contract suites. */
export class MemorySessionStore<
    TSessionId extends SessionId = number,
    THostContext extends JsonObject = JsonObject,
> implements SessionStore<TSessionId, THostContext> {
    private readonly sessions = new Map<TSessionId, SessionSnapshot<TSessionId, THostContext>>();
    private readonly queues = new Map<TSessionId, Promise<void>>();
    private readonly now: () => number;
    private readonly entryId: () => string;
    private readonly customAllocateId: (() => TSessionId) | undefined;
    private readonly idKind: "number" | "custom";
    private numericId = 0;

    constructor(options: MemorySessionStoreOptions<TSessionId> = {idKind: "number"} as MemorySessionStoreOptions<TSessionId>) {
        this.now = options.now ?? Date.now;
        this.entryId = options.entryId ?? randomUUID;
        // 条件 Options 已在公开 Interface 约束 custom ID allocator；这里恢复泛型函数类型。
        this.customAllocateId = options.allocateId as (() => TSessionId) | undefined;
        this.idKind = options.idKind ?? "number";
    }

    async allocateId(): Promise<TSessionId> {
        if (this.customAllocateId) {
            return this.customAllocateId();
        }
        if (this.idKind === "custom") {
            throw new SessionInvariantError("custom Memory Session ID 必须提供 allocateId");
        }
        this.numericId += 1;
        return this.numericId as TSessionId;
    }

    async create(input: SessionCreateInput<TSessionId, THostContext>): Promise<SessionSnapshot<TSessionId, THostContext>> {
        const sessionId = input.sessionId ?? await this.allocateId();
        assertSessionId(sessionId);
        if (this.sessions.has(sessionId)) {
            throw new SessionInvariantError(`Session ${String(sessionId)} 已存在`);
        }
        const snapshot: SessionSnapshot<TSessionId, THostContext> = {
            metadata: {
                sessionId,
                profileKey: input.profileKey,
                initial: structuredClone(input.initial),
                hostContext: structuredClone(input.hostContext),
                ...(input.title ? {title: input.title} : {}),
                ...(input.parentSessionId !== undefined ? {parentSessionId: input.parentSessionId} : {}),
                createdAt: this.now(),
            },
            version: 0,
            status: "idle",
            activeLeafId: null,
            activeInvocationId: null,
            entries: [],
            invocations: [],
        };
        this.sessions.set(sessionId, snapshot);
        return structuredClone(normalizeSessionSnapshot(snapshot));
    }

    async read(sessionId: TSessionId): Promise<SessionSnapshot<TSessionId, THostContext>> {
        const snapshot = this.sessions.get(sessionId);
        if (!snapshot) {
            throw new SessionNotFoundError(sessionId);
        }
        return structuredClone(normalizeSessionSnapshot(snapshot));
    }

    async commit(
        plan: SessionWritePlan<TSessionId, THostContext>,
        options?: SessionCommitOptions,
    ): Promise<SessionCommitResult<TSessionId, THostContext>> {
        return this.withLock(plan.target, async () => {
            assertSessionCommitNotAborted(plan.target, options);
            const current = this.sessions.get(plan.target);
            if (!current) {
                throw new SessionNotFoundError(plan.target);
            }
            const result = reduceSessionWritePlan(current, plan, {
                now: this.now,
                entryId: this.entryId,
            });
            this.sessions.set(plan.target, result.snapshot);
            return structuredClone(result);
        });
    }

    async reconcileInterrupted(): Promise<readonly InvocationRecord<TSessionId>[]> {
        const reconciled: InvocationRecord<TSessionId>[] = [];
        for (const sessionId of this.sessions.keys()) {
            const updated = await reconcileInterruptedSession(this, sessionId);
            if (updated) {
                reconciled.push(updated);
            }
        }
        return reconciled;
    }

    private async withLock<TResult>(sessionId: TSessionId, task: () => Promise<TResult>): Promise<TResult> {
        const previous = this.queues.get(sessionId) ?? Promise.resolve();
        let release!: () => void;
        const current = new Promise<void>((resolve) => {
            release = resolve;
        });
        const tail = previous.catch(() => undefined).then(() => current);
        this.queues.set(sessionId, tail);
        await previous.catch(() => undefined);
        try {
            return await task();
        } finally {
            release();
            if (this.queues.get(sessionId) === tail) {
                this.queues.delete(sessionId);
            }
        }
    }
}

function assertSessionId(sessionId: SessionId): void {
    if (typeof sessionId === "number" && (!Number.isInteger(sessionId) || sessionId <= 0)) {
        throw new SessionInvariantError("number Session ID 必须是正整数");
    }
    if (typeof sessionId === "string" && !sessionId.trim()) {
        throw new SessionInvariantError("string Session ID 不能为空");
    }
}
