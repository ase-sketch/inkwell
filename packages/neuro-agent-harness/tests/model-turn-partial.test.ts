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
    defineSessionEntryCodec,
    invocationPartial,
    invocationUsage,
    type CompactionRequest,
    type InvocationPartial,
    type JsonObject,
    type SessionCommitResult,
    type SessionWritePlan,
} from "../src/index.js";
import {JsonlSessionStore} from "../src/storage/jsonl.js";
import {MemorySessionStore} from "../src/storage/memory.js";
import {ScriptedModelRuntime} from "../src/testing/index.js";
import {projectSessionTranscript} from "../src/session-transcript.js";
import {activeSessionPath} from "../src/session.js";

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

function partialEntries(snapshot: {entries: readonly {kind: string; invocationId?: string}[]}, invocationId: string) {
    return snapshot.entries.filter((entry) => {
        return entry.kind === "harness.invocation.partial" && entry.invocationId === invocationId;
    });
}

function durableText(snapshot: {entries: readonly {kind: string; payload: unknown}[]}): string {
    return snapshot.entries
        .filter((entry) => entry.kind === "agent.message")
        .map((entry) => JSON.stringify(entry.payload))
        .join("\n");
}

interface HostPartialProjection extends JsonObject {
    invocationId: string;
    turn: number;
    status: "partial" | "interrupted";
    text: string;
}

function hostPartialProjectionCodec() {
    return defineSessionEntryCodec("host.agent.partial", defineSchema<HostPartialProjection>((value) => {
        if (value === null || typeof value !== "object" || Array.isArray(value)
            || typeof value.invocationId !== "string"
            || typeof value.turn !== "number" || !Number.isInteger(value.turn) || value.turn < 1
            || (value.status !== "partial" && value.status !== "interrupted")
            || typeof value.text !== "string") {
            throw new Error("host partial projection 无效");
        }
        return value as HostPartialProjection;
    }));
}

class FailingTerminalStore extends MemorySessionStore<number, JsonObject> {
    override async commit(plan: SessionWritePlan<number, JsonObject>): Promise<SessionCommitResult<number, JsonObject>> {
        if (plan.cause === "harness.invocation.finish") {
            throw new Error("terminal unavailable");
        }
        return await super.commit(plan);
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
        return await super.commit(plan);
    }
}

class CommitThenLoseAcknowledgementStore extends MemorySessionStore<number, JsonObject> {
    private lostTerminalAcknowledgement = false;

    override async commit(plan: SessionWritePlan<number, JsonObject>): Promise<SessionCommitResult<number, JsonObject>> {
        const result = await super.commit(plan);
        if (!this.lostTerminalAcknowledgement && plan.cause === "harness.invocation.finish") {
            this.lostTerminalAcknowledgement = true;
            throw new Error("terminal acknowledgement lost");
        }
        return result;
    }
}

describe("terminal partial model output", () => {
    test("failed partial and usage are atomic and survive JSONL restart without entering transcript", async () => {
        const directory = await mkdtemp(join(tmpdir(), "neuro-harness-partial-"));
        directories.push(directory);
        const error = new ModelTurnError("stream dropped", {
            usage: {input: 7, output: 2, total: 9},
            partial: {
                content: [
                    {type: "thinking", thinking: "unfinished thought"},
                    {type: "text", text: "half answer"},
                ],
            },
        });
        const store = new JsonlSessionStore<JsonObject>({directory});
        const harness = new NeuroAgentHarness({
            store,
            profiles: new ProfileRegistry().add(profile("partial-jsonl")),
            model: new ScriptedModelRuntime([error]),
        });
        const created = await harness.createSession({profileKey: "partial-jsonl", initial: {}, hostContext: {}});
        const handle = await harness.invoke({sessionId: created.session.metadata.sessionId, payload: {}});
        const result = await handle.result();
        await harness.dispose();

        const restored = await new JsonlSessionStore<JsonObject>({directory}).read(created.session.metadata.sessionId);
        const expected: InvocationPartial = {
            turn: 1,
            content: [
                {type: "thinking", thinking: "unfinished thought"},
                {type: "text", text: "half answer"},
            ],
        };

        expect(result.status).toBe("failed");
        expect(result.persistence).toBe("confirmed");
        expect(result.partial).toEqual(expected);
        expect(invocationPartial(restored, handle.invocationId)).toEqual(expected);
        expect(invocationUsage(restored, handle.invocationId)).toEqual({input: 7, output: 2, total: 9});
        expect(partialEntries(restored, handle.invocationId)).toHaveLength(1);
        expect(durableText(restored)).not.toContain("half answer");
        expect(durableText(restored)).not.toContain("unfinished thought");
    });

    test("terminal commit failure keeps partial local and persistence unknown", async () => {
        const store = new FailingTerminalStore();
        const harness = new NeuroAgentHarness({
            store,
            profiles: new ProfileRegistry().add(profile("partial-unknown")),
            model: new ScriptedModelRuntime([
                new ModelTurnError("stream dropped", {
                    partial: {content: [{type: "text", text: "local only"}]},
                }),
            ]),
        });
        const created = await harness.createSession({profileKey: "partial-unknown", initial: {}, hostContext: {}});
        const handle = await harness.invoke({sessionId: created.session.metadata.sessionId, payload: {}});
        const result = await handle.result();
        const snapshot = await store.read(created.session.metadata.sessionId);

        expect(result.status).toBe("failed");
        expect(result.persistence).toBe("unknown");
        expect(result.partial).toEqual({turn: 1, content: [{type: "text", text: "local only"}]});
        expect(invocationPartial(snapshot, handle.invocationId)).toBeUndefined();
        expect(snapshot.invocations[0]?.status).toBe("running");
    });

    test("Snapshot reread confirms partial after terminal acknowledgement is lost", async () => {
        const store = new CommitThenLoseAcknowledgementStore();
        const harness = new NeuroAgentHarness({
            store,
            profiles: new ProfileRegistry().add(profile("partial-acknowledgement")),
            model: new ScriptedModelRuntime([
                new ModelTurnError("stream dropped", {
                    partial: {content: [{type: "text", text: "durable despite lost acknowledgement"}]},
                }),
            ]),
        });
        const created = await harness.createSession({profileKey: "partial-acknowledgement", initial: {}, hostContext: {}});
        const handle = await harness.invoke({sessionId: created.session.metadata.sessionId, payload: {}});
        const result = await handle.result();
        const snapshot = await store.read(created.session.metadata.sessionId);

        expect(result.status).toBe("failed");
        expect(result.persistence).toBe("confirmed");
        expect(result.partial).toEqual({
            turn: 1,
            content: [{type: "text", text: "durable despite lost acknowledgement"}],
        });
        expect(invocationPartial(snapshot, handle.invocationId)).toEqual(result.partial);
        expect(partialEntries(snapshot, handle.invocationId)).toHaveLength(1);
    });

    test("legacy strict finishInvocation shape accepts partial and usage as terminal facts", async () => {
        const store = new ExactLegacyFinishStore();
        const harness = new NeuroAgentHarness({
            store,
            profiles: new ProfileRegistry().add(profile("partial-legacy-store")),
            model: new ScriptedModelRuntime([
                new ModelTurnError("stream dropped", {
                    usage: {input: 5, output: 2, total: 7},
                    partial: {content: [{type: "text", text: "legacy-safe"}]},
                }),
            ]),
        });
        const created = await harness.createSession({profileKey: "partial-legacy-store", initial: {}, hostContext: {}});
        const handle = await harness.invoke({sessionId: created.session.metadata.sessionId, payload: {}});
        const result = await handle.result();
        const snapshot = await store.read(created.session.metadata.sessionId);

        expect(result.persistence).toBe("confirmed");
        expect(invocationUsage(snapshot, handle.invocationId)).toEqual({input: 5, output: 2, total: 7});
        expect(invocationPartial(snapshot, handle.invocationId))
            .toEqual({turn: 1, content: [{type: "text", text: "legacy-safe"}]});
        expect(snapshot.entries.filter((entry) => {
            return entry.invocationId === handle.invocationId
                && (entry.kind === "harness.invocation.usage" || entry.kind === "harness.invocation.partial");
        })).toHaveLength(2);
    });

    test("retry Provider request excludes the durable partial fact", async () => {
        const model = new ScriptedModelRuntime([
            new ModelTurnError("first failed", {
                partial: {content: [{type: "text", text: "do not replay"}]},
            }),
            {
                message: {
                    role: "assistant",
                    content: [{type: "text", text: "retried"}],
                    timestamp: 2,
                },
            },
        ]);
        const store = new MemorySessionStore<number, JsonObject>();
        const harness = new NeuroAgentHarness({
            store,
            profiles: new ProfileRegistry().add(profile("partial-retry")),
            model,
        });
        const created = await harness.createSession({profileKey: "partial-retry", initial: {}, hostContext: {}});
        const first = await harness.invoke({sessionId: created.session.metadata.sessionId, payload: {}});
        expect((await first.result()).status).toBe("failed");

        const retried = await harness.retry(created.session.metadata.sessionId, first.invocationId);
        expect((await retried.result()).status).toBe("completed");

        expect(JSON.stringify(model.requests[1]?.messages)).not.toContain("do not replay");
        expect(invocationPartial(await store.read(created.session.metadata.sessionId), first.invocationId))
            .toEqual({turn: 1, content: [{type: "text", text: "do not replay"}]});
    });

    test("host partial projection remains recoverable without entering Core transcript or retry input", async () => {
        const directory = await mkdtemp(join(tmpdir(), "neuro-harness-host-partial-"));
        directories.push(directory);
        const model = new ScriptedModelRuntime([
            new ModelTurnError("stream dropped", {
                partial: {content: [{type: "text", text: "core partial"}]},
            }),
        ]);
        const store = new JsonlSessionStore<JsonObject>({directory});
        const profiles = new ProfileRegistry().add(profile("partial-host-projection"));
        const harness = new NeuroAgentHarness({store, profiles, model});
        const projectionCodec = hostPartialProjectionCodec();
        const created = await harness.createSession({profileKey: "partial-host-projection", initial: {}, hostContext: {}});

        const failed = await harness.invoke({sessionId: created.session.metadata.sessionId, payload: {}});
        const failedResult = await failed.result();
        expect(failedResult.partial).toEqual({turn: 1, content: [{type: "text", text: "core partial"}]});

        const projected = await harness.appendEntries(
            created.session.metadata.sessionId,
            [projectionCodec.draft({
                invocationId: failed.invocationId,
                turn: failedResult.partial!.turn,
                status: "partial",
                text: "core partial",
            }, {invocationId: failed.invocationId})],
            {cause: "test.host.partial.projection"},
        );
        const hostEntry = projected.session.entries.find((entry) => entry.kind === projectionCodec.kind);
        expect(hostEntry).toBeDefined();
        expect(projectionCodec.parse(hostEntry!)).toEqual({
            invocationId: failed.invocationId,
            turn: 1,
            status: "partial",
            text: "core partial",
        });
        expect(activeSessionPath(projected.session)).toContainEqual(expect.objectContaining({id: hostEntry!.id}));
        expect(JSON.stringify(projectSessionTranscript(projected.session).messages)).not.toContain("core partial");
        expect(invocationPartial(projected.session, failed.invocationId)).toEqual(failedResult.partial);

        // Rewinding the active branch hides the host presentation entry from the active transcript,
        // but append-only recovery still retains both the host projection and Core Invocation fact.
        const rewound = await harness.write({
            target: created.session.metadata.sessionId,
            expectedVersion: projected.session.version,
            cause: "test.host.partial.rewind",
            operations: [{type: "moveLeaf", leafId: null}],
        });
        expect(activeSessionPath(rewound.session)).not.toContainEqual(expect.objectContaining({id: hostEntry!.id}));
        expect(rewound.session.entries).toContainEqual(expect.objectContaining({id: hostEntry!.id, kind: projectionCodec.kind}));
        expect(projectionCodec.parse(rewound.session.entries.find((entry) => entry.kind === projectionCodec.kind)!)).toEqual(
            expect.objectContaining({invocationId: failed.invocationId, text: "core partial"}),
        );
        expect(invocationPartial(rewound.session, failed.invocationId)).toEqual(failedResult.partial);

        await harness.dispose();

        const restoredStore = new JsonlSessionStore<JsonObject>({directory});
        const restoredModel = new ScriptedModelRuntime([{
            message: {
                role: "assistant",
                content: [{type: "text", text: "retried"}],
                timestamp: 2,
            },
        }]);
        const restored = new NeuroAgentHarness({store: restoredStore, profiles, model: restoredModel});
        const recovered = await restoredStore.read(created.session.metadata.sessionId);
        expect(projectionCodec.parse(recovered.entries.find((entry) => entry.kind === projectionCodec.kind)!)).toEqual(
            expect.objectContaining({invocationId: failed.invocationId, status: "partial"}),
        );
        expect(invocationPartial(recovered, failed.invocationId)).toEqual(failedResult.partial);

        const retried = await restored.retry(created.session.metadata.sessionId, failed.invocationId);
        expect((await retried.result()).status).toBe("completed");
        expect(JSON.stringify(restoredModel.requests[0]?.messages)).not.toContain("core partial");
        await restored.dispose();
    });

    test("Invocation-addressed partial remains recoverable after the active branch rewinds", async () => {
        const store = new MemorySessionStore<number, JsonObject>();
        const harness = new NeuroAgentHarness({
            store,
            profiles: new ProfileRegistry().add(profile("partial-rewind")),
            model: new ScriptedModelRuntime([
                new ModelTurnError("stream dropped", {
                    partial: {content: [{type: "text", text: "branch audit"}]},
                }),
            ]),
        });
        const created = await harness.createSession({profileKey: "partial-rewind", initial: {}, hostContext: {}});
        const handle = await harness.invoke({sessionId: created.session.metadata.sessionId, payload: {}});
        expect((await handle.result()).status).toBe("failed");
        const snapshot = await store.read(created.session.metadata.sessionId);
        const userEntry = snapshot.entries.find((entry) => entry.kind === "agent.message");

        const rewound = await harness.write({
            target: created.session.metadata.sessionId,
            expectedVersion: snapshot.version,
            cause: "test.rewind-before-partial",
            operations: [{type: "moveLeaf", leafId: userEntry?.id ?? null}],
        });

        expect(rewound.session.activeLeafId).toBe(userEntry?.id ?? null);
        expect(invocationPartial(rewound.session, handle.invocationId))
            .toEqual({turn: 1, content: [{type: "text", text: "branch audit"}]});
    });

    test("compaction summary input excludes the durable partial fact", async () => {
        const summaryRequests: CompactionRequest[] = [];
        const model = new ScriptedModelRuntime([
            new ModelTurnError("first failed", {
                partial: {content: [{type: "text", text: "do not summarize"}]},
            }),
            {
                message: {
                    role: "assistant",
                    content: [{type: "text", text: "continued"}],
                    timestamp: 2,
                },
            },
        ]);
        const store = new MemorySessionStore<number, JsonObject>();
        const harness = new NeuroAgentHarness({
            store,
            profiles: new ProfileRegistry().add(defineProfile({
                manifest: {key: "partial-compaction", name: "partial-compaction"},
                initial: objectSchema,
                payload: objectSchema,
                prepare: () => ({
                    systemPrompt: "partial-compaction",
                    modelConfig: {},
                    compaction: {triggerTokens: 2, keepRecentTokens: 1},
                }),
            })),
            model,
            compactor: {
                estimate: () => 1,
                async summarize(request) {
                    summaryRequests.push(request);
                    return "safe summary";
                },
            },
        });
        const created = await harness.createSession({profileKey: "partial-compaction", initial: {}, hostContext: {}});
        const first = await harness.invoke({sessionId: created.session.metadata.sessionId, payload: {attempt: 1}});
        expect((await first.result()).status).toBe("failed");

        const second = await harness.invoke({sessionId: created.session.metadata.sessionId, payload: {attempt: 2}});
        expect((await second.result()).status).toBe("completed");

        expect(summaryRequests).toHaveLength(1);
        expect(JSON.stringify(summaryRequests[0]?.messages)).not.toContain("do not summarize");
        expect(JSON.stringify(model.requests[1]?.messages)).not.toContain("do not summarize");
    });

    test("cooperative abort persists partial inside the grace period", async () => {
        let markStarted!: () => void;
        const started = new Promise<void>((resolve) => {
            markStarted = resolve;
        });
        const store = new MemorySessionStore<number, JsonObject>();
        const harness = new NeuroAgentHarness({
            abortGraceMs: 200,
            store,
            profiles: new ProfileRegistry().add(profile("partial-abort")),
            model: new ScriptedModelRuntime([
                async (request) => {
                    markStarted();
                    await new Promise<void>((resolve) => request.signal.addEventListener("abort", () => resolve(), {once: true}));
                    throw new ModelTurnError("aborted", {
                        partial: {content: [{type: "text", text: "stopped half"}]},
                    });
                },
            ]),
        });
        const created = await harness.createSession({profileKey: "partial-abort", initial: {}, hostContext: {}});
        const handle = await harness.invoke({sessionId: created.session.metadata.sessionId, payload: {}});
        await started;
        handle.abort();

        const result = await handle.result();
        const snapshot = await store.read(created.session.metadata.sessionId);
        expect(result.status).toBe("aborted");
        expect(result.partial).toEqual({turn: 1, content: [{type: "text", text: "stopped half"}]});
        expect(invocationPartial(snapshot, handle.invocationId)).toEqual(result.partial);
        expect(durableText(snapshot)).not.toContain("stopped half");
        await harness.dispose();
    });

    test("forced abort winner ignores a late partial", async () => {
        let markStarted!: () => void;
        const started = new Promise<void>((resolve) => {
            markStarted = resolve;
        });
        let release!: () => void;
        const released = new Promise<void>((resolve) => {
            release = resolve;
        });
        const store = new MemorySessionStore<number, JsonObject>();
        const harness = new NeuroAgentHarness({
            abortGraceMs: 0,
            store,
            profiles: new ProfileRegistry().add(profile("partial-forced-abort")),
            model: new ScriptedModelRuntime([
                async () => {
                    markStarted();
                    await released;
                    throw new ModelTurnError("late", {
                        partial: {content: [{type: "text", text: "too late"}]},
                    });
                },
            ]),
        });
        const created = await harness.createSession({profileKey: "partial-forced-abort", initial: {}, hostContext: {}});
        const handle = await harness.invoke({sessionId: created.session.metadata.sessionId, payload: {}});
        await started;
        handle.abort();
        const result = await handle.result();
        release();
        await new Promise((resolve) => setTimeout(resolve, 10));

        const snapshot = await store.read(created.session.metadata.sessionId);
        expect(result.status).toBe("aborted");
        expect(result.partial).toBeUndefined();
        expect(invocationPartial(snapshot, handle.invocationId)).toBeUndefined();
        expect(partialEntries(snapshot, handle.invocationId)).toHaveLength(0);
        await harness.dispose();
    });

    test("host writes cannot forge partial facts and invalid partials fail closed", async () => {
        expect(() => new ModelTurnError("empty", {
            partial: {content: [{type: "text", text: "   "}]},
        })).toThrow("partial");
        expect(() => new ModelTurnError("tool", {
            partial: {
                content: [{
                    type: "toolCall",
                    call: {id: "x", name: "read", arguments: {}},
                }],
            } as never,
        })).toThrow("partial");

        const harness = new NeuroAgentHarness({
            store: new MemorySessionStore<number, JsonObject>(),
            profiles: new ProfileRegistry().add(profile("partial-forge")),
            model: new ScriptedModelRuntime([]),
        });
        const created = await harness.createSession({profileKey: "partial-forge", initial: {}, hostContext: {}});
        await expect(harness.write({
            target: created.session.metadata.sessionId,
            cause: "host.forge.partial",
            operations: [{
                type: "appendEntries",
                entries: [{
                    kind: "harness.invocation.partial",
                    invocationId: "forged",
                    payload: {turn: 1, content: [{type: "text", text: "forged"}]},
                }],
            }],
        })).rejects.toThrow("Harness 保留");
    });

    test("malformed newest persisted partial fact fails closed", async () => {
        const store = new MemorySessionStore<number, JsonObject>();
        const harness = new NeuroAgentHarness({
            store,
            profiles: new ProfileRegistry().add(profile("partial-malformed")),
            model: new ScriptedModelRuntime([
                new ModelTurnError("stream dropped", {
                    partial: {content: [{type: "text", text: "valid"}]},
                }),
            ]),
        });
        const created = await harness.createSession({profileKey: "partial-malformed", initial: {}, hostContext: {}});
        const handle = await harness.invoke({sessionId: created.session.metadata.sessionId, payload: {}});
        expect((await handle.result()).persistence).toBe("confirmed");
        const snapshot = await store.read(created.session.metadata.sessionId);

        const corrupted = await store.commit({
            target: created.session.metadata.sessionId,
            expectedVersion: snapshot.version,
            cause: "test.inject.corrupt-partial",
            operations: [{
                type: "appendEntries",
                entries: [{
                    kind: "harness.invocation.partial",
                    invocationId: handle.invocationId,
                    payload: {
                        turn: 1,
                        content: [{type: "toolCall", call: {id: "bad", name: "read", arguments: {}}}],
                    },
                }],
            }],
        });

        expect(() => invocationPartial(corrupted.snapshot, handle.invocationId))
            .toThrow(`Invocation ${handle.invocationId} partial fact 非法`);
    });

    test("persisted partial turn must match the terminal Invocation turn", async () => {
        const store = new MemorySessionStore<number, JsonObject>();
        const harness = new NeuroAgentHarness({
            store,
            profiles: new ProfileRegistry().add(profile("partial-turn-mismatch")),
            model: new ScriptedModelRuntime([
                new ModelTurnError("stream dropped", {
                    partial: {content: [{type: "text", text: "valid turn"}]},
                }),
            ]),
        });
        const created = await harness.createSession({profileKey: "partial-turn-mismatch", initial: {}, hostContext: {}});
        const handle = await harness.invoke({sessionId: created.session.metadata.sessionId, payload: {}});
        expect((await handle.result()).persistence).toBe("confirmed");
        const snapshot = await store.read(created.session.metadata.sessionId);

        const corrupted = await store.commit({
            target: created.session.metadata.sessionId,
            expectedVersion: snapshot.version,
            cause: "test.inject.partial-turn-mismatch",
            operations: [{
                type: "appendEntries",
                entries: [{
                    kind: "harness.invocation.partial",
                    invocationId: handle.invocationId,
                    payload: {turn: 2, content: [{type: "text", text: "impossible turn"}]},
                }],
            }],
        });

        expect(() => invocationPartial(corrupted.snapshot, handle.invocationId))
            .toThrow(`Invocation ${handle.invocationId} partial fact 非法`);
    });

    test("completed Invocation cannot expose a persisted partial fact", async () => {
        const store = new MemorySessionStore<number, JsonObject>();
        const harness = new NeuroAgentHarness({
            store,
            profiles: new ProfileRegistry().add(profile("partial-completed")),
            model: new ScriptedModelRuntime([{
                message: {
                    role: "assistant",
                    content: [{type: "text", text: "complete answer"}],
                    timestamp: 1,
                },
            }]),
        });
        const created = await harness.createSession({profileKey: "partial-completed", initial: {}, hostContext: {}});
        const handle = await harness.invoke({sessionId: created.session.metadata.sessionId, payload: {}});
        expect((await handle.result()).status).toBe("completed");
        const snapshot = await store.read(created.session.metadata.sessionId);

        const corrupted = await store.commit({
            target: created.session.metadata.sessionId,
            expectedVersion: snapshot.version,
            cause: "test.inject.completed-partial",
            operations: [{
                type: "appendEntries",
                entries: [{
                    kind: "harness.invocation.partial",
                    invocationId: handle.invocationId,
                    payload: {turn: 1, content: [{type: "text", text: "not a terminal partial"}]},
                }],
            }],
        });

        expect(() => invocationPartial(corrupted.snapshot, handle.invocationId))
            .toThrow(`Invocation ${handle.invocationId} partial fact 非法`);
    });
});
