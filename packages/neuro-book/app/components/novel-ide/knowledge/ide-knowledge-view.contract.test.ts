import {readFile} from "node:fs/promises";
import {fileURLToPath} from "node:url";
import {describe, expect, it} from "vitest";
import zhCN from "nbook/app/i18n/locales/zh-CN";
import enUS from "nbook/app/i18n/locales/en-US";

/**
 * 知识库三栏主视图的接线契约（M2.7b-T3）。
 *
 * .vue 进不了 vitest（仓内没有 plugin-vue），所以容器「把哪块逻辑接到哪个出口」这件事
 * 只能对源码断言。纯逻辑本身由 knowledge-view-state.test.ts 直测，这里只盯接线：
 * 数据从 store 的树进来、经投影分组出去、选中态留在容器、两个子组件的出口都被接住。
 */

const viewPath = fileURLToPath(new URL("./IdeKnowledgeView.vue", import.meta.url));

async function readView(): Promise<string> {
    return (await readFile(viewPath, "utf-8")).replace(/\r\n/g, "\n");
}

describe("IdeKnowledgeView · 三栏接线", () => {
    it("从 store 的工作区树取节点，经投影层分组", async () => {
        const source = await readView();

        expect(source).toContain("projectKnowledgeEntries(workspaceTree.value)");
        expect(source).toContain("collectFactionTitles(entries.value)");
        expect(source).toContain("groupEntriesByFaction(entries.value, factionTitles.value)");
        expect(source).toContain("buildKnowledgeTabs(groups.value)");
        expect(source).toContain('data-role="ide-knowledge-factions"');
        expect(source).toContain('data-role="ide-knowledge-cards"');
    });

    it("「参考资料」组的图标由投影/状态层给的 reference 标志决定，组件不自己判断谁是参考资料", async () => {
        const source = await readView();

        expect(source).toContain("tab.reference ? 'i-lucide-newspaper' : 'i-lucide-flag'");
        // 组件不出现识别口径（note / 深度），分组判定只住在投影层。
        expect(source).not.toContain("isReferenceEntryPath");
        expect(source).not.toContain("REFERENCE_GROUP_TITLE");
    });

    it("选中态（当前阵营、当前条目、查看/编辑）全部由容器持有", async () => {
        const source = await readView();

        expect(source).toContain('const selectedTabId = ref("");');
        expect(source).toContain('const query = ref("");');
        expect(source).toContain('const selectedPath = ref("");');
        expect(source).toContain("const editing = ref(false);");
        // 选中落到当前结果的第一条靠 pickActiveEntry，不散在模板里判。
        expect(source).toContain("pickActiveEntry(visibleEntries.value, selectedPath.value)");
        expect(source).toContain("resolveActiveTabId(tabs.value, selectedTabId.value)");
    });

    it("阵营内搜索走纯逻辑的过滤函数，无结果给轻提示而不是整页空态", async () => {
        const source = await readView();

        expect(source).toContain('data-role="ide-knowledge-search"');
        expect(source).toContain("filterKnowledgeEntries(activeGroup.value?.entries ?? [], query.value)");
        expect(source).toContain('data-role="ide-knowledge-no-match"');
        expect(source).toContain('t("ide.knowledge.view.noMatchTitle")');
        // 一条条目都没有时才是整页空态。
        expect(source).toContain('data-role="ide-knowledge-empty"');
        expect(source).toContain('v-if="tabs.length === 0"');
    });

    it("卡片是标题 + 徽标 + 摘要摘录，徽标与详情同一套口径", async () => {
        const source = await readView();

        expect(source).toContain('data-role="ide-knowledge-card"');
        expect(source).toContain("detailCategoryIcon(entry.category)");
        expect(source).toContain("detailBadges(entry, translate)");
        expect(source).toContain("knowledgeEntryExcerpt(entry)");
        expect(source).toContain(':data-card-badge="badge.kind"');
    });

    it("章序 lookup 从大纲树构建，同一份同时喂卡片徽标与详情履历", async () => {
        const source = await readView();

        expect(source).toContain('apiFetch<PlotTreeDto>("/api/projects/plot/tree", {query: {projectRoot}})');
        expect(source).toContain("buildChapterOrderIndex(plotTree.value)");
        expect(source).toContain("orderKnowledgeEntry(raw, chapterOrder.value)");
        expect(source).toContain(':chapter-order="chapterOrder"');
    });

    it("点章名跳正文：反查不到给提示，找到了才打开并请宿主切到码字面", async () => {
        const source = await readView();

        expect(source).toContain("resolveManuscriptChapterNode(allNodes.value, chapter)");
        expect(source).toContain('notification.warning(t("ide.knowledge.view.chapterNotFound")');
        expect(source).toContain('await store.selectWorkspacePath(node.path, "permanent");');
        expect(source).toContain('emit("open-chapter", node.path);');
        expect(source).toContain('@jump-chapter="void jumpToChapter($event)"');
    });

    it("点编辑切编辑器并喂当前条目的 index.md 节点；保存刷新工作区树后回详情，取消直接回详情", async () => {
        const source = await readView();

        expect(source).toContain("resolveEntryIndexNode(allNodes.value, entry.path)");
        expect(source).toContain('notification.warning(t("ide.knowledge.view.entryFileMissing")');
        expect(source).toContain(':node="editorNode"');
        expect(source).toContain('@saved="void onEditorSaved()"');
        expect(source).toContain('@cancel="stopEditing()"');
        expect(source).toContain("await store.loadWorkspaceTree();");
        expect(source).toContain('@edit="startEditing()"');
    });
});

describe("IdeKnowledgeView · i18n 成对", () => {
    it("容器用到的 ide.knowledge.view.* 在中英两边都登记了", async () => {
        const source = await readView();
        const keys = [...source.matchAll(/t\(["'](ide\.knowledge\.view\.[A-Za-z0-9_]+)["']/g)].map((match) => match[1]!);

        expect(keys.length).toBeGreaterThan(0);

        const zhView = (zhCN as {ide: {knowledge: {view: Record<string, string>}}}).ide.knowledge.view;
        const enView = (enUS as {ide: {knowledge: {view: Record<string, string>}}}).ide.knowledge.view;

        for (const key of new Set(keys)) {
            const short = key.slice("ide.knowledge.view.".length);
            expect(zhView[short], `zh-CN 缺 ${key}`).toBeTruthy();
            expect(enView[short], `en-US 缺 ${key}`).toBeTruthy();
        }

        // 中英键集合一致，不存在只在一边登记的小节。
        expect(Object.keys(zhView).sort()).toEqual(Object.keys(enView).sort());
    });
});
