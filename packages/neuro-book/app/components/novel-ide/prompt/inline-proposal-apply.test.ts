import {describe, expect, it} from "vitest";
import {applyAcceptedEdits, countOccurrences} from "nbook/app/utils/inline-proposal-apply";

describe("inline-proposal-apply", () => {
    const sampleDoc = `# 第一章 启程

少年站在青石台阶上，望着远方的落日，心中充满了迷茫。
他知道这条路并不好走，但他必须前行。
风吹过树梢，带来初秋的凉意。`;

    it("countOccurrences accurately counts occurrences", () => {
        expect(countOccurrences(sampleDoc, "少年")).toBe(1);
        expect(countOccurrences(sampleDoc, "他")).toBe(2);
        expect(countOccurrences(sampleDoc, "不存在的文本")).toBe(0);
        expect(countOccurrences(sampleDoc, "")).toBe(0);
    });

    it("applies a single accepted edit with exact unique anchor", () => {
        const edits = [
            {
                original: "心中充满了迷茫。",
                replacement: "目光坚毅而沉静。",
                accepted: true,
            },
        ];
        const result = applyAcceptedEdits(sampleDoc, edits);
        expect(result.appliedCount).toBe(1);
        expect(result.failedEdits).toHaveLength(0);
        expect(result.content).toContain("少年站在青石台阶上，望着远方的落日，目光坚毅而沉静。");
        expect(result.content).not.toContain("心中充满了迷茫。");
    });

    it("skips non-accepted edits", () => {
        const edits = [
            {
                original: "心中充满了迷茫。",
                replacement: "目光坚毅而沉静。",
                accepted: false,
            },
        ];
        const result = applyAcceptedEdits(sampleDoc, edits);
        expect(result.appliedCount).toBe(0);
        expect(result.failedEdits).toHaveLength(0);
        expect(result.content).toBe(sampleDoc);
    });

    it("applies multiple non-overlapping accepted edits correctly regardless of edit array order", () => {
        const edits = [
            {
                original: "风吹过树梢，带来初秋的凉意。",
                replacement: "夜幕降临，群星闪烁。",
                accepted: true,
            },
            {
                original: "少年站在青石台阶上",
                replacement: "青年伫立在石阶之巅",
                accepted: true,
            },
        ];
        const result = applyAcceptedEdits(sampleDoc, edits);
        expect(result.appliedCount).toBe(2);
        expect(result.failedEdits).toHaveLength(0);
        expect(result.content).toContain("青年伫立在石阶之巅，望着远方的落日");
        expect(result.content).toContain("夜幕降临，群星闪烁。");
    });

    it("fails with anchor_not_found if original does not exist", () => {
        const edits = [
            {
                original: "这里是根本不存在的段落",
                replacement: "替换文本",
                accepted: true,
            },
        ];
        const result = applyAcceptedEdits(sampleDoc, edits);
        expect(result.appliedCount).toBe(0);
        expect(result.failedEdits).toHaveLength(1);
        expect(result.failedEdits[0]).toMatchObject({
            index: 0,
            reason: "anchor_not_found",
        });
        expect(result.content).toBe(sampleDoc);
    });

    it("fails with anchor_ambiguous if original appears multiple times", () => {
        const edits = [
            {
                original: "他",
                replacement: "林凡",
                accepted: true,
            },
        ];
        const result = applyAcceptedEdits(sampleDoc, edits);
        expect(result.appliedCount).toBe(0);
        expect(result.failedEdits).toHaveLength(1);
        expect(result.failedEdits[0]).toMatchObject({
            index: 0,
            reason: "anchor_ambiguous",
        });
        expect(result.content).toBe(sampleDoc);
    });

    it("fails with anchor_overlap if two accepted edits have overlapping ranges", () => {
        const edits = [
            {
                original: "望着远方的落日，心中充满了迷茫。",
                replacement: "A",
                accepted: true,
            },
            {
                original: "心中充满了迷茫。\n他知道这条路并不好走",
                replacement: "B",
                accepted: true,
            },
        ];
        const result = applyAcceptedEdits(sampleDoc, edits);
        expect(result.appliedCount).toBe(0);
        expect(result.failedEdits.length).toBeGreaterThanOrEqual(1);
        expect(result.failedEdits.some(f => f.reason === "anchor_overlap")).toBe(true);
        expect(result.content).toBe(sampleDoc);
    });
});