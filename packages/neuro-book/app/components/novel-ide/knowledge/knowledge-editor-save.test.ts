import {describe, expect, it} from "vitest";
import {parseMarkdownDocument} from "nbook/app/components/novel-ide/workspace/workspace-frontmatter-profile";
import {
    applyAnchorRows,
    applySubtypeSelection,
    applyTypeSelection,
    buildKnowledgeWritePayload,
    createKnowledgeEditorState,
    isKnowledgeContentDirty,
    knowledgeCategoryOf,
    isKnowledgeWriteConflict,
    resolveSubtypeSelection,
    resolveTypeSelection,
    toAnchor,
    toAnchorRows,
    validateAnchorRows,
    KNOWLEDGE_SUBTYPE_OTHER,
} from "nbook/app/components/novel-ide/knowledge/knowledge-editor-save";

const NODE = {path: "lorebook/character/qing-yun/index.md", title: "青云真人"};

const CHARACTER_ENTRY = `---
title: 青云真人
type: character
subtype: person
status: active
icon: null
aliases:
  - 青云
tags:
  - 主角
summary: 青云宗掌门。
refs: []
anchors:
  - chapter: "001-chapter"
    quote: "他抬起手，云海散开。"
    note: "首次登场"
  - chapter: "003-chapter"
    quote: "剑光落下的那一刻，他笑了。"
retrieval:
  enabled: true
  trigger: null
governance:
  source: manual
  review: proposed
ext:
  reviewRound: 2
---

# 青云真人

正文。
`;

function stateOf(source: string) {
    return createKnowledgeEditorState(NODE, source);
}

describe("条目编辑器：锚点表单", () => {
    it("从原文摊平成表单行，有 note 的保留、没 note 的落成空串", () => {
        const rows = stateOf(CHARACTER_ENTRY).anchors;

        expect(rows).toEqual([
            {chapter: "001-chapter", quote: "他抬起手，云海散开。", note: "首次登场"},
            {chapter: "003-chapter", quote: "剑光落下的那一刻，他笑了。", note: ""},
        ]);
    });

    it("chapter 与 quote 必填，逐行报出全部问题", () => {
        const issues = validateAnchorRows([
            {chapter: "", quote: "", note: ""},
            {chapter: "001-chapter", quote: "有的", note: ""},
            {chapter: "002-chapter", quote: "   ", note: ""},
        ]);

        expect(issues).toEqual([
            {index: 0, field: "chapter"},
            {index: 0, field: "quote"},
            {index: 2, field: "quote"},
        ]);
    });

    it("只有空白的 note 不写进锚点，不产生 note: \"\"", () => {
        expect(toAnchor({chapter: "001-chapter", quote: "一句原文", note: "   "})).toEqual({
            chapter: "001-chapter",
            quote: "一句原文",
        });
        expect(toAnchor({chapter: "001-chapter", quote: "一句原文", note: " 说明 "})).toEqual({
            chapter: "001-chapter",
            quote: "一句原文",
            note: "说明",
        });
    });

    it("原文件没有 anchors 且表单为空时，不凭空长出 anchors 字段", () => {
        const source = `---
title: 无锚点条目
type: note
status: draft
---

正文
`;
        const state = stateOf(source);
        expect(state.draft.anchors).toBeUndefined();

        applyAnchorRows(state.draft, []);
        const rendered = JSON.stringify(parseMarkdownDocument(
            renderFrom(state.draft),
        ).frontmatter);

        expect(rendered).not.toContain("anchors");
    });

    it("显式空 anchors 加了一行后写回该行，删光后仍是显式空数组", () => {
        const source = `---
title: 空锚点条目
type: note
status: draft
anchors: []
---

正文
`;
        const state = stateOf(source);
        expect(state.draft.anchors).toEqual([]);

        applyAnchorRows(state.draft, [{chapter: "001-chapter", quote: "一句原文", note: ""}]);
        expect(state.draft.anchors).toEqual([{chapter: "001-chapter", quote: "一句原文"}]);

        applyAnchorRows(state.draft, []);
        expect(state.draft.anchors).toEqual([]);
    });

    it("表单行往返后原文的锚点顺序不变", () => {
        const state = stateOf(CHARACTER_ENTRY);
        applyAnchorRows(state.draft, toAnchorRows(state.draft.anchors ?? []));

        expect(state.draft.anchors).toEqual([
            {chapter: "001-chapter", quote: "他抬起手，云海散开。", note: "首次登场"},
            {chapter: "003-chapter", quote: "剑光落下的那一刻，他笑了。"},
        ]);
    });
});

describe("条目编辑器：类目与戏份分级", () => {
    it("类目以下拉路径为准，未识别的 type 只作原值展示", () => {
        const draft = stateOf(CHARACTER_ENTRY.replace("type: character", "type: faction")).draft;

        expect(knowledgeCategoryOf(draft)).toBe("character");
        expect(resolveTypeSelection(draft)).toBe("character");
        // 草稿层照样记着原文，保存时不会把它写成 note
        expect(draft.rawType).toBe("faction");
        expect(draft.type).toBe("note");
    });

    it("不在 lorebook 下的路径没有类目，退回草稿的 type", () => {
        const state = createKnowledgeEditorState(
            {path: "manuscript/001-开篇/index.md", title: "开篇"},
            CHARACTER_ENTRY,
        );

        expect(knowledgeCategoryOf(state.draft)).toBeNull();
        expect(resolveTypeSelection(state.draft)).toBe("character");
    });

    it("重新点中当前类目不会把未识别的 type 抹掉", () => {
        const draft = stateOf(CHARACTER_ENTRY.replace("type: character", "type: faction")).draft;

        applyTypeSelection(draft, "character");
        expect(draft.rawType).toBe("faction");

        const frontmatter = parseMarkdownDocument(renderFrom(draft)).frontmatter;
        expect(frontmatter.type).toBe("faction");
    });

    it("选了别的类目后写回新值，不再保留原文", () => {
        const draft = stateOf(CHARACTER_ENTRY.replace("type: character", "type: faction")).draft;

        applyTypeSelection(draft, "location");
        expect(draft.rawType).toBeNull();
        expect(parseMarkdownDocument(renderFrom(draft)).frontmatter.type).toBe("location");
    });

    it("戏份分级在 5 档内直接显示，不在档内落成「其他」", () => {
        expect(resolveSubtypeSelection("important")).toBe("important");
        expect(resolveSubtypeSelection("mentor")).toBe(KNOWLEDGE_SUBTYPE_OTHER);
        expect(resolveSubtypeSelection(null)).toBe("");
    });

    it("未识别的戏份分级选了「其他」时原值不动", () => {
        const draft = stateOf(CHARACTER_ENTRY.replace("subtype: person", "subtype: mentor")).draft;

        applySubtypeSelection(draft, KNOWLEDGE_SUBTYPE_OTHER);
        expect(draft.subtype).toBe("mentor");
        expect(parseMarkdownDocument(renderFrom(draft)).frontmatter.subtype).toBe("mentor");
    });

    it("改戏份分级与清空都能写回", () => {
        const draft = stateOf(CHARACTER_ENTRY).draft;

        applySubtypeSelection(draft, "background");
        expect(parseMarkdownDocument(renderFrom(draft)).frontmatter.subtype).toBe("background");

        applySubtypeSelection(draft, "");
        expect(parseMarkdownDocument(renderFrom(draft)).frontmatter.subtype).toBeNull();
    });
});

describe("条目编辑器：保存载荷与冲突", () => {
    it("载荷带真实路径、渲染全文、baseContent 与 expectedMtimeMs", () => {
        const state = stateOf(CHARACTER_ENTRY);
        state.draft.title = "青云真人（改名）";

        const payload = buildKnowledgeWritePayload(state.draft, {
            baseContent: CHARACTER_ENTRY,
            expectedMtimeMs: 1730000000000,
        });

        expect(payload.path).toBe("lorebook/character/qing-yun/index.md");
        expect(payload.baseContent).toBe(CHARACTER_ENTRY);
        expect(payload.expectedMtimeMs).toBe(1730000000000);
        expect(String(payload.content)).toContain("title: 青云真人（改名）");
        // 不可编辑的字段照旧写回
        expect(String(payload.content)).toContain("reviewRound: 2");
        expect(String(payload.content)).toContain("status: active");
    });

    it("节点没有 mtime 时不硬塞 expectedMtimeMs", () => {
        const payload = buildKnowledgeWritePayload(stateOf(CHARACTER_ENTRY).draft, {
            baseContent: CHARACTER_ENTRY,
            expectedMtimeMs: null,
        });

        expect(payload).not.toHaveProperty("expectedMtimeMs");
    });

    it("409 判定为文件被别处改过，其他错误不是", () => {
        expect(isKnowledgeWriteConflict({status: 409})).toBe(true);
        expect(isKnowledgeWriteConflict({statusCode: 409})).toBe(true);
        expect(isKnowledgeWriteConflict({response: {status: 409}})).toBe(true);
        expect(isKnowledgeWriteConflict({status: 500})).toBe(false);
        expect(isKnowledgeWriteConflict(new Error("boom"))).toBe(false);
    });

    it("脏检查只比较全文", () => {
        expect(isKnowledgeContentDirty(CHARACTER_ENTRY, CHARACTER_ENTRY)).toBe(false);
        expect(isKnowledgeContentDirty(CHARACTER_ENTRY + "\n", CHARACTER_ENTRY)).toBe(true);
    });
});

describe("条目编辑器：解析失败与未知键", () => {
    it("frontmatter 解析异常会带回原文，界面据此拦保存", () => {
        // 引用了不存在的锚点，YAML 解析会真的抛错（workspace-frontmatter-profile 吞掉错误并带回 error）
        const source = `---
title: 坏文件
foo: *missing
---

正文
`;
        const state = stateOf(source);

        expect(state.parseError).not.toBe("");
        expect(state.draft.extra).toEqual({});
        // 解析失败时 frontmatter 为空，标题回退到节点标题
        expect(state.draft.title).toBe("青云真人");

    });

    it("未知键与未识别 type 在编辑器往返后仍在", () => {
        const source = CHARACTER_ENTRY
            .replace("type: character", "type: species")
            .replace("refs: []", "refs: []\nvisibility: private");
        const state = stateOf(source);

        // 模拟编辑器只改了标题就保存
        state.draft.title = "青云真人";
        const payload = buildKnowledgeWritePayload(state.draft, {baseContent: source, expectedMtimeMs: 1});
        const frontmatter = parseMarkdownDocument(String(payload.content)).frontmatter;

        expect(frontmatter.type).toBe("species");
        expect(frontmatter.visibility).toBe("private");
    });
});

/** 测试内复用渲染，避免直接 import 生产渲染函数造成循环依赖错觉。 */
function renderFrom(draft: Parameters<typeof buildKnowledgeWritePayload>[0]): string {
    return String(buildKnowledgeWritePayload(draft, {baseContent: ""}).content);
}
