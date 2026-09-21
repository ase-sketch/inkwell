import {machine} from "node:os";

import {
    normalizeArchitecture,
    normalizeOperatingSystem,
    resolveProductPlatform,
    type HostPlatform,
    type PlatformRuntime,
    type ProductPlatform,
} from "@notnotype/neuro-book-contracts/platform";
import type {InstallProfile, InstallationManifest} from "@notnotype/neuro-book-contracts/installation";

const ALL_PROFILES = [
    "source-dev",
    "source-product",
    "product-bun",
    "windows-portable",
    "source-docker",
    "ghcr",
] as const satisfies readonly InstallProfile[];

const POSIX_PROFILES = ALL_PROFILES.filter((profile) => profile !== "windows-portable");

const PLATFORM_PROFILES = {
    "windows-x64": ALL_PROFILES,
    "linux-x64-glibc": POSIX_PROFILES,
    "linux-aarch64-glibc": POSIX_PROFILES,
    "darwin-x64": POSIX_PROFILES,
    "darwin-aarch64": POSIX_PROFILES,
} as const satisfies Record<ProductPlatform, readonly InstallProfile[]>;

/** 检查宿主原生架构、Manager进程架构与Product平台。 */
export function inspectHostPlatform(runtime: PlatformRuntime = currentPlatformRuntime()): HostPlatform {
    const os = normalizeOperatingSystem(runtime.platform);
    const nativeArch = normalizeArchitecture(runtime.nativeMachine, `${os}宿主`);
    const processArch = normalizeArchitecture(runtime.processArch, "Manager进程");
    return {
        os,
        nativeArch,
        processArch,
        productPlatform: resolveProductPlatform(os, nativeArch, runtime.glibcVersion),
        libc: os === "linux" ? "glibc" : null,
    };
}

/** 收集当前进程的原始宿主报告；测试通过 inspectHostPlatform 参数注入。 */
function currentPlatformRuntime(): PlatformRuntime {
    const report = process.platform === "linux"
        ? process.report?.getReport() as {header?: {glibcVersionRuntime?: string}} | undefined
        : undefined;
    return {
        platform: process.platform,
        processArch: process.arch,
        nativeMachine: machine(),
        glibcVersion: report?.header?.glibcVersionRuntime,
    };
}

/** 返回当前宿主的 Product 平台。 */
export function currentProductPlatform(): ProductPlatform {
    const host = inspectHostPlatform();
    assertManagerPlatform(host);
    return host.productPlatform;
}

/** 校验 Manager 宿主平台。 */
export function assertManagerPlatform(host = inspectHostPlatform()): void {
    if (host.nativeArch !== host.processArch) {
        throw new Error(
            `Manager必须使用宿主原生架构的Bun：宿主为${host.nativeArch}，当前进程为${host.processArch}。请安装原生Bun后重试。`,
        );
    }
}

/** 返回指定平台正式支持的 Profile。 */
export function supportedProfiles(platform = currentProductPlatform()): readonly InstallProfile[] {
    return PLATFORM_PROFILES[platform];
}

/** 校验当前平台是否支持指定 Profile。 */
export function assertProfileSupported(profile: InstallProfile, host = inspectHostPlatform()): void {
    assertManagerPlatform(host);
    if (!supportedProfiles(host.productPlatform).includes(profile)) {
        throw new Error(`${host.productPlatform}不支持${profile} Profile。`);
    }
}

/**
 * 校验 Installation Manifest 能否由当前原生宿主运行。
 * 容器 Product 由 Container Engine 选择镜像平台；其他 Product 必须与宿主 Product 平台完全一致。
 */
export function assertInstallationHostCompatible(manifest: InstallationManifest, host = inspectHostPlatform()): void {
    assertProfileSupported(manifest.profile, host);
    const product = manifest.components.product;
    if (product && product.provider !== "container" && product.platform !== host.productPlatform) {
        throw new Error(
            `实例Product平台为${product.platform}，当前宿主为${host.productPlatform}。请在当前平台重新安装，并复用原State Root。`,
        );
    }
}

/** 返回平台可执行文件后缀。 */
export function executableName(name: string): string {
    return process.platform === "win32" ? `${name}.exe` : name;
}
