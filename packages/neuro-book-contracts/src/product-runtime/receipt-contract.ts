import {isAbsolute, win32} from "node:path";

import {PRODUCT_PLATFORMS, type ProductPlatform} from "../platform";
import {PRODUCT_RUNTIME_CONTRACT_PATH} from "./contract";
import type {ProductRuntimeImageManifest} from "./image-contract";

export const PRODUCT_RUNTIME_RECEIPT_SCHEMA = "nbook.product-runtime-receipt/v1";
export const PRODUCT_RUNTIME_RECEIPT_PATH_ENVIRONMENT = "NEURO_BOOK_PRODUCT_RUNTIME_RECEIPT_PATH";
export const PRODUCT_RUNTIME_RECEIPT_SHA256_ENVIRONMENT = "NEURO_BOOK_PRODUCT_RUNTIME_RECEIPT_SHA256";

export type ProductRuntimeReceiptAuthorization = Readonly<{
    path: string;
    sha256: string;
}>;

export type ProductRuntimeVerificationReceipt = {
    schema: typeof PRODUCT_RUNTIME_RECEIPT_SCHEMA;
    imageId: string;
    version: string;
    revision: string;
    dirty: boolean;
    platform: ProductRuntimeImageManifest["platform"];
    sourceDigest: string;
    lockfileSha256: string;
    builderContractVersion: string;
    treeDigest: string;
    shapeDigest: string;
    runtimeContract: ProductRuntimeImageManifest["runtimeContract"];
    issuedAt: string;
};

/** 从已完整验证的 Product manifest 建立不含绝对路径的安装回执。 */
export function createProductRuntimeVerificationReceipt(
    manifest: ProductRuntimeImageManifest,
    issuedAt = new Date().toISOString(),
): ProductRuntimeVerificationReceipt {
    return {
        schema: PRODUCT_RUNTIME_RECEIPT_SCHEMA,
        imageId: manifest.imageId,
        version: manifest.version,
        revision: manifest.revision,
        dirty: manifest.dirty,
        platform: manifest.platform,
        sourceDigest: manifest.sourceDigest,
        lockfileSha256: manifest.lockfileSha256,
        builderContractVersion: manifest.builderContractVersion,
        treeDigest: manifest.treeDigest,
        shapeDigest: manifest.shapeDigest,
        runtimeContract: {...manifest.runtimeContract},
        issuedAt,
    };
}
/** 将内存授权投影为 Product command 子进程环境。 */
export function productRuntimeReceiptEnvironment(
    authorization: ProductRuntimeReceiptAuthorization,
): NodeJS.ProcessEnv {
    const path = authorization.path.trim();
    if (!path || !isPortableAbsolutePath(path)) {
        throw new Error("Product Runtime receipt 授权路径必须是绝对路径。");
    }
    assertReceiptSha256(authorization.sha256, "Product Runtime receipt 授权摘要");
    return {
        [PRODUCT_RUNTIME_RECEIPT_PATH_ENVIRONMENT]: path,
        [PRODUCT_RUNTIME_RECEIPT_SHA256_ENVIRONMENT]: authorization.sha256,
    };
}

/** 从 Product command 环境读取成对授权；缺一项时 fail closed。 */
export function productRuntimeReceiptAuthorizationFromEnvironment(
    environment: Readonly<Record<string, string | undefined>>,
): ProductRuntimeReceiptAuthorization | null {
    const path = environment[PRODUCT_RUNTIME_RECEIPT_PATH_ENVIRONMENT]?.trim() ?? "";
    const sha256 = environment[PRODUCT_RUNTIME_RECEIPT_SHA256_ENVIRONMENT]?.trim() ?? "";
    if (!path && !sha256) return null;
    if (!path || !sha256) {
        throw new Error("Product Runtime receipt 启动授权必须同时提供路径和摘要。");
    }
    productRuntimeReceiptEnvironment({path, sha256});
    return {path, sha256};
}
function parseProductRuntimeVerificationReceipt(value: unknown): ProductRuntimeVerificationReceipt {
    if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Product Runtime verification receipt 必须是对象。");
    const root = value as Record<string, unknown>;
    exactKeys(root, [
        "schema", "imageId", "version", "revision", "dirty", "platform", "sourceDigest", "lockfileSha256",
        "builderContractVersion", "treeDigest", "shapeDigest", "runtimeContract", "issuedAt",
    ], "Product Runtime verification receipt");
    if (root.schema !== PRODUCT_RUNTIME_RECEIPT_SCHEMA) throw new Error("Product Runtime verification receipt schema 不受支持。");
    for (const key of ["imageId", "sourceDigest", "lockfileSha256", "treeDigest", "shapeDigest"] as const) {
        if (typeof root[key] !== "string" || !/^sha256:[a-f0-9]{64}$/u.test(root[key])) throw new Error(`${key} 必须是 sha256 摘要。`);
    }
    for (const key of ["version", "revision", "builderContractVersion", "issuedAt"] as const) {
        if (typeof root[key] !== "string" || !root[key]) throw new Error(`${key} 必须是非空字符串。`);
    }
    if (typeof root.dirty !== "boolean") throw new Error("dirty 必须是 boolean。");
    if (typeof root.platform !== "string" || !PRODUCT_PLATFORMS.includes(root.platform as ProductPlatform)) {
        throw new Error("platform 不受支持。");
    }
    if (!root.runtimeContract || typeof root.runtimeContract !== "object" || Array.isArray(root.runtimeContract)) throw new Error("runtimeContract 必须是对象。");
    const runtimeContract = root.runtimeContract as Record<string, unknown>;
    if (runtimeContract.path !== PRODUCT_RUNTIME_CONTRACT_PATH || typeof runtimeContract.sha256 !== "string" || !/^sha256:[a-f0-9]{64}$/u.test(runtimeContract.sha256)) {
        throw new Error("runtimeContract 回执无效。");
    }
    if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/u.test(root.issuedAt as string)) throw new Error("issuedAt 必须是 UTC 时间。");
    return {
        schema: PRODUCT_RUNTIME_RECEIPT_SCHEMA,
        imageId: root.imageId as string,
        version: root.version as string,
        revision: root.revision as string,
        dirty: root.dirty as boolean,
        platform: root.platform as ProductRuntimeImageManifest["platform"],
        sourceDigest: root.sourceDigest as string,
        lockfileSha256: root.lockfileSha256 as string,
        builderContractVersion: root.builderContractVersion as string,
        treeDigest: root.treeDigest as string,
        shapeDigest: root.shapeDigest as string,
        runtimeContract: {path: runtimeContract.path as "server/runtime-contract.json", sha256: runtimeContract.sha256 as string},
        issuedAt: root.issuedAt as string,
    };
}

function exactKeys(record: Record<string, unknown>, expected: readonly string[], label: string): void {
    const actual = Object.keys(record).sort();
    const wanted = [...expected].sort();
    if (JSON.stringify(actual) !== JSON.stringify(wanted)) throw new Error(`${label} 字段不匹配。`);
}
export {parseProductRuntimeVerificationReceipt};

function assertReceiptSha256(value: string, label: string): void {
    if (!/^sha256:[a-f0-9]{64}$/u.test(value)) throw new Error(`${label} 必须是 sha256 摘要。`);
}

function isPortableAbsolutePath(value: string): boolean {
    return isAbsolute(value) || win32.isAbsolute(value);
}
