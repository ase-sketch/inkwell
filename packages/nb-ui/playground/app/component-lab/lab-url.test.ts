import {describe, expect, it} from "vitest";
import {LAB_BARE_THEME, normalizeLabQuery, type LabNormalizeContext} from "./lab-url";

const ctx: LabNormalizeContext = {
    themeIds: ["nbook", "macos", "editorial", "aurora"],
    colorwayIds: ["dark", "nbook-light", "nbook-dark"],
    fallbackTheme: "nbook",
    fallbackColorway: "nbook-dark",
};

describe("normalizeLabQuery", () => {
    it("passes through a fully valid query", () => {
        expect(normalizeLabQuery({
            component: "form-select", scene: "rich", viewport: "phone", theme: "macos", colorway: "dark",
        }, ctx)).toEqual({
            component: "form-select", scene: "rich", viewport: "phone", theme: "macos", colorway: "dark",
        });
    });

    it("normalizes every illegal value and keeps bare theme explicit", () => {
        expect(normalizeLabQuery({
            component: "nope", scene: "nope", viewport: "nope", theme: "nope", colorway: "nope",
        }, ctx)).toEqual({
            component: "form-input", scene: "default", viewport: "responsive", theme: "nbook", colorway: "nbook-dark",
        });
        expect(normalizeLabQuery({theme: LAB_BARE_THEME}, ctx).theme).toBe(LAB_BARE_THEME);
    });

    it("falls back to defaults on an empty query", () => {
        expect(normalizeLabQuery({}, ctx)).toEqual({
            component: "form-input", scene: "default", viewport: "responsive", theme: "nbook", colorway: "nbook-dark",
        });
    });

    it("drops a scene that belongs to another component", () => {
        // rich 是 form-select 的场景；component 归一化为 form-input 后 scene 也必须落到 form-input 的默认场景
        expect(normalizeLabQuery({component: "form-input", scene: "rich"}, ctx).scene).toBe("default");
        expect(normalizeLabQuery({component: "form-select", scene: "rich"}, ctx).scene).toBe("rich");
    });

    it("treats array and empty-string params as missing", () => {
        expect(normalizeLabQuery({component: ["form-select"], theme: ""}, ctx).component).toBe("form-input");
        expect(normalizeLabQuery({theme: ""}, ctx).theme).toBe("nbook");
    });
});
