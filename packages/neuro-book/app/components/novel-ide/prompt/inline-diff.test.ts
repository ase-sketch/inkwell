import {describe, expect, it} from "vitest";
import {computeInlineDiff, isLargeDiff} from "nbook/app/utils/inline-diff";

describe("inline-diff", () => {
    it("computes diff parts for word/char level changes", () => {
        const parts = computeInlineDiff("白日依山尽", "黄河入海流");
        expect(parts.length).toBeGreaterThan(0);
        expect(parts.some(p => p.removed)).toBe(true);
        expect(parts.some(p => p.added)).toBe(true);
    });

    it("handles empty original or replacement", () => {
        expect(computeInlineDiff("", "新文本")).toEqual([{value: "新文本", added: true}]);
        expect(computeInlineDiff("旧文本", "")).toEqual([{value: "旧文本", removed: true}]);
        expect(computeInlineDiff("", "")).toEqual([]);
    });

    it("identifies large diff correctly", () => {
        expect(isLargeDiff("短文本", "改后短文本")).toBe(false);
        expect(isLargeDiff("第一行\n第二行\n第三行\n第四行", "改后")).toBe(true);
        expect(isLargeDiff("a".repeat(200), "b")).toBe(true);
    });

    it("handles undefined, null, or non-string inputs defensively without throwing", () => {
        expect(isLargeDiff(undefined as any, undefined as any)).toBe(false);
        expect(isLargeDiff(null as any, null as any)).toBe(false);
        expect(computeInlineDiff(undefined as any, undefined as any)).toEqual([]);
    });
});
