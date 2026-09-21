import {DESKTOP_DISTRIBUTION_SCHEMA} from "./desktop-contract";
export const DESKTOP_AGGREGATE_DEPOT_SCHEMA = "nbook.desktop-depot/v1" as const;
export const DESKTOP_AGGREGATE_DEPOT_PLATFORM = "windows-x64" as const;
export const DESKTOP_AGGREGATE_DEPOT_ARCHIVE = "neuro-book-desktop-depot-win-x64.zip" as const;
export const DESKTOP_AGGREGATE_DEPOT_MANIFEST = "neuro-book-desktop-depot-win-x64.manifest.json" as const;
export const DESKTOP_AGGREGATE_DEPOT_DISTRIBUTION_MANIFEST = "neuro-book-desktop-depot-win-x64.distribution.json" as const;

/** Electron beta depot 的固定顶层载荷；Product、Bun、Tool Pack 不在此层重复展开。 */
export const DESKTOP_AGGREGATE_DEPOT_ENTRIES = [
    "install-desktop.ps1",
    "windows-bun-stage0.ps1",
    DESKTOP_AGGREGATE_DEPOT_DISTRIBUTION_MANIFEST,
    "neuro-book-electron-portable-win-x64.zip",
    "neuro-book-electron-portable-win-x64.manifest.json",
] as const;

type AggregateDepotEntryName = typeof DESKTOP_AGGREGATE_DEPOT_ENTRIES[number];

export type DesktopAggregateDepotManifest = {
    schema: typeof DESKTOP_AGGREGATE_DEPOT_SCHEMA;
    platform: typeof DESKTOP_AGGREGATE_DEPOT_PLATFORM;
    distributionManifest: typeof DESKTOP_AGGREGATE_DEPOT_DISTRIBUTION_MANIFEST;
    entries: AggregateDepotEntryName[];
    payload: {
        files: number;
        bytes: number;
    };
    archive: {
        path: typeof DESKTOP_AGGREGATE_DEPOT_ARCHIVE;
        bytes: number;
        sha256: `sha256:${string}`;
    };
    distributionSchema: typeof DESKTOP_DISTRIBUTION_SCHEMA;
};

/** 从不可信 sidecar JSON 中提取并严格校验固定 depot 合同。 */
export function parseDesktopAggregateDepotManifest(input: unknown): DesktopAggregateDepotManifest {
    if (!input || typeof input !== "object") throw new Error("Desktop aggregate depot manifest 必须是对象。" );
    const value = input as {
        schema?: unknown;
        platform?: unknown;
        distributionManifest?: unknown;
        entries?: unknown;
        payload?: unknown;
        archive?: unknown;
        distributionSchema?: unknown;
    };
    if (value.schema !== DESKTOP_AGGREGATE_DEPOT_SCHEMA
        || value.platform !== DESKTOP_AGGREGATE_DEPOT_PLATFORM
        || value.distributionManifest !== DESKTOP_AGGREGATE_DEPOT_DISTRIBUTION_MANIFEST
        || value.distributionSchema !== DESKTOP_DISTRIBUTION_SCHEMA) {
        throw new Error("Desktop aggregate depot manifest schema 或 platform 不受支持。" );
    }
    if (!Array.isArray(value.entries)
        || value.entries.length !== DESKTOP_AGGREGATE_DEPOT_ENTRIES.length
        || value.entries.some((entry) => typeof entry !== "string")
        || value.entries.some((entry, index) => entry !== DESKTOP_AGGREGATE_DEPOT_ENTRIES[index])) {
        throw new Error("Desktop aggregate depot manifest entries 不符合固定合同。" );
    }
    if (!value.payload || typeof value.payload !== "object") throw new Error("Desktop aggregate depot manifest 缺少 payload。" );
    const payload = value.payload as {files?: unknown; bytes?: unknown};
    if (payload.files !== DESKTOP_AGGREGATE_DEPOT_ENTRIES.length
        || typeof payload.bytes !== "number"
        || !Number.isSafeInteger(payload.bytes)
        || payload.bytes < 0) {
        throw new Error("Desktop aggregate depot manifest payload 不符合固定合同。" );
    }
    if (!value.archive || typeof value.archive !== "object") throw new Error("Desktop aggregate depot manifest 缺少 archive。" );
    const archive = value.archive as {path?: unknown; bytes?: unknown; sha256?: unknown};
    if (archive.path !== DESKTOP_AGGREGATE_DEPOT_ARCHIVE
        || typeof archive.bytes !== "number"
        || !Number.isSafeInteger(archive.bytes)
        || archive.bytes < 0
        || typeof archive.sha256 !== "string"
        || !/^sha256:[0-9a-f]{64}$/u.test(archive.sha256)) {
        throw new Error("Desktop aggregate depot manifest archive 不符合固定合同。" );
    }
    return {
        schema: DESKTOP_AGGREGATE_DEPOT_SCHEMA,
        platform: DESKTOP_AGGREGATE_DEPOT_PLATFORM,
        distributionManifest: DESKTOP_AGGREGATE_DEPOT_DISTRIBUTION_MANIFEST,
        entries: [...DESKTOP_AGGREGATE_DEPOT_ENTRIES],
        payload: {files: payload.files, bytes: payload.bytes},
        archive: {
            path: DESKTOP_AGGREGATE_DEPOT_ARCHIVE,
            bytes: archive.bytes as number,
            sha256: archive.sha256 as `sha256:${string}`,
        },
        distributionSchema: DESKTOP_DISTRIBUTION_SCHEMA,
    };
}
