import {existsSync, realpathSync} from "node:fs";
import {builtinModules, createRequire} from "node:module";
import {mkdir, readFile, realpath, writeFile} from "node:fs/promises";
import {dirname, isAbsolute, relative, resolve} from "node:path";
import {pathToFileURL} from "node:url";
import ts from "typescript";
import {
    bundleProductJavaScript,
    productBundleOutputText,
} from "#scripts/build/product-reproducible-bundle";

export type AuthoringDependencyRegistration = {
    name: string;
    kind: "runtime" | "types";
    purpose: string;
    smoke: string;
    /** 包声明中允许缺席的可选 peer；必须同时由上游 manifest 标记 optional。 */
    optionalTypePeers?: readonly string[];
};

export type ProjectedAuthoringDependency = Omit<AuthoringDependencyRegistration, "optionalTypePeers"> & {
    version: string;
};

export type ProjectedAuthoringDependencyInstance = {
    name: string;
    version: string;
    kind: "runtime" | "types";
    location: string;
    topLevel: boolean;
};

export type AuthoringDependencyProjection = {
    dependencies: ProjectedAuthoringDependency[];
    instances: ProjectedAuthoringDependencyInstance[];
};

type SourcePackage = {
    registration: AuthoringDependencyRegistration;
    sourceRoot: string;
    targetRoot: string;
    version: string;
    manifest: PackageManifest;
    topLevel: boolean;
};

type PackageManifest = {
    name?: string;
    version?: string;
    peerDependencies?: Record<string, string>;
    peerDependenciesMeta?: Record<string, {optional?: boolean}>;
};

type DeclarationReference = {
    specifier: string;
    ignored: boolean;
};

type PendingDeclaration = {
    sourcePath: string;
    owner: SourcePackage;
};

const TYPESCRIPT_OPTIONS: ts.CompilerOptions = {
    target: ts.ScriptTarget.ESNext,
    module: ts.ModuleKind.ESNext,
    moduleResolution: ts.ModuleResolutionKind.Bundler,
};

const RUNTIME_BUILTINS = new Set([
    ...builtinModules,
    ...builtinModules.map((name) => `node:${name}`),
    "bun",
]);

/**
 * 从 Profile SDK 发现的第三方 specifier 建立受批准的声明可达图。
 *
 * 每个解析结果都必须属于登记 package 且版本一致。声明只复制可达文件；运行
 * dependency 额外生成单文件实现，避免把 package 的源码、测试和双格式产物带入 Product。
 */
export async function projectAuthoringDependencies(input: {
    seedSpecifiers: ReadonlySet<string>;
    targetNodeModulesRoot: string;
    registrations: readonly AuthoringDependencyRegistration[];
    importerPath: string;
    sourceRoot: string;
}): Promise<AuthoringDependencyProjection> {
    const packages = await sourcePackages(input.registrations, input.targetNodeModulesRoot, input.sourceRoot);
    const packageByName = new Map(packages.map((entry) => [entry.registration.name, entry]));
    const packageInstances = new Map(packages.map((entry) => [packageInstanceKey(entry.targetRoot, entry.version), entry]));
    const queue: PendingDeclaration[] = [];
    const visited = new Set<string>();
    const usedPackages = new Set<string>();
    const rootDeclarationByPackage = new Map<string, string>();

    for (const specifier of [...input.seedSpecifiers].sort()) {
        if (isRuntimeBuiltin(specifier)) continue;
        const packageName = packageNameFromSpecifier(specifier);
        const owner = packageByName.get(packageName);
        if (!owner) throw new Error(`Authoring declaration 含未登记第三方依赖：${specifier}`);
        const resolvedPath = resolvePackageDeclaration(specifier, input.importerPath, owner);
        queue.push({sourcePath: resolvedPath, owner});
        if (specifier === packageName) rootDeclarationByPackage.set(packageName, resolvedPath);
    }

    while (queue.length > 0) {
        const pending = queue.shift()!;
        const identity = `${normalizedPath(pending.owner.targetRoot)}:${normalizedPath(pending.sourcePath)}`;
        if (visited.has(identity)) continue;
        visited.add(identity);
        usedPackages.add(pending.owner.registration.name);
        assertDeclarationInsidePackage(pending.owner, pending.sourcePath);

        const source = normalizePhysicalProbes(
            pending.sourcePath,
            await readFile(pending.sourcePath, "utf8"),
        );
        await copyDeclaration(pending.owner, pending.sourcePath, source);
        for (const reference of declarationReferences(pending.sourcePath, source)) {
            const referenced = await resolveDeclarationReference(reference, pending, packageByName, packageInstances);
            if (referenced) queue.push(referenced);
        }
        for (const referencedFile of declarationFileReferences(pending.sourcePath, source)) {
            queue.push({sourcePath: referencedFile, owner: pending.owner});
        }
        for (const typeReference of declarationTypeReferences(pending.sourcePath, source)) {
            const referenced = await resolveTypeReference(typeReference, pending, packageByName, packageInstances);
            if (referenced) queue.push(referenced);
        }
    }

    const unused = packages
        .map((entry) => entry.registration.name)
        .filter((name) => !usedPackages.has(name));
    if (unused.length > 0) {
        throw new Error(`Authoring dependency 登记但未被声明图使用：${unused.join(", ")}`);
    }

    for (const entry of packageInstances.values()) {
        const targetRoot = entry.targetRoot;
        const sourceManifestPath = resolve(entry.sourceRoot, "package.json");
        await mkdir(targetRoot, {recursive: true});
        if (entry.registration.kind === "runtime" && entry.topLevel) {
            const declarationPath = rootDeclarationByPackage.get(entry.registration.name);
            if (!declarationPath) {
                throw new Error(`Authoring runtime dependency 缺少 package 根声明入口：${entry.registration.name}`);
            }
            await bundleRuntimePackage(entry, targetRoot, declarationPath);
        } else {
            await writeFile(resolve(targetRoot, "package.json"), await readFile(sourceManifestPath, "utf8"), "utf8");
        }
    }

    return {
        dependencies: packages.map((entry) => ({
            name: entry.registration.name,
            version: entry.version,
            kind: entry.registration.kind,
            purpose: entry.registration.purpose,
            smoke: entry.registration.smoke,
        })),
        instances: [...packageInstances.values()]
            .map((entry) => ({
                name: entry.registration.name,
                version: entry.version,
                kind: entry.registration.kind,
                location: relative(input.targetNodeModulesRoot, entry.targetRoot).split(/[\\/]+/u).join("/"),
                topLevel: entry.topLevel,
            }))
            .sort((left, right) => left.location.localeCompare(right.location)),
    };
}

/** 读取批准 package 的稳定身份；重复登记或 manifest 身份不一致直接失败。 */
async function sourcePackages(
    registrations: readonly AuthoringDependencyRegistration[],
    targetNodeModulesRoot: string,
    sourceRoot: string,
): Promise<SourcePackage[]> {
    const requireFromSource = createRequire(pathToFileURL(resolve(sourceRoot, "package.json")));
    const seen = new Set<string>();
    const entries: SourcePackage[] = [];
    for (const registration of registrations) {
        if (seen.has(registration.name)) throw new Error(`Authoring dependency 重复登记：${registration.name}`);
        seen.add(registration.name);
        const packageJsonPath = resolveAuthoringDependencyManifest(requireFromSource, registration.name);
        const manifest = JSON.parse(await readFile(packageJsonPath, "utf8")) as PackageManifest;
        if (manifest.name !== registration.name || typeof manifest.version !== "string" || !manifest.version) {
            throw new Error(`Authoring dependency identity 无效：${registration.name}`);
        }
        entries.push({
            registration,
            sourceRoot: await realpath(dirname(packageJsonPath)),
            targetRoot: resolve(targetNodeModulesRoot, ...registration.name.split("/")),
            version: manifest.version,
            manifest,
            topLevel: true,
        });
    }
    return entries;
}

function resolveAuthoringDependencyManifest(requireFromSource: NodeRequire, packageName: string): string {
    try {
        return requireFromSource.resolve(`${packageName}/package.json`);
    } catch (packageJsonError) {
        let entryPath: string;
        try {
            entryPath = requireFromSource.resolve(packageName);
        } catch (entryError) {
            throw new Error(`Authoring dependency 无法解析：${packageName}`, {cause: entryError});
        }
        let directory = dirname(entryPath);
        while (true) {
            const candidate = resolve(directory, "package.json");
            try {
                const manifest = require(candidate) as PackageManifest;
                if (manifest.name === packageName) return candidate;
            } catch {
                // 入口所属 package 的 manifest 是唯一可接受身份；其它目录继续向上探测。
            }
            const parent = dirname(directory);
            if (parent === directory) break;
            directory = parent;
        }
        throw new Error(`Authoring dependency 无法定位 manifest：${packageName}`, {cause: packageJsonError});
    }
}

/** 使用 TypeScript 的 package exports/types 规则解析声明入口，并核对 package identity。 */
function resolvePackageDeclaration(specifier: string, importerPath: string, owner: SourcePackage): string {
    const resolved = ts.resolveModuleName(specifier, importerPath, TYPESCRIPT_OPTIONS, ts.sys).resolvedModule;
    if (!resolved || !isDeclarationPath(resolved.resolvedFileName)) {
        throw new Error(`Authoring dependency 没有可解析声明入口：${specifier}`);
    }
    if (resolved.packageId?.name !== owner.registration.name || resolved.packageId.version !== owner.version) {
        throw new Error([
            `Authoring dependency 版本或身份不一致：${specifier}`,
            `expected=${owner.registration.name}@${owner.version}`,
            `resolved=${resolved.packageId?.name ?? "unknown"}@${resolved.packageId?.version ?? "unknown"}`,
        ].join("\n"));
    }
    const resolvedPath = realpathSync(resolved.resolvedFileName);
    assertDeclarationInsidePackage(owner, resolvedPath);
    return resolvedPath;
}

/** 解析声明中的 import/re-export/import type，并保留 lock 中的嵌套版本拓扑。 */
async function resolveDeclarationReference(
    reference: DeclarationReference,
    importer: PendingDeclaration,
    packageByName: ReadonlyMap<string, SourcePackage>,
    packageInstances: Map<string, SourcePackage>,
): Promise<PendingDeclaration | null> {
    if (isRuntimeBuiltin(reference.specifier)) return null;
    const packageName = reference.specifier.startsWith(".")
        ? importer.owner.registration.name
        : packageNameFromSpecifier(reference.specifier);
    const topLevelOwner = packageByName.get(packageName);
    if (!topLevelOwner) {
        if (reference.ignored || isOptionalPeer(importer.owner, packageName)) return null;
        throw new Error(`${importer.owner.registration.name} 声明引用未登记依赖：${reference.specifier}`);
    }

    const resolved = ts.resolveModuleName(reference.specifier, importer.sourcePath, TYPESCRIPT_OPTIONS, ts.sys).resolvedModule;
    if (!resolved || !isDeclarationPath(resolved.resolvedFileName)) {
        if (reference.ignored || isOptionalPeer(importer.owner, packageName)) return null;
        throw new Error(`${relative(importer.owner.sourceRoot, importer.sourcePath)} 无法解析声明：${reference.specifier}`);
    }
    if (reference.specifier.startsWith(".")) {
        if (isPathInside(importer.owner.sourceRoot, resolved.resolvedFileName)) {
            return {sourcePath: resolved.resolvedFileName, owner: importer.owner};
        }
        if (reference.ignored) return null;
        throw new Error(`${importer.owner.registration.name} 相对声明越出 package：${reference.specifier}`);
    }
    if (!resolved.packageId || resolved.packageId.name !== topLevelOwner.registration.name) {
        if (reference.ignored) return null;
        throw new Error(`Authoring dependency 解析到错误身份：${reference.specifier}`);
    }
    const owner = await resolvedPackageInstance(resolved, importer.owner, topLevelOwner, packageInstances);
    const resolvedPath = realpathSync(resolved.resolvedFileName);
    assertDeclarationInsidePackage(owner, resolvedPath);
    return {sourcePath: resolvedPath, owner};
}

/** 解析 `/// <reference path>`；它只能留在当前 package。 */
function declarationFileReferences(importerPath: string, source: string): string[] {
    const sourceFile = ts.createSourceFile(importerPath, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
    return sourceFile.referencedFiles.map((reference) => {
        const target = resolve(dirname(importerPath), reference.fileName);
        if (!existsSync(target) || !isDeclarationPath(target)) {
            throw new Error(`${importerPath} 无法解析 declaration reference path：${reference.fileName}`);
        }
        return realpathSync(target);
    });
}

/** 收集 `/// <reference types>`，由 TypeScript resolver 找到对应 @types package。 */
function declarationTypeReferences(importerPath: string, source: string): string[] {
    const sourceFile = ts.createSourceFile(importerPath, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
    return sourceFile.typeReferenceDirectives.map((reference) => reference.fileName);
}

/** 解析 Type Reference Directive，并复用 package identity 与嵌套版本门禁。 */
async function resolveTypeReference(
    reference: string,
    importer: PendingDeclaration,
    packageByName: ReadonlyMap<string, SourcePackage>,
    packageInstances: Map<string, SourcePackage>,
): Promise<PendingDeclaration | null> {
    const packageName = reference.startsWith("@") ? reference : `@types/${reference}`;
    const topLevelOwner = packageByName.get(packageName);
    if (!topLevelOwner) throw new Error(`${importer.owner.registration.name} 声明引用未登记 types：${reference}`);
    const resolved = ts.resolveTypeReferenceDirective(reference, importer.sourcePath, TYPESCRIPT_OPTIONS, ts.sys)
        .resolvedTypeReferenceDirective;
    if (!resolved || !isDeclarationPath(resolved.resolvedFileName)) {
        throw new Error(`${importer.owner.registration.name} 无法解析 types：${reference}`);
    }
    if (!resolved.packageId || resolved.packageId.name !== topLevelOwner.registration.name) {
        throw new Error(`Authoring types 解析到错误身份：${reference}`);
    }
    const owner = await resolvedPackageInstance(resolved, importer.owner, topLevelOwner, packageInstances);
    const resolvedPath = realpathSync(resolved.resolvedFileName);
    assertDeclarationInsidePackage(owner, resolvedPath);
    return {sourcePath: resolvedPath, owner};
}

/**
 * 将 TypeScript 实际解析到的 package 实例投影到其 importer 的嵌套 node_modules。
 * 同版本实例复用；不同版本绝不扁平覆盖登记在根部的 authoring runtime。
 */
async function resolvedPackageInstance(
    resolved: ts.ResolvedModuleFull | ts.ResolvedTypeReferenceDirective,
    importerOwner: SourcePackage,
    topLevelOwner: SourcePackage,
    packageInstances: Map<string, SourcePackage>,
): Promise<SourcePackage> {
    const version = resolved.packageId?.version;
    if (!version) throw new Error(`Authoring dependency 缺少解析版本：${topLevelOwner.registration.name}`);
    if (version === topLevelOwner.version && isPathInside(topLevelOwner.sourceRoot, resolved.resolvedFileName)) {
        return topLevelOwner;
    }
    const sourceRoot = await realpath(packageRootForResolvedFile(resolved.resolvedFileName, topLevelOwner.registration.name));
    const targetRoot = resolve(importerOwner.targetRoot, "node_modules", ...topLevelOwner.registration.name.split("/"));
    const key = packageInstanceKey(targetRoot, version);
    const existing = packageInstances.get(key);
    if (existing) {
        if (normalizedPath(existing.sourceRoot) !== normalizedPath(sourceRoot)) {
            throw new Error(`Authoring nested dependency 同一目标出现不同来源：${topLevelOwner.registration.name}@${version}`);
        }
        return existing;
    }
    const manifest = JSON.parse(await readFile(resolve(sourceRoot, "package.json"), "utf8")) as PackageManifest;
    if (manifest.name !== topLevelOwner.registration.name || manifest.version !== version) {
        throw new Error(`Authoring nested dependency identity 无效：${topLevelOwner.registration.name}@${version}`);
    }
    const instance: SourcePackage = {
        registration: {...topLevelOwner.registration, kind: "types"},
        sourceRoot,
        targetRoot,
        version,
        manifest,
        topLevel: false,
    };
    packageInstances.set(key, instance);
    return instance;
}

/** 从解析文件的最后一个 node_modules 边界恢复真实 package root。 */
function packageRootForResolvedFile(filePath: string, packageName: string): string {
    const normalized = resolve(filePath).replaceAll("\\", "/");
    const suffix = `/node_modules/${packageName}/`;
    const boundary = normalized.toLowerCase().lastIndexOf(suffix.toLowerCase());
    if (boundary < 0) throw new Error(`无法恢复 package root：${packageName} <- ${filePath}`);
    return normalized.slice(0, boundary + suffix.length - 1);
}

/** package 实例由 Product 目标路径与精确版本共同标识。 */
function packageInstanceKey(targetRoot: string, version: string): string {
    return `${normalizedPath(targetRoot)}@${version}`;
}

/** 从 TypeScript AST 收集声明依赖，并识别上游明确标注 `@ts-ignore` 的兼容探测。 */
function declarationReferences(filePath: string, source: string): DeclarationReference[] {
    const sourceFile = ts.createSourceFile(filePath, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
    const references: DeclarationReference[] = [];
    const visit = (node: ts.Node): void => {
        let specifier: ts.StringLiteral | null = null;
        if ((ts.isImportDeclaration(node) || ts.isExportDeclaration(node))
            && node.moduleSpecifier && ts.isStringLiteral(node.moduleSpecifier)) {
            specifier = node.moduleSpecifier;
        } else if (ts.isImportTypeNode(node) && ts.isLiteralTypeNode(node.argument)
            && ts.isStringLiteral(node.argument.literal)) {
            specifier = node.argument.literal;
        }
        if (specifier) {
            let statement: ts.Node = node;
            while (statement.parent && !ts.isSourceFile(statement.parent)) statement = statement.parent;
            references.push({
                specifier: specifier.text,
                ignored: source.slice(statement.getFullStart(), specifier.getStart(sourceFile)).includes("@ts-ignore"),
            });
        }
        ts.forEachChild(node, visit);
    };
    visit(sourceFile);
    return references;
}

/**
 * 把上游声明为兼容多种包管理器而枚举的物理 node_modules 探测路径收敛为逻辑包名。
 * 只改写 AST 已确认的 import type 字符串，不触碰注释、普通字符串或真实相对声明。
 */
function normalizePhysicalProbes(filePath: string, source: string): string {
    const sourceFile = ts.createSourceFile(filePath, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
    const replacements: Array<{start: number; end: number; value: string}> = [];
    const visit = (node: ts.Node): void => {
        if (ts.isImportTypeNode(node) && ts.isLiteralTypeNode(node.argument)
            && ts.isStringLiteral(node.argument.literal)) {
            const specifier = node.argument.literal;
            const logicalSpecifier = logicalProbeSpecifier(specifier.text);
            if (logicalSpecifier) {
                replacements.push({
                    start: specifier.getStart(sourceFile) + 1,
                    end: specifier.getEnd() - 1,
                    value: JSON.stringify(logicalSpecifier).slice(1, -1),
                });
            }
        }
        ts.forEachChild(node, visit);
    };
    visit(sourceFile);

    let normalized = source;
    for (const replacement of replacements.sort((left, right) => right.start - left.start)) {
        normalized = normalized.slice(0, replacement.start) + replacement.value + normalized.slice(replacement.end);
    }
    return normalized;
}

/** 从 `../node_modules/<package>/index.d.ts` 探测路径恢复可解析的逻辑 specifier。 */
function logicalProbeSpecifier(specifier: string): string | null {
    if (!specifier.startsWith(".")) return null;
    const normalized = specifier.replaceAll("\\", "/");
    const marker = "/node_modules/";
    const boundary = normalized.lastIndexOf(marker);
    if (boundary < 0) return null;
    const packagePath = normalized.slice(boundary + marker.length);
    const packageName = packageNameFromSpecifier(packagePath);
    const packageSubpath = packagePath.slice(packageName.length);
    if (packageSubpath !== "" && !/^\/index\.d\.(?:ts|mts|cts)$/u.test(packageSubpath)) return null;
    if (!packageName.startsWith("@types/")) return packageName;

    const typeName = packageName.slice("@types/".length);
    const scopedSeparator = typeName.indexOf("__");
    return scopedSeparator < 0
        ? typeName
        : `@${typeName.slice(0, scopedSeparator)}/${typeName.slice(scopedSeparator + 2)}`;
}

/** 把声明复制到 package 原相对位置；目标路径不能逃逸 node_modules package root。 */
async function copyDeclaration(owner: SourcePackage, sourcePath: string, source: string): Promise<void> {
    const packageRelative = relative(owner.sourceRoot, sourcePath);
    if (!packageRelative || packageRelative.startsWith("..") || isAbsolute(packageRelative)) {
        throw new Error(`Authoring declaration 越出 package：${sourcePath}`);
    }
    const targetPath = resolve(owner.targetRoot, packageRelative);
    await mkdir(dirname(targetPath), {recursive: true});
    await writeFile(targetPath, source, "utf8");
}

/** 为批准的运行 dependency 生成单文件 ESM 实现，并保留已投影的声明入口。 */
async function bundleRuntimePackage(entry: SourcePackage, targetRoot: string, declarationPath: string): Promise<void> {
    const requireFromSource = createRequire(pathToFileURL(resolve(entry.sourceRoot, "package.json")));
    const runtimeEntry = requireFromSource.resolve(entry.registration.name);
    const runtimeOutput = resolve(targetRoot, "index.mjs");
    const result = await bundleProductJavaScript({
        entryPoints: [runtimeEntry],
        outfile: runtimeOutput,
        write: false,
    });
    await writeFile(
        runtimeOutput,
        productBundleOutputText(result, `Authoring runtime dependency bundle：${entry.registration.name}`),
        "utf8",
    );
    const declarationRelative = relative(entry.sourceRoot, declarationPath).split(/[\\/]+/u).join("/");
    await writeFile(resolve(targetRoot, "package.json"), `${JSON.stringify({
        name: entry.registration.name,
        version: entry.version,
        type: "module",
        types: `./${declarationRelative}`,
        exports: {
            ".": {
                types: `./${declarationRelative}`,
                import: "./index.mjs",
                default: "./index.mjs",
            },
        },
    }, null, 4)}\n`, "utf8");
}

/** 可选 peer 必须同时在注册表和上游 package manifest 中明确标记。 */
function isOptionalPeer(owner: SourcePackage, packageName: string): boolean {
    if (!owner.registration.optionalTypePeers?.includes(packageName)) return false;
    return typeof owner.manifest.peerDependencies?.[packageName] === "string"
        && owner.manifest.peerDependenciesMeta?.[packageName]?.optional === true;
}

/** package specifier 到规范 package name，支持 scoped package 与 subpath。 */
function packageNameFromSpecifier(specifier: string): string {
    const segments = specifier.split("/");
    if (specifier.startsWith("@")) {
        if (segments.length < 2) throw new Error(`无效 scoped package specifier：${specifier}`);
        return segments.slice(0, 2).join("/");
    }
    return segments[0]!;
}

/** 所有声明文件必须物理位于其登记 package root 内。 */
function assertDeclarationInsidePackage(owner: SourcePackage, filePath: string): void {
    const packageRelative = relative(owner.sourceRoot, filePath);
    if (!packageRelative || packageRelative.startsWith("..") || isAbsolute(packageRelative)) {
        throw new Error(`${owner.registration.name} 声明越出 package root：${filePath}`);
    }
}

/** 判断文件是否位于指定 package root，避免同版本不同 peer 实例被错误扁平化。 */
function isPathInside(root: string, filePath: string): boolean {
    const pathFromRoot = relative(root, filePath);
    return Boolean(pathFromRoot) && !pathFromRoot.startsWith("..") && !isAbsolute(pathFromRoot);
}

/** 判断 Node/Bun runtime builtin；这些类型由 Authoring tsconfig 的 Node types 提供。 */
function isRuntimeBuiltin(specifier: string): boolean {
    const rootName = specifier.split("/")[0]!;
    return RUNTIME_BUILTINS.has(specifier) || RUNTIME_BUILTINS.has(rootName)
        || specifier.startsWith("node:") || specifier.startsWith("bun:");
}

/** Authoring projection 只接受真实声明文件，不把 package implementation 当声明兜底。 */
function isDeclarationPath(filePath: string): boolean {
    return /\.d\.(?:ts|mts|cts)$/u.test(filePath);
}

/** Windows package 路径比较不区分大小写。 */
function normalizedPath(filePath: string): string {
    const normalized = resolve(filePath).replaceAll("\\", "/");
    return process.platform === "win32" ? normalized.toLowerCase() : normalized;
}
