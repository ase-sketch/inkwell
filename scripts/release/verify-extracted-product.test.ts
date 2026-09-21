import {randomUUID} from "node:crypto";
import {cp, mkdtemp, mkdir, rm, writeFile} from "node:fs/promises";
import { testHostPath } from "@notnotype/neuro-book-test-support/test-path"
import {join} from "node:path";

import {afterEach, describe, expect, it} from "vitest";

import type {ProductPlatform} from "@notnotype/neuro-book-contracts/platform";
import {
    createProductRuntimeContract,
    PRODUCT_RUNTIME_COMMAND_BOOTSTRAP,
    PRODUCT_RUNTIME_CONTRACT_PATH,
} from "@notnotype/neuro-book-contracts/product-runtime";
import {
    ProductRuntimeImageBuilder,
    productRuntimeBuildPolicy,
    type VerifiedProductRuntimeImage,
} from "#scripts/build/product-runtime-image-builder";
import {releaseBuildId, type ReleaseProductBuild} from "#scripts/release/release-assets";
import {openVerifiedExtractedProduct} from "#scripts/release/verify-extracted-product";

const roots: string[] = [];

afterEach(async () => {
    await Promise.all(roots.splice(0).map(async (root) => await rm(root, {recursive: true, force: true})));
});

describe("openVerifiedExtractedProduct", {timeout: 30_000}, () => {
    it("使用归档根外部身份完整打开合法Runtime Image", async () => {
        const fixture = await archiveFixture();

        const image = await openVerifiedExtractedProduct(fixture.archiveRoot);

        expect(image.path).toBe(join(fixture.archiveRoot, ".output"));
        expect(image.manifest.imageId).toBe(fixture.metadata.imageId);
        expect(image.manifest.treeDigest).toBe(fixture.metadata.treeDigest);
    });

    it("在执行命令前拒绝外部身份或非入口payload篡改", async () => {
        const identityFixture = await archiveFixture();
        await writeFile(join(identityFixture.archiveRoot, "product-build.json"), `${JSON.stringify({
            ...identityFixture.metadata,
            imageId: `sha256:${"0".repeat(64)}`,
        })}\n`, "utf8");
        await expect(openVerifiedExtractedProduct(identityFixture.archiveRoot)).rejects.toThrow("身份不一致：imageId");

        const payloadFixture = await archiveFixture();
        await writeFile(
            join(payloadFixture.archiveRoot, ".output", "server", "commands", "all.mjs"),
            "export const tampered = true;\n",
            "utf8",
        );
        await expect(openVerifiedExtractedProduct(payloadFixture.archiveRoot)).rejects.toThrow("payload digest 不一致");
    });
});

/** 构建正式 Builder 产物并投影归档外部身份。 */
async function archiveFixture(): Promise<{archiveRoot: string; metadata: ReleaseProductBuild}> {
    const root = await mkdtemp(testHostPath("nbook-extracted-product-"));
    roots.push(root);
    const sourceRoot = join(root, "source");
    const archiveRoot = join(root, "archive");
    await Promise.all([mkdir(sourceRoot, {recursive: true}), mkdir(archiveRoot, {recursive: true})]);
    const image = await buildRuntimeImageFixture({
        sourceRoot,
        version: "0.9.0",
        revision: "a".repeat(40),
        platform: "windows-x64",
    });
    await cp(image.path, join(archiveRoot, ".output"), {recursive: true, dereference: false});
    const common = {
        schema: "nbook.release-build/v1" as const,
        kind: "product" as const,
        version: image.manifest.version,
        revision: image.manifest.revision,
        dirty: false as const,
        lockfileSha256: image.manifest.lockfileSha256,
    };
    const metadata: ReleaseProductBuild = {
        ...common,
        buildId: releaseBuildId(common),
        platform: image.manifest.platform,
        imageId: image.manifest.imageId,
        sourceDigest: image.manifest.sourceDigest,
        treeDigest: image.manifest.treeDigest,
        builderContractVersion: image.manifest.builderContractVersion,
    };
    await writeFile(join(archiveRoot, "product-build.json"), `${JSON.stringify(metadata, null, 4)}\n`, "utf8");
    return {archiveRoot, metadata};
}

async function buildRuntimeImageFixture(input: {
    sourceRoot: string;
    version: string;
    revision: string;
    platform: ProductPlatform;
    operationId?: string;
}): Promise<VerifiedProductRuntimeImage> {
    const policy = productRuntimeBuildPolicy(input.platform);
    await Promise.all([
        mkdir(join(input.sourceRoot, "node_modules", "nuxt"), {recursive: true}),
        mkdir(join(input.sourceRoot, "node_modules", "nitropack"), {recursive: true}),
    ]);
    await Promise.all([
        writeFile(join(input.sourceRoot, "package.json"), `${JSON.stringify({
            name: "nbook-extracted-product-runtime-image-fixture",
            version: input.version,
        })}\n`, "utf8"),
        writeFile(join(input.sourceRoot, "bun.lock"), "fixture-lock\n", "utf8"),
        writeFile(join(input.sourceRoot, "node_modules", "nuxt", "package.json"), `${JSON.stringify({
            name: "nuxt",
            version: "4.3.1",
        })}\n`, "utf8"),
        writeFile(join(input.sourceRoot, "node_modules", "nitropack", "package.json"), `${JSON.stringify({
            name: "nitropack",
            version: "2.13.4",
        })}\n`, "utf8"),
    ]);

    return await new ProductRuntimeImageBuilder(input.sourceRoot).buildCandidate({
        operationId: input.operationId ?? `extracted-product-fixture-${randomUUID()}`,
        platform: input.platform,
        expectedSource: {
            version: input.version,
            revision: input.revision,
            dirty: false,
        },
        owners: policy.owners,
        budget: policy.budget,
        async build({imageRoot}) {
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
            await Promise.all([
                writeFile(join(imageRoot, "server", "index.mjs"), "export {};\n", "utf8"),
                writeFile(join(imageRoot, ...PRODUCT_RUNTIME_COMMAND_BOOTSTRAP.split("/")), "export {};\n", "utf8"),
                writeFile(join(imageRoot, ...entry.split("/")), "export {};\n", "utf8"),
                writeFile(join(imageRoot, "server", "commands", "fixture-payload.mjs"), "export const fixturePayload = true;\n", "utf8"),
                writeFile(
                    join(imageRoot, ...PRODUCT_RUNTIME_CONTRACT_PATH.split("/")),
                    `${JSON.stringify(contract, null, 2)}\n`,
                    "utf8",
                ),
            ]);
        },
    });
}
