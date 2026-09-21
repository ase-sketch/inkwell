import {afterEach, describe, expect, test} from "bun:test";
import {mkdtemp, rm} from "node:fs/promises";
import {join} from "node:path";
import {tmpdir} from "node:os";
import {NeuroAgentHarness, ProfileRegistry, SessionConflictError, defineSchema, defineTool, type JsonObject} from "../src/index.js";
import {JsonlSessionStore} from "../src/storage/jsonl.js";
import {MemorySessionStore} from "../src/storage/memory.js";
import {ScriptedModelRuntime} from "../src/testing/index.js";

const directories: string[] = [];
afterEach(async () => Promise.all(directories.splice(0).map((directory) => rm(directory, {recursive: true, force: true}))));
async function tempDirectory(): Promise<string> {
    const directory = await mkdtemp(join(tmpdir(), "neuro-harness-recovery-"));
    directories.push(directory);
    return directory;
}
const schema = defineSchema<JsonObject>((value) => {
    if (value === null || typeof value !== "object" || Array.isArray(value)) throw new Error("必须是 object");
    return value;
});

describe("JSONL process recovery", () => {
    test("durable aborting owner 在重启协调时收口为 aborted", async () => {
        const store = new MemorySessionStore<number, JsonObject>();
        const created = await store.create({
            profileKey: "aborting-recovery",
            initial: {},
            hostContext: {},
        });
        const invocationId = "aborting-recovery-invocation";
        await store.commit({
            target: created.metadata.sessionId,
            expectedVersion: created.version,
            cause: "test.start-aborting-recovery",
            operations: [{
                type: "startInvocation",
                invocation: {
                    id: invocationId,
                    sessionId: created.metadata.sessionId,
                    profileKey: "aborting-recovery",
                    caller: {kind: "system", name: "test"},
                    input: {},
                    createdAt: 1,
                },
            }],
        });
        const started = await store.read(created.metadata.sessionId);
        await store.commit({
            target: created.metadata.sessionId,
            expectedVersion: started.version,
            expectedActiveInvocationId: invocationId,
            cause: "test.mark-aborting-recovery",
            operations: [{type: "setStatus", status: "aborting"}],
        });

        const reconciled = await store.reconcileInterrupted();
        expect(reconciled.map((invocation) => invocation.status)).toEqual(["aborted"]);
        const snapshot = await store.read(created.metadata.sessionId);
        expect(snapshot.status).toBe("idle");
        expect(snapshot.activeInvocationId).toBeNull();
        expect(snapshot.invocations[0]?.status).toBe("aborted");
    });

    test("JSONL forced abort terminal 可由新 Harness 恢复", async () => {
        const directory = await tempDirectory();
        const registry = new ProfileRegistry();
        registry.define({manifest: {key: "jsonl-abort", name: "JSONL Abort"}, initial: schema, payload: schema, prepare: () => ({systemPrompt: "x", modelConfig: {}})});
        let markStarted!: () => void;
        const started = new Promise<void>((resolve) => { markStarted = resolve; });
        const firstHarness = new NeuroAgentHarness({
            abortGraceMs: 0,
            store: new JsonlSessionStore({directory}),
            profiles: registry,
            model: new ScriptedModelRuntime([async () => {
                markStarted();
                return new Promise<never>(() => {});
            }]),
        });
        const session = await firstHarness.createSession({profileKey: "jsonl-abort", initial: {}, hostContext: {}});
        const handle = await firstHarness.invoke({sessionId: session.session.metadata.sessionId, payload: {}});
        await started;

        handle.abort();
        expect((await handle.result()).status).toBe("aborted");
        await firstHarness.dispose();

        const restoredHarness = new NeuroAgentHarness({
            store: new JsonlSessionStore({directory}),
            profiles: registry,
            model: new ScriptedModelRuntime([]),
        });
        const restored = await restoredHarness.snapshot(session.session.metadata.sessionId);
        expect(restored.session.status).toBe("idle");
        expect(restored.session.activeInvocationId).toBeNull();
        expect(restored.session.invocations[0]?.status).toBe("aborted");
        await restoredHarness.dispose();
    });

    test("失败进程留下的 durable follow-up 可由新 Harness 继续", async () => {
        const directory = await tempDirectory();
        const registry = new ProfileRegistry();
        registry.define({manifest: {key: "followup-recovery", name: "Followup Recovery"}, initial: schema, payload: schema, prepare: () => ({systemPrompt: "x", modelConfig: {}})});
        let markStarted!: () => void;
        const started = new Promise<void>((resolve) => { markStarted = resolve; });
        const firstHarness = new NeuroAgentHarness({
            store: new JsonlSessionStore({directory}),
            profiles: registry,
            model: new ScriptedModelRuntime([async (request) => new Promise((_, reject) => {
                markStarted();
                if (request.signal.aborted) reject(new Error("aborted"));
                request.signal.addEventListener("abort", () => reject(new Error("aborted")), {once: true});
            })]),
        });
        const session = await firstHarness.createSession({profileKey: "followup-recovery", initial: {}, hostContext: {}});
        const first = await firstHarness.invoke({sessionId: session.session.metadata.sessionId, payload: {first: true}});
        await started;
        await firstHarness.followUp(session.session.metadata.sessionId, {prompt: "durable follow-up"});
        await firstHarness.dispose();
        expect((await first.result()).status).toBe("aborted");

        const restoredHarness = new NeuroAgentHarness({
            store: new JsonlSessionStore({directory}),
            profiles: registry,
            model: new ScriptedModelRuntime([(request) => {
                expect(JSON.stringify(request.messages)).toContain("durable follow-up");
                return {message: {role: "assistant", content: [{type: "text", text: "recovered follow-up"}], timestamp: 2}};
            }]),
        });
        const resumed = await restoredHarness.resumeFollowUps(session.session.metadata.sessionId);
        expect(resumed).not.toBeNull();
        expect((await resumed!.result()).output).toBe("recovered follow-up");
    });

    test("waiting approval 在新 Harness 实例中恢复同一 Invocation", async () => {
        const directory = await tempDirectory();
        const tool = defineTool({
            name: "write",
            description: "write",
            parameters: schema,
            approval: {request: () => ({prompt: "approve write"})},
            execute: () => ({content: "written"}),
        });
        const registry = new ProfileRegistry();
        registry.define({manifest: {key: "approval-recovery", name: "Approval Recovery"}, initial: schema, payload: schema, prepare: () => ({systemPrompt: "x", modelConfig: {}, tools: [tool]})});
        const firstHarness = new NeuroAgentHarness({
            store: new JsonlSessionStore({directory}),
            profiles: registry,
            model: new ScriptedModelRuntime([{
                message: {role: "assistant", content: [{type: "toolCall", call: {id: "w", name: "write", arguments: {}}}], timestamp: 1},
            }]),
        });
        const session = await firstHarness.createSession({profileKey: "approval-recovery", initial: {}, hostContext: {}});
        const waitingHandle = await firstHarness.invoke({sessionId: session.session.metadata.sessionId, payload: {}});
        expect((await waitingHandle.result()).status).toBe("waiting");

        const restoredHarness = new NeuroAgentHarness({
            store: new JsonlSessionStore({directory}),
            profiles: registry,
            model: new ScriptedModelRuntime([{
                message: {role: "assistant", content: [{type: "text", text: "restored"}], timestamp: 2},
            }]),
        });
        const restored = await restoredHarness.snapshot(session.session.metadata.sessionId);
        expect(restored.session.invocations[0]?.pendingApprovals?.[0]?.toolCallId).toBe("w");
        const completed = await restoredHarness.resume(session.session.metadata.sessionId, waitingHandle.invocationId, [{toolCallId: "w", approved: true}]);
        expect((await completed.result()).status).toBe("completed");
    });

    test("独立 JSONL Harness 并发 resume 只有一个 durable claim，获胜结果可恢复", async () => {
        const directory = await tempDirectory();
        let executions = 0;
        let markStarted!: () => void;
        let releaseExecution!: () => void;
        const started = new Promise<void>((resolve) => {
            markStarted = resolve;
        });
        const executionGate = new Promise<void>((resolve) => {
            releaseExecution = resolve;
        });
        const tool = defineTool({
            name: "external_write",
            description: "external write",
            parameters: schema,
            approval: {request: () => ({prompt: "approve external write?"})},
            async execute() {
                executions += 1;
                markStarted();
                await executionGate;
                return {content: "written"};
            },
        });
        const registry = new ProfileRegistry();
        registry.define({
            manifest: {key: "jsonl-concurrent-resume", name: "JSONL Concurrent Resume"},
            initial: schema,
            payload: schema,
            prepare: () => ({systemPrompt: "x", modelConfig: {}, tools: [tool]}),
        });
        const waitingTurn = {
            message: {
                role: "assistant" as const,
                content: [{type: "toolCall" as const, call: {id: "write-1", name: "external_write", arguments: {}}}],
                timestamp: 1,
            },
        };
        const completedTurn = {
            message: {
                role: "assistant" as const,
                content: [{type: "text" as const, text: "done"}],
                timestamp: 2,
            },
        };
        const first = new NeuroAgentHarness({
            store: new JsonlSessionStore({directory}),
            profiles: registry,
            model: new ScriptedModelRuntime([waitingTurn, completedTurn]),
        });
        const second = new NeuroAgentHarness({
            store: new JsonlSessionStore({directory}),
            profiles: registry,
            model: new ScriptedModelRuntime([completedTurn]),
        });
        const session = await first.createSession({profileKey: "jsonl-concurrent-resume", initial: {}, hostContext: {}});
        const waiting = await first.invoke({sessionId: session.session.metadata.sessionId, payload: {}});
        expect((await waiting.result()).status).toBe("waiting");

        const resolution = [{toolCallId: "write-1", approved: true}] as const;
        const admissions = await Promise.allSettled([
            first.resume(session.session.metadata.sessionId, waiting.invocationId, resolution),
            second.resume(session.session.metadata.sessionId, waiting.invocationId, resolution),
        ]);
        await started;
        expect(executions).toBe(1);
        const fulfilled = admissions.filter((result) => result.status === "fulfilled");
        const rejected = admissions.filter((result) => result.status === "rejected");
        expect(fulfilled).toHaveLength(1);
        expect(rejected).toHaveLength(1);
        expect(rejected[0]?.reason).toBeInstanceOf(SessionConflictError);

        releaseExecution();
        const winner = fulfilled[0];
        if (winner?.status !== "fulfilled") {
            throw new Error("JSONL approval resume 缺少 claim winner");
        }
        expect((await winner.value.result()).status).toBe("completed");
        await Promise.allSettled([first.dispose(), second.dispose()]);

        const restored = await new JsonlSessionStore({directory}).read(session.session.metadata.sessionId);
        expect(restored.invocations.find((item) => item.id === waiting.invocationId)?.status).toBe("completed");
        expect(restored.entries.filter((entry) => {
            return entry.kind === "agent.message"
                && entry.invocationId === waiting.invocationId
                && JSON.stringify(entry.payload).includes("\"role\":\"toolResult\"");
        })).toHaveLength(1);
    });

    test("JSONL waiting resume 区分 prepare Snapshot 与 approval resolution 后的 ContextProvider Snapshot", async () => {
        const directory = await tempDirectory();
        const prepareVersions: number[] = [];
        const providerVersions: number[] = [];
        const tool = defineTool({
            name: "write",
            description: "write",
            parameters: schema,
            approval: {request: () => ({prompt: "approve write"})},
            execute: () => ({content: "written"}),
        });
        const registry = new ProfileRegistry();
        registry.define({
            manifest: {key: "approval-context-recovery", name: "Approval Context Recovery"},
            initial: schema,
            payload: schema,
            prepare: (context) => {
                prepareVersions.push(context.snapshot.version);
                return {
                    systemPrompt: "x",
                    modelConfig: {},
                    context: {
                        modelContext: [{
                            role: "user",
                            content: `prepared snapshot v${context.snapshot.version}`,
                            timestamp: 1,
                        }],
                    },
                    messages: [{
                        role: "user",
                        content: `prepared runtime v${context.snapshot.version}`,
                        timestamp: 2,
                    }],
                    contextProviders: [{
                        name: "approval-snapshot",
                        resolve: (providerContext) => {
                            providerVersions.push(providerContext.snapshot.version);
                            return {
                                modelContext: [{
                                    role: "user",
                                    content: `provider snapshot v${providerContext.snapshot.version}`,
                                    timestamp: 3,
                                }],
                            };
                        },
                    }],
                    tools: [tool],
                };
            },
        });
        const firstModel = new ScriptedModelRuntime([{
            message: {
                role: "assistant",
                content: [{type: "toolCall", call: {id: "w", name: "write", arguments: {}}}],
                timestamp: 1,
            },
        }]);
        const firstHarness = new NeuroAgentHarness({
            store: new JsonlSessionStore({directory}),
            profiles: registry,
            model: firstModel,
        });
        const session = await firstHarness.createSession({profileKey: "approval-context-recovery", initial: {}, hostContext: {}});
        const waitingHandle = await firstHarness.invoke({sessionId: session.session.metadata.sessionId, payload: {}});
        expect((await waitingHandle.result()).status).toBe("waiting");
        const waitingSnapshot = await firstHarness.snapshot(session.session.metadata.sessionId);
        expect(prepareVersions).toHaveLength(1);
        expect(providerVersions).toHaveLength(1);
        expect(prepareVersions[0]).toBeLessThan(waitingSnapshot.session.version);
        expect(providerVersions[0]).toBeLessThan(waitingSnapshot.session.version);
        await firstHarness.dispose();

        const restoredModel = new ScriptedModelRuntime([(request) => {
            const serialized = JSON.stringify(request.messages);
            expect(serialized).toContain(`prepared snapshot v${prepareVersions[1]}`);
            expect(serialized).toContain(`provider snapshot v${providerVersions[1]}`);
            expect(serialized).not.toContain(`prepared snapshot v${prepareVersions[0]}`);
            expect(serialized).not.toContain(`prepared runtime v${prepareVersions[0]}`);
            return {
                message: {
                    role: "assistant",
                    content: [{type: "text", text: "restored"}],
                    timestamp: 2,
                },
            };
        }]);
        const restoredHarness = new NeuroAgentHarness({
            store: new JsonlSessionStore({directory}),
            profiles: registry,
            model: restoredModel,
        });
        const beforeResume = await restoredHarness.snapshot(session.session.metadata.sessionId);
        expect(beforeResume.session.version).toBe(waitingSnapshot.session.version);
        const completed = await restoredHarness.resume(session.session.metadata.sessionId, waitingHandle.invocationId, [{
            toolCallId: "w",
            approved: true,
        }]);
        expect((await completed.result()).status).toBe("completed");
        expect(prepareVersions[1]).toBe(beforeResume.session.version);
        expect(providerVersions[1]).toBeGreaterThan(beforeResume.session.version);
        expect(restoredModel.requests).toHaveLength(1);
        await restoredHarness.dispose();
    });

    test("compaction Snapshot 在新 Harness 实例中继续作为 transcript 真相源", async () => {
        const directory = await tempDirectory();
        const registry = new ProfileRegistry();
        registry.define({
            manifest: {key: "compaction-recovery", name: "Compaction Recovery", version: 1},
            initial: schema,
            payload: schema,
            prepare: () => ({systemPrompt: "x", modelConfig: {}, compaction: {triggerTokens: 3, keepRecentTokens: 1}}),
        });
        const firstHarness = new NeuroAgentHarness({
            store: new JsonlSessionStore({directory}),
            profiles: registry,
            model: new ScriptedModelRuntime([
                {message: {role: "assistant", content: [{type: "text", text: "old answer"}], timestamp: 1}},
                {message: {role: "assistant", content: [{type: "text", text: "new answer"}], timestamp: 2}},
            ]),
            compactor: {estimate: () => 1, summarize: async () => "durable summary"},
        });
        const session = await firstHarness.createSession({profileKey: "compaction-recovery", initial: {}, hostContext: {}});
        await (await firstHarness.invoke({sessionId: session.session.metadata.sessionId, payload: {old: true}})).result();
        await (await firstHarness.invoke({sessionId: session.session.metadata.sessionId, payload: {new: true}})).result();

        registry.replace({
            manifest: {key: "compaction-recovery", name: "Compaction Recovery", version: 2},
            initial: schema,
            payload: schema,
            prepare: () => ({systemPrompt: "x", modelConfig: {}}),
        });
        const restoredHarness = new NeuroAgentHarness({
            store: new JsonlSessionStore({directory}),
            profiles: registry,
            model: new ScriptedModelRuntime([(request) => {
                expect(JSON.stringify(request.messages)).toContain("durable summary");
                expect(JSON.stringify(request.messages)).not.toContain("old answer");
                return {message: {role: "assistant", content: [{type: "text", text: "continued"}], timestamp: 3}};
            }]),
        });
        expect((await (await restoredHarness.invoke({sessionId: session.session.metadata.sessionId, payload: {continue: true}})).result()).status).toBe("completed");
    });
});
