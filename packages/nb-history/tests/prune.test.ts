import {describe, expect, test} from "bun:test";
import {AGENT_S1, USER_1, createContext, textHash} from "./helpers";

describe("prune (R12)", () => {
    test("T10a: 窗口外按日稀疏,每 path 末条保留,快照引用计数 GC,时间线仍可渲染", async () => {
        const ctx = await createContext({retentionFullDays: 90});
        try {
            const h = ctx.history;
            // 第 1 天:v1 v2 v3;第 2 天:v4 v5(user-only,无收件箱保护)
            await h.performWrite(USER_1, "f.md", "v1");
            ctx.clock.advance(60_000);
            await h.performWrite(USER_1, "f.md", "v2");
            ctx.clock.advance(60_000);
            await h.performWrite(USER_1, "f.md", "v3");
            ctx.clock.advanceDays(1);
            await h.performWrite(USER_1, "f.md", "v4");
            ctx.clock.advance(60_000);
            await h.performWrite(USER_1, "f.md", "v5");

            ctx.clock.advanceDays(200); // 全部条目滑出 90 天窗口
            const report = await h.prune();

            // 第 1 天留末条(v2→v3),第 2 天留末条(v4→v5,兼 path 末条);删 3 条
            expect(report.entriesDeleted).toBe(3);
            const timeline = await h.timeline("f.md");
            expect(timeline.map((t) => t.entry.operation.type)).toEqual(["file.edit", "file.edit"]);

            // 快照 GC:v1 只被已删条目引用 → 回收;v2..v5 仍被存活条目引用 → 保留
            expect(await h.snapshotBody(await textHash("v1"))).toBeNull();
            for (const v of ["v2", "v3", "v4", "v5"]) {
                expect(await h.snapshotBody(await textHash(v))).not.toBeNull();
            }
            expect(report.snapshotsDeleted).toBe(1);
            expect(report.bytesFreed).toBeGreaterThan(0);

            // 稀疏化后相邻条目 before/after 链断开是预期(v3 ≠ v4),但 body 都可取
            expect(timeline[0]!.bodyAvailable).toEqual({before: true, after: true});
            expect(timeline[1]!.bodyAvailable).toEqual({before: true, after: true});
        } finally {
            await ctx.dispose();
        }
    });

    test("T10b: 未接受的 agent 收件箱段整段保护;已接受的段正常稀疏", async () => {
        const ctx = await createContext({retentionFullDays: 90});
        try {
            const h = ctx.history;
            // g.md:agent 写 3 版,从未被接受 → 全保护
            await h.performWrite(AGENT_S1, "g.md", "g1");
            await h.performWrite(AGENT_S1, "g.md", "g2");
            await h.performWrite(AGENT_S1, "g.md", "g3");
            // h.md:agent 写 3 版,用户已接受 → 正常稀疏
            await h.performWrite(AGENT_S1, "h.md", "h1");
            await h.performWrite(AGENT_S1, "h.md", "h2");
            await h.performWrite(AGENT_S1, "h.md", "h3");
            await h.accept("u1", "h.md");

            ctx.clock.advanceDays(200);
            const report = await h.prune();

            expect((await h.timeline("g.md"))).toHaveLength(3); // 未接受段一条不少
            expect((await h.timeline("h.md"))).toHaveLength(1); // 同日稀疏到末条
            expect(report.entriesDeleted).toBe(2);
        } finally {
            await ctx.dispose();
        }
    });

    test("T10c: 活跃游标位点之后的条目不稀疏;过老游标不阻止", async () => {
        const ctx = await createContext({retentionFullDays: 90});
        try {
            const h = ctx.history;
            const e1 = await h.performWrite(USER_1, "k.md", "k1");
            ctx.clock.advance(60_000);
            await h.performWrite(USER_1, "k.md", "k2");
            ctx.clock.advance(60_000);
            await h.performWrite(USER_1, "k.md", "k3");

            // 第 199 天:一个活跃会话把游标停在 e1(updated_at 落在 prune 时点的 90 天窗口内)
            ctx.clock.advanceDays(199);
            await h.advanceCursor("s-active", e1.id);

            ctx.clock.advanceDays(1); // 第 200 天 prune
            const report = await h.prune();

            // e2/e3 在活跃游标之后 → 保护;e1 窗口外、非当日末条(当日末条本是 e3)→ 删除
            expect(report.entriesDeleted).toBe(1);
            const timeline = await h.timeline("k.md");
            expect(timeline.map((t) => t.entry.operation.type)).toEqual(["file.edit", "file.edit"]);
        } finally {
            await ctx.dispose();
        }
    });

    test("窗口内条目全量保留(不稀疏)", async () => {
        const ctx = await createContext({retentionFullDays: 90});
        try {
            const h = ctx.history;
            await h.performWrite(USER_1, "w.md", "w1");
            await h.performWrite(USER_1, "w.md", "w2");
            await h.performWrite(USER_1, "w.md", "w3");
            ctx.clock.advanceDays(30); // 仍在窗口内
            const report = await h.prune();
            expect(report.entriesDeleted).toBe(0);
            expect(await h.timeline("w.md")).toHaveLength(3);
        } finally {
            await ctx.dispose();
        }
    });
});
