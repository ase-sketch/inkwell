import {describe, expect, test} from "bun:test";
import {AGENT_S1, AGENT_S2, USER_1, createContext, textHash} from "./helpers";

describe("session cursor", () => {
    test("T6: 多会话重开——重开的老会话看到别人的变更,不含自己的;新会话干净", async () => {
        const ctx = await createContext();
        try {
            const h = ctx.history;
            await h.initCursor("s1");                                   // S1 建立(头部 = 0)
            await h.performWrite(AGENT_S1, "A.md", "v1");                // e1: S1 写 A
            const e2 = await h.performWrite(USER_1, "A.md", "v2");       // e2: 用户改 A
            await h.initCursor("s2");                                    // S2 建立(头部 = e2)
            const e3 = await h.performWrite(AGENT_S2, "B.md", "w1");     // e3: S2 写 B

            // 重开 S1:看到用户对 A 的修改 + S2 对 B 的创建;自己写的 e1 不出现
            const unseenS1 = await h.unseenChanges("s1");
            expect(unseenS1.map((g) => g.path)).toEqual(["A.md", "B.md"]);

            const groupA = unseenS1[0]!;
            expect(groupA.entries.map((e) => e.id)).toEqual([e2.id]);
            expect(groupA.baseHash).toBe(await textHash("v1")); // S1 最后见过的状态 = 自己写的 v1
            expect(groupA.endHash).toBe(await textHash("v2"));
            expect(groupA.maxEntryId).toBe(e2.id);

            const groupB = unseenS1[1]!;
            expect(groupB.entries.map((e) => e.id)).toEqual([e3.id]);
            expect(groupB.baseHash).toBeNull(); // 上次见时文件不存在
            expect(groupB.endHash).toBe(await textHash("w1"));

            // S2:e3 是自己写的,e1/e2 在初始化位点之前 → 无未见变更
            expect(await h.unseenChanges("s2")).toHaveLength(0);

            // 宿主注入提醒后推进游标 → 清空
            await h.advanceCursor("s1", e3.id);
            expect(await h.unseenChanges("s1")).toHaveLength(0);
        } finally {
            await ctx.dispose();
        }
    });

    test("游标未初始化抛错;游标单调不回退", async () => {
        const ctx = await createContext();
        try {
            const h = ctx.history;
            expect(h.unseenChanges("nobody")).rejects.toThrow("游标未初始化");

            await h.initCursor("s1");
            const e1 = await h.performWrite(USER_1, "n.md", "v1");
            const e2 = await h.performWrite(USER_1, "n.md", "v2");
            await h.advanceCursor("s1", e2.id);
            await h.advanceCursor("s1", e1.id); // 试图回退 → 应被夹住
            expect(await h.unseenChanges("s1")).toHaveLength(0);
        } finally {
            await ctx.dispose();
        }
    });
});
