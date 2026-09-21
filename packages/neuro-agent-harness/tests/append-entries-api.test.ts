import {afterEach, describe, expect, test} from "bun:test";
import {mkdir, mkdtemp, rm, writeFile} from "node:fs/promises";
import {join} from "node:path";
import {tmpdir} from "node:os";
import {
    NeuroAgentHarness,
    ProfileRegistry,
    SessionConflictError,
    SessionInvariantError,
    InvocationOwnershipError,
    defineProfile,
    defineSchema,
    type JsonObject,
} from "../src/index.js";
import {JsonlSessionStore} from "../src/storage/jsonl.js";
import {MemorySessionStore} from "../src/storage/memory.js";

const directories: string[] = [];

afterEach(async () => {
    await Promise.all(directories.splice(0).map((directory) => rm(directory, {recursive: true, force: true})));
});

const objectSchema = defineSchema<JsonObject>((value) => {
    if (value === null || typeof value !== "object" || Array.isArray(value)) {
        throw new Error("必须是 object");
    }
    return value;
});

function registry(): ProfileRegistry {
    return new ProfileRegistry().add(defineProfile({
        manifest: {key: "append-entries", name: "Append Entries"},
        initial: objectSchema,
        payload: objectSchema,
        prepare: () => ({systemPrompt: "append", modelConfig: {}}),
    }));
}

async function tempDirectory(): Promise<string> {
    const directory = await mkdtemp(join(tmpdir(), "neuro-harness-append-entries-"));
    directories.push(directory);
    return directory;
}

// 第一百零二轮：A-C2 便捷原语（appendEntries + JSONL listSessionIds）。
describe("appendEntries 便捷 API", () => {
    test("追加宿主条目并返回快照与游标（Memory Store）", async () => {
        const harness = new NeuroAgentHarness({
            store: new MemorySessionStore(),
            profiles: registry(),
            model: {runTurn: async () => ({message: {role: "assistant", content: [{type: "text", text: "x"}], timestamp: 1}})},
        });
        const created = await harness.createSession({profileKey: "append-entries", initial: {}, hostContext: {}});
        const sessionId = created.session.metadata.sessionId;

        const snapshot = await harness.appendEntries(sessionId, [{kind: "host.note", payload: {text: "hi"}}], {cause: "test.note"});

        expect(snapshot.session.entries.some((entry) => entry.kind === "host.note")).toBe(true);
        expect(snapshot.cursor).toBeDefined();
        await harness.dispose();
    });

    test("空 drafts 拒绝", async () => {
        const harness = new NeuroAgentHarness({
            store: new MemorySessionStore(),
            profiles: registry(),
            model: {runTurn: async () => ({message: {role: "assistant", content: [{type: "text", text: "x"}], timestamp: 1}})},
        });
        const created = await harness.createSession({profileKey: "append-entries", initial: {}, hostContext: {}});

        await expect(harness.appendEntries(created.session.metadata.sessionId, [])).rejects.toThrow("至少需要一条");
        await harness.dispose();
    });

    test("Core-owned kind 被写 admission 拒绝", async () => {
        const harness = new NeuroAgentHarness({
            store: new MemorySessionStore(),
            profiles: registry(),
            model: {runTurn: async () => ({message: {role: "assistant", content: [{type: "text", text: "x"}], timestamp: 1}})},
        });
        const created = await harness.createSession({profileKey: "append-entries", initial: {}, hostContext: {}});

        await expect(harness.appendEntries(created.session.metadata.sessionId, [{kind: "harness.followUp.queued", payload: {id: "x"}}])).rejects.toThrow(SessionInvariantError);
        await harness.dispose();
    });

    test("expectedVersion 过期以 SessionConflictError 失败", async () => {
        const harness = new NeuroAgentHarness({
            store: new MemorySessionStore(),
            profiles: registry(),
            model: {runTurn: async () => ({message: {role: "assistant", content: [{type: "text", text: "x"}], timestamp: 1}})},
        });
        const created = await harness.createSession({profileKey: "append-entries", initial: {}, hostContext: {}});
        const sessionId = created.session.metadata.sessionId;
        const first = await harness.appendEntries(sessionId, [{kind: "host.first", payload: {}}]);

        await expect(harness.appendEntries(sessionId, [{kind: "host.second", payload: {}}], {expectedVersion: first.session.version - 1})).rejects.toThrow(SessionConflictError);
        await harness.dispose();
    });

    test("JSONL：listSessionIds 枚举 + appendEntries 条目在新实例恢复", async () => {
        const directory = await tempDirectory();
        const store = new JsonlSessionStore({directory});
        expect(await store.listSessionIds()).toEqual([]);

        const harness = new NeuroAgentHarness({
            store,
            profiles: registry(),
            model: {runTurn: async () => ({message: {role: "assistant", content: [{type: "text", text: "x"}], timestamp: 1}})},
        });
        const first = await harness.createSession({profileKey: "append-entries", initial: {}, hostContext: {}});
        const second = await harness.createSession({profileKey: "append-entries", initial: {}, hostContext: {}});
        expect(await store.listSessionIds()).toEqual([1, 2]);
        await harness.appendEntries(first.session.metadata.sessionId, [{kind: "host.note", payload: {n: 1}}]);
        await harness.dispose();

        const restarted = new JsonlSessionStore({directory});
        expect(await restarted.listSessionIds()).toEqual([1, 2]);
        const recovered = await restarted.read(first.session.metadata.sessionId);
        expect(recovered.entries.some((entry) => entry.kind === "host.note")).toBe(true);
        expect(recovered.entries.some((entry) => entry.kind === "host.note" && entry.payload !== null && typeof entry.payload === "object" && !Array.isArray(entry.payload) && entry.payload.n === 1)).toBe(true);
        expect(second.session.metadata.sessionId).toBe(2);
    });

    test("expectedActiveInvocationId 透传：idle null 通过，幽灵 owner 抛 InvocationOwnershipError", async () => {
        const harness = new NeuroAgentHarness({
            store: new MemorySessionStore(),
            profiles: registry(),
            model: {runTurn: async () => ({message: {role: "assistant", content: [{type: "text", text: "x"}], timestamp: 1}})},
        });
        const created = await harness.createSession({profileKey: "append-entries", initial: {}, hostContext: {}});
        const sessionId = created.session.metadata.sessionId;

        const idle = await harness.appendEntries(sessionId, [{kind: "host.idle-owner", payload: {}}], {expectedActiveInvocationId: null});
        expect(idle.session.entries.some((entry) => entry.kind === "host.idle-owner")).toBe(true);
        await expect(harness.appendEntries(sessionId, [{kind: "host.ghost-owner", payload: {}}], {expectedActiveInvocationId: "ghost"})).rejects.toThrow(InvocationOwnershipError);
        await harness.dispose();
    });

    test("listSessionIds 忽略非规范文件名并按数值升序返回", async () => {
        const directory = await tempDirectory();
        const sessions = join(directory, "sessions");
        await mkdir(sessions, {recursive: true});
        await writeFile(join(sessions, "01.jsonl"), "{}\n");
        await writeFile(join(sessions, "1e3.jsonl"), "{}\n");
        await writeFile(join(sessions, "-2.jsonl"), "{}\n");
        await writeFile(join(sessions, "notes.txt"), "x\n");
        const store = new JsonlSessionStore({directory});
        expect(await store.listSessionIds()).toEqual([]);

        const harness = new NeuroAgentHarness({
            store,
            profiles: registry(),
            model: {runTurn: async () => ({message: {role: "assistant", content: [{type: "text", text: "x"}], timestamp: 1}})},
        });
        await harness.createSession({sessionId: 10, profileKey: "append-entries", initial: {}, hostContext: {}});
        await harness.createSession({sessionId: 2, profileKey: "append-entries", initial: {}, hostContext: {}});
        await harness.dispose();

        expect(await store.listSessionIds()).toEqual([2, 10]);
        await expect(store.reconcileInterrupted()).resolves.toEqual([]);
    });
});
