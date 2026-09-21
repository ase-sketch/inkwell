import {createRequire} from "node:module";
import {mkdir, mkdtemp, readFile, rm, writeFile} from "node:fs/promises";
import { testHostPath } from "@notnotype/neuro-book-test-support/test-path"
import {dirname, join} from "node:path";
import {afterEach, describe, expect, it} from "vitest";

import {rewriteProductPackageIslandImports} from "#scripts/build/product-package-island-imports";

const temporaryRoots: string[] = [];

afterEach(async () => {
    await Promise.all(temporaryRoots.splice(0).map((root) => rm(root, {recursive: true, force: true})));
});

describe("Product package-island imports", () => {
    it("按每个 importer 深度改写，并为 exports 拒绝的 Sharp/sqlite-vec subpath 回退到 package root", async () => {
        const root = await mkdtemp(testHostPath("nbook-package-island-imports-"));
        temporaryRoots.push(root);
        const serverRoot = join(root, "server");
        const sourceRequire = createRequire(import.meta.url);

        expect(() => sourceRequire.resolve("sharp/dist/index.mjs")).toThrow();
        expect(() => sourceRequire.resolve("sqlite-vec/index.mjs")).toThrow();

        await Promise.all([
            writeModule(join(serverRoot, "index.mjs"), [
                'import ts from "typescript";',
                'import {ProxyAgent} from "undici";',
                'import sharp from "sharp/dist/index.mjs";',
                "export default [ts, ProxyAgent, sharp];",
            ].join("\n")),
            writeModule(join(serverRoot, "commands", "chunks", "deep.mjs"), [
                'export const sqlite = import("sqlite-vec/index.mjs");',
            ].join("\n")),
            writeModule(join(serverRoot, "authoring", "worker.mjs"), [
                'export {default as sharp} from "sharp/dist/index.mjs";',
            ].join("\n")),
            writeModule(join(serverRoot, "node_modules", "typescript", "lib", "typescript.js"), "module.exports = {};\n"),
            writeModule(join(serverRoot, "node_modules", "undici", "index.js"), "module.exports = {};\n"),
            writeModule(join(serverRoot, "node_modules", "sharp", "dist", "index.mjs"), "export default {};\n"),
            writeModule(join(serverRoot, "node_modules", "sqlite-vec", "index.mjs"), "export default {};\n"),
        ]);

        const result = await rewriteProductPackageIslandImports({
            serverRoot,
            packageNames: ["typescript", "undici", "sharp", "sqlite-vec"],
        });

        expect(result).toEqual({
            scannedFiles: 3,
            rewrittenFiles: 3,
            rewrittenReferences: 5,
            packages: ["sharp", "sqlite-vec", "typescript", "undici"],
        });
        expect(await readFile(join(serverRoot, "index.mjs"), "utf8"))
            .toContain('from "./node_modules/typescript/lib/typescript.js"');
        expect(await readFile(join(serverRoot, "index.mjs"), "utf8"))
            .toContain('from "./node_modules/undici/index.js"');
        expect(await readFile(join(serverRoot, "index.mjs"), "utf8"))
            .toContain('from "./node_modules/sharp/dist/index.mjs"');
        expect(await readFile(join(serverRoot, "commands", "chunks", "deep.mjs"), "utf8"))
            .toContain('import("../../node_modules/sqlite-vec/index.mjs")');
        expect(await readFile(join(serverRoot, "authoring", "worker.mjs"), "utf8"))
            .toContain('from "../node_modules/sharp/dist/index.mjs"');
    });

    it("拒绝改写到 package root 外或不存在的目标", async () => {
        const root = await mkdtemp(testHostPath("nbook-package-island-invalid-"));
        temporaryRoots.push(root);
        const serverRoot = join(root, "server");
        await Promise.all([
            writeModule(join(serverRoot, "index.mjs"), 'import "sharp/missing.mjs";\n'),
            writeModule(join(serverRoot, "commands", "placeholder.mjs"), "export default true;\n"),
            writeModule(join(serverRoot, "authoring", "placeholder.mjs"), "export default true;\n"),
        ]);

        await expect(rewriteProductPackageIslandImports({serverRoot, packageNames: ["sharp"]}))
            .rejects.toThrow("Product package island import sharp/missing.mjs 不存在");
    });
});

/** 写入测试模块，并创建其父目录。 */
async function writeModule(filePath: string, source: string): Promise<void> {
    await mkdir(dirname(filePath), {recursive: true});
    await writeFile(filePath, source, "utf8");
}
