import {mkdtemp, mkdir, rm, writeFile} from "node:fs/promises";
import { testHostPath } from "@notnotype/neuro-book-test-support/test-path"
import {join, resolve} from "node:path";
import {afterEach, describe, expect, it} from "vitest";

import {
    analyzeRuntimeModuleSource,
    assertRuntimeModuleFiles,
    assertRuntimePackageIdentity,
} from "#scripts/build/nitro-runtime-module-specifier.mjs";

const temporaryRoots: string[] = [];

afterEach(async () => {
    await Promise.all(temporaryRoots.splice(0).map(async (root) => {
        await rm(root, {recursive: true, force: true});
    }));
});

describe("Nitro runtime module specifier", () => {
    it("只从真实 ESM 引用收集 Seed，忽略客户端资源清单字符串", async () => {
        const projectRoot = resolve("C:/build/neuro-book");
        const serverRoot = resolve(projectRoot, ".output/server");
        const importerPath = resolve(serverRoot, "chunks/routes/example.mjs");
        const clientResources = [
            "dompurify",
            "katex",
            "mermaid",
            "monaco-editor",
            "nuxt",
            "vanilla-picker",
        ];
        const manifestEntries = clientResources
            .map((packageName) => `${JSON.stringify(`../node_modules/${packageName}/client.js`)}: { file: "client.js" }`)
            .join(",\n");
        const source = [
            `const manifest = {${manifestEntries}};`,
            "import zod from 'file:///C:/build/neuro-book/node_modules/.bun/zod@4.4.3/node_modules/zod/index.js';",
            "export {value} from '../../../node_modules/.pnpm/@scope+pkg@1.0.0/node_modules/@scope/pkg/feature.js?raw#v1';",
            "const yaml = import('../../../node_modules/yaml/index.js?worker');",
            "export {manifest, zod, yaml};",
        ].join("\n");

        const result = await analyzeRuntimeModuleSource({source, importerPath, serverRoot, projectRoot});

        expect(result.seeds).toEqual(["@scope/pkg", "yaml", "zod"]);
        expect(result.references).toHaveLength(3);
        expect(result.rewriteCount).toBe(3);
        expect(result.source).toContain("../../node_modules/zod/index.js");
        expect(result.source).toContain("../../node_modules/@scope/pkg/feature.js?raw#v1");
        expect(result.source).toContain("../../node_modules/yaml/index.js?worker");
        for (const packageName of clientResources) {
            expect(result.seeds).not.toContain(packageName);
            expect(result.source).toContain(`../node_modules/${packageName}/client.js`);
        }
    });

    it("保留 bare package 并忽略 builtin、本地模块和非字面量 dynamic import", async () => {
        const projectRoot = resolve("C:/build/neuro-book");
        const serverRoot = resolve(projectRoot, ".output/server");
        const importerPath = resolve(serverRoot, "index.mjs");
        const source = [
            "import 'node:fs';",
            "import 'crypto';",
            "import 'bun:ffi';",
            "import '#internal/nitro';",
            "import './chunks/local.mjs';",
            "import 'zod';",
            "export * from 'zod';",
            "const name = './chunks/dynamic.mjs';",
            "void import(name);",
        ].join("\n");

        const result = await analyzeRuntimeModuleSource({source, importerPath, serverRoot, projectRoot});

        expect(result.seeds).toEqual(["zod"]);
        expect(result.references).toHaveLength(2);
        expect(result.rewriteCount).toBe(0);
        expect(result.source).toBe(source);
    });

    it("支持 POSIX file URL 和深层 Bun store 路径", async () => {
        const projectRoot = resolve("C:/build/neuro-book");
        const serverRoot = resolve(projectRoot, ".output/server");
        const importerPath = resolve(serverRoot, "chunks/deep/route.mjs");
        const source = "import pkg from 'file:///home/build/node_modules/.bun/@scope+pkg@1.2.3/node_modules/@scope/pkg/dist/index.js#entry';";

        const result = await analyzeRuntimeModuleSource({source, importerPath, serverRoot, projectRoot});

        expect(result.seeds).toEqual(["@scope/pkg"]);
        expect(result.source).toContain("../../node_modules/@scope/pkg/dist/index.js#entry");
    });

    it("物理包与 hoisted package 版本不一致时 fail closed", async () => {
        const root = await temporaryRoot();
        const serverRoot = join(root, ".output", "server");
        const importerPath = join(serverRoot, "index.mjs");
        const physicalRoot = join(root, "node_modules", ".bun", "pkg@1.0.0", "node_modules", "pkg");
        const hoistedRoot = join(root, "node_modules", "pkg");
        await writePackage(physicalRoot, "pkg", "1.0.0");
        await writePackage(hoistedRoot, "pkg", "2.0.0");
        const result = await analyzeRuntimeModuleSource({
            source: "import './node_modules/.bun/pkg@1.0.0/node_modules/pkg/index.js';",
            importerPath,
            serverRoot,
            projectRoot: root,
        });

        await expect(assertRuntimePackageIdentity(result.references[0]!, root)).rejects.toThrow(
            "Nitro runtime package 无法扁平化：pkg",
        );

        await writePackage(hoistedRoot, "pkg", "1.0.0");
        await expect(assertRuntimePackageIdentity(result.references[0]!, root)).resolves.toBeUndefined();
    });

    it("复核规范化后的 Product vendor 文件真实存在", async () => {
        const root = await temporaryRoot();
        const serverRoot = join(root, ".output", "server");
        const importerPath = join(serverRoot, "chunks", "route.mjs");
        const packageFile = join(serverRoot, "node_modules", "pkg", "index.js");
        await mkdir(resolve(packageFile, ".."), {recursive: true});
        await mkdir(resolve(importerPath, ".."), {recursive: true});
        await writeFile(packageFile, "export default true;\n", "utf8");
        await writeFile(importerPath, "import pkg from '../node_modules/pkg/index.js';\nexport default pkg;\n", "utf8");

        await expect(assertRuntimeModuleFiles({
            filePaths: [importerPath],
            serverRoot,
            projectRoot: root,
        })).resolves.toEqual({checked: 1});

        await writeFile(
            importerPath,
            "import pkg from '../node_modules/.bun/pkg@1.0.0/node_modules/pkg/index.js';\nexport default pkg;\n",
            "utf8",
        );
        await expect(assertRuntimeModuleFiles({
            filePaths: [importerPath],
            serverRoot,
            projectRoot: root,
        })).rejects.toThrow("Nitro runtime module 仍包含不可迁移或缺失的 Product vendor 引用");
    });
});

/** 创建由本测试拥有的临时目录。 */
async function temporaryRoot(): Promise<string> {
    const root = await mkdtemp(testHostPath("nbook-runtime-specifier-"));
    temporaryRoots.push(root);
    return root;
}

/** 写入最小 package identity fixture。 */
async function writePackage(packageRoot: string, name: string, version: string): Promise<void> {
    await mkdir(packageRoot, {recursive: true});
    await writeFile(join(packageRoot, "package.json"), `${JSON.stringify({name, version})}\n`, "utf8");
}
