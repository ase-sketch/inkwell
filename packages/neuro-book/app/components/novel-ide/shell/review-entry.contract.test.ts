import {readFile} from "node:fs/promises";
import {fileURLToPath} from "node:url";
import {describe, expect, it} from "vitest";

const indexPagePath = fileURLToPath(new URL("../../../pages/index.vue", import.meta.url));
const documentTabsPath = fileURLToPath(new URL("./IdeDocumentTabs.vue", import.meta.url));
const selectionMenuPath = fileURLToPath(new URL("../../markdown-studio/MarkdownSelectionMenu.vue", import.meta.url));
const tiptapEditorPath = fileURLToPath(new URL("../../markdown-studio/TipTapMarkdownEditor.vue", import.meta.url));
const studioPath = fileURLToPath(new URL("../../markdown-studio/MarkdownStudio.vue", import.meta.url));
const workbenchPath = fileURLToPath(new URL("../../markdown-studio/MarkdownStudioWorkbench.vue", import.meta.url));
const zhLocalePath = fileURLToPath(new URL("../../../i18n/locales/zh-CN.ts", import.meta.url));
const enLocalePath = fileURLToPath(new URL("../../../i18n/locales/en-US.ts", import.meta.url));

async function readSource(path: string): Promise<string> {
    return (await readFile(path, "utf-8")).replace(/\r\n/g, "\n");
}

/** 截取 ide.critique 小节（两个 locale 文件里都只有这一段）。 */
function critiqueSection(source: string): string {
    const start = source.indexOf("critique: {");
    expect(start, "locale 里找不到 critique 小节").toBeGreaterThan(-1);
    const end = source.indexOf("\n        },", start);
    expect(end, "critique 小节没有闭合").toBeGreaterThan(start);
    return source.slice(start, end);
}

/** 取小节里某个 key 的字符串值；missing 时返回 null。 */
function localeValue(section: string, key: string): string | null {
    const pattern = new RegExp("(?:^|\\s)" + key + ":\\s*\"((?:[^\"\\\\]|\\\\.)*)\"", "u");
    return pattern.exec(section)?.[1] ?? null;
}

describe("审稿双入口接线", () => {
    it("划词菜单新增「发给顾问挑刺」，与卡文追问并列，不替换任何既有菜单项", async () => {
        const menu = await readSource(selectionMenuPath);

        expect(menu).toContain('(e: "selection-critique"): void;');
        expect(menu).toContain("emit('selection-critique')");
        expect(menu).toContain('t("markdownStudio.selection.selectionCritique")');
        // 卡文追问那条原样保留，两个入口并存。
        expect(menu).toContain("emit('stuck-interview')");
        expect(menu).toContain('t("markdownStudio.selection.stuckInterview")');
        // 菜单项必须真的挂在模板里的按钮上，而不是只声明了事件。
        const emitIndex = menu.indexOf("emit('selection-critique')");
        const button = menu.slice(emitIndex - 400, emitIndex + 200);
        expect(button).toContain("<button");
        expect(button).toContain("i-lucide-message-square-warning");
    });

    it("划词事件逐层透出到宿主：编辑器 → Studio → Workbench", async () => {
        const editor = await readSource(tiptapEditorPath);
        const studio = await readSource(studioPath);
        const workbench = await readSource(workbenchPath);

        expect(editor).toContain('(e: "selection-critique", reference: InlineEditReference): void;');
        expect(editor).toContain("function startSelectionCritiqueFromSelection(): void {");
        expect(editor).toContain('emit("selection-critique", {');
        expect(editor).toContain('@selection-critique="startSelectionCritiqueFromSelection"');
        // 没有选中正文 / 没有当前文件时要给作者反馈，不能静默什么都不做。
        expect(editor).toContain('t("markdownStudio.editor.selectBodyFirst")');
        expect(editor).toContain('t("markdownStudio.editor.currentPathMissing")');

        for (const source of [studio, workbench]) {
            expect(source).toContain('(e: "selection-critique", reference: InlineEditReference): void;');
            expect(source).toContain("@selection-critique=\"emit('selection-critique', $event)\"");
        }
    });

    it("编辑态标签条新增「审这一章」，只在章节正文上可用", async () => {
        const tabs = await readSource(documentTabsPath);

        expect(tabs).toContain('(event: "review-chapter", path: string): void;');
        expect(tabs).toContain("parseManuscriptChapterPath");
        expect(tabs).toContain("const activeChapter = computed(() => parseManuscriptChapterPath(props.activePath));");
        expect(tabs).toContain("const canReviewChapter = computed(() => activeChapter.value !== null);");
        // 不可审时禁用按钮、tooltip 换说法，而不是点了才弹提示。
        expect(tabs).toContain(':disabled="!canReviewChapter"');
        expect(tabs).toContain("ide.critique.entry.chapterTooltip");
        expect(tabs).toContain("ide.critique.entry.chapterDisabledTooltip");
        expect(tabs).toContain('data-role="ide-review-chapter-button"');
        expect(tabs).toContain('t("ide.critique.entry.chapterLabel")');
        // 只把归一化后的章节路径交给宿主，组件自己不拼会话。
        expect(tabs).toContain('emit("review-chapter", chapter.manuscriptPath);');
        expect(tabs).not.toContain("createSession");
        // 阅读与导出两个既有入口原样保留。
        expect(tabs).toContain('data-role="ide-reading-button"');
        expect(tabs).toContain('data-role="ide-export-button"');
    });

    it("宿主编排两条入口：章节入口二次校验 + 确认，划词入口直接发消息", async () => {
        const page = await readSource(indexPagePath);

        expect(page).toContain("const handleSelectionCritique = async (reference: InlineEditReference): Promise<void> => {");
        expect(page).toContain("const handleChapterReview = async (chapterPath: string): Promise<void> => {");

        const chapterHandler = page.slice(page.indexOf("const handleChapterReview = async"), page.indexOf("/** 伴随栏切换"));
        expect(chapterHandler).toContain("parseManuscriptChapterPath(chapterPath)");
        expect(chapterHandler).toContain("ide.critique.entry.notChapterBody");
        expect(chapterHandler).toContain("await confirm(");
        expect(chapterHandler).toContain("surface.createSession(CHAPTER_REVIEW_PROFILE_KEY)");
        expect(chapterHandler).toContain("buildChapterReviewMessage({");
        expect(chapterHandler).toContain("await surface.sendMessage(message);");
        expect(chapterHandler).toContain("chapterReviewSessionStorageKey(");
        expect(chapterHandler).toContain("readRememberedChapterReviewSessionId(");
        expect(chapterHandler).toContain("rememberChapterReviewSession(");
        // 同章复用、换章新开：复用判定吃「记忆里这一章那一条」。
        expect(chapterHandler).toContain("findReusableChapterReviewSession(sessions, {");

        const selectionHandler = page.slice(page.indexOf("const handleSelectionCritique = async"), page.indexOf("const handleChapterReview = async"));
        expect(selectionHandler).toContain("companionVisible.value = true;");
        expect(selectionHandler).toContain("await surface.ensureSessionReady();");
        expect(selectionHandler).toContain("surface.createSession(CHAPTER_REVIEW_PROFILE_KEY)");
        expect(selectionHandler).toContain("surface.selectSession(existing.sessionId)");
        expect(selectionHandler).toContain("buildSelectionCritiqueMessage({");
        expect(selectionHandler).toContain("await surface.sendMessage(");

        // 三处模板接线：两个 Workbench 各接划词，标签条接章节。
        expect(page.match(/@selection-critique="void handleSelectionCritique\(\$event\)"/g) ?? []).toHaveLength(2);
        expect(page).toContain('@review-chapter="void handleChapterReview($event)"');
        // 卡文追问那条链路不动。
        expect(page.match(/@stuck-interview="void handleStuckInterview\(\$event\)"/g) ?? []).toHaveLength(2);
    });

    it("中英文案成对，且不出现工程词", async () => {
        const zhSource = await readSource(zhLocalePath);
        const enSource = await readSource(enLocalePath);
        const zh = critiqueSection(zhSource);
        const en = critiqueSection(enSource);

        for (const key of ["chapterLabel", "chapterTooltip", "chapterDisabledTooltip", "notChapterBodyTitle", "notChapterBody", "confirmTitle", "confirmMessage", "chapterGuidance", "selectionGuidance"]) {
            expect(localeValue(zh, key), "zh 缺 ide.critique.entry." + key).not.toBeNull();
            expect(localeValue(en, key), "en 缺 ide.critique.entry." + key).not.toBeNull();
        }
        expect(localeValue(zh, "chapterLabel")).toBe("审这一章");
        expect(localeValue(zh, "chapterTooltip")).not.toBe(localeValue(zh, "chapterDisabledTooltip"));
        expect(localeValue(zh, "chapterGuidance")).not.toBe(localeValue(zh, "selectionGuidance"));
        // 划词菜单项中英都在，中文是访谈拍板口径。
        expect(localeValue(zhSource, "selectionCritique")).toBe("发给顾问挑刺");
        expect(localeValue(enSource, "selectionCritique")).not.toBeNull();
        // 面向作者的人话：小节里不出现 profileKey / session / Agent 这类工程词。
        expect(zh).not.toMatch(/profileKey|review\.chapter|session|Agent|Token/iu);
    });
});
