import {describe, expect, test} from "bun:test";
import {
    NeuroAgentHarness,
    ProfileRegistry,
    SessionConflictError,
    defineSchema,
    type JsonObject,
    type SessionCommitResult,
    type SessionWritePlan,
} from "../src/index.js";
import {MemorySessionStore} from "../src/storage/memory.js";
import {ScriptedModelRuntime} from "../src/testing/index.js";

const schema = defineSchema<JsonObject>((value) => {
    if (value === null || typeof value !== "object" || Array.isArray(value)) {
        throw new Error("必须是 object");
    }
    return value;
});

class AdmissionRaceStore extends MemorySessionStore<number, JsonObject> {
    private armed = false;
    private admissionGateReached = false;
    private admissionGateReleased = false;
    private returnedSignaled = false;
    private markBlocked!: () => void;
    private readonly blocked: Promise<void>;
    private releaseBlocked!: () => void;
    private readonly release: Promise<void>;
    private markReturned!: () => void;
    private readonly returned: Promise<void>;

    constructor() {
        super();
        this.blocked = new Promise<void>((resolve) => {
            this.markBlocked = resolve;
        });
        this.release = new Promise<void>((resolve) => {
            this.releaseBlocked = resolve;
        });
        this.returned = new Promise<void>((resolve) => {
            this.markReturned = resolve;
        });
    }

    armAdmissionRace(): void {
        this.armed = true;
    }

    async waitUntilAdmissionCommitBlocked(): Promise<void> {
        await this.blocked;
    }

    async waitUntilAdmissionCommitReturned(): Promise<void> {
        await this.returned;
    }

    releaseAdmissionCommit(): void {
        this.admissionGateReleased = true;
        this.releaseBlocked();
    }

    override async commit(plan: SessionWritePlan<number, JsonObject>): Promise<SessionCommitResult<number, JsonObject>> {
        const isAdmissionStart = this.armed
            && !this.admissionGateReleased
            && plan.cause === "harness.invocation.start"
            && plan.operations.some((operation) => operation.type === "startInvocation");
        if (isAdmissionStart) {
            if (!this.admissionGateReached) {
                this.admissionGateReached = true;
                this.markBlocked();
            }
            await this.release;
            if (!this.returnedSignaled) {
                this.returnedSignaled = true;
                this.markReturned();
            }
        }
        return super.commit(plan);
    }
}

class DelayedControlStore extends MemorySessionStore<number, JsonObject> {
    private markCommitEntered!: () => void;
    private releaseCommit!: () => void;
    readonly commitEntered = new Promise<void>((resolve) => {
        this.markCommitEntered = resolve;
    });
    private readonly commitReleased = new Promise<void>((resolve) => {
        this.releaseCommit = resolve;
    });

    constructor(private readonly delayedCause: "harness.followUp.cancel" | "harness.followUp.reorder") {
        super();
    }

    release(): void {
        this.releaseCommit();
    }

    override async commit(plan: SessionWritePlan<number, JsonObject>): Promise<SessionCommitResult<number, JsonObject>> {
        if (plan.cause === this.delayedCause) {
            this.markCommitEntered();
            await this.commitReleased;
        }
        return super.commit(plan);
    }
}

function registry(): ProfileRegistry {
    const profiles = new ProfileRegistry();
    profiles.define({
        manifest: {key: "follow-up-admission-race", name: "Follow-up Admission Race"},
        initial: schema,
        payload: schema,
        prepare: () => ({systemPrompt: "x", modelConfig: {}}),
    });
    return profiles;
}

async function setupRace() {
    let markInitialStarted!: () => void;
    let releaseInitial!: () => void;
    const initialStarted = new Promise<void>((resolve) => {
        markInitialStarted = resolve;
    });
    const initialGate = new Promise<void>((resolve) => {
        releaseInitial = resolve;
    });
    const store = new AdmissionRaceStore();
    const harness = new NeuroAgentHarness({
        store,
        profiles: registry(),
        model: new ScriptedModelRuntime([
            async () => {
                markInitialStarted();
                await initialGate;
                return {
                    message: {
                        role: "assistant",
                        content: [{type: "text", text: "initial complete"}],
                        timestamp: 1,
                    },
                };
            },
            new Error("stale follow-up A was started"),
        ]),
    });
    const session = await harness.createSession({
        profileKey: "follow-up-admission-race",
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
    return {a, b, harness, sessionId, store};
}

async function setupControlRace(
    delayedCause: "harness.followUp.cancel" | "harness.followUp.reorder",
    payloads: readonly string[],
) {
    let markInitialStarted!: () => void;
    let releaseInitial!: () => void;
    let markFollowUpStarted!: () => void;
    let releaseFollowUp!: () => void;
    const initialStarted = new Promise<void>((resolve) => {
        markInitialStarted = resolve;
    });
    const initialGate = new Promise<void>((resolve) => {
        releaseInitial = resolve;
    });
    const followUpStarted = new Promise<void>((resolve) => {
        markFollowUpStarted = resolve;
    });
    const followUpGate = new Promise<void>((resolve) => {
        releaseFollowUp = resolve;
    });
    const store = new DelayedControlStore(delayedCause);
    const harness = new NeuroAgentHarness({
        store,
        profiles: registry(),
        model: new ScriptedModelRuntime([
            async () => {
                markInitialStarted();
                await initialGate;
                return {
                    message: {
                        role: "assistant",
                        content: [{type: "text", text: "initial complete"}],
                        timestamp: 1,
                    },
                };
            },
            async () => {
                markFollowUpStarted();
                await followUpGate;
                return {
                    message: {
                        role: "assistant",
                        content: [{type: "text", text: "follow-up complete"}],
                        timestamp: 2,
                    },
                };
            },
        ]),
    });
    const session = await harness.createSession({
        profileKey: "follow-up-admission-race",
        initial: {},
        hostContext: {},
    });
    const sessionId = session.session.metadata.sessionId;
    const initial = await harness.invoke({sessionId, payload: {prompt: "initial"}});
    await initialStarted;
    const items = [];
    for (const prompt of payloads) {
        items.push(await harness.followUp(sessionId, {prompt}));
    }
    await harness.pauseFollowUps(sessionId);
    releaseInitial();
    await initial.result();
    return {followUpStarted, harness, items, releaseFollowUp, sessionId, store};
}

describe("follow-up admission race", () => {
    test("队首 admission 已提交时，stale cancel 不得谎报取消成功", async () => {
        const {followUpStarted, harness, items, releaseFollowUp, sessionId, store} =
            await setupControlRace("harness.followUp.cancel", ["A"]);
        let admitted: Awaited<ReturnType<typeof harness.resumeFollowUps>> = null;
        try {
            const cancelled = harness.cancelFollowUp(sessionId, items[0]!.id);
            await store.commitEntered;

            admitted = await harness.resumeFollowUps(sessionId);
            expect(admitted).not.toBeNull();
            await followUpStarted;
            store.release();

            await expect(cancelled).rejects.toBeInstanceOf(SessionConflictError);
            expect((await harness.snapshot(sessionId)).session.activeInvocationId).toBe(admitted!.invocationId);
        } finally {
            store.release();
            releaseFollowUp();
            await admitted?.result();
            await harness.dispose();
        }
    });

    test("队首 admission 已提交时，stale reorder 不得接受旧 permutation", async () => {
        const {followUpStarted, harness, items, releaseFollowUp, sessionId, store} =
            await setupControlRace("harness.followUp.reorder", ["A", "B"]);
        let admitted: Awaited<ReturnType<typeof harness.resumeFollowUps>> = null;
        try {
            const reordered = harness.reorderFollowUps(sessionId, [items[1]!.id, items[0]!.id]);
            await store.commitEntered;

            admitted = await harness.resumeFollowUps(sessionId);
            expect(admitted).not.toBeNull();
            await followUpStarted;
            store.release();

            await expect(reordered).rejects.toBeInstanceOf(SessionConflictError);
            expect((await harness.followUpState(sessionId)).items.map((item) => item.id)).toEqual([items[1]!.id]);
        } finally {
            store.release();
            releaseFollowUp();
            await admitted?.result();
            await harness.dispose();
        }
    });

    test("cancel 队首 A 后，不应启动已取消的旧 A", async () => {
        const {a, b, harness, sessionId, store} = await setupRace();
        try {
            store.armAdmissionRace();
            const admission = harness.resumeFollowUps(sessionId);
            await store.waitUntilAdmissionCommitBlocked();

            const cancelled = await harness.cancelFollowUp(sessionId, a.id);
            expect(cancelled.items.map((item) => item.id)).toEqual([b.id]);

            store.releaseAdmissionCommit();
            await store.waitUntilAdmissionCommitReturned();
            await expect(admission).rejects.toBeInstanceOf(SessionConflictError);
            const snapshot = await harness.snapshot(sessionId);
            expect(snapshot.session.invocations.some((invocation) => JSON.stringify(invocation.input) === JSON.stringify({prompt: "A"}))).toBe(false);
            expect((await harness.followUpState(sessionId)).items.map((item) => item.id)).toEqual([b.id]);
        } finally {
            await harness.dispose();
        }
    });

    test("重排队首为 B 后，不应启动旧队首 A", async () => {
        const {a, b, harness, sessionId, store} = await setupRace();
        try {
            store.armAdmissionRace();
            const admission = harness.resumeFollowUps(sessionId);
            await store.waitUntilAdmissionCommitBlocked();

            const reordered = await harness.reorderFollowUps(sessionId, [b.id, a.id]);
            expect(reordered.items.map((item) => item.id)).toEqual([b.id, a.id]);

            store.releaseAdmissionCommit();
            await store.waitUntilAdmissionCommitReturned();
            await expect(admission).rejects.toBeInstanceOf(SessionConflictError);
            const snapshot = await harness.snapshot(sessionId);
            expect(snapshot.session.invocations.some((invocation) => JSON.stringify(invocation.input) === JSON.stringify({prompt: "A"}))).toBe(false);
            expect((await harness.followUpState(sessionId)).items.map((item) => item.id)).toEqual([b.id, a.id]);
        } finally {
            await harness.dispose();
        }
    });
});
