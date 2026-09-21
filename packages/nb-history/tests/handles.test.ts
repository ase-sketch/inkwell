import {describe, expect, test} from "bun:test";
import fs from "node:fs/promises";
import os from "node:os";
import nodePath from "node:path";
import {WorkspaceHistory} from "../src";

/** T12 句柄释放(Windows 关键验收)。 */
describe("handle release", () => {
    test("T12a: close 之后库文件可直接删除(含 -wal/-shm)", async () => {
        const dir = await fs.mkdtemp(nodePath.join(os.tmpdir(), "nb-history-handle-"));
        const root = nodePath.join(dir, "ws");
        await fs.mkdir(root, {recursive: true});
        const dbPath = nodePath.join(dir, "history.sqlite");

        const history = await WorkspaceHistory.open({databasePath: dbPath, resolvePath: (p) => nodePath.join(root, p)});
        await history.performWrite({kind: "user", userId: "u1"}, "a.md", "内容");
        await history.close();

        // Windows 下句柄未释放会在这里抛 EBUSY / EPERM —— 按缺陷处理,不是环境问题
        await fs.rm(dbPath);
        await fs.rm(`${dbPath}-wal`, {force: true});
        await fs.rm(`${dbPath}-shm`, {force: true});
        await fs.rm(dir, {recursive: true, force: true});
    });

    test("T12b: 两个先后进程依次打开同一库,不报 SQLITE_BUSY", async () => {
        const dir = await fs.mkdtemp(nodePath.join(os.tmpdir(), "nb-history-proc-"));
        const root = nodePath.join(dir, "ws");
        const dbPath = nodePath.join(dir, "history.sqlite");
        const probe = nodePath.join(import.meta.dir, "..", "scripts", "handle-probe.ts");

        try {
            for (const marker of ["first", "second"]) {
                const result = Bun.spawnSync({
                    cmd: [process.execPath, "run", probe, dbPath, root, marker],
                    stdout: "pipe",
                    stderr: "pipe",
                });
                const stdout = result.stdout.toString();
                const stderr = result.stderr.toString();
                expect(stderr).not.toContain("SQLITE_BUSY");
                expect(result.exitCode).toBe(0);
                expect(stdout).toContain("OK");
            }
        } finally {
            await fs.rm(dir, {recursive: true, force: true});
        }
    }, 30_000);
});
