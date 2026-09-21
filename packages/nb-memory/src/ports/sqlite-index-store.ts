/**
 * SQLite 索引存储：向量以 Float32 BLOB 存在普通列上，过滤走 SQL，
 * 精确余弦在 JS 里对**已过滤存活集**计算。
 *
 * ## 为什么不用向量虚表（vec0 之类）
 *
 * 本库的查询几乎永远带过滤：一次 search 实际发出「1 次主查询 + 每个提及主体
 * 2 次单主体查询 + 主体对查询」，其中大多数是重过滤、候选集只有几十条。
 * 这种负载下先过滤再精确扫描的成本正比于**存活集**，而 ANN 索引无论怎么过滤
 * 都要扫全图，还得靠超采后截断来近似过滤——那正是本库明确拒绝的做法
 * （超采会让被过滤掉的未来片段先占名额，是 as-of 泄漏的经典来源）。
 *
 * 真正的瓶颈从来不是 ANN，是 embedding API 往返：旧实现每次 open 都要把全库
 * 重新嵌入一遍。持久化向量解决的是这个。
 *
 * ## 下推纪律
 *
 * 只下推**能保证是超集**的谓词：tick、source、主体 id、以及宿主**声明过**的
 * 扩展字段（走 JSON 生成列 + 索引）。
 * - `instant` 不下推：bigint 以文本列存（保证精确 roundtrip），文本比较是
 *   字典序，对不等长数字是错的。要下推得先换 INTEGER 列并验证两个 runtime
 *   的 64 位绑定行为，收益不值当——JS 侧照样能过滤。
 * - 未声明的扩展字段不下推：照样存在 meta 里，只是多读几行交给 JS 过滤。
 *
 * ## 换模型不删库
 *
 * embedding provider/model/dim 变了只把向量列清空、渐进重嵌，不报错也不要求
 * 用户清空记忆库——记忆是长期资产。（主仓 subject-rag-index 是直接报错要求
 * 删库重建，对缓存合适，对记忆不合适。）
 */
import type {IndexEntry, SearchOptions} from "../retrieval/search";
import type {FactMeta, FactMetaValue} from "../core/types";
import type {IndexRow, IndexStorePort} from "./index-store";

/** 统一的 SQLite 句柄（抹平 bun:sqlite 与 node:sqlite 的差异） */
interface SqliteHandle {
    run(sql: string, params?: unknown[]): void;
    all(sql: string, params?: unknown[]): Array<Record<string, unknown>>;
    close(): void;
}

/** 可过滤扩展字段的声明类型 */
export type MetaColumnType = "text" | "number" | "boolean";

/** 打开选项 */
export interface SqliteIndexStoreOptions {
    /** 数据库文件绝对路径 */
    file: string;
    /**
     * 当前 embedding 模型标识（provider/model/dims）。与库内记录不一致时
     * 清空向量列走渐进重嵌。
     */
    modelKey: string;
    /**
     * **声明**为可过滤的扩展字段 key → 类型（ADR 0005 D4）。
     *
     * 声明过的 key 会建成 JSON 生成列 + 索引，检索时下推到 SQL；未声明的 key
     * 照样存在 meta 里，只是不参与下推（仍由 passesFilter 在 JS 侧过滤，结果
     * 完全一样，只是多读几行）。「声明才可过滤」这条规则因此直接落成了数据库
     * 结构，不需要额外的运行时校验层。
     */
    filterableMeta?: Record<string, MetaColumnType>;
}

const SCHEMA_VERSION = "nb-memory-index-v1";

export class SqliteIndexStore implements IndexStorePort {
    private seq = 0;

    private constructor(
        private readonly db: SqliteHandle,
        /** 已建生成列的 meta key → 列名 */
        private readonly metaColumns: Map<string, string>,
    ) {}

    /** 打开（建表 + 模型一致性检查 + 声明字段生成列） */
    static async open(opts: SqliteIndexStoreOptions): Promise<SqliteIndexStore> {
        const db = await openHandle(opts.file);
        createSchema(db);
        const store = new SqliteIndexStore(db, new Map());
        store.reconcileModel(opts.modelKey);
        store.ensureMetaColumns(opts.filterableMeta ?? {});
        const row = db.all(`SELECT MAX(seq) AS maxSeq FROM entry`)[0];
        store.seq = Number(row?.maxSeq ?? 0);
        return store;
    }

    /**
     * 为声明过的扩展字段建 JSON 生成列 + 索引（幂等）。
     * 用 VIRTUAL 而非 STORED：值本来就在 meta 里，再存一份纯属冗余，
     * 而 VIRTUAL 列一样能建索引。
     */
    private ensureMetaColumns(declared: Record<string, MetaColumnType>): void {
        const existing = new Set(this.db.all(`PRAGMA table_info(entry)`).map((row) => String(row.name)));
        for (const [key, type] of Object.entries(declared)) {
            const column = `meta_${key.replace(/[^a-zA-Z0-9_]/gu, "_")}`;
            this.metaColumns.set(key, column);
            if (existing.has(column)) continue;
            const sqlType = type === "text" ? "TEXT" : "INTEGER";
            this.db.run(
                `ALTER TABLE entry ADD COLUMN "${column}" ${sqlType} GENERATED ALWAYS AS (json_extract(meta, '$.${key}')) VIRTUAL`,
            );
            this.db.run(`CREATE INDEX IF NOT EXISTS "idx_entry_${column}" ON entry ("${column}")`);
        }
    }

    /**
     * 模型一致性：不一致时清空向量列（渐进重嵌），schema 版本变了才重建表。
     * 条目行本身是从 jsonl 重放来的派生物，清空重灌永远安全。
     */
    private reconcileModel(modelKey: string): void {
        const version = this.readMeta("schemaVersion");
        if (version !== null && version !== SCHEMA_VERSION) {
            this.db.run(`DROP TABLE IF EXISTS entry_subject`);
            this.db.run(`DROP TABLE IF EXISTS entry`);
            createSchema(this.db);
        }
        const current = this.readMeta("modelKey");
        if (current !== null && current !== modelKey) {
            this.db.run(`UPDATE entry SET vector = NULL`);
        }
        this.writeMeta("schemaVersion", SCHEMA_VERSION);
        this.writeMeta("modelKey", modelKey);
    }

    /**
     * 已建成生成列、因而能被下推到 SQL 的扩展字段 key。
     *
     * 诊断用：下推只是 I/O 优化，**没生效也不会影响结果**（JS 侧照样过滤），
     * 所以正确性测试拦不住「下推悄悄失效」。这个 getter 让它可被直接断言。
     */
    get pushdownKeys(): string[] {
        return [...this.metaColumns.keys()];
    }

    async add(rows: IndexRow[]): Promise<void> {
        for (const row of rows) {
            const {entry, vector} = row;
            this.seq += 1;
            this.db.run(
                `INSERT INTO entry (ref_id, source, tick, instant, time, text, invalidated_at_tick, invalidated_at_instant, meta, vector, seq)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                 ON CONFLICT(ref_id) DO UPDATE SET
                   source = excluded.source, tick = excluded.tick, instant = excluded.instant,
                   time = excluded.time, text = excluded.text,
                   invalidated_at_tick = excluded.invalidated_at_tick,
                   invalidated_at_instant = excluded.invalidated_at_instant,
                   meta = excluded.meta, vector = excluded.vector`,
                [
                    entry.refId,
                    entry.source,
                    entry.tick,
                    entry.instant === undefined ? null : entry.instant.toString(),
                    entry.time ?? null,
                    entry.text,
                    entry.invalidatedAtTick ?? null,
                    entry.invalidatedAtInstant === undefined ? null : entry.invalidatedAtInstant.toString(),
                    entry.meta === undefined ? null : JSON.stringify(entry.meta),
                    vector === null ? null : encodeVector(vector),
                    this.seq,
                ],
            );
            this.db.run(`DELETE FROM entry_subject WHERE ref_id = ?`, [entry.refId]);
            for (const subjectId of new Set(entry.subjectIds)) {
                this.db.run(`INSERT OR IGNORE INTO entry_subject (ref_id, subject_id) VALUES (?, ?)`, [entry.refId, subjectId]);
            }
        }
    }

    async candidates(opts?: SearchOptions): Promise<IndexRow[]> {
        const where: string[] = [];
        const args: unknown[] = [];
        if (opts?.asOfTick !== undefined) {
            where.push(`tick <= ?`);
            args.push(opts.asOfTick);
        }
        if (opts?.tickRange !== undefined) {
            where.push(`tick >= ? AND tick <= ?`);
            args.push(opts.tickRange[0], opts.tickRange[1]);
        }
        if (opts?.sources !== undefined && opts.sources.length > 0) {
            where.push(`source IN (${placeholders(opts.sources.length)})`);
            args.push(...opts.sources);
        }
        // subjectIds 是 any 语义、subjectGroups 是 all-of：后者每组各下推一条 EXISTS，
        // 恰好等价于「与每一组都相交」，不是放宽也不是收紧。
        const idSets: string[][] = [];
        if (opts?.subjectIds !== undefined && opts.subjectIds.length > 0) idSets.push(opts.subjectIds);
        if (opts?.subjectGroups !== undefined) idSets.push(...opts.subjectGroups);
        for (const ids of idSets) {
            if (ids.length === 0) {
                // 空组：没有任何条目能与空集相交（与 passesFilter 同口径）
                where.push(`1 = 0`);
                continue;
            }
            where.push(`EXISTS (SELECT 1 FROM entry_subject s WHERE s.ref_id = entry.ref_id AND s.subject_id IN (${placeholders(ids.length)}))`);
            args.push(...ids);
        }
        // 扩展字段：只下推**声明过**的 key（有生成列 + 索引）；未声明的 key
        // 交给 JS 侧 passesFilter，结果一样，只是多读几行
        if (opts?.meta !== undefined) {
            for (const [key, expected] of Object.entries(opts.meta)) {
                const column = this.metaColumns.get(key);
                if (column === undefined) continue;
                const values = (Array.isArray(expected) ? expected : [expected]).map(toSqlMeta);
                where.push(`"${column}" IN (${placeholders(values.length)})`);
                args.push(...values);
            }
        }
        const clause = where.length > 0 ? ` WHERE ${where.join(" AND ")}` : "";
        const rows = this.db.all(`SELECT * FROM entry${clause} ORDER BY seq`, args);
        return rows.map((row) => this.toRow(row));
    }

    async texts(): Promise<Array<{refId: string; text: string}>> {
        return this.db.all(`SELECT ref_id, text FROM entry ORDER BY seq`).map((row) => ({
            refId: String(row.ref_id),
            text: String(row.text),
        }));
    }

    async setVectors(items: Array<{refId: string; vector: number[]}>): Promise<void> {
        for (const item of items) {
            this.db.run(`UPDATE entry SET vector = ? WHERE ref_id = ?`, [encodeVector(item.vector), item.refId]);
        }
    }

    async pendingVectors(limit: number): Promise<IndexRow[]> {
        const rows = this.db.all(`SELECT * FROM entry WHERE vector IS NULL ORDER BY tick DESC LIMIT ?`, [limit]);
        return rows.map((row) => this.toRow(row));
    }

    async pendingCount(): Promise<number> {
        return Number(this.db.all(`SELECT COUNT(*) AS n FROM entry WHERE vector IS NULL`)[0]?.n ?? 0);
    }

    async markInvalidated(refId: string, atTick: number, atInstant?: bigint): Promise<void> {
        this.db.run(
            `UPDATE entry SET invalidated_at_tick = ?, invalidated_at_instant = COALESCE(?, invalidated_at_instant) WHERE ref_id = ?`,
            [atTick, atInstant === undefined ? null : atInstant.toString(), refId],
        );
    }

    async count(): Promise<number> {
        return Number(this.db.all(`SELECT COUNT(*) AS n FROM entry`)[0]?.n ?? 0);
    }

    async close(): Promise<void> {
        this.db.close();
    }

    private readMeta(key: string): string | null {
        const row = this.db.all(`SELECT value FROM index_meta WHERE key = ?`, [key])[0];
        return row === undefined ? null : String(row.value);
    }

    private writeMeta(key: string, value: string): void {
        this.db.run(
            `INSERT INTO index_meta (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
            [key, value],
        );
    }

    /** SQL 行 → IndexRow（主体 id 单独查一次，条目数不大且只在候选集上发生） */
    private toRow(row: Record<string, unknown>): IndexRow {
        const refId = String(row.ref_id);
        const subjectIds = this.db.all(`SELECT subject_id FROM entry_subject WHERE ref_id = ?`, [refId])
            .map((item) => String(item.subject_id));
        const entry: IndexEntry = {
            refId,
            text: String(row.text),
            tick: Number(row.tick),
            source: String(row.source) as IndexEntry["source"],
            subjectIds,
            ...(row.instant === null || row.instant === undefined ? {} : {instant: BigInt(String(row.instant))}),
            ...(row.time === null || row.time === undefined ? {} : {time: String(row.time)}),
            ...(row.invalidated_at_tick === null || row.invalidated_at_tick === undefined
                ? {}
                : {invalidatedAtTick: Number(row.invalidated_at_tick)}),
            ...(row.invalidated_at_instant === null || row.invalidated_at_instant === undefined
                ? {}
                : {invalidatedAtInstant: BigInt(String(row.invalidated_at_instant))}),
            ...(row.meta === null || row.meta === undefined ? {} : {meta: JSON.parse(String(row.meta)) as FactMeta}),
        };
        const blob = row.vector;
        return {entry, vector: blob === null || blob === undefined ? null : decodeVector(blob as Uint8Array)};
    }
}

/** 向量 → Float32 小端字节（4B × dim，比 JSON 浮点文本省约 5×） */
export function encodeVector(vector: number[]): Uint8Array {
    const floats = new Float32Array(vector.length);
    for (let i = 0; i < vector.length; i++) floats[i] = vector[i] ?? 0;
    return new Uint8Array(floats.buffer.slice(0));
}

/** Float32 字节 → 向量 */
export function decodeVector(bytes: Uint8Array): number[] {
    if (bytes.byteLength % 4 !== 0) throw new Error(`向量 BLOB 字节数必须是 4 的倍数，实际：${String(bytes.byteLength)}`);
    // byteOffset 未对齐时 Float32Array 视图会抛错，复制一份兜底
    const aligned = bytes.byteOffset % 4 === 0
        ? new Float32Array(bytes.buffer, bytes.byteOffset, bytes.byteLength / 4)
        : new Float32Array(bytes.slice().buffer);
    return Array.from(aligned);
}

function placeholders(n: number): string {
    return new Array(n).fill("?").join(", ");
}

/** 扩展字段值 → SQL 参数：JSON 布尔经 json_extract 取出来是 0/1 */
function toSqlMeta(value: FactMetaValue): string | number {
    return typeof value === "boolean" ? (value ? 1 : 0) : value;
}

function createSchema(db: SqliteHandle): void {
    db.run(`CREATE TABLE IF NOT EXISTS index_meta (key TEXT PRIMARY KEY, value TEXT NOT NULL)`);
    db.run(`CREATE TABLE IF NOT EXISTS entry (
        ref_id TEXT PRIMARY KEY,
        source TEXT NOT NULL,
        tick INTEGER NOT NULL,
        instant TEXT,
        time TEXT,
        text TEXT NOT NULL,
        invalidated_at_tick INTEGER,
        invalidated_at_instant TEXT,
        meta TEXT,
        vector BLOB,
        seq INTEGER NOT NULL
    )`);
    db.run(`CREATE INDEX IF NOT EXISTS idx_entry_tick ON entry (tick)`);
    db.run(`CREATE INDEX IF NOT EXISTS idx_entry_seq ON entry (seq)`);
    db.run(`CREATE TABLE IF NOT EXISTS entry_subject (
        ref_id TEXT NOT NULL,
        subject_id TEXT NOT NULL,
        PRIMARY KEY (ref_id, subject_id)
    )`);
    db.run(`CREATE INDEX IF NOT EXISTS idx_entry_subject ON entry_subject (subject_id)`);
}

/**
 * 打开 SQLite 句柄：Bun 用内置 `bun:sqlite`，Node 用内置 `node:sqlite`。
 * 两者都是 runtime 内置，**零 native 编译**——被禁的是需要 node-gyp 的
 * better-sqlite3，不是 SQLite 本身。
 *
 * 语句按 SQL 文本缓存并在 close 时逐个 finalize：既省掉每次调用重新 prepare
 * 的开销，也保证 Windows 下 close 后文件句柄真的释放（未 finalize 的语句会
 * 一直占着库文件，表现为删不掉 .sqlite）。
 */
async function openHandle(file: string): Promise<SqliteHandle> {
    const cache = new Map<string, PreparedStatement>();
    const bun = "Bun" in globalThis;
    const specifier = bun ? "bun:sqlite" : "node:sqlite";
    const module = await import(specifier) as {
        Database?: new (path: string) => SqliteDatabase;
        DatabaseSync?: new (path: string) => SqliteDatabase;
    };
    const Ctor = bun ? module.Database : module.DatabaseSync;
    if (Ctor === undefined) throw new Error(`${specifier} 未提供数据库构造器`);
    const db = new Ctor(file);
    // node:sqlite 对 INTEGER 列参数要求 BigInt，安全整数统一转一道；Bun 无此要求
    const norm = bun ? (value: unknown) => value : toNodeParam;

    const prepared = (sql: string): PreparedStatement => {
        const hit = cache.get(sql);
        if (hit !== undefined) return hit;
        const statement = db.prepare(sql);
        cache.set(sql, statement);
        return statement;
    };

    return {
        run: (sql, params = []) => { prepared(sql).run(...params.map(norm)); },
        all: (sql, params = []) => prepared(sql).all(...params.map(norm)),
        close: () => {
            for (const statement of cache.values()) statement.finalize?.();
            cache.clear();
            db.close();
        },
    };
}

/** node:sqlite 参数归一：安全整数 → BigInt */
function toNodeParam(value: unknown): unknown {
    return typeof value === "number" && Number.isSafeInteger(value) ? BigInt(value) : value;
}

interface PreparedStatement {
    run(...params: unknown[]): unknown;
    all(...params: unknown[]): Array<Record<string, unknown>>;
    /** bun:sqlite 有；node:sqlite 靠 GC，无此方法 */
    finalize?(): void;
}

interface SqliteDatabase {
    prepare(sql: string): PreparedStatement;
    close(): void;
}
