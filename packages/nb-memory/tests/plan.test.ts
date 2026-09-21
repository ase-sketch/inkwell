/**
 * 查询计划单测：schema 执行器 + 启发式规划器（方案 C）+ 便宜模型规划器（方案 B）。
 *
 * 主线是那个卡在当前形态能力边界上的例子：「昨天遇到的女孩，头发是什么颜色？」
 * ——问题里没有专名，主体锚点必须先从时间窗口解出来，再发第二跳。
 */
import {describe, expect, test} from "bun:test";
import {
    MemStorage, NbMemory, executePlan, planHeuristically, planWithLlm, plainPlan, describePlan,
    type EmbedPort, type LlmPort, type PlanContext, type QueryPlan,
} from "../src/index";

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

const DAY = 86400;
const NOW = {tick: 40, instant: 10_000_000n};

/**
 * 语料：昨天（instant 窗口内）遇到过小雪与天文社，大志在更早的日子出现。
 * 「发色」这条落在今天，故意不在昨天窗口内——第二跳只按主体检索，不该继承第一跳的窗口。
 */
async function corpus(): Promise<NbMemory> {
    const memory = await NbMemory.open({storage: new MemStorage(), embedder: new MockEmbed()});
    for (const [id, name, type] of [["su-001", "小雪", "character"], ["su-002", "大志", "character"], ["su-003", "天文社", "faction"]] as const) {
        await memory.registry.register({id, type, name, aliases: [], ontology: `${name}。`, ontologyTick: 1, registeredTick: 1});
    }
    await memory.addFact({id: "f_meet", tick: 30, instant: 9_900_000n, text: "我在天桥上遇到一个背吉他的人。", subjectIds: ["su-001"]});
    await memory.addFact({id: "f_club", tick: 31, instant: 9_900_100n, text: "天文社在天桥下摆了摊。", subjectIds: ["su-003"]});
    await memory.addFact({id: "f_hair", tick: 38, instant: 9_990_000n, text: "小雪的头发是浅粉色的。", subjectIds: ["su-001"]});
    await memory.addFact({id: "f_old", tick: 5, instant: 1_000_000n, text: "大志很久以前把橡皮掰掉了一角。", subjectIds: ["su-002"]});
    return memory;
}

function context(memory: NbMemory, overrides: Partial<PlanContext> = {}): PlanContext {
    return {now: NOW, secondsPerDay: DAY, registry: memory.registry, ...overrides};
}

describe("启发式规划（方案 C）", () => {
    test("无名指称 + 日历表达 → 两跳计划", async () => {
        const memory = await corpus();
        const plan = planHeuristically("昨天遇到的女孩，头发是什么颜色？", context(memory));

        expect(plan.source).toBe("heuristic");
        expect(plan.steps).toHaveLength(2);
        const [first, second] = plan.steps;
        expect(first!.op).toBe("findSubjects");
        expect(first!.op === "findSubjects" && first.types).toEqual(["character"]);
        // 昨天 = [now-2天, now-1天]
        expect(first!.op === "findSubjects" && first.instantRange).toEqual([10_000_000n - 2n * BigInt(DAY), 10_000_000n - BigInt(DAY)]);
        expect(second!.op === "search" && second.subjectsFrom).toBe(0);
    });

    test("点了名就不做多跳，只把时间窗口带上", async () => {
        const memory = await corpus();
        const plan = planHeuristically("小雪昨天说了什么？", context(memory));
        expect(plan.steps).toHaveLength(1);
        expect(plan.steps[0]!.op === "search" && plan.steps[0]!.instantRange).toBeDefined();
    });

    test("没有故事时间轴时，日历表达如实记入 unresolved 而不硬映射成 tick 窗口", async () => {
        const memory = await corpus();
        const plan = planHeuristically("昨天遇到的女孩是谁？", context(memory, {now: {tick: 40}, secondsPerDay: undefined}));

        expect(plan.steps).toHaveLength(1);
        expect(plan.steps[0]!.op === "search" && plan.steps[0]!.instantRange).toBeUndefined();
        expect(plan.steps[0]!.op === "search" && plan.steps[0]!.tickRange).toBeUndefined();
        expect(plan.unresolved?.[0]).toContain("昨天");
    });

    test("「最近」问的就是摄入序，纯 tick 模式下也能解析", async () => {
        const memory = await corpus();
        const plan = planHeuristically("最近那个女孩提到过什么？", context(memory, {now: {tick: 40}, secondsPerDay: undefined, recentTicks: 10}));
        const first = plan.steps[0]!;
        expect(first.op).toBe("findSubjects");
        expect(first.op === "findSubjects" && first.tickRange).toEqual([30, 40]);
    });

    test("既无时间线索也无无名指称 → 与不用规划器完全等价", async () => {
        const memory = await corpus();
        const plan = planHeuristically("天文社是什么？", context(memory));
        expect(plan.steps).toEqual([{op: "search", query: "天文社是什么？"}]);
    });
});

describe("计划执行", () => {
    test("两跳真的解出主体并检索到第二跳证据", async () => {
        const memory = await corpus();
        const plan = planHeuristically("昨天遇到的女孩，头发是什么颜色？", context(memory));
        const result = await executePlan(memory, plan);

        // 第一跳：昨天窗口内的 character 只有小雪（天文社是 faction，大志不在窗口）
        expect(result.subjectsPerStep[0]!.map((s) => s.id)).toEqual(["su-001"]);
        // 第二跳不继承第一跳的时间窗口，所以能拿到落在今天的发色那条
        expect(result.hits.some((hit) => hit.refId === "f_hair")).toBe(true);
        expect(result.hits.some((hit) => hit.refId === "f_old")).toBe(false);
    });

    test("对照：朴素检索没有主体锚点，会带进无关主体的档案与陈年事实", async () => {
        const memory = await corpus();
        const query = "昨天遇到的女孩，头发是什么颜色？";
        const plain = await executePlan(memory, plainPlan(query));
        const planned = await executePlan(memory, planHeuristically(query, context(memory)));

        // 实测口径：朴素路径把「很久以前的大志」和大志/天文社的主体卡一并塞进上下文
        expect(plain.hits.map((hit) => hit.refId)).toContain("f_old");
        expect(plain.hits.map((hit) => hit.refId)).toContain("su-002");
        // 规划路径只给解出的那个主体及其事实——两边都能捞到 f_hair，差别在精度不在能否答出
        expect(planned.hits.map((hit) => hit.refId)).not.toContain("f_old");
        expect(planned.hits.map((hit) => hit.refId)).not.toContain("su-002");
        expect(planned.hits.length).toBeLessThan(plain.hits.length);
    });

    test("主体锚点解为空时跳过该步，而不是退化成全库检索", async () => {
        const memory = await corpus();
        const empty: QueryPlan = {
            source: "manual",
            steps: [
                {op: "findSubjects", instantRange: [1n, 2n], types: ["character"]},
                {op: "search", query: "头发", subjectsFrom: 0},
            ],
        };
        const result = await executePlan(memory, empty);
        expect(result.subjectsPerStep[0]).toEqual([]);
        expect(result.hits).toEqual([]);
    });

    test("多步命中按 refId 去重，先出现的保留", async () => {
        const memory = await corpus();
        const plan: QueryPlan = {
            source: "manual",
            steps: [
                {op: "search", query: "头发", subjectTypes: ["character"], limit: 5},
                {op: "search", query: "头发", limit: 5},
            ],
        };
        const result = await executePlan(memory, plan);
        expect(new Set(result.hits.map((h) => h.refId)).size).toBe(result.hits.length);
    });

    test("describePlan 给出可读摘要", async () => {
        const memory = await corpus();
        const text = describePlan(planHeuristically("昨天遇到的女孩，头发是什么颜色？", context(memory)));
        expect(text).toContain("findSubjects");
        expect(text).toContain("←步骤0的主体");
    });
});

describe("便宜模型规划（方案 B）", () => {
    /** 固定回放的 LLM 替身 */
    function fakeLlm(reply: string): LlmPort {
        return {
            async chat(): Promise<string> {
                return reply;
            },
        };
    }

    /** 调用即抛的 LLM 替身（模拟限流/网络失败） */
    function failingLlm(): LlmPort {
        return {
            async chat(): Promise<string> {
                throw new Error("429 Too Many Requests");
            },
        };
    }

    async function input(memory: NbMemory, query: string) {
        return {query, recentTurns: ["用户：昨天在天桥碰到个人。", "助手：嗯，你提过。"], subjects: memory.registry.all, now: NOW, secondsPerDay: DAY};
    }

    test("解析合法计划，instant 按十进制字符串还原", async () => {
        const memory = await corpus();
        const llm = fakeLlm(JSON.stringify({
            steps: [
                {op: "findSubjects", instantRange: ["9827200", "9913600"], types: ["character"], note: "昨天出现的人"},
                {op: "search", query: "头发 颜色", subjectsFrom: 0, limit: 5},
            ],
        }));
        const {plan, degraded} = await planWithLlm(llm, await input(memory, "昨天那个人头发什么颜色"));

        expect(degraded).toBe(false);
        expect(plan.source).toBe("llm");
        expect(plan.steps[0]!.op === "findSubjects" && plan.steps[0]!.instantRange).toEqual([9_827_200n, 9_913_600n]);
        const result = await executePlan(memory, plan);
        expect(result.hits.some((hit) => hit.refId === "f_hair")).toBe(true);
    });

    test("输出不是 JSON → 降级为朴素计划且如实报告", async () => {
        const memory = await corpus();
        const {plan, degraded} = await planWithLlm(fakeLlm("我觉得应该查一下昨天的记录。"), await input(memory, "问题"));
        expect(degraded).toBe(true);
        expect(plan.steps).toEqual([{op: "search", query: "问题"}]);
    });

    test("调用抛错 → 同样降级，不把错误抛给调用方", async () => {
        const memory = await corpus();
        const {plan, degraded} = await planWithLlm(failingLlm(), await input(memory, "问题"));
        expect(degraded).toBe(true);
        expect(plan.steps).toHaveLength(1);
    });

    test("坏步骤被丢掉，好步骤保留", async () => {
        const memory = await corpus();
        const llm = fakeLlm(JSON.stringify({
            steps: [{op: "search"}, {op: "不存在的操作"}, {op: "search", query: "头发", limit: 3}],
            unresolved: ["「上周」没有对应的故事时间基准"],
        }));
        const {plan, degraded} = await planWithLlm(llm, await input(memory, "问题"));
        expect(degraded).toBe(false);
        expect(plan.steps).toEqual([{op: "search", query: "头发", limit: 3}]);
        expect(plan.unresolved).toEqual(["「上周」没有对应的故事时间基准"]);
    });

    test("describedAs 被解析并保留（空串丢弃）", async () => {
        const memory = await corpus();
        const raw = JSON.stringify({steps: [
            {op: "findSubjects", describedAs: "  学校认识的猫娘兽人  ", types: ["character"]},
            {op: "findSubjects", describedAs: "   "},
            {op: "search", query: "关系", subjectsFrom: 0},
        ]});
        const {plan, degraded} = await planWithLlm(fakeLlm(raw), await input(memory, "问题"));
        expect(degraded).toBe(false);
        // 前后空白裁掉；空串视作没给
        expect(plan.steps[0]).toEqual({op: "findSubjects", describedAs: "学校认识的猫娘兽人", types: ["character"]});
        expect(plan.steps[1]).toEqual({op: "findSubjects"});
    });

    test("全部步骤非法 → 降级", async () => {
        const memory = await corpus();
        const {degraded} = await planWithLlm(fakeLlm(JSON.stringify({steps: [{op: "search"}]})), await input(memory, "问题"));
        expect(degraded).toBe(true);
    });
});

/**
 * 按描述解主体（`findSubjects.describedAs`）。
 *
 * 补的盲区：查询侧不含专名时，字面匹配主名/别名一个主体都解不出来。
 * 语料里「南嘉鱼」这类专名在问句中不出现，只有「深蓝色头发的猫女」这样的描述。
 */
describe("按描述解主体", () => {
    /** 三个主体的本体描述互不相似，可靠地区分开 */
    async function described(): Promise<NbMemory> {
        const memory = await NbMemory.open({storage: new MemStorage(), embedder: new MockEmbed()});
        await memory.registry.register({id: "su-101", type: "character", name: "南嘉鱼", aliases: [], ontology: "深蓝色头发的猫女兽人，主角的大学同班同学", ontologyTick: 1, registeredTick: 1});
        await memory.registry.register({id: "su-102", type: "item", name: "墨丘利秘典", aliases: [], ontology: "会说话的黑色悬浮古书，来自星空彼岸", ontologyTick: 1, registeredTick: 1});
        await memory.registry.register({id: "su-103", type: "character", name: "花铃", aliases: [], ontology: "孤僻的文学少女，高潜力适格者", ontologyTick: 1, registeredTick: 1});
        await memory.addFact({id: "f_sister", tick: 20, text: "南嘉鱼是风信子南小风的姐姐。", subjectIds: ["su-101"]});
        await memory.addFact({id: "f_book", tick: 21, text: "古书第一页浮现出契约文字。", subjectIds: ["su-102"]});
        await memory.flush();
        return memory;
    }

    test("查询不含专名时，描述能解出主体——而字面匹配解不出", async () => {
        const memory = await described();
        // 字面路（现有 search 的主体锚点来源）在这句话上完全失效
        expect(memory.registry.mentionedIn("学校认识的猫女兽人")).toEqual([]);

        const {subjectsPerStep} = await executePlan(memory, {
            source: "manual",
            steps: [{op: "findSubjects", describedAs: "学校认识的猫女兽人", describedAsLimit: 1}],
        });
        expect(subjectsPerStep[0]!.map((s) => s.id)).toEqual(["su-101"]);
    });

    test("解出的主体可作为第二跳锚点，召回本来打不中的事实", async () => {
        const memory = await described();
        const {hits} = await executePlan(memory, {
            source: "manual",
            steps: [
                {op: "findSubjects", describedAs: "学校认识的猫女兽人", describedAsLimit: 1},
                {op: "search", query: "是什么关系", subjectsFrom: 0},
            ],
        });
        expect(hits.map((h) => h.refId)).toContain("f_sister");
    });

    test("结构约束与描述取交：解出的主体必须同时满足类型约束", async () => {
        const memory = await described();
        const {subjectsPerStep} = await executePlan(memory, {
            source: "manual",
            // 描述像书，但限定只要 character——不论描述这一路排出什么，
            // 结构约束都必须硬生效（mock embedder 的排序不可信，所以断言的是不变式）
            steps: [{op: "findSubjects", describedAs: "会说话的黑色古书", types: ["character"]}],
        });
        expect(subjectsPerStep[0]!.every((s) => s.type === "character")).toBe(true);
        expect(subjectsPerStep[0]!.some((s) => s.id === "su-102")).toBe(false);
    });

    test("主体描述条目不进普通检索结果", async () => {
        const memory = await described();
        const hits = await memory.search("深蓝色头发的猫女兽人", {limit: 10});
        expect(hits.filter((h) => h.source === "subject")).toEqual([]);
    });

    test("as-of：只有该时点生效的描述版本可见", async () => {
        const memory = await NbMemory.open({storage: new MemStorage(), embedder: new MockEmbed()});
        await memory.registry.register({id: "su-201", type: "character", name: "某人", aliases: [], ontology: "戴兜帽的陌生人", ontologyTick: 1, registeredTick: 1});
        await memory.flush();
        await memory.registry.updateOntology("su-201", "银发的剑士，王国第一骑士", 50);
        await memory.flush();

        /** 该 as-of 下可见的主体描述条目文本 */
        const visible = async (asOfTick?: number): Promise<string[]> => {
            const hits = await memory.search("描述", {
                sources: ["subject"], limit: 10,
                ...(asOfTick !== undefined ? {asOfTick} : {}),
            });
            return hits.map((h) => h.text);
        };
        // t=40：新版描述（tick 50）尚未形成，只能看到旧版——按描述解主体因此不可能
        // 用「银发的剑士」解出他，这正是 as-of 知识边界在这条新路径上的体现
        expect(await visible(40)).toEqual(["某人（character）：戴兜帽的陌生人"]);
        // t=60：新版生效、旧版失效
        expect(await visible(60)).toEqual(["某人（character）：银发的剑士，王国第一骑士"]);
        // 不给 as-of = 当前认知口径，只出未失效的那一版
        expect(await visible()).toEqual(["某人（character）：银发的剑士，王国第一骑士"]);
    });

    /**
     * 已知局限：`describedAs` 没有相似度下限，存活集非空时总会解出**某个**主体。
     * 真实 embedder 有 1.15 的余弦截断兜一层，但它是为内容检索定的，不是为解主体定的。
     * 定一个专门的下限需要评测数据支撑，不凭空拍数字——记在 ADR 0005 未决里。
     */
    test("存活集非空时总有结果——相似度下限尚未实现", async () => {
        const memory = await described();
        const {subjectsPerStep} = await executePlan(memory, {
            source: "manual",
            steps: [{op: "findSubjects", describedAs: "完全无关的一句话", describedAsLimit: 1}],
        });
        expect(subjectsPerStep[0]!.length).toBe(1);
    });
});

/**
 * search() 内的描述兜底（批次 A1）——把 describedAs 接进真正的检索路径。
 *
 * 与 findSubjects.describedAs 的区别：这条不需要查询计划，直接在字面路
 * 解不出主体时兜底，是评测路径实际会走到的那条。
 */
describe("search 描述兜底", () => {
    /** 姐妹关系事实只挂在南嘉鱼身上，问句里不出现她的名字 */
    async function corpus2(): Promise<NbMemory> {
        const memory = await NbMemory.open({storage: new MemStorage(), embedder: new MockEmbed()});
        await memory.registry.register({id: "su-101", type: "character", name: "南嘉鱼", aliases: [], ontology: "深蓝色头发的猫女兽人，主角的大学同班同学", ontologyTick: 1, registeredTick: 1});
        await memory.registry.register({id: "su-102", type: "item", name: "墨丘利秘典", aliases: [], ontology: "会说话的黑色悬浮古书，来自星空彼岸", ontologyTick: 1, registeredTick: 1});
        await memory.addFact({id: "f_sister", tick: 20, text: "她是风信子南小风的姐姐。", subjectIds: ["su-101"]});
        // 同主体的第二条事实：补充召回的价值正是捞出主 limit 之外的同主体内容，
        // 只有一条时召回的还是同一条，去重后看不出锚点有没有生效
        await memory.addFact({id: "f_dorm", tick: 21, text: "她住在学校宿舍，放假去亲戚家。", subjectIds: ["su-101"]});
        await memory.flush();
        return memory;
    }

    test("开关改变主体锚点：无专名查询下开与关的结果不同", async () => {
        const memory = await corpus2();
        // limit 收到 1：主检索只出 1 条，补充召回不挤占主 limit，所以主体锚定
        // 带来的增量才可观测（语料小于默认 limit 时主检索会全召回，差异被淹没）
        const off = await memory.search("学校认识的猫女兽人是谁的姐姐", {limit: 1});
        const on = await memory.search("学校认识的猫女兽人是谁的姐姐", {limit: 1, resolveByDescription: true});
        // 关：字面路空手 ⇒ 没有主体锚点 ⇒ 没有主体锚定带来的补充召回
        // 开：描述解出 su-101 ⇒ 多出按 subjectIds 过滤的补充召回与状态注入
        expect(on.length).toBeGreaterThan(off.length);
    });

    test("开启后解出主体，主体卡随之注入", async () => {
        const memory = await corpus2();
        const hits = await memory.search("学校认识的猫女兽人是谁的姐姐", {resolveByDescription: true});
        const cards = hits.filter((h) => h.source === "registry");
        expect(cards.length).toBeGreaterThan(0);
        expect(cards.some((c) => c.text.includes("南嘉鱼"))).toBe(true);
    });

    test("补齐锚点时保留字面路已解出的主体", async () => {
        const memory = await corpus2();
        // 问句点了「墨丘利秘典」的名 ⇒ 字面路解出 su-102；描述补齐不能把它挤掉。
        // 这是 p037 那类「部分锚定」问题的核心不变式：关系类问题需要两个主体都在场
        const hits = await memory.search("墨丘利秘典和那个猫女兽人是什么关系", {resolveByDescription: true});
        const cards = hits.filter((h) => h.source === "registry").map((h) => h.text);
        expect(cards.some((t) => t.includes("墨丘利秘典"))).toBe(true);
    });

    /**
     * as-of 红线：描述兜底是主体锚定的一条新路径，必须和其余路径同口径。
     * 描述在 t=50 才更新成「银发的剑士」，asOfTick=40 的查询不能靠它解出主体。
     */
    test("as-of：兜底不靠尚未形成的描述版本解主体", async () => {
        const memory = await NbMemory.open({storage: new MemStorage(), embedder: new MockEmbed()});
        await memory.registry.register({id: "su-201", type: "character", name: "某人", aliases: [], ontology: "戴兜帽的陌生人", ontologyTick: 1, registeredTick: 1});
        await memory.addFact({id: "f_x", tick: 2, text: "他在城门口站了一整天。", subjectIds: ["su-201"]});
        await memory.flush();
        await memory.registry.updateOntology("su-201", "银发的剑士，王国第一骑士", 50);
        await memory.flush();

        /** 该 as-of 下兜底能看到的描述条目 */
        const seen = async (asOfTick: number): Promise<string[]> => {
            const hits = await memory.search("银发的剑士", {
                resolveByDescription: true, sources: ["subject"], asOfTick, limit: 10,
            });
            return hits.map((h) => h.text);
        };
        expect(await seen(40)).toEqual(["某人（character）：戴兜帽的陌生人"]);
        expect(await seen(60)).toEqual(["某人（character）：银发的剑士，王国第一骑士"]);
    });
});

/**
 * 主体卡注入与 sources 的关系。
 *
 * 卡是上下文注入而非被检索的层：规划器给个 sources:["state"] 不该把卡连带丢掉
 * （p018「匿名账号叫什么」的答案就是苏天晴的一个别名，只在卡里）。
 * 唯一关掉它的是内部解主体那种检索。
 */
describe("主体卡注入", () => {
    async function withCard(): Promise<NbMemory> {
        const memory = await NbMemory.open({storage: new MemStorage(), embedder: new MockEmbed()});
        await memory.registry.register({id: "su-301", type: "character", name: "苏天晴", aliases: [], ontology: "重生为金毛狐女的人类", ontologyTick: 1, registeredTick: 1});
        await memory.registry.addAlias("su-301", "狐狐official", 5);
        await memory.setState({subjectId: "su-301", topic: "生计来源", view: "靠直播恰饭", sinceTick: 6});
        await memory.flush();
        return memory;
    }

    test("给了 sources 也照常注入主体卡", async () => {
        const memory = await withCard();
        const hits = await memory.search("苏天晴的账号", {sources: ["state"], limit: 5});
        const cards = hits.filter((h) => h.source === "registry");
        expect(cards.length).toBeGreaterThan(0);
        // 别名在卡里——这正是这类问题的答案所在
        expect(cards[0]!.text).toContain("狐狐official");
    });

    test("内部解主体的检索不注入主体卡", async () => {
        const memory = await withCard();
        const hits = await memory.search("重生为金毛狐女", {sources: ["subject"], limit: 5});
        expect(hits.filter((h) => h.source === "registry")).toEqual([]);
    });
});
