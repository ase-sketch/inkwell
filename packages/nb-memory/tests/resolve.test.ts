/**
 * S2 联合消解与主体卡单测（离线，mock LLM/embedding）：
 * - ingestBatch：登记新主体、别名合并（sinceTick 越界收敛）、subjectIds 归一（name 引用）
 * - LLM 输出非法：重试后跳过本批，事实照常落库
 * - 主体卡 as-of：登记前不可见、别名按 sinceTick 裁剪、ontology 取当时版本
 */
import {describe, expect, test} from "bun:test";
import {MemStorage, NbMemory, type EmbedPort, type LlmPort, type LlmRequest} from "../src/index";

/** 确定性 mock embedding（字 bigram 哈希，与核心单测同款） */
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

/** 队列式 mock LLM：按调用顺序吐回复 */
class MockLlm implements LlmPort {
    calls = 0;
    constructor(private readonly replies: string[]) {}

    async chat(_req: LlmRequest): Promise<string> {
        this.calls += 1;
        if (this.replies.length === 0) throw new Error("MockLlm 回复耗尽");
        return this.replies.length > 1 ? this.replies.shift()! : this.replies[0]!;
    }
}

describe("ingestBatch 联合消解", () => {
    test("登记 + 别名 sinceTick 收敛 + name 引用归一", async () => {
        const llm = new MockLlm([JSON.stringify({
            register: [{name: "小雪", type: "character", ontology: "粉发转校生。"}],
            alias: [{subject: "小雪", alias: "粉发女孩", sinceTick: 99}],
            facts: [{i: 0, subjects: ["小雪"]}, {i: 1, subjects: []}],
        })]);
        const memory = await NbMemory.open({storage: new MemStorage(), embedder: new MockEmbed(), llm});
        const added = await memory.ingestBatch([
            {tick: 5, text: "粉发女孩帮我捡起了课本。"},
            {tick: 6, text: "下午下了一场雨。"},
        ]);

        expect(llm.calls).toBe(1);
        expect(memory.registry.all.length).toBe(1);
        const subject = memory.registry.all[0]!;
        expect(subject.name).toBe("小雪");
        expect(subject.registeredTick).toBe(5);
        // sinceTick 99 越界 → 收敛到本批 maxTick 6
        expect(subject.aliases).toEqual([{alias: "粉发女孩", sinceTick: 6}]);
        expect(added[0]!.subjectIds).toEqual([subject.id]);
        expect(added[1]!.subjectIds).toEqual([]);
    });

    test("LLM 输出非法：3 次重试后跳过本批，事实照常落库", async () => {
        const llm = new MockLlm(["这不是 JSON"]);
        const memory = await NbMemory.open({storage: new MemStorage(), embedder: new MockEmbed(), llm});
        const added = await memory.ingestBatch([{tick: 1, text: "我出门上学。"}]);

        expect(llm.calls).toBe(3);
        expect(memory.skippedResolveBatches).toBe(1);
        expect(added.length).toBe(1);
        expect(added[0]!.subjectIds).toEqual([]);
        expect(memory.facts.all.length).toBe(1);
    });

    test("未注入 llm：跳过消解直接落库（S1 口径）", async () => {
        const memory = await NbMemory.open({storage: new MemStorage(), embedder: new MockEmbed()});
        const added = await memory.ingestBatch([{tick: 1, text: "我出门上学。"}]);
        expect(added[0]!.subjectIds).toEqual([]);
        expect(memory.skippedResolveBatches).toBe(0);
    });
});

describe("分身修复合并", () => {
    test("引擎不变式：register 与 alias 同批到达的分身被自动合并", async () => {
        const llm = new MockLlm([JSON.stringify({
            register: [{name: "南小风", type: "character", ontology: "风信子的真名。"}],
            alias: [{subject: "su-001", alias: "南小风", sinceTick: 123}],
            facts: [{i: 0, subjects: ["南小风"]}],
        })]);
        const memory = await NbMemory.open({storage: new MemStorage(), embedder: new MockEmbed(), llm});
        await memory.registry.register({id: "su-001", type: "character", name: "风信子", aliases: [], ontology: "正牌魔法少女。", ontologyTick: 2, registeredTick: 2});
        const added = await memory.ingestBatch([{tick: 123, text: "风信子的信息栏新增了真名南小风。"}]);

        // 南小风被登记后又因名字撞上 su-001 的别名而被自动并回，注册表只剩一个主体
        expect(memory.registry.all.map((s) => s.name)).toEqual(["风信子"]);
        expect(memory.registry.canonicalId(added[0]!.subjectIds[0]!)).toBe("su-001");
    });

    test("merge 后：名字归并为别名、all 不再列分身、旧标注 facts 经等价 id 可查、as-of 合并前仍是两实体", async () => {
        const storage = new MemStorage();
        const memory = await NbMemory.open({storage, embedder: new MockEmbed()});
        await memory.registry.register({id: "su-001", type: "character", name: "风信子", aliases: [], ontology: "正牌魔法少女。", ontologyTick: 2, registeredTick: 2});
        await memory.registry.register({id: "su-002", type: "character", name: "南小风", aliases: [{alias: "南嘉鱼的妹妹", sinceTick: 6}], ontology: "风信子的真名。", ontologyTick: 5, registeredTick: 5});
        await memory.addFact({tick: 5, text: "南小风今年19岁。", subjectIds: ["su-002"]});
        await memory.registry.merge("su-001", "su-002", 8);

        // 图保持小：分身不再独立列出；名字与别名（时点取 max）都在存续主体上
        expect(memory.registry.all.map((s) => s.id)).toEqual(["su-001"]);
        const keep = memory.registry.get("su-001")!;
        expect(keep.aliases).toEqual([{alias: "南小风", sinceTick: 8}, {alias: "南嘉鱼的妹妹", sinceTick: 8}]);

        // as-of 合并前：南小风仍是独立实体；合并后：解析到风信子
        expect(memory.registry.resolve("南小风", {tick: 6})?.id).toBe("su-002");
        expect(memory.registry.resolve("南小风", {tick: 9})?.id).toBe("su-001");
        expect(memory.registry.card("su-002", {tick: 6})!).toContain("南小风（character");
        expect(memory.registry.card("su-002", {tick: 9})!).toContain("风信子（character");

        // 旧标注 su-002 的事实：经等价 id 集与关系查询路径可命中
        expect(memory.registry.equivalentIds("su-001").sort()).toEqual(["su-001", "su-002"]);
        const hits = await memory.search("风信子多少岁？");
        expect(hits.some((hit) => hit.text.includes("19岁"))).toBe(true);

        // 重放重建等价
        const reopened = await NbMemory.open({storage, embedder: new MockEmbed()});
        expect(reopened.registry.all).toEqual(memory.registry.all);
        expect(reopened.registry.resolve("南小风", {tick: 6})?.id).toBe("su-002");
    });
});

describe("审查修复回归", () => {
    test("merge 后再登记不撞 id（allocateId 基于历史总数）", async () => {
        const llm = new MockLlm([JSON.stringify({
            register: [{name: "英雄协会", type: "faction", ontology: "管理魔法少女的组织。"}],
            facts: [{i: 0, subjects: ["英雄协会"]}],
        })]);
        const memory = await NbMemory.open({storage: new MemStorage(), embedder: new MockEmbed(), llm});
        await memory.registry.register({id: "su-001", type: "character", name: "风信子", aliases: [], ontology: "魔法少女。", ontologyTick: 2, registeredTick: 2});
        await memory.registry.register({id: "su-002", type: "character", name: "南小风", aliases: [], ontology: "真名。", ontologyTick: 5, registeredTick: 5});
        await memory.registry.merge("su-001", "su-002", 8);
        // all.length 收缩为 1，但历史总数为 2 → 新 id 必须是 su-003 而非撞车的 su-002
        const added = await memory.ingestBatch([{tick: 10, text: "英雄协会发布了公告。"}]);
        expect(added[0]!.subjectIds).toEqual(["su-003"]);
        expect(memory.skippedResolveBatches).toBe(0);
    });

    test("registeredTick 取首次引用事实的 tick，而非批首 tick", async () => {
        const llm = new MockLlm([JSON.stringify({
            register: [{name: "花铃", type: "character", ontology: "文学少女。"}],
            facts: [{i: 0, subjects: []}, {i: 1, subjects: ["花铃"]}],
        })]);
        const memory = await NbMemory.open({storage: new MemStorage(), embedder: new MockEmbed(), llm});
        await memory.ingestBatch([{tick: 5, text: "早晨我出门了。"}, {tick: 9, text: "我看到了适格者花铃的资料。"}]);
        const subject = memory.registry.all[0]!;
        expect(subject.registeredTick).toBe(9);
        // as-of 首次引用之前主体不可见
        expect(memory.registry.card(subject.id, {tick: 8})).toBeNull();
    });

    test("op 应用段异常只跳过本批，不炸摄入", async () => {
        class BrokenStorage extends MemStorage {
            override async appendLine(name: string, line: string): Promise<void> {
                if (name === "registry.jsonl") throw new Error("磁盘炸了");
                await super.appendLine(name, line);
            }
        }
        const llm = new MockLlm([JSON.stringify({
            register: [{name: "英雄协会", type: "faction", ontology: "组织。"}],
            facts: [{i: 0, subjects: ["英雄协会"]}],
        })]);
        const memory = await NbMemory.open({storage: new BrokenStorage(), embedder: new MockEmbed(), llm});
        const added = await memory.ingestBatch([{tick: 1, text: "英雄协会发布了公告。"}]);
        expect(memory.skippedResolveBatches).toBe(1);
        expect(added[0]!.subjectIds).toEqual([]);
        expect(memory.facts.all.length).toBe(1);
    });
});

describe("状态提案（S3）", () => {
    test("同 topic 提案：旧认知失效被取代，as-of 仍可见旧认知，检索确定性注入在效状态", async () => {
        const llm = new MockLlm([
            JSON.stringify({register: [{name: "小雪", type: "character", ontology: "粉发转校生。"}], facts: [{i: 0, subjects: ["小雪"]}],
                state: [{subject: "小雪", topic: "对我的态度", view: "疑似讨厌我。", sinceTick: 2}]}),
            JSON.stringify({facts: [{i: 0, subjects: ["小雪"]}],
                state: [{subject: "小雪", topic: "对我的态度", view: "不讨厌我，只是怕生。", sinceTick: 7}]}),
        ]);
        const memory = await NbMemory.open({storage: new MemStorage(), embedder: new MockEmbed(), llm});
        await memory.ingestBatch([{tick: 2, text: "小雪看到我打招呼就跑掉了。"}]);
        await memory.ingestBatch([{tick: 7, text: "小雪说她只是怕生，不是讨厌我。"}]);

        // 取代语义：在效状态只剩新认知，旧认知带失效区间
        expect(memory.states.activeAt().map((e) => e.view)).toEqual(["不讨厌我，只是怕生。"]);
        expect(memory.states.activeAt({tick: 3}).map((e) => e.view)).toEqual(["疑似讨厌我。"]);

        // 检索：提及主体时确定性注入在效状态（不依赖语义命中）
        const now = await memory.search("小雪对我的态度如何？");
        expect(now.some((hit) => hit.source === "state" && hit.text.includes("怕生"))).toBe(true);
        expect(now.some((hit) => hit.source === "state" && hit.text.includes("讨厌我。"))).toBe(false);
        const past = await memory.search("小雪对我的态度如何？", {asOfTick: 3});
        expect(past.some((hit) => hit.source === "state" && hit.text.includes("疑似讨厌"))).toBe(true);
    });
});

describe("主体卡 as-of", () => {
    test("登记前不可见；别名按 sinceTick 裁剪；ontology 取当时版本", async () => {
        const memory = await NbMemory.open({storage: new MemStorage(), embedder: new MockEmbed()});
        await memory.registry.register({id: "xiaoxue", type: "character", name: "小雪", aliases: [], ontology: "神秘的粉发女孩。", ontologyTick: 4, registeredTick: 4});
        await memory.registry.addAlias("xiaoxue", "粉发女孩", 8);
        await memory.registry.updateOntology("xiaoxue", "粉发转校生，其实是魔法少女。", 10);

        expect(memory.registry.card("xiaoxue", {tick: 3})).toBeNull();
        const at5 = memory.registry.card("xiaoxue", {tick: 5})!;
        expect(at5).toContain("神秘的粉发女孩");
        expect(at5).not.toContain("粉发女孩（自tick8");
        expect(at5).not.toContain("魔法少女");
        const at9 = memory.registry.card("xiaoxue", {tick: 9})!;
        expect(at9).toContain("自tick8");
        expect(at9).not.toContain("魔法少女");
        expect(memory.registry.card("xiaoxue")!).toContain("魔法少女");
    });

    test("检索注入：问题提及别名时返回主体卡，as-of 早于合并则不注入", async () => {
        const memory = await NbMemory.open({storage: new MemStorage(), embedder: new MockEmbed()});
        await memory.registry.register({id: "xiaoxue", type: "character", name: "小雪", aliases: [], ontology: "粉发转校生。", ontologyTick: 4, registeredTick: 4});
        await memory.registry.addAlias("xiaoxue", "粉发女孩", 8);
        await memory.addFact({tick: 5, text: "粉发女孩帮我捡起了课本。", subjectIds: ["xiaoxue"]});

        const now = await memory.search("粉发女孩是谁？");
        expect(now[0]!.source).toBe("registry");
        expect(now[0]!.text).toContain("小雪");

        // asOf=6：别名合并（t8）尚未发生——问题字面匹配不到主体，但命中片段带 subjectIds
        // 仍会注入「当时已知」的卡（不含别名行），不泄漏「粉发女孩=小雪」的合并时刻之后的信息
        const past = await memory.search("粉发女孩是谁？", {asOfTick: 6});
        const cards = past.filter((hit) => hit.source === "registry");
        for (const card of cards) {
            expect(card.text).not.toContain("自tick8");
        }
    });
});

describe("摄入路径灌入故事时间", () => {
    /**
     * 模型只会给 tick——它不知道世界零点的秒数。故事时间必须由引擎从本批事实推导，
     * 否则双时间轴形态存在了、主路径却一条 instant 都写不进去。
     */
    test("登记 / 别名 / 状态的 instant 由对应 tick 的事实推导", async () => {
        const llm = new MockLlm([JSON.stringify({
            register: [{name: "小雪", type: "character", ontology: "粉发转校生。"}],
            alias: [{subject: "小雪", alias: "粉发女孩", sinceTick: 7}],
            facts: [{i: 0, subjects: ["小雪"]}, {i: 1, subjects: ["小雪"]}],
            state: [{subject: "小雪", topic: "对我的态度", view: "开始愿意搭话。", sinceTick: 7}],
        })]);
        const memory = await NbMemory.open({storage: new MemStorage(), embedder: new MockEmbed(), llm});
        await memory.ingestBatch([
            {tick: 6, instant: 600n, text: "粉发女孩帮我捡起了课本。"},
            {tick: 7, instant: 700n, text: "她说她叫小雪。"},
        ]);

        const subject = memory.registry.all[0]!;
        // 登记时点 = 首次被引用的事实（t6），故事时间取那一刻
        expect(subject.registeredTick).toBe(6);
        expect(subject.registeredInstant).toBe(600n);
        // 别名在 t7 揭晓，故事时间取 t7 那一刻
        expect(subject.aliases[0]!.sinceInstant).toBe(700n);
        expect(memory.states.all[0]!.sinceInstant).toBe(700n);

        // 双轴各自可用：故事时间早于别名揭晓时点则解析不到
        expect(memory.registry.resolve("粉发女孩", {instant: 650n})).toBeNull();
        expect(memory.registry.resolve("粉发女孩", {instant: 700n})?.id).toBe(subject.id);
    });

    test("语料没有故事时间轴时，instant 一律留空而不是编一个", async () => {
        const llm = new MockLlm([JSON.stringify({
            register: [{name: "小雪", type: "character", ontology: "粉发转校生。"}],
            facts: [{i: 0, subjects: ["小雪"]}],
            state: [{subject: "小雪", topic: "对我的态度", view: "还在观望。", sinceTick: 6}],
        })]);
        const memory = await NbMemory.open({storage: new MemStorage(), embedder: new MockEmbed(), llm});
        await memory.ingestBatch([{tick: 6, text: "粉发女孩帮我捡起了课本。"}]);

        expect(memory.registry.all[0]!.registeredInstant).toBeUndefined();
        expect(memory.states.all[0]!.sinceInstant).toBeUndefined();
    });

    test("状态取代时，失效与新生效在两条轴上都对齐", async () => {
        const llm = new MockLlm([
            JSON.stringify({
                register: [{name: "小雪", type: "character", ontology: "粉发转校生。"}],
                facts: [{i: 0, subjects: ["小雪"]}],
                state: [{subject: "小雪", topic: "对我的态度", view: "疑似讨厌我。", sinceTick: 2}],
            }),
            JSON.stringify({
                facts: [{i: 0, subjects: ["小雪"]}],
                state: [{subject: "小雪", topic: "对我的态度", view: "只是怕生。", sinceTick: 9}],
            }),
        ]);
        const memory = await NbMemory.open({storage: new MemStorage(), embedder: new MockEmbed(), llm});
        await memory.ingestBatch([{tick: 2, instant: 200n, text: "她躲开了我的视线。"}]);
        await memory.ingestBatch([{tick: 9, instant: 900n, text: "她主动跟我打了招呼。"}]);

        const [old, fresh] = memory.states.all;
        expect(old!.invalidatedAtTick).toBe(9);
        expect(old!.invalidatedAtInstant).toBe(900n);
        expect(fresh!.sinceInstant).toBe(900n);
        // 故事时间轴上无空档也无重叠：900 之前是旧认知，900 起是新认知
        expect(memory.states.activeAt({instant: 899n}).map((e) => e.view)).toEqual(["疑似讨厌我。"]);
        expect(memory.states.activeAt({instant: 900n}).map((e) => e.view)).toEqual(["只是怕生。"]);
    });
});
