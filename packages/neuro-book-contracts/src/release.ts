import {valid} from "semver";
import {Type} from "typebox";
import type {Static, TSchema} from "typebox";
import {Value} from "typebox/value";
import {PRODUCT_ASSET_NAMES, PRODUCT_PLATFORMS, type ProductPlatform} from "./platform";

const SHA256_PATTERN = "^[a-fA-F0-9]{64}$";
const REVISION_PATTERN = "^[a-f0-9]{40}$";
const RUNTIME_IMAGE_DIGEST_PATTERN = "^sha256:[a-fA-F0-9]{64}$";

const ReleaseChannelSchema = Type.Union([Type.Literal("stable"), Type.Literal("canary")]);
const ProductPlatformSchema = Type.Union(PRODUCT_PLATFORMS.map((platform) => Type.Literal(platform)));
const RevisionSchema = Type.String({pattern: REVISION_PATTERN});
const ChecksumSchema = Type.String({pattern: SHA256_PATTERN});
const RuntimeImageDigestSchema = Type.String({pattern: RUNTIME_IMAGE_DIGEST_PATTERN});
const ProductRuntimeImageIdentitySchema = {
    imageId: RuntimeImageDigestSchema,
    sourceDigest: RuntimeImageDigestSchema,
    lockfileSha256: RuntimeImageDigestSchema,
    builderContractVersion: Type.String({minLength: 1}),
};

const ReleaseAssetSchema = Type.Object({
    url: Type.String({minLength: 1}),
    sha256: ChecksumSchema,
    bytes: Type.Integer({minimum: 0}),
}, {additionalProperties: false});

const ProductReleaseAssetSchema = Type.Object({
    url: Type.String({minLength: 1}),
    sha256: ChecksumSchema,
    bytes: Type.Integer({minimum: 0}),
    platform: ProductPlatformSchema,
    sourceRevision: RevisionSchema,
    ...ProductRuntimeImageIdentitySchema,
}, {additionalProperties: false});

const ReleaseImageSchema = Type.Object({
    ref: Type.String({minLength: 1}),
    digest: RuntimeImageDigestSchema,
    sourceRevision: RevisionSchema,
}, {additionalProperties: false});

export const ReleaseStateMigrationSchema = Type.Object({
    policy: Type.Union([Type.Literal("none"), Type.Literal("automatic"), Type.Literal("manual")]),
    steps: Type.Array(Type.String({pattern: "^[a-z0-9]+(?:-[a-z0-9]+)*$"})),
    guide: Type.Optional(Type.String({minLength: 1})),
}, {additionalProperties: false});

export const ReleaseManifestSchema = Type.Object({
    schemaVersion: Type.Literal(5),
    buildId: RuntimeImageDigestSchema,
    version: Type.String({minLength: 1}),
    channel: ReleaseChannelSchema,
    sourceRevision: RevisionSchema,
    minManagerVersion: Type.String({minLength: 1}),
    source: ReleaseAssetSchema,
    products: Type.Array(ProductReleaseAssetSchema, {minItems: 1}),
    windowsPortable: ReleaseAssetSchema,
    ghcr: ReleaseImageSchema,
    stateMigration: ReleaseStateMigrationSchema,
}, {additionalProperties: false});

const ReleaseManifestEnvelopeSchema = Type.Object({
    schemaVersion: Type.Integer({minimum: 1}),
    minManagerVersion: Type.String({minLength: 1}),
}, {additionalProperties: true});

type ReleaseChannel = "stable" | "canary";
export type ReleaseAsset = {
    url: string;
    sha256: string;
    bytes: number;
};
export type ProductReleaseAsset = ReleaseAsset & {
    platform: ProductPlatform;
    sourceRevision: string;
    imageId: string;
    sourceDigest: string;
    lockfileSha256: string;
    builderContractVersion: string;
};
export type ReleaseImage = {
    ref: string;
    digest: string;
    sourceRevision: string;
};
export type ReleaseStateMigration = {
    policy: "none" | "automatic" | "manual";
    steps: string[];
    guide?: string;
};
export type ReleaseManifest = {
    schemaVersion: 5;
    buildId: string;
    version: string;
    channel: ReleaseChannel;
    sourceRevision: string;
    minManagerVersion: string;
    source: ReleaseAsset;
    products: ProductReleaseAsset[];
    windowsPortable: ReleaseAsset;
    ghcr: ReleaseImage;
    stateMigration: ReleaseStateMigration;
};
export type ReleaseManifestValue = Static<typeof ReleaseManifestSchema>;

/** 在严格解析前读取稳定 Release envelope，用于优先提示 Manager 升级。 */
export function parseReleaseManifestEnvelope(value: unknown): {schemaVersion: number; minManagerVersion: string} {
    assertSchema(ReleaseManifestEnvelopeSchema, value, "release-manifest.json缺少有效的schemaVersion/minManagerVersion envelope。");
    const envelope = value as {schemaVersion: number; minManagerVersion: string};
    assertSemVer(envelope.minManagerVersion, "minManagerVersion");
    return {schemaVersion: envelope.schemaVersion, minManagerVersion: envelope.minManagerVersion};
}

/** 严格解析并执行 Release revision/platform 语义校验。 */
export function parseReleaseManifest(value: unknown): ReleaseManifest {
    assertSchema(ReleaseManifestSchema, value, "release-manifest.json 不符合 NeuroBook Release schema v5。");
    const manifest = value as ReleaseManifest;
    assertSemVer(manifest.version, "version");
    assertSemVer(manifest.minManagerVersion, "minManagerVersion");
    const platforms = new Set<string>();
    for (const product of manifest.products) {
        if (product.sourceRevision !== manifest.sourceRevision) {
            throw new Error(`Product ${product.platform} sourceRevision 与 Release Source 不一致。`);
        }
        if (platforms.has(product.platform)) {
            throw new Error(`Release Manifest 包含重复 Product 平台：${product.platform}`);
        }
        let filename: string;
        try {
            filename = new URL(product.url).pathname.split("/").at(-1) ?? "";
        } catch {
            throw new Error(`Product ${product.platform} URL非法：${product.url}`);
        }
        if (filename !== PRODUCT_ASSET_NAMES[product.platform]) {
            throw new Error(`Product ${product.platform}资产名非法：${filename}`);
        }
        platforms.add(product.platform);
    }
    const missingPlatforms = PRODUCT_PLATFORMS.filter((platform) => !platforms.has(platform));
    if (missingPlatforms.length > 0 || platforms.size !== PRODUCT_PLATFORMS.length) {
        throw new Error(`Release Manifest必须完整包含五个平台，缺少：${missingPlatforms.join(", ") || "<unknown>"}`);
    }
    if (manifest.ghcr.sourceRevision !== manifest.sourceRevision) {
        throw new Error("GHCR sourceRevision 与 Release Source 不一致。");
    }
    if (!manifest.ghcr.ref.endsWith(`@${manifest.ghcr.digest}`)) {
        throw new Error("GHCR ref 必须使用 Release Manifest 声明的不可变 digest。");
    }
    assertReleaseStateMigrationSemantics(manifest.stateMigration);
    return manifest;
}

/** 独立校验仓库级 Release state migration 声明，供资产构建器 fail-fast 使用。 */
export function parseReleaseStateMigration(value: unknown): ReleaseStateMigration {
    assertSchema(ReleaseStateMigrationSchema, value, "Release state migration 声明不符合 schema。");
    const declaration = value as ReleaseStateMigration;
    assertReleaseStateMigrationSemantics(declaration);
    return declaration;
}

function assertReleaseStateMigrationSemantics(stateMigration: ReleaseStateMigration): void {
    if (stateMigration.policy === "none" && stateMigration.steps.length > 0) {
        throw new Error("stateMigration.policy=none 时 steps 必须为空。");
    }
    if (stateMigration.policy === "automatic" && stateMigration.steps.length === 0) {
        throw new Error("stateMigration.policy=automatic 时必须声明至少一个 step。");
    }
    if (stateMigration.policy === "automatic" && new Set(stateMigration.steps).size !== stateMigration.steps.length) {
        throw new Error("stateMigration.steps不能包含重复step。");
    }
    if (stateMigration.policy === "manual" && !stateMigration.guide) {
        throw new Error("stateMigration.policy=manual 时必须提供 guide。");
    }
}

function assertSemVer(version: string, field: string): void {
    if (!valid(version)) throw new Error(`${field} 不是合法 SemVer：${version}`);
}
function assertSchema(schema: TSchema, value: unknown, message: string): void {
    if (!Value.Check(schema, value)) throw new Error(message);
}
