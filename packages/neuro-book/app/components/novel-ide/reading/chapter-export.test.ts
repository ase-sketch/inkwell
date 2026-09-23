import {describe, expect, it} from "vitest";
import type {WorkspaceFileNode} from "nbook/app/stores/novel-ide";
import {
    assembleChaptersTxt,
    exportChaptersToTxt,
    filterChapterNodes,
    formatChapterBody,
    formatChapterTxt,
    isExportableChapterNode,
    resolveExportFilename,
    resolveVolumePrefix,
    sanitizeFilename,
} from "nbook/app/utils/chapter-export";

function mockNode(overrides: Partial<WorkspaceFileNode> & {path: string}): WorkspaceFileNode {
    return {
        mode: "content",
        entryType: "chapter",
        icon: null,
        status: null,
        words: 0,
        refs: [],
        absolutePath: overrides.path,
        isDirectory: false,
        hasIndex: false,
        contentNode: true,
        summary: "",
        title: overrides.title ?? overrides.path,
        frontmatter: {},
        frontmatterError: null,
        state: null,
        size: 0,
        mtimeMs: 0,
        editable: true,
        ...overrides,
    };
}

describe("chapter-export formatting", () => {
    describe("formatChapterBody", () => {
        it("prepends two full-width spaces to paragraphs", () => {
            const raw = "第一段文字。\n\n第二段文字。";
            const formatted = formatChapterBody(raw);
            expect(formatted).toBe("\u3000\u3000第一段文字。\n\n\u3000\u3000第二段文字。");
        });

        it("cleans existing full-width spaces and ASCII spaces to avoid double indent", () => {
            const raw = "\u3000\u3000已有全角缩进。\n\n   已有半角空格缩进。";
            const formatted = formatChapterBody(raw);
            expect(formatted).toBe("\u3000\u3000已有全角缩进。\n\n\u3000\u3000已有半角空格缩进。");
        });

        it("condenses multiple consecutive empty lines to a single empty line", () => {
            const raw = "第一段。\n\n\n\n\n第二段。\n\n\n第三段。";
            const formatted = formatChapterBody(raw);
            expect(formatted).toBe("\u3000\u3000第一段。\n\n\u3000\u3000第二段。\n\n\u3000\u3000第三段。");
        });

        it("handles empty or whitespace-only inputs", () => {
            expect(formatChapterBody("")).toBe("");
            expect(formatChapterBody("   \n\n   \n\t")).toBe("");
        });
    });

    describe("formatChapterTxt", () => {
        it("combines chapter title line with formatted body and strips frontmatter", () => {
            const raw = `---
title: "第一章 初始"
status: draft
---

这是第一段。

这是第二段。`;
            const result = formatChapterTxt("第一章 初始", raw);
            expect(result).toBe("第一章 初始\n\n\u3000\u3000这是第一段。\n\n\u3000\u3000这是第二段。");
        });

        it("strips duplicate markdown heading from body if it matches title", () => {
            const raw = `# 第一章 初始

这是第一段。`;
            const result = formatChapterTxt("第一章 初始", raw);
            expect(result).toBe("第一章 初始\n\n\u3000\u3000这是第一段。");
        });

        it("handles empty title or empty body gracefully", () => {
            expect(formatChapterTxt("", "正文段落")).toBe("\u3000\u3000正文段落");
            expect(formatChapterTxt("仅有标题", "")).toBe("仅有标题");
        });
    });

    describe("assembleChaptersTxt", () => {
        it("assembles multiple chapters with clear cross-chapter spacing", () => {
            const chapters = [
                {title: "第一章", content: "第一章正文。"},
                {title: "第二章", content: "第二章正文。"},
            ];
            const assembled = assembleChaptersTxt(chapters);
            expect(assembled).toBe(
                "第一章\n\n\u3000\u3000第一章正文。\n\n\n\n第二章\n\n\u3000\u3000第二章正文。"
            );
        });
    });
});

describe("chapter-export node filtering & sorting", () => {
    const nodes: WorkspaceFileNode[] = [
        mockNode({path: "manuscript/index.md", title: "正文根说明"}),
        mockNode({path: "manuscript/001-volume/index.md", entryType: "volume", title: "第一卷说明"}),
        mockNode({path: "manuscript/001-volume/002-chapter/index.md", title: "第二章"}),
        mockNode({path: "manuscript/001-volume/001-chapter/index.md", title: "第一章"}),
        mockNode({path: "manuscript/002-volume/index.md", entryType: "volume", title: "第二卷说明"}),
        mockNode({path: "manuscript/002-volume/001-chapter/index.md", title: "第二卷第一章"}),
        mockNode({path: "outline/001-outline/index.md", title: "大纲文档"}),
    ];

    it("identifies exportable chapter nodes", () => {
        expect(isExportableChapterNode(nodes[0]!)).toBe(false); // manuscript/index.md
        expect(isExportableChapterNode(nodes[1]!)).toBe(false); // volume index
        expect(isExportableChapterNode(nodes[2]!)).toBe(true);  // chapter 2
        expect(isExportableChapterNode(nodes[3]!)).toBe(true);  // chapter 1
    });

    it("resolves volume prefix correctly", () => {
        expect(resolveVolumePrefix("manuscript/001-volume/001-chapter/index.md")).toBe("manuscript/001-volume/");
        expect(resolveVolumePrefix("manuscript/chapter1.md")).toBe("manuscript/");
    });

    it("filters single chapter for scope='chapter'", () => {
        const result = filterChapterNodes(nodes, "manuscript/001-volume/001-chapter/index.md", "chapter");
        expect(result).toHaveLength(1);
        expect(result[0]!.title).toBe("第一章");
    });

    it("filters and sorts volume chapters in lexicographical order for scope='volume'", () => {
        const result = filterChapterNodes(nodes, "manuscript/001-volume/002-chapter/index.md", "volume");
        expect(result).toHaveLength(2);
        expect(result[0]!.path).toBe("manuscript/001-volume/001-chapter/index.md");
        expect(result[1]!.path).toBe("manuscript/001-volume/002-chapter/index.md");
    });

    it("filters and sorts all book chapters in lexicographical order for scope='book'", () => {
        const result = filterChapterNodes(nodes, "manuscript/001-volume/001-chapter/index.md", "book");
        expect(result).toHaveLength(3);
        expect(result[0]!.path).toBe("manuscript/001-volume/001-chapter/index.md");
        expect(result[1]!.path).toBe("manuscript/001-volume/002-chapter/index.md");
        expect(result[2]!.path).toBe("manuscript/002-volume/001-chapter/index.md");
    });
});

describe("chapter-export filename generation", () => {
    it("sanitizes illegal filename characters", () => {
        expect(sanitizeFilename("第1章: 测试/标题?*")).toBe("第1章_ 测试_标题__");
    });

    it("resolves filenames based on scope", () => {
        const node = mockNode({path: "manuscript/001-volume/001-chapter/index.md", title: "第一章 启程"});
        expect(resolveExportFilename({
            activeNode: node,
            activePath: node.path,
            scope: "chapter",
        })).toBe("第一章 启程.txt");

        expect(resolveExportFilename({
            activeNode: node,
            activePath: node.path,
            scope: "volume",
            novelTitle: "我的小说",
            volumeTitle: "第一卷",
        })).toBe("我的小说_第一卷.txt");

        expect(resolveExportFilename({
            activeNode: node,
            activePath: node.path,
            scope: "book",
            novelTitle: "我的小说",
        })).toBe("我的小说.txt");
    });
});
describe("exportChaptersToTxt async assembly", () => {
    it("reads multiple chapters via readContent and produces final export text", async () => {
        const nodes: WorkspaceFileNode[] = [
            mockNode({path: "manuscript/001-volume/001-chapter/index.md", title: "第一章"}),
            mockNode({path: "manuscript/001-volume/002-chapter/index.md", title: "第二章"}),
        ];
        const storeContent: Record<string, string> = {
            "manuscript/001-volume/001-chapter/index.md": "第一章正文内容。",
            "manuscript/001-volume/002-chapter/index.md": "第二章正文内容。",
        };

        const result = await exportChaptersToTxt({
            scope: "volume",
            activePath: "manuscript/001-volume/001-chapter/index.md",
            allNodes: nodes,
            readContent: (path) => Promise.resolve(storeContent[path] ?? ""),
            novelTitle: "测试作品",
            volumeTitle: "第一卷",
        });

        expect(result.chapterCount).toBe(2);
        expect(result.filename).toBe("测试作品_第一卷.txt");
        expect(result.text).toContain("第一章\n\n\u3000\u3000第一章正文内容。");
        expect(result.text).toContain("第二章\n\n\u3000\u3000第二章正文内容。");
    });
});
