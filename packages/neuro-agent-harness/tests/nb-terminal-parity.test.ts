import {afterEach, describe, expect, test} from "bun:test";
import {mkdtemp, rm} from "node:fs/promises";
import {join} from "node:path";
import {tmpdir} from "node:os";
import {
    NeuroAgentHarness,
    ProfileRegistry,
    defineProfile,
    defineSchema,
    defineTool,
    type JsonObject,
} from "../src/index.js";
import {JsonlSessionStore} from "../src/storage/jsonl.js";
import {MemorySessionStore} from "../src/storage/memory.js";
import {ScriptedModelRuntime} from "../src/testing/index.js";
import {projectFollowUps} from "../src/follow-up-ledger.js";

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

function assistant(text: string, timestamp: number) {
    return {
        message: {
            role: "assistant" as const,
            content: [{type: "text" as const, text}],
            timestamp,
        },
    };
}

function bounded<T>(promise: Promise<T>, label: string, timeoutMs = 2000): Promise<T> {
    return Promise.race([
        promise,
        new Promise<never>((_, reject) => setTimeout(() => reject(new Error(`${label} 超时`)), timeoutMs)),
    ]);
}

async function until<T>(
    factory: () => Promise<T>,
    predicate: (value: T) => boolean,
    label: string,
    timeoutMs = 2000,
): Promise<T> {
    const deadline = Date.now() + timeoutMs;
    for (;;) {
        const value = await factory();
        if (predicate(value)) return value;
        if (Date.now() > deadline) throw new Error(`${label} 超时`);
        await new Promise((resolve) => setTimeout(resolve, 5));
    }
}

async function tempDirectory(): Promise<string> {
    const directory = await mkdtemp(join(tmpdir(), "neuro-harness-nb-terminal-"));
    directories.push(directory);
    return directory;
}

// 第九十九轮：NeuroBook 黑盒终态语义吸收（NB black-box.test.ts #13-17/#21 映射）。
// 依据：NB pauseFollowUps(invocationId, reason) 只在队列非空时暂停（neuro-agent-harness.ts:6429-6441），
// terminal error 用 reason:"error"、强制取消用 "aborted"；工具抛异常在 NB 是致命错误，SA 以显式 terminate 承载致命意图。
describe("NeuroBook 黑盒终态语义吸收", () => {
    test("failed 终态自动暂停 follow-up，pausedBy 携带 invocationId 与 reason error", async () => {
        let markStarted!: () => void;
        let release!: () => void;
        const started = new Promise<void>((resolve) => {
            markStarted = resolve;
        });
        const gate = new Promise<void>((resolve) => {
            release = resolve;
        });
        const harness = new NeuroAgentHarness({
            store: new MemorySessionStore(),
            profiles: new ProfileRegistry().add(defineProfile({
                manifest: {key: "nb-terminal-failed", name: "NB Terminal Failed"},
                initial: objectSchema,
                payload: objectSchema,
                prepare: () => ({systemPrompt: "terminal", modelConfig: {}}),
            })),
            model: {
                async runTurn() {
                    markStarted();
                    await gate;
                    throw new Error("model down");
                },
            },
        });
        const created = await harness.createSession({profileKey: "nb-terminal-failed", initial: {}, hostContext: {}});
        const sessionId = created.session.metadata.sessionId;
        const handle = await harness.invoke({sessionId, payload: {}});
        await started;
        const item = await harness.followUp(sessionId, {});
        release();
        const result = await handle.result();

        expect(result.status).toBe("failed");
        const state = await until(() => harness.followUpState(sessionId), (value) => value.paused, "failed 终态 pause");
        expect(state.paused).toBe(true);
        expect(state.pausedBy).toEqual({
            itemId: item.id,
            reason: "error",
            invocationId: result.invocationId,
        });
        expect(state.items).toHaveLength(1);
        const snapshot = await harness.snapshot(sessionId);
        const pausedFacts = snapshot.session.entries.filter((entry) => entry.kind === "harness.followUp.paused");
        expect(pausedFacts.at(-1)?.payload).toMatchObject({
            paused: true,
            reason: "error",
            invocationId: result.invocationId,
        });
        await harness.dispose();
    });

    test("aborted 终态自动暂停 follow-up，pausedBy 携带 invocationId 与 reason aborted", async () => {
        let markStarted!: () => void;
        const started = new Promise<void>((resolve) => {
            markStarted = resolve;
        });
        const harness = new NeuroAgentHarness({
            abortGraceMs: 0,
            store: new MemorySessionStore(),
            profiles: new ProfileRegistry().add(defineProfile({
                manifest: {key: "nb-terminal-aborted", name: "NB Terminal Aborted"},
                initial: objectSchema,
                payload: objectSchema,
                prepare: () => ({systemPrompt: "terminal", modelConfig: {}}),
            })),
            model: {
                async runTurn() {
                    markStarted();
                    return new Promise<never>(() => {});
                },
            },
        });
        const created = await harness.createSession({profileKey: "nb-terminal-aborted", initial: {}, hostContext: {}});
        const sessionId = created.session.metadata.sessionId;
        const handle = await harness.invoke({sessionId, payload: {}});
        await started;
        const item = await harness.followUp(sessionId, {});
        handle.abort();
        const result = await bounded(handle.result(), "aborted terminal");

        expect(result.status).toBe("aborted");
        const state = await until(() => harness.followUpState(sessionId), (value) => value.paused, "aborted 终态 pause");
        expect(state.paused).toBe(true);
        expect(state.pausedBy).toEqual({
            itemId: item.id,
            reason: "aborted",
            invocationId: result.invocationId,
        });
        expect(state.items).toHaveLength(1);
        await harness.dispose();
    });

    test("终态时 follow-up 队列为空不写 pause 事实", async () => {
        const store = new MemorySessionStore();
        const harness = new NeuroAgentHarness({
            store,
            profiles: new ProfileRegistry().add(defineProfile({
                manifest: {key: "nb-terminal-empty", name: "NB Terminal Empty"},
                initial: objectSchema,
                payload: objectSchema,
                prepare: () => ({systemPrompt: "terminal", modelConfig: {}}),
            })),
            model: {
                async runTurn() {
                    throw new Error("model down");
                },
            },
        });
        const created = await harness.createSession({profileKey: "nb-terminal-empty", initial: {}, hostContext: {}});
        const sessionId = created.session.metadata.sessionId;
        const result = await (await harness.invoke({sessionId, payload: {}})).result();

        expect(result.status).toBe("failed");
        await harness.dispose();

        const entries = (await store.read(sessionId)).entries;
        expect(projectFollowUps<number>(entries).paused).toBe(false);
        expect(projectFollowUps<number>(entries).pausedBy).toBeUndefined();
        expect(entries.some((entry) => entry.kind === "harness.followUp.paused")).toBe(false);
    });

    test("终态 pausedBy 经 JSONL 重启恢复并可 resume 继续消费", async () => {
        let markStarted!: () => void;
        let release!: () => void;
        const started = new Promise<void>((resolve) => {
            markStarted = resolve;
        });
        const gate = new Promise<void>((resolve) => {
            release = resolve;
        });
        const model = new ScriptedModelRuntime<JsonObject>([
            async () => {
                markStarted();
                await gate;
                throw new Error("model down");
            },
            assistant("second", 2),
        ]);
        const directory = await tempDirectory();
        const store = new JsonlSessionStore({directory});
        const registry = new ProfileRegistry().add(defineProfile({
            manifest: {key: "nb-terminal-jsonl", name: "NB Terminal JSONL"},
            initial: objectSchema,
            payload: objectSchema,
            prepare: () => ({systemPrompt: "terminal", modelConfig: {}}),
        }));
        const first = new NeuroAgentHarness({store, profiles: registry, model});
        const created = await first.createSession({profileKey: "nb-terminal-jsonl", initial: {}, hostContext: {}});
        const sessionId = created.session.metadata.sessionId;
        const handle = await first.invoke({sessionId, payload: {}});
        await started;
        const item = await first.followUp(sessionId, {});
        release();
        const result = await handle.result();
        expect(result.status).toBe("failed");
        await first.dispose();

        const second = new NeuroAgentHarness({store, profiles: registry, model});
        const state = await second.followUpState(sessionId);
        expect(state.paused).toBe(true);
        expect(state.pausedBy).toEqual({
            itemId: item.id,
            reason: "error",
            invocationId: result.invocationId,
        });
        const resumed = await second.resumeFollowUps(sessionId);
        expect(resumed).not.toBeNull();
        const resumedResult = await bounded(resumed!.result(), "resumed follow-up");
        expect(resumedResult.status).toBe("completed");
        const finalState = await second.followUpState(sessionId);
        expect(finalState.paused).toBe(false);
        expect(finalState.items).toHaveLength(0);
        await second.dispose();
    });

    test("Tool 抛异常按可恢复 error toolResult 提交并让模型继续（显式 terminate 才致命）", async () => {
        const boom = defineTool({
            name: "boom",
            description: "Throws.",
            parameters: objectSchema,
            execute: () => {
                throw new Error("tool failed");
            },
        });
        const model = new ScriptedModelRuntime<JsonObject>([
            {
                message: {
                    role: "assistant",
                    content: [{type: "toolCall", call: {id: "boom-1", name: "boom", arguments: {}}}],
                    timestamp: 1,
                },
            },
            (request) => {
                const results = request.messages.filter((message) => message.role === "toolResult");
                expect(results).toHaveLength(1);
                expect(results[0]).toMatchObject({toolCallId: "boom-1", isError: true});
                return assistant("handled", 2);
            },
        ]);
        const harness = new NeuroAgentHarness({
            store: new MemorySessionStore(),
            profiles: new ProfileRegistry().add(defineProfile({
                manifest: {key: "nb-tool-throw", name: "NB Tool Throw"},
                initial: objectSchema,
                payload: objectSchema,
                prepare: () => ({systemPrompt: "tool", modelConfig: {}, tools: [boom]}),
            })),
            model,
        });
        const created = await harness.createSession({profileKey: "nb-tool-throw", initial: {}, hostContext: {}});
        const result = await (await harness.invoke({sessionId: created.session.metadata.sessionId, payload: {}})).result();

        expect(result.status).toBe("completed");
        const snapshot = await harness.snapshot(created.session.metadata.sessionId);
        const text = JSON.stringify(snapshot.session.entries);
        expect(text).toContain("handled");
        await harness.dispose();
    });

    test("failed 终态后未消费 steer 不再注入模型或 transcript", async () => {
        let markStarted!: () => void;
        let release!: () => void;
        const started = new Promise<void>((resolve) => {
            markStarted = resolve;
        });
        const gate = new Promise<void>((resolve) => {
            release = resolve;
        });
        let modelCalls = 0;
        const harness = new NeuroAgentHarness({
            store: new MemorySessionStore(),
            profiles: new ProfileRegistry().add(defineProfile({
                manifest: {key: "nb-terminal-steer", name: "NB Terminal Steer"},
                initial: objectSchema,
                payload: objectSchema,
                prepare: () => ({systemPrompt: "terminal", modelConfig: {}}),
            })),
            model: {
                async runTurn() {
                    modelCalls += 1;
                    markStarted();
                    await gate;
                    throw new Error("model down");
                },
            },
        });
        const created = await harness.createSession({profileKey: "nb-terminal-steer", initial: {}, hostContext: {}});
        const sessionId = created.session.metadata.sessionId;
        const handle = await harness.invoke({sessionId, payload: {}});
        await started;
        const queued = await harness.steer(sessionId, {});
        expect(queued.kind).toBe("steer");
        release();
        const result = await handle.result();

        expect(result.status).toBe("failed");
        expect(modelCalls).toBe(1);
        const snapshot = await harness.snapshot(sessionId);
        expect(JSON.stringify(snapshot.session.entries)).not.toContain("user_steer");
        await harness.dispose();
    });

    test("强制取消后 settleRun 迟到恢复的 writePlans 不得写入 Session", async () => {
        const store = new MemorySessionStore();
        let markSettle!: () => void;
        let releaseSettle!: () => void;
        const settleStarted = new Promise<void>((resolve) => {
            markSettle = resolve;
        });
        const settleGate = new Promise<void>((resolve) => {
            releaseSettle = resolve;
        });
        const harness = new NeuroAgentHarness({
            abortGraceMs: 0,
            store,
            profiles: new ProfileRegistry().add(defineProfile({
                manifest: {key: "nb-late-settle", name: "NB Late Settle"},
                initial: objectSchema,
                payload: objectSchema,
                prepare: () => ({systemPrompt: "settle", modelConfig: {}}),
                hooks: [{
                    name: "hang-settle",
                    stage: "settleRun",
                    async run(context) {
                        markSettle();
                        await settleGate;
                        return {
                            writePlans: [{
                                target: context.sessionId,
                                cause: "test.late-settle",
                                operations: [{
                                    type: "appendEntries",
                                    entries: [{kind: "test.late-settle", payload: {value: true}}],
                                }],
                            }],
                        };
                    },
                }],
            })),
            model: new ScriptedModelRuntime<JsonObject>([assistant("done", 1), assistant("fresh", 2)]),
        });
        const created = await harness.createSession({profileKey: "nb-late-settle", initial: {}, hostContext: {}});
        const sessionId = created.session.metadata.sessionId;
        const handle = await harness.invoke({sessionId, payload: {}});
        await settleStarted;
        handle.abort();
        const result = await bounded(handle.result(), "settle abort");
        expect(result.status).toBe("aborted");

        releaseSettle();

        for (let sample = 0; sample < 3; sample += 1) {
            await new Promise((resolve) => setTimeout(resolve, 10));
        }
        expect((await store.read(sessionId)).entries.some((entry) => entry.kind === "test.late-settle")).toBe(false);
        await harness.dispose();
        expect((await store.read(sessionId)).entries.some((entry) => entry.kind === "test.late-settle")).toBe(false);

        const secondHarness = new NeuroAgentHarness({
            store,
            profiles: new ProfileRegistry().add(defineProfile({
                manifest: {key: "nb-late-settle", name: "NB Late Settle"},
                initial: objectSchema,
                payload: objectSchema,
                prepare: () => ({systemPrompt: "settle", modelConfig: {}}),
            })),
            model: new ScriptedModelRuntime<JsonObject>([assistant("fresh", 2)]),
        });
        const next = await (await secondHarness.invoke({sessionId, payload: {}})).result();
        expect(next.status).toBe("completed");
        expect((await store.read(sessionId)).entries.some((entry) => entry.kind === "test.late-settle")).toBe(false);
        await secondHarness.dispose();
    });

    test("interrupted 收口后队列保持未暂停且宿主可 resume（NB 未实现 interrupted pause）", async () => {
        let markStarted!: () => void;
        let release!: () => void;
        const started = new Promise<void>((resolve) => {
            markStarted = resolve;
        });
        const gate = new Promise<void>((resolve) => {
            release = resolve;
        });
        const model = new ScriptedModelRuntime<JsonObject>([
            async () => {
                markStarted();
                await gate;
                return assistant("late", 2);
            },
            assistant("after-interrupted", 3),
        ]);
        const directory = await tempDirectory();
        const store = new JsonlSessionStore({directory});
        const registry = new ProfileRegistry().add(defineProfile({
            manifest: {key: "nb-interrupted-queue", name: "NB Interrupted Queue"},
            initial: objectSchema,
            payload: objectSchema,
            prepare: () => ({systemPrompt: "terminal", modelConfig: {}}),
        }));
        const first = new NeuroAgentHarness({store, profiles: registry, model});
        const created = await first.createSession({profileKey: "nb-interrupted-queue", initial: {}, hostContext: {}});
        const sessionId = created.session.metadata.sessionId;
        const handle = await first.invoke({sessionId, payload: {}});
        await started;
        await first.followUp(sessionId, {});

        // 模拟重启：新 Store 实例对同一目录显式 reconcile，把 running 收口为 interrupted。
        const restartedStore = new JsonlSessionStore({directory});
        const reconciled = await restartedStore.reconcileInterrupted();
        expect(reconciled).toHaveLength(1);
        expect(reconciled[0]?.status).toBe("interrupted");

        const second = new NeuroAgentHarness({store: restartedStore, profiles: registry, model});
        const state = await second.followUpState(sessionId);
        expect(state.paused).toBe(false);
        expect(state.pausedBy).toBeUndefined();
        expect(state.items).toHaveLength(1);
        const snapshot = await second.snapshot(sessionId);
        expect(snapshot.session.invocations.find((invocation) => invocation.id === reconciled[0]?.id)?.status).toBe("interrupted");

        release();
        await bounded(handle.result(), "late first run settles");
        await first.dispose();

        const resumed = await second.resumeFollowUps(sessionId);
        expect(resumed).not.toBeNull();
        const resumedResult = await bounded(resumed!.result(), "resumed after interrupted");
        expect(resumedResult.status).toBe("completed");
        const finalState = await second.followUpState(sessionId);
        expect(finalState.items).toHaveLength(0);
        await second.dispose();
    });
});
