import {mkdtemp, rm, writeFile} from "node:fs/promises";
import { testHostPath } from "@notnotype/neuro-book-test-support/test-path"
import {join} from "node:path";

import {afterEach, beforeEach, describe, expect, it, vi} from "vitest";

const mocks = vi.hoisted(() => ({
    commandStatus: vi.fn(),
    inspectDockerApplication: vi.fn(),
}));

vi.mock("#manager/app-commands", () => ({commandStatus: mocks.commandStatus}));
vi.mock("#manager/docker", () => ({
    inspectDockerApplication: mocks.inspectDockerApplication,
    containerProductImageReference: (_profile: string, product: {image: string; digest?: string}) => {
        if (!product.digest) return product.image;
        const slash = product.image.lastIndexOf("/");
        const colon = product.image.lastIndexOf(":");
        const repository = colon > slash ? product.image.slice(0, colon) : product.image;
        return `${repository}@${product.digest}`;
    },
}));

import {inspectInstallationService} from "#manager/installation-health";
import {INSTALLATION_SCOPED_ROOT_LOCATORS} from "@notnotype/neuro-book-contracts/installation";
import type {InstallationManifest} from "@notnotype/neuro-book-contracts/installation";

const roots: string[] = [];
const digest = `sha256:${"a".repeat(64)}`;

beforeEach(() => {
    vi.clearAllMocks();
    mocks.commandStatus.mockResolvedValue({available: true, version: "Docker"});
});

afterEach(async () => {
    vi.unstubAllGlobals();
    await Promise.all(roots.splice(0).map((root) => rm(root, {recursive: true, force: true})));
});

describe("Docker Installation Health", () => {
    it("容器未创建时返回stopped而不是fail", async () => {
        const root = await fixture();
        mocks.inspectDockerApplication.mockResolvedValue({configuredImage: `ghcr.io/notnotype/neuro-book:v1@${digest}`});
        const service = await inspectInstallationService(root, manifest());
        expect(service.status).toBe("stopped");
        expect(service.message).toContain("尚未创建");
    });

    it("运行镜像与Manifest不一致时返回degraded", async () => {
        const root = await fixture();
        mocks.inspectDockerApplication.mockResolvedValue({
            configuredImage: `ghcr.io/notnotype/neuro-book:v1@${digest}`,
            containerId: "container",
            actualImage: "ghcr.io/notnotype/neuro-book:old",
            status: "running",
        });
        const service = await inspectInstallationService(root, manifest());
        expect(service.status).toBe("degraded");
        expect(service.message).toContain("镜像与Manifest不一致");
    });

    it("Podman省略tag但保留相同repository与digest时仍是同一镜像", async () => {
        const root = await fixture();
        mocks.inspectDockerApplication.mockResolvedValue({
            configuredImage: `ghcr.io/notnotype/neuro-book:v1@${digest}`,
            containerId: "container",
            actualImage: `ghcr.io/notnotype/neuro-book@${digest}`,
            status: "running",
        });
        vi.stubGlobal("fetch", vi.fn(async () => Response.json({versionLabel: "v1.0.0"})));

        const service = await inspectInstallationService(root, {...manifest(), containerEngine: "podman"});

        expect(service.status).toBe("running");
        expect(service.actualImage).toBe(`ghcr.io/notnotype/neuro-book@${digest}`);
    });

    it("相同digest但repository不同仍拒绝", async () => {
        const root = await fixture();
        mocks.inspectDockerApplication.mockResolvedValue({
            configuredImage: `ghcr.io/notnotype/neuro-book:v1@${digest}`,
            containerId: "container",
            actualImage: `ghcr.io/notnotype/other@${digest}`,
            status: "running",
        });

        const service = await inspectInstallationService(root, manifest());

        expect(service.status).toBe("degraded");
        expect(service.message).toContain("镜像与Manifest不一致");
    });

    it("运行容器HTTP版本错误时返回degraded", async () => {
        const root = await fixture();
        mocks.inspectDockerApplication.mockResolvedValue({
            configuredImage: `ghcr.io/notnotype/neuro-book:v1@${digest}`,
            containerId: "container",
            actualImage: `ghcr.io/notnotype/neuro-book:v1@${digest}`,
            status: "running",
        });
        vi.stubGlobal("fetch", vi.fn(async () => Response.json({versionLabel: "v0.9.0"})));
        const service = await inspectInstallationService(root, manifest());
        expect(service.status).toBe("degraded");
        expect(service.observedVersion).toBe("v0.9.0");
    });

    it("容器收到SIGTERM正常停止时返回stopped", async () => {
        const root = await fixture();
        mocks.inspectDockerApplication.mockResolvedValue({
            configuredImage: `ghcr.io/notnotype/neuro-book:v1@${digest}`,
            containerId: "container",
            actualImage: `ghcr.io/notnotype/neuro-book:v1@${digest}`,
            status: "exited",
            exitCode: 143,
        });

        const service = await inspectInstallationService(root, manifest());

        expect(service.status).toBe("stopped");
        expect(service.message).toContain("正常停止");
    });

    it("容器异常退出时保持degraded", async () => {
        const root = await fixture();
        mocks.inspectDockerApplication.mockResolvedValue({
            configuredImage: `ghcr.io/notnotype/neuro-book:v1@${digest}`,
            containerId: "container",
            actualImage: `ghcr.io/notnotype/neuro-book:v1@${digest}`,
            status: "exited",
            exitCode: 1,
        });

        const service = await inspectInstallationService(root, manifest());

        expect(service.status).toBe("degraded");
    });

    it("Podman实例只探测Manifest固定engine", async () => {
        const root = await fixture();
        const podmanManifest = {...manifest(), containerEngine: "podman" as const};
        mocks.inspectDockerApplication.mockResolvedValue({configuredImage: `ghcr.io/notnotype/neuro-book:v1@${digest}`});

        await inspectInstallationService(root, podmanManifest);

        expect(mocks.commandStatus).toHaveBeenCalledWith("podman");
        expect(mocks.commandStatus).toHaveBeenCalledWith("podman", ["compose", "version"]);
        expect(mocks.inspectDockerApplication).toHaveBeenCalledWith("podman", root, join(root, "data"));
    });
});

async function fixture(): Promise<string> {
    const root = await mkdtemp(testHostPath("nbook-health-docker-"));
    roots.push(root);
    await writeFile(join(root, ".env"), "NUXT_PORT=19374\n", "utf8");
    return root;
}

function manifest(): InstallationManifest {
    const revision = "b".repeat(40);
    return {
        schemaVersion: 5,
        profile: "ghcr",
        containerEngine: "docker",
        managerVersion: "0.1.0",
        appVersion: "1.0.0",
        channel: "canary",
        sourceRevision: revision,
        roots: INSTALLATION_SCOPED_ROOT_LOCATORS,
        components: {
            source: {provider: "container", version: "1.0.0", revision, path: "/app"},
            product: {provider: "container", version: "1.0.0", revision, image: "ghcr.io/notnotype/neuro-book:v1", digest},
            manager: {provider: "managed", version: "0.1.0", path: ".runtime/manager/0.1.0/neuro-book.mjs", bundleSha256: "c".repeat(64)},
            managerRuntime: {provider: "managed", version: "1.3.0", path: ".runtime/bun/1.3.0/bun", executableSha256: "d".repeat(64), archiveSha256: "e".repeat(64), sourceUrl: "https://example.com/bun", license: "MIT", redistribution: "test"},
            applicationRuntime: {provider: "container", version: "1.0.0"},
            tools: {rg: {provider: "container", version: "1.0.0"}, git: {provider: "container", version: "1.0.0"}, python: {provider: "container", version: "1.0.0"}},
        },
        installedAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
    };
}
