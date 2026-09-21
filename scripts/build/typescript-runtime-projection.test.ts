import {createRequire} from "node:module";
import {mkdtemp, mkdir, readFile, rm, writeFile} from "node:fs/promises";
import { testHostPath } from "@notnotype/neuro-book-test-support/test-path"
import {join, resolve} from "node:path";
import {afterEach, describe, expect, it} from "vitest";
import {projectTypeScriptRuntime} from "#scripts/build/typescript-runtime-projection";

const roots: string[] = [];

afterEach(async () => {
    await Promise.all(roots.splice(0).map((root) => rm(root, {recursive: true, force: true})));
});

describe("TypeScript Runtime Projection", () => {
    it("只复制package入口和递归lib reference闭包", async () => {
        const root = await temporaryRoot("nbook-typescript-projection-fixture-");
        const sourceRoot = join(root, "source");
        const targetRoot = join(root, "target");
        await writeFixture(sourceRoot);
        const tsconfigPath = join(root, "tsconfig.json");
        await writeFile(tsconfigPath, JSON.stringify({compilerOptions: {target: "ESNext", lib: ["ESNext"]}}), "utf8");

        const result = await projectTypeScriptRuntime({sourceRoot, targetRoot, authoringTsconfigPath: tsconfigPath});

        expect(result.files).toEqual([
            "lib/lib.es2024.d.ts",
            "lib/lib.esnext.d.ts",
            "lib/typescript.d.ts",
            "lib/typescript.js",
            "package.json",
        ]);
        expect(await readFile(join(targetRoot, "package.json"), "utf8")).not.toContain("ignored");
        expect(result.files).not.toContain("lib/tsserver.js");
        expect(result.files.length).toBeLessThan(result.sourceFiles);
    });

    it("真实Projection保留compiler、默认lib、transpile与AST能力并减少文件字节", async () => {
        const root = await temporaryRoot("nbook-typescript-projection-real-");
        const targetRoot = join(root, "typescript");
        const tsconfigPath = join(root, "tsconfig.json");
        await writeFile(tsconfigPath, JSON.stringify({compilerOptions: {target: "ESNext"}}), "utf8");
        const result = await projectTypeScriptRuntime({
            sourceRoot: resolve("node_modules", "typescript"),
            targetRoot,
            authoringTsconfigPath: tsconfigPath,
        });

        const requireFromProjection = createRequire(join(targetRoot, "package.json"));
        const ts = requireFromProjection(targetRoot) as typeof import("typescript");
        const sourcePath = join(root, "authoring.ts");
        await writeFile(sourcePath, "const value: Promise<string> = Promise.resolve(document.title);\n", "utf8");
        const program = ts.createProgram({
            rootNames: [sourcePath],
            options: {
                target: ts.ScriptTarget.ESNext,
                module: ts.ModuleKind.ESNext,
                moduleResolution: ts.ModuleResolutionKind.Bundler,
                types: [],
                noEmit: true,
            },
        });

        expect(ts.transpileModule("const value: number = 1", {compilerOptions: {target: ts.ScriptTarget.ES2022}}).outputText)
            .toContain("const value = 1");
        expect(ts.createSourceFile("profile.tsx", "const x = <A />", ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX).statements)
            .toHaveLength(1);
        expect(ts.getPreEmitDiagnostics(program)).toEqual([]);
        expect(result.files.length).toBeLessThan(result.sourceFiles);
        expect(result.bytes).toBeLessThan(result.sourceBytes);
        expect(result.files).not.toContain("lib/_tsserver.js");
    });
});

/** 建立包含一条lib reference和无关server文件的最小package。 */
async function writeFixture(root: string): Promise<void> {
    await mkdir(join(root, "lib"), {recursive: true});
    await Promise.all([
        writeFile(join(root, "package.json"), JSON.stringify({
            name: "typescript",
            version: "1.0.0",
            main: "./lib/typescript.js",
            typings: "./lib/typescript.d.ts",
            ignored: true,
        }), "utf8"),
        writeFile(join(root, "lib", "typescript.js"), "module.exports = {};\n", "utf8"),
        writeFile(join(root, "lib", "typescript.d.ts"), "export declare const version: string;\n", "utf8"),
        writeFile(join(root, "lib", "lib.esnext.d.ts"), '/// <reference lib="es2024" />\n', "utf8"),
        writeFile(join(root, "lib", "lib.es2024.d.ts"), "interface Array<T> {}\n", "utf8"),
        writeFile(join(root, "lib", "tsserver.js"), "ignored\n", "utf8"),
    ]);
}

async function temporaryRoot(prefix: string): Promise<string> {
    const root = await mkdtemp(testHostPath(prefix));
    roots.push(root);
    return root;
}
