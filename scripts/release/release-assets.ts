#!/usr/bin/env bun
import {createHash, randomUUID} from "node:crypto";
import {createReadStream, existsSync} from "node:fs";
import {copyFile, link, lstat, mkdir, mkdtemp, readFile, readdir, rm, stat, writeFile} from "node:fs/promises";
import {basename, dirname, join, relative, resolve} from "node:path";
import {Command} from "commander";
import {unzipSync} from "fflate";

import {PRODUCT_ASSET_NAMES, PRODUCT_PLATFORMS, type ProductPlatform} from "@notnotype/neuro-book-contracts/platform";
import {parseReleaseManifest, type ReleaseManifest} from "@notnotype/neuro-book-contracts/release";
import {currentProductPlatform} from "#scripts/utils/product-platform";
import {LocalProductPublisher} from "#scripts/build/local-product-publisher";
import {
    ProductRuntimeImageBuilder,
    type ProductRuntimeExpectedIdentity,
    type ProductRuntimeImageManifest,
} from "#scripts/build/product-runtime-image-builder";
import {assertProductSystemArtifactContract} from "#scripts/build/product-system-artifact-contract";
import {
    assertStateMigrationSourceFiles,
    readReleaseStateMigrationDeclaration,
} from "#scripts/release/state-migration-declaration";
import {
    openReleaseOutput,
    prepareReleaseOutput,
    readReleaseGeneration,
    releaseBuildId,
    type ReleaseOutput,
} from "#scripts/release/release-output";
import {verifyReleaseChecksums, writeReleaseChecksums} from "#scripts/release/release-checksums";
import {run, runCapture} from "#scripts/utils/process.mjs";
import {isRuntimeTestSourcePath} from "#scripts/utils/runtime-source-prune.mjs";
import {writeZipArchive} from "#scripts/utils/zip";

const ROOT = resolve(import.meta.dirname, "..", "..");
const SOURCE_BUILD_FILE = "source-build.json";
const PRODUCT_BUILD_FILE = "product-build.json";
const RELEASE_BUILD_FILES = [SOURCE_BUILD_FILE, PRODUCT_BUILD_FILE] as const;
const RELEASE_BUILD_SCHEMA = "nbook.release-build/v1";

const program = new Command().name("release-assets");

program.command("source")
    .action(async () => {
        const output = await prepareReleaseOutput(ROOT);
        await buildSourceArchive(output.assetPath("inkwell-source.zip"), ROOT);
    });

program.command("product")
    .requiredOption("--platform <platform>")
    .action(async (options: {platform: string}) => {
        if (!(options.platform in PRODUCT_ASSET_NAMES)) throw new Error(`不支持的 Product 平台：${options.platform}`);
        const platform = options.platform as ProductPlatform;
        const hostPlatform = currentProductPlatform();
        if (platform !== hostPlatform) {
            throw new Error(`当前宿主${hostPlatform}不能包装${platform} Product；不支持交叉包装现有.output。`);
        }
        const output = await openReleaseOutput(ROOT);
        await buildProductArchive(platform, output.assetPath(PRODUCT_ASSET_NAMES[platform]), ROOT);
    });

program.command("manifest")
    .requiredOption("--tag <tag>")
    .requiredOption("--revision <sha>")
    .requiredOption("--manager-version <version>")
    .requiredOption("--ghcr-ref <ref>")
    .requiredOption("--ghcr-digest <digest>")
    .action(async (options: ManifestCliOptions) => {
        const output = await openReleaseOutput(ROOT);
        await publishStage0Installers(output, ROOT);
        await buildReleaseManifest(releaseManifestOptions(options, output), ROOT);
    });

program.command("verify")
    .requiredOption("--dir <path>")
    .requiredOption("--tag <tag>")
    .requiredOption("--revision <sha>")
    .action((options: {dir: string; tag: string; revision: string}) => verifyReleaseAssets(resolve(ROOT, options.dir), options.tag, options.revision));

if (import.meta.main) await program.parseAsync(process.argv);

type ReleaseBuildBase = {
    schema: typeof RELEASE_BUILD_SCHEMA;
    kind: "source" | "product";
    buildId: string;
    version: string;
    revision: string;
    dirty: false;
    lockfileSha256: string;
};

export type ReleaseSourceBuild = ReleaseBuildBase & {
    kind: "source";
};

export type ReleaseProductBuild = ReleaseBuildBase & {
    kind: "product";
    platform: ProductPlatform;
    imageId: string;
    sourceDigest: string;
    treeDigest: string;
    builderContractVersion: string;
};

export type ReleaseBuild = ReleaseSourceBuild | ReleaseProductBuild;

export {releaseBuildId};

type ManifestCliOptions = {
    tag: string;
    revision: string;
    managerVersion: string;
    ghcrRef: string;
    ghcrDigest: string;
};

export type ManifestOptions = {
    tag: string;
    revision: string;
    managerVersion: string;
    source: string;
    windowsProduct: string;
    linuxProduct: string;
    linuxAarch64Product: string;
    darwinProduct: string;
    darwinAarch64Product: string;
    portable: string;
    stage0Windows: string;
    stage0WindowsCmd: string;
    stage0Linux: string;
    ghcrRef: string;
    ghcrDigest: string;
    output: string;
};

/** 把干净 Git Source 与统一构建身份打成平台无关 zip。 */
export async function buildSourceArchive(output: string, projectRoot = ROOT): Promise<void> {
    await prepareVacantOutput(output, "Source archive");
    const before = await releaseSourceBuild(projectRoot);
    const files = await trackedFiles(projectRoot);
    if (files.some((path) => isReleaseBuildFile(path))) {
        throw new Error(`${SOURCE_BUILD_FILE}/${PRODUCT_BUILD_FILE} 是 Release 生成文件，不能由 Git Source 提供。`);
    }
    const stateMigration = await readReleaseStateMigrationDeclaration(projectRoot);
    assertStateMigrationSourceFiles(files, stateMigration);
    const stagingRoot = await releaseStagingRoot(output, "source");
    const temporaryArchive = join(stagingRoot, basename(output));
    try {
        const identityPath = join(stagingRoot, SOURCE_BUILD_FILE);
        await writeFile(identityPath, releaseBuildText(before), {encoding: "utf8", flag: "wx"});
        await writeZipArchive(temporaryArchive, [
            ...files.map((path) => ({kind: "file" as const, source: resolve(projectRoot, path), archivePath: path})),
            {kind: "file", source: identityPath, archivePath: SOURCE_BUILD_FILE},
        ]);
        assertSameReleaseBuild(before, await releaseSourceBuild(projectRoot), "Source archive 构建期间 Source 身份发生变化");
        await publishArchive(temporaryArchive, output, "Source archive");
    } finally {
        await rm(stagingRoot, {recursive: true, force: true});
    }
    console.log(`Source archive: ${relative(projectRoot, output)} (${files.length + 1} files)`);
}

/** 只把当前平台已 ready、身份匹配的 Product Runtime Image 打成 Product overlay。 */
export async function buildProductArchive(platformInput: string, output: string, projectRoot = ROOT): Promise<void> {
    if (!(platformInput in PRODUCT_ASSET_NAMES)) throw new Error(`不支持的 Product 平台：${platformInput}`);
    const platform = platformInput as ProductPlatform;
    if (basename(output) !== PRODUCT_ASSET_NAMES[platform]) {
        throw new Error(`${platform} Product输出资产名必须为${PRODUCT_ASSET_NAMES[platform]}。`);
    }
    const hostPlatform = currentProductPlatform();
    if (platform !== hostPlatform) {
        throw new Error(`当前宿主${hostPlatform}不能包装${platform} Product；不支持交叉包装现有.output。`);
    }
    await prepareVacantOutput(output, `${platform} Product archive`);

    const source = await releaseSourceBuild(projectRoot);
    const expected: ProductRuntimeExpectedIdentity = {
        version: source.version,
        revision: source.revision,
        dirty: false,
        platform,
        lockfileSha256: source.lockfileSha256,
    };
    const builder = new ProductRuntimeImageBuilder(projectRoot);
    const publisher = new LocalProductPublisher(projectRoot, builder);
    await publisher.withPublishedCheckout(expected, async (image) => {
        if (!existsSync(resolve(image.path, "server", "index.mjs"))) {
            throw new Error("Product Runtime Image 缺少 server/index.mjs，请重新执行 bun run nuxt:build。");
        }
        await assertProductSystemArtifactContract(projectRoot, image.path);

        const metadata = releaseProductBuild(image.manifest);
        assertSameReleaseBuild(source, metadata, "Product Runtime Image 与 Release Source 代次不一致");
        const stagingRoot = await releaseStagingRoot(output, `product-${platform}`);
        const temporaryArchive = join(stagingRoot, basename(output));
        try {
            const identityPath = join(stagingRoot, PRODUCT_BUILD_FILE);
            await writeFile(identityPath, releaseBuildText(metadata), {encoding: "utf8", flag: "wx"});
            if (platform === "windows-x64") {
                const files = await directoryFiles(image.path);
                await writeZipArchive(temporaryArchive, [
                    ...files.map((path) => ({
                        kind: "file" as const,
                        source: resolve(image.path, path),
                        archivePath: `.output/${path}`,
                    })),
                    {kind: "file", source: identityPath, archivePath: PRODUCT_BUILD_FILE},
                ]);
            } else {
                await run("tar", [
                    "-czf", temporaryArchive,
                    "-C", dirname(image.path), basename(image.path),
                    "-C", stagingRoot, PRODUCT_BUILD_FILE,
                ], {cwd: projectRoot});
            }

            assertSameReleaseBuild(source, await releaseSourceBuild(projectRoot), "Product archive 构建期间 Source 身份发生变化");
            await publishArchive(temporaryArchive, output, `${platform} Product archive`);
        } finally {
            await rm(stagingRoot, {recursive: true, force: true});
        }
    });
}

/** 把 CLI 的代次级参数与统一 Release output 中的固定资产路径组合起来。 */
function releaseManifestOptions(options: ManifestCliOptions, output: ReleaseOutput): ManifestOptions {
    return {
        ...options,
        source: output.assetPath("inkwell-source.zip"),
        windowsProduct: output.assetPath(PRODUCT_ASSET_NAMES["windows-x64"]),
        linuxProduct: output.assetPath(PRODUCT_ASSET_NAMES["linux-x64-glibc"]),
        linuxAarch64Product: output.assetPath(PRODUCT_ASSET_NAMES["linux-aarch64-glibc"]),
        darwinProduct: output.assetPath(PRODUCT_ASSET_NAMES["darwin-x64"]),
        darwinAarch64Product: output.assetPath(PRODUCT_ASSET_NAMES["darwin-aarch64"]),
        portable: output.assetPath("inkwell-windows-x64.zip"),
        stage0Windows: output.assetPath("install.ps1"),
        stage0WindowsCmd: output.assetPath("install.cmd"),
        stage0Linux: output.assetPath("install.sh"),
        output: output.assetPath("release-manifest.json"),
    };
}

/** Stage 0 文件先复制到同卷 staging，再以 no-clobber hard link 发布到当前代次。 */
async function publishStage0Installers(output: ReleaseOutput, projectRoot: string): Promise<void> {
    const stagingRoot = await releaseStagingRoot(output.assetPath("release-manifest.json"), "stage0");
    const installers = [
        {source: resolve(projectRoot, "scripts", "install", "install.ps1"), name: "install.ps1" as const},
        {source: resolve(projectRoot, "scripts", "install", "install.cmd"), name: "install.cmd" as const},
        {source: resolve(projectRoot, "scripts", "install", "install.sh"), name: "install.sh" as const},
    ];
    try {
        for (const installer of installers) {
            const staged = resolve(stagingRoot, installer.name);
            await copyFile(installer.source, staged);
            await publishArchive(staged, output.assetPath(installer.name), `Stage 0 ${installer.name}`);
        }
    } finally {
        await rm(stagingRoot, {recursive: true, force: true});
    }
}

/** 汇总平台产物、GHCR digest 和 checksum，生成正式 Release Manifest。 */
export async function buildReleaseManifest(options: ManifestOptions, projectRoot = ROOT): Promise<void> {
    const tag = options.tag.startsWith("v") ? options.tag : `v${options.tag}`;
    const version = tag.slice(1);
    const output = resolve(projectRoot, options.output);
    const checksums = resolve(dirname(output), "SHA256SUMS");
    await prepareVacantOutput(output, "Release manifest");
    await assertVacant(checksums, "Release checksums");
    const assemblySource = await releaseSourceBuild(projectRoot);
    const packageVersion = assemblySource.version;
    if (version !== packageVersion) {
        throw new Error(`Release tag ${tag} 与 package.json version ${packageVersion} 不一致。`);
    }
    const stateMigration = await readReleaseStateMigrationDeclaration(projectRoot);
    const baseUrl = `https://github.com/notnotype/neuro-book/releases/download/${encodeURIComponent(tag)}`;
    const sourcePath = resolve(projectRoot, options.source);
    const source = await asset(sourcePath, baseUrl);
    const productPaths = {
        "windows-x64": resolve(projectRoot, options.windowsProduct),
        "linux-x64-glibc": resolve(projectRoot, options.linuxProduct),
        "linux-aarch64-glibc": resolve(projectRoot, options.linuxAarch64Product),
        "darwin-x64": resolve(projectRoot, options.darwinProduct),
        "darwin-aarch64": resolve(projectRoot, options.darwinAarch64Product),
    } satisfies Record<ProductPlatform, string>;
    const archiveBuilds = await assertArchiveBuildSet(sourcePath, productPaths, version, options.revision);
    assertSameReleaseBuild(assemblySource, archiveBuilds.source, "Release Manifest checkout 与 Source archive 代次不一致");
    const productBuilds = archiveBuilds.products;
    const products = await Promise.all(PRODUCT_PLATFORMS.map(async (platform) => {
        const runtime = productBuilds[platform];
        return {
            ...await asset(productPaths[platform], baseUrl),
            platform,
            sourceRevision: options.revision,
            imageId: runtime.imageId,
            sourceDigest: runtime.sourceDigest,
            lockfileSha256: runtime.lockfileSha256,
            builderContractVersion: runtime.builderContractVersion,
        };
    }));
    const portable = await asset(resolve(projectRoot, options.portable), baseUrl);
    await assertArchiveBuildSet(sourcePath, productPaths, version, options.revision);
    const manifest = {
        schemaVersion: 5,
        buildId: assemblySource.buildId,
        version,
        channel: version.includes("-") ? "canary" : "stable",
        sourceRevision: options.revision,
        minManagerVersion: options.managerVersion,
        source,
        products,
        windowsPortable: portable,
        ghcr: {
            ref: options.ghcrRef,
            digest: options.ghcrDigest,
            sourceRevision: options.revision,
        },
        stateMigration,
    } satisfies ReleaseManifest;
    parseReleaseManifest(manifest);
    const stagingRoot = await releaseStagingRoot(output, "manifest");
    const stagedManifest = resolve(stagingRoot, basename(output));
    const stagedChecksums = resolve(stagingRoot, "SHA256SUMS");
    await writeFile(stagedManifest, `${JSON.stringify(manifest, null, 4)}\n`, {encoding: "utf8", flag: "wx"});
    const allFiles = [
        resolve(projectRoot, options.source),
        ...Object.values(productPaths),
        resolve(projectRoot, options.portable),
        stagedManifest,
        resolve(projectRoot, options.stage0Windows),
        resolve(projectRoot, options.stage0WindowsCmd),
        resolve(projectRoot, options.stage0Linux),
    ];
    try {
        await writeReleaseChecksums(allFiles, stagedChecksums);
        await publishArchive(stagedChecksums, checksums, "Release checksums");
        try {
            // Manifest 是发行目录的 ready 信号，必须在 checksum 完成后最后发布。
            await publishArchive(stagedManifest, output, "Release manifest");
        } catch (error) {
            await rm(checksums, {force: true});
            throw error;
        }
    } finally {
        await rm(stagingRoot, {recursive: true, force: true});
    }
}

/** 对最终公开资产重新计算 checksum，并检查 Product/Portable 平台内容。 */
async function verifyReleaseAssets(directory: string, tagInput: string, revision: string): Promise<void> {
    const tag = tagInput.startsWith("v") ? tagInput : `v${tagInput}`;
    const manifest = parseReleaseManifest(JSON.parse(await readFile(resolve(directory, "release-manifest.json"), "utf8")));
    if (`v${manifest.version}` !== tag || manifest.sourceRevision !== revision) {
        throw new Error("Release tag、revision 与 release-manifest.json 不一致。" );
    }
    const productPaths = Object.fromEntries(manifest.products.map((product) => [
        product.platform,
        resolve(directory, basename(new URL(product.url).pathname)),
    ])) as Record<ProductPlatform, string>;
    await verifyReleaseChecksums(directory, [
        "inkwell-source.zip",
        "inkwell-product-windows-x64.zip",
        "inkwell-product-linux-x64-glibc.tar.gz",
        "inkwell-product-linux-aarch64-glibc.tar.gz",
        "inkwell-product-darwin-x64.tar.gz",
        "inkwell-product-darwin-aarch64.tar.gz",
        "inkwell-windows-x64.zip",
        "release-manifest.json",
        "install.ps1",
        "install.cmd",
        "install.sh",
    ]);
    const archiveBuilds = await assertArchiveBuildSet(
        resolve(directory, "inkwell-source.zip"),
        productPaths,
        manifest.version,
        revision,
    );
    if (manifest.buildId !== archiveBuilds.source.buildId) {
        throw new Error("Release Manifest buildId 与 Source/Product archive 代次不一致。");
    }
    const expectedAssets = [manifest.source, ...manifest.products, manifest.windowsPortable];
    for (const expected of expectedAssets) {
        const path = resolve(directory, basename(new URL(expected.url).pathname));
        const info = await stat(path);
        const checksum = await sha256File(path);
        if (checksum !== expected.sha256 || info.size !== expected.bytes) throw new Error(`Release 资产 checksum/bytes 不匹配：${basename(path)}`);
    }
    const sourceEntries = Object.keys(unzipSync(await readFile(resolve(directory, "inkwell-source.zip"))));
    if (sourceEntries.some((entry) => entry.startsWith(".git/") || entry.startsWith("node_modules/") || entry.startsWith(".output/"))) {
        throw new Error("Source archive 包含禁止目录。" );
    }
    assertEntries(sourceEntries, [SOURCE_BUILD_FILE], "Source archive");
    const windowsEntries = Object.keys(unzipSync(await readFile(resolve(directory, "inkwell-product-windows-x64.zip"))));
    assertEntries(windowsEntries, [
        PRODUCT_BUILD_FILE,
        ".output/server/index.mjs",
        ".output/server/node_modules/@libsql/win32-x64-msvc/",
        ".output/server/node_modules/sqlite-vec-windows-x64/",
    ], "Windows Product");
    assertNoRuntimeTestEntries(windowsEntries, "Windows Product");
    const linuxEntries = (await runCapture("tar", ["-tzf", resolve(directory, "inkwell-product-linux-x64-glibc.tar.gz")], {cwd: directory})).split(/\r?\n/u);
    assertEntries(linuxEntries, [
        PRODUCT_BUILD_FILE,
        ".output/server/index.mjs",
        ".output/server/node_modules/@libsql/linux-x64-gnu/",
        ".output/server/node_modules/sqlite-vec-linux-x64/",
    ], "Linux Product");
    assertNoRuntimeTestEntries(linuxEntries, "Linux Product");
    const linuxAarch64Entries = (await runCapture("tar", ["-tzf", resolve(directory, "inkwell-product-linux-aarch64-glibc.tar.gz")], {cwd: directory})).split(/\r?\n/u);
    assertEntries(linuxAarch64Entries, [
        PRODUCT_BUILD_FILE,
        ".output/server/index.mjs",
        ".output/server/node_modules/@libsql/linux-arm64-gnu/",
        ".output/server/node_modules/sqlite-vec-linux-arm64/",
    ], "Linux ARM64 Product");
    assertNoRuntimeTestEntries(linuxAarch64Entries, "Linux ARM64 Product");
    const darwinEntries = (await runCapture("tar", ["-tzf", resolve(directory, "inkwell-product-darwin-x64.tar.gz")], {cwd: directory})).split(/\r?\n/u);
    assertEntries(darwinEntries, [
        PRODUCT_BUILD_FILE,
        ".output/server/index.mjs",
        ".output/server/node_modules/@libsql/darwin-x64/",
        ".output/server/node_modules/sqlite-vec-darwin-x64/",
    ], "macOS x64 Product");
    assertNoRuntimeTestEntries(darwinEntries, "macOS x64 Product");
    const darwinAarch64Entries = (await runCapture("tar", ["-tzf", resolve(directory, "inkwell-product-darwin-aarch64.tar.gz")], {cwd: directory})).split(/\r?\n/u);
    assertEntries(darwinAarch64Entries, [
        PRODUCT_BUILD_FILE,
        ".output/server/index.mjs",
        ".output/server/node_modules/@libsql/darwin-arm64/",
        ".output/server/node_modules/sqlite-vec-darwin-arm64/",
    ], "macOS ARM64 Product");
    assertNoRuntimeTestEntries(darwinAarch64Entries, "macOS ARM64 Product");
    const portableEntries = Object.keys(unzipSync(await readFile(resolve(directory, "inkwell-windows-x64.zip"))));
    assertEntries(portableEntries, [
        ".deploy/installation.json",
        ".runtime/bin/neuro-book.cmd",
        "data/config.yaml",
        "data/logs/",
        "Start Neuro Book.cmd",
        "Create Admin.cmd",
    ], "Windows Portable");
}

/** 禁止Product overlay中的NeuroBook runtime源码重新携带测试。 */
function assertNoRuntimeTestEntries(entries: string[], label: string): void {
    const runtimePrefixes = [
        ".output/server/server/",
        ".output/server/shared/",
        ".output/server/scripts/",
        ".output/server/node_modules/nbook/",
    ];
    const offender = entries
        .map((entry) => entry.replace(/^\.\//u, ""))
        .find((entry) => runtimePrefixes.some((prefix) => entry.startsWith(prefix)
            && isRuntimeTestSourcePath(entry.slice(prefix.length))));
    if (offender) {
        throw new Error(`${label} 包含测试源码：${offender}`);
    }
}

function assertEntries(entries: string[], required: string[], label: string): void {
    const normalized = entries.map((entry) => entry.replace(/^\.\//u, ""));
    for (const prefix of required) {
        if (!normalized.some((entry) => entry === prefix || entry.startsWith(prefix))) throw new Error(`${label} 缺少：${prefix}`);
    }
}

async function asset(path: string, baseUrl: string): Promise<{url: string; sha256: string; bytes: number}> {
    const info = await stat(path);
    return {
        url: `${baseUrl}/${encodeURIComponent(basename(path))}`,
        sha256: await sha256File(path),
        bytes: info.size,
    };
}

/** 从当前干净 checkout 生成 Source 归档身份；任何未提交内容都拒绝正式发行。 */
async function releaseSourceBuild(projectRoot: string): Promise<ReleaseSourceBuild> {
    const identity = await readReleaseGeneration(projectRoot);
    return {
        schema: RELEASE_BUILD_SCHEMA,
        kind: "source",
        ...identity,
    };
}

/** 把 Runtime Image manifest 投影成归档内 Product 身份。 */
function releaseProductBuild(manifest: ProductRuntimeImageManifest): ReleaseProductBuild {
    if (!(PRODUCT_PLATFORMS as readonly string[]).includes(manifest.platform)) {
        throw new Error(`Product Runtime Image 平台不属于 Release 合同：${manifest.platform}`);
    }
    if (manifest.dirty) {
        throw new Error("正式 Release Product 不接受 dirty Product Runtime Image。");
    }
    return {
        schema: RELEASE_BUILD_SCHEMA,
        kind: "product",
        buildId: releaseBuildId(manifest),
        version: manifest.version,
        revision: manifest.revision,
        dirty: false,
        lockfileSha256: manifest.lockfileSha256,
        platform: manifest.platform as ProductPlatform,
        imageId: manifest.imageId,
        sourceDigest: manifest.sourceDigest,
        treeDigest: manifest.treeDigest,
        builderContractVersion: manifest.builderContractVersion,
    };
}

/** Product 归档完成后按完整 image identity 再验一次，防止切换期间读取混合代次。 */
function expectedProductIdentity(manifest: ProductRuntimeImageManifest): ProductRuntimeExpectedIdentity {
    return {
        version: manifest.version,
        revision: manifest.revision,
        dirty: manifest.dirty,
        platform: manifest.platform,
        imageId: manifest.imageId,
        lockfileSha256: manifest.lockfileSha256,
        sourceDigest: manifest.sourceDigest,
        builderContractVersion: manifest.builderContractVersion,
    };
}

/** 严格解析归档外部 JSON；unknown 是刻意的，因为文件在校验前不可信。 */
export function parseReleaseBuild(text: string): ReleaseBuild {
    let value: unknown;
    try {
        value = JSON.parse(text) as unknown;
    } catch (error) {
        throw new Error("Release build metadata 不是有效 JSON：" + String(error));
    }
    const record = plainObject(value, "Release build metadata");
    const baseKeys = ["schema", "kind", "buildId", "version", "revision", "dirty", "lockfileSha256"];
    if (record.kind !== "source" && record.kind !== "product") {
        throw new Error("Release build metadata kind 无效。");
    }
    const expectedKeys = record.kind === "source"
        ? baseKeys
        : [...baseKeys, "platform", "imageId", "sourceDigest", "treeDigest", "builderContractVersion"];
    assertExactKeys(record, expectedKeys, "Release build metadata");
    if (record.schema !== RELEASE_BUILD_SCHEMA || record.dirty !== false
        || typeof record.version !== "string" || !record.version
        || typeof record.revision !== "string" || !/^[0-9a-f]{40,64}$/iu.test(record.revision)
        || !isSha256(record.lockfileSha256) || !isSha256(record.buildId)) {
        throw new Error("Release build metadata 基础身份无效。");
    }
    const common = {
        schema: RELEASE_BUILD_SCHEMA,
        buildId: record.buildId,
        version: record.version,
        revision: record.revision,
        dirty: false as const,
        lockfileSha256: record.lockfileSha256,
    } as const;
    if (common.buildId !== releaseBuildId(common)) {
        throw new Error("Release build metadata buildId 无法由 version/revision/lockfileSha256 重建。");
    }
    if (record.kind === "source") return {...common, kind: "source"};
    if (typeof record.platform !== "string" || !(PRODUCT_PLATFORMS as readonly string[]).includes(record.platform)
        || !isSha256(record.imageId) || !isSha256(record.sourceDigest) || !isSha256(record.treeDigest)
        || typeof record.builderContractVersion !== "string" || !record.builderContractVersion) {
        throw new Error("Release build metadata Product 身份无效。");
    }
    return {
        ...common,
        kind: "product",
        platform: record.platform as ProductPlatform,
        imageId: record.imageId,
        sourceDigest: record.sourceDigest,
        treeDigest: record.treeDigest,
        builderContractVersion: record.builderContractVersion,
    };
}

/** Release Manifest 创建与公开验收共用同一套 Source/Product 代次证明。 */
async function assertArchiveBuildSet(
    sourcePath: string,
    productPaths: Record<ProductPlatform, string>,
    expectedVersion: string,
    expectedRevision: string,
): Promise<{source: ReleaseSourceBuild; products: Record<ProductPlatform, ReleaseProductBuild>}> {
    const source = await readReleaseBuildArchive(sourcePath);
    if (source.kind !== "source") throw new Error(`${SOURCE_BUILD_FILE} kind 必须是 source。`);
    if (source.version !== expectedVersion || source.revision !== expectedRevision) {
        throw new Error("Source archive 身份与 Release version/revision 不一致。");
    }
    const products = {} as Record<ProductPlatform, ReleaseProductBuild>;
    await Promise.all(PRODUCT_PLATFORMS.map(async (platform) => {
        const product = await readReleaseBuildArchive(productPaths[platform]);
        if (product.kind !== "product" || product.platform !== platform) {
            throw new Error(`${platform} Product archive 的 ${PRODUCT_BUILD_FILE} 平台身份不一致。`);
        }
        assertSameReleaseBuild(source, product, `${platform} Product archive 与 Source archive 代次不一致`);
        products[platform] = product;
    }));
    return {source, products};
}

/** 从 zip/tar.gz 根读取唯一的 Source 或 Product build metadata。 */
export async function readReleaseBuildArchive(archivePath: string): Promise<ReleaseBuild> {
    if (archivePath.endsWith(".zip")) {
        const entries = unzipSync(await readFile(archivePath));
        const names = Object.keys(entries).filter((entry) => isReleaseBuildFile(entry.replace(/^\.\//u, "")));
        if (names.length !== 1) throw new Error(`${basename(archivePath)} 必须包含唯一根 ${SOURCE_BUILD_FILE} 或 ${PRODUCT_BUILD_FILE}。`);
        const bytes = entries[names[0]!]!;
        return parseReleaseBuild(new TextDecoder().decode(bytes));
    }
    const entries = String(await runCapture("tar", ["-tzf", archivePath], {cwd: dirname(archivePath)}))
        .split(/\r?\n/u)
        .filter((entry) => isReleaseBuildFile(entry.replace(/^\.\//u, "")));
    if (entries.length !== 1) throw new Error(`${basename(archivePath)} 必须包含唯一根 ${SOURCE_BUILD_FILE} 或 ${PRODUCT_BUILD_FILE}。`);
    const text = await runCapture("tar", ["-xOzf", archivePath, entries[0]!], {cwd: dirname(archivePath)});
    return parseReleaseBuild(text);
}

/** 只比较跨归档公共代次；source/product 的 kind 与平台字段有意不参与。 */
function assertSameReleaseBuild(left: ReleaseBuild, right: ReleaseBuild, message: string): void {
    if (left.buildId !== right.buildId || left.version !== right.version || left.revision !== right.revision
        || left.lockfileSha256 !== right.lockfileSha256 || left.dirty || right.dirty) {
        throw new Error(`${message}：expected=${left.buildId} actual=${right.buildId}`);
    }
}

/** JSON 使用固定缩进与尾换行，便于人工审计归档。 */
function releaseBuildText(build: ReleaseBuild): string {
    return `${JSON.stringify(build, null, 4)}\n`;
}

/** 为归档创建与最终文件同盘的临时目录，保证原子 hard-link 发布不跨卷。 */
async function releaseStagingRoot(output: string, label: string): Promise<string> {
    return await mkdtemp(join(dirname(output), `.release-${label}-${randomUUID()}-`));
}

/** 创建父目录并拒绝覆盖已有输出，包括 symlink 与损坏文件。 */
async function prepareVacantOutput(output: string, label: string): Promise<void> {
    await mkdir(dirname(output), {recursive: true});
    await assertVacant(output, label);
}

/** 用同盘 hard link 原子发布完整文件；link 自带 no-clobber 语义，消除 check/rename 覆盖竞态。 */
async function publishArchive(temporaryArchive: string, output: string, label: string): Promise<void> {
    const temporaryInfo = await lstat(temporaryArchive);
    if (!temporaryInfo.isFile() || temporaryInfo.isSymbolicLink()) {
        throw new Error(`${label} 临时产物不是普通文件。`);
    }
    try {
        await link(temporaryArchive, output);
    } catch (error) {
        if (isNodeError(error, "EEXIST")) {
            throw new Error(`${label} 输出目标已存在，拒绝覆盖：${output}`, {cause: error});
        }
        throw error;
    }
}

/** lstat 能同时拒绝已有普通文件、目录与 symlink。 */
async function assertVacant(path: string, label: string): Promise<void> {
    try {
        await lstat(path);
    } catch (error) {
        if (isNodeError(error, "ENOENT")) return;
        throw error;
    }
    throw new Error(`${label} 输出目标已存在，拒绝覆盖：${path}`);
}

/** 外部 JSON object 的集中收窄点。 */
function plainObject(value: unknown, label: string): {[key: string]: unknown} {
    if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error(`${label} 必须是 object。`);
    return value as {[key: string]: unknown};
}

/** v1 metadata 拒绝未知字段，schema 演进必须显式升级。 */
function assertExactKeys(record: {[key: string]: unknown}, expected: readonly string[], label: string): void {
    const actual = Object.keys(record).sort();
    const required = [...expected].sort();
    if (actual.length !== required.length || actual.some((key, index) => key !== required[index])) {
        throw new Error(`${label} 字段集合无效。`);
    }
}

/** 所有归档身份摘要显式携带算法名。 */
function isSha256(value: unknown): value is string {
    return typeof value === "string" && /^sha256:[0-9a-f]{64}$/u.test(value);
}

/** 归档根只允许这两个由 Release 生成的代次文件。 */
function isReleaseBuildFile(value: string): value is typeof SOURCE_BUILD_FILE | typeof PRODUCT_BUILD_FILE {
    return RELEASE_BUILD_FILES.includes(value as typeof SOURCE_BUILD_FILE | typeof PRODUCT_BUILD_FILE);
}

/** 大型发行归档必须流式摘要，避免五个平台资产同时进入内存。 */
async function sha256File(path: string): Promise<string> {
    const hash = createHash("sha256");
    for await (const chunk of createReadStream(path)) hash.update(chunk);
    return hash.digest("hex");
}

/** 只收窄预期的 Node 文件系统错误。 */
function isNodeError(error: unknown, code: string): error is NodeJS.ErrnoException {
    return error instanceof Error && "code" in error && error.code === code;
}

/** 返回 Git tracked 且当前磁盘仍存在的 Source 文件。 */
async function trackedFiles(projectRoot: string): Promise<string[]> {
    return String(await runCapture("git", ["ls-files", "-z"], {cwd: projectRoot}))
        .split("\0")
        .filter(Boolean)
        .filter((path) => existsSync(resolve(projectRoot, path)))
        .sort();
}

async function directoryFiles(root: string): Promise<string[]> {
    const result: string[] = [];
    const visit = async (directory: string): Promise<void> => {
        for (const entry of await readdir(directory, {withFileTypes: true})) {
            const absolute = resolve(directory, entry.name);
            if (entry.isDirectory()) {
                await visit(absolute);
            } else if (entry.isFile()) {
                result.push(relative(root, absolute).replaceAll("\\", "/"));
            } else {
                throw new Error(`Windows Product ZIP 不支持 symlink 或特殊文件：${relative(root, absolute)}`);
            }
        }
    };
    await visit(root);
    return result.sort();
}
