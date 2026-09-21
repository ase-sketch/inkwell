import {afterEach, describe, expect, test} from "bun:test";
import {mkdtemp, rm} from "node:fs/promises";
import {join} from "node:path";
import {tmpdir} from "node:os";
import {
    InvocationOwnershipError,
    NeuroAgentHarness,
    ProfileRegistry,
    SessionConflictError,
    defineSchema,
    defineTool,
    type JsonObject,
    type SessionCommitResult,
    type SessionWritePlan,
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

class AdmissionGate {
    private armed = false;
    private reached = false;
    private released = false;
    private returned = false;
    private markBlocked!: () => void;
    private readonly blocked: Promise<void>;
    private releaseGate!: () => void;
    private readonly releasePromise: Promise<void>;
    private markReturned!: () => void;
    private readonly returnedPromise: Promise<void>;

    constructor() {
        this.blocked = new Promise<void>((resolve) => {
            this.markBlocked = resolve;
        });
        this.releasePromise = new Promise<void>((resolve) => {
            this.releaseGate = resolve;
        });
        this.returnedPromise = new Promise<void>((resolve) => {
            this.markReturned = resolve;
        });
    }

    arm(): void {
        this.armed = true;
    }

    async waitUntilBlocked(): Promise<void> {
        await this.blocked;
    }

    release(): void {
        this.released = true;
        this.releaseGate();
    }

    async waitUntilReturned(): Promise<void> {
        await this.returnedPromise;
    }

    async beforeCommit(plan: SessionWritePlan<number, JsonObject>): Promise<void> {
        const isAdmissionStart = this.armed
            && !this.released
            && plan.cause === "harness.invocation.start"
            && plan.operations.some((operation) => operation.type === "startInvocation");
        if (!isAdmissionStart) {
            return;
        }
        if (!this.reached) {
            this.reached = true;
            this.markBlocked();
        }
        await this.releasePromise;
        if (!this.returned) {
            this.returned = true;
            this.markReturned();
        }
    }
}

class GatedJsonlSessionStore extends JsonlSessionStore<JsonObject> {
    readonly gate = new AdmissionGate();

    constructor(directory: string) {
        super({directory});
    }

    override async commit(plan: SessionWritePlan<number, JsonObject>): Promise<SessionCommitResult<number, JsonObject>> {
        await this.gate.beforeCommit(plan);
        return super.commit(plan);
    }
}

class DelayedFollowUpStore extends JsonlSessionStore<JsonObject> {
    private markCommitEntered!: () => void;
    private releaseCommit!: () => void;
    readonly commitEntered = new Promise<void>((resolve) => {
        this.markCommitEntered = resolve;
    });
    private readonly commitReleased = new Promise<void>((resolve) => {
        this.releaseCommit = resolve;
    });

    constructor(directory: string) {
        super({directory});
    }

    release(): void {
        this.releaseCommit();
    }

    override async commit(plan: SessionWritePlan<number, JsonObject>): Promise<SessionCommitResult<number, JsonObject>> {
        if (plan.cause === "harness.followUp.queue") {
            this.markCommitEntered();
            await this.commitReleased;
        }
        return super.commit(plan);
    }
}

function profiles(): ProfileRegistry {
    const registry = new ProfileRegistry();
    registry.define({
        manifest: {key: "jsonl-follow-up-race", name: "JSONL Follow-up Race"},
        initial: schema,
        payload: schema,
        prepare: () => ({systemPrompt: "test", modelConfig: {}}),
    });
    return registry;
}

function assistant(text: string, timestamp: number) {
    return {
        message: {
            role: "assistant" as const,
            content: [{type: "text" as const, text}],
            timestamp,
        },
    };
}

async function tempDirectory(): Promise<string> {
    const directory = await mkdtemp(join(tmpdir(), "neuro-harness-follow-up-jsonl-"));
    directories.push(directory);
    return directory;
}

async function setupRace(directory: string) {
    let markInitialStarted!: () => void;
    let releaseInitial!: () => void;
    const initialStarted = new Promise<void>((resolve) => {
        markInitialStarted = resolve;
    });
    const initialGate = new Promise<void>((resolve) => {
        releaseInitial = resolve;
    });
    const store = new GatedJsonlSessionStore(directory);
    const harness = new NeuroAgentHarness({
        store,
        profiles: profiles(),
        model: new ScriptedModelRuntime([
            async () => {
                markInitialStarted();
                await initialGate;
                return assistant("initial", 1);
            },
            new Error("stale follow-up A was started"),
        ]),
    });
    const session = await harness.createSession({
        profileKey: "jsonl-follow-up-race",
        initial: {},
        hostContext: {},
    });
    const sessionId = session.session.metadata.sessionId;
    await harness.pauseFollowUps(sessionId);
    const initial = await harness.invoke({sessionId, payload: {prompt: "initial"}});
    await initialStarted;
    const a = await harness.followUp(sessionId, {prompt: "A"});
    const b = await harness.followUp(sessionId, {prompt: "B"});
    releaseInitial();
    await initial.result();
    await new Promise((resolve) => setTimeout(resolve, 0));
    return {a, b, harness, sessionId, store};
}

async function createConsumer(directory: string) {
    let markStarted!: () => void;
    let releaseModel!: () => void;
    const started = new Promise<void>((resolve) => {
        markStarted = resolve;
    });
    const modelGate = new Promise<void>((resolve) => {
        releaseModel = resolve;
    });
    const harness = new NeuroAgentHarness({
        store: new JsonlSessionStore<JsonObject>({directory}),
        profiles: profiles(),
        model: new ScriptedModelRuntime([async () => {
            markStarted();
            await modelGate;
            return assistant("follow-up complete", 2);
        }]),
    });
    return {harness, started, releaseModel};
}

describe("JSONL follow-up admission race", () => {
    test("独立 JSONL Harness 可以向另一个 Harness 的 active Invocation durable queue follow-up", async () => {
        const directory = await tempDirectory();
        let markInitialStarted!: () => void;
        let releaseInitial!: () => void;
        const initialStarted = new Promise<void>((resolve) => {
            markInitialStarted = resolve;
        });
        const initialGate = new Promise<void>((resolve) => {
            releaseInitial = resolve;
        });
        const producer = new NeuroAgentHarness({
            store: new JsonlSessionStore<JsonObject>({directory}),
            profiles: profiles(),
            model: new ScriptedModelRuntime([async () => {
                markInitialStarted();
                await initialGate;
                return assistant("initial complete", 1);
            }]),
        });
        const consumer = new NeuroAgentHarness({
            store: new JsonlSessionStore<JsonObject>({directory}),
            profiles: profiles(),
            model: new ScriptedModelRuntime([assistant("follow-up complete", 2)]),
        });
        try {
            const session = await producer.createSession({
                profileKey: "jsonl-follow-up-race",
                initial: {},
                hostContext: {},
            });
            const sessionId = session.session.metadata.sessionId;
            await producer.pauseFollowUps(sessionId);
            const initial = await producer.invoke({sessionId, payload: {prompt: "initial"}});
            await initialStarted;

            const queued = await consumer.followUp(sessionId, {prompt: "cross-harness"});

            expect((await producer.followUpState(sessionId)).items.map((item) => item.id)).toEqual([queued.id]);
            expect((await consumer.followUpState(sessionId)).items.map((item) => item.id)).toEqual([queued.id]);

            releaseInitial();
            expect((await initial.result()).status).toBe("completed");
            const resumed = await consumer.resumeFollowUps(sessionId);
            expect(resumed).not.toBeNull();
            expect((await resumed!.result()).status).toBe("completed");

            const restored = await producer.snapshot(sessionId);
            expect(restored.session.invocations).toHaveLength(2);
            expect((await producer.followUpState(sessionId)).items).toHaveLength(0);
        } finally {
            releaseInitial();
            await producer.dispose();
            await consumer.dispose();
        }
    });

    test("独立 JSONL Harness 可以向 durable waiting Invocation queue follow-up", async () => {
        const directory = await tempDirectory();
        const approvalTool = defineTool({
            name: "approval_gate",
            description: "wait for approval",
            parameters: schema,
            approval: {request: () => ({prompt: "approve?"})},
            execute: () => ({content: "approved"}),
        });
        const waitingProfiles = () => {
            const registry = new ProfileRegistry();
            registry.define({
                manifest: {key: "jsonl-follow-up-waiting", name: "JSONL Follow-up Waiting"},
                initial: schema,
                payload: schema,
                prepare: () => ({systemPrompt: "test", modelConfig: {}, tools: [approvalTool]}),
            });
            return registry;
        };
        const producer = new NeuroAgentHarness({
            store: new JsonlSessionStore<JsonObject>({directory}),
            profiles: waitingProfiles(),
            model: new ScriptedModelRuntime([{
                message: {
                    role: "assistant",
                    content: [{type: "toolCall", call: {id: "approval-1", name: "approval_gate", arguments: {}}}],
                    timestamp: 1,
                },
            }]),
        });
        const consumer = new NeuroAgentHarness({
            store: new JsonlSessionStore<JsonObject>({directory}),
            profiles: waitingProfiles(),
            model: new ScriptedModelRuntime([]),
        });
        try {
            const session = await producer.createSession({
                profileKey: "jsonl-follow-up-waiting",
                initial: {},
                hostContext: {},
            });
            const sessionId = session.session.metadata.sessionId;
            const waiting = await (await producer.invoke({sessionId, payload: {prompt: "wait"}})).result();
            expect(waiting.status).toBe("waiting");

            const queued = await consumer.followUp(sessionId, {prompt: "after approval"});

            expect((await producer.followUpState(sessionId)).items.map((item) => item.id)).toEqual([queued.id]);
            await consumer.cancelFollowUp(sessionId, queued.id);
            await consumer.abort(sessionId);
            expect((await producer.snapshot(sessionId)).session.activeInvocationId).toBeNull();
        } finally {
            await producer.dispose();
            await consumer.dispose();
        }
    });

    test("cross-Harness follow-up 在 observed Invocation 已 terminal 时拒绝孤立 queue item", async () => {
        const directory = await tempDirectory();
        let markInitialStarted!: () => void;
        let releaseInitial!: () => void;
        const initialStarted = new Promise<void>((resolve) => {
            markInitialStarted = resolve;
        });
        const initialGate = new Promise<void>((resolve) => {
            releaseInitial = resolve;
        });
        const producer = new NeuroAgentHarness({
            store: new JsonlSessionStore<JsonObject>({directory}),
            profiles: profiles(),
            model: new ScriptedModelRuntime([async () => {
                markInitialStarted();
                await initialGate;
                return assistant("initial complete", 1);
            }]),
        });
        const delayedStore = new DelayedFollowUpStore(directory);
        const consumer = new NeuroAgentHarness({
            store: delayedStore,
            profiles: profiles(),
            model: new ScriptedModelRuntime([]),
        });
        try {
            const session = await producer.createSession({
                profileKey: "jsonl-follow-up-race",
                initial: {},
                hostContext: {},
            });
            const sessionId = session.session.metadata.sessionId;
            const initial = await producer.invoke({sessionId, payload: {prompt: "initial"}});
            await initialStarted;

            const queued = consumer.followUp(sessionId, {prompt: "too late"});
            await delayedStore.commitEntered;
            releaseInitial();
            expect((await initial.result()).status).toBe("completed");
            delayedStore.release();

            await expect(queued).rejects.toBeInstanceOf(InvocationOwnershipError);
            expect((await producer.followUpState(sessionId)).items).toHaveLength(0);
            expect((await producer.snapshot(sessionId)).session.invocations).toHaveLength(1);
        } finally {
            releaseInitial();
            delayedStore.release();
            await producer.dispose();
            await consumer.dispose();
        }
    });

    test("独立 JSONL Harness cancel 队首后拒绝旧 admission，并可继续消费新队首", async () => {
        const directory = await tempDirectory();
        const {a, b, harness, sessionId, store} = await setupRace(directory);
        const consumer = await createConsumer(directory);
        try {
            store.gate.arm();
            const admission = harness.resumeFollowUps(sessionId);
            await store.gate.waitUntilBlocked();

            const cancelled = await consumer.harness.cancelFollowUp(sessionId, a.id);
            expect(cancelled.items.map((item) => item.id)).toEqual([b.id]);

            store.gate.release();
            await store.gate.waitUntilReturned();
            await expect(admission).rejects.toBeInstanceOf(SessionConflictError);
            expect((await harness.snapshot(sessionId)).session.invocations).toHaveLength(1);
            expect((await consumer.harness.followUpState(sessionId)).items.map((item) => item.id)).toEqual([b.id]);

            const resumed = await consumer.harness.resumeFollowUps(sessionId);
            expect(resumed).not.toBeNull();
            await consumer.started;
            consumer.releaseModel();
            await resumed!.result();
            expect((await consumer.harness.followUpState(sessionId)).items).toHaveLength(0);
        } finally {
            await harness.dispose();
            await consumer.harness.dispose();
        }
    });

    test("独立 JSONL Harness reorder 队首后拒绝旧 admission，并可继续消费 B", async () => {
        const directory = await tempDirectory();
        const {a, b, harness, sessionId, store} = await setupRace(directory);
        const consumer = await createConsumer(directory);
        try {
            store.gate.arm();
            const admission = harness.resumeFollowUps(sessionId);
            await store.gate.waitUntilBlocked();

            const reordered = await consumer.harness.reorderFollowUps(sessionId, [b.id, a.id]);
            expect(reordered.items.map((item) => item.id)).toEqual([b.id, a.id]);

            store.gate.release();
            await store.gate.waitUntilReturned();
            await expect(admission).rejects.toBeInstanceOf(SessionConflictError);
            expect((await harness.snapshot(sessionId)).session.invocations).toHaveLength(1);
            expect((await consumer.harness.followUpState(sessionId)).items.map((item) => item.id)).toEqual([b.id, a.id]);

            await consumer.harness.pauseFollowUps(sessionId);
            const resumed = await consumer.harness.resumeFollowUps(sessionId);
            expect(resumed).not.toBeNull();
            await consumer.started;
            await consumer.harness.pauseFollowUps(sessionId);
            consumer.releaseModel();
            await resumed!.result();
            expect((await consumer.harness.followUpState(sessionId)).items.map((item) => item.id)).toEqual([a.id]);
        } finally {
            await harness.dispose();
            await consumer.harness.dispose();
        }
    });
});
