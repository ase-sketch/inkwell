import {afterEach, describe, expect, test} from "bun:test";
import {appendFile, mkdtemp, readFile, rm, writeFile} from "node:fs/promises";
import {join} from "node:path";
import {tmpdir} from "node:os";
import type {JsonObject} from "../src/json.js";
import {JsonlSessionStore} from "../src/storage/jsonl.js";
import {SessionInvariantError, type SessionCommitResult, type SessionWritePlan} from "../src/session.js";

const directories: string[] = [];

afterEach(async () => {
    await Promise.all(directories.splice(0).map((directory) => rm(directory, {recursive: true, force: true})));
});

async function directory(): Promise<string> {
    const value = await mkdtemp(join(tmpdir(), "neuro-agent-harness-delta-"));
    directories.push(value);
    return value;
}

async function commit(
    store: JsonlSessionStore,
    version: number,
    cause: string,
): Promise<SessionCommitResult<number, JsonObject>> {
    return store.commit({
        target: 1,
        cause,
        operations: [{type: "appendEntries", entries: [{kind: cause, payload: {version}}]}],
    });
}

async function recordKinds(path: string): Promise<string[]> {
    const text = await readFile(path, "utf8");
    return text.split("\n").filter((line) => line.trim().length > 0).map((line) => {
        return (JSON.parse(line) as {kind: string}).kind;
    });
}

function createStore(directoryPath: string, checkpointEvery: number): JsonlSessionStore {
    return new JsonlSessionStore({directory: directoryPath, checkpointEvery});
}

describe("JSONL delta + checkpoint 实验模式（checkpointEvery > 1）", () => {
    test("按间隔交替写 delta 与 checkpoint，读取恢复完整状态", async () => {
        const dir = await directory();
        const store = createStore(dir, 2);
        const created = await store.create({profileKey: "p", sessionId: 1, initial: {}, hostContext: {}});
        expect(created.version).toBe(0);
        for (let i = 1; i <= 4; i += 1) {
            const result = await commit(store, i, `delta.test.${i}`);
            expect(result.snapshot.version).toBe(i);
            expect(result.snapshot.entries).toHaveLength(i);
        }

        const kinds = await recordKinds(join(dir, "sessions", "1.jsonl"));
        expect(kinds).toEqual(["snapshot", "commit", "snapshot", "commit", "snapshot"]);

        const restart = createStore(dir, 2);
        const reread = await restart.read(1);
        expect(reread.version).toBe(4);
        expect(reread.entries.map((entry) => entry.kind)).toEqual([
            "delta.test.1",
            "delta.test.2",
            "delta.test.3",
            "delta.test.4",
        ]);
    });

    test("torn delta 尾残片由下一次 commit 修复且不丢已确认 entry", async () => {
        const dir = await directory();
        const store = createStore(dir, 2);
        await store.create({profileKey: "p", sessionId: 1, initial: {}, hostContext: {}});
        await commit(store, 1, "torn-delta.1");
        await commit(store, 2, "torn-delta.2");
        await commit(store, 3, "torn-delta.3");
        const path = join(dir, "sessions", "1.jsonl");
        await appendFile(path, '{"kind":"commit","version":99');

        const restart = createStore(dir, 2);
        const repaired = await commit(restart, 4, "torn-delta.4");
        expect(repaired.snapshot.version).toBe(4);
        expect(repaired.snapshot.entries.map((entry) => entry.kind)).toEqual([
            "torn-delta.1",
            "torn-delta.2",
            "torn-delta.3",
            "torn-delta.4",
        ]);
    });

    test("torn checkpoint 尾残片由下一次 commit 修复", async () => {
        const dir = await directory();
        const store = createStore(dir, 2);
        await store.create({profileKey: "p", sessionId: 1, initial: {}, hostContext: {}});
        await commit(store, 1, "torn-checkpoint.1");
        await commit(store, 2, "torn-checkpoint.2");
        await commit(store, 3, "torn-checkpoint.3");
        await commit(store, 4, "torn-checkpoint.4");
        const path = join(dir, "sessions", "1.jsonl");
        await appendFile(path, '{"kind":"snapshot","version":9');

        const restart = createStore(dir, 2);
        const repaired = await commit(restart, 5, "torn-checkpoint.5");
        expect(repaired.snapshot.version).toBe(5);
        expect(repaired.snapshot.entries).toHaveLength(5);
    });

    test("中段损坏 fail closed，不把损坏前缀当作真相", async () => {
        const dir = await directory();
        const store = createStore(dir, 2);
        await store.create({profileKey: "p", sessionId: 1, initial: {}, hostContext: {}});
        for (let i = 1; i <= 4; i += 1) {
            await commit(store, i, `mid-corrupt.${i}`);
        }
        const path = join(dir, "sessions", "1.jsonl");
        const lines = (await readFile(path, "utf8")).trimEnd().split("\n");
        lines[2] = '{"kind":"commit","version":99';
        await writeFile(path, `${lines.join("\n")}\n`);

        const restart = createStore(dir, 2);
        await expect(restart.read(1)).rejects.toThrow(SyntaxError);
    });

    test("delta 模式 reconcileInterrupted 把 running Invocation 收口为 interrupted", async () => {
        const dir = await directory();
        const store = createStore(dir, 2);
        await store.create({profileKey: "p", sessionId: 1, initial: {}, hostContext: {}});
        await store.commit({
            target: 1,
            cause: "delta-reconcile.start",
            operations: [{
                type: "startInvocation",
                invocation: {id: "delta-inv-1", sessionId: 1, profileKey: "profile", caller: {kind: "system", name: "test"}, input: {}, createdAt: 1},
            }],
        });
        await commit(store, 1, "delta-reconcile.message");

        const restart = createStore(dir, 2);
        const reconciled = await restart.reconcileInterrupted();
        expect(reconciled.map((record) => `${record.id}:${record.status}`)).toEqual(["delta-inv-1:interrupted"]);
        const after = await restart.read(1);
        expect(after.status).toBe("interrupted");
        expect(after.activeInvocationId).toBeNull();
    });

    test("running Invocation + torn delta 尾残片仍可 reconcile", async () => {
        const dir = await directory();
        const store = createStore(dir, 2);
        await store.create({profileKey: "p", sessionId: 1, initial: {}, hostContext: {}});
        await store.commit({
            target: 1,
            cause: "delta-reconcile-torn.start",
            operations: [{
                type: "startInvocation",
                invocation: {id: "delta-inv-torn", sessionId: 1, profileKey: "profile", caller: {kind: "system", name: "test"}, input: {}, createdAt: 1},
            }],
        });
        await commit(store, 1, "delta-reconcile-torn.message");
        await appendFile(join(dir, "sessions", "1.jsonl"), '{"kind":"commit","version":999');

        const restart = createStore(dir, 2);
        const reconciled = await restart.reconcileInterrupted();
        expect(reconciled.map((record) => `${record.id}:${record.status}`)).toEqual(["delta-inv-torn:interrupted"]);
        const after = await restart.read(1);
        expect(after.status).toBe("interrupted");
        expect(after.activeInvocationId).toBeNull();
    });

    test("写入模式与读取模式解耦：checkpointEvery=2 写入可由 checkpointEvery=1 读取", async () => {
        const dir = await directory();
        const writer = createStore(dir, 2);
        await writer.create({profileKey: "p", sessionId: 1, initial: {}, hostContext: {}});
        for (let i = 1; i <= 4; i += 1) {
            await commit(writer, i, `mode-mix.${i}`);
        }

        const reader = createStore(dir, 1);
        const reread = await reader.read(1);
        expect(reread.version).toBe(4);
        expect(reread.entries.map((entry) => entry.kind)).toEqual([
            "mode-mix.1",
            "mode-mix.2",
            "mode-mix.3",
            "mode-mix.4",
        ]);
    });

    test("同一目录两个 Store 实例在 delta 模式下并发提交都成功且最终状态一致", async () => {
        const dir = await directory();
        const first = createStore(dir, 2);
        const second = createStore(dir, 2);
        await first.create({profileKey: "p", sessionId: 1, initial: {}, hostContext: {}});

        const settled = await Promise.allSettled([
            commit(first, 1, "delta-race.first"),
            commit(second, 1, "delta-race.second"),
        ]);
        expect(settled.map((result) => result.status)).toEqual(["fulfilled", "fulfilled"]);

        const reread = await createStore(dir, 2).read(1);
        expect(reread.version).toBe(2);
        expect(reread.entries.map((entry) => entry.kind).sort()).toEqual(["delta-race.first", "delta-race.second"]);
    });

    test("delta replay 发现 entry ID 重复时 fail closed", async () => {
        const dir = await directory();
        const store = createStore(dir, 2);
        await store.create({profileKey: "p", sessionId: 1, initial: {}, hostContext: {}});
        await commit(store, 1, "dup-id.1");
        await commit(store, 2, "dup-id.2");
        await commit(store, 3, "dup-id.3");
        const path = join(dir, "sessions", "1.jsonl");
        const lines = (await readFile(path, "utf8")).trimEnd().split("\n").map((line) => JSON.parse(line) as {
            kind: string;
            appendedEntries?: ReadonlyArray<{id: string}>;
        });
        const firstDelta = lines.find((record) => record.kind === "commit")!;
        const duplicateId = firstDelta.appendedEntries?.[0]?.id;
        expect(duplicateId).toBeTruthy();
        const secondDelta = lines.filter((record) => record.kind === "commit")[1]!;
        const corrupted = lines.map((record) => {
            if (record !== secondDelta) {
                return record;
            }
            return {
                ...record,
                appendedEntries: [{...record.appendedEntries![0]!, id: duplicateId}],
            };
        });
        await writeFile(path, `${corrupted.map((record) => JSON.stringify(record)).join("\n")}\n`);

        const restart = createStore(dir, 2);
        await expect(restart.read(1)).rejects.toThrow(SessionInvariantError);
    });

    test("checkpoint version 跳跃 fail closed", async () => {
        const dir = await directory();
        const store = createStore(dir, 2);
        await store.create({profileKey: "p", sessionId: 1, initial: {}, hostContext: {}});
        await commit(store, 1, "version-jump.1");
        await commit(store, 2, "version-jump.2");
        const path = join(dir, "sessions", "1.jsonl");
        const lines = (await readFile(path, "utf8")).trimEnd().split("\n").map((line) => JSON.parse(line) as {
            kind: string;
            snapshot?: {version: number};
        });
        const lastCheckpoint = lines.filter((record) => record.kind === "snapshot").at(-1)!;
        const corrupted = lines.map((record) => {
            return record === lastCheckpoint ? {...record, snapshot: {...record.snapshot!, version: record.snapshot!.version + 2}} : record;
        });
        await writeFile(path, `${corrupted.map((record) => JSON.stringify(record)).join("\n")}\n`);

        const restart = createStore(dir, 2);
        await expect(restart.read(1)).rejects.toThrow(SessionInvariantError);
    });

    test("非法 checkpointEvery 在构造时拒绝", async () => {
        for (const value of [0, -1, 1.5, Number.NaN]) {
            const dir = await directory();
            expect(() => createStore(dir, value)).toThrow(/checkpointEvery/);
        }
    });
});
