import {describe, expect, it} from "vitest";
import {satisfiesRange} from "./semver-range";

describe("semver-range", () => {
    it("treats * and empty range as any version", () => {
        expect(satisfiesRange("0.2.0-alpha.0", "*")).toBe(true);
        expect(satisfiesRange("9.9.9", "")).toBe(true);
    });

    it("compares exact versions verbatim, prerelease included", () => {
        expect(satisfiesRange("0.2.0-alpha.0", "0.2.0-alpha.0")).toBe(true);
        expect(satisfiesRange("0.2.0-alpha.0", "0.2.0")).toBe(false);
        expect(satisfiesRange("0.2.0", "0.2.0")).toBe(true);
    });

    // 主版本 0 时 ^ 的兼容段是次版本，这是最容易记错的一条
    it("caps caret at the minor version while major is 0", () => {
        expect(satisfiesRange("0.2.0", "^0.2.0")).toBe(true);
        expect(satisfiesRange("0.2.9", "^0.2.0")).toBe(true);
        expect(satisfiesRange("0.3.0", "^0.2.0")).toBe(false);
        expect(satisfiesRange("0.1.9", "^0.2.0")).toBe(false);
    });

    it("caps caret at the major version once major is non-zero", () => {
        expect(satisfiesRange("1.9.9", "^1.2.0")).toBe(true);
        expect(satisfiesRange("2.0.0", "^1.2.0")).toBe(false);
        expect(satisfiesRange("1.1.9", "^1.2.0")).toBe(false);
    });

    it("caps tilde at the minor version", () => {
        expect(satisfiesRange("1.2.9", "~1.2.0")).toBe(true);
        expect(satisfiesRange("1.3.0", "~1.2.0")).toBe(false);
    });

    it("supports >=", () => {
        expect(satisfiesRange("1.0.0", ">=0.2.0")).toBe(true);
        expect(satisfiesRange("0.1.0", ">=0.2.0")).toBe(false);
    });

    /*
     * 与标准 semver 的刻意偏差：范围比较忽略 prerelease。
     * 照标准做的话 ^0.2.0 不匹配 0.2.0-alpha.0，而 nb-ui 现在就是 alpha，
     * 等于把所有写 ^0.2.0 的主题全部拒掉。
     */
    it("ignores prerelease tags when matching ranges", () => {
        expect(satisfiesRange("0.2.0-alpha.0", "^0.2.0")).toBe(true);
        expect(satisfiesRange("0.2.0-alpha.0", ">=0.2.0")).toBe(true);
    });

    // 不支持的写法必须抛错而不是判否：否则主题作者只会看到「版本不匹配」，查不出原因
    it("throws on compound ranges instead of silently returning false", () => {
        expect(() => satisfiesRange("1.0.0", ">=1.0.0 <2.0.0")).toThrow(/不支持复合版本范围/);
        expect(() => satisfiesRange("1.0.0", "^1.0.0 || ^2.0.0")).toThrow(/不支持复合版本范围/);
    });

    it("throws on unparseable versions and ranges", () => {
        expect(() => satisfiesRange("not-a-version", "*")).not.toThrow(); // * 短路，不解析
        expect(() => satisfiesRange("not-a-version", "^1.0.0")).toThrow(/无法解析版本号/);
        expect(() => satisfiesRange("1.0.0", "^abc")).toThrow(/无法解析版本范围/);
        expect(() => satisfiesRange("1.0.0", "<2.0.0")).toThrow(/不支持的版本范围写法/);
    });
});
