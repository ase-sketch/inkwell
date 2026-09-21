import {describe, expect, test} from "bun:test";
import {
    NeuroAgentHarness,
    ProfileRegistry,
    SessionEventHub,
    defineProfile,
    defineSchema,
    defineTool,
    type JsonObject,
} from "../src/index.js";
import {MemorySessionStore} from "../src/storage/memory.js";
import {ScriptedModelRuntime} from "../src/testing/index.js";

function deferred<TValue = void>() {
    let resolve!: (value: TValue | PromiseLike<TValue>) => void;
    let reject!: (error: unknown) => void;
    const promise = new Promise<TValue>((resolvePromise, rejectPromise) => {
        resolve = resolvePromise;
        reject = rejectPromise;
    });
    return {promise, resolve, reject};
}

async function bounded<TResult>(promise: Promise<TResult>, label: string, timeoutMs = 250): Promise<TResult> {
    let timeout: ReturnType<typeof setTimeout> | undefined;
    try {
        return await Promise.race([
            promise,
            new Promise<TResult>((_, reject) => {
                timeout = setTimeout(() => reject(new Error(`${label} 超时`)), timeoutMs);
            }),
        ]);
    } finally {
        if (timeout !== undefined) {
            clearTimeout(timeout);
        }
    }
}

async function expectPendingAtTaskCheckpoint(promise: Promise<unknown>, label: string): Promise<void> {
    const settlement = promise.then(
        () => "settled" as const,
        () => "settled" as const,
    );
    const checkpoint = new Promise<"checkpoint">((resolve) => {
        setImmediate(() => resolve("checkpoint"));
    });
    expect(await bounded(Promise.race([settlement, checkpoint]), label)).toBe("checkpoint");
}

const objectSchema = defineSchema<JsonObject>((value) => {
    if (value === null || typeof value !== "object" || Array.isArray(value)) {
        throw new Error("必须是 object");
    }
    return value;
});

function profiles() {
    return new ProfileRegistry<number, JsonObject, JsonObject>().add(defineProfile({
        manifest: {key: "shutdown", name: "Shutdown"},
        initial: objectSchema,
        payload: objectSchema,
        prepare: () => ({systemPrompt: "shutdown", modelConfig: {}}),
    }));
}

function queuedFollowUp(id: string) {
    return {
        id,
        kind: "followUp" as const,
        payload: {id},
        caller: {kind: "system" as const, name: "test"},
        messageIdentity: "user" as const,
        createdAt: 1,
    };
}

class DelayedDisposeStore extends MemorySessionStore<number, JsonObject> {
    readonly disposeStarted = deferred();
    readonly disposeReleased = deferred();
    disposeCalls = 0;

    async dispose(): Promise<void> {
        this.disposeCalls += 1;
        this.disposeStarted.resolve();
        await this.disposeReleased.promise;
    }
}

class FailingDisposeStore extends MemorySessionStore<number, JsonObject> {
    readonly failure = new Error("store dispose failed");
    disposeCalls = 0;

    async dispose(): Promise<void> {
        this.disposeCalls += 1;
        throw this.failure;
    }
}

class DelayedReadStore extends MemorySessionStore<number, JsonObject> {
    readonly readStarted = deferred();
    readonly readReleased = deferred();
    private delayNextRead = false;
    private readsBeforeDelay = 0;

    delayRead(readsBeforeDelay = 0): void {
        this.delayNextRead = true;
        this.readsBeforeDelay = readsBeforeDelay;
    }

    releaseRead(): void {
        this.readReleased.resolve();
    }

    override async read(sessionId: number) {
        if (this.delayNextRead) {
            if (this.readsBeforeDelay > 0) {
                this.readsBeforeDelay -= 1;
                return super.read(sessionId);
            }
            this.delayNextRead = false;
            this.readStarted.resolve();
            await this.readReleased.promise;
        }
        return super.read(sessionId);
    }
}

class DelayedFollowUpStartStore extends MemorySessionStore<number, JsonObject> {
    readonly startCommitStarted = deferred();
    readonly startCommitReleased = deferred();
    private delayStart = false;

    delayNextStart(): void {
        this.delayStart = true;
    }

    releaseStart(): void {
        this.startCommitReleased.resolve();
    }

    override async commit(plan: Parameters<MemorySessionStore<number, JsonObject>["commit"]>[0]) {
        if (this.delayStart && plan.cause === "harness.invocation.start") {
            this.delayStart = false;
            this.startCommitStarted.resolve();
            await this.startCommitReleased.promise;
        }
        return super.commit(plan);
    }
}

class DelayedWriteCommitStore extends MemorySessionStore<number, JsonObject> {
    readonly commitStarted = deferred();
    readonly commitReleased = deferred();

    override async commit(plan: Parameters<MemorySessionStore<number, JsonObject>["commit"]>[0]) {
        if (plan.cause === "test.shutdown.write") {
            this.commitStarted.resolve();
            await this.commitReleased.promise;
        }
        return super.commit(plan);
    }
}

class ReentrantShutdownCommitStore extends MemorySessionStore<number, JsonObject> {
    onCommit: (() => void) | undefined;

    override commit(plan: Parameters<MemorySessionStore<number, JsonObject>["commit"]>[0]) {
        if (plan.cause === "test.shutdown.reentrant-commit") {
            this.onCommit?.();
        }
        return super.commit(plan);
    }
}

class DelayedCreateStore extends MemorySessionStore<number, JsonObject> {
    readonly createStarted = deferred();
    readonly createReleased = deferred();

    override async create(input: Parameters<MemorySessionStore<number, JsonObject>["create"]>[0]) {
        this.createStarted.resolve();
        await this.createReleased.promise;
        return super.create(input);
    }
}

class CountingCreateStore extends MemorySessionStore<number, JsonObject> {
    createCalls = 0;

    override async create(input: Parameters<MemorySessionStore<number, JsonObject>["create"]>[0]) {
        this.createCalls += 1;
        return super.create(input);
    }
}

class DelayedCauseCommitStore extends MemorySessionStore<number, JsonObject> {
    readonly commitStarted = deferred();
    readonly commitReleased = deferred();

    constructor(private readonly delayedCause: string) {
        super();
    }

    override async commit(plan: Parameters<MemorySessionStore<number, JsonObject>["commit"]>[0]) {
        if (plan.cause === this.delayedCause) {
            this.commitStarted.resolve();
            await this.commitReleased.promise;
        }
        return super.commit(plan);
    }
}

describe("NeuroAgentHarness shutdown barrier", () => {
    test("并发 dispose 共享同一 Promise 并等待 Store cleanup", async () => {
        const store = new DelayedDisposeStore();
        const harness = new NeuroAgentHarness({
            store,
            profiles: profiles(),
            model: new ScriptedModelRuntime<JsonObject>([]),
        });

        const first = harness.dispose();
        await store.disposeStarted.promise;
        const second = harness.dispose();
        expect(second).toBe(first);
        let secondSettled = false;
        void second.then(() => {
            secondSettled = true;
        });
        await Promise.resolve();
        expect(secondSettled).toBe(false);

        store.disposeReleased.resolve();
        await Promise.all([first, second]);
        expect(store.disposeCalls).toBe(1);
        expect(secondSettled).toBe(true);
    });

    test("abort listener 重入共享 barrier，injected Hub 在 barrier 后才由宿主关闭", async () => {
        const store = new MemorySessionStore<number, JsonObject>();
        const events = new SessionEventHub<number>();
        const modelStarted = deferred();
        let reentrantDispose: Promise<void> | undefined;
        let harness!: NeuroAgentHarness<number, JsonObject, JsonObject>;
        harness = new NeuroAgentHarness({
            abortGraceMs: 0,
            store,
            profiles: profiles(),
            events,
            model: new ScriptedModelRuntime<JsonObject>([
                async (request) => {
                    request.signal.addEventListener("abort", () => {
                        reentrantDispose = harness.dispose();
                    }, {once: true});
                    modelStarted.resolve();
                    return new Promise<never>(() => undefined);
                },
            ]),
        });
        const created = await harness.createSession({profileKey: "shutdown", initial: {}, hostContext: {}});
        const subscription = events.subscribe(created.session.metadata.sessionId, created.cursor);
        await harness.invoke({sessionId: created.session.metadata.sessionId, payload: {}});
        await modelStarted.promise;

        const first = harness.dispose();
        const second = harness.dispose();
        expect(reentrantDispose).toBe(first);
        expect(second).toBe(first);
        await bounded(second, "Harness shutdown barrier");

        const snapshot = await store.read(created.session.metadata.sessionId);
        expect(snapshot.status).toBe("idle");
        expect(snapshot.activeInvocationId).toBeNull();
        expect(snapshot.invocations[0]?.status).toBe("aborted");
        let terminalStatus: string | undefined;
        const iterator = subscription[Symbol.asyncIterator]();
        for (let index = 0; index < 10 && terminalStatus === undefined; index += 1) {
            const next = await bounded(iterator.next(), "terminal event");
            if (!next.done && next.value.kind === "runtime" && next.value.event.type === "agent_end") {
                terminalStatus = next.value.event.status;
            }
        }
        expect(terminalStatus).toBe("aborted");

        await subscription.close();
        events.close();
    });

    test("Store dispose rejection 由所有 shutdown caller 共享", async () => {
        const store = new FailingDisposeStore();
        const harness = new NeuroAgentHarness({
            store,
            profiles: profiles(),
            model: new ScriptedModelRuntime<JsonObject>([]),
        });

        const first = harness.dispose();
        const second = harness.dispose();
        expect(second).toBe(first);
        await expect(first).rejects.toBe(store.failure);
        await expect(second).rejects.toBe(store.failure);
        expect(store.disposeCalls).toBe(1);
        expect(harness.dispose()).toBe(first);
    });

    test("dispose 等待已进入的 public write 与 durable publication", async () => {
        const store = new DelayedWriteCommitStore();
        const events = new SessionEventHub<number>();
        const harness = new NeuroAgentHarness({
            store,
            profiles: profiles(),
            events,
            model: new ScriptedModelRuntime<JsonObject>([]),
        });
        const created = await harness.createSession({profileKey: "shutdown", initial: {}, hostContext: {}});
        const sessionId = created.session.metadata.sessionId;
        const subscription = events.subscribe(sessionId, created.cursor);
        const write = harness.write({
            target: sessionId,
            expectedVersion: created.session.version,
            cause: "test.shutdown.write",
            operations: [{
                type: "appendEntries",
                entries: [{kind: "test.shutdown.write", payload: {value: 1}}],
            }],
        });
        await bounded(store.commitStarted.promise, "write commit start");

        const shutdown = harness.dispose();
        const sentinelAfterShutdown = shutdown.then(() => events.publish({
            sessionId,
            kind: "host",
            event: {type: "host", name: "test.shutdown.sentinel", payload: null},
        }));
        await expectPendingAtTaskCheckpoint(shutdown, "write shutdown pending checkpoint");
        store.commitReleased.resolve();
        const written = await bounded(write, "admitted write");
        const sentinel = await bounded(sentinelAfterShutdown, "shutdown sentinel");

        const entryKinds: string[] = [];
        const iterator = subscription[Symbol.asyncIterator]();
        let lastSeq = 0;
        while (lastSeq < sentinel.seq) {
            const next = await bounded(iterator.next(), "write shutdown events");
            if (next.done) {
                break;
            }
            lastSeq = next.value.seq;
            if (next.value.kind === "session" && next.value.event.type === "session_entry") {
                entryKinds.push(next.value.event.entry.kind);
            }
        }
        await subscription.close();
        events.close();

        expect(written.session.entries.some((entry) => entry.kind === "test.shutdown.write")).toBe(true);
        expect(entryKinds).toContain("test.shutdown.write");
    });

    test("Store commit 同步触发 dispose 时 barrier 仍等待 write publication", async () => {
        const store = new ReentrantShutdownCommitStore();
        const events = new SessionEventHub<number>();
        const harness = new NeuroAgentHarness({
            store,
            profiles: profiles(),
            events,
            model: new ScriptedModelRuntime<JsonObject>([]),
        });
        const created = await harness.createSession({profileKey: "shutdown", initial: {}, hostContext: {}});
        const sessionId = created.session.metadata.sessionId;
        const settled: string[] = [];
        let shutdown: Promise<void> | undefined;
        store.onCommit = () => {
            shutdown = harness.dispose().then(() => {
                settled.push("shutdown");
                events.close();
            });
        };

        const written = await bounded(harness.write({
            target: sessionId,
            expectedVersion: created.session.version,
            cause: "test.shutdown.reentrant-commit",
            operations: [{
                type: "appendEntries",
                entries: [{kind: "test.shutdown.reentrant-commit", payload: {value: 1}}],
            }],
        }).then((snapshot) => {
            settled.push("write");
            return snapshot;
        }), "reentrant shutdown write");
        await bounded(shutdown!, "reentrant commit shutdown");

        expect(settled).toEqual(["write", "shutdown"]);
        expect(written.session.entries.some((entry) => entry.kind === "test.shutdown.reentrant-commit")).toBe(true);
        expect((await store.read(sessionId)).entries.some((entry) => entry.kind === "test.shutdown.reentrant-commit")).toBe(true);
    });

    test("async commit observer 等待重入 dispose 时不阻塞 admitted write publication", async () => {
        const store = new MemorySessionStore<number, JsonObject>();
        const events = new SessionEventHub<number>();
        const observerCalledDispose = deferred();
        const lateObserverError = deferred<Error>();
        let sentinelAfterShutdown: Promise<ReturnType<typeof events.publish>> | undefined;
        let harness!: NeuroAgentHarness<number, JsonObject, JsonObject>;
        harness = new NeuroAgentHarness({
            store,
            profiles: profiles(),
            events,
            model: new ScriptedModelRuntime<JsonObject>([]),
            commitObservers: [{
                name: "reentrant-shutdown",
                async afterCommit(notification) {
                    if (notification.plan.cause !== "test.shutdown.observer") {
                        return;
                    }
                    await Promise.resolve();
                    const shutdown = harness.dispose();
                    sentinelAfterShutdown = shutdown.then(() => events.publish({
                        sessionId: notification.plan.target,
                        kind: "host",
                        event: {type: "host", name: "test.shutdown.observer.sentinel", payload: null},
                    }));
                    observerCalledDispose.resolve();
                    await shutdown;
                    throw new Error("observer failed after shutdown");
                },
            }],
            onObserverError(name, error) {
                if (name === "reentrant-shutdown") {
                    lateObserverError.resolve(error);
                }
            },
        });
        const created = await harness.createSession({profileKey: "shutdown", initial: {}, hostContext: {}});
        const sessionId = created.session.metadata.sessionId;
        const subscription = events.subscribe(sessionId, created.cursor);
        const write = harness.write({
            target: sessionId,
            expectedVersion: created.session.version,
            cause: "test.shutdown.observer",
            operations: [{
                type: "appendEntries",
                entries: [{kind: "test.shutdown.observer", payload: {value: 1}}],
            }],
        });
        await bounded(observerCalledDispose.promise, "observer reentrant dispose");

        const written = await bounded(write, "observer-admitted write");
        const sentinel = await bounded(sentinelAfterShutdown!, "observer shutdown sentinel");
        const reportedError = await bounded(lateObserverError.promise, "late observer error");
        const entryKinds: string[] = [];
        const iterator = subscription[Symbol.asyncIterator]();
        let lastSeq = 0;
        while (lastSeq < sentinel.seq) {
            const next = await bounded(iterator.next(), "observer shutdown events");
            if (next.done) {
                break;
            }
            lastSeq = next.value.seq;
            if (next.value.kind === "session" && next.value.event.type === "session_entry") {
                entryKinds.push(next.value.event.entry.kind);
            }
        }
        await subscription.close();
        events.close();

        expect(written.session.entries.some((entry) => entry.kind === "test.shutdown.observer")).toBe(true);
        expect(entryKinds).toContain("test.shutdown.observer");
        expect(reportedError.message).toBe("observer failed after shutdown");
    });

    test("async observer error reporter 等待重入 dispose 时不阻塞 publication", async () => {
        const store = new MemorySessionStore<number, JsonObject>();
        const events = new SessionEventHub<number>();
        const reporterCalledDispose = deferred();
        let reporterSessionId = 0;
        let sentinelAfterShutdown: Promise<ReturnType<typeof events.publish>> | undefined;
        let harness!: NeuroAgentHarness<number, JsonObject, JsonObject>;
        harness = new NeuroAgentHarness({
            store,
            profiles: profiles(),
            events,
            model: new ScriptedModelRuntime<JsonObject>([]),
            commitObservers: [{
                name: "failing-observer",
                afterCommit(notification) {
                    if (notification.plan.cause === "test.shutdown.observer-reporter") {
                        throw new Error("observer failed");
                    }
                },
            }],
            async onObserverError(name) {
                if (name !== "failing-observer") {
                    return;
                }
                await Promise.resolve();
                const shutdown = harness.dispose();
                sentinelAfterShutdown = shutdown.then(() => events.publish({
                    sessionId: reporterSessionId,
                    kind: "host",
                    event: {type: "host", name: "test.shutdown.observer-reporter.sentinel", payload: null},
                }));
                reporterCalledDispose.resolve();
                await shutdown;
            },
        });
        const created = await harness.createSession({profileKey: "shutdown", initial: {}, hostContext: {}});
        const sessionId = created.session.metadata.sessionId;
        reporterSessionId = sessionId;
        const subscription = events.subscribe(sessionId, created.cursor);
        const write = harness.write({
            target: sessionId,
            expectedVersion: created.session.version,
            cause: "test.shutdown.observer-reporter",
            operations: [{
                type: "appendEntries",
                entries: [{kind: "test.shutdown.observer-reporter", payload: {value: 1}}],
            }],
        });
        await bounded(reporterCalledDispose.promise, "observer reporter reentrant dispose");

        const written = await bounded(write, "observer-reporter admitted write");
        const sentinel = await bounded(sentinelAfterShutdown!, "observer reporter shutdown sentinel");
        const entryKinds: string[] = [];
        const iterator = subscription[Symbol.asyncIterator]();
        let lastSeq = 0;
        while (lastSeq < sentinel.seq) {
            const next = await bounded(iterator.next(), "observer reporter shutdown events");
            if (next.done) {
                break;
            }
            lastSeq = next.value.seq;
            if (next.value.kind === "session" && next.value.event.type === "session_entry") {
                entryKinds.push(next.value.event.entry.kind);
            }
        }
        await subscription.close();
        events.close();

        expect(written.session.entries.some((entry) => entry.kind === "test.shutdown.observer-reporter")).toBe(true);
        expect(entryKinds).toContain("test.shutdown.observer-reporter");
    });

    test("dispose 等待已进入的 createSession 并返回创建结果", async () => {
        const store = new DelayedCreateStore();
        const harness = new NeuroAgentHarness({
            store,
            profiles: profiles(),
            model: new ScriptedModelRuntime<JsonObject>([]),
        });
        const creating = harness.createSession({profileKey: "shutdown", initial: {}, hostContext: {}});
        await bounded(store.createStarted.promise, "Session create start");

        const shutdown = harness.dispose();
        await expectPendingAtTaskCheckpoint(shutdown, "create shutdown pending checkpoint");
        store.createReleased.resolve();
        const created = await bounded(creating, "admitted Session create");
        await bounded(shutdown, "shutdown waiting Session create");

        expect(created.session.metadata.profileKey).toBe("shutdown");
        expect(created.session.version).toBe(0);
    });

    test("initial validator 重入 dispose 后 createSession 不开始 Store mutation", async () => {
        const store = new CountingCreateStore();
        let shutdown!: Promise<void>;
        let harness!: NeuroAgentHarness<number, JsonObject, JsonObject>;
        const initialSchema = defineSchema<JsonObject>((value) => {
            const parsed = objectSchema.parse(value);
            shutdown = harness.dispose();
            return parsed;
        });
        const registry = new ProfileRegistry<number, JsonObject, JsonObject>();
        registry.define({
            manifest: {key: "create-validator", name: "Create Validator"},
            initial: initialSchema,
            payload: objectSchema,
            prepare: () => ({systemPrompt: "create validator", modelConfig: {}}),
        });
        harness = new NeuroAgentHarness({
            store,
            profiles: registry,
            model: new ScriptedModelRuntime<JsonObject>([]),
        });

        const createOutcome = await bounded(harness.createSession({
            profileKey: "create-validator",
            initial: {},
            hostContext: {},
        }).then(
            (value) => ({status: "fulfilled" as const, value}),
            (error: unknown) => ({status: "rejected" as const, error}),
        ), "create validator outcome");
        await bounded(shutdown, "create validator shutdown");

        expect(createOutcome.status).toBe("rejected");
        expect(store.createCalls).toBe(0);
    });

    test("shutdown 中的 delayed steer 不写入已终止 active queue 或迟到发布", async () => {
        const store = new DelayedReadStore();
        const events = new SessionEventHub<number>();
        const modelStarted = deferred();
        const harness = new NeuroAgentHarness({
            abortGraceMs: 0,
            store,
            profiles: profiles(),
            events,
            model: new ScriptedModelRuntime<JsonObject>([
                async () => {
                    modelStarted.resolve();
                    return new Promise<never>(() => undefined);
                },
            ]),
        });
        const created = await harness.createSession({profileKey: "shutdown", initial: {}, hostContext: {}});
        const sessionId = created.session.metadata.sessionId;
        const subscription = events.subscribe(sessionId, created.cursor);
        const active = await harness.invoke({sessionId, payload: {}});
        await bounded(modelStarted.promise, "steer active model start");
        store.delayRead();
        const steer = harness.steer(sessionId, {direction: "late"});
        await bounded(store.readStarted.promise, "steer read start");

        const shutdown = harness.dispose();
        const shutdownSentinel = shutdown.then(() => events.publish({
            sessionId,
            kind: "host",
            event: {type: "host", name: "test.shutdown.steer.barrier", payload: null},
        }));
        await expectPendingAtTaskCheckpoint(shutdown, "steer shutdown pending checkpoint");
        store.releaseRead();
        const steerOutcome = await bounded(steer.then(
            (value) => ({status: "fulfilled" as const, value}),
            (error: unknown) => ({status: "rejected" as const, error}),
        ), "delayed steer outcome");
        await bounded(shutdownSentinel, "steer shutdown sentinel");
        const finalSentinel = events.publish({
            sessionId,
            kind: "host",
            event: {type: "host", name: "test.shutdown.steer.final", payload: null},
        });

        const sessionEvents: string[] = [];
        const iterator = subscription[Symbol.asyncIterator]();
        let lastSeq = 0;
        while (lastSeq < finalSentinel.seq) {
            const next = await bounded(iterator.next(), "steer shutdown events");
            if (next.done) {
                break;
            }
            lastSeq = next.value.seq;
            if (next.value.kind === "session") {
                sessionEvents.push(next.value.event.type);
            }
        }
        await subscription.close();
        events.close();
        const activeResult = await bounded(active.result(), "steer active result");

        expect(steerOutcome.status).toBe("rejected");
        expect(activeResult.status).toBe("aborted");
        expect(sessionEvents).not.toContain("steer_queued");
    });

    test("steer payload validator 重入 dispose 后不写入 active queue", async () => {
        let disposeOnPayload = false;
        let sessionId = 0;
        let sentinelAfterShutdown: Promise<ReturnType<SessionEventHub<number>["publish"]>> | undefined;
        let harness!: NeuroAgentHarness<number, JsonObject, JsonObject>;
        const events = new SessionEventHub<number>();
        const payloadSchema = defineSchema<JsonObject>((value) => {
            const parsed = objectSchema.parse(value);
            if (disposeOnPayload) {
                disposeOnPayload = false;
                const shutdown = harness.dispose();
                sentinelAfterShutdown = shutdown.then(() => events.publish({
                    sessionId,
                    kind: "host",
                    event: {type: "host", name: "test.shutdown.steer-validator.sentinel", payload: null},
                }));
            }
            return parsed;
        });
        const registry = new ProfileRegistry<number, JsonObject, JsonObject>();
        registry.define({
            manifest: {key: "steer-validator", name: "Steer Validator"},
            initial: objectSchema,
            payload: payloadSchema,
            prepare: () => ({systemPrompt: "steer validator", modelConfig: {}}),
        });
        const modelStarted = deferred();
        harness = new NeuroAgentHarness({
            abortGraceMs: 0,
            store: new MemorySessionStore<number, JsonObject>(),
            profiles: registry,
            events,
            model: new ScriptedModelRuntime<JsonObject>([
                async () => {
                    modelStarted.resolve();
                    return new Promise<never>(() => undefined);
                },
            ]),
        });
        const created = await harness.createSession({profileKey: "steer-validator", initial: {}, hostContext: {}});
        sessionId = created.session.metadata.sessionId;
        const subscription = events.subscribe(sessionId, created.cursor);
        const active = await harness.invoke({sessionId, payload: {}});
        await bounded(modelStarted.promise, "steer validator active model");

        disposeOnPayload = true;
        const steerOutcome = await bounded(harness.steer(sessionId, {direction: "shutdown"}).then(
            (value) => ({status: "fulfilled" as const, value}),
            (error: unknown) => ({status: "rejected" as const, error}),
        ), "steer validator outcome");
        const sentinel = await bounded(sentinelAfterShutdown!, "steer validator shutdown sentinel");
        const sessionEvents: string[] = [];
        const iterator = subscription[Symbol.asyncIterator]();
        let lastSeq = 0;
        while (lastSeq < sentinel.seq) {
            const next = await bounded(iterator.next(), "steer validator events");
            if (next.done) {
                break;
            }
            lastSeq = next.value.seq;
            if (next.value.kind === "session") {
                sessionEvents.push(next.value.event.type);
            }
        }
        const activeResult = await bounded(active.result(), "steer validator active result");
        await subscription.close();
        events.close();

        expect(steerOutcome.status).toBe("rejected");
        expect(activeResult.status).toBe("aborted");
        expect(sessionEvents).not.toContain("steer_queued");
    });

    test("shutdown 中的 delayed followUp 不在 barrier 后追加 durable queue", async () => {
        const store = new DelayedReadStore();
        const events = new SessionEventHub<number>();
        const harness = new NeuroAgentHarness({
            store,
            profiles: profiles(),
            events,
            model: new ScriptedModelRuntime<JsonObject>([]),
        });
        const created = await harness.createSession({profileKey: "shutdown", initial: {}, hostContext: {}});
        const sessionId = created.session.metadata.sessionId;
        const running = await harness.write({
            target: sessionId,
            expectedVersion: created.session.version,
            expectedActiveInvocationId: null,
            cause: "test.shutdown.external-running",
            operations: [{
                type: "startInvocation",
                invocation: {
                    id: "external-running",
                    sessionId,
                    profileKey: "shutdown",
                    caller: {kind: "system", name: "external"},
                    input: {},
                    createdAt: 1,
                },
            }],
        });
        const subscription = events.subscribe(sessionId, running.cursor);
        store.delayRead();
        const followUp = harness.followUp(sessionId, {next: "late"});
        await bounded(store.readStarted.promise, "followUp read start");

        const shutdown = harness.dispose();
        const shutdownSentinel = shutdown.then(() => events.publish({
            sessionId,
            kind: "host",
            event: {type: "host", name: "test.shutdown.followUp.barrier", payload: null},
        }));
        await expectPendingAtTaskCheckpoint(shutdown, "followUp shutdown pending checkpoint");
        store.releaseRead();
        const followUpOutcome = await bounded(followUp.then(
            (value) => ({status: "fulfilled" as const, value}),
            (error: unknown) => ({status: "rejected" as const, error}),
        ), "delayed followUp outcome");
        await bounded(shutdownSentinel, "followUp shutdown sentinel");
        const finalSentinel = events.publish({
            sessionId,
            kind: "host",
            event: {type: "host", name: "test.shutdown.followUp.final", payload: null},
        });

        const sessionEvents: string[] = [];
        const iterator = subscription[Symbol.asyncIterator]();
        let lastSeq = 0;
        while (lastSeq < finalSentinel.seq) {
            const next = await bounded(iterator.next(), "followUp shutdown events");
            if (next.done) {
                break;
            }
            lastSeq = next.value.seq;
            if (next.value.kind === "session") {
                sessionEvents.push(next.value.event.type);
            }
        }
        const snapshot = await store.read(sessionId);
        await subscription.close();
        events.close();

        expect(followUpOutcome.status).toBe("rejected");
        expect(snapshot.entries.some((entry) => entry.kind === "harness.followUp.queued")).toBe(false);
        expect(sessionEvents).not.toContain("follow_up_queued");
    });

    test("dispose 等待已进入的 pauseFollowUps commit 与 state publication", async () => {
        const store = new DelayedCauseCommitStore("harness.followUp.pause");
        const events = new SessionEventHub<number>();
        const harness = new NeuroAgentHarness({
            store,
            profiles: profiles(),
            events,
            model: new ScriptedModelRuntime<JsonObject>([]),
        });
        const created = await harness.createSession({profileKey: "shutdown", initial: {}, hostContext: {}});
        const sessionId = created.session.metadata.sessionId;
        const subscription = events.subscribe(sessionId, created.cursor);
        const pause = harness.pauseFollowUps(sessionId);
        await bounded(store.commitStarted.promise, "pauseFollowUps commit start");

        const shutdown = harness.dispose();
        const shutdownSentinel = shutdown.then(() => events.publish({
            sessionId,
            kind: "host",
            event: {type: "host", name: "test.shutdown.pause.barrier", payload: null},
        }));
        await expectPendingAtTaskCheckpoint(shutdown, "pauseFollowUps shutdown pending checkpoint");
        store.commitReleased.resolve();
        const pauseOutcome = await bounded(pause.then(
            (value) => ({status: "fulfilled" as const, value}),
            (error: unknown) => ({status: "rejected" as const, error}),
        ), "pauseFollowUps outcome");
        const sentinel = await bounded(shutdownSentinel, "pauseFollowUps shutdown sentinel");

        const sessionEvents: string[] = [];
        const iterator = subscription[Symbol.asyncIterator]();
        let lastSeq = 0;
        while (lastSeq < sentinel.seq) {
            const next = await bounded(iterator.next(), "pauseFollowUps shutdown events");
            if (next.done) {
                break;
            }
            lastSeq = next.value.seq;
            if (next.value.kind === "session") {
                sessionEvents.push(next.value.event.type);
            }
        }
        await subscription.close();
        events.close();

        expect(pauseOutcome).toMatchObject({status: "fulfilled", value: {paused: true}});
        expect(sessionEvents).toContain("follow_up_state");
    });

    test("shutdown 中的 delayed cancelFollowUp 不追加 cancelled fact", async () => {
        const store = new DelayedReadStore();
        const events = new SessionEventHub<number>();
        const harness = new NeuroAgentHarness({
            store,
            profiles: profiles(),
            events,
            model: new ScriptedModelRuntime<JsonObject>([]),
        });
        const created = await harness.createSession({profileKey: "shutdown", initial: {}, hostContext: {}});
        const sessionId = created.session.metadata.sessionId;
        await store.commit({
            target: sessionId,
            expectedVersion: created.session.version,
            cause: "test.shutdown.cancel.setup",
            operations: [{
                type: "appendEntries",
                entries: [{
                    kind: "harness.followUp.queued",
                    payload: queuedFollowUp("queued-cancel"),
                }, {
                    kind: "harness.followUp.paused",
                    payload: {paused: true},
                }],
            }],
        });
        const subscription = events.subscribe(sessionId, events.cursor(sessionId));
        store.delayRead();
        const cancel = harness.cancelFollowUp(sessionId, "queued-cancel");
        await bounded(store.readStarted.promise, "cancelFollowUp read start");

        const shutdown = harness.dispose();
        const shutdownSentinel = shutdown.then(() => events.publish({
            sessionId,
            kind: "host",
            event: {type: "host", name: "test.shutdown.cancel.barrier", payload: null},
        }));
        await expectPendingAtTaskCheckpoint(shutdown, "cancelFollowUp shutdown pending checkpoint");
        store.releaseRead();
        const cancelOutcome = await bounded(cancel.then(
            (value) => ({status: "fulfilled" as const, value}),
            (error: unknown) => ({status: "rejected" as const, error}),
        ), "cancelFollowUp outcome");
        await bounded(shutdownSentinel, "cancelFollowUp shutdown sentinel");
        const finalSentinel = events.publish({
            sessionId,
            kind: "host",
            event: {type: "host", name: "test.shutdown.cancel.final", payload: null},
        });

        const sessionEvents: string[] = [];
        const iterator = subscription[Symbol.asyncIterator]();
        let lastSeq = 0;
        while (lastSeq < finalSentinel.seq) {
            const next = await bounded(iterator.next(), "cancelFollowUp shutdown events");
            if (next.done) {
                break;
            }
            lastSeq = next.value.seq;
            if (next.value.kind === "session") {
                sessionEvents.push(next.value.event.type);
            }
        }
        const snapshot = await store.read(sessionId);
        await subscription.close();
        events.close();

        expect(cancelOutcome.status).toBe("rejected");
        expect(snapshot.entries.some((entry) => entry.kind === "harness.followUp.cancelled")).toBe(false);
        expect(sessionEvents).not.toContain("follow_up_state");
    });

    test("shutdown 中的 delayed reorderFollowUps 不追加 ordered fact", async () => {
        const store = new DelayedReadStore();
        const events = new SessionEventHub<number>();
        const harness = new NeuroAgentHarness({
            store,
            profiles: profiles(),
            events,
            model: new ScriptedModelRuntime<JsonObject>([]),
        });
        const created = await harness.createSession({profileKey: "shutdown", initial: {}, hostContext: {}});
        const sessionId = created.session.metadata.sessionId;
        await store.commit({
            target: sessionId,
            expectedVersion: created.session.version,
            cause: "test.shutdown.reorder.setup",
            operations: [{
                type: "appendEntries",
                entries: [{
                    kind: "harness.followUp.queued",
                    payload: queuedFollowUp("queued-first"),
                }, {
                    kind: "harness.followUp.queued",
                    payload: queuedFollowUp("queued-second"),
                }, {
                    kind: "harness.followUp.paused",
                    payload: {paused: true},
                }],
            }],
        });
        const subscription = events.subscribe(sessionId, events.cursor(sessionId));
        store.delayRead();
        const reorder = harness.reorderFollowUps(sessionId, ["queued-second", "queued-first"]);
        await bounded(store.readStarted.promise, "reorderFollowUps read start");

        const shutdown = harness.dispose();
        const shutdownSentinel = shutdown.then(() => events.publish({
            sessionId,
            kind: "host",
            event: {type: "host", name: "test.shutdown.reorder.barrier", payload: null},
        }));
        await expectPendingAtTaskCheckpoint(shutdown, "reorderFollowUps shutdown pending checkpoint");
        store.releaseRead();
        const reorderOutcome = await bounded(reorder.then(
            (value) => ({status: "fulfilled" as const, value}),
            (error: unknown) => ({status: "rejected" as const, error}),
        ), "reorderFollowUps outcome");
        await bounded(shutdownSentinel, "reorderFollowUps shutdown sentinel");
        const finalSentinel = events.publish({
            sessionId,
            kind: "host",
            event: {type: "host", name: "test.shutdown.reorder.final", payload: null},
        });

        const sessionEvents: string[] = [];
        const iterator = subscription[Symbol.asyncIterator]();
        let lastSeq = 0;
        while (lastSeq < finalSentinel.seq) {
            const next = await bounded(iterator.next(), "reorderFollowUps shutdown events");
            if (next.done) {
                break;
            }
            lastSeq = next.value.seq;
            if (next.value.kind === "session") {
                sessionEvents.push(next.value.event.type);
            }
        }
        const snapshot = await store.read(sessionId);
        await subscription.close();
        events.close();

        expect(reorderOutcome.status).toBe("rejected");
        expect(snapshot.entries.some((entry) => entry.kind === "harness.followUp.ordered")).toBe(false);
        expect(sessionEvents).not.toContain("follow_up_state");
    });

    test("shutdown 中的 delayed durable abort 不在 barrier 后 terminalize owner", async () => {
        const store = new DelayedReadStore();
        const events = new SessionEventHub<number>();
        const harness = new NeuroAgentHarness({
            store,
            profiles: profiles(),
            events,
            model: new ScriptedModelRuntime<JsonObject>([]),
        });
        const created = await harness.createSession({profileKey: "shutdown", initial: {}, hostContext: {}});
        const sessionId = created.session.metadata.sessionId;
        const running = await harness.write({
            target: sessionId,
            expectedVersion: created.session.version,
            expectedActiveInvocationId: null,
            cause: "test.shutdown.abort.setup",
            operations: [{
                type: "startInvocation",
                invocation: {
                    id: "external-abort-owner",
                    sessionId,
                    profileKey: "shutdown",
                    caller: {kind: "system", name: "external"},
                    input: {},
                    createdAt: 1,
                },
            }],
        });
        const subscription = events.subscribe(sessionId, events.cursor(sessionId));
        store.delayRead();
        const abort = harness.abort(sessionId);
        await bounded(store.readStarted.promise, "durable abort read start");

        const shutdown = harness.dispose();
        const shutdownSentinel = shutdown.then(() => events.publish({
            sessionId,
            kind: "host",
            event: {type: "host", name: "test.shutdown.abort.barrier", payload: null},
        }));
        await expectPendingAtTaskCheckpoint(shutdown, "durable abort shutdown pending checkpoint");
        store.releaseRead();
        const abortOutcome = await bounded(abort.then(
            () => ({status: "fulfilled" as const}),
            (error: unknown) => ({status: "rejected" as const, error}),
        ), "durable abort outcome");
        await bounded(shutdownSentinel, "durable abort shutdown sentinel");
        const finalSentinel = events.publish({
            sessionId,
            kind: "host",
            event: {type: "host", name: "test.shutdown.abort.final", payload: null},
        });

        const runtimeEvents: string[] = [];
        const iterator = subscription[Symbol.asyncIterator]();
        let lastSeq = 0;
        while (lastSeq < finalSentinel.seq) {
            const next = await bounded(iterator.next(), "durable abort shutdown events");
            if (next.done) {
                break;
            }
            lastSeq = next.value.seq;
            if (next.value.kind === "runtime") {
                runtimeEvents.push(next.value.event.type);
            }
        }
        const snapshot = await store.read(sessionId);
        await subscription.close();
        events.close();

        expect(abortOutcome.status).toBe("rejected");
        expect(snapshot.activeInvocationId).toBe(running.session.activeInvocationId);
        expect(snapshot.invocations[0]?.status).toBe("running");
        expect(runtimeEvents).not.toContain("agent_end");
        await expect(harness.abort(sessionId)).rejects.toThrow("NeuroAgentHarness 已 dispose");
    });

    test("dispose 等待已进入但尚未注册 active 的 Invocation admission", async () => {
        const store = new DelayedReadStore();
        const events = new SessionEventHub<number>();
        const harness = new NeuroAgentHarness({
            abortGraceMs: 0,
            store,
            profiles: profiles(),
            events,
            model: new ScriptedModelRuntime<JsonObject>([
                async () => new Promise<never>(() => undefined),
            ]),
        });
        const created = await harness.createSession({profileKey: "shutdown", initial: {}, hostContext: {}});
        store.delayRead();
        const admission = harness.invoke({sessionId: created.session.metadata.sessionId, payload: {}});
        await store.readStarted.promise;

        const shutdown = harness.dispose();
        await expectPendingAtTaskCheckpoint(shutdown, "Invocation admission shutdown pending checkpoint");
        store.releaseRead();
        const handle = await admission;
        await bounded(shutdown, "shutdown waiting invocation admission");
        const beforeCleanup = await store.read(created.session.metadata.sessionId);
        if (beforeCleanup.activeInvocationId !== null) {
            handle.abort();
        }
        const result = await bounded(handle.result(), "admitted invocation result");
        events.close();

        expect(beforeCleanup.activeInvocationId).toBeNull();
        expect(result.status).toBe("aborted");
    });

    test("shutdown 中的 follow-up read 不启动新 Invocation 或发布错误", async () => {
        const store = new DelayedReadStore();
        const events = new SessionEventHub<number>();
        const firstModelStarted = deferred();
        const releaseFirstModel = deferred();
        const harness = new NeuroAgentHarness({
            abortGraceMs: 0,
            store,
            profiles: profiles(),
            events,
            model: new ScriptedModelRuntime<JsonObject>([
                async () => {
                    firstModelStarted.resolve();
                    await releaseFirstModel.promise;
                    return {
                        message: {
                            role: "assistant",
                            content: [{type: "text", text: "first completed"}],
                            timestamp: 1,
                        },
                    };
                },
                async () => new Promise<never>(() => undefined),
            ]),
        });
        const created = await harness.createSession({profileKey: "shutdown", initial: {}, hostContext: {}});
        const subscription = events.subscribe(created.session.metadata.sessionId, created.cursor);
        const first = await harness.invoke({sessionId: created.session.metadata.sessionId, payload: {}});
        await bounded(firstModelStarted.promise, "first model start");
        await bounded(harness.followUp(created.session.metadata.sessionId, {next: true}), "queue follow-up");
        store.delayRead(1);
        releaseFirstModel.resolve();
        expect((await bounded(first.result(), "first invocation result")).status).toBe("completed");
        await bounded(store.readStarted.promise, "follow-up read start");

        const shutdown = harness.dispose();
        store.releaseRead();
        await bounded(shutdown, "shutdown waiting follow-up read");
        const snapshot = await store.read(created.session.metadata.sessionId);
        const sentinel = events.publish({
            sessionId: created.session.metadata.sessionId,
            kind: "host",
            event: {type: "host", name: "test.sentinel", payload: null},
        });
        const hostEvents: string[] = [];
        const iterator = subscription[Symbol.asyncIterator]();
        let lastSeq = 0;
        while (lastSeq < sentinel.seq) {
            const next = await bounded(iterator.next(), "follow-up shutdown events");
            if (next.done) {
                break;
            }
            lastSeq = next.value.seq;
            if (next.value.kind === "host") {
                hostEvents.push(next.value.event.name);
            }
        }
        await subscription.close();
        events.close();

        expect(snapshot.activeInvocationId).toBeNull();
        expect(snapshot.entries.some((entry) => entry.kind === "harness.followUp.queued")).toBe(true);
        expect(snapshot.entries.some((entry) => entry.kind === "harness.followUp.consumed")).toBe(false);
        expect(hostEvents).not.toContain("follow_up_error");
    });

    test("follow-up payload validation 重入 dispose 不发布虚假错误", async () => {
        let disposeOnPayload = false;
        let shutdown!: Promise<void>;
        let harness!: NeuroAgentHarness<number, JsonObject, JsonObject>;
        const shutdownStarted = deferred();
        const payloadSchema = defineSchema<JsonObject>((value) => {
            const parsed = objectSchema.parse(value);
            if (disposeOnPayload) {
                disposeOnPayload = false;
                shutdown = harness.dispose();
                shutdownStarted.resolve();
            }
            return parsed;
        });
        const registry = new ProfileRegistry<number, JsonObject, JsonObject>();
        registry.define({
            manifest: {key: "reentrant-follow-up", name: "Reentrant Follow-up"},
            initial: objectSchema,
            payload: payloadSchema,
            prepare: () => ({systemPrompt: "reentrant follow-up", modelConfig: {}}),
        });
        const store = new DelayedFollowUpStartStore();
        const events = new SessionEventHub<number>();
        const firstModelStarted = deferred();
        const releaseFirstModel = deferred();
        harness = new NeuroAgentHarness({
            abortGraceMs: 0,
            store,
            profiles: registry,
            events,
            model: new ScriptedModelRuntime<JsonObject>([
                async () => {
                    firstModelStarted.resolve();
                    await releaseFirstModel.promise;
                    return {
                        message: {
                            role: "assistant",
                            content: [{type: "text", text: "first completed"}],
                            timestamp: 1,
                        },
                    };
                },
                async () => new Promise<never>(() => undefined),
            ]),
        });
        const created = await harness.createSession({profileKey: "reentrant-follow-up", initial: {}, hostContext: {}});
        const subscription = events.subscribe(created.session.metadata.sessionId, created.cursor);
        const first = await harness.invoke({sessionId: created.session.metadata.sessionId, payload: {}});
        await bounded(firstModelStarted.promise, "first model start");
        await harness.followUp(created.session.metadata.sessionId, {next: true});
        store.delayNextStart();
        disposeOnPayload = true;
        releaseFirstModel.resolve();
        expect((await bounded(first.result(), "first invocation result")).status).toBe("completed");
        await bounded(shutdownStarted.promise, "reentrant shutdown start");
        await bounded(store.startCommitStarted.promise, "follow-up start commit");
        await expectPendingAtTaskCheckpoint(shutdown, "follow-up start shutdown pending checkpoint");
        store.releaseStart();
        await bounded(shutdown, "reentrant follow-up shutdown");
        const snapshot = await store.read(created.session.metadata.sessionId);

        const sentinel = events.publish({
            sessionId: created.session.metadata.sessionId,
            kind: "host",
            event: {type: "host", name: "test.sentinel", payload: null},
        });
        const hostEvents: string[] = [];
        const sessionEvents: string[] = [];
        const iterator = subscription[Symbol.asyncIterator]();
        let lastSeq = 0;
        while (lastSeq < sentinel.seq) {
            const next = await bounded(iterator.next(), "reentrant follow-up events");
            if (next.done) {
                break;
            }
            lastSeq = next.value.seq;
            if (next.value.kind === "host") {
                hostEvents.push(next.value.event.name);
            }
            if (next.value.kind === "session") {
                sessionEvents.push(next.value.event.type);
            }
        }
        await subscription.close();
        events.close();

        expect(snapshot.activeInvocationId).toBeNull();
        expect(snapshot.invocations.map((invocation) => invocation.status)).toEqual(["completed", "aborted"]);
        expect(snapshot.entries.some((entry) => entry.kind === "harness.followUp.consumed")).toBe(true);
        expect(sessionEvents).toContain("follow_up_started");
        expect(hostEvents).not.toContain("follow_up_error");
    });

    test("dispose 等待 public resumeFollowUps admission，shutdown 后不解除暂停", async () => {
        const store = new DelayedReadStore();
        const events = new SessionEventHub<number>();
        const modelStarted = deferred();
        const harness = new NeuroAgentHarness({
            abortGraceMs: 0,
            store,
            profiles: profiles(),
            events,
            model: new ScriptedModelRuntime<JsonObject>([
                async () => {
                    modelStarted.resolve();
                    return new Promise<never>(() => undefined);
                },
            ]),
        });
        const created = await harness.createSession({profileKey: "shutdown", initial: {}, hostContext: {}});
        const active = await harness.invoke({sessionId: created.session.metadata.sessionId, payload: {}});
        await bounded(modelStarted.promise, "active model start");
        await harness.followUp(created.session.metadata.sessionId, {next: true});
        await harness.pauseFollowUps(created.session.metadata.sessionId);
        active.abort();
        expect((await bounded(active.result(), "active invocation abort")).status).toBe("aborted");

        store.delayRead();
        const resumeAdmission = harness.resumeFollowUps(created.session.metadata.sessionId);
        await bounded(store.readStarted.promise, "resumeFollowUps read start");
        const shutdown = harness.dispose();
        await expectPendingAtTaskCheckpoint(shutdown, "resumeFollowUps shutdown pending checkpoint");
        store.releaseRead();
        const resumed = await bounded(resumeAdmission, "resumeFollowUps admission");
        await bounded(shutdown, "shutdown waiting resumeFollowUps admission");
        const snapshot = await store.read(created.session.metadata.sessionId);
        const pauseFacts = snapshot.entries
            .filter((entry) => entry.kind === "harness.followUp.paused")
            .map((entry) => entry.payload);
        events.close();

        expect(resumed).toBeNull();
        expect(snapshot.activeInvocationId).toBeNull();
        expect(pauseFacts.at(-1)).toEqual({paused: true});
    });

    test("dispose 等待尚未注册 active 的 approval resume admission", async () => {
        const approvalTool = defineTool({
            name: "approval_tool",
            description: "approval",
            parameters: objectSchema,
            approval: {request: () => ({prompt: "approve?"})},
            async execute() {
                return new Promise<never>(() => undefined);
            },
        });
        const registry = new ProfileRegistry<number, JsonObject, JsonObject>();
        registry.define({
            manifest: {key: "approval-shutdown", name: "Approval Shutdown"},
            initial: objectSchema,
            payload: objectSchema,
            prepare: () => ({systemPrompt: "approval", modelConfig: {}, tools: [approvalTool]}),
        });
        const store = new DelayedReadStore();
        const events = new SessionEventHub<number>();
        const harness = new NeuroAgentHarness({
            abortGraceMs: 0,
            store,
            profiles: registry,
            events,
            model: new ScriptedModelRuntime<JsonObject>([{
                message: {
                    role: "assistant",
                    content: [{type: "toolCall", call: {id: "approval-1", name: "approval_tool", arguments: {}}}],
                    timestamp: 1,
                },
            }]),
        });
        const created = await harness.createSession({profileKey: "approval-shutdown", initial: {}, hostContext: {}});
        const waitingHandle = await harness.invoke({sessionId: created.session.metadata.sessionId, payload: {}});
        expect((await waitingHandle.result()).status).toBe("waiting");
        store.delayRead();
        const resumeAdmission = harness.resume(created.session.metadata.sessionId, waitingHandle.invocationId, [{
            toolCallId: "approval-1",
            approved: true,
        }]);
        await store.readStarted.promise;

        const shutdown = harness.dispose();
        await expectPendingAtTaskCheckpoint(shutdown, "approval resume shutdown pending checkpoint");
        store.releaseRead();
        const resumed = await resumeAdmission;
        await bounded(shutdown, "shutdown waiting resume admission");
        const beforeCleanup = await store.read(created.session.metadata.sessionId);
        if (beforeCleanup.activeInvocationId !== null) {
            resumed.abort();
        }
        const result = await bounded(resumed.result(), "resumed invocation result");
        events.close();

        expect(beforeCleanup.activeInvocationId).toBeNull();
        expect(result.status).toBe("aborted");
    });
});
