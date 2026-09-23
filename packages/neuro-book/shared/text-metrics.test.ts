import { describe, expect, it } from "vitest";
import { countSelectionWords, countWords, stripMarkdown } from "./text-metrics";

describe("text-metrics", () => {
    describe("stripMarkdown", () => {
        it("should strip frontmatter", () => {
            const md = `---
title: 测试章节
status: draft
---
这是正文内容。`;
            expect(stripMarkdown(md)).toBe("这是正文内容。");
        });

        it("should strip headings, bold, italic, and strikethrough", () => {
            const md = "# 一级标题\n\n## 二级标题\n\n这是**粗体**和*斜体*以及~~删除线~~。";
            expect(stripMarkdown(md)).toBe("一级标题\n\n二级标题\n\n这是粗体和斜体以及删除线。");
        });

        it("should strip blockquotes and list markers", () => {
            const md = "> 这是一段引用\n\n- 无序列表1\n* 无序列表2\n1. 有序列表1";
            expect(stripMarkdown(md)).toBe("这是一段引用\n\n无序列表1\n无序列表2\n有序列表1");
        });

        it("should strip links and images keeping text", () => {
            const md = "点击[这里](https://example.com)查看![插图说明](https://example.com/pic.png)。";
            expect(stripMarkdown(md)).toBe("点击这里查看插图说明。");
        });

        it("should strip code blocks and inline code markers", () => {
            const md = "行内`代码`与代码块：\n\n```typescript\nconst a = 1;\n```";
            expect(stripMarkdown(md)).toBe("行内代码与代码块：\n\nconst a = 1;");
        });

        it("should strip horizontal rules and HTML tags", () => {
            const md = "段落一\n\n---\n\n<span class=\"highlight\">高亮文字</span>\n\n<!-- 注释内容 -->";
            expect(stripMarkdown(md)).toBe("段落一\n\n高亮文字");
        });
    });

    describe("countWords", () => {
        it("should return 0 for empty or whitespace-only text", () => {
            expect(countWords("")).toBe(0);
            expect(countWords("   \n\t  \u3000 ")).toBe(0);
        });

        it("should count chinese characters and punctuations as 1 each", () => {
            expect(countWords("天地玄黄，宇宙洪荒。")).toBe(10);
        });

        it("should count english characters and punctuations as 1 each (no spaces counted)", () => {
            expect(countWords("Hello, world!")).toBe(12);
        });

        it("should count mixed chinese and english without counting spaces", () => {
            expect(countWords("AI 时代的小说创作！")).toBe(10);
        });

        it("should strip markdown marks before counting", () => {
            const md = "# 第一章 启程\n\n**少年**手握长剑。";
            expect(countWords(md)).toBe(12);
        });

        it("should strip frontmatter before counting", () => {
            const md = `---
title: 第一章
summary: 概述内容
---
正文开始。`;
            expect(countWords(md)).toBe(5);
        });

        it("should handle astral plane unicode (emoji / surrogate pairs)", () => {
            expect(countWords("修仙🚀起飞")).toBe(5);
        });
    });

    describe("countSelectionWords", () => {
        it("should return 0 for empty selection", () => {
            expect(countSelectionWords("")).toBe(0);
            expect(countSelectionWords("   \n ")).toBe(0);
        });

        it("should count words in selected text correctly", () => {
            expect(countSelectionWords("**被选中的文本**")).toBe(6);
            expect(countSelectionWords("选中的 text 123")).toBe(10);
        });
    });
});
