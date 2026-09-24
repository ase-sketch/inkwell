import {
    basename,
    isPlainObject,
    readGovernance,
    readNullableString,
    readRefs,
    readRetrieval,
    readString,
    readStringArray,
    renderMarkdownDocument,
    type FrontmatterRef,
    type GovernanceDraft,
    type RetrievalDraft,
} from "nbook/app/components/novel-ide/workspace/workspace-frontmatter-profile";
import {
    isWorkspaceLorebookType,
    readWorkspaceLorebookType,
    type WorkspaceLorebookType,
} from "nbook/app/components/novel-ide/workspace/workspace-entry-meta";
import {normalizeLucideIconName} from "nbook/app/utils/lucide-icons";

export type LorebookFileRef = FrontmatterRef;

/**
 * 条目出处锚点。
 * 契约见 server/workspace-files/content-node-schema.ts 的 WorkspaceContentAnchorSchema
 * 与 assets/reference/content/lorebook-anchors.md。
 */
export type LorebookFileAnchor = {
    chapter: string;
    quote: string;
    note?: string;
};

/**
 * 面板编辑中的 lorebook 条目草稿。
 *
 * anchors 与 ext 用「可选」区分三种状态，是往返保真的关键：
 * - 字段缺省：原文件没有该字段，写回时也不应凭空造出来（旧条目行为不变）；
 * - anchors: []：原文件显式写了空数组，必须原样保留显式空数组；
 * - 有值：数组/对象原样搬运。
 */
export type LorebookFileDraft = {
    title: string;
    name: string;
    path: string;
    icon: string | null;
    type: WorkspaceLorebookType;
    /**
     * 原文件里 type 的原文；认得出（或本来就没写 type）时为 null。
     *
     * type 的五值口径服务于基座旧的呈现层，会把 schema 里的 faction / event / species
     * 等合法取值静默改写成 note——那等于把作者的分类信息写没。渲染时 rawType 优先：
     * 认不出就原样写回，认得出（undefined）才写归一化后的 type。
     */
    rawType?: string | null;
    subtype: string | null;
    status: string;
    aliases: string[];
    tags: string[];
    summary: string;
    content: string;
    refs: LorebookFileRef[];
    anchors?: LorebookFileAnchor[];
    retrieval: RetrievalDraft;
    governance: GovernanceDraft;
    /**
     * frontmatter 里所有已知字段之外的键，原样收录、原样写回。
     *
     * 条目面板只认识上面那几个已知字段，其余键（包括基座未来新增的、作者手写的）走这里，
     * 保存时不丢。createLorebookDraft 总会填成一个对象（没有额外键时是空对象）；
     * 手工构造的草稿可以不给，缺省即「什么都不多写」。
     * 字段顺序：已知字段 → extra 键 → ext。
     */
    extra?: Record<string, unknown>;
    ext?: Record<string, unknown>;
    /** 旧内容节点可能保留的废弃 writingTip 字段；仅用于原样写回。 */
    legacyWritingTip?: string | null;
};

/**
 * 渲染时由本模块自己写出的 frontmatter 键。
 *
 * 这些键之外的任何一个键都归 extra，原样搬运。清单里包含 legacyWritingTip：
 * 它的钥匙是 writingTip，不能既被当作 extra 又被单独写一遍。
 */
const KNOWN_LOREBOOK_KEYS = new Set<string>([
    "title",
    "icon",
    "type",
    "subtype",
    "status",
    "aliases",
    "tags",
    "summary",
    "refs",
    "anchors",
    "retrieval",
    "governance",
    "ext",
    "writingTip",
]);

/**
 * 判断 frontmatter 是否显式含有某个字段。
 */
function hasOwnFrontmatterKey(frontmatter: Record<string, unknown>, key: string): boolean {
    return Object.prototype.hasOwnProperty.call(frontmatter, key);
}

/**
 * 读取条目锚点数组。
 *
 * 只保留同时具备 chapter 与 quote 的锚点：渲染时锚点会被 YAML 重新序列化，
 * 混在数组里的任意值会变成机器无法校验的垃圾数据（见 lorebook-anchors.md 反例）。
 * 不裁剪 chapter/quote 的原始文本，保证往返逐字段相等。
 */
export function readAnchors(value: unknown): LorebookFileAnchor[] {
    if (!Array.isArray(value)) {
        return [];
    }

    const anchors: LorebookFileAnchor[] = [];
    for (const item of value) {
        if (!isPlainObject(item)) {
            continue;
        }
        const chapter = readString(item.chapter, "");
        const quote = readString(item.quote, "");
        if (!chapter.trim() || !quote.trim()) {
            continue;
        }
        // note 缺失与 note: null 统一落成「无 note」，避免写回时多出 note: null。
        const note = readNullableString(item.note);
        anchors.push(note === null ? {chapter, quote} : {chapter, quote, note});
    }
    return anchors;
}

/**
 * 读取 ext 自由扩展对象。
 *
 * 仅接受普通对象：ext 是「自由对象」，数组、字符串或 null 不能冒充对象，
 * 否则写回时会重造一个原文件里并不存在的 ext 字段。
 */
export function readExt(value: unknown): Record<string, unknown> {
    return isPlainObject(value) ? value : {};
}

/**
 * 读取无法识别的 type 原文；认得出（含缺省）时返回 null。
 *
 * 缺省 type 不写回，非字符串 type 也没有可写回的原文——两种情况都落到 null。
 */
export function readRawLorebookType(value: unknown): string | null {
    if (isWorkspaceLorebookType(typeof value === "string" ? value : null)) {
        return null;
    }
    return typeof value === "string" && value.trim() ? value : null;
}

/**
 * 收录 frontmatter 里所有「不在已知字段清单内」的键。
 *
 * 地点/规则面板的 extra 机制：面板只认识自己那几个键，其余原样搬运，保存时不丢。
 * 本模块的已知字段清单必须与 renderLorebookDraft 写出的键一一对应，
 * 漏一个就会让那个键在保存后变成 extra 与被改写字段的双份。
 */
export function collectLorebookExtra(frontmatter: Record<string, unknown>): Record<string, unknown> {
    const extra: Record<string, unknown> = {};
    for (const key of Object.keys(frontmatter)) {
        if (KNOWN_LOREBOOK_KEYS.has(key)) {
            continue;
        }
        extra[key] = frontmatter[key];
    }
    return extra;
}

/**
 * 由 frontmatter 与正文创建 lorebook 条目草稿。
 */
export function createLorebookDraft(
    node: {path: string; title?: string | null},
    frontmatter: Record<string, unknown>,
    body: string,
): LorebookFileDraft {
    const legacyWritingTip = hasOwnFrontmatterKey(frontmatter, "writingTip")
        ? {legacyWritingTip: readNullableString(frontmatter.writingTip)}
        : {};
    const anchors = hasOwnFrontmatterKey(frontmatter, "anchors")
        ? {anchors: readAnchors(frontmatter.anchors)}
        : {};
    const ext = hasOwnFrontmatterKey(frontmatter, "ext")
        ? {ext: readExt(frontmatter.ext)}
        : {};
    const extra = collectLorebookExtra(frontmatter);

    return {
        title: readString(frontmatter.title, node.title || basename(node.path)),
        name: basename(node.path).replace(/\.md$/i, ""),
        path: node.path,
        icon: normalizeLucideIconName(frontmatter.icon),
        type: readWorkspaceLorebookType(typeof frontmatter.type === "string" ? frontmatter.type : null),
        rawType: readRawLorebookType(frontmatter.type),
        subtype: readNullableString(frontmatter.subtype),
        status: readString(frontmatter.status, "draft"),
        aliases: readStringArray(frontmatter.aliases),
        tags: readStringArray(frontmatter.tags),
        summary: readString(frontmatter.summary, ""),
        content: body,
        refs: readRefs(frontmatter.refs),
        ...anchors,
        retrieval: readRetrieval(frontmatter.retrieval),
        governance: readGovernance(frontmatter.governance),
        extra,
        ...ext,
        ...legacyWritingTip,
    };
}

/**
 * 将草稿渲染回 Markdown 文档。
 *
 * 字段顺序与面板既有风格保持一致；anchors 紧跟 refs，未知/自定义键（extra）与 ext
 * 收在 governance 之后，extra 在前、ext 在后。缺省字段不写出，显式空值原样写出。
 */
export function renderLorebookDraft(draft: LorebookFileDraft): string {
    // type 是已知字段，永远不会出现在 extra 里，因此 rawType 是「认不出的 type」的唯一出处。
    const frontmatter: Record<string, unknown> = {
        title: draft.title,
        icon: draft.icon,
        type: draft.rawType ?? draft.type,
        subtype: draft.subtype,
        status: draft.status,
        aliases: draft.aliases,
        tags: draft.tags,
        summary: draft.summary,
        refs: draft.refs,
        ...(draft.anchors !== undefined ? {anchors: draft.anchors} : {}),
        retrieval: draft.retrieval,
        governance: draft.governance,
        ...(draft.extra ?? {}),
        ...(draft.ext !== undefined ? {ext: draft.ext} : {}),
        ...(draft.legacyWritingTip !== undefined ? {writingTip: draft.legacyWritingTip} : {}),
    };
    return renderMarkdownDocument(frontmatter, draft.content);
}
