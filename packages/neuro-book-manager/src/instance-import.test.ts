import {createHash} from "node:crypto";
import {cp, mkdtemp, mkdir, rm, writeFile} from "node:fs/promises";
import { testHostPath } from "@notnotype/neuro-book-test-support/test-path"
import {join} from "node:path";

import {afterEach, describe, expect, it} from "vitest";

import {buildTestRuntimeImage, hostRuntimeImageFixtureAvailable} from "#manager/fixtures/runtime-image";
import {inspectInstance} from "#manager/instance-discovery";
import {importInstallation, inspectImport} from "#manager/instance-import";
import {writeInstallationManifest} from "#manager/manifest-store";
import {installationPaths} from "#manager/paths";
import {INSTALLATION_SCOPED_ROOT_LOCATORS} from "@notnotype/neuro-book-contracts/installation";
import {currentProductPlatform} from "#manager/platform";
import {renderManagerWrapper} from "#manager/runtime";
import type {InstallationManifest} from "@notnotype/neuro-book-contracts/installation";

const roots: string[] = [];
afterEach(async () => Promise.all(roots.splice(0).map((root) => rm(root, {recursive: true, force: true}))));

describe.runIf(hostRuntimeImageFixtureAvailable(currentProductPlatform()))("实例离线导入", () => {
    it("服务停机只产生warning，确认后可导入", async () => {
        const root = await fixture();
        const configPath = join(root, "manager-home", "config.json");
        const inspection = await inspectImport(root);
        expect(inspection.blockers).toEqual([]);
        await expect(inspectInstance(root)).resolves.toMatchObject({product: {exists: true, trusted: true}});
        expect(inspection.importable).toBe(true);
        expect(inspection.warnings.some((issue) => issue.code === "service.offline-unchecked")).toBe(true);
        await expect(importInstallation({root, configPath})).rejects.toThrow("--yes");
        const result = await importInstallation({root, configPath, acceptWarnings: true});
        expect(result.instance.root).toBe(root);
    });

    it("checksum blocker不能被acceptWarnings绕过", async () => {
        const root = await fixture();
        await writeFile(join(root, ".runtime", "manager", "0.1.0", "neuro-book.mjs"), "corrupted", "utf8");
        const inspection = await inspectImport(root);
        expect(inspection.importable).toBe(false);
        await expect(importInstallation({root, configPath: join(root, "config.json"), acceptWarnings: true})).rejects.toThrow("checksum");
    });

    it("只有server/index.mjs的旧.output无法通过导入或可信发现", async () => {
        const root = await fixture();
        await rm(join(root, ".output"), {recursive: true, force: true});
        await mkdir(join(root, ".output", "server"), {recursive: true});
        await writeFile(join(root, ".output", "server", "index.mjs"), "export {};\n", "utf8");

        await expect(inspectInstance(root)).resolves.toMatchObject({product: {exists: true, trusted: false}});
        const inspection = await inspectImport(root);
        expect(inspection.importable).toBe(false);
        expect(inspection.blockers.some((issue) => issue.code === "product.runtime-image")).toBe(true);
    });
});

async function fixture(): Promise<string> {
    const root = await mkdtemp(testHostPath("nbook-import-"));
    roots.push(root);
    const manager = join(root, ".runtime", "manager", "0.1.0", "neuro-book.mjs");
    const wrapper = join(root, ".runtime", "bin", process.platform === "win32" ? "neuro-book.cmd" : "neuro-book");
    const stateRoot = join(root, "data");
    await mkdir(join(root, ".deploy"), {recursive: true});
    await mkdir(join(stateRoot, "workspace"), {recursive: true});
    await mkdir(join(stateRoot, "logs"), {recursive: true});
    await mkdir(join(manager, ".."), {recursive: true});
    await mkdir(join(wrapper, ".."), {recursive: true});
    const bundle = "console.log('manager')\n";
    await writeFile(manager, bundle, "utf8");
    await writeFile(wrapper, renderManagerWrapper({provider: "managed", version: "0.1.0", path: ".runtime/manager/0.1.0/neuro-book.mjs", bundleSha256: ""}, {provider: "system", version: "1.3.0", executable: "bun"}), "utf8");
    await writeFile(join(stateRoot, "config.yaml"), "server: {}\n", "utf8");
    const revision = "b".repeat(40);
    const platform = currentProductPlatform();
    const image = await buildTestRuntimeImage({sourceRoot: root, version: "1.0.0", revision, platform});
    await cp(image.path, join(root, ".output"), {recursive: true});
    const now = new Date().toISOString();
    const manifest: InstallationManifest = {
        schemaVersion: 5, profile: "product-bun", containerEngine: null, managerVersion: "0.1.0", appVersion: "1.0.0", channel: "canary", sourceRevision: revision, roots: INSTALLATION_SCOPED_ROOT_LOCATORS,
        components: {
            source: {provider: "release", buildId: `sha256:${"9".repeat(64)}`, version: "1.0.0", revision, path: ".", files: ["package.json"], archiveSha256: "c".repeat(64), sourceUrl: "https://example.com/source.zip", license: "test", redistribution: "test"},
            product: {
                provider: "release", buildId: `sha256:${"9".repeat(64)}`,
                version: "1.0.0",
                revision,
                path: ".output",
                platform,
                archiveSha256: "d".repeat(64),
                sourceUrl: "https://example.com/product.zip",
                license: "test",
                redistribution: "test",
                imageId: image.manifest.imageId,
                sourceDigest: image.manifest.sourceDigest,
                lockfileSha256: image.manifest.lockfileSha256,
                builderContractVersion: image.manifest.builderContractVersion,
            },
            manager: {provider: "managed", version: "0.1.0", path: ".runtime/manager/0.1.0/neuro-book.mjs", bundleSha256: createHash("sha256").update(bundle).digest("hex")},
            managerRuntime: {provider: "system", version: "1.3.0", executable: "bun"}, applicationRuntime: {provider: "system", version: "1.3.0", executable: "bun"}, tools: {git: {provider: "system", version: "git version 2", executable: "git"}},
        }, installedAt: now, updatedAt: now,
    };
    await writeInstallationManifest(installationPaths(root).manifest, manifest);
    return root;
}
