import {readFile} from "node:fs/promises";
import {join, resolve} from "node:path";
import {parseArgs} from "node:util";
import {parseReleaseBuild} from "#scripts/release/release-assets";
import {ProductRuntimeImageVerifier} from "@notnotype/neuro-book/product-verification";
import type {VerifiedProductRuntimeImage} from "#scripts/build/product-runtime-image-builder";

const PRODUCT_BUILD_FILE = "product-build.json";

/** 使用归档根外部身份完整验证解压后的 Product Runtime Image。 */
export async function openVerifiedExtractedProduct(productRootInput: string): Promise<VerifiedProductRuntimeImage> {
    const productRoot = resolve(productRootInput);
    const build = parseReleaseBuild(await readFile(join(productRoot, PRODUCT_BUILD_FILE), "utf8"));
    if (build.kind !== "product") {
        throw new Error(`${PRODUCT_BUILD_FILE} kind 必须是 product。`);
    }
    const image = await new ProductRuntimeImageVerifier().openVerified(join(productRoot, ".output"), {
        version: build.version,
        revision: build.revision,
        dirty: build.dirty,
        platform: build.platform,
        imageId: build.imageId,
        lockfileSha256: build.lockfileSha256,
        sourceDigest: build.sourceDigest,
        builderContractVersion: build.builderContractVersion,
    });
    if (image.manifest.treeDigest !== build.treeDigest) {
        throw new Error(`Product archive tree digest 不一致：expected=${build.treeDigest} actual=${image.manifest.treeDigest}`);
    }
    return image;
}

if (import.meta.main) {
    const {values} = parseArgs({
        options: {"product-root": {type: "string"}},
        strict: true,
    });
    if (!values["product-root"]) {
        throw new Error("用法：bun scripts/release/verify-extracted-product.ts --product-root <root>");
    }
    const image = await openVerifiedExtractedProduct(values["product-root"]);
    console.log(JSON.stringify({
        ok: true,
        imageId: image.manifest.imageId,
        platform: image.manifest.platform,
        treeDigest: image.manifest.treeDigest,
    }, null, 4));
}
