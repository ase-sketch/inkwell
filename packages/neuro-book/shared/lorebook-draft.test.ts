import {describe, expect, it} from "vitest";
import {
    LOREBOOK_DRAFT_CATEGORIES,
    LOREBOOK_DRAFT_CATEGORY_LABELS,
    LOREBOOK_DRAFT_PENDING_MARKER,
    LorebookDraftInputSchema,
    MAX_LOREBOOK_DRAFT_ALIASES,
    MAX_LOREBOOK_DRAFT_ALIAS_LENGTH,
    MAX_LOREBOOK_DRAFT_BODY_LENGTH,
    MAX_LOREBOOK_DRAFT_SLUG_LENGTH,
    MAX_LOREBOOK_DRAFT_SOURCE_EXCERPT_LENGTH,
    MAX_LOREBOOK_DRAFT_SUMMARY_LENGTH,
    MAX_LOREBOOK_DRAFT_TITLE_LENGTH,
    SUBMIT_LOREBOOK_DRAFT_TOOL,
    lorebookDraftSlugFromTitle,
} from "nbook/shared/lorebook-draft";

/**
 * M6 设定卡草稿契约的边界单测。
 *
 * 这张卡是「讨论 -> 沉淀」链路的唯一事实源：profile 侧手写校验、前端卡片解析都照着
 * 它来。所以这里钉的是口径本身（类目全集、各字段上下界、目录名形态），不是实现细节。
 */

/** 一份合法草稿；各用例只改自己关心的字段。 */
function draft(overrides: Record<string, unknown> = {}) {
    return {
        title: "青霜剑",
        category: "item",
        aliases: ["家传古剑", "断岳剑"],
        summary: "主角的家传兵器，剑身如秋水初泓。",
        body: "## 概要\n\n青霜剑是主角从父亲手里接过的传家之物。",
        sourceExcerpt: "作者：那把剑要不就叫青霜？——顾问：可以，正好跟断岳剑的旧名接上。",
        ...overrides,
    };
}

describe("submit_lorebook_draft 契约：工具名与类目口径", () => {
    it("工具名是一个稳定字面量", () => {
        expect(SUBMIT_LOREBOOK_DRAFT_TOOL).toBe("submit_lorebook_draft");
    });

    it("悬挂标记与 M3 / M2.5b 同口径，明确写着等作者确认", () => {
        expect(LOREBOOK_DRAFT_PENDING_MARKER).toBe("LOREBOOK_DRAFT_PENDING_AUTHOR_REVIEW");
        expect(LOREBOOK_DRAFT_PENDING_MARKER).toContain("PENDING_AUTHOR_REVIEW");
    });

    it("九个类目与设定集目录一一对应，一个不多一个不少", () => {
        expect(LOREBOOK_DRAFT_CATEGORIES).toEqual([
            "character",
            "faction",
            "location",
            "item",
            "system",
            "world",
            "event",
            "note",
            "instruction",
        ]);
    });

    it("每个类目都有作者可读的说法，不出现内部目录名", () => {
        for (const category of LOREBOOK_DRAFT_CATEGORIES) {
            const label = LOREBOOK_DRAFT_CATEGORY_LABELS[category];
            expect(label, category).toBeTruthy();
            expect(label, category).not.toBe(category);
        }
    });
});

describe("submit_lorebook_draft 契约：合法草稿", () => {
    it("一份齐全的草稿通过校验并保留全部字段", () => {
        const parsed = LorebookDraftInputSchema.parse(draft({suggestedSlug: "qingshuang-sword"}));

        expect(parsed.title).toBe("青霜剑");
        expect(parsed.category).toBe("item");
        expect(parsed.aliases).toEqual(["家传古剑", "断岳剑"]);
        expect(parsed.suggestedSlug).toBe("qingshuang-sword");
    });

    it("建议目录名可以省略", () => {
        expect(LorebookDraftInputSchema.parse(draft()).suggestedSlug).toBeUndefined();
    });

    it("别名允许空数组：非角色类条目本来就可能没有别的叫法", () => {
        expect(LorebookDraftInputSchema.parse(draft({aliases: []})).aliases).toEqual([]);
    });

    it("各字段前后空白被裁掉（模型常在 JSON 里带换行）", () => {
        const parsed = LorebookDraftInputSchema.parse(draft({title: "  青霜剑  ", summary: "\n 一句话摘要 \n"}));

        expect(parsed.title).toBe("青霜剑");
        expect(parsed.summary).toBe("一句话摘要");
    });
});

describe("submit_lorebook_draft 契约：边界拒绝", () => {
    it("类目必须在九个登记值里", () => {
        expect(LorebookDraftInputSchema.safeParse(draft({category: "typo"})).success).toBe(false);
        expect(LorebookDraftInputSchema.safeParse(draft({category: ""})).success).toBe(false);
        expect(LorebookDraftInputSchema.safeParse(draft({category: "Character"})).success).toBe(false);
    });

    it("标题、摘要、正文、原文摘录缺一不可，且不能只有空白", () => {
        for (const field of ["title", "summary", "body", "sourceExcerpt"]) {
            expect(LorebookDraftInputSchema.safeParse(draft({[field]: ""})).success, field).toBe(false);
            expect(LorebookDraftInputSchema.safeParse(draft({[field]: "   "})).success, field).toBe(false);
            const missing = draft();
            delete (missing as Record<string, unknown>)[field];
            expect(LorebookDraftInputSchema.safeParse(missing).success, field).toBe(false);
        }
    });

    it("标题、摘要、正文、原文摘录各有长度上限，刚好压线合法、超一个字即拒", () => {
        const boundaries = [
            ["title", MAX_LOREBOOK_DRAFT_TITLE_LENGTH],
            ["summary", MAX_LOREBOOK_DRAFT_SUMMARY_LENGTH],
            ["body", MAX_LOREBOOK_DRAFT_BODY_LENGTH],
            ["sourceExcerpt", MAX_LOREBOOK_DRAFT_SOURCE_EXCERPT_LENGTH],
        ] as const;

        for (const [field, limit] of boundaries) {
            expect(LorebookDraftInputSchema.safeParse(draft({[field]: "字".repeat(limit)})).success, field).toBe(true);
            expect(LorebookDraftInputSchema.safeParse(draft({[field]: "字".repeat(limit + 1)})).success, field).toBe(false);
        }
    });

    it("别名条数与单个别名长度都有上限", () => {
        const atLimit = Array.from({length: MAX_LOREBOOK_DRAFT_ALIASES}, (_item, index) => `别称${index}`);
        expect(LorebookDraftInputSchema.safeParse(draft({aliases: atLimit})).success).toBe(true);
        expect(LorebookDraftInputSchema.safeParse(draft({aliases: [...atLimit, "多一个"]})).success).toBe(false);

        expect(LorebookDraftInputSchema.safeParse(draft({aliases: ["字".repeat(MAX_LOREBOOK_DRAFT_ALIAS_LENGTH)]})).success).toBe(true);
        expect(LorebookDraftInputSchema.safeParse(draft({aliases: ["字".repeat(MAX_LOREBOOK_DRAFT_ALIAS_LENGTH + 1)]})).success).toBe(false);
    });

    it("别名列表里混进空白项即拒（空白别名只会让检索匹配到空气）", () => {
        expect(LorebookDraftInputSchema.safeParse(draft({aliases: ["青霜", "  "]})).success).toBe(false);
        expect(LorebookDraftInputSchema.safeParse(draft({aliases: "青霜"})).success).toBe(false);
    });

    it("建议目录名必须是合法目录名形态", () => {
        for (const slug of ["qingshuang", "qingshuang-sword", "003-forge"]) {
            expect(LorebookDraftInputSchema.safeParse(draft({suggestedSlug: slug})).success, slug).toBe(true);
        }
        for (const slug of ["QingShuang", "青霜剑", "qingshuang_sword", "-sword", "sword-", "a b", ""]) {
            expect(LorebookDraftInputSchema.safeParse(draft({suggestedSlug: slug})).success, slug).toBe(false);
        }
        expect(LorebookDraftInputSchema.safeParse(draft({suggestedSlug: "a".repeat(MAX_LOREBOOK_DRAFT_SLUG_LENGTH + 1)})).success).toBe(false);
    });

    it("一次只认一张卡：传数组或非对象一律拒绝", () => {
        expect(LorebookDraftInputSchema.safeParse([draft()]).success).toBe(false);
        expect(LorebookDraftInputSchema.safeParse(null).success).toBe(false);
        expect(LorebookDraftInputSchema.safeParse("青霜剑").success).toBe(false);
    });

    it("契约不接收落盘字段：governance / anchors 由落盘方按沉淀规范补", () => {
        const parsed = LorebookDraftInputSchema.parse(draft({governance: {source: "manual"}}));

        expect("governance" in parsed).toBe(false);
    });
});

describe("目录名生成", () => {
    it("ASCII 标题归一成小写连字符目录名", () => {
        expect(lorebookDraftSlugFromTitle("Qing Shuang Sword")).toBe("qing-shuang-sword");
        expect(lorebookDraftSlugFromTitle("  003 Forge  ")).toBe("003-forge");
    });

    it("中文标题不猜音译，显式返回空串交给落盘方补", () => {
        expect(lorebookDraftSlugFromTitle("青霜剑")).toBe("");
        expect(lorebookDraftSlugFromTitle("")).toBe("");
        expect(lorebookDraftSlugFromTitle("!!!")).toBe("");
    });

    it("裁剪后不会留下悬空中划线", () => {
        expect(lorebookDraftSlugFromTitle("sword " + "x".repeat(80))).toMatch(/^[a-z0-9]+(?:-[a-z0-9]+)*$/u);
    });
});
