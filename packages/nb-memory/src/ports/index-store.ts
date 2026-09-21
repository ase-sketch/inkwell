/**
 * 索引存储端口：条目行 + 向量的持久化。
 *
 * ## 红线：下推谓词只能放宽，不能收紧
 *
 * `candidates()` 允许返回**超集**——它只负责减少读回的行数，权威判据永远是
 * `retrieval/search.ts` 的 `passesFilter`（全库唯一一份过滤实现）。
 *
 * 这条不变量是刻意的：as-of 零泄漏是本库最硬的保证，而「SQL 里一份过滤、
 * JS 里另一份过滤」是让它悄悄失效的最短路径。把下推降级成纯 I/O 优化后，
 * 新增过滤维度最坏情况只是没被下推（多读几行），绝不会漏召回或泄漏。
 *
 * ## 向量可以缺席
 *
 * `vector` 为 null 表示尚未嵌入。字面路（BM25）不需要向量，所以向量没就绪时
 * 检索仍然能返回结果，只是少了语义路——优雅降级是双路架构白送的。调用方据此
 * 决定是阻塞补齐还是标记降级返回。
 */
import type {IndexEntry, SearchOptions} from "../retrieval/search";

/** 索引里的一行：条目 + 向量 */
export interface IndexRow {
    entry: IndexEntry;
    /** L2 归一化向量；null = 尚未嵌入（语义路跳过该行，字面路照常） */
    vector: number[] | null;
}

/** 索引存储端口 */
export interface IndexStorePort {
    /** 追加条目（已存在的 refId 覆盖） */
    add(rows: IndexRow[]): Promise<void>;

    /**
     * 粗筛候选行。**允许返回超集**，不允许漏——精确判据由调用方的
     * `passesFilter` 负责（见文件头红线）。
     */
    candidates(opts?: SearchOptions): Promise<IndexRow[]>;

    /** 按插入序返回全部条目的文本（BM25 倒排重建用；倒排是纯 CPU 派生物，不落盘） */
    texts(): Promise<Array<{refId: string; text: string}>>;

    /** 回填向量 */
    setVectors(items: Array<{refId: string; vector: number[]}>): Promise<void>;

    /** 尚未嵌入向量的条目，按 tick 倒序（新内容更可能被查，优先补） */
    pendingVectors(limit: number): Promise<IndexRow[]>;

    /** 尚未嵌入向量的条目数（>0 表示语义路处于降级状态） */
    pendingCount(): Promise<number>;

    /** 更新 state 条目的失效标记 */
    markInvalidated(refId: string, atTick: number, atInstant?: bigint): Promise<void>;

    /** 条目总数 */
    count(): Promise<number>;

    /** 释放底层资源（内存实现为空操作） */
    close(): Promise<void>;
}

/**
 * 内存索引存储：单测、离线冒烟与浏览器宿主用。
 * 语义与 SQLite 实现完全一致——两者由 tests/index-store.test.ts 做差分校验。
 */
export class MemoryIndexStore implements IndexStorePort {
    private readonly rows = new Map<string, IndexRow>();

    async add(rows: IndexRow[]): Promise<void> {
        for (const row of rows) this.rows.set(row.entry.refId, row);
    }

    /** 内存实现不做下推，直接给全集——超集是合法返回 */
    async candidates(_opts?: SearchOptions): Promise<IndexRow[]> {
        return [...this.rows.values()];
    }

    async texts(): Promise<Array<{refId: string; text: string}>> {
        return [...this.rows.values()].map((row) => ({refId: row.entry.refId, text: row.entry.text}));
    }

    async setVectors(items: Array<{refId: string; vector: number[]}>): Promise<void> {
        for (const item of items) {
            const row = this.rows.get(item.refId);
            if (row) row.vector = item.vector;
        }
    }

    async pendingVectors(limit: number): Promise<IndexRow[]> {
        return [...this.rows.values()]
            .filter((row) => row.vector === null)
            .sort((a, b) => b.entry.tick - a.entry.tick)
            .slice(0, limit);
    }

    async pendingCount(): Promise<number> {
        return [...this.rows.values()].filter((row) => row.vector === null).length;
    }

    async markInvalidated(refId: string, atTick: number, atInstant?: bigint): Promise<void> {
        const row = this.rows.get(refId);
        if (!row) return;
        row.entry.invalidatedAtTick = atTick;
        if (atInstant !== undefined) row.entry.invalidatedAtInstant = atInstant;
    }

    async count(): Promise<number> {
        return this.rows.size;
    }

    async close(): Promise<void> {
        // 内存实现无资源可释放
    }
}
