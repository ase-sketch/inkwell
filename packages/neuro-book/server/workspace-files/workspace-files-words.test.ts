import { describe, expect, it } from "vitest";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { countWords } from "nbook/shared/text-metrics";

const wsFilesPath = fileURLToPath(new URL("./workspace-files.ts", import.meta.url));

describe("workspace-files words calculation", () => {
    it("workspace-files.ts 导入并使用 countWords", async () => {
        const source = await readFile(wsFilesPath, "utf-8");
        expect(source).toContain('import {countWords} from "nbook/shared/text-metrics";');
        expect(source).toContain("words: countWords(body),");
        // 原先虚高的 body.trim().length 不再用于 buildWorkspaceNode
        expect(source).not.toContain("words: body.trim().length,");
    });

    it("countWords 排除 Markdown 语法虚高字符", () => {
        const markdownBody = `# 第一章 启程

**少年**拔出长剑，望向远方：

> "风起了。"

[返回目录](https://example.com/toc)
`;
        const oldWords = markdownBody.trim().length;
        const newWords = countWords(markdownBody);

        expect(newWords).toBeLessThan(oldWords);
        // 第一章启程(5) + 少年拔出长剑，望向远方：(12) + "风起了。"(6) + 返回目录(4) = 27
        expect(newWords).toBe(27);
    });
});
