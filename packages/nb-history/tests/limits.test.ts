import {describe, expect, test} from "bun:test";
import {AGENT_S1, USER_1, createContext, textHash} from "./helpers";
import {sha256Hex} from "../src/hash";

describe("snapshot limits", () => {
    test("T9: 超限文件只记事件不存 body;diff 报缺失;restore 明确报错", async () => {
        const ctx = await createContext({maxSnapshotBytes: 64});
        try {
            const h = ctx.history;
            const big = "长".repeat(100); // 300 字节 > 64
            const entry = await h.performWrite(USER_1, "big.md", big);

            expect(entry.operation.type).toBe("file.create"); // 事件照记
            const hash = await textHash(big);
            expect(await h.snapshotBody(hash)).toBeNull();    // body 未保留

            const diff = await h.textDiff(null, hash);
            expect(diff).toEqual({available: false, reason: "after-missing"});

            expect(h.restore(USER_1, "big.md", entry.id)).rejects.toThrow("无法恢复");
        } finally {
            await ctx.dispose();
        }
    });

    test("T9: 二进制文件(含 NUL)只记事件;diff 报 binary;restore 报错", async () => {
        const ctx = await createContext({maxSnapshotBytes: 1024});
        try {
            const h = ctx.history;
            const binary = new Uint8Array([1, 2, 0, 3, 4]); // 含 NUL → 二进制
            const entry = await h.performWrite(AGENT_S1, "blob.bin", binary);

            const hash = sha256Hex(binary);
            expect(await h.snapshotBody(hash)).toBeNull();

            // byte_size 在上限内却没存 body → 推断为二进制
            const diff = await h.textDiff(null, hash);
            expect(diff).toEqual({available: false, reason: "binary"});

            expect(h.restore(USER_1, "blob.bin", entry.id)).rejects.toThrow("无法恢复");

            // 二进制文件的收件箱 / 时间线不受影响(bodyAvailable 如实为 false)
            const timeline = await h.timeline("blob.bin");
            expect(timeline).toHaveLength(1);
            expect(timeline[0]!.bodyAvailable.after).toBe(false);
        } finally {
            await ctx.dispose();
        }
    });

    test("正常小文本不受影响:body 可取,diff 可用", async () => {
        const ctx = await createContext({maxSnapshotBytes: 64});
        try {
            const h = ctx.history;
            await h.performWrite(USER_1, "s.md", "hello\n");
            await h.performWrite(USER_1, "s.md", "hello world\n");
            const diff = await h.textDiff(await textHash("hello\n"), await textHash("hello world\n"));
            expect(diff.available).toBe(true);
            if (diff.available) {
                expect(diff.beforeText).toBe("hello\n");
                expect(diff.afterText).toBe("hello world\n");
                expect(diff.changes.length).toBeGreaterThan(0);
            }
        } finally {
            await ctx.dispose();
        }
    });
});
