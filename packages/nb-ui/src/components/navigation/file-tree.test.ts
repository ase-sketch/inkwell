import {mount} from "@vue/test-utils";
import {describe, expect, it} from "vitest";
import FileTree from "./FileTree.vue";
import type {FileTreeNode} from "./file-tree.types";

const nodes: FileTreeNode[] = [
    {
        id: "src",
        label: "src",
        kind: "directory",
        children: [
            {id: "src/index.ts", label: "index.ts", kind: "file"},
            {id: "src/components", label: "components", kind: "directory", children: []},
        ],
    },
    {id: "README.md", label: "README.md", kind: "file"},
];

describe("FileTree", () => {
    it("由消费方控制展开、选择并支持自定义节点内容", async () => {
        const wrapper = mount(FileTree, {
            props: {nodes, expandedIds: [], selectedId: null},
            slots: {node: ({node}: {node: FileTreeNode}) => `文件:${node.label}`},
        });

        expect(wrapper.text()).toContain("文件:src");
        expect(wrapper.text()).not.toContain("index.ts");
        await wrapper.get('[data-tree-id="src"] span').trigger("click");
        expect(wrapper.emitted("update:expandedIds")?.[0]).toEqual([["src"]]);

        await wrapper.setProps({expandedIds: ["src"]});
        expect(wrapper.text()).toContain("文件:index.ts");
        await wrapper.get('[data-tree-id="src/index.ts"]').trigger("click");
        expect((wrapper.emitted("select")?.[0]?.[0] as FileTreeNode).id).toBe("src/index.ts");
    });

    it("用方向键、Home、End 和 Enter 导航可见节点", async () => {
        const wrapper = mount(FileTree, {props: {nodes, expandedIds: ["src"], selectedId: "src"}, attachTo: document.body});
        const src = wrapper.get<HTMLElement>('[data-tree-id="src"]');
        src.element.focus();
        await src.trigger("keydown", {key: "ArrowDown"});
        expect(document.activeElement?.getAttribute("data-tree-id")).toBe("src/index.ts");
        await wrapper.get('[data-tree-id="src/index.ts"]').trigger("keydown", {key: "End"});
        expect(document.activeElement?.getAttribute("data-tree-id")).toBe("README.md");
        await wrapper.get('[data-tree-id="README.md"]').trigger("keydown", {key: "Enter"});
        expect((wrapper.emitted("activate")?.[0]?.[0] as FileTreeNode).id).toBe("README.md");
        wrapper.unmount();
    });

    it("拒绝把目录拖入自身后代，并输出 inside 与 root 语义落点", async () => {
        const dataTransfer = {setData() {}, effectAllowed: "none", dropEffect: "none"};
        const wrapper = mount(FileTree, {props: {nodes, expandedIds: ["src"], selectedId: null, draggable: true}});
        const readme = wrapper.get('[data-tree-id="README.md"]');
        const src = wrapper.get('[data-tree-id="src"]');
        src.element.getBoundingClientRect = () => ({top: 0, bottom: 32, left: 0, right: 240, width: 240, height: 32, x: 0, y: 0, toJSON: () => ({})});

        await readme.trigger("dragstart", {dataTransfer});
        await src.trigger("dragover", {dataTransfer, clientY: 16});
        await src.trigger("drop", {dataTransfer});
        expect(wrapper.emitted("move")?.[0]).toEqual([{sourceId: "README.md", targetId: "src", position: "inside"}]);

        await readme.trigger("dragstart", {dataTransfer});
        await src.trigger("dragover", {dataTransfer, clientY: 1});
        await src.trigger("drop", {dataTransfer});
        expect(wrapper.emitted("move")?.[1]).toEqual([{sourceId: "README.md", targetId: "src", position: "before"}]);

        await readme.trigger("dragstart", {dataTransfer});
        await src.trigger("dragover", {dataTransfer, clientY: 31});
        await src.trigger("drop", {dataTransfer});
        expect(wrapper.emitted("move")?.[2]).toEqual([{sourceId: "README.md", targetId: "src", position: "after"}]);

        await src.trigger("dragstart", {dataTransfer});
        await wrapper.get('[data-tree-id="src/index.ts"]').trigger("dragover", {dataTransfer, clientY: 0});
        expect(wrapper.emitted("move")).toHaveLength(3);

        await wrapper.get("[role='tree']").trigger("drop", {dataTransfer});
        expect(wrapper.emitted("move")?.[3]).toEqual([{sourceId: "src", targetId: null, position: "root"}]);
    });

    it("稳定渲染空树和超长文件名", () => {
        const empty = mount(FileTree, {props: {nodes: [], expandedIds: []}});
        expect(empty.text()).toContain("暂无文件");

        const label = "a".repeat(300);
        const full = mount(FileTree, {props: {nodes: [{id: label, label, kind: "file"}], expandedIds: []}});
        expect(full.text()).toContain(label);
        expect(full.find(".truncate").exists()).toBe(true);
    });
});
