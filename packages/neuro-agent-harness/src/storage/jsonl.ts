import {appendFile, mkdir, readFile, readdir, truncate, writeFile} from "node:fs/promises";
import {dirname, join} from "node:path";
import {randomUUID} from "node:crypto";
import type {JsonObject} from "../json.js";
import {withJsonlSessionLock, type JsonlSessionLock} from "./jsonl-lock.js";
export {
    JsonlLockBusyError,
    JsonlLockCorruptError,
    JsonlLockError,
    JsonlLockIoError,
    JsonlLockLostError,
} from "./jsonl-lock.js";
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
    type SessionEntry,
    type SessionMetadata,
    type SessionStatus,
    type SessionSnapshot,
    type SessionStore,
    type SessionWritePlan,
} from "../session.js";
import {reconcileInterruptedSession} from "./reconcile-interrupted.js";

type JsonlSnapshotRecord<THostContext extends JsonObject> = {
    readonly kind: "snapshot";
    readonly cause: string;
    readonly snapshot: SessionSnapshot<number, THostContext>;
    readonly appendedEntryIds: readonly string[];
};

type JsonlCommitRecord<THostContext extends JsonObject> = {
    readonly kind: "commit";
    readonly cause: string;
    readonly version: number;
    readonly metadata: SessionMetadata<number, THostContext>;
    readonly status: SessionStatus;
    readonly activeLeafId: string | null;
    readonly activeInvocationId: string | null;
    readonly appendedEntries: readonly SessionEntry[];
    readonly invocations: readonly InvocationRecord<number>[];
};

type JsonlRecord<THostContext extends JsonObject> = JsonlSnapshotRecord<THostContext> | JsonlCommitRecord<THostContext>;

type JsonlReadState<THostContext extends JsonObject> = {
    readonly snapshot: SessionSnapshot<number, THostContext>;
    readonly repairTailOffset: number | undefined;
    readonly needsSeparator: boolean;
};

type JsonlLine = {
    readonly start: number;
    readonly text: string;
};

/** JSONL Store options. Each Session is one append-only file. */
export interface JsonlSessionStoreOptions {
    readonly directory: string;
    readonly now?: () => number;
    readonly entryId?: () => string;
    /** 1 保持每次完整 Snapshot；大于 1 时中间写 delta，并按间隔写 checkpoint。 */
    readonly checkpointEvery?: number;
}

/** Strict canonical positive-decimal session file name; rejects leading zeros and exponent forms. */
function numericSessionFileName(name: string): number | undefined {
    const stem = name.endsWith(".jsonl") ? name.slice(0, -".jsonl".length) : undefined;
    if (stem === undefined || !/^[1-9]\d*$/.test(stem)) return undefined;
    return Number(stem);
}

/** First-party append-only JSONL Adapter with positive numeric Session IDs. */
export class JsonlSessionStore<THostContext extends JsonObject = JsonObject> implements SessionStore<number, THostContext> {
    private readonly directory: string;
    private readonly now: () => number;
    private readonly entryId: () => string;
    private readonly checkpointEvery: number;
    private readonly queues = new Map<number, Promise<void>>();
    private sequenceTail: Promise<void> = Promise.resolve();

    constructor(options: JsonlSessionStoreOptions) {
        if (!options.directory.trim()) {
            throw new Error("JSONL directory 不能为空");
        }
        this.directory = options.directory;
        this.now = options.now ?? Date.now;
        this.entryId = options.entryId ?? randomUUID;
        this.checkpointEvery = options.checkpointEvery ?? 1;
        if (!Number.isInteger(this.checkpointEvery) || this.checkpointEvery <= 0) {
            throw new Error("JSONL checkpointEvery 必须是正整数");
        }
    }

    async allocateId(): Promise<number> {
        return this.updateSessionSequence((current) => current + 1);
    }

    async create(input: SessionCreateInput<number, THostContext>): Promise<SessionSnapshot<number, THostContext>> {
        const explicitSessionId = input.sessionId;
        if (explicitSessionId !== undefined) {
            assertPositiveSessionId(explicitSessionId);
            await this.updateSessionSequence((current) => Math.max(current, explicitSessionId));
            const created = await this.tryCreate(explicitSessionId, input);
            if (!created) {
                throw new SessionInvariantError(`Session ${explicitSessionId} 已存在`);
            }
            return created;
        }
        while (true) {
            const sessionId = await this.allocateId();
            const created = await this.tryCreate(sessionId, input);
            if (created) {
                return created;
            }
        }
    }

    private async tryCreate(
        sessionId: number,
        input: SessionCreateInput<number, THostContext>,
    ): Promise<SessionSnapshot<number, THostContext> | undefined> {
        const path = this.sessionPath(sessionId);
        return this.withLock(sessionId, async (lock) => {
            await lock.assertOwnedOnDisk();
            const snapshot: SessionSnapshot<number, THostContext> = {
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
            const record: JsonlSnapshotRecord<THostContext> = {
                kind: "snapshot",
                cause: "session.create",
                snapshot,
                appendedEntryIds: [],
            };
            await lock.assertOwnedOnDisk();
            try {
                await writeFile(path, `${JSON.stringify(record)}\n`, {encoding: "utf8", flag: "wx"});
            } catch (error) {
                if (readErrorCode(error) === "EEXIST") {
                    return undefined;
                }
                throw error;
            }
            return structuredClone(snapshot);
        });
    }

    private async updateSessionSequence(update: (current: number) => number): Promise<number> {
        const previous = this.sequenceTail;
        let release!: () => void;
        this.sequenceTail = new Promise<void>((resolve) => {
            release = resolve;
        });
        await previous.catch(() => undefined);
        try {
            await mkdir(this.directory, {recursive: true});
            const sequencePath = join(this.directory, "session-seq.json");
            return await withJsonlSessionLock(`${sequencePath}.lock`, async (lock) => {
                await lock.assertOwnedOnDisk();
                const current = await readSessionSequence(sequencePath);
                const next = update(current);
                if (!Number.isSafeInteger(next) || next < current) {
                    throw new SessionInvariantError("JSONL Session sequence 无效");
                }
                if (next !== current) {
                    await lock.assertOwnedOnDisk();
                    await writeFile(sequencePath, `${JSON.stringify({value: next})}\n`, "utf8");
                }
                return next;
            });
        } finally {
            release();
        }
    }

    async read(sessionId: number): Promise<SessionSnapshot<number, THostContext>> {
        assertPositiveSessionId(sessionId);
        return structuredClone(await this.readSnapshot(sessionId));
    }

    async commit(
        plan: SessionWritePlan<number, THostContext>,
        options?: SessionCommitOptions,
    ): Promise<SessionCommitResult<number, THostContext>> {
        assertPositiveSessionId(plan.target);
        return this.withLock(plan.target, async (lock) => {
            assertSessionCommitNotAborted(plan.target, options);
            await lock.assertOwnedOnDisk();
            const readState = await this.readSnapshotState(plan.target);
            const current = readState.snapshot;
            assertSessionCommitNotAborted(plan.target, options);
            const result = reduceSessionWritePlan(current, plan, {
                now: this.now,
                entryId: this.entryId,
            });
            assertSessionCommitNotAborted(plan.target, options);
            const record: JsonlRecord<THostContext> = this.checkpointEvery === 1 || result.snapshot.version % this.checkpointEvery === 0
                ? {
                    kind: "snapshot",
                    cause: plan.cause,
                    snapshot: result.snapshot,
                    appendedEntryIds: result.entries.map((entry) => entry.id),
                }
                : {
                    kind: "commit",
                    cause: plan.cause,
                    version: result.snapshot.version,
                    metadata: result.snapshot.metadata,
                    status: result.snapshot.status,
                    activeLeafId: result.snapshot.activeLeafId,
                    activeInvocationId: result.snapshot.activeInvocationId,
                    appendedEntries: result.entries,
                    invocations: result.snapshot.invocations,
                };
            await lock.assertOwnedOnDisk();
            assertSessionCommitNotAborted(plan.target, options);
            if (readState.repairTailOffset !== undefined) {
                await truncate(this.sessionPath(plan.target), readState.repairTailOffset);
                await lock.assertOwnedOnDisk();
                assertSessionCommitNotAborted(plan.target, options);
            }
            const separator = readState.repairTailOffset === undefined && readState.needsSeparator ? "\n" : "";
            assertSessionCommitNotAborted(plan.target, options);
            await appendFile(this.sessionPath(plan.target), `${separator}${JSON.stringify(record)}\n`, "utf8");
            return structuredClone(result);
        });
    }

    async reconcileInterrupted(): Promise<readonly InvocationRecord<number>[]> {
        const sessionsDirectory = join(this.directory, "sessions");
        const files = await readdir(sessionsDirectory, {withFileTypes: true}).catch((error: unknown) => {
            if (readErrorCode(error) === "ENOENT") {
                return [];
            }
            throw error;
        });
        const reconciled: InvocationRecord<number>[] = [];
        for (const file of files) {
            if (!file.isFile() || !file.name.endsWith(".jsonl")) {
                continue;
            }
            const sessionId = numericSessionFileName(file.name);
            if (sessionId === undefined) {
                continue;
            }
            const updated = await reconcileInterruptedSession(this, sessionId);
            if (updated) {
                reconciled.push(updated);
            }
        }
        return reconciled;
    }

    /** Lists positive numeric Session IDs currently backed by files (host-driven restart recovery). */
    async listSessionIds(): Promise<number[]> {
        const sessionsDirectory = join(this.directory, "sessions");
        const files = await readdir(sessionsDirectory, {withFileTypes: true}).catch((error: unknown) => {
            if (readErrorCode(error) === "ENOENT") {
                return [];
            }
            throw error;
        });
        const ids = new Set<number>();
        for (const file of files) {
            if (!file.isFile() || !file.name.endsWith(".jsonl")) {
                continue;
            }
            const sessionId = numericSessionFileName(file.name);
            if (sessionId !== undefined) ids.add(sessionId);
        }
        return [...ids].sort((a, b) => a - b);
    }

    private async readSnapshot(sessionId: number): Promise<SessionSnapshot<number, THostContext>> {
        return (await this.readSnapshotState(sessionId)).snapshot;
    }

    private async readSnapshotState(sessionId: number): Promise<JsonlReadState<THostContext>> {
        const path = this.sessionPath(sessionId);
        const bytes = await readFile(path).catch((error: NodeJS.ErrnoException) => {
            if (error.code === "ENOENT") {
                throw new SessionNotFoundError(sessionId);
            }
            throw error;
        });
        const lines = splitJsonlLines(bytes);
        let lastNonEmptyLine = -1;
        for (let index = 0; index < lines.length; index += 1) {
            if (lines[index]!.text) {
                lastNonEmptyLine = index;
            }
        }
        let snapshot: SessionSnapshot<number, THostContext> | undefined;
        let repairTailOffset: number | undefined;
        for (let index = 0; index < lines.length; index += 1) {
            const line = lines[index]!;
            if (!line.text) {
                continue;
            }
            try {
                const record = JSON.parse(line.text) as JsonlRecord<THostContext>;
                if (record.kind === "snapshot") {
                    if (record.snapshot.metadata.sessionId !== sessionId) throw new SessionInvariantError(`Session ${sessionId} JSONL snapshot 无效`);
                    if (snapshot && record.snapshot.version !== snapshot.version + 1) throw new SessionInvariantError(`Session ${sessionId} JSONL checkpoint version 不连续`);
                    snapshot = record.snapshot;
                    continue;
                }
                if (record.kind !== "commit" || !snapshot || record.metadata.sessionId !== sessionId || record.version !== snapshot.version + 1) {
                    throw new SessionInvariantError(`Session ${sessionId} JSONL commit 无效`);
                }
                const existingIds = new Set(snapshot.entries.map((entry) => entry.id));
                if (record.appendedEntries.some((entry) => existingIds.has(entry.id))) {
                    throw new SessionInvariantError(`Session ${sessionId} JSONL commit entry ID 重复`);
                }
                snapshot = {
                    metadata: record.metadata,
                    version: record.version,
                    status: record.status,
                    activeLeafId: record.activeLeafId,
                    activeInvocationId: record.activeInvocationId,
                    entries: [...snapshot.entries, ...record.appendedEntries],
                    invocations: record.invocations,
                };
            } catch (error) {
                const isTail = index === lastNonEmptyLine;
                if (isTail && error instanceof SyntaxError) {
                    repairTailOffset = line.start;
                    break;
                }
                throw error;
            }
        }
        if (!snapshot) throw new SessionNotFoundError(sessionId);
        return {
            snapshot: normalizeSessionSnapshot(snapshot),
            repairTailOffset,
            needsSeparator: repairTailOffset === undefined && bytes.length > 0 && bytes[bytes.length - 1] !== 0x0a,
        };
    }

    private sessionPath(sessionId: number): string {
        return join(this.directory, "sessions", `${sessionId}.jsonl`);
    }

    private async withLock<TResult>(sessionId: number, task: (lock: JsonlSessionLock) => Promise<TResult>): Promise<TResult> {
        const previous = this.queues.get(sessionId) ?? Promise.resolve();
        let release!: () => void;
        const current = new Promise<void>((resolve) => {
            release = resolve;
        });
        const tail = previous.catch(() => undefined).then(() => current);
        this.queues.set(sessionId, tail);
        await previous.catch(() => undefined);
        try {
            return await withJsonlSessionLock(this.sessionPath(sessionId) + ".lock", task);
        } finally {
            release();
            if (this.queues.get(sessionId) === tail) {
                this.queues.delete(sessionId);
            }
        }
    }
}

function splitJsonlLines(bytes: Buffer): JsonlLine[] {
    const lines: JsonlLine[] = [];
    let start = 0;
    for (let index = 0; index < bytes.length; index += 1) {
        if (bytes[index] !== 0x0a) {
            continue;
        }
        const end = index > start && bytes[index - 1] === 0x0d ? index - 1 : index;
        lines.push({start, text: bytes.toString("utf8", start, end)});
        start = index + 1;
    }
    if (start < bytes.length) {
        lines.push({start, text: bytes.toString("utf8", start)});
    }
    return lines;
}

function assertPositiveSessionId(sessionId: number): void {
    if (!Number.isInteger(sessionId) || sessionId <= 0) {
        throw new SessionInvariantError("JSONL Session ID 必须是正整数");
    }
}

function readErrorCode(error: unknown): string | undefined {
    return typeof error === "object" && error !== null && "code" in error && typeof error.code === "string"
        ? error.code
        : undefined;
}

async function readSessionSequence(path: string): Promise<number> {
    let text: string;
    try {
        text = await readFile(path, "utf8");
    } catch (error) {
        if (readErrorCode(error) === "ENOENT") {
            return 0;
        }
        throw error;
    }
    let parsed: unknown;
    try {
        parsed = JSON.parse(text);
    } catch {
        throw new SessionInvariantError("JSONL Session sequence 无效");
    }
    if (
        parsed === null
        || typeof parsed !== "object"
        || !("value" in parsed)
        || !Number.isSafeInteger(parsed.value)
        || (parsed.value as number) < 0
    ) {
        throw new SessionInvariantError("JSONL Session sequence 无效");
    }
    return parsed.value as number;
}
