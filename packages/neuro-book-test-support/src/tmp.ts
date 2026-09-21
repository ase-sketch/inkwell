import type {Dirent} from "node:fs";
import {randomUUID} from "node:crypto";
import {lstat, mkdir, mkdtemp, readdir, readFile, rm, rmdir, writeFile} from "node:fs/promises";
import {tmpdir} from "node:os";
import {basename, resolve} from "node:path";
import {resolveAgentTempRoot} from "./paths";
import {isProcessAlive, TEST_RUN_ID_ENV} from "./process";

export const TMP_ROOT_REL = "agent";
export const TMP_MARKER_FILE = ".nbook-tmp.json";
export const TMP_MARKER_SCHEMA_VERSION = 1;
export const TMP_STALE_WINDOW_MS = 24 * 60 * 60 * 1000;

export type TestTmpRootMarker = {
    schemaVersion: number;
    createdAt: string;
    pid: number;
    runId: string;
    purpose: string;
};

export type TmpSweepRetainReason = "no_marker" | "schema_mismatch" | "owner_alive" | "within_window" | "unreadable";

export type TmpSweepReport = {
    removed: string[];
    retained: {root: string; reason: TmpSweepRetainReason}[];
    failures: {root: string; message: string}[];
};

export const FIXTURE_ROOT_PREFIX = "nbook-workspace-assets-";
export const SNAPSHOT_ROOT_PREFIX = "nbook-workspace-snapshot-";
export const FIXTURE_MARKER_FILE = ".nbook-fixture.json";
export const FIXTURE_MARKER_SCHEMA_VERSION = 1;
export const FIXTURE_STALE_WINDOW_MS = 24 * 60 * 60 * 1000;

export type SystemAssetsMode = "shared" | "isolated";

export type TestWorkspaceFixtureMarker = {
    schemaVersion: number;
    createdAt: string;
    pid: number;
    runId: string;
    purpose: string;
    systemAssets: SystemAssetsMode;
};

export type FixtureSweepRetainReason = "no_marker" | "schema_mismatch" | "owner_alive" | "within_window" | "unreadable";

export type FixtureSweepReport = {
    removed: string[];
    retained: {root: string; reason: FixtureSweepRetainReason}[];
    failures: {root: string; message: string}[];
};

/** 解析系统 Temp 下 Agent 测试临时根的绝对路径。 */
export function resolveTmpRoot(): string {
    return resolve(resolveAgentTempRoot(), TMP_ROOT_REL);
}

/** 新建带 owner marker 的测试临时根。 */
export async function createTestTmpRoot(name: string, purpose?: string): Promise<string> {
    const tmpRoot = resolveTmpRoot();
    await mkdir(tmpRoot, {recursive: true});
    const root = await mkdtemp(resolve(tmpRoot, `${name}-`));
    await writeTmpMarker(root, {
        schemaVersion: TMP_MARKER_SCHEMA_VERSION,
        createdAt: new Date().toISOString(),
        pid: process.pid,
        runId: process.env[TEST_RUN_ID_ENV] ?? randomUUID(),
        purpose: purpose ?? `test-${name}`,
    });
    return root;
}

/** 只回收合法 marker、超窗且 owner 已退出的真实目录。 */
export async function sweepStaleTmpRoots(parentRoot: string = resolveTmpRoot(), now: number = Date.now()): Promise<TmpSweepReport> {
    const report: TmpSweepReport = {removed: [], retained: [], failures: []};
    const parentStats = await lstat(parentRoot).catch(() => null);
    if (!parentStats) return report;
    if (parentStats.isSymbolicLink() || !parentStats.isDirectory()) {
        report.retained.push({root: parentRoot, reason: "unreadable"});
        return report;
    }
    let entries: Dirent[];
    try {
        entries = await readdir(parentRoot, {withFileTypes: true});
    } catch (error) {
        report.failures.push({root: parentRoot, message: error instanceof Error ? error.message : String(error)});
        return report;
    }
    for (const entry of entries) {
        const root = resolve(parentRoot, entry.name);
        const stats = await lstat(root).catch(() => null);
        if (!stats || stats.isSymbolicLink() || !stats.isDirectory()) {
            report.retained.push({root, reason: "unreadable"});
            continue;
        }
        const markerPath = resolve(root, TMP_MARKER_FILE);
        const markerStats = await lstat(markerPath).catch(() => null);
        if (!markerStats) {
            report.retained.push({root, reason: "no_marker"});
            continue;
        }
        if (markerStats.isSymbolicLink() || !markerStats.isFile()) {
            report.retained.push({root, reason: "unreadable"});
            continue;
        }
        const marker = await readTmpMarker(root);
        if (!marker) {
            report.retained.push({root, reason: "unreadable"});
            continue;
        }
        if (marker.schemaVersion !== TMP_MARKER_SCHEMA_VERSION) {
            report.retained.push({root, reason: "schema_mismatch"});
            continue;
        }
        const createdAt = Date.parse(marker.createdAt);
        if (!Number.isFinite(createdAt) || now - createdAt < TMP_STALE_WINDOW_MS) {
            report.retained.push({root, reason: "within_window"});
            continue;
        }
        if (isProcessAlive(marker.pid)) {
            report.retained.push({root, reason: "owner_alive"});
            continue;
        }
        try {
            await removeMarkedTmpRoot(root, markerPath);
            report.removed.push(root);
        } catch (error) {
            report.failures.push({root, message: error instanceof Error ? error.message : String(error)});
        }
    }
    return report;
}

export async function writeTmpMarker(root: string, marker: TestTmpRootMarker): Promise<void> {
    await writeFile(resolve(root, TMP_MARKER_FILE), `${JSON.stringify(marker, null, 4)}\n`, "utf8");
}

export async function sweepStaleFixtureRoots(now: number = Date.now()): Promise<FixtureSweepReport> {
    const report: FixtureSweepReport = {removed: [], retained: [], failures: []};
    const tempRoot = resolve(resolveAgentTempRoot(), "fixtures");
    const entries = await readdir(tempRoot, {withFileTypes: true}).catch(() => []);
    for (const entry of entries) {
        if (!entry.name.startsWith(FIXTURE_ROOT_PREFIX) && !entry.name.startsWith(SNAPSHOT_ROOT_PREFIX)) continue;
        const root = resolve(tempRoot, entry.name);
        const stats = await lstat(root).catch(() => null);
        if (!stats || stats.isSymbolicLink() || !stats.isDirectory()) {
            report.retained.push({root, reason: "unreadable"});
            continue;
        }
        const marker = await readFixtureMarker(root);
        if (!marker) {
            report.retained.push({root, reason: "no_marker"});
            continue;
        }
        if (marker.schemaVersion !== FIXTURE_MARKER_SCHEMA_VERSION) {
            report.retained.push({root, reason: "schema_mismatch"});
            continue;
        }
        const createdAt = Date.parse(marker.createdAt);
        if (!Number.isFinite(createdAt) || now - createdAt < FIXTURE_STALE_WINDOW_MS) {
            report.retained.push({root, reason: "within_window"});
            continue;
        }
        if (isProcessAlive(marker.pid)) {
            report.retained.push({root, reason: "owner_alive"});
            continue;
        }
        try {
            await removeFixtureTree(root);
            report.removed.push(root);
        } catch (error) {
            report.failures.push({root, message: error instanceof Error ? error.message : String(error)});
        }
    }
    return report;
}


/** 读取并校验测试临时根 marker；非法磁盘数据返回 null。 */
export async function readTmpMarker(root: string): Promise<TestTmpRootMarker | null> {
    const text = await readFile(resolve(root, TMP_MARKER_FILE), "utf8").catch(() => null);
    if (text === null) return null;
    let value: unknown;
    try {
        value = JSON.parse(text) as unknown;
    } catch {
        return null;
    }
    if (typeof value !== "object" || value === null) return null;
    const candidate = value as Partial<Record<keyof TestTmpRootMarker, unknown>>;
    if (typeof candidate.schemaVersion !== "number"
        || typeof candidate.createdAt !== "string"
        || typeof candidate.pid !== "number"
        || typeof candidate.runId !== "string"
        || typeof candidate.purpose !== "string") return null;
    return {
        schemaVersion: candidate.schemaVersion,
        createdAt: candidate.createdAt,
        pid: candidate.pid,
        runId: candidate.runId,
        purpose: candidate.purpose,
    };
}

/** 删除带 marker 的真实目录；marker 最后删除，失败时恢复 marker。 */
export async function removeMarkedTmpRoot(root: string, markerFile: string): Promise<void> {
    const rootPath = resolve(root);
    const markerPath = resolve(markerFile);
    if (markerPath !== resolve(rootPath, basename(markerPath))) throw new Error(`marker 不在 root 直接子项内：${rootPath}`);
    const rootStats = await lstat(rootPath);
    if (rootStats.isSymbolicLink() || !rootStats.isDirectory()) throw new Error(`run root 不是可安全删除的真实目录：${rootPath}`);
    const markerStats = await lstat(markerPath);
    if (markerStats.isSymbolicLink() || !markerStats.isFile()) throw new Error(`run root marker 不是普通文件：${markerPath}`);
    const markerText = await readFile(markerPath, "utf8");
    const failures: unknown[] = [];
    for (const entry of await readdir(rootPath, {withFileTypes: true})) {
        if (entry.name === basename(markerPath)) continue;
        try {
            await rm(resolve(rootPath, entry.name), {recursive: true, force: false, maxRetries: 10, retryDelay: 100});
        } catch (error) {
            failures.push(error);
        }
    }
    if (failures.length > 0) throw new AggregateError(failures, `Vitest run root 清理存在失败项：${rootPath}`);
    const finalRootStats = await lstat(rootPath);
    if (finalRootStats.isSymbolicLink() || !finalRootStats.isDirectory()) throw new Error(`run root 在清理时变为非真实目录：${rootPath}`);
    await rm(markerPath, {force: false});
    try {
        await rmdir(rootPath);
    } catch (error) {
        await writeFile(markerPath, markerText, "utf8").catch((restoreError: unknown) => {
            throw new AggregateError([error, restoreError], `run root 清理失败且无法恢复 marker：${rootPath}`);
        });
        throw new AggregateError([error], `Vitest run root 清理失败：${rootPath}`);
    }
}

/** 写入 fixture owner marker。 */
export async function writeFixtureMarker(root: string, marker: TestWorkspaceFixtureMarker): Promise<void> {
    await writeFile(resolve(root, FIXTURE_MARKER_FILE), `${JSON.stringify(marker, null, 4)}\n`, "utf8");
}

/** 读取并校验 fixture owner marker；非法磁盘数据返回 null。 */
export async function readFixtureMarker(root: string): Promise<TestWorkspaceFixtureMarker | null> {
    const text = await readFile(resolve(root, FIXTURE_MARKER_FILE), "utf8").catch(() => null);
    if (text === null) return null;
    let value: unknown;
    try {
        value = JSON.parse(text) as unknown;
    } catch {
        return null;
    }
    if (typeof value !== "object" || value === null) return null;
    const candidate = value as Partial<Record<keyof TestWorkspaceFixtureMarker, unknown>>;
    if (typeof candidate.schemaVersion !== "number"
        || typeof candidate.createdAt !== "string"
        || typeof candidate.pid !== "number"
        || typeof candidate.runId !== "string"
        || typeof candidate.purpose !== "string"
        || (candidate.systemAssets !== "shared" && candidate.systemAssets !== "isolated")) return null;
    return {
        schemaVersion: candidate.schemaVersion,
        createdAt: candidate.createdAt,
        pid: candidate.pid,
        runId: candidate.runId,
        purpose: candidate.purpose,
        systemAssets: candidate.systemAssets,
    };
}

/**
 * 删除 fixture root。
 *
 * root 下可能含指向仓库本体的 junction；只删除链接本身，不跟随进入目标。
 */
export async function removeFixtureTree(root: string): Promise<void> {
    const entries = await readdir(root, {withFileTypes: true}).catch(() => []);
    const failures: unknown[] = [];
    for (const entry of entries) {
        if (entry.name === FIXTURE_MARKER_FILE || entry.name === TMP_MARKER_FILE) continue;
        const target = resolve(root, entry.name);
        try {
            const stats = await lstat(target);
            await rm(target, {recursive: true, force: true, maxRetries: 10, retryDelay: 100});
            if (stats.isSymbolicLink()) continue;
        } catch (error) {
            failures.push(error);
        }
    }
    if (failures.length > 0) throw new AggregateError(failures, `fixture root 清理存在失败项：${root}`);

    const markerNames = [FIXTURE_MARKER_FILE, TMP_MARKER_FILE];
    const markerTexts = new Map<string, string | null>();
    for (const name of markerNames) {
        markerTexts.set(name, await readFile(resolve(root, name), "utf8").catch(() => null));
        await rm(resolve(root, name), {force: true, maxRetries: 10, retryDelay: 100});
    }
    try {
        await rmdir(root);
    } catch (error) {
        const restoreFailures: unknown[] = [error];
        for (const [name, text] of markerTexts) {
            if (text !== null) {
                try {
                    await writeFile(resolve(root, name), text, "utf8");
                } catch (restoreError) {
                    restoreFailures.push(restoreError);
                }
            }
        }
        throw new AggregateError(restoreFailures, `fixture root 清理存在失败项：${root}`);
    }
}
export {isProcessAlive, TEST_RUN_ID_ENV} from "./process";
