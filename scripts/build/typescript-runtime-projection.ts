import {cp, mkdir, readFile, readdir, rm, stat, writeFile} from "node:fs/promises";
import {dirname, relative, resolve} from "node:path";

export type TypeScriptRuntimeProjection = {
    files: string[];
    bytes: number;
    sourceFiles: number;
    sourceBytes: number;
};

type TypeScriptPackageManifest = {
    name: "typescript";
    version: string;
    main: string;
    typings: string;
    engines?: {node?: string};
};

/**
 * 投影Product真正使用的TypeScript compiler package形状。
 *
 * 主入口和声明入口来自package metadata；标准库从Authoring tsconfig的lib或target
 * 派生，并递归跟随reference lib/path。tsc、tsserver、locale和文档不属于Runtime。
 */
export async function projectTypeScriptRuntime(input: {
    sourceRoot: string;
    targetRoot: string;
    authoringTsconfigPath: string;
}): Promise<TypeScriptRuntimeProjection> {
    const sourceRoot = resolve(input.sourceRoot);
    const targetRoot = resolve(input.targetRoot);
    const manifest = await readManifest(resolve(sourceRoot, "package.json"));
    const sourceInventory = await directoryInventory(sourceRoot);
    const seeds = new Set<string>([
        normalizePackagePath(manifest.main, "typescript.main"),
        normalizePackagePath(manifest.typings, "typescript.typings"),
        ...await tsconfigLibSeeds(input.authoringTsconfigPath),
    ]);
    const queue = [...seeds];
    const files = new Set<string>(["package.json"]);
    while (queue.length > 0) {
        const relativePath = queue.shift()!;
        if (files.has(relativePath)) continue;
        const sourcePath = resolveContained(sourceRoot, relativePath, "TypeScript projection source");
        const info = await stat(sourcePath).catch(() => null);
        if (!info?.isFile()) throw new Error(`TypeScript projection 缺少文件：${relativePath}`);
        files.add(relativePath);
        if (!relativePath.endsWith(".d.ts")) continue;
        const source = await readFile(sourcePath, "utf8");
        for (const referenced of declarationReferences(relativePath, source)) {
            if (!files.has(referenced)) queue.push(referenced);
        }
    }

    await rm(targetRoot, {recursive: true, force: true});
    for (const relativePath of [...files].sort()) {
        const sourcePath = resolveContained(sourceRoot, relativePath, "TypeScript projection source");
        const targetPath = resolveContained(targetRoot, relativePath, "TypeScript projection target");
        await mkdir(dirname(targetPath), {recursive: true});
        if (relativePath === "package.json") {
            await writeFile(targetPath, `${JSON.stringify({
                name: manifest.name,
                version: manifest.version,
                main: manifest.main,
                typings: manifest.typings,
                ...(manifest.engines ? {engines: manifest.engines} : {}),
            }, null, 4)}\n`, "utf8");
        } else {
            await cp(sourcePath, targetPath);
        }
    }
    const inventory = await directoryInventory(targetRoot);
    return {
        files: [...files].sort(),
        bytes: inventory.bytes,
        sourceFiles: sourceInventory.files,
        sourceBytes: sourceInventory.bytes,
    };
}

/** 从Authoring tsconfig读取显式lib；未设置时按target使用TypeScript默认full lib。 */
async function tsconfigLibSeeds(tsconfigPath: string): Promise<string[]> {
    // tsconfig是Builder生成的受控JSON，但仍通过unknown逐字段收窄。
    const value: unknown = JSON.parse(await readFile(tsconfigPath, "utf8"));
    if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Authoring tsconfig必须是对象。");
    const compilerOptions = (value as {compilerOptions?: unknown}).compilerOptions;
    if (!compilerOptions || typeof compilerOptions !== "object" || Array.isArray(compilerOptions)) {
        throw new Error("Authoring tsconfig缺少compilerOptions。");
    }
    const options = compilerOptions as {lib?: unknown; target?: unknown};
    if (options.lib !== undefined) {
        if (!Array.isArray(options.lib) || !options.lib.every((item) => typeof item === "string")) {
            throw new Error("Authoring tsconfig compilerOptions.lib必须是字符串数组。");
        }
        return options.lib.map((item) => normalizeLibFile(item));
    }
    const target = typeof options.target === "string" ? options.target.toLowerCase() : "es5";
    const normalizedTarget = target === "esnext" || /^es20(?:1[5-9]|2[0-4])$/u.test(target) ? target : "es5";
    return [normalizeLibFile(`lib.${normalizedTarget}.full.d.ts`)];
}

/** 收集标准库声明的reference lib与reference path，并限制在package lib目录。 */
function declarationReferences(importer: string, source: string): string[] {
    const references = new Set<string>();
    for (const match of source.matchAll(/\/\/\/\s*<reference\s+lib=["']([^"']+)["']/gu)) {
        references.add(normalizeLibFile(match[1]!));
    }
    for (const match of source.matchAll(/\/\/\/\s*<reference\s+path=["']([^"']+)["']/gu)) {
        const target = relative(".", resolve(dirname(importer), match[1]!)).replaceAll("\\", "/");
        if (!target.startsWith("lib/") || target.includes("../")) {
            throw new Error(`TypeScript declaration reference path逃逸lib：${importer} -> ${match[1]}`);
        }
        references.add(target);
    }
    return [...references].sort();
}

/** 把tsconfig lib名规范化为TypeScript package内的声明路径。 */
function normalizeLibFile(value: string): string {
    const normalized = value.trim().toLowerCase();
    const name = normalized.startsWith("lib.") ? normalized : `lib.${normalized}`;
    const fileName = name.endsWith(".d.ts") ? name : `${name}.d.ts`;
    if (!/^lib\.[a-z0-9.]+\.d\.ts$/u.test(fileName)) throw new Error(`非法TypeScript lib：${value}`);
    return `lib/${fileName}`;
}

/** package入口只允许普通相对文件，拒绝exports逃逸。 */
function normalizePackagePath(value: string, label: string): string {
    const normalized = value.replaceAll("\\", "/").replace(/^\.\//u, "");
    if (!normalized || normalized.startsWith("/") || normalized.split("/").includes("..")) {
        throw new Error(`${label}不是package内相对路径：${value}`);
    }
    return normalized;
}

/** 读取并验证TypeScript package metadata。 */
async function readManifest(path: string): Promise<TypeScriptPackageManifest> {
    // package.json是外部依赖输入，必须先按unknown检查身份和入口。
    const value: unknown = JSON.parse(await readFile(path, "utf8"));
    if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("TypeScript package manifest必须是对象。");
    const manifest = value as Partial<TypeScriptPackageManifest>;
    if (manifest.name !== "typescript" || typeof manifest.version !== "string" || !manifest.version
        || typeof manifest.main !== "string" || typeof manifest.typings !== "string") {
        throw new Error("TypeScript package manifest身份或入口无效。");
    }
    return manifest as TypeScriptPackageManifest;
}

/** 把相对路径解析到给定root内。 */
function resolveContained(root: string, relativePath: string, label: string): string {
    const target = resolve(root, ...relativePath.split("/"));
    const relativePathFromRoot = relative(root, target);
    if (!relativePathFromRoot || relativePathFromRoot === ".." || relativePathFromRoot.startsWith("../")
        || relativePathFromRoot.startsWith("..\\")) {
        throw new Error(`${label}逃逸root：${relativePath}`);
    }
    return target;
}

/** 统计Projection前后文件数和逻辑字节。 */
async function directoryInventory(root: string): Promise<{files: number; bytes: number}> {
    let files = 0;
    let bytes = 0;
    const walk = async (directory: string): Promise<void> => {
        for (const entry of await readdir(directory, {withFileTypes: true})) {
            const path = resolve(directory, entry.name);
            if (entry.isDirectory()) await walk(path);
            else if (entry.isFile()) {
                files += 1;
                bytes += (await stat(path)).size;
            } else throw new Error(`TypeScript projection不允许特殊文件：${path}`);
        }
    };
    await walk(root);
    return {files, bytes};
}
