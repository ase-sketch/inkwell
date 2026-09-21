import {describe, expect, test} from "bun:test";
import fs from "node:fs/promises";
import os from "node:os";
import nodePath from "node:path";
import {WorkspaceHistory} from "../src";
import {AGENT_S1, USER_1, bytes, createContext, textHash} from "./helpers";

/**
 * registerObservedWrite(观察型记账)与「绝对路径 + 默认 resolvePath」形态。
 *
 * registerObservedWrite 面向拿不到写前内容的宿主(watcher / 事件门):
 * before 由模块从账面末态自动推断,宿主只提供写后内容。
 */
describe("registerObservedWrite", () => {
    test("首写记 create,内容与账面末态相同返回 null(吸收回声)", async () => {
        const ctx = await createContext();
        try {
            const first = await ctx.history.registerObservedWrite(AGENT_S1, "obs.md", bytes("v1"));
            expect(first!.operation).toEqual({type: "file.create", path: "obs.md", afterHash: await textHash("v1")});

            // 宿主对同一内容的观察回声 → null,不重复记账
            const echo = await ctx.history.registerObservedWrite(AGENT_S1, "obs.md", bytes("v1"));
            expect(echo).toBeNull();

            const timeline = await ctx.history.timeline("obs.md");
            expect(timeline).toHaveLength(1);
        } finally {
            await ctx.dispose();
        }
    });

    test("后续写入记 edit,beforeHash = 账面末态 hash(构造性链连续)", async () => {
        const ctx = await createContext();
        try {
            await ctx.history.registerObservedWrite(AGENT_S1, "obs.md", bytes("v1"));
            const second = await ctx.history.registerObservedWrite(AGENT_S1, "obs.md", bytes("v2"));
            expect(second!.operation).toEqual({
                type: "file.edit",
                path: "obs.md",
                beforeHash: await textHash("v1"),
                afterHash: await textHash("v2"),
            });

            // 隐式对账无噪声:账面与磁盘都只有两条(无 external 修正)
            const timeline = await ctx.history.timeline("obs.md");
            expect(timeline).toHaveLength(2);
            expect(timeline.every((item) => item.entry.actor.kind === "agent")).toBe(true);
        } finally {
            await ctx.dispose();
        }
    });

    test("删除后重新出现记 create(账面上是 deleted)", async () => {
        const ctx = await createContext();
        try {
            await ctx.history.performWrite(USER_1, "gone.md", "v1");
            await ctx.history.performDelete(USER_1, "gone.md");
            const revived = await ctx.history.registerObservedWrite(AGENT_S1, "gone.md", bytes("v2"));
            expect(revived!.operation).toEqual({type: "file.create", path: "gone.md", afterHash: await textHash("v2")});
        } finally {
            await ctx.dispose();
        }
    });

    test("账面上 rename 走的名字重新出现记 create", async () => {
        const ctx = await createContext();
        try {
            await ctx.history.performWrite(USER_1, "old.md", "v1");
            await ctx.history.performRename(USER_1, "old.md", "new.md");
            const revived = await ctx.history.registerObservedWrite(AGENT_S1, "old.md", bytes("v2"));
            expect(revived!.operation).toEqual({type: "file.create", path: "old.md", afterHash: await textHash("v2")});
        } finally {
            await ctx.dispose();
        }
    });

    test("收件箱与 unseen 正常归因(agent 条目触发收件箱)", async () => {
        const ctx = await createContext();
        try {
            await ctx.history.registerObservedWrite(AGENT_S1, "obs.md", bytes("v1"));
            const inbox = await ctx.history.inbox("u1");
            expect(inbox).toHaveLength(1);
            expect(inbox[0]!.path).toBe("obs.md");
            expect(inbox[0]!.entries).toHaveLength(1);
        } finally {
            await ctx.dispose();
        }
    });

    test("超大 / 二进制末态:beforeHash 仍取自账面(无需字节,快照行已在库)", async () => {
        const ctx = await createContext({maxSnapshotBytes: 4});
        try {
            // 超限文件:快照 body 不存,但 hash 行在
            const big = new Uint8Array(16).fill(65);
            await ctx.history.registerObservedWrite(AGENT_S1, "big.md", big);
            const snapshot = await ctx.history.snapshotBody(await textHash(String.fromCharCode(65).repeat(16)));
            expect(snapshot).toBeNull(); // body 未保留(超限)

            // 再次写入:beforeHash 从账面取,链仍连续
            const big2 = new Uint8Array(16).fill(66);
            const second = await ctx.history.registerObservedWrite(AGENT_S1, "big.md", big2);
            expect(second!.operation.type).toBe("file.edit");
            const timeline = await ctx.history.timeline("big.md");
            expect(timeline).toHaveLength(2);
        } finally {
            await ctx.dispose();
        }
    });
});

/** 绝对路径 + 默认 resolvePath(缺省原样返回)形态。 */
describe("absolute path form", () => {
    test("open 不传 resolvePath,path 直接是磁盘路径(绝对路径)", async () => {
        const dir = await fs.mkdtemp(nodePath.join(os.tmpdir(), "nb-history-abs-"));
        const dbPath = nodePath.join(dir, "history.sqlite");
        const filePath = nodePath.join(dir, "ws", "a.md");
        await fs.mkdir(nodePath.dirname(filePath), {recursive: true});
        try {
            const history = await WorkspaceHistory.open({databasePath: dbPath});
            await history.performWrite(USER_1, filePath, "绝对路径内容");
            const timeline = await history.timeline(filePath);
            expect(timeline).toHaveLength(1);
            // 磁盘上确实写到了该绝对路径
            expect(await fs.readFile(filePath, "utf-8")).toBe("绝对路径内容");
            await history.close();
        } finally {
            await rmDirRetry(dir);
        }
    });

    test("绝对路径 + registerObservedWrite 直通(DSH 场景形态:宿主已落盘,模块只补记账)", async () => {
        const dir = await fs.mkdtemp(nodePath.join(os.tmpdir(), "nb-history-abs2-"));
        const dbPath = nodePath.join(dir, "history.sqlite");
        const filePath = nodePath.join(dir, "ws", "b.md");
        await fs.mkdir(nodePath.dirname(filePath), {recursive: true});
        try {
            const history = await WorkspaceHistory.open({databasePath: dbPath});
            // registerObservedWrite 不落盘:宿主(write 工具)已写盘,模块只记账
            await fs.writeFile(filePath, "v1", "utf-8");
            const entry = await history.registerObservedWrite(AGENT_S1, filePath, bytes("v1"));
            expect(entry!.operation).toEqual({type: "file.create", path: filePath, afterHash: await textHash("v1")});
            expect(await fs.readFile(filePath, "utf-8")).toBe("v1"); // 磁盘内容由宿主保证
            await history.close();
        } finally {
            await rmDirRetry(dir);
        }
    });

    test("空路径与 NUL 字节被拒绝", async () => {
        const dir = await fs.mkdtemp(nodePath.join(os.tmpdir(), "nb-history-path-"));
        const dbPath = nodePath.join(dir, "history.sqlite");
        try {
            const history = await WorkspaceHistory.open({databasePath: dbPath});
            await expect(history.registerObservedWrite(AGENT_S1, "", bytes("x"))).rejects.toThrow("路径不能为空");
            await expect(history.registerObservedWrite(AGENT_S1, "a\0b", bytes("x"))).rejects.toThrow("NUL");
            await history.close();
        } finally {
            await rmDirRetry(dir);
        }
    });
});

/** 临时目录清理带重试(Windows 上 AV / 索引器可能短时锁住刚关闭的库文件)。 */
async function rmDirRetry(dir: string): Promise<void> {
    for (let i = 0; i < 30; i++) {
        try {
            await fs.rm(dir, {recursive: true, force: true});
            return;
        } catch {
            if (typeof Bun !== "undefined" && Bun.gc) {
                Bun.gc(true);
            }
            await new Promise((resolve) => setTimeout(resolve, 200));
        }
    }
    console.warn(`[nb-history tests] 临时目录未能清理(疑似 AV/索引器锁定,不判失败): ${dir}`);
}
