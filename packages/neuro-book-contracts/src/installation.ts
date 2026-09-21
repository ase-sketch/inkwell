import * as yaml from "yaml";
import {valid} from "semver";
import {Type} from "typebox";
import type {TSchema} from "typebox";
import {Value} from "typebox/value";

import {PRODUCT_PLATFORMS, type ProductPlatform} from "./platform";

const SHA256_PATTERN = "^[a-fA-F0-9]{64}$";
const REVISION_PATTERN = "^[a-f0-9]{40}$";
const ISO_DATE_PATTERN = "^\\d{4}-\\d{2}-\\d{2}T\\d{2}:\\d{2}:\\d{2}(?:\\.\\d{3})?Z$";
const RUNTIME_IMAGE_DIGEST_PATTERN = "^sha256:[a-fA-F0-9]{64}$";

export type InstallProfile =
    | "source-dev"
    | "source-product"
    | "product-bun"
    | "windows-portable"
    | "source-docker"
    | "ghcr";
export type ReleaseChannel = "stable" | "canary";
export type ContainerEngine = "docker" | "podman";
export type RootLocatorBase = "installation-root" | "local-app-data" | "user-app-data" | "user-cache";
export type RootLocator = {base: RootLocatorBase; path: string};
export type InstallationRootLocators = {
    state: RootLocator;
    cache: RootLocator;
    desktop: RootLocator;
    webview: RootLocator;
};
export type ManagedAssetMetadata = {
    archiveSha256: string;
    sourceUrl: string;
    license: string;
    redistribution: string;
};
export type ProductRuntimeImageIdentity = {
    imageId: string;
    sourceDigest: string;
    lockfileSha256: string;
    builderContractVersion: string;
};
export type SourceComponent =
    | {provider: "git"; version: string; revision: string; path: "."; repository: string; branch: string}
    | ({provider: "release"; buildId: string; version: string; revision: string; path: "."; files: string[]} & ManagedAssetMetadata)
    | {provider: "container"; version: string; revision: string; path: "/app"};
export type ProductComponent =
    | ({provider: "git"; version: string; revision: string; path: ".output"; platform: ProductPlatform} & ProductRuntimeImageIdentity)
    | ({provider: "release"; buildId: string; version: string; revision: string; path: ".output"; platform: ProductPlatform} & ManagedAssetMetadata & ProductRuntimeImageIdentity)
    | {
        provider: "container";
        version: string;
        revision: string;
        image: string;
        digest?: string;
        containerImageId?: string;
        imageId?: string;
        sourceDigest?: string;
        lockfileSha256?: string;
        builderContractVersion?: string;
    };
export type ManagerComponent = {provider: "managed"; version: string; path: string; bundleSha256: string};
export type SystemRuntimeComponent = {provider: "system"; version: string; executable: string};
export type ManagedRuntimeComponent = {provider: "managed"; version: string; path: string; executableSha256: string} & ManagedAssetMetadata;
export type ManagerRuntimeComponent = SystemRuntimeComponent | ManagedRuntimeComponent;
export type ApplicationRuntimeComponent = ManagerRuntimeComponent | {provider: "container"; version: string};
export type SystemToolComponent = {provider: "system"; version: string; executable: string};
export type ManagedToolComponent = {provider: "managed"; version: string; path: string; executableSha256: string} & ManagedAssetMetadata;
export type ManagedGitToolComponent = Omit<ManagedToolComponent, "executableSha256"> & {
    distribution: "PortableGit";
    bashPath: string;
    gitSha256: string;
    bashSha256: string;
};
export type ContainerToolComponent = {provider: "container"; version: string};
export type ToolComponents = {
    rg?: SystemToolComponent | ManagedToolComponent | ContainerToolComponent;
    git?: SystemToolComponent | ManagedGitToolComponent | ContainerToolComponent;
    python?: SystemToolComponent | ContainerToolComponent;
};
export type InstallationComponents = {
    source: SourceComponent;
    product?: ProductComponent;
    manager: ManagerComponent;
    managerRuntime: ManagerRuntimeComponent;
    applicationRuntime: ApplicationRuntimeComponent;
    tools: ToolComponents;
};
export type InstallationManifest = {
    schemaVersion: 5;
    profile: InstallProfile;
    containerEngine: ContainerEngine | null;
    managerVersion: string;
    appVersion: string;
    channel: ReleaseChannel;
    sourceRevision: string;
    roots: InstallationRootLocators;
    components: InstallationComponents;
    installedAt: string;
    updatedAt: string;
};

const InstallProfileSchema = Type.Union([
    Type.Literal("source-dev"),
    Type.Literal("source-product"),
    Type.Literal("product-bun"),
    Type.Literal("windows-portable"),
    Type.Literal("source-docker"),
    Type.Literal("ghcr"),
]);
const ReleaseChannelSchema = Type.Union([Type.Literal("stable"), Type.Literal("canary")]);
const ContainerEngineSchema = Type.Union([Type.Literal("docker"), Type.Literal("podman")]);
const ProductPlatformSchema = Type.Union(PRODUCT_PLATFORMS.map((platform) => Type.Literal(platform)));
const RootLocatorSchema = Type.Object({
    base: Type.Union([
        Type.Literal("installation-root"),
        Type.Literal("local-app-data"),
        Type.Literal("user-app-data"),
        Type.Literal("user-cache"),
    ]),
    path: Type.String({minLength: 1}),
}, {additionalProperties: false});
export const InstallationRootLocatorsSchema = Type.Object({
    state: RootLocatorSchema,
    cache: RootLocatorSchema,
    desktop: RootLocatorSchema,
    webview: RootLocatorSchema,
}, {additionalProperties: false});
const RevisionSchema = Type.String({pattern: REVISION_PATTERN});
const ChecksumSchema = Type.String({pattern: SHA256_PATTERN});
const RuntimeImageDigestSchema = Type.String({pattern: RUNTIME_IMAGE_DIGEST_PATTERN});
const RelativePathSchema = Type.String({minLength: 1});
const ProductRuntimeImageIdentitySchema = {
    imageId: RuntimeImageDigestSchema,
    sourceDigest: RuntimeImageDigestSchema,
    lockfileSha256: RuntimeImageDigestSchema,
    builderContractVersion: Type.String({minLength: 1}),
};
const GitSourceSchema = Type.Object({
    provider: Type.Literal("git"),
    version: Type.String({minLength: 1}),
    revision: RevisionSchema,
    path: Type.Literal("."),
    repository: Type.String({minLength: 1}),
    branch: Type.String({minLength: 1}),
}, {additionalProperties: false});
const ReleaseSourceSchema = Type.Object({
    provider: Type.Literal("release"),
    buildId: RuntimeImageDigestSchema,
    version: Type.String({minLength: 1}),
    revision: RevisionSchema,
    path: Type.Literal("."),
    files: Type.Array(RelativePathSchema),
    archiveSha256: ChecksumSchema,
    sourceUrl: Type.String({minLength: 1}),
    license: Type.String({minLength: 1}),
    redistribution: Type.String({minLength: 1}),
}, {additionalProperties: false});
const ContainerSourceSchema = Type.Object({
    provider: Type.Literal("container"),
    version: Type.String({minLength: 1}),
    revision: RevisionSchema,
    path: Type.Literal("/app"),
}, {additionalProperties: false});
const SourceSchema = Type.Union([GitSourceSchema, ReleaseSourceSchema, ContainerSourceSchema]);
const GitProductSchema = Type.Object({
    provider: Type.Literal("git"),
    version: Type.String({minLength: 1}),
    revision: RevisionSchema,
    path: Type.Literal(".output"),
    platform: ProductPlatformSchema,
    ...ProductRuntimeImageIdentitySchema,
}, {additionalProperties: false});
const ReleaseProductSchema = Type.Object({
    provider: Type.Literal("release"),
    buildId: RuntimeImageDigestSchema,
    version: Type.String({minLength: 1}),
    revision: RevisionSchema,
    path: Type.Literal(".output"),
    platform: ProductPlatformSchema,
    archiveSha256: ChecksumSchema,
    sourceUrl: Type.String({minLength: 1}),
    license: Type.String({minLength: 1}),
    redistribution: Type.String({minLength: 1}),
    ...ProductRuntimeImageIdentitySchema,
}, {additionalProperties: false});
const ContainerProductSchema = Type.Object({
    provider: Type.Literal("container"),
    version: Type.String({minLength: 1}),
    revision: RevisionSchema,
    image: Type.String({minLength: 1}),
    digest: Type.Optional(Type.String({pattern: RUNTIME_IMAGE_DIGEST_PATTERN})),
    containerImageId: Type.Optional(Type.String({pattern: RUNTIME_IMAGE_DIGEST_PATTERN})),
    imageId: Type.Optional(RuntimeImageDigestSchema),
    sourceDigest: Type.Optional(RuntimeImageDigestSchema),
    lockfileSha256: Type.Optional(RuntimeImageDigestSchema),
    builderContractVersion: Type.Optional(Type.String({minLength: 1})),
}, {additionalProperties: false});
const ProductSchema = Type.Union([GitProductSchema, ReleaseProductSchema, ContainerProductSchema]);
const ManagerSchema = Type.Object({
    provider: Type.Literal("managed"),
    version: Type.String({minLength: 1}),
    path: RelativePathSchema,
    bundleSha256: ChecksumSchema,
}, {additionalProperties: false});
const SystemRuntimeSchema = Type.Object({
    provider: Type.Literal("system"),
    version: Type.String({minLength: 1}),
    executable: Type.String({minLength: 1}),
}, {additionalProperties: false});
const ManagedRuntimeSchema = Type.Object({
    provider: Type.Literal("managed"),
    version: Type.String({minLength: 1}),
    path: RelativePathSchema,
    archiveSha256: ChecksumSchema,
    executableSha256: ChecksumSchema,
    sourceUrl: Type.String({minLength: 1}),
    license: Type.String({minLength: 1}),
    redistribution: Type.String({minLength: 1}),
}, {additionalProperties: false});
const ManagerRuntimeSchema = Type.Union([SystemRuntimeSchema, ManagedRuntimeSchema]);
const ApplicationRuntimeSchema = Type.Union([
    SystemRuntimeSchema,
    ManagedRuntimeSchema,
    Type.Object({provider: Type.Literal("container"), version: Type.String({minLength: 1})}, {additionalProperties: false}),
]);
const SystemToolSchema = SystemRuntimeSchema;
const ManagedToolSchema = ManagedRuntimeSchema;
const ManagedGitToolSchema = Type.Object({
    provider: Type.Literal("managed"),
    version: Type.String({minLength: 1}),
    path: RelativePathSchema,
    bashPath: RelativePathSchema,
    distribution: Type.Literal("PortableGit"),
    archiveSha256: ChecksumSchema,
    gitSha256: ChecksumSchema,
    bashSha256: ChecksumSchema,
    sourceUrl: Type.String({minLength: 1}),
    license: Type.String({minLength: 1}),
    redistribution: Type.String({minLength: 1}),
}, {additionalProperties: false});
const ContainerToolSchema = Type.Object({provider: Type.Literal("container"), version: Type.String({minLength: 1})}, {additionalProperties: false});
const ToolComponentsSchema = Type.Object({
    rg: Type.Optional(Type.Union([SystemToolSchema, ManagedToolSchema, ContainerToolSchema])),
    git: Type.Optional(Type.Union([SystemToolSchema, ManagedGitToolSchema, ContainerToolSchema])),
    python: Type.Optional(Type.Union([SystemToolSchema, ContainerToolSchema])),
}, {additionalProperties: false});

export const InstallationManifestSchema = Type.Object({
    schemaVersion: Type.Literal(5),
    profile: InstallProfileSchema,
    containerEngine: Type.Union([ContainerEngineSchema, Type.Null()]),
    managerVersion: Type.String({minLength: 1}),
    appVersion: Type.String({minLength: 1}),
    channel: ReleaseChannelSchema,
    sourceRevision: RevisionSchema,
    roots: InstallationRootLocatorsSchema,
    components: Type.Object({
        source: SourceSchema,
        product: Type.Optional(ProductSchema),
        manager: ManagerSchema,
        managerRuntime: ManagerRuntimeSchema,
        applicationRuntime: ApplicationRuntimeSchema,
        tools: ToolComponentsSchema,
    }, {additionalProperties: false}),
    installedAt: Type.String({pattern: ISO_DATE_PATTERN}),
    updatedAt: Type.String({pattern: ISO_DATE_PATTERN}),
}, {additionalProperties: false});

export const PORTABLE_ROOT_LOCATORS: InstallationRootLocators = {
    state: {base: "installation-root", path: "data"},
    cache: {base: "installation-root", path: ".cache"},
    desktop: {base: "installation-root", path: "data/.desktop"},
    webview: {base: "installation-root", path: "data/.desktop/webview"},
};
export const INSTALLED_WINDOWS_ROOT_LOCATORS: InstallationRootLocators = {
    state: {base: "local-app-data", path: "Inkwell/data"},
    cache: {base: "local-app-data", path: "Inkwell/cache"},
    desktop: {base: "local-app-data", path: "Inkwell/desktop"},
    webview: {base: "local-app-data", path: "Inkwell/desktop/webview"},
};
export const INSTALLED_MACOS_ROOT_LOCATORS: InstallationRootLocators = {
    state: {base: "user-app-data", path: "Inkwell/data"},
    cache: {base: "user-cache", path: "Inkwell"},
    desktop: {base: "user-app-data", path: "Inkwell/desktop"},
    webview: {base: "user-app-data", path: "Inkwell/desktop/webview"},
};
export const INSTALLATION_SCOPED_ROOT_LOCATORS: InstallationRootLocators = {
    state: {base: "installation-root", path: "data"},
    cache: {base: "installation-root", path: ".cache"},
    desktop: {base: "installation-root", path: ".desktop"},
    webview: {base: "installation-root", path: ".desktop/webview"},
};

/** 严格解析并执行 Profile/组件语义校验。 */
export function parseInstallationManifest(value: unknown): InstallationManifest {
    assertSchema(
        InstallationManifestSchema,
        value,
        "installation.json 不符合 NeuroBook Manager schema v5；旧版安装必须重新安装，Windows Portable 只复用完整 data/。",
    );
    const manifest = value as InstallationManifest;
    assertSemVer(manifest.managerVersion, "managerVersion");
    assertSemVer(manifest.appVersion, "appVersion");
    assertInstallationSemantics(manifest);
    assertComponentPaths(manifest);
    return manifest;
}

export function assertSafeRelativePath(path: string): void {
    const normalized = path.replaceAll("\\", "/");
    if (!normalized || normalized === "." || normalized.startsWith("/") || /^[A-Za-z]:\//u.test(normalized) || normalized.startsWith("//")) {
        throw new Error(`Installation Root 相对路径非法：${path}`);
    }
    if (normalized.split("/").some((part) => part === "" || part === "." || part === "..")) {
        throw new Error(`Installation Root 相对路径非法：${path}`);
    }
}

export function rootLocatorsEqual(left: InstallationRootLocators, right: InstallationRootLocators): boolean {
    return (Object.keys(left) as Array<keyof InstallationRootLocators>).every((key) => (
        left[key].base === right[key].base && left[key].path === right[key].path
    ));
}

function assertInstallationSemantics(manifest: InstallationManifest): void {
    const {source, product, applicationRuntime, tools} = manifest.components;
    if (source.revision !== manifest.sourceRevision || product && product.revision !== manifest.sourceRevision) {
        throw new Error("Installation Source/Product revision 与 sourceRevision 不一致。");
    }
    assertRootLocatorsSemantics(manifest.profile, manifest.roots);
    const expected = profileContract(manifest.profile);
    const containerProfile = manifest.profile === "ghcr" || manifest.profile === "source-docker";
    if (containerProfile !== (manifest.containerEngine !== null)) {
        throw new Error(`Profile ${manifest.profile}的Container Engine记录非法。`);
    }
    if (source.provider !== expected.source || (product?.provider ?? "none") !== expected.product || !expected.runtimes.includes(applicationRuntime.provider)) {
        throw new Error(`Profile ${manifest.profile} 的 Source/Product/Application Runtime 组件组合非法。`);
    }
    if (manifest.profile === "windows-portable") {
        if (tools.rg?.provider !== "managed" || tools.git?.provider !== "managed" || !("bashPath" in tools.git)) {
            throw new Error("Windows Portable 必须包含 managed rg 和提供 bash 的 PortableGit。" );
        }
    }
    if (manifest.profile === "ghcr" || manifest.profile === "source-docker") {
        if (tools.rg?.provider !== "container" || tools.git?.provider !== "container" || tools.python?.provider !== "container") {
            throw new Error(`${manifest.profile} 的应用工具必须由 container provider 提供。`);
        }
    }
    if (manifest.profile === "ghcr" && (!product || product.provider !== "container" || !product.digest)) {
        throw new Error("GHCR Product 必须记录不可变 image digest。");
    }
    if (manifest.profile === "ghcr" && product?.provider === "container" && product.containerImageId) {
        throw new Error("GHCR Product 使用 OCI digest，不记录本地 Container Engine image ID。");
    }
    if (manifest.profile === "source-docker" && product?.provider === "container" && product.digest) {
        throw new Error("Source Docker 使用本地 revision image，不记录 GHCR digest。");
    }
    if (manifest.profile === "source-docker" && product?.provider === "container" && !product.containerImageId) {
        throw new Error("Source Docker Product 必须记录本次 build 的 Container Engine image ID。");
    }
    if (manifest.profile === "source-docker" && product?.provider === "container"
        && (product.imageId || product.sourceDigest || product.lockfileSha256 || product.builderContractVersion)) {
        throw new Error("Source Docker 使用本地 revision image，不伪造 Builder Runtime Image identity。");
    }
}

function profileContract(profile: InstallProfile): {source: string; product: string; runtimes: string[]} {
    switch (profile) {
        case "source-dev": return {source: "git", product: "none", runtimes: ["system", "managed"]};
        case "source-product": return {source: "git", product: "git", runtimes: ["system", "managed"]};
        case "product-bun": return {source: "release", product: "release", runtimes: ["system", "managed"]};
        case "windows-portable": return {source: "release", product: "release", runtimes: ["managed"]};
        case "source-docker": return {source: "git", product: "container", runtimes: ["container"]};
        case "ghcr": return {source: "container", product: "container", runtimes: ["container"]};
    }
}

function assertComponentPaths(manifest: InstallationManifest): void {
    for (const path of componentPaths(manifest)) assertSafeRelativePath(path);
}

function componentPaths(manifest: InstallationManifest): string[] {
    return [
        manifest.components.manager.path,
        manifest.components.managerRuntime.provider === "managed" ? manifest.components.managerRuntime.path : null,
        manifest.components.applicationRuntime.provider === "managed" ? manifest.components.applicationRuntime.path : null,
        manifest.components.tools.rg?.provider === "managed" ? manifest.components.tools.rg.path : null,
        manifest.components.tools.git?.provider === "managed" ? manifest.components.tools.git.path : null,
        manifest.components.tools.git?.provider === "managed" ? manifest.components.tools.git.bashPath : null,
        manifest.components.product && manifest.components.product.provider !== "container" ? manifest.components.product.path : null,
        ...Object.values(manifest.roots).filter((locator) => locator.base === "installation-root").map((locator) => locator.path),
        manifest.profile === "ghcr" || manifest.profile === "source-docker" ? ".deploy/docker-compose.generated.yml" : null,
        ".runtime/bin",
        ...(manifest.components.source.provider === "release" ? manifest.components.source.files : []),
    ].filter((path): path is string => Boolean(path)).map((path) => path.replaceAll("\\", "/"));
}

function assertRootLocatorsSemantics(profile: InstallProfile, roots: InstallationRootLocators): void {
    for (const [name, locator] of Object.entries(roots)) {
        try {
            assertSafeRelativePath(locator.path);
        } catch {
            throw new Error(`${name} locator path 非法：${locator.path}`);
        }
    }
    if (profile === "windows-portable") {
        if (!rootLocatorsEqual(roots, PORTABLE_ROOT_LOCATORS)) throw new Error("Windows Portable 的 Root Locator 布局非法。");
        return;
    }
    const installedWindows = rootLocatorsEqual(roots, INSTALLED_WINDOWS_ROOT_LOCATORS);
    const installedMacos = rootLocatorsEqual(roots, INSTALLED_MACOS_ROOT_LOCATORS);
    const installationScoped = rootLocatorsEqual(roots, INSTALLATION_SCOPED_ROOT_LOCATORS);
    if (profile === "product-bun" ? !installedWindows && !installedMacos && !installationScoped : !installationScoped) {
        throw new Error(`Profile ${profile} 的 Root Locator 布局非法。`);
    }
}

function assertSemVer(version: string, field: string): void {
    if (!valid(version)) throw new Error(`${field} 不是合法 SemVer：${version}`);
}

function assertSchema(schema: TSchema, value: unknown, message: string): void {
    if (!Value.Check(schema, value)) throw new Error(message);
}

export type BootConfig = {
    auth?: {enabled?: boolean};
    server?: {host?: string; port?: number};
    database?: {kind?: string; url?: string};
};

/** 解析显式 Boot Config 文本；不读取文件、cwd 或用户目录。 */
export function parseBootConfigText(text: string, environment: NodeJS.ProcessEnv = process.env): BootConfig {
    const parsed = yaml.parse(expandEnvTemplate(text, environment)) as unknown;
    if (parsed === null || parsed === undefined) return {};
    if (!isRecord(parsed)) throw new Error("config.yaml 顶层必须是对象。");
    validateAuthConfig(parsed.auth);
    return parsed as BootConfig;
}

function expandEnvTemplate(text: string, environment: NodeJS.ProcessEnv): string {
    return text.replace(/\$\{([A-Za-z_][A-Za-z0-9_]*)(:-([^}]*))?\}/g, (_match, name: string, _defaultPart: string | undefined, defaultValue: string | undefined) => {
        const value = environment[name];
        return value !== undefined ? value : defaultValue ?? "";
    });
}

function validateAuthConfig(input: unknown): void {
    if (input === undefined) return;
    if (!isRecord(input)) throw new Error("config.yaml auth 必须是对象。");
    if (input.enabled !== undefined && typeof input.enabled !== "boolean") throw new Error("config.yaml auth.enabled 必须是 boolean。");
}

function isRecord(input: unknown): input is Record<string, unknown> {
    return typeof input === "object" && input !== null && !Array.isArray(input);
}
