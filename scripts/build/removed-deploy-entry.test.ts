import {readFile} from "node:fs/promises";
import {extname, resolve} from "node:path";
import {describe, expect, it} from "vitest";

import {runCapture} from "#scripts/utils/process.mjs";

const ROOT = resolve(import.meta.dirname, "..", "..");
const textExtensions = new Set([
    ".cmd", ".html", ".js", ".json", ".md", ".mjs", ".ps1", ".sh", ".ts", ".vue", ".yaml", ".yml",
]);

describe("旧部署入口清理", () => {
    it("Git受管文本不再包含已删除的命令或GitHub包入口", async () => {
        const removedCommand = ["neuro", "book", "deploy"].join("-");
        const removedGitPackage = ["github:notnotype", "neuro-book"].join("/");
        const files = (await runCapture("git", ["ls-files", "-z"], {cwd: ROOT}))
            .split("\0")
            .filter(Boolean)
            .filter((path) => textExtensions.has(extname(path).toLowerCase()));
        const matches: string[] = [];

        for (const path of files) {
            if (path.includes(removedCommand)) matches.push(`${path}（文件名）`);
            const content = await readFile(resolve(ROOT, path), "utf8").catch((error: NodeJS.ErrnoException) => {
                if (error.code === "ENOENT") return null;
                throw error;
            });
            if (content === null) continue;
            if (content.includes(removedCommand) || content.includes(removedGitPackage)) matches.push(path);
        }

        expect(matches).toEqual([]);
    });
});
