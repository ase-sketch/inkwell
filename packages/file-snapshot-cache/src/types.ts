/** 调用方一次完整构建产生的 typed snapshot 内容。 */
export interface SnapshotBuildResult<TNode, TIssue> {
    nodes: TNode[];
    issues: TIssue[];
}

/** 已稳定提交到内存的完整 snapshot；消费者不得修改 cache 已接管的数组。 */
export interface FileSnapshot<TNode, TIssue> {
    readonly nodes: readonly TNode[];
    readonly issues: readonly TIssue[];
    readonly revision: number;
    readonly generation: number;
    readonly calculatedAt: string;
}

/** 完整节点构建器；领域扫描、解析和校验由调用方实现。 */
export interface SnapshotBuilder<TKey, TNode, TIssue> {
    build(input: {key: TKey; signal: AbortSignal}): Promise<SnapshotBuildResult<TNode, TIssue>>;
}

/** watcher 句柄必须支持确定性、可安全重试的关闭；close拒绝后cache会保留同一handle再次调用。 */
export interface SnapshotWatchHandle {
    close(): void | Promise<void>;
}

/** 显式 watcher activation；ready 表示 watcher 已成功打开，close 释放该 activation。 */
export interface SnapshotActivation {
    readonly ready: Promise<void>;
    close(): Promise<void>;
}

/** watcher 原始事件批；在 snapshot rebuild 前投递给调用方。 */
export interface SnapshotRawEventBatch<TEvent> {
    readonly events: readonly TEvent[];
    readonly droppedEventCount: number;
}

/** activation 首次建立时原子绑定的 watcher 事件消费 Seam。 */
export interface SnapshotActivationOptions<TEvent> {
    /** 非空时在每次 rebuild 前接收尚未投递的 raw watcher event batch；首次 activation 绑定后保持不变。 */
    onRawEvents?(batch: SnapshotRawEventBatch<TEvent>): void | Promise<void>;
}

/** watcher adapter 把外部变更投递给缓存，不把文件系统概念泄漏进内核。 */
export interface SnapshotWatcher<TKey, TEvent> {
    open(input: {
        key: TKey;
        signal: AbortSignal;
        onEvent(event: TEvent): void;
        onError(error: Error): void;
    }): SnapshotWatchHandle | Promise<SnapshotWatchHandle>;
}

/** 单次稳定提交通知。 */
export interface SnapshotCommit<TNode, TIssue, TEvent> {
    readonly snapshot: FileSnapshot<TNode, TIssue>;
    readonly events: readonly TEvent[];
    readonly droppedEventCount: number;
}

/** 单 key 的有界运行诊断。 */
export interface SnapshotEntryDiagnostics {
    generation: number;
    revision: number;
    dirty: boolean;
    building: boolean;
    pendingEventCount: number;
    droppedEventCount: number;
    subscriberCount: number;
    buildCount: number;
    /** 未能产出稳定 snapshot 的构建轮次总数。 */
    buildFailureCount: number;
    stableCommitCount: number;
    discardedBuildCount: number;
    /** 最近一次构建失败的有界文本；从未失败时为空。 */
    lastBuildError: string | null;
    /** 最近一次构建失败时间；从未失败时为空。 */
    lastBuildFailedAt: string | null;
    watcherError: string | null;
}

/** 整个 cache 的资源诊断。 */
export interface SnapshotCacheDiagnostics {
    entryCount: number;
    activeBuildCount: number;
    queuedBuildCount: number;
    timerCount: number;
    idleTimerCount: number;
    watcherCount: number;
    watcherOpeningCount: number;
    subscriberCount: number;
    entries: Readonly<Record<string, SnapshotEntryDiagnostics>>;
}

/** read 行为；默认等待最新稳定 snapshot。 */
export interface SnapshotReadOptions {
    staleWhileRevalidate?: boolean;
}

/** SnapshotCache 的完整配置。 */
export interface SnapshotCacheOptions<TKey, TNode, TIssue, TEvent> {
    keyId(key: TKey): string;
    builder: SnapshotBuilder<TKey, TNode, TIssue>;
    watcher?: SnapshotWatcher<TKey, TEvent>;
    eventId?(event: TEvent): string;
    shouldIgnoreEvent?(event: TEvent): boolean;
    debounceMs?: number;
    maxPendingEvents?: number;
    maxSubscribers?: number;
    maxConcurrentBuilds?: number;
    maxBuildAttempts?: number;
    /** 无 watcher、subscriber、build、debounce 或 pending event 的 entry 最长空闲时间，默认 5 秒。 */
    idleTtlMs?: number;
    now?: () => Date;
}

/** cache 已关闭或 key 在构建期间关闭。 */
export class SnapshotClosedError extends Error {
    constructor(message = "snapshot cache entry is closed") {
        super(message);
        this.name = "SnapshotClosedError";
    }
}

/** 连续变更使 snapshot 无法在有限尝试内稳定。 */
export class SnapshotUnstableError extends Error {
    constructor(readonly keyId: string, readonly attempts: number) {
        super(`snapshot ${keyId} did not stabilize after ${attempts} build attempts`);
        this.name = "SnapshotUnstableError";
    }
}
