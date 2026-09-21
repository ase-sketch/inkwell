import {createHash} from "node:crypto";
import {mkdir, mkdtemp, readFile, readdir, stat, writeFile} from "node:fs/promises";
import { testHostPath } from "@notnotype/neuro-book-test-support/test-path"
import {join, relative} from "node:path";
import {zipSync, strToU8} from "fflate";
import {afterEach, describe, expect, it} from "vitest";

import {rollbackProduct, rollbackReleaseSource, stageReleaseProduct, stageReleaseSource, switchProduct, switchReleaseSource} from "#manager/component";
import {buildTestRuntimeImage, TEST_RUNTIME_IMAGE_PLATFORM} from "#manager/fixtures/runtime-image";
import {removePath} from "#manager/files";
import type {VerifiedProductRuntimeImage} from "@notnotype/neuro-book-contracts/product-runtime";

const roots: string[] = [];

afterEach(async () => {
    await Promise.all(roots.splice(0).map((root) => removePath(root)));
});

describe("Release Source component", () => {
    it("只替换 Source 拥有的文件并可回滚", async () => {
        const root = await mkdtemp(testHostPath("nbook-manager-source-"));
        roots.push(root);
        await writeFile(join(root, "old.txt"), "old", "utf8");
        await writeFile(join(root, "config.yaml"), "user", "utf8");
        const bytes = zipSync({"new.txt": strToU8("new")});
        const staged = await stageReleaseSource({
            root,
            staging: join(root, ".deploy", "staging", "op"),
            asset: dataAsset(bytes),
            buildId: `sha256:${"9".repeat(64)}`,
            version: "1.0.0",
            revision: "b".repeat(40),
            previous: {
                provider: "release", buildId: `sha256:${"9".repeat(64)}`,
                version: "0.9.0",
                revision: "a".repeat(40),
                path: ".",
                files: ["old.txt"],
                archiveSha256: "a".repeat(64),
                sourceUrl: "https://example.com/old.zip",
                license: "AGPL-3.0-only",
                redistribution: "test",
            },
        });
        await switchReleaseSource({
            root,
            staged,
            backup: join(root, ".deploy", "backups", "op", "source"),
            previousFiles: ["old.txt"],
        });
        expect(await readFile(join(root, "new.txt"), "utf8")).toBe("new");
        expect(await readFile(join(root, "config.yaml"), "utf8")).toBe("user");

        await rollbackReleaseSource(
            root,
            join(root, ".deploy", "backups", "op", "source"),
            ["old.txt"],
            staged.component.files,
        );
        expect(await readFile(join(root, "old.txt"), "utf8")).toBe("old");
    });

    it("拒绝归档覆盖用户状态", async () => {
        const root = await mkdtemp(testHostPath("nbook-manager-source-forbidden-"));
        roots.push(root);
        const bytes = zipSync({"workspace/project.txt": strToU8("bad")});
        await expect(stageReleaseSource({
            root,
            staging: join(root, ".deploy", "staging", "op"),
            asset: dataAsset(bytes),
            buildId: `sha256:${"9".repeat(64)}`,
            version: "1.0.0",
            revision: "b".repeat(40),
        })).rejects.toThrow("禁止路径");
    });
});

describe("Product component rollback", () => {
    it("下载后验证 Runtime Image identity 与 ready marker", async () => {
        const root = await mkdtemp(testHostPath("manager-product-archive-"));
        roots.push(root);
        const revision = "b".repeat(40);
        const platform = TEST_RUNTIME_IMAGE_PLATFORM;
        const archive = await productArchive(join(root, "fixture-source"), revision, platform);
        const identity = {
            imageId: archive.image.manifest.imageId,
            sourceDigest: archive.image.manifest.sourceDigest,
            lockfileSha256: archive.image.manifest.lockfileSha256,
            builderContractVersion: archive.image.manifest.builderContractVersion,
        };
        const staged = await stageReleaseProduct({
            staging: join(root, "staging"),
            buildId: `sha256:${"9".repeat(64)}`,
            asset: {
                ...dataAsset(archive.bytes),
                ...identity,
                platform,
                sourceRevision: revision,
            },
            version: "1.0.0",
            revision,
        });

        expect(staged.component).toMatchObject(identity);
        expect(await readFile(join(staged.outputRoot, "runtime-image.ready"), "utf8")).toContain(identity.imageId);
    });

    it("首次安装没有旧 Product 时删除已切换的新 Product", async () => {
        const root = await mkdtemp(testHostPath("manager-product-root-"));
        const backup = await mkdtemp(testHostPath("manager-product-backup-"));
        roots.push(root, backup);
        await mkdir(join(root, ".output"), {recursive: true});
        await writeFile(join(root, ".output", "new.txt"), "new", "utf8");

        await rollbackProduct(root, backup, false);

        await expect(stat(join(root, ".output"))).rejects.toMatchObject({code: "ENOENT"});
    });

    it("激活副本完成两次 rename 后仍保留 Operation-owned migration runner", async () => {
        const root = await mkdtemp(testHostPath("manager-product-activation-"));
        roots.push(root);
        const stagedOutput = join(root, ".deploy", "staging", "operation", "migration-runner", ".output");
        const backup = join(root, ".deploy", "backups", "operation", "product");
        await mkdir(stagedOutput, {recursive: true});
        await mkdir(join(root, ".output"), {recursive: true});
        await writeFile(join(stagedOutput, "candidate.txt"), "candidate", "utf8");
        await writeFile(join(root, ".output", "old.txt"), "old", "utf8");

        await switchProduct(root, stagedOutput, backup, async () => {
            expect(await readFile(join(stagedOutput, "candidate.txt"), "utf8")).toBe("candidate");
            expect(await readFile(`${stagedOutput}.activation/candidate.txt`, "utf8")).toBe("candidate");
        });

        expect(await readFile(join(root, ".output", "candidate.txt"), "utf8")).toBe("candidate");
        expect(await readFile(join(stagedOutput, "candidate.txt"), "utf8")).toBe("candidate");
        expect(await readFile(join(backup, ".output", "old.txt"), "utf8")).toBe("old");
    });

    it("更新失败时恢复旧 Product", async () => {
        const root = await mkdtemp(testHostPath("manager-product-root-"));
        const backup = await mkdtemp(testHostPath("manager-product-backup-"));
        roots.push(root, backup);
        await mkdir(join(root, ".output"), {recursive: true});
        await mkdir(join(backup, ".output"), {recursive: true});
        await writeFile(join(root, ".output", "new.txt"), "new", "utf8");
        await writeFile(join(backup, ".output", "old.txt"), "old", "utf8");

        await rollbackProduct(root, backup, true);

        expect(await readFile(join(root, ".output", "old.txt"), "utf8")).toBe("old");
        await expect(stat(join(root, ".output", "new.txt"))).rejects.toMatchObject({code: "ENOENT"});
    });
});

function dataAsset(bytes: Uint8Array): {url: string; sha256: string; bytes: number} {
    return {
        url: `data:application/zip;base64,${Buffer.from(bytes).toString("base64")}`,
        sha256: createHash("sha256").update(bytes).digest("hex"),
        bytes: bytes.byteLength,
    };
}

/** 把 Builder 生成的完整 Runtime Image 原样打包成 Product archive。 */
async function productArchive(
    sourceRoot: string,
    revision: string,
    platform: typeof TEST_RUNTIME_IMAGE_PLATFORM,
): Promise<{bytes: Uint8Array; image: VerifiedProductRuntimeImage}> {
    const image = await buildTestRuntimeImage({sourceRoot, version: "1.0.0", revision, platform});
    const files: Record<string, Uint8Array> = {};
    const visit = async (directory: string): Promise<void> => {
        for (const entry of await readdir(directory, {withFileTypes: true})) {
            const path = join(directory, entry.name);
            if (entry.isDirectory()) {
                await visit(path);
                continue;
            }
            if (!entry.isFile()) throw new Error(`测试 Runtime Image 包含不受支持的文件：${path}`);
            const archivePath = `.output/${relative(image.path, path).replaceAll("\\", "/")}`;
            files[archivePath] = await readFile(path);
        }
    };
    await visit(image.path);
    return {bytes: zipSync(files), image};
}
