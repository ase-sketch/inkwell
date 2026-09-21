import {mkdir, mkdtemp, rm, stat, writeFile} from "node:fs/promises";
import {createServer, type Server} from "node:net";
import { testHostPath } from "@notnotype/neuro-book-test-support/test-path"
import {join} from "node:path";

import {afterEach, beforeEach, describe, expect, it, vi} from "vitest";
import {TEST_RUNTIME_IMAGE_IDENTITY} from "#manager/fixtures/runtime-image";

const mocks = vi.hoisted(() => ({resolveReleaseManifest: vi.fn()}));

vi.mock("#manager/manifest-store", async () => {
    const actual = await vi.importActual<typeof import("#manager/manifest-store")>("#manager/manifest-store");
    return {...actual, resolveReleaseManifest: mocks.resolveReleaseManifest};
});

import {
    assertInstallConsent,
    assertInstallPreflight,
    inspectInstallPreflight,
    recommendedInstallProfile,
    type InstallEnvironmentInspection,
} from "#manager/install-preflight";
import {inspectHostPlatform} from "#manager/platform";
import type {ReleaseManifest} from "@notnotype/neuro-book-contracts/release";
import {MANAGER_VERSION} from "#manager/version-info";

const roots: string[] = [];
const servers: Server[] = [];

beforeEach(() => {
    mocks.resolveReleaseManifest.mockReset();
    mocks.resolveReleaseManifest.mockResolvedValue(releaseFixture());
});

afterEach(async () => {
    await Promise.all(servers.splice(0).map((server) => new Promise<void>((resolvePromise) => server.close(() => resolvePromise()))));
    await Promise.all(roots.splice(0).map((root) => rm(root, {recursive: true, force: true})));
});

describe("Install Preflight", () => {
    it("非TTY安装必须显式传入--yes", () => {
        expect(() => assertInstallConsent(false, false)).toThrow("--yes");
        expect(() => assertInstallConsent(true, false)).not.toThrow();
        expect(() => assertInstallConsent(false, true)).not.toThrow();
    });

    it("Source Profile一次报告宿主、Git、端口和组件来源", async () => {
        const root = await mkdtemp(testHostPath("nbook-preflight-source-"));
        roots.push(root);
        const result = await inspectInstallPreflight({
            root,
            profile: "source-dev",
            channel: "canary",
            port: await freePort(),
        }, environment({git: {available: true, version: "git version 2.50.0"}}));

        expect(result.report.blockers).toEqual([]);
        expect(result.report.commands).toContainEqual(expect.objectContaining({
            id: "git",
            available: true,
            required: inspectHostPlatform().os !== "windows",
        }));
        expect(result.report.sources).toContainEqual(expect.objectContaining({component: "source", source: "git"}));
        expect(mocks.resolveReleaseManifest).not.toHaveBeenCalled();
    });

    it("端口占用和未知目标文件形成blocker", async () => {
        const root = await mkdtemp(testHostPath("nbook-preflight-blocked-"));
        roots.push(root);
        await writeFile(join(root, "user-file.txt"), "keep", "utf8");
        const {server, port} = await listeningServer();
        servers.push(server);

        const result = await inspectInstallPreflight({
            root,
            profile: "product-bun",
            channel: "canary",
            port,
        }, environment());

        expect(result.report.blockers).toEqual(expect.arrayContaining([
            expect.objectContaining({code: "network.port"}),
            expect.objectContaining({code: "target.unknown"}),
        ]));
        expect(() => assertInstallPreflight(result)).toThrow("端口");
    });

    it("Container Profile缺少可用engine时拒绝安装", async () => {
        const root = await mkdtemp(testHostPath("nbook-preflight-container-"));
        roots.push(root);
        const result = await inspectInstallPreflight({
            root,
            profile: "ghcr",
            channel: "canary",
            port: await freePort(),
        }, environment({containers: {
            engine: null,
            inspections: [{
                engine: "docker",
                command: {available: true, version: "Docker 28"},
                compose: {available: true, version: "Compose 2"},
                daemonAvailable: false,
                error: "docker daemon不可用",
            }],
            error: "未检测到可用的Docker或Podman。",
        }}));

        expect(result.report.containerEngine).toBeNull();
        expect(result.report.blockers).toContainEqual(expect.objectContaining({code: "container.engine"}));
        expect(result.report.release?.version).toBe("0.9.0-canary.1");
    });

    it("dry-run预检不会创建不存在的Installation Root", async () => {
        const parent = await mkdtemp(testHostPath("nbook-preflight-readonly-"));
        roots.push(parent);
        const root = join(parent, "new-installation");
        const result = await inspectInstallPreflight({
            root,
            profile: "product-bun",
            channel: "canary",
            port: await freePort(),
        }, environment());

        expect(result.report.blockers).toEqual([]);
        await expect(stat(root)).rejects.toMatchObject({code: "ENOENT"});
    });

    it("manual state migration在任何安装写入前形成blocker", async () => {
        const parent = await mkdtemp(testHostPath("nbook-preflight-manual-"));
        roots.push(parent);
        const root = join(parent, "new-installation");
        mocks.resolveReleaseManifest.mockResolvedValue({
            ...releaseFixture(),
            stateMigration: {policy: "manual", steps: [], guide: "docs/migrations/manual.md"},
        });

        const result = await inspectInstallPreflight({
            root,
            profile: "product-bun",
            channel: "canary",
            port: await freePort(),
        }, environment());

        expect(result.report.blockers).toContainEqual(expect.objectContaining({
            code: "release.resolve",
            message: expect.stringContaining("docs/migrations/manual.md"),
        }));
        await expect(stat(root)).rejects.toMatchObject({code: "ENOENT"});
    });

    it("推荐策略只依赖宿主与已探测engine", () => {
        const host = inspectHostPlatform();
        expect(recommendedInstallProfile(environment())).toBe(host.os === "windows" ? "windows-portable" : "product-bun");
        if (host.os !== "windows") {
            expect(recommendedInstallProfile(environment({containers: {
                engine: "podman",
                inspections: [],
            }}))).toBe("ghcr");
        }
    });
});

function environment(overrides: Partial<InstallEnvironmentInspection> = {}): InstallEnvironmentInspection {
    return {
        host: inspectHostPlatform(),
        bun: {available: true, version: process.versions.bun ?? "unknown"},
        ...overrides,
    };
}

function releaseFixture(): ReleaseManifest {
    const host = inspectHostPlatform();
    const asset = {url: "https://example.com/asset.zip", sha256: "a".repeat(64), bytes: 1};
    return {
        schemaVersion: 5,
        buildId: `sha256:${"9".repeat(64)}`,
        version: "0.9.0-canary.1",
        channel: "canary",
        sourceRevision: "b".repeat(40),
        minManagerVersion: MANAGER_VERSION,
        source: {...asset, url: "https://example.com/neuro-book-source.zip"},
        products: [{...asset, ...TEST_RUNTIME_IMAGE_IDENTITY, url: "https://example.com/product.zip", platform: host.productPlatform, sourceRevision: "b".repeat(40)}],
        windowsPortable: {...asset, url: "https://example.com/neuro-book-windows-x64.zip"},
        ghcr: {ref: `ghcr.io/notnotype/neuro-book@sha256:${"c".repeat(64)}`, digest: `sha256:${"c".repeat(64)}`, sourceRevision: "b".repeat(40)},
        stateMigration: {policy: "automatic", steps: ["agent-attachment-v1", "agent-session-v2"]},
    };
}

async function listeningServer(): Promise<{server: Server; port: number}> {
    const server = createServer();
    await new Promise<void>((resolvePromise, rejectPromise) => {
        server.once("error", rejectPromise);
        server.listen(0, "127.0.0.1", resolvePromise);
    });
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("测试端口监听失败。" );
    return {server, port: address.port};
}

async function freePort(): Promise<number> {
    const {server, port} = await listeningServer();
    await new Promise<void>((resolvePromise) => server.close(() => resolvePromise()));
    return port;
}
