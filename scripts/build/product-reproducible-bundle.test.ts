import {readFile} from "node:fs/promises";
import {describe, expect, it} from "vitest";

import {
    bundleProductJavaScript,
    productBundleOutputText,
} from "#scripts/build/product-reproducible-bundle";

describe("Product reproducible bundle", () => {
    it("相同 ESM graph 产生逐字节一致的链接与压缩输出", async () => {
        const options = {
            stdin: {
                contents: [
                    "const deliberatelyLongIdentifier = 40;",
                    "const anotherLongIdentifier = 2;",
                    "export const answer = deliberatelyLongIdentifier + anotherLongIdentifier;",
                    "",
                ].join("\n"),
                sourcefile: "fixture.mjs",
            },
            write: false,
        } as const;

        const [left, right] = await Promise.all([
            bundleProductJavaScript(options),
            bundleProductJavaScript(options),
        ]);
        const leftSource = productBundleOutputText(left, "fixture A");
        const rightSource = productBundleOutputText(right, "fixture B");

        expect(leftSource).toBe(rightSource);
        expect(leftSource).toContain("export");
    });

    it("纯类型投影产生显式空 ESM，不退化成0字节文件", async () => {
        const result = await bundleProductJavaScript({
            stdin: {contents: "export {};\n", sourcefile: "contracts.mjs"},
            write: false,
        });

        expect(productBundleOutputText(result, "contracts")).toBe("export{};\n");
    });

    it("正式 Product builders 在同一个 esbuild graph 中完成链接与压缩", async () => {
        const builders = [
            "scripts/build/product-runtime-bundle.ts",
            "scripts/build/product-command-bundle.ts",
            "scripts/build/product-authoring-kit.ts",
            "scripts/build/product-authoring-type-projection.ts",
        ];

        for (const builder of builders) {
            const source = await readFile(builder, "utf8");
            expect(source, builder).not.toContain("Bun.build(");
            expect(source, builder).toContain("bundleProductJavaScript");
        }
    });
});
