import {createClient, type Client} from "@libsql/client";

/**
 * 建库建表(schema 由模块全权管理,宿主不直接碰表)。
 *
 * 表结构与语义见 GOAL 契约:
 * - operation_log:正常操作 append-only；只允许 retention prune 与显式 path purge 删除
 * - file_snapshot:内容寻址快照,body NULL = 超限/二进制只记账
 * - session_cursor:每会话「已见位点」,updated_at 供保留策略判断活跃
 * - file_acceptance:每(用户,路径)「已接受位点」
 */
const SCHEMA_DDL = `
CREATE TABLE IF NOT EXISTS operation_log (
    id                 INTEGER PRIMARY KEY AUTOINCREMENT,
    occurred_at        TEXT    NOT NULL,
    actor_kind         TEXT    NOT NULL,
    actor_user_id      TEXT,
    actor_session_id   TEXT,
    actor_source       TEXT,
    op_type            TEXT    NOT NULL,
    path               TEXT    NOT NULL,
    from_path          TEXT,
    before_hash        TEXT,
    after_hash         TEXT,
    reverted_entry_ids TEXT,
    source_entry_id    INTEGER
);
CREATE INDEX IF NOT EXISTS idx_oplog_path    ON operation_log(path, id);
CREATE INDEX IF NOT EXISTS idx_oplog_session ON operation_log(actor_session_id, id);
CREATE INDEX IF NOT EXISTS idx_oplog_renames ON operation_log(id) WHERE op_type = 'file.rename';
CREATE INDEX IF NOT EXISTS idx_oplog_from_path ON operation_log(from_path, id) WHERE from_path IS NOT NULL;

CREATE TABLE IF NOT EXISTS file_snapshot (
    hash       TEXT    PRIMARY KEY,
    body       BLOB,
    byte_size  INTEGER NOT NULL,
    created_at TEXT    NOT NULL
);

CREATE TABLE IF NOT EXISTS session_cursor (
    session_id         TEXT    PRIMARY KEY,
    last_seen_entry_id INTEGER NOT NULL,
    updated_at         TEXT    NOT NULL
);

CREATE TABLE IF NOT EXISTS file_acceptance (
    user_id            TEXT    NOT NULL,
    path               TEXT    NOT NULL,
    accepted_entry_id  INTEGER NOT NULL,
    updated_at         TEXT    NOT NULL,
    PRIMARY KEY (user_id, path)
);
`;

/** libsql 的 file URL 要求正斜杠(Windows 反斜杠路径需转换)。 */
function fileUrl(databasePath: string): string {
    return `file:${databasePath.replace(/\\/g, "/")}`;
}

/** 打开写连接:WAL 模式 + 建表。databasePath 用绝对路径。 */
export async function openDatabase(databasePath: string): Promise<Client> {
    const client = createClient({url: fileUrl(databasePath)});
    await client.execute("PRAGMA journal_mode = WAL;");
    await client.executeMultiple(SCHEMA_DDL);
    return client;
}

/**
 * 打开独立读连接(WAL 一写多读的标准形态):查询走它,读事务不会与写连接上的
 * 写事务在同一连接里互撞(单连接嵌套 BEGIN 会报错)。journal_mode 随库持久,无需重设。
 */
export function openReader(databasePath: string): Client {
    return createClient({url: fileUrl(databasePath)});
}
