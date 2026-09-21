import {createReadStream} from "node:fs";
import {createHash} from "node:crypto";
import {lstat, readdir, readFile} from "node:fs/promises";
import {basename, resolve} from "node:path";

import {
    DESKTOP_AGGREGATE_DEPOT_ARCHIVE,
    DESKTOP_AGGREGATE_DEPOT_DISTRIBUTION_MANIFEST,
    DESKTOP_AGGREGATE_DEPOT_ENTRIES,
    DESKTOP_AGGREGATE_DEPOT_MANIFEST,
    DESKTOP_AGGREGATE_DEPOT_PLATFORM,
    DESKTOP_DISTRIBUTION_SCHEMA,
    parseDesktopAggregateDepotManifest,
    type DesktopAggregateDepotManifest,
} from "@notnotype/neuro-book-contracts/desktop";
type AggregateDepotEntryName = typeof DESKTOP_AGGREGATE_DEPOT_ENTRIES[number];

type DesktopAggregateZipEntry = {
    kind: "file";
    source: string;
    archivePath: AggregateDepotEntryName;
};

type DesktopAggregateDirectoryEntry = {
    name: string;
    source: string;
    isFile: boolean;
    isDirectory: boolean;
    isSymbolicLink: boolean;
    bytes: number;
};

type DesktopAggregatePayload = {
    files: number;
    bytes: number;
    entries: DesktopAggregateZipEntry[];
};

function validateDesktopAggregateDepotEntries(entries: DesktopAggregateDirectoryEntry[]): void {
    const expected = new Set<string>(DESKTOP_AGGREGATE_DEPOT_ENTRIES);
    const actual = new Set(entries.map((entry) => entry.name));
    const missing = DESKTOP_AGGREGATE_DEPOT_ENTRIES.filter((name) => !actual.has(name));
    const extra = entries.filter((entry) => !expected.has(entry.name)).map((entry) => entry.name);
    if (missing.length > 0) throw new Error(`Desktop aggregate depot 缺少文件：${missing.join(", ")}`);
    if (extra.length > 0) throw new Error(`Desktop aggregate depot 包含未登记文件：${extra.join(", ")}`);
    if (entries.length !== DESKTOP_AGGREGATE_DEPOT_ENTRIES.length) {
        throw new Error("Desktop aggregate depot 顶层文件数量不符合固定合同。" );
    }
    for (const entry of entries) {
        if (entry.isSymbolicLink) throw new Error(`Desktop aggregate depot 不接受 symlink：${entry.name}`);
        if (!entry.isFile || entry.isDirectory) throw new Error(`Desktop aggregate depot 条目必须是普通文件：${entry.name}`);
        if (!Number.isSafeInteger(entry.bytes) || entry.bytes < 0) {
            throw new Error(`Desktop aggregate depot 文件大小无效：${entry.name}`);
        }
    }
}

async function readDirectoryEntries(root: string): Promise<DesktopAggregateDirectoryEntry[]> {
    const rootInfo = await lstat(root);
    if (!rootInfo.isDirectory() || rootInfo.isSymbolicLink()) {
        throw new Error(`Desktop aggregate depot staging 必须是真实目录：${root}`);
    }
    const names = await readdir(root);
    const entries = await Promise.all(names.map(async (name) => {
        const source = resolve(root, name);
        const info = await lstat(source);
        return {
            name,
            source,
            isFile: info.isFile(),
            isDirectory: info.isDirectory(),
            isSymbolicLink: info.isSymbolicLink(),
            bytes: info.isFile() ? info.size : 0,
        };
    }));
    return entries;
}

/** 收集固定顺序的普通文件并计算 payload 文件数/逻辑大小。 */
export async function inspectDesktopAggregateDepot(rootInput: string): Promise<DesktopAggregatePayload> {
    const root = resolve(rootInput);
    const entries = await readDirectoryEntries(root);
    validateDesktopAggregateDepotEntries(entries);
    const byName = new Map(entries.map((entry) => [entry.name, entry] as const));
    const zipEntries = DESKTOP_AGGREGATE_DEPOT_ENTRIES.map((archivePath) => {
        const entry = byName.get(archivePath);
        if (!entry) throw new Error(`Desktop aggregate depot 缺少文件：${archivePath}`);
        return {kind: "file", source: entry.source, archivePath} as const;
    });
    return {
        files: zipEntries.length,
        bytes: entries.reduce((total, entry) => total + entry.bytes, 0),
        entries: zipEntries,
    };
}

async function sha256File(path: string): Promise<string> {
    const hash = createHash("sha256");
    for await (const chunk of createReadStream(path)) hash.update(chunk);
    return hash.digest("hex");
}

/** 在 ZIP 已写出后构造 sidecar，并再次以实际文件内容计算 archive identity。 */
export async function createDesktopAggregateDepotManifest(input: {
    stagingRoot: string;
    archivePath: string;
}): Promise<DesktopAggregateDepotManifest> {
    const payload = await inspectDesktopAggregateDepot(input.stagingRoot);
    const archivePath = resolve(input.archivePath);
    const archiveInfo = await lstat(archivePath);
    if (!archiveInfo.isFile() || archiveInfo.isSymbolicLink()) {
        throw new Error(`Desktop aggregate depot archive 必须是普通文件：${archivePath}`);
    }
    if (basename(archivePath) !== DESKTOP_AGGREGATE_DEPOT_ARCHIVE) {
        throw new Error(`Desktop aggregate depot archive 文件名不符合合同：${basename(archivePath)}`);
    }
    return {
        schema: "nbook.desktop-depot/v1",
        platform: DESKTOP_AGGREGATE_DEPOT_PLATFORM,
        distributionManifest: DESKTOP_AGGREGATE_DEPOT_DISTRIBUTION_MANIFEST,
        entries: [...DESKTOP_AGGREGATE_DEPOT_ENTRIES],
        payload: {files: payload.files, bytes: payload.bytes},
        archive: {
            path: DESKTOP_AGGREGATE_DEPOT_ARCHIVE,
            bytes: archiveInfo.size,
            sha256: `sha256:${await sha256File(archivePath)}`,
        },
        distributionSchema: DESKTOP_DISTRIBUTION_SCHEMA,
    };
}

/** 在解压前复核固定文件名、sidecar、ZIP 大小和 ZIP SHA-256。 */
export async function verifyDesktopAggregateDepotArchive(input: {
    archivePath: string;
    manifestPath: string;
}): Promise<DesktopAggregateDepotManifest> {
    const manifestPath = resolve(input.manifestPath);
    if (basename(manifestPath) !== DESKTOP_AGGREGATE_DEPOT_MANIFEST) {
        throw new Error(`Desktop aggregate depot manifest 文件名不符合合同：${basename(manifestPath)}`);
    }
    const manifestInfo = await lstat(manifestPath);
    if (!manifestInfo.isFile() || manifestInfo.isSymbolicLink()) {
        throw new Error(`Desktop aggregate depot manifest 必须是普通文件：${manifestPath}`);
    }
    if (manifestInfo.size > 1024 * 1024) {
        throw new Error("Desktop aggregate depot manifest 超过 1 MiB。" );
    }
    const manifest = parseDesktopAggregateDepotManifest(JSON.parse(await readFile(manifestPath, "utf8")) as unknown);
    const archivePath = resolve(input.archivePath);
    if (basename(archivePath) !== DESKTOP_AGGREGATE_DEPOT_ARCHIVE) {
        throw new Error(`Desktop aggregate depot archive 文件名不符合合同：${basename(archivePath)}`);
    }
    const archiveInfo = await lstat(archivePath);
    if (!archiveInfo.isFile() || archiveInfo.isSymbolicLink()) {
        throw new Error(`Desktop aggregate depot archive 必须是普通文件：${archivePath}`);
    }
    const actualArchive = {
        bytes: archiveInfo.size,
        sha256: `sha256:${await sha256File(archivePath)}`,
    };
    if (actualArchive.bytes !== manifest.archive.bytes || actualArchive.sha256 !== manifest.archive.sha256) {
        throw new Error("Desktop aggregate depot archive 与 sidecar 不一致。" );
    }
    return manifest;
}

/** 复核 staging、sidecar、ZIP 大小和 ZIP SHA-256；任何一项不一致都失败。 */
export async function verifyDesktopAggregateDepot(input: {
    stagingRoot: string;
    archivePath: string;
    manifestPath: string;
}): Promise<DesktopAggregateDepotManifest> {
    const manifest = await verifyDesktopAggregateDepotArchive(input);
    const payload = await inspectDesktopAggregateDepot(input.stagingRoot);
    if (JSON.stringify(manifest.payload) !== JSON.stringify({
        files: payload.files,
        bytes: payload.bytes,
    })) {
        throw new Error("Desktop aggregate depot payload 与 sidecar 不一致。" );
    }
    return manifest;
}
