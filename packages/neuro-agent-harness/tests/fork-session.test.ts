import {describe, expect, test} from "bun:test";
import {mkdir, mkdtemp, rm, writeFile} from "node:fs/promises";
import {join} from "node:path";
import {tmpdir} from "node:os";
import {
    NeuroAgentHarness,
    ProfileRegistry,
    defineProfile,
    defineSchema,
    type JsonObject,
} from "../src/index.js";
import {projectSessionTranscript} from "../src/session-transcript.js";
import {JsonlSessionStore} from "../src/storage/jsonl.js";
import {MemorySessionStore} from "../src/storage/memory.js";
import {ScriptedModelRuntime} from "../src/testing/index.js";

const objectSchema = defineSchema<JsonObject>((value) => {
    if (value === null || typeof value !== "object" || Array.isArray(value)) {
        throw new Error("必须是 object");
    }
    return value;
});

function profile(key: string) {
    return defineProfile({
        manifest: {key, name: key},
        initial: objectSchema,
        payload: objectSchema,
        prepare: () => ({systemPrompt: key, modelConfig: {}}),
    });
}

function completed(text: string, timestamp = 1) {
    return {
        message: {
            role: "assistant" as const,
            content: [{type: "text" as const, text}],
            timestamp,
        },
    };
}

function createHarness(store: JsonlSessionStore<JsonObject> | MemorySessionStore<number, JsonObject>) {
    return new NeuroAgentHarness({
        store,
        profiles: new ProfileRegistry().add(profile("fork-test")),
        model: new ScriptedModelRuntime([]),
    });
}

async function writeRichSource(directory: string): Promise<void> {
    const sessionsDirectory = join(directory, "sessions");
    await mkdir(sessionsDirectory, {recursive: true});
    const snapshot = {
        metadata: {sessionId: 1, profileKey: "fork-test", initial: {}, hostContext: {}, createdAt: 1},
        version: 0,
        status: "idle",
        activeLeafId: "e6",
        activeInvocationId: null,
        entries: [
            {id: "e0", kind: "agent.message", invocationId: "i1", parentId: null, timestamp: 1, payload: {turn: 0, message: {role: "user", content: [{type: "text", text: "hi"}], timestamp: 1}}},
            {id: "e1", kind: "agent.message", invocationId: "i1", parentId: "e0", timestamp: 2, payload: {turn: 1, message: {role: "assistant", content: [{type: "text", text: "hello"}], timestamp: 2}}},
            {id: "e2", kind: "host.custom", parentId: "e1", timestamp: 3, payload: {x: 1}},
            {id: "e3", kind: "harness.custom", parentId: "e2", timestamp: 4, payload: {extension: true}},
            {id: "e4", kind: "harness.invocation.usage", invocationId: "i1", parentId: "e3", timestamp: 5, payload: {input: 1, output: 1, total: 2}},
            {id: "e5", kind: "harness.invocation.partial", invocationId: "i1", parentId: "e4", timestamp: 6, payload: {turn: 1, content: [{type: "text", text: "partial"}]}},
            {id: "e6", kind: "agent.compaction", invocationId: "i1", parentId: "e5", timestamp: 7, payload: {firstKeptEntryId: "e1", summary: "compacted"}},
            {id: "e7", kind: "harness.followUp.queued", parentId: "e6", timestamp: 8, payload: {id: "q1", kind: "followUp", payload: {text: "follow"}, caller: {kind: "user"}, messageIdentity: "user", createdAt: 8}},
        ],
        invocations: [],
    };
    await writeFile(
        join(sessionsDirectory, "1.jsonl"),
        `${JSON.stringify({kind: "snapshot", cause: "test.fork-source", snapshot, appendedEntryIds: ["e0", "e1", "e2", "e3", "e4", "e5", "e6", "e7"]})}\n`,
        "utf8",
    );
}

describe("forkSession", () => {
    test("复制 active path 的 agent.message 与宿主条目，丢弃 Core-owned 内部事实", async () => {
        const directory = await mkdtemp(join(tmpdir(), "harness-fork-drop-"));
        try {
            await writeRichSource(directory);
            const harness = createHarness(new JsonlSessionStore<JsonObject>({directory}));
            const fork = await harness.forkSession(1);
            const snapshot = fork.session;
            expect(snapshot.entries.map((entry) => entry.kind)).toEqual([
                "agent.message",
                "agent.message",
                "host.custom",
                "harness.custom",
            ]);
            expect(snapshot.entries[0]?.parentId).toBeNull();
            expect(snapshot.entries[1]?.parentId).toBe(snapshot.entries[0]?.id);
            expect(snapshot.entries[2]?.parentId).toBe(snapshot.entries[1]?.id);
            expect(snapshot.entries[3]?.parentId).toBe(snapshot.entries[2]?.id);
            expect(snapshot.entries[2]?.payload).toEqual({x: 1});
            expect(snapshot.entries[3]?.payload).toEqual({extension: true});
            expect(snapshot.entries.every((entry) => entry.invocationId === undefined)).toBe(true);
            expect(snapshot.metadata.parentSessionId).toBe(1);
            expect(snapshot.status).toBe("idle");
            expect(snapshot.invocations).toHaveLength(0);

            const transcript = projectSessionTranscript(snapshot);
            expect(transcript.messages.map((message) => message.content)).toEqual([
                [{type: "text", text: "hi"}],
                [{type: "text", text: "hello"}],
            ]);

            const queue = await harness.followUpState(snapshot.metadata.sessionId);
            expect(queue.items).toHaveLength(0);
            await harness.resumeFollowUps(snapshot.metadata.sessionId);
            expect((await harness.snapshot(snapshot.metadata.sessionId)).session.invocations).toHaveLength(0);

            const source = await harness.snapshot(1);
            expect(source.session.entries).toHaveLength(8);
            await harness.dispose();
        } finally {
            await rm(directory, {recursive: true, force: true});
        }
    });

    test("真实运行后 fork 得到干净副本，不复制旧 Invocation 状态", async () => {
        const harness = new NeuroAgentHarness({
            store: new MemorySessionStore(),
            profiles: new ProfileRegistry().add(profile("fork-real")),
            model: new ScriptedModelRuntime([completed("done")]),
        });
        const created = await harness.createSession({profileKey: "fork-real", initial: {}, hostContext: {}});
        const result = await (await harness.invoke({sessionId: created.session.metadata.sessionId, payload: {}})).result();
        expect(result.status).toBe("completed");

        const fork = await harness.forkSession(created.session.metadata.sessionId);
        expect(fork.session.metadata.profileKey).toBe("fork-real");
        expect(fork.session.metadata.initial).toEqual({});
        expect(fork.session.metadata.parentSessionId).toBe(created.session.metadata.sessionId);
        expect(fork.session.status).toBe("idle");
        expect(fork.session.invocations).toHaveLength(0);
        expect(fork.session.entries.every((entry) => !entry.kind.startsWith("harness.") && entry.kind !== "agent.compaction")).toBe(true);
        const sourceMessages = projectSessionTranscript((await harness.snapshot(created.session.metadata.sessionId)).session).messages;
        const forkMessages = projectSessionTranscript(fork.session).messages;
        expect(forkMessages.map((message) => message.content)).toEqual(sourceMessages.map((message) => message.content));
        await harness.dispose();
    });

    test("fork 支持覆盖 profileKey/initial/hostContext/title", async () => {
        const harness = createHarness(new MemorySessionStore());
        const created = await harness.createSession({profileKey: "fork-test", initial: {}, hostContext: {}});
        const fork = await harness.forkSession(created.session.metadata.sessionId, {
            profileKey: "fork-test",
            initial: {seed: 1},
            hostContext: {project: "override"},
            title: "forked",
        });
        expect(fork.session.metadata.initial).toEqual({seed: 1});
        expect(fork.session.metadata.hostContext).toEqual({project: "override"});
        expect(fork.session.metadata.title).toBe("forked");
        await harness.dispose();
    });

    test("JSONL fork 可持久化并由新 Store 实例读取", async () => {
        const directory = await mkdtemp(join(tmpdir(), "harness-fork-jsonl-"));
        try {
            const harness = new NeuroAgentHarness({
                store: new JsonlSessionStore<JsonObject>({directory}),
                profiles: new ProfileRegistry().add(profile("fork-jsonl")),
                model: new ScriptedModelRuntime([completed("done")]),
            });
            const created = await harness.createSession({profileKey: "fork-jsonl", initial: {}, hostContext: {}});
            await (await harness.invoke({sessionId: created.session.metadata.sessionId, payload: {}})).result();
            const fork = await harness.forkSession(created.session.metadata.sessionId);
            await harness.dispose();

            const restarted = new JsonlSessionStore<JsonObject>({directory});
            const forkSnapshot = await restarted.read(fork.session.metadata.sessionId);
            const forkMessages = projectSessionTranscript(forkSnapshot).messages;
            expect(forkMessages.at(-1)?.content).toEqual([{type: "text", text: "done"}]);
            expect(forkSnapshot.metadata.parentSessionId).toBe(created.session.metadata.sessionId);
        } finally {
            await rm(directory, {recursive: true, force: true});
        }
    });

    test("空 Session fork 返回干净副本", async () => {
        const harness = createHarness(new MemorySessionStore());
        const created = await harness.createSession({profileKey: "fork-test", initial: {}, hostContext: {}});
        const fork = await harness.forkSession(created.session.metadata.sessionId);
        expect(fork.session.entries).toHaveLength(0);
        expect(fork.session.status).toBe("idle");
        await harness.dispose();
    });

    test("未知源 Session fail closed", async () => {
        const harness = createHarness(new MemorySessionStore());
        await expect(harness.forkSession(999)).rejects.toThrow("Session 999 不存在");
        await harness.dispose();
    });
});
