import {productPlatform, type ProductPlatform} from "@notnotype/neuro-book-contracts/platform";

/** Root scripts 的宿主平台 Adapter；合同归 contracts，宿主探测留编排层。 */
export function currentProductPlatform(): ProductPlatform {
    const report = process.platform === "linux"
        ? process.report?.getReport() as {header?: {glibcVersionRuntime?: string}} | undefined
        : undefined;
    return productPlatform({
        platform: process.platform,
        arch: process.arch,
        glibcVersion: report?.header?.glibcVersionRuntime,
    });
}
