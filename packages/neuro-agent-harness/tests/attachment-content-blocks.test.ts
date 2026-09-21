import {afterEach, describe, expect, test} from "bun:test";
import {mkdtemp, rm} from "node:fs/promises";
import {join} from "node:path";
import {tmpdir} from "node:os";
import {
    NeuroAgentHarness,
    ProfileRegistry,
    createAgentMessageEntryDraft,
    defineProfile,
    defineSchema,
    userMessageText,
    type AgentMessage,
    type AgentUserContentBlock,
    type JsonObject,
    type JsonValue,
} from "../src/index.js";
import {JsonlSessionStore} from "../src/storage/jsonl.js";
import {MemorySessionStore} from "../src/storage/memory.js";
import {ScriptedModelRuntime} from "../src/testing/index.js";
import {sessionMessages} from "../src/session-transcript.js";

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

function userBlocks(content: string | readonly AgentUserContentBlock[], timestamp: number): Extract<AgentMessage, {role: "user"}> {
    return {role: "user", content, timestamp};
}

function assistant(content: string, timestamp: number): Extract<AgentMessage, {role: "assistant"}> {
    return {role: "assistant", content: [{type: "text", text: content}], timestamp};
}

async function tempDirectory(): Promise<string> {
    const directory = await mkdtemp(join(tmpdir(), "neuro-harness-attachment-blocks-"));
    directories.push(directory);
    return directory;
}

// 第一百零四轮（ADR-0040）：attachment 引用内容块最小 Core seam。
describe("attachment 引用内容块 seam", () => {
    test("userMessageText：字符串原样，块数组拼接并降级 attachment 为 marker", () => {
        expect(userMessageText(userBlocks("plain", 1))).toBe("plain");
        expect(userMessageText(userBlocks([
            {type: "text", text: "look at "},
            {type: "attachment", attachment: {id: "a1", mimeType: "image/png", bytes: 123}, name: "photo.png"},
            {type: "text", text: " end"},
        ], 2))).toBe("look at [attachment omitted: image/png, 123 bytes, photo.png] end");
        expect(userMessageText(userBlocks([
            {type: "attachment", attachment: {id: "a2", mimeType: "image/jpeg", bytes: 42}},
        ], 3))).toBe("[attachment omitted: image/jpeg, 42 bytes]");
    });

    test("attachment 块经 JSONL 往返恢复并经 sessionMessages 投影，不读 blob", async () => {
        const directory = await tempDirectory();
        const store = new JsonlSessionStore({directory});
        const harness = new NeuroAgentHarness({
            store,
            profiles: new ProfileRegistry().add(defineProfile({
                manifest: {key: "attachment-roundtrip", name: "Attachment Roundtrip"},
                initial: objectSchema,
                payload: objectSchema,
                prepare: () => ({systemPrompt: "attachment", modelConfig: {}}),
            })),
            model: {runTurn: async () => ({message: assistant("done", 1)})},
        });
        const created = await harness.createSession({profileKey: "attachment-roundtrip", initial: {}, hostContext: {}});
        const sessionId = created.session.metadata.sessionId;
        const blocks: readonly AgentUserContentBlock[] = [
            {type: "text", text: "check "},
            {type: "attachment", attachment: {id: "img-1", mimeType: "image/png", bytes: 456}},
        ];
        await harness.appendEntries(sessionId, [createAgentMessageEntryDraft(userBlocks(blocks, 5), {
            turn: 0,
            invocationId: "attachment-1",
        })]);
        await harness.dispose();

        const restarted = new JsonlSessionStore({directory});
        const recovered = await restarted.read(sessionId);
        const messageEntry = recovered.entries.find((entry) => entry.kind === "agent.message" && entry.payload !== null && typeof entry.payload === "object" && !Array.isArray(entry.payload) && (entry.payload as {message?: unknown}).message !== undefined);
        expect(messageEntry).toBeDefined();
        const payload = messageEntry!.payload as {message: Extract<AgentMessage, {role: "user"}>};
        expect(payload.message.role).toBe("user");
        expect(payload.message.content).toEqual(blocks);
        expect(userMessageText(payload.message)).toContain("[attachment omitted: image/png, 456 bytes]");
        const projected = sessionMessages<number, JsonObject>(recovered);
        const projectedUser = projected.find((message) => message.role === "user" && Array.isArray(message.content));
        expect(projectedUser).toBeDefined();
    });

    test("prepareWrites 块贡献自动注入模型请求（ADR-0039 组合）", async () => {
        const profile = defineProfile({
            manifest: {key: "attachment-inject", name: "Attachment Inject"},
            initial: objectSchema,
            payload: objectSchema,
            prepare: (context) => ({
                systemPrompt: "attachment",
                modelConfig: {},
                prepareWrites: [{
                    target: context.sessionId,
                    expectedVersion: context.snapshot.version,
                    cause: "test.attachment.inject",
                    operations: [{
                        type: "appendEntries",
                        entries: [createAgentMessageEntryDraft(userBlocks([
                            {type: "attachment", attachment: {id: "img-2", mimeType: "image/webp", bytes: 7}, name: "pic"},
                        ], 8), {
                            turn: 0,
                            invocationId: context.invocationId,
                        })],
                    }],
                }],
            }),
        });
        const model = new ScriptedModelRuntime<JsonValue>([{message: assistant("done", 100)}]);
        const harness = new NeuroAgentHarness({
            store: new MemorySessionStore(),
            profiles: new ProfileRegistry().add(profile),
            model,
        });
        const created = await harness.createSession({profileKey: "attachment-inject", initial: {}, hostContext: {}});
        const result = await (await harness.invoke({sessionId: created.session.metadata.sessionId, payload: {}})).result();

        expect(result.status).toBe("completed");
        const request = model.requests[0]!.messages;
        const injected = request.find((message) => message.role === "user" && Array.isArray(message.content));
        expect(injected).toBeDefined();
        expect((injected as Extract<AgentMessage, {role: "user"}>).content).toEqual([
            {type: "attachment", attachment: {id: "img-2", mimeType: "image/webp", bytes: 7}, name: "pic"},
        ]);
        await harness.dispose();
    });

    test("fork 复制块内容，compactor.estimate 在窗口守卫中收到块消息", async () => {
        const estimated: AgentMessage[] = [];
        const harness = new NeuroAgentHarness({
            store: new MemorySessionStore(),
            profiles: new ProfileRegistry().add(defineProfile({
                manifest: {key: "attachment-fork", name: "Attachment Fork"},
                initial: objectSchema,
                payload: objectSchema,
                prepare: () => ({systemPrompt: "attachment", modelConfig: {}}),
            })),
            model: {
                contextWindow: 1000,
                runTurn: async () => ({message: assistant("done", 1)}),
            },
            compactor: {
                estimate: (message) => {
                    estimated.push(message);
                    return 1;
                },
                summarize: async () => "summary",
            },
        });
        const created = await harness.createSession({profileKey: "attachment-fork", initial: {}, hostContext: {}});
        const sessionId = created.session.metadata.sessionId;
        await harness.appendEntries(sessionId, [createAgentMessageEntryDraft(userBlocks([
            {type: "attachment", attachment: {id: "img-3", mimeType: "image/png", bytes: 9}},
        ], 5), {turn: 0})]);
        const result = await (await harness.invoke({sessionId, payload: {}})).result();
        expect(result.status).toBe("completed");
        expect(estimated.some((message) => message.role === "user" && Array.isArray(message.content))).toBe(true);
        const forked = await harness.forkSession(sessionId);
        expect(forked.session.metadata.parentSessionId).toBe(sessionId);
        const copied = forked.session.entries.find((entry) => entry.kind === "agent.message");
        expect(copied).toBeDefined();
        const payload = copied!.payload as {message: Extract<AgentMessage, {role: "user"}>};
        expect(payload.message.content).toEqual([
            {type: "attachment", attachment: {id: "img-3", mimeType: "image/png", bytes: 9}},
        ]);
        await harness.dispose();
    });
});
