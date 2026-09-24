import {basename} from "nbook/app/components/novel-ide/workspace/workspace-frontmatter-profile";
import type {LorebookFileAnchor} from "nbook/app/components/novel-ide/workspace/workspace-lorebook-draft";
import {
    orderAnchors,
    type ChapterOrderLookup,
    type KnowledgeEntry,
} from "nbook/app/components/novel-ide/knowledge/knowledge-projection";
import {LOREBOOK_CATEGORIES} from "nbook/app/utils/ide-shell-layout";

/**
 * 条目详情页的界面投影（M2.7b）。
 *
 * 这里只做「契约字段 → 作者能看懂的文案」的纯映射，不碰 Vue：
 * 详情组件负责渲染，本模块负责怎么说人话，测试直接测文案口径。
 * 界面不应自己在模板里拼 i18n key，也不应自己判断「这条算不算有戏份分级」——
 * 口径全部收敛在这里，改这里等于改契约。
 */

/** 组件侧把 vue-i18n 的 t 适配成本模块要求的形状。 */
export type DetailTranslate = (key: string, params?: {[key: string]: string | number}) => string;

/**
 * 徽标身份。
 * 来源、戏份分级、首次登场各自最多一枚，kind 同时用作渲染 key 与测试锚点。
 */
export type DetailBadgeKind = "source" | "subtype" | "firstAppearance";

/** 条目头部的一枚标注徽标。 */
export type DetailBadge = {
    kind: DetailBadgeKind;
    /** 徽标上的文案，已翻译。 */
    label: string;
};

/** 履历时间线上的一项。 */
export type AnchorTimelineItem = {
    /** 稳定渲染 key：同一章可能有多条锚点，用序号区分。 */
    key: string;
    /** 这一行的标题：作者写的 note 优先，没有 note 时退回章名。 */
    title: string;
    /** 锚点所在章名，可点击跳转。 */
    chapter: string;
    /** 原文摘句。 */
    quote: string;
    /** 作者写的备注；为 null 表示没有 note（模板据此决定要不要单独显示标题行）。 */
    note: string | null;
};

/**
 * vue-i18n 在当前语言缺少 key 时原样返回 key；用它判断这条文案到底有没有翻译。
 */
const isMissingTranslation = (text: string, key: string): boolean => text === key;

/** 未知类目的兜底图标，与设定抽屉把未知类目当成「暗线备忘」的口径一致。 */
const FALLBACK_CATEGORY_ICON = "i-lucide-scroll-text";

/**
 * 来源类型（governance.source）的作者向说法。
 *
 * 这四种之外的取值（基座未来新增、或作者手改出来的）一律不显示徽标，
 * 宁可少一枚徽标，也不把机器词直接甩给作者。
 */
const SOURCE_BADGE_KEYS = new Map<string, string>([
    ["interview", "ide.knowledge.detail.sourceInterview"],
    ["generated", "ide.knowledge.detail.sourceGenerated"],
    ["manual", "ide.knowledge.detail.sourceManual"],
    ["imported", "ide.knowledge.detail.sourceImported"],
]);

/**
 * 戏份分级（character 条目的 subtype）的作者向说法。
 * 未登记的取值原样显示，不新增翻译也不猜。
 */
const SUBTYPE_BADGE_KEYS = new Map<string, string>([
    ["person", "ide.knowledge.detail.subtypePerson"],
    ["important", "ide.knowledge.detail.subtypeImportant"],
    ["background", "ide.knowledge.detail.subtypeBackground"],
    ["unknown", "ide.knowledge.detail.subtypeUnknown"],
    ["group", "ide.knowledge.detail.subtypeGroup"],
]);

/** 字符串字段的防御式取值：非字符串或全空白一律当没有。 */
const readText = (value: unknown): string => typeof value === "string" ? value.trim() : "";

/**
 * 条目类目的显示名。
 *
 * 类目白名单与文案由设定抽屉维护（`ide.shell.lorebookCategory_*`），这里只做复用：
 * 未登记的类目原样显示，不新建翻译也不猜。
 */
export function detailCategoryLabel(category: string, t: DetailTranslate): string {
    const value = readText(category);
    if (!value) {
        return "";
    }
    const key = `ide.shell.lorebookCategory_${value}`;
    const label = t(key);
    return isMissingTranslation(label, key) ? value : label;
}

/** 条目类目的图标类名；未登记类目回退成通用图标，不留空白。 */
export function detailCategoryIcon(category: string): string {
    const value = readText(category);
    return LOREBOOK_CATEGORIES.find((item) => item.id === value)?.icon ?? FALLBACK_CATEGORY_ICON;
}

/** 别名 chips：去掉空白与重复，保持作者书写顺序。 */
export function aliasChips(aliases: readonly string[] | null | undefined): string[] {
    const seen = new Set<string>();
    for (const alias of aliases ?? []) {
        const value = readText(alias);
        if (value) {
            seen.add(value);
        }
    }
    return [...seen];
}

/**
 * 所属阵营 chips。
 *
 * 阵营中文名由调用方用 collectFactionTitles 收集后注入；查不到的阵营回退路径最后一段，
 * 与 groupEntriesByFaction 的口径保持一致。没有阵营归属时返回空数组——
 * 「未分组」不是一个阵营，不占一枚 chip。
 */
export function factionChips(
    factionPaths: readonly string[] | null | undefined,
    factionTitles?: ReadonlyMap<string, string> | null,
): string[] {
    const titles = factionTitles ?? new Map<string, string>();
    const seen = new Set<string>();
    for (const factionPath of factionPaths ?? []) {
        const path = readText(factionPath);
        if (!path) {
            continue;
        }
        const title = readText(titles.get(path)) || basename(path) || path;
        seen.add(title);
    }
    return [...seen];
}

/**
 * 来源类型徽标；没有来源或来源不在白名单里时返回 null，界面不显示这一段。
 */
export function sourceBadgeLabel(source: string | null | undefined, t: DetailTranslate): string | null {
    const key = SOURCE_BADGE_KEYS.get(readText(source));
    return key ? t(key) : null;
}

/**
 * 戏份分级徽标。
 *
 * 只有人物档案类目才有戏份分级：别的类目的 subtype 是各自领域的细分
 * （法宝的 subtype 是 equipment、地点是 building……），拿到详情页头上当「戏份」是误导。
 * 人物条目未登记的 subtype 原样显示，不新增翻译也不猜。
 */
export function subtypeBadgeLabel(
    category: string | null | undefined,
    subtype: string | null | undefined,
    t: DetailTranslate,
): string | null {
    if (readText(category) !== "character") {
        return null;
    }
    const value = readText(subtype);
    if (!value) {
        return null;
    }
    const key = SUBTYPE_BADGE_KEYS.get(value);
    return key ? t(key) : value;
}

/**
 * 条目头部的全部标注徽标，按来源 → 戏份分级 → 首次登场的固定顺序。
 * 没有的标注不占位，作者看到几枚就是几枚。
 */
export function detailBadges(entry: KnowledgeEntry, t: DetailTranslate): DetailBadge[] {
    const badges: DetailBadge[] = [];

    const source = sourceBadgeLabel(entry.source, t);
    if (source) {
        badges.push({kind: "source", label: source});
    }

    const subtype = subtypeBadgeLabel(entry.category, entry.subtype, t);
    if (subtype) {
        badges.push({kind: "subtype", label: subtype});
    }

    const firstAppearance = readText(entry.firstAppearance);
    if (firstAppearance) {
        badges.push({
            kind: "firstAppearance",
            label: t("ide.knowledge.detail.firstAppearanceBadge", {chapter: firstAppearance}),
        });
    }

    return badges;
}

/**
 * 「登场与履历」时间线。
 *
 * 顺序口径复用 orderAnchors：能解析出章序的按章序升序，解析不出来的保持原序排在最后。
 * 每项标题取作者写的 note，没有 note 时退回章名——时间线上不能出现空白标题。
 * 没有锚点时返回空数组，界面据此显示空态引导，而不是留一块空白。
 */
export function anchorTimeline(
    anchors: readonly LorebookFileAnchor[] | null | undefined,
    chapterOrder?: ChapterOrderLookup | null,
): AnchorTimelineItem[] {
    return orderAnchors(anchors ?? [], chapterOrder).map((anchor, index) => {
        const chapter = readText(anchor?.chapter);
        const note = readText(anchor?.note);
        return {
            key: `${index}-${chapter}`,
            title: note || chapter,
            chapter,
            quote: typeof anchor?.quote === "string" ? anchor.quote : "",
            note: note || null,
        };
    });
}

/** 摘要：作者写过的才显示，空白摘要不占版面。 */
export function detailSummary(entry: KnowledgeEntry): string {
    return readText(entry.summary);
}
