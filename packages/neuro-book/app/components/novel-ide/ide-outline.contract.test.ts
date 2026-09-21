import {readFile} from "node:fs/promises";
import {fileURLToPath} from "node:url";
import {describe, expect, it} from "vitest";

const indexPagePath = fileURLToPath(new URL("../../pages/index.vue", import.meta.url));
const drawerPath = fileURLToPath(new URL("./shell/IdeOutlineDrawer.vue", import.meta.url));
const panelPath = fileURLToPath(new URL("./shell/IdeManuscriptPanel.vue", import.meta.url));
const sidebarPath = fileURLToPath(new URL("./shell/IdeShellSidebar.vue", import.meta.url));
const topBarPath = fileURLToPath(new URL("./shell/IdeShellTopBar.vue", import.meta.url));

async function readSource(path: string): Promise<string> {
    return (await readFile(path, "utf-8")).replace(/\r\n/g, "\n");
}

describe("Ide outline drawer", () => {
    it("大纲抽屉是只读浏览，不写文件", async () => {
        const drawer = await readSource(drawerPath);

        expect(drawer).toContain("readWorkspaceFileContent");
        expect(drawer).toContain('t("ide.outline.readOnly")');
        expect(drawer).not.toContain("saveCurrentFile");
        expect(drawer).not.toContain("/api/workspace-files/write");
        expect(drawer).not.toContain("createWorkspaceFile");
        // 与设定抽屉同一套骨架：可拖拽面板 + frontmatter 剥离 + Markdown 渲染。
        expect(drawer).toContain("useResizablePanel");
        expect(drawer).toContain("splitBody");
        expect(drawer).toContain("<AgentMarkdownContent");
    });

    it("抽屉与两棵树的节点带可定位属性", async () => {
        const drawer = await readSource(drawerPath);
        const panel = await readSource(panelPath);
        const indexPage = await readSource(indexPagePath);

        expect(drawer).toContain('data-role="ide-outline-drawer"');
        expect(drawer).toContain('data-role="ide-outline-drawer-close"');
        expect(drawer).toContain('data-role="ide-outline-empty"');
        expect(drawer).toContain(":data-outline-section=\"section.id\"");
        expect(drawer).toContain(":data-outline-section-header=\"section.id\"");
        expect(drawer).toContain(":data-outline-entry-path=\"readablePath(entry)\"");
        expect(drawer).toContain(":data-outline-beat-path=\"readablePath(entry)\"");
        expect(drawer).toContain(":data-outline-volume=\"group.path\"");

        expect(panel).toContain('data-manuscript-section="manuscript"');
        expect(panel).toContain('data-manuscript-section="outline"');
        expect(panel).toContain('data-manuscript-section="beat"');
        expect(panel).toContain('data-role="ide-manuscript-new-chapter"');
        expect(panel).toContain('data-role="ide-manuscript-new-outline"');
        expect(panel).toContain('data-role="ide-manuscript-new-beat"');
        expect(panel).toContain('data-outline-empty="outline"');
        expect(panel).toContain('data-outline-empty="beat"');

        const topBarSource = await readSource(topBarPath);
        expect(topBarSource).toContain('data-role="ide-shell-outline-toggle"');
    });

    it("抽屉排在新壳主区里，排在伴随栏右侧，与设定抽屉互斥", async () => {
        const indexPage = await readSource(indexPagePath);
        const sidebar = await readSource(sidebarPath);
        const topBar = await readSource(topBarPath);

        expect(indexPage).toContain('<IdeOutlineDrawer class="order-5" :open="outlineDrawerOpen" @close="outlineDrawerOpen = false" />');
        // 开一个抽屉就关另一个：三条入口（图标栏 / 顶栏 / 抽屉自身）都走同一对开关。
        expect(indexPage).toContain("const toggleLorebookDrawer = (): void => {");
        expect(indexPage).toContain("const toggleOutlineDrawer = (): void => {");
        expect(indexPage).toContain("outlineDrawerOpen: outlineDrawerOpen.value,");
        expect(sidebar).toContain('{id: "outline", icon: "i-lucide-list-tree"');
        expect(sidebar).toContain("outlineOpen: boolean;");
        expect(sidebar).toContain('(event: "toggle-outline"): void;');
        expect(indexPage).toContain(':outline-open="outlineDrawerOpen"');
        expect(indexPage).toContain('@toggle-outline="toggleOutlineDrawer"');
        expect(topBar).toContain("outlineOpen: boolean;");
        expect(topBar).toContain('(event: "toggle-outline"): void;');
    });

    it("三区新建走纯路径顺延，细纲与正文编号同构", async () => {
        const indexPage = await readSource(indexPagePath);

        expect(indexPage).toContain("nextOutlinePath(nodes)");
        expect(indexPage).toContain("nextBeatPath(nodes)");
        expect(indexPage).toContain("buildOutlineMarkdown(filePath)");
        expect(indexPage).toContain("buildBeatMarkdown(filePath)");
        // 正文新建逻辑保持不变。
        expect(indexPage).toContain("nextChapterPath(nodes)");
        expect(indexPage).toContain("buildChapterMarkdown(filePath)");
    });
});
