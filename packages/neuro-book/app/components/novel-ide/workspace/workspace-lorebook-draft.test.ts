import {describe, expect, it} from "vitest";
import YAML from "yaml";
import {parseMarkdownDocument} from "nbook/app/components/novel-ide/workspace/workspace-frontmatter-profile";
import {
    createLorebookDraft,
    renderLorebookDraft,
    type LorebookFileDraft,
} from "nbook/app/components/novel-ide/workspace/workspace-lorebook-draft";

const NODE = {path: "lorebook/item/qing-shuang-jian/index.md", title: "青霜剑"};

/**
 * 走一遍面板的真实链路：解析源文件 → 建草稿 → 渲染 → 再解析。
 */
function roundTrip(source: string): {draft: LorebookFileDraft; rendered: string; frontmatter: Record<string, unknown>} {
    const parsed = parseMarkdownDocument(source);
    const draft = createLorebookDraft(NODE, parsed.frontmatter, parsed.body);
    const rendered = renderLorebookDraft(draft);
    const reparsed = parseMarkdownDocument(rendered);
    return {draft, rendered, frontmatter: reparsed.frontmatter};
}

const ANCHORED_ENTRY = `---
title: 青霜剑
type: item
subtype: equipment
status: active
icon: sword
aliases:
  - 家传古剑
  - 青霜
tags:
  - 兵器
summary: 家传古剑，三尺寒刃。
refs:
  - relation: depends_on
    target: lorebook/faction/qingyun-sect/
    note: 所属门派
anchors:
  - chapter: "001-departure"
    quote: "少年反手抽出青霜剑，三尺寒刃如秋水初泓。"
    note: "主角首次出剑"
  - chapter: "第一章 启程"
    quote: "此乃家传断岳剑，吹毛断发。"
  - chapter: "005-sword-and-shadow"
    quote: "袖中青芒一闪而逝。"
    note: "首次展现剑首实力"
retrieval:
  enabled: true
  trigger: 提及青霜剑时
governance:
  source: generated
  review: proposed
ext:
  reviewRound: 3
  sourceNote: 从第三章正文提取
---

# 青霜剑

家传古剑。
`;

const EXPLICIT_EMPTY_ANCHORS_ENTRY = `---
title: 镇妖塔
type: location
subtype: building
status: pending
icon: tower
aliases:
  - 锁妖塔
tags:
  - 禁地
summary: 封印上古凶煞的核心建筑。
refs: []
anchors: []
retrieval:
  enabled: false
  trigger: null
governance:
  source: interview
  review: proposed
ext: {}
---

# 镇妖塔
`;

// 旧条目：M2a 锚点地基之前的节点，既没有 anchors 也没有 ext。
const LEGACY_ENTRY = `---
title: 旧条目
type: note
subtype: note
status: draft
icon: null
aliases: []
tags: []
summary: ""
refs: []
retrieval:
  enabled: true
  trigger: null
governance:
  source: manual
  review: proposed
---

# 旧条目

正文内容。
`;

describe("lorebook 条目面板草稿往返", () => {
    it("含 anchors 与 ext 的条目往返后逐字段相等", () => {
        const source = parseMarkdownDocument(ANCHORED_ENTRY).frontmatter;
        const {draft, frontmatter} = roundTrip(ANCHORED_ENTRY);

        // anchors：多条、含 note、不含 note 全部保真
        expect(frontmatter.anchors).toEqual(source.anchors);
        expect(frontmatter.anchors).toEqual([
            {chapter: "001-departure", quote: "少年反手抽出青霜剑，三尺寒刃如秋水初泓。", note: "主角首次出剑"},
            {chapter: "第一章 启程", quote: "此乃家传断岳剑，吹毛断发。"},
            {chapter: "005-sword-and-shadow", quote: "袖中青芒一闪而逝。", note: "首次展现剑首实力"},
        ]);
        // 不含 note 的那条不得被塞进 note: null / undefined
        expect(frontmatter.anchors as Record<string, unknown>[]).toHaveLength(3);
        expect(Object.keys((frontmatter.anchors as Record<string, unknown>[])[1]!)).toEqual(["chapter", "quote"]);

        // ext：自由对象原样保留
        expect(frontmatter.ext).toEqual(source.ext);
        expect(frontmatter.ext).toEqual({reviewRound: 3, sourceNote: "从第三章正文提取"});

        // 其余既有字段一并保住（对照 content-node-schema.ts 全字段清单）
        expect(frontmatter.title).toBe("青霜剑");
        expect(frontmatter.type).toBe("item");
        expect(frontmatter.subtype).toBe("equipment");
        expect(frontmatter.status).toBe("active");
        expect(frontmatter.icon).toBe("sword");
        expect(frontmatter.aliases).toEqual(["家传古剑", "青霜"]);
        expect(frontmatter.tags).toEqual(["兵器"]);
        expect(frontmatter.summary).toBe("家传古剑，三尺寒刃。");
        expect(frontmatter.refs).toEqual(source.refs);
        expect(frontmatter.retrieval).toEqual(source.retrieval);
        expect(frontmatter.governance).toEqual(source.governance);

        // 正文不受影响
        expect(draft.content).toContain("家传古剑。");
    });

    it("anchors 显式空数组被原样写回，不塌陷成缺省字段", () => {
        const {draft, rendered, frontmatter} = roundTrip(EXPLICIT_EMPTY_ANCHORS_ENTRY);

        expect(draft.anchors).toEqual([]);
        // 机器门禁钉住显式空数组必须真的出现在文件里
        expect(rendered).toContain("anchors: []");
        expect(frontmatter.anchors).toEqual([]);
        expect("anchors" in frontmatter).toBe(true);
        // ext: {} 同样保留
        expect(rendered).toContain("ext: {}");
        expect(frontmatter.ext).toEqual({});
    });

    it("无 anchors/ext 的旧条目行为不变，不凭空多出字段", () => {
        const {draft, rendered, frontmatter} = roundTrip(LEGACY_ENTRY);

        expect(draft.anchors).toBeUndefined();
        expect(draft.ext).toBeUndefined();
        expect(rendered).not.toContain("anchors");
        expect(rendered).not.toContain("ext");
        expect("anchors" in frontmatter).toBe(false);
        expect("ext" in frontmatter).toBe(false);

        // 原有字段保持原值
        expect(frontmatter.title).toBe("旧条目");
        expect(frontmatter.type).toBe("note");
        expect(frontmatter.subtype).toBe("note");
        expect(frontmatter.status).toBe("draft");
        expect(frontmatter.icon).toBeNull();
        expect(frontmatter.aliases).toEqual([]);
        expect(frontmatter.tags).toEqual([]);
        expect(frontmatter.summary).toBe("");
        expect(frontmatter.refs).toEqual([]);
        expect(frontmatter.retrieval).toEqual({enabled: true, trigger: null});
        expect(frontmatter.governance).toEqual({source: "manual", review: "proposed"});
        expect(parseMarkdownDocument(rendered).body).toContain("正文内容。");
    });

    it("作者在面板里改动字段后保存，anchors 与 ext 仍然原样保留", () => {
        const source = parseMarkdownDocument(ANCHORED_ENTRY).frontmatter;
        const draft = createLorebookDraft(NODE, source, parseMarkdownDocument(ANCHORED_ENTRY).body);

        // 模拟作者改标题与状态（这些控件一失焦就会触发保存）
        draft.title = "断岳剑";
        draft.status = "archived";
        draft.tags = [...draft.tags, "已改名"];

        const frontmatter = parseMarkdownDocument(renderLorebookDraft(draft)).frontmatter;

        expect(frontmatter.title).toBe("断岳剑");
        expect(frontmatter.status).toBe("archived");
        expect(frontmatter.anchors).toEqual(source.anchors);
        expect(frontmatter.ext).toEqual(source.ext);
    });

    it("连续保存多次时 frontmatter 字段不漂移", () => {
        // 注意：这里只钉 frontmatter 字段稳定。正文前会逐次累积一个空行，
        // 那是 renderMarkdownDocument（workspace-frontmatter-profile.ts）既有的
        // 「---\n\n 前缀」与 parseMarkdownDocument 只吃掉一个换行共同造成的既有缺陷，
        // 与本次字段保真无关，且该共享模块同时被地点/规则面板使用，不在本任务边界内。
        for (const source of [ANCHORED_ENTRY, EXPLICIT_EMPTY_ANCHORS_ENTRY, LEGACY_ENTRY]) {
            const once = roundTrip(source).frontmatter;
            const twice = roundTrip(roundTrip(source).rendered).frontmatter;

            expect(twice).toEqual(once);
        }
    });

    it("保留废弃 writingTip 字段，且不影响 anchors/ext", () => {
        const source = ANCHORED_ENTRY.replace("retrieval:", "writingTip: 旧提示\nretrieval:");
        const {frontmatter} = roundTrip(source);

        expect(frontmatter.writingTip).toBe("旧提示");
        expect(frontmatter.anchors).toEqual(parseMarkdownDocument(source).frontmatter.anchors);
        expect(frontmatter.ext).toEqual({reviewRound: 3, sourceNote: "从第三章正文提取"});
    });

    it("锚点数组中的非对象与缺 chapter/quote 的垃圾数据被丢弃，不写回非法锚点", () => {
        const source = `---
title: 脏数据条目
type: note
status: draft
anchors:
  - chapter: "001-ch"
    quote: "合法锚点"
  - "裸字符串"
  - chapter: ""
    quote: "缺章节"
  - chapter: "002-ch"
---

正文
`;
        const {draft, frontmatter} = roundTrip(source);

        expect(draft.anchors).toEqual([{chapter: "001-ch", quote: "合法锚点"}]);
        expect(frontmatter.anchors).toEqual([{chapter: "001-ch", quote: "合法锚点"}]);
    });

    it("ext 非对象时不重造 ext 字段", () => {
        const source = `---
title: 异形 ext 条目
type: note
status: draft
ext: 不是对象
---

正文
`;
        const {draft, rendered} = roundTrip(source);

        expect(draft.ext).toEqual({});
        // 非对象 ext 无法保真，写回空对象而非原样搬运非法值
        expect(rendered).toContain("ext: {}");
    });
});
// ── M2.7b：未知/自定义 frontmatter 键与未识别 type 的保真往返 ──────────────────

const CUSTOM_KEYS_ENTRY = `---
title: 青霜剑
type: item
subtype: equipment
status: active
icon: sword
aliases:
  - 家传古剑
tags:
  - 兵器
summary: 家传古剑，三尺寒刃。
refs: []
retrieval:
  enabled: true
  trigger: null
governance:
  source: generated
  review: proposed
visibility: private
authorNote: 第三章后才揭示
customList:
  - 甲
  - 乙
ext:
  reviewRound: 3
---

# 青霜剑
`;

// schema 15 值里的 faction 不在基座五值口径内，保存时最容易被静默改写成 note
const UNKNOWN_TYPE_ENTRY = `---
title: 青云宗
type: faction
subtype: null
status: pending
icon: null
aliases: []
tags: []
summary: 正道第一宗门。
refs: []
retrieval:
  enabled: true
  trigger: null
governance:
  source: manual
  review: proposed
---

# 青云宗
`;

describe("lorebook 条目草稿：未知键与未识别 type 保真（M2.7b）", () => {
    it("已知字段之外的键全部收进 extra 并原样写回", () => {
        const source = parseMarkdownDocument(CUSTOM_KEYS_ENTRY).frontmatter;
        const {draft, frontmatter} = roundTrip(CUSTOM_KEYS_ENTRY);

        expect(draft.extra).toEqual({
            visibility: "private",
            authorNote: "第三章后才揭示",
            customList: ["甲", "乙"],
        });
        expect(frontmatter.visibility).toBe(source.visibility);
        expect(frontmatter.authorNote).toBe(source.authorNote);
        expect(frontmatter.customList).toEqual(source.customList);
        // 已知字段没有被 extra 抢走，也没有变成双份
        expect(frontmatter.title).toBe("青霜剑");
        expect(frontmatter.ext).toEqual({reviewRound: 3});
        expect(draft.extra).not.toHaveProperty("ext");
        expect(draft.extra).not.toHaveProperty("title");
    });

    it("extra 键写在已知字段之后、ext 之前", () => {
        const {rendered} = roundTrip(CUSTOM_KEYS_ENTRY);
        const governanceAt = rendered.indexOf("governance:");
        const extraAt = rendered.indexOf("visibility:");
        const extAt = rendered.indexOf("ext:");

        expect(governanceAt).toBeGreaterThan(-1);
        expect(extraAt).toBeGreaterThan(governanceAt);
        expect(extAt).toBeGreaterThan(extraAt);
        // 未识别的 type 写回后不再出现五值口径的 note
        expect(rendered).toContain("type: item");
    });

    it("没有已知字段之外的键时 extra 是空对象，不凭空多出字段", () => {
        const {draft} = roundTrip(LEGACY_ENTRY);

        expect(draft.extra).toEqual({});
    });

    it("未识别的 type 原样往返，不静默改写成 note", () => {
        const {draft, rendered, frontmatter} = roundTrip(UNKNOWN_TYPE_ENTRY);

        expect(draft.type).toBe("note");
        expect(draft.rawType).toBe("faction");
        expect(frontmatter.type).toBe("faction");
        expect(rendered).toContain("type: faction");
        // type 是已知字段，不能被同时收进 extra 写第二遍
        expect(draft.extra).not.toHaveProperty("type");
        expect(rendered.match(/\ntype:/g)).toHaveLength(1);
    });

    it("认得出的 type 不产生 rawType，作者改类目后写回新值", () => {
        const draft = createLorebookDraft(NODE, parseMarkdownDocument(ANCHORED_ENTRY).frontmatter, "");

        expect(draft.rawType).toBeNull();
        draft.type = "location";
        expect(parseMarkdownDocument(renderLorebookDraft(draft)).frontmatter.type).toBe("location");
    });

    it("缺省 type 的旧条目不凭空长出 type: null", () => {
        const source = `---
title: 无类型条目
status: draft
---

正文
`;
        const {draft, rendered} = roundTrip(source);

        expect(draft.rawType).toBeNull();
        expect(draft.type).toBe("note");
        // 缺省 type 会被补成 note，这是既有口径；关键是没写成 null
        expect(rendered).not.toContain("\ntype: null");
        expect(parseMarkdownDocument(rendered).frontmatter.type).toBe("note");
    });

    it("作者改字段后保存，未知键与未识别 type 一并保住", () => {
        const parsed = parseMarkdownDocument(UNKNOWN_TYPE_ENTRY);
        const withExtras = parseMarkdownDocument(CUSTOM_KEYS_ENTRY);
        const draft = createLorebookDraft(NODE, {...withExtras.frontmatter, type: "species"}, parsed.body);

        draft.title = "青云宗（改名）";
        draft.summary = "改过的摘要。";
        draft.aliases = ["青云门"];

        const frontmatter = parseMarkdownDocument(renderLorebookDraft(draft)).frontmatter;

        expect(frontmatter.type).toBe("species");
        expect(frontmatter.title).toBe("青云宗（改名）");
        expect(frontmatter.visibility).toBe("private");
        expect(frontmatter.authorNote).toBe("第三章后才揭示");
        expect(frontmatter.ext).toEqual({reviewRound: 3});
    });

    it("未知键与未识别 type 连续保存多次不漂移", () => {
        for (const source of [CUSTOM_KEYS_ENTRY, UNKNOWN_TYPE_ENTRY]) {
            const once = roundTrip(source).frontmatter;
            const twice = roundTrip(roundTrip(source).rendered).frontmatter;

            expect(twice).toEqual(once);
        }
    });

    it("废弃 writingTip 不会被重复收进 extra", () => {
        const source = ANCHORED_ENTRY.replace("retrieval:", "writingTip: 旧提示\nretrieval:");
        const {draft, rendered} = roundTrip(source);

        expect(draft.extra).not.toHaveProperty("writingTip");
        expect(rendered.match(/writingTip:/g)).toHaveLength(1);
    });

    it("值本身是 null 的未知键照样保留", () => {
        const source = `---
title: 空值条目
type: note
status: draft
toneColor: null
---

正文
`;
        const {draft, frontmatter} = roundTrip(source);

        expect(draft.extra).toEqual({toneColor: null});
        expect("toneColor" in frontmatter).toBe(true);
        expect(frontmatter.toneColor).toBeNull();
    });
});
