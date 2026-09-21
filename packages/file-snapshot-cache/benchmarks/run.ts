import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {createHash} from "node:crypto";
import {execFile} from "node:child_process";
import {promisify} from "node:util";
import {fileURLToPath} from "node:url";
import {SnapshotCache, type SnapshotWatcher} from "#cache/index";

interface SyntheticNode {
    path: string;
    kind: "file" | "directory";
    words: number;
    content: string;
}

interface SyntheticEvent {
    path: string;
}

interface Distribution {
    samples: number;
    minMs: number;
    p50Ms: number;
    p95Ms: number;
    p99Ms: number;
    maxMs: number;
}

interface SizeBenchmark {
    nodeCount: number;
    coldCommit: Distribution;
    heapDeltaBytes: number;
    warmBuilderCalls: number;
    warmRead: Distribution;
}

interface BenchmarkReport {
    generatedAt: string;
    seed: number;
    environment: {
        platform: string;
        release: string;
        architecture: string;
        cpu: string;
        logicalCpuCount: number;
        totalMemoryBytes: number;
        nodeVersion: string;
        bunVersion: string | null;
        repositoryRevision: string;
        packageSourceSha256: string;
        filesystemPath: string;
        filesystemType: string;
    };
    parameters: {
        sizes: number[];
        coldSamples: number;
        warmSamples: number;
        memoryWarmupCycles: number;
        rebuildCycles: number;
        resourceKeys: number;
    };
    sizes: SizeBenchmark[];
    concurrentColdReaders: {
        readers: number;
        buildCount: number;
        totalMs: number;
    };
    eventBurst: {
        eventCount: number;
        maxPendingEvents: number;
        buildCount: number;
        droppedEventCount: number;
        totalMs: number;
    };
    rebuildMemory: {
        cycles: number;
        nodeCount: number;
        heapStartBytes: number;
        heapEndBytes: number;
        heapSlopeBytesPerCycle: number;
        heapSlopeR2: number;
        rssStartBytes: number;
        rssEndBytes: number;
        rssSlopeBytesPerCycle: number;
        rssSlopeR2: number;
        gcAvailable: boolean;
    };
    resourceLifecycle: {
        keys: number;
        peakWatcherCount: number;
        entriesAfterClose: number;
        timersAfterClose: number;
        idleTimersAfterClose: number;
        watchersAfterClose: number;
        subscribersAfterClose: number;
        activeResourcesBefore: number;
        activeResourcesAfter: number;
        watcherCloseCount: number;
    };
    gates: {
        concurrentBuildDeduplicated: boolean;
        eventBurstBounded: boolean;
        closeAllReleasedOwnedResources: boolean;
        warmReadsAvoidBuilder: boolean;
        retainedHeap: "pass" | "risk" | "unavailable";
        retainedRss: "pass" | "risk";
    };
    notes: string[];
}

const SEED = 114_202_607;
const SIZES = [1_000, 10_000, 50_000];
const COLD_SAMPLES = 20;
const WARM_SAMPLES = 2_000;
const MEMORY_WARMUP_CYCLES = 25;
const REBUILD_CYCLES = 100;
const RESOURCE_KEYS = 100;
const benchmarkDirectory = path.dirname(fileURLToPath(import.meta.url));
const resultsDirectory = path.join(benchmarkDirectory, "results");
const execFileAsync = promisify(execFile);

/** 运行独立 package baseline 并落盘 JSON/Markdown。 */
async function main(): Promise<void> {
    const packageSourceSha256 = await hashPackageSource();
    const filesystemType = await detectFilesystemType();
    const sizeResults: SizeBenchmark[] = [];
    for (const nodeCount of SIZES) {
        sizeResults.push(await benchmarkSize(nodeCount));
    }
    const concurrentColdReaders = await benchmarkConcurrentReaders();
    const eventBurst = await benchmarkEventBurst();
    const rebuildMemory = await benchmarkRebuildMemory();
    const resourceLifecycle = await benchmarkResourceLifecycle();
    const report: BenchmarkReport = {
        generatedAt: new Date().toISOString(),
        seed: SEED,
        environment: {
            platform: os.platform(),
            release: os.release(),
            architecture: os.arch(),
            cpu: os.cpus()[0]?.model ?? "unknown",
            logicalCpuCount: os.cpus().length,
            totalMemoryBytes: os.totalmem(),
            nodeVersion: process.version,
            bunVersion: process.versions.bun ?? null,
            repositoryRevision: await readRepositoryRevision(),
            packageSourceSha256,
            filesystemPath: process.cwd(),
            filesystemType,
        },
        parameters: {
            sizes: SIZES,
            coldSamples: COLD_SAMPLES,
            warmSamples: WARM_SAMPLES,
            memoryWarmupCycles: MEMORY_WARMUP_CYCLES,
            rebuildCycles: REBUILD_CYCLES,
            resourceKeys: RESOURCE_KEYS,
        },
        sizes: sizeResults,
        concurrentColdReaders,
        eventBurst,
        rebuildMemory,
        resourceLifecycle,
        gates: {
            concurrentBuildDeduplicated: concurrentColdReaders.buildCount === 1,
            eventBurstBounded: eventBurst.buildCount === 1 && eventBurst.droppedEventCount === 900,
            closeAllReleasedOwnedResources: resourceLifecycle.entriesAfterClose === 0
                && resourceLifecycle.timersAfterClose === 0
                && resourceLifecycle.idleTimersAfterClose === 0
                && resourceLifecycle.watchersAfterClose === 0
                && resourceLifecycle.subscribersAfterClose === 0
                && resourceLifecycle.watcherCloseCount === resourceLifecycle.keys,
            warmReadsAvoidBuilder: sizeResults.every((result) => result.warmBuilderCalls === 0),
            retainedHeap: assessHeap(rebuildMemory, process.versions.bun !== undefined),
            retainedRss: rebuildMemory.rssSlopeR2 >= 0.9
                && rebuildMemory.rssSlopeBytesPerCycle > 1_048_576 ? "risk" : "pass",
        },
        notes: [
            "synthetic benchmark 只测 cache 编排和生命周期，不代表真实 WorkspaceFileNode 文件扫描延迟。",
            "无生产消费者的 projection/store Interface 已删除；本报告只覆盖 File Index 实际需要的 snapshot 行为。",
            "heap/RSS 风险探测要求高拟合度的正向线性增长；RSS 阈值只用于识别明显风险，不是产品延迟或内存预算。",
            "报告不运行 git status；repository revision 与 package source SHA-256 共同标识本次输入，后者覆盖未提交 package 内容。",
        ],
    };
    await fs.mkdir(resultsDirectory, {recursive: true});
    const runtimeName = report.environment.bunVersion ? "bun" : "node";
    await fs.writeFile(path.join(resultsDirectory, `baseline-${runtimeName}.json`), `${JSON.stringify(report, null, 2)}\n`, "utf8");
    await fs.writeFile(path.join(resultsDirectory, `baseline-${runtimeName}.md`), renderMarkdown(report), "utf8");
    process.stdout.write(`${renderMarkdown(report)}\n`);
    assertStructuralGates(report);
}

/** 测量指定节点规模下的 cold commit 与 warm read。 */
async function benchmarkSize(nodeCount: number): Promise<SizeBenchmark> {
    forceGc();
    const heapBefore = process.memoryUsage().heapUsed;
    const nodes = createNodes(nodeCount, 0);
    let buildCount = 0;
    const cache = createCache(async () => {
        buildCount += 1;
        return {nodes, issues: []};
    });
    await cache.read(`size-${nodeCount}`);
    forceGc();
    const heapDeltaBytes = process.memoryUsage().heapUsed - heapBefore;
    const warmDurations: number[] = [];
    const builderCallsBeforeWarm = buildCount;
    for (let sample = 0; sample < WARM_SAMPLES; sample += 1) {
        const startedAt = performance.now();
        await cache.read(`size-${nodeCount}`);
        warmDurations.push(performance.now() - startedAt);
    }
    await cache.closeAll();
    const coldDurations: number[] = [];
    for (let sample = 0; sample < COLD_SAMPLES; sample += 1) {
        const coldCache = createCache(async () => ({nodes, issues: []}));
        const startedAt = performance.now();
        await coldCache.read(`cold-${nodeCount}-${sample}`);
        coldDurations.push(performance.now() - startedAt);
        await coldCache.closeAll();
    }
    return {
        nodeCount,
        coldCommit: distribution(coldDurations),
        heapDeltaBytes,
        warmBuilderCalls: buildCount - builderCallsBeforeWarm,
        warmRead: distribution(warmDurations),
    };
}

/** 测量 100 个 cold reader 是否只触发一次 builder。 */
async function benchmarkConcurrentReaders(): Promise<BenchmarkReport["concurrentColdReaders"]> {
    let buildCount = 0;
    const nodes = createNodes(10_000, 0);
    const cache = createCache(async () => {
        buildCount += 1;
        await new Promise<void>((resolve) => setImmediate(resolve));
        return {nodes, issues: []};
    });
    const startedAt = performance.now();
    await Promise.all(Array.from({length: 100}, () => cache.read("concurrent")));
    const totalMs = performance.now() - startedAt;
    await cache.closeAll();
    return {readers: 100, buildCount, totalMs};
}

/** 测量 1k 事件的 pending 上限、丢弃数与 debounce rebuild 次数。 */
async function benchmarkEventBurst(): Promise<BenchmarkReport["eventBurst"]> {
    let buildCount = 0;
    let droppedEventCount = 0;
    const watcherState: {onEvent: ((event: SyntheticEvent) => void) | null} = {onEvent: null};
    const cache = createCache(async () => ({nodes: createNodes(1_000, buildCount++), issues: []}), {
        debounceMs: 5,
        maxPendingEvents: 100,
        watcher: {
            open: (input) => {
                watcherState.onEvent = input.onEvent;
                return {close: () => undefined};
            },
        },
    });
    cache.subscribe("events", (commit) => {
        droppedEventCount = commit.droppedEventCount;
    });
    const activation = cache.activate("events");
    await activation.ready;
    const startedAt = performance.now();
    for (let index = 0; index < 1_000; index += 1) {
        watcherState.onEvent?.({path: `event-${index}`});
    }
    await waitFor(() => cache.diagnostics().entries.events?.stableCommitCount === 1);
    const totalMs = performance.now() - startedAt;
    const diagnostics = cache.diagnostics().entries.events;
    await cache.closeAll();
    return {
        eventCount: 1_000,
        maxPendingEvents: 100,
        buildCount: diagnostics?.buildCount ?? 0,
        droppedEventCount,
        totalMs,
    };
}

/** 测量 100 次 fresh-node rebuild 后强制 GC 的 heap/RSS 趋势。 */
async function benchmarkRebuildMemory(): Promise<BenchmarkReport["rebuildMemory"]> {
    let buildSequence = 0;
    const cache = createCache(async () => ({nodes: createNodes(10_000, buildSequence++), issues: []}));
    const heapSamples: number[] = [];
    const rssSamples: number[] = [];
    for (let cycle = 0; cycle < MEMORY_WARMUP_CYCLES; cycle += 1) {
        if (cycle > 0) {
            cache.invalidate("memory", {path: `warmup-${cycle}`});
        }
        await cache.read("memory");
        forceGc();
    }
    for (let cycle = 0; cycle < REBUILD_CYCLES; cycle += 1) {
        cache.invalidate("memory", {path: `cycle-${cycle}`});
        await cache.read("memory");
        forceGc();
        const memory = process.memoryUsage();
        heapSamples.push(memory.heapUsed);
        rssSamples.push(memory.rss);
    }
    await cache.closeAll();
    forceGc();
    const heapTrend = linearTrend(heapSamples);
    const rssTrend = linearTrend(rssSamples);
    return {
        cycles: REBUILD_CYCLES,
        nodeCount: 10_000,
        heapStartBytes: heapSamples[0] ?? 0,
        heapEndBytes: heapSamples.at(-1) ?? 0,
        heapSlopeBytesPerCycle: heapTrend.slope,
        heapSlopeR2: heapTrend.r2,
        rssStartBytes: rssSamples[0] ?? 0,
        rssEndBytes: rssSamples.at(-1) ?? 0,
        rssSlopeBytesPerCycle: rssTrend.slope,
        rssSlopeR2: rssTrend.r2,
        gcAvailable: typeof globalThis.gc === "function",
    };
}

/** 测量 100 key watcher/subscriber/entry 的 closeAll 资源回落。 */
async function benchmarkResourceLifecycle(): Promise<BenchmarkReport["resourceLifecycle"]> {
    const activeResourcesBefore = process.getActiveResourcesInfo().length;
    let watcherCloseCount = 0;
    const cache = createCache(async ({key}) => ({nodes: [{path: key, kind: "file", words: 1, content: "x"}], issues: []}), {
        watcher: {open: () => ({close: () => { watcherCloseCount += 1; }})},
    });
    for (let index = 0; index < RESOURCE_KEYS; index += 1) {
        const key = `resource-${index}`;
        cache.subscribe(key, () => undefined);
        const activation = cache.activate(key);
        await Promise.all([activation.ready, cache.read(key)]);
    }
    await waitFor(() => cache.diagnostics().watcherCount === RESOURCE_KEYS);
    const peakWatcherCount = cache.diagnostics().watcherCount;
    await cache.closeAll();
    await new Promise<void>((resolve) => setImmediate(resolve));
    const diagnostics = cache.diagnostics();
    return {
        keys: RESOURCE_KEYS,
        peakWatcherCount,
        entriesAfterClose: diagnostics.entryCount,
        timersAfterClose: diagnostics.timerCount,
        idleTimersAfterClose: diagnostics.idleTimerCount,
        watchersAfterClose: diagnostics.watcherCount,
        subscribersAfterClose: diagnostics.subscriberCount,
        activeResourcesBefore,
        activeResourcesAfter: process.getActiveResourcesInfo().length,
        watcherCloseCount,
    };
}

/** 创建 synthetic cache。 */
function createCache(
    build: (input: {key: string; signal: AbortSignal}) => Promise<{nodes: SyntheticNode[]; issues: string[]}>,
    overrides: {
        debounceMs?: number;
        maxPendingEvents?: number;
        watcher?: SnapshotWatcher<string, SyntheticEvent>;
    } = {},
): SnapshotCache<string, SyntheticNode, string, SyntheticEvent> {
    return new SnapshotCache({
        keyId: (key) => key,
        builder: {build},
        eventId: (event) => event.path,
        debounceMs: overrides.debounceMs ?? 0,
        maxPendingEvents: overrides.maxPendingEvents,
        watcher: overrides.watcher,
    });
}

/** 创建固定 seed、指定规模与世代的 synthetic typed nodes。 */
function createNodes(count: number, generation: number, contentSize = 32): SyntheticNode[] {
    const nodes = new Array<SyntheticNode>(count);
    for (let index = 0; index < count; index += 1) {
        const value = (Math.imul(index + 1, SEED) + generation) >>> 0;
        nodes[index] = {
            path: `manuscript/volume-${value % 20}/chapter-${index}.md`,
            kind: "file",
            words: value % 2_000,
            content: `fixture-${generation}-${value.toString(16)}-${"x".repeat(contentSize)}`,
        };
    }
    return nodes;
}

/** 计算延迟分位数。 */
function distribution(samples: number[]): Distribution {
    const sorted = [...samples].sort((left, right) => left - right);
    return {
        samples: sorted.length,
        minMs: sorted[0] ?? 0,
        p50Ms: percentile(sorted, 0.5),
        p95Ms: percentile(sorted, 0.95),
        p99Ms: percentile(sorted, 0.99),
        maxMs: sorted.at(-1) ?? 0,
    };
}

/** 读取已排序样本的 nearest-rank 分位数。 */
function percentile(sorted: number[], ratio: number): number {
    return sorted[Math.min(sorted.length - 1, Math.max(0, Math.ceil(sorted.length * ratio) - 1))] ?? 0;
}

/** 计算按 cycle 的最小二乘 slope 与 R2。 */
function linearTrend(values: number[]): {slope: number; r2: number} {
    const count = values.length;
    const xMean = (count - 1) / 2;
    const yMean = values.reduce((total, value) => total + value, 0) / count;
    let covariance = 0;
    let xVariance = 0;
    let yVariance = 0;
    for (let index = 0; index < count; index += 1) {
        const xDelta = index - xMean;
        const yDelta = values[index]! - yMean;
        covariance += xDelta * yDelta;
        xVariance += xDelta * xDelta;
        yVariance += yDelta * yDelta;
    }
    const slope = covariance / xVariance;
    const r2 = yVariance === 0 ? 0 : (covariance * covariance) / (xVariance * yVariance);
    return {slope, r2};
}

/** Bun 当前 heapUsed 采样恒定，无法据此判断 retained heap；Node 使用斜率和拟合度识别明显风险。 */
function assessHeap(
    memory: BenchmarkReport["rebuildMemory"],
    isBun: boolean,
): "pass" | "risk" | "unavailable" {
    if (isBun && memory.heapStartBytes === memory.heapEndBytes && memory.heapSlopeR2 === 0) {
        return "unavailable";
    }
    return memory.heapSlopeR2 >= 0.9 && memory.heapSlopeBytesPerCycle > 16_384 ? "risk" : "pass";
}

/** 在 Node --expose-gc 下采集 retained heap；其他 runtime 明确标记不可用。 */
function forceGc(): void {
    globalThis.gc?.();
}

/** 不调用 git 命令，从 .git/HEAD 元数据读取 revision。 */
async function readRepositoryRevision(): Promise<string> {
    try {
        const repositoryRoot = path.resolve(benchmarkDirectory, "../../..");
        const head = (await fs.readFile(path.join(repositoryRoot, ".git/HEAD"), "utf8")).trim();
        if (!head.startsWith("ref: ")) {
            return head;
        }
        return (await fs.readFile(path.join(repositoryRoot, ".git", head.slice(5)), "utf8")).trim();
    } catch {
        return "unknown";
    }
}

/** 计算 package 源码、配置、测试与 benchmark runner 的稳定输入指纹，不包含生成报告。 */
async function hashPackageSource(): Promise<string> {
    const packageDirectory = path.resolve(benchmarkDirectory, "..");
    const files = [
        "package.json",
        "README.md",
        "tsconfig.json",
        "vitest.config.ts",
        ...(await listTypeScriptFiles(path.join(packageDirectory, "src"))).map((filePath) => path.relative(packageDirectory, filePath)),
        ...(await listTypeScriptFiles(path.join(packageDirectory, "tests"))).map((filePath) => path.relative(packageDirectory, filePath)),
        path.relative(packageDirectory, fileURLToPath(import.meta.url)),
    ].sort();
    const hash = createHash("sha256");
    for (const relativePath of files) {
        hash.update(relativePath.replaceAll("\\", "/"));
        hash.update("\0");
        hash.update(await fs.readFile(path.join(packageDirectory, relativePath)));
        hash.update("\0");
    }
    return hash.digest("hex");
}

/** 识别 benchmark 所在文件系统；Windows 优先读取卷类型，失败再回退 statfs magic。 */
async function detectFilesystemType(): Promise<string> {
    if (process.platform === "win32") {
        const driveLetter = path.parse(process.cwd()).root.slice(0, 1);
        try {
            const result = await execFileAsync("powershell", [
                "-NoProfile",
                "-Command",
                `(Get-Volume -DriveLetter '${driveLetter}').FileSystemType`,
            ]);
            const value = result.stdout.trim();
            if (value) {
                return value;
            }
        } catch {
            // 部分受限 Windows 环境不允许 Get-Volume，继续使用 Node statfs 回退。
        }
    }
    const filesystem = await fs.statfs(process.cwd());
    return `statfs:0x${filesystem.type.toString(16)}`;
}

/** 递归列出目录内 TypeScript 源文件。 */
async function listTypeScriptFiles(directoryPath: string): Promise<string[]> {
    const entries = await fs.readdir(directoryPath, {withFileTypes: true});
    const nested = await Promise.all(entries.map(async (entry) => {
        const entryPath = path.join(directoryPath, entry.name);
        if (entry.isDirectory()) {
            return listTypeScriptFiles(entryPath);
        }
        return entry.isFile() && entry.name.endsWith(".ts") ? [entryPath] : [];
    }));
    return nested.flat();
}

/** 输出便于审查的 Markdown baseline。 */
function renderMarkdown(report: BenchmarkReport): string {
    const sizeRows = report.sizes.map((result) => `| ${result.nodeCount.toLocaleString("en-US")} | ${formatMs(result.coldCommit.p50Ms)} | ${formatMs(result.coldCommit.p95Ms)} | ${formatMs(result.coldCommit.p99Ms)} | ${formatMs(result.warmRead.p50Ms)} | ${formatMs(result.warmRead.p95Ms)} | ${formatMs(result.warmRead.p99Ms)} | ${formatBytes(result.heapDeltaBytes)} |`).join("\n");
    const gateRows = Object.entries(report.gates).map(([name, value]) => `| ${name} | ${renderGate(value)} |`).join("\n");
    return `# file-snapshot-cache benchmark baseline\n\n生成时间：${report.generatedAt}\n\n> 本报告只测独立 cache 编排与资源生命周期，不代表真实 WorkspaceFileNode 文件扫描延迟。\n\n## Environment\n\n- OS: ${report.environment.platform} ${report.environment.release} (${report.environment.architecture})\n- CPU: ${report.environment.cpu}, ${report.environment.logicalCpuCount} logical CPUs\n- Memory: ${formatBytes(report.environment.totalMemoryBytes)}\n- Node: ${report.environment.nodeVersion}\n- Bun: ${report.environment.bunVersion ?? "not used for this run"}\n- Revision: ${report.environment.repositoryRevision}\n- Package source SHA-256: ${report.environment.packageSourceSha256}\n- Filesystem: ${report.environment.filesystemType}, path ${report.environment.filesystemPath}\n- Seed: ${report.seed}\n\n## Node scale\n\n| Nodes | Cold p50 | Cold p95 | Cold p99 | Warm p50 | Warm p95 | Warm p99 | Heap delta |\n|---:|---:|---:|---:|---:|---:|---:|---:|\n${sizeRows}\n\n## Concurrency and events\n\n- 100 concurrent cold readers: build count ${report.concurrentColdReaders.buildCount}, total ${formatMs(report.concurrentColdReaders.totalMs)}\n- 1k event burst: build count ${report.eventBurst.buildCount}, dropped ${report.eventBurst.droppedEventCount}, total ${formatMs(report.eventBurst.totalMs)}\n\n## Memory and resources\n\n- 100 rebuilds / 10k fresh nodes: heap ${formatBytes(report.rebuildMemory.heapStartBytes)} -> ${formatBytes(report.rebuildMemory.heapEndBytes)}, slope ${formatBytes(report.rebuildMemory.heapSlopeBytesPerCycle)}/cycle, R2 ${report.rebuildMemory.heapSlopeR2.toFixed(4)}\n- RSS: ${formatBytes(report.rebuildMemory.rssStartBytes)} -> ${formatBytes(report.rebuildMemory.rssEndBytes)}, slope ${formatBytes(report.rebuildMemory.rssSlopeBytesPerCycle)}/cycle, R2 ${report.rebuildMemory.rssSlopeR2.toFixed(4)}\n- 100 key closeAll: entries ${report.resourceLifecycle.entriesAfterClose}, debounce timers ${report.resourceLifecycle.timersAfterClose}, idle timers ${report.resourceLifecycle.idleTimersAfterClose}, watchers ${report.resourceLifecycle.watchersAfterClose}, subscribers ${report.resourceLifecycle.subscribersAfterClose}\n- Node active resources: ${report.resourceLifecycle.activeResourcesBefore} -> ${report.resourceLifecycle.activeResourcesAfter}\n\n## Structural gates\n\n| Gate | Result |\n|---|---|\n${gateRows}\n\n## Notes\n\n${report.notes.map((note) => `- ${note}`).join("\n")}\n`;
}

/** 将结构门禁值渲染成无歧义中文状态。 */
function renderGate(value: boolean | "pass" | "risk" | "unavailable"): string {
    if (value === true || value === "pass") {
        return "通过";
    }
    if (value === "risk") {
        return "风险";
    }
    if (value === "unavailable") {
        return "不可用";
    }
    return "失败";
}

/** 结构性 invariant 失败时让 benchmark 命令直接失败，防止只生成一份红色报告。 */
function assertStructuralGates(report: BenchmarkReport): void {
    const failures = Object.entries(report.gates).filter(([, value]) => value === false || value === "risk");
    if (failures.length > 0) {
        throw new Error(`benchmark structural gates failed: ${failures.map(([name]) => name).join(", ")}`);
    }
}

/** 格式化毫秒。 */
function formatMs(value: number): string {
    return `${value.toFixed(3)} ms`;
}

/** 格式化 byte。 */
function formatBytes(value: number): string {
    const absolute = Math.abs(value);
    if (absolute >= 1_073_741_824) {
        return `${(value / 1_073_741_824).toFixed(2)} GiB`;
    }
    if (absolute >= 1_048_576) {
        return `${(value / 1_048_576).toFixed(2)} MiB`;
    }
    if (absolute >= 1_024) {
        return `${(value / 1_024).toFixed(2)} KiB`;
    }
    return `${value.toFixed(0)} B`;
}

/** 等待 benchmark 的异步资源状态达到预期。 */
async function waitFor(predicate: () => boolean, timeoutMs = 5_000): Promise<void> {
    const startedAt = performance.now();
    while (!predicate()) {
        if (performance.now() - startedAt > timeoutMs) {
            throw new Error(`benchmark condition timed out after ${timeoutMs}ms`);
        }
        await new Promise<void>((resolve) => setImmediate(resolve));
    }
}

await main();
