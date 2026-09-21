import {describe, expect, test} from "bun:test";
import {HistoryInboxMutationError} from "../src";
import {AGENT_S1, SYSTEM_SYNC, USER_1, createContext, textHash} from "./helpers";

describe("inbox", () => {
    test("T3: agent 两次修改 → 收件箱一组;accept 清空;再改出新段", async () => {
        const ctx = await createContext();
        try {
            const h = ctx.history;
            await h.performWrite(AGENT_S1, "ch1.md", "v1");
            await h.performWrite(AGENT_S1, "ch1.md", "v2");

            const inbox1 = await h.inbox("u1");
            expect(inbox1).toHaveLength(1);
            expect(inbox1[0]!.path).toBe("ch1.md");
            expect(inbox1[0]!.baseHash).toBeNull(); // 段以 create 开头 → 基准是「不存在」
            expect(inbox1[0]!.endHash).toBe(await textHash("v2"));
            expect(inbox1[0]!.entries).toHaveLength(2);

            await h.accept("u1", "ch1.md");
            expect(await h.inbox("u1")).toHaveLength(0);

            await h.performWrite(AGENT_S1, "ch1.md", "v3");
            const inbox2 = await h.inbox("u1");
            expect(inbox2).toHaveLength(1);
            expect(inbox2[0]!.baseHash).toBe(await textHash("v2")); // 新段基准 = 接受位点后的 before 态
            expect(inbox2[0]!.entries).toHaveLength(1);
        } finally {
            await ctx.dispose();
        }
    });

    test("T4: agent→user→agent 交错编辑,单组三条如实归因,基准正确", async () => {
        const ctx = await createContext();
        try {
            const h = ctx.history;
            await h.performWrite(USER_1, "f.md", "v1");
            await h.accept("u1", "f.md");

            await h.performWrite(AGENT_S1, "f.md", "v2");
            await h.performWrite(USER_1, "f.md", "v3");
            await h.performWrite(AGENT_S1, "f.md", "v4");

            const inbox = await h.inbox("u1");
            expect(inbox).toHaveLength(1);
            const group = inbox[0]!;
            expect(group.entries.map((e) => e.actor.kind)).toEqual(["agent", "user", "agent"]);
            expect(group.baseHash).toBe(await textHash("v1")); // 位点后第一条(agent edit)的 before 态
            expect(group.endHash).toBe(await textHash("v4"));
        } finally {
            await ctx.dispose();
        }
    });

    test("仅 user / external 条目不触发收件箱;system 条目触发", async () => {
        const ctx = await createContext();
        try {
            const h = ctx.history;
            await h.performWrite(USER_1, "mine.md", "私人笔记");
            expect(await h.inbox("u1")).toHaveLength(0); // 用户自己的写入不进收件箱

            await h.performWrite(SYSTEM_SYNC, "synced.md", "平台同步内容");
            const inbox = await h.inbox("u1");
            expect(inbox).toHaveLength(1);
            expect(inbox[0]!.path).toBe("synced.md");
        } finally {
            await ctx.dispose();
        }
    });

    test("rename 归组:改名后收件箱归并到现名,accept 现名生效", async () => {
        const ctx = await createContext();
        try {
            const h = ctx.history;
            await h.performWrite(AGENT_S1, "x.md", "内容");
            await h.performRename(AGENT_S1, "x.md", "y.md");

            const inbox = await h.inbox("u1");
            expect(inbox).toHaveLength(1);
            expect(inbox[0]!.path).toBe("y.md");
            expect(inbox[0]!.entries).toHaveLength(2); // create + rename

            await h.accept("u1", "y.md");
            expect(await h.inbox("u1")).toHaveLength(0);
        } finally {
            await ctx.dispose();
        }
    });

    test("条件式 accept 与 acceptAll 在写锁内拒绝过期 revision", async () => {
        const ctx = await createContext();
        try {
            const h = ctx.history;
            const first = await h.performWrite(AGENT_S1, "a.md", "a1");
            const second = await h.performWrite(AGENT_S1, "b.md", "b1");
            await h.performWrite(AGENT_S1, "a.md", "a2");

            await expect(h.acceptAtRevision("u1", "a.md", first.id)).rejects.toMatchObject({
                name: "HistoryInboxMutationError",
                code: "stale",
            } satisfies Partial<HistoryInboxMutationError>);
            await expect(h.acceptAllAtRevision("u1", second.id)).rejects.toMatchObject({
                name: "HistoryInboxMutationError",
                code: "stale",
            } satisfies Partial<HistoryInboxMutationError>);
            expect(await h.inbox("u1")).toHaveLength(2);

            const current = await h.inbox("u1");
            const revision = Math.max(...current.flatMap((group) => group.entries.map((entry) => entry.id)));
            expect(await h.acceptAllAtRevision("u1", revision)).toBe(2);
            expect(await h.inbox("u1")).toHaveLength(0);
            await expect(h.acceptAtRevision("u1", "a.md", revision)).rejects.toMatchObject({code: "missing"});
        } finally {
            await ctx.dispose();
        }
    });
});
