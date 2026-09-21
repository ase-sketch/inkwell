import {randomUUID} from "node:crypto";
import {mkdir, writeFile} from "node:fs/promises";
import {dirname, resolve} from "node:path";
import {parseArgs} from "node:util";

import {currentProductPlatform} from "#scripts/utils/product-platform";
import {resolveWorkspaceRoots} from "#scripts/utils/workspace-roots";
import {
    buildProductRuntimePayload,
    prepareProductRuntimeSource,
    productBuildEnvironment,
    withProductBuildLease,
} from "#scripts/build/build-product-runtime-image";
import {
    ProductRuntimeImageBuilder,
    type ProductRuntimeMeasurementReport,
} from "#scripts/build/product-runtime-image-builder";

/** measurement CLI 的输入；outputPath 未提供时写入 ignored `.deploy/measurements`。 */
export interface ProductRuntimeMeasurementOptions {
    outputPath?: string;
}

/**
 * 在当前宿主平台执行一次不可发布的 Product Runtime Image 测量。
 * 返回的 JSON 只能用于审查和登记 baseline，候选本身在返回前已经删除。
 */
export async function measureProductRuntimeImage(
    options: ProductRuntimeMeasurementOptions = {},
): Promise<{outputPath: string; report: ProductRuntimeMeasurementReport}> {
    const roots = resolveWorkspaceRoots();
    return await withProductBuildLease(roots.repositoryRoot, async () => {
        const platform = currentProductPlatform();
        const buildEnvironment = {
            ...productBuildEnvironment(process.env, roots.repositoryRoot),
            NEURO_BOOK_APPLICATION_ROOT: roots.applicationSourceRoot,
        };
        await prepareProductRuntimeSource(buildEnvironment);
        const explicitRevision = process.env.NEURO_BOOK_SOURCE_REVISION?.trim();
        const operationId = `measure-${new Date().toISOString().replace(/[^0-9]/gu, "")}-${randomUUID()}`;
        const report = await new ProductRuntimeImageBuilder({
            repositoryRoot: roots.repositoryRoot,
            applicationSourceRoot: roots.applicationSourceRoot,
            deployRoot: resolve(roots.repositoryRoot, ".deploy"),
        }).measureCandidate({
            operationId,
            platform,
            expectedSource: explicitRevision ? {revision: explicitRevision, dirty: false} : undefined,
            async build(context) {
                await buildProductRuntimePayload(context, buildEnvironment);
            },
        });
        const outputPath = resolve(options.outputPath?.trim() || resolve(
            roots.repositoryRoot,
            ".deploy",
            "measurements",
            `${platform}-${operationId}.json`,
        ));
        await mkdir(dirname(outputPath), {recursive: true});
        await writeFile(outputPath, `${JSON.stringify(report, null, 2)}\n`, {encoding: "utf8", flag: "wx"});
        console.log([
            `Product Runtime Image measurement: ${outputPath}`,
            `platform=${report.platform}`,
            `registered=${String(report.policy.registered)}`,
            `files=${report.inventory.files}`,
            `bytes=${report.inventory.bytes}`,
        ].join(" "));
        return {outputPath, report};
    });
}

if (import.meta.main) {
    const {values} = parseArgs({
        allowPositionals: false,
        options: {
            output: {type: "string"},
        },
        strict: true,
    });
    await measureProductRuntimeImage({outputPath: values.output});
}
