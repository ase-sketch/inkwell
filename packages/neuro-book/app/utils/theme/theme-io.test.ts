import {describe, expect, it} from "vitest";
import {exportThemeJson, parseThemeJson} from "nbook/app/utils/theme/theme-io";

describe("theme JSON import/export", () => {
    it("exports schema v1 theme JSON and parses it back", () => {
        const json = exportThemeJson({
            name: "Night Draft",
            appearance: "dark",
            vars: {
                "accent-main": "#ff00aa",
                "accent-bg": "rgba(255, 0, 170, 0.16)",
                "bg-main": "#101010",
            },
        });

        const parsed = parseThemeJson(json);

        expect(parsed.ok).toBe(true);
        if (parsed.ok) {
            expect(parsed.theme).toEqual({
                schemaVersion: 1,
                name: "Night Draft",
                appearance: "dark",
                vars: {
                    "accent-main": "#ff00aa",
                    "accent-bg": "rgba(255, 0, 170, 0.16)",
                    "bg-main": "#101010",
                },
            });
        }
    });

    it("rejects unsupported schema version and unknown theme variable keys", () => {
        expect(parseThemeJson(JSON.stringify({
            schemaVersion: 2,
            name: "Future",
            appearance: "light",
            vars: {},
        })).ok).toBe(false);

        const parsed = parseThemeJson(JSON.stringify({
            schemaVersion: 1,
            name: "Broken",
            appearance: "light",
            vars: {"not-a-theme-var": "#fff"},
        }));

        expect(parsed).toEqual({
            ok: false,
            message: "未知主题变量：not-a-theme-var",
        });
    });

    it("rejects theme variables with non-editable or invalid color values", () => {
        for (const value of ["not-a-color", "var(--accent-main)", "color-mix(in srgb, red 50%, blue)", "#12xx99"]) {
            const parsed = parseThemeJson(JSON.stringify({
                schemaVersion: 1,
                name: "Broken Color",
                appearance: "light",
                vars: {"accent-main": value},
            }));

            expect(parsed).toEqual({
                ok: false,
                message: `主题变量 accent-main 的颜色值不合法：${value}`,
            });
        }
    });
});
