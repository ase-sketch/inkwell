import {createHash} from "node:crypto";
import {lstat, readFile, readdir, realpath} from "node:fs/promises";
import {builtinModules} from "node:module";
import {dirname, extname, isAbsolute, relative, resolve} from "node:path";
import {init, parse} from "es-module-lexer";
import {containsSourceRootDescendant} from "#scripts/build/product-source-path-contract";

const NATIVE_ISLAND_SCHEMA = "nbook.product-native-islands/v2";
const executableExtensions = new Set([".cjs", ".js", ".mjs"]);
const builtinModuleNames = new Set(builtinModules.map((name) => name.replace(/^node:/u, "")));
const packageManagerPathPattern = /(?:^|\/)\.(?:bun|pnpm)(?:\/|$)/u;

/**
 * @typedef {object} ProductRuntimeClosureResult
 * @property {number} roots Product 固定入口与目录投影中的 `.mjs` 数量。
 * @property {number} modules 实际解析的候选镜像内 JS 模块数量。
 * @property {number} references 已核对的字面量 ESM 引用数量。
 * @property {number} opaqueImports 无法静态解析、由运行时领域门禁负责的动态 import 数量。
 * @property {Array<{modulePath: string, expression: string, fingerprint: string, pathPattern: string}>} opaqueImportObservations
 * @property {string[]} packages 可执行图实际引用的 native package island。
 * @property {{schema: string, platform: string, islands: Array<{packages: string[], reason: string, smoke: string}>, opaqueImports: Array<{pathPattern: string, count: number, reason: string, smoke: string}>}} nativeIslands
 */

/**
 * 审计最终 Product 可执行模块图。
 *
 * `server/index.mjs`、`server/commands`、`server/authoring` 和 `server/assets` 下全部 `.mjs`
 * 都是审计根；相对 ESM 引用继续递归，进入 package island 后停在显式 manifest seam。
 * bare package 表示运行时仍可能向候选镜像祖先查找依赖，因此一律拒绝。
 *
 * @param {{imageRoot: string, buildRoots?: string[], expectedPlatform?: string}} options
 * @returns {Promise<ProductRuntimeClosureResult>}
 */
export async function assertProductRuntimeModuleClosure(options) {
    await init;
    const imageRoot = resolve(options.imageRoot);
    const serverRoot = resolve(imageRoot, "server");
    const [canonicalImageRoot, islandContract, roots] = await Promise.all([
        realpath(imageRoot),
        readNativeIslands(serverRoot),
        executableRoots(serverRoot),
    ]);
    if (options.expectedPlatform && islandContract.identity.platform !== options.expectedPlatform) {
        throw new Error(`Product native island manifest 平台不一致：expected=${options.expectedPlatform}, actual=${islandContract.identity.platform}`);
    }
    await assertIslandFiles(serverRoot, islandContract.packages);

    const buildRoots = [...new Set([
        imageRoot,
        ...(options.buildRoots ?? []),
    ].map((root) => resolve(root)))];
    const queue = [...roots];
    const visited = new Set();
    const usedPackages = new Set();
    const failures = [];
    let references = 0;
    let opaqueImports = 0;
    const opaqueImportObservations = [];
    const opaqueCounts = new Map(islandContract.opaqueImports.map((definition) => [definition.pathPattern, 0]));

    while (queue.length > 0) {
        const filePath = queue.shift();
        if (!filePath || visited.has(filePath)) continue;
        visited.add(filePath);

        let source;
        try {
            source = await readFile(filePath, "utf8");
        } catch (error) {
            failures.push(`${displayPath(serverRoot, filePath)}: 无法读取模块 (${errorMessage(error)})`);
            continue;
        }
        if (source.length === 0) {
            failures.push(`${displayPath(serverRoot, filePath)}: 可执行模块是0字节空文件`);
            continue;
        }
        const leakedRoot = leakedBuildRoot(source, buildRoots);
        if (leakedRoot) {
            failures.push(`${displayPath(serverRoot, filePath)}: 泄漏构建机绝对路径 ${leakedRoot}`);
        }
        const leakedStore = leakedPackageManagerStore(source);
        if (leakedStore) {
            failures.push(`${displayPath(serverRoot, filePath)}: 泄漏包管理器物理路径 ${leakedStore}`);
        }

        let imports;
        try {
            [imports] = parse(source);
        } catch (error) {
            failures.push(`${displayPath(serverRoot, filePath)}: ESM 解析失败 (${errorMessage(error)})`);
            continue;
        }
        for (const item of imports) {
            if (!item.n) {
                if (item.d >= 0) {
                    opaqueImports += 1;
                    const modulePath = displayPath(serverRoot, filePath);
                    const matches = islandContract.opaqueImports.filter((definition) => (
                        matchesPathPattern(definition.pathPattern, modulePath)
                    ));
                    if (matches.length !== 1) {
                        failures.push(`${modulePath}: opaque dynamic import 必须命中且只命中一项登记，实际 ${matches.length} 项`);
                    } else {
                        const pattern = matches[0].pathPattern;
                        opaqueCounts.set(pattern, (opaqueCounts.get(pattern) ?? 0) + 1);
                        const fullExpression = source.slice(item.ss, item.se);
                        opaqueImportObservations.push({
                            modulePath,
                            expression: fullExpression.slice(0, 240),
                            fingerprint: `sha256:${createHash("sha256").update(fullExpression).digest("hex")}`,
                            pathPattern: pattern,
                        });
                    }
                }
                continue;
            }
            references += 1;
            const specifier = item.n;
            const normalized = normalizePathText(specifier);
            if (hasPackageManagerPath(normalized)) {
                failures.push(`${displayPath(serverRoot, filePath)}: 包管理器物理路径 ${specifier}`);
                continue;
            }
            if (isRuntimeBuiltin(specifier)) continue;

            if (specifier.startsWith(".")) {
                const resolution = await resolveRelativeReference({
                    importerPath: filePath,
                    specifier,
                    imageRoot,
                    canonicalImageRoot,
                    serverRoot,
                });
                if (resolution.failure) {
                    failures.push(resolution.failure);
                    continue;
                }
                if (!resolution.targetPath) continue;
                const islandPackage = packageAtPath(serverRoot, resolution.targetPath);
                if (islandPackage) {
                    if (!islandContract.packages.has(islandPackage)) {
                        failures.push(`${displayPath(serverRoot, filePath)}: 引用了未登记 package island ${islandPackage} (${specifier})`);
                    } else {
                        usedPackages.add(islandPackage);
                    }
                    continue;
                }
                if (executableExtensions.has(extname(resolution.targetPath))) queue.push(resolution.targetPath);
                continue;
            }

            if (isAbsoluteModuleSpecifier(specifier)) {
                failures.push(`${displayPath(serverRoot, filePath)}: 含候选镜像外绝对引用 ${specifier}`);
                continue;
            }
            if (specifier.startsWith("#")) {
                failures.push(`${displayPath(serverRoot, filePath)}: 含未解析 package import ${specifier}`);
                continue;
            }
            const packageName = packageNameFromSpecifier(specifier);
            if (!packageName) {
                failures.push(`${displayPath(serverRoot, filePath)}: 含无法识别的 module specifier ${specifier}`);
                continue;
            }
            if (!islandContract.packages.has(packageName)) {
                failures.push(`${displayPath(serverRoot, filePath)}: bare package 未登记为 package island ${packageName} (${specifier})`);
                continue;
            }
            failures.push(`${displayPath(serverRoot, filePath)}: package island 仍为 bare import ${packageName} (${specifier})`);
        }
    }

    for (const definition of islandContract.opaqueImports) {
        const actual = opaqueCounts.get(definition.pathPattern) ?? 0;
        if (actual !== definition.count) {
            failures.push(`opaque dynamic import 登记数量不一致 ${definition.pathPattern}: expected=${definition.count}, actual=${actual}`);
            for (const observation of opaqueImportObservations.filter((item) => item.pathPattern === definition.pathPattern)) {
                failures.push(`opaque observation ${observation.modulePath}: ${observation.expression} (${observation.fingerprint})`);
            }
        }
    }

    if (failures.length > 0) {
        throw new Error([
            "Product Runtime 可执行模块闭包不完整：",
            ...failures.slice(0, 50).map((failure) => `- ${failure}`),
            ...(failures.length > 50 ? [`- 其余 ${failures.length - 50} 项已省略`] : []),
        ].join("\n"));
    }
    return {
        roots: roots.length,
        modules: visited.size,
        references,
        opaqueImports,
        opaqueImportObservations,
        packages: [...usedPackages].sort(),
        nativeIslands: islandContract.identity,
    };
}

/** 固定发现 Product 四类可执行模块，目录存在但没有 `.mjs` 同样 fail closed。 */
async function executableRoots(serverRoot) {
    const entry = resolve(serverRoot, "index.mjs");
    await requireRegularFile(entry, "Product server entry");
    const roots = [entry];
    for (const name of ["commands", "authoring", "assets"]) {
        const files = await listMjsFiles(resolve(serverRoot, name));
        if (files.length === 0) throw new Error(`Product Runtime 缺少 server/${name}/**/*.mjs`);
        roots.push(...files);
    }
    return [...new Set(roots)].sort();
}

/** 读取 native island manifest；它是 Product bare package 的唯一许可来源。 */
async function readNativeIslands(serverRoot) {
    const manifestPath = resolve(serverRoot, "native-islands.json");
    let manifest;
    try {
        manifest = JSON.parse(await readFile(manifestPath, "utf8"));
    } catch (error) {
        throw new Error(`无法读取 Product native island manifest：${manifestPath}`, {cause: error});
    }
    if (!manifest || typeof manifest !== "object" || Array.isArray(manifest)
        || manifest.schema !== NATIVE_ISLAND_SCHEMA || !Array.isArray(manifest.islands)
        || !Array.isArray(manifest.opaqueImports)) {
        throw new Error(`Product native island manifest 合同无效：${manifestPath}`);
    }
    if (typeof manifest.platform !== "string" || !manifest.platform.trim()) {
        throw new Error(`Product native island manifest 缺少平台身份：${manifestPath}`);
    }
    const packages = new Set();
    const islands = [];
    for (const [index, island] of manifest.islands.entries()) {
        if (!island || typeof island !== "object" || Array.isArray(island) || !Array.isArray(island.packages)
            || typeof island.reason !== "string" || !island.reason.trim()
            || typeof island.smoke !== "string" || !island.smoke.trim()) {
            throw new Error(`Product native island manifest islands[${index}] 无效。`);
        }
        const islandPackages = [];
        for (const packageName of island.packages) {
            if (typeof packageName !== "string" || packageNameFromSpecifier(packageName) !== packageName) {
                throw new Error(`Product native island manifest 含无效 package：${String(packageName)}`);
            }
            packages.add(packageName);
            islandPackages.push(packageName);
        }
        islands.push({packages: islandPackages, reason: island.reason, smoke: island.smoke});
    }
    const opaqueImports = manifest.opaqueImports.map((definition, index) => {
        if (!definition || typeof definition !== "object" || Array.isArray(definition)
            || typeof definition.pathPattern !== "string" || !validPathPattern(definition.pathPattern)
            || !Number.isSafeInteger(definition.count) || definition.count < 1
            || typeof definition.reason !== "string" || !definition.reason.trim()
            || typeof definition.smoke !== "string" || !definition.smoke.trim()) {
            throw new Error(`Product native island manifest opaqueImports[${index}] 无效。`);
        }
        return {
            pathPattern: definition.pathPattern,
            count: definition.count,
            reason: definition.reason,
            smoke: definition.smoke,
        };
    });
    if (new Set(opaqueImports.map((definition) => definition.pathPattern)).size !== opaqueImports.length) {
        throw new Error("Product native island manifest 含重复 opaque import path pattern。");
    }
    return {
        packages,
        opaqueImports,
        identity: {
            schema: NATIVE_ISLAND_SCHEMA,
            platform: manifest.platform,
            islands,
            opaqueImports,
        },
    };
}

/** opaque import pattern 只允许 Product server 相对路径和最多一个通配符。 */
function validPathPattern(pattern) {
    return pattern.length > 0 && pattern.endsWith(".mjs") && !pattern.includes("\\")
        && !pattern.startsWith("/") && !pattern.startsWith("*")
        && !pattern.split("/").some((segment) => !segment || segment === "." || segment === "..")
        && pattern.split("*").length <= 2;
}

/** 匹配 native-islands manifest 中受限的单星号路径模式。 */
function matchesPathPattern(pattern, modulePath) {
    const wildcard = pattern.indexOf("*");
    if (wildcard < 0) return pattern === modulePath;
    return modulePath.startsWith(pattern.slice(0, wildcard)) && modulePath.endsWith(pattern.slice(wildcard + 1));
}

/** manifest 中每个 package 都必须真实存在，覆盖只能由 opaque import 触发的 native binding。 */
async function assertIslandFiles(serverRoot, packages) {
    const missing = [];
    for (const packageName of [...packages].sort()) {
        const packageJson = resolve(serverRoot, "node_modules", ...packageName.split("/"), "package.json");
        try {
            await requireRegularFile(packageJson, `package island ${packageName}`);
        } catch {
            missing.push(packageName);
        }
    }
    if (missing.length > 0) {
        throw new Error(`Product Runtime 缺失已登记 package island：${missing.join(", ")}`);
    }
}

/** 解析一个候选镜像内相对引用，并拒绝 lexical/realpath 两种越界。 */
async function resolveRelativeReference(options) {
    const base = decodePathText(stripSpecifierSuffix(options.specifier));
    const lexicalTarget = resolve(dirname(options.importerPath), base);
    if (!isWithin(options.imageRoot, lexicalTarget)) {
        return {failure: `${displayPath(options.serverRoot, options.importerPath)}: 相对引用逃逸候选镜像 ${options.specifier}`};
    }
    const targetPath = await existingModulePath(lexicalTarget);
    if (!targetPath) {
        return {failure: `${displayPath(options.serverRoot, options.importerPath)}: 缺失相对可达 import ${options.specifier}`};
    }
    let canonicalTarget;
    try {
        canonicalTarget = await realpath(targetPath);
    } catch (error) {
        return {failure: `${displayPath(options.serverRoot, options.importerPath)}: 无法解析相对 import ${options.specifier} (${errorMessage(error)})`};
    }
    if (!isWithin(options.canonicalImageRoot, canonicalTarget)) {
        return {failure: `${displayPath(options.serverRoot, options.importerPath)}: 相对引用经链接逃逸候选镜像 ${options.specifier}`};
    }
    return {targetPath};
}

/** 支持生成器常见的显式文件与 extensionless JS 入口。 */
async function existingModulePath(basePath) {
    const candidates = extname(basePath)
        ? [basePath]
        : [basePath, `${basePath}.mjs`, `${basePath}.js`, `${basePath}.cjs`, resolve(basePath, "index.mjs"), resolve(basePath, "index.js")];
    for (const candidate of candidates) {
        try {
            const info = await lstat(candidate);
            if (info.isSymbolicLink()) continue;
            if (info.isFile()) return candidate;
        } catch {
            // 尝试下一个标准候选；全部未命中时由调用者统一报告。
        }
    }
    return null;
}

/** 找出 target 是否位于 `server/node_modules/<package>` package island。 */
function packageAtPath(serverRoot, targetPath) {
    const nodeModulesRoot = resolve(serverRoot, "node_modules");
    if (!isWithin(nodeModulesRoot, targetPath)) return null;
    const parts = relative(nodeModulesRoot, targetPath).replaceAll("\\", "/").split("/").filter(Boolean);
    if (parts.length === 0) return null;
    return parts[0].startsWith("@") && parts[1] ? `${parts[0]}/${parts[1]}` : parts[0];
}

/** 返回源码中泄漏的构建根后代路径；精确运行根本身不构成 Source 文件泄漏。 */
function leakedBuildRoot(source, buildRoots) {
    for (const root of buildRoots) {
        if (containsSourceRootDescendant(source, root)) {
            return normalizePathText(root);
        }
    }
    return null;
}

/** 检出 import 之外的 store metadata，同时避开 `/node_modules\/\.bun\//` 这类正则源码。 */
function leakedPackageManagerStore(source) {
    const normalizedLiterals = source.replaceAll("\\\\", "\\").replaceAll("\\", "/");
    for (const marker of ["node_modules/.bun/", "node_modules/.pnpm/"]) {
        if (normalizedLiterals.includes(marker)) return marker;
    }
    return null;
}

/** Node/Bun builtin 不需要 Product package island。 */
function isRuntimeBuiltin(specifier) {
    if (specifier === "bun" || specifier.startsWith("bun:") || specifier.startsWith("node:")) return true;
    return builtinModuleNames.has(specifier);
}

/** URL、POSIX、UNC 与任意平台盘符路径都属于绝对 module specifier。 */
function isAbsoluteModuleSpecifier(specifier) {
    const base = decodePathText(stripSpecifierSuffix(specifier));
    const normalized = normalizePathText(base);
    return isAbsolute(base) || normalized.startsWith("/") || normalized.startsWith("//")
        || /^[A-Za-z]:\//u.test(normalized) || /^[A-Za-z][A-Za-z\d+.-]*:/u.test(normalized);
}

/** bare specifier 到规范 package name；非 package 形式返回 null。 */
function packageNameFromSpecifier(specifier) {
    if (!specifier || specifier.startsWith(".") || specifier.startsWith("#") || isAbsoluteModuleSpecifier(specifier)) {
        return null;
    }
    const parts = specifier.split("/");
    if (specifier.startsWith("@")) {
        if (parts.length < 2 || !parts[0] || !parts[1]) return null;
        return `${parts[0]}/${parts[1]}`;
    }
    return parts[0] || null;
}

/** 稳定枚举最终 Product `.mjs`。 */
async function listMjsFiles(root) {
    const files = [];
    const walk = async (directory) => {
        let entries;
        try {
            entries = await readdir(directory, {withFileTypes: true});
        } catch {
            return;
        }
        for (const entry of entries.sort((left, right) => left.name.localeCompare(right.name))) {
            const filePath = resolve(directory, entry.name);
            if (entry.isDirectory()) await walk(filePath);
            else if (entry.isFile() && entry.name.endsWith(".mjs")) files.push(filePath);
        }
    };
    await walk(root);
    return files;
}

/** 断言路径是普通文件。 */
async function requireRegularFile(filePath, label) {
    const info = await lstat(filePath);
    if (!info.isFile()) throw new Error(`${label} 不是普通文件：${filePath}`);
}

/** 路径 containment 同时兼容 Windows drive 与 POSIX。 */
function isWithin(root, target) {
    const child = relative(root, target);
    return child === "" || (!child.startsWith("..") && !isAbsolute(child));
}

/** 错误位置始终以 server 相对路径展示。 */
function displayPath(serverRoot, filePath) {
    return relative(serverRoot, filePath).replaceAll("\\", "/") || "index.mjs";
}

/** 去掉 import query/hash。 */
function stripSpecifierSuffix(specifier) {
    const indexes = [specifier.indexOf("?"), specifier.indexOf("#")].filter((index) => index > 0);
    return indexes.length === 0 ? specifier : specifier.slice(0, Math.min(...indexes));
}

/** 解码 URL path；非法 escape 保留原文，由文件存在性门禁报告。 */
function decodePathText(value) {
    try {
        return decodeURIComponent(value);
    } catch {
        return value;
    }
}

/** `.bun` / `.pnpm` 不得成为最终 module specifier 的路径段。 */
function hasPackageManagerPath(specifier) {
    return packageManagerPathPattern.test(specifier);
}

/** 统一 slash 做跨平台 module specifier 分析。 */
function normalizePathText(value) {
    return value.replaceAll("\\", "/");
}

/** unknown error 到稳定测试文本。 */
function errorMessage(error) {
    return error instanceof Error ? error.message : String(error);
}
