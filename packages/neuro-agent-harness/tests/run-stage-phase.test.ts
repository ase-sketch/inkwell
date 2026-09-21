import {describe, expect, test} from "bun:test";
import {
    NeuroAgentHarness,
    SessionConflictError,
    ProfileRegistry,
    defineProfile,
    defineSchema,
    type JsonObject,
} from "../src/index.js";
import {MemorySessionStore} from "../src/storage/memory.js";
import {ScriptedModelRuntime} from "../src/testing/index.js";

const objectSchema = defineSchema<JsonObject>((value) => {
    if (value === null || typeof value !== "object" || Array.isArray(value)) {
        throw new Error("必须是 object");
    }
    return value;
}, {type: "object"});

class FailingIngestStore extends MemorySessionStore<number, JsonObject> {
    failTranscript = false;
    conflictOnTranscript = false;

    override async commit(
        plan: Parameters<MemorySessionStore<number, JsonObject>["commit"]>[0],
        options?: Parameters<MemorySessionStore<number, JsonObject>["commit"]>[1],
    ) {
        if (this.failTranscript && plan.cause === "harness.transcript.commit") {
            throw new Error("ingest down");
        }
        if (this.conflictOnTranscript && plan.cause === "harness.transcript.commit") {
            throw new SessionConflictError("phase-ingest-conflict", 1, 2);
        }
        return super.commit(plan, options);
    }
}

// 第九十八轮：InvocationError.phase 的 stage 级归因（对齐 NeuroBook
// RunKernelStageError：model/ingest/compaction/settleRun；其余仍为
// run/abort/approval 粗粒度）。
describe("InvocationError phase 归因", () => {
    test("model 阶段失败归因为 phase model", async () => {
        const harness = new NeuroAgentHarness({
            store: new MemorySessionStore(),
            profiles: new ProfileRegistry().add(defineProfile({
                manifest: {key: "phase-model", name: "Phase Model"},
                initial: objectSchema,
                payload: objectSchema,
                prepare: () => ({systemPrompt: "phase", modelConfig: {}}),
            })),
            model: {
                async runTurn() {
                    throw new Error("model down");
                },
            },
        });
        const created = await harness.createSession({profileKey: "phase-model", initial: {}, hostContext: {}});
        const result = await (await harness.invoke({sessionId: created.session.metadata.sessionId, payload: {}})).result();
        expect(result.status).toBe("failed");
        expect(result.error?.phase).toBe("model");
        await harness.dispose();
    });

    test("compaction 阶段失败归因为 phase compaction", async () => {
        const harness = new NeuroAgentHarness({
            store: new MemorySessionStore(),
            profiles: new ProfileRegistry().add(defineProfile({
                manifest: {key: "phase-compact", name: "Phase Compact"},
                initial: objectSchema,
                payload: objectSchema,
                prepare: () => ({
                    systemPrompt: "phase",
                    modelConfig: {},
                    compaction: {triggerTokens: 3, keepRecentTokens: 1},
                }),
            })),
            model: new ScriptedModelRuntime([{message: {
                role: "assistant",
                content: [{type: "text", text: "a1"}],
                timestamp: 1,
            }}]),
            compactor: {estimate: () => 1, summarize: async () => "   "},
        });
        const created = await harness.createSession({profileKey: "phase-compact", initial: {}, hostContext: {}});
        await (await harness.invoke({sessionId: created.session.metadata.sessionId, payload: {first: true}})).result();
        const result = await (await harness.invoke({sessionId: created.session.metadata.sessionId, payload: {second: true}})).result();
        expect(result.status).toBe("failed");
        expect(result.error?.phase).toBe("compaction");
        await harness.dispose();
    });

    test("settleRun 阶段失败归因为 phase settleRun", async () => {
        const harness = new NeuroAgentHarness({
            store: new MemorySessionStore(),
            profiles: new ProfileRegistry().add(defineProfile({
                manifest: {key: "phase-settle", name: "Phase Settle"},
                initial: objectSchema,
                payload: objectSchema,
                prepare: () => ({systemPrompt: "phase", modelConfig: {}}),
                hooks: [{
                    name: "fail-settle",
                    stage: "settleRun",
                    run: () => {
                        throw new Error("settle down");
                    },
                }],
            })),
            model: new ScriptedModelRuntime([{message: {
                role: "assistant",
                content: [{type: "text", text: "a1"}],
                timestamp: 1,
            }}]),
        });
        const created = await harness.createSession({profileKey: "phase-settle", initial: {}, hostContext: {}});
        const result = await (await harness.invoke({sessionId: created.session.metadata.sessionId, payload: {}})).result();
        expect(result.status).toBe("failed");
        expect(result.error?.phase).toBe("settleRun");
        await harness.dispose();
    });

    test("transcript 提交失败归因为 phase ingest", async () => {
        const store = new FailingIngestStore();
        const harness = new NeuroAgentHarness({
            store,
            profiles: new ProfileRegistry().add(defineProfile({
                manifest: {key: "phase-ingest", name: "Phase Ingest"},
                initial: objectSchema,
                payload: objectSchema,
                prepare: () => ({systemPrompt: "phase", modelConfig: {}}),
            })),
            model: new ScriptedModelRuntime([{message: {
                role: "assistant",
                content: [{type: "text", text: "a1"}],
                timestamp: 1,
            }}]),
        });
        const created = await harness.createSession({profileKey: "phase-ingest", initial: {}, hostContext: {}});
        store.failTranscript = true;
        const result = await (await harness.invoke({sessionId: created.session.metadata.sessionId, payload: {}})).result();
        expect(result.status).toBe("failed");
        expect(result.error?.phase).toBe("ingest");
        await harness.dispose();
    });


    test("ingest 包装内 SessionConflictError 保留 name/retryable", async () => {
        const store = new FailingIngestStore();
        const harness = new NeuroAgentHarness({
            store,
            profiles: new ProfileRegistry().add(defineProfile({
                manifest: {key: "phase-ingest-conflict", name: "Phase Ingest Conflict"},
                initial: objectSchema,
                payload: objectSchema,
                prepare: () => ({systemPrompt: "phase", modelConfig: {}}),
            })),
            model: new ScriptedModelRuntime([{message: {
                role: "assistant",
                content: [{type: "text", text: "a1"}],
                timestamp: 1,
            }}]),
        });
        const created = await harness.createSession({profileKey: "phase-ingest-conflict", initial: {}, hostContext: {}});
        store.conflictOnTranscript = true;
        const result = await (await harness.invoke({sessionId: created.session.metadata.sessionId, payload: {}})).result();
        expect(result.status).toBe("failed");
        expect(result.error?.phase).toBe("ingest");
        expect(result.error?.name).toBe("SessionConflictError");
        expect(result.error?.retryable).toBe(true);
        await harness.dispose();
    });
    test("未包装阶段（beforeTurn hook）保持粗粒度 phase run", async () => {
        const harness = new NeuroAgentHarness({
            store: new MemorySessionStore(),
            profiles: new ProfileRegistry().add(defineProfile({
                manifest: {key: "phase-fallback", name: "Phase Fallback"},
                initial: objectSchema,
                payload: objectSchema,
                prepare: () => ({systemPrompt: "phase", modelConfig: {}}),
                hooks: [{
                    name: "fail-before",
                    stage: "beforeTurn",
                    run: () => {
                        throw new Error("before down");
                    },
                }],
            })),
            model: new ScriptedModelRuntime([{message: {
                role: "assistant",
                content: [{type: "text", text: "a1"}],
                timestamp: 1,
            }}]),
        });
        const created = await harness.createSession({profileKey: "phase-fallback", initial: {}, hostContext: {}});
        const result = await (await harness.invoke({sessionId: created.session.metadata.sessionId, payload: {}})).result();
        expect(result.status).toBe("failed");
        expect(result.error?.phase).toBe("run");
        await harness.dispose();
    });
});
