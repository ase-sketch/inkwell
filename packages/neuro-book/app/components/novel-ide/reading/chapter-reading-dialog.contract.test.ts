import {describe, expect, it} from "vitest";
import {readFile} from "node:fs/promises";
import {fileURLToPath} from "node:url";

const dialogComponentPath = fileURLToPath(new URL("./ChapterReadingDialog.vue", import.meta.url));
const tabsComponentPath = fileURLToPath(new URL("../shell/IdeDocumentTabs.vue", import.meta.url));

describe("ChapterReadingDialog & IdeDocumentTabs component contract", () => {
    it("ChapterReadingDialog source contract: implements newsprint theme, paragraph indent and full-screen dialog", async () => {
        const dialogSource = await readFile(dialogComponentPath, "utf-8");

        // 必须复用 theme-newsprint 主题样式与 markdown-themes.css
        expect(dialogSource).toContain("markdown-themes.css");
        expect(dialogSource).toContain("theme-newsprint");

        // 必须读取并使用既有 paragraphIndent 设置
        expect(dialogSource).toContain("paragraphIndentEnabled");
        expect(dialogSource).toContain("paragraphIndentEm");
        expect(dialogSource).toContain("--reading-paragraph-indent");

        // 必须接入 renderMarkdown 进行排版渲染
        expect(dialogSource).toContain("renderMarkdown");

        // 必须包含上下章翻页与章节切换逻辑
        expect(dialogSource).toContain("prevChapter");
        expect(dialogSource).toContain("nextChapter");
        expect(dialogSource).toContain("handlePrev");
        expect(dialogSource).toContain("handleNext");

        // 必须包含字数统计与居中阅读版面
        expect(dialogSource).toContain("wordCount");
        expect(dialogSource).toContain("max-w-[780px]");
    });

    it("IdeDocumentTabs source contract: mounts ChapterReadingDialog, reading button, and export menu", async () => {
        const tabsSource = await readFile(tabsComponentPath, "utf-8");

        // 必须自闭环挂载 ChapterReadingDialog
        expect(tabsSource).toContain("ChapterReadingDialog");
        expect(tabsSource).toContain("readingDialogOpen");
        expect(tabsSource).toContain('<ChapterReadingDialog');

        // 必须包含阅读入口按钮并带有指定 data-role
        expect(tabsSource).toContain('data-role="ide-reading-button"');
        expect(tabsSource).toContain("readingDialogOpen = true");

        // 必须包含导出入口与三个范围的导出动作
        expect(tabsSource).toContain('data-role="ide-export-button"');
        expect(tabsSource).toContain('data-role="ide-export-menu"');
        expect(tabsSource).toContain('data-role="export-chapter-action"');
        expect(tabsSource).toContain('data-role="export-volume-action"');
        expect(tabsSource).toContain('data-role="export-book-action"');

        // 必须调用 exportChaptersToTxt 进行导出
        expect(tabsSource).toContain("exportChaptersToTxt");
        expect(tabsSource).toContain("triggerExport('chapter')");
        expect(tabsSource).toContain("triggerExport('volume')");
        expect(tabsSource).toContain("triggerExport('book')");
    });
});
