import {access, readFile} from "node:fs/promises";
import {builtinModules} from "node:module";
import {dirname, isAbsolute, relative, resolve} from "node:path";
import {fileURLToPath} from "node:url";
import {init, parse} from "es-module-lexer";

const nodeModulesMarker = "/node_modules/";
const packageManagerStorePattern = /(?:^|\/)node_modules\/(?:\.bun|\.pnpm)(?:\/|$)/u;
const builtinModuleNames = new Set(builtinModules.map((name) => name.replace(/^node:/u, "")));

/**
 * @typedef {object} RuntimePackageReference
 * @property {"bare" | "path"} kind
 * @property {string} packageName
 * @property {string} packageSubpath
 * @property {string} suffix
 * @property {string} originalSpecifier
 * @property {string} normalizedSpecifier
 * @property {string} importerPath
 * @property {string} physicalPackageRoot
 */

/**
 * @typedef {object} RuntimeModuleAnalysis
 * @property {string} source
 * @property {RuntimePackageReference[]} references
 * @property {string[]} seeds
 * @property {number} rewriteCount
 */

/**
 * 只从真实 ESM module specifier 收集 Product runtime package，并把包管理器物理路径
 * 规范化到 `.output/server/node_modules/<package>`。
 *
 * @param {{source: string, importerPath: string, serverRoot: string, projectRoot: string}} options
 * @returns {Promise<RuntimeModuleAnalysis>}
 */
export async function analyzeRuntimeModuleSource(options) {
    await init;
    let imports;
    try {
        [imports] = parse(options.source);
    } catch (error) {
        throw new Error(`无法解析 Nitro runtime module：${options.importerPath}`, {cause: error});
    }

    const references = [];
    const replacements = [];
    const seeds = new Set();

    for (const item of imports) {
        if (!item.n) {
            continue;
        }
        const descriptor = describePackageSpecifier(item.n, options.projectRoot);
        if (!descriptor) {
            continue;
        }
        const normalizedSpecifier = descriptor.kind === "path"
            ? runtimeVendorSpecifier(
                options.importerPath,
                options.serverRoot,
                descriptor.packageName,
                descriptor.packageSubpath,
                descriptor.suffix,
            )
            : item.n;
        const reference = {
            ...descriptor,
            originalSpecifier: item.n,
            normalizedSpecifier,
            importerPath: options.importerPath,
        };
        references.push(reference);
        seeds.add(descriptor.packageName);

        if (normalizedSpecifier !== item.n) {
            replacements.push({
                start: item.s,
                end: item.e,
                value: item.d >= 0 ? JSON.stringify(normalizedSpecifier) : normalizedSpecifier,
            });
        }
    }

    let source = options.source;
    for (const replacement of replacements.sort((left, right) => right.start - left.start)) {
        source = `${source.slice(0, replacement.start)}${replacement.value}${source.slice(replacement.end)}`;
    }

    return {
        source,
        references,
        seeds: [...seeds].sort(),
        rewriteCount: replacements.length,
    };
}

/**
 * 确认包管理器物理包与根 hoisted package 是同一个 name/version。
 * Product vendor 当前按规范包名落盘，版本冲突不能静默降级成错误版本。
 *
 * @param {RuntimePackageReference} reference
 * @param {string} projectRoot
 */
export async function assertRuntimePackageIdentity(reference, projectRoot) {
    if (reference.kind !== "path") {
        return;
    }
    const hoistedPackageRoot = resolve(projectRoot, "node_modules", ...reference.packageName.split("/"));
    const [physical, hoisted] = await Promise.all([
        readPackageIdentity(reference.physicalPackageRoot, reference.originalSpecifier),
        readPackageIdentity(hoistedPackageRoot, reference.packageName),
    ]);
    if (physical.name !== reference.packageName || hoisted.name !== reference.packageName) {
        throw new Error([
            `Nitro runtime package name 不一致：${reference.packageName}`,
            `physical=${physical.name}@${physical.version}`,
            `hoisted=${hoisted.name}@${hoisted.version}`,
            `importer=${reference.importerPath}`,
        ].join("\n"));
    }
    if (physical.version !== hoisted.version) {
        throw new Error([
            `Nitro runtime package 无法扁平化：${reference.packageName}`,
            `physical=${physical.version}`,
            `hoisted=${hoisted.version}`,
            `importer=${reference.importerPath}`,
            `specifier=${reference.originalSpecifier}`,
        ].join("\n"));
    }
}

/**
 * 重新解析改写后的 runtime module，确认包路径不再绑定构建机或包管理器存储，
 * 且每个路径型 external 都真实存在于 Product vendor。
 *
 * @param {{filePaths: string[], serverRoot: string, projectRoot: string}} options
 */
export async function assertRuntimeModuleFiles(options) {
    await init;
    let checked = 0;
    const failures = [];

    for (const filePath of options.filePaths) {
        const source = await readFile(filePath, "utf8");
        let imports;
        try {
            [imports] = parse(source);
        } catch (error) {
            throw new Error(`无法复核 Nitro runtime module：${filePath}`, {cause: error});
        }
        for (const item of imports) {
            if (!item.n) {
                continue;
            }
            const descriptor = describePackageSpecifier(item.n, options.projectRoot);
            if (!descriptor || descriptor.kind !== "path") {
                continue;
            }
            checked += 1;
            const normalized = normalizePathText(stripSpecifierSuffix(item.n).base);
            if (normalized.startsWith("file:") || packageManagerStorePattern.test(normalized)) {
                failures.push(`${relative(options.serverRoot, filePath)}: ${item.n}`);
                continue;
            }
            const targetPath = resolve(dirname(filePath), decodePathText(stripSpecifierSuffix(item.n).base));
            try {
                await access(targetPath);
            } catch {
                failures.push(`${relative(options.serverRoot, filePath)}: ${item.n}`);
            }
        }
    }

    if (failures.length > 0) {
        throw new Error([
            "Nitro runtime module 仍包含不可迁移或缺失的 Product vendor 引用：",
            ...failures.slice(0, 50).map((failure) => `- ${failure}`),
            ...(failures.length > 50 ? [`- 其余 ${failures.length - 50} 项已省略`] : []),
        ].join("\n"));
    }
    return {checked};
}

/**
 * 解析 bare package 或任意 node_modules 物理路径中的最后一个逻辑包边界。
 * 普通相对模块、builtin、URL 和 Nuxt virtual module 返回 null。
 *
 * @param {string} specifier
 * @param {string} projectRoot
 * @returns {Omit<RuntimePackageReference, "originalSpecifier" | "normalizedSpecifier" | "importerPath"> | null}
 */
function describePackageSpecifier(specifier, projectRoot) {
    const {base, suffix} = stripSpecifierSuffix(specifier);
    const decodedBase = decodePathText(base);
    const normalized = normalizePathText(decodedBase);
    const packageBoundary = lastNodeModulesBoundary(normalized);

    if (packageBoundary !== null) {
        const packageParts = readPackageParts(normalized.slice(packageBoundary));
        if (!packageParts || packageParts.packageName === ".bun" || packageParts.packageName === ".pnpm") {
            throw new Error(`无法从 Nitro external 路径解析逻辑包：${specifier}`);
        }
        return {
            kind: "path",
            packageName: packageParts.packageName,
            packageSubpath: packageParts.packageSubpath,
            suffix,
            physicalPackageRoot: physicalPackageRoot(
                base,
                normalized,
                packageBoundary,
                packageParts.packageName,
                projectRoot,
            ),
        };
    }

    if (
        normalized.startsWith(".")
        || normalized.startsWith("/")
        || normalized.startsWith("#")
        || isAbsolute(decodedBase)
        || /^[A-Za-z][A-Za-z\d+.-]*:/u.test(normalized)
    ) {
        return null;
    }
    const packageParts = readPackageParts(normalized);
    if (!packageParts || builtinModuleNames.has(packageParts.packageName)) {
        return null;
    }
    return {
        kind: "bare",
        packageName: packageParts.packageName,
        packageSubpath: packageParts.packageSubpath,
        suffix,
        physicalPackageRoot: resolve(projectRoot, "node_modules", ...packageParts.packageName.split("/")),
    };
}

/** 把规范包名和 subpath 写成相对于当前 importer 的 Product vendor specifier。 */
function runtimeVendorSpecifier(importerPath, serverRoot, packageName, packageSubpath, suffix) {
    const targetPath = resolve(
        serverRoot,
        "node_modules",
        ...packageName.split("/"),
        ...(packageSubpath ? packageSubpath.split("/") : []),
    );
    const relativePath = relative(dirname(importerPath), targetPath).replaceAll("\\", "/");
    const normalized = relativePath.startsWith(".") ? relativePath : `./${relativePath}`;
    return `${normalized}${suffix}`;
}

/** 返回最后一个 node_modules 后的逻辑包起点。 */
function lastNodeModulesBoundary(specifier) {
    const markerIndex = specifier.lastIndexOf(nodeModulesMarker);
    if (markerIndex >= 0) {
        return markerIndex + nodeModulesMarker.length;
    }
    return specifier.startsWith("node_modules/") ? "node_modules/".length : null;
}

/** 读取规范包名和包内 subpath。 */
function readPackageParts(packagePath) {
    const parts = packagePath.split("/").filter(Boolean);
    if (parts.length === 0) {
        return null;
    }
    if (parts[0].startsWith("@")) {
        if (!parts[1]) {
            return null;
        }
        return {
            packageName: `${parts[0]}/${parts[1]}`,
            packageSubpath: parts.slice(2).join("/"),
        };
    }
    return {
        packageName: parts[0],
        packageSubpath: parts.slice(1).join("/"),
    };
}

/** 解析原始 external 实际对应的构建机 package root。 */
function physicalPackageRoot(rawBase, normalizedBase, packageBoundary, packageName, projectRoot) {
    const logicalRootEnd = packageBoundary + packageName.length;
    if (rawBase.startsWith("file:")) {
        const filePath = runtimeFileUrlPath(rawBase);
        const fileBoundary = lastNodeModulesBoundary(filePath);
        if (fileBoundary === null) {
            throw new Error(`无法解析 Nitro external file URL：${rawBase}`);
        }
        return filePath.slice(0, fileBoundary + packageName.length);
    }
    if (isAbsolute(normalizedBase)) {
        return normalizedBase.slice(0, logicalRootEnd);
    }

    const firstMarkerIndex = normalizedBase.indexOf(nodeModulesMarker);
    const firstBoundary = firstMarkerIndex >= 0
        ? firstMarkerIndex + nodeModulesMarker.length
        : normalizedBase.startsWith("node_modules/") ? "node_modules/".length : -1;
    if (firstBoundary < 0) {
        throw new Error(`无法解析 Nitro external package root：${rawBase}`);
    }
    const physicalRelativeRoot = normalizedBase.slice(firstBoundary, logicalRootEnd);
    return resolve(projectRoot, "node_modules", ...physicalRelativeRoot.split("/"));
}

/** 当前平台 file URL 优先走标准转换；异平台 fixture 使用 URL pathname 做语义分析。 */
function runtimeFileUrlPath(value) {
    try {
        return normalizePathText(fileURLToPath(value));
    } catch {
        return normalizePathText(decodePathText(new URL(value).pathname));
    }
}

/** 读取用于扁平化一致性比较的最小 package identity。 */
async function readPackageIdentity(packageRoot, label) {
    try {
        const packageJson = JSON.parse(await readFile(resolve(packageRoot, "package.json"), "utf8"));
        if (typeof packageJson.name !== "string" || typeof packageJson.version !== "string") {
            throw new Error("package.json 缺少 name/version");
        }
        return {name: packageJson.name, version: packageJson.version};
    } catch (error) {
        throw new Error(`无法读取 Nitro runtime package identity：${label} (${packageRoot})`, {cause: error});
    }
}

/** 分离 import query/hash，规范化路径时原样保留。 */
function stripSpecifierSuffix(specifier) {
    const queryIndex = specifier.indexOf("?");
    const hashIndex = specifier.indexOf("#");
    const indexes = [queryIndex, hashIndex].filter((index) => index >= 0);
    if (indexes.length === 0) {
        return {base: specifier, suffix: ""};
    }
    const suffixIndex = Math.min(...indexes);
    return {base: specifier.slice(0, suffixIndex), suffix: specifier.slice(suffixIndex)};
}

/** 解码 URL path；非法百分号保留原文并由后续文件门禁报错。 */
function decodePathText(value) {
    try {
        return decodeURIComponent(value);
    } catch {
        return value;
    }
}

/** 统一使用 slash 分析 module specifier。 */
function normalizePathText(value) {
    return value.replaceAll("\\", "/");
}
