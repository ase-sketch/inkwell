import {mkdir, mkdtemp, readFile, readdir, rm, writeFile} from "node:fs/promises";
import { testHostPath } from "@notnotype/neuro-book-test-support/test-path"
import {dirname, join} from "node:path";

import {afterEach, describe, expect, it, vi} from "vitest";

import {materializeManagedAsset, type TrustedManagedAssetIdentity} from "#manager/managed-asset-repository";

const roots: string[] = [];

afterEach(async () => {
    await Promise.all(roots.splice(0).map((root) => rm(root, {recursive: true, force: true})));
});

describe("Managed Asset Repository", () => {
    it("只复用Manifest证明且文件身份完整的版本目录", async () => {
        const root = await mkdtemp(testHostPath("nbook-managed-asset-"));
        roots.push(root);
        const targetRoot = join(root, ".runtime", "tools", "demo", "1.0.0");
        const fetch = vi.fn(async (target: string) => {
            await mkdir(dirname(target), {recursive: true});
            await writeFile(target, "archive", "utf8");
        });
        const options = {
            installationRoot: root,
            targetRoot,
            release: {name: "demo.zip", url: "https://example.com/demo.zip", sha256: "a".repeat(64)},
            executables: [{
                key: "demo" as const,
                locate: async (assetRoot: string) => join(assetRoot, "bin", "demo"),
                verify: async (executable: string) => {
                    if (await readFile(executable, "utf8") !== "version 1.0.0") throw new Error("版本错误");
                },
            }],
            fetch,
            extract: async (_archive: string, extractedRoot: string) => {
                await mkdir(join(extractedRoot, "bin"), {recursive: true});
                await writeFile(join(extractedRoot, "bin", "demo"), "version 1.0.0", "utf8");
            },
        };

        const first = await materializeManagedAsset(options);
        const trusted: TrustedManagedAssetIdentity<"demo"> = {
            assetRoot: ".runtime/tools/demo/1.0.0",
            archiveSha256: first.archiveSha256,
            sourceUrl: first.sourceUrl,
            executables: first.executables,
        };
        const reused = await materializeManagedAsset({...options, trustedIdentity: trusted});
        expect(reused.reused).toBe(true);
        expect(fetch).toHaveBeenCalledOnce();

        await writeFile(join(root, first.executables.demo.path), "tampered", "utf8");
        const repaired = await materializeManagedAsset({...options, trustedIdentity: trusted});
        expect(repaired.reused).toBe(false);
        expect(fetch).toHaveBeenCalledTimes(2);
        expect(await readFile(join(root, repaired.executables.demo.path), "utf8")).toBe("version 1.0.0");
        expect(repaired.createdPath).not.toBe(".runtime/tools/demo/1.0.0");
        expect(repaired.retiredPaths).toEqual([".runtime/tools/demo/1.0.0"]);
        expect(await readFile(join(targetRoot, "bin", "demo"), "utf8")).toBe("tampered");
    });

    it("没有Manifest身份时重建既有同版本目录", async () => {
        const root = await mkdtemp(testHostPath("nbook-managed-untrusted-"));
        roots.push(root);
        const targetRoot = join(root, ".runtime", "demo", "1.0.0");
        await mkdir(targetRoot, {recursive: true});
        await writeFile(join(targetRoot, "demo"), "untrusted", "utf8");
        let downloads = 0;

        const result = await materializeManagedAsset({
            installationRoot: root,
            targetRoot,
            release: {name: "demo.zip", url: "https://example.com/demo.zip", sha256: "b".repeat(64)},
            executables: [{key: "demo" as const, locate: async (assetRoot) => join(assetRoot, "demo"), verify: async () => undefined}],
            fetch: async (target) => {
                downloads += 1;
                await mkdir(dirname(target), {recursive: true});
                await writeFile(target, "archive", "utf8");
            },
            extract: async (_archive, extractedRoot) => {
                await mkdir(extractedRoot, {recursive: true});
                await writeFile(join(extractedRoot, "demo"), "trusted release", "utf8");
            },
        });

        expect(downloads).toBe(1);
        expect(await readFile(join(root, result.executables.demo.path), "utf8")).toBe("trusted release");
    });

    it("验证失败不提交版本目录并清理staging", async () => {
        const root = await mkdtemp(testHostPath("nbook-managed-failure-"));
        roots.push(root);
        const targetRoot = join(root, ".runtime", "demo", "broken");

        await expect(materializeManagedAsset({
            installationRoot: root,
            targetRoot,
            release: {name: "demo.zip", url: "https://example.com/demo.zip", sha256: "c".repeat(64)},
            executables: [{key: "demo" as const, locate: async (assetRoot) => join(assetRoot, "demo"), verify: async () => { throw new Error("版本错误"); }}],
            fetch: async (target) => {
                await mkdir(dirname(target), {recursive: true});
                await writeFile(target, "archive", "utf8");
            },
            extract: async (_archive, extractedRoot) => {
                await mkdir(extractedRoot, {recursive: true});
                await writeFile(join(extractedRoot, "demo"), "broken", "utf8");
            },
        })).rejects.toThrow("版本错误");

        await expect(readFile(join(targetRoot, "demo"), "utf8")).rejects.toMatchObject({code: "ENOENT"});
        expect(await readdir(join(root, ".deploy", "staging"))).toEqual([]);
    });

    it("可信旧代次损坏且新下载失败时完整保留旧目录", async () => {
        const root = await mkdtemp(testHostPath("nbook-managed-preserve-"));
        roots.push(root);
        const targetRoot = join(root, ".runtime", "demo", "1.0.0");
        await mkdir(targetRoot, {recursive: true});
        await writeFile(join(targetRoot, "demo"), "tampered", "utf8");
        const retiredPaths: string[] = [];

        await expect(materializeManagedAsset({
            installationRoot: root,
            targetRoot,
            release: {name: "demo.zip", url: "https://example.com/demo.zip", sha256: "d".repeat(64)},
            trustedIdentity: {
                assetRoot: ".runtime/demo/1.0.0",
                archiveSha256: "d".repeat(64),
                sourceUrl: "https://example.com/demo.zip",
                executables: {demo: {path: ".runtime/demo/1.0.0/demo", sha256: "e".repeat(64)}},
            },
            executables: [{key: "demo" as const, locate: async (assetRoot) => join(assetRoot, "demo"), verify: async () => undefined}],
            fetch: async () => { throw new Error("network unavailable"); },
            extract: async () => undefined,
            retiredPaths,
        })).rejects.toThrow("network unavailable");

        expect(await readFile(join(targetRoot, "demo"), "utf8")).toBe("tampered");
        expect(retiredPaths).toEqual([]);
    });

    it("新代次提交后Journal记账失败时删除未提交代次并保留旧目录", async () => {
        const root = await mkdtemp(testHostPath("nbook-managed-journal-failure-"));
        roots.push(root);
        const targetRoot = join(root, ".runtime", "demo", "1.0.0");
        await mkdir(targetRoot, {recursive: true});
        await writeFile(join(targetRoot, "demo"), "old", "utf8");

        await expect(materializeManagedAsset({
            installationRoot: root,
            targetRoot,
            release: {name: "demo.zip", url: "https://example.com/demo.zip", sha256: "f".repeat(64)},
            executables: [{key: "demo" as const, locate: async (assetRoot) => join(assetRoot, "demo"), verify: async () => undefined}],
            fetch: async (target) => {
                await mkdir(dirname(target), {recursive: true});
                await writeFile(target, "archive", "utf8");
            },
            extract: async (_archive, extractedRoot) => {
                await mkdir(extractedRoot, {recursive: true});
                await writeFile(join(extractedRoot, "demo"), "new", "utf8");
            },
            recordCreated: async (path) => {
                if (!path.includes("staging")) throw new Error("journal unavailable");
            },
        })).rejects.toThrow("journal unavailable");

        expect(await readFile(join(targetRoot, "demo"), "utf8")).toBe("old");
        expect((await readdir(join(root, ".runtime", "demo"))).sort()).toEqual(["1.0.0"]);
    });
});
