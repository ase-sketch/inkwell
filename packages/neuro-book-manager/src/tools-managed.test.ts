import {mkdir, mkdtemp, readFile, rm, writeFile} from "node:fs/promises";
import { testHostPath } from "@notnotype/neuro-book-test-support/test-path"
import {basename, dirname, join} from "node:path";

import {afterEach, beforeEach, describe, expect, it, vi} from "vitest";

const mocks = vi.hoisted(() => ({
    downloadVerified: vi.fn(async (_url: string, target: string) => {
        await mkdir(dirname(target), {recursive: true});
        await writeFile(target, "archive", "utf8");
    }),
    githubReleaseAsset: vi.fn(async (repository: string) => repository === "BurntSushi/ripgrep"
        ? {tag: "14.1.1", asset: {name: "rg.zip", url: "https://example.com/rg.zip", sha256: "a".repeat(64), bytes: 1}}
        : {tag: "v2.49.0.windows.1", asset: {name: "PortableGit.7z.exe", url: "https://example.com/git.exe", sha256: "b".repeat(64), bytes: 1}}),
    extractArchive: vi.fn(async (_archive: string, targetRoot: string) => {
        const name = process.platform === "win32" ? "rg.exe" : "rg";
        await mkdir(join(targetRoot, "rg"), {recursive: true});
        await writeFile(join(targetRoot, "rg", name), "rg binary", "utf8");
    }),
    run: vi.fn(async (_command: string, args: string[]) => {
        const output = args.find((arg) => arg.startsWith("-o"))?.slice(2);
        if (!output) return;
        await mkdir(join(output, "bin"), {recursive: true});
        await writeFile(join(output, "bin", "git.exe"), "git binary", "utf8");
        await writeFile(join(output, "bin", "bash.exe"), "bash binary", "utf8");
    }),
    runCapture: vi.fn(async (command: string) => {
        const name = basename(command).toLocaleLowerCase("en-US");
        if (name.startsWith("rg")) return "ripgrep 14.1.1\n";
        if (name.startsWith("git")) return "git version 2.49.0.windows.1\n";
        if (name.startsWith("bash")) return "GNU bash, version 5.2.37(1)-release\n";
        throw new Error(`未知测试命令：${command}`);
    }),
}));

vi.mock("#manager/download", () => ({
    downloadVerified: mocks.downloadVerified,
    extractArchive: mocks.extractArchive,
    githubReleaseAsset: mocks.githubReleaseAsset,
}));

vi.mock("#manager/process", async () => {
    const actual = await vi.importActual<typeof import("#manager/process")>("#manager/process");
    return {...actual, run: mocks.run, runCapture: mocks.runCapture};
});

import {installManagedTool} from "#manager/tools";

const roots: string[] = [];

beforeEach(() => {
    mocks.downloadVerified.mockClear();
    mocks.githubReleaseAsset.mockClear();
    mocks.extractArchive.mockClear();
    mocks.run.mockClear();
    mocks.runCapture.mockClear();
});

afterEach(async () => {
    await Promise.all(roots.splice(0).map((root) => rm(root, {recursive: true, force: true})));
});

describe("managed Tool", () => {
    it("只有Manifest证明的ripgrep通过checksum和版本检查后才复用", async () => {
        const root = await mkdtemp(testHostPath("nbook-managed-rg-"));
        roots.push(root);
        const first = await installManagedTool(root, "rg");
        mocks.downloadVerified.mockClear();

        const reused = await installManagedTool(root, "rg", {trustedIdentity: first});
        expect(reused).toEqual(first);
        expect(mocks.downloadVerified).not.toHaveBeenCalled();

        await writeFile(join(root, first.path), "tampered", "utf8");
        const retiredPaths: string[] = [];
        const repaired = await installManagedTool(root, "rg", {trustedIdentity: first, retiredPaths});
        expect(repaired.path).not.toBe(first.path);
        expect(await readFile(join(root, first.path), "utf8")).toBe("tampered");
        expect(retiredPaths).toEqual([expect.stringMatching(/^\.runtime\/tools\/rg\/14\.1\.1$/u)]);
        expect(mocks.downloadVerified).toHaveBeenCalledOnce();
    });

    it.runIf(process.platform === "win32")("同时验证PortableGit的Git与Bash", async () => {
        const root = await mkdtemp(testHostPath("nbook-managed-git-"));
        roots.push(root);
        const installed = await installManagedTool(root, "git");

        expect(installed.distribution).toBe("PortableGit");
        expect(mocks.runCapture).toHaveBeenCalledWith(expect.stringMatching(/git\.exe$/iu), ["--version"]);
        expect(mocks.runCapture).toHaveBeenCalledWith(expect.stringMatching(/bash\.exe$/iu), ["--version"]);
        expect(installed.gitSha256).toMatch(/^[a-f0-9]{64}$/u);
        expect(installed.bashSha256).toMatch(/^[a-f0-9]{64}$/u);
    });
});
