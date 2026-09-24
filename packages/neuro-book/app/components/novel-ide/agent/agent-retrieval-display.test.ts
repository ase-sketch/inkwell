import {describe, expect, it} from "vitest";
import {deriveMessagesFromChatEntries} from "nbook/app/components/novel-ide/agent/agent-message";
import type {AgentChatEntryDto} from "nbook/shared/dto/agent-public-event.dto";
import type {RetrievalSummaryDto} from "nbook/shared/dto/agent-retrieval.dto";
import {
    lorebookCategoryLabel,
    retrievalBadgeLabel,
    retrievalDisplayItems,
    retrievalItemMeta,
} from "nbook/app/components/novel-ide/agent/agent-retrieval-display";
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

function systemEntry(retrieval?: RetrievalSummaryDto): Extract<AgentChatEntryDto, {type: "system"}> {
    return {
        id: "system-1",
        timestamp: 1,
        type: "system",
        source: "custom",
        label: "设定注入",
        content: {preview: "本轮注入的设定正文", bytes: 24, omitted: false},
        ...(retrieval ? {retrieval} : {}),
    };
}

const entitySummary: RetrievalSummaryDto = {
    kind: "mentioned-entities",
    items: [
        {title: "艾琳娜", category: "character", path: "lorebook/character/erina", trigger: "艾琳娜"},
        {title: "北境雪原", category: "location", path: "lorebook/location/north", trigger: "北境"},
    ],
};

describe("M2.7a 检索归因投影", () => {
    it("system entry 带 retrieval 时投影到气泡消息", () => {
        const messages = deriveMessagesFromChatEntries([systemEntry(entitySummary)]);

        expect(messages[0]?.retrieval).toEqual(entitySummary);
    });

    it("旧 session 的 system entry 没有 retrieval 字段时不挂空壳", () => {
        const messages = deriveMessagesFromChatEntries([systemEntry()]);

        expect(messages[0]?.retrieval).toBeUndefined();
        // 字段本身不能存在：气泡靠「有没有 retrieval」决定显不显示徽标，空壳会变成「查阅 0 条」的谎报。
        expect(Object.hasOwn(messages[0] ?? {}, "retrieval")).toBe(false);
    });

    it("promise-ledger 的 retrieval 同样投影", () => {
        const summary: RetrievalSummaryDto = {kind: "promise-ledger", items: [{title: "断剑的来历", promiseId: 7}]};
        const messages = deriveMessagesFromChatEntries([systemEntry(summary)]);

        expect(messages[0]?.retrieval).toEqual(summary);
    });

    it("徽标按检索类别给不同说法，中文不出现工程词", () => {
        expect(retrievalBadgeLabel(entitySummary, zhT)).toBe("查阅 2 条设定");
        expect(retrievalBadgeLabel({kind: "promise-ledger", items: [{title: "断剑的来历", promiseId: 7}]}, zhT)).toBe("查阅 1 条伏笔");
        expect(retrievalBadgeLabel(entitySummary, enT)).toBe("Looked up 2 setting(s)");
    });

    it("有被截断的条目时徽标补一句未展开数量", () => {
        const summary: RetrievalSummaryDto = {...entitySummary, omittedCount: 3};

        expect(retrievalBadgeLabel(summary, zhT)).toBe("查阅 2 条设定（另有 3 条未展开）");
        expect(retrievalBadgeLabel(summary, enT)).toBe("Looked up 2 setting(s) (3 more not included)");
        // omittedCount 为 0 或省略都不追加。
        expect(retrievalBadgeLabel({...entitySummary, omittedCount: 0}, zhT)).toBe("查阅 2 条设定");
    });

    it("明细逐条给出标题、类目显示名、命中词与来源目录", () => {
        const items = retrievalDisplayItems(entitySummary, zhT);

        expect(items).toEqual([
            {title: "艾琳娜", category: "人物档案", trigger: "艾琳娜", path: "lorebook/character/erina"},
            {title: "北境雪原", category: "地理秘境", trigger: "北境", path: "lorebook/location/north"},
        ]);
        expect(retrievalItemMeta(items[0]!, zhT)).toEqual(["命中「艾琳娜」", "lorebook/character/erina"]);
    });

    it("伏笔明条只有标题也能渲染，缺失字段不产生空段落", () => {
        const items = retrievalDisplayItems({kind: "promise-ledger", items: [{title: "断剑的来历", promiseId: 7}]}, zhT);

        expect(items).toEqual([{title: "断剑的来历", category: null, trigger: null, path: null}]);
        expect(retrievalItemMeta(items[0]!, zhT)).toEqual([]);
    });

    it("未登记的类目原样显示，不新增翻译也不丢信息", () => {
        expect(lorebookCategoryLabel("character", zhT)).toBe("人物档案");
        expect(lorebookCategoryLabel("character", enT)).toBe("Characters");
        expect(lorebookCategoryLabel("relic", zhT)).toBe("relic");
    });

    it("中英文案的检索 key 一一对应", () => {
        expect(Object.keys(zhCN.agent.textBubble).sort()).toEqual(Object.keys(enUS.agent.textBubble).sort());
    });
});
