import type {RetrievalSummaryDto} from "nbook/shared/dto/agent-retrieval.dto";

/**
 * 检索明细的界面投影（M2.7a）。
 *
 * 这里只做「契约字段 → 作者能看懂的文案」的纯映射，不碰 Vue：
 * 气泡组件负责渲染，本模块负责怎么说人话，测试直接测文案口径。
 */

/** 组件侧把 vue-i18n 的 t 适配成本模块要求的形状。 */
export type RetrievalTranslate = (key: string, params?: {[key: string]: string | number}) => string;

/** 气泡里的一行明细。字段为空表示服务端没给，界面直接不显示这一段。 */
export type RetrievalDisplayItem = {
    /** 条目标题：设定名或伏笔名。 */
    title: string;
    /** 设定一级类目的显示名；服务端没给类目时为 null，未登记的类目回退成类目原文。 */
    category: string | null;
    /** 实际命中的词。 */
    trigger: string | null;
    /** 设定条目目录。 */
    path: string | null;
};

/**
 * vue-i18n 在当前语言缺少 key 时原样返回 key；用它判断这条文案到底有没有翻译。
 */
const isMissingTranslation = (text: string, key: string): boolean => text === key;

/**
 * 设定一级类目的中文/英文显示名。
 *
 * 类目白名单由设定集抽屉维护（`ide.shell.lorebookCategory_*`），这里只做复用：
 * 未登记的类目原样显示，不新建翻译，也不猜。
 */
export const lorebookCategoryLabel = (category: string, t: RetrievalTranslate): string => {
    const key = `ide.shell.lorebookCategory_${category}`;
    const label = t(key);
    return isMissingTranslation(label, key) ? category : label;
};

/**
 * 徽标上的「本轮检索到了什么」。
 *
 * 只有真实发生注入才会走到这里：没有明细就说明没有检索，不能显示「0 条」。
 */
export const retrievalBadgeLabel = (summary: RetrievalSummaryDto, t: RetrievalTranslate): string => {
    const label = summary.kind === "promise-ledger"
        ? t("agent.textBubble.retrievalPromises", {count: summary.items.length})
        : t("agent.textBubble.retrievalEntities", {count: summary.items.length});
    const omittedCount = summary.omittedCount ?? 0;
    if (omittedCount <= 0) {
        return label;
    }
    // 被预算截断的那些没进正文，作者光看正文会以为「就这些」。
    return `${label}${t("agent.textBubble.retrievalOmitted", {count: omittedCount})}`;
};

/** 展开后逐条列出的明细。 */
export const retrievalDisplayItems = (summary: RetrievalSummaryDto, t: RetrievalTranslate): RetrievalDisplayItem[] => {
    return summary.items.map((item): RetrievalDisplayItem => ({
        title: item.title,
        category: item.category ? lorebookCategoryLabel(item.category, t) : null,
        trigger: item.trigger ?? null,
        path: item.path ?? null,
    }));
};

/** 明细行的辅助文案：命中词与来源目录；字段缺失就不产生空段落。 */
export const retrievalItemMeta = (item: {trigger?: string | null; path?: string | null}, t: RetrievalTranslate): string[] => {
    const parts: string[] = [];
    if (item.trigger) {
        parts.push(t("agent.textBubble.retrievalHit", {trigger: item.trigger}));
    }
    if (item.path) {
        parts.push(item.path);
    }
    return parts;
};
