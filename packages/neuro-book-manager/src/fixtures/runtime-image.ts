import {randomUUID} from "node:crypto";
import {mkdir, writeFile} from "node:fs/promises";
import {join} from "node:path";

import type {ProductRuntimeImageIdentity} from "@notnotype/neuro-book-contracts/installation";
import type {ProductPlatform} from "@notnotype/neuro-book-contracts/platform";
import {
    createProductRuntimeContract,
    createProductRuntimePolicy,
    hasProductRuntimeBuildPolicy,
    PRODUCT_RUNTIME_BUILDER_CONTRACT_VERSION,
    PRODUCT_RUNTIME_COMMAND_BOOTSTRAP,
    PRODUCT_RUNTIME_CONTRACT_PATH,
    PRODUCT_RUNTIME_IMAGE_MANIFEST_SCHEMA,
    PRODUCT_RUNTIME_IMAGE_READY_SCHEMA,
    productRuntimeBuildPolicy,
    productRuntimeContractSha256,
    productRuntimeManifestImageId,
    sha256ProductRuntimeText,
} from "@notnotype/neuro-book-contracts/product-runtime";
import type {
    ProductRuntimeImageManifest,
    VerifiedProductRuntimeImage,
} from "@notnotype/neuro-book-contracts/product-runtime";
import {inspectProductRuntimeImage, ProductRuntimeImageVerifier} from "#manager/product-runtime-image-verifier";

/** 与宿主无关的Verifier/归档测试固定消费已审查的最小规范平台。 */
export const TEST_RUNTIME_IMAGE_PLATFORM = "windows-x64" satisfies ProductPlatform;

/** 只有canonical policy已登记时，测试才能构造当前宿主可执行的真实镜像。 */
export function hostRuntimeImageFixtureAvailable(platform: ProductPlatform): boolean {
    return hasProductRuntimeBuildPolicy(platform);
}

/** 纯 schema/流程测试使用的合法 identity；真实镜像测试必须使用 Builder 返回值。 */
export const TEST_RUNTIME_IMAGE_IDENTITY = {
    imageId: `sha256:${"e".repeat(64)}`,
    sourceDigest: `sha256:${"f".repeat(64)}`,
    lockfileSha256: `sha256:${"9".repeat(64)}`,
    builderContractVersion: PRODUCT_RUNTIME_BUILDER_CONTRACT_VERSION,
} as const satisfies ProductRuntimeImageIdentity;

/**
 * 在最小 Git-less Source Root 中构建真实 Runtime Image v3 fixture。
 * manifest、ready marker、inventory 与所有 digest 均由 Manager verifier 复核。
 *
 * 这是测试支持代码，不把 scripts/build 的 Source builder 反向引入 Manager package；
 * 真实 Product 构建仍由 root Product builder 负责，Manager 只消费 verifier 合同。
 */
export async function buildTestRuntimeImage(input: {
    sourceRoot: string;
    version: string;
    revision: string;
    platform: ProductPlatform;
    operationId?: string;
}): Promise<VerifiedProductRuntimeImage> {
    const policy = productRuntimeBuildPolicy(input.platform);
    const operationId = input.operationId ?? `manager-fixture-${randomUUID()}`;
    const imageRoot = join(input.sourceRoot, ".deploy", "staging", operationId);
    const entry = "server/commands/all.mjs";
    const contract = createProductRuntimeContract({
        productStart: entry,
        sqliteMigrate: entry,
        applicationStateMigration: entry,
        createAdmin: entry,
        profile: entry,
        variable: entry,
        workspace: entry,
        prepareSystemAssets: entry,
        checkMigrations: entry,
        profileAuthoringSmoke: entry,
        variableAuthoringSmoke: entry,
        imageVariantSmoke: entry,
        sqliteVecSmoke: entry,
        webFetchSmoke: entry,
        worldEngineConfigSmoke: entry,
    });
    await mkdir(join(imageRoot, "server", "commands"), {recursive: true});
    const runtimeContractText = `${JSON.stringify(contract, null, 2)}\n`;
    await Promise.all([
        writeFile(join(imageRoot, "server", "index.mjs"), "export {};\n", "utf8"),
        writeFile(join(imageRoot, ...PRODUCT_RUNTIME_COMMAND_BOOTSTRAP.split("/")), "export {};\n", "utf8"),
        writeFile(join(imageRoot, ...entry.split("/")), "export {};\n", "utf8"),
        writeFile(join(imageRoot, "server", "commands", "fixture-payload.mjs"), "export const fixturePayload = true;\n", "utf8"),
        writeFile(join(imageRoot, ...PRODUCT_RUNTIME_CONTRACT_PATH.split("/")), runtimeContractText, "utf8"),
        writeFile(join(input.sourceRoot, "package.json"), `${JSON.stringify({name: "nbook-manager-runtime-image-fixture", version: input.version})}\n`, "utf8"),
        writeFile(join(input.sourceRoot, "bun.lock"), "fixture-lock\n", "utf8"),
    ]);

    const inspection = await inspectProductRuntimeImage(imageRoot, policy.owners);
    const identityPayload = {
        schema: PRODUCT_RUNTIME_IMAGE_MANIFEST_SCHEMA,
        builderContractVersion: PRODUCT_RUNTIME_BUILDER_CONTRACT_VERSION,
        version: input.version,
        revision: input.revision,
        dirty: false,
        platform: input.platform,
        lockfileSha256: sha256ProductRuntimeText("fixture-lock\n"),
        sourceDigest: sha256ProductRuntimeText(`${input.version}\0${input.revision}`),
        runtime: {
            bun: process.versions.bun ?? "1.3.14",
            nuxt: "4.3.1",
            nitro: "2.13.4",
        },
        runtimeContract: {
            path: PRODUCT_RUNTIME_CONTRACT_PATH,
            sha256: productRuntimeContractSha256(runtimeContractText),
        },
        policy: createProductRuntimePolicy(policy.owners, policy.budget),
        inventory: {
            files: inspection.files,
            bytes: inspection.bytes,
            owners: inspection.owners,
        },
        treeDigest: inspection.treeDigest,
        shapeDigest: inspection.shapeDigest,
    } satisfies Omit<ProductRuntimeImageManifest, "imageId" | "createdAt">;
    const createdAt = new Date(0).toISOString();
    const manifest: ProductRuntimeImageManifest = {
        ...identityPayload,
        imageId: productRuntimeManifestImageId({...identityPayload, imageId: "", createdAt}),
        createdAt,
    };
    const manifestText = `${JSON.stringify(manifest, null, 2)}\n`;
    await Promise.all([
        writeFile(join(imageRoot, "runtime-image.json"), manifestText, "utf8"),
        writeFile(join(imageRoot, "runtime-image.ready"), `${JSON.stringify({
            schema: PRODUCT_RUNTIME_IMAGE_READY_SCHEMA,
            imageId: manifest.imageId,
            manifestSha256: sha256ProductRuntimeText(manifestText),
        })}\n`, "utf8"),
    ]);
    return await new ProductRuntimeImageVerifier().openVerified(imageRoot, {
        version: manifest.version,
        revision: manifest.revision,
        dirty: manifest.dirty,
        platform: manifest.platform,
        imageId: manifest.imageId,
        lockfileSha256: manifest.lockfileSha256,
        sourceDigest: manifest.sourceDigest,
        builderContractVersion: manifest.builderContractVersion,
    });
}
