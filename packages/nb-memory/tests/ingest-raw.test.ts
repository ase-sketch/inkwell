/**
 * 原始内容摄入单测：分块策略 + 视角化抽取 + ingestRaw 全链路（离线，mock LLM/embedding）。
 *
 * 重点不在切法（chunk 只是抽取器的输入窗口，切坏了还有 overlap 和上下文携带兜着），
 * 而在**跨块携带**与**视角参数化**——「得知名字之前不许用名字」是个跨块状态，
 * 抽取器看不到前文就会写错指称，且错得很隐蔽。
 */
import {describe, expect, test} from "bun:test";
import {MemStorage, NbMemory, chunk, extractFacts, type EmbedPort, type LlmPort, type LlmRequest} from "../src/index";

class MockEmbed implements EmbedPort {
    readonly dims = 64;

    async embed(texts: string[]): Promise<number[][]> {
        return texts.map((text) => {
            const vec = new Array<number>(this.dims).fill(0);
            for (const ch of text) vec[ch.charCodeAt(0) % this.dims] += 1;
            const norm = Math.sqrt(vec.reduce((s, v) => s + v * v, 0));
            return norm === 0 ? vec : vec.map((v) => v / norm);
        });
    }
}

/** 记录每次调用的 mock LLM，按顺序吐回复（用尽后重复最后一条） */
class RecordingLlm implements LlmPort {
    readonly requests: LlmRequest[] = [];

    constructor(private readonly replies: string[]) {}

    async chat(req: LlmRequest): Promise<string> {
        this.requests.push(req);
        return this.replies.length > 1 ? this.replies.shift()! : this.replies[0]!;
    }
}

describe("分块", () => {
    test("paragraph：按空行切后贪心装箱到上限", () => {
        const text = ["第一段。".repeat(10), "第二段。".repeat(10), "第三段。".repeat(10)].join("\n\n");
        const packed = chunk(text, {maxChars: 90});
        expect(packed.length).toBeGreaterThan(1);
        for (const piece of packed) expect(piece.length).toBeLessThanOrEqual(90);
    });

    test("heading：只在标题处断开，块内仍贪心装箱", () => {
        const text = "前言。\n\n## 第一章\n正文一。\n\n## 第二章\n正文二。";
        // 上限足够大时几节合成一块——策略决定「允许在哪断」，不是「每节必须独立成块」
        expect(chunk(text, {strategy: "heading", maxChars: 500})).toHaveLength(1);
        // 上限收紧后每次断开都落在标题边界上
        const pieces = chunk(text, {strategy: "heading", maxChars: 15});
        expect(pieces).toHaveLength(3);
        expect(pieces[1]!.startsWith("## 第一章")).toBe(true);
        expect(pieces[2]!.startsWith("## 第二章")).toBe(true);
    });

    test("turns：按对话轮切", () => {
        const pieces = chunk("用户：今天累吗\n助手：还好。\n用户：那明天呢", {strategy: "turns", maxChars: 12});
        expect(pieces.length).toBeGreaterThanOrEqual(3);
        expect(pieces[0]!.startsWith("用户：")).toBe(true);
    });

    test("chars：超长无分隔文本也能切开（兜底）", () => {
        const pieces = chunk("啊".repeat(500), {strategy: "chars", maxChars: 100});
        expect(pieces).toHaveLength(5);
    });

    test("overlap：每块前置上一块尾部", () => {
        const pieces = chunk("AAAA\n\nBBBB\n\nCCCC", {maxChars: 4, overlap: 2});
        expect(pieces[1]!.startsWith("AA")).toBe(true);
    });

    test("自定义 split 完全接管", () => {
        expect(chunk("a|b|c", {split: (t) => t.split("|")})).toEqual(["a", "b", "c"]);
    });

    test("空文本返回空数组", () => {
        expect(chunk("   \n\n  ")).toEqual([]);
    });
});

describe("视角化抽取", () => {
    const reply = JSON.stringify({facts: [{time: "第一天", text: "我在公交上帮一个粉色头发的女生付了车费。"}]});

    test("character 视角把视角角色写进提示词，且要求跳过不在场的场景", async () => {
        const llm = new RecordingLlm([reply]);
        await extractFacts(llm, [], "正文……", {pov: "character", povSubject: "苏晓"});
        const system = llm.requests[0]!.system;
        expect(system).toContain("苏晓 的第一人称");
        expect(system).toContain("一律跳过");
        expect(system).toContain("不要提前剧透名字");
    });

    test("omniscient 视角要求覆盖不在场情节，判据换成「读者知道了没有」", async () => {
        const llm = new RecordingLlm([reply]);
        await extractFacts(llm, [], "正文……", {pov: "omniscient"});
        const system = llm.requests[0]!.system;
        expect(system).toContain("全知视角");
        expect(system).toContain("读者读到这里知道了没有");
    });

    test("character 视角缺 povSubject 直接抛错，不猜", async () => {
        const llm = new RecordingLlm([reply]);
        expect(extractFacts(llm, [], "正文", {pov: "character"})).rejects.toThrow("povSubject");
    });

    test("跨块携带：注册表快照与上一块尾部都进下一块上下文", async () => {
        const llm = new RecordingLlm([
            JSON.stringify({facts: [{time: "第一天", text: "我遇到一个粉色头发的女生。"}]}),
            JSON.stringify({facts: [{time: "第二天", text: "她说她叫小雪。"}]}),
        ]);
        const subjects = [{
            id: "su-001", type: "character", name: "小雪",
            aliases: [{alias: "粉色头发的女生", sinceTick: 3}],
            ontology: "转校生。", ontologyTick: 1, registeredTick: 1,
        }];
        await extractFacts(llm, subjects, "第一块。\n\n第二块。", {chunk: {maxChars: 4}});

        expect(llm.requests).toHaveLength(2);
        // 两块都带注册表快照；第二块还带上一块产出的事实
        expect(llm.requests[0]!.user).toContain("已知主体");
        expect(llm.requests[0]!.user).toContain("粉色头发的女生");
        expect(llm.requests[1]!.user).toContain("上文末尾");
        expect(llm.requests[1]!.user).toContain("我遇到一个粉色头发的女生。");
    });

    test("单块输出非法：重试后跳过该块，其余块照常，不中断整轮", async () => {
        const llm = new RecordingLlm([
            "我觉得这段没什么好抽的",   // 第一块首次
            "还是不行",                 // 第一块重试
            JSON.stringify({facts: [{text: "第二块的事实。"}]}),
        ]);
        const result = await extractFacts(llm, [], "第一块。\n\n第二块。", {chunk: {maxChars: 4}});
        expect(result.skippedChunks).toBe(1);
        expect(result.facts).toEqual([{text: "第二块的事实。"}]);
    });
});

describe("ingestRaw 全链路", () => {
    test("原文留档 + 抽取 + 消解，tick 由库统一分配", async () => {
        const llm = new RecordingLlm([
            // 抽取
            JSON.stringify({facts: [
                {time: "第一天", text: "我在公交上帮一个粉色头发的女生付了车费。"},
                {time: "第一天", text: "她在青叶站下了车。"},
            ]}),
            // 消解
            JSON.stringify({
                register: [{name: "粉色头发的女生", type: "character", ontology: "公交上遇到的女生。"}],
                facts: [{i: 0, subjects: ["粉色头发的女生"]}, {i: 1, subjects: ["粉色头发的女生"]}],
            }),
        ]);
        const memory = await NbMemory.open({storage: new MemStorage(), embedder: new MockEmbed(), llm});
        const result = await memory.ingestRaw(
            [{source: "chapter:01", text: "第一章原文……", instant: 86400n, time: "第一天"}],
            {pov: "character", povSubject: "我"},
        );

        expect(result.episodes).toHaveLength(1);
        expect(result.facts).toHaveLength(2);
        expect(result.skippedChunks).toBe(0);
        // episode 与其下事实共用一条摄入序，episode 在前
        expect(result.episodes[0]!.tick).toBe(1);
        expect(result.facts.map((f) => f.tick)).toEqual([2, 3]);
        // 事实回指 episode，并继承其故事时间
        expect(result.facts.every((f) => f.episodeId === result.episodes[0]!.id)).toBe(true);
        expect(result.facts.every((f) => f.instant === 86400n)).toBe(true);
        // 原文完整留档（换抽取器后可整批重放）
        expect(memory.episodes.all[0]!.text).toBe("第一章原文……");
        // 消解生效
        expect(memory.registry.all).toHaveLength(1);
        expect(result.facts[0]!.subjectIds).toHaveLength(1);
    });

    test("第二篇的 tick 接着第一篇往下排，不重号", async () => {
        const llm = new RecordingLlm([
            JSON.stringify({facts: [{text: "事实甲。"}]}),
            JSON.stringify({facts: [{i: 0, subjects: []}]}),
            JSON.stringify({facts: [{text: "事实乙。"}]}),
            JSON.stringify({facts: [{i: 0, subjects: []}]}),
        ]);
        const memory = await NbMemory.open({storage: new MemStorage(), embedder: new MockEmbed(), llm});
        await memory.ingestRaw([{source: "a", text: "甲。"}]);
        await memory.ingestRaw([{source: "b", text: "乙。"}]);

        const ticks = [...memory.episodes.all.map((e) => e.tick), ...memory.facts.all.map((f) => f.tick)];
        expect(new Set(ticks).size).toBe(ticks.length);
        expect(ticks.sort((a, b) => a - b)).toEqual([1, 2, 3, 4]);
    });

    test("没有 llm 时直接抛错，而不是静默只落 episode", async () => {
        const memory = await NbMemory.open({storage: new MemStorage(), embedder: new MockEmbed()});
        expect(memory.ingestRaw([{source: "a", text: "甲。"}])).rejects.toThrow("ingestRaw 需要 llm");
    });
});
