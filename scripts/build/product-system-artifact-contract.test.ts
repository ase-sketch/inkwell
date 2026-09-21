import {mkdir, mkdtemp, rm, writeFile} from "node:fs/promises";
import {join} from "node:path";
import { testHostPath } from "@notnotype/neuro-book-test-support/test-path"
import {afterEach, describe, expect, it} from "vitest";

import {assertProductSystemArtifactModulePaths} from "#scripts/build/product-system-artifact-contract";

const roots: string[] = [];

afterEach(async () => {
    await Promise.all(roots.splice(0).map((root) => rm(root, {recursive: true, force: true})));
});

describe("Product system artifact path gate", () => {
    it("允许 Product 内部相对路径", async () => {
        const root = await fixtureRoot();
        await writeFile(
            join(root, "safe.mjs"),
            [
                'export const path = "./node_modules/typebox/build/index.mjs";',
                'export {resolveApiErrorMessage} from "nbook/app/utils/api-error";',
                'export const applicationRoot = "/app";',
            ].join("\n"),
            "utf8",
        );

        await expect(assertProductSystemArtifactModulePaths(root, ["C:/source", "/app"])).resolves.toBeUndefined();
    });

    it("拒绝短 POSIX Source Root 的真实绝对路径", async () => {
        const root = await fixtureRoot();
        await writeFile(
            join(root, "leaked.mjs"),
            'export const path = "/app/.deploy/staging/build/server/entry.mjs";\n',
            "utf8",
        );

        await expect(assertProductSystemArtifactModulePaths(root, ["/app"])).rejects.toThrow("泄漏");
    });

    it("拒绝构建机绝对路径、Bun/pnpm store 与 Nitro fallback", async () => {
        const cases = [
            'export const path = "C:\\\\work\\\\node_modules\\\\.bun\\\\typebox\\\\index.mjs";\n',
            'export const path = "file:///C:/work/node_modules/.pnpm/typebox/index.mjs";\n',
            'export const path = "file:///_entry.js";\n',
        ];
        for (const [index, source] of cases.entries()) {
            const root = await fixtureRoot();
            await writeFile(join(root, `${String(index)}.mjs`), source, "utf8");
            await expect(assertProductSystemArtifactModulePaths(root)).rejects.toThrow("泄漏");
            await rm(root, {recursive: true, force: true});
            roots.splice(roots.indexOf(root), 1);
        }
    });
});

async function fixtureRoot(): Promise<string> {
    const root = await mkdtemp(testHostPath("nbook-system-artifact-contract-"));
    roots.push(root);
    await mkdir(root, {recursive: true});
    return root;
}
