import {build, type BuildOptions, type BuildResult} from "esbuild";

type ProductBundleOptions = Omit<BuildOptions,
    | "bundle"
    | "charset"
    | "conditions"
    | "format"
    | "legalComments"
    | "logLevel"
    | "minify"
    | "platform"
    | "sourcemap"
    | "target"
    | "treeShaking"
>;

/**
 * 用同一个 esbuild module graph 完成 Product 链接与压缩。
 *
 * Bun 仍是构建宿主与运行时，但不再先生成一个可能随并发遍历顺序漂移的中间 bundle。
 */
export async function bundleProductJavaScript(options: ProductBundleOptions): Promise<BuildResult> {
    return await build({
        ...options,
        bundle: true,
        charset: "utf8",
        conditions: ["bun", "node", "import", "module"],
        format: "esm",
        legalComments: "none",
        logLevel: "silent",
        minify: true,
        platform: "node",
        sourcemap: false,
        target: "esnext",
        treeShaking: true,
    });
}

/** 读取 write=false 的唯一单入口输出；额外文件表示 Product bundle 合同已经变化。 */
export function productBundleOutputText(result: BuildResult, label: string): string {
    if (result.outputFiles?.length !== 1) {
        throw new Error(`${label} 必须只产生一个入口。`);
    }
    const source = result.outputFiles[0]!.text;
    return source.trim() ? source : "export{};\n";
}
