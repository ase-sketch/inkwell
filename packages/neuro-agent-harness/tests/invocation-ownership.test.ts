import {afterEach, describe, expect, test} from "bun:test";
import {mkdtemp, rm} from "node:fs/promises";
import {join} from "node:path";
import {tmpdir} from "node:os";
import {
    NeuroAgentHarness,
    InvocationOwnershipError,
    ProfileRegistry,
    SessionEventHub,
    SessionInvariantError,
    defineCapability,
    defineProfile,
    defineSchema,
    defineTool,
    type AssistantContent,
    type JsonObject,
    type RuntimeHookContext,
    type SessionSnapshot,
} from "../src/index.js";
import {MemorySessionStore} from "../src/storage/memory.js";
import {JsonlSessionStore} from "../src/storage/jsonl.js";
import {ScriptedModelRuntime} from "../src/testing/index.js";

const directories: string[] = [];

afterEach(async () => {
    await Promise.all(directories.splice(0).map((directory) => rm(directory, {recursive: true, force: true})));
});

async function tempDirectory(): Promise<string> {
    const directory = await mkdtemp(join(tmpdir(), "neuro-harness-invocation-owner-"));
    directories.push(directory);
    return directory;
}

async function startInvocation<TStore extends {
    create(input: {profileKey: string; initial: null; hostContext: JsonObject}): Promise<{metadata: {sessionId: number}}>;
    commit(plan: {
        target: number;
        cause: string;
        operations: readonly [{
            type: "startInvocation";
            invocation: {
                id: string;
                sessionId: number;
                profileKey: string;
                caller: {kind: "system"; name: string};
                input: null;
                createdAt: number;
            };
        }];
    }): Promise<unknown>;
}>(store: TStore): Promise<number> {
    const session = await store.create({profileKey: "owner", initial: null, hostContext: {}});
    await store.commit({
        target: session.metadata.sessionId,
        cause: "test.owner.start",
        operations: [{
            type: "startInvocation",
            invocation: {
                id: "active",
                sessionId: session.metadata.sessionId,
                profileKey: "owner",
                caller: {kind: "system", name: "test"},
                input: null,
                createdAt: 1,
            },
        }],
    });
    return session.metadata.sessionId;
}

class StaleOwnerReadStore extends MemorySessionStore<number, JsonObject> {
    private staleSnapshot: SessionSnapshot<number, JsonObject> | undefined;

    serveNextRead(snapshot: SessionSnapshot<number, JsonObject>): void {
        this.staleSnapshot = snapshot;
    }

    override async read(sessionId: number): Promise<SessionSnapshot<number, JsonObject>> {
        if (this.staleSnapshot) {
            const snapshot = this.staleSnapshot;
            this.staleSnapshot = undefined;
            return structuredClone(snapshot);
        }
        return super.read(sessionId);
    }
}

class RecordingStore extends MemorySessionStore<number, JsonObject> {
    readonly causes: string[] = [];

    override async commit(plan: Parameters<MemorySessionStore<number, JsonObject>["commit"]>[0]) {
        this.causes.push(plan.cause);
        return super.commit(plan);
    }
}

const objectSchema = defineSchema<JsonObject>((value) => {
    if (value === null || typeof value !== "object" || Array.isArray(value)) {
        throw new Error("必须是 object");
    }
    return value;
});

async function bounded<TResult>(promise: Promise<TResult>, label: string, timeoutMs = 250): Promise<TResult> {
    return Promise.race([
        promise,
        new Promise<TResult>((_, reject) => setTimeout(() => reject(new Error(`${label} 超时`)), timeoutMs)),
    ]);
}

function assistant(content: string, timestamp: number) {
    return {
        message: {
            role: "assistant" as const,
            content: [{type: "text" as const, text: content}] satisfies readonly AssistantContent[],
            timestamp,
        },
    };
}

describe("Invocation ownership fence", () => {
    test("SessionWritePlan owner CAS 区分精确 owner、null 和字段省略", async () => {
        const store = new MemorySessionStore();
        const sessionId = await startInvocation(store);

        await expect(store.commit({
            target: sessionId,
            expectedActiveInvocationId: "active",
            cause: "test.owner.match",
            operations: [],
        })).resolves.toBeDefined();

        await expect(store.commit({
            target: sessionId,
            expectedActiveInvocationId: null,
            cause: "test.owner.empty",
            operations: [],
        })).rejects.toBeInstanceOf(InvocationOwnershipError);

        await expect(store.commit({
            target: sessionId,
            cause: "test.owner.omitted",
            operations: [],
        })).resolves.toBeDefined();
    });

    test("组合 startInvocation plan 不能绕过已有 owner CAS", async () => {
        const store = new MemorySessionStore();
        const sessionId = await startInvocation(store);

        await expect(store.commit({
            target: sessionId,
            expectedActiveInvocationId: null,
            cause: "test.owner.composite-start",
            operations: [{
                type: "appendEntries",
                entries: [{kind: "test.composite", payload: {ok: true}}],
            }, {
                type: "startInvocation",
                invocation: {
                    id: "next",
                    sessionId,
                    profileKey: "owner",
                    caller: {kind: "system", name: "test"},
                    input: null,
                    createdAt: 2,
                },
            }],
        })).rejects.toBeInstanceOf(InvocationOwnershipError);
    });

    test("reconcileInterrupted 后旧 Invocation-owned plan 被拒绝", async () => {
        const store = new MemorySessionStore();
        const sessionId = await startInvocation(store);

        await store.reconcileInterrupted();

        await expect(store.commit({
            target: sessionId,
            expectedActiveInvocationId: "active",
            cause: "test.owner.late",
            operations: [],
        })).rejects.toBeInstanceOf(InvocationOwnershipError);
    });

    test("JSONL reconcileInterrupted 也拒绝旧 owner", async () => {
        const directory = await tempDirectory();
        const store = new JsonlSessionStore({directory});
        const sessionId = await startInvocation(store);

        await store.reconcileInterrupted();

        await expect(store.commit({
            target: sessionId,
            expectedActiveInvocationId: "active",
            cause: "test.owner.jsonl.late",
            operations: [],
        })).rejects.toBeInstanceOf(InvocationOwnershipError);
    });

    test("取消后非合作式 Model 的迟到消息与 runtime event 不进入 Session", async () => {
        let markStarted!: () => void;
        const started = new Promise<void>((resolve) => {
            markStarted = resolve;
        });
        let release!: () => void;
        const released = new Promise<void>((resolve) => {
            release = resolve;
        });
        const profile = defineProfile({
            manifest: {key: "late-model", name: "Late Model"},
            initial: objectSchema,
            payload: objectSchema,
            prepare: () => ({systemPrompt: "late", modelConfig: {}}),
        });
        const model = new ScriptedModelRuntime([
            async (request) => {
                markStarted();
                await released;
                await request.onEvent?.({type: "text_delta", delta: "late"});
                return assistant("late assistant", 2);
            },
        ]);
        const events = new SessionEventHub<number>();
        const harness = new NeuroAgentHarness({
            store: new MemorySessionStore(),
            profiles: new ProfileRegistry<number>().add(profile),
            model,
            events,
        });
        const created = await harness.createSession({profileKey: "late-model", initial: {}, hostContext: {}});
        const subscription = harness.subscribe(created.session.metadata.sessionId, created.cursor);
        const handle = await harness.invoke({sessionId: created.session.metadata.sessionId, payload: {}});
        await started;

        handle.abort();
        release();

        const result = await handle.result();
        const received = [];
        await subscription.close();
        for await (const event of subscription) {
            received.push(event);
        }
        const snapshot = await harness.snapshot(created.session.metadata.sessionId);
        const persistedMessages = snapshot.session.entries
            .filter((entry) => entry.kind === "agent.message")
            .map((entry) => JSON.stringify(entry.payload));

        expect(result.status).toBe("aborted");
        expect(persistedMessages.some((payload) => payload.includes("late assistant"))).toBe(false);
        expect(received.some((event) => event.kind === "runtime"
            && event.event.type === "model_event"
            && event.event.event.type === "text_delta"
            && event.event.event.delta === "late")).toBe(false);
    });

    test("Invocation terminal 后 Model 产生的迟到 runtime event 被丢弃", async () => {
        let emitLate!: () => void;
        let markLateEmitted!: () => void;
        const lateEmitted = new Promise<void>((resolve) => {
            markLateEmitted = resolve;
        });
        const profile = defineProfile({
            manifest: {key: "terminal-event-fence", name: "Terminal Event Fence"},
            initial: objectSchema,
            payload: objectSchema,
            prepare: () => ({systemPrompt: "terminal event", modelConfig: {}}),
        });
        const model = new ScriptedModelRuntime([
            async (request) => {
                emitLate = () => {
                    void request.onEvent?.({type: "text_delta", delta: "after-terminal"});
                    markLateEmitted();
                };
                return assistant("done", 1);
            },
        ]);
        const events = new SessionEventHub<number>();
        const harness = new NeuroAgentHarness({
            store: new MemorySessionStore(),
            profiles: new ProfileRegistry<number>().add(profile),
            model,
            events,
        });
        const created = await harness.createSession({profileKey: "terminal-event-fence", initial: {}, hostContext: {}});
        const subscription = harness.subscribe(created.session.metadata.sessionId, created.cursor);
        const handle = await harness.invoke({sessionId: created.session.metadata.sessionId, payload: {}});
        expect((await handle.result()).status).toBe("completed");

        emitLate();
        await lateEmitted;
        const received = [];
        await subscription.close();
        for await (const event of subscription) {
            received.push(event);
        }
        expect(received.some((event) => event.kind === "runtime"
            && event.event.type === "model_event"
            && event.event.event.type === "text_delta"
            && event.event.event.delta === "after-terminal")).toBe(false);
    });

    test("固定 Invocation ID 在 raw run 清理前拒绝重入，清理后可由新 Session 复用", async () => {
        const fixedInvocationId = "fixed-invocation-id";
        let markStarted!: () => void;
        const started = new Promise<void>((resolve) => {
            markStarted = resolve;
        });
        let releaseRawRun!: () => void;
        const rawRunReleased = new Promise<void>((resolve) => {
            releaseRawRun = resolve;
        });
        const profile = defineProfile({
            manifest: {key: "fixed-invocation-id", name: "Fixed Invocation ID"},
            initial: objectSchema,
            payload: objectSchema,
            prepare: () => ({systemPrompt: "fixed invocation", modelConfig: {}}),
        });
        const events = new SessionEventHub<number>();
        const harness = new NeuroAgentHarness({
            abortGraceMs: 0,
            invocationId: () => fixedInvocationId,
            store: new MemorySessionStore(),
            profiles: new ProfileRegistry<number>().add(profile),
            model: new ScriptedModelRuntime([
                async () => {
                    markStarted();
                    await rawRunReleased;
                    return assistant("late old result", 1);
                },
                assistant("new session result", 2),
            ]),
            events,
        });
        const firstSession = await harness.createSession({profileKey: "fixed-invocation-id", initial: {}, hostContext: {}});
        const firstHandle = await harness.invoke({sessionId: firstSession.session.metadata.sessionId, payload: {}});
        await started;

        firstHandle.abort();
        expect((await bounded(firstHandle.result(), "fixed Invocation forced abort")).status).toBe("aborted");

        await expect(harness.invoke({sessionId: firstSession.session.metadata.sessionId, payload: {}}))
            .rejects.toBeInstanceOf(SessionInvariantError);

        const secondSession = await harness.createSession({profileKey: "fixed-invocation-id", initial: {}, hostContext: {}});
        const secondSubscription = harness.subscribe(secondSession.session.metadata.sessionId, secondSession.cursor);
        await expect(harness.invoke({sessionId: secondSession.session.metadata.sessionId, payload: {}}))
            .rejects.toBeInstanceOf(SessionInvariantError);

        releaseRawRun();
        const deadline = Date.now() + 250;
        let reusedHandle;
        while (Date.now() < deadline) {
            try {
                reusedHandle = await harness.invoke({sessionId: secondSession.session.metadata.sessionId, payload: {}});
                break;
            } catch (error) {
                expect(error).toBeInstanceOf(SessionInvariantError);
                await new Promise((resolve) => setTimeout(resolve, 0));
            }
        }
        expect(reusedHandle).toBeDefined();
        expect(reusedHandle?.invocationId).toBe(fixedInvocationId);
        expect((await bounded(reusedHandle!.result(), "fixed Invocation reuse")).status).toBe("completed");

        await secondSubscription.close();
        const received = [];
        for await (const event of secondSubscription) {
            received.push(event);
        }
        const terminalEvents = received.filter((event) => event.kind === "runtime" && event.event.type === "agent_end");
        expect(terminalEvents).toHaveLength(1);
        expect(terminalEvents[0]?.sessionId).toBe(secondSession.session.metadata.sessionId);
        expect(terminalEvents[0]?.invocationId).toBe(fixedInvocationId);
        expect(terminalEvents[0]?.event.type === "agent_end" && terminalEvents[0].event.status).toBe("completed");
        await harness.dispose();
    });

    test("取消后 sequential Tool 的迟到 write plan 与 toolResult 不进入 Session", async () => {
        let markStarted!: () => void;
        const started = new Promise<void>((resolve) => {
            markStarted = resolve;
        });
        let release!: () => void;
        const released = new Promise<void>((resolve) => {
            release = resolve;
        });
        const lateTool = defineTool({
            name: "late-write",
            description: "late-write",
            parameters: objectSchema,
            async execute(_arguments, context) {
                markStarted();
                await released;
                return {
                    content: "late tool result",
                    writePlans: [{
                        target: context.sessionId,
                        expectedVersion: context.snapshot.version,
                        cause: "test.late-tool.write",
                        operations: [{
                            type: "appendEntries" as const,
                            entries: [{kind: "late.tool.write", payload: {late: true}}],
                        }],
                    }],
                };
            },
        });
        const profile = defineProfile({
            manifest: {key: "late-tool", name: "Late Tool"},
            initial: objectSchema,
            payload: objectSchema,
            prepare: () => ({
                systemPrompt: "late tool",
                modelConfig: {},
                tools: [lateTool],
            }),
        });
        const model = new ScriptedModelRuntime([
            {
                message: {
                    role: "assistant",
                    content: [{type: "toolCall", call: {id: "late-1", name: "late-write", arguments: {}}}],
                    timestamp: 1,
                },
            },
        ]);
        const harness = new NeuroAgentHarness({
            store: new MemorySessionStore(),
            profiles: new ProfileRegistry<number>().add(profile),
            model,
        });
        const created = await harness.createSession({profileKey: "late-tool", initial: {}, hostContext: {}});
        const handle = await harness.invoke({sessionId: created.session.metadata.sessionId, payload: {}});
        await started;

        handle.abort();
        release();

        expect((await handle.result()).status).toBe("aborted");
        const snapshot = await harness.snapshot(created.session.metadata.sessionId);
        expect(snapshot.session.entries.some((entry) => entry.kind === "late.tool.write")).toBe(false);
        expect(snapshot.session.entries
            .filter((entry) => entry.kind === "agent.message")
            .some((entry) => JSON.stringify(entry.payload).includes("late tool result"))).toBe(false);
    });

    test("Invocation-owned Tool write 不能跨 Session，即使显式要求空 owner", async () => {
        let foreignSessionId!: number;
        const crossSessionTool = defineTool({
            name: "cross-session",
            description: "cross-session",
            parameters: objectSchema,
            execute: () => ({
                content: "must fail",
                writePlans: [{
                    target: foreignSessionId,
                    expectedActiveInvocationId: null,
                    cause: "test.cross-session",
                    operations: [{
                        type: "appendEntries" as const,
                        entries: [{kind: "foreign.write", payload: {unexpected: true}}],
                    }],
                }],
            }),
        });
        const profile = defineProfile({
            manifest: {key: "cross-session", name: "Cross Session"},
            initial: objectSchema,
            payload: objectSchema,
            prepare: () => ({
                systemPrompt: "cross session",
                modelConfig: {},
                tools: [crossSessionTool],
            }),
        });
        const harness = new NeuroAgentHarness({
            store: new MemorySessionStore(),
            profiles: new ProfileRegistry<number>().add(profile),
            model: new ScriptedModelRuntime([{
                message: {
                    role: "assistant",
                    content: [{type: "toolCall", call: {id: "cross-1", name: "cross-session", arguments: {}}}],
                    timestamp: 1,
                },
            }]),
        });
        const first = await harness.createSession({profileKey: "cross-session", initial: {}, hostContext: {}});
        const foreign = await harness.createSession({profileKey: "cross-session", initial: {}, hostContext: {}});
        foreignSessionId = foreign.session.metadata.sessionId;

        const result = await (await harness.invoke({sessionId: first.session.metadata.sessionId, payload: {}})).result();
        expect(result.status).toBe("failed");
        expect(result.error?.message).toContain("不能跨 Session");
        const foreignSnapshot = await harness.snapshot(foreignSessionId);
        expect(foreignSnapshot.session.entries.some((entry) => entry.kind === "foreign.write")).toBe(false);
        await harness.dispose();
    });

    test("active admission 释放后，迟到 settleFailure 仍不能跨 Session 写入", async () => {
        let foreignSessionId!: number;
        let markSettlementStarted!: () => void;
        const settlementStarted = new Promise<void>((resolve) => {
            markSettlementStarted = resolve;
        });
        let releaseSettlement!: () => void;
        const settlementReleased = new Promise<void>((resolve) => {
            releaseSettlement = resolve;
        });
        let markHookReturned!: () => void;
        const hookReturned = new Promise<void>((resolve) => {
            markHookReturned = resolve;
        });
        const lateHook = {
            name: "late-cross-session-settle",
            stage: "settleFailure" as const,
            async run() {
                markSettlementStarted();
                await settlementReleased;
                markHookReturned();
                return {
                    writePlans: [{
                        target: foreignSessionId,
                        expectedActiveInvocationId: null,
                        cause: "test.late-cross-session-settle",
                        operations: [{
                            type: "appendEntries" as const,
                            entries: [{kind: "late.cross-session.settle", payload: {late: true}}],
                        }],
                    }],
                };
            },
        };
        const profile = defineProfile({
            manifest: {key: "late-cross-session-settle", name: "Late Cross Session Settle"},
            initial: objectSchema,
            payload: objectSchema,
            hooks: [lateHook],
            prepare: () => ({systemPrompt: "late cross session settle", modelConfig: {}}),
        });
        const store = new StaleOwnerReadStore();
        const harness = new NeuroAgentHarness({
            abortGraceMs: 0,
            store,
            profiles: new ProfileRegistry<number>().add(profile),
            model: new ScriptedModelRuntime([
                async (request) => new Promise<never>((_, reject) => {
                    request.signal.addEventListener("abort", () => reject(new Error("aborted")), {once: true});
                }),
            ]),
        });
        const first = await harness.createSession({profileKey: "late-cross-session-settle", initial: {}, hostContext: {}});
        const foreign = await harness.createSession({profileKey: "late-cross-session-settle", initial: {}, hostContext: {}});
        foreignSessionId = foreign.session.metadata.sessionId;
        const handle = await harness.invoke({sessionId: first.session.metadata.sessionId, payload: {}});
        handle.abort();
        await settlementStarted;
        const staleRunning = await store.read(first.session.metadata.sessionId);
        expect((await bounded(handle.result(), "late settle forced abort")).status).toBe("aborted");
        store.serveNextRead(staleRunning);
        releaseSettlement();
        await hookReturned;
        await new Promise((resolve) => setTimeout(resolve, 10));

        const foreignSnapshot = await harness.snapshot(foreignSessionId);
        expect(foreignSnapshot.session.entries.some((entry) => entry.kind === "late.cross-session.settle")).toBe(false);
        await harness.dispose();
    });

    test("forced abort seal 后，owner 检查与 effect commit 之间的迟到 settleFailure 不进入 Store", async () => {
        let markSettlementStarted!: () => void;
        const settlementStarted = new Promise<void>((resolve) => {
            markSettlementStarted = resolve;
        });
        let releaseSettlement!: () => void;
        const settlementReleased = new Promise<void>((resolve) => {
            releaseSettlement = resolve;
        });
        let markHookReturned!: () => void;
        const hookReturned = new Promise<void>((resolve) => {
            markHookReturned = resolve;
        });
        const lateHook = {
            name: "late-same-session-settle",
            stage: "settleFailure" as const,
            async run(context: RuntimeHookContext<number, JsonObject>) {
                markSettlementStarted();
                await settlementReleased;
                markHookReturned();
                return {
                    writePlans: [{
                        target: context.sessionId,
                        cause: "test.late-same-session-settle",
                        operations: [{
                            type: "appendEntries" as const,
                            entries: [{kind: "late.same-session.settle", payload: {late: true}}],
                        }],
                    }],
                };
            },
        };
        const profile = defineProfile({
            manifest: {key: "late-same-session-settle", name: "Late Same Session Settle"},
            initial: objectSchema,
            payload: objectSchema,
            hooks: [lateHook],
            prepare: () => ({systemPrompt: "late same session settle", modelConfig: {}}),
        });
        const store = new RecordingStore();
        const harness = new NeuroAgentHarness({
            abortGraceMs: 10,
            store,
            profiles: new ProfileRegistry<number>().add(profile),
            model: new ScriptedModelRuntime([
                async (request) => new Promise<never>((_, reject) => {
                    request.signal.addEventListener("abort", () => reject(new Error("aborted")), {once: true});
                }),
            ]),
        });
        const created = await harness.createSession({profileKey: "late-same-session-settle", initial: {}, hostContext: {}});
        const handle = await harness.invoke({sessionId: created.session.metadata.sessionId, payload: {}});
        handle.abort();
        await settlementStarted;
        await new Promise((resolve) => setTimeout(resolve, 25));
        expect((await bounded(handle.result(), "same-session forced abort")).status).toBe("aborted");

        releaseSettlement();
        await hookReturned;
        await new Promise((resolve) => setTimeout(resolve, 10));

        expect(store.causes).not.toContain("test.late-same-session-settle");
        const snapshot = await harness.snapshot(created.session.metadata.sessionId);
        expect(snapshot.session.entries.some((entry) => entry.kind === "late.same-session.settle")).toBe(false);
        await harness.dispose();
    });

    test("取消后 parallel Tool batch 的迟到结果不进入 Session", async () => {
        let startedCount = 0;
        let markBothStarted!: () => void;
        const bothStarted = new Promise<void>((resolve) => {
            markBothStarted = resolve;
        });
        let release!: () => void;
        const released = new Promise<void>((resolve) => {
            release = resolve;
        });
        const makeTool = (name: string) => defineTool({
            name,
            description: name,
            parameters: objectSchema,
            executionMode: "parallel" as const,
            async execute() {
                startedCount += 1;
                if (startedCount === 2) markBothStarted();
                await released;
                return {content: `${name} late result`};
            },
        });
        const profile = defineProfile({
            manifest: {key: "late-parallel", name: "Late Parallel"},
            initial: objectSchema,
            payload: objectSchema,
            prepare: () => ({
                systemPrompt: "late parallel",
                modelConfig: {},
                toolExecution: "parallel" as const,
                tools: [makeTool("first"), makeTool("second")],
            }),
        });
        const model = new ScriptedModelRuntime([{
            message: {
                role: "assistant",
                content: [
                    {type: "toolCall", call: {id: "first-1", name: "first", arguments: {}}},
                    {type: "toolCall", call: {id: "second-1", name: "second", arguments: {}}},
                ],
                timestamp: 1,
            },
        }]);
        const harness = new NeuroAgentHarness({
            store: new MemorySessionStore(),
            profiles: new ProfileRegistry<number>().add(profile),
            model,
        });
        const created = await harness.createSession({profileKey: "late-parallel", initial: {}, hostContext: {}});
        const handle = await harness.invoke({sessionId: created.session.metadata.sessionId, payload: {}});
        await bothStarted;

        handle.abort();
        release();

        expect((await handle.result()).status).toBe("aborted");
        const snapshot = await harness.snapshot(created.session.metadata.sessionId);
        expect(snapshot.session.entries
            .filter((entry) => entry.kind === "agent.message")
            .some((entry) => JSON.stringify(entry.payload).includes("late result"))).toBe(false);
    });

    test("取消后 Hook 的迟到 effect 不进入 Session", async () => {
        let markStarted!: () => void;
        const started = new Promise<void>((resolve) => {
            markStarted = resolve;
        });
        let release!: () => void;
        const released = new Promise<void>((resolve) => {
            release = resolve;
        });
        const profile = defineProfile({
            manifest: {key: "late-hook", name: "Late Hook"},
            initial: objectSchema,
            payload: objectSchema,
            hooks: [{
                name: "late-hook-effect",
                stage: "beforeTurn" as const,
                async run(context) {
                    markStarted();
                    await released;
                    return {
                        writePlans: [{
                            target: context.sessionId,
                            expectedVersion: context.snapshot.version,
                            cause: "test.late-hook.write",
                            operations: [{
                                type: "appendEntries" as const,
                                entries: [{kind: "late.hook.write", payload: {late: true}}],
                            }],
                        }],
                    };
                },
            }],
            prepare: () => ({systemPrompt: "late hook", modelConfig: {}}),
        });
        const harness = new NeuroAgentHarness({
            store: new MemorySessionStore(),
            profiles: new ProfileRegistry<number>().add(profile),
            model: new ScriptedModelRuntime([{message: {role: "assistant", content: [{type: "text", text: "done"}], timestamp: 1}}]),
        });
        const created = await harness.createSession({profileKey: "late-hook", initial: {}, hostContext: {}});
        const handle = await harness.invoke({sessionId: created.session.metadata.sessionId, payload: {}});
        await started;

        handle.abort();
        release();

        expect((await handle.result()).status).toBe("aborted");
        const snapshot = await harness.snapshot(created.session.metadata.sessionId);
        expect(snapshot.session.entries.some((entry) => entry.kind === "late.hook.write")).toBe(false);
    });

    test("取消后 ContextProvider 的迟到结果不触发 Model call", async () => {
        let markStarted!: () => void;
        const started = new Promise<void>((resolve) => {
            markStarted = resolve;
        });
        let release!: () => void;
        const released = new Promise<void>((resolve) => {
            release = resolve;
        });
        const profile = defineProfile({
            manifest: {key: "late-context", name: "Late Context"},
            initial: objectSchema,
            payload: objectSchema,
            prepare: () => ({
                systemPrompt: "late context",
                modelConfig: {},
                contextProviders: [{
                    name: "late-context-provider",
                    async resolve() {
                        markStarted();
                        await released;
                        return {
                            modelContext: [{
                                role: "user" as const,
                                content: "late context",
                                timestamp: 1,
                            }],
                        };
                    },
                }],
            }),
        });
        const model = new ScriptedModelRuntime([{message: {role: "assistant", content: [{type: "text", text: "should not run"}], timestamp: 1}}]);
        const harness = new NeuroAgentHarness({
            store: new MemorySessionStore(),
            profiles: new ProfileRegistry<number>().add(profile),
            model,
        });
        const created = await harness.createSession({profileKey: "late-context", initial: {}, hostContext: {}});
        const handle = await harness.invoke({sessionId: created.session.metadata.sessionId, payload: {}});
        await started;

        handle.abort();
        release();

        expect((await handle.result()).status).toBe("aborted");
        expect(model.requests).toHaveLength(0);
    });

    test("取消后 Compactor 的迟到 summary 不写入 compaction entry", async () => {
        let markCompactionStarted!: () => void;
        const compactionStarted = new Promise<void>((resolve) => {
            markCompactionStarted = resolve;
        });
        let release!: () => void;
        const released = new Promise<void>((resolve) => {
            release = resolve;
        });
        const profile = defineProfile({
            manifest: {key: "late-compaction", name: "Late Compaction"},
            initial: objectSchema,
            payload: objectSchema,
            prepare: () => ({
                systemPrompt: "late compaction",
                modelConfig: {},
                compaction: {triggerTokens: 3, keepRecentTokens: 1},
            }),
        });
        const model = new ScriptedModelRuntime([
            {message: {role: "assistant", content: [{type: "text", text: "old"}], timestamp: 1}},
            {message: {role: "assistant", content: [{type: "text", text: "new"}], timestamp: 2}},
        ]);
        const harness = new NeuroAgentHarness({
            store: new MemorySessionStore(),
            profiles: new ProfileRegistry<number>().add(profile),
            model,
            compactor: {
                estimate: () => 1,
                async summarize() {
                    markCompactionStarted();
                    await released;
                    return "late summary";
                },
            },
        });
        const created = await harness.createSession({profileKey: "late-compaction", initial: {}, hostContext: {}});
        expect((await (await harness.invoke({sessionId: created.session.metadata.sessionId, payload: {old: true}})).result()).status).toBe("completed");
        const handle = await harness.invoke({sessionId: created.session.metadata.sessionId, payload: {new: true}});
        await compactionStarted;

        handle.abort();
        release();

        expect((await handle.result()).status).toBe("aborted");
        const snapshot = await harness.snapshot(created.session.metadata.sessionId);
        expect(snapshot.session.entries.some((entry) => entry.kind === "agent.compaction")).toBe(false);
    });

    test("取消后 Approval request 的迟到结果不进入 waiting", async () => {
        let markStarted!: () => void;
        const started = new Promise<void>((resolve) => {
            markStarted = resolve;
        });
        let release!: () => void;
        const released = new Promise<void>((resolve) => {
            release = resolve;
        });
        const gated = defineTool({
            name: "gated",
            description: "gated",
            parameters: objectSchema,
            approval: {
                async request() {
                    markStarted();
                    await released;
                    return {prompt: "late approval"};
                },
            },
            execute: () => ({content: "should not execute"}),
        });
        const profile = defineProfile({
            manifest: {key: "late-approval", name: "Late Approval"},
            initial: objectSchema,
            payload: objectSchema,
            prepare: () => ({systemPrompt: "late approval", modelConfig: {}, tools: [gated]}),
        });
        const harness = new NeuroAgentHarness({
            store: new MemorySessionStore(),
            profiles: new ProfileRegistry<number>().add(profile),
            model: new ScriptedModelRuntime([{
                message: {
                    role: "assistant",
                    content: [{type: "toolCall", call: {id: "gated-1", name: "gated", arguments: {}}}],
                    timestamp: 1,
                },
            }]),
        });
        const created = await harness.createSession({profileKey: "late-approval", initial: {}, hostContext: {}});
        const handle = await harness.invoke({sessionId: created.session.metadata.sessionId, payload: {}});
        await started;

        handle.abort();
        release();

        expect((await handle.result()).status).toBe("aborted");
        const snapshot = await harness.snapshot(created.session.metadata.sessionId);
        expect(snapshot.session.invocations[0]?.status).toBe("aborted");
        expect(snapshot.session.invocations[0]?.pendingApprovals).toBeUndefined();
    });

    test("取消后迟到 Capability open 会关闭已创建资源", async () => {
        const resource = defineCapability<"late-resource", {closeCount: number}>("late-resource");
        let markStarted!: () => void;
        const started = new Promise<void>((resolve) => {
            markStarted = resolve;
        });
        let release!: () => void;
        const released = new Promise<void>((resolve) => {
            release = resolve;
        });
        let closeCount = 0;
        const profile = defineProfile({
            manifest: {key: "late-capability", name: "Late Capability"},
            initial: objectSchema,
            payload: objectSchema,
            requiredCapabilities: [resource],
            prepare: () => ({systemPrompt: "late capability", modelConfig: {}}),
        });
        const harness = new NeuroAgentHarness({
            store: new MemorySessionStore(),
            profiles: new ProfileRegistry<number>().add(profile),
            model: new ScriptedModelRuntime([{message: {role: "assistant", content: [{type: "text", text: "should not run"}], timestamp: 1}}]),
            capabilities: [{
                capability: resource,
                async open() {
                    markStarted();
                    await released;
                    return {closeCount};
                },
                close() {
                    closeCount += 1;
                },
            }],
        });
        const created = await harness.createSession({profileKey: "late-capability", initial: {}, hostContext: {}});
        const handle = await harness.invoke({sessionId: created.session.metadata.sessionId, payload: {}});
        await started;

        handle.abort();
        release();

        expect((await handle.result()).status).toBe("aborted");
        expect(closeCount).toBe(1);
    });

    test("settleFailure await 期间 owner 丢失时不应用迟到 effect", async () => {
        const directory = await tempDirectory();
        let markSettlementStarted!: () => void;
        const settlementStarted = new Promise<void>((resolve) => {
            markSettlementStarted = resolve;
        });
        let releaseSettlement!: () => void;
        const settlementReleased = new Promise<void>((resolve) => {
            releaseSettlement = resolve;
        });
        const profile = defineProfile({
            manifest: {key: "late-settle", name: "Late Settle"},
            initial: objectSchema,
            payload: objectSchema,
            hooks: [{
                name: "late-settle-effect",
                stage: "settleFailure" as const,
                async run(context) {
                    markSettlementStarted();
                    await settlementReleased;
                    return {
                        writePlans: [{
                            target: context.sessionId,
                            cause: "test.late-settle-effect",
                            operations: [{
                                type: "appendEntries" as const,
                                entries: [{kind: "late.settle.effect", payload: {late: true}}],
                            }],
                        }],
                    };
                },
            }],
            prepare: () => ({systemPrompt: "late settle", modelConfig: {}}),
        });
        const profiles = new ProfileRegistry<number>().add(profile);
        const oldHarness = new NeuroAgentHarness({
            store: new JsonlSessionStore({directory}),
            profiles,
            model: new ScriptedModelRuntime([
                async () => {
                    throw new Error("provider failed");
                },
            ]),
        });
        const created = await oldHarness.createSession({profileKey: "late-settle", initial: {}, hostContext: {}});
        const handle = await oldHarness.invoke({sessionId: created.session.metadata.sessionId, payload: {}});
        await settlementStarted;

        const recoveryStore = new JsonlSessionStore({directory});
        await recoveryStore.reconcileInterrupted();
        releaseSettlement();

        const result = await handle.result();
        expect(result.status).toBe("failed");
        const snapshot = await recoveryStore.read(created.session.metadata.sessionId);
        expect(snapshot.invocations[0]?.status).toBe("interrupted");
        expect(snapshot.entries.some((entry) => entry.kind === "late.settle.effect")).toBe(false);
        await oldHarness.dispose();
    });

    test("旧 Harness 在 reconcileInterrupted 后不能写迟到结果，新 Harness 可以 retry", async () => {
        const directory = await tempDirectory();
        let markStarted!: () => void;
        const started = new Promise<void>((resolve) => {
            markStarted = resolve;
        });
        let release!: () => void;
        const released = new Promise<void>((resolve) => {
            release = resolve;
        });
        let settleFailureCalls = 0;
        const profile = defineProfile({
            manifest: {key: "reconcile-fence", name: "Reconcile Fence"},
            initial: objectSchema,
            payload: objectSchema,
            hooks: [{
                name: "must-not-settle-old-owner",
                stage: "settleFailure" as const,
                run(context) {
                    settleFailureCalls += 1;
                    return {
                        writePlans: [{
                            target: context.sessionId,
                            cause: "test.stale-settle-failure",
                            operations: [{
                                type: "appendEntries" as const,
                                entries: [{kind: "stale.settle.failure", payload: {late: true}}],
                            }],
                        }],
                    };
                },
            }],
            prepare: () => ({systemPrompt: "reconcile fence", modelConfig: {}}),
        });
        const profiles = new ProfileRegistry<number>().add(profile);
        const oldHarness = new NeuroAgentHarness({
            store: new JsonlSessionStore({directory}),
            profiles,
            model: new ScriptedModelRuntime([
                async () => {
                    markStarted();
                    await released;
                    return assistant("late old result", 1);
                },
            ]),
        });
        const created = await oldHarness.createSession({profileKey: "reconcile-fence", initial: {}, hostContext: {}});
        const oldHandle = await oldHarness.invoke({sessionId: created.session.metadata.sessionId, payload: {}});
        await started;

        const recoveryStore = new JsonlSessionStore({directory});
        await recoveryStore.reconcileInterrupted();
        release();

        const oldResult = await oldHandle.result();
        expect(oldResult.status).toBe("failed");
        expect(settleFailureCalls).toBe(0);
        const interrupted = await recoveryStore.read(created.session.metadata.sessionId);
        expect(interrupted.invocations[0]?.status).toBe("interrupted");
        expect(interrupted.entries.some((entry) => JSON.stringify(entry.payload).includes("late old result"))).toBe(false);

        const restoredHarness = new NeuroAgentHarness({
            store: new JsonlSessionStore({directory}),
            profiles,
            model: new ScriptedModelRuntime([assistant("recovered result", 2)]),
        });
        const retried = await restoredHarness.retry(created.session.metadata.sessionId, oldHandle.invocationId);
        expect((await retried.result()).output).toBe("recovered result");
        await Promise.allSettled([oldHarness.dispose(), restoredHarness.dispose()]);
    });
});
