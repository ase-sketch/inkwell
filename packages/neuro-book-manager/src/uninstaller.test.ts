import {testHostPath} from "@notnotype/neuro-book-test-support/test-path";
import {mkdir, readFile, rm, stat, writeFile} from "node:fs/promises";
import {dirname, join} from "node:path";
import {afterEach, beforeEach, describe, expect, it, vi} from "vitest";

import {TEST_RUNTIME_IMAGE_IDENTITY} from "#manager/fixtures/runtime-image";
import {installationLeasePath} from "#manager/installation-mutation";
import {writeInstallationManifest} from "#manager/manifest-store";
import {INSTALLED_WINDOWS_ROOT_LOCATORS, PORTABLE_ROOT_LOCATORS} from "@notnotype/neuro-book-contracts/installation";
import type {InstallationManifest} from "@notnotype/neuro-book-contracts/installation";
import {resetDesktopLocalState, uninstallInstallation} from "#manager/uninstaller";

const execution = vi.hoisted(() => ({verify: vi.fn()}));
const health = vi.hoisted(() => ({assertStopped: vi.fn()}));
const docker = vi.hoisted(() => ({stop: vi.fn(), remove: vi.fn()}));
const windowsHost = vi.hoisted(() => ({
    pending: vi.fn(),
    required: vi.fn(),
    schedule: vi.fn(),
}));

vi.mock("#manager/application-execution", () => ({verifyApplicationExecution: execution.verify}));
vi.mock("#manager/health", () => ({assertNativeProductStopped: health.assertStopped}));
vi.mock("#manager/docker", () => ({stopDocker: docker.stop, removeDockerDeployment: docker.remove}));
vi.mock("#manager/windows-uninstall-host", () => ({
    pendingWindowsUninstall: windowsHost.pending,
    requiresWindowsUninstallHost: windowsHost.required,
    scheduleWindowsUninstall: windowsHost.schedule,
}));

const cleanupRoots: string[] = [];

beforeEach(() => {
    vi.clearAllMocks();
    execution.verify.mockResolvedValue({kind: "native-product"});
    health.assertStopped.mockResolvedValue(undefined);
    windowsHost.pending.mockResolvedValue(null);
    windowsHost.required.mockReturnValue(false);
    windowsHost.schedule.mockResolvedValue({intent: {}, resultPath: "C:\\uninstall-result.json"});
});

afterEach(async () => {
    vi.unstubAllEnvs();
    await Promise.all(cleanupRoots.splice(0).map((root) => rm(root, {recursive: true, force: true})));
});

describe("Manager uninstall lifecycle", () => {
    it("portable 默认删除程序、cache、desktop 和 logs，但保留 State Root 用户数据", async () => {
        const sandbox = testSandbox("uninstall-portable");
        const root = join(sandbox, "installation");
        await prepareInstallation(root, manifest("windows-portable"));
        await Promise.all([
            write(root, ".output/server/index.mjs", "product"),
            write(root, ".cache/bun/install/pkg", "cache"),
            write(root, "data/.desktop/webview/profile", "webview"),
            write(root, "data/logs/server-current.jsonl", "log"),
            write(root, "data/workspace/novel/book.md", "truth"),
            write(root, "data/config.yaml", "server: {}"),
        ]);
        const lease = await installationLeasePath(root);
        health.assertStopped.mockImplementation(async () => {
            await expect(stat(`${lease}.lock`)).resolves.toBeDefined();
        });

        const result = await uninstallInstallation({installationRoot: root});

        expect(result.statePreserved).toBe(true);
        expect(result.status).toBe("completed");
        await expect(readFile(join(root, "data", "workspace", "novel", "book.md"), "utf8")).resolves.toBe("truth");
        await expect(readFile(join(root, "data", "config.yaml"), "utf8")).resolves.toBe("server: {}");
        await expect(stat(join(root, ".output"))).rejects.toMatchObject({code: "ENOENT"});
        await expect(stat(join(root, ".cache"))).rejects.toMatchObject({code: "ENOENT"});
        await expect(stat(join(root, "data", ".desktop"))).rejects.toMatchObject({code: "ENOENT"});
        await expect(stat(join(root, "data", "logs"))).rejects.toMatchObject({code: "ENOENT"});
        await expect(stat(`${lease}.lock`)).rejects.toMatchObject({code: "ENOENT"});
    });

    it("portable 同时删除数据时删除整个 Installation Root", async () => {
        const sandbox = testSandbox("uninstall-portable-all");
        const root = join(sandbox, "installation");
        await prepareInstallation(root, manifest("windows-portable"));
        await write(root, "data/workspace/novel/book.md", "truth");

        const result = await uninstallInstallation({installationRoot: root, deleteData: true});

        expect(result.statePreserved).toBe(false);
        expect(result.status).toBe("completed");
        await expect(stat(root)).rejects.toMatchObject({code: "ENOENT"});
    });

    it.runIf(process.platform === "win32")("installed Windows 只接受固定程序根，并保留外置 State Root", async () => {
        const sandbox = testSandbox("uninstall-installed");
        const localDataRoot = join(sandbox, "Local");
        vi.stubEnv("LOCALAPPDATA", localDataRoot);
        const installationRoot = join(localDataRoot, "Programs", "NeuroBook");
        await prepareInstallation(installationRoot, manifest("product-bun"));
        await Promise.all([
            write(installationRoot, ".output/server/index.mjs", "product"),
            write(localDataRoot, "Inkwell/data/workspace/novel/book.md", "truth"),
            write(localDataRoot, "Inkwell/data/logs/server-current.jsonl", "log"),
            write(localDataRoot, "Inkwell/cache/bun/install/pkg", "cache"),
            write(localDataRoot, "Inkwell/desktop/webview/profile", "webview"),
        ]);

        await uninstallInstallation({installationRoot});

        await expect(stat(installationRoot)).rejects.toMatchObject({code: "ENOENT"});
        await expect(readFile(join(localDataRoot, "Inkwell/data/workspace/novel/book.md"), "utf8")).resolves.toBe("truth");
        await expect(stat(join(localDataRoot, "Inkwell/data/logs"))).rejects.toMatchObject({code: "ENOENT"});
        await expect(stat(join(localDataRoot, "Inkwell/cache"))).rejects.toMatchObject({code: "ENOENT"});
        await expect(stat(join(localDataRoot, "Inkwell/desktop"))).rejects.toMatchObject({code: "ENOENT"});
    });

    it("desktop reset 只删除 Desktop Local/WebView Root", async () => {
        const sandbox = testSandbox("desktop-reset");
        const root = join(sandbox, "installation");
        await prepareInstallation(root, manifest("windows-portable"));
        await Promise.all([
            write(root, "data/.desktop/webview/profile", "webview"),
            write(root, "data/workspace/novel/book.md", "truth"),
        ]);

        await resetDesktopLocalState({installationRoot: root});

        await expect(stat(join(root, "data", ".desktop"))).rejects.toMatchObject({code: "ENOENT"});
        await expect(readFile(join(root, "data", "workspace", "novel", "book.md"), "utf8")).resolves.toBe("truth");
    });

    it("停止门禁失败时不删除任何 owner", async () => {
        const sandbox = testSandbox("uninstall-running");
        const root = join(sandbox, "installation");
        await prepareInstallation(root, manifest("windows-portable"));
        await Promise.all([
            write(root, ".output/server/index.mjs", "product"),
            write(root, "data/workspace/novel/book.md", "truth"),
        ]);
        health.assertStopped.mockRejectedValueOnce(new Error("Product 仍在运行"));

        await expect(uninstallInstallation({installationRoot: root})).rejects.toThrow("Product 仍在运行");

        await expect(readFile(join(root, ".output", "server", "index.mjs"), "utf8")).resolves.toBe("product");
        await expect(readFile(join(root, "data", "workspace", "novel", "book.md"), "utf8")).resolves.toBe("truth");
    });

    it("原生 Product 文件损坏时仍可在停止门禁后卸载", async () => {
        const sandbox = testSandbox("uninstall-damaged-product");
        const root = join(sandbox, "installation");
        await prepareInstallation(root, manifest("windows-portable"));
        await write(root, ".output/server/index.mjs", "damaged-product");
        execution.verify.mockRejectedValueOnce(new Error("Product Runtime Image payload digest 不一致"));

        await expect(uninstallInstallation({installationRoot: root, deleteData: true})).resolves.toMatchObject({
            status: "completed",
            statePreserved: false,
        });

        expect(execution.verify).not.toHaveBeenCalled();
        expect(health.assertStopped).toHaveBeenCalledOnce();
        await expect(stat(root)).rejects.toMatchObject({code: "ENOENT"});
    });

    it.runIf(process.platform === "win32")("受管 Bun 位于 Installation Root 时只安排外置删除", async () => {
        const sandbox = testSandbox("uninstall-scheduled");
        const root = join(sandbox, "installation");
        await prepareInstallation(root, manifest("windows-portable"));
        await write(root, ".runtime/bun/bun.exe", "locked-runtime");
        windowsHost.required.mockReturnValueOnce(true);
        windowsHost.schedule.mockResolvedValueOnce({intent: {}, resultPath: join(sandbox, "result.json")});

        const result = await uninstallInstallation({installationRoot: root});

        expect(result).toMatchObject({status: "scheduled", statePreserved: true, resultPath: join(sandbox, "result.json")});
        expect(windowsHost.schedule).toHaveBeenCalledWith(expect.objectContaining({
            root,
            layout: "installation-scoped",
            deleteData: false,
        }));
        await expect(readFile(join(root, ".runtime", "bun", "bun.exe"), "utf8")).resolves.toBe("locked-runtime");
    });

    it("Operation 恢复失败时零删除且不会尝试停止", async () => {
        const sandbox = testSandbox("uninstall-recovery-failure");
        const root = join(sandbox, "installation");
        await prepareInstallation(root, manifest("windows-portable"));
        await write(root, ".output/server/index.mjs", "product");
        await write(root, ".deploy/operations/damaged.json", "{}\n");

        await expect(uninstallInstallation({installationRoot: root})).rejects.toThrow("Operation journal 不符合 schema");

        expect(execution.verify).not.toHaveBeenCalled();
        expect(health.assertStopped).not.toHaveBeenCalled();
        await expect(readFile(join(root, ".output", "server", "index.mjs"), "utf8")).resolves.toBe("product");
    });
});

function testSandbox(name: string): string {
    const sandbox = testHostPath(`${name}-${crypto.randomUUID()}`);
    cleanupRoots.push(sandbox);
    vi.stubEnv("NEURO_BOOK_MANAGER_CONFIG", join(sandbox, "manager-user", "config.json"));
    return sandbox;
}

async function prepareInstallation(root: string, value: InstallationManifest): Promise<void> {
    await writeInstallationManifest(join(root, ".deploy", "installation.json"), value);
}

async function write(root: string, relativePath: string, content: string): Promise<void> {
    const file = join(root, ...relativePath.split("/"));
    await mkdir(dirname(file), {recursive: true});
    await writeFile(file, content, "utf8");
}

function manifest(profile: "windows-portable" | "product-bun"): InstallationManifest {
    const now = new Date().toISOString();
    const revision = "a".repeat(40);
    const asset = {
        archiveSha256: "b".repeat(64),
        sourceUrl: "https://example.com/asset.zip",
        license: "test",
        redistribution: "test",
    };
    return {
        schemaVersion: 5,
        profile,
        containerEngine: null,
        managerVersion: "0.1.0",
        appVersion: "0.8.0",
        channel: "canary",
        sourceRevision: revision,
        roots: profile === "windows-portable" ? PORTABLE_ROOT_LOCATORS : INSTALLED_WINDOWS_ROOT_LOCATORS,
        components: {
            source: {provider: "release", buildId: `sha256:${"9".repeat(64)}`, version: "0.8.0", revision, path: ".", files: ["package.json"], ...asset},
            product: {
                provider: "release", buildId: `sha256:${"9".repeat(64)}`,
                version: "0.8.0",
                revision,
                path: ".output",
                platform: "windows-x64",
                ...asset,
                ...TEST_RUNTIME_IMAGE_IDENTITY,
            },
            manager: {provider: "managed", version: "0.1.0", path: ".runtime/manager/neuro-book.mjs", bundleSha256: "c".repeat(64)},
            managerRuntime: profile === "windows-portable"
                ? {provider: "managed", version: "1.3.0", path: ".runtime/bun/1.3.0/bun.exe", executableSha256: "d".repeat(64), ...asset}
                : {provider: "system", executable: "bun", version: "1.3.0"},
            applicationRuntime: profile === "windows-portable"
                ? {provider: "managed", version: "1.3.0", path: ".runtime/bun/1.3.0/bun.exe", executableSha256: "d".repeat(64), ...asset}
                : {provider: "system", executable: "bun", version: "1.3.0"},
            tools: profile === "windows-portable" ? {
                rg: {provider: "managed", version: "14.1.1", path: ".runtime/tools/rg/14.1.1/rg.exe", executableSha256: "e".repeat(64), ...asset},
                git: {provider: "managed", version: "2.49.0", path: ".runtime/tools/git/2.49.0/cmd/git.exe", distribution: "PortableGit", bashPath: ".runtime/tools/git/2.49.0/bin/bash.exe", gitSha256: "f".repeat(64), bashSha256: "1".repeat(64), ...asset},
            } : {},
        },
        installedAt: now,
        updatedAt: now,
    };
}
