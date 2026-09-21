import {describe, expect, test} from "bun:test";
import {AGENT_S1, USER_1, createContext, textHash} from "./helpers";

describe("revert", () => {
    test("T5: agent 新建文件 → user 还原 → 文件删除,agent 会话能看到 revert", async () => {
        const ctx = await createContext();
        try {
            const h = ctx.history;
            await h.initCursor("s1");
            const created = await h.performWrite(AGENT_S1, "draft.md", "AI 草稿");

            const reverted = await h.revert("u1", "draft.md");

            // 基线是「不存在」→ 还原即删除
            expect(await ctx.readDisk("draft.md")).toBeNull();
            expect(reverted.operation.type).toBe("file.revert");
            if (reverted.operation.type === "file.revert") {
                expect(reverted.operation.beforeHash).toBe(await textHash("AI 草稿"));
                expect(reverted.operation.afterHash).toBeNull();
                expect(reverted.operation.revertedEntryIds).toEqual([created.id]);
            }

            // 位点已推进 → 收件箱清空
            expect(await h.inbox("u1")).toHaveLength(0);

            // agent 会话通过未见变更得知被拒:组里恰是 revert 条目(自己的 create 被排除)
            const unseen = await h.unseenChanges("s1");
            expect(unseen).toHaveLength(1);
            expect(unseen[0]!.path).toBe("draft.md");
            expect(unseen[0]!.entries.map((e) => e.operation.type)).toEqual(["file.revert"]);
            expect(unseen[0]!.baseHash).toBe(await textHash("AI 草稿")); // 该会话最后见过的状态 = 自己写的内容
            expect(unseen[0]!.endHash).toBeNull();                       // 现已删除
        } finally {
            await ctx.dispose();
        }
    });

    test("还原编辑段:回到已接受基线,revertedEntryIds 覆盖整段", async () => {
        const ctx = await createContext();
        try {
            const h = ctx.history;
            await h.performWrite(USER_1, "base.md", "基线内容");
            await h.accept("u1", "base.md");

            const e2 = await h.performWrite(AGENT_S1, "base.md", "AI 改动一");
            const e3 = await h.performWrite(AGENT_S1, "base.md", "AI 改动二");

            const reverted = await h.revert("u1", "base.md");
            expect(await ctx.readDisk("base.md")).toBe("基线内容");
            if (reverted.operation.type === "file.revert") {
                expect(reverted.operation.beforeHash).toBe(await textHash("AI 改动二"));
                expect(reverted.operation.afterHash).toBe(await textHash("基线内容"));
                expect(reverted.operation.revertedEntryIds).toEqual([e2.id, e3.id]);
            }

            const timeline = await h.timeline("base.md");
            expect(timeline.map((t) => t.entry.operation.type)).toEqual([
                "file.create", "file.edit", "file.edit", "file.revert",
            ]);
        } finally {
            await ctx.dispose();
        }
    });

    test("没有待还原的收件箱变更时抛错", async () => {
        const ctx = await createContext();
        try {
            const h = ctx.history;
            await h.performWrite(USER_1, "own.md", "自己写的");
            expect(h.revert("u1", "own.md")).rejects.toThrow("没有待还原的收件箱变更");
            expect(h.revert("u1", "ghost.md")).rejects.toThrow("没有该文件的日志记录");
        } finally {
            await ctx.dispose();
        }
    });

    test("条件式 revert 拒绝过期 revision 与未记账的磁盘变化", async () => {
        const ctx = await createContext();
        try {
            const h = ctx.history;
            const first = await h.performWrite(AGENT_S1, "guarded.md", "v1");
            const second = await h.performWrite(AGENT_S1, "guarded.md", "v2");

            await expect(h.revertAtRevision("u1", "guarded.md", first.id)).rejects.toMatchObject({code: "stale"});
            expect(await ctx.readDisk("guarded.md")).toBe("v2");

            await ctx.writeRaw("guarded.md", "external-v3");
            await expect(h.revertAtRevision("u1", "guarded.md", second.id)).rejects.toMatchObject({code: "stale"});
            expect(await ctx.readDisk("guarded.md")).toBe("external-v3");
        } finally {
            await ctx.dispose();
        }
    });
});
