/**
 * S4 字面融合单测：
 * - tokenize：CJK bigram + ASCII 整词
 * - 语义路失效时字面路独立召回专名（p018 账号名类的离线复现）
 * - tick<=asOf 红线对字面路同样生效
 */
import {describe, expect, test} from "bun:test";
import {tokenize} from "../src/retrieval/bm25";
import {MemStorage, NbMemory, type EmbedPort} from "../src/index";

/** 全零向量 embedder：语义路完全无区分度，逼出纯字面路行为 */
class ZeroEmbed implements EmbedPort {
    readonly dims = 8;

    async embed(texts: string[]): Promise<number[][]> {
        return texts.map(() => new Array<number>(this.dims).fill(0));
    }
}

describe("tokenize", () => {
    test("CJK 拆字 bigram，ASCII 串整词小写", () => {
        expect(tokenize("狐狐official账号")).toEqual(["狐狐", "official", "账号"]);
        expect(tokenize("摄像头")).toEqual(["摄像", "像头"]);
        expect(tokenize("A")).toEqual(["a"]);
    });
});

describe("字面融合", () => {
    test("语义无区分度时专名靠 BM25 召回，且 tick 过滤不放行未来事实", async () => {
        const memory = await NbMemory.open({storage: new MemStorage(), embedder: new ZeroEmbed()});
        await memory.addFact({tick: 3, text: "今天天气不错，我出门散步。", subjectIds: []});
        await memory.addFact({tick: 5, text: "我注册了匿名账号「魔法少女狐狐official」。", subjectIds: []});
        await memory.addFact({tick: 8, text: "晚上我早早睡下了。", subjectIds: []});

        const hits = await memory.search("我的账号狐狐official叫什么？", {limit: 2});
        expect(hits[0]!.text).toContain("狐狐official");

        // as-of 在注册之前：字面路也必须被 tick 过滤拦住（泄漏红线）
        const past = await memory.search("我的账号狐狐official叫什么？", {asOfTick: 4});
        expect(past.every((hit) => !hit.text.includes("official"))).toBe(true);
    });
});
