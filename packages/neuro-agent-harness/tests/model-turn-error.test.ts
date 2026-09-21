import {afterEach, describe, expect, test} from "bun:test";
import {mkdtemp, rm} from "node:fs/promises";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {
    ModelTurnError,
    NeuroAgentHarness,
    ProfileRegistry,
    defineProfile,
    defineSchema,
    defineTool,
    invocationUsage,
    isModelTurnError,
    type AgentMessage,
    type JsonObject,
    type SessionCommitResult,
    type SessionSnapshot,
    type SessionWritePlan,
    type TokenUsage,
} from "../src/index.js";
import {JsonlSessionStore} from "../src/storage/jsonl.js";
import {MemorySessionStore} from "../src/storage/memory.js";
import {ScriptedModelRuntime} from "../src/testing/index.js";

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

function profile(key: string) {
    return defineProfile({
        manifest: {key, name: key},
        initial: objectSchema,
        payload: objectSchema,
        prepare: () => ({systemPrompt: key, modelConfig: {}}),
    });
}

function assistant(
    content: Extract<AgentMessage, {role: "assistant"}>["content"],
    usage: TokenUsage,
): {message: Extract<AgentMessage, {role: "assistant"}>} {
    return {
        message: {
            role: "assistant",
            content,
            timestamp: usage.total,
            usage,
        },
    };
}

function terminalUsage(snapshot: SessionSnapshot<number, JsonObject>, invocationId: string): unknown {
    return snapshot.entries.findLast((entry) => {
        return entry.kind === "harness.invocation.usage" && entry.invocationId === invocationId;
    })?.payload;
}

async function bounded<TResult>(promise: Promise<TResult>, label: string, timeoutMs = 500): Promise<TResult> {
    return await Promise.race([
        promise,
        new Promise<TResult>((_, reject) => setTimeout(() => reject(new Error(`${label} 超时`)), timeoutMs)),
    ]);
}

class FailingTerminalStore extends MemorySessionStore<number, JsonObject> {
    override async commit(plan: SessionWritePlan<number, JsonObject>): Promise<SessionCommitResult<number, JsonObject>> {
        if (plan.cause === "harness.invocation.finish") {
            throw new Error("terminal unavailable");
        }
        return await super.commit(plan);
    }
}

describe("ModelTurnError failure usage", () => {
    test("typed failure usage is durable and survives JSONL restart", async () => {
        const directory = await mkdtemp(join(tmpdir(), "neuro-harness-model-turn-error-"));
        directories.push(directory);
        const turnError = new ModelTurnError("provider unavailable", {
            usage: {input: 7, output: 2, total: 9},
        });
        const firstStore = new JsonlSessionStore<JsonObject>({directory});
        const harness = new NeuroAgentHarness({
            store: firstStore,
            profiles: new ProfileRegistry().add(profile("typed-failure-jsonl")),
            model: new ScriptedModelRuntime([turnError]),
        });
        const created = await harness.createSession({profileKey: "typed-failure-jsonl", initial: {}, hostContext: {}});
        const handle = await harness.invoke({sessionId: created.session.metadata.sessionId, payload: {}});
        const result = await handle.result();
        await harness.dispose();

        const restored = await new JsonlSessionStore<JsonObject>({directory}).read(created.session.metadata.sessionId);

        expect(result.status).toBe("failed");
        expect(result.persistence).toBe("confirmed");
        expect(result.error?.message).toBe("provider unavailable");
        expect(result.usage).toEqual({input: 7, output: 2, total: 9});
        expect(terminalUsage(restored, handle.invocationId)).toEqual({input: 7, output: 2, total: 9});
        expect(invocationUsage(restored, handle.invocationId)).toEqual({input: 7, output: 2, total: 9});
    });

    test("completed and failed turn usage are each aggregated once", async () => {
        const step = defineTool({
            name: "step",
            description: "continue to the failing turn",
            parameters: objectSchema,
            execute: () => ({content: "continued"}),
        });
        const turnProfile = defineProfile({
            manifest: {key: "typed-failure-aggregate", name: "typed-failure-aggregate"},
            initial: objectSchema,
            payload: objectSchema,
            prepare: () => ({systemPrompt: "aggregate", modelConfig: {}, tools: [step]}),
        });
        const store = new MemorySessionStore<number, JsonObject>();
        const harness = new NeuroAgentHarness({
            store,
            profiles: new ProfileRegistry().add(turnProfile),
            model: new ScriptedModelRuntime([
                assistant([{
                    type: "toolCall",
                    call: {id: "step-1", name: "step", arguments: {}},
                }], {input: 2, output: 1, total: 3}),
                new ModelTurnError("second turn failed", {
                    usage: {input: 4, output: 2, total: 6},
                }),
            ]),
        });
        const created = await harness.createSession({profileKey: "typed-failure-aggregate", initial: {}, hostContext: {}});
        const handle = await harness.invoke({sessionId: created.session.metadata.sessionId, payload: {}});
        const result = await handle.result();
        const snapshot = await store.read(created.session.metadata.sessionId);

        expect(result.status).toBe("failed");
        expect(result.usage).toEqual({input: 6, output: 3, total: 9});
        expect(invocationUsage(snapshot, handle.invocationId)).toEqual({input: 6, output: 3, total: 9});
        expect(terminalUsage(snapshot, handle.invocationId)).toEqual({input: 6, output: 3, total: 9});
    });

    test("terminal persistence failure keeps observed usage local and marks it unknown", async () => {
        const store = new FailingTerminalStore();
        const harness = new NeuroAgentHarness({
            store,
            profiles: new ProfileRegistry().add(profile("typed-failure-unknown")),
            model: new ScriptedModelRuntime([
                new ModelTurnError("provider unavailable", {
                    usage: {input: 3, output: 2, total: 5},
                }),
            ]),
        });
        const created = await harness.createSession({profileKey: "typed-failure-unknown", initial: {}, hostContext: {}});
        const handle = await harness.invoke({sessionId: created.session.metadata.sessionId, payload: {}});
        const result = await handle.result();
        const snapshot = await store.read(created.session.metadata.sessionId);

        expect(result.status).toBe("failed");
        expect(result.persistence).toBe("unknown");
        expect(result.usage).toEqual({input: 3, output: 2, total: 5});
        expect(snapshot.activeInvocationId).toBe(handle.invocationId);
        expect(snapshot.invocations[0]?.status).toBe("running");
        expect(terminalUsage(snapshot, handle.invocationId)).toBeUndefined();
    });

    test("cooperative abort persists typed failure usage inside the grace period", async () => {
        let markStarted!: () => void;
        const started = new Promise<void>((resolve) => {
            markStarted = resolve;
        });
        const store = new MemorySessionStore<number, JsonObject>();
        const harness = new NeuroAgentHarness({
            abortGraceMs: 200,
            store,
            profiles: new ProfileRegistry().add(profile("typed-failure-abort")),
            model: new ScriptedModelRuntime([
                async (request) => {
                    markStarted();
                    await new Promise<void>((resolve) => request.signal.addEventListener("abort", () => resolve(), {once: true}));
                    throw new ModelTurnError("request aborted", {
                        usage: {input: 5, output: 1, total: 6},
                    });
                },
            ]),
        });
        const created = await harness.createSession({profileKey: "typed-failure-abort", initial: {}, hostContext: {}});
        const handle = await harness.invoke({sessionId: created.session.metadata.sessionId, payload: {}});
        await started;

        handle.abort();

        const result = await bounded(handle.result(), "cooperative abort");
        const snapshot = await store.read(created.session.metadata.sessionId);
        expect(result.status).toBe("aborted");
        expect(result.persistence).toBe("confirmed");
        expect(result.usage).toEqual({input: 5, output: 1, total: 6});
        expect(invocationUsage(snapshot, handle.invocationId)).toEqual({input: 5, output: 1, total: 6});
        await harness.dispose();
    });

    test("forced abort winner ignores a late typed failure usage update", async () => {
        let markSecondTurnStarted!: () => void;
        const secondTurnStarted = new Promise<void>((resolve) => {
            markSecondTurnStarted = resolve;
        });
        let releaseSecondTurn!: () => void;
        const secondTurnReleased = new Promise<void>((resolve) => {
            releaseSecondTurn = resolve;
        });
        const step = defineTool({
            name: "step",
            description: "continue to a non-cooperative turn",
            parameters: objectSchema,
            execute: () => ({content: "continued"}),
        });
        const turnProfile = defineProfile({
            manifest: {key: "typed-failure-forced-abort", name: "typed-failure-forced-abort"},
            initial: objectSchema,
            payload: objectSchema,
            prepare: () => ({systemPrompt: "forced abort", modelConfig: {}, tools: [step]}),
        });
        const store = new MemorySessionStore<number, JsonObject>();
        const harness = new NeuroAgentHarness({
            abortGraceMs: 0,
            store,
            profiles: new ProfileRegistry().add(turnProfile),
            model: new ScriptedModelRuntime([
                assistant([{
                    type: "toolCall",
                    call: {id: "step-1", name: "step", arguments: {}},
                }], {input: 2, output: 1, total: 3}),
                async () => {
                    markSecondTurnStarted();
                    await secondTurnReleased;
                    throw new ModelTurnError("late provider failure", {
                        usage: {input: 6, output: 1, total: 7},
                    });
                },
            ]),
        });
        const created = await harness.createSession({profileKey: "typed-failure-forced-abort", initial: {}, hostContext: {}});
        const handle = await harness.invoke({sessionId: created.session.metadata.sessionId, payload: {}});
        await secondTurnStarted;

        handle.abort();
        const result = await bounded(handle.result(), "forced abort");
        releaseSecondTurn();
        await new Promise((resolve) => setTimeout(resolve, 10));

        const snapshot = await store.read(created.session.metadata.sessionId);
        expect(result.status).toBe("aborted");
        expect(result.persistence).toBe("confirmed");
        expect(result.usage).toEqual({input: 2, output: 1, total: 3});
        expect(invocationUsage(snapshot, handle.invocationId)).toEqual({input: 2, output: 1, total: 3});
        expect(snapshot.entries.filter((entry) => {
            return entry.kind === "harness.invocation.usage" && entry.invocationId === handle.invocationId;
        })).toHaveLength(1);
        await harness.dispose();
    });

    test("an ad-hoc usage property on a plain Error is ignored", async () => {
        const error = Object.assign(new Error("plain provider failure"), {
            usage: {input: 10, output: 5, total: 15},
        });
        const store = new MemorySessionStore<number, JsonObject>();
        const harness = new NeuroAgentHarness({
            store,
            profiles: new ProfileRegistry().add(profile("plain-error-usage")),
            model: new ScriptedModelRuntime([error]),
        });
        const created = await harness.createSession({profileKey: "plain-error-usage", initial: {}, hostContext: {}});
        const handle = await harness.invoke({sessionId: created.session.metadata.sessionId, payload: {}});
        const result = await handle.result();
        const snapshot = await store.read(created.session.metadata.sessionId);

        expect(result.status).toBe("failed");
        expect(result.usage).toEqual({input: 0, output: 0, total: 0});
        expect(terminalUsage(snapshot, handle.invocationId)).toBeUndefined();
    });

    test("the stable brand recognizes a typed error from another package copy", async () => {
        const crossCopyError = new Error("cross-copy provider failure");
        Object.defineProperty(crossCopyError, Symbol.for("@notnotype/neuro-agent-harness/ModelTurnError"), {value: true});
        Object.defineProperty(crossCopyError, "usage", {
            value: Object.freeze({input: 8, output: 2, total: 10}),
        });
        expect(crossCopyError).not.toBeInstanceOf(ModelTurnError);
        expect(isModelTurnError(crossCopyError)).toBe(true);

        const store = new MemorySessionStore<number, JsonObject>();
        const harness = new NeuroAgentHarness({
            store,
            profiles: new ProfileRegistry().add(profile("cross-copy-error")),
            model: new ScriptedModelRuntime([crossCopyError]),
        });
        const created = await harness.createSession({profileKey: "cross-copy-error", initial: {}, hostContext: {}});
        const handle = await harness.invoke({sessionId: created.session.metadata.sessionId, payload: {}});
        const result = await handle.result();

        expect(result.status).toBe("failed");
        expect(result.usage).toEqual({input: 8, output: 2, total: 10});
        expect(invocationUsage(await store.read(created.session.metadata.sessionId), handle.invocationId))
            .toEqual({input: 8, output: 2, total: 10});
    });

    test("invalid typed failure usage is rejected at construction", () => {
        expect(() => new ModelTurnError("negative", {
            usage: {input: -1, output: 0, total: 0},
        })).toThrow("TokenUsage");
        expect(() => new ModelTurnError("nan", {
            usage: {input: Number.NaN, output: 0, total: 0},
        })).toThrow("TokenUsage");
        expect(() => new ModelTurnError("infinite", {
            usage: {input: 0, output: Number.POSITIVE_INFINITY, total: 0},
        })).toThrow("TokenUsage");
    });
});
