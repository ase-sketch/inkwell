import {describe, expect, it} from "vitest";
import {
    resolveCurrentChapter,
    readChapterContent,
    parseManuscriptChapterPath,
    type CurrentChapterInfo,
} from "./current-chapter-context";

describe("current-chapter-context", () => {
    describe("parseManuscriptChapterPath", () => {
        it("正确解析标准 manuscript/{volume}/{chapter}/index.md 路径", () => {
            expect(parseManuscriptChapterPath("manuscript/001-vol/002-ch/index.md")).toEqual({
                volume: "001-vol",
                chapter: "002-ch",
                manuscriptPath: "manuscript/001-vol/002-ch/index.md",
            });
        });

        it("支持 Windows 反斜杠与前后空白、斜杠", () => {
            expect(parseManuscriptChapterPath("  manuscript\\vol-1\\ch-1\\index.md  ")).toEqual({
                volume: "vol-1",
                chapter: "ch-1",
                manuscriptPath: "manuscript/vol-1/ch-1/index.md",
            });
            expect(parseManuscriptChapterPath("/manuscript/vol-1/ch-1/index.md/")).toEqual({
                volume: "vol-1",
                chapter: "ch-1",
                manuscriptPath: "manuscript/vol-1/ch-1/index.md",
            });
        });

        it("支持带有 workspace 前缀的路径", () => {
            expect(parseManuscriptChapterPath("workspace/my-novel/manuscript/001/002/index.md")).toEqual({
                volume: "001",
                chapter: "002",
                manuscriptPath: "manuscript/001/002/index.md",
            });
        });

        it("非 manuscript 或非三层 index.md 结构返回 null", () => {
            expect(parseManuscriptChapterPath(null)).toBeNull();
            expect(parseManuscriptChapterPath(undefined)).toBeNull();
            expect(parseManuscriptChapterPath("")).toBeNull();
            expect(parseManuscriptChapterPath("   ")).toBeNull();
            expect(parseManuscriptChapterPath("lorebook/characters/hero/index.md")).toBeNull();
            expect(parseManuscriptChapterPath("manuscript/chapter-01.md")).toBeNull();
            expect(parseManuscriptChapterPath("manuscript/001-vol/index.md")).toBeNull();
            expect(parseManuscriptChapterPath("manuscript/001-vol/002-ch/other.md")).toBeNull();
            expect(parseManuscriptChapterPath("manuscript/001-vol/002-ch/sub/index.md")).toBeNull();
        });
    });

    describe("resolveCurrentChapter", () => {
        const mockChapters = [
            {name: "001-ch", sortOrder: 0},
            {name: "002-ch", sortOrder: 1},
            {name: "custom-ch-ptr", sortOrder: 2},
        ];

        it("当 frontmatter.chapter 存在时优先采用并关联 StoryChapter", async () => {
            const fileContent = `---
chapter: custom-ch-ptr
title: 自定义章名
---
# 正文内容
这是第一段`;

            const result = await resolveCurrentChapter("manuscript/001-vol/002-ch/index.md", {
                chapters: mockChapters,
                readText: () => fileContent,
            });

            expect(result).toEqual({
                chapterName: "custom-ch-ptr",
                sortOrder: 2,
                manuscriptPath: "manuscript/001-vol/002-ch/index.md",
            });
        });

        it("当无 frontmatter 或无 chapter 指针时，以目录名兜底匹配 StoryChapter.name", async () => {
            const fileContent = `---
title: 只有标题
---
正文`;

            const result = await resolveCurrentChapter("manuscript/001-vol/002-ch/index.md", {
                chapters: mockChapters,
                readText: () => fileContent,
            });

            expect(result).toEqual({
                chapterName: "002-ch",
                sortOrder: 1,
                manuscriptPath: "manuscript/001-vol/002-ch/index.md",
            });
        });

        it("当 frontmatter 中指针在 Plot 中不存在时，回退尝试目录名匹配", async () => {
            const fileContent = `---
chapter: non-existent-chapter
---
正文`;

            const result = await resolveCurrentChapter("manuscript/001-vol/002-ch/index.md", {
                chapters: mockChapters,
                readText: () => fileContent,
            });

            expect(result).toEqual({
                chapterName: "002-ch",
                sortOrder: 1,
                manuscriptPath: "manuscript/001-vol/002-ch/index.md",
            });
        });

        it("若指针与目录名均未匹配 StoryChapter 则返回 null，不抛错", async () => {
            const result = await resolveCurrentChapter("manuscript/001-vol/999-unknown/index.md", {
                chapters: mockChapters,
                readText: () => "无 frontmatter 正文",
            });

            expect(result).toBeNull();
        });

        it("非 manuscript 路径直接返回 null", async () => {
            const result = await resolveCurrentChapter("lorebook/character/hero/index.md", {
                chapters: mockChapters,
            });
            expect(result).toBeNull();
        });

        it("支持通过 plotFacade.getPlotTree() 关联 StoryChapter", async () => {
            const mockPlotFacade = {
                async getPlotTree() {
                    return {
                        story: {} as any,
                        phases: [],
                        ungroupedThreads: [],
                        acts: [
                            {
                                id: 1,
                                name: "act-1",
                                title: "第一卷",
                                sortOrder: 0,
                                chapters: [
                                    {name: "act1-ch1", sortOrder: 0} as any,
                                    {name: "002-ch", sortOrder: 1} as any,
                                ],
                            } as any,
                        ],
                        ungroupedChapters: [
                            {name: "ungrouped-ch", sortOrder: 2} as any,
                        ],
                        totalPhases: 0,
                        totalThreads: 0,
                        totalScenes: 0,
                        totalActs: 1,
                        totalChapters: 3,
                        openPromiseCount: 0,
                        openDecisionCount: 0,
                    };
                },
            };

            const result = await resolveCurrentChapter("manuscript/001-vol/002-ch/index.md", {
                plotFacade: mockPlotFacade,
            });

            expect(result).toEqual({
                chapterName: "002-ch",
                sortOrder: 1,
                manuscriptPath: "manuscript/001-vol/002-ch/index.md",
            });
        });

        it("支持通过 chapterRepository.findChapterByName() 关联 StoryChapter", async () => {
            const mockRepo = {
                async findChapterByName(storyId: number, name: string) {
                    if (name === "repo-ch") {
                        return {name: "repo-ch", sortOrder: 7} as any;
                    }
                    return null;
                },
            };

            const result = await resolveCurrentChapter("manuscript/001-vol/repo-ch/index.md", {
                chapterRepository: mockRepo,
                storyId: 10,
            });

            expect(result).toEqual({
                chapterName: "repo-ch",
                sortOrder: 7,
                manuscriptPath: "manuscript/001-vol/repo-ch/index.md",
            });
        });
    });

    describe("readChapterContent", () => {
        it("读取指定章节的正文内容", async () => {
            const fullDoc = `---
chapter: ch-1
---
第一章正文内容
第二段文字`;

            const body = await readChapterContent("manuscript/001-vol/001-ch/index.md", {
                readText: () => fullDoc,
            });

            expect(body?.trim()).toBe("第一章正文内容\n第二段文字");
        });

        it("当文件不可读时返回 null", async () => {
            const body = await readChapterContent("manuscript/001-vol/missing/index.md", {
                readText: () => null,
            });
            expect(body).toBeNull();
        });
    });
});
