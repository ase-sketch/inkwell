import {afterEach, describe, expect, test} from "bun:test";
import {mkdir, mkdtemp, rm, writeFile} from "node:fs/promises";
import {join} from "node:path";
import {tmpdir} from "node:os";
import {
    NeuroAgentHarness,
    ProfileRegistry,
    defineSchema,
    type JsonObject,
} from "../src/index.js";
import {JsonlSessionStore} from "../src/storage/jsonl.js";
import {ScriptedModelRuntime} from "../src/testing/index.js";

const directories: string[] = [];

afterEach(async () => {
    await Promise.all(directories.splice(0).map((directory) => rm(directory, {recursive: true, force: true})));
});

const schema = defineSchema<JsonObject>((value) => {
    if (value === null || typeof value !== "object" || Array.isArray(value)) {
        throw new Error("必须是 object");
    }
    return value;
});

function profiles(): ProfileRegistry {
    const registry = new ProfileRegistry();
    registry.define({
        manifest: {key: "legacy-jsonl-message-identity", name: "Legacy JSONL Message Identity"},
        initial: schema,
        payload: schema,
        prepare: () => ({systemPrompt: "test", modelConfig: {}}),
    });
    return registry;
}

function assistant(text: string) {
    return {
        message: {
            role: "assistant" as const,
            content: [{type: "text" as const, text}],
            timestamp: 2,
        },
    };
}

async function tempDirectory(): Promise<string> {
    const directory = await mkdtemp(join(tmpdir(), "neuro-harness-legacy-jsonl-"));
    directories.push(directory);
    return directory;
}

describe("raw legacy JSONL message identity", () => {
    test("缺字段的 invocation、agent.message 和 follow-up 可读取并实际恢复", async () => {
        const directory = await tempDirectory();
        const sessionsDirectory = join(directory, "sessions");
        await mkdir(sessionsDirectory, {recursive: true});
        await writeFile(join(sessionsDirectory, "1.jsonl"), `${JSON.stringify({
            kind: "snapshot",
            cause: "legacy.fixture",
            snapshot: {
                metadata: {
                    sessionId: 1,
                    profileKey: "legacy-jsonl-message-identity",
                    initial: {},
                    hostContext: {},
                    createdAt: 1,
                },
                version: 3,
                status: "idle",
                activeLeafId: "legacy-follow-up-entry",
                activeInvocationId: null,
                entries: [{
                    id: "legacy-message-entry",
                    kind: "agent.message",
                    parentId: null,
                    timestamp: 1,
                    invocationId: "legacy-invocation",
                    payload: {
                        turn: 0,
                        message: {role: "user", content: "legacy input", timestamp: 1},
                    },
                }, {
                    id: "legacy-follow-up-entry",
                    kind: "harness.followUp.queued",
                    parentId: "legacy-message-entry",
                    timestamp: 2,
                    payload: {
                        id: "legacy-follow-up",
                        kind: "followUp",
                        payload: {prompt: "legacy follow-up"},
                        createdAt: 2,
                    },
                }],
                invocations: [{
                    id: "legacy-invocation",
                    sessionId: 1,
                    profileKey: "legacy-jsonl-message-identity",
                    caller: {kind: "system", name: "legacy"},
                    input: {prompt: "legacy invocation"},
                    status: "completed",
                    turnCount: 1,
                    terminationReason: "natural_stop",
                    createdAt: 1,
                    finishedAt: 2,
                }],
            },
            appendedEntryIds: ["legacy-message-entry", "legacy-follow-up-entry"],
        })}\n`, "utf8");

        const store = new JsonlSessionStore<JsonObject>({directory});
        const snapshot = await store.read(1);
        expect(snapshot.invocations[0]?.messageIdentity).toBe("user");
        expect(snapshot.entries[0]?.payload).toMatchObject({messageIdentity: "user"});

        const harness = new NeuroAgentHarness({
            store,
            profiles: profiles(),
            model: new ScriptedModelRuntime([assistant("legacy recovered")]),
        });
        try {
            expect((await harness.followUpState(1)).items).toMatchObject([{
                id: "legacy-follow-up",
                messageIdentity: "user",
            }]);

            const resumed = await harness.resumeFollowUps(1);
            expect(resumed).not.toBeNull();
            expect((await resumed!.result()).status).toBe("completed");

            const restored = await store.read(1);
            expect(restored.invocations.at(-1)?.messageIdentity).toBe("user");
            // 第八十九轮：legacy queue item 无 caller 时，drain 回退为
            // {kind: "user"}（与 followUpOnce 缺省一致）。
            expect(restored.invocations.at(-1)?.caller).toEqual({kind: "user"});
            expect((await harness.followUpState(1)).items).toHaveLength(0);
        } finally {
            await harness.dispose();
        }
    });
});
