import {describe, expect, it} from "vitest";
import {readFile} from "node:fs/promises";
import {fileURLToPath} from "node:url";

const panelComponentPath = fileURLToPath(new URL("./SensitiveWordPanel.vue", import.meta.url));
const storePath = fileURLToPath(new URL("../../../stores/novel-ide.ts", import.meta.url));

describe("SensitiveWordPanel & store contract", () => {
    it("SensitiveWordPanel 必须符合自闭环组件规范", async () => {
        const source = await readFile(panelComponentPath, "utf-8");

        // 必须引入并使用扫描器与词表合并
        expect(source).toContain("getBuiltinSensitiveWords");
        expect(source).toContain("mergeSensitiveWordLists");
        expect(source).toContain("scanSensitiveWords");
        expect(source).toContain("SensitiveMatch");

        // 必须声明 jump、select 与 close 事件
        expect(source).toContain('(e: "jump", line: number): void');
        expect(source).toContain('(e: "select", match: SensitiveMatch): void');
        expect(source).toContain('(e: "close"): void');

        // 必须提供手动触发扫描按钮与处理函数
        expect(source).toContain("handleScan");
        expect(source).toContain("handleJump");

        // 点击命中项时必须 emit jump(match.line)
        expect(source).toContain('emit("jump", match.line)');

        // 必须包含词表统计与命中展示（词、行列号、上下文）
        expect(source).toContain("match.word");
        expect(source).toContain("match.line");
        expect(source).toContain("match.column");
        expect(source).toContain("match.context");

        // 必须消费规范的主题 CSS 变量
        expect(source).toContain("var(--bg-panel)");
        expect(source).toContain("var(--text-main)");
        expect(source).toContain("var(--status-danger)");
        expect(source).toContain("var(--status-success)");
    });

    it("novel-ide store 必须暴露敏感词自查所需的最小状态与操作", async () => {
        const storeSource = await readFile(storePath, "utf-8");

        expect(storeSource).toContain("sensitiveWordMatches");
        expect(storeSource).toContain("isScanningSensitiveWords");
        expect(storeSource).toContain("sensitiveWordPanelOpen");
        expect(storeSource).toContain("customSensitiveWords");
        expect(storeSource).toContain("loadCustomSensitiveWords");
        expect(storeSource).toContain("scanCurrentFileSensitiveWords");
        expect(storeSource).toContain("toggleSensitiveWordPanel");

        // 必须通过现有 read 通道读取 .nbook/sensitive-words.txt
        expect(storeSource).toContain('readWorkspaceFileContent(".nbook/sensitive-words.txt")');
    });
});
