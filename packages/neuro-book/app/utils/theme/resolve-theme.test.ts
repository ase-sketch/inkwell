import {describe, expect, it} from "vitest";
import {resolveTheme} from "nbook/app/utils/theme/resolve-theme";
import {themeTokens} from "nbook/app/utils/theme/theme-tokens";
import type {CustomThemeDto} from "nbook/shared/theme/theme-vars";

describe("resolveTheme", () => {
    it("merges custom theme vars over the appearance fallback preset", () => {
        const customTheme: CustomThemeDto = {
            id: "custom-night",
            name: "Night Draft",
            appearance: "dark",
            vars: {
                "accent-main": "#ff00aa",
            },
        };

        const resolved = resolveTheme("custom-night", [customTheme]);

        expect(resolved.id).toBe("custom-night");
        expect(resolved.label).toBe("Night Draft");
        expect(resolved.appearance).toBe("dark");
        expect(resolved.vars["--accent-main"]).toBe("#ff00aa");
        expect(resolved.vars["--bg-main"]).toBe(themeTokens.dark["--bg-main"]);
    });

    it("falls back to sepia when theme id is unknown", () => {
        const resolved = resolveTheme("missing-theme", []);

        expect(resolved.id).toBe("sepia");
        expect(resolved.appearance).toBe("light");
        expect(resolved.vars).toEqual(themeTokens.sepia);
    });
});
