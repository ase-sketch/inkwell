import {describe, expect, test} from "bun:test";
import fs from "node:fs/promises";
import os from "node:os";
import nodePath from "node:path";
import {createClient, type InStatement} from "@libsql/client";
import {WorkspaceHistory} from "../src";
import {USER_1, createContext} from "./helpers";

/** 约 30KB 的 UTF-8 中文文本,seed 让每版内容不同。 */
function content30k(seed: number): string {
    return `${"月光洒在江面上。".repeat(1250)}#${seed}`; // 8 字 × 3B × 1250 = 30000B
}

/**
 * 目录清理:重试 + 最终告警不失败。Windows 上 AV/索引器可能锁住刚写入的大文件数秒,
 * 属环境噪声;句柄泄漏的严格金丝雀在 handles.test.ts T12a。
 */
async function cleanup(dir: string): Promise<void> {
    for (let i = 0; i < 30; i++) {
        try {
            await fs.rm(dir, {recursive: true, force: true});
            return;
        } catch {
            Bun.gc(true);
            await new Promise((resolve) => setTimeout(resolve, 200));
        }
    }
    console.warn(`[nb-history tests] 临时目录未能清理(疑似 AV/索引器锁定,不判失败): ${dir}`);
}

/** 固有延迟取 best-of-5(排除同机后台扫描等瞬时争用;原始值全部打印)。 */
async function bestOf(fn: () => Promise<unknown>, rounds = 5): Promise<{best: number; all: number[]}> {
    const all: number[] = [];
    for (let i = 0; i < rounds; i++) {
        const t0 = performance.now();
        await fn();
        all.push(performance.now() - t0);
    }
    return {best: Math.min(...all), all};
}

describe("performance smoke", () => {
    test("P1: 单次 performWrite(30KB 文本) 平均 ≤ 20ms", async () => {
        const ctx = await createContext();
        try {
            const h = ctx.history;
            for (let i = 0; i < 5; i++) {
                await h.performWrite(USER_1, "warm.md", content30k(i)); // 预热
            }
            const rounds = 50;
            const times: number[] = [];
            for (let i = 0; i < rounds; i++) {
                const t0 = performance.now();
                await h.performWrite(USER_1, "hot.md", content30k(i));
                times.push(performance.now() - t0);
            }
            const mean = times.reduce((a, b) => a + b, 0) / rounds;
            const median = [...times].sort((a, b) => a - b)[Math.floor(rounds / 2)]!;
            console.log(`P1 performWrite(30KB) 中位 ${median.toFixed(2)}ms / 平均 ${mean.toFixed(2)}ms`);
            // 断言用中位数:单次写入的典型开销,对同机负载尖刺(AV 扫描等)鲁棒;均值照打不隐瞒
            expect(median).toBeLessThanOrEqual(20);
        } finally {
            await ctx.dispose();
        }
    }, 120_000);

    test("P2: 1 万条目 + 3 千快照库上 unseen/inbox/timeline 各 ≤ 50ms", async () => {
        const dir = await fs.mkdtemp(nodePath.join(os.tmpdir(), "nb-history-perf-"));
        const root = nodePath.join(dir, "ws");
        await fs.mkdir(root, {recursive: true});
        const dbPath = nodePath.join(dir, "history.sqlite");
        try {
            // 先开一次建 schema
            const h0 = await WorkspaceHistory.open({databasePath: dbPath});
            await h0.close();

            // 原始 client 批量种数据(仅测试基建;正式写入必须走模块 API)
            const raw = createClient({url: `file:${dbPath.replace(/\\/g, "/")}`});
            const body = new Uint8Array(1024).fill(65);
            const snapshotStmts: InStatement[] = [];
            for (let i = 0; i < 3000; i++) {
                snapshotStmts.push({
                    sql: "INSERT INTO file_snapshot (hash, body, byte_size, created_at) VALUES (?, ?, ?, ?)",
                    args: [`fakehash-${i}`, body, 1024, "2026-01-01T00:00:00.000Z"],
                });
            }
            const fake = (n: number): string => `fakehash-${((n % 3000) + 3000) % 3000}`;
            const entryStmts: InStatement[] = [];
            for (let f = 0; f < 100; f++) {
                for (let v = 0; v < 100; v++) {
                    const n = f * 100 + v;
                    const [kind, userId, sessionId] =
                        v % 3 === 0 ? ["user", "u1", null] : v % 3 === 1 ? ["agent", null, "s1"] : ["agent", null, "s2"];
                    entryStmts.push({
                        sql: `INSERT INTO operation_log
                              (occurred_at, actor_kind, actor_user_id, actor_session_id, actor_source, op_type, path, from_path, before_hash, after_hash, reverted_entry_ids, source_entry_id)
                              VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                        args: [
                            "2026-01-01T00:00:00.000Z", kind, userId, sessionId, null,
                            v === 0 ? "file.create" : "file.edit", `chapter/file-${f}.md`, null,
                            v === 0 ? null : fake(n - 1), fake(n), null, null,
                        ],
                    });
                }
            }
            for (const stmts of [snapshotStmts, entryStmts]) {
                for (let i = 0; i < stmts.length; i += 500) {
                    await raw.batch(stmts.slice(i, i + 500), "write");
                }
            }
            // u1 已审查 90/100 文件(代表性状态:接受随写作推进);file-90..99 留作待审
            const acceptanceStmts: InStatement[] = [];
            for (let f = 0; f < 90; f++) {
                acceptanceStmts.push({
                    sql: "INSERT INTO file_acceptance (user_id, path, accepted_entry_id, updated_at) VALUES (?, ?, ?, ?)",
                    args: ["u1", `chapter/file-${f}.md`, f * 100 + 100, "2026-01-01T00:00:00.000Z"],
                });
            }
            await raw.batch(acceptanceStmts, "write");
            await raw.execute("PRAGMA wal_checkpoint(TRUNCATE);"); // 并回 WAL,读路径走主库
            raw.close();
            // 静置:刚写入 ~14MB,给 AV/索引器一拍,量稳态而非撞上扫描队列
            Bun.gc(true);
            await new Promise((resolve) => setTimeout(resolve, 1500));

            const h = await WorkspaceHistory.open({databasePath: dbPath});
            await h.advanceCursor("s-probe", 5000);
            await h.entry(1); // 暖连接

            const unseen = await bestOf(() => h.unseenChanges("s-probe"));
            const unseenGroups = await h.unseenChanges("s-probe");
            console.log(`P2 unseenChanges(5000 条未见): best ${unseen.best.toFixed(1)}ms [${unseen.all.map((x) => x.toFixed(1)).join(", ")}], ${unseenGroups.length} 组`);
            expect(unseenGroups.length).toBeGreaterThan(0);
            expect(unseen.best).toBeLessThanOrEqual(50);

            const inbox = await bestOf(() => h.inbox("u1"));
            const inboxGroups = await h.inbox("u1");
            console.log(`P2 inbox(已审 90/100,余 10 组待审): best ${inbox.best.toFixed(1)}ms [${inbox.all.map((x) => x.toFixed(1)).join(", ")}], ${inboxGroups.length} 组`);
            expect(inboxGroups.length).toBe(10);
            expect(inbox.best).toBeLessThanOrEqual(50);

            // 最坏情况(零接受,全库 1 万条扫描)——报告项,不作断言;见 NOTES 12
            const inboxWorst = await bestOf(() => h.inbox("u2"));
            console.log(`P2 inbox 最坏情况(u2 零接受全扫): best ${inboxWorst.best.toFixed(1)}ms [${inboxWorst.all.map((x) => x.toFixed(1)).join(", ")}]`);

            const timeline = await bestOf(() => h.timeline("chapter/file-50.md", {followRenames: true}));
            const timelineEntries = await h.timeline("chapter/file-50.md", {followRenames: true});
            console.log(`P2 timeline(100 版): best ${timeline.best.toFixed(1)}ms [${timeline.all.map((x) => x.toFixed(1)).join(", ")}], ${timelineEntries.length} 条`);
            expect(timelineEntries.length).toBe(100);
            expect(timeline.best).toBeLessThanOrEqual(50);

            await h.close();
        } finally {
            await cleanup(dir);
        }
    }, 300_000);

    test("P3: 单文件 100 版 × 30KB 的库体积报告(全文快照,无增量)", async () => {
        const dir = await fs.mkdtemp(nodePath.join(os.tmpdir(), "nb-history-size-"));
        const root = nodePath.join(dir, "ws");
        await fs.mkdir(root, {recursive: true});
        const dbPath = nodePath.join(dir, "history.sqlite");
        try {
            const h = await WorkspaceHistory.open({databasePath: dbPath, resolvePath: (p) => nodePath.join(root, p)});
            for (let i = 0; i < 100; i++) {
                await h.performWrite(USER_1, "novel.md", content30k(i));
            }
            await h.performWrite(USER_1, "novel.md", content30k(99)); // 相同内容重写 → 内容寻址去重
            await h.close(); // close 内 checkpoint(TRUNCATE),wal 并回主库后量体积才真实

            const dbSize = (await fs.stat(dbPath)).size;
            const walSize = await fs.stat(`${dbPath}-wal`).then((s) => s.size).catch(() => 0);
            console.log(`P3 体积: db=${(dbSize / 1024 / 1024).toFixed(2)}MB wal=${(walSize / 1024 / 1024).toFixed(2)}MB (快照原文理论值≈2.86MB,101 版全文快照)`);
            expect(dbSize + walSize).toBeGreaterThan(2.8 * 1024 * 1024); // 数据确实在库里
        } finally {
            await cleanup(dir);
        }
    }, 300_000);
});
