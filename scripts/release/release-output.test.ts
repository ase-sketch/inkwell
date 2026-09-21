import {mkdir, mkdtemp, readFile, readdir, rm, writeFile} from "node:fs/promises";
import { testHostPath } from "@notnotype/neuro-book-test-support/test-path"
import {join, relative, resolve} from "node:path";

import {afterEach, describe, expect, it} from "vitest";
import {parse} from "yaml";

import {
    cleanupReleaseOutput,
    openReleaseOutput,
    prepareReleaseOutput,
    readReleaseGeneration,
    releaseBuildId,
} from "#scripts/release/release-output";
import {runCapture} from "#scripts/utils/process.mjs";

const ROOT = resolve(import.meta.dirname, "..", "..");
const roots: string[] = [];

afterEach(async () => {
    await Promise.all(roots.splice(0).map((root) => rm(root, {recursive: true, force: true})));
});

describe("Release output generation", () => {
    it("把当前干净 Source 映射到唯一 Windows-safe 目录，并在 manifest 后封存", async () => {
        const repository = await releaseOutputFixture();
        const output = await prepareReleaseOutput(repository);
        const digest = output.buildId.slice("sha256:".length);

        expect(output.buildId).toBe(releaseBuildId(output));
        expect(relative(repository, output.directory)).toBe(join("dist", "1.2.3", digest));
        expect(digest).toMatch(/^[0-9a-f]{64}$/u);
        expect(await readdir(output.directory)).toEqual([]);
        expect(output.assetPath("inkwell-source.zip")).toBe(join(output.directory, "inkwell-source.zip"));

        await writeFile(output.assetPath("inkwell-source.zip"), "source\n", "utf8");
        await expect(prepareReleaseOutput(repository)).rejects.toThrow("目标目录必须为空");
        await expect(openReleaseOutput(repository)).resolves.toMatchObject({buildId: output.buildId});

        await writeFile(output.assetPath("release-manifest.json"), "{}\n", "utf8");
        await expect(openReleaseOutput(repository)).rejects.toThrow("已由 release-manifest.json 封存");
    });

    it("拒绝未知文件，并且只通过精确 cleanup 删除一个代次", async () => {
        const repository = await releaseOutputFixture();
        const output = await prepareReleaseOutput(repository);
        await writeFile(join(output.directory, "old-release.zip"), "old\n", "utf8");

        await expect(openReleaseOutput(repository)).rejects.toThrow("包含未知文件");
        await expect(cleanupReleaseOutput(repository, "../1.2.3", output.buildId)).rejects.toThrow("安全目录名");
        await expect(cleanupReleaseOutput(repository, output.version, "sha256:bad")).rejects.toThrow("buildId 无效");
        await expect(cleanupReleaseOutput(repository, output.version, "0".repeat(64))).rejects.toThrow("不存在");

        await expect(cleanupReleaseOutput(repository, output.version, output.buildId)).resolves.toBe(output.directory);
        await expect(openReleaseOutput(repository)).rejects.toThrow();
        await expect(prepareReleaseOutput(repository)).resolves.toMatchObject({directory: output.directory});
    });

    it("Source、lockfile 或 Git 状态变化时 identity 变化或 fail closed", async () => {
        const repository = await releaseOutputFixture();
        const before = await readReleaseGeneration(repository);

        await writeFile(join(repository, "bun.lock"), "fixture-lock-next\n", "utf8");
        await git(repository, ["add", "bun.lock"]);
        await git(repository, ["-c", "user.name=NeuroBook Test", "-c", "user.email=test@nbook.local", "commit", "--quiet", "-m", "next-lock"]);
        const after = await readReleaseGeneration(repository);
        expect(after.buildId).not.toBe(before.buildId);
        expect(after.lockfileSha256).not.toBe(before.lockfileSha256);

        await writeFile(join(repository, "package.json"), `${JSON.stringify({name: "fixture", version: "1.2.4"})}\n`, "utf8");
        await expect(readReleaseGeneration(repository)).rejects.toThrow("dirty=true");
    });

    it("package scripts 不再接受或生成 dist 根目录资产", async () => {
        const packageJson = JSON.parse(await readFile(resolve(ROOT, "package.json"), "utf8")) as {
            scripts: {[key: string]: string};
        };
        const releaseScripts = Object.entries(packageJson.scripts)
            .filter(([name]) => name === "package:windows-portable" || name.startsWith("release:"));

        expect(packageJson.scripts["release:prepare"]).toBe("bun scripts/release/release-output.ts prepare");
        expect(packageJson.scripts["release:cleanup"]).toBe("bun scripts/release/release-output.ts cleanup");
        expect(packageJson.scripts["package:windows-portable"]).toBe("bun scripts/release/package-windows-portable.ts");
        for (const [, command] of releaseScripts) {
            expect(command).not.toContain("dist/neuro-book");
            expect(command).not.toContain("dist/inkwell");
            expect(command).not.toContain("--output");
        }
    });

    it("Release 与平台 workflow 只消费统一代次目录", async () => {
        const [releaseWorkflow, platformWorkflow] = await Promise.all([
            readFile(resolve(ROOT, ".github", "workflows", "release-container.yml"), "utf8"),
            readFile(resolve(ROOT, ".github", "workflows", "product-platforms.yml"), "utf8"),
        ]);
        expect(() => parse(releaseWorkflow)).not.toThrow();
        expect(() => parse(platformWorkflow)).not.toThrow();
        for (const workflow of [releaseWorkflow, platformWorkflow]) {
            expect(workflow).toContain("release-output.ts prepare --github-env");
            expect(workflow).toContain("NEURO_BOOK_RELEASE_DIR");
            for (const oldRootAsset of [
                "dist/inkwell-source.zip",
                "dist/inkwell-product-windows-x64.zip",
                "dist/inkwell-product-linux-x64-glibc.tar.gz",
                "dist/inkwell-product-linux-aarch64-glibc.tar.gz",
                "dist/inkwell-product-darwin-x64.tar.gz",
                "dist/inkwell-product-darwin-aarch64.tar.gz",
                "dist/inkwell-windows-x64.zip",
            ]) {
                expect(workflow).not.toContain(oldRootAsset);
            }
        }
        const manifestCommand = releaseWorkflow.slice(
            releaseWorkflow.indexOf("bun scripts/release/release-assets.ts manifest"),
            releaseWorkflow.indexOf("bun -e", releaseWorkflow.indexOf("bun scripts/release/release-assets.ts manifest")),
        );
        expect(manifestCommand).not.toContain("--source");
        expect(manifestCommand).not.toContain("--product");
        expect(manifestCommand).not.toContain("--output");
    });
});

/** 创建最小干净 Git Source，dist 保持 ignored，模拟正式 Release checkout。 */
async function releaseOutputFixture(): Promise<string> {
    const root = await mkdtemp(testHostPath("nbook-release-output-"));
    roots.push(root);
    await mkdir(join(root, "scripts"), {recursive: true});
    await Promise.all([
        writeFile(join(root, ".gitignore"), "dist/\n", "utf8"),
        writeFile(join(root, "package.json"), `${JSON.stringify({name: "fixture", version: "1.2.3"})}\n`, "utf8"),
        writeFile(join(root, "bun.lock"), "fixture-lock\n", "utf8"),
    ]);
    await git(root, ["init", "--quiet"]);
    await git(root, ["add", "."]);
    await git(root, ["-c", "user.name=NeuroBook Test", "-c", "user.email=test@nbook.local", "commit", "--quiet", "-m", "fixture"]);
    return root;
}

/** 在测试仓内运行 Git，不依赖全局用户配置。 */
async function git(cwd: string, args: string[]): Promise<void> {
    await runCapture("git", args, {cwd});
}
