import {resolve} from "node:path";

export const SOURCE_PACKAGE_NAME = "@notnotype/neuro-book" as const;
export const SOURCE_PACKAGE_MANIFEST_PATH = "packages/neuro-book/package.json" as const;

export type SourcePackageManifest = {
    name: typeof SOURCE_PACKAGE_NAME;
    version: string;
    private: true;
    type: "module";
};

/** 只计算 manifest 位置；文件读取属于 root/Manager adapter。 */
export function sourcePackageManifestPath(repositoryRoot: string): string {
    return resolve(repositoryRoot, ...SOURCE_PACKAGE_MANIFEST_PATH.split("/"));
}

/** 从任意 package manifest 中严格收窄产品 identity 字段。 */
export function parseSourcePackageManifest(value: unknown): SourcePackageManifest {
    if (!value || typeof value !== "object" || Array.isArray(value)) {
        throw new Error("Source package manifest 必须是对象。");
    }
    const record = value as Record<string, unknown>;
    if (record.name !== SOURCE_PACKAGE_NAME || record.private !== true || record.type !== "module") {
        throw new Error("Source package manifest identity 不受支持。");
    }
    if (typeof record.version !== "string" || !record.version.trim()) {
        throw new Error("Source package manifest version 必须是非空字符串。");
    }
    return {
        name: SOURCE_PACKAGE_NAME,
        version: record.version,
        private: true,
        type: "module",
    };
}
