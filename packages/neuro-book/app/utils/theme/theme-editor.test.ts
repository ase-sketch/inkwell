import {describe, expect, it} from "vitest";
import {createCustomThemeId, resolveCssColorValue, resolveDraftThemeVars} from "nbook/app/utils/theme/theme-editor";
import {themeVarKeys} from "nbook/app/utils/theme/theme-tokens";
import type {CustomThemeDto} from "nbook/shared/theme/theme-vars";

describe("theme editor helpers", () => {
    it("为自定义主题生成符合 normalizer 约束的唯一 ID", () => {
        const existingThemes: CustomThemeDto[] = [{
            id: "custom-my-theme",
            name: "My Theme",
            appearance: "light",
            vars: {},
        }];

        expect(createCustomThemeId("My Theme", existingThemes)).toBe("custom-my-theme-2");
        expect(createCustomThemeId("中文主题", existingThemes)).toBe("custom-theme");
    });

    it("按 appearance 把 draft 自定义主题补齐为 36 个 CSS 变量", () => {
        const vars = resolveDraftThemeVars({
            id: "custom-preview",
            name: "Preview",
            appearance: "dark",
            vars: {
                "accent-main": "#ff0000",
            },
        });

        expect(Object.keys(vars).sort()).toEqual([...themeVarKeys].sort());
        expect(vars["--accent-main"]).toBe("#ff0000");
        expect(vars["--bg-main"]).toBeTruthy();
    });

    it("服务端环境解析未知 CSS 表达式时保留 fallback", () => {
        expect(resolveCssColorValue("color-mix(in srgb, red 50%, blue)", "#123456")).toBe("#123456");
    });
});
