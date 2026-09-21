import {mkdtemp, rm, writeFile} from "node:fs/promises";
import { testHostPath } from "@notnotype/neuro-book-test-support/test-path"
import {join} from "node:path";

import {afterEach, describe, expect, it} from "vitest";

import {compareProductRuntimeMeasurements} from "#scripts/build/compare-product-runtime-measurements";
import {
    PRODUCT_RUNTIME_MEASUREMENT_SCHEMA,
    type ProductRuntimeMeasurementReport,
} from "#scripts/build/product-runtime-image-builder";
import {
    PRODUCT_RUNTIME_BUILDER_CONTRACT_VERSION,
    PRODUCT_RUNTIME_MAX_BYTES,
    PRODUCT_RUNTIME_MAX_FILES,
} from "@notnotype/neuro-book-contracts/product-runtime";

const roots: string[] = [];

afterEach(async () => {
    await Promise.all(roots.splice(0).map((root) => rm(root, {recursive: true, force: true})));
});

describe("Product Runtime measurement A/B", () => {
    it("只允许测量时间不同", async () => {
        const root = await sandbox();
        const left = report();
        const right = {...report(), measuredAt: "2026-08-02T00:00:01.000Z"};
        const [leftPath, rightPath] = await writeReports(root, left, right);

        await expect(compareProductRuntimeMeasurements(leftPath, rightPath)).resolves.toEqual({
            platform: "linux-x64-glibc",
            revision: "a".repeat(40),
            files: 1,
            bytes: 2,
        });
    });

    it("拒绝owner inventory或逐文件tree digest漂移", async () => {
        const root = await sandbox();
        const left = report();
        const right = report();
        right.inventory.bytes += 1;
        right.treeDigest = `sha256:${"e".repeat(64)}`;
        const [leftPath, rightPath] = await writeReports(root, left, right);

        await expect(compareProductRuntimeMeasurements(leftPath, rightPath))
            .rejects.toThrow("inventory, treeDigest");
    });

    it("A/B漂移报告具体文件、大小和摘要", async () => {
        const root = await sandbox();
        const left = report();
        const right = report();
        right.inventory.bytes = 8;
        right.treeDigest = `sha256:${"e".repeat(64)}`;
        right.evidence.payloadFiles[0] = {
            ...right.evidence.payloadFiles[0]!,
            bytes: 8,
            contentDigest: `sha256:${"9".repeat(64)}`,
        };
        const [leftPath, rightPath] = await writeReports(root, left, right);

        await expect(compareProductRuntimeMeasurements(leftPath, rightPath))
            .rejects.toThrow(`server/index.mjs A=2/sha256:${"8".repeat(64)} B=8/sha256:${"9".repeat(64)}`);
    });

    it("A/B shape漂移报告只存在于一侧的文件", async () => {
        const root = await sandbox();
        const left = report();
        const right = report();
        right.inventory.files = 2;
        right.inventory.bytes = 3;
        right.shapeDigest = `sha256:${"e".repeat(64)}`;
        right.evidence.payloadFiles.push({
            relativePath: "server/chunks/runtime.mjs",
            kind: "file",
            bytes: 1,
            mode: 0o644,
            contentDigest: `sha256:${"7".repeat(64)}`,
        });
        const [leftPath, rightPath] = await writeReports(root, left, right);

        await expect(compareProductRuntimeMeasurements(leftPath, rightPath))
            .rejects.toThrow(`server/chunks/runtime.mjs A=missing B=1/sha256:${"7".repeat(64)}`);
    });

    it("拒绝native island或module closure证据漂移", async () => {
        const root = await sandbox();
        const left = report();
        const right = report();
        right.evidence.moduleClosure.opaqueImports = 2;
        const [leftPath, rightPath] = await writeReports(root, left, right);

        await expect(compareProductRuntimeMeasurements(leftPath, rightPath))
            .rejects.toThrow("evidence");
    });
});

/** 创建隔离measurement fixture目录。 */
async function sandbox(): Promise<string> {
    const root = await mkdtemp(testHostPath("nbook-product-measurement-"));
    roots.push(root);
    return root;
}

/** 写入两份受控报告。 */
async function writeReports(
    root: string,
    left: ProductRuntimeMeasurementReport,
    right: ProductRuntimeMeasurementReport,
): Promise<[string, string]> {
    const leftPath = join(root, "a.json");
    const rightPath = join(root, "b.json");
    await Promise.all([
        writeFile(leftPath, JSON.stringify(left), "utf8"),
        writeFile(rightPath, JSON.stringify(right), "utf8"),
    ]);
    return [leftPath, rightPath];
}

/** 返回具备全部稳定identity字段的最小报告。 */
function report(): ProductRuntimeMeasurementReport {
    return {
        schema: PRODUCT_RUNTIME_MEASUREMENT_SCHEMA,
        builderContractVersion: PRODUCT_RUNTIME_BUILDER_CONTRACT_VERSION,
        version: "0.9.0-canary.test",
        revision: "a".repeat(40),
        dirty: false,
        platform: "linux-x64-glibc",
        lockfileSha256: `sha256:${"b".repeat(64)}`,
        sourceDigest: `sha256:${"c".repeat(64)}`,
        runtime: {bun: "1.3.14", nuxt: "4.3.0", nitro: "2.13.4"},
        runtimeContract: {path: "server/runtime-contract.json", sha256: `sha256:${"d".repeat(64)}`},
        policy: {
            registered: false,
            owners: [{name: "frontend", paths: ["public"]}],
            globalBudget: {maxFiles: PRODUCT_RUNTIME_MAX_FILES, maxBytes: PRODUCT_RUNTIME_MAX_BYTES},
        },
        inventory: {
            files: 1,
            bytes: 2,
            owners: [{name: "frontend", paths: ["public"], files: 1, bytes: 2}],
        },
        treeDigest: `sha256:${"f".repeat(64)}`,
        shapeDigest: `sha256:${"0".repeat(64)}`,
        evidence: {
            moduleClosure: {
                roots: 4,
                modules: 4,
                references: 0,
                opaqueImports: 1,
                opaqueImportObservations: [{
                    modulePath: "index.mjs",
                    expression: "import(target)",
                    fingerprint: `sha256:${"1".repeat(64)}`,
                    pathPattern: "index.mjs",
                }],
                packages: [],
                nativeIslands: {
                    schema: "nbook.product-native-islands/v2",
                    platform: "linux-x64-glibc",
                    islands: [],
                    opaqueImports: [{
                        pathPattern: "index.mjs",
                        count: 1,
                        reason: "fixture",
                        smoke: "fixture smoke",
                    }],
                },
            },
            payloadFiles: [{
                relativePath: "server/index.mjs",
                kind: "file",
                bytes: 2,
                mode: 0o644,
                contentDigest: `sha256:${"8".repeat(64)}`,
            }],
        },
        measuredAt: "2026-08-02T00:00:00.000Z",
    };
}
