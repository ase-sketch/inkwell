import {dirname, join, resolve} from "node:path";
import {chmod as chmodFile} from "node:fs/promises";

import {extractArchive, githubReleaseAsset} from "#manager/download";
import {ensureDirectory, writeTextAtomic} from "#manager/files";
import {run, runCapture} from "#manager/process";
import {managedAssetRoot, materializeManagedAsset, type TrustedManagedAssetIdentity} from "#manager/managed-asset-repository";
import {currentProductPlatform} from "#manager/platform";
import {findNamedFile, prependExecutablePath} from "#manager/runtime";
import type {ManagedGitToolComponent, ManagedToolComponent, ToolComponents} from "@notnotype/neuro-book-contracts/installation";
import type {ProductPlatform} from "@notnotype/neuro-book-contracts/platform";

export type ManagedToolName = "rg" | "git";

export type ManagedToolInstallOptions = {
    createdPaths?: string[];
    recordCreated?: (path: string) => Promise<void>;
    recordCreatedApplied?: (path: string) => Promise<void>;
    retiredPaths?: string[];
    recordRetired?: (path: string) => Promise<void>;
    /** 仅允许传入当前有效Installation Manifest中的managed Tool。 */
    trustedIdentity?: ManagedToolComponent | ManagedGitToolComponent;
};

/** 当前Manager支持的平台到ripgrep官方Release资产后缀。 */
export const RIPGREP_ASSET_SUFFIXES = {
    "windows-x64": "x86_64-pc-windows-msvc.zip",
    "linux-x64-glibc": "x86_64-unknown-linux-gnu.tar.gz",
    "linux-aarch64-glibc": "aarch64-unknown-linux-gnu.tar.gz",
    "darwin-x64": "x86_64-apple-darwin.tar.gz",
    "darwin-aarch64": "aarch64-apple-darwin.tar.gz",
} as const satisfies Record<ProductPlatform, string>;

/** 安装 Manager 支持的托管工具。 */
export async function installManagedTool(root: string, tool: "rg", options?: ManagedToolInstallOptions): Promise<ManagedToolComponent>;
export async function installManagedTool(root: string, tool: "git", options?: ManagedToolInstallOptions): Promise<ManagedGitToolComponent>;
export async function installManagedTool(root: string, tool: ManagedToolName, options: ManagedToolInstallOptions = {}): Promise<ManagedToolComponent | ManagedGitToolComponent> {
    currentProductPlatform();
    return tool === "git" ? installPortableGit(root, options) : installRipgrep(root, options);
}

/** 安装最新 ripgrep；无Manifest身份证明时整版本重建。 */
async function installRipgrep(root: string, options: ManagedToolInstallOptions): Promise<ManagedToolComponent> {
    const suffix = RIPGREP_ASSET_SUFFIXES[currentProductPlatform()];
    const release = await githubReleaseAsset("BurntSushi/ripgrep", undefined, (name) => name.endsWith(suffix));
    const version = release.tag.replace(/^v/u, "");
    const targetRoot = join(root, ".runtime", "tools", "rg", version);
    const trusted = trustedRipgrepIdentity(options.trustedIdentity);
    const materialized = await materializeManagedAsset({
        installationRoot: root,
        targetRoot,
        release: release.asset,
        ...(trusted ? {trustedIdentity: trusted} : {}),
        executables: [{
            key: "rg" as const,
            locate: (assetRoot) => findNamedFile(assetRoot, process.platform === "win32" ? "rg.exe" : "rg"),
            verify: (executable) => verifyRipgrep(executable, version),
        }],
        extract: extractArchive,
        createdPaths: options.createdPaths,
        recordCreated: options.recordCreated,
        recordCreatedApplied: options.recordCreatedApplied,
        retiredPaths: options.retiredPaths,
        recordRetired: options.recordRetired,
    });
    const executable = materialized.executables.rg;
    return {
        provider: "managed",
        version,
        path: executable.path,
        archiveSha256: materialized.archiveSha256,
        executableSha256: executable.sha256,
        sourceUrl: materialized.sourceUrl,
        license: "MIT OR Unlicense",
        redistribution: "按 ripgrep 官方 Release 原样再分发，并保留上游许可证文件。",
    };
}

/** Windows 安装 PortableGit，确保 Git 与真正 bash 同属一个受审计发行包。 */
async function installPortableGit(root: string, options: ManagedToolInstallOptions): Promise<ManagedGitToolComponent> {
    if (process.platform !== "win32") throw new Error("PortableGit managed provider 只支持 Windows x64。" );
    const release = await githubReleaseAsset(
        "git-for-windows/git",
        undefined,
        (name) => /^PortableGit-.*-64-bit\.7z\.exe$/u.test(name),
    );
    const version = release.tag.replace(/^v/u, "");
    const targetRoot = join(root, ".runtime", "tools", "git", version);
    const trusted = trustedPortableGitIdentity(options.trustedIdentity);
    const materialized = await materializeManagedAsset({
        installationRoot: root,
        targetRoot,
        release: release.asset,
        ...(trusted ? {trustedIdentity: trusted} : {}),
        executables: [
            {key: "git" as const, locate: (assetRoot) => findNamedFile(assetRoot, "git.exe"), verify: (executable) => verifyGit(executable, version)},
            {key: "bash" as const, locate: (assetRoot) => findNamedFile(assetRoot, "bash.exe"), verify: verifyBash},
        ],
        extract: async (archivePath, extractedRoot) => {
            await ensureDirectory(extractedRoot);
            await run(archivePath, ["-y", `-o${extractedRoot}`]);
        },
        createdPaths: options.createdPaths,
        recordCreated: options.recordCreated,
        recordCreatedApplied: options.recordCreatedApplied,
        retiredPaths: options.retiredPaths,
        recordRetired: options.recordRetired,
    });
    const git = materialized.executables.git;
    const bash = materialized.executables.bash;
    return {
        provider: "managed",
        distribution: "PortableGit",
        version,
        path: git.path,
        bashPath: bash.path,
        archiveSha256: materialized.archiveSha256,
        gitSha256: git.sha256,
        bashSha256: bash.sha256,
        sourceUrl: materialized.sourceUrl,
        license: "GPL-2.0-only",
        redistribution: "按 Git for Windows PortableGit 官方 Release 原样再分发；第三方组件许可证以包内文件为准。",
    };
}

/** 校验ripgrep执行位与精确版本。 */
async function verifyRipgrep(executable: string, expectedVersion: string): Promise<void> {
    if (process.platform !== "win32") await chmodFile(executable, 0o755);
    const output = (await runCapture(executable, ["--version"])).trim();
    if (!output.split(/\s+/u).includes(expectedVersion)) throw new Error(`ripgrep版本不匹配：期望${expectedVersion}，实际${output || "<missing>"}。`);
}

/** 校验PortableGit中的Git版本与执行位。 */
async function verifyGit(executable: string, expectedVersion: string): Promise<void> {
    const output = (await runCapture(executable, ["--version"])).trim();
    if (!output.includes(expectedVersion)) throw new Error(`PortableGit版本不匹配：期望${expectedVersion}，实际${output || "<missing>"}。`);
}

/** 校验PortableGit中的Bash可执行。 */
async function verifyBash(executable: string): Promise<void> {
    const output = (await runCapture(executable, ["--version"])).trim();
    if (!/^GNU bash(?:,| )/u.test(output)) throw new Error(`PortableGit Bash版本无法验证：${output || "<missing>"}。`);
}

/** 将Manifest中的ripgrep身份转换为Managed Asset Repository身份。 */
function trustedRipgrepIdentity(tool: ManagedToolComponent | ManagedGitToolComponent | undefined): TrustedManagedAssetIdentity<"rg"> | undefined {
    if (!tool || "distribution" in tool) return undefined;
    return {
        assetRoot: managedAssetRoot(tool.path, ".runtime/tools/rg"),
        archiveSha256: tool.archiveSha256,
        sourceUrl: tool.sourceUrl,
        executables: {rg: {path: tool.path, sha256: tool.executableSha256}},
    };
}

/** 将Manifest中的PortableGit身份转换为Managed Asset Repository身份。 */
function trustedPortableGitIdentity(tool: ManagedToolComponent | ManagedGitToolComponent | undefined): TrustedManagedAssetIdentity<"git" | "bash"> | undefined {
    if (!tool || !("distribution" in tool)) return undefined;
    return {
        assetRoot: managedAssetRoot(tool.path, ".runtime/tools/git"),
        archiveSha256: tool.archiveSha256,
        sourceUrl: tool.sourceUrl,
        executables: {
            git: {path: tool.path, sha256: tool.gitSha256},
            bash: {path: tool.bashPath, sha256: tool.bashSha256},
        },
    };
}

/** 激活 installation manifest 中的 managed executable。 */
export function activateManagedTools(root: string, tools: ToolComponents): void {
    if (tools.rg?.provider === "managed") prependExecutablePath(resolve(root, tools.rg.path));
    if (tools.git?.provider === "managed") activatePortableGit(resolve(root, tools.git.path), resolve(root, tools.git.bashPath));
}

/** 在所有 managed Tool 校验完成后一次性刷新稳定 wrapper。 */
export async function writeManagedToolWrappers(root: string, tools: ToolComponents): Promise<void> {
    if (tools.rg?.provider === "managed") {
        await writeToolWrapper(root, "rg", tools.rg.path);
    }
    if (tools.git?.provider === "managed") {
        await writeToolWrapper(root, "git", tools.git.path);
        await writeToolWrapper(root, "bash", tools.git.bashPath);
    }
}

async function writeToolWrapper(root: string, tool: "rg" | "git" | "bash", executablePath: string): Promise<void> {
    const binRoot = join(root, ".runtime", "bin");
    await ensureDirectory(binRoot);
    if (process.platform === "win32") {
        await writeTextAtomic(join(binRoot, `${tool}.cmd`), renderToolWrapper(executablePath));
        return;
    }
    const wrapper = join(binRoot, tool);
    await writeTextAtomic(wrapper, renderToolWrapper(executablePath));
    await chmodFile(wrapper, 0o755);
}

/** 生成稳定managed Tool wrapper；安装与doctor必须消费同一模板。 */
export function renderToolWrapper(executablePath: string, platform: NodeJS.Platform = process.platform): string {
    if (platform === "win32") {
        return `@echo off\r\nset "ROOT=%~dp0..\\.."\r\n"%ROOT%\\${executablePath.replaceAll("/", "\\")}" %*\r\n`;
    }
    return `#!/bin/sh\nROOT="$(CDPATH= cd -- "$(dirname "$0")/../.." && pwd)"\nexec "$ROOT/${executablePath}" "$@"\n`;
}

function activatePortableGit(git: string, bash: string): void {
    prependExecutablePath(git);
    prependExecutablePath(bash);
    process.env.NEURO_BOOK_BASH = bash;
    process.env.GIT_BASH = bash;
}
