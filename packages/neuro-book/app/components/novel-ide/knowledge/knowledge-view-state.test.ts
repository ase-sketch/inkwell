import {describe, expect, it} from "vitest";
import type {WorkspaceFileNode} from "nbook/app/stores/novel-ide";
import {
    groupEntriesByFaction,
    normalizeKnowledgeEntryPath,
    projectKnowledgeEntries,
    type KnowledgeEntry,
} from "nbook/app/components/novel-ide/knowledge/knowledge-projection";
import {
    buildChapterOrderIndex,
    buildKnowledgeTabs,
    filterKnowledgeEntries,
    KNOWLEDGE_UNGROUPED_TAB_ID,
    knowledgeEntryExcerpt,
    orderKnowledgeEntry,
    pickActiveEntry,
    resolveActiveTabId,
    resolveEntryIndexNode,
    resolveManuscriptChapterNode,
    stripChapterOrdinal,
} from "nbook/app/components/novel-ide/knowledge/knowledge-view-state";

function node(overrides: Partial<WorkspaceFileNode> & {path: string}): WorkspaceFileNode {
    return {
        mode: "content",
        entryType: null,
        icon: null,
        status: null,
        words: 0,
        refs: [],
        absolutePath: overrides.path,
        isDirectory: false,
        hasIndex: false,
        contentNode: true,
        summary: "",
        title: overrides.path,
        frontmatter: {},
        frontmatterError: null,
        state: null,
        size: 0,
        mtimeMs: 0,
        editable: true,
        ...overrides,
    };
}

/** 造一个设定条目节点：条目在工作区快照里就是 lorebook/<类目>/<条目>/index.md。 */
function entryNode(path: string, entryType: string, frontmatter: Record<string, unknown>): WorkspaceFileNode {
    return node({path, entryType, frontmatter});
}

/** 造一个条目数据对象，只填断言关心的字段。 */
function entry(overrides: Partial<KnowledgeEntry> & {path: string}): KnowledgeEntry {
    const base: KnowledgeEntry = {
        path: overrides.path,
        title: overrides.path,
        category: "character",
        aliases: [],
        subtype: null,
        source: null,
        summary: "",
        anchors: [],
        factionPaths: [],
        firstAppearance: null,
    };
    return {...base, ...overrides};
}

const chapter = (name: string, sortOrder: number, id = `ch-${name}`) => ({id, name, sortOrder});

describe("Knowledge view state · 章序检索表", () => {
    it("按卷序 + 章序拍平全书章序，未归卷的章接在最后", () => {
        const index = buildChapterOrderIndex({
            acts: [
                {sortOrder: 1, chapters: [chapter("第一章 启程", 0), chapter("第二章 交锋", 1)]},
                {sortOrder: 0, chapters: [chapter("楔子", 0)]},
            ],
            ungroupedChapters: [chapter("番外", 0)],
        });

        expect(index.chapters.map((item) => item.name)).toEqual(["楔子", "第一章 启程", "第二章 交锋", "番外"]);
        expect(index.lookup("楔子")).toBe(0);
        expect(index.lookup("第二章 交锋")).toBe(2);
        expect(index.lookup("番外")).toBe(3);
    });

    it("Plot 章节名与 manuscript 目录名互相认得出（序号前缀被抹掉）", () => {
        const index = buildChapterOrderIndex({
            acts: [{sortOrder: 0, chapters: [chapter("第一章 启程", 0), chapter("交锋", 1)]}],
        });

        // 章节名本身带序号时，目录名再叠一层序号也认得出（001-第一章 启程）。
        expect(index.lookup("001-第一章 启程")).toBe(0);
        // 章节名不带序号时，目录名的序号前缀被抹掉（002-交锋 → 交锋）。
        expect(index.lookup("002-交锋")).toBe(1);
        expect(index.lookup("交锋")).toBe(1);
        // 对不上的写法一律 null，宁可退化也不瞎猜。
        expect(index.lookup("001-启程")).toBeNull();
        expect(index.lookup("001-departure")).toBeNull();
    });

    it("章名不在大纲里就返回 null，不抛错也不瞎猜", () => {
        const index = buildChapterOrderIndex({acts: [{sortOrder: 0, chapters: [chapter("第一章", 0)]}]});

        expect(index.lookup("第九章 不存在的章")).toBeNull();
        expect(index.lookup("")).toBeNull();
        expect(index.lookup("   ")).toBeNull();
    });

    it("大纲树为空时所有章名都解析不出顺序，履历按原顺序兜底", () => {
        const empty = buildChapterOrderIndex(null);
        expect(empty.lookup("第一章")).toBeNull();
        expect(empty.chapters).toEqual([]);

        const entryWithAnchors = entry({
            path: "lorebook/character/hero",
            anchors: [
                {chapter: "第八章", quote: "后写的"},
                {chapter: "第一章", quote: "先写的"},
            ],
        });
        const ordered = orderKnowledgeEntry(entryWithAnchors, empty.lookup);

        expect(ordered.anchors.map((anchor) => anchor.chapter)).toEqual(["第八章", "第一章"]);
        expect(ordered.firstAppearance).toBe("第八章");
    });
});

describe("Knowledge view state · 履历口径闭环", () => {
    const entryWithAnchors = entry({
        path: "lorebook/character/hero",
        anchors: [
            {chapter: "003-再会", quote: "三"},
            {chapter: "第一章 启程", quote: "一"},
            {chapter: "002-交锋", quote: "二"},
        ],
    });

    it("锚点按章序重排，首次登场与履历首行同一口径", () => {
        const index = buildChapterOrderIndex({
            acts: [{
                sortOrder: 0,
                chapters: [chapter("第一章 启程", 0), chapter("002-交锋", 1), chapter("003-再会", 2)],
            }],
        });

        const ordered = orderKnowledgeEntry(entryWithAnchors, index.lookup);

        expect(ordered.anchors.map((anchor) => anchor.chapter)).toEqual(["第一章 启程", "002-交锋", "003-再会"]);
        expect(ordered.firstAppearance).toBe(ordered.anchors[0]!.chapter);
    });

    it("解析不出的锚点保持原相对顺序，排在能解析的之后", () => {
        const index = buildChapterOrderIndex({
            acts: [{sortOrder: 0, chapters: [chapter("第一章 启程", 0), chapter("002-交锋", 1)]}],
        });

        const ordered = orderKnowledgeEntry(entryWithAnchors, index.lookup);

        expect(ordered.anchors.map((anchor) => anchor.chapter)).toEqual(["第一章 启程", "002-交锋", "003-再会"]);
    });
});

describe("Knowledge view state · 阵营 tab", () => {
    const nodes = [
        entryNode("lorebook/character/hero/index.md", "character", {
            title: "阿苍",
            refs: [{target: "lorebook/faction/qingyun", relation: "member_of"}],
        }),
        entryNode("lorebook/character/villain/index.md", "character", {
            title: "黑风",
            refs: [{target: "lorebook/faction/moyuan", relation: "member_of"}],
        }),
        entryNode("lorebook/character/alone/index.md", "character", {title: "独行客"}),
        entryNode("lorebook/faction/qingyun/index.md", "faction", {title: "青云宗"}),
        entryNode("lorebook/faction/moyuan/index.md", "faction", {title: "魔渊"}),
    ];

    function tabsOf() {
        const entries = projectKnowledgeEntries(nodes);
        const groups = groupEntriesByFaction(entries, new Map([
            ["lorebook/faction/qingyun", "青云宗"],
            ["lorebook/faction/moyuan", "魔渊"],
        ]));
        return buildKnowledgeTabs(groups);
    }

    it("每个阵营一个 tab，tab 上带条数，未分组置底", () => {
        const tabs = tabsOf();

        expect(tabs.map((tab) => tab.title)).toEqual(["魔渊", "青云宗", "未分组"]);
        expect(tabs.map((tab) => tab.count)).toEqual([1, 1, 1]);
        expect(tabs[2]).toMatchObject({id: KNOWLEDGE_UNGROUPED_TAB_ID, factionPath: null, ungrouped: true});
        expect(tabs[0]!.id).toBe("lorebook/faction/moyuan");
    });

    it("选中的 tab 还在就保持，不在就退回第一个；一个 tab 都没有时返回空串", () => {
        const tabs = tabsOf();

        expect(resolveActiveTabId(tabs, "lorebook/faction/qingyun")).toBe("lorebook/faction/qingyun");
        expect(resolveActiveTabId(tabs, "lorebook/faction/gone")).toBe("lorebook/faction/moyuan");
        expect(resolveActiveTabId(tabs, "")).toBe("lorebook/faction/moyuan");
        expect(resolveActiveTabId([], "anything")).toBe("");
    });
});

describe("Knowledge view state · 阵营内过滤与选中", () => {
    const entries = [
        entry({path: "lorebook/character/hero", title: "阿苍", aliases: ["苍", "剑客"], summary: "前朝遗孤。"}),
        entry({path: "lorebook/character/villain", title: "黑风", aliases: [], summary: "占山为王的悍匪。"}),
    ];

    it("标题、别名、简介任一命中即保留，且不分大小写", () => {
        expect(filterKnowledgeEntries(entries, "苍").map((item) => item.path)).toEqual(["lorebook/character/hero"]);
        expect(filterKnowledgeEntries(entries, "剑客").map((item) => item.path)).toEqual(["lorebook/character/hero"]);
        expect(filterKnowledgeEntries(entries, "悍匪").map((item) => item.path)).toEqual(["lorebook/character/villain"]);
        expect(filterKnowledgeEntries(entries, "  ").map((item) => item.path)).toEqual([
            "lorebook/character/hero",
            "lorebook/character/villain",
        ]);
        expect(filterKnowledgeEntries(entries, "不存在")).toEqual([]);
    });

    it("选中的条目还在结果里就保持，不在就落到第一条，空结果给 null", () => {
        expect(pickActiveEntry(entries, "lorebook/character/villain")?.path).toBe("lorebook/character/villain");
        expect(pickActiveEntry(entries, "lorebook/character/gone")?.path).toBe("lorebook/character/hero");
        expect(pickActiveEntry(entries, "")?.path).toBe("lorebook/character/hero");
        expect(pickActiveEntry([], "lorebook/character/hero")).toBeNull();
    });
});

describe("Knowledge view state · 节点解析", () => {
    const nodes = [
        node({path: "lorebook/character/hero/index.md", entryType: "character", frontmatter: {title: "阿苍"}}),
        node({path: "manuscript/001-departure/index.md", entryType: "chapter", frontmatter: {chapter: "第一章 启程"}}),
        node({path: "manuscript/002-交锋/index.md", entryType: "chapter", frontmatter: {}}),
        node({path: "outline/index.md", frontmatter: {}}),
    ];

    it("按条目目录找到它的 index.md 文件节点", () => {
        expect(resolveEntryIndexNode(nodes, "lorebook/character/hero")?.path).toBe("lorebook/character/hero/index.md");
        // 目录节点格式传进来也归一化得到同一结果。
        expect(resolveEntryIndexNode(nodes, "workspace/lorebook/character/hero/")?.path).toBe("lorebook/character/hero/index.md");
        expect(resolveEntryIndexNode(nodes, "")).toBeNull();
    });

    it("条目没有 index.md 时不返回任何节点", () => {
        expect(resolveEntryIndexNode(nodes, "lorebook/character/ghost")).toBeNull();
    });

    it("找章节正文：frontmatter 反指优先，其次 manuscript 目录名", () => {
        expect(resolveManuscriptChapterNode(nodes, "第一章 启程")?.path).toBe("manuscript/001-departure/index.md");
        expect(resolveManuscriptChapterNode(nodes, "交锋")?.path).toBe("manuscript/002-交锋/index.md");
        expect(resolveManuscriptChapterNode(nodes, "002-交锋")?.path).toBe("manuscript/002-交锋/index.md");
        expect(resolveManuscriptChapterNode(nodes, "第三章 不存在")).toBeNull();
        expect(resolveManuscriptChapterNode(nodes, "")).toBeNull();
    });

    it("只在 manuscript 章节目录里找正文，别处的同名文件不认", () => {
        const withOutlineCollision = [
            ...nodes,
            node({path: "outline/交锋/index.md", frontmatter: {}}),
        ];

        expect(resolveManuscriptChapterNode(withOutlineCollision, "交锋")?.path).toBe("manuscript/002-交锋/index.md");
    });
});

describe("Knowledge view state · 文案与别名", () => {
    it("摘要摘录超长才截断，短的与空的原样返回", () => {
        expect(knowledgeEntryExcerpt({summary: "前朝遗孤。"})).toBe("前朝遗孤。");
        expect(knowledgeEntryExcerpt({summary: ""})).toBe("");

        const long = "字".repeat(200);
        const excerpt = knowledgeEntryExcerpt({summary: long}, 10);
        expect(excerpt).toBe(`${"字".repeat(10)}…`);
        expect(knowledgeEntryExcerpt({summary: long}, 0)).toBe(long);
    });

    it("抹序号前缀只在有前缀时动刀", () => {
        expect(stripChapterOrdinal("001-开篇")).toBe("开篇");
        expect(stripChapterOrdinal("002_交锋")).toBe("交锋");
        expect(stripChapterOrdinal("第一章 启程")).toBe("第一章 启程");
        expect(stripChapterOrdinal("")).toBe("");
    });

    it("条目路径归一化与投影层口径一致", () => {
        expect(normalizeKnowledgeEntryPath("workspace\\lorebook\\character\\hero\\index.md")).toBe("lorebook/character/hero");
    });
});
