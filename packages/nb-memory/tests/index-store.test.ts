/**
 * 索引存储差分测试：MemoryIndexStore 与 SqliteIndexStore 必须在**任意过滤组合**下
 * 返回完全相同的结果（含顺序）。
 *
 * 这是「下推谓词只能放宽，不能收紧」这条红线的结构性保证：SQL 下推是纯 I/O 优化，
 * 权威判据只有 search.passesFilter 一份。两套过滤实现一旦各说各话，as-of 零泄漏
 * 就会悄悄失效——差分测试是唯一能持续拦住它的东西。
 *
 * 另覆盖持久化本身：跨进程复用向量、换模型渐进重嵌、延迟嵌入下的优雅降级。
 */
import {afterAll, describe, expect, test} from "bun:test";
import {mkdtempSync, rmSync} from "node:fs";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {
    FsStorage, MemStorage, MemoryIndexStore, NbMemory, SqliteIndexStore,
    type EmbedPort, type IndexStorePort, type MemorySearchOptions,
} from "../src/index";

const tempRoot = mkdtempSync(join(tmpdir(), "nb-memory-store-"));
/** 打开过的 SQLite store：Windows 下句柄不关就删不掉文件 */
const opened: SqliteIndexStore[] = [];
afterAll(async () => {
    for (const store of opened) await store.close();
    rmSync(tempRoot, {recursive: true, force: true});
});

let dbSeq = 0;
function tempDb(): string {
    dbSeq += 1;
    return join(tempRoot, `index-${String(dbSeq)}.sqlite`);
}

/** 打开并登记一个 SQLite store（afterAll 统一关闭） */
async function openSqlite(
    file: string,
    modelKey = "mock/256",
    filterableMeta?: Record<string, "text" | "number" | "boolean">,
): Promise<SqliteIndexStore> {
    const store = await SqliteIndexStore.open({file, modelKey, ...(filterableMeta ? {filterableMeta} : {})});
    opened.push(store);
    return store;
}

/** 语料里出现的可过滤扩展字段声明（触发 SQL 生成列下推路径） */
const DECLARED_META = {speaker: "text", channel: "text"} as const;

/** 确定性 mock embedding + 调用计数（用来证明持久化真的省掉了重嵌） */
class CountingEmbed implements EmbedPort {
    readonly dims = 256;
    /** embed() 被调用的次数（批次数，不是文本条数） */
    calls = 0;
    /** 被嵌入过的文本条数 */
    texts = 0;

    async embed(texts: string[]): Promise<number[][]> {
        this.calls += 1;
        this.texts += texts.length;
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

/**
 * 语料刻意把每个过滤维度都摆满：两条时间轴（含无 instant 的行）、多主体、
 * 关系事实（≥2 主体）、扩展字段、state 失效链。
 */
async function seed(memory: NbMemory): Promise<void> {
    await memory.registry.register({id: "su-001", type: "character", name: "小雪", aliases: [], ontology: "转校生。", ontologyTick: 1, registeredTick: 1});
    await memory.registry.register({id: "su-002", type: "character", name: "大志", aliases: [], ontology: "同桌。", ontologyTick: 1, registeredTick: 1});
    await memory.registry.register({id: "su-003", type: "faction", name: "天文社", aliases: [], ontology: "社团。", ontologyTick: 2, registeredTick: 2});

    await memory.addFact({id: "f1", tick: 1, instant: 100n, text: "我在公交上帮小雪付了车费。", subjectIds: ["su-001"], meta: {channel: "group", speaker: "我"}});
    await memory.addFact({id: "f2", tick: 3, instant: 300n, text: "大志把橡皮掰掉了一角。", subjectIds: ["su-002"], meta: {channel: "dm", speaker: "大志"}});
    await memory.addFact({id: "f3", tick: 5, instant: 50n, text: "回忆：小雪和大志曾在天文社一起观星。", subjectIds: ["su-001", "su-002", "su-003"]});
    await memory.addFact({id: "f4", tick: 7, text: "没有故事时间的一条杂记，提到小雪。", subjectIds: ["su-001"]});
    await memory.addFact({id: "f5", tick: 9, instant: 900n, text: "天文社在楼顶架起了望远镜。", subjectIds: ["su-003"], meta: {channel: "group"}});

    const old = await memory.setState({subjectId: "su-001", topic: "对我的态度", view: "疑似讨厌我。", sinceTick: 2, sinceInstant: 200n});
    await memory.invalidateState(old.id, 6, 600n);
    await memory.setState({subjectId: "su-001", topic: "对我的态度", view: "只是怕生。", sinceTick: 6, sinceInstant: 600n});
}

async function openWith(store: IndexStorePort): Promise<NbMemory> {
    const memory = await NbMemory.open({storage: new MemStorage(), embedder: new CountingEmbed(), indexStore: store});
    await seed(memory);
    return memory;
}

/** 过滤组合矩阵：既覆盖会被下推的维度，也覆盖只能靠 JS 过滤的维度 */
const FILTER_MATRIX: Array<{name: string; opts: MemorySearchOptions}> = [
    {name: "无过滤", opts: {}},
    {name: "asOfTick 早", opts: {asOfTick: 2}},
    {name: "asOfTick 中", opts: {asOfTick: 6}},
    {name: "asOfTick 晚", opts: {asOfTick: 99}},
    {name: "asOfInstant 早", opts: {asOfInstant: 100n}},
    {name: "asOfInstant 晚", opts: {asOfInstant: 9999n}},
    {name: "双轴同时", opts: {asOfTick: 5, asOfInstant: 500n}},
    {name: "tickRange", opts: {tickRange: [3, 7]}},
    {name: "instantRange", opts: {instantRange: [50n, 300n]}},
    {name: "sources=state", opts: {sources: ["state"]}},
    {name: "sources=fact", opts: {sources: ["fact"]}},
    {name: "subjectIds 单个", opts: {subjectIds: ["su-001"]}},
    {name: "subjectIds 多个", opts: {subjectIds: ["su-002", "su-003"]}},
    {name: "subjectGroups 主体对", opts: {subjectGroups: [["su-001"], ["su-002"]]}},
    {name: "subjectGroups 空组", opts: {subjectGroups: [[]]}},
    {name: "subjectTypes", opts: {subjectTypes: ["faction"]}},
    {name: "meta 等值", opts: {meta: {channel: "group"}}},
    {name: "meta any-of", opts: {meta: {channel: ["group", "dm"]}}},
    {name: "meta + asOfTick", opts: {meta: {channel: "group"}, asOfTick: 4}},
    {name: "subjectIds + asOfTick", opts: {subjectIds: ["su-001"], asOfTick: 4}},
    {name: "limit 收紧", opts: {limit: 2}},
];

const QUERIES = ["小雪对我的态度如何？", "天文社", "橡皮", "观星 望远镜", "完全无关的查询词"];

describe("存储实现差分", () => {
    test("任意过滤组合下 SQLite 与内存实现结果逐位一致", async () => {
        const memoryStore = await openWith(new MemoryIndexStore());
        const sqliteStore = await openWith(await openSqlite(tempDb(), "mock/256", DECLARED_META));

        for (const query of QUERIES) {
            for (const {name, opts} of FILTER_MATRIX) {
                const fromMemory = await memoryStore.search(query, opts);
                const fromSqlite = await sqliteStore.search(query, opts);
                const label = `${query} / ${name}`;
                // 顺序也必须一致：RRF 排名受存活集影响，任何过滤差异都会在这里显形
                expect({[label]: fromSqlite.map((hit) => hit.refId)})
                    .toEqual({[label]: fromMemory.map((hit) => hit.refId)});
                expect({[label]: fromSqlite.map((hit) => hit.text)})
                    .toEqual({[label]: fromMemory.map((hit) => hit.text)});
            }
        }
    });

    test("扩展字段声明与否只影响下推，不影响结果", async () => {
        const declaredStore = await openSqlite(tempDb(), "mock/256", DECLARED_META);
        const undeclaredStore = await openSqlite(tempDb());
        const declared = await openWith(declaredStore);
        const undeclared = await openWith(undeclaredStore);

        // 先直接断言下推真的接上了——下推没生效结果也一样，正确性断言拦不住它
        expect(declaredStore.pushdownKeys.sort()).toEqual(["channel", "speaker"]);
        expect(undeclaredStore.pushdownKeys).toEqual([]);
        // 条目要先落进索引（NbMemory 惰性 flush）才谈得上比较读回行数
        await declared.stats();
        await undeclared.stats();
        // 下推确实缩小了读回行数（声明侧只读回命中行，未声明侧读回全表）
        const filtered = {meta: {channel: "group"}} as const;
        expect((await declaredStore.candidates(filtered)).length)
            .toBeLessThan((await undeclaredStore.candidates(filtered)).length);

        for (const {name, opts} of FILTER_MATRIX.filter((item) => item.opts.meta !== undefined)) {
            const a = await declared.search("团建 天文社 头发", opts);
            const b = await undeclared.search("团建 天文社 头发", opts);
            expect({[name]: a.map((hit) => hit.refId)}).toEqual({[name]: b.map((hit) => hit.refId)});
        }
    });

    test("条目字段跨 SQLite roundtrip 无损（含 bigint 与扩展字段）", async () => {
        const store = await openSqlite(tempDb());
        const memory = await openWith(store);
        const hits = await memory.search("小雪", {asOfTick: 99});

        const f1 = hits.find((hit) => hit.refId === "f1")!;
        expect(f1.instant).toBe(100n);
        expect(f1.meta).toEqual({channel: "group", speaker: "我"});
        expect(f1.subjectIds).toEqual(["su-001"]);
        const f4 = hits.find((hit) => hit.refId === "f4")!;
        expect(f4.instant).toBeUndefined();
        expect(f4.meta).toBeUndefined();
    });
});

describe("向量持久化", () => {
    test("重开复用已落盘向量，不重新嵌入", async () => {
        const file = tempDb();
        const storage = new MemStorage();

        const firstEmbed = new CountingEmbed();
        const first = await NbMemory.open({
            storage, embedder: firstEmbed,
            indexStore: await openSqlite(file),
        });
        await seed(first);
        await first.flush();
        expect(firstEmbed.texts).toBeGreaterThan(0);

        // 同一份 jsonl + 同一个 sqlite 重开：条目都已在索引里，不该再嵌入任何正文
        const secondEmbed = new CountingEmbed();
        const second = await NbMemory.open({
            storage, embedder: secondEmbed,
            indexStore: await openSqlite(file),
        });
        const stats = await second.stats();
        expect(stats.entries).toBe((await first.stats()).entries);
        expect(stats.pendingVectors).toBe(0);
        expect(secondEmbed.texts).toBe(0);

        // 检索只付一次 query 嵌入（约 10 个子查询复用同一个查询向量）
        await second.search("小雪对我的态度如何？");
        expect(secondEmbed.calls).toBe(1);
    });

    test("换 embedding 模型：清空向量渐进重嵌，不报错也不清空记忆", async () => {
        const file = tempDb();
        const storage = new MemStorage();
        const first = await NbMemory.open({
            storage, embedder: new CountingEmbed(),
            indexStore: await openSqlite(file),
        });
        await seed(first);
        await first.flush();
        const before = await first.stats();

        const changed = new CountingEmbed();
        const second = await NbMemory.open({
            storage, embedder: changed,
            indexStore: await openSqlite(file, "other/1024"),
        });
        const stats = await second.stats();
        // 条目一条不少，只是向量待重嵌
        expect(stats.entries).toBe(before.entries);
        expect(stats.pendingVectors).toBe(before.entries);

        let filled = 0;
        for (let round = 0; round < 10; round++) {
            const n = await second.backfillVectors(3);
            if (n === 0) break;
            filled += n;
        }
        expect(filled).toBe(before.entries);
        expect((await second.stats()).pendingVectors).toBe(0);
    });
});

describe("真实盘上路径（FsStorage jsonl + SQLite 索引）", () => {
    /**
     * 其余用例全走 MemStorage，磁盘上的 jsonl 与 sqlite 组合没人覆盖过。
     * 这一条同时验证「删掉 sqlite 一切照常，只是慢一次」这条纪律。
     */
    test("跨进程重开：jsonl 重放 + 向量复用；删掉 sqlite 后从 jsonl 重建", async () => {
        const dir = join(tempRoot, "fs-roundtrip");
        const dbFile = join(dir, "index.sqlite");
        // 本用例要中途删库文件，因此自己管句柄，不进全局 opened
        // （去动全局会连带关掉别的用例的 store，行为依赖 describe 执行顺序）
        // FsStorage.open 负责建目录，必须先于 SQLite 打开文件
        const openStorage = () => FsStorage.open(dir);
        const open = () => SqliteIndexStore.open({file: dbFile, modelKey: "mock/256"});

        const firstEmbed = new CountingEmbed();
        const firstStorage = await openStorage();
        const firstStore = await open();
        const first = await NbMemory.open({storage: firstStorage, embedder: firstEmbed, indexStore: firstStore});
        await seed(first);
        await first.flush();
        const before = await first.stats();
        expect(before.entries).toBeGreaterThan(0);
        await firstStore.close();

        // 重开：jsonl 重放出四个 store，向量从 sqlite 复用，一条正文都不重嵌
        const secondEmbed = new CountingEmbed();
        const secondStore = await open();
        const second = await NbMemory.open({storage: await FsStorage.open(dir), embedder: secondEmbed, indexStore: secondStore});
        expect(second.facts.all.map((f) => f.id)).toEqual(first.facts.all.map((f) => f.id));
        expect(second.registry.all).toEqual(first.registry.all);
        expect((await second.stats()).pendingVectors).toBe(0);
        expect(secondEmbed.texts).toBe(0);
        await secondStore.close();

        // 删掉派生索引：jsonl 是唯一事实源，内容一条不少，只是要重嵌一次
        rmSync(dbFile, {force: true});
        const thirdEmbed = new CountingEmbed();
        const thirdStore = await open();
        const third = await NbMemory.open({storage: await FsStorage.open(dir), embedder: thirdEmbed, indexStore: thirdStore});
        const rebuilt = await third.stats();
        expect(rebuilt.entries).toBe(before.entries);
        expect(thirdEmbed.texts).toBe(before.entries);
        expect((await third.search("小雪对我的态度如何？")).length).toBeGreaterThan(0);
        await thirdStore.close();
    });
});

describe("延迟嵌入的优雅降级", () => {    test("向量未就绪时字面路照常召回，补齐后语义路加入", async () => {
        const embed = new CountingEmbed();
        const memory = await NbMemory.open({
            storage: new MemStorage(), embedder: embed,
            indexStore: await openSqlite(tempDb()),
            deferEmbedding: true,
        });
        await seed(memory);

        const stats = await memory.stats();
        expect(stats.pendingVectors).toBe(stats.entries);
        // 摄入路径上一条正文都没嵌入
        expect(embed.texts).toBe(0);

        // 字面路仍能靠专名命中——这是双路架构白送的降级能力
        const degraded = await memory.search("天文社");
        expect(degraded.some((hit) => hit.refId === "f5")).toBe(true);

        while (await memory.backfillVectors(2) > 0) { /* 补到空为止 */ }
        expect((await memory.stats()).pendingVectors).toBe(0);
        const full = await memory.search("天文社");
        expect(full.some((hit) => hit.refId === "f5")).toBe(true);
    });
});
