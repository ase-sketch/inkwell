import {testHostPath} from "@notnotype/neuro-book-test-support/test-path";
import {mkdir, rm, writeFile} from "node:fs/promises";
import {join} from "node:path";
import {afterEach, describe, expect, it} from "vitest";

import {TEST_RUNTIME_IMAGE_IDENTITY} from "#manager/fixtures/runtime-image";
import {sha256File} from "#manager/files";
import {doctor, installationStatus} from "#manager/maintenance";
import {PORTABLE_ROOT_LOCATORS} from "@notnotype/neuro-book-contracts/installation";
import type {InstallationManifest} from "@notnotype/neuro-book-contracts/installation";

const roots: string[] = [];

describe("Manager State Root诊断", () => {
    afterEach(async () => {
        await Promise.all(roots.splice(0).map((root) => rm(root, {recursive: true, force: true})));
    });

    it("shadow workspace使doctor失败并进入status下一步", async () => {
        const root = testHostPath(`manager-maintenance-${crypto.randomUUID()}`);
        roots.push(root);
        const stateRoot = join(root, "data");
        const managerPath = join(root, ".runtime", "manager", "0.1.0", "neuro-book.mjs");
        const bunPath = join(root, ".runtime", "bun", "1.3.0", process.platform === "win32" ? "bun.exe" : "bun");
        const wrapperPath = join(root, ".runtime", "bin", process.platform === "win32" ? "neuro-book.cmd" : "neuro-book");
        await Promise.all([
            mkdir(join(root, "workspace"), {recursive: true}),
            mkdir(join(stateRoot, "workspace"), {recursive: true}),
            mkdir(join(stateRoot, "logs"), {recursive: true}),
            mkdir(join(root, ".runtime", "manager", "0.1.0"), {recursive: true}),
            mkdir(join(root, ".runtime", "bun", "1.3.0"), {recursive: true}),
            mkdir(join(root, ".runtime", "bin"), {recursive: true}),
        ]);
        await Promise.all([
            writeFile(join(stateRoot, "config.yaml"), "server: {}\n", "utf8"),
            writeFile(managerPath, "manager", "utf8"),
            writeFile(bunPath, "bun", "utf8"),
            writeFile(wrapperPath, "wrapper", "utf8"),
        ]);
        const managerSha256 = await sha256File(managerPath);
        const bunSha256 = await sha256File(bunPath);
        const now = new Date().toISOString();
        const revision = "a".repeat(40);
        const asset = {
            archiveSha256: "b".repeat(64),
            sourceUrl: "https://example.com/asset.zip",
            license: "test",
            redistribution: "test",
        };
        const manifest: InstallationManifest = {
            schemaVersion: 5,
            profile: "windows-portable",
            containerEngine: null,
            managerVersion: "0.1.0",
            appVersion: "0.8.0",
            channel: "canary",
            sourceRevision: revision,
            roots: PORTABLE_ROOT_LOCATORS,
            components: {
                source: {provider: "release", buildId: `sha256:${"9".repeat(64)}`, version: "0.8.0", revision, path: ".", files: ["package.json"], ...asset},
                product: {provider: "release", buildId: `sha256:${"9".repeat(64)}`, version: "0.8.0", revision, path: ".output", platform: "windows-x64", ...asset, ...TEST_RUNTIME_IMAGE_IDENTITY},
                manager: {provider: "managed", version: "0.1.0", path: ".runtime/manager/0.1.0/neuro-book.mjs", bundleSha256: managerSha256},
                managerRuntime: {provider: "managed", version: "1.3.0", path: relativePath(root, bunPath), executableSha256: bunSha256, ...asset},
                applicationRuntime: {provider: "managed", version: "1.3.0", path: relativePath(root, bunPath), executableSha256: bunSha256, ...asset},
                tools: {},
            },
            installedAt: now,
            updatedAt: now,
        };

        const diagnosis = await doctor(root, manifest) as {healthy: boolean; checks: Array<{id: string; status: string}>};
        const status = await installationStatus(root, manifest) as {
            stateIntegrity: {kind: string};
            nextActions: string[];
        };

        expect(diagnosis.healthy).toBe(false);
        expect(diagnosis.checks).toContainEqual(expect.objectContaining({id: "state.shadow-workspace", status: "fail"}));
        expect(status.stateIntegrity.kind).toBe("shadow-workspace");
        expect(status.nextActions).toContain("检查Workspace Root数据分叉、链接目标或目录权限");
    });
});

function relativePath(root: string, target: string): string {
    return target.slice(root.length + 1).replaceAll("\\", "/");
}
