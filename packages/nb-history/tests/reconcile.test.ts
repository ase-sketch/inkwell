import {describe, expect, test} from "bun:test";
import {AGENT_S1, USER_1, bytes, createContext, textHash} from "./helpers";

describe("reconcile", () => {
    test("T7: 外部改 / 删 / 建 → 补 external 条目;同内容再对账 no-op(回声抑制)", async () => {
        const ctx = await createContext();
        try {
            const h = ctx.history;
            await h.performWrite(USER_1, "note.md", "v1");

            // 外部编辑器改内容
            await ctx.writeRaw("note.md", "v2");
            const edited = await h.reconcile("note.md", bytes("v2"));
            expect(edited).not.toBeNull();
            expect(edited!.actor.kind).toBe("external");
            expect(edited!.operation.type).toBe("file.edit");
            if (edited!.operation.type === "file.edit") {
                expect(edited!.operation.beforeHash).toBe(await textHash("v1"));
                expect(edited!.operation.afterHash).toBe(await textHash("v2"));
            }

            // 回声:同内容再对账不产生新条目
            expect(await h.reconcile("note.md", bytes("v2"))).toBeNull();

            // 外部删除
            await ctx.deleteRaw("note.md");
            const deleted = await h.reconcile("note.md", null);
            expect(deleted!.operation.type).toBe("file.delete");
            expect(await h.reconcile("note.md", null)).toBeNull();

            // 账面之外的全新文件
            await ctx.writeRaw("fresh.md", "外来内容");
            const created = await h.reconcile("fresh.md", bytes("外来内容"));
            expect(created!.actor.kind).toBe("external");
            expect(created!.operation.type).toBe("file.create");
        } finally {
            await ctx.dispose();
        }
    });

    test("T8: 崩溃模拟——盘上已写、账未记 → 写入口内建对账补 external,链不断", async () => {
        const ctx = await createContext();
        try {
            const h = ctx.history;
            await h.performWrite(AGENT_S1, "ch.md", "v1");
            // 模拟另一进程崩溃:磁盘变成 v2 但没有记账
            await ctx.writeRaw("ch.md", "v2");
            // agent 下一次写入 → 自动先补 external(v1→v2),再记自己的 edit(v2→v3)
            await h.performWrite(AGENT_S1, "ch.md", "v3");

            const timeline = await h.timeline("ch.md");
            expect(timeline.map((t) => `${t.entry.operation.type}/${t.entry.actor.kind}`)).toEqual([
                "file.create/agent", "file.edit/external", "file.edit/agent",
            ]);

            // beforeHash 链逐段精确
            const [c, x, e] = timeline.map((t) => t.entry.operation);
            if (c!.type === "file.create" && x!.type === "file.edit" && e!.type === "file.edit") {
                expect(x!.beforeHash).toBe(c!.afterHash);
                expect(e!.beforeHash).toBe(x!.afterHash);
                expect(e!.afterHash).toBe(await textHash("v3"));
            }
        } finally {
            await ctx.dispose();
        }
    });

    test("perform 删除 / 改名前同样内建对账", async () => {
        const ctx = await createContext();
        try {
            const h = ctx.history;
            await h.performWrite(USER_1, "d.md", "v1");
            await ctx.writeRaw("d.md", "外部改动");
            await h.performDelete(USER_1, "d.md");

            const timeline = await h.timeline("d.md");
            expect(timeline.map((t) => `${t.entry.operation.type}/${t.entry.actor.kind}`)).toEqual([
                "file.create/user", "file.edit/external", "file.delete/user",
            ]);
            const del = timeline[2]!.entry.operation;
            if (del.type === "file.delete") {
                expect(del.beforeHash).toBe(await textHash("外部改动")); // 记录的是真实被删内容
            }
        } finally {
            await ctx.dispose();
        }
    });
});
