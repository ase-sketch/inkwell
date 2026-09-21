import {describe, expect, test} from "bun:test";
import {
    NeuroAgentHarness,
    ProfileRegistry,
    SessionEventHub,
    defineProfile,
    defineSchema,
    defineTool,
    SessionConflictError,
    SessionInvariantError,
    type JsonObject,
    type SessionCommitResult,
    type SessionWritePlan,
} from "../src/index.js";
import {MemorySessionStore} from "../src/storage/memory.js";
import {ScriptedModelRuntime} from "../src/testing/index.js";

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

class DelayedFinishStore extends MemorySessionStore<number, JsonObject> {
    private delayNextFinish = true;
    private resolveFinish: () => void = () => {};
    private markFinishStarted: () => void = () => {};
    readonly finishStarted: Promise<void>;
    private readonly finishReleased: Promise<void>;

    constructor() {
        super();
        this.finishStarted = new Promise<void>((resolve) => {
            this.markFinishStarted = resolve;
        });
        this.finishReleased = new Promise<void>((resolve) => {
            this.resolveFinish = resolve;
        });
    }

    releaseFinish(): void {
        this.resolveFinish();
    }

    override async commit(plan: SessionWritePlan<number, JsonObject>): Promise<SessionCommitResult<number, JsonObject>> {
        const result = await super.commit(plan);
        if (this.delayNextFinish && plan.cause === "harness.invocation.finish") {
            this.delayNextFinish = false;
            this.markFinishStarted();
            await this.finishReleased;
        }
        return result;
    }
}

class FlakyAbortFinishStore extends MemorySessionStore<number, JsonObject> {
    failuresRemaining = 2;
    readonly forceAbortPlans: SessionWritePlan<number, JsonObject>[] = [];

    override async commit(plan: SessionWritePlan<number, JsonObject>): Promise<SessionCommitResult<number, JsonObject>> {
        const operation = plan.operations[0];
        if (plan.cause === "harness.invocation.forceAbort"
            && operation?.type === "finishInvocation"
            && operation.status === "aborted") {
            this.forceAbortPlans.push(plan);
        }
        if (this.failuresRemaining > 0
            && plan.cause === "harness.invocation.forceAbort"
            && operation?.type === "finishInvocation"
            && operation.status === "aborted") {
            this.failuresRemaining -= 1;
            throw new SessionConflictError(plan.target, 0, 1);
        }
        return super.commit(plan);
    }
}

class ExhaustedAbortFinishStore extends MemorySessionStore<number, JsonObject> {
    forceAbortAttempts = 0;

    override async commit(plan: SessionWritePlan<number, JsonObject>): Promise<SessionCommitResult<number, JsonObject>> {
        const operation = plan.operations[0];
        if (plan.cause === "harness.invocation.forceAbort"
            && operation?.type === "finishInvocation"
            && operation.status === "aborted") {
            this.forceAbortAttempts += 1;
            throw new SessionConflictError(plan.target, 0, 1);
        }
        return super.commit(plan);
    }
}

class FlakyWaitingAbortStore extends MemorySessionStore<number, JsonObject> {
    failuresRemaining = 1;

    override async commit(plan: SessionWritePlan<number, JsonObject>): Promise<SessionCommitResult<number, JsonObject>> {
        const operation = plan.operations[0];
        if (this.failuresRemaining > 0
            && plan.cause === "harness.invocation.abort"
            && operation?.type === "finishInvocation"
            && operation.status === "aborted") {
            this.failuresRemaining -= 1;
            throw new SessionConflictError(plan.target, 0, 1);
        }
        return super.commit(plan);
    }
}

class ExhaustedWaitingAbortStore extends MemorySessionStore<number, JsonObject> {
    abortAttempts = 0;

    override async commit(plan: SessionWritePlan<number, JsonObject>): Promise<SessionCommitResult<number, JsonObject>> {
        const operation = plan.operations[0];
        if (plan.cause === "harness.invocation.abort"
            && operation?.type === "finishInvocation"
            && operation.status === "aborted") {
            this.abortAttempts += 1;
            throw new SessionConflictError(plan.target, 0, 1);
        }
        return super.commit(plan);
    }
}

class GatedForceAbortStore extends MemorySessionStore<number, JsonObject> {
    private releaseForceAbort!: () => void;
    readonly forceAbortStarted: Promise<void>;

    constructor() {
        super();
        this.forceAbortStarted = new Promise<void>((resolve) => {
            this.markForceAbortStarted = resolve;
        });
    }

    private markForceAbortStarted!: () => void;

    release(): void {
        this.releaseForceAbort();
    }

    override async commit(plan: SessionWritePlan<number, JsonObject>): Promise<SessionCommitResult<number, JsonObject>> {
        const operation = plan.operations[0];
        if (plan.cause === "harness.invocation.forceAbort"
            && operation?.type === "finishInvocation"
            && operation.status === "aborted") {
            this.markForceAbortStarted();
            await new Promise<void>((resolve) => {
                this.releaseForceAbort = resolve;
            });
        }
        if (plan.cause === "harness.invocation.finish"
            && operation?.type === "finishInvocation"
            && operation.status === "aborted") {
            throw new SessionInvariantError("test normal abort finish is fenced");
        }
        return super.commit(plan);
    }
}

describe("bounded abort completion", () => {
    test("abortGraceMs 拒绝负数和非有限值", () => {
        const profile = defineProfile({
            manifest: {key: "bounded-options", name: "Bounded Options"},
            initial: objectSchema,
            payload: objectSchema,
            prepare: () => ({systemPrompt: "bounded", modelConfig: {}}),
        });
        const options = {
            store: new MemorySessionStore(),
            profiles: new ProfileRegistry<number>().add(profile),
            model: new ScriptedModelRuntime([]),
        };
        expect(() => new NeuroAgentHarness({...options, abortGraceMs: -1})).toThrow();
        expect(() => new NeuroAgentHarness({...options, abortGraceMs: Number.NaN})).toThrow();
        expect(() => new NeuroAgentHarness({...options, abortGraceMs: Number.POSITIVE_INFINITY})).toThrow();
    });

    test("永不 resolve 的 Model 在 grace 后有界完成并释放 owner", async () => {
        let markStarted!: () => void;
        const started = new Promise<void>((resolve) => {
            markStarted = resolve;
        });
        const profile = defineProfile({
            manifest: {key: "bounded-model", name: "Bounded Model"},
            initial: objectSchema,
            payload: objectSchema,
            prepare: () => ({systemPrompt: "bounded", modelConfig: {}}),
        });
        const store = new MemorySessionStore();
        const harness = new NeuroAgentHarness({
            abortGraceMs: 20,
            store,
            profiles: new ProfileRegistry<number>().add(profile),
            model: new ScriptedModelRuntime([
                async () => {
                    markStarted();
                    return new Promise<never>(() => {});
                },
            ]),
        });
        const created = await harness.createSession({profileKey: "bounded-model", initial: {}, hostContext: {}});
        const handle = await harness.invoke({sessionId: created.session.metadata.sessionId, payload: {}});
        await started;

        handle.abort();

        const result = await bounded(handle.result(), "bounded Model result");
        const snapshot = await harness.snapshot(created.session.metadata.sessionId);
        expect(result.status).toBe("aborted");
        expect(snapshot.session.status).toBe("idle");
        expect(snapshot.session.activeInvocationId).toBeNull();
        await harness.dispose();
    });

    test("forced abort terminal commit 未完成前，不提前结算 unknown result", async () => {
        let markStarted!: () => void;
        const started = new Promise<void>((resolve) => {
            markStarted = resolve;
        });
        const profile = defineProfile({
            manifest: {key: "gated-force-abort", name: "Gated Force Abort"},
            initial: objectSchema,
            payload: objectSchema,
            prepare: () => ({systemPrompt: "bounded", modelConfig: {}}),
        });
        const store = new GatedForceAbortStore();
        const harness = new NeuroAgentHarness({
            abortGraceMs: 0,
            store,
            profiles: new ProfileRegistry<number>().add(profile),
            model: new ScriptedModelRuntime([
                async (request) => {
                    markStarted();
                    await new Promise<void>((resolve) => {
                        request.signal.addEventListener("abort", () => resolve(), {once: true});
                    });
                    throw new Error("aborted");
                },
            ]),
        });
        const created = await harness.createSession({profileKey: profile.manifest.key, initial: {}, hostContext: {}});
        const handle = await harness.invoke({sessionId: created.session.metadata.sessionId, payload: {}});
        await started;

        let settled = false;
        void handle.result().then(() => {
            settled = true;
        });
        handle.abort();
        await store.forceAbortStarted;
        await new Promise<void>((resolve) => setTimeout(resolve, 0));

        expect(settled).toBe(false);
        store.release();
        const result = await bounded(handle.result(), "gated forced abort result");
        const snapshot = await harness.snapshot(created.session.metadata.sessionId);
        expect(result.status).toBe("aborted");
        expect(snapshot.session.activeInvocationId).toBeNull();
        await harness.dispose();
    });

    test("waitInvocation durable 后同步 abort 不提前结算 waiting，并以 aborted 收口", async () => {
        const approvalTool = defineTool({
            name: "approval-race",
            description: "approval race",
            parameters: objectSchema,
            approval: {request: () => ({prompt: "approve"})},
            execute: () => ({content: "approved"}),
        });
        const profile = defineProfile({
            manifest: {key: "waiting-sync-abort", name: "Waiting Sync Abort"},
            initial: objectSchema,
            payload: objectSchema,
            prepare: () => ({systemPrompt: "waiting", modelConfig: {}, tools: [approvalTool]}),
        });
        const events = new SessionEventHub<number>();
        const harness = new NeuroAgentHarness({
            abortGraceMs: 0,
            store: new MemorySessionStore(),
            profiles: new ProfileRegistry<number>().add(profile),
            model: new ScriptedModelRuntime([{
                message: {
                    role: "assistant",
                    content: [{type: "toolCall", call: {id: "approval-race-1", name: "approval-race", arguments: {}}}],
                    timestamp: 1,
                },
            }]),
            events,
        });
        const created = await harness.createSession({profileKey: "waiting-sync-abort", initial: {}, hostContext: {}});
        const subscription = harness.subscribe(created.session.metadata.sessionId, created.cursor);
        let aborted = false;
        const handlePromise = harness.invoke({sessionId: created.session.metadata.sessionId, payload: {}}).then((handle) => {
            void handle.result().then((result) => {
                aborted = result.status === "aborted";
            });
            return handle;
        });
        await new Promise<void>((resolve) => {
            void (async () => {
                for await (const event of subscription) {
                    if (event.kind === "runtime" && event.event.type === "approval_required") {
                        await harness.abort(created.session.metadata.sessionId);
                        resolve();
                        break;
                    }
                }
            })();
        });
        const handle = await handlePromise;
        const result = await bounded(handle.result(), "waiting sync abort result");
        await subscription.close();
        const snapshot = await harness.snapshot(created.session.metadata.sessionId);

        expect(result.status).toBe("aborted");
        expect(aborted).toBe(true);
        expect(snapshot.session.status).toBe("idle");
        expect(snapshot.session.activeInvocationId).toBeNull();
        expect(snapshot.session.invocations[0]?.status).toBe("aborted");
        await harness.dispose();
    });

    test("forced finish 遇到瞬时 Store conflict 后仍必须 durable 完成", async () => {
        let markStarted!: () => void;
        const started = new Promise<void>((resolve) => {
            markStarted = resolve;
        });
        const profile = defineProfile({
            manifest: {key: "bounded-store-retry", name: "Bounded Store Retry"},
            initial: objectSchema,
            payload: objectSchema,
            prepare: () => ({systemPrompt: "bounded", modelConfig: {}}),
        });
        const store = new FlakyAbortFinishStore();
        const harness = new NeuroAgentHarness({
            abortGraceMs: 0,
            store,
            profiles: new ProfileRegistry<number>().add(profile),
            model: new ScriptedModelRuntime([
                async () => {
                    markStarted();
                    return new Promise<never>(() => {});
                },
            ]),
        });
        const created = await harness.createSession({profileKey: "bounded-store-retry", initial: {}, hostContext: {}});
        const handle = await harness.invoke({sessionId: created.session.metadata.sessionId, payload: {}});
        await started;

        handle.abort();

        const result = await bounded(handle.result(), "forced Store retry result");
        const snapshot = await harness.snapshot(created.session.metadata.sessionId);
        expect(result.status).toBe("aborted");
        expect(snapshot.session.status).toBe("idle");
        expect(snapshot.session.activeInvocationId).toBeNull();
        expect(store.failuresRemaining).toBe(0);
        expect(store.forceAbortPlans).toHaveLength(3);
        expect(store.forceAbortPlans.every((plan) => plan.expectedVersion === undefined)).toBe(true);
        expect(store.forceAbortPlans.every((plan) => plan.expectedActiveInvocationId === handle.invocationId)).toBe(true);
        await harness.dispose();
    });

    test("forced finish conflict 耗尽时不伪造 aborted terminal", async () => {
        let markStarted!: () => void;
        const started = new Promise<void>((resolve) => {
            markStarted = resolve;
        });
        const profile = defineProfile({
            manifest: {key: "bounded-exhausted", name: "Bounded Exhausted"},
            initial: objectSchema,
            payload: objectSchema,
            prepare: () => ({systemPrompt: "bounded", modelConfig: {}}),
        });
        const store = new ExhaustedAbortFinishStore();
        const events = new SessionEventHub<number>();
        const harness = new NeuroAgentHarness({
            abortGraceMs: 0,
            store,
            profiles: new ProfileRegistry<number>().add(profile),
            model: new ScriptedModelRuntime([
                async () => {
                    markStarted();
                    return new Promise<never>(() => {});
                },
            ]),
            events,
        });
        const created = await harness.createSession({profileKey: "bounded-exhausted", initial: {}, hostContext: {}});
        const subscription = harness.subscribe(created.session.metadata.sessionId, created.cursor);
        const handle = await harness.invoke({sessionId: created.session.metadata.sessionId, payload: {}});
        await started;

        handle.abort();

        const result = await bounded(handle.result(), "exhausted forced abort result");
        await subscription.close();
        const received = [];
        for await (const event of subscription) {
            received.push(event);
        }
        const terminalEvents = received.filter((event) => event.kind === "runtime" && event.event.type === "agent_end");
        const snapshot = await harness.snapshot(created.session.metadata.sessionId);
        expect(result.status).toBe("failed");
        expect(result.error?.name).toBe("AbortBoundaryError");
        expect(store.forceAbortAttempts).toBe(3);
        expect(terminalEvents).toHaveLength(0);
        expect(snapshot.session.activeInvocationId).toBe(handle.invocationId);
        expect(snapshot.session.invocations[0]?.status).toBe("running");
        await harness.dispose();
    });

    test("重复 abort 只触发一次强制完成，并允许 retry", async () => {
        let markStarted!: () => void;
        const started = new Promise<void>((resolve) => {
            markStarted = resolve;
        });
        const profile = defineProfile({
            manifest: {key: "bounded-retry", name: "Bounded Retry"},
            initial: objectSchema,
            payload: objectSchema,
            prepare: () => ({systemPrompt: "bounded", modelConfig: {}}),
        });
        const events = new SessionEventHub<number>();
        const harness = new NeuroAgentHarness({
            abortGraceMs: 0,
            store: new MemorySessionStore(),
            profiles: new ProfileRegistry<number>().add(profile),
            model: new ScriptedModelRuntime([
                async () => {
                    markStarted();
                    return new Promise<never>(() => {});
                },
                {
                    message: {
                        role: "assistant",
                        content: [{type: "text", text: "retried"}],
                        timestamp: 2,
                    },
                },
            ]),
            events,
        });
        const created = await harness.createSession({profileKey: "bounded-retry", initial: {}, hostContext: {}});
        const subscription = harness.subscribe(created.session.metadata.sessionId, created.cursor);
        const first = await harness.invoke({sessionId: created.session.metadata.sessionId, payload: {}});
        await started;

        first.abort();
        first.abort();
        const firstResult = await bounded(first.result(), "repeated abort result");
        const retried = await harness.retry(created.session.metadata.sessionId, first.invocationId);
        const retryResult = await bounded(retried.result(), "retry result");
        const received = [];
        await subscription.close();
        for await (const event of subscription) {
            received.push(event);
        }
        const terminalEvents = received.filter((event) => event.kind === "runtime" && event.event.type === "agent_end");
        expect(firstResult.status).toBe("aborted");
        expect(retryResult.status).toBe("completed");
        expect(terminalEvents.filter((event) => event.event.type === "agent_end" && event.event.status === "aborted")).toHaveLength(1);
        const snapshot = await harness.snapshot(created.session.metadata.sessionId);
        expect(snapshot.session.invocations.map((invocation) => invocation.status)).toEqual(["aborted", "completed"]);
        await harness.dispose();
    });

    test("waiting → abort 只产生一个终态 agent_end", async () => {
        const approvalTool = defineTool({
            name: "approval",
            description: "approval",
            parameters: objectSchema,
            approval: {request: () => ({prompt: "approve"})},
            execute: () => ({content: "approved"}),
        });
        const profile = defineProfile({
            manifest: {key: "waiting-abort", name: "Waiting Abort"},
            initial: objectSchema,
            payload: objectSchema,
            prepare: () => ({systemPrompt: "waiting", modelConfig: {}, tools: [approvalTool]}),
        });
        const events = new SessionEventHub<number>();
        const harness = new NeuroAgentHarness({
            store: new MemorySessionStore(),
            profiles: new ProfileRegistry<number>().add(profile),
            model: new ScriptedModelRuntime([{
                message: {
                    role: "assistant",
                    content: [{type: "toolCall", call: {id: "approval-1", name: "approval", arguments: {}}}],
                    timestamp: 1,
                },
            }]),
            events,
        });
        const created = await harness.createSession({profileKey: "waiting-abort", initial: {}, hostContext: {}});
        const subscription = harness.subscribe(created.session.metadata.sessionId, created.cursor);
        const handle = await harness.invoke({sessionId: created.session.metadata.sessionId, payload: {}});
        expect((await handle.result()).status).toBe("waiting");

        await harness.abort(created.session.metadata.sessionId);
        await harness.abort(created.session.metadata.sessionId);

        await subscription.close();
        const received = [];
        for await (const event of subscription) {
            received.push(event);
        }
        const terminalEvents = received.filter((event) => event.kind === "runtime" && event.event.type === "agent_end");
        const statuses = terminalEvents.map((event) => event.event.type === "agent_end" ? event.event.status : undefined);
        const snapshot = await harness.snapshot(created.session.metadata.sessionId);
        expect(statuses).toEqual(["waiting", "aborted"]);
        expect(terminalEvents.filter((event) => event.event.type === "agent_end" && event.event.status === "aborted")).toHaveLength(1);
        expect(snapshot.session.invocations[0]?.status).toBe("aborted");
        await harness.dispose();
    });

    test("waiting abort 遇到瞬时 Store conflict 后重试并发布 aborted event", async () => {
        const approvalTool = defineTool({
            name: "approval-retry",
            description: "approval-retry",
            parameters: objectSchema,
            approval: {request: () => ({prompt: "approve"})},
            execute: () => ({content: "approved"}),
        });
        const profile = defineProfile({
            manifest: {key: "waiting-abort-retry", name: "Waiting Abort Retry"},
            initial: objectSchema,
            payload: objectSchema,
            prepare: () => ({systemPrompt: "waiting retry", modelConfig: {}, tools: [approvalTool]}),
        });
        const events = new SessionEventHub<number>();
        const store = new FlakyWaitingAbortStore();
        const harness = new NeuroAgentHarness({
            store,
            profiles: new ProfileRegistry<number>().add(profile),
            model: new ScriptedModelRuntime([{
                message: {
                    role: "assistant",
                    content: [{type: "toolCall", call: {id: "approval-retry-1", name: "approval-retry", arguments: {}}}],
                    timestamp: 1,
                },
            }]),
            events,
        });
        const created = await harness.createSession({profileKey: "waiting-abort-retry", initial: {}, hostContext: {}});
        const subscription = harness.subscribe(created.session.metadata.sessionId, created.cursor);
        const handle = await harness.invoke({sessionId: created.session.metadata.sessionId, payload: {}});
        expect((await handle.result()).status).toBe("waiting");

        await harness.abort(created.session.metadata.sessionId);

        await subscription.close();
        const received = [];
        for await (const event of subscription) {
            received.push(event);
        }
        const terminalEvents = received.filter((event) => event.kind === "runtime" && event.event.type === "agent_end");
        expect(terminalEvents.map((event) => event.event.type === "agent_end" ? event.event.status : undefined)).toEqual(["waiting", "aborted"]);
        expect(store.failuresRemaining).toBe(0);
        await harness.dispose();
    });

    test("waiting abort 连续三次 Store conflict 耗尽时返回 AbortBoundaryError 且保留 waiting owner", async () => {
        const approvalTool = defineTool({
            name: "approval-exhausted",
            description: "approval-exhausted",
            parameters: objectSchema,
            approval: {request: () => ({prompt: "approve"})},
            execute: () => ({content: "approved"}),
        });
        const profile = defineProfile({
            manifest: {key: "waiting-abort-exhausted", name: "Waiting Abort Exhausted"},
            initial: objectSchema,
            payload: objectSchema,
            prepare: () => ({systemPrompt: "waiting exhausted", modelConfig: {}, tools: [approvalTool]}),
        });
        const events = new SessionEventHub<number>();
        const store = new ExhaustedWaitingAbortStore();
        const harness = new NeuroAgentHarness({
            store,
            profiles: new ProfileRegistry<number>().add(profile),
            model: new ScriptedModelRuntime([{
                message: {
                    role: "assistant",
                    content: [{type: "toolCall", call: {id: "approval-exhausted-1", name: "approval-exhausted", arguments: {}}}],
                    timestamp: 1,
                },
            }]),
            events,
        });
        const created = await harness.createSession({profileKey: "waiting-abort-exhausted", initial: {}, hostContext: {}});
        const subscription = harness.subscribe(created.session.metadata.sessionId, created.cursor);
        const handle = await harness.invoke({sessionId: created.session.metadata.sessionId, payload: {}});
        expect((await handle.result()).status).toBe("waiting");

        await expect(harness.abort(created.session.metadata.sessionId))
            .rejects.toMatchObject({name: "AbortBoundaryError"});

        await subscription.close();
        const received = [];
        for await (const event of subscription) {
            received.push(event);
        }
        const terminalEvents = received.filter((event) => event.kind === "runtime" && event.event.type === "agent_end");
        const snapshot = await harness.snapshot(created.session.metadata.sessionId);
        const invocation = snapshot.session.invocations.find((item) => item.id === handle.invocationId);
        expect(store.abortAttempts).toBe(3);
        expect(terminalEvents.map((event) => event.event.type === "agent_end" ? event.event.status : undefined)).toEqual(["waiting"]);
        expect(terminalEvents.filter((event) => event.event.type === "agent_end" && event.event.status === "aborted")).toHaveLength(0);
        expect(snapshot.session.status).toBe("waiting");
        expect(snapshot.session.activeInvocationId).toBe(handle.invocationId);
        expect(invocation?.id).toBe(handle.invocationId);
        expect(invocation?.status).toBe("waiting");
        await harness.dispose();
    });

    test("永不 resolve 的 sequential Tool 在 grace 后有界完成且不写迟到结果", async () => {
        let markStarted!: () => void;
        const started = new Promise<void>((resolve) => {
            markStarted = resolve;
        });
        const hanging = defineTool({
            name: "hanging",
            description: "hanging",
            parameters: objectSchema,
            async execute() {
                markStarted();
                return new Promise<never>(() => {});
            },
        });
        const profile = defineProfile({
            manifest: {key: "bounded-tool", name: "Bounded Tool"},
            initial: objectSchema,
            payload: objectSchema,
            prepare: () => ({systemPrompt: "bounded", modelConfig: {}, tools: [hanging]}),
        });
        const store = new MemorySessionStore();
        const harness = new NeuroAgentHarness({
            abortGraceMs: 20,
            store,
            profiles: new ProfileRegistry<number>().add(profile),
            model: new ScriptedModelRuntime([{
                message: {
                    role: "assistant",
                    content: [{type: "toolCall", call: {id: "hanging-1", name: "hanging", arguments: {}}}],
                    timestamp: 1,
                },
            }]),
        });
        const created = await harness.createSession({profileKey: "bounded-tool", initial: {}, hostContext: {}});
        const handle = await harness.invoke({sessionId: created.session.metadata.sessionId, payload: {}});
        await started;

        handle.abort();

        const result = await bounded(handle.result(), "bounded Tool result");
        const snapshot = await harness.snapshot(created.session.metadata.sessionId);
        expect(result.status).toBe("aborted");
        expect(snapshot.session.activeInvocationId).toBeNull();
        expect(snapshot.session.entries
            .filter((entry) => entry.kind === "agent.message")
            .some((entry) => JSON.stringify(entry.payload).includes('"role":"toolResult"'))).toBe(false);
        await harness.dispose();
    });

    test("dispose 只等待 completion boundary，不等待永不 resolve 的 Model", async () => {
        let markStarted!: () => void;
        const started = new Promise<void>((resolve) => {
            markStarted = resolve;
        });
        const events = new SessionEventHub<number>();
        const profile = defineProfile({
            manifest: {key: "bounded-dispose", name: "Bounded Dispose"},
            initial: objectSchema,
            payload: objectSchema,
            prepare: () => ({systemPrompt: "bounded", modelConfig: {}}),
        });
        const store = new MemorySessionStore();
        const harness = new NeuroAgentHarness({
            abortGraceMs: 20,
            store,
            profiles: new ProfileRegistry<number>().add(profile),
            model: new ScriptedModelRuntime([
                async () => {
                    markStarted();
                    return new Promise<never>(() => {});
                },
            ]),
            events,
        });
        const created = await harness.createSession({profileKey: "bounded-dispose", initial: {}, hostContext: {}});
        await harness.invoke({sessionId: created.session.metadata.sessionId, payload: {}});
        await started;

        await bounded(harness.dispose(), "bounded dispose");
        const snapshot = await store.read(created.session.metadata.sessionId);
        expect(snapshot.status).toBe("idle");
        expect(snapshot.activeInvocationId).toBeNull();
    });

    test("forced abort 与迟到正常完成只发布一个 terminal agent_end", async () => {
        let markStarted!: () => void;
        const started = new Promise<void>((resolve) => {
            markStarted = resolve;
        });
        let release!: () => void;
        const released = new Promise<void>((resolve) => {
            release = resolve;
        });
        const profile = defineProfile({
            manifest: {key: "bounded-race", name: "Bounded Race"},
            initial: objectSchema,
            payload: objectSchema,
            prepare: () => ({systemPrompt: "bounded", modelConfig: {}}),
        });
        const events = new SessionEventHub<number>();
        const harness = new NeuroAgentHarness({
            abortGraceMs: 10,
            store: new MemorySessionStore(),
            profiles: new ProfileRegistry<number>().add(profile),
            model: new ScriptedModelRuntime([
                async () => {
                    markStarted();
                    await released;
                    return {message: {role: "assistant", content: [{type: "text", text: "late"}], timestamp: 1}};
                },
            ]),
            events,
        });
        const created = await harness.createSession({profileKey: "bounded-race", initial: {}, hostContext: {}});
        const subscription = harness.subscribe(created.session.metadata.sessionId, created.cursor);
        const handle = await harness.invoke({sessionId: created.session.metadata.sessionId, payload: {}});
        await started;

        handle.abort();
        const result = await bounded(handle.result(), "forced abort result");
        release();
        await new Promise((resolve) => setTimeout(resolve, 5));

        const received = [];
        await subscription.close();
        for await (const event of subscription) {
            received.push(event);
        }
        const terminalEvents = received.filter((event) => event.kind === "runtime" && event.event.type === "agent_end");
        expect(result.status).toBe("aborted");
        expect(terminalEvents).toHaveLength(1);
        expect(terminalEvents[0]?.event.type === "agent_end" && terminalEvents[0].event.status).toBe("aborted");
        await harness.dispose();
    });

    test("normal finish 先赢时，abort 不把 completed 改写成 aborted", async () => {
        const store = new DelayedFinishStore();
        const events = new SessionEventHub<number>();
        const profile = defineProfile({
            manifest: {key: "bounded-finish-race", name: "Bounded Finish Race"},
            initial: objectSchema,
            payload: objectSchema,
            prepare: () => ({systemPrompt: "bounded", modelConfig: {}}),
        });
        const harness = new NeuroAgentHarness({
            abortGraceMs: 5,
            store,
            profiles: new ProfileRegistry<number>().add(profile),
            model: new ScriptedModelRuntime([{
                message: {
                    role: "assistant",
                    content: [{type: "text", text: "done"}],
                    timestamp: 1,
                },
            }]),
            events,
        });
        const created = await harness.createSession({profileKey: "bounded-finish-race", initial: {}, hostContext: {}});
        const subscription = harness.subscribe(created.session.metadata.sessionId, created.cursor);
        const handle = await harness.invoke({sessionId: created.session.metadata.sessionId, payload: {}});
        await store.finishStarted;

        handle.abort();
        await new Promise((resolve) => setTimeout(resolve, 10));
        store.releaseFinish();

        const result = await bounded(handle.result(), "finish race result");
        await new Promise((resolve) => setTimeout(resolve, 5));
        const received = [];
        await subscription.close();
        for await (const event of subscription) {
            received.push(event);
        }
        const terminalEvents = received.filter((event) => event.kind === "runtime" && event.event.type === "agent_end");
        expect(result.status).toBe("completed");
        expect(terminalEvents).toHaveLength(1);
        expect(terminalEvents[0]?.event.type === "agent_end" && terminalEvents[0].event.status).toBe("completed");
        const snapshot = await harness.snapshot(created.session.metadata.sessionId);
        expect(snapshot.session.status).toBe("idle");
        expect(snapshot.session.activeInvocationId).toBeNull();
        await harness.dispose();
    });
});
