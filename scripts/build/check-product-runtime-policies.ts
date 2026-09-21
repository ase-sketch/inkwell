import {appendFile} from "node:fs/promises";
import {parseArgs} from "node:util";

import {
    PRODUCT_PLATFORMS,
    type ProductPlatform,
} from "@notnotype/neuro-book-contracts/platform";
import {hasProductRuntimeBuildPolicy} from "#scripts/build/product-runtime-image-builder";

/** 返回当前仍缺少 approved Product Runtime Image policy 的平台。 */
export function missingProductRuntimeBuildPolicies(): ProductPlatform[] {
    return PRODUCT_PLATFORMS.filter((platform) => !hasProductRuntimeBuildPolicy(platform));
}

/** 正式 release preflight：所有对外 Product 平台都必须先完成 baseline 审查和登记。 */
export function assertAllProductRuntimeBuildPolicies(): void {
    const missing = missingProductRuntimeBuildPolicies();
    if (missing.length > 0) {
        throw new Error(`以下 Product 平台尚未登记 approved runtime policy：${missing.join(", ")}`);
    }
}

/** 把 CLI 文本收窄为 Manager 的穷举 ProductPlatform。 */
function parseProductPlatform(value: string): ProductPlatform {
    const platform = PRODUCT_PLATFORMS.find((candidate) => candidate === value);
    if (!platform) {
        throw new Error(`不支持的 Product 平台：${value}`);
    }
    return platform;
}

if (import.meta.main) {
    const {values} = parseArgs({
        allowPositionals: false,
        options: {
            "github-output": {type: "boolean", default: false},
            platform: {type: "string"},
            "require-all": {type: "boolean", default: false},
        },
        strict: true,
    });
    if (values.platform && values["require-all"]) {
        throw new Error("--platform 与 --require-all 不能同时使用。");
    }
    if (values.platform) {
        const platform = parseProductPlatform(values.platform);
        const registered = hasProductRuntimeBuildPolicy(platform);
        console.log(`${platform}: ${registered ? "approved" : "measurement-only"}`);
        if (values["github-output"]) {
            const outputPath = process.env.GITHUB_OUTPUT?.trim();
            if (!outputPath) throw new Error("--github-output 需要 GITHUB_OUTPUT。");
            await appendFile(outputPath, `registered=${String(registered)}\n`, "utf8");
        }
    } else {
        assertAllProductRuntimeBuildPolicies();
        console.log(`全部 ${PRODUCT_PLATFORMS.length} 个 Product 平台已登记 approved runtime policy。`);
    }
}
