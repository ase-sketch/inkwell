import {chmod, mkdir, mkdtemp, readFile, rm, stat, writeFile} from "node:fs/promises";
import { testHostPath } from "@notnotype/neuro-book-test-support/test-path"
import {basename, dirname, join} from "node:path";

import {zipSync} from "fflate";
import {afterEach, beforeEach, describe, expect, it, vi} from "vitest";

const downloadMocks = vi.hoisted(() => ({
    archive: new Uint8Array(),
    downloadVerified: vi.fn(async (_url: string, target: string) => {
        await mkdir(dirname(target), {recursive: true});
        await writeFile(target, downloadMocks.archive);
    }),
    githubReleaseAsset: vi.fn(),
}));

vi.mock("#manager/download", async () => {
    const actual = await vi.importActual<typeof import("#manager/download")>("#manager/download");
    return {
        ...actual,
        downloadVerified: downloadMocks.downloadVerified,
        githubReleaseAsset: downloadMocks.githubReleaseAsset,
    };
});

import {currentProductPlatform} from "#manager/platform";
import {BUN_ASSET_NAMES, installManagedBun} from "#manager/runtime";

const roots: string[] = [];
const describePosix = process.platform === "win32" ? describe.skip : describe;

beforeEach(() => {
    downloadMocks.downloadVerified.mockClear();
    downloadMocks.githubReleaseAsset.mockReset();
});

afterEach(async () => {
    await Promise.all(roots.splice(0).map((root) => rm(root, {recursive: true, force: true})));
});

describePosix("POSIX Managed Bun", () => {
    it("恢复执行位、验证版本并重建损坏缓存", async () => {
        const root = await mkdtemp(testHostPath("nbook-managed-bun-"));
        roots.push(root);
        const archiveName = BUN_ASSET_NAMES[currentProductPlatform()];
        const archiveRoot = basename(archiveName, ".zip");
        downloadMocks.archive = zipSync({[`${archiveRoot}/bun`]: new TextEncoder().encode("#!/bin/sh\nprintf '1.2.3\\n'\n")});
        downloadMocks.githubReleaseAsset.mockResolvedValue({
            tag: "bun-v1.2.3",
            asset: {name: archiveName, url: "https://example.com/bun.zip", sha256: "a".repeat(64), bytes: downloadMocks.archive.byteLength},
        });

        const first = await installManagedBun(root, {requestedVersion: "1.2.3"});
        const executable = join(root, first.path);
        expect((await stat(executable)).mode & 0o111).not.toBe(0);

        await writeFile(executable, "#!/bin/sh\nprintf '9.9.9\\n'\n", "utf8");
        await chmod(executable, 0o644);
        downloadMocks.downloadVerified.mockClear();
        const retiredPaths: string[] = [];
        const repaired = await installManagedBun(root, {requestedVersion: "1.2.3", trustedIdentity: first, retiredPaths});

        expect(repaired.path).not.toBe(first.path);
        expect(await readFile(join(root, repaired.path), "utf8")).toContain("1.2.3");
        expect((await stat(join(root, repaired.path))).mode & 0o111).not.toBe(0);
        expect(await readFile(executable, "utf8")).toContain("9.9.9");
        expect(retiredPaths).toEqual([".runtime/bun/1.2.3"]);
        expect(downloadMocks.downloadVerified).toHaveBeenCalledOnce();
    });

    it("拒绝版本错误的下载且不提交Runtime目录", async () => {
        const root = await mkdtemp(testHostPath("nbook-managed-bun-invalid-"));
        roots.push(root);
        const archiveName = BUN_ASSET_NAMES[currentProductPlatform()];
        const archiveRoot = basename(archiveName, ".zip");
        downloadMocks.archive = zipSync({[`${archiveRoot}/bun`]: new TextEncoder().encode("#!/bin/sh\nprintf '9.9.9\\n'\n")});
        downloadMocks.githubReleaseAsset.mockResolvedValue({
            tag: "bun-v1.2.3",
            asset: {name: archiveName, url: "https://example.com/bun.zip", sha256: "a".repeat(64), bytes: downloadMocks.archive.byteLength},
        });

        await expect(installManagedBun(root, {requestedVersion: "1.2.3"})).rejects.toThrow("Managed Bun版本不匹配");
        await expect(stat(join(root, ".runtime", "bun", "1.2.3"))).rejects.toMatchObject({code: "ENOENT"});
    });
});
