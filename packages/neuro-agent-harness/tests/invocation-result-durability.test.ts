import {afterEach, describe, expect, test} from "bun:test";
import {mkdtemp, rm} from "node:fs/promises";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {
    NeuroAgentHarness,
    ProfileRegistry,
    SessionEventHub,
    defineCapability,
    defineProfile,
    defineSchema,
    defineTool,
    invocationUsage,
    type AgentMessage,
    type HarnessRuntimeEvent,
    type JsonObject,
    type JsonValue,
    type SessionCommitResult,
    type SessionSnapshot,
    type SessionWritePlan,
} from "../src/index.js";
import {MemorySessionStore} from "../src/storage/memory.js";
import {JsonlSessionStore} from "../src/storage/jsonl.js";
import {ScriptedModelRuntime} from "../src/testing/index.js";

const directories: string[] = [];

afterEach(async () => {
    await Promise.all(directories.splice(0).map((directory) => rm(directory, {recursive: true, force: true})));
});

async function tempDirectory(): Promise<string> {
    const directory = await mkdtemp(join(tmpdir(), "neuro-harness-result-durability-"));
    directories.push(directory);
    return directory;
}

const objectSchema = defineSchema<JsonObject>((value) => {
    if (value === null || typeof value !== "object" || Array.isArray(value)) {
        throw new Error("必须是 object");
    }
    return value;
});

function assistant(
    content: Extract<AgentMessage, {role: "assistant"}>["content"],
    total: number,
): {message: Extract<AgentMessage, {role: "assistant"}>} {
    return {
        message: {
            role: "assistant",
            content,
            timestamp: total,
            usage: {input: total - 1, output: 1, total},
        },
    };
}

function durableUsage(snapshot: SessionSnapshot<number, JsonObject>, invocationId: string): number {
    return snapshot.entries.reduce((total, entry) => {
        if (entry.invocationId !== invocationId || entry.kind !== "agent.message") return total;
        const payload = entry.payload;
        if (payload === null || typeof payload !== "object" || Array.isArray(payload)) return total;
        const message = payload.message;
        if (message === null || typeof message !== "object" || Array.isArray(message) || message.role !== "assistant") return total;
        const usage = message.usage;
        return usage !== null && typeof usage === "object" && !Array.isArray(usage) && typeof usage.total === "number"
            ? total + usage.total
            : total;
    }, 0);
}

function terminalUsage(snapshot: SessionSnapshot<number, JsonObject>, invocationId: string): JsonValue | undefined {
    return snapshot.entries.findLast((entry) => {
        return entry.kind === "harness.invocation.usage" && entry.invocationId === invocationId;
    })?.payload;
}

function containsAssistant(plan: SessionWritePlan<number, JsonObject>): boolean {
    return plan.operations.some((operation) => operation.type === "appendEntries" && operation.entries.some((entry) => {
        if (entry.payload === null || typeof entry.payload !== "object" || Array.isArray(entry.payload)) return false;
        const message = entry.payload.message;
        return message !== null && typeof message === "object" && !Array.isArray(message) && message.role === "assistant";
    }));
}

class FailAssistantCommitOnceStore extends MemorySessionStore<number, JsonObject> {
    failed = false;

    override async commit(plan: SessionWritePlan<number, JsonObject>): Promise<SessionCommitResult<number, JsonObject>> {
        if (!this.failed && plan.cause === "harness.transcript.commit" && containsAssistant(plan)) {
            this.failed = true;
            throw new Error("assistant transcript unavailable");
        }
        return super.commit(plan);
    }
}

class FailingTerminalStore extends MemorySessionStore<number, JsonObject> {
    override async commit(plan: SessionWritePlan<number, JsonObject>): Promise<SessionCommitResult<number, JsonObject>> {
        if (plan.cause === "harness.invocation.finish") {
            throw new Error("terminal store unavailable");
        }
        return super.commit(plan);
    }
}

class ExactLegacyFinishStore extends MemorySessionStore<number, JsonObject> {
    override async commit(plan: SessionWritePlan<number, JsonObject>): Promise<SessionCommitResult<number, JsonObject>> {
        const known = new Set(["type", "invocationId", "status", "turnCount", "terminationReason", "output", "error"]);
        for (const operation of plan.operations) {
            if (operation.type === "finishInvocation" && Object.keys(operation).some((key) => !known.has(key))) {
                throw new Error("legacy Store rejected unknown finishInvocation field");
            }
        }
        return super.commit(plan);
    }
}

class DelayedResumeStore extends MemorySessionStore<number, JsonObject> {
    private markResumeStarted!: () => void;
    private releaseResumeCommit!: () => void;
    readonly resumeStarted = new Promise<void>((resolve) => {
        this.markResumeStarted = resolve;
    });
    private readonly resumeReleased = new Promise<void>((resolve) => {
        this.releaseResumeCommit = resolve;
    });

    releaseResume(): void {
        this.releaseResumeCommit();
    }

    override async commit(plan: SessionWritePlan<number, JsonObject>): Promise<SessionCommitResult<number, JsonObject>> {
        if (plan.cause === "harness.invocation.resumeApproval") {
            this.markResumeStarted();
            await this.resumeReleased;
        }
        return super.commit(plan);
    }
}

async function runtimeEvents(harness: NeuroAgentHarness<number, JsonObject, JsonValue>, sessionId: number): Promise<HarnessRuntimeEvent[]> {
    const subscription = harness.subscribe(sessionId, {after: 0});
    await subscription.close();
    const events: HarnessRuntimeEvent[] = [];
    for await (const event of subscription) {
        if (event.kind === "runtime") events.push(event.event);
    }
    return events;
}

describe("Invocation result persistence and usage", () => {
    test("invalid Provider token usage fails before transcript persistence", async () => {
        const profile = defineProfile({
            manifest: {key: "invalid-usage", name: "Invalid usage"},
            initial: objectSchema,
            payload: objectSchema,
            prepare: () => ({systemPrompt: "x", modelConfig: {}}),
        });
        const store = new MemorySessionStore<number, JsonObject>();
        const harness = new NeuroAgentHarness({
            store,
            profiles: new ProfileRegistry().add(profile),
            model: new ScriptedModelRuntime([{
                message: {
                    role: "assistant",
                    content: [{type: "text", text: "invalid"}],
                    timestamp: 1,
                    usage: {input: -1, output: 1, total: 0},
                },
            }]),
        });
        const created = await harness.createSession({profileKey: "invalid-usage", initial: {}, hostContext: {}});
        const handle = await harness.invoke({sessionId: created.session.metadata.sessionId, payload: {}});
        const result = await handle.result();
        const snapshot = await store.read(created.session.metadata.sessionId);

        expect(result.status).toBe("failed");
        expect(result.persistence).toBe("confirmed");
        expect(result.error?.message).toContain("TokenUsage");
        expect(result.usage.total).toBe(0);
        expect(snapshot.invocations[0]?.status).toBe("failed");
        expect(terminalUsage(snapshot, handle.invocationId)).toBeUndefined();
        expect(durableUsage(snapshot, handle.invocationId)).toBe(0);
    });

    test("durable completed-turn usage survives a later provider failure", async () => {
        const tool = defineTool({
            name: "step",
            description: "step",
            parameters: objectSchema,
            execute: () => ({content: "done"}),
        });
        const profile = defineProfile({
            manifest: {key: "later-failure", name: "Later failure"},
            initial: objectSchema,
            payload: objectSchema,
            prepare: () => ({systemPrompt: "x", modelConfig: {}, tools: [tool]}),
        });
        const store = new MemorySessionStore<number, JsonObject>();
        const harness = new NeuroAgentHarness({
            store,
            profiles: new ProfileRegistry().add(profile),
            model: new ScriptedModelRuntime([
                assistant([{type: "toolCall", call: {id: "step-1", name: "step", arguments: {}}}], 7),
                new Error("provider unavailable"),
            ]),
        });
        const created = await harness.createSession({profileKey: "later-failure", initial: {}, hostContext: {}});
        const handle = await harness.invoke({sessionId: created.session.metadata.sessionId, payload: {}});
        const result = await handle.result();
        const snapshot = await store.read(created.session.metadata.sessionId);

        expect(result.status).toBe("failed");
        expect(result).toHaveProperty("persistence", "confirmed");
        expect(result.usage.total).toBe(7);
        expect(snapshot.invocations[0]?.status).toBe("failed");
        expect(terminalUsage(snapshot, handle.invocationId)).toEqual({input: 6, output: 1, total: 7});
        expect(durableUsage(snapshot, handle.invocationId)).toBe(7);
        expect(invocationUsage(snapshot, handle.invocationId).total).toBe(7);

        const usageEntry = snapshot.entries.find((entry) => entry.kind === "harness.invocation.usage");
        const legacy = {
            ...structuredClone(snapshot),
            entries: snapshot.entries.filter((entry) => entry.kind !== "harness.invocation.usage"),
            activeLeafId: usageEntry?.parentId ?? snapshot.activeLeafId,
        };
        expect(invocationUsage(legacy, handle.invocationId).total).toBe(7);
    });

    test("assistant commit failure persists terminal usage independently from transcript", async () => {
        const profile = defineProfile({
            manifest: {key: "assistant-commit-failure", name: "Assistant commit failure"},
            initial: objectSchema,
            payload: objectSchema,
            prepare: () => ({systemPrompt: "x", modelConfig: {}}),
        });
        const store = new FailAssistantCommitOnceStore();
        const harness = new NeuroAgentHarness({
            store,
            profiles: new ProfileRegistry().add(profile),
            model: new ScriptedModelRuntime([assistant([{type: "text", text: "generated"}], 11)]),
            events: new SessionEventHub({eventEpoch: "assistant-commit-failure"}),
        });
        const created = await harness.createSession({profileKey: "assistant-commit-failure", initial: {}, hostContext: {}});
        const handle = await harness.invoke({sessionId: created.session.metadata.sessionId, payload: {}});
        const result = await handle.result();
        const snapshot = await store.read(created.session.metadata.sessionId);
        const terminal = (await runtimeEvents(harness, created.session.metadata.sessionId))
            .find((event) => event.type === "agent_end");

        expect(result.status).toBe("failed");
        expect(result).toHaveProperty("persistence", "confirmed");
        expect(result.usage.total).toBe(11);
        expect(snapshot.invocations[0]?.status).toBe("failed");
        expect(durableUsage(snapshot, handle.invocationId)).toBe(0);
        expect(terminalUsage(snapshot, handle.invocationId)).toEqual({input: 10, output: 1, total: 11});
        expect(invocationUsage(snapshot, handle.invocationId).total).toBe(11);
        expect(terminal?.type === "agent_end" ? terminal.usage?.total : undefined).toBe(11);
    });

    test("terminal commit failure marks the in-process result persistence unknown", async () => {
        const profile = defineProfile({
            manifest: {key: "terminal-commit-failure", name: "Terminal commit failure"},
            initial: objectSchema,
            payload: objectSchema,
            prepare: () => ({systemPrompt: "x", modelConfig: {}}),
        });
        const store = new FailingTerminalStore();
        const harness = new NeuroAgentHarness({
            store,
            profiles: new ProfileRegistry().add(profile),
            model: new ScriptedModelRuntime([new Error("provider unavailable")]),
        });
        const created = await harness.createSession({profileKey: "terminal-commit-failure", initial: {}, hostContext: {}});
        const handle = await harness.invoke({sessionId: created.session.metadata.sessionId, payload: {}});
        const result = await handle.result();
        const snapshot = await store.read(created.session.metadata.sessionId);

        expect(result.status).toBe("failed");
        expect(result).toHaveProperty("persistence", "unknown");
        expect(result.error?.message).toBe("provider unavailable");
        expect(snapshot.activeInvocationId).toBe(handle.invocationId);
        expect(snapshot.invocations[0]?.status).toBe("running");
    });

    test("cleanup failure cannot replace the original error when terminal persistence is unknown", async () => {
        const resource = defineCapability<"unknown-resource", Record<string, never>>("unknown-resource");
        const profile = defineProfile({
            manifest: {key: "unknown-cleanup-failure", name: "Unknown cleanup failure"},
            initial: objectSchema,
            payload: objectSchema,
            requiredCapabilities: [resource],
            prepare: () => ({systemPrompt: "x", modelConfig: {}}),
        });
        const store = new FailingTerminalStore();
        const harness = new NeuroAgentHarness({
            store,
            profiles: new ProfileRegistry().add(profile),
            model: new ScriptedModelRuntime([new Error("provider unavailable")]),
            capabilities: [{
                capability: resource,
                open: () => ({}),
                close: () => {
                    throw new Error("cleanup unavailable");
                },
            }],
        });
        const created = await harness.createSession({profileKey: "unknown-cleanup-failure", initial: {}, hostContext: {}});
        const handle = await harness.invoke({sessionId: created.session.metadata.sessionId, payload: {}});
        const result = await handle.result();
        const snapshot = await store.read(created.session.metadata.sessionId);

        expect(result.status).toBe("failed");
        expect(result.persistence).toBe("unknown");
        expect(result.error?.message).toBe("provider unavailable");
        expect(snapshot.invocations[0]?.status).toBe("running");
    });

    test("Capability close failure cannot overwrite a durable completed result or skip other cleanup", async () => {
        const first = defineCapability<"first", Record<string, never>>("first");
        const second = defineCapability<"second", Record<string, never>>("second");
        const closed: string[] = [];
        const profile = defineProfile({
            manifest: {key: "close-failure", name: "Close failure"},
            initial: objectSchema,
            payload: objectSchema,
            requiredCapabilities: [first, second],
            prepare: () => ({systemPrompt: "x", modelConfig: {}}),
        });
        const store = new MemorySessionStore<number, JsonObject>();
        const harness = new NeuroAgentHarness({
            store,
            profiles: new ProfileRegistry().add(profile),
            model: new ScriptedModelRuntime([assistant([{type: "text", text: "done"}], 13)]),
            capabilities: [
                {
                    capability: first,
                    open: () => ({}),
                    close: () => {
                        closed.push("first");
                    },
                },
                {
                    capability: second,
                    open: () => ({}),
                    close: () => {
                        closed.push("second");
                        throw new Error("close unavailable");
                    },
                },
            ],
        });
        const created = await harness.createSession({profileKey: "close-failure", initial: {}, hostContext: {}});
        const handle = await harness.invoke({sessionId: created.session.metadata.sessionId, payload: {}});
        const result = await handle.result();
        const snapshot = await store.read(created.session.metadata.sessionId);

        expect(result.status).toBe("completed");
        expect(result).toHaveProperty("persistence", "confirmed");
        expect(result.error).toBeUndefined();
        expect(result.usage.total).toBe(13);
        expect(snapshot.invocations[0]?.status).toBe("completed");
        expect(terminalUsage(snapshot, handle.invocationId)).toEqual({input: 12, output: 1, total: 13});
        expect(durableUsage(snapshot, handle.invocationId)).toBe(13);
        expect(closed).toEqual(["second", "first"]);
    });

    test("Capability close failure preserves a durable waiting result", async () => {
        const resource = defineCapability<"waiting-resource", Record<string, never>>("waiting-resource");
        const gated = defineTool({
            name: "gated",
            description: "gated",
            parameters: objectSchema,
            approval: {request: () => ({prompt: "approve"})},
            execute: () => ({content: "approved"}),
        });
        const profile = defineProfile({
            manifest: {key: "waiting-close-failure", name: "Waiting close failure"},
            initial: objectSchema,
            payload: objectSchema,
            requiredCapabilities: [resource],
            prepare: () => ({systemPrompt: "x", modelConfig: {}, tools: [gated]}),
        });
        const store = new MemorySessionStore<number, JsonObject>();
        const harness = new NeuroAgentHarness({
            store,
            profiles: new ProfileRegistry().add(profile),
            model: new ScriptedModelRuntime([
                assistant([{type: "toolCall", call: {id: "gated-1", name: "gated", arguments: {}}}], 17),
                assistant([{type: "text", text: "completed"}], 5),
            ]),
            capabilities: [{
                capability: resource,
                open: () => ({}),
                close: () => {
                    throw new Error("waiting close unavailable");
                },
            }],
        });
        const created = await harness.createSession({profileKey: "waiting-close-failure", initial: {}, hostContext: {}});
        const handle = await harness.invoke({sessionId: created.session.metadata.sessionId, payload: {}});
        const result = await handle.result();
        const snapshot = await store.read(created.session.metadata.sessionId);

        expect(result.status).toBe("waiting");
        expect(result.persistence).toBe("confirmed");
        expect(result.usage.total).toBe(17);
        expect(result.pendingApprovals?.[0]?.toolCallId).toBe("gated-1");
        expect(snapshot.invocations[0]?.status).toBe("waiting");

        const resumed = await harness.resume(created.session.metadata.sessionId, handle.invocationId, [{
            toolCallId: "gated-1",
            approved: true,
        }]);
        const completed = await resumed.result();
        const completedSnapshot = await store.read(created.session.metadata.sessionId);

        expect(completed.status).toBe("completed");
        expect(completed.persistence).toBe("confirmed");
        expect(completed.usage.total).toBe(22);
        expect(terminalUsage(completedSnapshot, handle.invocationId)).toEqual({input: 20, output: 2, total: 22});
    });

    test("Capability close failure preserves the original durable failure", async () => {
        const resource = defineCapability<"failed-resource", Record<string, never>>("failed-resource");
        const profile = defineProfile({
            manifest: {key: "failed-close-failure", name: "Failed close failure"},
            initial: objectSchema,
            payload: objectSchema,
            requiredCapabilities: [resource],
            prepare: () => ({systemPrompt: "x", modelConfig: {}}),
        });
        const store = new MemorySessionStore<number, JsonObject>();
        const harness = new NeuroAgentHarness({
            store,
            profiles: new ProfileRegistry().add(profile),
            model: new ScriptedModelRuntime([new Error("provider unavailable")]),
            capabilities: [{
                capability: resource,
                open: () => ({}),
                close: () => {
                    throw new Error("failed close unavailable");
                },
            }],
        });
        const created = await harness.createSession({profileKey: "failed-close-failure", initial: {}, hostContext: {}});
        const handle = await harness.invoke({sessionId: created.session.metadata.sessionId, payload: {}});
        const result = await handle.result();
        const snapshot = await store.read(created.session.metadata.sessionId);

        expect(result.status).toBe("failed");
        expect(result.persistence).toBe("confirmed");
        expect(result.error?.message).toBe("provider unavailable");
        expect(snapshot.invocations[0]?.status).toBe("failed");
    });

    test("forced abort atomically persists durable prior-turn usage", async () => {
        const tool = defineTool({
            name: "step-before-abort",
            description: "step before abort",
            parameters: objectSchema,
            execute: () => ({content: "done"}),
        });
        const profile = defineProfile({
            manifest: {key: "forced-abort-usage", name: "Forced abort usage"},
            initial: objectSchema,
            payload: objectSchema,
            prepare: () => ({systemPrompt: "x", modelConfig: {}, tools: [tool]}),
        });
        let markStarted!: () => void;
        const started = new Promise<void>((resolve) => {
            markStarted = resolve;
        });
        const store = new MemorySessionStore<number, JsonObject>();
        const harness = new NeuroAgentHarness({
            abortGraceMs: 0,
            store,
            profiles: new ProfileRegistry().add(profile),
            model: new ScriptedModelRuntime([
                assistant([{type: "toolCall", call: {id: "step-abort-1", name: "step-before-abort", arguments: {}}}], 23),
                async () => {
                    markStarted();
                    return new Promise<never>(() => {});
                },
            ]),
        });
        const created = await harness.createSession({profileKey: "forced-abort-usage", initial: {}, hostContext: {}});
        const handle = await harness.invoke({sessionId: created.session.metadata.sessionId, payload: {}});
        await started;
        handle.abort();
        const result = await handle.result();
        const snapshot = await store.read(created.session.metadata.sessionId);

        expect(result.status).toBe("aborted");
        expect(result.persistence).toBe("confirmed");
        expect(result.usage.total).toBe(23);
        expect(snapshot.invocations[0]?.status).toBe("aborted");
        expect(terminalUsage(snapshot, handle.invocationId)).toEqual({input: 22, output: 1, total: 23});
    });

    test("cross-Harness abort wins a delayed approval resume without duplicating terminal usage", async () => {
        const gated = defineTool({
            name: "race-gated",
            description: "race gated",
            parameters: objectSchema,
            approval: {request: () => ({prompt: "approve race"})},
            execute: () => ({content: "approved"}),
        });
        const profile = defineProfile({
            manifest: {key: "resume-abort-race", name: "Resume abort race"},
            initial: objectSchema,
            payload: objectSchema,
            prepare: () => ({systemPrompt: "x", modelConfig: {}, tools: [gated]}),
        });
        const store = new DelayedResumeStore();
        const firstHarness = new NeuroAgentHarness({
            store,
            profiles: new ProfileRegistry().add(profile),
            model: new ScriptedModelRuntime([
                assistant([{type: "toolCall", call: {id: "race-gated-1", name: "race-gated", arguments: {}}}], 31),
            ]),
        });
        const secondHarness = new NeuroAgentHarness({
            store,
            profiles: new ProfileRegistry().add(profile),
            model: new ScriptedModelRuntime([]),
        });
        const created = await firstHarness.createSession({profileKey: "resume-abort-race", initial: {}, hostContext: {}});
        const initial = await firstHarness.invoke({sessionId: created.session.metadata.sessionId, payload: {}});
        expect((await initial.result()).status).toBe("waiting");

        const resumed = await firstHarness.resume(created.session.metadata.sessionId, initial.invocationId, [{
            toolCallId: "race-gated-1",
            approved: true,
        }]);
        await store.resumeStarted;
        await secondHarness.abort(created.session.metadata.sessionId);
        store.releaseResume();

        const result = await resumed.result();
        const snapshot = await store.read(created.session.metadata.sessionId);
        const usageEntries = snapshot.entries.filter((entry) => {
            return entry.kind === "harness.invocation.usage" && entry.invocationId === initial.invocationId;
        });

        expect(result.status).toBe("aborted");
        expect(result.persistence).toBe("confirmed");
        expect(result.usage.total).toBe(31);
        expect(snapshot.invocations[0]?.status).toBe("aborted");
        expect(usageEntries).toHaveLength(1);
        expect(usageEntries[0]?.payload).toEqual({input: 30, output: 1, total: 31});
        expect(invocationUsage(snapshot, initial.invocationId).total).toBe(31);
    });

    test("legacy strict finishInvocation shape accepts terminal usage as an append-only fact", async () => {
        const profile = defineProfile({
            manifest: {key: "legacy-finish-shape", name: "Legacy finish shape"},
            initial: objectSchema,
            payload: objectSchema,
            prepare: () => ({systemPrompt: "x", modelConfig: {}}),
        });
        const store = new ExactLegacyFinishStore();
        const harness = new NeuroAgentHarness({
            store,
            profiles: new ProfileRegistry().add(profile),
            model: new ScriptedModelRuntime([assistant([{type: "text", text: "done"}], 29)]),
        });
        const created = await harness.createSession({profileKey: "legacy-finish-shape", initial: {}, hostContext: {}});
        const handle = await harness.invoke({sessionId: created.session.metadata.sessionId, payload: {}});
        const result = await handle.result();
        const snapshot = await store.read(created.session.metadata.sessionId);

        expect(result.status).toBe("completed");
        expect(result.persistence).toBe("confirmed");
        expect(terminalUsage(snapshot, handle.invocationId)).toEqual({input: 28, output: 1, total: 29});
    });

    test("host writes cannot forge the reserved Invocation usage fact", async () => {
        const profile = defineProfile({
            manifest: {key: "reserved-usage-fact", name: "Reserved usage fact"},
            initial: objectSchema,
            payload: objectSchema,
            prepare: () => ({systemPrompt: "x", modelConfig: {}}),
        });
        const harness = new NeuroAgentHarness({
            store: new MemorySessionStore<number, JsonObject>(),
            profiles: new ProfileRegistry().add(profile),
            model: new ScriptedModelRuntime([]),
        });
        const created = await harness.createSession({profileKey: "reserved-usage-fact", initial: {}, hostContext: {}});

        await expect(harness.write({
            target: created.session.metadata.sessionId,
            cause: "host.forgeUsage",
            operations: [{
                type: "appendEntries",
                entries: [{
                    kind: "harness.invocation.usage",
                    invocationId: "forged",
                    payload: {input: 100, output: 100, total: 200},
                }],
            }],
        })).rejects.toThrow("Harness 保留");
    });

    test("JSONL restart preserves terminal usage independently from the live Harness", async () => {
        const directory = await tempDirectory();
        const profile = defineProfile({
            manifest: {key: "jsonl-terminal-usage", name: "JSONL terminal usage"},
            initial: objectSchema,
            payload: objectSchema,
            prepare: () => ({systemPrompt: "x", modelConfig: {}}),
        });
        const firstStore = new JsonlSessionStore<JsonObject>({directory});
        const firstHarness = new NeuroAgentHarness({
            store: firstStore,
            profiles: new ProfileRegistry().add(profile),
            model: new ScriptedModelRuntime([assistant([{type: "text", text: "done"}], 19)]),
        });
        const created = await firstHarness.createSession({profileKey: "jsonl-terminal-usage", initial: {}, hostContext: {}});
        const handle = await firstHarness.invoke({sessionId: created.session.metadata.sessionId, payload: {}});
        const result = await handle.result();
        await firstHarness.dispose();

        const restoredStore = new JsonlSessionStore<JsonObject>({directory});
        const restored = await restoredStore.read(created.session.metadata.sessionId);

        expect(result.persistence).toBe("confirmed");
        expect(restored.invocations[0]?.status).toBe("completed");
        expect(terminalUsage(restored, handle.invocationId)).toEqual({input: 18, output: 1, total: 19});
        expect(invocationUsage(restored, handle.invocationId).total).toBe(19);
    });
});
