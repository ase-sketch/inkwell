#!/usr/bin/env bun
import {randomUUID} from "node:crypto";
import {link, lstat, mkdtemp, rm} from "node:fs/promises";
import {basename, dirname, relative, resolve} from "node:path";

import {PRODUCT_ASSET_NAMES} from "@notnotype/neuro-book-contracts/platform";
import {packagePortable} from "#scripts/deploy/windows-portable-manager";
import {openReleaseOutput} from "#scripts/release/release-output";

const ROOT = resolve(import.meta.dirname, "..", "..");

/** 从当前代次的 Source/Product archives 组装 Portable，并原子发布到同一发行目录。 */
export async function packageWindowsPortableRelease(projectRoot = ROOT): Promise<string> {
    const release = await openReleaseOutput(projectRoot);
    const output = release.assetPath("inkwell-windows-x64.zip");
    const stagingRoot = await mkdtemp(joinStagingPrefix(release.directory));
    const staged = resolve(stagingRoot, basename(output));
    try {
        await packagePortable(
            staged,
            release.assetPath("inkwell-source.zip"),
            release.assetPath(PRODUCT_ASSET_NAMES["windows-x64"]),
        );
        const info = await lstat(staged);
        if (!info.isFile() || info.isSymbolicLink()) throw new Error("Windows Portable staging 产物不是普通文件。");
        const current = await openReleaseOutput(projectRoot);
        if (current.buildId !== release.buildId || current.directory !== release.directory) {
            throw new Error("Windows Portable 组装期间 Release generation identity 发生变化。");
        }
        try {
            await link(staged, output);
        } catch (error) {
            if (isNodeError(error, "EEXIST")) {
                throw new Error(`Windows Portable 输出目标已存在，拒绝覆盖：${output}`, {cause: error});
            }
            throw error;
        }
    } finally {
        await rm(stagingRoot, {recursive: true, force: true});
    }
    console.log(`Release Windows Portable: ${relative(projectRoot, output)}`);
    return output;
}

/** staging 放在 build 目录旁边，保证 hard link 不跨卷且最终目录不出现临时文件。 */
function joinStagingPrefix(releaseDirectory: string): string {
    return resolve(dirname(releaseDirectory), `.release-portable-${randomUUID()}-`);
}

/** 只收窄预期的 Node 文件系统错误。 */
function isNodeError(error: unknown, code: string): error is NodeJS.ErrnoException {
    return error instanceof Error && "code" in error && error.code === code;
}

if (import.meta.main) await packageWindowsPortableRelease();
