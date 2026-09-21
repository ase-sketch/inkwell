import {describe, expect, test} from "bun:test";
import {AGENT_S1, USER_1, createContext, textHash} from "./helpers";

/** T1 基本时间线 + T11 rename 链。 */
describe("timeline", () => {
    test("T1: create→edit→edit→rename→edit→delete 时间线完整,跨改名,每版内容可取", async () => {
        const ctx = await createContext();
        try {
            const h = ctx.history;
            await h.performWrite(USER_1, "a.md", "v1");
            await h.performWrite(USER_1, "a.md", "v2");
            await h.performWrite(USER_1, "a.md", "v3");
            await h.performRename(USER_1, "a.md", "b.md");
            await h.performWrite(USER_1, "b.md", "v4");
            await h.performDelete(USER_1, "b.md");

            // 不跟 rename:只看 b.md 名下(rename 到达 + edit + delete)
            const plain = await h.timeline("b.md");
            expect(plain.map((t) => t.entry.operation.type)).toEqual(["file.rename", "file.edit", "file.delete"]);

            // 跟 rename:完整六条,前三条 pathAtThatTime = a.md
            const full = await h.timeline("b.md", {followRenames: true});
            expect(full.map((t) => t.entry.operation.type)).toEqual([
                "file.create", "file.edit", "file.edit", "file.rename", "file.edit", "file.delete",
            ]);
            expect(full.slice(0, 3).map((t) => t.pathAtThatTime)).toEqual(["a.md", "a.md", "a.md"]);
            expect(full.slice(3).map((t) => t.pathAtThatTime)).toEqual(["b.md", "b.md", "b.md"]);

            // 每个版本内容可取且逐字节一致
            const versions = ["v1", "v2", "v3", "v4"];
            for (const v of versions) {
                const body = await h.snapshotBody(await textHash(v));
                expect(body).not.toBeNull();
                expect(new TextDecoder().decode(body!)).toBe(v);
            }

            // limit 取最近 N 条
            const limited = await h.timeline("b.md", {followRenames: true, limit: 2});
            expect(limited.map((t) => t.entry.operation.type)).toEqual(["file.edit", "file.delete"]);
        } finally {
            await ctx.dispose();
        }
    });

    test("T11: 多级 rename 链 a→b→c 后 timeline(c) 含全部历史;历代同名不混入", async () => {
        const ctx = await createContext();
        try {
            const h = ctx.history;
            // 一个早已删除的旧 c.md(历代同名文件,不该混进新 c.md 的链)
            await h.performWrite(USER_1, "c.md", "old-c");
            await h.performDelete(USER_1, "c.md");

            await h.performWrite(USER_1, "a.md", "x1");
            await h.performRename(USER_1, "a.md", "b.md");
            await h.performWrite(USER_1, "b.md", "x2");
            await h.performRename(USER_1, "b.md", "c.md");

            const full = await h.timeline("c.md", {followRenames: true});
            expect(full.map((t) => `${t.entry.operation.type}@${t.pathAtThatTime}`)).toEqual([
                "file.create@a.md", "file.rename@b.md", "file.edit@b.md", "file.rename@c.md",
            ]);

            // 不跟 rename:c.md 名下 = 旧文件两条 + rename 到达一条
            const plain = await h.timeline("c.md");
            expect(plain.map((t) => t.entry.operation.type)).toEqual(["file.create", "file.delete", "file.rename"]);
        } finally {
            await ctx.dispose();
        }
    });

    test("历代同名分界:旧文件让出的名字被全新 create 占用后,时间线不缝合旧化身", async () => {
        const ctx = await createContext();
        try {
            const h = ctx.history;
            await h.performWrite(USER_1, "a.md", "旧文件");
            await h.performRename(USER_1, "a.md", "n.md"); // 旧文件曾叫 n.md
            await h.performDelete(USER_1, "n.md");          // 旧文件死亡
            await h.performWrite(USER_1, "n.md", "全新文件"); // 全新 create 占用同名

            // 跟 rename:全新化身从 create 出生,不回溯进旧文件的 a.md 历史
            const full = await h.timeline("n.md", {followRenames: true});
            expect(full.map((t) => t.entry.operation.type)).toEqual(["file.create"]);

            // 不跟 rename:该名字下发生过的一切
            const plain = await h.timeline("n.md");
            expect(plain.map((t) => t.entry.operation.type)).toEqual(["file.rename", "file.delete", "file.create"]);
        } finally {
            await ctx.dispose();
        }
    });

    test("rename 环 a→b→a:回溯终止且分段完整", async () => {
        const ctx = await createContext();
        try {
            const h = ctx.history;
            await h.performWrite(USER_1, "a.md", "r1");
            await h.performRename(USER_1, "a.md", "b.md");
            await h.performWrite(USER_1, "b.md", "r2");
            await h.performRename(USER_1, "b.md", "a.md");

            const full = await h.timeline("a.md", {followRenames: true});
            expect(full.map((t) => `${t.entry.operation.type}@${t.pathAtThatTime}`)).toEqual([
                "file.create@a.md", "file.rename@b.md", "file.edit@b.md", "file.rename@a.md",
            ]);
        } finally {
            await ctx.dispose();
        }
    });

    test("路径校验(R1 通用化):只拒绝空路径与 NUL 字节;绝对路径 / 反斜杠 / .. 不再受限(语义由宿主决定)", async () => {
        const ctx = await createContext();
        try {
            const h = ctx.history;
            // 路径语义已去领域化:同字符串即同一文件,由宿主保证一致性
            await h.performWrite(USER_1, "a/../b.md", "x");
            await h.performWrite(USER_1, "a\\b.md", "y");
            expect(h.performWrite(USER_1, "", "x")).rejects.toThrow("路径不能为空");
            expect(h.performWrite(USER_1, "a\0b.md", "x")).rejects.toThrow("NUL");
        } finally {
            await ctx.dispose();
        }
    });
});

/** T2 删除找回。 */
describe("deleted files & restore", () => {
    test("T2: 删除后可列出、可恢复,时间线延续", async () => {
        const ctx = await createContext();
        try {
            const h = ctx.history;
            await h.performWrite(AGENT_S1, "novel/ch1.md", "第一章 v1");
            await h.performWrite(AGENT_S1, "novel/ch1.md", "第一章 v2");
            const deleted = await h.performDelete(AGENT_S1, "novel/ch1.md");

            expect(await ctx.readDisk("novel/ch1.md")).toBeNull();
            const list = await h.deletedFiles();
            expect(list).toHaveLength(1);
            expect(list[0]!.path).toBe("novel/ch1.md");
            expect(list[0]!.lastEntryId).toBe(deleted.id);
            expect(list[0]!.recoverable).toBe(true);

            // 从 delete 条目恢复(取其 before 态 = v2)
            const restored = await h.restore(USER_1, "novel/ch1.md", deleted.id);
            expect(restored.operation.type).toBe("file.restore");
            expect(await ctx.readDisk("novel/ch1.md")).toBe("第一章 v2");

            // 恢复后不再是已删除;时间线四条不断链
            expect(await h.deletedFiles()).toHaveLength(0);
            const timeline = await h.timeline("novel/ch1.md");
            expect(timeline.map((t) => t.entry.operation.type)).toEqual([
                "file.create", "file.edit", "file.delete", "file.restore",
            ]);
        } finally {
            await ctx.dispose();
        }
    });

    test("restore 恢复任意早期版本(非删除场景)", async () => {
        const ctx = await createContext();
        try {
            const h = ctx.history;
            const first = await h.performWrite(USER_1, "x.md", "v1");
            await h.performWrite(USER_1, "x.md", "v2");
            await h.performWrite(USER_1, "x.md", "v3");

            const restored = await h.restore(USER_1, "x.md", first.id);
            expect(await ctx.readDisk("x.md")).toBe("v1");
            expect(restored.operation.type).toBe("file.restore");
            if (restored.operation.type === "file.restore") {
                expect(restored.operation.beforeHash).toBe(await textHash("v3"));
                expect(restored.operation.afterHash).toBe(await textHash("v1"));
                expect(restored.operation.sourceEntryId).toBe(first.id);
            }
        } finally {
            await ctx.dispose();
        }
    });

    test("liveFiles: 账面存活文件 = 末态 exists(删除与 renamed-away 不算,rename 到达算现名)", async () => {
        const ctx = await createContext();
        try {
            const h = ctx.history;
            await h.performWrite(USER_1, "keep.md", "k1");
            await h.performWrite(USER_1, "gone.md", "g1");
            await h.performDelete(USER_1, "gone.md");
            await h.performWrite(AGENT_S1, "old.md", "o1");
            await h.performRename(AGENT_S1, "old.md", "new.md");

            const live = await h.liveFiles();
            expect(live.map((f) => f.path)).toEqual(["keep.md", "new.md"]);
            expect(live[0]!.hash).toBe(await textHash("k1"));
            expect(live[1]!.hash).toBe(await textHash("o1"));
        } finally {
            await ctx.dispose();
        }
    });
});
