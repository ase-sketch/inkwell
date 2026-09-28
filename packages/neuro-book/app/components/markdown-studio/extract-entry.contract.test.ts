import {readFile} from "node:fs/promises";
import {fileURLToPath} from "node:url";
import {describe, expect, it} from "vitest";

const bubblePath = fileURLToPath(new URL("../novel-ide/agent/AgentTextBubble.vue", import.meta.url));
const flowPath = fileURLToPath(new URL("../novel-ide/agent/AgentChatFlow.vue", import.meta.url));
const surfacePath = fileURLToPath(new URL("../novel-ide/agent/AgentChatSurface.vue", import.meta.url));
const selectionMenuPath = fileURLToPath(new URL("./MarkdownSelectionMenu.vue", import.meta.url));
const tiptapEditorPath = fileURLToPath(new URL("./TipTapMarkdownEditor.vue", import.meta.url));
const studioPath = fileURLToPath(new URL("./MarkdownStudio.vue", import.meta.url));
const workbenchPath = fileURLToPath(new URL("./MarkdownStudioWorkbench.vue", import.meta.url));
const indexPagePath = fileURLToPath(new URL("../../pages/index.vue", import.meta.url));
const zhLocalePath = fileURLToPath(new URL("../../i18n/locales/zh-CN.ts", import.meta.url));
const enLocalePath = fileURLToPath(new URL("../../i18n/locales/en-US.ts", import.meta.url));

async function readSource(path: string): Promise<string> {
    return (await readFile(path, "utf-8")).replace(/\r\n/g, "\n");
}

/** 取小节里某个 key 的字符串值；missing 时返回 null。 */
function localeValue(section: string, key: string): string | null {
    const pattern = new RegExp("(?:^|\\s)" + key + ":\\s*\"((?:[^\"\\\\]|\\\\.)*)\"", "u");
    return pattern.exec(section)?.[1] ?? null;
}

/** 截取 markdownStudio.selection 小节。 */
function selectionSection(source: string): string {
    const start = source.indexOf("selection: {");
    expect(start, "locale 里找不到 selection 小节").toBeGreaterThan(-1);
    const end = source.indexOf("\n        },", start);
    expect(end, "selection 小节没有闭合").toBeGreaterThan(start);
    return source.slice(start, end);
}

describe("提取为设定双入口接线", () => {
    it("AI 消息底栏新增「提取为设定」，只对 AI 文本消息显示", async () => {
        const bubble = await readSource(bubblePath);

        expect(bubble).toContain('(e: "extract-to-lorebook", message: AgentMessage): void;');
        expect(bubble).toContain("emit('extract-to-lorebook', props.node.message)");
        expect(bubble).toContain("t('agent.textBubble.extract')");
        expect(bubble).toContain("t('agent.textBubble.extractPreview')");
        expect(bubble).toContain("const isAiTextMessage = computed(() => {");
        expect(bubble).toContain('if (props.node.message.type !== "ai") {');
        expect(bubble).toContain("block.type === \"text\" && block.content.preview.trim()");
        expect(bubble).toContain('v-if="isAiTextMessage"');
        // 跑批/流式中沿用既有 actionDisabled 语义，不另造一套禁用口径。
        expect(bubble).toContain(':disabled="props.actionDisabled || props.runActionDisabled"');

        // 按钮必须真的挂在模板里，且带图标与测试锚点。
        const emitIndex = bubble.indexOf("emit('extract-to-lorebook', props.node.message)");
        const button = bubble.slice(emitIndex - 600, emitIndex + 160);
        expect(button).toContain("<button");
        expect(button).toContain("i-lucide-bookmark-plus");
        expect(button).toContain('data-role="agent-extract-lorebook-button"');

        // 复制、编辑、重试、分叉四个既有按钮原样保留，新按钮是并列项。
        expect(bubble).toContain("emit('copy', props.node.message)");
        expect(bubble).toContain("emit('retry', props.node.message)");
        expect(bubble).toContain("emit('branch-from-here', props.node.message)");
    });

    it("消息入口逐层透出到会话发送处：气泡 → 消息流 → 会话壳", async () => {
        const flow = await readSource(flowPath);
        const surface = await readSource(surfacePath);

        expect(flow).toContain('(e: "extract-to-lorebook", message: AgentMessage): void;');
        expect(flow).toContain('@extract-to-lorebook="emit(\'extract-to-lorebook\', $event)"');

        expect(surface).toContain('@extract-to-lorebook="void extractMessageToLorebook($event)"');
        expect(surface).toContain("const extractMessageToLorebook = async (message: AgentMessage): Promise<void> => {");
        // 整条正文口径复用既有 resolveMessageMarkdown，不另写一套截断处理。
        expect(surface).toContain("const resolved = await resolveMessageMarkdown(message);");
        expect(surface).toContain("buildMessageExtractInstruction({");
        // 整条消息也要带出处，作者回看草稿卡片时认得出是从哪句话里提出来的。
        expect(surface).toContain("sourceRef: `本场对话 · ${message.id}`,");
        // 终点是当前会话的发送；不新开会话。
        const handler = surface.slice(surface.indexOf("const extractMessageToLorebook = async"), surface.indexOf("/**\n * 从这条消息新开一条分支"));
        expect(handler).toContain("inputText.value = buildMessageExtractInstruction({");
        expect(handler).toContain("await send();");
        expect(handler).not.toContain("createSession");
        // 跑批/流式中不发：沿用 canInvoke 与 running 判定。
        expect(handler).toContain("if (!activeSessionId.value || running.value || !activeInteraction.value.canInvoke) {");
    });

    it("划词菜单新增「提取为设定」，与顾问挑刺并列，不替换任何既有菜单项", async () => {
        const menu = await readSource(selectionMenuPath);

        expect(menu).toContain('(e: "extract-lorebook"): void;');
        expect(menu).toContain("emit('extract-lorebook')");
        expect(menu).toContain('t("markdownStudio.selection.extractLorebook")');
        // 顾问挑刺与卡文追问两条原样保留，三个入口并存。
        expect(menu).toContain("emit('selection-critique')");
        expect(menu).toContain("emit('stuck-interview')");

        const emitIndex = menu.indexOf("emit('extract-lorebook')");
        const button = menu.slice(emitIndex - 400, emitIndex + 120);
        expect(button).toContain("<button");
        expect(button).toContain("i-lucide-bookmark-plus");
    });

    it("划词事件逐层透出到宿主：编辑器 → Studio → Workbench", async () => {
        const editor = await readSource(tiptapEditorPath);
        const studio = await readSource(studioPath);
        const workbench = await readSource(workbenchPath);

        expect(editor).toContain('(e: "extract-lorebook", reference: InlineEditReference): void;');
        expect(editor).toContain("function startExtractLorebookFromSelection(): void {");
        expect(editor).toContain('emit("extract-lorebook", {');
        expect(editor).toContain('@extract-lorebook="startExtractLorebookFromSelection"');
        // 没有选中正文 / 没有当前文件时要给作者反馈，不能静默什么都不做。
        expect(editor).toContain('t("markdownStudio.editor.selectBodyFirst")');
        expect(editor).toContain('t("markdownStudio.editor.currentPathMissing")');

        for (const source of [studio, workbench]) {
            expect(source).toContain('(e: "extract-lorebook", reference: InlineEditReference): void;');
            expect(source).toContain("@extract-lorebook=\"emit('extract-lorebook', $event)\"");
        }
    });

    it("宿主编排划词入口：切到对话态 + 当前会话发送，不新开会话", async () => {
        const page = await readSource(indexPagePath);

        expect(page).toContain("const handleExtractLorebook = async (reference: InlineEditReference): Promise<void> => {");
        const handler = page.slice(page.indexOf("const handleExtractLorebook = async"), page.indexOf("/** 伴随栏切换"));
        expect(handler).toContain("companionVisible.value = true;");
        expect(handler).toContain("await surface.ensureSessionReady();");
        expect(handler).toContain("buildSelectionExtractInstruction({");
        expect(handler).toContain("ref: reference.ref,");
        expect(handler).toContain("path: reference.path,");
        expect(handler).toContain("text: reference.text,");
        expect(handler).toContain("await surface.sendMessage(message);");
        expect(handler).not.toContain("createSession");

        // 两处模板接线：两个 Workbench 各接一次。
        expect(page.match(/@extract-lorebook="void handleExtractLorebook\(\$event\)"/g) ?? []).toHaveLength(2);
        // 既有三条划词/审稿链路不动。
        expect(page.match(/@selection-critique="void handleSelectionCritique\(\$event\)"/g) ?? []).toHaveLength(2);
        expect(page.match(/@stuck-interview="void handleStuckInterview\(\$event\)"/g) ?? []).toHaveLength(2);
        expect(page).toContain('@review-chapter="void handleChapterReview($event)"');
    });

    it("中英文案成对，且不出现工程词", async () => {
        const zhSource = await readSource(zhLocalePath);
        const enSource = await readSource(enLocalePath);

        for (const key of ["extract", "extractPreview"]) {
            expect(localeValue(zhSource, key), "zh 缺 agent.textBubble." + key).not.toBeNull();
            expect(localeValue(enSource, key), "en 缺 agent.textBubble." + key).not.toBeNull();
        }
        expect(localeValue(zhSource, "extract")).toBe("提取为设定");
        expect(localeValue(zhSource, "extractPreview")).not.toBe(localeValue(zhSource, "extract"));

        const zhSelection = selectionSection(zhSource);
        const enSelection = selectionSection(enSource);
        expect(localeValue(zhSelection, "extractLorebook")).toBe("提取为设定");
        expect(localeValue(enSelection, "extractLorebook")).not.toBeNull();
        // 面向作者的人话：菜单小节里不出现 profileKey / session / Agent 这类工程词。
        expect(zhSelection).not.toMatch(/profileKey|review\.chapter|session|Agent|Token/iu);
    });
});
