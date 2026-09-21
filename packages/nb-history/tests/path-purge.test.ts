import {describe, expect, test} from "bun:test";
import {createClient} from "@libsql/client";
import {AGENT_S1, USER_1, createContext, textHash} from "./helpers";

describe("purgePaths", () => {
    test("原子删除匹配 path/rename/acceptance，GC 独占快照并保留共享快照", async () => {
        const ctx = await createContext();
        try {
            const h = ctx.history;
            const sharedHash = await textHash("shared");
            const uniqueHash = await textHash("runtime-only");

            await h.performWrite(USER_1, "old-runtime.md", "shared");
            await h.performRename(USER_1, "old-runtime.md", "renamed.md");
            await h.performWrite(USER_1, "keep.md", "shared");
            await h.performWrite(AGENT_S1, "cache/runtime.mjs", "runtime-only");
            await h.accept("u1", "cache/runtime.mjs");

            const report = await h.purgePaths((path) => path === "old-runtime.md" || path.startsWith("cache/"));

            expect(report).toEqual({
                entriesDeleted: 3,
                acceptancesDeleted: 1,
                snapshotsDeleted: 1,
                bytesFreed: new TextEncoder().encode("runtime-only").byteLength,
            });
            expect(await h.timeline("old-runtime.md")).toHaveLength(0);
            expect(await h.timeline("renamed.md")).toHaveLength(0);
            expect(await h.timeline("cache/runtime.mjs")).toHaveLength(0);
            expect(await h.timeline("keep.md")).toHaveLength(1);
            expect(await h.snapshotBody(uniqueHash)).toBeNull();
            expect(await h.snapshotBody(sharedHash)).not.toBeNull();
        } finally {
            await ctx.dispose();
        }
    });

    test("保留 cursor 标量位点，清理后仍能看到未来有效条目", async () => {
        const ctx = await createContext();
        try {
            const h = ctx.history;
            await h.initCursor("session-1");
            const removed = await h.performWrite(USER_1, "cache/runtime.mjs", "runtime");
            await h.advanceCursor("session-1", removed.id);

            await h.purgePaths((path) => path.startsWith("cache/"));
            await h.performWrite(USER_1, "manuscript/ch1.md", "正文");

            expect((await h.unseenChanges("session-1")).map((group) => group.path)).toEqual(["manuscript/ch1.md"]);
        } finally {
            await ctx.dispose();
        }
    });

    test("rename 的 toPath 命中时删除整条 rename，并保留旧名下未命中的历史", async () => {
        const ctx = await createContext();
        try {
            const h = ctx.history;
            await h.performWrite(USER_1, "manuscript/source.md", "shared");
            await h.performRename(USER_1, "manuscript/source.md", "cache/runtime.mjs");

            const report = await h.purgePaths((path) => path.startsWith("cache/"));

            expect(report).toEqual({entriesDeleted: 1, acceptancesDeleted: 0, snapshotsDeleted: 0, bytesFreed: 0});
            expect(await h.timeline("cache/runtime.mjs")).toHaveLength(0);
            expect(await h.timeline("manuscript/source.md")).toHaveLength(1);
        } finally {
            await ctx.dispose();
        }
    });

    test("predicate 抛错时不产生部分删除", async () => {
        const ctx = await createContext();
        try {
            const h = ctx.history;
            const hash = await textHash("keep-on-error");
            await h.performWrite(USER_1, "cache/runtime.mjs", "keep-on-error");

            expect(h.purgePaths(() => {
                throw new Error("predicate failed");
            })).rejects.toThrow("predicate failed");

            expect(await h.timeline("cache/runtime.mjs")).toHaveLength(1);
            expect(await h.snapshotBody(hash)).not.toBeNull();
        } finally {
            await ctx.dispose();
        }
    });

    test("snapshot GC 中途失败时 operation、acceptance 与 snapshot 全部回滚", async () => {
        const ctx = await createContext();
        try {
            const h = ctx.history;
            const cachePath = "cache/runtime.mjs";
            const hash = await textHash("keep-on-transaction-error");
            await h.performWrite(AGENT_S1, cachePath, "keep-on-transaction-error");
            await h.accept("u1", cachePath);
            const raw = createClient({url: `file:${ctx.dbPath.replace(/\\/g, "/")}`});
            await raw.execute("CREATE TRIGGER fail_snapshot_delete BEFORE DELETE ON file_snapshot BEGIN SELECT RAISE(ABORT, 'forced gc failure'); END;");
            raw.close();

            expect(h.purgePaths((path) => path === cachePath)).rejects.toThrow("forced gc failure");

            expect(await h.timeline(cachePath)).toHaveLength(1);
            expect(await h.snapshotBody(hash)).not.toBeNull();
            await h.performWrite(AGENT_S1, cachePath, "after failed purge");
            const inbox = await h.inbox("u1");
            expect(inbox).toHaveLength(1);
            expect(inbox[0]!.entries).toHaveLength(1);
        } finally {
            await ctx.dispose();
        }
    });

    test("predicate 只检查去重路径，不随同一路径的历史条目数增长", async () => {
        const ctx = await createContext();
        try {
            const h = ctx.history;
            for (let index = 0; index < 50; index += 1) {
                await h.performWrite(USER_1, "manuscript/ch1.md", `正文 ${index}`);
            }
            let predicateCalls = 0;

            const report = await h.purgePaths(() => {
                predicateCalls += 1;
                return false;
            });

            expect(predicateCalls).toBe(1);
            expect(report).toEqual({entriesDeleted: 0, acceptancesDeleted: 0, snapshotsDeleted: 0, bytesFreed: 0});
            expect(await h.timeline("manuscript/ch1.md")).toHaveLength(50);
        } finally {
            await ctx.dispose();
        }
    });
});
