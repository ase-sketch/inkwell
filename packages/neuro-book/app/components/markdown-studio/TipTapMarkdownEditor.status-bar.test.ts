import { describe, expect, it } from "vitest";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

const editorPath = fileURLToPath(new URL("./TipTapMarkdownEditor.vue", import.meta.url));

describe("TipTapMarkdownEditor Status Bar Contract & Visual Rules", () => {
    it("TipTapMarkdownEditor.vue 引入统一字数口径 util", async () => {
        const source = await readFile(editorPath, "utf-8");
        expect(source).toContain('from "nbook/shared/text-metrics"');
        expect(source).toContain("countWords");
        expect(source).toContain("countSelectionWords");
    });

    it("TipTapMarkdownEditor.vue 状态栏结构与可控 prop", async () => {
        const source = await readFile(editorPath, "utf-8");
        expect(source).toContain("showStatusBar?: boolean");
        expect(source).toContain("showStatusBar: true");
        expect(source).toContain('data-testid="tiptap-status-bar"');
        expect(source).toContain('data-testid="total-words"');
        expect(source).toContain('data-testid="selected-words"');
    });

    it("视觉设计严格遵守主题变量规范与衬线排版体系", async () => {
        const source = await readFile(editorPath, "utf-8");
        const footerStart = source.indexOf("<footer");
        const footerEnd = source.indexOf("</footer>");
        expect(footerStart).toBeGreaterThan(-1);
        expect(footerEnd).toBeGreaterThan(footerStart);

        const footerSection = source.slice(footerStart, footerEnd + 9);

        // 衬线体
        expect(footerSection).toContain("font-serif");
        // 允许的主题变量
        expect(footerSection).toContain("border-[var(--border-color)]");
        expect(footerSection).toContain("bg-[var(--bg-subtle)]");
        expect(footerSection).toContain("text-[var(--text-muted)]");
        expect(footerSection).toContain("text-[var(--text-secondary)]");
        expect(footerSection).toContain("text-[var(--accent-text)]");

        // 严禁 Tailwind 调色板类与 dark: 变体
        expect(footerSection).not.toMatch(/\btext-(?:gray|stone|slate|zinc|amber|red|blue)-\d+/);
        expect(footerSection).not.toMatch(/\bbg-(?:gray|stone|slate|zinc|amber|red|blue)-\d+/);
        expect(footerSection).not.toMatch(/\bdark:/);
    });

    it("expose 包含字数获取接口与行号跳转接口", async () => {
        const source = await readFile(editorPath, "utf-8");
        expect(source).toContain("getTotalWords: () => totalWords.value");
        expect(source).toContain("getSelectedWords: () => selectedWords.value");
        expect(source).toContain("scrollToLine,");
    });

    it("状态栏右侧接入敏感词小按钮与 store toggle", async () => {
        const source = await readFile(editorPath, "utf-8");
        expect(source).toContain('data-testid="sensitive-word-btn"');
        expect(source).toContain("i-lucide-shield-check");
        expect(source).toContain("novelIdeStore.toggleSensitiveWordPanel()");
    });

    it("支持 JUMP_TO_LINE_EVENT 监听与组件卸载时清理", async () => {
        const source = await readFile(editorPath, "utf-8");
        expect(source).toContain("window.addEventListener(JUMP_TO_LINE_EVENT, handleJumpToLineEvent)");
        expect(source).toContain("window.removeEventListener(JUMP_TO_LINE_EVENT, handleJumpToLineEvent)");
    });
});
