import * as nodeFs from "node:fs";
import {performance} from "node:perf_hooks";
import {copyFile, mkdtemp, mkdir, rm, writeFile} from "node:fs/promises";
import {join} from "node:path";
import {fileURLToPath} from "node:url";
import {afterEach, describe, expect, it, vi} from "vitest";
import {lock, lockSync} from "proper-lockfile";
import {testHostPath} from "@notnotype/neuro-book-test-support/test-path";
import {validateProperLockfilePatch} from "#scripts/ci/validate-proper-lockfile-patch";

const repositoryRoot = fileURLToPath(new URL("../../", import.meta.url));

type PrecisionByPath = ReadonlyMap<string, number>;
type QuantizedFs = typeof nodeFs;
type LockOptions = NonNullable<Parameters<typeof lock>[1]> & {fs: QuantizedFs};
type HeartbeatObserver = {
    readonly count: number;
    reset(): void;
    observe(path: nodeFs.PathLike): void;
    waitFor(expected: number): Promise<void>;
};

describe("proper-lockfile mtime precision patch", () => {

    it("补丁登记、精确上游版本与安装载荷保持一致", async () => {
        await validateProperLockfilePatch();
    });
    it("传入 fixture root 时拒绝错位安装产物", async () => {
        const fixtureRoot = await nextRoot();
        const installedPackageRoot = join(fixtureRoot, "node_modules", "proper-lockfile");
        const sourcePackageRoot = join(repositoryRoot, "node_modules", "proper-lockfile");
        await mkdir(join(installedPackageRoot, "lib"), {recursive: true});
        await mkdir(join(fixtureRoot, "patches"), {recursive: true});
        await Promise.all([
            copyFile(join(repositoryRoot, "package.json"), join(fixtureRoot, "package.json")),
            copyFile(join(repositoryRoot, "bun.lock"), join(fixtureRoot, "bun.lock")),
            copyFile(join(repositoryRoot, "patches", "proper-lockfile@4.1.2.patch"), join(fixtureRoot, "patches", "proper-lockfile@4.1.2.patch")),
            copyFile(join(sourcePackageRoot, "lib", "mtime-precision.js"), join(installedPackageRoot, "lib", "mtime-precision.js")),
            copyFile(join(sourcePackageRoot, "lib", "lockfile.js"), join(installedPackageRoot, "lib", "lockfile.js")),
        ]);
        await writeFile(join(installedPackageRoot, "package.json"), "{\"version\":\"4.1.1\"}\n", "utf8");

        await expect(validateProperLockfilePatch(fixtureRoot)).rejects.toThrow("安装产物版本错误：4.1.1");
    });
    const roots: string[] = [];

    afterEach(async () => {
        vi.useRealTimers();
        await Promise.all(roots.splice(0).map((root) => rm(root, {recursive: true, force: true})));
    });

    it("2 秒 mtime 量化经过三轮心跳仍保持 async lease", async () => {
        vi.useFakeTimers({toFake: ["Date", "setTimeout", "clearTimeout"]});
        vi.setSystemTime(new Date("2026-09-07T00:00:01.123Z"));
        const root = await nextRoot();
        const target = join(root, "runtime.lease");
        const lockPath = `${target}.lock`;
        await writeFile(target, "", "utf8");
        let compromised: Error | undefined;
        const heartbeat = createHeartbeatObserver(lockPath);
        const fs = quantizedFs(new Map([[lockPath, 2_000]]), {
            onUtimesSuccess: (path) => heartbeat.observe(path),
        });
        const release = await lock(target, options(fs, {
            onCompromised: (error) => {
                compromised = error;
            },
        }));
        heartbeat.reset();

        try {
            await heartbeatRounds(3, heartbeat.waitFor);
            expect(heartbeat.count).toBeGreaterThanOrEqual(3);
            expect(compromised).toBeUndefined();
        } finally {
            await release().catch(() => undefined);
        }
    });

    it("1 毫秒 mtime 量化经过三轮心跳仍保持 async lease", async () => {
        vi.useFakeTimers({toFake: ["Date", "setTimeout", "clearTimeout"]});
        vi.setSystemTime(new Date("2026-09-07T00:00:01.123Z"));
        const root = await nextRoot();
        const target = join(root, "runtime-ms.lease");
        const lockPath = `${target}.lock`;
        await writeFile(target, "", "utf8");
        let compromised: Error | undefined;
        const heartbeat = createHeartbeatObserver(lockPath);
        const fs = quantizedFs(new Map([[lockPath, 1]]), {
            onUtimesSuccess: (path) => heartbeat.observe(path),
        });
        const release = await lock(target, options(fs, {
            onCompromised: (error) => {
                compromised = error;
            },
        }));
        heartbeat.reset();

        try {
            await heartbeatRounds(3, heartbeat.waitFor);
            expect(heartbeat.count).toBeGreaterThanOrEqual(3);
            expect(compromised).toBeUndefined();
        } finally {
            await release().catch(() => undefined);
        }
    });

    it("1000 毫秒 mtime 量化经过三轮心跳仍保持 async lease", async () => {
        vi.useFakeTimers({toFake: ["Date", "setTimeout", "clearTimeout"]});
        vi.setSystemTime(new Date("2026-09-07T00:00:01.123Z"));
        const root = await nextRoot();
        const target = join(root, "runtime-second.lease");
        const lockPath = `${target}.lock`;
        await writeFile(target, "", "utf8");
        let compromised: Error | undefined;
        const heartbeat = createHeartbeatObserver(lockPath);
        const fs = quantizedFs(new Map([[lockPath, 1_000]]), {
            onUtimesSuccess: (path) => heartbeat.observe(path),
        });
        const release = await lock(target, options(fs, {
            onCompromised: (error) => {
                compromised = error;
            },
        }));
        heartbeat.reset();

        try {
            await heartbeatRounds(3, heartbeat.waitFor);
            expect(heartbeat.count).toBeGreaterThanOrEqual(3);
            expect(compromised).toBeUndefined();
        } finally {
            await release().catch(() => undefined);
        }
    });
    it("探测期间跨越 2 秒边界后使用新基准并保持下一轮心跳健康", async () => {
        vi.useFakeTimers({toFake: ["Date", "setTimeout", "clearTimeout"]});
        vi.setSystemTime(new Date("2026-09-07T00:00:01.123Z"));
        const root = await nextRoot();
        const target = join(root, "runtime-cross-boundary.lease");
        const lockPath = `${target}.lock`;
        await writeFile(target, "", "utf8");
        let compromised: Error | undefined;
        let crossedBoundary = false;
        const fs = quantizedFs(new Map([[lockPath, 2_000]]), {
            onStat: (path) => {
                if (!crossedBoundary && String(path) === lockPath) {
                    crossedBoundary = true;
                    vi.setSystemTime(new Date("2026-09-07T00:00:04.001Z"));
                }
            },
        });
        const release = await lock(target, options(fs, {
            onCompromised: (error) => {
                compromised = error;
            },
        }));

        try {
            const observed = await new Promise<nodeFs.Stats>((resolve, reject) => {
                nodeFs.stat(lockPath, (error, stats) => error ? reject(error) : resolve(stats));
            });
            expect(observed.mtime.getTime()).toBe(new Date("2026-09-07T00:00:08.000Z").getTime());
            await heartbeatRounds(1);
            expect(compromised).toBeUndefined();
        } finally {
            await release().catch(() => undefined);
        }
    });

    it("同一个 fs adapter 在不同锁上不串用 mtime 精度", async () => {
        vi.useFakeTimers({toFake: ["Date", "setTimeout", "clearTimeout"]});
        vi.setSystemTime(new Date("2026-09-07T00:00:01.123Z"));
        const root = await nextRoot();
        const firstTarget = join(root, "first.lease");
        const secondTarget = join(root, "second.lease");
        await writeFile(firstTarget, "", "utf8");
        await writeFile(secondTarget, "", "utf8");
        const fs = quantizedFs(new Map([
            [`${firstTarget}.lock`, 1],
            [`${secondTarget}.lock`, 2_000],
        ]));
        const firstRelease = await lock(firstTarget, options(fs));
        await firstRelease();
        let compromised: Error | undefined;
        const secondRelease = await lock(secondTarget, options(fs, {
            onCompromised: (error) => {
                compromised = error;
            },
        }));

        try {
            await heartbeatRounds(3);
            expect(compromised).toBeUndefined();
        } finally {
            await secondRelease().catch(() => undefined);
        }
    });

    it("同一个 fs adapter 先用 2 秒再用 1 毫秒时不串用精度", async () => {
        vi.useFakeTimers({toFake: ["Date", "setTimeout", "clearTimeout"]});
        vi.setSystemTime(new Date("2026-09-07T00:00:01.123Z"));
        const root = await nextRoot();
        const firstTarget = join(root, "first-coarse.lease");
        const secondTarget = join(root, "second-fine.lease");
        await writeFile(firstTarget, "", "utf8");
        await writeFile(secondTarget, "", "utf8");
        const fs = quantizedFs(new Map([
            [`${firstTarget}.lock`, 2_000],
            [`${secondTarget}.lock`, 1],
        ]));
        const firstRelease = await lock(firstTarget, options(fs));
        await firstRelease();
        let compromised: Error | undefined;
        const secondRelease = await lock(secondTarget, options(fs, {
            onCompromised: (error) => {
                compromised = error;
            },
        }));

        try {
            await heartbeatRounds(3);
            expect(compromised).toBeUndefined();
        } finally {
            await secondRelease().catch(() => undefined);
        }
    });


    it("sync lease 在 2 秒 mtime 量化下保持健康", async () => {
        vi.useFakeTimers({toFake: ["Date", "setTimeout", "clearTimeout"]});
        vi.setSystemTime(new Date("2026-09-07T00:00:01.123Z"));
        const root = await nextRoot();
        const target = join(root, "runtime-sync.lease");
        const lockPath = `${target}.lock`;
        await writeFile(target, "", "utf8");
        let compromised: Error | undefined;
        const heartbeat = createHeartbeatObserver(lockPath);
        const fs = quantizedFs(new Map([[lockPath, 2_000]]), {
            onUtimesSuccess: (path) => heartbeat.observe(path),
        });
        const release = lockSync(target, options(fs, {
            onCompromised: (error) => {
                compromised = error;
            },
        }));
        heartbeat.reset();

        try {
            await heartbeatRounds(3, heartbeat.waitFor);
            expect(heartbeat.count).toBeGreaterThanOrEqual(3);
            expect(compromised).toBeUndefined();
        } finally {
            try {
                release();
            } catch {
                // Unpatched proper-lockfile marks the release callback as ERELEASED after ECOMPROMISED.
            }
        }
    });
    it("竞争者在持有期间收到 ELOCKED，释放后可重新取得", async () => {
        vi.useFakeTimers({toFake: ["Date", "setTimeout", "clearTimeout"]});
        vi.setSystemTime(new Date("2026-09-07T00:00:01.123Z"));
        const root = await nextRoot();
        const target = join(root, "competition.lease");
        await writeFile(target, "", "utf8");
        const fs = quantizedFs(new Map([[`${target}.lock`, 1_000]]));
        let release: (() => Promise<void>) | undefined = await lock(target, options(fs));

        try {
            const contender = await lock(target, options(fs)).catch((error: unknown) => error);
            expect(contender).toMatchObject({code: "ELOCKED"});
            await release();
            release = undefined;

            const reacquired = await lock(target, options(fs));
            await reacquired();
        } finally {
            await release?.().catch(() => undefined);
        }
    });


    it("mtime 无法按请求值更新时返回 ENOTSUP 且不重复获取", async () => {
        vi.useFakeTimers({toFake: ["Date", "setTimeout", "clearTimeout"]});
        vi.setSystemTime(new Date("2026-09-07T00:00:01.123Z"));
        const root = await nextRoot();
        const target = join(root, "unsupported.lease");
        await writeFile(target, "", "utf8");
        let mkdirCount = 0;
        const fs = quantizedFs(new Map(), {
            preserveUtimes: false,
            onMkdir: () => {
                mkdirCount += 1;
            },
        });

        const failure = await lock(target, options(fs, {retries: 2})).catch((error: unknown) => error);

        expect(failure).toMatchObject({code: "ENOTSUP"});
        expect(mkdirCount).toBe(1);
    });
    it("普通 I/O ENOTSUP 仍按 retries 重试", async () => {
        const root = await nextRoot();
        const target = join(root, "io-enotsup.lease");
        await writeFile(target, "", "utf8");
        let mkdirCount = 0;
        const fs = quantizedFs(new Map(), {
            onMkdir: () => {
                mkdirCount += 1;
            },
            onUtimes: () => Object.assign(new Error("filesystem rejected utimes"), {code: "ENOTSUP"}),
        });

        const failure = await lock(target, options(fs, {
            retries: {retries: 2, minTimeout: 0, maxTimeout: 0},
        })).catch((error: unknown) => error);

        expect(failure).toMatchObject({code: "ENOTSUP"});
        expect(mkdirCount).toBe(3);
    });

    it("持锁后 lock directory mtime 被改变时仍报告 ECOMPROMISED", async () => {
        vi.useFakeTimers({toFake: ["Date", "setTimeout", "clearTimeout"]});
        vi.setSystemTime(new Date("2026-09-07T00:00:01.123Z"));
        const root = await nextRoot();
        const target = join(root, "compromised.lease");
        await writeFile(target, "", "utf8");
        let compromised: Error | undefined;
        let compromisedWaiter: {resolve: () => void; reject: (error: Error) => void} | undefined;
        const compromisedReady = new Promise<void>((resolve, reject) => {
            compromisedWaiter = {resolve, reject};
        });
        const fs = quantizedFs(new Map([[`${target}.lock`, 2_000]]));
        const release = await lock(target, options(fs, {
            onCompromised: (error) => {
                compromised = error;
                compromisedWaiter?.resolve();
            },
        }));

        const externalFs = quantizedFs(new Map([[`${target}.lock`, 2_000]]));
        await new Promise<void>((resolve, reject) => {
            externalFs.utimes(
                `${target}.lock`,
                new Date("2020-01-01T00:00:00.000Z"),
                new Date("2020-01-01T00:00:00.000Z"),
                (error) => error ? reject(error) : resolve(),
            );
        });
        await vi.advanceTimersByTimeAsync(15_000);
        await Promise.race([
            compromisedReady,
            new Promise<never>((_, reject) => {
                const started = performance.now();
                const watchdog = (): void => {
                    if (performance.now() - started >= 1_000) {
                        reject(new Error("ECOMPROMISED callback timeout"));
                        return;
                    }
                    setImmediate(watchdog);
                };
                setImmediate(watchdog);
            }),
        ]);

        expect(compromised).toMatchObject({code: "ECOMPROMISED"});
        await release().catch(() => undefined);
    });

    async function nextRoot(): Promise<string> {
        const root = await mkdtemp(testHostPath("nbook-proper-lockfile-patch-"));
        roots.push(root);
        return root;
    }

    async function heartbeatRounds(count: number, waitForUpdate?: (expected: number) => Promise<void>): Promise<void> {
        for (let index = 0; index < count; index += 1) {
            await vi.advanceTimersByTimeAsync(15_000);
            if (waitForUpdate) {
                await waitForUpdate(index + 1);
            } else {
                await new Promise<void>((resolve) => nodeFs.stat(__filename, () => resolve()));
            }
        }
    }

    function createHeartbeatObserver(lockPath: string): HeartbeatObserver {
        let count = 0;
        let waiters: Array<{expected: number; resolve: () => void; reject: (error: Error) => void}> = [];
        return {
            get count() {
                return count;
            },
            reset() {
                count = 0;
                waiters = [];
            },
            observe(path) {
                if (String(path) !== lockPath) return;
                count += 1;
                const ready = waiters.filter((waiter) => waiter.expected <= count);
                waiters = waiters.filter((waiter) => waiter.expected > count);
                ready.forEach((waiter) => waiter.resolve());
            },
            waitFor(expected) {
                if (count >= expected) return Promise.resolve();
                return new Promise<void>((resolve, reject) => {
                    const waiter = {expected, resolve, reject};
                    waiters.push(waiter);
                    const started = performance.now();
                    const watchdog = (): void => {
                        if (count >= expected) return;
                        if (performance.now() - started >= 1_000) {
                            waiters = waiters.filter((candidate) => candidate !== waiter);
                            reject(new Error(`heartbeat update count ${count} < ${expected}`));
                            return;
                        }
                        setImmediate(watchdog);
                    };
                    setImmediate(watchdog);
                });
            },
        };
    }

});

function options(fs: QuantizedFs, overrides: Partial<LockOptions> = {}): LockOptions {
    return {
        stale: 30_000,
        update: 15_000,
        retries: 0,
        fs,
        ...overrides,
    };
}


function quantizedFs(
    precisionByPath: PrecisionByPath,
    input: {
        preserveUtimes?: boolean;
        onMkdir?: () => void;
        onStat?: (path: nodeFs.PathLike) => void;
        onUtimes?: (path: nodeFs.PathLike) => Error | undefined;
        onUtimesSuccess?: (path: nodeFs.PathLike) => void;
    } = {},
): QuantizedFs {
    const preserveUtimes = input.preserveUtimes ?? true;
    const fs = {...nodeFs} as QuantizedFs;
    const quantize = (path: nodeFs.PathLike, date: Date): Date => {
        const precision = precisionByPath.get(String(path)) ?? 1;
        return new Date(Math.floor(date.getTime() / precision) * precision);
    };
    const quantizedStats = (path: nodeFs.PathLike, stats: nodeFs.Stats): nodeFs.Stats => {
        const mtime = quantize(path, stats.mtime);
        return Object.assign(stats, {mtime, mtimeMs: mtime.getTime()});
    };

    fs.mkdir = ((path, callback) => {
        nodeFs.mkdir(path, (error) => {
            if (!error) input.onMkdir?.();
            callback(error);
        });
    }) as typeof nodeFs.mkdir;
    fs.mkdirSync = ((path, options) => {
        const result = nodeFs.mkdirSync(path, options as nodeFs.MakeDirectoryOptions | undefined);
        input.onMkdir?.();
        return result;
    }) as typeof nodeFs.mkdirSync;
    fs.stat = ((path, callback) => {
        nodeFs.stat(path, (error, stats) => {
            if (!error && stats) input.onStat?.(path);
            callback(error, error || !stats ? stats : quantizedStats(path, stats));
        });
    }) as typeof nodeFs.stat;
    fs.statSync = ((path, options) => {
        input.onStat?.(path);
        return quantizedStats(path, nodeFs.statSync(path, options as nodeFs.StatOptions | undefined));
    }) as typeof nodeFs.statSync;
    fs.utimes = ((path, atime, mtime, callback) => {
        const injectedError = input.onUtimes?.(path);
        if (injectedError) {
            callback(injectedError);
            return;
        }
        if (!preserveUtimes) {
            callback(null);
            return;
        }
        nodeFs.utimes(path, quantize(path, atime), quantize(path, mtime), (error) => {
            if (!error) input.onUtimesSuccess?.(path);
            callback(error);
        });
    }) as typeof nodeFs.utimes;
    fs.utimesSync = (path, atime, mtime) => {
        input.onUtimes?.(path);
        if (preserveUtimes) {
            nodeFs.utimesSync(path, quantize(path, atime), quantize(path, mtime));
            input.onUtimesSuccess?.(path);
        }
    };
    return fs;
}
