import {readFile} from "node:fs/promises";
import {resolve} from "node:path";
import {parseArgs} from "node:util";

import {PRODUCT_PLATFORMS, type ProductPlatform} from "@notnotype/neuro-book-contracts/platform";
import {
    PRODUCT_RUNTIME_MEASUREMENT_SCHEMA,
    type ProductRuntimeMeasurementReport,
} from "#scripts/build/product-runtime-image-builder";
import {
    canonicalProductRuntimeJson,
    PRODUCT_RUNTIME_BUILDER_CONTRACT_VERSION,
} from "@notnotype/neuro-book-contracts/product-runtime";

type MeasurementIdentity = Omit<ProductRuntimeMeasurementReport, "measuredAt">;

const IDENTITY_FIELDS = [
    "schema",
    "builderContractVersion",
    "version",
    "revision",
    "dirty",
    "platform",
    "lockfileSha256",
    "sourceDigest",
    "runtime",
    "runtimeContract",
    "policy",
    "inventory",
    "treeDigest",
    "shapeDigest",
    "evidence",
] as const satisfies readonly (keyof MeasurementIdentity)[];

/** 比较同平台、同Source的两份measurement；时间戳是唯一允许不同的字段。 */
export async function compareProductRuntimeMeasurements(
    leftPathInput: string,
    rightPathInput: string,
): Promise<{platform: ProductPlatform; revision: string; files: number; bytes: number}> {
    const left = parseMeasurement(await readFile(resolve(leftPathInput), "utf8"), "A");
    const right = parseMeasurement(await readFile(resolve(rightPathInput), "utf8"), "B");
    const drift = IDENTITY_FIELDS.filter((field) => (
        canonicalProductRuntimeJson(left[field]) !== canonicalProductRuntimeJson(right[field])
    ));
    if (drift.length > 0) {
        const leftFiles = new Map(left.evidence.payloadFiles.map((file) => [file.relativePath, file]));
        const rightFiles = new Map(right.evidence.payloadFiles.map((file) => [file.relativePath, file]));
        const paths = [...new Set([...leftFiles.keys(), ...rightFiles.keys()])].sort();
        const fileDrift = paths.flatMap((path) => {
            const leftFile = leftFiles.get(path);
            const rightFile = rightFiles.get(path);
            const equal = leftFile && rightFile
                ? canonicalProductRuntimeJson(leftFile) === canonicalProductRuntimeJson(rightFile)
                : leftFile === rightFile;
            return equal
                ? []
                : [`${path} A=${leftFile ? `${leftFile.bytes}/${leftFile.contentDigest}` : "missing"} B=${rightFile ? `${rightFile.bytes}/${rightFile.contentDigest}` : "missing"}`];
        });
        const details = fileDrift.length > 0 ? `；逐文件差异：${fileDrift.slice(0, 20).join("；")}` : "";
        throw new Error(`Product Runtime measurement A/B不可复现：${drift.join(", ")}${details}`);
    }
    return {
        platform: left.platform,
        revision: left.revision,
        files: left.inventory.files,
        bytes: left.inventory.bytes,
    };
}

/** 收窄受控workflow生成的JSON；外部JSON必须先以unknown读取。 */
function parseMeasurement(text: string, label: "A" | "B"): ProductRuntimeMeasurementReport {
    const value: unknown = JSON.parse(text);
    if (!value || typeof value !== "object" || Array.isArray(value)) {
        throw new Error(`Product Runtime measurement ${label}不是对象。`);
    }
    const record = value as {[key: string]: unknown};
    const platform = PRODUCT_PLATFORMS.find((candidate) => candidate === record.platform);
    const inventory = objectField(record.inventory);
    const evidence = objectField(record.evidence);
    const moduleClosure = objectField(evidence?.moduleClosure);
    const nativeIslands = objectField(moduleClosure?.nativeIslands);
    const payloadFiles = evidence?.payloadFiles;
    if (
        record.schema !== PRODUCT_RUNTIME_MEASUREMENT_SCHEMA
        || record.builderContractVersion !== PRODUCT_RUNTIME_BUILDER_CONTRACT_VERSION
        || !platform
        || record.dirty !== false
        || !stringField(record.version)
        || !stringField(record.revision)
        || !stringField(record.lockfileSha256)
        || !stringField(record.sourceDigest)
        || !stringField(record.treeDigest)
        || !stringField(record.shapeDigest)
        || !stringField(record.measuredAt)
        || !Number.isFinite(Date.parse(record.measuredAt))
        || !objectField(record.runtime)
        || !objectField(record.runtimeContract)
        || !objectField(record.policy)
        || !moduleClosure
        || !nativeIslands
        || nativeIslands.platform !== platform
        || !Array.isArray(nativeIslands.islands)
        || !Array.isArray(nativeIslands.opaqueImports)
        || !Number.isSafeInteger(moduleClosure.roots)
        || !Number.isSafeInteger(moduleClosure.modules)
        || !Number.isSafeInteger(moduleClosure.references)
        || !Number.isSafeInteger(moduleClosure.opaqueImports)
        || !Array.isArray(moduleClosure.opaqueImportObservations)
        || !Array.isArray(moduleClosure.packages)
        || !Array.isArray(payloadFiles)
        || payloadFiles.length !== inventory?.files
        || !payloadFiles.every(validPayloadFile)
        || !Number.isSafeInteger(inventory?.files)
        || !Number.isSafeInteger(inventory?.bytes)
        || !Array.isArray(inventory?.owners)
    ) {
        throw new Error(`Product Runtime measurement ${label}身份或inventory无效。`);
    }
    return value as ProductRuntimeMeasurementReport;
}

/** 校验逐文件 measurement 记录，避免比较器接受不完整诊断证据。 */
function validPayloadFile(value: unknown): boolean {
    const record = objectField(value);
    return !!record
        && stringField(record.relativePath)
        && (record.kind === "file" || record.kind === "symlink")
        && Number.isSafeInteger(record.bytes)
        && Number(record.bytes) >= 0
        && Number.isSafeInteger(record.mode)
        && Number(record.mode) >= 0
        && typeof record.contentDigest === "string"
        && /^sha256:[0-9a-f]{64}$/u.test(record.contentDigest);
}

/** 只接受非数组对象。 */
function objectField(value: unknown): {[key: string]: unknown} | undefined {
    return value && typeof value === "object" && !Array.isArray(value)
        ? value as {[key: string]: unknown}
        : undefined;
}

/** identity文本字段不能是空字符串。 */
function stringField(value: unknown): value is string {
    return typeof value === "string" && value.length > 0;
}

if (import.meta.main) {
    const {values} = parseArgs({
        allowPositionals: false,
        options: {
            left: {type: "string"},
            right: {type: "string"},
        },
        strict: true,
    });
    if (!values.left || !values.right) {
        throw new Error("用法：bun scripts/build/compare-product-runtime-measurements.ts --left <A.json> --right <B.json>");
    }
    console.log(JSON.stringify({
        ok: true,
        ...await compareProductRuntimeMeasurements(values.left, values.right),
    }, null, 4));
}
