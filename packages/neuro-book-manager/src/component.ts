import {constants} from "node:fs";
import {cp, mkdir, readdir, rename, rm} from "node:fs/promises";
import {dirname, join, relative} from "node:path";

import {downloadVerified, extractArchive} from "#manager/download";
import {ensureDirectory, pathExists, removePath, safeTarget} from "#manager/files";
import {verifyProductRuntimeImage} from "#manager/product";
import type {ProductComponent, SourceComponent} from "@notnotype/neuro-book-contracts/installation";
import type {ProductReleaseAsset, ReleaseAsset} from "@notnotype/neuro-book-contracts/release";

export type StagedReleaseSource = {
    component: Extract<SourceComponent, {provider: "release"}>;
    sourceRoot: string;
};

export type StagedProduct = {
    component: ProductComponent;
    outputRoot: string;
};

const FORBIDDEN_SOURCE_ROOTS = new Set([
    ".deploy",
    ".runtime",
    ".output",
    ".git",
    "workspace",
    "data",
    "node_modules",
    "product",
]);
const FORBIDDEN_SOURCE_FILES = new Set([".env", "config.yaml"]);

/** 下载并验证 Release Source，但不修改 Installation Root。 */
export async function stageReleaseSource(input: {
    root: string;
    staging: string;
    asset: ReleaseAsset;
    buildId: string;
    version: string;
    revision: string;
    previous?: Extract<SourceComponent, {provider: "release"}>;
}): Promise<StagedReleaseSource> {
    const archivePath = join(input.staging, "source.zip");
    const extractedRoot = join(input.staging, "source");
    await downloadVerified(input.asset.url, archivePath, input.asset.sha256);
    await extractArchive(archivePath, extractedRoot);
    const files = await listFiles(extractedRoot);
    assertSourceFiles(files);
    const previousFiles = input.previous?.files ?? [];
    for (const file of files.filter((item) => !previousFiles.includes(item))) {
        if (await pathExists(safeTarget(input.root, file))) {
            throw new Error(`Release Source 新文件与未受管路径冲突：${file}`);
        }
    }
    return {
        sourceRoot: extractedRoot,
        component: {
            provider: "release",
            buildId: input.buildId,
            version: input.version,
            revision: input.revision,
            path: ".",
            archiveSha256: input.asset.sha256,
            files,
            sourceUrl: input.asset.url,
            license: "AGPL-3.0-only",
            redistribution: "NeuroBook Source archive，按项目 AGPL-3.0-only 许可证发布。",
        },
    };
}

/** 备份旧 Source owned files 后应用已验证的完整 staging tree。 */
export async function switchReleaseSource(input: {
    root: string;
    staged: StagedReleaseSource;
    backup: string;
    previousFiles: string[];
    /** 非破坏性backup完成后、首次删除或覆盖前持久化switch intent。 */
    onSwitchIntent?: () => Promise<void>;
}): Promise<void> {
    const nextFiles = input.staged.component.files;
    await backupPaths(input.root, input.backup, input.previousFiles);
    await input.onSwitchIntent?.();
    try {
        for (const oldFile of input.previousFiles.filter((file) => !nextFiles.includes(file))) {
            await rm(safeTarget(input.root, oldFile), {force: true});
        }
        for (const file of nextFiles) {
            const target = safeTarget(input.root, file);
            await ensureDirectory(dirname(target));
            await cp(safeTarget(input.staged.sourceRoot, file), target, {force: true});
        }
    } catch (error) {
        await rollbackReleaseSource(input.root, input.backup, input.previousFiles, nextFiles);
        throw error;
    }
}

/** 下载并验证 Product overlay，但不切换根 `.output`。 */
export async function stageReleaseProduct(input: {
    staging: string;
    asset: ProductReleaseAsset;
    buildId: string;
    version: string;
    revision: string;
}): Promise<StagedProduct> {
    const archiveName = input.asset.url.endsWith(".tar.gz") ? "product.tar.gz" : "product.zip";
    const archivePath = join(input.staging, archiveName);
    const extractedRoot = join(input.staging, "product");
    await downloadVerified(input.asset.url, archivePath, input.asset.sha256);
    await extractArchive(archivePath, extractedRoot);
    const stagedOutput = await locateOutput(extractedRoot);
    const verified = await verifyProductRuntimeImage(stagedOutput, {
        version: input.version,
        revision: input.revision,
        dirty: false,
        platform: input.asset.platform,
        imageId: input.asset.imageId,
        sourceDigest: input.asset.sourceDigest,
        lockfileSha256: input.asset.lockfileSha256,
        builderContractVersion: input.asset.builderContractVersion,
    });
    return {
        outputRoot: stagedOutput,
        component: {
            provider: "release",
            buildId: input.buildId,
            version: input.version,
            revision: input.revision,
            path: ".output",
            archiveSha256: input.asset.sha256,
            platform: input.asset.platform,
            imageId: verified.imageId,
            sourceDigest: verified.sourceDigest,
            lockfileSha256: verified.lockfileSha256,
            builderContractVersion: verified.builderContractVersion,
            sourceUrl: input.asset.url,
            license: "AGPL-3.0-only",
            redistribution: "NeuroBook Product overlay，按项目 AGPL-3.0-only 许可证发布。",
        },
    };
}

/** 原子切换已经通过校验的 staging Product。 */
export async function switchProduct(
    root: string,
    stagedOutput: string,
    backup: string,
    onSwitchIntent?: () => Promise<void>,
): Promise<void> {
    const targetOutput = join(root, ".output");
    const backupOutput = join(backup, ".output");
    const activationOutput = `${stagedOutput}.activation`;
    await ensureDirectory(backup);
    await removePath(activationOutput);
    await cp(stagedOutput, activationOutput, {recursive: true, force: true, mode: constants.COPYFILE_FICLONE});
    await onSwitchIntent?.();
    if (await pathExists(targetOutput)) {
        await removePath(backupOutput);
        await rename(targetOutput, backupOutput);
    }
    try {
        await rename(activationOutput, targetOutput);
    } catch (error) {
        if (await pathExists(backupOutput)) {
            await rename(backupOutput, targetOutput);
        }
        await removePath(activationOutput);
        throw error;
    }
}

async function listFiles(root: string): Promise<string[]> {
    const result: string[] = [];
    const visit = async (directory: string): Promise<void> => {
        for (const entry of await readdir(directory, {withFileTypes: true})) {
            const path = join(directory, entry.name);
            if (entry.isDirectory()) {
                await visit(path);
            } else if (entry.isFile()) {
                result.push(relative(root, path).replaceAll("\\", "/"));
            }
        }
    };
    await visit(root);
    return result.sort();
}

function assertSourceFiles(files: string[]): void {
    for (const file of files) {
        const first = file.split("/")[0]!;
        if (FORBIDDEN_SOURCE_ROOTS.has(first) || FORBIDDEN_SOURCE_FILES.has(file)) {
            throw new Error(`Source archive 包含禁止路径：${file}`);
        }
    }
}

async function backupPaths(root: string, backup: string, files: string[]): Promise<void> {
    await removePath(backup);
    for (const file of files) {
        const source = safeTarget(root, file);
        if (!await pathExists(source)) {
            continue;
        }
        const target = safeTarget(backup, file);
        await mkdir(dirname(target), {recursive: true});
        await cp(source, target, {force: true});
    }
}

async function restorePaths(root: string, backup: string, files: string[]): Promise<void> {
    for (const file of files) {
        const source = safeTarget(backup, file);
        if (!await pathExists(source)) {
            continue;
        }
        const target = safeTarget(root, file);
        await ensureDirectory(dirname(target));
        await cp(source, target, {force: true});
    }
}

/** 回滚已应用的 Source snapshot。 */
export async function rollbackReleaseSource(root: string, backup: string, previousFiles: string[], appliedFiles: string[]): Promise<void> {
    for (const file of appliedFiles.filter((item) => !previousFiles.includes(item))) {
        await rm(safeTarget(root, file), {force: true});
    }
    await restorePaths(root, backup, previousFiles);
}

/** 回滚已切换的 Product。 */
export async function rollbackProduct(root: string, backup: string, hadPrevious: boolean): Promise<void> {
    const targetOutput = join(root, ".output");
    const backupOutput = join(backup, ".output");
    if (!hadPrevious && !await pathExists(backupOutput)) {
        await removePath(targetOutput);
        return;
    }
    if (hadPrevious && !await pathExists(backupOutput)) {
        return;
    }
    await removePath(targetOutput);
    if (await pathExists(backupOutput)) {
        await rename(backupOutput, targetOutput);
    }
}

async function locateOutput(root: string): Promise<string> {
    const direct = join(root, ".output");
    if (await pathExists(direct)) {
        return direct;
    }
    const entries = await readdir(root, {withFileTypes: true});
    for (const entry of entries) {
        if (entry.isDirectory() && await pathExists(join(root, entry.name, ".output"))) {
            return join(root, entry.name, ".output");
        }
    }
    throw new Error("Product archive 缺少 .output。");
}
