// 大 Session 图校验成本探针（第 64 轮）：测量 Memory/JSONL Store 在
// 1000/10000 条 Entry 下的 seed/read/activeSessionPath/commit 耗时，
// 用于判断 assertSessionEntryGraph 的线性边界是否可接受。
// 运行：bun run scripts/bench-parent-graph.ts
import {MemorySessionStore} from "../src/storage/memory.js";
import {JsonlSessionStore} from "../src/storage/jsonl.js";
import {activeSessionPath} from "../src/session.js";
import {mkdtemp, rm} from "node:fs/promises";
import {join} from "node:path";
import {tmpdir} from "node:os";

const sizes = [1000, 10000];
for (const size of sizes) {
    const store = new MemorySessionStore();
    const created = await store.create({profileKey: "bench", initial: {}, hostContext: {}});
    const payload = {text: "x".repeat(80)};
    const t0 = performance.now();
    for (let offset = 0; offset < size; offset += 1000) {
        const batch = Array.from({length: Math.min(1000, size - offset)}, (_, index) => ({
            kind: "bench.entry",
            payload: {...payload, index: offset + index},
        }));
        await store.commit({
            target: created.metadata.sessionId,
            cause: "bench.append",
            operations: [{type: "appendEntries", entries: batch}],
        });
    }
    const tSeed = performance.now() - t0;
    const snapshot = await store.read(created.metadata.sessionId);
    const t1 = performance.now();
    for (let i = 0; i < 50; i += 1) await store.read(created.metadata.sessionId);
    const tRead = (performance.now() - t1) / 50;
    const t2 = performance.now();
    for (let i = 0; i < 50; i += 1) activeSessionPath(snapshot);
    const tPath = (performance.now() - t2) / 50;
    const t3 = performance.now();
    for (let i = 0; i < 50; i += 1) {
        await store.commit({
            target: created.metadata.sessionId,
            cause: "bench.append",
            operations: [{type: "appendEntries", entries: [{kind: "bench.entry", payload}]}],
        });
    }
    const tCommit = (performance.now() - t3) / 50;
    console.log(JSON.stringify({size, tSeedMs: +tSeed.toFixed(1), readMs: +tRead.toFixed(2), pathMs: +tPath.toFixed(2), commitMs: +tCommit.toFixed(2)}));
}

const directory = await mkdtemp(join(tmpdir(), "harness-bench-jsonl-"));
try {
    const jsonl = new JsonlSessionStore({directory});
    const created = await jsonl.create({profileKey: "bench", initial: {}, hostContext: {}});
    const payload = {text: "x".repeat(80)};
    const entries = Array.from({length: 10000}, (_, index) => ({kind: "bench.entry", payload: {...payload, index}}));
    await jsonl.commit({
        target: created.metadata.sessionId,
        cause: "bench.seed",
        operations: [{type: "appendEntries", entries}],
    });
    const t4 = performance.now();
    for (let i = 0; i < 5; i += 1) await jsonl.read(created.metadata.sessionId);
    const tJsonlRead = (performance.now() - t4) / 5;
    await jsonl.dispose?.();
    console.log(JSON.stringify({jsonlRead10000Ms: +tJsonlRead.toFixed(2)}));
} finally {
    await rm(directory, {recursive: true, force: true});
}
