/**
 * 核心语义单测（离线，mock embedding）：
 * - jsonl 事实源 roundtrip：写入后重开完全等价（rebuild 纪律）
 * - 注册表 alias 的 as-of 解析（工作假设 B）
 * - 状态层失效语义与 as-of 有效性（工作假设 C）
 * - 检索的 tick / 主体过滤与失效过滤
 */
import {describe, expect, test} from "bun:test";
import {MemStorage, NbMemory, type EmbedPort} from "../src/index";

/** 确定性 mock embedding：字 bigram 哈希计数向量（中文按字切，离线可回归） */
class MockEmbed implements EmbedPort {
    readonly dims = 256;

    async embed(texts: string[]): Promise<number[][]> {
        return texts.map((text) => {
            const vec = new Array<number>(this.dims).fill(0);
            const chars = [...text];
            for (let i = 0; i < chars.length - 1; i++) {
                let h = 0x811c9dc5;
                for (const ch of chars[i]! + chars[i + 1]!) {
                    h ^= ch.charCodeAt(0);
                    h = Math.imul(h, 0x01000193);
                }
                vec[(h >>> 0) % this.dims] += 1;
            }
            const norm = Math.sqrt(vec.reduce((s, v) => s + v * v, 0));
            return norm === 0 ? vec : vec.map((v) => v / norm);
        });
    }
}

async function openMemory(storage: MemStorage): Promise<NbMemory> {
    return NbMemory.open({storage, embedder: new MockEmbed()});
}

describe("jsonl roundtrip", () => {
    test("facts / 注册表 / 状态写入后重开完全等价", async () => {
        const storage = new MemStorage();
        const memory = await openMemory(storage);

        await memory.addEpisode({tick: 1, time: "第一天", source: "chapter:01", text: "第一章原文……"});
        await memory.addFact({id: "f001", tick: 1, time: "第一天", text: "我在公交上帮粉发女孩付了车费。", subjectIds: []});
        await memory.registry.register({id: "xiaoxue", type: "character", name: "小雪", aliases: [], ontology: "粉发转校生，公交事件的女孩。", ontologyTick: 3, registeredTick: 3});
        await memory.registry.addAlias("xiaoxue", "粉发女孩", 3);
        const state = await memory.setState({subjectId: "xiaoxue", topic: "对我的态度", view: "疑似讨厌我。", sinceTick: 2});
        await memory.invalidateState(state.id, 5);
        await memory.setState({subjectId: "xiaoxue", topic: "对我的态度", view: "不讨厌我，只是怕生。", sinceTick: 5});

        const reopened = await openMemory(storage);
        expect(reopened.episodes.all).toEqual(memory.episodes.all);
        expect(reopened.facts.all).toEqual(memory.facts.all);
        expect(reopened.registry.all).toEqual(memory.registry.all);
        expect(reopened.states.all).toEqual(memory.states.all);
        expect(reopened.dump()).toBe(memory.dump());
    });
});

describe("注册表 alias as-of 解析", () => {
    test("sinceTick 之前视作未知实体，之后可解析", async () => {
        const memory = await openMemory(new MemStorage());
        await memory.registry.register({id: "xiaoxue", type: "character", name: "小雪", aliases: [], ontology: "粉发转校生。", ontologyTick: 1, registeredTick: 1});
        await memory.registry.addAlias("xiaoxue", "粉发女孩", 3);

        expect(memory.registry.resolve("小雪")?.id).toBe("xiaoxue");
        expect(memory.registry.resolve("粉发女孩")?.id).toBe("xiaoxue");
        expect(memory.registry.resolve("粉发女孩", {tick: 2})).toBeNull();
        expect(memory.registry.resolve("粉发女孩", {tick: 3})?.id).toBe("xiaoxue");
        expect(memory.registry.resolve("不存在的人")).toBeNull();
    });
});

describe("状态层失效语义", () => {
    test("activeAt：as-of 看到当时有效的旧状态，当前口径只看未失效", async () => {
        const memory = await openMemory(new MemStorage());
        const old = await memory.setState({subjectId: "xiaoxue", topic: "对我的态度", view: "疑似讨厌我。", sinceTick: 2});
        await memory.invalidateState(old.id, 5);
        await memory.setState({subjectId: "xiaoxue", topic: "对我的态度", view: "只是怕生。", sinceTick: 5});

        expect(memory.states.activeAt().map((e) => e.view)).toEqual(["只是怕生。"]);
        expect(memory.states.activeAt({tick: 3}).map((e) => e.view)).toEqual(["疑似讨厌我。"]);
        expect(memory.states.activeAt({tick: 1})).toEqual([]);
        expect(memory.states.activeAt({tick: 5}).map((e) => e.view)).toEqual(["只是怕生。"]);
    });
});

describe("检索过滤", () => {
    test("tick<=asOf 过滤：截止点之后的事实不召回", async () => {
        const memory = await openMemory(new MemStorage());
        await memory.addFact({tick: 1, text: "我在公交上帮粉发女孩付了车费。", subjectIds: []});
        await memory.addFact({tick: 8, text: "粉发女孩告诉我她叫小雪。", subjectIds: []});

        const now = await memory.search("粉发女孩叫什么名字？");
        expect(now.some((hit) => hit.text.includes("小雪"))).toBe(true);
        const past = await memory.search("粉发女孩叫什么名字？", {asOfTick: 3});
        expect(past.length).toBeGreaterThan(0);
        expect(past.every((hit) => hit.tick <= 3)).toBe(true);
    });

    test("失效 state 不进当前认知，as-of 期间内可见", async () => {
        const memory = await openMemory(new MemStorage());
        const old = await memory.setState({subjectId: "xiaoxue", topic: "小雪对我的态度", view: "疑似讨厌我。", sinceTick: 2});
        await memory.invalidateState(old.id, 5);
        await memory.setState({subjectId: "xiaoxue", topic: "小雪对我的态度", view: "只是怕生。", sinceTick: 5});

        const now = await memory.search("小雪对我的态度如何？");
        expect(now.some((hit) => hit.text.includes("怕生"))).toBe(true);
        expect(now.some((hit) => hit.text.includes("讨厌"))).toBe(false);
        const past = await memory.search("小雪对我的态度如何？", {asOfTick: 3});
        expect(past.some((hit) => hit.text.includes("讨厌"))).toBe(true);
        expect(past.some((hit) => hit.text.includes("怕生"))).toBe(false);
    });

    test("subjectIds 过滤：只召回涉及给定主体的条目", async () => {
        const memory = await openMemory(new MemStorage());
        await memory.addFact({tick: 1, text: "小雪在青叶站下了车。", subjectIds: ["xiaoxue"]});
        await memory.addFact({tick: 2, text: "大志把橡皮掰掉了一角。", subjectIds: ["dazhi"]});

        const hits = await memory.search("下车", {subjectIds: ["xiaoxue"]});
        expect(hits.length).toBeGreaterThan(0);
        expect(hits.every((hit) => hit.subjectIds.includes("xiaoxue"))).toBe(true);
    });
});
