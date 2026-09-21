/** Product 平台与宿主归一化的无宿主合同。 */
export const PRODUCT_PLATFORMS = [
    "windows-x64",
    "linux-x64-glibc",
    "linux-aarch64-glibc",
    "darwin-x64",
    "darwin-aarch64",
] as const;

export type ProductPlatform = typeof PRODUCT_PLATFORMS[number];

export const PRODUCT_ASSET_NAMES = {
    "windows-x64": "inkwell-product-windows-x64.zip",
    "linux-x64-glibc": "inkwell-product-linux-x64-glibc.tar.gz",
    "linux-aarch64-glibc": "inkwell-product-linux-aarch64-glibc.tar.gz",
    "darwin-x64": "inkwell-product-darwin-x64.tar.gz",
    "darwin-aarch64": "inkwell-product-darwin-aarch64.tar.gz",
} as const satisfies Record<ProductPlatform, string>;

export type HostOperatingSystem = "windows" | "linux" | "macos";
export type HostArchitecture = "x64" | "arm64";

export type HostPlatform = {
    os: HostOperatingSystem;
    nativeArch: HostArchitecture;
    processArch: HostArchitecture;
    productPlatform: ProductPlatform;
    libc: "glibc" | null;
};

export type PlatformRuntime = {
    platform: NodeJS.Platform;
    processArch: NodeJS.Architecture;
    nativeMachine: string;
    /** Linux检测到glibc时非空；其他宿主不使用。 */
    glibcVersion?: string;
};

/** 将Node/Bun与操作系统报告的架构名收敛为Manager领域值。 */
export function normalizeArchitecture(value: string, source: string): HostArchitecture {
    const normalized = value.toLocaleLowerCase("en-US");
    if (["x64", "x86_64", "amd64"].includes(normalized)) return "x64";
    if (["arm64", "aarch64"].includes(normalized)) return "arm64";
    throw new Error(`${source}只支持x64/ARM64，检测到：${value}`);
}

/** 将Node平台名收敛为Manager领域值。 */
export function normalizeOperatingSystem(platform: NodeJS.Platform): HostOperatingSystem {
    if (platform === "win32") return "windows";
    if (platform === "linux") return "linux";
    if (platform === "darwin") return "macos";
    throw new Error(`Manager只支持Windows/Linux/macOS，检测到：${platform}`);
}

/** 根据归一化的原生宿主生成唯一 Product 平台。 */
export function resolveProductPlatform(
    os: HostOperatingSystem,
    nativeArch: HostArchitecture,
    glibcVersion?: string,
): ProductPlatform {
    if (os === "windows") {
        if (nativeArch !== "x64") throw new Error(`Windows只支持原生x64，检测到：${nativeArch}`);
        return "windows-x64";
    }
    if (os === "linux") {
        if (!glibcVersion) throw new Error("Manager只支持Linux glibc，不支持musl或未知libc。");
        return nativeArch === "x64" ? "linux-x64-glibc" : "linux-aarch64-glibc";
    }
    return nativeArch === "x64" ? "darwin-x64" : "darwin-aarch64";
}

/** 纯平台归一化入口；不读取宿主状态、不访问文件系统。 */
export function productPlatform(runtime: {
    platform: NodeJS.Platform;
    arch: NodeJS.Architecture;
    glibcVersion?: string;
}): ProductPlatform {
    return resolveProductPlatform(
        normalizeOperatingSystem(runtime.platform),
        normalizeArchitecture(runtime.arch, "Manager进程"),
        runtime.glibcVersion,
    );
}
