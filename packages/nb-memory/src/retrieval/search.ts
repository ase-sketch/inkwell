/**
 * 检索：语义（embedding 余弦）+ 字面（BM25，见 bm25.ts）双路 RRF 融合
 * + 双时间轴过滤 + subjectId / 扩展字段过滤（过滤对两路同等生效）。
 *
 * 条目与向量落 IndexStorePort（内存或 SQLite）；BM25 倒排始终在内存、从 store
 * 的文本重建——倒排比向量小两个数量级，重建是纯 CPU 零 API 调用，没必要落盘。
 * 余弦截断阈值与主仓 subject-rag-index / bench VecStore 同款（1.15）。
 *
 * 红线：**先过滤再算距离与截断**，不做「超采后过滤」的近似——否则被过滤掉的
 * 未来片段会先占掉名额，剩下的才轮到正确证据（时间泄漏率 0% 的来源）。
 * store 只做超集粗筛，`passesFilter` 是全库唯一一份权威过滤实现。
 */
import type {EmbedPort} from "../ports/ports";
import type {IndexRow, IndexStorePort} from "../ports/index-store";
import type {FactMeta, FactMetaValue} from "../core/types";
import {Bm25Index} from "./bm25";

/** 归一化余弦距离截断阈值（主仓同款） */
export const NORMALIZED_DISTANCE_CUTOFF = 1.15;

/** 一条可检索条目（facts 与 state 共用此形状进索引） */
export interface IndexEntry {
    /** 来源记录 id（fact id / state id），失效标记双写与审计溯源用 */
    refId: string;
    text: string;
    /** 摄入序；as-of 知识边界过滤按它算。state 条目用 sinceTick */
    tick: number;
    /** 故事时间（秒）；为空表示来源未提供，此时不参与故事时间轴查询 */
    instant?: bigint;
    /** 故事时间的人读原文标记（回流展示用）；为空表示来源未提供 */
    time?: string;
    /**
     * 来源层。
     *
     * - `fact` / `state`：叙事内容，检索的主体。
     * - `subject`：主体的本体描述（每个 ontology 版本一条），供「按描述解主体」用。
     *   它不是叙事内容，**默认不该混进内容检索结果**——调用方要显式 `sources: ["subject"]`。
     * - `registry`：门面注入的主体卡，不进索引（只作为 `SearchHit.source` 出现）。
     */
    source: "fact" | "state" | "subject" | "registry";
    /** 归一后的关键主体 id；空数组 = 无 */
    subjectIds: string[];
    /** state 与 subject 条目：失效时点（摄入序）；为空表示未失效。subject 条目的失效 = 下一版 ontology 生效 */
    invalidatedAtTick?: number;
    /** state 与 subject 条目：失效时点（故事时间）；为空表示未失效或来源未提供 */
    invalidatedAtInstant?: bigint;
    /** 扩展字段；为空表示来源未提供 */
    meta?: FactMeta;
}

/** 检索命中 */
export interface SearchHit extends IndexEntry {
    /** RRF 融合分（只用于排序，无绝对语义） */
    score: number;
}

/**
 * 扩展字段过滤：key 全部满足才通过（AND）；值为数组时该 key 取 any-of。
 * 条目缺该 key 一律不通过——「没标记」不等于「标记为假」。
 */
export type MetaFilter = Record<string, FactMetaValue | FactMetaValue[]>;

/** 检索选项 */
export interface SearchOptions {
    /**
     * 知识边界截止（摄入序轴）：只召回 tick <= asOfTick，
     * state 条目还要求「当时未失效」。
     */
    asOfTick?: number;
    /**
     * 世界状态截止（故事时间轴）：只召回 instant <= asOfInstant，
     * state 条目还要求当时未失效。**无 instant 的条目一律不通过**——
     * 故事时间未知的内容无法被安放进故事时间窗口，宁可漏召回也不泄漏。
     */
    asOfInstant?: bigint;
    /** 摄入序窗口 [from, to]（闭区间）。纯窗口过滤，不承载失效语义 */
    tickRange?: [number, number];
    /** 故事时间窗口 [from, to]（闭区间）。无 instant 的条目不通过 */
    instantRange?: [bigint, bigint];
    /** 只召回涉及任一给定主体的条目（any 语义） */
    subjectIds?: string[];
    /**
     * 主体组过滤（all-of-groups 语义）：条目须与**每一组**都相交。
     * 「边 = 按 id 对查」的派生视图查询路径：两组各放一个主体的等价 id 集，
     * 命中的就是同时涉及两主体的关系事实。
     */
    subjectGroups?: string[][];
    /** 只召回给定来源层的条目（如只要 state）；为空表示不限 */
    sources?: Array<IndexEntry["source"]>;
    /**
     * 关掉字面路，只走语义路（默认 false）。
     *
     * 给「按描述解主体」用。字面路的价值是专名召回——补语义盲区——而按描述解主体
     * 这条路上恰恰**没有专名**（有专名就走 mentionedIn 字面匹配了），字面路在这里
     * 只剩噪声：CJK bigram 会让「银发的剑士」和「戴兜帽的陌生人」因为共享一个「的」
     * 而互相召回。而解主体对错解的容忍度远低于普通检索——**解错会把后续整跳锚到
     * 错误主体，比解不出更糟**，所以这条路 fail-closed，宁可空手而归。
     */
    semanticOnly?: boolean;
    /** 扩展字段过滤；为空表示不限 */
    meta?: MetaFilter;
    /** 返回条数上限；缺省 10（对齐 bench baseline 的 6+4 总量） */
    limit?: number;
}

/** RRF 融合常数（标准取值；对分数尺度不敏感，无需调权） */
const RRF_K = 60;

/** 检索索引：语义 + 字面双路，RRF 融合 */
export class SemanticIndex {
    private readonly bm25 = new Bm25Index();
    /** 与 BM25 文档编号平行的 refId 表（文档编号 = 加入顺序） */
    private readonly bm25RefIds: string[] = [];
    private bm25Ready = false;

    constructor(private readonly embedder: EmbedPort, private readonly store: IndexStorePort) {}

    /** 条目总数 */
    async count(): Promise<number> {
        return this.store.count();
    }

    /** 全部已入索引的 refId——门面用它判断哪些派生条目（如主体描述）还没同步 */
    async refIds(): Promise<string[]> {
        return (await this.store.texts()).map((row) => row.refId);
    }

    /** 尚未嵌入向量的条目数（>0 表示语义路当前处于降级状态） */
    async pendingVectorCount(): Promise<number> {
        return this.store.pendingCount();
    }

    /** 批量嵌入并加入索引 */
    async add(items: IndexEntry[]): Promise<void> {
        if (items.length === 0) return;
        const vectors = await this.embedder.embed(items.map((item) => item.text));
        await this.store.add(items.map((entry, i) => ({entry, vector: vectors[i]!})));
        this.appendLiteral(items);
    }

    /**
     * 只落库不嵌入：字面路立即可召回，语义路等 `backfillVectors` 补齐。
     * 摄入路径用它把 embedding 成本移出关键路径——优雅降级是双路架构白送的。
     */
    async addDeferred(items: IndexEntry[]): Promise<void> {
        if (items.length === 0) return;
        await this.store.add(items.map((entry) => ({entry, vector: null})));
        this.appendLiteral(items);
    }

    /**
     * 补齐尚未嵌入的向量，按 tick 倒序（新内容更可能被查）。返回本次补齐条数。
     * 后台循环调用直到返回 0 即可；中途失败不影响已落库的条目。
     */
    async backfillVectors(limit = 256): Promise<number> {
        const pending = await this.store.pendingVectors(limit);
        if (pending.length === 0) return 0;
        const vectors = await this.embedder.embed(pending.map((row) => row.entry.text));
        await this.store.setVectors(pending.map((row, i) => ({refId: row.entry.refId, vector: vectors[i]!})));
        return pending.length;
    }

    /** 嵌入查询文本：门面一次算好、多个子查询复用，避免同一 query 重复调用 embedding */
    async embedQuery(query: string): Promise<number[]> {
        return (await this.embedder.embed([query]))[0]!;
    }

    /** 更新某 state 条目的失效标记（索引是派生物，重建时自然一致） */
    async markStateInvalidated(refId: string, atTick: number, atInstant?: bigint): Promise<void> {
        await this.store.markInvalidated(refId, atTick, atInstant);
    }

    /**
     * 双路精确检索 + RRF 融合。
     * 语义路保留余弦截断；字面路不受语义截断影响（专名召回正是要补语义盲区）；
     * 全部过滤对两路同等生效（as-of 红线不因字面路开口）。
     *
     * @param queryVector 已算好的查询向量；为空则内部算一次
     */
    async search(query: string, opts?: SearchOptions, queryVector?: number[]): Promise<SearchHit[]> {
        await this.ensureLiteral();
        // store 只做超集粗筛，这里才是权威过滤
        const survivors = (await this.store.candidates(opts)).filter((row) => passesFilter(row.entry, opts));
        if (survivors.length === 0) return [];
        const queryVec = queryVector ?? await this.embedQuery(query);

        // 语义路：过滤 + 截断后按相似度排名；尚未嵌入的行跳过（降级而非报错）
        const semantic: Array<{refId: string; sim: number}> = [];
        for (const row of survivors) {
            if (row.vector === null) continue;
            const distance = 1 - dot(queryVec, row.vector);
            if (distance > NORMALIZED_DISTANCE_CUTOFF) continue;
            semantic.push({refId: row.entry.refId, sim: 1 - distance});
        }
        semantic.sort((a, b) => b.sim - a.sim);

        // 字面路：BM25 得分 >0 且过同一套过滤（存活集即过滤结果，不另算一遍）
        // semanticOnly 时整条跳过——见 SearchOptions.semanticOnly 的理由
        const alive = new Map(survivors.map((row: IndexRow) => [row.entry.refId, row.entry]));
        const literal = (opts?.semanticOnly ?? false) ? [] : [...this.bm25.scores(query)]
            .map(([doc, score]) => [this.bm25RefIds[doc]!, score] as const)
            .filter(([refId]) => alive.has(refId))
            .sort((a, b) => b[1] - a[1]);

        // RRF 融合
        const fused = new Map<string, number>();
        semantic.forEach(({refId}, rank) => fused.set(refId, (fused.get(refId) ?? 0) + 1 / (RRF_K + rank + 1)));
        literal.forEach(([refId], rank) => fused.set(refId, (fused.get(refId) ?? 0) + 1 / (RRF_K + rank + 1)));

        return [...fused.entries()]
            .sort((a, b) => b[1] - a[1])
            .slice(0, opts?.limit ?? 10)
            .map(([refId, score]) => ({...alive.get(refId)!, score}));
    }

    /** 增量维护倒排；尚未初始化时跳过——ensureLiteral 会从 store 一次性读全 */
    private appendLiteral(items: IndexEntry[]): void {
        if (!this.bm25Ready) return;
        for (const item of items) {
            this.bm25.add(item.text);
            this.bm25RefIds.push(item.refId);
        }
    }

    /** 首次检索时从 store 重建倒排（纯 CPU，无 API 调用） */
    private async ensureLiteral(): Promise<void> {
        if (this.bm25Ready) return;
        for (const {refId, text} of await this.store.texts()) {
            this.bm25.add(text);
            this.bm25RefIds.push(refId);
        }
        this.bm25Ready = true;
    }
}

/**
 * 全部过滤判据（截断前过滤，不做超采再截的近似）。**全库唯一一份权威实现**：
 * store 侧的 SQL 下推只允许放宽（返回超集），绝不允许自成一套判据。
 *
 * 两条时间轴各自独立成立、同为 AND：`asOfTick` 管知识边界，`asOfInstant`
 * 管世界状态。两者都缺省时才回落到「当前认知口径」（已失效 state 不召回）——
 * 否则按故事时间轴回溯时会被摄入序轴的默认口径误杀。
 */
export function passesFilter(entry: IndexEntry, opts?: SearchOptions): boolean {
    // 主体描述条目是「解主体」用的索引，不是叙事内容——必须显式点名才召回，
    // 否则每次普通检索都会被一堆本体描述挤占（且它们对答题模型是噪声）。
    if (entry.source === "subject" && !(opts?.sources?.includes("subject") ?? false)) return false;
    if (opts?.asOfTick === undefined && opts?.asOfInstant === undefined) {
        if (entry.invalidatedAtTick !== undefined) return false;
    }
    if (opts?.asOfTick !== undefined) {
        if (entry.tick > opts.asOfTick) return false;
        if (entry.invalidatedAtTick !== undefined && entry.invalidatedAtTick <= opts.asOfTick) return false;
    }
    if (opts?.asOfInstant !== undefined) {
        if (entry.instant === undefined) return false;
        if (entry.instant > opts.asOfInstant) return false;
        if (entry.invalidatedAtInstant !== undefined && entry.invalidatedAtInstant <= opts.asOfInstant) return false;
    }
    if (opts?.tickRange !== undefined) {
        if (entry.tick < opts.tickRange[0] || entry.tick > opts.tickRange[1]) return false;
    }
    if (opts?.instantRange !== undefined) {
        if (entry.instant === undefined) return false;
        if (entry.instant < opts.instantRange[0] || entry.instant > opts.instantRange[1]) return false;
    }
    if (opts?.sources !== undefined && !opts.sources.includes(entry.source)) return false;
    if (opts?.subjectIds !== undefined && opts.subjectIds.length > 0) {
        if (!entry.subjectIds.some((id) => opts.subjectIds!.includes(id))) return false;
    }
    if (opts?.subjectGroups !== undefined) {
        for (const group of opts.subjectGroups) {
            if (!entry.subjectIds.some((id) => group.includes(id))) return false;
        }
    }
    if (opts?.meta !== undefined) {
        for (const [key, expected] of Object.entries(opts.meta)) {
            const actual = entry.meta?.[key];
            if (actual === undefined) return false;
            if (Array.isArray(expected) ? !expected.includes(actual) : actual !== expected) return false;
        }
    }
    return true;
}

/** 点积（两向量应等长且已归一化） */
function dot(a: number[], b: number[]): number {
    const n = Math.min(a.length, b.length);
    let sum = 0;
    for (let i = 0; i < n; i++) sum += a[i]! * b[i]!;
    return sum;
}
