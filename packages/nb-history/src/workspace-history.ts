import fs from "node:fs/promises";
import nodePath from "node:path";
import type {Client, Transaction} from "@libsql/client";
import {diffLines} from "diff";
import {openDatabase, openReader} from "./db";
import {looksBinary, sha256Hex, toBytes} from "./hash";
import {validatePath} from "./paths";
import {runPrune} from "./prune";
import {runPathPurge} from "./path-purge";
import {entryToColumns, mapRow, type NewEntry} from "./rows";
import {
    afterStateHash,
    beforeStateHash,
    DEFAULT_HISTORY_CONFIG,
    HistoryError,
    HistoryInboxMutationError,
    type DeletedFileInfo,
    type FileOperation,
    type HistoryConfig,
    type InboxGroup,
    type OpenOptions,
    type OperationActor,
    type OperationLogEntry,
    type PathPurgeReport,
    type PruneReport,
    type TextDiffResult,
    type TimelineEntry,
    type UnseenGroup,
} from "./types";
import {
    acceptancePositionFor,
    availableBodies,
    classifyEndState,
    collectTimeline,
    groupByCurrentName,
    lastEntryIdPerName,
    loadEntriesAfter,
    loadEntriesByIds,
    loadEntryById,
    loadGroupEntries,
    loadRenames,
    nameEndState,
    type NameEndState,
    type Sql,
} from "./views";

type RevertPlan = {
    span: OperationLogEntry[];
    baselineHash: string | null;
    baselineBytes: Uint8Array | null;
};

/**
 * Workspace 操作日志与文件历史。
 *
 * 并发模型(R11,单进程内):WAL 一写多读的双连接形态——
 * - 写连接:写入面 / 还原面 / 对账 / 维护经写互斥串行;
 * - 读连接:查询面独立连接 + 读互斥;多条 SELECT 拼装的视图包在读事务里,
 *   获得快照一致性(写连接中途提交不会撕裂一次查询的归组)。
 * 多进程同时打开同一库不受支持。
 *
 * 崩溃一致性(R10):perform* 先写盘、紧接记账;两步之间崩溃 → 账面落后于磁盘,
 * 下次 reconcile 补 external 条目(归因丢失但历史不断链)。此外所有写入口在记账前
 * 都会比对磁盘与账面末态,不一致时自动先补一条 external 条目(R9 的写路径内建形态),
 * 保证 beforeHash 链始终精确。
 */
export class WorkspaceHistory {
    private queue: Promise<unknown> = Promise.resolve();
    private readQueue: Promise<unknown> = Promise.resolve();
    private closed = false;

    private constructor(
        private readonly client: Client,
        private readonly reader: Client,
        private readonly resolvePath: (path: string) => string,
        private readonly config: HistoryConfig,
        private readonly clock: () => Date,
    ) {}

    /** 打开(库文件不存在则建库建表)。path 语义由宿主决定:日志记录调用方传入的字符串,
     *  落盘 / 读盘经 resolvePath 解析(缺省原样返回,即 path 直接是磁盘路径)。 */
    static async open(options: OpenOptions): Promise<WorkspaceHistory> {
        const databasePath = nodePath.resolve(options.databasePath);
        const client = await openDatabase(databasePath);
        return new WorkspaceHistory(
            client,
            openReader(databasePath),
            options.resolvePath ?? ((path: string) => path),
            {...DEFAULT_HISTORY_CONFIG, ...options.config},
            options.clock ?? (() => new Date()),
        );
    }

    // ── 写入面 ────────────────────────────────────────────────

    /** 模块代落盘 + 记账(写文件 → 算 hash → 存快照 → 追加日志)。按当前是否存在自动判定 create / edit。 */
    async performWrite(actor: OperationActor, path: string, content: Uint8Array | string): Promise<OperationLogEntry> {
        return this.locked(async () => {
            validatePath(path);
            const bytes = toBytes(content);
            const old = await this.readDisk(path);
            const oldHash = old === null ? null : sha256Hex(old);
            const implicit = await this.implicitReconcile(path, oldHash);

            await this.writeDisk(path, bytes); // 先写盘(R10)
            const newHash = sha256Hex(bytes);
            const operation: FileOperation = oldHash === null
                ? {type: "file.create", path, afterHash: newHash}
                : {type: "file.edit", path, beforeHash: oldHash, afterHash: newHash};

            const snapshots = old === null ? [bytes] : [old, bytes];
            const inserted = await this.appendEntries([...implicit, this.newEntry(actor, operation)], snapshots);
            return inserted[inserted.length - 1]!;
        });
    }

    /** 模块代删盘 + 记账。文件不存在时抛错(宿主传参错误或已被外部删除,后者应走 reconcile)。 */
    async performDelete(actor: OperationActor, path: string): Promise<OperationLogEntry> {
        return this.locked(async () => {
            validatePath(path);
            const old = await this.readDisk(path);
            if (old === null) {
                throw new HistoryError(`文件不存在,无法删除: ${path}`);
            }
            const oldHash = sha256Hex(old);
            const implicit = await this.implicitReconcile(path, oldHash);

            await fs.rm(this.absolute(path));
            const operation: FileOperation = {type: "file.delete", path, beforeHash: oldHash};
            const inserted = await this.appendEntries([...implicit, this.newEntry(actor, operation)], [old]);
            return inserted[inserted.length - 1]!;
        });
    }

    /** 模块代改名 + 记账。rename 只表示改名(内容不变);目标已存在时抛错。 */
    async performRename(actor: OperationActor, fromPath: string, toPath: string): Promise<OperationLogEntry> {
        return this.locked(async () => {
            validatePath(fromPath);
            validatePath(toPath);
            const bytes = await this.readDisk(fromPath);
            if (bytes === null) {
                throw new HistoryError(`文件不存在,无法改名: ${fromPath}`);
            }
            if ((await this.readDisk(toPath)) !== null) {
                throw new HistoryError(`改名目标已存在: ${toPath}`);
            }
            const contentHash = sha256Hex(bytes);
            const implicit = await this.implicitReconcile(fromPath, contentHash);

            const absTo = this.absolute(toPath);
            await fs.mkdir(nodePath.dirname(absTo), {recursive: true});
            await fs.rename(this.absolute(fromPath), absTo);

            const operation: FileOperation = {type: "file.rename", fromPath, toPath, contentHash};
            const inserted = await this.appendEntries([...implicit, this.newEntry(actor, operation)], [bytes]);
            return inserted[inserted.length - 1]!;
        });
    }

    /** 宿主已自行落盘,只补记账。before 为 null 表示此前文件不存在(= create)。 */
    async registerWrite(actor: OperationActor, path: string, before: Uint8Array | null, after: Uint8Array): Promise<OperationLogEntry> {
        return this.locked(async () => {
            validatePath(path);
            const beforeHash = before === null ? null : sha256Hex(before);
            const implicit = await this.implicitReconcile(path, beforeHash);
            const afterHash = sha256Hex(after);
            const operation: FileOperation = beforeHash === null
                ? {type: "file.create", path, afterHash}
                : {type: "file.edit", path, beforeHash, afterHash};
            const snapshots = before === null ? [after] : [before, after];
            const inserted = await this.appendEntries([...implicit, this.newEntry(actor, operation)], snapshots);
            return inserted[inserted.length - 1]!;
        });
    }

    /**
     * 观察型记账:宿主观察到一次写入但**没有写前内容**(watcher / 事件门等
     * 「事后观察」宿主)。before 由模块从账面末态自动推断——末态 hash 取
     * `nameEndState`,快照字节必然存在(prune 保护每文件末条不删),因此
     * before 无需宿主提供也不会产生对账噪声;链精确是构造性的。
     *
     * - 账面末态 == 传入内容 → 返回 null(吸收宿主观察回声,不重复记账);
     * - 账面无记录 / 已删除 / 改名走 → 记 create;
     * - 账面存在且内容不同 → 记 edit(beforeHash = 账面末态 hash)。
     */
    async registerObservedWrite(actor: OperationActor, path: string, after: Uint8Array): Promise<OperationLogEntry | null> {
        return this.locked(async () => {
            validatePath(path);
            const afterHash = sha256Hex(after);
            const end = await nameEndState(this.client, path);
            if (end.kind === "exists" && end.hash === afterHash) {
                return null;
            }
            const operation: FileOperation = end.kind === "exists"
                ? {type: "file.edit", path, beforeHash: end.hash, afterHash}
                : {type: "file.create", path, afterHash};
            const inserted = await this.appendEntries([this.newEntry(actor, operation)], [after]);
            return inserted[inserted.length - 1]!;
        });
    }

    /** 宿主已自行删盘,只补记账。before = 删除前内容(快照它,删除才可找回)。 */
    async registerDelete(actor: OperationActor, path: string, before: Uint8Array): Promise<OperationLogEntry> {
        return this.locked(async () => {
            validatePath(path);
            const beforeHash = sha256Hex(before);
            const implicit = await this.implicitReconcile(path, beforeHash);
            const operation: FileOperation = {type: "file.delete", path, beforeHash};
            const inserted = await this.appendEntries([...implicit, this.newEntry(actor, operation)], [before]);
            return inserted[inserted.length - 1]!;
        });
    }

    /** 宿主已自行改名,只补记账(从磁盘 toPath 读内容算 contentHash)。 */
    async registerRename(actor: OperationActor, fromPath: string, toPath: string): Promise<OperationLogEntry> {
        return this.locked(async () => {
            validatePath(fromPath);
            validatePath(toPath);
            const bytes = await this.readDisk(toPath);
            if (bytes === null) {
                throw new HistoryError(`目标文件不存在,无法登记改名: ${toPath}`);
            }
            const contentHash = sha256Hex(bytes);
            const implicit = await this.implicitReconcile(fromPath, contentHash);
            const operation: FileOperation = {type: "file.rename", fromPath, toPath, contentHash};
            const inserted = await this.appendEntries([...implicit, this.newEntry(actor, operation)], [bytes]);
            return inserted[inserted.length - 1]!;
        });
    }

    // ── 还原面 ────────────────────────────────────────────────

    /**
     * 收件箱还原(R7):把 path 还原到该用户的「已接受基线」,落盘 + 记 file.revert +
     * 接受位点推进到 revert 条目。基线 = 位点后第一条条目的 before 态(链连续性保证
     * 它恒等于「位点条目的 after 态」,且不受位点条目本身被稀疏化影响)。
     */
    async revert(userId: string, path: string): Promise<OperationLogEntry> {
        return this.locked(async () => {
            validatePath(path);
            const plan = await this.loadRevertPlan(userId, path);
            return this.applyRevertPlan(userId, path, plan);
        });
    }

    /** 仅当该文件仍是客户端看到的 revision 时还原；校验与落盘位于同一个 History 写锁。 */
    async revertAtRevision(userId: string, path: string, expectedRevision: number): Promise<OperationLogEntry> {
        return this.locked(async () => {
            validatePath(path);
            const plan = await this.loadRevertPlan(userId, path, true);
            const currentRevision = plan.span[plan.span.length - 1]!.id;
            if (currentRevision !== expectedRevision) {
                throw new HistoryInboxMutationError("stale", `收件箱 revision 已变化: expected=${expectedRevision}, current=${currentRevision}`);
            }
            const current = await this.readDisk(path);
            const currentHash = current === null ? null : sha256Hex(current);
            const expectedHash = afterStateHash(plan.span[plan.span.length - 1]!.operation);
            if (currentHash !== expectedHash) {
                throw new HistoryInboxMutationError("stale", `文件内容已在收件箱 revision ${expectedRevision} 后变化: ${path}`);
            }
            return this.applyRevertPlan(userId, path, plan, {bytes: current, hash: currentHash});
        });
    }

    /** 恢复任意历史版本(R8,含删除找回):内容源 = source 条目的 after 态(delete 条目取 before 态)。 */
    async restore(actor: OperationActor, path: string, sourceEntryId: number): Promise<OperationLogEntry> {
        return this.locked(async () => {
            validatePath(path);
            const source = await loadEntryById(this.client, sourceEntryId);
            if (source === null) {
                throw new HistoryError(`来源条目不存在: ${sourceEntryId}`);
            }
            const contentHash = afterStateHash(source.operation) ?? beforeStateHash(source.operation);
            if (contentHash === null) {
                throw new HistoryError(`来源条目没有可恢复的内容: ${sourceEntryId}`);
            }
            const body = await this.snapshotBody(contentHash);
            if (body === null) {
                throw new HistoryError(`快照 body 不可用(超限 / 二进制 / 已被保留策略清理),无法恢复: ${sourceEntryId}`);
            }

            const current = await this.readDisk(path);
            const currentHash = current === null ? null : sha256Hex(current);
            const implicit = await this.implicitReconcile(path, currentHash);

            await this.writeDisk(path, body);
            const operation: FileOperation = {type: "file.restore", path, beforeHash: currentHash, afterHash: contentHash, sourceEntryId};
            const snapshots = current === null ? [] : [current];
            const inserted = await this.appendEntries([...implicit, this.newEntry(actor, operation)], snapshots);
            return inserted[inserted.length - 1]!;
        });
    }

    // ── 对账面 ────────────────────────────────────────────────

    /**
     * 对账(R9):current 为 null 表示文件当前不存在。与账面末态一致 → no-op 返回 null
     * (宿主 watcher 对模块自身落盘的回声在此被吸收);不一致 → 补一条 external 条目并返回。
     */
    async reconcile(path: string, current: Uint8Array | null): Promise<OperationLogEntry | null> {
        return this.locked(async () => {
            validatePath(path);
            const currentHash = current === null ? null : sha256Hex(current);
            const implicit = await this.implicitReconcile(path, currentHash);
            if (implicit.length === 0) {
                return null;
            }
            const snapshots = current === null ? [] : [current];
            const inserted = await this.appendEntries(implicit, snapshots);
            return inserted[inserted.length - 1]!;
        });
    }

    // ── 查询面 ────────────────────────────────────────────────

    /** 按 id 读单条日志。 */
    async entry(id: number): Promise<OperationLogEntry | null> {
        return this.readLocked(() => loadEntryById(this.reader, id));
    }

    /**
     * 单文件时间线(升序)。followRenames = true 时追踪「当前叫 path 的这个文件」跨改名的历史;
     * false(默认)只列该名字下的条目。limit 取最近的 N 条。
     * 稀疏化后相邻条目间 diff 跨度会变大,渲染方不得假设「上一条 after == 下一条 before」。
     */
    async timeline(path: string, options?: {followRenames?: boolean; limit?: number}): Promise<TimelineEntry[]> {
        validatePath(path);
        return this.readTx(async (db) => {
            let raw = await collectTimeline(db, path, options?.followRenames ?? false);
            if (options?.limit !== undefined && raw.length > options.limit) {
                raw = raw.slice(raw.length - options.limit);
            }
            const hashes: string[] = [];
            for (const item of raw) {
                const before = beforeStateHash(item.entry.operation);
                const after = afterStateHash(item.entry.operation);
                if (before !== null) hashes.push(before);
                if (after !== null) hashes.push(after);
            }
            const available = await availableBodies(db, hashes);
            return raw.map((item) => {
                const before = beforeStateHash(item.entry.operation);
                const after = afterStateHash(item.entry.operation);
                return {
                    entry: item.entry,
                    pathAtThatTime: item.pathAtThatTime,
                    bodyAvailable: {
                        before: before !== null && available.has(before),
                        after: after !== null && available.has(after),
                    },
                };
            });
        });
    }

    /** 快照内容;null = body 未保留(超限 / 二进制 / 已 GC)或 hash 不存在。 */
    async snapshotBody(hash: string): Promise<Uint8Array | null> {
        return this.readLocked(async () => {
            const result = await this.reader.execute({sql: "SELECT body FROM file_snapshot WHERE hash = ?", args: [hash]});
            const row = result.rows[0];
            if (row === undefined) {
                return null;
            }
            return this.bytesFromBlob(row["body"], "file_snapshot.body");
        });
    }

    /** 文本 diff 便利方法(R13):hash 为 null 的一侧按空文本处理;body 缺失 / 二进制返回不可用标记。 */
    async textDiff(beforeHash: string | null, afterHash: string | null): Promise<TextDiffResult> {
        return this.readTx(async (db) => {
            const before = await this.diffSide(db, beforeHash, "before-missing");
            if ("reason" in before) {
                return {available: false, reason: before.reason};
            }
            const after = await this.diffSide(db, afterHash, "after-missing");
            if ("reason" in after) {
                return {available: false, reason: after.reason};
            }
            const decoder = new TextDecoder();
            const beforeText = decoder.decode(before.bytes);
            const afterText = decoder.decode(after.bytes);
            return {available: true, changes: diffLines(beforeText, afterText), beforeText, afterText};
        });
    }

    /**
     * diff 单侧取内容。hash 为 null = 该侧无内容(按空文本)。body 缺失时区分原因:
     * byte_size 在上限内却未存 body → 只可能是二进制(R3 的存储降级是确定性的);
     * 否则(超限 / 已 GC)按该侧 missing 报告。
     */
    private async diffSide(
        db: Sql,
        hash: string | null,
        missing: "before-missing" | "after-missing",
    ): Promise<{bytes: Uint8Array} | {reason: "before-missing" | "after-missing" | "binary"}> {
        if (hash === null) {
            return {bytes: new Uint8Array()};
        }
        const result = await db.execute({sql: "SELECT body, byte_size FROM file_snapshot WHERE hash = ?", args: [hash]});
        const row = result.rows[0];
        if (row === undefined) {
            return {reason: missing};
        }
        const bytes = this.bytesFromBlob(row["body"], "file_snapshot.body");
        if (bytes === null) {
            const byteSize = Number(row["byte_size"]);
            return byteSize <= this.config.maxSnapshotBytes ? {reason: "binary"} : {reason: missing};
        }
        if (looksBinary(bytes)) {
            return {reason: "binary"};
        }
        return {bytes};
    }

    /** 在指定数据库快照中构建一个用户的完整收件箱。 */
    private async loadInbox(db: Sql, userId: string): Promise<InboxGroup[]> {
        const renames = await loadRenames(db);
        const acceptance = await this.loadAcceptance(db, userId);
        // SQL 预过滤:按条目路径名下的位点裁掉已接受部分,扫描量随审查进度收敛。
        // 位点随 rename 迁移的精确语义在下方 JS 重算——预过滤只会多包含,不会漏。
        const entryResult = await db.execute({
            sql: `SELECT ol.* FROM operation_log ol
                  LEFT JOIN file_acceptance fa ON fa.user_id = ? AND fa.path = ol.path
                  WHERE ol.id > COALESCE(fa.accepted_entry_id, 0)
                  ORDER BY ol.id ASC`,
            args: [userId],
        });
        const groups = groupByCurrentName(entryResult.rows.map(mapRow), renames);
        const result: InboxGroup[] = [];
        for (const [name, groupEntries] of groups) {
            const position = acceptancePositionFor(name, renames, acceptance);
            const span = groupEntries.filter((entry) => entry.id > position);
            if (span.length === 0 || !span.some((entry) => entry.actor.kind === "agent" || entry.actor.kind === "system")) {
                continue;
            }
            result.push({
                path: name,
                baseHash: beforeStateHash(span[0]!.operation),
                endHash: afterStateHash(span[span.length - 1]!.operation),
                entries: span,
            });
        }
        return result.sort((left, right) => left.path.localeCompare(right.path));
    }

    /** 读取还原所需的待审段和基线快照；条件式调用把目标消失映射为稳定错误码。 */
    private async loadRevertPlan(userId: string, path: string, conditional = false): Promise<RevertPlan> {
        const renames = await loadRenames(this.client);
        const group = await loadGroupEntries(this.client, path, renames);
        if (group.length === 0) {
            if (conditional) {
                throw new HistoryInboxMutationError("missing", `待审文件不存在或已被接受: ${path}`);
            }
            throw new HistoryError(`没有该文件的日志记录: ${path}`);
        }
        const acceptance = await this.loadAcceptance(this.client, userId);
        const position = acceptancePositionFor(path, renames, acceptance);
        const span = group.filter((entry) => entry.id > position);
        if (span.length === 0 || !span.some((entry) => entry.actor.kind === "agent" || entry.actor.kind === "system")) {
            if (conditional) {
                throw new HistoryInboxMutationError("missing", `待审文件不存在或已被接受: ${path}`);
            }
            throw new HistoryError(`该文件没有待还原的收件箱变更: ${path}`);
        }

        const baselineHash = beforeStateHash(span[0]!.operation);
        let baselineBytes: Uint8Array | null = null;
        if (baselineHash !== null) {
            baselineBytes = await this.snapshotBody(baselineHash);
            if (baselineBytes === null) {
                throw new HistoryError(`基线快照不可用(超限 / 二进制 / 已被保留策略清理),无法还原: ${path}`);
            }
        }
        return {span, baselineHash, baselineBytes};
    }

    /** 按已在写锁内确认的计划落盘、记 revert 条目并原子推进接受位点。 */
    private async applyRevertPlan(
        userId: string,
        path: string,
        plan: RevertPlan,
        knownCurrent?: {bytes: Uint8Array | null; hash: string | null},
    ): Promise<OperationLogEntry> {
        const current = knownCurrent === undefined ? await this.readDisk(path) : knownCurrent.bytes;
        const currentHash = knownCurrent === undefined
            ? (current === null ? null : sha256Hex(current))
            : knownCurrent.hash;
        if (currentHash === null && plan.baselineHash === null) {
            throw new HistoryError(`文件当前不存在且基线也是「不存在」,无事可还原: ${path}`);
        }
        const implicit = await this.implicitReconcile(path, currentHash);

        if (plan.baselineBytes === null) {
            if (current !== null) {
                await fs.rm(this.absolute(path));
            }
        } else {
            await this.writeDisk(path, plan.baselineBytes);
        }

        const operation: FileOperation = {
            type: "file.revert",
            path,
            beforeHash: currentHash,
            afterHash: plan.baselineHash,
            revertedEntryIds: plan.span.map((entry) => entry.id),
        };
        const snapshots = current === null ? [] : [current];
        const inserted = await this.appendEntries([...implicit, this.newEntry({kind: "user", userId}, operation)], snapshots, async (tx, entries) => {
            const revertEntry = entries[entries.length - 1]!;
            await this.upsertAcceptance(tx, userId, path, revertEntry.id);
        });
        return inserted[inserted.length - 1]!;
    }

    /** 在一个 SQLite write transaction 中推进一组收件箱接受位点。 */
    private async writeAcceptances(userId: string, groups: InboxGroup[]): Promise<void> {
        const tx = await this.client.transaction("write");
        try {
            for (const group of groups) {
                const revision = group.entries[group.entries.length - 1]!.id;
                await this.upsertAcceptance(tx, userId, group.path, revision);
            }
            await tx.commit();
        } finally {
            tx.close();
        }
    }

    /** 当前处于已删除状态的文件列表(renamed-away 不算删除——文件活在新名下)。 */
    async deletedFiles(): Promise<DeletedFileInfo[]> {
        return this.readTx(async (db) => {
            const lastIds = await lastEntryIdPerName(db);
            const lastEntries = new Map(
                (await loadEntriesByIds(db, [...lastIds.values()])).map((entry) => [entry.id, entry]),
            );
            const deleted: Array<{path: string; deletedAt: string; lastEntryId: number; recoveryHash: string}> = [];
            for (const [name, lastId] of lastIds) {
                const entry = lastEntries.get(lastId);
                if (entry === undefined) {
                    continue;
                }
                const state = classifyEndState(entry, name);
                if (state.kind === "deleted") {
                    deleted.push({path: name, deletedAt: entry.occurredAt, lastEntryId: entry.id, recoveryHash: state.recoveryHash});
                }
            }
            const available = await availableBodies(db, deleted.map((d) => d.recoveryHash));
            return deleted
                .map((d) => ({path: d.path, deletedAt: d.deletedAt, lastEntryId: d.lastEntryId, recoverable: available.has(d.recoveryHash)}))
                .sort((a, b) => a.path.localeCompare(b.path));
        });
    }

    /** 账面视角当前存在的文件列表(名字末态 = exists,hash 为账面末态内容)。宿主 open 后批量对账扫描等场景用。 */
    async liveFiles(): Promise<Array<{path: string; hash: string; lastEntryId: number}>> {
        return this.readTx(async (db) => {
            const lastIds = await lastEntryIdPerName(db);
            const lastEntries = new Map(
                (await loadEntriesByIds(db, [...lastIds.values()])).map((entry) => [entry.id, entry]),
            );
            const live: Array<{path: string; hash: string; lastEntryId: number}> = [];
            for (const [name, lastId] of lastIds) {
                const entry = lastEntries.get(lastId);
                if (entry === undefined) {
                    continue;
                }
                const state = classifyEndState(entry, name);
                if (state.kind === "exists") {
                    live.push({path: name, hash: state.hash, lastEntryId: entry.id});
                }
            }
            return live.sort((a, b) => a.path.localeCompare(b.path));
        });
    }

    /** 用户收件箱(R5):有未接受 agent/system 条目的文件分组。 */
    async inbox(userId: string): Promise<InboxGroup[]> {
        return this.readTx((db) => this.loadInbox(db, userId));
    }

    /** 接受(R5):把该用户在此文件上的位点推进到当前最新条目。path 必须是现名(收件箱展示名)。 */
    async accept(userId: string, path: string): Promise<void> {
        return this.locked(async () => {
            validatePath(path);
            const renames = await loadRenames(this.client);
            const group = await loadGroupEntries(this.client, path, renames);
            if (group.length === 0) {
                throw new HistoryError(`没有该文件的日志记录: ${path}`);
            }
            const maxId = group[group.length - 1]!.id;
            const tx = await this.client.transaction("write");
            try {
                await this.upsertAcceptance(tx, userId, path, maxId);
                await tx.commit();
            } finally {
                tx.close();
            }
        });
    }

    /** 仅当该文件仍是客户端看到的 revision 时推进接受位点。 */
    async acceptAtRevision(userId: string, path: string, expectedRevision: number): Promise<void> {
        return this.locked(async () => {
            validatePath(path);
            const group = (await this.loadInbox(this.client, userId)).find((item) => item.path === path);
            if (!group) {
                throw new HistoryInboxMutationError("missing", `待审文件不存在或已被接受: ${path}`);
            }
            const currentRevision = group.entries[group.entries.length - 1]!.id;
            if (currentRevision !== expectedRevision) {
                throw new HistoryInboxMutationError("stale", `收件箱 revision 已变化: expected=${expectedRevision}, current=${currentRevision}`);
            }
            await this.writeAcceptances(userId, [group]);
        });
    }

    /** 仅当整个收件箱仍是客户端看到的 revision 时，在一个事务中接受全部分组。 */
    async acceptAllAtRevision(userId: string, expectedRevision: number): Promise<number> {
        return this.locked(async () => {
            const groups = await this.loadInbox(this.client, userId);
            const currentRevision = groups.reduce((revision, group) => (
                Math.max(revision, group.entries[group.entries.length - 1]?.id ?? 0)
            ), 0);
            if (currentRevision !== expectedRevision) {
                throw new HistoryInboxMutationError("stale", `收件箱 revision 已变化: expected=${expectedRevision}, current=${currentRevision}`);
            }
            await this.writeAcceptances(userId, groups);
            return groups.length;
        });
    }

    /** 会话未见变更(R6):id > 游标、且非本会话自己产生的条目,按现名分组。游标未初始化时抛错。 */
    async unseenChanges(sessionId: string): Promise<UnseenGroup[]> {
        return this.readTx(async (db) => {
            const cursorResult = await db.execute({
                sql: "SELECT last_seen_entry_id FROM session_cursor WHERE session_id = ?",
                args: [sessionId],
            });
            const cursorRow = cursorResult.rows[0];
            if (cursorRow === undefined) {
                throw new HistoryError(`会话游标未初始化,先调用 initCursor: ${sessionId}`);
            }
            const cursor = Number(cursorRow["last_seen_entry_id"]);
            const renames = await loadRenames(db); // 全量 rename(含本会话的)才能正确解析现名
            const entries = (await loadEntriesAfter(db, cursor))
                .filter((entry) => !(entry.actor.kind === "agent" && entry.actor.sessionId === sessionId));
            const groups = groupByCurrentName(entries, renames);
            const result: UnseenGroup[] = [];
            for (const [name, groupEntries] of groups) {
                const first = groupEntries[0]!;
                const last = groupEntries[groupEntries.length - 1]!;
                result.push({
                    path: name,
                    baseHash: beforeStateHash(first.operation),
                    endHash: afterStateHash(last.operation),
                    entries: groupEntries,
                    maxEntryId: last.id,
                });
            }
            return result.sort((a, b) => a.path.localeCompare(b.path));
        });
    }

    /** 推进游标(单调:只前进不后退)。宿主在提醒成功送达后调用。 */
    async advanceCursor(sessionId: string, entryId: number): Promise<void> {
        return this.locked(() => this.upsertCursor(sessionId, entryId));
    }

    /** 新会话游标初始化:置于当前最大 entry id(新会话不该被全部历史淹没)。 */
    async initCursor(sessionId: string): Promise<void> {
        return this.locked(async () => {
            const result = await this.client.execute("SELECT COALESCE(MAX(id), 0) AS max_id FROM operation_log");
            await this.upsertCursor(sessionId, Number(result.rows[0]!["max_id"]));
        });
    }

    // ── 维护面 ────────────────────────────────────────────────

    /** 执行保留策略(R12):窗口外稀疏化 + 保护规则 + 快照引用计数 GC。 */
    async prune(): Promise<PruneReport> {
        return this.locked(() => runPrune(this.client, this.config, this.clock()));
    }

    /**
     * 删除宿主明确判定为不再受管的路径历史，并在同一事务内清理 acceptance 与孤儿快照。
     * session cursor 保持原位；未来自增 entry id 仍会严格大于既有游标。
     */
    async purgePaths(shouldPurge: (path: string) => boolean): Promise<PathPurgeReport> {
        return this.locked(() => runPathPurge(this.client, shouldPurge));
    }

    /**
     * 释放全部句柄。close 之后必须能在 Windows 上直接删除库文件(T12 验收)。
     *
     * libsql native(bun/Windows 实测)在 client.close() 后并不立即释放文件句柄:
     * 释放发生在 napi finalizer 于 GC 之后的事件循环拍子里。这里主动强制 GC 并
     * 等待若干拍,把「稍后才可删」收敛为「close 返回后即可删」。非 bun 运行时无
     * Bun.gc 可用,只能等待自然 GC(限制记录于 README)。
     */
    async close(): Promise<void> {
        if (this.closed) {
            return; // 幂等:宿主关停路径可能多处调用
        }
        this.closed = true;
        // 等在途操作排空(队列错误已被吞,await 不会抛)
        await this.queue;
        await this.readQueue;
        try {
            await this.client.execute("PRAGMA wal_checkpoint(TRUNCATE);");
        } catch {
            // checkpoint 失败不阻塞关闭
        }
        this.reader.close();
        this.client.close();
        // 经 globalThis 访问 Bun 全局:模块要能在只有 node 类型环境的宿主(无 @types/bun)下 typecheck,
        // 不能直接引用 Bun 标识符;运行时行为不变。
        const bunGc = (globalThis as {Bun?: {gc?: (force: boolean) => void}}).Bun?.gc;
        const forceGc: (() => void) | null = typeof bunGc === "function" ? () => bunGc(true) : null;
        if (forceGc !== null) {
            // 实测释放发生在 1~2 个「GC + 事件循环拍」内;预算 8 拍(~200ms)兜底
            for (let i = 0; i < 8; i++) {
                forceGc();
                await new Promise((resolve) => setTimeout(resolve, 25));
            }
        }
    }

    // ── 内部 ──────────────────────────────────────────────────

    /** 写互斥(R11):写连接上的所有操作串行。 */
    private locked<T>(fn: () => Promise<T>): Promise<T> {
        const run = this.queue.then(fn, fn);
        this.queue = run.catch(() => undefined);
        return run;
    }

    /** 读互斥:读连接单连接,同连接不能并发开事务,查询之间串行(查询本身都很快)。 */
    private readLocked<T>(fn: () => Promise<T>): Promise<T> {
        const run = this.readQueue.then(fn, fn);
        this.readQueue = run.catch(() => undefined);
        return run;
    }

    /** 只读事务(读连接):多条 SELECT 拼装的视图在同一快照上执行,写连接中途提交不会撕裂归组。 */
    private readTx<T>(fn: (db: Sql) => Promise<T>): Promise<T> {
        return this.readLocked(async () => {
            const tx = await this.reader.transaction("read");
            try {
                return await fn(tx);
            } finally {
                tx.close();
            }
        });
    }

    /** 该用户的接受位点全量映射(path → accepted_entry_id)。 */
    private async loadAcceptance(db: Sql, userId: string): Promise<Map<string, number>> {
        const result = await db.execute({
            sql: "SELECT path, accepted_entry_id FROM file_acceptance WHERE user_id = ?",
            args: [userId],
        });
        const acceptance = new Map<string, number>();
        for (const row of result.rows) {
            acceptance.set(String(row["path"]), Number(row["accepted_entry_id"]));
        }
        return acceptance;
    }

    /** libsql blob 值 → Uint8Array;NULL → null;其他类型 = 库被外部改坏,抛错。 */
    private bytesFromBlob(value: unknown, context: string): Uint8Array | null {
        if (value === null || value === undefined) {
            return null;
        }
        if (value instanceof ArrayBuffer) {
            return new Uint8Array(value);
        }
        if (value instanceof Uint8Array) {
            return value;
        }
        throw new HistoryError(`${context} 的 blob 类型异常: ${typeof value}`);
    }

    /** 游标 upsert(单调钳制:只前进不后退)。 */
    private async upsertCursor(sessionId: string, entryId: number): Promise<void> {
        await this.client.execute({
            sql: `INSERT INTO session_cursor (session_id, last_seen_entry_id, updated_at) VALUES (?, ?, ?)
                  ON CONFLICT(session_id) DO UPDATE SET
                      last_seen_entry_id = MAX(last_seen_entry_id, excluded.last_seen_entry_id),
                      updated_at = excluded.updated_at`,
            args: [sessionId, entryId, this.now()],
        });
    }

    private now(): string {
        return this.clock().toISOString();
    }

    private newEntry(actor: OperationActor, operation: FileOperation): NewEntry {
        return {occurredAt: this.now(), actor, operation};
    }

    private absolute(relPath: string): string {
        return this.resolvePath(relPath);
    }

    private async readDisk(relPath: string): Promise<Uint8Array | null> {
        try {
            const buffer = await fs.readFile(this.absolute(relPath));
            return new Uint8Array(buffer.buffer, buffer.byteOffset, buffer.byteLength);
        } catch (error) {
            if ((error as NodeJS.ErrnoException).code === "ENOENT") {
                return null;
            }
            throw error;
        }
    }

    private async writeDisk(relPath: string, bytes: Uint8Array): Promise<void> {
        const abs = this.absolute(relPath);
        await fs.mkdir(nodePath.dirname(abs), {recursive: true});
        await fs.writeFile(abs, bytes);
    }

    /**
     * 写路径内建对账:磁盘实际内容 hash(diskHash)与账面末态不一致时,生成一条
     * external 条目补账(返回单元素数组,一致返回空数组)。使 beforeHash 链恒精确。
     */
    private async implicitReconcile(path: string, diskHash: string | null): Promise<NewEntry[]> {
        const end: NameEndState = await nameEndState(this.client, path);
        const ledgerHash = end.kind === "exists" ? end.hash : null;
        if (ledgerHash === diskHash) {
            return [];
        }
        const actor: OperationActor = {kind: "external"};
        if (diskHash === null) {
            // ledgerHash 必非 null(两者不等)
            return [this.newEntry(actor, {type: "file.delete", path, beforeHash: ledgerHash!})];
        }
        if (ledgerHash === null) {
            return [this.newEntry(actor, {type: "file.create", path, afterHash: diskHash})];
        }
        return [this.newEntry(actor, {type: "file.edit", path, beforeHash: ledgerHash, afterHash: diskHash})];
    }

    private async upsertAcceptance(tx: Transaction, userId: string, path: string, entryId: number): Promise<void> {
        await tx.execute({
            sql: `INSERT INTO file_acceptance (user_id, path, accepted_entry_id, updated_at) VALUES (?, ?, ?, ?)
                  ON CONFLICT(user_id, path) DO UPDATE SET
                      accepted_entry_id = MAX(accepted_entry_id, excluded.accepted_entry_id),
                      updated_at = excluded.updated_at`,
            args: [userId, path, entryId, this.now()],
        });
    }

    /** 快照 upsert:同 hash 幂等;超限 / 二进制只记 hash 行(body NULL,R3)。 */
    private async putSnapshot(tx: Transaction, bytes: Uint8Array): Promise<void> {
        const hash = sha256Hex(bytes);
        const storable = bytes.byteLength <= this.config.maxSnapshotBytes && !looksBinary(bytes);
        await tx.execute({
            sql: "INSERT INTO file_snapshot (hash, body, byte_size, created_at) VALUES (?, ?, ?, ?) ON CONFLICT(hash) DO NOTHING",
            args: [hash, storable ? bytes : null, bytes.byteLength, this.now()],
        });
    }

    /**
     * 快照 + 条目在同一事务内落库(R4:append-only,唯一写入口)。
     * also 回调在同事务内执行(如 revert 推进接受位点),保证账面原子。
     */
    private async appendEntries(
        newEntries: NewEntry[],
        snapshots: Uint8Array[],
        also?: (tx: Transaction, inserted: OperationLogEntry[]) => Promise<void>,
    ): Promise<OperationLogEntry[]> {
        const tx = await this.client.transaction("write");
        try {
            for (const bytes of snapshots) {
                await this.putSnapshot(tx, bytes);
            }
            const inserted: OperationLogEntry[] = [];
            for (const entry of newEntries) {
                const cols = entryToColumns(entry);
                const result = await tx.execute({
                    sql: `INSERT INTO operation_log
                          (occurred_at, actor_kind, actor_user_id, actor_session_id, actor_source, op_type, path, from_path, before_hash, after_hash, reverted_entry_ids, source_entry_id)
                          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                    args: [
                        cols.occurred_at, cols.actor_kind, cols.actor_user_id, cols.actor_session_id, cols.actor_source,
                        cols.op_type, cols.path, cols.from_path, cols.before_hash, cols.after_hash,
                        cols.reverted_entry_ids, cols.source_entry_id,
                    ],
                });
                if (result.lastInsertRowid === undefined) {
                    throw new HistoryError("INSERT 未返回 lastInsertRowid");
                }
                inserted.push({id: Number(result.lastInsertRowid), occurredAt: entry.occurredAt, actor: entry.actor, operation: entry.operation});
            }
            if (also !== undefined) {
                await also(tx, inserted);
            }
            await tx.commit();
            return inserted;
        } finally {
            tx.close(); // 未 commit 时回滚;已 commit 后无害
        }
    }
}
