import {createHash} from "node:crypto";
import {cp, mkdtemp, mkdir, rm, writeFile} from "node:fs/promises";
import { testHostPath } from "@notnotype/neuro-book-test-support/test-path"
import {join} from "node:path";

import {afterEach, describe, expect, it} from "vitest";

import {buildTestRuntimeImage, hostRuntimeImageFixtureAvailable} from "#manager/fixtures/runtime-image";
import {doctor} from "#manager/installation-health";
import {installationStatus} from "#manager/maintenance";
import {writeInstallationManifest} from "#manager/manifest-store";
import {installationPaths} from "#manager/paths";
import {INSTALLATION_SCOPED_ROOT_LOCATORS} from "@notnotype/neuro-book-contracts/installation";
import {currentProductPlatform} from "#manager/platform";
import {renderManagerWrapper} from "#manager/runtime";
import type {InstallationManifest} from "@notnotype/neuro-book-contracts/installation";

const roots: string[] = [];

afterEach(async () => Promise.all(roots.splice(0).map((root) => rm(root, {recursive: true, force: true}))));

describe.runIf(hostRuntimeImageFixtureAvailable(currentProductPlatform()))("Installation Health", () => {
    it("原生服务正常停止时doctor保持healthy并给出start warning", async () => {
        const {root, manifest} = await fixture();
        const report = await doctor(root, manifest);
        expect(report.healthy).toBe(true);
        expect(report.service.status).toBe("stopped");
        expect(report.checks).toContainEqual(expect.objectContaining({id: "service.application", status: "warn"}));
    });

    it("wrapper存在但内容指向旧组件时doctor失败", async () => {
        const {root, manifest} = await fixture();
        const wrapper = join(root, ".runtime", "bin", process.platform === "win32" ? "neuro-book.cmd" : "neuro-book");
        await writeFile(wrapper, "old-manager-wrapper\n", "utf8");
        const report = await doctor(root, manifest);
        expect(report.healthy).toBe(false);
        expect(report.checks).toContainEqual(expect.objectContaining({id: "manager.wrapper", status: "fail"}));
    });

    it("只有server/index.mjs的旧.output不再视为就绪Product", async () => {
        const {root, manifest} = await fixture();
        await rm(join(root, ".output"), {recursive: true, force: true});
        await mkdir(join(root, ".output", "server"), {recursive: true});
        await writeFile(join(root, ".output", "server", "index.mjs"), "export {};\n", "utf8");

        const report = await doctor(root, manifest);
        expect(report.checks).toContainEqual(expect.objectContaining({id: "product.runtime-image", status: "fail"}));
        await expect(installationStatus(root, manifest)).resolves.toMatchObject({productReady: false});
    });
});

async function fixture(): Promise<{root: string; manifest: InstallationManifest}> {
    const root = await mkdtemp(testHostPath("nbook-health-"));
    roots.push(root);
    const managerPath = join(root, ".runtime", "manager", "0.1.0", "neuro-book.mjs");
    const wrapperPath = join(root, ".runtime", "bin", process.platform === "win32" ? "neuro-book.cmd" : "neuro-book");
    const stateRoot = join(root, "data");
    await Promise.all([
        mkdir(join(root, ".deploy"), {recursive: true}),
        mkdir(join(root, ".runtime", "manager", "0.1.0"), {recursive: true}),
        mkdir(join(root, ".runtime", "bin"), {recursive: true}),
        mkdir(join(stateRoot, "workspace", ".nbook"), {recursive: true}),
        mkdir(join(stateRoot, "logs"), {recursive: true}),
    ]);
    const bundle = "export default {}\n";
    await Promise.all([
        writeFile(managerPath, bundle, "utf8"),
        writeFile(join(stateRoot, "config.yaml"), "server: {}\n", "utf8"),
        writeFile(join(stateRoot, ".env"), "NUXT_PORT=19373\n", "utf8"),
    ]);
    const revision = "a".repeat(40);
    const platform = currentProductPlatform();
    const image = await buildTestRuntimeImage({sourceRoot: root, version: "1.0.0", revision, platform});
    await cp(image.path, join(root, ".output"), {recursive: true});
    const manager = {provider: "managed" as const, version: "0.1.0", path: ".runtime/manager/0.1.0/neuro-book.mjs", bundleSha256: createHash("sha256").update(bundle).digest("hex")};
    const runtime = {provider: "system" as const, version: "1.3.0", executable: "bun"};
    await writeFile(wrapperPath, renderManagerWrapper(manager, runtime), "utf8");
    const now = new Date().toISOString();
    const asset = {archiveSha256: "b".repeat(64), sourceUrl: "https://example.com/asset.zip", license: "test", redistribution: "test"};
    const manifest: InstallationManifest = {
        schemaVersion: 5,
        profile: "product-bun",
        containerEngine: null,
        managerVersion: "0.1.0",
        appVersion: "1.0.0",
        channel: "canary",
        sourceRevision: revision,
        roots: INSTALLATION_SCOPED_ROOT_LOCATORS,
        components: {
            source: {provider: "release", buildId: `sha256:${"9".repeat(64)}`, version: "1.0.0", revision, path: ".", files: ["package.json"], ...asset},
            product: {
                provider: "release", buildId: `sha256:${"9".repeat(64)}`,
                version: "1.0.0",
                revision,
                path: ".output",
                platform,
                ...asset,
                imageId: image.manifest.imageId,
                sourceDigest: image.manifest.sourceDigest,
                lockfileSha256: image.manifest.lockfileSha256,
                builderContractVersion: image.manifest.builderContractVersion,
            },
            manager,
            managerRuntime: runtime,
            applicationRuntime: runtime,
            tools: {},
        },
        installedAt: now,
        updatedAt: now,
    };
    await writeInstallationManifest(installationPaths(root).manifest, manifest);
    return {root, manifest};
}
