import {
    createLorebookDraft,
    renderLorebookDraft,
    type LorebookFileAnchor,
    type LorebookFileDraft,
} from "nbook/app/components/novel-ide/workspace/workspace-lorebook-draft";
import {parseMarkdownDocument} from "nbook/app/components/novel-ide/workspace/workspace-frontmatter-profile";
import {readWorkspaceLorebookType} from "nbook/app/components/novel-ide/workspace/workspace-entry-meta";
import {lorebookCategoryOf} from "nbook/app/utils/ide-shell-layout";
import {resolveApiErrorStatus} from "nbook/app/utils/api-error";

/**
 * 条目编辑器的纯逻辑层：锚点表单、保存载荷与落盘冲突判定。
 *
 * .vue 只负责渲染与事件转发，校验与载荷组装全部在这里，便于 vitest 直测
 * （仓内 vitest 没有 plugin-vue，.vue 不能进测试）。
 */

/** 作者在编辑器里能改的戏份分级；与 WorkspaceLorebookDetailPanel 的既有口径一致。 */
export const KNOWLEDGE_CHARACTER_SUBTYPES = ["person", "important", "background", "unknown", "group"] as const;

/** 下拉里「不在清单内」的保留值：当前戏份分级无法归入上面任何一档时选中它。 */
export const KNOWLEDGE_SUBTYPE_OTHER = "__other__";

/** 锚点表单的一行。note 用空串表示没写，不做 null。 */
export type KnowledgeAnchorRow = {
    chapter: string;
    quote: string;
    note: string;
};

/** 锚点校验错误：指出哪一行哪个字段为空，文案由视图层按 i18n 渲染。 */
export type KnowledgeAnchorIssue = Readonly<{
    index: number;
    field: "chapter" | "quote";
}>;

/** 一次打开编辑器所需的全部状态。 */
export type KnowledgeEditorState = {
    draft: LorebookFileDraft;
    anchors: KnowledgeAnchorRow[];
    /** frontmatter 解析失败的原文；空串表示解析正常。界面应就地提示并拦保存。 */
    parseError: string;
};

/** 写通道的乐观锁参数。 */
export type KnowledgeWriteLock = {
    /** 加载时读到的原文；用于冲突对比。 */
    baseContent: string;
    /** 加载时节点的 mtimeMs；写通道只有带上它才会真正做冲突检测。 */
    expectedMtimeMs?: number | null;
};

/**
 * 读取条目全文并建出编辑器状态。
 *
 * anchors 一律摊平成表单行：界面按行渲染，缺省与空数组在界面上没有区别，
 * 区别只在写回时——见 applyAnchorRows。
 */
export function createKnowledgeEditorState(
    node: {path: string; title?: string | null},
    content: string,
): KnowledgeEditorState {
    const parsed = parseMarkdownDocument(content);
    const draft = createLorebookDraft(node, parsed.frontmatter, parsed.body);
    return {
        draft,
        anchors: toAnchorRows(draft.anchors ?? []),
        parseError: parsed.error ?? "",
    };
}

/** 锚点 → 表单行。note 缺失与 null 都落成空串，写回时不会多出空 note。 */
export function toAnchorRows(anchors: readonly LorebookFileAnchor[]): KnowledgeAnchorRow[] {
    return anchors.map((anchor) => ({
        chapter: anchor.chapter,
        quote: anchor.quote,
        note: anchor.note ?? "",
    }));
}

/** 表单行 → 锚点。note 只剩空白时不写 note 键，保持与原文件同样的形状。 */
export function toAnchor(row: KnowledgeAnchorRow): LorebookFileAnchor {
    const note = row.note.trim();
    return note ? {chapter: row.chapter, quote: row.quote, note} : {chapter: row.chapter, quote: row.quote};
}

/**
 * 校验锚点表单：chapter 与 quote 必填（对应 schema 的 min(1)）。
 *
 * 逐行检查、字段顺序固定为 chapter → quote，返回全部问题而不是第一个，
 * 让作者一次看到所有要补的地方。
 */
export function validateAnchorRows(rows: readonly KnowledgeAnchorRow[]): KnowledgeAnchorIssue[] {
    const issues: KnowledgeAnchorIssue[] = [];
    rows.forEach((row, index) => {
        if (!row.chapter.trim()) {
            issues.push({index, field: "chapter"});
        }
        if (!row.quote.trim()) {
            issues.push({index, field: "quote"});
        }
    });
    return issues;
}

/**
 * 把表单行写回草稿的 anchors。
 *
 * 三态保真：原文件没有 anchors 字段且表单也是空的，就不凭空造出这个字段；
 * 其余情况一律写成数组（含显式空数组），与原文件的显式空数组行为一致。
 */
export function applyAnchorRows(draft: LorebookFileDraft, rows: readonly KnowledgeAnchorRow[]): LorebookFileDraft {
    if (draft.anchors === undefined && rows.length === 0) {
        return draft;
    }
    draft.anchors = rows.map(toAnchor);
    return draft;
}

/**
 * 条目所属类目：路径上 lorebook/<类目> 的那一段，认不出时为 null。
 *
 * 类目来自文件所在目录，比 frontmatter 的 type 更硬——所以编辑界面一律用类目
 * 生成下拉选项，认不出的原值只作展示与保真，绝不写回（那会把条目挪到别的类目下，
 * 而文件本身还在原处，等于制造前后不一致）。
 */
export function knowledgeCategoryOf(draft: LorebookFileDraft): string | null {
    return lorebookCategoryOf(draft.path);
}

/** 当前类目下拉应显示的取值：路径类目优先，认不出路径时退回草稿的 type。 */
export function resolveTypeSelection(draft: LorebookFileDraft): string {
    return knowledgeCategoryOf(draft) ?? draft.type;
}

/**
 * 作者在下拉里选了某一类目时写回草稿。
 *
 * 原值那一项与路径类目同名，重新点中它等于没改，不能把 rawType 抹掉——
 * 否则只是点开又关上下拉，作者原本的分类就被写成 note 了。
 */
export function applyTypeSelection(draft: LorebookFileDraft, value: string): LorebookFileDraft {
    if (value === knowledgeCategoryOf(draft)) {
        return draft;
    }
    draft.type = readWorkspaceLorebookType(value);
    draft.rawType = null;
    return draft;
}

/**
 * 当前戏份分级下拉应显示的取值；不在 5 档里时落到「其他」。
 *
 * 界面必须在选中「其他」时把原值显示出来，不能显示成空白——那等于让作者以为分级丢了。
 */
export function resolveSubtypeSelection(subtype: string | null): string {
    if (!subtype) {
        return "";
    }
    return (KNOWLEDGE_CHARACTER_SUBTYPES as readonly string[]).includes(subtype)
        ? subtype
        : KNOWLEDGE_SUBTYPE_OTHER;
}

/** 下拉选择写回 subtype；选「其他」保持原值不动，清空则落成 null。 */
export function applySubtypeSelection(draft: LorebookFileDraft, value: string): LorebookFileDraft {
    if (value === KNOWLEDGE_SUBTYPE_OTHER) {
        return draft;
    }
    draft.subtype = value.trim() ? value : null;
    return draft;
}

/**
 * 组装写通道载荷。
 *
 * 必须带上 expectedMtimeMs：写通道只在它存在时才做冲突检测（baseContent 只用于
 * 冲突详情里的对比）。节点没有 mtime 时退化为只带 baseContent。
 */
export function buildKnowledgeWritePayload(
    draft: LorebookFileDraft,
    lock: KnowledgeWriteLock,
): Record<string, unknown> {
    const payload: Record<string, unknown> = {
        path: draft.path,
        content: renderLorebookDraft(draft),
        baseContent: lock.baseContent,
    };
    if (typeof lock.expectedMtimeMs === "number") {
        payload.expectedMtimeMs = lock.expectedMtimeMs;
    }
    return payload;
}

/** 落盘失败是不是「文件已被其他地方改过」。 */
export function isKnowledgeWriteConflict(error: unknown): boolean {
    return resolveApiErrorStatus(error) === 409;
}

/** 比较两份全文，判断作者的改动是否还没落盘。 */
export function isKnowledgeContentDirty(current: string, loaded: string): boolean {
    return current !== loaded;
}
