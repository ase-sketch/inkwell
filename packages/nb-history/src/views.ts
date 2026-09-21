import type {InStatement, ResultSet} from "@libsql/client";
import {operationPath, type OperationLogEntry} from "./types";
import {mapRow} from "./rows";

/**
 * 查询投影层:一份 append-only 日志投影出时间线 / 末态 / 分组视图。
 * 本层只读,不做任何写入。
 *
 * 所有函数接受最小 Sql 接口(Client 与 Transaction 都满足):多查询拼装的视图
 * 应由调用方包在读事务里传入,获得快照一致性(两条 SELECT 之间不会插进新提交)。
 */
export type Sql = {
    execute(stmt: InStatement): Promise<ResultSet>;
};

/** rename 条目的精简记录(内存中做链解析用;rename 事件数量级远小于总日志)。 */
export type RenameRecord = {id: number; fromPath: string; toPath: string};

/** 载入全部 rename 条目(升序)。链解析在内存进行(走部分索引 idx_oplog_renames)。 */
export async function loadRenames(db: Sql): Promise<RenameRecord[]> {
    const result = await db.execute("SELECT id, path, from_path FROM operation_log WHERE op_type = 'file.rename' ORDER BY id ASC");
    return result.rows.map((row) => ({
        id: Number(row["id"]),
        fromPath: String(row["from_path"]),
        toPath: String(row["path"]),
    }));
}

/** 把「entryId 时刻名为 path 的文件」的名字沿 rename 链前推到现在。 */
export function resolveCurrentName(path: string, entryId: number, renames: RenameRecord[]): string {
    let current = path;
    for (const rename of renames) {
        if (rename.id > entryId && rename.fromPath === current) {
            current = rename.toPath;
        }
    }
    return current;
}

/** 当前名为 name 的文件曾用过的全部名字(含现名;沿 rename 链回溯,maxId 严格递减保证无环)。 */
export function historicalNames(name: string, renames: RenameRecord[]): string[] {
    const names = [name];
    let current = name;
    let maxId = Number.POSITIVE_INFINITY;
    for (;;) {
        let found: RenameRecord | null = null;
        for (let i = renames.length - 1; i >= 0; i--) {
            const rename = renames[i]!;
            if (rename.id < maxId && rename.toPath === current) {
                found = rename;
                break;
            }
        }
        if (found === null) {
            return names;
        }
        current = found.fromPath;
        maxId = found.id;
        names.push(current);
    }
}

/**
 * 用户对「现名 name 的文件」的接受位点 = 其全部历史名字上的位点最大值(位点随 rename 迁移)。
 * acceptance 是该用户的 path → accepted_entry_id 全量映射(调用方一次预取)。
 */
export function acceptancePositionFor(name: string, renames: RenameRecord[], acceptance: Map<string, number>): number {
    let position = 0;
    for (const n of historicalNames(name, renames)) {
        position = Math.max(position, acceptance.get(n) ?? 0);
    }
    return position;
}

/** 载入 id > afterId 的全部条目(升序)。游标视图的原料。 */
export async function loadEntriesAfter(db: Sql, afterId: number): Promise<OperationLogEntry[]> {
    const result = await db.execute({
        sql: "SELECT * FROM operation_log WHERE id > ? ORDER BY id ASC",
        args: [afterId],
    });
    return result.rows.map(mapRow);
}

/** 按 id 单条读取。 */
export async function loadEntryById(db: Sql, id: number): Promise<OperationLogEntry | null> {
    const result = await db.execute({sql: "SELECT * FROM operation_log WHERE id = ?", args: [id]});
    const row = result.rows[0];
    return row === undefined ? null : mapRow(row);
}

/** 按 id 批量读取(分块 IN,升序)。 */
export async function loadEntriesByIds(db: Sql, ids: number[]): Promise<OperationLogEntry[]> {
    const entries: OperationLogEntry[] = [];
    for (let i = 0; i < ids.length; i += 200) {
        const chunk = ids.slice(i, i + 200);
        const placeholders = chunk.map(() => "?").join(",");
        const result = await db.execute({
            sql: `SELECT * FROM operation_log WHERE id IN (${placeholders})`,
            args: chunk,
        });
        for (const row of result.rows) {
            entries.push(mapRow(row));
        }
    }
    return entries.sort((a, b) => a.id - b.id);
}

/**
 * 载入「现名 name 的文件」的整组条目(升序):按历史名字定向查询,再按现名精确过滤
 * (历史名字可能被历代同名的其他文件用过,靠 resolveCurrentName 排除)。
 * 比全账本扫描便宜得多,供 revert / accept 用。
 */
export async function loadGroupEntries(db: Sql, name: string, renames: RenameRecord[]): Promise<OperationLogEntry[]> {
    const names = historicalNames(name, renames);
    const placeholders = names.map(() => "?").join(",");
    const result = await db.execute({
        sql: `SELECT * FROM operation_log WHERE path IN (${placeholders}) ORDER BY id ASC`,
        args: names,
    });
    return result.rows
        .map(mapRow)
        .filter((entry) => resolveCurrentName(operationPath(entry.operation), entry.id, renames) === name);
}

/** 时间线条目(未附快照可用性;由上层补齐 bodyAvailable)。 */
export type RawTimelineEntry = {entry: OperationLogEntry; pathAtThatTime: string};

/**
 * 收集 name 的时间线(升序)。
 *
 * followRenames = false:只取 path == name 的条目(该名字下发生过的一切,含历代同名文件)。
 * followRenames = true:追踪「当前叫 name 的这个文件」——从最近一次「出生」开始:
 * 出生 = 改名为 name(向旧名递归)或全新 create(历代同名的分界,终止回溯);
 * delete → restore 属同一文件的延续,不算分界。
 */
export async function collectTimeline(db: Sql, name: string, followRenames: boolean): Promise<RawTimelineEntry[]> {
    if (!followRenames) {
        const result = await db.execute({
            sql: "SELECT * FROM operation_log WHERE path = ? ORDER BY id ASC",
            args: [name],
        });
        return result.rows.map((row) => ({entry: mapRow(row), pathAtThatTime: name}));
    }
    return collectSegments(db, name, Number.MAX_SAFE_INTEGER);
}

async function collectSegments(db: Sql, name: string, maxId: number): Promise<RawTimelineEntry[]> {
    const result = await db.execute({
        sql: "SELECT * FROM operation_log WHERE path = ? AND id <= ? ORDER BY id ASC",
        args: [name, maxId],
    });
    const rows = result.rows.map((row) => ({entry: mapRow(row), pathAtThatTime: name}));

    // 倒序找最近一次「出生」(rename-to-name 或 create);它之前的同名条目属于其他文件
    let boundaryIndex = -1;
    for (let i = rows.length - 1; i >= 0; i--) {
        const type = rows[i]!.entry.operation.type;
        if (type === "file.rename" || type === "file.create") {
            boundaryIndex = i;
            break;
        }
    }
    if (boundaryIndex === -1) {
        return rows; // 无出生记录(如纯 restore 起家),整段即一个化身
    }
    const boundary = rows[boundaryIndex]!.entry;
    if (boundary.operation.type === "file.rename") {
        const older = await collectSegments(db, boundary.operation.fromPath, boundary.id - 1);
        return [...older, ...rows.slice(boundaryIndex)];
    }
    return rows.slice(boundaryIndex); // create = 全新出生,不再回溯
}

/** 名字 name 的账面末态(对账 / 删除找回的基准)。 */
export type NameEndState =
    | {kind: "never"}                                                          // 该名字从未出现
    | {kind: "exists"; hash: string; lastEntry: OperationLogEntry}             // 账面上存在,内容为 hash
    | {kind: "deleted"; recoveryHash: string; lastEntry: OperationLogEntry}    // 账面上已删除;recoveryHash = 删除前内容
    | {kind: "renamed-away"; lastEntry: OperationLogEntry};                    // 该名字被改走(文件活在新名下)

/** 查询名字 name 的账面末态:取最后一条涉及该名字的条目(含 rename 的 from 侧)分类。 */
export async function nameEndState(db: Sql, name: string): Promise<NameEndState> {
    const result = await db.execute({
        sql: "SELECT * FROM operation_log WHERE path = ? OR from_path = ? ORDER BY id DESC LIMIT 1",
        args: [name, name],
    });
    const row = result.rows[0];
    if (row === undefined) {
        return {kind: "never"};
    }
    const entry = mapRow(row);
    return classifyEndState(entry, name);
}

/** 按「最后一条涉及 name 的条目」分类 name 的末态。 */
export function classifyEndState(entry: OperationLogEntry, name: string): NameEndState {
    const op = entry.operation;
    switch (op.type) {
        case "file.rename":
            return op.toPath === name
                ? {kind: "exists", hash: op.contentHash, lastEntry: entry}
                : {kind: "renamed-away", lastEntry: entry};
        case "file.delete":
            return {kind: "deleted", recoveryHash: op.beforeHash, lastEntry: entry};
        case "file.revert":
            if (op.afterHash === null) {
                // revert 还原到「不存在」= 删除;恢复内容 = 还原前内容(双 null 已在写入层拒绝)
                return {kind: "deleted", recoveryHash: op.beforeHash!, lastEntry: entry};
            }
            return {kind: "exists", hash: op.afterHash, lastEntry: entry};
        case "file.create":
        case "file.edit":
        case "file.restore":
            return {kind: "exists", hash: op.afterHash, lastEntry: entry};
    }
}

/** 把条目按「现名」分组(rename 链前推),组内保持升序。收件箱 / 未见变更共用。 */
export function groupByCurrentName(entries: OperationLogEntry[], renames: RenameRecord[]): Map<string, OperationLogEntry[]> {
    const groups = new Map<string, OperationLogEntry[]>();
    for (const entry of entries) {
        const nameThen = operationPath(entry.operation);
        const nameNow = resolveCurrentName(nameThen, entry.id, renames);
        const list = groups.get(nameNow);
        if (list === undefined) {
            groups.set(nameNow, [entry]);
        } else {
            list.push(entry);
        }
    }
    return groups;
}

/** 查询一批 hash 中「快照 body 仍可取」的集合。 */
export async function availableBodies(db: Sql, hashes: string[]): Promise<Set<string>> {
    const unique = [...new Set(hashes)];
    const available = new Set<string>();
    for (let i = 0; i < unique.length; i += 200) {
        const chunk = unique.slice(i, i + 200);
        const placeholders = chunk.map(() => "?").join(",");
        const result = await db.execute({
            sql: `SELECT hash FROM file_snapshot WHERE hash IN (${placeholders}) AND body IS NOT NULL`,
            args: chunk,
        });
        for (const row of result.rows) {
            available.add(String(row["hash"]));
        }
    }
    return available;
}

/** 全部「名字 → 最后一条涉及它的条目 id」。删除找回列表的原料。 */
export async function lastEntryIdPerName(db: Sql): Promise<Map<string, number>> {
    const result = await db.execute(`
        SELECT name, MAX(id) AS last_id FROM (
            SELECT path AS name, id FROM operation_log
            UNION ALL
            SELECT from_path AS name, id FROM operation_log WHERE from_path IS NOT NULL
        ) GROUP BY name
    `);
    const map = new Map<string, number>();
    for (const row of result.rows) {
        map.set(String(row["name"]), Number(row["last_id"]));
    }
    return map;
}
