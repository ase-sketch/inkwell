import {mkdtemp, mkdir, rm, writeFile} from "node:fs/promises";
import { testHostPath } from "@notnotype/neuro-book-test-support/test-path"
import {dirname, join} from "node:path";
import {afterEach, describe, expect, it} from "vitest";

import {assertProductRuntimeModuleClosure} from "#scripts/build/product-runtime-module-closure.mjs";

const temporaryRoots: string[] = [];

afterEach(async () => {
    await Promise.all(temporaryRoots.splice(0).map((root) => rm(root, {recursive: true, force: true})));
});

describe("Product Runtime module closure", () => {
    it("覆盖 server、commands、authoring、assets 及其相对闭包，并核对 package island", async () => {
        const fixture = await createImage({packages: ["esbuild"]});
        await fixture.module("index.mjs", [
            'import "./commands/start.mjs";',
            "export default true;",
        ].join("\n"));
        await fixture.module("commands/start.mjs", [
            'import "./chunks/shared.mjs";',
            'import esbuild from "../node_modules/esbuild/index.mjs";',
            "export default esbuild;",
        ].join("\n"));
        await fixture.module("commands/chunks/shared.mjs", "export const shared = true;\n");
        await fixture.module("authoring/profile-compile-worker.mjs", [
            'import "node:fs";',
            'import "../commands/chunks/shared.mjs";',
        ].join("\n"));
        await fixture.package("esbuild");

        await expect(assertProductRuntimeModuleClosure({
            imageRoot: fixture.imageRoot,
            buildRoots: [fixture.buildRoot],
        })).resolves.toEqual({
            roots: 7,
            modules: 7,
            references: 5,
            opaqueImports: 0,
            opaqueImportObservations: [],
            packages: ["esbuild"],
            nativeIslands: {
                schema: "nbook.product-native-islands/v2",
                platform: "windows-x64",
                islands: [{packages: ["esbuild"], reason: "test", smoke: "test"}],
                opaqueImports: [],
            },
        });
    });

    it("拒绝缺失或逃逸候选镜像的相对可达 import", async () => {
        const missing = await createImage();
        await missing.module("commands/start.mjs", 'import "./chunks/missing.mjs";\n');
        await expect(assertProductRuntimeModuleClosure({imageRoot: missing.imageRoot}))
            .rejects.toThrow("缺失相对可达 import ./chunks/missing.mjs");

        const escaping = await createImage();
        await escaping.module("commands/start.mjs", 'import "../../../outside.mjs";\n');
        await writeFile(join(escaping.root, "outside.mjs"), "export default true;\n", "utf8");
        await expect(assertProductRuntimeModuleClosure({imageRoot: escaping.imageRoot}))
            .rejects.toThrow("相对引用逃逸候选镜像 ../../../outside.mjs");
    });

    it("拒绝被截断为0字节的可执行模块", async () => {
        const fixture = await createImage();
        await fixture.module("commands/start.mjs", "");

        await expect(assertProductRuntimeModuleClosure({imageRoot: fixture.imageRoot}))
            .rejects.toThrow("commands/start.mjs: 可执行模块是0字节空文件");
    });

    it("拒绝包管理器物理路径与绝对 module specifier", async () => {
        const bunStore = await createImage();
        await bunStore.module("commands/start.mjs", 'import "../node_modules/.bun/pkg/index.mjs";\n');
        await expect(assertProductRuntimeModuleClosure({imageRoot: bunStore.imageRoot}))
            .rejects.toThrow("包管理器物理路径 ../node_modules/.bun/pkg/index.mjs");

        const pnpmMetadata = await createImage();
        await pnpmMetadata.module(
            "commands/start.mjs",
            'export const buildId = "../node_modules/.pnpm/pkg@1.0.0/node_modules/pkg/index.mjs";\n',
        );
        await expect(assertProductRuntimeModuleClosure({imageRoot: pnpmMetadata.imageRoot}))
            .rejects.toThrow("泄漏包管理器物理路径 node_modules/.pnpm/");

        const absolute = await createImage();
        await absolute.module("commands/start.mjs", 'import "C:/build/neuro-book/entry.mjs";\n');
        await expect(assertProductRuntimeModuleClosure({imageRoot: absolute.imageRoot}))
            .rejects.toThrow("含候选镜像外绝对引用 C:/build/neuro-book/entry.mjs");
    });

    it("拒绝 bundle 正文泄漏当前构建根", async () => {
        const exactRoot = await createImage();
        await exactRoot.module(
            "commands/start.mjs",
            `export const applicationRoot = ${JSON.stringify(exactRoot.buildRoot)};\n`,
        );
        await expect(assertProductRuntimeModuleClosure({
            imageRoot: exactRoot.imageRoot,
            buildRoots: [exactRoot.buildRoot],
        })).resolves.toMatchObject({modules: 5});

        const fixture = await createImage();
        await fixture.module("commands/start.mjs", `export const leaked = ${JSON.stringify(join(fixture.buildRoot, "node_modules", "pkg"))};\n`);

        await expect(assertProductRuntimeModuleClosure({
            imageRoot: fixture.imageRoot,
            buildRoots: [fixture.buildRoot],
        })).rejects.toThrow("泄漏构建机绝对路径");
    });

    it("bare package 必须登记且所有登记 island 必须真实存在", async () => {
        const unregistered = await createImage();
        await unregistered.module("commands/start.mjs", 'import "zod";\n');
        await expect(assertProductRuntimeModuleClosure({imageRoot: unregistered.imageRoot}))
            .rejects.toThrow("bare package 未登记为 package island zod");

        const registeredBare = await createImage({packages: ["esbuild"]});
        await registeredBare.module("commands/start.mjs", 'import "esbuild";\n');
        await registeredBare.package("esbuild");
        await expect(assertProductRuntimeModuleClosure({imageRoot: registeredBare.imageRoot}))
            .rejects.toThrow("package island 仍为 bare import esbuild");

        const missing = await createImage({packages: ["zod"]});
        await expect(assertProductRuntimeModuleClosure({imageRoot: missing.imageRoot}))
            .rejects.toThrow("缺失已登记 package island：zod");
    });

    it("相对 node_modules 引用同样不能绕过 package island 登记", async () => {
        const fixture = await createImage();
        await fixture.module("commands/start.mjs", 'import "../node_modules/zod/index.mjs";\n');
        await fixture.package("zod", "export default true;\n");

        await expect(assertProductRuntimeModuleClosure({imageRoot: fixture.imageRoot}))
            .rejects.toThrow("引用了未登记 package island zod");
    });

    it("系统 artifact 的 module specifier 同样进入最终闭包", async () => {
        const fixture = await createImage();
        await fixture.module("assets/workspace/.nbook/agent/profiles/.compiled/artifact.mjs", 'import "./missing.mjs";\n');

        await expect(assertProductRuntimeModuleClosure({imageRoot: fixture.imageRoot}))
            .rejects.toThrow("assets/workspace/.nbook/agent/profiles/.compiled/artifact.mjs: 缺失相对可达 import ./missing.mjs");
    });

    it("opaque dynamic import 必须命中 manifest 登记且数量完全一致", async () => {
        const unregistered = await createImage();
        await unregistered.module("commands/start.mjs", "const target = './runtime.mjs'; await import(target);\n");
        await expect(assertProductRuntimeModuleClosure({imageRoot: unregistered.imageRoot}))
            .rejects.toThrow("opaque dynamic import 必须命中且只命中一项登记，实际 0 项");

        const registered = await createImage({
            opaqueImports: [{
                pathPattern: "authoring/profile-compile-worker.mjs",
                count: 2,
                reason: "test runtime loader",
                smoke: "test smoke",
            }],
        });
        await registered.module("authoring/profile-compile-worker.mjs", "const target = './runtime.mjs'; await import(target);\n");
        await expect(assertProductRuntimeModuleClosure({imageRoot: registered.imageRoot}))
            .rejects.toThrow(/expected=2, actual=1[\s\S]*import\(target\)/u);

        await registered.module("authoring/profile-compile-worker.mjs", [
            "const first = './runtime-a.mjs';",
            "const second = './runtime-b.mjs';",
            "await import(first);",
            "await import(second);",
        ].join("\n"));
        await expect(assertProductRuntimeModuleClosure({imageRoot: registered.imageRoot}))
            .resolves.toMatchObject({
                opaqueImports: 2,
                opaqueImportObservations: [
                    expect.objectContaining({
                        modulePath: "authoring/profile-compile-worker.mjs",
                        expression: "import(first)",
                        fingerprint: expect.stringMatching(/^sha256:[0-9a-f]{64}$/u),
                    }),
                    expect.objectContaining({
                        modulePath: "authoring/profile-compile-worker.mjs",
                        expression: "import(second)",
                        fingerprint: expect.stringMatching(/^sha256:[0-9a-f]{64}$/u),
                    }),
                ],
            });
    });
});

type ProductImageFixture = {
    root: string;
    imageRoot: string;
    buildRoot: string;
    /** 写入 server 相对模块。 */
    module(relativePath: string, source: string): Promise<void>;
    /** 写入最小 package island。 */
    package(packageName: string, source?: string): Promise<void>;
};

/** 建立含四类必需执行目录与 native island manifest 的最小候选镜像。 */
async function createImage(options: {
    packages?: string[];
    opaqueImports?: Array<{pathPattern: string; count: number; reason: string; smoke: string}>;
} = {}): Promise<ProductImageFixture> {
    const root = await mkdtemp(testHostPath("nbook-product-closure-"));
    temporaryRoots.push(root);
    const imageRoot = join(root, "image");
    const serverRoot = join(imageRoot, "server");
    const buildRoot = join(root, "source-checkout");
    await Promise.all([
        mkdir(join(serverRoot, "commands"), {recursive: true}),
        mkdir(join(serverRoot, "authoring"), {recursive: true}),
        mkdir(join(serverRoot, "assets"), {recursive: true}),
        mkdir(buildRoot, {recursive: true}),
    ]);
    const writeModule = async (relativePath: string, source: string): Promise<void> => {
        const filePath = join(serverRoot, relativePath);
        await mkdir(dirname(filePath), {recursive: true});
        await writeFile(filePath, source, "utf8");
    };
    const writePackage = async (packageName: string, source = "export default true;\n"): Promise<void> => {
        const packageRoot = join(serverRoot, "node_modules", ...packageName.split("/"));
        await mkdir(packageRoot, {recursive: true});
        await Promise.all([
            writeFile(join(packageRoot, "package.json"), `${JSON.stringify({name: packageName, version: "1.0.0", type: "module"})}\n`, "utf8"),
            writeFile(join(packageRoot, "index.mjs"), source, "utf8"),
        ]);
    };
    await Promise.all([
        writeModule("index.mjs", "export default true;\n"),
        writeModule("commands/placeholder.mjs", "export default true;\n"),
        writeModule("authoring/placeholder.mjs", "export default true;\n"),
        writeModule("assets/placeholder.mjs", "export default true;\n"),
        writeFile(join(serverRoot, "native-islands.json"), `${JSON.stringify({
            schema: "nbook.product-native-islands/v2",
            platform: "windows-x64",
            islands: [{packages: options.packages ?? [], reason: "test", smoke: "test"}],
            opaqueImports: options.opaqueImports ?? [],
        }, null, 4)}\n`, "utf8"),
    ]);
    return {root, imageRoot, buildRoot, module: writeModule, package: writePackage};
}
