import {describe, expect, it} from "vitest";
import {
    LAB_OVERRIDE_SCHEMA,
    LAB_OVERRIDE_VERSION,
    parseLabOverrideSnapshot,
    serializeLabOverrideSnapshot,
} from "./lab-overrides";

describe("component lab override snapshots", () => {
    const allowed = new Set(["--radius-control", "--control-h-md"]);

    it("round-trips a versioned snapshot", () => {
        const raw = serializeLabOverrideSnapshot({"--radius-control": "8px"});
        expect(JSON.parse(raw)).toEqual({
            schema: LAB_OVERRIDE_SCHEMA,
            version: LAB_OVERRIDE_VERSION,
            overrides: {"--radius-control": "8px"},
        });
        expect(parseLabOverrideSnapshot(raw, allowed)).toEqual({"--radius-control": "8px"});
    });

    it("rejects an unknown variable", () => {
        expect(() => parseLabOverrideSnapshot(JSON.stringify({
            schema: LAB_OVERRIDE_SCHEMA,
            version: LAB_OVERRIDE_VERSION,
            overrides: {"--not-registered": "red"},
        }), allowed)).toThrow("未登记的变量");
    });

    it("rejects invalid schema, non-string and injection values", () => {
        expect(() => parseLabOverrideSnapshot(JSON.stringify({schema: "wrong", version: 1, overrides: {}}), allowed)).toThrow("schema");
        expect(() => parseLabOverrideSnapshot(JSON.stringify({schema: LAB_OVERRIDE_SCHEMA, version: LAB_OVERRIDE_VERSION, overrides: {"--radius-control": 8}}), allowed)).toThrow("字符串");
        expect(() => parseLabOverrideSnapshot(JSON.stringify({schema: LAB_OVERRIDE_SCHEMA, version: LAB_OVERRIDE_VERSION, overrides: {"--radius-control": "8px; color:red"}}), allowed)).toThrow("规则边界");
    });

    it("rejects empty and oversized values", () => {
        expect(() => parseLabOverrideSnapshot(JSON.stringify({schema: LAB_OVERRIDE_SCHEMA, version: LAB_OVERRIDE_VERSION, overrides: {"--radius-control": " "}}), allowed)).toThrow("不能为空");
        expect(() => parseLabOverrideSnapshot(JSON.stringify({schema: LAB_OVERRIDE_SCHEMA, version: LAB_OVERRIDE_VERSION, overrides: {"--radius-control": "x".repeat(513)}}), allowed)).toThrow("512");
    });

    it("import is atomic: one bad entry rejects the whole snapshot", () => {
        const raw = serializeLabOverrideSnapshot({"--radius-control": "8px", "--control-h-md": "a;b"});
        expect(() => parseLabOverrideSnapshot(raw, allowed)).toThrow("规则边界");
    });
});
