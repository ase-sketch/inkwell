import {readFile} from "node:fs/promises";
import {fileURLToPath} from "node:url";
import {describe, expect, it} from "vitest";

const indexPagePath = fileURLToPath(new URL("../../pages/index.vue", import.meta.url));
const storePath = fileURLToPath(new URL("../../stores/novel-ide.ts", import.meta.url));
const railPath = fileURLToPath(new URL("./shell/IdeShellSidebar.vue", import.meta.url));
const topBarPath = fileURLToPath(new URL("./shell/IdeShellTopBar.vue", import.meta.url));
const pillPath = fileURLToPath(new URL("./shell/IdeShellModePill.vue", import.meta.url));
const drawerPath = fileURLToPath(new URL("./shell/IdeLorebookDrawer.vue", import.meta.url));
const legacyActivityBarPath = fileURLToPath(new URL("./NovelIdeActivityBar.vue", import.meta.url));
const legacyToolPanelPath = fileURLToPath(new URL("./NovelIdeToolPanel.vue", import.meta.url));

async function readSource(path: string): Promise<string> {
    return (await readFile(path, "utf-8")).replace(/\r\n/g, "\n");
}

/** 截取新壳分支：从 isCodexMode 分支头到旧壳 v-else 分支头。 */
function codexBranch(indexPage: string): string {
    const start = indexPage.indexOf('<div v-if="isCodexMode"');
    const end = indexPage.indexOf('<div v-else class="relative flex min-w-0 flex-1 flex-col overflow-hidden">');
    expect(start).toBeGreaterThan(-1);
    expect(end).toBeGreaterThan(start);
    return indexPage.slice(start, end);
}

describe("Ide shell legacy entry", () => {
    it("默认布局是新壳，旧 IDE / Agent 壳不再作为默认入口", async () => {
        const store = await readSource(storePath);

        expect(store).toContain('export type NovelIdeLayoutMode = "ide" | "agent" | "codex";');
        expect(store).toContain('const layoutMode = ref<NovelIdeLayoutMode>("codex");');
        expect(store).not.toContain('const layoutMode = ref<NovelIdeLayoutMode>("ide");');
        expect(store).not.toContain('const layoutMode = ref<NovelIdeLayoutMode>("agent");');
    });

    it("旧壳代码保留可渲染能力，但入口只在非新壳分支出现", async () => {
        const indexPage = await readSource(indexPagePath);
        const branch = codexBranch(indexPage);
        const legacyBranch = indexPage.slice(indexPage.indexOf('<div v-else class="relative flex min-w-0 flex-1 flex-col overflow-hidden">'));

        // 藏而不删：旧组件仍然渲染得出来，只是新壳分支里没有任何入口。
        expect(branch).not.toContain("NovelIdeActivityBar");
        expect(branch).not.toContain("NovelIdeToolPanel");
        expect(branch).toContain("<IdeLorebookDrawer");
        expect(branch).toContain("<IdeShellTopBar");
        expect(branch).toContain("<IdeChatHost");
        expect(branch).toContain("<MarkdownStudioWorkbench");

        // 第三态：知识库面在新壳分支内挂载，对话面在三种主区情境下都保持挂载
        // （知识库态下宽度收成 0，只为不让 AgentChatSurface 重挂载丢会话流）。
        expect(branch).toContain("<IdeKnowledgeView");
        expect(branch).toContain("shellView.knowledgeVisible");
        expect(branch).toContain('v-if="shellView.agentChatCentered || shellView.editorVisible || shellView.knowledgeVisible"');

        // 知识库与两个右侧抽屉互斥（进入即都收起），离开由聊天/码字入口、开抽屉、选会话等既有动作负责。
        const knowledgeEntry = indexPage.slice(indexPage.indexOf("const enterKnowledgeSurface = (): void => {"));
        expect(knowledgeEntry).toContain("knowledgeRequested.value = true;");
        expect(knowledgeEntry).toContain("lorebookDrawerOpen.value = false;");
        expect(knowledgeEntry).toContain("outlineDrawerOpen.value = false;");
        expect(indexPage).toContain('if (action === "focus-knowledge") {');

        // 两个壳的图标栏互斥渲染：同一时刻只有一个入口栏。
        expect(indexPage).toContain('<IdeShellSidebar\n            v-if="isCodexMode"');
        expect(indexPage).toContain('<NovelIdeActivityBar\n            v-if="!isCodexMode"');

        // 主区是 flex order 互换，不是 v-if 换组件：对话面的 DOM 位置必须固定，
        // 否则 AgentChatSurface 会在情境切换时重挂载（丢会话流、重连 SSE）。
        const chatSectionIndex = branch.indexOf('data-role="ide-shell-chat"');
        expect(chatSectionIndex).toBeGreaterThan(-1);
        expect(branch.slice(chatSectionIndex)).toContain("AgentChatSurface");
        expect(branch).toContain("ide-chat-surface-centered order-2");
        expect(branch).toContain("'order-4 overflow-hidden border-l border-[var(--border-color)]");
        // 抽屉排在伴随栏右侧，不能挤掉对话。
        expect(branch).toContain('class="order-5" :open="lorebookDrawerOpen"');

        expect(legacyBranch).toContain("<NovelIdeToolPanel");
        expect(await readSource(legacyActivityBarPath)).toContain("i-lucide-globe-2");
        expect(await readSource(legacyToolPanelPath)).toContain("<template>");
    });

    it("左栏是带文字标签的一级导航，聊天/码字/知识库/大纲/设定都在", async () => {
        const rail = await readSource(railPath);

        expect(rail).toContain('{id: "chat"');
        expect(rail).toContain('{id: "write"');
        expect(rail).toContain('{id: "knowledge"');
        expect(rail).toContain('{id: "outline"');
        expect(rail).toContain('{id: "lorebook"');
        expect(rail).toContain("data-rail-entry=\"settings\"");
        // 知识库入口带作者可读的文字标签与图标，不是纯图标轨。
        expect(rail).toContain('t("ide.rail.knowledge")');
        // 一级导航必须渲染文字标签，不再是纯图标窄轨。
        expect(rail).toContain("{{ entry.label }}");
        expect(rail).toContain("i-lucide-plus");
        expect(rail).toContain('t("ide.rail.newInterview")');
        // 旧壳的工具入口（文件/角色/剧情/World Engine/请求记录/变更）不在一级入口里。
        for (const legacy of ["world", "trace", "history", "plot", "characters", "files"]) {
            expect(rail).not.toContain(`{id: "${legacy}"`);
        }
    });

    it("顶部胶囊是主区互换的唯一入口，伴随栏可见性独立于胶囊", async () => {
        const indexPage = await readSource(indexPagePath);
        const topBar = await readSource(topBarPath);
        const pill = await readSource(pillPath);

        expect(topBar).toContain("<IdeShellModePill");
        expect(pill).toContain('data-role="ide-shell-mode-pill"');
        expect(pill).toContain('data-pill-option="option.id"');

        // 工作态下 AI 不消失：伴随栏有独立开关，且不依赖 agentChatCentered。
        expect(indexPage).toContain('data-role="ide-shell-companion-toggle"');
        expect(indexPage).toContain("const companionVisible = ref(true);");
        // 知识库与写作面同层：两个工作面都保留伴随栏里的对话。
        expect(indexPage).toContain("const shellCompanionVisible = computed(() => (shellWritingSurface.value || shellKnowledgeSurface.value) && companionVisible.value);");
        expect(indexPage).not.toContain("shellView.value.agentChatCentered ? {width: \"0px\"}");
        // 胶囊只切主区中央；伴随栏由 companionVisible 这个独立开关控制。
        expect(indexPage).toContain("const toggleCodexCompanion = (): void => {");
        expect(indexPage).toContain("const selectShellSurface = (target: \"chat\" | \"editor\"): void => {");
    });

    it("设定抽屉是只读浏览，不写文件", async () => {
        const drawer = await readSource(drawerPath);

        expect(drawer).toContain("readWorkspaceFileContent");
        expect(drawer).toContain('t("ide.shell.lorebookReadOnly")');
        expect(drawer).not.toContain("saveCurrentFile");
        expect(drawer).not.toContain("/api/workspace-files/write");
    });

    it("全局对话框（设置、个人中心等）置于根容器直接子级，不落在旧壳 v-else 分支内", async () => {
        const indexPage = await readSource(indexPagePath);

        const legacyStart = indexPage.indexOf('<div v-else class="relative flex min-w-0 flex-1 flex-col overflow-hidden">');
        expect(legacyStart).toBeGreaterThan(-1);

        const rootClose = indexPage.lastIndexOf("</div>\n</template>");
        expect(rootClose).toBeGreaterThan(legacyStart);

        const settingsDialogIndex = indexPage.indexOf("<NovelIdeSettingsDialog");
        const profileDialogIndex = indexPage.indexOf("<NovelIdeProfileDialog");
        expect(settingsDialogIndex).toBeGreaterThan(-1);
        expect(profileDialogIndex).toBeGreaterThan(-1);

        // v-else 分支闭合标签必须早于全局对话框（即全局对话框不在 v-else 内部，新壳下正常挂载）
        const legacyClose = indexPage.indexOf("</div>\n        </div>\n\n        <NovelIdeSettingsDialog");
        expect(legacyClose).toBeGreaterThan(-1);
        expect(legacyClose).toBeGreaterThan(legacyStart);

        // 全局对话框必须置于根容器闭合标签之前
        expect(settingsDialogIndex).toBeLessThan(rootClose);
        expect(profileDialogIndex).toBeLessThan(rootClose);

        // 截取完整的旧壳分支，验证全局对话框全部被移出
        const legacyBranch = indexPage.slice(legacyStart, settingsDialogIndex);
        expect(legacyBranch).toContain("ProjectPickerScreen");
        expect(legacyBranch).not.toContain("NovelIdeSettingsDialog");
        expect(legacyBranch).not.toContain("NovelIdeProfileDialog");
        expect(legacyBranch).not.toContain("AgentTraceViewerDialog");
        expect(legacyBranch).not.toContain("WorkspaceHistoryInboxDialog");
        expect(legacyBranch).not.toContain("UserProfileWorkbenchDialog");
        expect(legacyBranch).not.toContain("WorkspaceFileConflictDialog");
        expect(legacyBranch).not.toContain("WorkspaceCharacterDetailPanel");
        expect(legacyBranch).not.toContain("WorkspaceLocationProfileDialog");
        expect(legacyBranch).not.toContain("WorkspaceRuleProfileDialog");
    });
});
