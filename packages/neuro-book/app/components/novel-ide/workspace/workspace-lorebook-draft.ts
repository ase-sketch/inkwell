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
    ext?: Record<string, unknown>;
    /** 旧内容节点可能保留的废弃 writingTip 字段；仅用于原样写回。 */
    legacyWritingTip?: string | null;
};

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

    return {
        title: readString(frontmatter.title, node.title || basename(node.path)),
        name: basename(node.path).replace(/\.md$/i, ""),
        path: node.path,
        icon: normalizeLucideIconName(frontmatter.icon),
        type: readWorkspaceLorebookType(typeof frontmatter.type === "string" ? frontmatter.type : null),
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
        ...ext,
        ...legacyWritingTip,
    };
}

/**
 * 将草稿渲染回 Markdown 文档。
 *
 * 字段顺序与面板既有风格保持一致；anchors 紧跟 refs、ext 收在 governance 之后，
 * 与 content-node-schema.ts 的标准字段顺序对齐。缺省字段不写出，显式空值原样写出。
 */
export function renderLorebookDraft(draft: LorebookFileDraft): string {
    const frontmatter: Record<string, unknown> = {
        title: draft.title,
        icon: draft.icon,
        type: draft.type,
        subtype: draft.subtype,
        status: draft.status,
        aliases: draft.aliases,
        tags: draft.tags,
        summary: draft.summary,
        refs: draft.refs,
        ...(draft.anchors !== undefined ? {anchors: draft.anchors} : {}),
        retrieval: draft.retrieval,
        governance: draft.governance,
        ...(draft.ext !== undefined ? {ext: draft.ext} : {}),
        ...(draft.legacyWritingTip !== undefined ? {writingTip: draft.legacyWritingTip} : {}),
    };
    return renderMarkdownDocument(frontmatter, draft.content);
}
