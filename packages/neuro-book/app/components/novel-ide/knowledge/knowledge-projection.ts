import {
    basename,
    isPlainObject,
    readNullableString,
    readPlainObject,
    readRefs,
    readString,
    readStringArray,
} from "nbook/app/components/novel-ide/workspace/workspace-frontmatter-profile";
import {
    readAnchors,
    type LorebookFileAnchor,
} from "nbook/app/components/novel-ide/workspace/workspace-lorebook-draft";
import {isLorebookBrowsableEntry, lorebookCategoryOf, lorebookEntryDepth} from "nbook/app/utils/ide-shell-layout";
import type {WorkspaceFileNode} from "nbook/app/stores/novel-ide";

/**
 * 知识库视图的数据投影层。
 *
 * 纯 TS、无 Vue 依赖：把工作区文件树里的 lorebook 条目投影成视图直接消费的
 * 条目卡片数据、阵营分组与章序履历。视图层只负责渲染，不在组件里解析 frontmatter，
 * 也不自己判断「谁是阵营成员」——口径全部收敛在这里。
 *
 * 四条已定口径（改这里等于改契约，务必同步测试）：
 * - 阵营归属：refs 里 target 指向 lorebook/faction/<条目> 的条目即算该阵营成员，
 *   与 relation 无关；一条目可属多个阵营，每个阵营 tab 里都会出现；
 *   一个阵营都没归属的条目进「未分组」桶，且永远排在最后。
 * - 参考资料：note 类目且 lorebook 深度 ≥ 3 的条目（lorebook/note/<分组>/<条目>/ 形态）
 *   单独成组，排在所有阵营 tab 之后、「未分组」桶之前；该组与阵营互斥且优先——
 *   调研摘要条目不是阵营成员，即使 refs 指向阵营（脏数据）也只进参考资料组。
 * - 卡片三标注：来源类型取 governance.source；戏份分级取 subtype；首次登场取 anchors 里最早出现的章。
 * - 履历：anchors 按章序正序排列；章序解析函数由调用方注入（后续接大纲树）。
 */

/** lorebook 根目录名，与 server 的工作区扫描配置一致。 */
const LOREBOOK_ROOT = "lorebook";

/** 阵营类目名：refs 指向这个类目的条目，就是那个阵营的成员。 */
export const FACTION_CATEGORY = "faction";

/** 备注类目名：调研摘要条目落在这个类目下。 */
export const NOTE_CATEGORY = "note";

/** 「一个阵营都没归属」的桶名，直接显示给作者。 */
export const UNGROUPED_FACTION_TITLE = "未分组";

/** 「参考资料」分组的组名，直接显示给作者。 */
export const REFERENCE_GROUP_TITLE = "参考资料";

/**
 * 参考资料条目的 lorebook 深度下限。
 *
 * 调研产物的既有落点是 lorebook/note/<分组>/<条目>/（note/research/<主题>/、
 * note/genre-research/<书>/），深度为 3；深度 2 的 note 条目
 * （note/project-profile、note/story-concept 等项目模板）维持原行为，落「未分组」桶。
 */
const REFERENCE_MIN_LOREBOOK_DEPTH = 3;

/**
 * 章序解析函数：给章名，返回它在书里的序号；返回 null / undefined 表示解析不出来。
 * 由调用方注入（后续从大纲树来），本模块不依赖 plot API。
 */
export type ChapterOrderLookup = (chapter: string) => number | null | undefined;

/**
 * 知识库视图消费的条目。
 *
 * path 是条目目录（不含 /index.md），并且统一抹平了 workspace/ 前缀，
 * 因此可以直接和 frontmatter refs 里写的 lorebook/... 目标路径互相比较。
 */
export type KnowledgeEntry = Readonly<{
    /** 条目目录路径，形如 lorebook/character/hero。 */
    path: string;
    /** 卡片标题，回退顺序：frontmatter.title → 节点标题 → 路径最后一段。 */
    title: string;
    /** 所属 lorebook 类目（路径第 2 段），形如 character / faction。 */
    category: string;
    /** 别名，用于搜索与卡片副标题。 */
    aliases: string[];
    /** 戏份分级等子类型；缺失为 null。 */
    subtype: string | null;
    /** 来源类型（interview / generated / manual / imported）；没写 governance 时为 null。 */
    source: string | null;
    /** 卡片摘要；frontmatter.summary 优先，其次节点摘要。 */
    summary: string;
    /** 出处履历锚点，已按脏数据过滤口径清洗，顺序为 frontmatter 原顺序。 */
    anchors: LorebookFileAnchor[];
    /** 本条归属的阵营条目路径（lorebook/faction/<条目>），去重且保持 refs 顺序。 */
    factionPaths: string[];
    /** 首次登场章名；没有任何锚点时为 null。 */
    firstAppearance: string | null;
}>;

/**
 * 左侧分组：一个阵营一个 tab，外加「参考资料」与「未分组」两个非阵营分组。
 *
 * factionPath 为 null 的有两个：factionTitle 是 REFERENCE_GROUP_TITLE 的参考资料组，
 * 与 UNGROUPED_FACTION_TITLE 的未分组桶。要区分它们请按 factionTitle 判，
 * 不要只看 factionPath 是不是 null。
 */
export type FactionGroup = Readonly<{
    /** 阵营条目路径；null 表示「参考资料」组或「未分组」桶。 */
    factionPath: string | null;
    /** 组名；阵营名未知时回退路径最后一段。 */
    factionTitle: string;
    /** 组内条目，保持传入顺序（排序由调用方决定）。 */
    entries: KnowledgeEntry[];
}>;

/**
 * 归一化条目路径：统一分隔符，去掉 ./ 与 workspace/ 前缀、尾随斜杠和 /index.md 后缀。
 *
 * 同一条目在工作区快照里可能以目录节点（lorebook/character/hero/）或它的
 * index.md 文件节点（lorebook/character/hero/index.md）出现，也会带 workspace/ 前缀，
 * 这几种写法都归一到同一串，保证条目路径与 refs 目标路径能直接比较。
 */
export function normalizeKnowledgeEntryPath(filePath: string): string {
    const normalized = String(filePath ?? "")
        .replace(/\\/g, "/")
        .replace(/^\.\//, "")
        .replace(/\/+$/, "")
        .replace(/^workspace\//, "");
    return normalized.replace(/\/index\.md$/i, "");
}

/** 拆出归一化后的路径段。 */
function segmentsOf(filePath: string): string[] {
    return normalizeKnowledgeEntryPath(filePath).split("/").filter(Boolean);
}

/** 判断一个引用目标是不是 lorebook/faction/<条目>。 */
function isFactionEntryPath(filePath: string): boolean {
    const segments = segmentsOf(filePath);
    return segments[0] === LOREBOOK_ROOT && segments[1] === FACTION_CATEGORY && segments.length >= 3;
}

/**
 * 判断一个条目是不是「参考资料」组里的调研摘要条目。
 *
 * 口径（派发者 2026-09-25 拍板）：类目为 note 且 lorebook 深度 ≥ 3，
 * 即 lorebook/note/<分组>/<条目>/ 这一形态。深度口径复用 ide-shell-layout 的
 * lorebookEntryDepth，不在这里另起一套数法。深度 2 的 note 条目
 * （note/project-profile 等项目模板）不算参考资料，维持落「未分组」的原行为。
 *
 * 入参是条目路径，不是 refs 目标路径：条目确实存在才算数，因此这里看真实路径，
 * 不看条目自己写的 refs。
 */
export function isReferenceEntryPath(filePath: string): boolean {
    const category = lorebookCategoryOf(filePath);
    return category === NOTE_CATEGORY && lorebookEntryDepth(filePath) >= REFERENCE_MIN_LOREBOOK_DEPTH;
}

/**
 * 收集工作区树里的设定条目节点。
 *
 * 是否算「可浏览的设定条目」沿用 ide-shell-layout 的判断（类目说明页、深度不足、
 * 非内容节点、目录节点一律不算），保证知识库视图与设定抽屉看到的是同一批条目。
 * 条目在工作区快照里就是 lorebook/<类目>/<条目>/index.md 这个文件节点，frontmatter 也从它来；
 * 同一条目被重复喂进来时只保留最先出现的那条。
 */
export function collectLorebookEntryNodes(nodes: readonly WorkspaceFileNode[]): WorkspaceFileNode[] {
    const byPath = new Map<string, WorkspaceFileNode>();

    const visit = (items: readonly WorkspaceFileNode[]): void => {
        for (const node of items) {
            if (isLorebookBrowsableEntry(node)) {
                const key = normalizeKnowledgeEntryPath(node.path);
                if (!byPath.has(key)) {
                    byPath.set(key, node);
                }
                continue;
            }
            const children = (node as {children?: WorkspaceFileNode[]}).children;
            if (node.isDirectory && Array.isArray(children)) {
                visit(children);
            }
        }
    };

    visit(nodes ?? []);
    return [...byPath.values()];
}

/** 把工作区树里所有设定条目投影成知识库条目。 */
export function projectKnowledgeEntries(nodes: readonly WorkspaceFileNode[]): KnowledgeEntry[] {
    return collectLorebookEntryNodes(nodes).map((node) => projectKnowledgeEntry(node));
}

/**
 * 把单个设定条目节点投影成知识库条目。
 *
 * frontmatter 是无编译期保护的自由对象，所有字段都走防御式读取：
 * 缺 governance / 缺 refs / 缺 anchors / 字段类型不对，一律降级成空值，不抛错。
 */
export function projectKnowledgeEntry(node: WorkspaceFileNode): KnowledgeEntry {
    const frontmatter = isPlainObject(node.frontmatter) ? node.frontmatter : {};
    const path = normalizeKnowledgeEntryPath(node.path);
    const anchors = readAnchors(frontmatter.anchors);
    const nodeTitle = readNodeText(node.title);
    const category = lorebookCategoryOf(node.path) ?? segmentsOf(path)[1] ?? "";

    return {
        path,
        title: readNullableString(frontmatter.title) ?? (nodeTitle || basename(path)),
        category,
        aliases: readStringArray(frontmatter.aliases),
        subtype: readNullableString(frontmatter.subtype),
        source: readNullableString(readPlainObject(frontmatter.governance).source),
        summary: readString(frontmatter.summary, "").trim() || readNodeText(node.summary),
        anchors,
        factionPaths: readFactionPaths(frontmatter),
        firstAppearance: resolveFirstAppearance(anchors),
    };
}

/** 读取 refs 里指向 faction 的目标路径，去重并保持原顺序。 */
function readFactionPaths(frontmatter: Record<string, unknown>): string[] {
    const seen = new Set<string>();
    for (const ref of readRefs(frontmatter.refs)) {
        const path = normalizeKnowledgeEntryPath(ref.target);
        if (isFactionEntryPath(path)) {
            seen.add(path);
        }
    }
    return [...seen];
}

/** 从投影后的条目里收集阵营名，供 groupEntriesByFaction 直接使用。 */
export function collectFactionTitles(entries: readonly KnowledgeEntry[]): Map<string, string> {
    const titles = new Map<string, string>();
    for (const entry of entries) {
        if (entry.category === FACTION_CATEGORY && !titles.has(entry.path)) {
            titles.set(entry.path, entry.title);
        }
    }
    return titles;
}

/**
 * 按章序排列履历锚点。
 *
 * 能解析出章序的锚点按章序升序排；解析不出来的（章名不在大纲里、调用方没注入
 * chapterOrder、chapterOrder 抛错）保持原来的相对顺序，整体排在能解析的锚点之后。
 * 相同章序的锚点也保持原相对顺序，保证结果稳定、不抖动。
 */
export function orderAnchors(
    anchors: readonly LorebookFileAnchor[],
    chapterOrder?: ChapterOrderLookup | null,
): LorebookFileAnchor[] {
    const list = Array.isArray(anchors) ? anchors : [];
    const decorated = list.map((anchor, index) => ({
        anchor,
        index,
        order: readChapterOrder(anchor, chapterOrder),
    }));
    const resolved = decorated
        .filter((item) => item.order !== null)
        .sort((left, right) => (left.order as number) - (right.order as number) || left.index - right.index);
    const unresolved = decorated.filter((item) => item.order === null);
    return [...resolved, ...unresolved].map((item) => item.anchor);
}

/** 首次登场章：按同一章序口径取最早的那个锚点的章名。 */
export function resolveFirstAppearance(
    anchors: readonly LorebookFileAnchor[],
    chapterOrder?: ChapterOrderLookup | null,
): string | null {
    const ordered = orderAnchors(anchors, chapterOrder);
    return ordered.length > 0 ? ordered[0]?.chapter ?? null : null;
}

/**
 * 解析单个锚点的章序；解析不出来时返回 null。
 *
 * 章名不是字符串、调用方没注入解析函数、解析函数返回非数字或直接抛错，
 * 都按「解析不出来」处理——履历宁可顺序退化，也不能让整块知识库崩掉。
 */
function readChapterOrder(anchor: LorebookFileAnchor, chapterOrder?: ChapterOrderLookup | null): number | null {
    const chapter = anchor && typeof anchor.chapter === "string" ? anchor.chapter : "";
    if (!chapterOrder || !chapter) {
        return null;
    }
    try {
        const order = chapterOrder(chapter);
        return typeof order === "number" && Number.isFinite(order) ? order : null;
    } catch {
        return null;
    }
}

/**
 * 把条目分组，喂给知识库视图左侧的 tab。
 *
 * 三档优先级由高到低，一条条目只出现在一个档里：
 * 1. 「参考资料」：note 类目且 lorebook 深度 ≥ 3 的调研摘要条目单独成组，
 *    排在所有阵营 tab 之后、「未分组」桶之前。它压过阵营归属——调研条目不是阵营成员，
 *    即使 refs 指向某个阵营（脏数据）也只进这一组，不出现在阵营 tab，更不落未分组。
 * 2. 阵营：一条条目归属几个阵营就出现在几个组里，阵营组按阵营名排序。
 * 3. 「未分组」：前两档都没命中的条目，置底。
 *
 * 例外：阵营条目自己（category = faction）不进「未分组」——它已经是分组轴上的 tab，
 * 再以卡片身份躺在未分组里只会重复；faction 条目自身的详情入口 v1 不提供。
 * factionTitles 由调用方提供（一般来自 collectFactionTitles），未知阵营回退路径最后一段。
 * 条目数组为空时返回空数组——没有条目就没有组，不造空壳。
 */
export function groupEntriesByFaction(
    entries: readonly KnowledgeEntry[],
    factionTitles: ReadonlyMap<string, string> = new Map(),
): FactionGroup[] {
    const buckets = new Map<string, KnowledgeEntry[]>();
    const references: KnowledgeEntry[] = [];
    const ungrouped: KnowledgeEntry[] = [];

    for (const entry of entries ?? []) {
        // 参考资料最优先：调研摘要条目即便 refs 指向阵营，也只进这一组。
        if (isReferenceEntryPath(entry.path)) {
            references.push(entry);
            continue;
        }
        const factionPaths = Array.from(new Set(entry.factionPaths ?? []));
        if (factionPaths.length === 0) {
            // 阵营条目只作为分组轴上的 tab 存在，不再作为卡片落进未分组。
            if (entry.category !== FACTION_CATEGORY) {
                ungrouped.push(entry);
            }
            continue;
        }
        for (const factionPath of factionPaths) {
            const bucket = buckets.get(factionPath);
            if (bucket) {
                bucket.push(entry);
            } else {
                buckets.set(factionPath, [entry]);
            }
        }
    }

    const groups: FactionGroup[] = [...buckets.entries()]
        .map(([factionPath, grouped]) => ({
            factionPath,
            factionTitle: resolveFactionTitle(factionPath, factionTitles),
            entries: grouped,
        }))
        .sort((left, right) => left.factionTitle.localeCompare(right.factionTitle, "zh-Hans-CN")
            || left.factionPath.localeCompare(right.factionPath));

    // 参考资料排在所有阵营 tab 之后、「未分组」桶之前；没条目就不造空壳组。
    if (references.length > 0) {
        groups.push({factionPath: null, factionTitle: REFERENCE_GROUP_TITLE, entries: references});
    }

    if (ungrouped.length > 0) {
        groups.push({factionPath: null, factionTitle: UNGROUPED_FACTION_TITLE, entries: ungrouped});
    }
    return groups;
}

/** 阵营名：优先用调用方给的名称，未知时回退路径最后一段。 */
function resolveFactionTitle(factionPath: string, factionTitles: ReadonlyMap<string, string>): string {
    const title = factionTitles.get(factionPath);
    if (typeof title === "string" && title.trim()) {
        return title;
    }
    return basename(factionPath) || factionPath;
}

/** 防御式读取节点上的文本字段：非字符串或空白一律当空。 */
function readNodeText(value: unknown): string {
    return typeof value === "string" ? value.trim() : "";
}
