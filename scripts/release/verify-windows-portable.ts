#!/usr/bin/env bun
import {createHash} from "node:crypto";
import {createReadStream} from "node:fs";
import {lstat, readFile} from "node:fs/promises";
import {join, resolve} from "node:path";
import {parseArgs} from "node:util";

import {parseInstallationManifest, type InstallationManifest} from "@notnotype/neuro-book-contracts/installation";
import {parseReleaseManifest, type ReleaseManifest} from "@notnotype/neuro-book-contracts/release";
import {PRODUCT_ASSET_NAMES, type ProductPlatform} from "@notnotype/neuro-book-contracts/platform";
import {verifyInstalledProductRuntimeImage} from "@notnotype/neuro-book/product-verification";
import {parseReleaseBuild} from "#scripts/release/release-assets";

const WINDOWS_PRODUCT_PLATFORM: ProductPlatform = "windows-x64";

export type VerifiedWindowsPortable = Readonly<{
    buildId: string;
    imageId: string;
    revision: string;
    version: string;
}>;

/**
 * 在 Portable 执行任何 Manager、migration 或 Product 命令前重建完整发行证明链。
 *
 * 外部 Release Manifest 约束归档摘要；归档内 Installation Manifest 再约束
 * Source/Product build ID、平台和 Runtime Image identity。最后遍历 `.output`
 * 复核 ready marker 与完整 payload digest。
 */
export async function verifyWindowsPortable(input: {
    releaseManifestPath: string;
    portableArchivePath: string;
    portableRoot: string;
}): Promise<VerifiedWindowsPortable> {
    const release = parseReleaseManifest(JSON.parse(await readFile(resolve(input.releaseManifestPath), "utf8")));
    const portableArchive = resolve(input.portableArchivePath);
    const archiveInfo = await lstat(portableArchive);
    if (!archiveInfo.isFile() || archiveInfo.isSymbolicLink()) {
        throw new Error(`Windows Portable archive 必须是普通文件：${portableArchive}`);
    }
    const archiveSha256 = await sha256File(portableArchive);
    if (archiveInfo.size !== release.windowsPortable.bytes || archiveSha256 !== release.windowsPortable.sha256) {
        throw new Error("Windows Portable archive 与 Release Manifest 摘要或字节数不一致。");
    }

    const portableRoot = resolve(input.portableRoot);
    const manifest = parseInstallationManifest(JSON.parse(
        await readFile(join(portableRoot, ".deploy", "installation.json"), "utf8"),
    ));
    const sourceBuild = parseReleaseBuild(await readFile(join(portableRoot, "source-build.json"), "utf8"));
    assertPortableIdentity(release, manifest, sourceBuild);

    const product = manifest.components.product;
    if (!product || product.provider !== "release") {
        throw new Error("Windows Portable Installation Manifest 缺少 release Product。" );
    }
    const image = await verifyInstalledProductRuntimeImage(portableRoot, product);
    const releaseProduct = release.products.find((candidate) => candidate.platform === WINDOWS_PRODUCT_PLATFORM)!;
    for (const key of ["imageId", "sourceDigest", "lockfileSha256", "builderContractVersion"] as const) {
        if (image[key] !== releaseProduct[key]) {
            throw new Error(`Windows Portable Runtime Image ${key} 与 Release Manifest 不一致。`);
        }
    }

    return Object.freeze({
        buildId: release.buildId,
        imageId: image.imageId,
        revision: release.sourceRevision,
        version: release.version,
    });
}

/** 只比较已经通过严格 schema 的跨清单身份，不接受目录形状推断。 */
function assertPortableIdentity(
    release: ReleaseManifest,
    manifest: InstallationManifest,
    sourceBuild: ReturnType<typeof parseReleaseBuild>,
): void {
    if (manifest.profile !== "windows-portable" || manifest.containerEngine !== null) {
        throw new Error("Portable archive 不是 Windows Portable 原生安装。" );
    }
    if (sourceBuild.kind !== "source" || sourceBuild.dirty) {
        throw new Error("Windows Portable source-build.json 必须是 clean Source identity。" );
    }
    const source = manifest.components.source;
    const product = manifest.components.product;
    if (source.provider !== "release" || !product || product.provider !== "release") {
        throw new Error("Windows Portable 必须同时携带 release Source 与 release Product。" );
    }
    const releaseProduct = release.products.find((candidate) => candidate.platform === WINDOWS_PRODUCT_PLATFORM);
    if (!releaseProduct) throw new Error("Release Manifest 缺少 Windows x64 Product。" );

    const buildIds = [release.buildId, sourceBuild.buildId, source.buildId, product.buildId];
    if (new Set(buildIds).size !== 1) {
        throw new Error(`Windows Portable build ID 证明链不一致：${buildIds.join(" / ")}`);
    }
    if (
        manifest.appVersion !== release.version
        || manifest.sourceRevision !== release.sourceRevision
        || manifest.channel !== release.channel
        || sourceBuild.version !== release.version
        || sourceBuild.revision !== release.sourceRevision
        || source.version !== release.version
        || source.revision !== release.sourceRevision
        || product.version !== release.version
        || product.revision !== release.sourceRevision
    ) {
        throw new Error("Windows Portable version/revision/channel 与 Release identity 不一致。" );
    }
    if (
        product.platform !== WINDOWS_PRODUCT_PLATFORM
        || source.archiveSha256 !== release.source.sha256
        || source.sourceUrl !== release.source.url
        || product.archiveSha256 !== releaseProduct.sha256
        || product.sourceUrl !== releaseProduct.url
        || sourceBuild.lockfileSha256 !== product.lockfileSha256
    ) {
        throw new Error("Windows Portable Source/Product 资产身份与 Release Manifest 不一致。" );
    }
    for (const key of ["imageId", "sourceDigest", "lockfileSha256", "builderContractVersion"] as const) {
        if (product[key] !== releaseProduct[key]) {
            throw new Error(`Windows Portable Product ${key} 与 Release Manifest 不一致。`);
        }
    }
    const productFileName = new URL(product.sourceUrl).pathname.split("/").at(-1);
    if (productFileName !== PRODUCT_ASSET_NAMES[WINDOWS_PRODUCT_PLATFORM]) {
        throw new Error(`Windows Portable Product 资产名非法：${productFileName ?? "<missing>"}`);
    }
}

/** 流式计算大归档摘要，避免 verifier 再把 Portable ZIP 整体读入内存。 */
async function sha256File(path: string): Promise<string> {
    const hash = createHash("sha256");
    for await (const chunk of createReadStream(path)) hash.update(chunk);
    return hash.digest("hex");
}

if (import.meta.main) {
    const {values} = parseArgs({
        options: {
            "release-manifest": {type: "string"},
            "portable-archive": {type: "string"},
            "portable-root": {type: "string"},
        },
        strict: true,
    });
    if (!values["release-manifest"] || !values["portable-archive"] || !values["portable-root"]) {
        throw new Error("用法：bun scripts/release/verify-windows-portable.ts --release-manifest <path> --portable-archive <zip> --portable-root <extracted-root>");
    }
    const verified = await verifyWindowsPortable({
        releaseManifestPath: values["release-manifest"],
        portableArchivePath: values["portable-archive"],
        portableRoot: values["portable-root"],
    });
    console.log(JSON.stringify({ok: true, ...verified}, null, 4));
}
