import {mkdtemp, mkdir, readFile, rm, writeFile} from "node:fs/promises";
import { testHostPath } from "@notnotype/neuro-book-test-support/test-path"
import {join} from "node:path";
import {describe, expect, it} from "vitest";

import {isRuntimeTestSourcePath, pruneRuntimeTestSources} from "#scripts/utils/runtime-source-prune.mjs";

describe("Product runtime源码清理", () => {
    it("识别跨平台测试源码路径", () => {
        expect(isRuntimeTestSourcePath("server/agent/tools/file-tools.test.ts")).toBe(true);
        expect(isRuntimeTestSourcePath("server\\agent\\__tests__\\fixture.ts")).toBe(true);
        expect(isRuntimeTestSourcePath("server/agent/test/setup.ts")).toBe(true);
        expect(isRuntimeTestSourcePath("server/agent/test-utils/faux-models.ts")).toBe(true);
        expect(isRuntimeTestSourcePath("server/workspace-files/project-session-test-utils.ts")).toBe(true);
        expect(isRuntimeTestSourcePath("server/agent/tools/file-tools.ts")).toBe(false);
    });

    it("删除测试文件和测试目录并保留运行源码", async () => {
        const root = await mkdtemp(testHostPath("nbook-runtime-source-prune-"));
        try {
            await mkdir(join(root, "server", "feature", "__tests__"), {recursive: true});
            await mkdir(join(root, "server", "feature", "test"), {recursive: true});
            await mkdir(join(root, "server", "feature", "test-utils"), {recursive: true});
            await writeFile(join(root, "server", "feature", "runtime.ts"), "export const runtime = true;\n", "utf8");
            await writeFile(join(root, "server", "feature", "runtime.test.ts"), "throw new Error('must not ship');\n", "utf8");
            await writeFile(join(root, "server", "feature", "runtime.spec.mts"), "throw new Error('must not ship');\n", "utf8");
            await writeFile(join(root, "server", "feature", "runtime-test-helper.ts"), "throw new Error('must not ship');\n", "utf8");
            await writeFile(join(root, "server", "feature", "__tests__", "fixture.ts"), "fixture\n", "utf8");
            await writeFile(join(root, "server", "feature", "test", "setup.ts"), "setup\n", "utf8");
            await writeFile(join(root, "server", "feature", "test-utils", "fixture.ts"), "fixture\n", "utf8");

            await pruneRuntimeTestSources(root);

            await expect(readFile(join(root, "server", "feature", "runtime.ts"), "utf8")).resolves.toContain("runtime");
            await expect(readFile(join(root, "server", "feature", "runtime.test.ts"), "utf8")).rejects.toMatchObject({code: "ENOENT"});
            await expect(readFile(join(root, "server", "feature", "runtime.spec.mts"), "utf8")).rejects.toMatchObject({code: "ENOENT"});
            await expect(readFile(join(root, "server", "feature", "runtime-test-helper.ts"), "utf8")).rejects.toMatchObject({code: "ENOENT"});
            await expect(readFile(join(root, "server", "feature", "__tests__", "fixture.ts"), "utf8")).rejects.toMatchObject({code: "ENOENT"});
            await expect(readFile(join(root, "server", "feature", "test", "setup.ts"), "utf8")).rejects.toMatchObject({code: "ENOENT"});
            await expect(readFile(join(root, "server", "feature", "test-utils", "fixture.ts"), "utf8")).rejects.toMatchObject({code: "ENOENT"});
        } finally {
            await rm(root, {recursive: true, force: true});
        }
    });
});
