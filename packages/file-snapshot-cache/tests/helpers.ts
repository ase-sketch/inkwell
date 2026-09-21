import type {
    SnapshotBuildResult,
    SnapshotCacheOptions,
} from "#cache/index";

export interface TestNode {
    path: string;
    words: number;
}

export interface TestEvent {
    path: string;
    kind: "change" | "artifact";
}

/** 测试用可手工完成 Promise。 */
export interface Deferred<T> {
    promise: Promise<T>;
    resolve(value: T): void;
    reject(error: Error): void;
}

/** 创建无计时器和外部依赖的基础 cache 配置。 */
export function cacheOptions(
    build: SnapshotCacheOptions<string, TestNode, string, TestEvent>["builder"]["build"],
): SnapshotCacheOptions<string, TestNode, string, TestEvent> {
    return {
        keyId: (key) => key,
        builder: {build},
        debounceMs: 5,
        eventId: (event) => event.path,
    };
}

/** 创建一个确定性的完整节点构建结果。 */
export function buildResult(sequence: number): SnapshotBuildResult<TestNode, string> {
    return {
        nodes: [{path: `manuscript/${sequence}.md`, words: sequence}],
        issues: [],
    };
}

/** 创建 deferred，便于精确控制竞态边界。 */
export function deferred<T>(): Deferred<T> {
    let resolvePromise!: (value: T) => void;
    let rejectPromise!: (error: Error) => void;
    const promise = new Promise<T>((resolve, reject) => {
        resolvePromise = resolve;
        rejectPromise = reject;
    });
    return {promise, resolve: resolvePromise, reject: rejectPromise};
}

/** 等待同步/微任务驱动的条件成立，超时即让测试失败。 */
export async function waitFor(predicate: () => boolean, timeoutMs = 1_000): Promise<void> {
    const startedAt = performance.now();
    while (!predicate()) {
        if (performance.now() - startedAt > timeoutMs) {
            throw new Error(`condition did not become true within ${timeoutMs}ms`);
        }
        await new Promise<void>((resolve) => setImmediate(resolve));
    }
}
