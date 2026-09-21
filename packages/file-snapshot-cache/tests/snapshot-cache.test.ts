import {describe, expect, it, vi} from "vitest";
import {
    SnapshotCache,
    SnapshotClosedError,
    SnapshotUnstableError,
    type SnapshotWatchHandle,
} from "#cache/index";
import {
    buildResult,
    cacheOptions,
    deferred,
    type TestEvent,
    waitFor,
} from "#test/helpers";

describe("SnapshotCache 基础读取与并发", () => {
    it("cold read 构建一次，warm read 不再构建", async () => {
        let buildCount = 0;
        const cache = new SnapshotCache(cacheOptions(async () => buildResult(++buildCount)));

        const cold = await cache.read("alpha");
        const warm = await cache.read("alpha");

        expect(cold).toBe(warm);
        expect(buildCount).toBe(1);
        expect(cache.diagnostics().entries.alpha?.stableCommitCount).toBe(1);
        await cache.closeAll();
    });

    it.each([1, 10, 100])("%i 个同 key cold reader 共享一个 build", async (readerCount) => {
        const gate = deferred<ReturnType<typeof buildResult>>();
        let buildCount = 0;
        const cache = new SnapshotCache(cacheOptions(async () => {
            buildCount += 1;
            return gate.promise;
        }));

        const reads = Array.from({length: readerCount}, () => cache.read("alpha"));
        await waitFor(() => buildCount === 1);
        gate.resolve(buildResult(1));
        const snapshots = await Promise.all(reads);

        expect(buildCount).toBe(1);
        expect(new Set(snapshots).size).toBe(1);
        await cache.closeAll();
    });

    it("build 失败进入有界诊断，下一批 reader 共享一个重试 build", async () => {
        const retry = deferred<ReturnType<typeof buildResult>>();
        const longError = new Error("scan failed ".repeat(300));
        let buildCount = 0;
        const options = cacheOptions(async () => {
            buildCount += 1;
            if (buildCount === 1) {
                throw longError;
            }
            return retry.promise;
        });
        options.now = () => new Date("2026-07-24T12:00:00.000Z");
        const cache = new SnapshotCache(options);

        await expect(cache.read("alpha")).rejects.toBe(longError);

        const failure = cache.diagnostics().entries.alpha;
        expect(failure).toMatchObject({
            dirty: true,
            building: false,
            buildCount: 1,
            buildFailureCount: 1,
            lastBuildFailedAt: "2026-07-24T12:00:00.000Z",
        });
        const errorMessage = failure?.lastBuildError ?? "";
        expect(errorMessage).toMatch(/^Error: scan failed/u);
        expect(errorMessage.length).toBeLessThanOrEqual(2_000);
        expect(errorMessage).toMatch(/\.\.\.$/u);

        const reads = Array.from({length: 100}, () => cache.read("alpha"));
        await waitFor(() => buildCount === 2);
        expect(cache.diagnostics().entries.alpha).toMatchObject({
            building: true,
            buildCount: 2,
            buildFailureCount: 1,
        });

        retry.resolve(buildResult(2));
        const snapshots = await Promise.all(reads);

        expect(buildCount).toBe(2);
        expect(new Set(snapshots).size).toBe(1);
        expect(cache.diagnostics().entries.alpha).toMatchObject({
            dirty: false,
            building: false,
            buildFailureCount: 1,
            stableCommitCount: 1,
        });
        await cache.closeAll();
    });

    it("不同 key 遵守全局构建并发上限", async () => {
        let active = 0;
        let peak = 0;
        const gates = new Map<string, ReturnType<typeof deferred<ReturnType<typeof buildResult>>>>();
        const options = cacheOptions(async ({key}) => {
            active += 1;
            peak = Math.max(peak, active);
            const gate = deferred<ReturnType<typeof buildResult>>();
            gates.set(key, gate);
            const result = await gate.promise;
            active -= 1;
            return result;
        });
        options.maxConcurrentBuilds = 2;
        const cache = new SnapshotCache(options);
        const reads = ["a", "b", "c", "d"].map((key) => cache.read(key));

        await waitFor(() => gates.size === 2);
        gates.get("a")?.resolve(buildResult(1));
        gates.get("b")?.resolve(buildResult(2));
        await waitFor(() => gates.size === 4);
        gates.get("c")?.resolve(buildResult(3));
        gates.get("d")?.resolve(buildResult(4));
        await Promise.all(reads);

        expect(peak).toBe(2);
        expect(cache.diagnostics().activeBuildCount).toBe(0);
        expect(cache.diagnostics().queuedBuildCount).toBe(0);
        await cache.closeAll();
    });

    it("同 key mutation 不与在途 build 并发，完成后 read 取得新 generation", async () => {
        const firstBuild = deferred<ReturnType<typeof buildResult>>();
        let buildCount = 0;
        let building = false;
        const options = cacheOptions(async () => {
            buildCount += 1;
            building = true;
            if (buildCount === 1) {
                await firstBuild.promise;
            }
            building = false;
            return buildResult(buildCount);
        });
        options.debounceMs = 10_000;
        const cache = new SnapshotCache(options);
        const initialRead = cache.read("alpha");
        await waitFor(() => buildCount === 1);
        let mutationStarted = false;

        const mutation = cache.mutate("alpha", async () => {
            mutationStarted = true;
            expect(building).toBe(false);
            return "mutated";
        });
        await Promise.resolve();
        expect(mutationStarted).toBe(false);

        firstBuild.resolve(buildResult(1));
        const initialSnapshot = await initialRead;
        await expect(mutation).resolves.toBe("mutated");
        const currentSnapshot = await cache.read("alpha");

        expect(initialSnapshot.generation).toBe(0);
        expect(currentSnapshot.generation).toBe(1);
        expect(buildCount).toBe(2);
        await cache.closeAll();
    });

    it("mutation 执行期间同 key rebuild 等待，其他 key 继续构建", async () => {
        let alphaBuildCount = 0;
        let betaBuildCount = 0;
        const options = cacheOptions(async ({key}) => {
            if (key === "alpha") {
                alphaBuildCount += 1;
            } else {
                betaBuildCount += 1;
            }
            return buildResult(alphaBuildCount + betaBuildCount);
        });
        options.debounceMs = 10_000;
        options.maxConcurrentBuilds = 1;
        const cache = new SnapshotCache(options);
        await cache.read("alpha");
        const mutationGate = deferred<void>();
        let mutationStarted = false;
        const mutation = cache.mutate("alpha", async () => {
            mutationStarted = true;
            await mutationGate.promise;
        });
        await waitFor(() => mutationStarted);

        cache.invalidate("alpha");
        const alphaRead = cache.read("alpha");
        const betaRead = cache.read("beta");
        await betaRead;

        expect(alphaBuildCount).toBe(1);
        expect(betaBuildCount).toBe(1);
        mutationGate.resolve();
        await mutation;
        await alphaRead;
        expect(alphaBuildCount).toBe(2);
        await cache.closeAll();
    });

    it("mutation 失败后也拒绝继续返回旧 snapshot", async () => {
        let buildCount = 0;
        const cache = new SnapshotCache(cacheOptions(async () => buildResult(++buildCount)));
        const initial = await cache.read("alpha");

        await expect(cache.mutate("alpha", () => {
            throw new Error("partial mutation failed");
        })).rejects.toThrow("partial mutation failed");
        const current = await cache.read("alpha");

        expect(initial.generation).toBe(0);
        expect(current.generation).toBe(1);
        expect(buildCount).toBe(2);
        await cache.closeAll();
    });

    it("close 等待活动 mutation settle，并取消同 key 排队 mutation", async () => {
        const cache = new SnapshotCache(cacheOptions(async () => buildResult(1)));
        const activeGate = deferred<void>();
        let activeStarted = false;
        const active = cache.mutate("alpha", async () => {
            activeStarted = true;
            await activeGate.promise;
        });
        await waitFor(() => activeStarted);
        const queuedOperation = vi.fn();
        const queued = cache.mutate("alpha", queuedOperation);
        let closeSettled = false;
        const close = cache.close("alpha").then(() => { closeSettled = true; });

        await Promise.resolve();
        expect(closeSettled).toBe(false);
        await expect(queued).rejects.toBeInstanceOf(SnapshotClosedError);
        expect(queuedOperation).not.toHaveBeenCalled();

        activeGate.resolve();
        await active;
        await close;
        expect(closeSettled).toBe(true);
        expect(cache.diagnostics().entryCount).toBe(0);
    });
});

describe("SnapshotCache generation 与事件归并", () => {
    it("构建期间 invalidate 会丢弃旧结果并提交新 generation", async () => {
        const first = deferred<ReturnType<typeof buildResult>>();
        let buildCount = 0;
        const cache = new SnapshotCache(cacheOptions(async () => {
            buildCount += 1;
            return buildCount === 1 ? first.promise : buildResult(2);
        }));

        const read = cache.read("alpha");
        await waitFor(() => buildCount === 1);
        cache.invalidate("alpha", {path: "manuscript/a.md", kind: "change"});
        first.resolve(buildResult(1));
        const snapshot = await read;

        expect(snapshot.nodes[0]?.words).toBe(2);
        expect(snapshot.generation).toBe(1);
        expect(buildCount).toBe(2);
        expect(cache.diagnostics().entries.alpha?.discardedBuildCount).toBe(1);
        await cache.closeAll();
    });

    it("stale-while-revalidate 立即返回旧 snapshot 并后台提交新版本", async () => {
        const rebuild = deferred<ReturnType<typeof buildResult>>();
        let buildCount = 0;
        const cache = new SnapshotCache(cacheOptions(async () => {
            buildCount += 1;
            return buildCount === 1 ? buildResult(1) : rebuild.promise;
        }));
        const stale = await cache.read("alpha");
        cache.invalidate("alpha", {path: "changed", kind: "change"});

        const returned = await cache.read("alpha", {staleWhileRevalidate: true});
        expect(returned).toBe(stale);
        await waitFor(() => buildCount === 2);
        rebuild.resolve(buildResult(2));
        await waitFor(() => cache.diagnostics().entries.alpha?.stableCommitCount === 2);

        expect((await cache.read("alpha")).nodes[0]?.words).toBe(2);
        await cache.closeAll();
    });

    it("连续失效达到 maxBuildAttempts 后返回 typed unstable error 并保留 dirty", async () => {
        let buildCount = 0;
        let cache!: SnapshotCache<string, ReturnType<typeof buildResult>["nodes"][number], string, TestEvent>;
        const options = cacheOptions(async () => {
            buildCount += 1;
            queueMicrotask(() => cache.invalidate("alpha", {path: `change-${buildCount}`, kind: "change"}));
            await new Promise<void>((resolve) => setImmediate(resolve));
            return buildResult(buildCount);
        });
        options.maxBuildAttempts = 2;
        cache = new SnapshotCache(options);

        await expect(cache.read("alpha")).rejects.toMatchObject({
            name: "SnapshotUnstableError",
            attempts: 2,
        } satisfies Partial<SnapshotUnstableError>);
        expect(buildCount).toBe(2);
        expect(cache.diagnostics().entries.alpha).toMatchObject({dirty: true, discardedBuildCount: 2});
        await cache.closeAll();
    });

    it("1k 事件经 debounce 合并，pending 有界且只重建一次", async () => {
        vi.useFakeTimers();
        try {
            let buildCount = 0;
            const options = cacheOptions(async () => buildResult(++buildCount));
            options.maxPendingEvents = 10;
            options.debounceMs = 20;
            const cache = new SnapshotCache(options);
            const commits: Array<{events: readonly TestEvent[]; dropped: number}> = [];
            cache.subscribe("alpha", (commit) => {
                commits.push({events: commit.events, dropped: commit.droppedEventCount});
            });

            for (let index = 0; index < 1_000; index += 1) {
                cache.invalidate("alpha", {path: `file-${index}`, kind: "change"});
            }
            expect(cache.diagnostics().entries.alpha?.pendingEventCount).toBe(10);
            expect(cache.diagnostics().entries.alpha?.droppedEventCount).toBe(990);
            await vi.advanceTimersByTimeAsync(20);
            await vi.waitFor(() => expect(buildCount).toBe(1));

            expect(commits).toHaveLength(1);
            expect(commits[0]?.events).toHaveLength(10);
            expect(commits[0]?.dropped).toBe(990);
            await cache.closeAll();
        } finally {
            vi.useRealTimers();
        }
    });

    it("artifact ignore 不触发 dirty，watcher error 后可由 read 恢复", async () => {
        const watcherState: {callbacks: {
            onEvent(event: TestEvent): void;
            onError(error: Error): void;
        } | null} = {callbacks: null};
        let buildCount = 0;
        const options = cacheOptions(async () => buildResult(++buildCount));
        options.shouldIgnoreEvent = (event) => event.kind === "artifact";
        options.watcher = {
            open: ({onEvent, onError}) => {
                watcherState.callbacks = {onEvent, onError};
                return {close: () => undefined};
            },
        };
        const cache = new SnapshotCache(options);
        await cache.read("alpha");
        const activation = cache.activate("alpha");
        await activation.ready;

        watcherState.callbacks?.onEvent({path: ".cache/stats.json", kind: "artifact"});
        expect(cache.diagnostics().entries.alpha?.dirty).toBe(false);
        watcherState.callbacks?.onError(new Error("watch failed"));
        expect(cache.diagnostics().entries.alpha?.dirty).toBe(true);
        expect((await cache.read("alpha")).nodes[0]?.words).toBe(2);
        expect(cache.diagnostics().entries.alpha?.watcherError).toBe("watch failed");
        await activation.close();
    });

    it("root 删除事件与普通事件一样推进 generation 并重建空 snapshot", async () => {
        let rootDeleted = false;
        const options = cacheOptions(async () => rootDeleted ? {nodes: [], issues: ["root-missing"]} : buildResult(1));
        const cache = new SnapshotCache(options);
        await cache.read("alpha");
        rootDeleted = true;

        cache.invalidate("alpha", {path: "", kind: "change"});
        const snapshot = await cache.read("alpha");

        expect(snapshot.nodes).toEqual([]);
        expect(snapshot.issues).toEqual(["root-missing"]);
        expect(snapshot.generation).toBe(1);
        await cache.closeAll();
    });
});

describe("SnapshotCache 资源生命周期", () => {
    it("one-shot read 的无属主 entry 在默认 idle TTL 后自动释放", async () => {
        vi.useFakeTimers();
        try {
            const cache = new SnapshotCache(cacheOptions(async () => buildResult(1)));

            await cache.read("alpha");

            expect(cache.diagnostics()).toMatchObject({entryCount: 1, idleTimerCount: 1});
            await vi.advanceTimersByTimeAsync(4_999);
            expect(cache.diagnostics()).toMatchObject({entryCount: 1, idleTimerCount: 1});
            await vi.advanceTimersByTimeAsync(1);
            expect(cache.diagnostics()).toMatchObject({entryCount: 0, idleTimerCount: 0});
            await cache.closeAll();
        } finally {
            vi.useRealTimers();
        }
    });

    it("subscriber 持有期间不回收，取消订阅后重新开始 idle TTL", async () => {
        vi.useFakeTimers();
        try {
            const cache = new SnapshotCache(cacheOptions(async () => buildResult(1)));
            const unsubscribe = cache.subscribe("alpha", () => undefined);
            await cache.read("alpha");

            expect(cache.diagnostics()).toMatchObject({entryCount: 1, idleTimerCount: 0, subscriberCount: 1});
            await vi.advanceTimersByTimeAsync(5_000);
            expect(cache.diagnostics()).toMatchObject({entryCount: 1, idleTimerCount: 0});

            unsubscribe();
            expect(cache.diagnostics()).toMatchObject({entryCount: 1, idleTimerCount: 1, subscriberCount: 0});
            await vi.advanceTimersByTimeAsync(5_000);
            expect(cache.diagnostics()).toMatchObject({entryCount: 0, idleTimerCount: 0});
            await cache.closeAll();
        } finally {
            vi.useRealTimers();
        }
    });

    it("debounce 后台构建稳定提交后才开始 idle TTL", async () => {
        vi.useFakeTimers();
        try {
            let buildCount = 0;
            const options = cacheOptions(async () => buildResult(++buildCount));
            options.debounceMs = 100;
            options.idleTtlMs = 50;
            const cache = new SnapshotCache(options);

            cache.invalidate("alpha", {path: "manuscript/a.md", kind: "change"});
            expect(cache.diagnostics()).toMatchObject({entryCount: 1, timerCount: 1, idleTimerCount: 0});
            await vi.advanceTimersByTimeAsync(99);
            expect(buildCount).toBe(0);
            expect(cache.diagnostics()).toMatchObject({entryCount: 1, timerCount: 1, idleTimerCount: 0});

            await vi.advanceTimersByTimeAsync(1);
            expect(buildCount).toBe(1);
            expect(cache.diagnostics().entries.alpha).toMatchObject({building: false, pendingEventCount: 0, stableCommitCount: 1});
            expect(cache.diagnostics()).toMatchObject({entryCount: 1, timerCount: 0, idleTimerCount: 1});

            await vi.advanceTimersByTimeAsync(50);
            expect(cache.diagnostics()).toMatchObject({entryCount: 0, idleTimerCount: 0});
            await cache.closeAll();
        } finally {
            vi.useRealTimers();
        }
    });

    it("activation 持有期间取消 idle deadline，直到 handle 关闭", async () => {
        vi.useFakeTimers();
        try {
            const cache = new SnapshotCache(cacheOptions(async () => buildResult(1)));
            await cache.read("alpha");
            expect(cache.diagnostics().idleTimerCount).toBe(1);

            const activation = cache.activate("alpha");
            await activation.ready;
            expect(cache.diagnostics()).toMatchObject({entryCount: 1, idleTimerCount: 0});
            await vi.advanceTimersByTimeAsync(5_000);
            expect(cache.diagnostics().entryCount).toBe(1);

            await activation.close();
            expect(cache.diagnostics()).toMatchObject({entryCount: 0, idleTimerCount: 0});
            await cache.closeAll();
        } finally {
            vi.useRealTimers();
        }
    });

    it("read 只构建 snapshot，不隐式启动 watcher", async () => {
        let watcherOpenCount = 0;
        const options = cacheOptions(async () => buildResult(1));
        options.watcher = {
            open: () => {
                watcherOpenCount += 1;
                return {close: () => undefined};
            },
        };
        const cache = new SnapshotCache(options);

        const snapshot = await cache.read("alpha");

        expect(snapshot.nodes).toHaveLength(1);
        expect(watcherOpenCount).toBe(0);
        expect(cache.diagnostics()).toMatchObject({watcherCount: 0, watcherOpeningCount: 0});
        await cache.closeAll();
    });

    it("activate 同步返回 handle，ready 等待 watcher 成功打开", async () => {
        const opened = deferred<SnapshotWatchHandle>();
        let watcherOpenCount = 0;
        const options = cacheOptions(async () => buildResult(1));
        options.watcher = {
            open: () => {
                watcherOpenCount += 1;
                return opened.promise;
            },
        };
        const cache = new SnapshotCache(options);

        const activation = cache.activate("alpha");
        let ready = false;
        void activation.ready.then(() => { ready = true; });
        expect(activation).not.toBeInstanceOf(Promise);
        await waitFor(() => watcherOpenCount === 1);
        expect(ready).toBe(false);

        opened.resolve({close: () => undefined});
        await activation.ready;

        expect(ready).toBe(true);
        expect(cache.diagnostics()).toMatchObject({watcherCount: 1, watcherOpeningCount: 0});
        await activation.close();
        expect(cache.diagnostics().entryCount).toBe(0);
    });

    it("重复 activate 复用同一 handle，minimum-ready 不触发完整 build", async () => {
        let buildCount = 0;
        let watcherOpenCount = 0;
        const options = cacheOptions(async () => {
            buildCount += 1;
            return buildResult(1);
        });
        options.watcher = {
            open: () => {
                watcherOpenCount += 1;
                return {close: () => undefined};
            },
        };
        const cache = new SnapshotCache(options);

        const first = cache.activate("alpha");
        const second = cache.activate("alpha");
        await first.ready;

        expect(second).toBe(first);
        expect(watcherOpenCount).toBe(1);
        expect(buildCount).toBe(0);
        await first.close();
    });

    it("activate.ready 暴露 watcher 打开错误并保留诊断", async () => {
        const options = cacheOptions(async () => buildResult(1));
        options.watcher = {
            open: () => { throw new Error("open failed"); },
        };
        const cache = new SnapshotCache(options);

        const activation = cache.activate("alpha");

        await expect(activation.ready).rejects.toThrow("open failed");
        expect(cache.diagnostics().entries.alpha?.watcherError).toBe("open failed");
        await activation.close();
    });

    it("raw event batch 在 rebuild 前投递，builder 失败后不丢失也不重复", async () => {
        const watcherState: {emit: ((event: TestEvent) => void) | null} = {emit: null};
        let buildCount = 0;
        let stableCommitCount = 0;
        const markers: string[] = [];
        const rawBatches: TestEvent[][] = [];
        const options = cacheOptions(async () => {
            buildCount += 1;
            markers.push("build");
            if (buildCount === 1) {
                throw new Error("scan failed");
            }
            return buildResult(2);
        });
        options.watcher = {
            open: ({onEvent}) => {
                watcherState.emit = onEvent;
                return {close: () => undefined};
            },
        };
        const cache = new SnapshotCache(options);
        cache.subscribe("alpha", () => { stableCommitCount += 1; });
        const activation = cache.activate("alpha", {
            onRawEvents: (batch) => {
                markers.push("raw");
                rawBatches.push([...batch.events]);
            },
        });
        await activation.ready;

        watcherState.emit?.({path: "manuscript/chapter.md", kind: "change"});
        await waitFor(() => buildCount === 1 && cache.diagnostics().entries.alpha?.building === false);

        expect(markers).toEqual(["raw", "build"]);
        expect(rawBatches).toEqual([[{path: "manuscript/chapter.md", kind: "change"}]]);
        expect(stableCommitCount).toBe(0);

        const snapshot = await cache.read("alpha");

        expect(snapshot.nodes[0]?.words).toBe(2);
        expect(rawBatches).toHaveLength(1);
        expect(stableCommitCount).toBe(1);
        await activation.close();
    });

    it("raw callback 失败不阻断 rebuild，dropped event 同步进入对账账本", async () => {
        const watcherState: {emit: ((event: TestEvent) => void) | null} = {emit: null};
        let buildCount = 0;
        let rawEventCount = 0;
        let rawDroppedCount = 0;
        let stableEventCount = 0;
        let stableDroppedCount = 0;
        const options = cacheOptions(async () => {
            buildCount += 1;
            return buildResult(1);
        });
        options.debounceMs = 0;
        options.maxPendingEvents = 2;
        options.watcher = {
            open: ({onEvent}) => {
                watcherState.emit = onEvent;
                return {close: () => undefined};
            },
        };
        const cache = new SnapshotCache(options);
        cache.subscribe("alpha", (commit) => {
            stableEventCount = commit.events.length;
            stableDroppedCount = commit.droppedEventCount;
        });
        const activation = cache.activate("alpha", {
            onRawEvents: (batch) => {
                rawEventCount = batch.events.length;
                rawDroppedCount = batch.droppedEventCount;
                throw new Error("raw reconcile failed");
            },
        });
        await activation.ready;

        watcherState.emit?.({path: "manuscript/1.md", kind: "change"});
        watcherState.emit?.({path: "manuscript/2.md", kind: "change"});
        watcherState.emit?.({path: "manuscript/3.md", kind: "change"});
        await waitFor(() => buildCount === 1 && stableDroppedCount === 1);

        expect(rawEventCount).toBe(2);
        expect(rawDroppedCount).toBe(1);
        expect(stableEventCount).toBe(2);
        expect(stableDroppedCount).toBe(1);
        await activation.close();
    });

    it("旧 activation 的迟到 close 不会关闭同 key 的新 entry", async () => {
        const watcherCloseCounts = [0, 0];
        let watcherOpenCount = 0;
        const options = cacheOptions(async () => buildResult(1));
        options.watcher = {
            open: () => {
                const watcherIndex = watcherOpenCount;
                watcherOpenCount += 1;
                return {
                    close: () => { watcherCloseCounts[watcherIndex] += 1; },
                };
            },
        };
        const cache = new SnapshotCache(options);
        const oldActivation = cache.activate("alpha");
        await oldActivation.ready;
        await cache.close("alpha");

        const newActivation = cache.activate("alpha");
        await newActivation.ready;
        await oldActivation.close();

        expect(watcherCloseCounts).toEqual([1, 0]);
        expect(cache.diagnostics()).toMatchObject({entryCount: 1, watcherCount: 1});

        await newActivation.close();
        expect(watcherCloseCounts).toEqual([1, 1]);
        expect(cache.diagnostics().entryCount).toBe(0);
    });

    it("watcher close 失败时保留精确 handle，并允许同一 activation 重试", async () => {
        const closeFailure = new Error("watcher close failed");
        let closeCount = 0;
        const options = cacheOptions(async () => buildResult(1));
        options.watcher = {
            open: () => ({
                close: () => {
                    closeCount += 1;
                    if (closeCount === 1) {
                        throw closeFailure;
                    }
                },
            }),
        };
        const cache = new SnapshotCache(options);
        const activation = cache.activate("alpha");
        await activation.ready;

        await expect(activation.close()).rejects.toBe(closeFailure);
        expect(closeCount).toBe(1);
        expect(cache.diagnostics()).toMatchObject({entryCount: 1, watcherCount: 1});
        await expect(cache.read("alpha")).rejects.toBeInstanceOf(SnapshotClosedError);

        await expect(activation.close()).resolves.toBeUndefined();
        expect(closeCount).toBe(2);
        expect(cache.diagnostics()).toMatchObject({entryCount: 0, watcherCount: 0});
    });

    it("watcher.open 永不结束时 close 仍确定性返回并 abort", async () => {
        const opened = deferred<SnapshotWatchHandle>();
        const watcherState: {signal: AbortSignal | null} = {signal: null};
        let lateCloseCount = 0;
        const options = cacheOptions(async () => buildResult(1));
        options.watcher = {
            open: ({signal}) => {
                watcherState.signal = signal;
                return opened.promise;
            },
        };
        const cache = new SnapshotCache(options);
        const unsubscribe = cache.subscribe("alpha", () => undefined);
        cache.activate("alpha");
        await waitFor(() => watcherState.signal !== null);

        await expect(Promise.race([
            cache.close("alpha"),
            new Promise((_, reject) => setTimeout(() => reject(new Error("close timeout")), 100)),
        ])).resolves.toBeUndefined();
        expect(watcherState.signal?.aborted).toBe(true);
        expect(cache.diagnostics()).toMatchObject({
            entryCount: 0,
            timerCount: 0,
            watcherCount: 0,
            subscriberCount: 0,
        });
        unsubscribe();

        opened.resolve({close: () => { lateCloseCount += 1; }});
        await waitFor(() => lateCloseCount === 1);
        await cache.close("alpha");
    });

    it("watcher.open 失败由 ready 暴露，但不阻断 one-shot read", async () => {
        const options = cacheOptions(async () => buildResult(1));
        options.watcher = {
            open: () => { throw new Error("open failed"); },
        };
        const cache = new SnapshotCache(options);

        const activation = cache.activate("alpha");
        await expect(activation.ready).rejects.toThrow("open failed");
        const snapshot = await cache.read("alpha");

        expect(snapshot.nodes).toHaveLength(1);
        expect(cache.diagnostics().entries.alpha?.watcherError).toBe("open failed");
        await activation.close();
    });

    it("close-during-build 隔离忽略 AbortSignal 的 late result", async () => {
        const gate = deferred<ReturnType<typeof buildResult>>();
        const cache = new SnapshotCache(cacheOptions(async () => gate.promise));
        const read = cache.read("alpha");
        await waitFor(() => cache.diagnostics().activeBuildCount === 1);

        await cache.close("alpha");
        gate.resolve(buildResult(1));

        await expect(read).rejects.toBeInstanceOf(SnapshotClosedError);
        expect(cache.diagnostics().entryCount).toBe(0);
    });

    it("同 key 多消费者共享 build 时 close 会让所有等待者一致失败", async () => {
        const gate = deferred<ReturnType<typeof buildResult>>();
        let buildCount = 0;
        const cache = new SnapshotCache(cacheOptions(async () => {
            buildCount += 1;
            return gate.promise;
        }));
        const reads = Array.from({length: 100}, () => cache.read("alpha"));
        await waitFor(() => buildCount === 1);

        await cache.close("alpha");
        gate.resolve(buildResult(1));
        const results = await Promise.allSettled(reads);

        expect(results.every((result) => result.status === "rejected"
            && result.reason instanceof SnapshotClosedError)).toBe(true);
        expect(buildCount).toBe(1);
    });

    it("semaphore 排队期间 close 会取消 waiter，且不进入该 key builder", async () => {
        const activeGate = deferred<ReturnType<typeof buildResult>>();
        const builtKeys: string[] = [];
        const options = cacheOptions(async ({key}) => {
            builtKeys.push(key);
            return key === "active" ? activeGate.promise : buildResult(2);
        });
        options.maxConcurrentBuilds = 1;
        const cache = new SnapshotCache(options);
        const activeRead = cache.read("active");
        await waitFor(() => cache.diagnostics().activeBuildCount === 1);
        const queuedRead = cache.read("queued");
        await waitFor(() => cache.diagnostics().queuedBuildCount === 1);

        await cache.close("queued");
        await expect(queuedRead).rejects.toBeInstanceOf(SnapshotClosedError);
        expect(cache.diagnostics().queuedBuildCount).toBe(0);
        expect(builtKeys).toEqual(["active"]);

        activeGate.resolve(buildResult(1));
        await activeRead;
        await cache.closeAll();
    });

    it("closeAll 幂等，释放 entry/timer/watcher/subscriber 并拒绝后续 read", async () => {
        const options = cacheOptions(async () => buildResult(1));
        options.watcher = {open: () => ({close: () => undefined})};
        const cache = new SnapshotCache(options);
        cache.subscribe("alpha", () => undefined);
        const activation = cache.activate("alpha");
        await activation.ready;
        cache.invalidate("beta", {path: "b", kind: "change"});

        await Promise.all([cache.closeAll(), cache.closeAll()]);

        expect(cache.diagnostics()).toMatchObject({
            entryCount: 0,
            timerCount: 0,
            watcherCount: 0,
            watcherOpeningCount: 0,
            subscriberCount: 0,
        });
        await expect(cache.read("gamma")).rejects.toBeInstanceOf(SnapshotClosedError);
    });

    it("close-before-debounce 会取消 timer 且不调用 builder", async () => {
        vi.useFakeTimers();
        try {
            let buildCount = 0;
            const options = cacheOptions(async () => buildResult(++buildCount));
            options.debounceMs = 50;
            const cache = new SnapshotCache(options);
            cache.invalidate("alpha", {path: "pending", kind: "change"});

            await cache.close("alpha");
            await vi.advanceTimersByTimeAsync(50);

            expect(buildCount).toBe(0);
            expect(cache.diagnostics()).toMatchObject({entryCount: 0, timerCount: 0});
        } finally {
            vi.useRealTimers();
        }
    });

    it("closeAll 会等待已经开始的单 key watcher close", async () => {
        const closeGate = deferred<void>();
        const options = cacheOptions(async () => buildResult(1));
        options.watcher = {open: () => ({close: () => closeGate.promise})};
        const cache = new SnapshotCache(options);
        const activation = cache.activate("alpha");
        await activation.ready;
        const close = cache.close("alpha");
        let closeAllSettled = false;
        const closeAll = cache.closeAll().then(() => { closeAllSettled = true; });

        await new Promise<void>((resolve) => setImmediate(resolve));
        expect(closeAllSettled).toBe(false);
        closeGate.resolve();
        await Promise.all([close, closeAll]);
        expect(closeAllSettled).toBe(true);
    });

    it("closeAll 失败后保留资源并允许重试，同时继续拒绝新 entry", async () => {
        const closeFailure = new Error("watcher close failed");
        let closeCount = 0;
        const options = cacheOptions(async () => buildResult(1));
        options.watcher = {
            open: () => ({
                close: () => {
                    closeCount += 1;
                    if (closeCount === 1) {
                        throw closeFailure;
                    }
                },
            }),
        };
        const cache = new SnapshotCache(options);
        const activation = cache.activate("alpha");
        await activation.ready;

        await expect(cache.closeAll()).rejects.toBe(closeFailure);
        expect(cache.diagnostics()).toMatchObject({entryCount: 1, watcherCount: 1});
        await expect(cache.read("beta")).rejects.toBeInstanceOf(SnapshotClosedError);

        await expect(cache.closeAll()).resolves.toBeUndefined();
        expect(closeCount).toBe(2);
        expect(cache.diagnostics()).toMatchObject({entryCount: 0, watcherCount: 0});
    });

    it("有限资源关闭期间拒绝新的 read/invalidate/subscribe", async () => {
        const closeGate = deferred<void>();
        const options = cacheOptions(async () => buildResult(1));
        options.watcher = {open: () => ({close: () => closeGate.promise})};
        const cache = new SnapshotCache(options);
        const activation = cache.activate("alpha");
        await activation.ready;
        const close = cache.close("alpha");

        await expect(cache.read("alpha")).rejects.toBeInstanceOf(SnapshotClosedError);
        expect(() => cache.invalidate("alpha", {path: "late", kind: "change"})).toThrow(SnapshotClosedError);
        expect(() => cache.subscribe("alpha", () => undefined)).toThrow(SnapshotClosedError);

        closeGate.resolve();
        await close;
        expect(cache.diagnostics().entryCount).toBe(0);

        const reopened = await cache.read("alpha");
        expect(reopened.nodes[0]?.words).toBe(1);
        await cache.closeAll();
    });

    it("subscriber 抛错不会阻断其他 subscriber 或 commit", async () => {
        const cache = new SnapshotCache(cacheOptions(async () => buildResult(1)));
        let observedRevision = 0;
        cache.subscribe("alpha", () => { throw new Error("subscriber failed"); });
        cache.subscribe("alpha", (commit) => { observedRevision = commit.snapshot.revision; });

        const snapshot = await cache.read("alpha");
        await waitFor(() => observedRevision === 1);

        expect(snapshot.revision).toBe(1);
        await cache.closeAll();
    });

    it("subscriber 数量达到上限后拒绝新增，取消后可恢复容量", async () => {
        const options = cacheOptions(async () => buildResult(1));
        options.maxSubscribers = 2;
        const cache = new SnapshotCache(options);
        const unsubscribe = cache.subscribe("alpha", () => undefined);
        cache.subscribe("alpha", () => undefined);

        expect(() => cache.subscribe("alpha", () => undefined)).toThrow("maxSubscribers=2");
        unsubscribe();
        expect(() => cache.subscribe("alpha", () => undefined)).not.toThrow();
        await cache.closeAll();
    });
});
