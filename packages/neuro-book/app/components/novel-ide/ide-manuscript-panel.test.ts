import {describe, expect, it} from "vitest";
import {readFile} from "node:fs/promises";
import {fileURLToPath} from "node:url";
import type {WorkspaceFileNode} from "nbook/app/stores/novel-ide";
import {
    projectWritingTree,
    projectOutlineTree,
    projectBeatTree,
    resolveWritingAssetLabel,
    resolveWritingNodeDisplayLabel,
} from "nbook/app/utils/writing-assets";

const panelPath = fileURLToPath(new URL("./shell/IdeManuscriptPanel.vue", import.meta.url));
const nodePath = fileURLToPath(new URL("./workspace/WorkspaceFileNode.vue", import.meta.url));

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

describe("IdeManuscriptPanel & WorkspaceFileNode humanize 文稿树文本断言", () => {
    it("文稿面板源码契约：writingNodes / outlineNodes / beatNodes 均接入 humanizeWritingNode / resolveWritingNodeDisplayLabel", async () => {
        const panelSource = await readFile(panelPath, "utf-8");
        const nodeSource = await readFile(nodePath, "utf-8");

        // IdeManuscriptPanel.vue 必须使用 resolveWritingNodeDisplayLabel 映射所有文稿树节点
        expect(panelSource).toContain("resolveWritingNodeDisplayLabel");
        expect(panelSource).toContain("projectWritingTree(workspaceTree.value).map(humanizeWritingNode)");
        expect(panelSource).toContain("projectOutlineTree(workspaceTree.value).map(humanizeWritingNode)");
        expect(panelSource).toContain("projectBeatTree(workspaceTree.value).map(humanizeWritingNode)");

        // WorkspaceFileNode.vue 同样必须使用 resolveWritingNodeDisplayLabel
        expect(nodeSource).toContain("resolveWritingNodeDisplayLabel(props.node)");
    });

    it("文稿树节点不裸露 001-vol / 001-ch 等原始目录名，统一显示为第 1 卷 / 第 1 章", () => {
        const rawWorkspace: WorkspaceFileNode[] = [
            node({path: "manuscript", isDirectory: true, title: "manuscript"}),
            node({path: "manuscript/001-vol", isDirectory: true, title: "001-vol", entryType: "volume"}),
            node({path: "manuscript/001-vol/001-ch", isDirectory: true, title: "001-ch", entryType: "chapter"}),
            node({path: "manuscript/001-vol/001-ch/index.md", title: "index.md", entryType: "chapter"}),
            // 带作者自定义标题的章节
            node({path: "manuscript/001-vol/002-ch", isDirectory: true, title: "第二章 潜行", entryType: "chapter"}),
            node({path: "manuscript/001-vol/002-ch/index.md", title: "第二章 潜行", entryType: "chapter"}),
        ];

        // 投影出的正文树
        const writingNodes = projectWritingTree(rawWorkspace);

        // 模拟 IdeManuscriptPanel 的 humanizeWritingNode
        const humanizedTitles = writingNodes.map((n) => resolveWritingNodeDisplayLabel(n));

        expect(humanizedTitles).toEqual([
            "manuscript",
            "第 1 卷",
            "第 1 章",
            "第 1 章",
            "第二章 潜行",
            "第二章 潜行",
        ]);

        // 确保没有出现 001-vol 或 001-ch 裸露机器名
        expect(humanizedTitles.includes("001-vol")).toBe(false);
        expect(humanizedTitles.includes("001-ch")).toBe(false);
    });

    it("大纲与细纲树同样不裸露 001-volume / 001-chapter / 001-out 原始目录名", () => {
        const outlineWorkspace: WorkspaceFileNode[] = [
            node({path: "outline", isDirectory: true, title: "outline"}),
            node({path: "outline/001-out", isDirectory: true, title: "001-out"}),
            node({path: "outline/001-out/index.md", title: "index.md"}),
            node({path: "outline/001-vol", isDirectory: true, title: "001-vol"}),
            node({path: "outline/001-vol/001-ch", isDirectory: true, title: "001-ch"}),
            node({path: "outline/001-vol/001-ch/index.md", title: "index.md"}),
        ];

        const outlineDisplayTitles = outlineWorkspace.map((n) => resolveWritingNodeDisplayLabel(n));

        expect(outlineDisplayTitles).toContain("大纲 1");
        expect(outlineDisplayTitles).toContain("第 1 卷");
        expect(outlineDisplayTitles).toContain("第 1 章");
        expect(outlineDisplayTitles.includes("001-out")).toBe(false);
        expect(outlineDisplayTitles.includes("001-vol")).toBe(false);
        expect(outlineDisplayTitles.includes("001-ch")).toBe(false);
    });
});
