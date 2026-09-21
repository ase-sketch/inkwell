/**
 * 双时间轴与查询原语单测（离线，mock embedding）。
 *
 * 覆盖 ADR 0005 的核心主张：
 * - 倒叙场景下 tick 递增而 instant 回退——单轴系统在这里必然出错
 * - 两种 as-of 语义不同且都成立（知识边界 vs 世界状态）
 * - 故事时间轴查询对无 instant 条目 fail-closed（宁漏不泄）
 * - 扩展字段过滤、窗口过滤、subjectsIn 多跳第一跳
 */
import {describe, expect, test} from "bun:test";
import {MemStorage, NbMemory, type EmbedPort} from "../src/index";

/** 确定性 mock embedding：字 bigram 哈希计数向量（与 nb-memory.test.ts 同款） */
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

async function openMemory(storage = new MemStorage()): Promise<NbMemory> {
    return NbMemory.open({storage, embedder: new MockEmbed()});
}

/**
 * 倒叙语料：t3 是回忆章节，摄入序在 t1/t2 之后，故事时间却回到十年前。
 * 这是双时间轴唯一无法回避的场景——按摄入序排会把回忆排到最后，
 * 按故事时间排会丢掉「读者何时读到」。
 */
async function flashbackCorpus(): Promise<NbMemory> {
    const memory = await openMemory();
    await memory.addFact({id: "f1", tick: 1, instant: 1000n, text: "我在教室里第一次见到转校生。", subjectIds: []});
    await memory.addFact({id: "f2", tick: 2, instant: 1000n, text: "她坐在我旁边的空位上。", subjectIds: []});
    await memory.addFact({id: "f3", tick: 3, instant: 100n, text: "十年前的孤儿院里，我把最后一块糖给了一个女孩。", subjectIds: []});
    await memory.addFact({id: "f4", tick: 4, instant: 1100n, text: "放学路上我忽然想起了孤儿院那件事。", subjectIds: []});
    return memory;
}

/** 取命中的 refId 集合（去掉门面注入的主体卡） */
function refIds(hits: Array<{refId: string; source: string}>): Set<string> {
    return new Set(hits.filter((hit) => hit.source !== "registry").map((hit) => hit.refId));
}

describe("双时间轴", () => {
    test("倒叙：摄入序递增而故事时间回退，两轴各自成立", async () => {
        const memory = await flashbackCorpus();

        // 知识边界：读者读到 t2 时，还不知道孤儿院那段（尽管它在故事时间上最早）
        expect(refIds(await memory.search("孤儿院", {asOfTick: 2}))).toEqual(new Set(["f1", "f2"]));
        // 读完 t4 后全部可见
        expect(refIds(await memory.search("孤儿院", {asOfTick: 4}))).toEqual(new Set(["f1", "f2", "f3", "f4"]));

        // 世界状态：故事时间回到十年前，只有孤儿院那件事已经发生
        expect(refIds(await memory.search("孤儿院", {asOfInstant: 500n}))).toEqual(new Set(["f3"]));
        // 故事时间到「见到转校生」那天，放学路上的回忆尚未发生
        expect(refIds(await memory.search("孤儿院", {asOfInstant: 1000n}))).toEqual(new Set(["f1", "f2", "f3"]));
    });

    test("两轴同时给出时按 AND 约束", async () => {
        const memory = await flashbackCorpus();
        // 故事时间允许 f1/f2/f3，但摄入序只到 2 → f3 尚未被读到
        expect(refIds(await memory.search("孤儿院", {asOfTick: 2, asOfInstant: 1000n}))).toEqual(new Set(["f1", "f2"]));
    });

    test("故事时间轴对无 instant 条目 fail-closed", async () => {
        const memory = await openMemory();
        await memory.addFact({id: "withInstant", tick: 1, instant: 100n, text: "带故事时间的事实。", subjectIds: []});
        await memory.addFact({id: "noInstant", tick: 2, text: "没有故事时间的事实。", subjectIds: []});

        // 摄入序轴两条都在
        expect(refIds(await memory.search("事实", {asOfTick: 9}))).toEqual(new Set(["withInstant", "noInstant"]));
        // 故事时间轴只认能被安放的那条——无法安放的宁可漏召回，不能泄漏
        expect(refIds(await memory.search("事实", {asOfInstant: 9999n}))).toEqual(new Set(["withInstant"]));
    });

    test("窗口过滤：tickRange / instantRange 取闭区间", async () => {
        const memory = await flashbackCorpus();
        expect(refIds(await memory.search("孤儿院", {tickRange: [2, 3]}))).toEqual(new Set(["f2", "f3"]));
        expect(refIds(await memory.search("孤儿院", {instantRange: [1000n, 1100n]}))).toEqual(new Set(["f1", "f2", "f4"]));
    });

    test("状态层有效区间在故事时间轴上同样成立", async () => {
        const memory = await openMemory();
        const old = await memory.setState({subjectId: "su-001", topic: "住处", view: "住在孤儿院。", sinceTick: 1, sinceInstant: 100n});
        await memory.invalidateState(old.id, 3, 900n);
        await memory.setState({subjectId: "su-001", topic: "住处", view: "住在姑妈家。", sinceTick: 3, sinceInstant: 900n});

        expect(memory.states.activeAt({instant: 500n}).map((e) => e.view)).toEqual(["住在孤儿院。"]);
        expect(memory.states.activeAt({instant: 1000n}).map((e) => e.view)).toEqual(["住在姑妈家。"]);
        // 失效边界是左闭右开：失效时点当天已经是新状态
        expect(memory.states.activeAt({instant: 900n}).map((e) => e.view)).toEqual(["住在姑妈家。"]);
    });

    test("别名双轴：故事时间上尚未得知同一性时不可解析", async () => {
        const memory = await openMemory();
        await memory.registry.register({
            id: "su-001", type: "character", name: "小雪", aliases: [],
            ontology: "转校生。", ontologyTick: 1, ontologyInstant: 100n, registeredTick: 1, registeredInstant: 100n,
        });
        await memory.registry.addAlias("su-001", "孤儿院的女孩", 5, 800n);

        expect(memory.registry.resolve("孤儿院的女孩", {instant: 700n})).toBeNull();
        expect(memory.registry.resolve("孤儿院的女孩", {instant: 800n})?.id).toBe("su-001");
        // 摄入序轴独立成立
        expect(memory.registry.resolve("孤儿院的女孩", {tick: 4})).toBeNull();
        expect(memory.registry.resolve("孤儿院的女孩", {tick: 5})?.id).toBe("su-001");
    });

    test("bigint 故事时间 jsonl roundtrip", async () => {
        const storage = new MemStorage();
        const memory = await openMemory(storage);
        await memory.addFact({id: "f1", tick: 1, instant: 9007199254740993n, text: "超出 number 安全整数的故事时间。", subjectIds: []});
        await memory.registry.register({
            id: "su-001", type: "character", name: "小雪", aliases: [],
            ontology: "转校生。", ontologyTick: 1, ontologyInstant: 100n, registeredTick: 1, registeredInstant: 100n,
        });
        await memory.registry.addAlias("su-001", "粉发女孩", 3, 300n);
        const state = await memory.setState({subjectId: "su-001", topic: "住处", view: "孤儿院。", sinceTick: 1, sinceInstant: 100n});
        await memory.invalidateState(state.id, 5, 500n);

        const reopened = await openMemory(storage);
        expect(reopened.facts.all[0]!.instant).toBe(9007199254740993n);
        expect(reopened.registry.all).toEqual(memory.registry.all);
        expect(reopened.states.all).toEqual(memory.states.all);
    });
});

describe("扩展字段", () => {
    /** 单 AI 在群聊里扮演人类：speaker / channel 是纯过滤维度，不触碰 as-of 语义 */
    async function groupChatCorpus(): Promise<NbMemory> {
        const memory = await openMemory();
        await memory.addFact({id: "g1", tick: 1, text: "老王说周五团建改到下周。", subjectIds: [], meta: {speaker: "老王", channel: "group"}});
        await memory.addFact({id: "g2", tick: 2, text: "小李私下问我要不要一起翘掉团建。", subjectIds: [], meta: {speaker: "小李", channel: "dm"}});
        await memory.addFact({id: "g3", tick: 3, text: "老王在群里发了团建地点。", subjectIds: [], meta: {speaker: "老王", channel: "group"}});
        return memory;
    }

    test("等值过滤与 any-of 过滤", async () => {
        const memory = await groupChatCorpus();
        expect(refIds(await memory.search("团建", {meta: {channel: "group"}}))).toEqual(new Set(["g1", "g3"]));
        expect(refIds(await memory.search("团建", {meta: {speaker: ["小李", "老王"]}}))).toEqual(new Set(["g1", "g2", "g3"]));
        // 多 key 之间是 AND
        expect(refIds(await memory.search("团建", {meta: {speaker: "老王", channel: "dm"}}))).toEqual(new Set());
    });

    test("条目缺该 key 时不通过——「没标记」不等于「标记为假」", async () => {
        const memory = await groupChatCorpus();
        await memory.addFact({id: "g4", tick: 4, text: "我自己记了一笔团建的事。", subjectIds: []});
        expect(refIds(await memory.search("团建", {meta: {channel: "group"}})).has("g4")).toBe(false);
    });

    test("扩展字段随 jsonl roundtrip 保留", async () => {
        const storage = new MemStorage();
        const memory = await openMemory(storage);
        await memory.addFact({id: "g1", tick: 1, text: "我以为她是本地人。", subjectIds: [], meta: {believed: false, speaker: "我"}});
        const reopened = await openMemory(storage);
        expect(reopened.facts.all[0]!.meta).toEqual({believed: false, speaker: "我"});
    });
});

describe("subjectsIn：多跳第一跳", () => {
    /** 「昨天遇到的女孩的发色是什么」：问题里没有专名，主体锚点必须靠时间窗口解出来 */
    async function encounterCorpus(): Promise<NbMemory> {
        const memory = await openMemory();
        for (const [id, name, type] of [["su-001", "小雪", "character"], ["su-002", "大志", "character"], ["su-003", "天文社", "faction"]] as const) {
            await memory.registry.register({id, type, name, aliases: [], ontology: `${name}。`, ontologyTick: 1, registeredTick: 1});
        }
        await memory.addFact({id: "f1", tick: 10, text: "我在天文社门口遇到了小雪。", subjectIds: ["su-001", "su-003"]});
        await memory.addFact({id: "f2", tick: 11, text: "小雪的头发是浅粉色的。", subjectIds: ["su-001"]});
        await memory.addFact({id: "f3", tick: 30, text: "大志把橡皮掰掉了一角。", subjectIds: ["su-002"]});
        return memory;
    }

    test("按时间窗口解出主体，再按主体发第二跳", async () => {
        const memory = await encounterCorpus();
        const met = memory.subjectsIn({tickRange: [10, 12], types: ["character"]});
        expect(met.map((s) => s.id)).toEqual(["su-001"]);

        const second = await memory.search("头发 颜色", {subjectIds: [met[0]!.id]});
        expect(refIds(second).has("f2")).toBe(true);
    });

    test("共现约束：只返回与指定主体同现的其他主体", async () => {
        const memory = await encounterCorpus();
        const withClub = memory.subjectsIn({coOccurWith: ["su-003"]});
        expect(withClub.map((s) => s.id)).toEqual(["su-001"]);
    });

    test("as-of 已知口径：该时点尚未登记的主体不返回", async () => {
        const memory = await openMemory();
        await memory.registry.register({id: "su-001", type: "character", name: "小雪", aliases: [], ontology: "转校生。", ontologyTick: 20, registeredTick: 20});
        await memory.addFact({id: "f1", tick: 20, text: "小雪出现了。", subjectIds: ["su-001"]});

        expect(memory.subjectsIn({asOf: {tick: 10}})).toEqual([]);
        expect(memory.subjectsIn({asOf: {tick: 20}}).map((s) => s.id)).toEqual(["su-001"]);
    });

    test("subjectTypes：门面按类型展开成主体过滤", async () => {
        const memory = await encounterCorpus();
        expect(refIds(await memory.search("小雪 天文社", {subjectTypes: ["faction"]}))).toEqual(new Set(["f1"]));
        // 类型下无主体时结果为空，而不是退化成不过滤
        expect(refIds(await memory.search("小雪", {subjectTypes: ["item"]}))).toEqual(new Set());
    });
});
