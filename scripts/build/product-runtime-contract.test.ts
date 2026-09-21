import {readFile} from "node:fs/promises";
import {dirname, resolve} from "node:path";
import {describe, expect, it} from "vitest";

const applicationRoot = resolve(dirname(import.meta.dirname), "..", "packages", "neuro-book");

describe("Product 临时验收实例合同", () => {
    it("只复制 verified .output，并通过 bundle commands 运行", async () => {
        const source = await readFile(resolve("scripts", "deploy", "product-runtime.mjs"), "utf8");
        expect(source).toContain('import {ProductRuntimeImageBuilder} from "#scripts/build/product-runtime-image-builder";');
        expect(source).toContain('    PRODUCT_BUN_RUNTIME_ARGS,');
        expect(source).toContain('    PRODUCT_RUNTIME_COMMAND_BOOTSTRAP,');
        expect(source).toContain('from "@notnotype/neuro-book-contracts/product-runtime";');
        expect(source).toContain('resolveAgentAcceptanceRoot()');
        expect(source).toContain("new ProductRuntimeImageBuilder(REPO_ROOT)");
        expect(source).toContain("openVerified");
        expect(source).toContain('resolve(stageRoot, ".output")');
        expect(source).toContain('`.output/${PRODUCT_RUNTIME_COMMAND_BOOTSTRAP}`');
        expect(source).toContain("proper-lockfile");
        expect(source).toContain("sweepStaleAcceptances");
        expect(source).not.toContain('|| "product"');
        expect(source).not.toContain('copyPath("server"');
        expect(source).not.toContain("prepareProductSystemAssets");
    });

    it("Product wrapper 在 Nitro 前完成唯一 seed 步骤并标记 Runtime install 模式", async () => {
        const start = await readFile(resolve(applicationRoot, "server", "runtime", "product-start-command.mjs"), "utf8");
        expect(start).toContain("await seedSystemAssets({applicationRoot, stateRoot, seed: seedPaths});");
        expect(start).toContain('NEURO_BOOK_RUNTIME_ASSET_MODE: "install"');
        expect(start.indexOf("await seedSystemAssets")).toBeLessThan(start.indexOf("const child = spawn"));
        expect(start).not.toContain("productRuntimeReady");
        expect(start).toContain("repositoryRoot: applicationRoot");
    });

    it("Product 启动链路不把长驻服务绑定到父 stdout/stderr", async () => {
        const start = await readFile(resolve(applicationRoot, "server", "runtime", "product-start-command.mjs"), "utf8");
        const command = await readFile(resolve(applicationRoot, "server", "runtime", "product-command.ts"), "utf8");
        const runtime = await readFile(resolve("scripts", "deploy", "product-runtime.mjs"), "utf8");
        expect(start).toContain('stdio: "ignore"');
        expect(start).toContain('// start 是长驻服务；启动前内部命令也不能继承可能已断开的 supervisor 管道。');
        expect(command).toContain('mode === "command" && id === "start" ? "ignore" : "inherit"');
        expect(runtime).toContain('stdio: commandId === "start" ? "ignore" : "inherit"');
    });
});
