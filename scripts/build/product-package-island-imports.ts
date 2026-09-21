import {lstat, readFile, readdir, realpath, writeFile} from "node:fs/promises";
import {createRequire} from "node:module";
import {dirname, isAbsolute, relative, resolve, sep} from "node:path";
import {pathToFileURL} from "node:url";
import {init, parse} from "es-module-lexer";
import {productRuntimeIslandSourceRoot} from "#scripts/build/product-runtime-islands";

export type ProductPackageIslandRewriteResult = {
    scannedFiles: number;
    rewrittenFiles: number;
    rewrittenReferences: number;
    packages: string[];
};

type PackageSpecifier = {
    packageName: string;
    packageSubpath: string;
    suffix: string;
    resolutionSpecifier: string;
};

type PackageManifest = {
    // package.json 是构建期外部输入；读取后必须逐字段收窄。
    name?: unknown;
    main?: unknown;
};

/**
 * 把 Product 三类可执行输出中的字面量 package-island import 改成镜像内相对文件路径。
 *
 * 调用时 `server/node_modules` 必须已经完成复制。这样最终模块解析只依赖当前
 * Product Runtime Image，不会向 Installation Root 或构建仓库的 node_modules 回退。
 */
export async function rewriteProductPackageIslandImports(options: {
    serverRoot: string;
    sourceRoot?: string;
    packageNames: readonly string[];
}): Promise<ProductPackageIslandRewriteResult> {
    await init;
    const serverRoot = resolve(options.serverRoot);
    const sourceRoot = resolve(options.sourceRoot ?? ".");
    const packageNames = new Set(options.packageNames);
    const sourceRequire = createRequire(pathToFileURL(resolve(sourceRoot, "package.json")));
    const files = await executableFiles(serverRoot);
    const rewrittenPackages = new Set<string>();
    let rewrittenFiles = 0;
    let rewrittenReferences = 0;

    for (const filePath of files) {
        const source = await readFile(filePath, "utf8");
        const [imports] = parse(source);
        const replacements: Array<{start: number; end: number; value: string}> = [];
        for (const item of imports) {
            if (!item.n) continue;
            const descriptor = packageSpecifier(item.n);
            if (!descriptor || !packageNames.has(descriptor.packageName)) continue;
            const nextSpecifier = await resolveProductSpecifier({
                descriptor,
                importerPath: filePath,
                serverRoot,
                sourceRoot,
                sourceRequire,
            });
            replacements.push({
                start: item.s,
                end: item.e,
                value: item.d >= 0 ? JSON.stringify(nextSpecifier) : nextSpecifier,
            });
            rewrittenPackages.add(descriptor.packageName);
        }
        if (replacements.length === 0) continue;

        let rewritten = source;
        for (const replacement of replacements.sort((left, right) => right.start - left.start)) {
            rewritten = `${rewritten.slice(0, replacement.start)}${replacement.value}${rewritten.slice(replacement.end)}`;
        }
        await writeFile(filePath, rewritten, "utf8");
        rewrittenFiles += 1;
        rewrittenReferences += replacements.length;
    }

    return {
        scannedFiles: files.length,
        rewrittenFiles,
        rewrittenReferences,
        packages: [...rewrittenPackages].sort(),
    };
}

/** 枚举最终 Product 的固定入口与 commands/authoring 全部 ESM 输出。 */
async function executableFiles(serverRoot: string): Promise<string[]> {
    const entry = resolve(serverRoot, "index.mjs");
    await requireRegularFile(entry, "Product server entry");
    const files = [entry];
    for (const directoryName of ["commands", "authoring"]) {
        const directoryFiles = await listMjsFiles(resolve(serverRoot, directoryName));
        if (directoryFiles.length === 0) {
            throw new Error(`Product package-island 重写缺少 server/${directoryName}/**/*.mjs`);
        }
        files.push(...directoryFiles);
    }
    return [...new Set(files)].sort();
}

/**
 * 先使用 Source package resolution 找到真实入口；exports 拒绝显式 subpath 时，
 * 直接从已复制 package root 拼接 subpath。两条路径最终都必须落在同一 island 内。
 */
async function resolveProductSpecifier(options: {
    descriptor: PackageSpecifier;
    importerPath: string;
    serverRoot: string;
    sourceRoot: string;
    sourceRequire: NodeJS.Require;
}): Promise<string> {
    const {descriptor} = options;
    const sourcePackageRoot = await realpath(productRuntimeIslandSourceRoot(
        descriptor.packageName,
        options.sourceRoot,
    ));
    let resolvedSourcePath: string | undefined;
    let resolutionError: Error | undefined;
    try {
        resolvedSourcePath = options.sourceRequire.resolve(descriptor.resolutionSpecifier);
    } catch (error) {
        resolutionError = error instanceof Error ? error : new Error(String(error));
    }

    let packageRelativePath: string;
    if (resolvedSourcePath && isAbsolute(resolvedSourcePath)) {
        const canonicalSourcePath = await realpath(resolvedSourcePath);
        assertContainedPath(sourcePackageRoot, canonicalSourcePath, descriptor.resolutionSpecifier);
        packageRelativePath = relative(sourcePackageRoot, canonicalSourcePath);
    } else if (resolvedSourcePath === descriptor.packageName && !descriptor.packageSubpath) {
        packageRelativePath = await packageMainEntry({
            packageName: descriptor.packageName,
            packageRoot: sourcePackageRoot,
        });
    } else if (resolvedSourcePath) {
        throw new Error(
            `Product package island 返回非物理解析结果：${descriptor.resolutionSpecifier} -> ${resolvedSourcePath}`,
        );
    } else {
        if (!descriptor.packageSubpath) {
            throw new Error(`Product package island 无法解析入口：${descriptor.resolutionSpecifier}`, {
                cause: resolutionError,
            });
        }
        packageRelativePath = descriptor.packageSubpath;
    }

    const targetPackageRoot = resolve(
        options.serverRoot,
        "node_modules",
        ...descriptor.packageName.split("/"),
    );
    const targetPath = resolve(targetPackageRoot, ...packageRelativePath.replaceAll("\\", "/").split("/"));
    assertContainedPath(targetPackageRoot, targetPath, descriptor.resolutionSpecifier);
    await requireRegularFile(targetPath, `Product package island import ${descriptor.resolutionSpecifier}`);

    const importerRelativePath = relative(dirname(options.importerPath), targetPath).replaceAll("\\", "/");
    const portablePath = importerRelativePath.startsWith(".") ? importerRelativePath : `./${importerRelativePath}`;
    return `${portablePath}${descriptor.suffix}`;
}

/**
 * Bun 会把与 runtime builtin 同名的 npm 根包解析成 bare specifier。
 * 此时只接受已登记 island 自身 manifest 的 CommonJS 入口，不猜测构建机路径。
 */
async function packageMainEntry(options: {packageName: string; packageRoot: string}): Promise<string> {
    const manifestPath = resolve(options.packageRoot, "package.json");
    const manifest = JSON.parse(await readFile(manifestPath, "utf8")) as PackageManifest;
    if (manifest.name !== options.packageName) {
        throw new Error(`Product package island manifest 身份无效：${options.packageName} (${manifestPath})`);
    }
    if (manifest.main !== undefined && (typeof manifest.main !== "string" || !manifest.main.trim())) {
        throw new Error(`Product package island main 无效：${options.packageName} (${manifestPath})`);
    }
    const declaredEntry = resolve(options.packageRoot, manifest.main ?? "index.js");
    assertContainedPath(options.packageRoot, declaredEntry, options.packageName);
    await requireRegularFile(declaredEntry, `Product package island main ${options.packageName}`);
    const canonicalEntry = await realpath(declaredEntry);
    assertContainedPath(options.packageRoot, canonicalEntry, options.packageName);
    return relative(options.packageRoot, canonicalEntry);
}

/** 解析一个 bare package specifier，并拒绝可逃逸 package root 的 subpath。 */
function packageSpecifier(specifier: string): PackageSpecifier | null {
    const {base, suffix} = stripSpecifierSuffix(specifier);
    if (!base || base.startsWith(".") || base.startsWith("#") || base.startsWith("/")
        || base.includes("\\") || /^[A-Za-z][A-Za-z\d+.-]*:/u.test(base)) {
        return null;
    }
    const parts = base.split("/");
    const packagePartCount = base.startsWith("@") ? 2 : 1;
    if (parts.length < packagePartCount || parts.slice(0, packagePartCount).some((part) => !part)) return null;
    const packageName = parts.slice(0, packagePartCount).join("/");
    const subpathParts = parts.slice(packagePartCount);
    if (subpathParts.some((part) => !part || part === "." || part === "..")) {
        throw new Error(`Product package island subpath 无效：${specifier}`);
    }
    return {
        packageName,
        packageSubpath: subpathParts.join("/"),
        suffix,
        resolutionSpecifier: base,
    };
}

/** 稳定枚举目录中的 `.mjs` 文件。 */
async function listMjsFiles(root: string): Promise<string[]> {
    const files: string[] = [];
    const walk = async (directory: string): Promise<void> => {
        let entries;
        try {
            entries = await readdir(directory, {withFileTypes: true});
        } catch (error) {
            if (isNodeError(error) && error.code === "ENOENT") return;
            throw error;
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

/** 去掉 import query/hash，改写完成后再原样附回。 */
function stripSpecifierSuffix(specifier: string): {base: string; suffix: string} {
    const indexes = [specifier.indexOf("?"), specifier.indexOf("#")].filter((index) => index > 0);
    if (indexes.length === 0) return {base: specifier, suffix: ""};
    const suffixIndex = Math.min(...indexes);
    return {base: specifier.slice(0, suffixIndex), suffix: specifier.slice(suffixIndex)};
}

/** 路径必须留在声明 root 内。 */
function assertContainedPath(root: string, target: string, specifier: string): void {
    const child = relative(resolve(root), resolve(target));
    if (child === "" || (child !== ".." && !child.startsWith(`..${sep}`) && !isAbsolute(child))) return;
    throw new Error(`Product package island import 逃逸 package root：${specifier}`);
}

/** 最终 import 只能落到普通文件，目录和链接都不能充当可执行入口。 */
async function requireRegularFile(filePath: string, label: string): Promise<void> {
    let info;
    try {
        info = await lstat(filePath);
    } catch (error) {
        throw new Error(`${label} 不存在：${filePath}`, {cause: error});
    }
    if (!info.isFile() || info.isSymbolicLink()) throw new Error(`${label} 不是普通文件：${filePath}`);
}

/** Node 文件系统错误的集中收窄点。 */
function isNodeError(error: unknown): error is NodeJS.ErrnoException {
    return error instanceof Error && "code" in error;
}
