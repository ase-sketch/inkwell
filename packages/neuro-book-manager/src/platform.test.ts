import {describe, expect, it} from "vitest";

import {assertInstallationHostCompatible, assertManagerPlatform, inspectHostPlatform, supportedProfiles} from "#manager/platform";
import {
    PRODUCT_ASSET_NAMES,
    PRODUCT_PLATFORMS,
    productPlatform,
    type HostPlatform,
} from "@notnotype/neuro-book-contracts/platform";
import {RIPGREP_ASSET_SUFFIXES} from "#manager/tools";
import {BUN_ASSET_NAMES} from "#manager/runtime";
import type {InstallationManifest} from "@notnotype/neuro-book-contracts/installation";

describe("Manager平台矩阵", () => {
    it.each([
        [{platform: "win32", arch: "x64"}, "windows-x64"],
        [{platform: "linux", arch: "x64", glibcVersion: "2.39"}, "linux-x64-glibc"],
        [{platform: "linux", arch: "arm64", glibcVersion: "2.39"}, "linux-aarch64-glibc"],
        [{platform: "darwin", arch: "x64"}, "darwin-x64"],
        [{platform: "darwin", arch: "arm64"}, "darwin-aarch64"],
    ] as const)("解析%o为%s", (runtime, expected) => {
        expect(productPlatform(runtime)).toBe(expected);
    });

    it("明确拒绝Windows ARM64和Linux musl", () => {
        expect(() => productPlatform({platform: "win32", arch: "arm64"})).toThrow("Windows只支持原生x64");
        expect(() => productPlatform({platform: "linux", arch: "arm64"})).toThrow("glibc");
    });

    it("分别记录宿主原生架构与Manager进程架构", () => {
        const host = inspectHostPlatform({
            platform: "darwin",
            nativeMachine: "arm64",
            processArch: "x64",
        });
        expect(host).toEqual({
            os: "macos",
            nativeArch: "arm64",
            processArch: "x64",
            productPlatform: "darwin-aarch64",
            libc: null,
        });
        expect(() => assertManagerPlatform(host)).toThrow("原生架构的Bun");
    });

    it("拒绝非原生进程和不匹配的原生Product", () => {
        const host: HostPlatform = {
            os: "linux",
            nativeArch: "arm64",
            processArch: "arm64",
            productPlatform: "linux-aarch64-glibc",
            libc: "glibc",
        };
        const manifest = {
            profile: "product-bun",
            components: {
                product: {provider: "release", buildId: `sha256:${"9".repeat(64)}`, platform: "linux-x64-glibc"},
            },
        } as InstallationManifest;
        expect(() => assertInstallationHostCompatible(manifest, host)).toThrow("重新安装");
        expect(() => assertManagerPlatform({...host, processArch: "x64"})).toThrow("宿主为arm64");
    });

    it("容器Product由Container Engine选择平台", () => {
        const host: HostPlatform = {
            os: "linux",
            nativeArch: "arm64",
            processArch: "arm64",
            productPlatform: "linux-aarch64-glibc",
            libc: "glibc",
        };
        const manifest = {
            profile: "ghcr",
            components: {product: {provider: "container"}},
        } as InstallationManifest;
        expect(() => assertInstallationHostCompatible(manifest, host)).not.toThrow();
    });

    it("POSIX平台支持除Windows Portable外的全部Profile", () => {
        for (const platform of PRODUCT_PLATFORMS.filter((item) => item !== "windows-x64")) {
            expect(supportedProfiles(platform)).not.toContain("windows-portable");
            expect(supportedProfiles(platform)).toEqual(expect.arrayContaining([
                "source-dev",
                "source-product",
                "product-bun",
                "source-docker",
                "ghcr",
            ]));
        }
        expect(supportedProfiles("windows-x64")).toContain("windows-portable");
    });

    it("每个平台都有唯一公开Product资产名", () => {
        expect(Object.keys(PRODUCT_ASSET_NAMES)).toEqual(PRODUCT_PLATFORMS);
        expect(new Set(Object.values(PRODUCT_ASSET_NAMES)).size).toBe(PRODUCT_PLATFORMS.length);
    });

    it("Managed Bun和ripgrep对五个平台都有明确资产", () => {
        expect(Object.keys(BUN_ASSET_NAMES)).toEqual(PRODUCT_PLATFORMS);
        expect(Object.keys(RIPGREP_ASSET_SUFFIXES)).toEqual(PRODUCT_PLATFORMS);
        expect(BUN_ASSET_NAMES["linux-aarch64-glibc"]).toBe("bun-linux-aarch64.zip");
        expect(BUN_ASSET_NAMES["darwin-aarch64"]).toBe("bun-darwin-aarch64.zip");
        expect(RIPGREP_ASSET_SUFFIXES["darwin-x64"]).toBe("x86_64-apple-darwin.tar.gz");
    });
});
