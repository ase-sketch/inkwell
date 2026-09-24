import {readFile} from "node:fs/promises";
import {fileURLToPath} from "node:url";
import {describe, expect, it} from "vitest";

const cardPath = fileURLToPath(new URL("./InlineProposalCard.vue", import.meta.url));

describe("InlineProposalCard contract", () => {
    it("包含就地提案卡的结构契约与主题变量", async () => {
        const source = await readFile(cardPath, "utf-8");

        // Props / Emits 契约
        expect(source).toContain("InlineProposalState");
        expect(source).toContain("emit(\"accept-edit\",");
        expect(source).toContain("emit(\"reject-edit\",");
        expect(source).toContain("emit(\"accept-all\")");
        expect(source).toContain("emit(\"reject-all\")");
        expect(source).toContain("emit(\"request-revision\",");

        // 字符/词级轻量 diff 与 Monaco 对比弹窗
        expect(source).toContain("computeInlineDiff");
        expect(source).toContain("isLargeDiff");
        expect(source).toContain("DiffWorkbenchDialog");
        expect(source).toContain("展开对比");

        // 卡底操作按钮
        expect(source).toContain("全部采纳");
        expect(source).toContain("全部拒绝");
        expect(source).toContain("再改一版");

        // 视觉主题变量约束（暖色编辑与标准状态色）
        expect(source).toContain("var(--border-color)");
        expect(source).toContain("var(--bg-panel)");
        expect(source).toContain("var(--status-success)");
        expect(source).toContain("var(--status-danger)");
        expect(source).toContain("var(--accent-main)");

        // 禁止未注册的 dark: 变体（AGENTS.md 前端规范）
        expect(source).not.toContain("dark:");
    });
});
