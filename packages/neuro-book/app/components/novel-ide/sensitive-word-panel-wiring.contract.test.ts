import { describe, expect, it } from "vitest";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

const indexPath = fileURLToPath(new URL("../../pages/index.vue", import.meta.url));

describe("SensitiveWordPanel Wiring Contract in pages/index.vue", () => {
    it("pages/index.vue 导入 SensitiveWordPanel 与 dispatchEditorJumpToLine", async () => {
        const source = await readFile(indexPath, "utf-8");
        expect(source).toContain('import SensitiveWordPanel from "nbook/app/components/novel-ide/sensitive/SensitiveWordPanel.vue";');
        expect(source).toContain('import {dispatchEditorJumpToLine} from "nbook/app/components/markdown-studio/editor-line-position";');
    });

    it("优先读取当前编辑器内存草稿作为扫描正文通道", async () => {
        const source = await readFile(indexPath, "utf-8");
        expect(source).toContain('const currentEditorDraftContent = computed(() => studio.markdown.value || selectedFileContent.value || "");');
    });

    it("挂载 Teleport 抽屉绑定 store 与关闭、跳转事件", async () => {
        const source = await readFile(indexPath, "utf-8");
        expect(source).toContain('<Teleport to=".novel-ide-theme">');
        expect(source).toContain('data-testid="sensitive-word-drawer"');
        expect(source).toContain('novelIdeStore.sensitiveWordPanelOpen');
        expect(source).toContain(':content="currentEditorDraftContent"');
        expect(source).toContain('@close="novelIdeStore.toggleSensitiveWordPanel(false)"');
        expect(source).toContain('@jump="handleSensitiveWordJump"');
        expect(source).toContain("function handleSensitiveWordJump(line: number): void {");
        expect(source).toContain("dispatchEditorJumpToLine(line);");
    });
});
