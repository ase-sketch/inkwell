import {describe, expect, test} from "bun:test";
import {mkdtemp, rm} from "node:fs/promises";
import {join} from "node:path";
import {tmpdir} from "node:os";
import {
    NeuroAgentHarness,
    ProfileRegistry,
    defineProfile,
    defineSchema,
    defineTool,
    invocationResultFromSnapshot,
    type JsonObject,
    type SessionSnapshot,
} from "../src/index.js";
import type {InvocationRecord} from "../src/session.js";
import {JsonlSessionStore} from "../src/storage/jsonl.js";
import {MemorySessionStore} from "../src/storage/memory.js";
import {ScriptedModelRuntime} from "../src/testing/index.js";

const objectSchema = defineSchema<JsonObject>((value) => {
    if (value === null || typeof value !== "object" || Array.isArray(value)) {
        throw new Error("必须是 object");
    }
    return value;
});

function invocation(id: string, status: InvocationRecord<number>["status"]): InvocationRecord<number> {
    return {
        id,
        sessionId: 1,
        profileKey: "projection",
        caller: {kind: "user"},
        input: {},
        status,
        turnCount: status === "running" ? 0 : 1,
        createdAt: 1,
        ...(status === "completed" ? {finishedAt: 2, terminationReason: "natural_stop" as const} : {}),
    };
}

function snapshot(overrides: Partial<SessionSnapshot<number, JsonObject>>): SessionSnapshot<number, JsonObject> {
    return {
        metadata: {sessionId: 1, profileKey: "projection", initial: {}, hostContext: {}, createdAt: 1},
        version: 0,
        status: "idle",
        activeLeafId: null,
        activeInvocationId: null,
        entries: [],
        invocations: [],
        ...overrides,
    };
}

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

describe("invocationResultFromSnapshot 纯投影", () => {
    test("completed 返回完整终态投影，不携带 pendingApprovals", () => {
        const result = invocationResultFromSnapshot(snapshot({
            invocations: [{...invocation("i1", "completed"), output: "out"}],
        }), "i1");
        expect(result).toEqual({
            sessionId: 1,
            invocationId: "i1",
            status: "completed",
            persistence: "confirmed",
            terminationReason: "natural_stop",
            output: "out",
            usage: {input: 0, output: 0, total: 0},
        });
    });

    test("failed 携带 error，aborted 按 redaction 规则排除 error", () => {
        const failed = invocationResultFromSnapshot(snapshot({
            invocations: [{...invocation("i1", "failed"), error: {name: "E", message: "boom"}}],
        }), "i1");
        expect(failed?.error).toEqual({name: "E", message: "boom"});
        const aborted = invocationResultFromSnapshot(snapshot({
            invocations: [{...invocation("i1", "aborted"), error: {name: "E", message: "must hide"}}],
        }), "i1");
        expect(aborted?.status).toBe("aborted");
        expect(aborted).not.toHaveProperty("error");
    });

    test("usage fact 与 failed partial fact 投影", () => {
        const result = invocationResultFromSnapshot(snapshot({
            invocations: [{...invocation("i1", "failed"), error: {name: "E", message: "m"}}],
            entries: [
                {
                    id: "u1",
                    kind: "harness.invocation.usage",
                    invocationId: "i1",
                    parentId: null,
                    timestamp: 2,
                    payload: {input: 3, output: 4, total: 7},
                },
                {
                    id: "p1",
                    kind: "harness.invocation.partial",
                    invocationId: "i1",
                    parentId: null,
                    timestamp: 2,
                    payload: {turn: 1, content: [{type: "text", text: "partial"}]},
                },
            ],
        }), "i1");
        expect(result?.usage).toEqual({input: 3, output: 4, total: 7});
        expect(result?.partial).toEqual({turn: 1, content: [{type: "text", text: "partial"}]});
    });

    test("waiting 返回 pendingApprovals 投影", () => {
        const result = invocationResultFromSnapshot(snapshot({
            status: "waiting",
            activeInvocationId: "i1",
            invocations: [{
                ...invocation("i1", "waiting"),
                pendingApprovals: [{toolCallId: "a1", toolName: "gated", prompt: "approve", arguments: {}}],
            }],
        }), "i1");
        expect(result?.status).toBe("waiting");
        expect(result?.persistence).toBe("confirmed");
        expect(result?.pendingApprovals).toHaveLength(1);
    });

    test("running / interrupted / 缺失返回 undefined", () => {
        expect(invocationResultFromSnapshot(snapshot({
            status: "running",
            activeInvocationId: "i1",
            invocations: [invocation("i1", "running")],
        }), "i1")).toBeUndefined();
        expect(invocationResultFromSnapshot(snapshot({
            status: "interrupted",
            invocations: [invocation("i1", "interrupted")],
        }), "i1")).toBeUndefined();
        expect(invocationResultFromSnapshot(snapshot({}), "missing")).toBeUndefined();
    });
});

describe("invocationResultFromSnapshot 恢复场景", () => {
    test("Memory：真实运行完成后从 Snapshot 投影完整结果", async () => {
        const harness = new NeuroAgentHarness({
            store: new MemorySessionStore(),
            profiles: new ProfileRegistry().add(profile("projection-memory")),
            model: new ScriptedModelRuntime([completed("done")]),
        });
        const created = await harness.createSession({profileKey: "projection-memory", initial: {}, hostContext: {}});
        const result = await (await harness.invoke({sessionId: created.session.metadata.sessionId, payload: {}})).result();
        const snapshot = await harness.snapshot(created.session.metadata.sessionId);
        const projected = invocationResultFromSnapshot(snapshot.session, result.invocationId);
        expect(projected?.status).toBe("completed");
        expect(projected?.persistence).toBe("confirmed");
        expect(projected?.terminationReason).toBe("natural_stop");
        expect(projected?.output).toBe("done");
        await harness.dispose();
    });

    test("JSONL：重启后新 Store read 可投影旁路 Invocation 终态", async () => {
        const directory = await mkdtemp(join(tmpdir(), "harness-result-projection-"));
        try {
            const store = new JsonlSessionStore<JsonObject>({directory});
            const harness = new NeuroAgentHarness({
                store,
                profiles: new ProfileRegistry().add(profile("projection-jsonl")),
                model: new ScriptedModelRuntime([completed("done")]),
            });
            const created = await harness.createSession({profileKey: "projection-jsonl", initial: {}, hostContext: {}});
            const result = await (await harness.invoke({sessionId: created.session.metadata.sessionId, payload: {}})).result();
            await harness.dispose();

            const restarted = new JsonlSessionStore<JsonObject>({directory});
            const snapshot = await restarted.read(created.session.metadata.sessionId);
            const projected = invocationResultFromSnapshot(snapshot, result.invocationId);
            expect(projected?.status).toBe("completed");
            expect(projected?.persistence).toBe("confirmed");
            expect(projected?.output).toBe("done");
        } finally {
            await rm(directory, {recursive: true, force: true});
        }
    });

    test("JSONL：waiting Invocation 可从 Snapshot 投影 pendingApprovals", async () => {
        const approvalTool = defineTool({
            name: "gated",
            description: "gated",
            parameters: objectSchema,
            approval: {request: () => ({prompt: "approve"})},
            execute: () => ({content: "executed"}),
        });
        const directory = await mkdtemp(join(tmpdir(), "harness-result-waiting-"));
        try {
            const harness = new NeuroAgentHarness({
                store: new JsonlSessionStore<JsonObject>({directory}),
                profiles: new ProfileRegistry().add(defineProfile({
                    manifest: {key: "projection-waiting", name: "projection-waiting"},
                    initial: objectSchema,
                    payload: objectSchema,
                    prepare: () => ({systemPrompt: "waiting", modelConfig: {}, tools: [approvalTool]}),
                })),
                model: new ScriptedModelRuntime([{
                    message: {
                        role: "assistant",
                        content: [{type: "toolCall", call: {id: "a1", name: "gated", arguments: {}}}],
                        timestamp: 1,
                    },
                }]),
            });
            const created = await harness.createSession({profileKey: "projection-waiting", initial: {}, hostContext: {}});
            const result = await (await harness.invoke({sessionId: created.session.metadata.sessionId, payload: {}})).result();
            expect(result.status).toBe("waiting");
            const snapshot = await harness.snapshot(created.session.metadata.sessionId);
            const projected = invocationResultFromSnapshot(snapshot.session, result.invocationId);
            expect(projected?.status).toBe("waiting");
            expect(projected?.pendingApprovals?.[0]?.toolCallId).toBe("a1");
            await harness.dispose();
        } finally {
            await rm(directory, {recursive: true, force: true});
        }
    });
});
