import fs from "node:fs/promises";
import os from "node:os";
import nodePath from "node:path";
import {WorkspaceHistory} from "../src";
import type {HistoryConfig, OperationActor} from "../src";

/** 测试用固定起点假钟(prune / updated_at 语义依赖时间可控)。 */
export type FakeClock = {
    now(): Date;
    /** 前进指定毫秒 */
    advance(ms: number): void;
    /** 前进指定天数 */
    advanceDays(days: number): void;
};

export type TestContext = {
    history: WorkspaceHistory;
    root: string;
    dbPath: string;
    clock: FakeClock;
    /** 绕过模块直接写盘(模拟外部编辑器) */
    writeRaw(path: string, content: string): Promise<void>;
    /** 绕过模块直接删盘 */
    deleteRaw(path: string): Promise<void>;
    /** 读磁盘文件文本;null = 不存在 */
    readDisk(path: string): Promise<string | null>;
    /** 关库 + 清理临时目录 */
    dispose(): Promise<void>;
};

export const USER_1: OperationActor = {kind: "user", userId: "u1"};
export const AGENT_S1: OperationActor = {kind: "agent", sessionId: "s1"};
export const AGENT_S2: OperationActor = {kind: "agent", sessionId: "s2"};
export const SYSTEM_SYNC: OperationActor = {kind: "system", source: "template-sync"};

export async function createContext(config?: Partial<HistoryConfig>): Promise<TestContext> {
    const dir = await fs.mkdtemp(nodePath.join(os.tmpdir(), "nb-history-test-"));
    const root = nodePath.join(dir, "ws");
    await fs.mkdir(root, {recursive: true});
    const dbPath = nodePath.join(dir, "history.sqlite");

    let nowMs = Date.parse("2026-01-01T00:00:00.000Z");
    const clock: FakeClock = {
        now: () => new Date(nowMs),
        advance: (ms) => {
            nowMs += ms;
        },
        advanceDays: (days) => {
            nowMs += days * 24 * 60 * 60 * 1000;
        },
    };

    const history = await WorkspaceHistory.open({
        databasePath: dbPath,
        // 测试用相对路径(如 "manuscript/ch1.md")写日志,落盘经 resolvePath 解析到临时根。
        resolvePath: (path) => nodePath.join(root, path),
        config,
        clock: clock.now,
    });

    return {
        history,
        root,
        dbPath,
        clock,
        async writeRaw(path, content) {
            const abs = nodePath.join(root, path);
            await fs.mkdir(nodePath.dirname(abs), {recursive: true});
            await fs.writeFile(abs, content, "utf-8");
        },
        async deleteRaw(path) {
            await fs.rm(nodePath.join(root, path));
        },
        async readDisk(path) {
            try {
                return await fs.readFile(nodePath.join(root, path), "utf-8");
            } catch (error) {
                if ((error as NodeJS.ErrnoException).code === "ENOENT") {
                    return null;
                }
                throw error;
            }
        },
        async dispose() {
            await history.close();
            // 临时目录清理带重试:Windows 上杀毒/索引器可能锁住刚写入的文件数百毫秒到数秒。
            // 句柄泄漏的严格金丝雀是 handles.test.ts 的 T12a(close 后直删库文件,无重试);
            // 这里清理失败只告警不失败,避免环境噪声污染无关用例。
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
        },
    };
}

/** 文本内容的 sha256(与模块同算法),断言 hash 用。 */
export async function textHash(content: string): Promise<string> {
    const {sha256Hex, toBytes} = await import("../src/hash");
    return sha256Hex(toBytes(content));
}

/** 文本 → UTF-8 原始字节(reconcile 等 Uint8Array 入参用)。 */
export function bytes(content: string): Uint8Array {
    return new TextEncoder().encode(content);
}
