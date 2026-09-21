import type {Client, Transaction} from "@libsql/client";
import {deleteOperationEntries, garbageCollectSnapshots} from "./prune";
import type {PathPurgeReport} from "./types";

/**
 * 显式清理宿主判定为不再受管的路径历史。
 * 正常记账保持 append-only；该维护入口只用于路径范围收紧和错误数据修复。
 */
export async function runPathPurge(
    client: Client,
    shouldPurge: (path: string) => boolean,
): Promise<PathPurgeReport> {
    const tx = await client.transaction("write");
    try {
        const matchedPaths = await matchingPaths(tx, shouldPurge);
        const entryIds = await matchingEntryIds(tx, matchedPaths);
        const acceptanceRows = await matchingAcceptances(tx, matchedPaths);

        if (entryIds.length === 0 && acceptanceRows.length === 0) {
            await tx.commit();
            return {entriesDeleted: 0, acceptancesDeleted: 0, snapshotsDeleted: 0, bytesFreed: 0};
        }

        await deleteOperationEntries(tx, entryIds);
        await deleteAcceptances(tx, acceptanceRows);
        const snapshotReport = await garbageCollectSnapshots(tx);
        await tx.commit();
        return {
            entriesDeleted: entryIds.length,
            acceptancesDeleted: acceptanceRows.length,
            snapshotsDeleted: snapshotReport.snapshotsDeleted,
            bytesFreed: snapshotReport.bytesFreed,
        };
    } finally {
        tx.close();
    }
}

/**
 * 只把去重后的已记录路径交给宿主 predicate，避免每次 open 反序列化全量 operation_log。
 * rename 的新名存于 path，旧名存于 from_path；acceptance path 同样参与策略收紧。
 */
async function matchingPaths(tx: Transaction, shouldPurge: (path: string) => boolean): Promise<string[]> {
    const result = await tx.execute(`
        SELECT path FROM operation_log
        UNION
        SELECT from_path AS path FROM operation_log WHERE from_path IS NOT NULL
        UNION
        SELECT path FROM file_acceptance
    `);
    const paths: string[] = [];
    for (const row of result.rows) {
        const recordedPath = String(row["path"]);
        if (shouldPurge(recordedPath)) {
            paths.push(recordedPath);
        }
    }
    return paths;
}

type AcceptanceRow = {userId: string; path: string};

/** 按命中路径查询 operation id；只传输标量 id，不构造 OperationLogEntry。 */
async function matchingEntryIds(tx: Transaction, paths: string[]): Promise<number[]> {
    const entryIds = new Set<number>();
    for (let i = 0; i < paths.length; i += 100) {
        const chunk = paths.slice(i, i + 100);
        const placeholders = chunk.map(() => "?").join(",");
        const result = await tx.execute({
            sql: `SELECT id FROM operation_log WHERE path IN (${placeholders}) OR from_path IN (${placeholders})`,
            args: [...chunk, ...chunk],
        });
        for (const row of result.rows) {
            entryIds.add(Number(row["id"]));
        }
    }
    return [...entryIds];
}

/** 在同一写事务内读取命中路径的接受位点。 */
async function matchingAcceptances(tx: Transaction, paths: string[]): Promise<AcceptanceRow[]> {
    const rows: AcceptanceRow[] = [];
    for (let i = 0; i < paths.length; i += 100) {
        const chunk = paths.slice(i, i + 100);
        const placeholders = chunk.map(() => "?").join(",");
        const result = await tx.execute({
            sql: `SELECT user_id, path FROM file_acceptance WHERE path IN (${placeholders})`,
            args: chunk,
        });
        for (const row of result.rows) {
            rows.push({userId: String(row["user_id"]), path: String(row["path"])});
        }
    }
    return rows;
}

/** 按复合主键分块删除 acceptance，避免宿主接触数据库结构。 */
async function deleteAcceptances(tx: Transaction, rows: AcceptanceRow[]): Promise<void> {
    for (let i = 0; i < rows.length; i += 100) {
        const chunk = rows.slice(i, i + 100);
        const conditions = chunk.map(() => "(user_id = ? AND path = ?)").join(" OR ");
        const args = chunk.flatMap((row) => [row.userId, row.path]);
        await tx.execute({sql: `DELETE FROM file_acceptance WHERE ${conditions}`, args});
    }
}
