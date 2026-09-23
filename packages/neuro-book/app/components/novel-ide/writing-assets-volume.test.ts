import {describe, expect, it} from "vitest";
import type {WorkspaceFileNode} from "nbook/app/stores/novel-ide";
import {
    calculateManuscriptWordStats,
    isChapterWritingPath,
    isVolumeDirectoryPath,
    nextVolumePath,
    resolveChapterMoveTarget,
    resolveChapterRenameTarget,
} from "nbook/app/utils/writing-assets";

function createNode(overrides: Partial<WorkspaceFileNode> & {path: string}): WorkspaceFileNode {
    return {
        mode: "content",
        entryType: null,
        icon: null,
        status: null,
        words: 0,
        refs: [],
        absolutePath: overrides.path,
        isDirectory: false,
        hasIndex: false,
        contentNode: true,
        summary: "",
        title: overrides.path,
        frontmatter: {},
        frontmatterError: null,
        state: null,
        size: 0,
        mtimeMs: 0,
        editable: true,
        ...overrides,
    };
}

describe("分卷与归卷序号维护 (M2.5a)", () => {
    describe("nextVolumePath", () => {
        it("空工作区时生成第一卷 manuscript/001-vol", () => {
            expect(nextVolumePath([])).toBe("manuscript/001-vol");
        });

        it("已有 001-vol 时顺延到 manuscript/002-vol", () => {
            const nodes = [
                createNode({path: "manuscript/001-vol", isDirectory: true}),
            ];
            expect(nextVolumePath(nodes)).toBe("manuscript/002-vol");
        });

        it("兼容已有 001-volume 命名，顺延到 manuscript/002-vol", () => {
            const nodes = [
                createNode({path: "manuscript/001-volume", isDirectory: true}),
                createNode({path: "manuscript/001-volume/001-chapter/index.md", words: 1200}),
            ];
            expect(nextVolumePath(nodes)).toBe("manuscript/002-vol");
        });

        it("已有多个卷（混合 001-volume 与 002-vol）时取最大序号 + 1", () => {
            const nodes = [
                createNode({path: "manuscript/001-volume", isDirectory: true}),
                createNode({path: "manuscript/002-vol", isDirectory: true}),
                createNode({path: "manuscript/003-vol", isDirectory: true}),
            ];
            expect(nextVolumePath(nodes)).toBe("manuscript/004-vol");
        });

        it("即使目录节点缺失但文件路径存在，也能扫描出卷序号", () => {
            const nodes = [
                createNode({path: "manuscript/002-vol/001-ch/index.md"}),
            ];
            expect(nextVolumePath(nodes)).toBe("manuscript/003-vol");
        });
    });

    describe("resolveChapterMoveTarget (拖入/拖出卷与序号冲突顺延)", () => {
        it("拖入空卷：保持或分配有效三位序号 001-", () => {
            const nodes = [
                createNode({path: "manuscript/001-vol", isDirectory: true}),
                createNode({path: "manuscript/002-vol", isDirectory: true}),
                createNode({path: "manuscript/001-vol/001-ch", isDirectory: true}),
            ];
            const target = resolveChapterMoveTarget(
                "manuscript/001-vol/001-ch",
                "manuscript/002-vol",
                nodes,
            );
            expect(target).toBe("manuscript/002-vol/001-ch");
        });

        it("拖入已有章节的卷且序号冲突时：顺延至目标位置下一可用序号", () => {
            const nodes = [
                createNode({path: "manuscript/001-vol/001-ch", isDirectory: true}),
                createNode({path: "manuscript/002-vol/001-ch", isDirectory: true}),
                createNode({path: "manuscript/002-vol/002-ch", isDirectory: true}),
            ];
            const target = resolveChapterMoveTarget(
                "manuscript/001-vol/001-ch",
                "manuscript/002-vol",
                nodes,
            );
            expect(target).toBe("manuscript/002-vol/003-ch");
        });

        it("拖出卷到正文根层（manuscript）：置于 manuscript 根层并维护 00X- 前缀", () => {
            const nodes = [
                createNode({path: "manuscript/001-vol", isDirectory: true}),
                createNode({path: "manuscript/001-vol/001-ch", isDirectory: true}),
                createNode({path: "manuscript/001-vol/002-ch", isDirectory: true}),
            ];
            const target = resolveChapterMoveTarget(
                "manuscript/001-vol/002-ch",
                "manuscript",
                nodes,
            );
            // 目标为 manuscript 根层，若根层已有 001-vol 等，冲突时顺延或无冲突时保持/取下一序号
            expect(target.startsWith("manuscript/")).toBe(true);
            expect(target).not.toContain("001-vol");
            expect(/^manuscript\/\d{3}-ch$/.test(target)).toBe(true);
        });

        it("拖出卷且根目录存在同名前缀时，顺延序号避免覆盖", () => {
            const nodes = [
                createNode({path: "manuscript/001-vol", isDirectory: true}),
                createNode({path: "manuscript/001-vol/001-ch", isDirectory: true}),
                createNode({path: "manuscript/002-ch", isDirectory: true}),
            ];
            const target = resolveChapterMoveTarget(
                "manuscript/001-vol/001-ch",
                "manuscript",
                nodes,
            );
            // 001 与 001-vol 冲突或已占，顺延至 003-ch (因 001, 002 已存在)
            expect(target).toBe("manuscript/003-ch");
        });
    });

    describe("resolveChapterRenameTarget", () => {
        it("作者输入不含三位序号的标题时，自动保留原有序号前缀", () => {
            const nodes = [
                createNode({path: "manuscript/001-vol/002-ch", isDirectory: true}),
            ];
            const target = resolveChapterRenameTarget(
                "manuscript/001-vol/002-ch",
                "风雪夜归人",
                nodes,
            );
            expect(target).toBe("manuscript/001-vol/002-风雪夜归人");
        });

        it("作者输入已有新序号时使用新序号，保证字典序", () => {
            const nodes = [
                createNode({path: "manuscript/001-vol/002-ch", isDirectory: true}),
            ];
            const target = resolveChapterRenameTarget(
                "manuscript/001-vol/002-ch",
                "005-新章",
                nodes,
            );
            expect(target).toBe("manuscript/001-vol/005-新章");
        });

        it("作者重命名出现序号冲突时，顺延至下一可用序号", () => {
            const nodes = [
                createNode({path: "manuscript/001-vol/001-ch", isDirectory: true}),
                createNode({path: "manuscript/001-vol/002-ch", isDirectory: true}),
            ];
            const target = resolveChapterRenameTarget(
                "manuscript/001-vol/001-ch",
                "002-冲突章",
                nodes,
            );
            expect(target).toBe("manuscript/001-vol/003-冲突章");
        });
    });

    describe("calculateManuscriptWordStats (字数汇总)", () => {
        it("正确统计全书总字数与各卷字数", () => {
            const nodes = [
                createNode({path: "manuscript/001-vol", isDirectory: true}),
                createNode({path: "manuscript/001-vol/001-ch/index.md", words: 2500}),
                createNode({path: "manuscript/001-vol/002-ch/index.md", words: 3500}),
                createNode({path: "manuscript/002-vol", isDirectory: true}),
                createNode({path: "manuscript/002-vol/001-ch/index.md", words: 4000}),
                // 卷外独立章节
                createNode({path: "manuscript/003-extra/index.md", words: 1000}),
                // 大纲细纲不计入
                createNode({path: "outline/001-outline/index.md", words: 800}),
            ];

            const stats = calculateManuscriptWordStats(nodes);
            expect(stats.totalWords).toBe(11000);
            expect(stats.volumeStats).toHaveLength(2);
            expect(stats.volumeStats[0]).toEqual({
                path: "manuscript/001-vol",
                label: "第 1 卷",
                words: 6000,
            });
            expect(stats.volumeStats[1]).toEqual({
                path: "manuscript/002-vol",
                label: "第 2 卷",
                words: 4000,
            });
        });

        it("空工作区返回 0 字", () => {
            const stats = calculateManuscriptWordStats([]);
            expect(stats.totalWords).toBe(0);
            expect(stats.volumeStats).toEqual([]);
        });

        it("根层扁平章节与 index.md 只计入全书总字数，绝不混入各卷徽章列表", () => {
            const nodes = [
                createNode({path: "manuscript", isDirectory: true}),
                createNode({path: "manuscript/001-vol", isDirectory: true}),
                createNode({path: "manuscript/001-vol/001-ch/index.md", words: 3000}),
                // 移到根层后的章节与文件
                createNode({path: "manuscript/003-ch", isDirectory: true, entryType: "volume"}), // 模拟服务端对根层目录推断的 volume
                createNode({path: "manuscript/003-ch/index.md", words: 2000, entryType: "volume"}),
                createNode({path: "manuscript/index.md", words: 0}),
            ];
            const stats = calculateManuscriptWordStats(nodes);
            expect(stats.totalWords).toBe(5000);
            // 徽章列表中只允许真正的分卷，003-ch 和 index.md 不单独出徽章
            expect(stats.volumeStats).toEqual([
                {
                    path: "manuscript/001-vol",
                    label: "第 1 卷",
                    words: 3000,
                },
            ]);
        });
    });
describe("isVolumeDirectoryPath & isChapterWritingPath", () => {
        it("精准区分卷目录与根层/卷内章节", () => {
            expect(isVolumeDirectoryPath("manuscript/001-vol")).toBe(true);
            expect(isVolumeDirectoryPath("manuscript/002-volume/")).toBe(true);

            // 根层章节绝不是卷
            expect(isVolumeDirectoryPath("manuscript/003-ch")).toBe(false);
            expect(isVolumeDirectoryPath("manuscript/003-ch/")).toBe(false);
            expect(isVolumeDirectoryPath("manuscript/003-ch/index.md")).toBe(false);
            expect(isVolumeDirectoryPath("manuscript/index.md")).toBe(false);
            expect(isVolumeDirectoryPath("manuscript")).toBe(false);

            // 卷内章节也不是卷
            expect(isVolumeDirectoryPath("manuscript/001-vol/001-ch")).toBe(false);

            // 章节判定
            expect(isChapterWritingPath("manuscript/003-ch")).toBe(true);
            expect(isChapterWritingPath("manuscript/003-ch/index.md")).toBe(true);
            expect(isChapterWritingPath("manuscript/001-vol/001-ch")).toBe(true);
            expect(isChapterWritingPath("manuscript/001-vol")).toBe(false);
            expect(isChapterWritingPath("manuscript")).toBe(false);
        });
    });
});
