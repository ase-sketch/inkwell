import {describe, expect, it} from "vitest";
import {
    CRITIQUE_OUTCOME_SCHEMA,
    applyCritiqueDisposition,
    buildCritiqueCardView,
    clearCritiqueDisposition,
    countCritiqueAxes,
    critiqueChapterBody,
    critiqueItemHasFootnote,
    critiqueOutcomeMapFromList,
    critiqueOutcomeStorageKey,
    critiqueOutcomesFromMap,
    critiqueProgress,
    parseChapterCritiqueInput,
    readCritiqueOutcomes,
    resolveCritiqueChapterNode,
    resolveCritiqueJumpTarget,
    writeCritiqueOutcomes,
    type CritiqueStorage,
} from "nbook/app/components/novel-ide/agent/critique-card";
import type {ChapterCritiqueInput, CritiqueOutcome} from "nbook/shared/chapter-critique";

/** 只实现读写三件套的内存存储，够复现 localStorage 的成功与抛错两条路径。 */
function createFakeStorage(initial: Record<string, string> = {}): CritiqueStorage & {dump: () => Record<string, string>} {
    const store = new Map<string, string>(Object.entries(initial));
    return {
        getItem: (key: string) => store.has(key) ? store.get(key)! : null,
        setItem: (key: string, value: string) => {
            store.set(key, value);
        },
        removeItem: (key: string) => {
            store.delete(key);
        },
        dump: () => Object.fromEntries(store.entries()),
    };
}

const sampleInput: ChapterCritiqueInput = {
    chapter: "第一章 启程",
    summary: "这一章动机铺得薄，AI 味偏重。",
    items: [
        {
            category: "motivation",
            question: "他为什么非走不可？前文没给出理由。",
            evidence: {quote: "少年迎风伫立。", line: 12},
            severity: "high",
        },
        {
            category: "foreshadowing",
            question: "断剑这条伏笔埋了就不管了吗？",
            evidence: {quote: "青石阶苍苔斑驳"},
            severity: "medium",
            promiseId: 7,
        },
        {
            category: "ai-flavor",
            question: "这句是不是有点太工整了？",
            evidence: {quote: "苍苔斑驳"},
            severity: "low",
            llmLintRuleId: "balanced-couplet",
        },
    ],
};

const chapterBody = `---
chapter: 第一章 启程
---

青石阶苍苔斑驳，少年迎风伫立。

他一言不发。
`;

describe("parseChapterCritiqueInput", () => {
    it("解析完整 JSON 的质疑单", () => {
        const parsed = parseChapterCritiqueInput(JSON.stringify(sampleInput));
        expect(parsed?.chapter).toBe("第一章 启程");
        expect(parsed?.items).toHaveLength(3);
        expect(parsed?.items[0]?.severity).toBe("high");
    });

    it("流式半截 JSON 也能解析出已经成型的条目", () => {
        const partial = `{"chapter":"第一章 启程","items":[{"category":"motivation","question":"他为什么非走不可？","evidence":{"quote":"少年迎风伫立。"},"severity":"high"},`;
        const parsed = parseChapterCritiqueInput(partial);
        expect(parsed?.items).toHaveLength(1);
    });

    it("轴名不在契约内、条目为空、缺章节名都判为不合契约", () => {
        expect(parseChapterCritiqueInput(JSON.stringify({...sampleInput, items: [{...sampleInput.items[0], category: "pacing"}]}))).toBeNull();
        expect(parseChapterCritiqueInput(JSON.stringify({...sampleInput, items: []}))).toBeNull();
        // 条目上限对齐公开投影的节点预算：超出的质疑单在历史回看时会被截断，宁可不认。
        expect(parseChapterCritiqueInput(JSON.stringify({...sampleInput, items: Array.from({length: 21}, () => sampleInput.items[0])}))).toBeNull();
        expect(parseChapterCritiqueInput(JSON.stringify({items: sampleInput.items}))).toBeNull();
        expect(parseChapterCritiqueInput("")).toBeNull();
        expect(parseChapterCritiqueInput("not json")).toBeNull();
    });
});

describe("countCritiqueAxes", () => {
    it("按三轴计数，空轴占位为 0", () => {
        expect(countCritiqueAxes(sampleInput.items)).toEqual({total: 3, motivation: 1, foreshadowing: 1, "ai-flavor": 1});
        expect(countCritiqueAxes([sampleInput.items[0]!])).toEqual({total: 1, motivation: 1, foreshadowing: 0, "ai-flavor": 0});
        expect(countCritiqueAxes([])).toEqual({total: 0, motivation: 0, foreshadowing: 0, "ai-flavor": 0});
    });
});

describe("原文定位", () => {
    it("去掉 frontmatter 后才是正文基准", () => {
        expect(critiqueChapterBody(chapterBody)).toBe("\n青石阶苍苔斑驳，少年迎风伫立。\n\n他一言不发。\n");
        expect(critiqueChapterBody("没有 frontmatter")).toBe("没有 frontmatter");
    });

    it("quote 落在第几行就返回第几行（1-based）", () => {
        expect(resolveCritiqueJumpTarget(critiqueChapterBody(chapterBody), {quote: "青石阶苍苔斑驳"})).toEqual({line: 2, fromQuote: true});
        expect(resolveCritiqueJumpTarget(critiqueChapterBody(chapterBody), {quote: "他一言不发"})).toEqual({line: 4, fromQuote: true});
    });

    it("quote 优先于过期行号；quote 找不到才退回模型给的提示行号", () => {
        expect(resolveCritiqueJumpTarget(critiqueChapterBody(chapterBody), {quote: "少年迎风伫立。", line: 999})).toEqual({line: 2, fromQuote: true});
        expect(resolveCritiqueJumpTarget("正文", {quote: "不在正文里的片段", line: 8})).toEqual({line: 8, fromQuote: false});
        expect(resolveCritiqueJumpTarget("正文", {quote: "不在正文里的片段"})).toBeNull();
        expect(resolveCritiqueJumpTarget("", {quote: ""})).toBeNull();
    });
});

describe("resolveCritiqueChapterNode（chapter 入参的三种合法形态）", () => {
    /**
     * 工作区树最小形状：一个卷、两章，外加一个设定条目无关节点。
     * 两章的目录名刻意不共用同一个「去掉序号后」的名字——既有反查会抹掉序号前缀，
     * 001-ch 与 002-ch 都会退化成 ch，那是另一条口径的已知行为，不在这条用例的射程里。
     */
    const tree = [
        {
            path: "manuscript",
            isDirectory: true,
            children: [
                {
                    path: "manuscript/001-vol",
                    isDirectory: true,
                    children: [
                        {path: "manuscript/001-vol/001-departure/index.md", isDirectory: false, frontmatter: {chapter: "第一章 启程"}},
                        {path: "manuscript/001-vol/002-duel/index.md", isDirectory: false, frontmatter: {}},
                    ],
                },
            ],
        },
        {path: "lorebook/characters/hero/index.md", isDirectory: false, frontmatter: {}},
    ] as never;

    it("传纯章名：frontmatter.chapter 与目录名两种写法都认", () => {
        expect(resolveCritiqueChapterNode(tree, "第一章 启程")?.path).toBe("manuscript/001-vol/001-departure/index.md");
        expect(resolveCritiqueChapterNode(tree, "002-duel")?.path).toBe("manuscript/001-vol/002-duel/index.md");
        expect(resolveCritiqueChapterNode(tree, "002-duel")?.path).toBe("manuscript/001-vol/002-duel/index.md");
    });

    it("传 manuscript 全路径：真实验收撞上的那种形态", () => {
        expect(resolveCritiqueChapterNode(tree, "manuscript/001-vol/001-departure/index.md")?.path).toBe("manuscript/001-vol/001-departure/index.md");
        // 反斜杠、首尾斜杠、workspace/ 前缀都要认得
        expect(resolveCritiqueChapterNode(tree, "  manuscript\\001-vol\\002-duel\\index.md  ")?.path).toBe("manuscript/001-vol/002-duel/index.md");
        expect(resolveCritiqueChapterNode(tree, "/manuscript/001-vol/001-departure/index.md")?.path).toBe("manuscript/001-vol/001-departure/index.md");
        expect(resolveCritiqueChapterNode(tree, "workspace/my-novel/manuscript/001-vol/001-departure/index.md")?.path).toBe("manuscript/001-vol/001-departure/index.md");
        // 目录路径（没带 index.md）也能落到那一章
        expect(resolveCritiqueChapterNode(tree, "manuscript/001-vol/002-duel")?.path).toBe("manuscript/001-vol/002-duel/index.md");
    });

    it("传不存在的章节：不猜、不退化，返回 null", () => {
        expect(resolveCritiqueChapterNode(tree, "manuscript/001-vol/999-nope/index.md")).toBeNull();
        expect(resolveCritiqueChapterNode(tree, "第三章 不存在")).toBeNull();
        expect(resolveCritiqueChapterNode(tree, "lorebook/characters/hero/index.md")).toBeNull();
        expect(resolveCritiqueChapterNode(tree, "")).toBeNull();
        expect(resolveCritiqueChapterNode(tree, "   ")).toBeNull();
        expect(resolveCritiqueChapterNode(null, "第一章 启程")).toBeNull();
        expect(resolveCritiqueChapterNode([], "第一章 启程")).toBeNull();
    });

    it("同一棵树里路径优先于同名章：命名歧义不会被猜错", () => {
        const ambiguous = [
            {path: "manuscript/001-vol/001-dawn/index.md", isDirectory: false, frontmatter: {chapter: "启程"}},
            {path: "manuscript/002-vol/001-dawn/index.md", isDirectory: false, frontmatter: {chapter: "启程"}},
        ] as never;
        expect(resolveCritiqueChapterNode(ambiguous, "manuscript/002-vol/001-dawn/index.md")?.path).toBe("manuscript/002-vol/001-dawn/index.md");
    });
});

describe("处置状态机", () => {
    it("处置可就地改判，附言只在给定时覆盖", () => {
        const first = applyCritiqueDisposition({}, 0, "accepted");
        expect(first[0]).toEqual({index: 0, disposition: "accepted"});

        const withNote = applyCritiqueDisposition(first, 0, "rejected", "  这一句留着  ");
        expect(withNote[0]).toEqual({index: 0, disposition: "rejected", note: "这一句留着"});

        const kept = applyCritiqueDisposition(withNote, 0, "noted");
        expect(kept[0]).toEqual({index: 0, disposition: "noted"});
        // 不改入参
        expect(first[0]?.disposition).toBe("accepted");
    });

    it("撤销处置后回到未处置", () => {
        const map = applyCritiqueDisposition({}, 2, "noted");
        expect(clearCritiqueDisposition(map, 2)).toEqual({});
        expect(clearCritiqueDisposition(map, 5)).toEqual(map);
    });

    it("存盘数组按下标升序，非法项在读回时被丢弃", () => {
        const map = {2: {index: 2, disposition: "noted" as const}, 0: {index: 0, disposition: "accepted" as const}};
        expect(critiqueOutcomesFromMap(map).map((item) => item.index)).toEqual([0, 2]);

        const restored = critiqueOutcomeMapFromList([
            {index: 1, disposition: "rejected"},
            {index: -1, disposition: "accepted"},
            {index: 2, disposition: "不存在的处置"},
        ] as unknown as CritiqueOutcome[]);
        expect(Object.keys(restored)).toEqual(["1"]);
    });

    it("进度计数只认存在的条目，全部处置完才标完成", () => {
        const items = sampleInput.items;
        expect(critiqueProgress(items, {})).toMatchObject({total: 3, resolved: 0, pending: 3, allResolved: false});

        const partial = critiqueProgress(items, {0: {index: 0, disposition: "accepted"}, 9: {index: 9, disposition: "noted"}});
        expect(partial).toMatchObject({total: 3, resolved: 1, pending: 2, accepted: 1, noted: 0, allResolved: false});

        const done = critiqueProgress(items, {
            0: {index: 0, disposition: "accepted"},
            1: {index: 1, disposition: "rejected", note: "留着"},
            2: {index: 2, disposition: "noted"},
        });
        expect(done).toMatchObject({resolved: 3, pending: 0, accepted: 1, rejected: 1, noted: 1, allResolved: true});
        expect(critiqueProgress([], {})).toMatchObject({total: 0, allResolved: false});
    });
});

describe("buildCritiqueCardView", () => {
    it("组装卡头与逐条视图态；非法质疑单返回 null", () => {
        const view = buildCritiqueCardView(sampleInput, {1: {index: 1, disposition: "rejected", note: "这条不改"}});
        expect(view?.chapter).toBe("第一章 启程");
        // 路径形态的 chapter 在卡头上收敛成读得懂的短名，不整条贴出来。
        expect(buildCritiqueCardView({...sampleInput, chapter: "manuscript/001-vol/001-departure/index.md"}, {})?.chapter).toBe("001-departure");
        expect(view?.summary).toBe("这一章动机铺得薄，AI 味偏重。");
        expect(view?.axes).toEqual({total: 3, motivation: 1, foreshadowing: 1, "ai-flavor": 1});
        expect(view?.items[0]).toMatchObject({index: 0, disposition: null, note: ""});
        expect(view?.items[1]).toMatchObject({index: 1, disposition: "rejected", note: "这条不改"});
        expect(view?.progress).toMatchObject({resolved: 1, pending: 2});
        expect(buildCritiqueCardView(null, {})).toBeNull();
    });

    it("脚注只在有规则 id 或伏笔 id 时出现", () => {
        expect(critiqueItemHasFootnote(sampleInput.items[1]!)).toBe(true);
        expect(critiqueItemHasFootnote(sampleInput.items[2]!)).toBe(true);
        expect(critiqueItemHasFootnote({...sampleInput.items[0]!, llmLintRuleId: undefined})).toBe(false);
    });
});

describe("处置状态的本机持久化", () => {
    it("存储键带 scope / 会话 / tool call，拿不到会话时退化为 none", () => {
        expect(critiqueOutcomeStorageKey("project:E:/book", 12, "call-1")).toBe("agent:critique-outcome:project:E:/book:12:call-1");
        expect(critiqueOutcomeStorageKey("", null, "")).toBe("agent:critique-outcome:workspace-root:none:unknown");
    });

    it("写读一轮后处置状态保持一致", () => {
        const storage = createFakeStorage();
        const key = critiqueOutcomeStorageKey("project:x", 3, "call-9");
        const map = applyCritiqueDisposition(applyCritiqueDisposition({}, 0, "accepted"), 2, "noted", "先记着");

        expect(writeCritiqueOutcomes(storage, key, map)).toBe(true);
        expect(readCritiqueOutcomes(storage, key)).toEqual([
            {index: 0, disposition: "accepted"},
            {index: 2, disposition: "noted", note: "先记着"},
        ]);
        expect(JSON.parse(storage.dump()[key]!).schema).toBe(CRITIQUE_OUTCOME_SCHEMA);
    });

    it("没写过、结构损坏、版本不符一律当没处置过", () => {
        const key = critiqueOutcomeStorageKey("project:x", 3, "call-9");
        expect(readCritiqueOutcomes(createFakeStorage(), key)).toEqual([]);
        expect(readCritiqueOutcomes(createFakeStorage({[key]: "不是 JSON"}), key)).toEqual([]);
        expect(readCritiqueOutcomes(createFakeStorage({[key]: "[]"}), key)).toEqual([]);
        expect(readCritiqueOutcomes(createFakeStorage({[key]: JSON.stringify({schema: 99, outcomes: [{index: 0, disposition: "accepted"}]})}), key)).toEqual([]);
        expect(readCritiqueOutcomes(createFakeStorage({[key]: JSON.stringify({schema: CRITIQUE_OUTCOME_SCHEMA})}), key)).toEqual([]);
    });

    it("写空表等于删除记录；存储抛错不打断处置", () => {
        const key = critiqueOutcomeStorageKey("project:x", 3, "call-9");
        const storage = createFakeStorage({[key]: JSON.stringify({schema: CRITIQUE_OUTCOME_SCHEMA, outcomes: [{index: 1, disposition: "noted"}]})});
        expect(writeCritiqueOutcomes(storage, key, {})).toBe(true);
        expect(storage.dump()[key]).toBeUndefined();

        const broken: CritiqueStorage = {
            getItem: () => {
                throw new Error("denied");
            },
            setItem: () => {
                throw new Error("quota");
            },
            removeItem: () => {
                throw new Error("denied");
            },
        };
        expect(readCritiqueOutcomes(broken, key)).toEqual([]);
        expect(writeCritiqueOutcomes(broken, key, {0: {index: 0, disposition: "accepted"}})).toBe(false);
    });
});
