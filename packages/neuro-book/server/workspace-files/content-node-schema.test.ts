import { describe, expect, it } from "vitest";
import {
    WorkspaceContentAnchorSchema,
    WorkspaceContentFrontmatterSchema,
    createWorkspaceContentFrontmatterDefaults,
    applyWorkspaceContentFrontmatterDefaults,
} from "./content-node-schema";

describe("content-node-schema anchors specification", () => {
    const validBaseFrontmatter = {
        title: "测试条目",
        type: "character",
        subtype: "person",
        status: "active",
        icon: "user",
        aliases: ["别名A", "别名B"],
        tags: ["主角", "剑客"],
        summary: "核心人物设定摘要",
        refs: [],
        retrieval: { enabled: true, trigger: null },
        governance: { source: "manual", review: "reviewed" },
        ext: {},
    };

    it("should allow frontmatter without anchors for backward compatibility", () => {
        const parsed = WorkspaceContentFrontmatterSchema.parse(validBaseFrontmatter);
        expect(parsed.title).toBe("测试条目");
        expect(parsed.anchors).toBeUndefined();
    });

    it("should allow frontmatter with empty anchors array", () => {
        const parsed = WorkspaceContentFrontmatterSchema.parse({
            ...validBaseFrontmatter,
            anchors: [],
        });
        expect(parsed.anchors).toEqual([]);
    });

    it("should validate valid anchors with chapter, quote, and optional note", () => {
        const parsed = WorkspaceContentFrontmatterSchema.parse({
            ...validBaseFrontmatter,
            anchors: [
                {
                    chapter: "001-departure",
                    quote: "少年背负长剑，迎着晨曦离开了村庄。",
                },
                {
                    chapter: "第一章 启程",
                    quote: "他手中所持的正是那柄传家古剑。",
                    note: "首次提及武器背景",
                },
            ],
        });

        expect(parsed.anchors).toBeDefined();
        expect(parsed.anchors).toHaveLength(2);
        expect(parsed.anchors![0]).toEqual({
            chapter: "001-departure",
            quote: "少年背负长剑，迎着晨曦离开了村庄。",
        });
        expect(parsed.anchors![1].note).toBe("首次提及武器背景");
    });

    it("should reject anchors if chapter is missing or not a string", () => {
        expect(() => {
            WorkspaceContentFrontmatterSchema.parse({
                ...validBaseFrontmatter,
                anchors: [
                    {
                        quote: "缺少章节信息的引用",
                    },
                ],
            });
        }).toThrow();

        expect(() => {
            WorkspaceContentFrontmatterSchema.parse({
                ...validBaseFrontmatter,
                anchors: [
                    {
                        chapter: 123,
                        quote: "章节类型错误",
                    },
                ],
            });
        }).toThrow();
    });

    it("should reject anchors if quote is missing or not a string", () => {
        expect(() => {
            WorkspaceContentFrontmatterSchema.parse({
                ...validBaseFrontmatter,
                anchors: [
                    {
                        chapter: "001-departure",
                    },
                ],
            });
        }).toThrow();

        expect(() => {
            WorkspaceContentFrontmatterSchema.parse({
                ...validBaseFrontmatter,
                anchors: [
                    {
                        chapter: "001-departure",
                        quote: null,
                    },
                ],
            });
        }).toThrow();
    });

    it("should reject anchors if note is present but not a string", () => {
        expect(() => {
            WorkspaceContentFrontmatterSchema.parse({
                ...validBaseFrontmatter,
                anchors: [
                    {
                        chapter: "001-departure",
                        quote: "合法引用",
                        note: 999,
                    },
                ],
            });
        }).toThrow();
    });

    it("should include anchors: [] in createWorkspaceContentFrontmatterDefaults", () => {
        const defaults = createWorkspaceContentFrontmatterDefaults({
            title: "新条目",
            type: "character",
        });

        expect(defaults.anchors).toEqual([]);
    });

    it("should populate anchors: [] when applying defaults to frontmatter lacking anchors", () => {
        const result = applyWorkspaceContentFrontmatterDefaults({
            frontmatter: {
                ...validBaseFrontmatter,
            },
            title: "旧条目",
            type: "character",
        });

        expect(result.frontmatter.anchors).toEqual([]);
        expect(result.changed).toBe(true);
    });
});
