import fs from "node:fs/promises";
import path from "node:path";
import {describe, expect, it} from "vitest";

describe("package 隔离边界", () => {
    it("源码不包含 NeuroBook、Web framework、数据库或 Project Artifact 领域", async () => {
        const sourceDirectory = path.resolve(import.meta.dirname, "../src");
        const fileNames = await fs.readdir(sourceDirectory);
        const contents = await Promise.all(fileNames
            .filter((fileName) => fileName.endsWith(".ts"))
            .map((fileName) => fs.readFile(path.join(sourceDirectory, fileName), "utf8")));
        const source = contents.join("\n");

        expect(source).not.toMatch(/from\s+["']nbook\//);
        expect(source).not.toMatch(/from\s+["'](?:nuxt|h3|pinia|#imports)/);
        expect(source).not.toContain("ProjectSession");
        expect(source).not.toContain("WorkspaceFileNode");
        expect(source).not.toMatch(/(?:sqlite|libsql|prisma)/i);
        expect(source).not.toMatch(/(?:\.nbook|\.agent|frontmatter|workspace\/)/i);
    });

    it("manifest 没有 production dependency，开发命令不依赖 monorepo 相对路径", async () => {
        const packagePath = path.resolve(import.meta.dirname, "../package.json");
        const manifest = JSON.parse(await fs.readFile(packagePath, "utf8")) as {
            dependencies?: object;
            scripts: Record<string, string>;
        };

        expect(manifest.dependencies).toBeUndefined();
        expect(Object.values(manifest.scripts).join("\n")).not.toMatch(/\.\.\/\.\.\/node_modules/);
    });

    it("不保留无生产消费者的 projection/store Interface", async () => {
        const packageDirectory = path.resolve(import.meta.dirname, "..");
        const sourceDirectory = path.join(packageDirectory, "src");
        const sourceFileNames = await fs.readdir(sourceDirectory);
        const source = (await Promise.all(sourceFileNames
            .filter((fileName) => fileName.endsWith(".ts"))
            .map((fileName) => fs.readFile(path.join(sourceDirectory, fileName), "utf8"))))
            .join("\n");
        const manifest = JSON.parse(await fs.readFile(path.join(packageDirectory, "package.json"), "utf8")) as {
            exports: Record<string, string>;
        };

        expect(sourceFileNames).not.toContain("json-projection-store.ts");
        expect(source).not.toMatch(/\b(?:JsonProjectionStore|PersistedProjection|ProjectionReadResult|ProjectionStore|SnapshotProjection|readProjection)\b/);
        expect(manifest.exports).not.toHaveProperty("./node");
    });
});
