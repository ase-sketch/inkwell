import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {createHash} from "node:crypto";
import {fileURLToPath} from "node:url";
import {SnapshotCache} from "nbook/packages/file-snapshot-cache/src/index";
import {runtimePathsFromEnv} from "nbook/server/runtime/paths/runtime-paths";
import type {AbsoluteFsPath} from "nbook/server/runtime/paths/file-path";
import {
    normalizeProjectPath,
    resolveProjectWorkspaceRoot,
} from "nbook/server/workspace-files/project-path";
import {
    listProjectWorkspaces,
    type ProjectListItem,
} from "nbook/server/workspace-files/project-workspace";
import {
    scanWorkspaceTree,
    type WorkspaceFileNode,
} from "nbook/server/workspace-files/workspace-files";

interface ProjectStatistics {
    nodeCount: number;
    volumeCount: number;
    chapterCount: number;
    totalWords: number;
    lorebookCount: number;
}

interface Distribution {
    samples: number;
    minMs: number;
    p50Ms: number;
    p95Ms: number;
    p99Ms: number;
    maxMs: number;
}

interface ProjectScanResult {
    projectPath: string;
    title: string;
    scanMs: number;
    derive: Distribution;
    nodeCount: number;
    fileCount: number;
    directoryCount: number;
    contentNodeCount: number;
    markdownFileCount: number;
    totalNodeBytes: number;
    heapDeltaBytes: number;
    statistics: ProjectStatistics;
    topLevel: Array<{name: string; nodes: number; files: number; bytes: number; scanMs: number | null}>;
    largestFiles: Array<{path: string; bytes: number}>;
    error: string | null;
}

interface TimedProjectScan {
    projectPath: string;
    durationMs: number;
    nodeCount: number;
    error: string | null;
}

interface MemoryTrend {
    projectPath: string;
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
    heapSamplesBytes: number[];
    rssSamplesBytes: number[];
    activeResourcesBefore: number;
    activeResourcesAfter: number;
}

interface RealProjectReport {
    generatedAt: string;
    environment: {
        platform: string;
        release: string;
        architecture: string;
        cpu: string;
        logicalCpuCount: number;
        totalMemoryBytes: number;
        nodeVersion: string;
        workspaceRoot: string;
        filesystemType: string;
        sourceSha256: string;
    };
    parameters: {
        projectFilter: string[] | null;
        discoveredProjectCount: number;
        testedProjectCount: number;
        deriveSamples: number;
        warmSamples: number;
        boundedConcurrency: number;
        rebuildCycles: number;
        reportName: string;
        profileTopLevel: boolean;
        executionOrder: string[];
    };
    sequential: {
        wallMs: number;
        projects: ProjectScanResult[];
    };
    rawConcurrent: {
        wallMs: number;
        successfulProjects: number;
        projects: TimedProjectScan[];
    };
    cacheBounded: {
        wallMs: number;
        maxConcurrentBuilds: number;
        observedPeakBuilds: number;
        buildCount: number;
        projects: TimedProjectScan[];
        warmAllProjects: Distribution;
        warmBuildDelta: number;
    };
    largestProjectConcurrentReaders: {
        projectPath: string;
        readers: number;
        wallMs: number;
        buildCount: number;
        nodeCount: number;
    };
    memory: MemoryTrend;
    conclusions: string[];
}

const DERIVE_SAMPLES = positiveInteger(process.env.REAL_PROJECT_DERIVE_SAMPLES, 1_000);
const WARM_SAMPLES = positiveInteger(process.env.REAL_PROJECT_WARM_SAMPLES, 1_000);
const REBUILD_CYCLES = positiveInteger(process.env.REAL_PROJECT_REBUILD_CYCLES, 5);
const BOUNDED_CONCURRENCY = positiveInteger(process.env.REAL_PROJECT_BUILD_CONCURRENCY, 2);
const REPORT_NAME = reportName(process.env.REAL_PROJECT_REPORT_NAME);
const PROFILE_TOP_LEVEL = process.env.REAL_PROJECT_PROFILE_TOP_LEVEL === "1";
const benchmarkDirectory = path.dirname(fileURLToPath(import.meta.url));
const resultsDirectory = path.join(benchmarkDirectory, "results");

/** 对真实 Project Workspace 执行只读完整扫描、缓存与内存基线。 */
async function main(): Promise<void> {
    const runtimePaths = runtimePathsFromEnv(path.resolve(benchmarkDirectory, "../../../.."));
    const discoveredProjects = await listProjectWorkspaces(runtimePaths.workspaceRoot);
    const projectFilter = parseProjectFilter(process.env.REAL_PROJECTS);
    const projects = projectFilter
        ? discoveredProjects.filter((project) => projectFilter.includes(project.projectPath))
        : discoveredProjects;
    if (projects.length === 0) {
        throw new Error("没有找到待测试的 Project Workspace");
    }

    const sequentialStartedAt = performance.now();
    const sequentialProjects: ProjectScanResult[] = [];
    for (const project of projects) {
        sequentialProjects.push(await scanProject(runtimePaths.workspaceRoot, project));
        process.stdout.write(`[real-project-benchmark] sequential ${project.projectPath} completed\n`);
    }
    const sequentialWallMs = performance.now() - sequentialStartedAt;
    const successfulProjects = sequentialProjects.filter((project) => project.error === null);
    if (successfulProjects.length === 0) {
        throw new Error("所有真实 Project Workspace 扫描均失败");
    }

    const rawConcurrentStartedAt = performance.now();
    const rawConcurrentProjects = await Promise.all(projects.map((project) => timedScan(runtimePaths.workspaceRoot, project)));
    const rawConcurrentWallMs = performance.now() - rawConcurrentStartedAt;
    process.stdout.write("[real-project-benchmark] raw concurrent completed\n");

    const successfulProjectPaths = new Set(successfulProjects.map((project) => project.projectPath));
    const cacheProjects = projects.filter((project) => successfulProjectPaths.has(project.projectPath));
    const cacheBounded = await benchmarkBoundedCache(runtimePaths.workspaceRoot, cacheProjects);
    process.stdout.write("[real-project-benchmark] bounded cache completed\n");

    const largestProject = successfulProjects.reduce((largest, project) => (
        project.nodeCount > largest.nodeCount ? project : largest
    ));
    const largestProjectItem = cacheProjects.find((project) => project.projectPath === largestProject.projectPath);
    if (!largestProjectItem) {
        throw new Error(`最大项目不在 cache benchmark 清单: ${largestProject.projectPath}`);
    }
    const largestConcurrent = await benchmarkConcurrentReaders(runtimePaths.workspaceRoot, largestProjectItem);
    process.stdout.write("[real-project-benchmark] concurrent readers completed\n");
    const memory = await benchmarkMemory(runtimePaths.workspaceRoot, largestProjectItem);
    process.stdout.write("[real-project-benchmark] memory cycles completed\n");

    const report: RealProjectReport = {
        generatedAt: new Date().toISOString(),
        environment: {
            platform: os.platform(),
            release: os.release(),
            architecture: os.arch(),
            cpu: os.cpus()[0]?.model ?? "unknown",
            logicalCpuCount: os.cpus().length,
            totalMemoryBytes: os.totalmem(),
            nodeVersion: process.version,
            workspaceRoot: runtimePaths.workspaceRoot,
            filesystemType: await detectFilesystemType(runtimePaths.workspaceRoot),
            sourceSha256: await sourceHash(),
        },
        parameters: {
            projectFilter,
            discoveredProjectCount: discoveredProjects.length,
            testedProjectCount: projects.length,
            deriveSamples: DERIVE_SAMPLES,
            warmSamples: WARM_SAMPLES,
            boundedConcurrency: BOUNDED_CONCURRENCY,
            rebuildCycles: REBUILD_CYCLES,
            reportName: REPORT_NAME,
            profileTopLevel: PROFILE_TOP_LEVEL,
            executionOrder: [
                "sequential-first-process-scan",
                "raw-unbounded-concurrent",
                "cache-bounded-cold",
                "cache-warm",
                "largest-project-100-readers",
                "largest-project-rebuild-memory",
            ],
        },
        sequential: {wallMs: sequentialWallMs, projects: sequentialProjects},
        rawConcurrent: {
            wallMs: rawConcurrentWallMs,
            successfulProjects: rawConcurrentProjects.filter((project) => project.error === null).length,
            projects: rawConcurrentProjects,
        },
        cacheBounded,
        largestProjectConcurrentReaders: largestConcurrent,
        memory,
        conclusions: buildConclusions({
            sequentialWallMs,
            sequentialProjects: successfulProjects,
            rawConcurrentWallMs,
            cacheBounded,
            largestConcurrent,
            memory,
        }),
    };

    await fs.mkdir(resultsDirectory, {recursive: true});
    await fs.writeFile(path.join(resultsDirectory, `${REPORT_NAME}.json`), `${JSON.stringify(report, null, 2)}\n`, "utf8");
    await fs.writeFile(path.join(resultsDirectory, `${REPORT_NAME}.md`), renderMarkdown(report), "utf8");
    process.stdout.write(`${renderMarkdown(report)}\n`);
}

/** 扫描单 Project Workspace，并立刻完成统计、目录分布和 retained snapshot 估算。 */
async function scanProject(workspaceRoot: AbsoluteFsPath, project: ProjectListItem): Promise<ProjectScanResult> {
    forceGc();
    const heapBefore = process.memoryUsage().heapUsed;
    const startedAt = performance.now();
    try {
        const nodes = await scanWorkspaceTree({
            root: resolveProjectWorkspaceRoot(workspaceRoot, normalizeProjectPath(project.projectPath)),
        });
        const scanMs = performance.now() - startedAt;
        forceGc();
        const heapDeltaBytes = process.memoryUsage().heapUsed - heapBefore;
        const deriveDurations: number[] = [];
        let statistics = deriveStatistics(nodes);
        for (let sample = 0; sample < DERIVE_SAMPLES; sample += 1) {
            const deriveStartedAt = performance.now();
            statistics = deriveStatistics(nodes);
            deriveDurations.push(performance.now() - deriveStartedAt);
        }
        const result = summarizeProject(project, nodes, scanMs, distribution(deriveDurations), heapDeltaBytes, statistics);
        if (PROFILE_TOP_LEVEL) {
            for (const topLevel of result.topLevel) {
                const targetStartedAt = performance.now();
                await scanWorkspaceTree({
                    root: resolveProjectWorkspaceRoot(workspaceRoot, normalizeProjectPath(project.projectPath)),
                    targets: [topLevel.name],
                });
                topLevel.scanMs = performance.now() - targetStartedAt;
            }
        }
        return result;
    } catch (error) {
        return failedProject(project, performance.now() - startedAt, error);
    }
}

/** 单次计时完整扫描，用于无界并发阶段。 */
async function timedScan(workspaceRoot: AbsoluteFsPath, project: ProjectListItem): Promise<TimedProjectScan> {
    const startedAt = performance.now();
    try {
        const nodes = await scanWorkspaceTree({
            root: resolveProjectWorkspaceRoot(workspaceRoot, normalizeProjectPath(project.projectPath)),
        });
        return {projectPath: project.projectPath, durationMs: performance.now() - startedAt, nodeCount: nodes.length, error: null};
    } catch (error) {
        return {projectPath: project.projectPath, durationMs: performance.now() - startedAt, nodeCount: 0, error: errorMessage(error)};
    }
}

/** 用 maxConcurrentBuilds=2 的独立 cache 扫描全部真实项目，并验证 warm read 无 rebuild。 */
async function benchmarkBoundedCache(
    workspaceRoot: AbsoluteFsPath,
    projects: ProjectListItem[],
): Promise<RealProjectReport["cacheBounded"]> {
    let activeBuilds = 0;
    let observedPeakBuilds = 0;
    let buildCount = 0;
    const durations = new Map<string, number>();
    const cache = new SnapshotCache<string, WorkspaceFileNode, never, string>({
        keyId: (key) => key,
        maxConcurrentBuilds: BOUNDED_CONCURRENCY,
        debounceMs: 0,
        builder: {
            build: async ({key}) => {
                buildCount += 1;
                activeBuilds += 1;
                observedPeakBuilds = Math.max(observedPeakBuilds, activeBuilds);
                const startedAt = performance.now();
                try {
                    const nodes = await scanWorkspaceTree({
                        root: resolveProjectWorkspaceRoot(workspaceRoot, normalizeProjectPath(key)),
                    });
                    durations.set(key, performance.now() - startedAt);
                    return {nodes, issues: []};
                } finally {
                    activeBuilds -= 1;
                }
            },
        },
    });
    const activations = projects.map((project) => cache.activate(project.projectPath));
    await Promise.all(activations.map((activation) => activation.ready));
    const coldStartedAt = performance.now();
    const snapshots = await Promise.all(projects.map((project) => cache.read(project.projectPath)));
    const wallMs = performance.now() - coldStartedAt;
    const coldBuildCount = buildCount;
    const warmDurations: number[] = [];
    for (let sample = 0; sample < WARM_SAMPLES; sample += 1) {
        const startedAt = performance.now();
        await Promise.all(projects.map((project) => cache.read(project.projectPath)));
        warmDurations.push(performance.now() - startedAt);
    }
    const result = {
        wallMs,
        maxConcurrentBuilds: BOUNDED_CONCURRENCY,
        observedPeakBuilds,
        buildCount,
        projects: projects.map((project, index) => ({
            projectPath: project.projectPath,
            durationMs: durations.get(project.projectPath) ?? 0,
            nodeCount: snapshots[index]?.nodes.length ?? 0,
            error: null,
        })),
        warmAllProjects: distribution(warmDurations),
        warmBuildDelta: buildCount - coldBuildCount,
    };
    await cache.closeAll();
    return result;
}

/** 最大真实项目 100 并发 cold readers 必须共享一次完整扫描。 */
async function benchmarkConcurrentReaders(
    workspaceRoot: AbsoluteFsPath,
    project: ProjectListItem,
): Promise<RealProjectReport["largestProjectConcurrentReaders"]> {
    let buildCount = 0;
    const cache = new SnapshotCache<string, WorkspaceFileNode, never, string>({
        keyId: (key) => key,
        builder: {
            build: async ({key}) => {
                buildCount += 1;
                return {
                    nodes: await scanWorkspaceTree({
                        root: resolveProjectWorkspaceRoot(workspaceRoot, normalizeProjectPath(key)),
                    }),
                    issues: [],
                };
            },
        },
    });
    const startedAt = performance.now();
    const snapshots = await Promise.all(Array.from({length: 100}, () => cache.read(project.projectPath)));
    const wallMs = performance.now() - startedAt;
    const result = {
        projectPath: project.projectPath,
        readers: 100,
        wallMs,
        buildCount,
        nodeCount: snapshots[0]?.nodes.length ?? 0,
    };
    await cache.closeAll();
    return result;
}

/** 最大真实项目多轮 invalidate/rebuild，测强制 GC 后 retained heap/RSS 趋势。 */
async function benchmarkMemory(workspaceRoot: AbsoluteFsPath, project: ProjectListItem): Promise<MemoryTrend> {
    const activeResourcesBefore = process.getActiveResourcesInfo().length;
    const cache = new SnapshotCache<string, WorkspaceFileNode, never, string>({
        keyId: (key) => key,
        debounceMs: 0,
        builder: {
            build: async ({key}) => ({
                nodes: await scanWorkspaceTree({
                    root: resolveProjectWorkspaceRoot(workspaceRoot, normalizeProjectPath(key)),
                }),
                issues: [],
            }),
        },
    });
    const first = await cache.read(project.projectPath);
    forceGc();
    const heapSamples: number[] = [];
    const rssSamples: number[] = [];
    for (let cycle = 0; cycle < REBUILD_CYCLES; cycle += 1) {
        cache.invalidate(project.projectPath, `cycle-${cycle}`);
        await cache.read(project.projectPath);
        forceGc();
        const memory = process.memoryUsage();
        heapSamples.push(memory.heapUsed);
        rssSamples.push(memory.rss);
        process.stdout.write(`[real-project-benchmark] memory cycle ${cycle + 1}/${REBUILD_CYCLES}\n`);
    }
    const heapTrend = linearTrend(heapSamples);
    const rssTrend = linearTrend(rssSamples);
    await cache.closeAll();
    forceGc();
    return {
        projectPath: project.projectPath,
        cycles: REBUILD_CYCLES,
        nodeCount: first.nodes.length,
        heapStartBytes: heapSamples[0] ?? 0,
        heapEndBytes: heapSamples.at(-1) ?? 0,
        heapSlopeBytesPerCycle: heapTrend.slope,
        heapSlopeR2: heapTrend.r2,
        rssStartBytes: rssSamples[0] ?? 0,
        rssEndBytes: rssSamples.at(-1) ?? 0,
        rssSlopeBytesPerCycle: rssTrend.slope,
        rssSlopeR2: rssTrend.r2,
        heapSamplesBytes: heapSamples,
        rssSamplesBytes: rssSamples,
        activeResourcesBefore,
        activeResourcesAfter: process.getActiveResourcesInfo().length,
    };
}

/** 使用与 `/api/projects` 相同的节点判定，从完整 snapshot 派生列表统计。 */
function deriveStatistics(nodes: readonly WorkspaceFileNode[]): ProjectStatistics {
    const manuscriptNodes = nodes.filter((node) => isUnderRoot(node, "manuscript"));
    const chapters = manuscriptNodes.filter((node) => isCountableContentNode(node) && node.entryType === "chapter");
    return {
        nodeCount: nodes.length,
        volumeCount: manuscriptNodes.filter((node) => isCountableContentNode(node) && node.entryType === "volume").length,
        chapterCount: chapters.length,
        totalWords: chapters.reduce((total, node) => total + node.words, 0),
        lorebookCount: nodes.filter(isLorebookEntryNode).length,
    };
}

/** 汇总真实节点分布，不保留正文或 frontmatter 到报告。 */
function summarizeProject(
    project: ProjectListItem,
    nodes: readonly WorkspaceFileNode[],
    scanMs: number,
    derive: Distribution,
    heapDeltaBytes: number,
    statistics: ProjectStatistics,
): ProjectScanResult {
    const topLevelMap = new Map<string, {nodes: number; files: number; bytes: number}>();
    for (const node of nodes) {
        const name = node.path.split("/").filter(Boolean)[0] ?? "(root)";
        const current = topLevelMap.get(name) ?? {nodes: 0, files: 0, bytes: 0};
        current.nodes += 1;
        current.files += node.isDirectory ? 0 : 1;
        current.bytes += node.isDirectory ? 0 : node.size;
        topLevelMap.set(name, current);
    }
    return {
        projectPath: project.projectPath,
        title: project.title,
        scanMs,
        derive,
        nodeCount: nodes.length,
        fileCount: nodes.filter((node) => !node.isDirectory).length,
        directoryCount: nodes.filter((node) => node.isDirectory).length,
        contentNodeCount: nodes.filter((node) => node.contentNode).length,
        markdownFileCount: nodes.filter((node) => !node.isDirectory && node.path.toLowerCase().endsWith(".md")).length,
        totalNodeBytes: nodes.reduce((total, node) => total + (node.isDirectory ? 0 : node.size), 0),
        heapDeltaBytes,
        statistics,
        topLevel: [...topLevelMap.entries()]
            .map(([name, value]) => ({name, ...value, scanMs: null}))
            .sort((left, right) => right.nodes - left.nodes),
        largestFiles: nodes
            .filter((node) => !node.isDirectory)
            .sort((left, right) => right.size - left.size)
            .slice(0, 5)
            .map((node) => ({path: node.path, bytes: node.size})),
        error: null,
    };
}

/** 构造失败项目结果，保证整轮 benchmark 可继续收集其他项目。 */
function failedProject(project: ProjectListItem, scanMs: number, error: unknown): ProjectScanResult {
    return {
        projectPath: project.projectPath,
        title: project.title,
        scanMs,
        derive: distribution([]),
        nodeCount: 0,
        fileCount: 0,
        directoryCount: 0,
        contentNodeCount: 0,
        markdownFileCount: 0,
        totalNodeBytes: 0,
        heapDeltaBytes: 0,
        statistics: {nodeCount: 0, volumeCount: 0, chapterCount: 0, totalWords: 0, lorebookCount: 0},
        topLevel: [],
        largestFiles: [],
        error: errorMessage(error),
    };
}

/** 生成基于本次真实数据的直接结论。 */
function buildConclusions(input: {
    sequentialWallMs: number;
    sequentialProjects: ProjectScanResult[];
    rawConcurrentWallMs: number;
    cacheBounded: RealProjectReport["cacheBounded"];
    largestConcurrent: RealProjectReport["largestProjectConcurrentReaders"];
    memory: MemoryTrend;
}): string[] {
    const slowest = [...input.sequentialProjects].sort((left, right) => right.scanMs - left.scanMs)[0]!;
    const deriveP95 = Math.max(...input.sequentialProjects.map((project) => project.derive.p95Ms));
    return [
        `首轮逐项目完整扫描最慢的是 ${slowest.projectPath}：${formatMs(slowest.scanMs)} / ${slowest.nodeCount} nodes。`,
        `统计派生最大 p95 为 ${formatMs(deriveP95)}，与完整扫描相比可忽略，主要成本位于完整节点 builder。`,
        `全部项目逐个扫描 wall=${formatMs(input.sequentialWallMs)}；无界并发 wall=${formatMs(input.rawConcurrentWallMs)}；cache 并发上限 ${input.cacheBounded.maxConcurrentBuilds} wall=${formatMs(input.cacheBounded.wallMs)}。`,
        `最大项目 100 个并发 cold readers 触发 ${input.largestConcurrent.buildCount} 次完整扫描，wall=${formatMs(input.largestConcurrent.wallMs)}。`,
        `最大项目 ${input.memory.cycles} 次 rebuild 后 heap slope=${formatBytes(input.memory.heapSlopeBytesPerCycle)}/cycle (R2=${input.memory.heapSlopeR2.toFixed(4)})，RSS slope=${formatBytes(input.memory.rssSlopeBytesPerCycle)}/cycle (R2=${input.memory.rssSlopeR2.toFixed(4)})。`,
    ];
}

/** 渲染便于人工比较的 Markdown 报告。 */
function renderMarkdown(report: RealProjectReport): string {
    const projectRows = [...report.sequential.projects]
        .sort((left, right) => right.scanMs - left.scanMs)
        .map((project) => `| ${project.projectPath} | ${formatMs(project.scanMs)} | ${project.nodeCount} | ${project.fileCount} | ${project.markdownFileCount} | ${formatBytes(project.totalNodeBytes)} | ${formatBytes(project.heapDeltaBytes)} | ${formatMs(project.derive.p95Ms)} | ${project.error ?? ""} |`)
        .join("\n");
    const topProjects = [...report.sequential.projects]
        .filter((project) => project.error === null)
        .sort((left, right) => right.scanMs - left.scanMs)
        .slice(0, 5)
        .map((project) => `### ${project.projectPath}\n\n- 顶层节点：${project.topLevel.slice(0, 8).map((item) => `${item.name}=${item.nodes}${item.scanMs === null ? "" : `/${formatMs(item.scanMs)}`}`).join("，")}\n- 最大文件：${project.largestFiles.map((item) => `${item.path} (${formatBytes(item.bytes)})`).join("；")}\n- 统计：volume=${project.statistics.volumeCount}，chapter=${project.statistics.chapterCount}，words=${project.statistics.totalWords}，lorebook=${project.statistics.lorebookCount}`)
        .join("\n\n");
    return `# NeuroBook 真实 Project Workspace 性能基线\n\n生成时间：${report.generatedAt}\n\n> 本报告只读真实 Project Workspace。cache 阶段使用独立 package adapter，不代表已经接入 /api/projects。首轮是进程首次扫描，但 OS 文件缓存未清空，因此不是物理冷盘基准。\n\n## Environment\n\n- OS: ${report.environment.platform} ${report.environment.release} (${report.environment.architecture})\n- CPU: ${report.environment.cpu}, ${report.environment.logicalCpuCount} logical CPUs\n- Memory: ${formatBytes(report.environment.totalMemoryBytes)}\n- Node: ${report.environment.nodeVersion}\n- Filesystem: ${report.environment.filesystemType}\n- Workspace Root: ${report.environment.workspaceRoot}\n- Source SHA-256: ${report.environment.sourceSha256}\n- Projects: ${report.parameters.testedProjectCount}/${report.parameters.discoveredProjectCount}\n- Rebuild cycles: ${report.parameters.rebuildCycles}\n\n## Sequential full scan\n\nWall: ${formatMs(report.sequential.wallMs)}\n\n| Project | Scan | Nodes | Files | Markdown | Bytes | Heap delta | Derive p95 | Error |\n|---|---:|---:|---:|---:|---:|---:|---:|---|\n${projectRows}\n\n## Cross-project comparison\n\n- Raw unbounded Promise.all: ${formatMs(report.rawConcurrent.wallMs)}，success ${report.rawConcurrent.successfulProjects}/${report.parameters.testedProjectCount}\n- Cache bounded concurrency=${report.cacheBounded.maxConcurrentBuilds}: ${formatMs(report.cacheBounded.wallMs)}，observed peak=${report.cacheBounded.observedPeakBuilds}，builds=${report.cacheBounded.buildCount}\n- Warm all-project read p50/p95/p99: ${formatMs(report.cacheBounded.warmAllProjects.p50Ms)} / ${formatMs(report.cacheBounded.warmAllProjects.p95Ms)} / ${formatMs(report.cacheBounded.warmAllProjects.p99Ms)}，build delta=${report.cacheBounded.warmBuildDelta}\n- Largest project 100 readers: ${report.largestProjectConcurrentReaders.projectPath}，builds=${report.largestProjectConcurrentReaders.buildCount}，wall=${formatMs(report.largestProjectConcurrentReaders.wallMs)}\n\n## Rebuild memory\n\n- Project: ${report.memory.projectPath}，nodes=${report.memory.nodeCount}，cycles=${report.memory.cycles}\n- Heap: ${formatBytes(report.memory.heapStartBytes)} -> ${formatBytes(report.memory.heapEndBytes)}，slope=${formatBytes(report.memory.heapSlopeBytesPerCycle)}/cycle，R2=${report.memory.heapSlopeR2.toFixed(4)}\n- RSS: ${formatBytes(report.memory.rssStartBytes)} -> ${formatBytes(report.memory.rssEndBytes)}，slope=${formatBytes(report.memory.rssSlopeBytesPerCycle)}/cycle，R2=${report.memory.rssSlopeR2.toFixed(4)}\n- Active resources: ${report.memory.activeResourcesBefore} -> ${report.memory.activeResourcesAfter}\n\n## Largest projects detail\n\n${topProjects}\n\n## Conclusions\n\n${report.conclusions.map((conclusion) => `- ${conclusion}`).join("\n")}\n`;
}

/** 判断节点是否落在正文或 lorebook 根下。 */
function isUnderRoot(node: WorkspaceFileNode, root: "manuscript" | "lorebook"): boolean {
    return node.path === `${root}/` || node.path.startsWith(`${root}/`);
}

/** 目录内容节点和独立 Markdown 内容节点计数，index.md 不重复计数。 */
function isCountableContentNode(node: WorkspaceFileNode): boolean {
    return node.contentNode && (node.isDirectory || !node.path.endsWith("/index.md"));
}

/** lorebook 根本身不计为条目。 */
function isLorebookEntryNode(node: WorkspaceFileNode): boolean {
    return isCountableContentNode(node)
        && isUnderRoot(node, "lorebook")
        && node.path !== "lorebook/"
        && node.path !== "lorebook/index.md";
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

/** nearest-rank percentile。 */
function percentile(sorted: number[], ratio: number): number {
    return sorted[Math.min(sorted.length - 1, Math.max(0, Math.ceil(sorted.length * ratio) - 1))] ?? 0;
}

/** 按 cycle 做最小二乘趋势拟合。 */
function linearTrend(values: number[]): {slope: number; r2: number} {
    const count = values.length;
    if (count < 2) {
        return {slope: 0, r2: 0};
    }
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

/** 计算 harness、scanner、统计调用点和 cache package 的输入指纹。 */
async function sourceHash(): Promise<string> {
    const repositoryRoot = path.resolve(benchmarkDirectory, "../../../..");
    const files = [
        fileURLToPath(import.meta.url),
        path.join(repositoryRoot, "server/workspace-files/workspace-files.ts"),
        path.join(repositoryRoot, "server/utils/novel-chapter.ts"),
        path.join(repositoryRoot, "packages/file-snapshot-cache/src/snapshot-cache.ts"),
        path.join(repositoryRoot, "packages/file-snapshot-cache/src/types.ts"),
    ].sort();
    const hash = createHash("sha256");
    for (const filePath of files) {
        hash.update(path.relative(repositoryRoot, filePath).replaceAll("\\", "/"));
        hash.update("\0");
        hash.update(await fs.readFile(filePath));
        hash.update("\0");
    }
    return hash.digest("hex");
}

/** Windows 当前实际卷类型；其他平台退回 statfs magic。 */
async function detectFilesystemType(targetPath: string): Promise<string> {
    if (process.platform === "win32") {
        const driveLetter = path.parse(targetPath).root.slice(0, 1);
        const {execFile} = await import("node:child_process");
        const {promisify} = await import("node:util");
        try {
            const result = await promisify(execFile)("powershell", [
                "-NoProfile",
                "-Command",
                `(Get-Volume -DriveLetter '${driveLetter}').FileSystemType`,
            ]);
            if (result.stdout.trim()) {
                return result.stdout.trim();
            }
        } catch {
            // 受限环境继续使用 statfs。
        }
    }
    const stat = await fs.statfs(targetPath);
    return `statfs:0x${stat.type.toString(16)}`;
}

/** 解析可选逗号分隔 Project Path/slug 过滤。 */
function parseProjectFilter(value: string | undefined): string[] | null {
    if (!value?.trim()) {
        return null;
    }
    return value.split(",").map((item) => item.trim()).filter(Boolean).map((item) => (
        item.startsWith("workspace/") ? item : `workspace/${item}`
    ));
}

/** 读取正整数环境参数。 */
function positiveInteger(value: string | undefined, fallback: number): number {
    const parsed = value ? Number.parseInt(value, 10) : fallback;
    if (!Number.isInteger(parsed) || parsed <= 0) {
        throw new Error(`benchmark 参数必须是正整数: ${value}`);
    }
    return parsed;
}

/** 解析结果文件名，避免 benchmark 参数逃逸 results 目录。 */
function reportName(value: string | undefined): string {
    const name = value?.trim() || "real-projects-node";
    if (!/^[a-z0-9][a-z0-9-]*$/u.test(name)) {
        throw new Error(`benchmark 报告名只能包含小写字母、数字和连字符: ${value}`);
    }
    return name;
}

/** 强制 GC；本 harness 必须由 Node --expose-gc 运行。 */
function forceGc(): void {
    if (typeof globalThis.gc !== "function") {
        throw new Error("真实项目 benchmark 必须使用 node --expose-gc");
    }
    globalThis.gc();
}

/** 错误转可序列化文本。 */
function errorMessage(error: unknown): string {
    return error instanceof Error ? error.message : String(error);
}

/** 格式化毫秒。 */
function formatMs(value: number): string {
    return `${value.toFixed(2)}ms`;
}

/** 格式化 byte。 */
function formatBytes(value: number): string {
    const absolute = Math.abs(value);
    if (absolute >= 1_073_741_824) {
        return `${(value / 1_073_741_824).toFixed(2)}GiB`;
    }
    if (absolute >= 1_048_576) {
        return `${(value / 1_048_576).toFixed(2)}MiB`;
    }
    if (absolute >= 1_024) {
        return `${(value / 1_024).toFixed(2)}KiB`;
    }
    return `${value.toFixed(0)}B`;
}

await main();
