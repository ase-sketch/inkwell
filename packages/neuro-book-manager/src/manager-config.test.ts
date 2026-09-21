import {mkdtemp, mkdir, rm} from "node:fs/promises";
import { testHostPath } from "@notnotype/neuro-book-test-support/test-path"
import {join} from "node:path";

import {afterEach, describe, expect, it} from "vitest";

import {TEST_RUNTIME_IMAGE_IDENTITY} from "#manager/fixtures/runtime-image";
import {addDiscoveryRoot, defaultManagerConfig, forgetManagerInstance, readManagerConfig, registerManagerInstance, removeDiscoveryRoot, setDefaultManagerInstance} from "#manager/manager-config";
import {writeInstallationManifest} from "#manager/manifest-store";
import {installationPaths} from "#manager/paths";
import {currentProductPlatform} from "#manager/platform";
import {INSTALLATION_SCOPED_ROOT_LOCATORS} from "@notnotype/neuro-book-contracts/installation";
import type {InstallationManifest} from "@notnotype/neuro-book-contracts/installation";

const roots: string[] = [];

afterEach(async () => {
    await Promise.all(roots.splice(0).map((root) => rm(root, {recursive: true, force: true})));
});

describe("用户级 Manager 配置", () => {
    it("Windows 默认安装根位于 LocalAppData Programs，用户状态不混入安装目录", () => {
        const config = defaultManagerConfig();
        if (process.platform === "win32") {
            expect(config.preferences.installDirectory.replaceAll("\\", "/")).toMatch(/\/AppData\/Local\/Programs\/NeuroBook$/u);
            expect(config.preferences.discoveryRoots?.at(0)?.replaceAll("\\", "/")).toMatch(/\/AppData\/Local\/Programs$/u);
        }
    });

    it("注册多个实例、选择默认实例且忘记实例不会删除安装目录", async () => {
        const testRoot = await temporaryRoot();
        const configPath = join(testRoot, "home", "config.json");
        const firstRoot = join(testRoot, "first");
        const secondRoot = join(testRoot, "second");
        await createInstallation(firstRoot);
        await createInstallation(secondRoot);

        const first = await registerManagerInstance({root: firstRoot, name: "主实例", configPath});
        const second = await registerManagerInstance({root: secondRoot, name: "测试实例", configPath, makeDefault: false});
        expect((await readManagerConfig(configPath)).defaultInstanceId).toBe(first.id);

        await setDefaultManagerInstance(second.id, configPath);
        expect((await readManagerConfig(configPath)).defaultInstanceId).toBe(second.id);

        await forgetManagerInstance(second.name, configPath);
        const config = await readManagerConfig(configPath);
        expect(config.instances.map((instance) => instance.name)).toEqual(["主实例"]);
        expect(config.defaultInstanceId).toBe(first.id);
        expect(await Bun.file(installationPaths(secondRoot).manifest).exists()).toBe(true);
    });

    it("拒绝注册缺少 installation manifest 的目录", async () => {
        const testRoot = await temporaryRoot();
        await expect(registerManagerInstance({
            root: join(testRoot, "missing"),
            configPath: join(testRoot, "config.json"),
        })).rejects.toThrow("不是 NeuroBook Manager 实例");
    });

    it("规范化并维护有限搜索根", async () => {
        const testRoot = await temporaryRoot();
        const configPath = join(testRoot, "config.json");
        await addDiscoveryRoot(join(testRoot, "projects"), configPath);
        await addDiscoveryRoot(join(testRoot, "projects", "."), configPath);
        expect((await readManagerConfig(configPath)).preferences.discoveryRoots?.filter((root) => root === join(testRoot, "projects"))).toHaveLength(1);
        await removeDiscoveryRoot(join(testRoot, "projects"), configPath);
        expect((await readManagerConfig(configPath)).preferences.discoveryRoots).not.toContain(join(testRoot, "projects"));
    });

    it("显式空搜索根不会回退默认目录", async () => {
        const testRoot = await temporaryRoot();
        const configPath = join(testRoot, "config.json");
        const initial = await readManagerConfig(configPath);
        for (const root of initial.preferences.discoveryRoots ?? []) await removeDiscoveryRoot(root, configPath);
        expect((await readManagerConfig(configPath)).preferences.discoveryRoots).toEqual([]);
    });
});

async function temporaryRoot(): Promise<string> {
    const root = await mkdtemp(testHostPath("neuro-book-manager-config-"));
    roots.push(root);
    return root;
}

async function createInstallation(root: string): Promise<void> {
    const paths = installationPaths(root);
    await mkdir(paths.deploy, {recursive: true});
    await writeInstallationManifest(paths.manifest, manifest());
}

function manifest(): InstallationManifest {
    const checksum = "a".repeat(64);
    const revision = "b".repeat(40);
    const now = new Date().toISOString();
    return {
        schemaVersion: 5,
        profile: "product-bun",
        containerEngine: null,
        managerVersion: "0.1.0",
        appVersion: "0.8.0",
        channel: "stable",
        sourceRevision: revision,
        roots: INSTALLATION_SCOPED_ROOT_LOCATORS,
        components: {
            source: {
                provider: "release", buildId: `sha256:${"9".repeat(64)}`,
                version: "0.8.0",
                revision,
                path: ".",
                files: ["package.json"],
                archiveSha256: checksum,
                sourceUrl: "https://example.com/source.zip",
                license: "AGPL-3.0-only",
                redistribution: "test",
            },
            product: {
                ...TEST_RUNTIME_IMAGE_IDENTITY,
                provider: "release", buildId: `sha256:${"9".repeat(64)}`,
                version: "0.8.0",
                revision,
                path: ".output",
                platform: currentProductPlatform(),
                archiveSha256: checksum,
                sourceUrl: "https://example.com/product.zip",
                license: "AGPL-3.0-only",
                redistribution: "test",
            },
            manager: {provider: "managed", version: "0.1.0", path: ".runtime/manager/0.1.0/neuro-book.mjs", bundleSha256: checksum},
            managerRuntime: {provider: "system", version: "1.3.0", executable: "bun"},
            applicationRuntime: {provider: "system", version: "1.3.0", executable: "bun"},
            tools: {},
        },
        installedAt: now,
        updatedAt: now,
    };
}
