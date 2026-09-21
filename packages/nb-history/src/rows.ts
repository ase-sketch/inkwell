import type {Row} from "@libsql/client";
import {HistoryError, type FileOperation, type OperationActor, type OperationLogEntry} from "./types";

/**
 * 「行 ↔ 类型」映射层。
 *
 * 写入方向:把判别联合摊平成列(rename 的 contentHash 同时写入 before/after 两列,
 * 使「after_hash 列 = 操作后内容」对除 delete/revert 外的所有类型统一成立,简化末态查询)。
 * 读取方向:mapRow 对非法行抛错——数据库被外部改坏时立刻暴露,而不是产出错误数据。
 */

/** 待插入条目(无 id;occurredAt 由调用方按注入时钟生成)。 */
export type NewEntry = {
    occurredAt: string;
    actor: OperationActor;
    operation: FileOperation;
};

/** 摊平后的 operation_log 列值(供 INSERT 用)。 */
export type EntryColumns = {
    occurred_at: string;
    actor_kind: string;
    actor_user_id: string | null;
    actor_session_id: string | null;
    actor_source: string | null;
    op_type: string;
    path: string;
    from_path: string | null;
    before_hash: string | null;
    after_hash: string | null;
    reverted_entry_ids: string | null;
    source_entry_id: number | null;
};

/** 判别联合 → 列。写入前的最后一道校验也在这里(如 revert 双 null 拒绝)。 */
export function entryToColumns(entry: NewEntry): EntryColumns {
    const actor = entry.actor;
    const op = entry.operation;

    const base = {
        occurred_at: entry.occurredAt,
        actor_kind: actor.kind,
        actor_user_id: actor.kind === "user" ? actor.userId : null,
        actor_session_id: actor.kind === "agent" ? actor.sessionId : null,
        actor_source: actor.kind === "system" ? actor.source : null,
    };

    switch (op.type) {
        case "file.create":
            return {...base, op_type: op.type, path: op.path, from_path: null, before_hash: null, after_hash: op.afterHash, reverted_entry_ids: null, source_entry_id: null};
        case "file.edit":
            return {...base, op_type: op.type, path: op.path, from_path: null, before_hash: op.beforeHash, after_hash: op.afterHash, reverted_entry_ids: null, source_entry_id: null};
        case "file.delete":
            return {...base, op_type: op.type, path: op.path, from_path: null, before_hash: op.beforeHash, after_hash: null, reverted_entry_ids: null, source_entry_id: null};
        case "file.rename":
            return {...base, op_type: op.type, path: op.toPath, from_path: op.fromPath, before_hash: op.contentHash, after_hash: op.contentHash, reverted_entry_ids: null, source_entry_id: null};
        case "file.revert":
            if (op.beforeHash === null && op.afterHash === null) {
                throw new HistoryError("file.revert 的 beforeHash 与 afterHash 不得同时为 null(no-op)");
            }
            return {...base, op_type: op.type, path: op.path, from_path: null, before_hash: op.beforeHash, after_hash: op.afterHash, reverted_entry_ids: JSON.stringify(op.revertedEntryIds), source_entry_id: null};
        case "file.restore":
            return {...base, op_type: op.type, path: op.path, from_path: null, before_hash: op.beforeHash, after_hash: op.afterHash, reverted_entry_ids: null, source_entry_id: op.sourceEntryId};
    }
}

function rowString(row: Row, column: string): string {
    const value = row[column];
    if (typeof value !== "string") {
        throw new HistoryError(`operation_log 行 ${String(row["id"])} 列 ${column} 应为 string,实际 ${typeof value}`);
    }
    return value;
}

function rowStringOrNull(row: Row, column: string): string | null {
    const value = row[column];
    if (value === null || value === undefined) {
        return null;
    }
    if (typeof value !== "string") {
        throw new HistoryError(`operation_log 行 ${String(row["id"])} 列 ${column} 应为 string 或 NULL,实际 ${typeof value}`);
    }
    return value;
}

function rowNumber(row: Row, column: string): number {
    const value = row[column];
    if (typeof value === "bigint") {
        return Number(value);
    }
    if (typeof value !== "number") {
        throw new HistoryError(`operation_log 行列 ${column} 应为 number,实际 ${typeof value}`);
    }
    return value;
}

function rowNumberOrNull(row: Row, column: string): number | null {
    const value = row[column];
    if (value === null || value === undefined) {
        return null;
    }
    return rowNumber(row, column);
}

/** 列 → OperationActor,非法组合抛错。 */
function mapActor(row: Row): OperationActor {
    const kind = rowString(row, "actor_kind");
    const userId = rowStringOrNull(row, "actor_user_id");
    const sessionId = rowStringOrNull(row, "actor_session_id");
    const source = rowStringOrNull(row, "actor_source");

    switch (kind) {
        case "user":
            if (userId === null || sessionId !== null || source !== null) break;
            return {kind: "user", userId};
        case "agent":
            if (sessionId === null || userId !== null || source !== null) break;
            return {kind: "agent", sessionId};
        case "system":
            if (source === null || userId !== null || sessionId !== null) break;
            return {kind: "system", source};
        case "external":
            if (userId !== null || sessionId !== null || source !== null) break;
            return {kind: "external"};
        default:
            throw new HistoryError(`operation_log 行 ${String(row["id"])} 的 actor_kind 非法: ${kind}`);
    }
    throw new HistoryError(`operation_log 行 ${String(row["id"])} 的 actor 字段组合非法(kind=${kind})`);
}

/** 列 → FileOperation,字段缺失 / 多余按类型严格校验。 */
function mapOperation(row: Row): FileOperation {
    const opType = rowString(row, "op_type");
    const path = rowString(row, "path");
    const fromPath = rowStringOrNull(row, "from_path");
    const beforeHash = rowStringOrNull(row, "before_hash");
    const afterHash = rowStringOrNull(row, "after_hash");
    const revertedRaw = rowStringOrNull(row, "reverted_entry_ids");
    const sourceEntryId = rowNumberOrNull(row, "source_entry_id");
    const id = String(row["id"]);

    switch (opType) {
        case "file.create":
            if (beforeHash !== null || afterHash === null || fromPath !== null) break;
            return {type: "file.create", path, afterHash};
        case "file.edit":
            if (beforeHash === null || afterHash === null || fromPath !== null) break;
            return {type: "file.edit", path, beforeHash, afterHash};
        case "file.delete":
            if (beforeHash === null || afterHash !== null || fromPath !== null) break;
            return {type: "file.delete", path, beforeHash};
        case "file.rename":
            if (fromPath === null || beforeHash === null || beforeHash !== afterHash) break;
            return {type: "file.rename", fromPath, toPath: path, contentHash: beforeHash};
        case "file.revert": {
            if (revertedRaw === null || (beforeHash === null && afterHash === null)) break;
            const ids: unknown = JSON.parse(revertedRaw); // JSON.parse 返回 unknown,下面立即校验收窄
            if (!Array.isArray(ids) || !ids.every((x): x is number => typeof x === "number")) break;
            return {type: "file.revert", path, beforeHash, afterHash, revertedEntryIds: ids};
        }
        case "file.restore":
            if (afterHash === null || sourceEntryId === null) break;
            return {type: "file.restore", path, beforeHash, afterHash, sourceEntryId};
        default:
            throw new HistoryError(`operation_log 行 ${id} 的 op_type 非法: ${opType}`);
    }
    throw new HistoryError(`operation_log 行 ${id} 的操作字段组合非法(op_type=${opType})`);
}

/** 行 → 日志条目。任何非法行抛 HistoryError(防御数据库被外部改坏)。 */
export function mapRow(row: Row): OperationLogEntry {
    return {
        id: rowNumber(row, "id"),
        occurredAt: rowString(row, "occurred_at"),
        actor: mapActor(row),
        operation: mapOperation(row),
    };
}
