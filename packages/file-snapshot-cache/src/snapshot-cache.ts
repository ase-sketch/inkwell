import {AsyncSemaphore} from "#cache/concurrency";
import {
    SnapshotClosedError,
    SnapshotUnstableError,
    type FileSnapshot,
    type SnapshotActivation,
    type SnapshotActivationOptions,
    type SnapshotCacheDiagnostics,
    type SnapshotCacheOptions,
    type SnapshotCommit,
    type SnapshotEntryDiagnostics,
    type SnapshotReadOptions,
    type SnapshotWatchHandle,
} from "#cache/types";

type Subscriber<TNode, TIssue, TEvent> = (
    commit: SnapshotCommit<TNode, TIssue, TEvent>,
) => void | Promise<void>;

type SnapshotEntry<TKey, TNode, TIssue, TEvent> = {
    key: TKey;
    id: string;
    snapshot: FileSnapshot<TNode, TIssue> | null;
    operationGate: AsyncSemaphore;
    operationController: AbortController;
    mutationPromises: Set<Promise<void>>;
    buildPromise: Promise<FileSnapshot<TNode, TIssue>> | null;
    buildController: AbortController | null;
    closePromise: Promise<void> | null;
    watcherController: AbortController | null;
    watcherPromise: Promise<SnapshotWatchHandle | null> | null;
    watcher: SnapshotWatchHandle | null;
    activation: SnapshotActivation | null;
    timer: ReturnType<typeof setTimeout> | null;
    idleTimer: ReturnType<typeof setTimeout> | null;
    pendingEvents: Map<string, TEvent>;
    rawPendingEvents: Map<string, TEvent>;
    subscribers: Set<Subscriber<TNode, TIssue, TEvent>>;
    generation: number;
    revision: number;
    anonymousEventSequence: number;
    droppedEventCount: number;
    rawDroppedEventCount: number;
    buildCount: number;
    buildFailureCount: number;
    stableCommitCount: number;
    discardedBuildCount: number;
    dirty: boolean;
    closed: boolean;
    lastBuildError: string | null;
    lastBuildFailedAt: string | null;
    watcherError: string | null;
    onRawEvents: SnapshotActivationOptions<TEvent>["onRawEvents"] | null;
};

const DEFAULT_DEBOUNCE_MS = 120;
const DEFAULT_MAX_PENDING_EVENTS = 1_000;
const DEFAULT_MAX_SUBSCRIBERS = 1_000;
const DEFAULT_MAX_CONCURRENT_BUILDS = 1;
const DEFAULT_MAX_BUILD_ATTEMPTS = 3;
const DEFAULT_IDLE_TTL_MS = 5_000;
const MAX_DIAGNOSTIC_ERROR_LENGTH = 2_000;

/**
 * 与领域无关的完整 typed snapshot 缓存。
 *
 * builder 是唯一节点真相源；cache 只管理生命周期，不解释节点内容。
 */
export class SnapshotCache<TKey, TNode, TIssue, TEvent> {
    private readonly entries = new Map<string, SnapshotEntry<TKey, TNode, TIssue, TEvent>>();
    private readonly semaphore: AsyncSemaphore;
    private readonly debounceMs: number;
    private readonly maxPendingEvents: number;
    private readonly maxSubscribers: number;
    private readonly maxBuildAttempts: number;
    private readonly idleTtlMs: number;
    private readonly now: () => Date;
    private readonly closePromises = new Map<string, Promise<void>>();
    private closed = false;
    private closeAllPromise: Promise<void> | null = null;

    constructor(private readonly options: SnapshotCacheOptions<TKey, TNode, TIssue, TEvent>) {
        this.debounceMs = assertNonNegativeInteger(options.debounceMs ?? DEFAULT_DEBOUNCE_MS, "debounceMs");
        this.maxPendingEvents = assertPositiveInteger(options.maxPendingEvents ?? DEFAULT_MAX_PENDING_EVENTS, "maxPendingEvents");
        this.maxSubscribers = assertPositiveInteger(options.maxSubscribers ?? DEFAULT_MAX_SUBSCRIBERS, "maxSubscribers");
        this.maxBuildAttempts = assertPositiveInteger(options.maxBuildAttempts ?? DEFAULT_MAX_BUILD_ATTEMPTS, "maxBuildAttempts");
        this.idleTtlMs = assertPositiveInteger(options.idleTtlMs ?? DEFAULT_IDLE_TTL_MS, "idleTtlMs");
        this.semaphore = new AsyncSemaphore(options.maxConcurrentBuilds ?? DEFAULT_MAX_CONCURRENT_BUILDS);
        this.now = options.now ?? (() => new Date());

    }

    /** 读取最新稳定 snapshot；可选择立即返回 stale snapshot 并后台刷新。 */
    async read(key: TKey, options: SnapshotReadOptions = {}): Promise<FileSnapshot<TNode, TIssue>> {
        const entry = this.ensureEntry(key);
        try {
            if (entry.snapshot && !entry.dirty) {
                return entry.snapshot;
            }
            if (entry.snapshot && options.staleWhileRevalidate) {
                this.startBackgroundBuild(entry);
                return entry.snapshot;
            }
            return await this.stabilize(entry);
        } finally {
            this.scheduleIdle(entry);
        }
    }

    /**
     * 标记 key 已发生外部变化。事件会有界归并，并在 debounce 后后台重建。
     */
    invalidate(key: TKey, event?: TEvent): void {
        const entry = this.ensureEntry(key);
        this.markDirty(entry, event);
    }

    /**
     * 与同 key 的 snapshot build 串行执行一次源数据 mutation。
     *
     * mutation 成功或失败后都推进 generation：调用方可能已经完成部分写入，cache 不得继续
     * 暴露旧 snapshot。不同 key 仍可并行。
     */
    async mutate<TResult>(key: TKey, operation: () => TResult | Promise<TResult>): Promise<TResult> {
        const entry = this.ensureEntry(key);
        const task = this.runMutation(entry, operation);
        const settled = task.then(() => undefined, () => undefined);
        entry.mutationPromises.add(settled);
        try {
            return await task;
        } finally {
            entry.mutationPromises.delete(settled);
        }
    }

    /** 显式启动 watcher，并同步返回可等待 ready 的 activation handle。 */
    activate(key: TKey, options: SnapshotActivationOptions<TEvent> = {}): SnapshotActivation {
        const entry = this.ensureEntry(key);
        if (entry.activation) {
            return entry.activation;
        }
        entry.onRawEvents = options.onRawEvents ?? null;
        const activation: SnapshotActivation = {
            ready: this.openWatcher(entry),
            close: () => this.closeExactEntry(entry),
        };
        entry.activation = activation;
        return activation;
    }

    /** 订阅稳定 commit；返回幂等取消函数。 */
    subscribe(key: TKey, subscriber: Subscriber<TNode, TIssue, TEvent>): () => void {
        const entry = this.ensureEntry(key);
        if (entry.subscribers.size >= this.maxSubscribers) {
            throw new Error(`snapshot ${entry.id} exceeded maxSubscribers=${this.maxSubscribers}`);
        }
        entry.subscribers.add(subscriber);
        let subscribed = true;
        return () => {
            if (!subscribed) {
                return;
            }
            subscribed = false;
            entry.subscribers.delete(subscriber);
            this.scheduleIdle(entry);
        };
    }

    /** 关闭单 key；不等待忽略 AbortSignal 的 builder，late result 会被 closed guard 丢弃。 */
    async close(key: TKey): Promise<void> {
        const id = this.options.keyId(key);
        const closing = this.closePromises.get(id);
        if (closing) {
            return closing;
        }
        const entry = this.entries.get(id);
        if (!entry) {
            return;
        }
        return this.closeExactEntry(entry);
    }

    /** 关闭全部 key 和 cache；之后拒绝创建新 entry。 */
    async closeAll(): Promise<void> {
        if (this.closeAllPromise) {
            return this.closeAllPromise;
        }
        this.closed = true;
        const closing = [...this.closePromises.values()];
        const keys = [...this.entries.values()].map((entry) => entry.key);
        const task = Promise.all([
            ...closing,
            ...keys.map((key) => this.close(key)),
        ]).then(() => undefined).catch((error: unknown) => {
            if (this.closeAllPromise === task) {
                this.closeAllPromise = null;
            }
            throw error;
        });
        this.closeAllPromise = task;
        return task;
    }

    /** 返回有界的结构化资源诊断。 */
    diagnostics(): SnapshotCacheDiagnostics {
        const entries: Record<string, SnapshotEntryDiagnostics> = {};
        let timerCount = 0;
        let idleTimerCount = 0;
        let watcherCount = 0;
        let watcherOpeningCount = 0;
        let subscriberCount = 0;
        for (const entry of this.entries.values()) {
            timerCount += entry.timer ? 1 : 0;
            idleTimerCount += entry.idleTimer ? 1 : 0;
            watcherCount += entry.watcher ? 1 : 0;
            watcherOpeningCount += entry.watcherPromise && !entry.watcher ? 1 : 0;
            subscriberCount += entry.subscribers.size;
            entries[entry.id] = {
                generation: entry.generation,
                revision: entry.revision,
                dirty: entry.dirty,
                building: entry.buildPromise !== null,
                pendingEventCount: entry.pendingEvents.size,
                droppedEventCount: entry.droppedEventCount,
                subscriberCount: entry.subscribers.size,
                buildCount: entry.buildCount,
                buildFailureCount: entry.buildFailureCount,
                stableCommitCount: entry.stableCommitCount,
                discardedBuildCount: entry.discardedBuildCount,
                lastBuildError: entry.lastBuildError,
                lastBuildFailedAt: entry.lastBuildFailedAt,
                watcherError: entry.watcherError,
            };
        }
        return {
            entryCount: this.entries.size,
            activeBuildCount: this.semaphore.activeCount,
            queuedBuildCount: this.semaphore.queuedCount,
            timerCount,
            idleTimerCount,
            watcherCount,
            watcherOpeningCount,
            subscriberCount,
            entries,
        };
    }

    /** 创建纯内存 entry；watcher 只能由显式 activation 启动。 */
    private ensureEntry(key: TKey): SnapshotEntry<TKey, TNode, TIssue, TEvent> {
        if (this.closed) {
            throw new SnapshotClosedError("snapshot cache is closed");
        }
        const id = this.options.keyId(key);
        if (this.closePromises.has(id)) {
            throw new SnapshotClosedError(`snapshot ${id} is closing`);
        }
        const existing = this.entries.get(id);
        if (existing) {
            if (existing.closed) {
                throw new SnapshotClosedError(`snapshot ${id} is closing`);
            }
            this.cancelIdle(existing);
            return existing;
        }
        const entry: SnapshotEntry<TKey, TNode, TIssue, TEvent> = {
            key,
            id,
            snapshot: null,
            operationGate: new AsyncSemaphore(1),
            operationController: new AbortController(),
            mutationPromises: new Set(),
            buildPromise: null,
            buildController: null,
            closePromise: null,
            watcherController: null,
            watcherPromise: null,
            watcher: null,
            activation: null,
            timer: null,
            idleTimer: null,
            pendingEvents: new Map(),
            rawPendingEvents: new Map(),
            subscribers: new Set(),
            generation: 0,
            revision: 0,
            anonymousEventSequence: 0,
            droppedEventCount: 0,
            rawDroppedEventCount: 0,
            buildCount: 0,
            buildFailureCount: 0,
            stableCommitCount: 0,
            discardedBuildCount: 0,
            dirty: true,
            closed: false,
            lastBuildError: null,
            lastBuildFailedAt: null,
            watcherError: null,
            onRawEvents: null,
        };
        this.entries.set(id, entry);
        return entry;
    }

    /** 启动 watcher；打开失败只标记诊断，read-time build 仍可工作。 */
    private openWatcher(entry: SnapshotEntry<TKey, TNode, TIssue, TEvent>): Promise<void> {
        const watcher = this.options.watcher;
        if (!watcher) {
            return Promise.resolve();
        }
        const controller = new AbortController();
        entry.watcherController = controller;
        const opening = Promise.resolve().then(() => {
            assertEntryOpen(entry, controller.signal);
            return watcher.open({
                key: entry.key,
                signal: controller.signal,
                onEvent: (event) => {
                    if (!entry.closed && !this.options.shouldIgnoreEvent?.(event)) {
                        this.markDirty(entry, event);
                    }
                },
                onError: (error) => {
                    if (!entry.closed) {
                        entry.watcherError = error.message;
                        this.markDirty(entry);
                    }
                },
            });
        }).then(async (handle) => {
            if (entry.closed) {
                await handle.close();
                return null;
            }
            entry.watcher = handle;
            entry.watcherError = null;
            return handle;
        }).catch((error: unknown) => {
            const watcherError = error instanceof Error ? error : new Error(String(error));
            if (!entry.closed) {
                entry.watcherError = watcherError.message;
                entry.dirty = true;
            }
            throw watcherError;
        }).finally(() => {
            entry.watcherController = null;
            entry.watcherPromise = null;
        });
        entry.watcherPromise = opening;
        return opening.then(() => undefined);
    }

    /** 推进 generation、记录有界事件并安排后台重建。 */
    private markDirty(entry: SnapshotEntry<TKey, TNode, TIssue, TEvent>, event?: TEvent): void {
        entry.dirty = true;
        if (event !== undefined) {
            const eventId = this.options.eventId?.(event) ?? `anonymous:${entry.anonymousEventSequence++}`;
            if (!entry.pendingEvents.has(eventId) && entry.pendingEvents.size >= this.maxPendingEvents) {
                entry.droppedEventCount += 1;
            } else {
                entry.pendingEvents.set(eventId, event);
            }
            if (entry.onRawEvents) {
                if (!entry.rawPendingEvents.has(eventId) && entry.rawPendingEvents.size >= this.maxPendingEvents) {
                    entry.rawDroppedEventCount += 1;
                } else {
                    entry.rawPendingEvents.set(eventId, event);
                }
            }
        }
        entry.generation += 1;
        this.scheduleBuild(entry);
    }

    /** 重置 debounce timer；稳定构建会在入口主动取消多余 timer。 */
    private scheduleBuild(entry: SnapshotEntry<TKey, TNode, TIssue, TEvent>): void {
        if (entry.timer) {
            clearTimeout(entry.timer);
        }
        entry.timer = setTimeout(() => {
            entry.timer = null;
            this.startBackgroundBuild(entry);
        }, this.debounceMs);
    }

    /** 后台 build 统一吞掉错误，错误仍可通过下一次显式 read 观察。 */
    private startBackgroundBuild(entry: SnapshotEntry<TKey, TNode, TIssue, TEvent>): void {
        if (entry.closed || !entry.dirty) {
            return;
        }
        void this.stabilize(entry).catch(() => undefined);
    }

    /** 同 key 共享一个有限重试的稳定构建。 */
    private stabilize(entry: SnapshotEntry<TKey, TNode, TIssue, TEvent>): Promise<FileSnapshot<TNode, TIssue>> {
        if (entry.closed) {
            return Promise.reject(new SnapshotClosedError(`snapshot ${entry.id} is closed`));
        }
        if (entry.snapshot && !entry.dirty) {
            return Promise.resolve(entry.snapshot);
        }
        if (entry.buildPromise) {
            return entry.buildPromise;
        }
        if (entry.timer) {
            clearTimeout(entry.timer);
            entry.timer = null;
        }
        const controller = new AbortController();
        entry.buildController = controller;
        const task = this.buildUntilStable(entry, controller.signal).catch((error: unknown) => {
            if (!entry.closed) {
                entry.buildFailureCount += 1;
                entry.lastBuildError = boundedDiagnosticError(error);
                entry.lastBuildFailedAt = this.now().toISOString();
            }
            throw error;
        }).finally(() => {
            if (entry.buildPromise === task) {
                entry.buildPromise = null;
                entry.buildController = null;
                this.scheduleIdle(entry);
            }
        });
        entry.buildPromise = task;
        return task;
    }

    /** 执行已登记 mutation；settle 后统一推进 generation 并释放 per-entry gate。 */
    private async runMutation<TResult>(
        entry: SnapshotEntry<TKey, TNode, TIssue, TEvent>,
        operation: () => TResult | Promise<TResult>,
    ): Promise<TResult> {
        const release = await entry.operationGate.acquire(entry.operationController.signal);
        const generation = entry.generation;
        try {
            assertEntryOpen(entry, entry.operationController.signal);
            return await operation();
        } finally {
            if (!entry.closed && entry.generation === generation) {
                this.markDirty(entry);
            }
            release();
            if (!entry.closed) {
                this.scheduleIdle(entry);
            }
        }
    }

    /** 构建期间发生变更时丢弃旧结果并重试，永不提交已知过期 snapshot。 */
    private async buildUntilStable(
        entry: SnapshotEntry<TKey, TNode, TIssue, TEvent>,
        signal: AbortSignal,
    ): Promise<FileSnapshot<TNode, TIssue>> {
        for (let attempt = 1; attempt <= this.maxBuildAttempts; attempt += 1) {
            assertEntryOpen(entry, signal);
            const generation = entry.generation;
            this.notifyRawEvents(entry);
            const releaseOperation = await entry.operationGate.acquire(signal);
            let releaseBuild: (() => void) | null = null;
            let result;
            try {
                // 等待本 entry mutation 时不占用全局 build 槽，避免长 mutation 阻塞其他 key。
                releaseBuild = await this.semaphore.acquire(signal);
                assertEntryOpen(entry, signal);
                entry.buildCount += 1;
                result = await this.options.builder.build({key: entry.key, signal});
            } finally {
                releaseBuild?.();
                releaseOperation();
            }
            assertEntryOpen(entry, signal);
            if (generation !== entry.generation) {
                entry.discardedBuildCount += 1;
                continue;
            }

            const calculatedAt = this.now().toISOString();
            const snapshot: FileSnapshot<TNode, TIssue> = {
                nodes: result.nodes,
                issues: result.issues,
                generation,
                revision: entry.revision + 1,
                calculatedAt,
            };
            const events = [...entry.pendingEvents.values()];
            const droppedEventCount = entry.droppedEventCount;
            const commit: SnapshotCommit<TNode, TIssue, TEvent> = {
                snapshot,
                events,
                droppedEventCount,
            };

            entry.snapshot = snapshot;
            entry.revision = snapshot.revision;
            entry.dirty = false;
            entry.stableCommitCount += 1;
            entry.pendingEvents.clear();
            entry.droppedEventCount = 0;
            this.notifySubscribers(entry, commit);
            return snapshot;
        }
        throw new SnapshotUnstableError(entry.id, this.maxBuildAttempts);
    }

    /** 为无属主且无工作的精确 entry 安排一次 idle eviction。 */
    private scheduleIdle(entry: SnapshotEntry<TKey, TNode, TIssue, TEvent>): void {
        this.cancelIdle(entry);
        if (!this.isIdle(entry)) {
            return;
        }
        entry.idleTimer = setTimeout(() => {
            entry.idleTimer = null;
            if (!this.isIdle(entry)) {
                return;
            }
            void this.closeExactEntry(entry).catch(() => undefined);
        }, this.idleTtlMs);
    }

    /** 新使用者出现时取消旧 idle deadline。 */
    private cancelIdle(entry: SnapshotEntry<TKey, TNode, TIssue, TEvent>): void {
        if (!entry.idleTimer) {
            return;
        }
        clearTimeout(entry.idleTimer);
        entry.idleTimer = null;
    }

    /** 只有当前 incarnation 完全无属主、无 I/O、无待处理事件时才可回收。 */
    private isIdle(entry: SnapshotEntry<TKey, TNode, TIssue, TEvent>): boolean {
        return !entry.closed
            && this.entries.get(entry.id) === entry
            && entry.activation === null
            && entry.watcher === null
            && entry.watcherPromise === null
            && entry.operationGate.activeCount === 0
            && entry.operationGate.queuedCount === 0
            && entry.subscribers.size === 0
            && entry.buildPromise === null
            && entry.timer === null
            && entry.pendingEvents.size === 0
            && entry.rawPendingEvents.size === 0;
    }

    /** 关闭精确 entry incarnation；迟到 handle 不会按 key 误关重开的新 entry。 */
    private closeExactEntry(entry: SnapshotEntry<TKey, TNode, TIssue, TEvent>): Promise<void> {
        if (entry.closePromise) {
            return entry.closePromise;
        }
        const task = this.closeEntry(entry).catch((error: unknown) => {
            if (entry.closePromise === task) {
                entry.closePromise = null;
            }
            throw error;
        }).finally(() => {
            if (this.closePromises.get(entry.id) === task) {
                this.closePromises.delete(entry.id);
            }
        });
        entry.closePromise = task;
        if (this.entries.get(entry.id) === entry) {
            this.closePromises.set(entry.id, task);
        }
        return task;
    }

    /** 释放单 entry；不等待无视 AbortSignal 且永不结束的 watcher.open。 */
    private async closeEntry(entry: SnapshotEntry<TKey, TNode, TIssue, TEvent>): Promise<void> {
        entry.closed = true;
        const reason = new SnapshotClosedError(`snapshot ${entry.id} is closed`);
        entry.operationController.abort(reason);
        entry.buildController?.abort(reason);
        entry.buildController = null;
        entry.watcherController?.abort(reason);
        entry.watcherController = null;
        if (entry.timer) {
            clearTimeout(entry.timer);
            entry.timer = null;
        }
        this.cancelIdle(entry);
        entry.pendingEvents.clear();
        entry.rawPendingEvents.clear();
        entry.subscribers.clear();
        entry.onRawEvents = null;

        await Promise.all(entry.mutationPromises);

        const handle = entry.watcher;
        await handle?.close();
        if (entry.watcher === handle) {
            entry.watcher = null;
        }
        if (this.entries.get(entry.id) === entry) {
            this.entries.delete(entry.id);
        }
    }

    /** subscriber 失败相互隔离，不阻塞 commit。 */
    private notifySubscribers(
        entry: SnapshotEntry<TKey, TNode, TIssue, TEvent>,
        commit: SnapshotCommit<TNode, TIssue, TEvent>,
    ): void {
        for (const subscriber of entry.subscribers) {
            try {
                void Promise.resolve(subscriber(commit)).catch(() => undefined);
            } catch {
                // 同步与异步 subscriber 错误都不能污染 cache commit 或其他订阅者。
            }
        }
    }

    /** 在 rebuild 前投递尚未发送的 raw event batch；callback 错误不污染构建。 */
    private notifyRawEvents(entry: SnapshotEntry<TKey, TNode, TIssue, TEvent>): void {
        const onRawEvents = entry.onRawEvents;
        if (!onRawEvents || (entry.rawPendingEvents.size === 0 && entry.rawDroppedEventCount === 0)) {
            return;
        }
        const batch = {
            events: [...entry.rawPendingEvents.values()],
            droppedEventCount: entry.rawDroppedEventCount,
        };
        entry.rawPendingEvents.clear();
        entry.rawDroppedEventCount = 0;
        try {
            void Promise.resolve(onRawEvents(batch)).catch(() => undefined);
        } catch {
            // raw event callback的同步与异步错误都不能阻断snapshot rebuild。
        }
    }
}

/** 验证正整数配置。 */
function assertPositiveInteger(value: number, name: string): number {
    if (!Number.isInteger(value) || value <= 0) {
        throw new Error(`${name} must be a positive integer`);
    }
    return value;
}

/** 验证非负整数配置。 */
function assertNonNegativeInteger(value: number, name: string): number {
    if (!Number.isInteger(value) || value < 0) {
        throw new Error(`${name} must be a non-negative integer`);
    }
    return value;
}

/** 把任意构建异常投影为单条定长诊断，不保留 Error/cause 对象图。 */
function boundedDiagnosticError(error: unknown): string {
    let message = "Unknown build failure";
    try {
        message = error instanceof Error
            ? `${error.name}: ${error.message}`
            : String(error);
    } catch {
        // 异常对象的自定义字符串转换不能覆盖真正的builder failure。
    }
    return message.length <= MAX_DIAGNOSTIC_ERROR_LENGTH
        ? message
        : `${message.slice(0, MAX_DIAGNOSTIC_ERROR_LENGTH - 3)}...`;
}

/** 每个异步边界后重新检查 entry 世代，隔离 late result。 */
function assertEntryOpen<TKey, TNode, TIssue, TEvent>(
    entry: SnapshotEntry<TKey, TNode, TIssue, TEvent>,
    signal: AbortSignal,
): void {
    if (entry.closed || signal.aborted) {
        throw signal.reason instanceof Error ? signal.reason : new SnapshotClosedError(`snapshot ${entry.id} is closed`);
    }
}
