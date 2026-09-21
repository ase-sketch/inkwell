import {describe, expect, it, vi} from "vitest";
import {TEST_RUNTIME_IMAGE_IDENTITY} from "#manager/fixtures/runtime-image";
import {INSTALLATION_SCOPED_ROOT_LOCATORS} from "@notnotype/neuro-book-contracts/installation";

const mocks = vi.hoisted(() => ({
    assertManagerUpgrade: vi.fn(),
    fetchUpdateTarget: vi.fn(),
    resolveReleaseManifest: vi.fn(),
}));

vi.mock("#manager/runtime", () => ({assertManagerUpgrade: mocks.assertManagerUpgrade}));
vi.mock("#manager/git", () => ({fetchUpdateTarget: mocks.fetchUpdateTarget}));
vi.mock("#manager/manifest-store", () => ({resolveReleaseManifest: mocks.resolveReleaseManifest}));

import {inspectUpdatePreflight} from "#manager/update-preflight";
import type {InstallationManifest} from "@notnotype/neuro-book-contracts/installation";
import type {ReleaseManifest} from "@notnotype/neuro-book-contracts/release";
import {MANAGER_VERSION} from "#manager/version-info";

const SHA = "a".repeat(64);

describe("Update Preflight", () => {
    it("Release dry-run解析真实Manifest并报告原子组件", async () => {
        mocks.assertManagerUpgrade.mockResolvedValue(false);
        mocks.resolveReleaseManifest.mockResolvedValue(releaseFixture("0.9.0-canary.2", "2".repeat(40)));

        const report = await inspectUpdatePreflight({
            root: "C:/Inkwell",
            manifest: manifestFixture(),
            managerExecutable: "C:/manager/neuro-book.mjs",
        });

        expect(report.target).toMatchObject({kind: "release", version: "0.9.0-canary.2", revision: "2".repeat(40)});
        expect(report.components).toEqual(["source", "product"]);
        expect(report.alreadyCurrent).toBe(false);
        expect(report.effects).toEqual(expect.arrayContaining([
            expect.objectContaining({kind: "sqlite-backup", owner: "app-sqlite"}),
            expect.objectContaining({kind: "component-switch", owner: "source"}),
            expect.objectContaining({kind: "component-switch", owner: "product"}),
            expect.objectContaining({kind: "manifest-switch", owner: "manifest"}),
        ]));
    });

    it("Git dry-run执行fetch并报告真实revision", async () => {
        mocks.assertManagerUpgrade.mockResolvedValue(false);
        mocks.fetchUpdateTarget.mockResolvedValue({previousRevision: "1".repeat(40), targetRevision: "2".repeat(40), branch: "master"});
        const manifest = manifestFixture();
        manifest.profile = "source-dev";
        manifest.components.source = {provider: "git", version: manifest.appVersion, revision: manifest.sourceRevision, path: ".", repository: "https://github.com/notnotype/neuro-book.git", branch: "master"};
        manifest.components.product = undefined;

        const report = await inspectUpdatePreflight({root: "C:/checkout", manifest, managerExecutable: "C:/manager/neuro-book.mjs"});

        expect(report.target).toEqual({kind: "git", previousRevision: "1".repeat(40), revision: "2".repeat(40)});
        expect(report.components).toEqual(["source"]);
        expect(report.effects).toContainEqual(expect.objectContaining({kind: "git-fast-forward", owner: "source"}));
        expect(report.effects).not.toContainEqual(expect.objectContaining({kind: "sqlite-backup"}));
    });

    it("同版本dry-run返回空Effect计划", async () => {
        mocks.assertManagerUpgrade.mockResolvedValue(false);
        const manifest = manifestFixture();
        const release = releaseFixture(manifest.appVersion, manifest.sourceRevision);
        release.source.sha256 = (manifest.components.source as {archiveSha256: string}).archiveSha256;
        release.products[0].sha256 = (manifest.components.product as {archiveSha256: string}).archiveSha256;
        mocks.resolveReleaseManifest.mockResolvedValue(release);

        const report = await inspectUpdatePreflight({root: "C:/Inkwell", manifest, managerExecutable: "C:/manager/neuro-book.mjs"});

        expect(report.alreadyCurrent).toBe(true);
        expect(report.effects).toEqual([]);
    });

    it("manual state migration在更新计划生成前阻塞", async () => {
        mocks.assertManagerUpgrade.mockResolvedValue(false);
        mocks.resolveReleaseManifest.mockResolvedValue({
            ...releaseFixture("0.9.0-canary.2", "2".repeat(40)),
            stateMigration: {policy: "manual", steps: [], guide: "docs/migrations/manual.md"},
        });

        await expect(inspectUpdatePreflight({
            root: "C:/Inkwell",
            manifest: manifestFixture(),
            managerExecutable: "C:/manager/neuro-book.mjs",
        })).rejects.toThrow("docs/migrations/manual.md");
    });
});

function manifestFixture(): InstallationManifest {
    return {
        schemaVersion: 5,
        profile: "product-bun",
        containerEngine: null,
        managerVersion: MANAGER_VERSION,
        appVersion: "0.9.0-canary.1",
        channel: "canary",
        sourceRevision: "1".repeat(40),
        roots: INSTALLATION_SCOPED_ROOT_LOCATORS,
        components: {
            source: {provider: "release", buildId: `sha256:${"9".repeat(64)}`, version: "0.9.0-canary.1", revision: "1".repeat(40), path: ".", files: ["package.json"], archiveSha256: SHA, sourceUrl: "https://example.com/source.zip", license: "AGPL-3.0-only", redistribution: "test"},
            product: {provider: "release", buildId: `sha256:${"9".repeat(64)}`, version: "0.9.0-canary.1", revision: "1".repeat(40), path: ".output", platform: "windows-x64", archiveSha256: SHA, sourceUrl: "https://example.com/product.zip", license: "AGPL-3.0-only", redistribution: "test", ...TEST_RUNTIME_IMAGE_IDENTITY},
            manager: {provider: "managed", version: MANAGER_VERSION, path: ".runtime/manager/current/neuro-book.mjs", bundleSha256: SHA},
            managerRuntime: {provider: "system", version: "1.3.14", executable: process.execPath},
            applicationRuntime: {provider: "system", version: "1.3.14", executable: process.execPath},
            tools: {},
        },
        installedAt: "2026-07-19T00:00:00.000Z",
        updatedAt: "2026-07-19T00:00:00.000Z",
    };
}

function releaseFixture(version: string, revision: string): ReleaseManifest {
    return {
        schemaVersion: 5,
        buildId: `sha256:${"9".repeat(64)}`,
        version,
        channel: "canary",
        sourceRevision: revision,
        minManagerVersion: MANAGER_VERSION,
        source: {url: "https://example.com/source.zip", sha256: SHA, bytes: 1},
        products: [{platform: "windows-x64", sourceRevision: revision, url: "https://example.com/product.zip", sha256: SHA, bytes: 1, ...TEST_RUNTIME_IMAGE_IDENTITY}],
        windowsPortable: {url: "https://example.com/portable.zip", sha256: SHA, bytes: 1},
        ghcr: {ref: `ghcr.io/notnotype/neuro-book@sha256:${SHA}`, digest: `sha256:${SHA}`, sourceRevision: revision},
        stateMigration: {policy: "automatic", steps: ["agent-attachment-v1", "agent-session-v2"]},
    };
}
