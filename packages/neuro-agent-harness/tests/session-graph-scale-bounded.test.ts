import {describe, expect, test} from "bun:test";
import type {JsonObject} from "../src/json.js";
import {activeSessionPath} from "../src/session.js";
import {MemorySessionStore} from "../src/storage/memory.js";

// 大 Session 图校验有界回归（第 64 轮）：
// assertSessionEntryGraph 是 O(N) 全图校验；本测试用 10000 条链式 Entry
// 验证 read/activeSessionPath/commit 保持线性。上限取测量值 ~13ms 的
// 百倍余量，只拦截退化为 O(N^2)（分钟级）的回归，不做精确计时断言。
const ENTRY_COUNT = 10_000;
const BATCH_SIZE = 1_000;
const LINEAR_BOUND_MS = 2_000;
const COMMIT_BOUND_MS = 5_000;

async function seedChain(store: MemorySessionStore<number, JsonObject>): Promise<number> {
    const snapshot = await store.create({profileKey: "scale", initial: {}, hostContext: {}});
    const payload = {text: "x".repeat(80)};
    for (let offset = 0; offset < ENTRY_COUNT; offset += BATCH_SIZE) {
        const entries = Array.from({length: Math.min(BATCH_SIZE, ENTRY_COUNT - offset)}, (_, index) => ({
            kind: "scale.entry" as const,
            payload: {...payload, index: offset + index},
        }));
        await store.commit({
            target: snapshot.metadata.sessionId,
            cause: "test.seed-scale-chain",
            operations: [{type: "appendEntries" as const, entries}],
        });
    }
    return snapshot.metadata.sessionId;
}

describe("大 Session 图校验有界", () => {
    test("10000 条链式 Entry 的读、路径与提交保持线性", async () => {
        const store = new MemorySessionStore();
        const sessionId = await seedChain(store);

        const t0 = performance.now();
        const snapshot = await store.read(sessionId);
        const tRead = performance.now() - t0;
        expect(snapshot.entries.length).toBe(ENTRY_COUNT);

        const t1 = performance.now();
        const path = activeSessionPath(snapshot);
        const tPath = performance.now() - t1;
        expect(path.length).toBe(ENTRY_COUNT);
        expect(path[0]?.parentId).toBeNull();

        const t2 = performance.now();
        const result = await store.commit({
            target: sessionId,
            cause: "test.scale-append",
            operations: [{
                type: "appendEntries",
                entries: [{kind: "scale.entry", payload: {text: "x".repeat(80), index: ENTRY_COUNT}}],
            }],
        });
        const tCommit = performance.now() - t2;
        expect(result.snapshot.version).toBe(ENTRY_COUNT / BATCH_SIZE + 1);
        expect(result.snapshot.activeLeafId).toBe(result.entries.at(-1)?.id ?? null);

        expect(tRead).toBeLessThan(LINEAR_BOUND_MS);
        expect(tPath).toBeLessThan(LINEAR_BOUND_MS);
        expect(tCommit).toBeLessThan(COMMIT_BOUND_MS);
    });
});
