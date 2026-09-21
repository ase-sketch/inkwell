import {readFile} from "node:fs/promises";
import {describe, expect, it} from "vitest";

describe("NovelIdeSettingsDialog security contract", () => {
    it("Boot Config 页面展示运行态状态和只读示例", async () => {
        const source = await readFile("app/components/novel-ide/NovelIdeSettingsDialog.vue", "utf-8");
        const securityBlock = source.slice(
            source.indexOf("<!-- 启动期安全配置"),
            source.indexOf("<!-- 前端设定 -->"),
        );

        expect(source).toContain("useAuthSessionState");
        expect(securityBlock).toContain("settings.security.runtimeStatusDescription");
        expect(securityBlock).toContain("settings.security.exampleTitle");
        expect(securityBlock).toContain("settings.security.warning");
        expect(securityBlock).not.toContain("FormCheckbox");
        expect(securityBlock).not.toContain("saveSettings");
    });
});
