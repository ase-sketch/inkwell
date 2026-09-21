import {describe, expect, it} from "vitest";
import {colord} from "colord";
import {CORE_VAR_KEYS, DERIVED_VAR_KEYS, deriveDefaults, type ThemeCoreVars} from "nbook/app/utils/theme/derive";
import {ideThemeIds, themeMeta, themeTokens} from "nbook/app/utils/theme/theme-tokens";

function readCoreVars(themeId: typeof ideThemeIds[number]): ThemeCoreVars {
    const result = {} as ThemeCoreVars;
    for (const key of CORE_VAR_KEYS) {
        result[key] = themeTokens[themeId][`--${key}`];
    }
    return result;
}

describe("deriveDefaults", () => {
    it("derives the 23 non-core theme vars for every built-in theme core palette", () => {
        for (const themeId of ideThemeIds) {
            const derived = deriveDefaults(readCoreVars(themeId), themeMeta[themeId].appearance);

            expect(Object.keys(derived).sort()).toEqual([...DERIVED_VAR_KEYS].sort());
            for (const [key, value] of Object.entries(derived)) {
                expect(colord(value).isValid(), `${themeId}.${key} should be a color`).toBe(true);
            }
        }
    });

    it("keeps inverse text and selection alpha aligned with appearance", () => {
        const light = deriveDefaults(readCoreVars("sepia"), "light");
        const dark = deriveDefaults(readCoreVars("dark"), "dark");

        expect(light["text-inverse"]).toBe("#ffffff");
        expect(dark["text-inverse"]).toBe("#000000");
        expect(colord(light["selection-bg"]).alpha()).toBeCloseTo(0.28, 2);
        expect(colord(dark["selection-bg"]).alpha()).toBeCloseTo(0.34, 2);
    });
});
