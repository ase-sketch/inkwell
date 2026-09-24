import {describe, expect, it} from "vitest";
import {
    aliasChips,
    anchorTimeline,
    detailBadges,
    detailCategoryIcon,
    detailCategoryLabel,
    detailSummary,
    factionChips,
    sourceBadgeLabel,
    subtypeBadgeLabel,
} from "nbook/app/components/novel-ide/knowledge/knowledge-detail-display";
import type {KnowledgeEntry} from "nbook/app/components/novel-ide/knowledge/knowledge-projection";
import zhCN from "../../../i18n/locales/zh-CN";
import enUS from "../../../i18n/locales/en-US";

/** 极简 i18n：命中返回译文，缺 key 时像 vue-i18n 一样原样返回 key。 */
function translator(locale: {[key: string]: any}) {
    return (key: string, params?: {[key: string]: string | number}): string => {
        const value = key.split(".").reduce<any>((node, segment) => node?.[segment], locale);
        if (typeof value !== "string") {
            return key;
        }
        return params
            ? value.replace(/\{(\w+)\}/g, (_match, name: string) => String(params[name] ?? ""))
            : value;
    };
}

const zhT = translator(zhCN);
const enT = translator(enUS);

function entry(overrides: Partial<KnowledgeEntry> = {}): KnowledgeEntry {
    return {
        path: "lorebook/character/hero",
        title: "阿苍",
        category: "character",
        aliases: [],
        subtype: null,
        source: null,
        summary: "",
        anchors: [],
        factionPaths: [],
        firstAppearance: null,
        ...overrides,
    };
}

describe("M2.7b 条目详情投影", () => {
    it("类目显示名复用设定抽屉的翻译，未知类目原样显示", () => {
        expect(detailCategoryLabel("character", zhT)).toBe("人物档案");
        expect(detailCategoryLabel("character", enT)).toBe("Characters");
        expect(detailCategoryLabel("relic", zhT)).toBe("relic");
        // 空类目不产生翻译查找，直接给空串。
        expect(detailCategoryLabel("  ", zhT)).toBe("");
    });

    it("类目图标取登记表的图标，未知类目回退成通用图标而不是空白", () => {
        expect(detailCategoryIcon("character")).toBe("i-lucide-user-round");
        expect(detailCategoryIcon("faction")).toBe("i-lucide-flag");
        expect(detailCategoryIcon("relic")).toBe("i-lucide-scroll-text");
        expect(detailCategoryIcon("")).toBe("i-lucide-scroll-text");
    });

    it("别名去空白去重，保持作者书写顺序", () => {
        expect(aliasChips([" 小苍 ", "苍", "小苍", "", "   "])).toEqual(["小苍", "苍"]);
        expect(aliasChips([])).toEqual([]);
        expect(aliasChips(null)).toEqual([]);
    });

    it("阵营名走注入的中文名，未登记的回退路径最后一段", () => {
        const titles = new Map([["lorebook/faction/qingyun-sect", "青云宗"]]);

        expect(factionChips(["lorebook/faction/qingyun-sect", "lorebook/faction/black-tower"], titles))
            .toEqual(["青云宗", "black-tower"]);
        // 没有阵营归属时为空——「未分组」不是阵营，不占 chip。
        expect(factionChips([], titles)).toEqual([]);
        expect(factionChips(null)).toEqual([]);
        // 没有注入名称表时全部回退路径最后一段，不炸不空白。
        expect(factionChips(["lorebook/faction/qingyun-sect"])).toEqual(["qingyun-sect"]);
    });

    it("来源类型徽标四种说法成对，未登记来源不显示徽标", () => {
        expect(sourceBadgeLabel("interview", zhT)).toBe("访谈沉淀");
        expect(sourceBadgeLabel("generated", zhT)).toBe("AI 整理");
        expect(sourceBadgeLabel("manual", zhT)).toBe("手动添加");
        expect(sourceBadgeLabel("imported", zhT)).toBe("外部导入");
        expect(sourceBadgeLabel("interview", enT)).toBe("From interviews");
        // 未登记来源与空来源都不显示，不把机器词甩给作者。
        expect(sourceBadgeLabel("harvested-by-cron", zhT)).toBeNull();
        expect(sourceBadgeLabel(null, zhT)).toBeNull();
        expect(sourceBadgeLabel("  ", zhT)).toBeNull();
    });

    it("戏份分级只对人物档案显示，其他类目的 subtype 不是戏份", () => {
        expect(subtypeBadgeLabel("character", "person", zhT)).toBe("人物");
        expect(subtypeBadgeLabel("character", "important", zhT)).toBe("重要配角");
        expect(subtypeBadgeLabel("character", "background", zhT)).toBe("背景角色");
        expect(subtypeBadgeLabel("character", "unknown", zhT)).toBe("待定");
        expect(subtypeBadgeLabel("character", "group", zhT)).toBe("团体");
        expect(subtypeBadgeLabel("character", "person", enT)).toBe("Main character");
        // 法宝的 subtype 是装备分类，拿到头上当「戏份」是误导。
        expect(subtypeBadgeLabel("item", "equipment", zhT)).toBeNull();
        // 人物条目未登记的分级原样显示。
        expect(subtypeBadgeLabel("character", "mentor", zhT)).toBe("mentor");
        // 没有 subtype 时整枚徽标不出现。
        expect(subtypeBadgeLabel("character", null, zhT)).toBeNull();
        expect(subtypeBadgeLabel("character", "   ", zhT)).toBeNull();
    });

    it("头部徽标按来源 → 戏份 → 首次登场排列，缺哪项就少哪枚", () => {
        const badges = detailBadges(entry({
            source: "generated",
            subtype: "important",
            firstAppearance: "第三章 雪夜",
        }), zhT);

        expect(badges).toEqual([
            {kind: "source", label: "AI 整理"},
            {kind: "subtype", label: "重要配角"},
            {kind: "firstAppearance", label: "首次登场：第三章 雪夜"},
        ]);
    });

    it("三无条目一枚徽标都没有，且首次登场用章名参数化", () => {
        expect(detailBadges(entry(), zhT)).toEqual([]);
        expect(detailBadges(entry({firstAppearance: "第一章 落雪"}), zhT))
            .toEqual([{kind: "firstAppearance", label: "首次登场：第一章 落雪"}]);
        expect(detailBadges(entry({firstAppearance: "第一章 落雪"}), enT))
            .toEqual([{kind: "firstAppearance", label: "First appears in 第一章 落雪"}]);
        // 空白首次登场不算数，不显示「首次登场：」这种半截话。
        expect(detailBadges(entry({firstAppearance: "   "}), zhT)).toEqual([]);
    });

    it("履历按章序正序，标题取 note、无 note 退回章名", () => {
        const items = anchorTimeline([
            {chapter: "第二章 风起", quote: "他握紧了刀。", note: "第一次拔刀"},
            {chapter: "第一章 落雪", quote: "雪落在肩上。"},
        ], (chapter) => ({["第一章 落雪"]: 1, ["第二章 风起"]: 2}[chapter] ?? null));

        // 「第一章 落雪」没有 note，标题退回章名；「第二章 风起」用作者写的备注当标题。
        expect(items.map((item) => [item.title, item.chapter, item.quote, item.note])).toEqual([
            ["第一章 落雪", "第一章 落雪", "雪落在肩上。", null],
            ["第一次拔刀", "第二章 风起", "他握紧了刀。", "第一次拔刀"],
        ]);
        // key 稳定且同章多条不撞车。
        expect(new Set(items.map((item) => item.key)).size).toBe(2);
    });

    it("章序解析不出来时保持原序并排在后面，不丢锚点", () => {
        const items = anchorTimeline([
            {chapter: "番外 那年夏天", quote: "夏天。"},
            {chapter: "第一章 落雪", quote: "雪。"},
        ], (chapter) => chapter === "第一章 落雪" ? 1 : null);

        expect(items.map((item) => item.chapter)).toEqual(["第一章 落雪", "番外 那年夏天"]);
    });

    it("没有锚点时给空数组，界面据此显示空态引导", () => {
        expect(anchorTimeline([], () => 1)).toEqual([]);
        expect(anchorTimeline(null)).toEqual([]);
    });

    it("摘要只有作者写过才显示", () => {
        expect(detailSummary(entry({summary: "  少时流落北境。  "}))).toBe("少时流落北境。");
        expect(detailSummary(entry())).toBe("");
        expect(detailSummary(entry({summary: "   "}))).toBe("");
    });

    it("中英文案的详情 key 一一对应", () => {
        expect(Object.keys(zhCN.ide.knowledge.detail).sort())
            .toEqual(Object.keys(enUS.ide.knowledge.detail).sort());
    });

    it("作者向文案里不出现工程术语", () => {
        const forbidden = /subtype|governance|frontmatter|anchor|entry|Task|Phase|M2\./i;
        for (const text of Object.values(zhCN.ide.knowledge.detail)) {
            expect(forbidden.test(text), text).toBe(false);
        }
    });
});
