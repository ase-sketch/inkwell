import type {Client, Transaction} from "@libsql/client";
import type {HistoryConfig, PruneReport} from "./types";
import {acceptancePositionFor, groupByCurrentName, loadEntriesAfter, loadRenames} from "./views";

/**
 * 保留策略引擎(R12):分层稀疏 + 快照引用计数 GC。
 *
 * 1. 窗口(retentionFullDays)内条目全保留;
 * 2. 窗口外:keepDailyLastAfterWindow 时每 path 每自然日(UTC)保留末条,否则全删;
 * 3. 保护规则(优先于稀疏化,永不删除):
 *    a. 任何用户接受位点之后、且含 agent/system 条目的收件箱段;
 *    b. 「活跃游标」(updated_at 在窗口内的会话)位点之后的条目;
 *    c. 每个 path 的最新一条条目(时间线现状 / 删除找回依赖);
 * 4. 快照 GC:删除不再被任何存活条目 before/after 引用的 snapshot 行。
 *
 * prune 是全库维护操作,直接载入全量日志计算保护集(非热路径,以正确性优先)。
 */
export async function runPrune(client: Client, config: HistoryConfig, now: Date): Promise<PruneReport> {
    const windowStart = new Date(now.getTime() - config.retentionFullDays * 24 * 60 * 60 * 1000).toISOString();

    const renames = await loadRenames(client);
    const allEntries = await loadEntriesAfter(client, 0);
    if (allEntries.length === 0) {
        return {entriesDeleted: 0, snapshotsDeleted: 0, bytesFreed: 0};
    }

    const protectedIds = new Set<number>();

    // 保护 (c):每个 path(列原值)的最新一条
    const lastPerPath = new Map<string, number>();
    for (const entry of allEntries) {
        const path = entry.operation.type === "file.rename" ? entry.operation.toPath : entry.operation.path;
        lastPerPath.set(path, entry.id); // 升序遍历,后者覆盖
    }
    for (const id of lastPerPath.values()) {
        protectedIds.add(id);
    }

    // 保护 (b):活跃游标位点之后
    const cursorResult = await client.execute({
        sql: "SELECT last_seen_entry_id FROM session_cursor WHERE updated_at >= ?",
        args: [windowStart],
    });
    let minActiveCursor = Number.POSITIVE_INFINITY;
    for (const row of cursorResult.rows) {
        minActiveCursor = Math.min(minActiveCursor, Number(row["last_seen_entry_id"]));
    }
    if (minActiveCursor !== Number.POSITIVE_INFINITY) {
        for (const entry of allEntries) {
            if (entry.id > minActiveCursor) {
                protectedIds.add(entry.id);
            }
        }
    }

    // 保护 (a):未接受收件箱段。已知用户 = 出现在接受表或日志 user actor 中的用户;
    // 没有任何已知用户时该规则不产生保护(无人审查 = 无收件箱语义)。
    const userResult = await client.execute(
        "SELECT DISTINCT user_id AS uid FROM file_acceptance UNION SELECT DISTINCT actor_user_id AS uid FROM operation_log WHERE actor_user_id IS NOT NULL",
    );
    const users = userResult.rows.map((row) => String(row["uid"]));
    if (users.length > 0) {
        const acceptanceResult = await client.execute("SELECT user_id, path, accepted_entry_id FROM file_acceptance");
        const acceptance = new Map<string, Map<string, number>>(); // userId → (path → acceptedId)
        for (const row of acceptanceResult.rows) {
            const userId = String(row["user_id"]);
            let perPath = acceptance.get(userId);
            if (perPath === undefined) {
                perPath = new Map();
                acceptance.set(userId, perPath);
            }
            perPath.set(String(row["path"]), Number(row["accepted_entry_id"]));
        }

        const groups = groupByCurrentName(allEntries, renames);
        const emptyAcceptance = new Map<string, number>();
        for (const [name, groupEntries] of groups) {
            for (const userId of users) {
                const position = acceptancePositionFor(name, renames, acceptance.get(userId) ?? emptyAcceptance);
                const span = groupEntries.filter((entry) => entry.id > position);
                if (span.some((entry) => entry.actor.kind === "agent" || entry.actor.kind === "system")) {
                    for (const entry of span) {
                        protectedIds.add(entry.id);
                    }
                }
            }
        }
    }

    // 稀疏化:窗口外条目按日保留末条。「当日末条」按全体窗口外条目计算,与保护集无关——
    // 若在剔除保护后的候选集里取末条,当日真末条恰好被保护时会错误地多保一条次末条。
    const outside = allEntries.filter((entry) => entry.occurredAt < windowStart);
    const keepDayLast = new Set<number>();
    if (config.keepDailyLastAfterWindow) {
        const lastPerDay = new Map<string, number>(); // `${path}\n${day}` → 该日末条 id
        for (const entry of outside) {
            const path = entry.operation.type === "file.rename" ? entry.operation.toPath : entry.operation.path;
            lastPerDay.set(`${path}\n${entry.occurredAt.slice(0, 10)}`, entry.id); // 升序遍历,后者覆盖
        }
        for (const id of lastPerDay.values()) {
            keepDayLast.add(id);
        }
    }
    const toDelete: number[] = [];
    for (const entry of outside) {
        if (!protectedIds.has(entry.id) && !keepDayLast.has(entry.id)) {
            toDelete.push(entry.id);
        }
    }

    // 删条目(分块) + 快照 GC,同一事务
    const tx = await client.transaction("write");
    try {
        await deleteOperationEntries(tx, toDelete);
        const snapshotReport = await garbageCollectSnapshots(tx);
        await tx.commit();
        return {
            entriesDeleted: toDelete.length,
            snapshotsDeleted: snapshotReport.snapshotsDeleted,
            bytesFreed: snapshotReport.bytesFreed,
        };
    } finally {
        tx.close();
    }
}

/** 在调用方事务内分块删除 operation_log 条目。 */
export async function deleteOperationEntries(tx: Transaction, entryIds: number[]): Promise<void> {
    for (let i = 0; i < entryIds.length; i += 200) {
        const chunk = entryIds.slice(i, i + 200);
        const placeholders = chunk.map(() => "?").join(",");
        await tx.execute({sql: `DELETE FROM operation_log WHERE id IN (${placeholders})`, args: chunk});
    }
}

/** 在调用方事务内删除不再被存活日志引用的内容寻址快照。 */
export async function garbageCollectSnapshots(tx: Transaction): Promise<{snapshotsDeleted: number; bytesFreed: number}> {
    const orphans = await tx.execute(`
        SELECT hash, byte_size, (body IS NOT NULL) AS has_body FROM file_snapshot
        WHERE hash NOT IN (
            SELECT before_hash FROM operation_log WHERE before_hash IS NOT NULL
            UNION
            SELECT after_hash FROM operation_log WHERE after_hash IS NOT NULL
        )
    `);
    const orphanHashes: string[] = [];
    let bytesFreed = 0;
    for (const row of orphans.rows) {
        orphanHashes.push(String(row["hash"]));
        if (Number(row["has_body"]) === 1) {
            bytesFreed += Number(row["byte_size"]);
        }
    }
    for (let i = 0; i < orphanHashes.length; i += 200) {
        const chunk = orphanHashes.slice(i, i + 200);
        const placeholders = chunk.map(() => "?").join(",");
        await tx.execute({sql: `DELETE FROM file_snapshot WHERE hash IN (${placeholders})`, args: chunk});
    }
    return {snapshotsDeleted: orphanHashes.length, bytesFreed};
}
