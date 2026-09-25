import {describe, expect, it} from "vitest";
import type {WorkspaceFileNode} from "nbook/app/stores/novel-ide";
import type {LorebookFileAnchor} from "nbook/app/components/novel-ide/workspace/workspace-lorebook-draft";
import {
    collectFactionTitles,
    groupEntriesByFaction,
    isReferenceEntryPath,
    normalizeKnowledgeEntryPath,
    orderAnchors,
    projectKnowledgeEntries,
    REFERENCE_GROUP_TITLE,
    resolveFirstAppearance,
    UNGROUPED_FACTION_TITLE,
    type KnowledgeEntry,
} from "nbook/app/components/novel-ide/knowledge/knowledge-projection";

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

/**
 * 造一个设定条目节点：工作区快照里条目就是 lorebook/<类目>/<条目>/index.md 这个文件节点
 * （目录节点被 isLorebookBrowsableEntry 排除，frontmatter 也挂在 index.md 上）。
 */
function entryNode(
    path: string,
    entryType: string,
    frontmatter: Record<string, unknown>,
    extra: Partial<WorkspaceFileNode> = {},
): WorkspaceFileNode {
    return node({path, entryType, frontmatter, ...extra});
}

/** 组装带 children 的目录节点：WorkspaceFileNode 本身不声明 children，树只存在于内存投影里。 */
function directory(path: string, children: WorkspaceFileNode[]): WorkspaceFileNode {
    return {...node({path, isDirectory: true, contentNode: false, entryType: null}), children} as WorkspaceFileNode;
}

function anchor(chapter: string, quote = "引文"): LorebookFileAnchor {
    return {chapter, quote};
}

/** 只保留断言关心的字段，避免整对象比对被未来新增字段打碎。 */
function card(entry: KnowledgeEntry) {
    return {
        path: entry.path,
        title: entry.title,
        category: entry.category,
        aliases: entry.aliases,
        subtype: entry.subtype,
        source: entry.source,
        summary: entry.summary,
        firstAppearance: entry.firstAppearance,
        factionPaths: entry.factionPaths,
    };
}

describe("Knowledge projection · 条目投影", () => {
    it("从工作区树里只挑出设定条目，跳过类目说明页与正文", () => {
        const nodes = [
            directory("lorebook", [
                directory("lorebook/character", [
                    node({path: "lorebook/character/index.md", entryType: "note", frontmatter: {subtype: "directory-index"}}),
                    entryNode("lorebook/character/hero/index.md", "character", {
                        title: "阿苍",
                        aliases: ["苍", "剑客"],
                        subtype: "person",
                        summary: "前朝遗孤。",
                        governance: {source: "interview", review: "proposed"},
                    }),
                ]),
                directory("lorebook/faction", [
                    entryNode("lorebook/faction/qingyun-sect/index.md", "faction", {title: "青云宗"}),
                ]),
            ]),
            directory("manuscript", [
                node({path: "manuscript/chapter-01/index.md", entryType: "chapter"}),
            ]),
        ];

        const entries = projectKnowledgeEntries(nodes);

        expect(entries.map((entry) => entry.path)).toEqual([
            "lorebook/character/hero",
            "lorebook/faction/qingyun-sect",
        ]);
        expect(card(entries[0]!)).toEqual({
            path: "lorebook/character/hero",
            title: "阿苍",
            category: "character",
            aliases: ["苍", "剑客"],
            subtype: "person",
            source: "interview",
            summary: "前朝遗孤。",
            firstAppearance: null,
            factionPaths: [],
        });
        expect(entries[1]!.category).toBe("faction");
    });

    it("同一条目被重复喂进来时只投影一条", () => {
        const nodes = [
            directory("lorebook/item", [
                entryNode("lorebook/item/sword/index.md", "item", {title: "青霜剑"}),
                entryNode("lorebook/item/sword/index.md", "item", {title: "重复节点"}),
            ]),
        ];

        const entries = projectKnowledgeEntries(nodes);

        expect(entries).toHaveLength(1);
        expect(entries[0]!.path).toBe("lorebook/item/sword");
        expect(entries[0]!.title).toBe("青霜剑");
    });

    it("路径归一化抹平 workspace 前缀、尾随斜杠与 index.md，便于和 refs 目标比较", () => {
        expect(normalizeKnowledgeEntryPath("workspace/lorebook/character/hero/index.md")).toBe("lorebook/character/hero");
        expect(normalizeKnowledgeEntryPath("lorebook/character/hero/")).toBe("lorebook/character/hero");
        expect(normalizeKnowledgeEntryPath("lorebook\\character\\hero")).toBe("lorebook/character/hero");
    });

    it("workspace 前缀下的条目与 refs 目标路径能对上", () => {
        const entries = projectKnowledgeEntries([
            directory("workspace/lorebook", [
                directory("workspace/lorebook/character", [
                    entryNode("workspace/lorebook/character/hero/index.md", "character", {
                        title: "阿苍",
                        refs: [{relation: "member_of", target: "lorebook/faction/qingyun-sect/"}],
                    }),
                ]),
            ]),
        ]);

        expect(entries).toHaveLength(1);
        expect(entries[0]!.path).toBe("lorebook/character/hero");
        expect(entries[0]!.factionPaths).toEqual(["lorebook/faction/qingyun-sect"]);
    });
});

describe("Knowledge projection · 缺字段防御", () => {
    it("没有 frontmatter 字段时全部降级成空值，不抛错", () => {
        const entries = projectKnowledgeEntries([
            directory("lorebook/note", [
                entryNode("lorebook/note/scratch/index.md", "note", {}, {title: "临时笔记"}),
            ]),
        ]);

        expect(card(entries[0]!)).toEqual({
            path: "lorebook/note/scratch",
            title: "临时笔记",
            category: "note",
            aliases: [],
            subtype: null,
            source: null,
            summary: "",
            firstAppearance: null,
            factionPaths: [],
        });
        expect(entries[0]!.anchors).toEqual([]);
    });

    it("frontmatter 不是对象、字段类型不对时按缺省处理", () => {
        const broken = node({
            path: "lorebook/note/broken/index.md",
            entryType: "note",
            title: "",
            frontmatter: null as unknown as Record<string, unknown>,
        });
        const messy = node({
            path: "lorebook/note/messy/index.md",
            entryType: "note",
            title: "",
            frontmatter: {
                title: "   ",
                aliases: "苍",
                subtype: 42,
                governance: "interview",
                refs: "lorebook/faction/x/",
                anchors: "nope",
            },
        });

        const entries = projectKnowledgeEntries([directory("lorebook/note", [broken, messy])]);

        // 标题回退：frontmatter 空 → 节点标题空 → 路径最后一段。
        expect(entries[0]!.title).toBe("broken");
        expect(entries[1]!.title).toBe("messy");
        expect(card(entries[1]!)).toEqual({
            path: "lorebook/note/messy",
            title: "messy",
            category: "note",
            aliases: [],
            subtype: null,
            source: null,
            summary: "",
            firstAppearance: null,
            factionPaths: [],
        });
    });

    it("summary 缺失时回退节点摘要", () => {
        const entries = projectKnowledgeEntries([
            directory("lorebook/note", [
                entryNode("lorebook/note/plain/index.md", "note", {}, {title: "无摘要", summary: "来自节点的摘要"}),
            ]),
        ]);

        expect(entries[0]!.summary).toBe("来自节点的摘要");
    });

    it("脏 anchors 被丢弃：缺 chapter / 缺 quote / 非对象一律不算履历", () => {
        const entries = projectKnowledgeEntries([
            directory("lorebook/character", [
                entryNode("lorebook/character/hero/index.md", "character", {
                    title: "阿苍",
                    anchors: [
                        {chapter: "第一章", quote: "他睁开了眼。"},
                        {chapter: "第二章"},
                        {quote: "没有章名"},
                        {chapter: "   ", quote: "空白章名"},
                        "字符串不算锚点",
                        null,
                        {chapter: "第三章", quote: "风起。", note: "   "},
                    ],
                }),
            ]),
        ]);

        expect(entries[0]!.anchors).toEqual([
            {chapter: "第一章", quote: "他睁开了眼。"},
            {chapter: "第三章", quote: "风起。"},
        ]);
        expect(entries[0]!.firstAppearance).toBe("第一章");
    });
});

describe("Knowledge projection · 章序注入与回退", () => {
    const CHAP_1 = anchor("第一章 启程");
    const CHAP_5 = anchor("第五章 断岳");
    const CHAP_2 = anchor("第二章 入城");
    const STRANGE = anchor("番外·旧事");

    it("没注入章序时保持原相对顺序", () => {
        expect(orderAnchors([CHAP_5, CHAP_1, STRANGE, CHAP_2]).map((item) => item.chapter)).toEqual([
            "第五章 断岳",
            "第一章 启程",
            "番外·旧事",
            "第二章 入城",
        ]);
    });

    it("注入章序后按章升序，解析不出来的保持原顺序排在最后", () => {
        const order = (chapter: string) => {
            if (chapter.startsWith("第一章")) {
                return 1;
            }
            if (chapter.startsWith("第二章")) {
                return 2;
            }
            if (chapter.startsWith("第五章")) {
                return 5;
            }
            return null;
        };

        expect(orderAnchors([CHAP_5, CHAP_1, STRANGE, CHAP_2], order).map((item) => item.chapter)).toEqual([
            "第一章 启程",
            "第二章 入城",
            "第五章 断岳",
            "番外·旧事",
        ]);
    });

    it("同章序保持原相对顺序，结果稳定", () => {
        const first = anchor("第一章", "第一处");
        const second = anchor("第一章", "第二处");
        const order = () => 1;

        expect(orderAnchors([first, second], order).map((item) => item.quote)).toEqual(["第一处", "第二处"]);
    });

    it("章序解析函数抛错或返回非数字时按解析不出来处理", () => {
        const order = (chapter: string) => {
            if (chapter === "第一次") {
                throw new Error("章名不在大纲里");
            }
            return Number.NaN;
        };

        expect(orderAnchors([CHAP_5, CHAP_1], order).map((item) => item.chapter)).toEqual(["第五章 断岳", "第一章 启程"]);
    });

    it("firstAppearance 按同一章序口径取最早，无锚点时为 null", () => {
        const order = (chapter: string) => (chapter === "第一章 启程" ? 1 : chapter === "第五章 断岳" ? 5 : null);

        expect(resolveFirstAppearance([CHAP_5, CHAP_1], order)).toBe("第一章 启程");
        expect(resolveFirstAppearance([CHAP_5, CHAP_1])).toBe("第五章 断岳");
        expect(resolveFirstAppearance([], order)).toBeNull();
    });

    it("投影出的 firstAppearance 不做章序解析，直接取第一个锚点", () => {
        const entries = projectKnowledgeEntries([
            directory("lorebook/character", [
                entryNode("lorebook/character/hero/index.md", "character", {
                    title: "阿苍",
                    anchors: [{chapter: "第五章", quote: "风起。"}, {chapter: "第一章", quote: "他睁开了眼。"}],
                }),
            ]),
        ]);

        expect(entries[0]!.firstAppearance).toBe("第五章");
    });
});

describe("Knowledge projection · 阵营分组", () => {
    function entry(overrides: Partial<KnowledgeEntry> & {path: string}): KnowledgeEntry {
        return {
            title: overrides.path,
            category: "character",
            aliases: [],
            subtype: null,
            source: null,
            summary: "",
            anchors: [],
            factionPaths: [],
            firstAppearance: null,
            ...overrides,
        };
    }

    it("一条条目归属多个阵营时，每个阵营 tab 里都出现", () => {
        const hero = entry({path: "lorebook/character/hero", factionPaths: ["lorebook/faction/qingyun-sect", "lorebook/faction/black-tower"]});
        const groups = groupEntriesByFaction([hero], new Map([
            ["lorebook/faction/qingyun-sect", "青云宗"],
            ["lorebook/faction/black-tower", "黑塔"],
        ]));

        expect(groups.map((group) => group.factionTitle)).toEqual(["黑塔", "青云宗"]);
        for (const group of groups) {
            expect(group.entries.map((item) => item.path)).toEqual(["lorebook/character/hero"]);
        }
    });

    it("无阵营归属的条目进未分组并置底，阵营组按名称排序", () => {
        const groups = groupEntriesByFaction([
            entry({path: "lorebook/item/sword"}),
            entry({path: "lorebook/character/hero", factionPaths: ["lorebook/faction/qingyun-sect"]}),
            entry({path: "lorebook/location/harbor", factionPaths: ["lorebook/faction/black-harbor"]}),
        ], new Map([
            ["lorebook/faction/qingyun-sect", "青云宗"],
            ["lorebook/faction/black-harbor", "黑港"],
        ]));

        expect(groups.map((group) => [group.factionPath, group.factionTitle])).toEqual([
            ["lorebook/faction/black-harbor", "黑港"],
            ["lorebook/faction/qingyun-sect", "青云宗"],
            [null, UNGROUPED_FACTION_TITLE],
        ]);
        expect(groups[2]!.entries.map((item) => item.path)).toEqual(["lorebook/item/sword"]);
    });

    it("阵营名未知时回退路径最后一段", () => {
        const groups = groupEntriesByFaction([
            entry({path: "lorebook/character/hero", factionPaths: ["lorebook/faction/mist-guild"]}),
        ]);

        expect(groups[0]!.factionTitle).toBe("mist-guild");
    });

    it("重复的阵营引用不会让条目在一个 tab 里出现两次", () => {
        const groups = groupEntriesByFaction([
            entry({path: "lorebook/character/hero", factionPaths: ["lorebook/faction/qingyun-sect", "lorebook/faction/qingyun-sect"]}),
        ]);

        expect(groups).toHaveLength(1);
        expect(groups[0]!.entries).toHaveLength(1);
    });

    it("没有条目时不造空壳分组", () => {
        expect(groupEntriesByFaction([])).toEqual([]);
    });

    it("collectFactionTitles 从投影结果里取阵营名，供分组直接使用", () => {
        const entries = projectKnowledgeEntries([
            directory("lorebook", [
                directory("lorebook/faction", [
                    entryNode("lorebook/faction/qingyun-sect/index.md", "faction", {title: "青云宗"}),
                ]),
                directory("lorebook/character", [
                    entryNode("lorebook/character/hero/index.md", "character", {
                        title: "阿苍",
                        refs: [{relation: "member_of", target: "lorebook/faction/qingyun-sect/"}],
                    }),
                ]),
            ]),
        ]);

        const groups = groupEntriesByFaction(entries, collectFactionTitles(entries));

        // 阵营条目自己是分组轴上的 tab，不再作为卡片落进未分组。
        expect(groups.map((group) => [group.factionTitle, group.entries.map((item) => item.title)])).toEqual([
            ["青云宗", ["阿苍"]],
        ]);
    });

    it("阵营条目自己不落进未分组，其他无归属条目照常置底", () => {
        const groups = groupEntriesByFaction([
            entry({path: "lorebook/faction/qingyun-sect", category: "faction", title: "青云宗"}),
            entry({path: "lorebook/item/sword"}),
        ], new Map([["lorebook/faction/qingyun-sect", "青云宗"]]));

        expect(groups.map((group) => [group.factionPath, group.factionTitle, group.entries.map((item) => item.path)])).toEqual([
            [null, UNGROUPED_FACTION_TITLE, ["lorebook/item/sword"]],
        ]);
    });

    it("relation 不限：依赖、提及、敌对都算阵营归属", () => {
        const entries = projectKnowledgeEntries([
            directory("lorebook/character", [
                entryNode("lorebook/character/hero/index.md", "character", {
                    title: "阿苍",
                    refs: [
                        {relation: "depends_on", target: "lorebook/faction/qingyun-sect/"},
                        {relation: "mentions", target: "lorebook/faction/black-tower/"},
                        {relation: "敌对", target: "lorebook/faction/mist-guild/"},
                        {relation: "member_of", target: "lorebook/character/rival/"},
                        {relation: "member_of", target: "lorebook/faction/"},
                    ],
                }),
            ]),
        ]);

        expect(entries[0]!.factionPaths).toEqual([
            "lorebook/faction/qingyun-sect",
            "lorebook/faction/black-tower",
            "lorebook/faction/mist-guild",
        ]);
    });
});

describe("Knowledge projection · 参考资料分组", () => {
    function entry(overrides: Partial<KnowledgeEntry> & {path: string}): KnowledgeEntry {
        return {
            title: overrides.path,
            category: "note",
            aliases: [],
            subtype: null,
            source: null,
            summary: "",
            anchors: [],
            factionPaths: [],
            firstAppearance: null,
            ...overrides,
        };
    }

    it("note 深度 ≥3 的条目算参考资料：两条调研产物既有落点都算", () => {
        expect(isReferenceEntryPath("lorebook/note/research/民国盐商")).toBe(true);
        expect(isReferenceEntryPath("lorebook/note/genre-research/诡秘之主")).toBe(true);
        // workspace 前缀与 index.md 写法与投影层其他口径一致，不影响判定。
        expect(isReferenceEntryPath("workspace/lorebook/note/research/盐政/index.md")).toBe(true);
        // 再深一层同样是参考资料，不设上限。
        expect(isReferenceEntryPath("lorebook/note/research/盐政/引文")).toBe(true);
    });

    it("note 深度 2 的项目模板不算参考资料，维持落未分组桶的原行为", () => {
        expect(isReferenceEntryPath("lorebook/note/project-profile")).toBe(false);
        expect(isReferenceEntryPath("lorebook/note/story-concept")).toBe(false);

        const groups = groupEntriesByFaction([
            entry({path: "lorebook/note/project-profile", title: "项目档案"}),
        ]);

        expect(groups.map((group) => [group.factionPath, group.factionTitle])).toEqual([
            [null, UNGROUPED_FACTION_TITLE],
        ]);
    });

    it("非 note 类目即便深度 ≥3 也不算参考资料", () => {
        expect(isReferenceEntryPath("lorebook/character/hero")).toBe(false);
        expect(isReferenceEntryPath("lorebook/faction/qingyun-sect")).toBe(false);
        // 类目名只是以 note 开头不算数，防止 notes-app 这类类目被误吃进来。
        expect(isReferenceEntryPath("lorebook/notes-app/scratch/deep")).toBe(false);
    });

    it("排序位置：参考资料在所有阵营 tab 之后、「未分组」桶之前", () => {
        const groups = groupEntriesByFaction([
            entry({path: "lorebook/note/research/盐政", title: "盐政调研"}),
            entry({path: "lorebook/character/hero", category: "character", title: "阿苍", factionPaths: ["lorebook/faction/qingyun-sect"]}),
            entry({path: "lorebook/item/sword", category: "item", title: "青霜剑"}),
        ], new Map([["lorebook/faction/qingyun-sect", "青云宗"]]));

        expect(groups.map((group) => [group.factionPath, group.factionTitle])).toEqual([
            ["lorebook/faction/qingyun-sect", "青云宗"],
            [null, REFERENCE_GROUP_TITLE],
            [null, UNGROUPED_FACTION_TITLE],
        ]);
        expect(groups[1]!.entries.map((item) => item.path)).toEqual(["lorebook/note/research/盐政"]);
        expect(groups[2]!.entries.map((item) => item.path)).toEqual(["lorebook/item/sword"]);
    });

    it("组间互斥且参考资料优先：被 refs 指向阵营的调研条目只进参考资料组", () => {
        const groups = groupEntriesByFaction([
            entry({
                path: "lorebook/note/research/盐政",
                title: "盐政调研",
                // 脏数据：调研条目被挂到了阵营名下，也不该出现在阵营 tab 或未分组里。
                factionPaths: ["lorebook/faction/qingyun-sect", "lorebook/faction/black-tower"],
            }),
            entry({path: "lorebook/character/hero", category: "character", title: "阿苍", factionPaths: ["lorebook/faction/qingyun-sect"]}),
        ], new Map([
            ["lorebook/faction/qingyun-sect", "青云宗"],
            ["lorebook/faction/black-tower", "黑塔"],
        ]));

        expect(groups.map((group) => [group.factionTitle, group.entries.map((item) => item.path)])).toEqual([
            ["青云宗", ["lorebook/character/hero"]],
            [REFERENCE_GROUP_TITLE, ["lorebook/note/research/盐政"]],
        ]);
    });

    it("多个调研条目共存时都进同一组，且不落未分组", () => {
        const groups = groupEntriesByFaction([
            entry({path: "lorebook/note/research/盐政", title: "盐政调研"}),
            entry({path: "lorebook/note/genre-research/诡秘之主", title: "题材拆解"}),
            entry({path: "lorebook/note/project-profile", title: "项目档案"}),
        ]);

        expect(groups.map((group) => [group.factionTitle, group.entries.map((item) => item.path)])).toEqual([
            [REFERENCE_GROUP_TITLE, ["lorebook/note/research/盐政", "lorebook/note/genre-research/诡秘之主"]],
            [UNGROUPED_FACTION_TITLE, ["lorebook/note/project-profile"]],
        ]);
    });

    it("只有阵营条目、没有调研条目时不造空的参考资料组", () => {
        const groups = groupEntriesByFaction([
            entry({path: "lorebook/character/hero", category: "character", title: "阿苍", factionPaths: ["lorebook/faction/qingyun-sect"]}),
        ], new Map([["lorebook/faction/qingyun-sect", "青云宗"]]));

        expect(groups.map((group) => group.factionTitle)).toEqual(["青云宗"]);
    });

    it("端到端：工作区树里只有调研条目时，投影 → 分组直接给出参考资料组", () => {
        const entries = projectKnowledgeEntries([
            directory("lorebook", [
                directory("lorebook/note", [
                    directory("lorebook/note/research", [
                        entryNode("lorebook/note/research/盐政/index.md", "note", {title: "盐政调研"}),
                    ]),
                ]),
            ]),
        ]);

        const groups = groupEntriesByFaction(entries, collectFactionTitles(entries));

        expect(groups.map((group) => [group.factionTitle, group.entries.map((item) => item.title)])).toEqual([
            [REFERENCE_GROUP_TITLE, ["盐政调研"]],
        ]);
    });
});
