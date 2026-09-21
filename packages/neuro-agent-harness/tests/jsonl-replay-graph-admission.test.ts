import {describe, expect, test} from "bun:test";
import {mkdir, mkdtemp, rm, writeFile} from "node:fs/promises";
import {join} from "node:path";
import {tmpdir} from "node:os";
import type {JsonObject} from "../src/json.js";
import type {SessionSnapshot} from "../src/session.js";
import {JsonlSessionStore} from "../src/storage/jsonl.js";

// JSONL 跨 record replay 图 admission gate（第 65 轮）：
// replay 在逐 record 合并时只检查 version 连续与跨 record 重复 ID；
// 环、悬挂 parent 与同批重复 ID 由最终 normalizeSessionSnapshot 的
// assertSessionEntryGraph 兜底。本文件锁定「损坏历史必须 read fail closed」
// 的恢复边界，防止未来重构静默接受 malformed graph。
function emptySnapshot(activeLeafId: string | null): SessionSnapshot<number, JsonObject> {
    return {
        metadata: {
            sessionId: 1,
            profileKey: "jsonl-replay-graph",
            initial: {},
            hostContext: {},
            createdAt: 1,
        },
        version: 0,
        status: "idle",
        activeLeafId,
        activeInvocationId: null,
        entries: [],
        invocations: [],
    };
}

function commitRecord(version: number, appendedEntries: SessionSnapshot<number, JsonObject>["entries"]) {
    return {
        kind: "commit" as const,
        cause: "test.replay-graph",
        version,
        metadata: emptySnapshot(null).metadata,
        status: "idle" as const,
        activeLeafId: appendedEntries.at(-1)?.id ?? null,
        activeInvocationId: null,
        appendedEntries,
        invocations: [],
    };
}

async function writeSessionFile(directory: string, records: unknown[]): Promise<void> {
    const sessionsDirectory = join(directory, "sessions");
    await mkdir(sessionsDirectory, {recursive: true});
    await writeFile(join(sessionsDirectory, "1.jsonl"), records.map((record) => `${JSON.stringify(record)}\n`).join(""), "utf8");
}

describe("JSONL 跨 record replay 图 admission", () => {
    test("跨 record 重复 Entry ID 在 replay 边界 fail closed", async () => {
        const directory = await mkdtemp(join(tmpdir(), "harness-replay-dup-"));
        try {
            await writeSessionFile(directory, [
                {
                    kind: "snapshot",
                    cause: "test.replay-graph",
                    snapshot: {
                        ...emptySnapshot("entry-a"),
                        entries: [{id: "entry-a", kind: "test.a", parentId: null, payload: {}, timestamp: 1}],
                    },
                    appendedEntryIds: ["entry-a"],
                },
                commitRecord(1, [{id: "entry-a", kind: "test.a", parentId: null, payload: {}, timestamp: 2}]),
            ]);
            const store = new JsonlSessionStore<JsonObject>({directory});
            await expect(store.read(1)).rejects.toThrow("JSONL commit entry ID 重复");
        } finally {
            await rm(directory, {recursive: true, force: true});
        }
    });

    test("同一 commit record 内的重复 Entry ID 由全图校验 fail closed", async () => {
        const directory = await mkdtemp(join(tmpdir(), "harness-replay-same-batch-"));
        try {
            await writeSessionFile(directory, [
                {kind: "snapshot", cause: "test.replay-graph", snapshot: emptySnapshot(null), appendedEntryIds: []},
                commitRecord(1, [
                    {id: "entry-a", kind: "test.a", parentId: null, payload: {}, timestamp: 1},
                    {id: "entry-a", kind: "test.a", parentId: null, payload: {}, timestamp: 2},
                ]),
            ]);
            const store = new JsonlSessionStore<JsonObject>({directory});
            await expect(store.read(1)).rejects.toThrow("Entry ID entry-a 重复");
        } finally {
            await rm(directory, {recursive: true, force: true});
        }
    });

    test("跨 record 组成的 Entry 环由全图校验 fail closed", async () => {
        const directory = await mkdtemp(join(tmpdir(), "harness-replay-cycle-"));
        try {
            await writeSessionFile(directory, [
                {
                    kind: "snapshot",
                    cause: "test.replay-graph",
                    snapshot: {
                        ...emptySnapshot("entry-b"),
                        entries: [{id: "entry-b", kind: "test.b", parentId: "entry-a", payload: {}, timestamp: 1}],
                    },
                    appendedEntryIds: ["entry-b"],
                },
                commitRecord(1, [{id: "entry-a", kind: "test.a", parentId: "entry-b", payload: {}, timestamp: 2}]),
            ]);
            const store = new JsonlSessionStore<JsonObject>({directory});
            await expect(store.read(1)).rejects.toThrow("Entry parent cycle detected");
        } finally {
            await rm(directory, {recursive: true, force: true});
        }
    });

    test("跨 record 引入的悬挂 parent 由全图校验 fail closed", async () => {
        const directory = await mkdtemp(join(tmpdir(), "harness-replay-dangling-"));
        try {
            await writeSessionFile(directory, [
                {
                    kind: "snapshot",
                    cause: "test.replay-graph",
                    snapshot: {
                        ...emptySnapshot("entry-b"),
                        entries: [{id: "entry-b", kind: "test.b", parentId: null, payload: {}, timestamp: 1}],
                    },
                    appendedEntryIds: ["entry-b"],
                },
                commitRecord(1, [{id: "entry-a", kind: "test.a", parentId: "missing-parent", payload: {}, timestamp: 2}]),
            ]);
            const store = new JsonlSessionStore<JsonObject>({directory});
            await expect(store.read(1)).rejects.toThrow("Entry parent missing-parent 不存在");
        } finally {
            await rm(directory, {recursive: true, force: true});
        }
    });
});
