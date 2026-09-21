import {describe, expect, test} from "bun:test";
import {
    NeuroAgentHarness,
    ProfileRegistry,
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

function deferred() {
    let resolve!: () => void;
    let reject!: (error: unknown) => void;
    const promise = new Promise<void>((resolvePromise, rejectPromise) => {
        resolve = resolvePromise;
        reject = rejectPromise;
    });
    return {promise, resolve, reject};
}

class FailOnNextAdmissionStartStore extends MemorySessionStore<number, JsonObject> {
    private failNextAdmissionStart = false;

    armNextAdmissionFailure(): void {
        this.failNextAdmissionStart = true;
    }

    override async commit(plan: SessionWritePlan<number, JsonObject>): Promise<SessionCommitResult<number, JsonObject>> {
        const hasStartInvocation = plan.operations.some((operation) => operation.type === "startInvocation");
        if (this.failNextAdmissionStart && plan.cause === "harness.invocation.start" && hasStartInvocation) {
            this.failNextAdmissionStart = false;
            throw new Error("start unavailable");
        }
        return super.commit(plan);
    }
}

class GatedTranscriptCommitStore extends MemorySessionStore<number, JsonObject> {
    private readonly gates: Array<{
        readonly started: ReturnType<typeof deferred>;
        readonly released: ReturnType<typeof deferred>;
    }>;
    private transcriptAttempt = 0;

    constructor(gatedAttempts: number) {
        super();
        this.gates = Array.from({length: gatedAttempts}, () => ({
            started: deferred(),
            released: deferred(),
        }));
    }

    waitForAttempt(index: number): Promise<void> {
        return this.gates[index]!.started.promise;
    }

    releaseAttempt(index: number): void {
        this.gates[index]!.released.resolve();
    }

    releaseAll(): void {
        for (const gate of this.gates) {
            gate.released.resolve();
        }
    }

    override async commit(plan: SessionWritePlan<number, JsonObject>): Promise<SessionCommitResult<number, JsonObject>> {
        if (plan.cause === "harness.transcript.commit" && this.transcriptAttempt < this.gates.length) {
            const gate = this.gates[this.transcriptAttempt]!;
            this.transcriptAttempt += 1;
            gate.started.resolve();
            await gate.released.promise;
        }
        return super.commit(plan);
    }
}

function registry(): ProfileRegistry {
    const profiles = new ProfileRegistry();
    profiles.define({
        manifest: {key: "follow-up-consume-recovery", name: "Follow-up Consume Recovery"},
        initial: schema,
        payload: schema,
        prepare: () => ({systemPrompt: "x", modelConfig: {}}),
    });
    return profiles;
}

describe("durable follow-up consume/start recovery", () => {
    test("active transcript 连续跨 queue 与 pause ledger write 有界收敛", async () => {
        const modelRelease = deferred();
        const store = new GatedTranscriptCommitStore(2);
        const harness = new NeuroAgentHarness({
            store,
            profiles: registry(),
            model: new ScriptedModelRuntime([
                async () => {
                    await modelRelease.promise;
                    return {
                        message: {
                            role: "assistant",
                            content: [{type: "text", text: "first complete"}],
                            timestamp: 1,
                        },
                    };
                },
            ]),
        });

        try {
            const session = await harness.createSession({
                profileKey: "follow-up-consume-recovery",
                initial: {},
                hostContext: {},
            });
            const sessionId = session.session.metadata.sessionId;
            const first = await harness.invoke({sessionId, payload: {first: true}});
            modelRelease.resolve();

            await store.waitForAttempt(0);
            const queued = await harness.followUp(sessionId, {prompt: "must survive"});
            store.releaseAttempt(0);

            await store.waitForAttempt(1);
            await harness.pauseFollowUps(sessionId);
            store.releaseAttempt(1);

            expect((await first.result()).status).toBe("completed");
            expect((await harness.followUpState(sessionId)).items.map((item) => item.id)).toEqual([queued.id]);
        } finally {
            modelRelease.resolve();
            store.releaseAll();
            await harness.dispose();
        }
    });

    test("active transcript 的三次连续 follow-up conflict 有界失败", async () => {
        const modelRelease = deferred();
        const store = new GatedTranscriptCommitStore(3);
        const harness = new NeuroAgentHarness({
            store,
            profiles: registry(),
            model: new ScriptedModelRuntime([
                async () => {
                    await modelRelease.promise;
                    return {
                        message: {
                            role: "assistant",
                            content: [{type: "text", text: "must not commit"}],
                            timestamp: 1,
                        },
                    };
                },
            ]),
        });

        try {
            const session = await harness.createSession({
                profileKey: "follow-up-consume-recovery",
                initial: {},
                hostContext: {},
            });
            const sessionId = session.session.metadata.sessionId;
            const first = await harness.invoke({sessionId, payload: {first: true}});
            modelRelease.resolve();

            await store.waitForAttempt(0);
            await harness.followUp(sessionId, {prompt: "must survive"});
            store.releaseAttempt(0);

            await store.waitForAttempt(1);
            await harness.pauseFollowUps(sessionId);
            store.releaseAttempt(1);

            await store.waitForAttempt(2);
            await harness.pauseFollowUps(sessionId);
            store.releaseAttempt(2);

            const result = await first.result();
            const snapshot = await harness.snapshot(sessionId);
            expect(result.status).toBe("failed");
            expect(result.error?.name).toBe("SessionConflictError");
            expect(snapshot.session.entries.some((entry) => entry.kind === "agent.message")).toBe(false);
        } finally {
            modelRelease.resolve();
            store.releaseAll();
            await harness.dispose();
        }
    });

    test("active transcript 不跨 unrelated Session mutation rebase", async () => {
        const modelRelease = deferred();
        const store = new GatedTranscriptCommitStore(1);
        const harness = new NeuroAgentHarness({
            store,
            profiles: registry(),
            model: new ScriptedModelRuntime([
                async () => {
                    await modelRelease.promise;
                    return {
                        message: {
                            role: "assistant",
                            content: [{type: "text", text: "must not commit"}],
                            timestamp: 1,
                        },
                    };
                },
            ]),
        });

        try {
            const session = await harness.createSession({
                profileKey: "follow-up-consume-recovery",
                initial: {},
                hostContext: {},
            });
            const sessionId = session.session.metadata.sessionId;
            const first = await harness.invoke({sessionId, payload: {first: true}});
            modelRelease.resolve();

            await store.waitForAttempt(0);
            await harness.write({
                target: sessionId,
                cause: "test.unrelated-mutation",
                operations: [{
                    type: "appendEntries",
                    entries: [{kind: "test.unrelated-mutation", payload: {value: 1}}],
                }],
            });
            store.releaseAttempt(0);

            const result = await first.result();
            const snapshot = await harness.snapshot(sessionId);
            expect(result.status).toBe("failed");
            expect(result.error?.name).toBe("SessionConflictError");
            expect(snapshot.session.entries.some((entry) => entry.kind === "test.unrelated-mutation")).toBe(true);
            expect(snapshot.session.entries.some((entry) => entry.kind === "agent.message")).toBe(false);
        } finally {
            modelRelease.resolve();
            store.releaseAll();
            await harness.dispose();
        }
    });

    test("start Invocation 在 consume commit 后失败时不永久丢失 queue item", async () => {
        let release!: () => void;
        const gate = new Promise<void>((resolve) => {
            release = resolve;
        });
        const store = new FailOnNextAdmissionStartStore();
        const harness = new NeuroAgentHarness({
            store,
            profiles: registry(),
            model: new ScriptedModelRuntime([
                async () => {
                    await gate;
                    return {
                        message: {
                            role: "assistant",
                            content: [{type: "text", text: "first complete"}],
                            timestamp: 1,
                        },
                    };
                },
            ]),
        });

        try {
            const session = await harness.createSession({
                profileKey: "follow-up-consume-recovery",
                initial: {},
                hostContext: {},
            });
            const sessionId = session.session.metadata.sessionId;
            const first = await harness.invoke({sessionId, payload: {first: true}});
            const queued = await harness.followUp(sessionId, {prompt: "must survive"});
            await harness.pauseFollowUps(sessionId);

            release();
            expect((await first.result()).status).toBe("completed");

            store.armNextAdmissionFailure();
            await expect(harness.resumeFollowUps(sessionId)).rejects.toThrow("start unavailable");
            expect((await harness.followUpState(sessionId)).items.map((item) => item.id)).toEqual([queued.id]);
        } finally {
            await harness.dispose();
        }
    });
});
