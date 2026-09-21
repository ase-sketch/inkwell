import {describe, expect, it} from "vitest";
import type {WorkspaceFileNode} from "nbook/app/stores/novel-ide";
import {
    buildBeatMarkdown,
    buildChapterMarkdown,
    buildOutlineMarkdown,
    countWritingDocuments,
    groupBeatDocuments,
    isAuthorVisibleWritingPath,
    isBeatDocumentPath,
    isOutlineDocumentPath,
    nextBeatPath,
    nextChapterPath,
    nextOutlinePath,
    projectBeatTree,
    projectOutlineTree,
    projectWritingTree,
    resolveBeatTitle,
    resolveChapterTitle,
    resolveOutlineTitle,
    resolveWritingAssetKind,
    resolveWritingAssetLabel,
} from "nbook/app/utils/writing-assets";

function node(overrides: Partial<WorkspaceFileNode> & {path: string}): WorkspaceFileNode {
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

/** 后端返回的是扁平列表，目录也各占一条。 */
function flatWorkspace(): WorkspaceFileNode[] {
    return [
        node({path: "AGENTS.md", editable: false, contentNode: false}),
        node({path: "agents/index.md", editable: false, contentNode: false}),
        node({path: "manual/gm-guide.md", editable: false, contentNode: false}),
        node({path: "manual/reference.md", editable: false, contentNode: false}),
        node({path: "manual/rules-guide.md", editable: false, contentNode: false}),
        node({path: "manuscript", isDirectory: true}),
        node({path: "manuscript/index.md"}),
        node({path: "manuscript/001-volume", isDirectory: true}),
        node({path: "manuscript/001-volume/index.md"}),
        node({path: "manuscript/001-volume/001-chapter", isDirectory: true}),
        node({path: "manuscript/001-volume/001-chapter/index.md"}),
        node({path: "project.yaml", editable: false, contentNode: false}),
        node({path: "reference/index.md", editable: false, contentNode: false}),
        node({path: "world-engine/calendar.ts", editable: false, contentNode: false}),
        node({path: "world-engine/schema", isDirectory: true, editable: false, contentNode: false}),
    ];
}

/** outline/ 资产根的扁平投影：一份大纲 + 一卷一章细纲。 */
function flatOutlineWorkspace(): WorkspaceFileNode[] {
    return [
        node({path: "outline", isDirectory: true}),
        node({path: "outline/001-outline", isDirectory: true}),
        node({path: "outline/001-outline/index.md"}),
        node({path: "outline/001-volume", isDirectory: true}),
        node({path: "outline/001-volume/index.md"}),
        node({path: "outline/001-volume/001-chapter", isDirectory: true}),
        node({path: "outline/001-volume/001-chapter/index.md"}),
        node({path: "outline/001-volume/002-chapter", isDirectory: true}),
        node({path: "outline/001-volume/002-chapter/index.md"}),
        node({path: "manuscript/001-volume/001-chapter/index.md"}),
        node({path: "world-engine/calendar.ts", editable: false, contentNode: false}),
    ];
}

describe("Writing assets projection", () => {
    it("基座内部文件一律不进作者视图", () => {
        for (const path of [
            "AGENTS.md",
            "agents/index.md",
            "manual/gm-guide.md",
            "manual/reference.md",
            "manual/rules-guide.md",
            "project.yaml",
            "reference/index.md",
            "world-engine/calendar.ts",
            "world-engine/schema",
            "lorebook/character/hero/index.md",
        ]) {
            expect(isAuthorVisibleWritingPath(path), path).toBe(false);
        }
        expect(isAuthorVisibleWritingPath("manuscript/001-volume/001-chapter/index.md")).toBe(true);
        expect(isAuthorVisibleWritingPath("workspace/manuscript/index.md")).toBe(true);
    });

    it("投影只保留正文，并补齐祖先目录使树连通", () => {
        const projected = projectWritingTree(flatWorkspace());

        expect(projected.map((item) => item.path)).toEqual([
            "manuscript",
            "manuscript/index.md",
            "manuscript/001-volume",
            "manuscript/001-volume/index.md",
            "manuscript/001-volume/001-chapter",
            "manuscript/001-volume/001-chapter/index.md",
        ]);
        // 内部文件一个都不能漏进来。
        for (const leaked of ["agents", "manual", "reference", "world-engine", "project.yaml", "AGENTS.md"]) {
            expect(projected.some((item) => item.path.includes(leaked))).toBe(false);
        }
        // 大纲不进正文树：正文只有一个资产根。
        expect(projected.some((item) => item.path.startsWith("outline"))).toBe(false);
    });

    it("祖先节点只从真实输入里取，不凭空造目录", () => {
        // 只给了深层文件，没有给任何目录节点。
        const projected = projectWritingTree([
            node({path: "manuscript/001-volume/001-chapter/index.md"}),
        ]);

        expect(projected.map((item) => item.path)).toEqual(["manuscript/001-volume/001-chapter/index.md"]);
    });

    it("空树与纯内部文件的树都投影为空", () => {
        expect(projectWritingTree([])).toEqual([]);
        expect(projectWritingTree([node({path: "project.yaml", editable: false, contentNode: false})])).toEqual([]);
    });

    it("正文计数只数文件，不数目录", () => {
        expect(countWritingDocuments(flatWorkspace())).toBe(3);
        expect(countWritingDocuments([node({path: "manuscript", isDirectory: true})])).toBe(0);
        expect(countWritingDocuments([])).toBe(0);
    });

    it("新章节路径顺延到下一个可用序号，不覆盖已有章节", () => {
        expect(nextChapterPath([])).toBe("manuscript/001-volume/001-chapter/index.md");

        const oneChapter = flatWorkspace();
        expect(nextChapterPath(oneChapter)).toBe("manuscript/001-volume/002-chapter/index.md");

        // 001 已被占满两位数场景：只有 001 时应当给 002。
        const occupied = [
            node({path: "manuscript/001-volume/001-chapter/index.md"}),
            node({path: "manuscript/001-volume/002-chapter/index.md"}),
        ];
        expect(nextChapterPath(occupied)).toBe("manuscript/001-volume/003-chapter/index.md");
    });

    it("章节标题与初始 Markdown 与基座示范章节同构", () => {
        expect(resolveChapterTitle("manuscript/001-volume/001-chapter/index.md")).toBe("第 1 章");
        expect(resolveChapterTitle("manuscript/001-volume/012-chapter/index.md")).toBe("第 12 章");

        const markdown = buildChapterMarkdown("manuscript/001-volume/003-chapter/index.md");
        expect(markdown.startsWith("---\n")).toBe(true);
        expect(markdown).toContain('title: "第 3 章"');
        expect(markdown).toContain("type: chapter");
        expect(markdown).toContain("status: draft");
    });
});

describe("Outline and beat projection", () => {
    it("分区判定是纯路径判定：正文 / 大纲 / 细纲 / 内部文件", () => {
        expect(resolveWritingAssetKind("manuscript/001-volume/001-chapter/index.md")).toBe("manuscript");
        expect(resolveWritingAssetKind("outline/001-outline/index.md")).toBe("outline");
        expect(resolveWritingAssetKind("outline/001-volume/001-chapter/index.md")).toBe("beat");
        expect(resolveWritingAssetKind("outline/001-volume/003-chapter/index.md")).toBe("beat");
        // outline/ 根下的 index.md 是目录说明页，不是大纲文档。
        expect(resolveWritingAssetKind("outline/index.md")).toBe(null);
        // 卷目录本身不是文档。
        expect(resolveWritingAssetKind("outline/001-volume")).toBe(null);
        expect(resolveWritingAssetKind("outline/002-outline")).toBe(null);
        for (const path of [
            "lorebook/character/hero/index.md",
            "world-engine/calendar.ts",
            "project.yaml",
            "reference/index.md",
        ]) {
            expect(resolveWritingAssetKind(path), path).toBe(null);
        }
        // 纯路径判定：outline/ 根层不落在 NNN-volume 下的文档都算大纲，不看目录名。
        expect(resolveWritingAssetKind("outline/not-numbered/index.md")).toBe("outline");
        // workspace/ 前缀与反斜杠同样识别。
        expect(resolveWritingAssetKind("workspace\\outline\\001-outline\\index.md")).toBe("outline");
    });

    it("细纲要求卷章两级编号同构，根层大纲排除 NNN-volume 子树", () => {
        expect(isBeatDocumentPath("outline/001-volume/001-chapter/index.md")).toBe(true);
        expect(isBeatDocumentPath("outline/001-volume/001-chapter/notes.md")).toBe(false);
        expect(isBeatDocumentPath("outline/001-outline/index.md")).toBe(false);
        expect(isBeatDocumentPath("outline/001-volume/index.md")).toBe(false);

        expect(isOutlineDocumentPath("outline/001-outline/index.md")).toBe(true);
        expect(isOutlineDocumentPath("outline/001-volume/index.md")).toBe(false);
        expect(isOutlineDocumentPath("outline/001-volume/001-chapter/index.md")).toBe(false);
        expect(isOutlineDocumentPath("outline/index.md")).toBe(false);
        expect(isOutlineDocumentPath("manuscript/index.md")).toBe(false);
    });

    it("大纲树只投影总纲，细纲树只投影卷章，两边都不含 outline/ 根与 index.md 行", () => {
        const nodes = flatOutlineWorkspace();

        expect(projectOutlineTree(nodes).map((item) => item.path)).toEqual([
            "outline/001-outline",
        ]);
        expect(projectBeatTree(nodes).map((item) => item.path)).toEqual([
            "outline/001-volume",
            "outline/001-volume/001-chapter",
            "outline/001-volume/002-chapter",
        ]);
        // 正文不进任何一个大纲分区。
        expect(projectOutlineTree(nodes).some((item) => item.path.startsWith("manuscript"))).toBe(false);
        expect(projectBeatTree(nodes).some((item) => item.path.startsWith("manuscript"))).toBe(false);
    });

    it("大纲树与细纲树在空输入、无目录节点时也不凭空造节点", () => {
        expect(projectOutlineTree([])).toEqual([]);
        expect(projectBeatTree([])).toEqual([]);
        // 目录节点缺席时保留 index.md 行，宁可多一行也不静默丢一份大纲。
        expect(projectOutlineTree([
            node({path: "outline/001-outline/index.md"}),
        ]).map((item) => item.path)).toEqual(["outline/001-outline/index.md"]);
        // index.md 行本身不出现在树里（由目录承载）。
        expect(projectBeatTree([
            node({path: "outline/001-volume", isDirectory: true}),
            node({path: "outline/001-volume/001-chapter", isDirectory: true}),
            node({path: "outline/001-volume/001-chapter/index.md"}),
        ]).map((item) => item.path)).toEqual(["outline/001-volume", "outline/001-volume/001-chapter"]);
    });

    it("细纲按卷分组，卷升序，非标准卷不进组", () => {
        const entries = projectBeatTree(flatOutlineWorkspace());
        const groups = groupBeatDocuments(entries);

        expect(groups.map((group) => group.path)).toEqual(["outline/001-volume"]);
        expect(groups[0]?.entries.map((entry) => entry.path)).toEqual([
            "outline/001-volume",
            "outline/001-volume/001-chapter",
            "outline/001-volume/002-chapter",
        ]);
        expect(groupBeatDocuments([])).toEqual([]);
    });

    it("新大纲路径顺延序号：001-outline -> 002-outline", () => {
        expect(nextOutlinePath([])).toBe("outline/001-outline/index.md");
        expect(nextOutlinePath(flatOutlineWorkspace())).toBe("outline/002-outline/index.md");
        expect(nextOutlinePath([
            node({path: "outline/001-outline", isDirectory: true}),
            node({path: "outline/002-outline", isDirectory: true}),
        ])).toBe("outline/003-outline/index.md");
        // 序号被占满时继续往后找，不覆盖。
        expect(nextOutlinePath([node({path: "outline/001-outline/index.md"})])).toBe("outline/002-outline/index.md");
    });

    it("新细纲路径顺延到最新卷的下一章，与正文编号同构", () => {
        expect(nextBeatPath([])).toBe("outline/001-volume/001-chapter/index.md");
        // 已有 001/002 两章，下一章是 003。
        expect(nextBeatPath(flatOutlineWorkspace())).toBe("outline/001-volume/003-chapter/index.md");
        // 最新卷是 002，所以顺延到 002-volume/001-chapter。
        expect(nextBeatPath([
            node({path: "outline/001-volume/001-chapter/index.md"}),
            node({path: "outline/002-volume", isDirectory: true}),
            node({path: "outline/002-volume/001-chapter/index.md"}),
        ])).toBe("outline/002-volume/002-chapter/index.md");
        // 细纲编号只跟 outline/ 走，正文的章号不影响它。
        expect(nextBeatPath([
            node({path: "manuscript/001-volume/001-chapter/index.md"}),
            node({path: "manuscript/001-volume/002-chapter/index.md"}),
        ])).toBe("outline/001-volume/001-chapter/index.md");
    });

    it("大纲与细纲的初始 Markdown 与正文同构，但不参与 AI 自动检索", () => {
        const outline = buildOutlineMarkdown("outline/001-outline/index.md");
        expect(outline).toContain('title: "大纲 1"');
        expect(outline).toContain("type: outline");
        expect(outline).toContain("status: draft");
        expect(outline).toContain("    enabled: false");

        const beat = buildBeatMarkdown("outline/001-volume/012-chapter/index.md");
        expect(beat).toContain('title: "第 12 章细纲"');
        expect(beat).toContain("type: outline");
        expect(beat).toContain("    enabled: false");

        // 与正文同一套骨架：只有 title 与 type 不同。
        const chapter = buildChapterMarkdown("manuscript/001-volume/001-chapter/index.md");
        const shape = (markdown: string): string[] => markdown.split("\n").filter((line) => !line.startsWith("title:")).map((line) => line.replace(/^type: .*$/, "type: <type>"));
        expect(shape(outline)).toEqual(shape(chapter));
        expect(shape(beat)).toEqual(shape(chapter));
    });

    it("标题与面板标签都给作者话，不裸露机器名", () => {
        expect(resolveOutlineTitle("outline/003-outline/index.md")).toBe("大纲 3");
        expect(resolveBeatTitle("outline/001-volume/012-chapter/index.md")).toBe("第 12 章细纲");
        expect(resolveBeatTitle("outline/001-volume/001-chapter/index.md")).toBe("第 1 章细纲");

        expect(resolveWritingAssetLabel("outline/002-outline")).toBe("大纲 2");
        expect(resolveWritingAssetLabel("outline/001-volume")).toBe("第 1 卷");
        expect(resolveWritingAssetLabel("outline/001-volume/003-chapter")).toBe("第 3 章");
        expect(resolveWritingAssetLabel("manuscript/001-volume/001-chapter/index.md")).toBe("第 1 章");
        // 认不出来的路径原样返回，界面不会拿到空标题。
        expect(resolveWritingAssetLabel("outline/notes.md")).toBe("notes.md");
    });
});
