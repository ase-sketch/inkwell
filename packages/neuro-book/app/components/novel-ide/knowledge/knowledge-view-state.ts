import {
    orderAnchors,
    normalizeKnowledgeEntryPath,
    REFERENCE_GROUP_TITLE,
    resolveFirstAppearance,
    UNGROUPED_FACTION_TITLE,
    type ChapterOrderLookup,
    type FactionGroup,
    type KnowledgeEntry,
} from "nbook/app/components/novel-ide/knowledge/knowledge-projection";
import type {WorkspaceFileNode} from "nbook/app/stores/novel-ide";

/**
 * 知识库视图容器的纯逻辑层（M2.7b-T3）。
 *
 * 视图组件只负责渲染与把事件转成这些函数的调用；阵营 tab 序、当前选中、
 * 阵营内过滤、条目文件节点解析、章节正文反查与章序 lookup 构建全部在这里，
 * 便于 vitest 直测（仓内 vitest 没有 plugin-vue，.vue 不能进测试）。
 *
 * 三条已定口径（改这里等于改契约，务必同步测试）：
 * - 章序 lookup 同时接受两种章名写法：Plot 章节 name（如「第一章 启程」）与
 *   manuscript 目录名（如「001-departure」）。目录名比对会先抹掉开头的序号前缀，
 *   让「001-开篇」与「开篇」互相认得出；两者都匹配不到就返回 null，
 *   交给 orderAnchors 把这条锚点排到能解析的锚点之后（履历顺序退化，不崩）。
 * - 条目文件节点 = 工作区树里条目目录下的 index.md 文件节点；找不到就是找不到，
 *   不猜、不退化到目录节点（编辑器要的是能直接读写的文件）。
 * - 当前条目始终从「当前 tab + 当前过滤词」的结果里取：作者换了 tab 或改了过滤词，
 *   选中自动落到结果第一条；一条都没有时是 null，界面显示空态而不是留一块空白。
 */

/** 「一个阵营都没归属」那个 tab 的稳定 id；阵营 tab 的 id 就是阵营条目路径。 */
export const KNOWLEDGE_UNGROUPED_TAB_ID = "__ungrouped__";

/** 「参考资料」那个 tab 的稳定 id（它不是阵营，没有阵营条目路径可用）。 */
export const KNOWLEDGE_REFERENCE_TAB_ID = "__reference__";

/** 卡片摘要摘录的默认长度（字符）。 */
const CARD_EXCERPT_LENGTH = 72;

/**
 * 大纲树里本模块用到的最小形状。
 *
 * 刻意不依赖 PlotTreeDto 的具体类型：只要求「卷 → 章」加「未归卷的章」这两层，
 * 服务端加字段不会打断这里的构建，测试也能直接喂字面量。
 */
export type PlotOrderChapter = {
    id?: string | null;
    name: string;
    sortOrder?: number;
};

export type PlotOrderAct = {
    sortOrder?: number;
    chapters?: readonly PlotOrderChapter[];
};

export type PlotOrderSource = {
    acts?: readonly PlotOrderAct[];
    ungroupedChapters?: readonly PlotOrderChapter[];
};

/** 大纲里的一章：id 供「找章节正文」用，order 是全书序（从 0 起）。 */
export type ChapterRef = Readonly<{
    id: string | null;
    name: string;
    sortOrder: number;
    order: number;
}>;

/** 章序检索表：lookup 直接喂给投影层的 orderAnchors / firstAppearance。 */
export type ChapterOrderIndex = Readonly<{
    lookup: ChapterOrderLookup;
    /** Plot 章节 name 原样 → 章。 */
    byChapterName: ReadonlyMap<string, ChapterRef>;
    /** 抹掉序号前缀的章名 → 章，用来认 manuscript 目录名。 */
    byDirectoryName: ReadonlyMap<string, ChapterRef>;
    chapters: ChapterRef[];
}>;

/** 左侧分组 tab 的展示数据。 */
export type KnowledgeTabInfo = Readonly<{
    /** 阵营条目路径；「参考资料」是 KNOWLEDGE_REFERENCE_TAB_ID，「未分组」是 KNOWLEDGE_UNGROUPED_TAB_ID。 */
    id: string;
    title: string;
    factionPath: string | null;
    /** tab 上显示的条数。 */
    count: number;
    ungrouped: boolean;
    /** 是不是「参考资料」组；它与 ungrouped 互斥，两者都为 false 时才是阵营 tab。 */
    reference: boolean;
}>;

/**
 * 构建章序检索表。
 *
 * 顺序口径与情节面板一致：先按卷的 sortOrder 排卷，卷内按章的 sortOrder 排章，
 * 未归卷的章接在最后，同样按 sortOrder。全局序在这个拍平顺序上从 0 递增，
 * 因此它只用于「谁前谁后」的比较，不代表章号。
 * 传 null / 空对象都合法：此时任何章名都解析不出顺序，履历按原顺序显示。
 */
export function buildChapterOrderIndex(plot?: PlotOrderSource | null): ChapterOrderIndex {
    const ordered: PlotOrderChapter[] = [];

    for (const act of sortByOrder(plot?.acts ?? [])) {
        for (const chapter of sortByOrder(act.chapters ?? [])) {
            ordered.push(chapter);
        }
    }
    for (const chapter of sortByOrder(plot?.ungroupedChapters ?? [])) {
        ordered.push(chapter);
    }

    const byChapterName = new Map<string, ChapterRef>();
    const byDirectoryName = new Map<string, ChapterRef>();
    const chapters: ChapterRef[] = [];

    ordered.forEach((chapter, order) => {
        const name = readText(chapter?.name);
        if (!name) {
            return;
        }
        const ref: ChapterRef = {
            id: readText(chapter.id) || null,
            name,
            sortOrder: readSortOrder(chapter.sortOrder),
            order,
        };
        chapters.push(ref);
        if (!byChapterName.has(name)) {
            byChapterName.set(name, ref);
        }
        const directoryName = stripChapterOrdinal(name);
        if (directoryName && !byDirectoryName.has(directoryName)) {
            byDirectoryName.set(directoryName, ref);
        }
    });

    const lookup: ChapterOrderLookup = (chapter: string): number | null => {
        const name = readText(chapter);
        if (!name) {
            return null;
        }
        // 两种写法都试：先原样认 Plot 章节名，再抹掉序号前缀认 manuscript 目录名。
        for (const candidate of [name, stripChapterOrdinal(name)]) {
            if (!candidate) {
                continue;
            }
            const byName = byChapterName.get(candidate);
            if (byName) {
                return byName.order;
            }
            const byDirectory = byDirectoryName.get(candidate);
            if (byDirectory) {
                return byDirectory.order;
            }
        }
        return null;
    };

    return {lookup, byChapterName, byDirectoryName, chapters};
}

/**
 * 抹掉章名开头的序号前缀。
 *
 * manuscript 章节目录名形如 001-departure / 002_交锋，Plot 章节名通常不带序号；
 * 去掉「数字 + 分隔符」这一层，两种写法才能互相认出来。
 */
export function stripChapterOrdinal(value: string): string {
    const name = readText(value);
    if (!name) {
        return "";
    }
    return name.replace(/^\d+\s*[-—_]\s*/u, "").trim();
}

/**
 * 分组 → 左侧 tab 数据。
 *
 * 非阵营的两个组名沿用投影层给的常量（「参考资料」/「未分组」），
 * 这样组名与排序口径都只住在投影层一处，视图层不再各写一份中文。
 */
export function buildKnowledgeTabs(groups: readonly FactionGroup[]): KnowledgeTabInfo[] {
    return (groups ?? []).map((group) => ({
        id: knowledgeTabId(group),
        title: isReferenceGroup(group)
            ? REFERENCE_GROUP_TITLE
            : group.factionPath === null
                ? UNGROUPED_FACTION_TITLE
                : readText(group.factionTitle) || group.factionPath,
        factionPath: group.factionPath,
        count: group.entries.length,
        ungrouped: group.factionPath === null && !isReferenceGroup(group),
        reference: isReferenceGroup(group),
    }));
}

/** 分组的 tab id：阵营条目路径；参考资料与未分组各用固定 id。 */
export function knowledgeTabId(group: Pick<FactionGroup, "factionPath" | "factionTitle">): string {
    if (isReferenceGroup(group)) {
        return KNOWLEDGE_REFERENCE_TAB_ID;
    }
    return group.factionPath ?? KNOWLEDGE_UNGROUPED_TAB_ID;
}

/**
 * 是不是「参考资料」分组。
 *
 * 投影层用 factionPath = null 同时表达「参考资料」与「未分组」两组，靠组名区分；
 * 复用投影层的 REFERENCE_GROUP_TITLE，不在这里另写一份中文字面量。
 */
function isReferenceGroup(group: Pick<FactionGroup, "factionPath" | "factionTitle">): boolean {
    return group?.factionPath === null && readText(group?.factionTitle) === REFERENCE_GROUP_TITLE;
}

/**
 * 当前该显示哪个 tab：选中的还在就保持，不在（被删、换了项目）就退回第一个。
 * 一个 tab 都没有时返回空串，界面据此显示整页空态。
 */
export function resolveActiveTabId(tabs: readonly {id: string}[], current: string): string {
    const list = tabs ?? [];
    const value = readText(current);
    if (value && list.some((tab) => tab.id === value)) {
        return value;
    }
    return list[0]?.id ?? "";
}

/**
 * 阵营内过滤：标题、别名、简介任一命中即保留（不分大小写）。
 * 过滤词为空时原样返回，作者清空输入框不会看到列表抖动。
 */
export function filterKnowledgeEntries(entries: readonly KnowledgeEntry[], query: string): KnowledgeEntry[] {
    const list = entries ?? [];
    const needle = readText(query).toLowerCase();
    if (!needle) {
        return [...list];
    }
    return list.filter((entry) => entryHaystack(entry).includes(needle));
}

/**
 * 当前该显示哪条条目：选中的还在结果里就保持，否则退回第一条；没有就是 null。
 * 换 tab 或改过滤词后选中自动落到新结果的第一条，靠的就是这里。
 */
export function pickActiveEntry(entries: readonly KnowledgeEntry[], currentPath: string): KnowledgeEntry | null {
    const list = entries ?? [];
    const path = readText(currentPath);
    if (path) {
        const found = list.find((entry) => entry.path === path);
        if (found) {
            return found;
        }
    }
    return list[0] ?? null;
}

/**
 * 用章序 lookup 重算条目的履历顺序与首次登场。
 *
 * 口径闭环：卡片上的「首次登场」徽标、详情里的履历时间线、详情头部徽标
 * （detailBadges 直接读 entry.firstAppearance）全都走同一份重算结果，
 * 不会再出现「卡片说第三章、详情说第一章」的裂口。
 */
export function orderKnowledgeEntry(entry: KnowledgeEntry, chapterOrder?: ChapterOrderLookup | null): KnowledgeEntry {
    return {
        ...entry,
        anchors: orderAnchors(entry.anchors, chapterOrder),
        firstAppearance: resolveFirstAppearance(entry.anchors, chapterOrder),
    };
}

/**
 * 条目详情里的 index.md 文件节点。
 *
 * 条目路径是目录（lorebook/character/hero），而能读写的文件是它的 index.md；
 * 工作区快照里两者都存在，这里只认文件节点。
 */
export function resolveEntryIndexNode(
    nodes: readonly WorkspaceFileNode[],
    entryPath: string,
): WorkspaceFileNode | null {
    const directory = normalizeKnowledgeEntryPath(entryPath);
    if (!directory) {
        return null;
    }
    const target = `${directory}/index.md`;
    return collectWorkspaceNodes(nodes).find((node) => (
        !node.isDirectory && normalizeFilePath(node.path) === target
    )) ?? null;
}

/**
 * 按锚点里的章名找章节正文文件节点。
 *
 * 反查顺序与基座 current-chapter-context 的口径对齐：
 * 1. frontmatter.chapter 精确等于章名（正文自己声明的归属最硬）；
 * 2. manuscript 目录名抹掉序号前缀后等于章名（001-开篇 ↔ 开篇）。
 * 都找不到返回 null；调用方据此提示作者，而不是跳到一个猜出来的文件。
 */
export function resolveManuscriptChapterNode(
    nodes: readonly WorkspaceFileNode[],
    chapter: string,
): WorkspaceFileNode | null {
    const name = readText(chapter);
    if (!name) {
        return null;
    }
    const chapters = collectWorkspaceNodes(nodes).filter(isManuscriptChapterNode);
    if (chapters.length === 0) {
        return null;
    }

    const byPointer = chapters.find((node) => readText(node.frontmatter?.chapter) === name);
    if (byPointer) {
        return byPointer;
    }

    const directoryName = stripChapterOrdinal(name);
    if (!directoryName) {
        return null;
    }
    return chapters.find((node) => stripChapterOrdinal(pathDirectoryName(node.path)) === directoryName) ?? null;
}

/**
 * 把工作区树拍平成节点数组。
 *
 * 服务端快照是平铺的，但「目录带 children」的形状在别处（抽屉、投影）也出现过，
 * 这里两种都吃：只看节点自己，不看它是不是目录。
 */
export function collectWorkspaceNodes(nodes: readonly WorkspaceFileNode[]): WorkspaceFileNode[] {
    const collected: WorkspaceFileNode[] = [];
    const visit = (items: readonly WorkspaceFileNode[] | undefined | null): void => {
        for (const node of items ?? []) {
            if (!node) {
                continue;
            }
            collected.push(node);
            const children = (node as {children?: WorkspaceFileNode[]}).children;
            if (Array.isArray(children)) {
                visit(children);
            }
        }
    };
    visit(nodes);
    return collected;
}

/** 卡片摘要摘录：太长就截断加省略号，作者一眼能扫完。 */
export function knowledgeEntryExcerpt(entry: Pick<KnowledgeEntry, "summary">, maxLength = CARD_EXCERPT_LENGTH): string {
    const summary = readText(entry?.summary);
    const limit = Number.isFinite(maxLength) && maxLength > 0 ? Math.floor(maxLength) : 0;
    if (!summary || limit <= 0 || summary.length <= limit) {
        return summary;
    }
    return `${summary.slice(0, limit)}…`;
}

/** 是不是 manuscript 下的章节目录文件节点（manuscript/…/index.md）。 */
function isManuscriptChapterNode(node: WorkspaceFileNode): boolean {
    if (!node || node.isDirectory) {
        return false;
    }
    const filePath = normalizeFilePath(node.path);
    return filePath.startsWith("manuscript/") && /\/index\.md$/i.test(filePath);
}

/** 文件节点所在目录名：manuscript/001-开篇/index.md → 001-开篇。 */
function pathDirectoryName(filePath: string): string {
    const segments = normalizeFilePath(filePath).split("/").filter(Boolean);
    if (segments.length >= 2 && /^index\.md$/i.test(segments[segments.length - 1] ?? "")) {
        return segments[segments.length - 2] ?? "";
    }
    return segments[segments.length - 1] ?? "";
}

/** 归一化文件路径：统一分隔符、去掉 ./ 与 workspace/ 前缀、压掉重复斜杠。 */
function normalizeFilePath(filePath: string): string {
    return String(filePath ?? "")
        .replace(/\\/g, "/")
        .replace(/^\.\//, "")
        .replace(/^workspace\//, "")
        .replace(/\/{2,}/g, "/");
}

/** 过滤用的检索文本：标题、别名、简介拼一起，统一小写。 */
function entryHaystack(entry: KnowledgeEntry): string {
    const parts = [entry?.title, ...(entry?.aliases ?? []), entry?.summary];
    return parts.map((part) => (typeof part === "string" ? part.toLowerCase() : "")).join("\n");
}

/** 防御式读取文本字段：非字符串或全空白一律当没有。 */
function readText(value: unknown): string {
    return typeof value === "string" ? value.trim() : "";
}

/** 防御式读取排序号：缺失或非数字当 0，保证排序稳定。 */
function readSortOrder(value: unknown): number {
    return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

/** 按 sortOrder 稳定排序：同序保持原数组顺序。 */
function sortByOrder<T extends {sortOrder?: number}>(items: readonly T[]): T[] {
    return items
        .map((item, index) => ({item, index}))
        .sort((left, right) => readSortOrder(left.item.sortOrder) - readSortOrder(right.item.sortOrder) || left.index - right.index)
        .map((entry) => entry.item);
}
