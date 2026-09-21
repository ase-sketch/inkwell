import {describe, expect, test} from "bun:test";
import {
    NeuroAgentHarness,
    ProfileRegistry,
    SessionEventHub,
    defineProfile,
    defineSchema,
    type HarnessEvent,
    type JsonObject,
    type SessionCommitResult,
    type SessionStore,
    type SessionWritePlan,
} from "../src/index.js";
import {MemorySessionStore} from "../src/storage/memory.js";
import {ScriptedModelRuntime} from "../src/testing/index.js";

class FailingTranscriptStore extends MemorySessionStore<number, JsonObject> {
    override async commit(plan: SessionWritePlan<number, JsonObject>): Promise<SessionCommitResult<number, JsonObject>> {
        if (plan.cause === "harness.transcript.commit") {
            throw new Error("disk unavailable");
        }
        return super.commit(plan);
    }
}

function deferred(): {
    readonly promise: Promise<void>;
    readonly resolve: () => void;
} {
    let resolve!: () => void;
    const promise = new Promise<void>((resolvePromise) => {
        resolve = resolvePromise;
    });
    return {promise, resolve};
}

class GatedSnapshotReadStore extends MemorySessionStore<number, JsonObject> {
    private nextRead:
        | {
            readonly captured: ReturnType<typeof deferred>;
            readonly release: ReturnType<typeof deferred>;
        }
        | undefined;

    gateNextRead(): NonNullable<GatedSnapshotReadStore["nextRead"]> {
        const gate = {captured: deferred(), release: deferred()};
        this.nextRead = gate;
        return gate;
    }

    override async read(sessionId: number) {
        const snapshot = await super.read(sessionId);
        const gate = this.nextRead;
        if (gate) {
            this.nextRead = undefined;
            gate.captured.resolve();
            await gate.release.promise;
        }
        return snapshot;
    }
}

class GatedCommitStore extends MemorySessionStore<number, JsonObject> {
    private gate:
        | {
            readonly cause: string;
            readonly committed: ReturnType<typeof deferred>;
            readonly release: ReturnType<typeof deferred>;
        }
        | undefined;

    gateCommit(cause: string): NonNullable<GatedCommitStore["gate"]> {
        const gate = {cause, committed: deferred(), release: deferred()};
        this.gate = gate;
        return gate;
    }

    override async commit(plan: SessionWritePlan<number, JsonObject>): Promise<SessionCommitResult<number, JsonObject>> {
        const result = await super.commit(plan);
        const gate = this.gate;
        if (gate?.cause === plan.cause) {
            this.gate = undefined;
            gate.committed.resolve();
            await gate.release.promise;
        }
        return result;
    }
}

class GatedCreateStore extends MemorySessionStore<number, JsonObject> {
    private gate:
        | {
            readonly created: ReturnType<typeof deferred>;
            readonly release: ReturnType<typeof deferred>;
        }
        | undefined;

    gateCreate(): NonNullable<GatedCreateStore["gate"]> {
        const gate = {created: deferred(), release: deferred()};
        this.gate = gate;
        return gate;
    }

    override async create(input: Parameters<MemorySessionStore<number, JsonObject>["create"]>[0]) {
        const snapshot = await super.create(input);
        const gate = this.gate;
        if (gate) {
            this.gate = undefined;
            gate.created.resolve();
            await gate.release.promise;
        }
        return snapshot;
    }
}

class GatedRejectedCreateStore extends MemorySessionStore<number, JsonObject> {
    private gate:
        | {
            readonly started: ReturnType<typeof deferred>;
            readonly release: ReturnType<typeof deferred>;
        }
        | undefined;

    gateNextCreate(): NonNullable<GatedRejectedCreateStore["gate"]> {
        const gate = {started: deferred(), release: deferred()};
        this.gate = gate;
        return gate;
    }

    override async create(input: Parameters<MemorySessionStore<number, JsonObject>["create"]>[0]) {
        const gate = this.gate;
        if (gate) {
            this.gate = undefined;
            gate.started.resolve();
            await gate.release.promise;
        }
        return super.create(input);
    }
}

class SwitchableSessionStore implements SessionStore<number, JsonObject> {
    private delegate: MemorySessionStore<number, JsonObject>;
    private commitGate:
        | {
            readonly cause: string;
            readonly committed: ReturnType<typeof deferred>;
            readonly release: ReturnType<typeof deferred>;
        }
        | undefined;
    private createGate:
        | {
            readonly created: ReturnType<typeof deferred>;
            readonly release: ReturnType<typeof deferred>;
        }
        | undefined;
    private beforeReplacementCreateGate:
        | {
            readonly now: number;
            readonly started: ReturnType<typeof deferred>;
            readonly release: ReturnType<typeof deferred>;
        }
        | undefined;

    constructor(now: number) {
        this.delegate = new MemorySessionStore({now: () => now});
    }

    reset(now: number): void {
        this.delegate = new MemorySessionStore({now: () => now});
    }

    gateCommit(cause: string): NonNullable<SwitchableSessionStore["commitGate"]> {
        const gate = {cause, committed: deferred(), release: deferred()};
        this.commitGate = gate;
        return gate;
    }

    gateCreate(): NonNullable<SwitchableSessionStore["createGate"]> {
        const gate = {created: deferred(), release: deferred()};
        this.createGate = gate;
        return gate;
    }

    gateBeforeReplacementCreate(now: number): NonNullable<SwitchableSessionStore["beforeReplacementCreateGate"]> {
        const gate = {now, started: deferred(), release: deferred()};
        this.beforeReplacementCreateGate = gate;
        return gate;
    }

    allocateId() {
        return this.delegate.allocateId();
    }

    async create(input: Parameters<SessionStore<number, JsonObject>["create"]>[0]) {
        const beforeGate = this.beforeReplacementCreateGate;
        if (beforeGate) {
            this.beforeReplacementCreateGate = undefined;
            beforeGate.started.resolve();
            await beforeGate.release.promise;
            this.delegate = new MemorySessionStore({now: () => beforeGate.now});
        }
        const delegate = this.delegate;
        const snapshot = await delegate.create(input);
        const gate = this.createGate;
        if (gate) {
            this.createGate = undefined;
            gate.created.resolve();
            await gate.release.promise;
        }
        return snapshot;
    }

    read(sessionId: number) {
        return this.delegate.read(sessionId);
    }

    async commit(plan: SessionWritePlan<number, JsonObject>) {
        const delegate = this.delegate;
        const result = await delegate.commit(plan);
        const gate = this.commitGate;
        if (gate?.cause === plan.cause) {
            this.commitGate = undefined;
            gate.committed.resolve();
            await gate.release.promise;
        }
        return result;
    }

    reconcileInterrupted() {
        return this.delegate.reconcileInterrupted();
    }
}

class MalformedPublicationResultStore extends MemorySessionStore<number, JsonObject> {
    override async commit(plan: SessionWritePlan<number, JsonObject>): Promise<SessionCommitResult<number, JsonObject>> {
        const result = await super.commit(plan);
        if (plan.cause !== "test.partialPublication.invalidBatch") {
            return result;
        }
        const entry = result.entries[0];
        if (!entry) {
            throw new Error("partial publication test requires one committed entry");
        }
        const circular: Record<string, unknown> = {};
        circular.self = circular;
        return {
            ...result,
            entries: [
                entry,
                {
                    ...entry,
                    id: `${entry.id}-invalid`,
                    kind: "test.partialPublication.invalid",
                    payload: circular as never,
                },
            ],
        };
    }
}

describe("durable event ordering", () => {
    test("snapshot 读取期间发布的 durable entry 不会被返回 cursor 跳过", async () => {
        const schema = defineSchema<JsonObject>((value) => {
            if (value === null || typeof value !== "object" || Array.isArray(value)) throw new Error("必须是 object");
            return value;
        });
        const profile = defineProfile({
            manifest: {key: "snapshot-cut", name: "Snapshot Cut"},
            initial: schema,
            payload: schema,
            prepare: () => ({systemPrompt: "test", modelConfig: {}}),
        });
        const store = new GatedSnapshotReadStore();
        const events = new SessionEventHub<number>({eventEpoch: "snapshot-cut"});
        const harness = new NeuroAgentHarness({
            store,
            profiles: new ProfileRegistry().add(profile),
            model: new ScriptedModelRuntime([]),
            events,
        });
        const created = await harness.createSession({profileKey: "snapshot-cut", initial: {}, hostContext: {}});
        const sessionId = created.session.metadata.sessionId;
        const gate = store.gateNextRead();
        const pendingSnapshot = harness.snapshot(sessionId);
        await gate.captured.promise;

        let duringSnapshot!: Awaited<ReturnType<typeof harness.write>>;
        try {
            duringSnapshot = await harness.write({
                target: sessionId,
                expectedVersion: created.session.version,
                cause: "test.snapshotCut.duringRead",
                operations: [{
                    type: "appendEntries",
                    entries: [{kind: "test.snapshot.during", payload: {value: 1}}],
                }],
            });
        } finally {
            gate.release.resolve();
        }

        const observed = await pendingSnapshot;
        expect(observed.session.entries).toHaveLength(0);
        const subscription = harness.subscribe(sessionId, observed.cursor);
        await harness.write({
            target: sessionId,
            expectedVersion: duringSnapshot.session.version,
            cause: "test.snapshotCut.afterRead",
            operations: [{
                type: "appendEntries",
                entries: [{kind: "test.snapshot.after", payload: {value: 2}}],
            }],
        });

        await expect(subscription.next()).resolves.toMatchObject({
            done: false,
            value: {
                kind: "session",
                event: {
                    type: "session_entry",
                    entry: {kind: "test.snapshot.during"},
                },
            },
        });
        await subscription.return();
    });

    test("createSession 返回值不会让创建窗口内的 durable entry 同时逃出 Snapshot 与 replay", async () => {
        const schema = defineSchema<JsonObject>((value) => {
            if (value === null || typeof value !== "object" || Array.isArray(value)) throw new Error("必须是 object");
            return value;
        });
        const profile = defineProfile({
            manifest: {key: "create-cut", name: "Create Cut"},
            initial: schema,
            payload: schema,
            prepare: () => ({systemPrompt: "test", modelConfig: {}}),
        });
        const store = new GatedCreateStore();
        const events = new SessionEventHub<number>({eventEpoch: "create-cut"});
        const profiles = new ProfileRegistry().add(profile);
        const harness = new NeuroAgentHarness({
            store,
            profiles,
            model: new ScriptedModelRuntime([]),
            events,
        });
        const gate = store.gateCreate();
        const pendingCreate = harness.createSession({
            sessionId: 41,
            profileKey: "create-cut",
            initial: {},
            hostContext: {},
        });
        await gate.created.promise;

        let duringCreate!: Awaited<ReturnType<typeof harness.write>>;
        try {
            duringCreate = await harness.write({
                target: 41,
                expectedVersion: 0,
                cause: "test.createCut.during",
                operations: [{
                    type: "appendEntries",
                    entries: [{kind: "test.create.during", payload: {value: 1}}],
                }],
            });
        } finally {
            gate.release.resolve();
        }

        const observed = await pendingCreate;
        const subscription = harness.subscribe(41, observed.cursor);
        await harness.write({
            target: 41,
            expectedVersion: duringCreate.session.version,
            cause: "test.createCut.after",
            operations: [{
                type: "appendEntries",
                entries: [{kind: "test.create.after", payload: {value: 2}}],
            }],
        });

        const mergedKinds = new Set(observed.session.entries.map((entry) => entry.kind));
        let reachedAfter = false;
        for (let index = 0; index < 6 && !reachedAfter; index += 1) {
            const next = await subscription.next();
            expect(next.done).toBe(false);
            if (next.done) break;
            if (next.value.kind === "session" && next.value.event.type === "session_entry") {
                mergedKinds.add(next.value.event.entry.kind);
                reachedAfter = next.value.event.entry.kind === "test.create.after";
            }
        }

        expect(reachedAfter).toBe(true);
        expect(mergedKinds.has("test.create.during")).toBe(true);
        await subscription.return();
    });

    test("write 返回值不会让较新的并发 durable entry 同时逃出 Snapshot 与 replay", async () => {
        const schema = defineSchema<JsonObject>((value) => {
            if (value === null || typeof value !== "object" || Array.isArray(value)) throw new Error("必须是 object");
            return value;
        });
        const profile = defineProfile({
            manifest: {key: "write-cut", name: "Write Cut"},
            initial: schema,
            payload: schema,
            prepare: () => ({systemPrompt: "test", modelConfig: {}}),
        });
        const store = new GatedCommitStore();
        const events = new SessionEventHub<number>({eventEpoch: "write-cut"});
        const profiles = new ProfileRegistry().add(profile);
        const first = new NeuroAgentHarness({
            store,
            profiles,
            model: new ScriptedModelRuntime([]),
            events,
        });
        const second = new NeuroAgentHarness({
            store,
            profiles,
            model: new ScriptedModelRuntime([]),
            events,
        });
        const created = await first.createSession({profileKey: "write-cut", initial: {}, hostContext: {}});
        const sessionId = created.session.metadata.sessionId;
        const gate = store.gateCommit("test.writeCut.first");
        const pendingFirst = first.write({
            target: sessionId,
            expectedVersion: created.session.version,
            cause: "test.writeCut.first",
            operations: [{
                type: "appendEntries",
                entries: [{kind: "test.write.first", payload: {value: 1}}],
            }],
        });
        await gate.committed.promise;

        let concurrent!: Awaited<ReturnType<typeof second.write>>;
        try {
            concurrent = await second.write({
                target: sessionId,
                expectedVersion: created.session.version + 1,
                cause: "test.writeCut.concurrent",
                operations: [{
                    type: "appendEntries",
                    entries: [{kind: "test.write.concurrent", payload: {value: 2}}],
                }],
            });
        } finally {
            gate.release.resolve();
        }

        const observed = await pendingFirst;
        const subscription = first.subscribe(sessionId, observed.cursor);
        await second.write({
            target: sessionId,
            expectedVersion: concurrent.session.version,
            cause: "test.writeCut.after",
            operations: [{
                type: "appendEntries",
                entries: [{kind: "test.write.after", payload: {value: 3}}],
            }],
        });

        const mergedKinds = new Set(observed.session.entries.map((entry) => entry.kind));
        let reachedAfter = false;
        for (let index = 0; index < 8 && !reachedAfter; index += 1) {
            const next = await subscription.next();
            expect(next.done).toBe(false);
            if (next.done) break;
            if (next.value.kind === "session" && next.value.event.type === "session_entry") {
                mergedKinds.add(next.value.event.entry.kind);
                reachedAfter = next.value.event.entry.kind === "test.write.after";
            }
        }

        expect(reachedAfter).toBe(true);
        expect(mergedKinds.has("test.write.concurrent")).toBe(true);
        await subscription.return();
    });

    test("共享 EventHub 检测到 durable version 倒退时整批 fail closed 为 snapshot_required", async () => {
        const schema = defineSchema<JsonObject>((value) => {
            if (value === null || typeof value !== "object" || Array.isArray(value)) throw new Error("必须是 object");
            return value;
        });
        const profile = defineProfile({
            manifest: {key: "event-causality", name: "Event Causality"},
            initial: schema,
            payload: schema,
            prepare: () => ({systemPrompt: "test", modelConfig: {}}),
        });
        const store = new GatedCommitStore();
        const events = new SessionEventHub<number>({eventEpoch: "event-causality"});
        const profiles = new ProfileRegistry().add(profile);
        const first = new NeuroAgentHarness({
            store,
            profiles,
            model: new ScriptedModelRuntime([]),
            events,
        });
        const second = new NeuroAgentHarness({
            store,
            profiles,
            model: new ScriptedModelRuntime([]),
            events,
        });
        const created = await first.createSession({profileKey: "event-causality", initial: {}, hostContext: {}});
        const sessionId = created.session.metadata.sessionId;
        const subscription = first.subscribe(sessionId, created.cursor);
        const gate = store.gateCommit("test.eventCausality.first");
        const pendingFirst = first.write({
            target: sessionId,
            expectedVersion: created.session.version,
            cause: "test.eventCausality.first",
            operations: [{
                type: "appendEntries",
                entries: [{kind: "test.eventCausality.first", payload: {value: 1}}],
            }],
        });
        await gate.committed.promise;

        try {
            await second.write({
                target: sessionId,
                expectedVersion: created.session.version + 1,
                cause: "test.eventCausality.concurrent",
                operations: [{
                    type: "appendEntries",
                    entries: [{kind: "test.eventCausality.concurrent", payload: {value: 2}}],
                }],
            });
        } finally {
            gate.release.resolve();
        }
        await pendingFirst;
        events.publish({
            sessionId,
            kind: "host",
            event: {type: "host", name: "test.eventCausality.sentinel", payload: null},
        });

        const entryKinds: string[] = [];
        const versions: number[] = [];
        const snapshotReasons: string[] = [];
        while (true) {
            const next = await subscription.next();
            expect(next.done).toBe(false);
            if (next.done) break;
            if (next.value.kind === "host" && next.value.event.name === "test.eventCausality.sentinel") {
                break;
            }
            if (next.value.kind !== "session") continue;
            if (next.value.event.type === "session_entry") {
                entryKinds.push(next.value.event.entry.kind);
            } else if (next.value.event.type === "session_status") {
                versions.push(next.value.event.version);
            } else if (next.value.event.type === "snapshot_required") {
                snapshotReasons.push(next.value.event.reason);
            }
        }

        expect({entryKinds, versions, snapshotReasons}).toEqual({
            entryKinds: ["test.eventCausality.concurrent"],
            versions: [2],
            snapshotReasons: ["commit_order"],
        });
        await subscription.return();
    });

    test("durable version forward gap 可 replay snapshot_required，恢复后继续连续增量", async () => {
        const schema = defineSchema<JsonObject>((value) => {
            if (value === null || typeof value !== "object" || Array.isArray(value)) throw new Error("必须是 object");
            return value;
        });
        const profile = defineProfile({
            manifest: {key: "event-gap", name: "Event Gap"},
            initial: schema,
            payload: schema,
            prepare: () => ({systemPrompt: "test", modelConfig: {}}),
        });
        const store = new MemorySessionStore<number, JsonObject>();
        const events = new SessionEventHub<number>({eventEpoch: "event-gap"});
        const profiles = new ProfileRegistry().add(profile);
        const harness = new NeuroAgentHarness({
            store,
            profiles,
            model: new ScriptedModelRuntime([]),
            events,
        });
        const created = await harness.createSession({profileKey: "event-gap", initial: {}, hostContext: {}});
        const sessionId = created.session.metadata.sessionId;
        const first = await harness.write({
            target: sessionId,
            expectedVersion: created.session.version,
            cause: "test.eventGap.first",
            operations: [{
                type: "appendEntries",
                entries: [{kind: "test.eventGap.first", payload: {value: 1}}],
            }],
        });
        const baseline = await harness.snapshot(sessionId);
        const external = await store.commit({
            target: sessionId,
            expectedVersion: first.session.version,
            cause: "test.eventGap.external",
            operations: [{
                type: "appendEntries",
                entries: [{kind: "test.eventGap.external", payload: {value: 2}}],
            }],
        });
        await harness.write({
            target: sessionId,
            expectedVersion: external.snapshot.version,
            cause: "test.eventGap.detected",
            operations: [{
                type: "appendEntries",
                entries: [{kind: "test.eventGap.detected", payload: {value: 3}}],
            }],
        });
        events.publish({
            sessionId,
            kind: "host",
            event: {type: "host", name: "test.eventGap.sentinel", payload: null},
        });

        const replay = harness.subscribe(sessionId, baseline.cursor);
        const replayedSessionEvents: string[] = [];
        while (true) {
            const next = await replay.next();
            expect(next.done).toBe(false);
            if (next.done) break;
            if (next.value.kind === "host" && next.value.event.name === "test.eventGap.sentinel") {
                break;
            }
            if (next.value.kind === "session") {
                replayedSessionEvents.push(next.value.event.type === "snapshot_required"
                    ? `snapshot_required:${next.value.event.reason}`
                    : next.value.event.type);
            }
        }
        expect(replayedSessionEvents).toEqual(["snapshot_required:commit_order"]);
        await replay.return();

        const recovered = await harness.snapshot(sessionId);
        expect(recovered.session.version).toBe(3);
        expect(recovered.session.entries.map((entry) => entry.kind)).toEqual([
            "test.eventGap.first",
            "test.eventGap.external",
            "test.eventGap.detected",
        ]);
        const resumed = harness.subscribe(sessionId, recovered.cursor);
        await harness.write({
            target: sessionId,
            expectedVersion: recovered.session.version,
            cause: "test.eventGap.resumed",
            operations: [{
                type: "appendEntries",
                entries: [{kind: "test.eventGap.resumed", payload: {value: 4}}],
            }],
        });
        await expect(resumed.next()).resolves.toMatchObject({
            done: false,
            value: {
                kind: "session",
                event: {
                    type: "session_entry",
                    entry: {kind: "test.eventGap.resumed"},
                },
            },
        });
        await resumed.return();

        const restartEvents = new SessionEventHub<number>({eventEpoch: "event-gap-restart"});
        const restored = new NeuroAgentHarness({
            store,
            profiles,
            model: new ScriptedModelRuntime([]),
            events: restartEvents,
        });
        const restartSnapshot = await restored.snapshot(sessionId);
        const afterRestart = restored.subscribe(sessionId, restartSnapshot.cursor);
        await restored.write({
            target: sessionId,
            expectedVersion: restartSnapshot.session.version,
            cause: "test.eventGap.restart",
            operations: [{
                type: "appendEntries",
                entries: [{kind: "test.eventGap.restart", payload: {value: 5}}],
            }],
        });
        await expect(afterRestart.next()).resolves.toMatchObject({
            done: false,
            value: {
                kind: "session",
                event: {
                    type: "session_entry",
                    entry: {kind: "test.eventGap.restart"},
                },
            },
        });
        await expect(afterRestart.next()).resolves.toMatchObject({
            done: false,
            value: {
                kind: "session",
                event: {type: "session_status", version: 5},
            },
        });
        await afterRestart.return();
    });

    test("共享 EventHub 不把不同 Store 的同名 Session 拼成连续 durable stream", async () => {
        const schema = defineSchema<JsonObject>((value) => {
            if (value === null || typeof value !== "object" || Array.isArray(value)) throw new Error("必须是 object");
            return value;
        });
        const profile = defineProfile({
            manifest: {key: "store-identity", name: "Store Identity"},
            initial: schema,
            payload: schema,
            prepare: () => ({systemPrompt: "test", modelConfig: {}}),
        });
        const firstStore = new MemorySessionStore<number, JsonObject>({now: () => 1});
        const secondStore = new MemorySessionStore<number, JsonObject>({now: () => 2});
        const events = new SessionEventHub<number>({eventEpoch: "store-identity"});
        const profiles = new ProfileRegistry().add(profile);
        const first = new NeuroAgentHarness({
            store: firstStore,
            profiles,
            model: new ScriptedModelRuntime([]),
            events,
        });
        const second = new NeuroAgentHarness({
            store: secondStore,
            profiles,
            model: new ScriptedModelRuntime([]),
            events,
        });
        const firstSession = await first.createSession({
            sessionId: 71,
            profileKey: "store-identity",
            initial: {},
            hostContext: {},
        });
        await second.createSession({
            sessionId: 71,
            profileKey: "store-identity",
            initial: {},
            hostContext: {},
        });
        const subscription = first.subscribe(71, firstSession.cursor);
        await first.write({
            target: 71,
            expectedVersion: 0,
            cause: "test.storeIdentity.first",
            operations: [{
                type: "appendEntries",
                entries: [{kind: "test.storeIdentity.first", payload: {value: 1}}],
            }],
        });
        const secondSeed = await secondStore.commit({
            target: 71,
            expectedVersion: 0,
            cause: "test.storeIdentity.secondSeed",
            operations: [{
                type: "appendEntries",
                entries: [{kind: "test.storeIdentity.secondSeed", payload: {value: 2}}],
            }],
        });
        await second.write({
            target: 71,
            expectedVersion: secondSeed.snapshot.version,
            cause: "test.storeIdentity.second",
            operations: [{
                type: "appendEntries",
                entries: [{kind: "test.storeIdentity.second", payload: {value: 3}}],
            }],
        });
        events.publish({
            sessionId: 71,
            kind: "host",
            event: {type: "host", name: "test.storeIdentity.sentinel", payload: null},
        });

        const entryKinds: string[] = [];
        const versions: number[] = [];
        const snapshotReasons: string[] = [];
        while (true) {
            const next = await subscription.next();
            expect(next.done).toBe(false);
            if (next.done) break;
            if (next.value.kind === "host" && next.value.event.name === "test.storeIdentity.sentinel") {
                break;
            }
            if (next.value.kind !== "session") continue;
            if (next.value.event.type === "session_entry") {
                entryKinds.push(next.value.event.entry.kind);
            } else if (next.value.event.type === "session_status") {
                versions.push(next.value.event.version);
            } else if (next.value.event.type === "snapshot_required") {
                snapshotReasons.push(next.value.event.reason);
            }
        }
        expect({entryKinds, versions, snapshotReasons}).toEqual({
            entryKinds: ["test.storeIdentity.first"],
            versions: [1],
            snapshotReasons: ["commit_order"],
        });
        await subscription.return();
    });

    test("共享 EventHub 不把同一 Store 对象重用的 Session ID 当成旧 generation 连续流", async () => {
        const schema = defineSchema<JsonObject>((value) => {
            if (value === null || typeof value !== "object" || Array.isArray(value)) throw new Error("必须是 object");
            return value;
        });
        const profile = defineProfile({
            manifest: {key: "session-generation", name: "Session Generation"},
            initial: schema,
            payload: schema,
            prepare: () => ({systemPrompt: "test", modelConfig: {}}),
        });
        const store = new SwitchableSessionStore(1);
        const events = new SessionEventHub<number>({eventEpoch: "session-generation"});
        const harness = new NeuroAgentHarness({
            store,
            profiles: new ProfileRegistry().add(profile),
            model: new ScriptedModelRuntime([]),
            events,
        });
        const firstSession = await harness.createSession({
            sessionId: 81,
            profileKey: "session-generation",
            initial: {},
            hostContext: {},
        });
        const subscription = harness.subscribe(81, firstSession.cursor);
        await harness.write({
            target: 81,
            expectedVersion: 0,
            cause: "test.sessionGeneration.first",
            operations: [{
                type: "appendEntries",
                entries: [{kind: "test.sessionGeneration.first", payload: {value: 1}}],
            }],
        });

        store.reset(1);
        await harness.createSession({
            sessionId: 81,
            profileKey: "session-generation",
            initial: {},
            hostContext: {},
        });
        const replacementSeed = await store.commit({
            target: 81,
            expectedVersion: 0,
            cause: "test.sessionGeneration.replacementSeed",
            operations: [{
                type: "appendEntries",
                entries: [{kind: "test.sessionGeneration.replacementSeed", payload: {value: 2}}],
            }],
        });
        await harness.write({
            target: 81,
            expectedVersion: replacementSeed.snapshot.version,
            cause: "test.sessionGeneration.replacement",
            operations: [{
                type: "appendEntries",
                entries: [{kind: "test.sessionGeneration.replacement", payload: {value: 3}}],
            }],
        });
        events.publish({
            sessionId: 81,
            kind: "host",
            event: {type: "host", name: "test.sessionGeneration.sentinel", payload: null},
        });

        const entryKinds: string[] = [];
        const versions: number[] = [];
        const snapshotReasons: string[] = [];
        while (true) {
            const next = await subscription.next();
            expect(next.done).toBe(false);
            if (next.done) break;
            if (next.value.kind === "host" && next.value.event.name === "test.sessionGeneration.sentinel") {
                break;
            }
            if (next.value.kind !== "session") continue;
            if (next.value.event.type === "session_entry") {
                entryKinds.push(next.value.event.entry.kind);
            } else if (next.value.event.type === "session_status") {
                versions.push(next.value.event.version);
            } else if (next.value.event.type === "snapshot_required") {
                snapshotReasons.push(next.value.event.reason);
            }
        }
        expect({entryKinds, versions, snapshotReasons}).toEqual({
            entryKinds: ["test.sessionGeneration.first"],
            versions: [1],
            snapshotReasons: ["commit_order"],
        });
        await subscription.return();
    });

    test("Session recreation 超越旧 commit return 时不发布旧 generation 事实", async () => {
        const schema = defineSchema<JsonObject>((value) => {
            if (value === null || typeof value !== "object" || Array.isArray(value)) throw new Error("必须是 object");
            return value;
        });
        const profile = defineProfile({
            manifest: {key: "generation-fence", name: "Generation Fence"},
            initial: schema,
            payload: schema,
            prepare: () => ({systemPrompt: "test", modelConfig: {}}),
        });
        const store = new SwitchableSessionStore(1);
        const events = new SessionEventHub<number>({eventEpoch: "generation-fence"});
        const harness = new NeuroAgentHarness({
            store,
            profiles: new ProfileRegistry().add(profile),
            model: new ScriptedModelRuntime([]),
            events,
        });
        await harness.createSession({
            sessionId: 91,
            profileKey: "generation-fence",
            initial: {},
            hostContext: {},
        });
        const first = await harness.write({
            target: 91,
            expectedVersion: 0,
            cause: "test.generationFence.first",
            operations: [{
                type: "appendEntries",
                entries: [{kind: "test.generationFence.first", payload: {value: 1}}],
            }],
        });
        const baseline = await harness.snapshot(91);
        const subscription = harness.subscribe(91, baseline.cursor);
        const oldCommitGate = store.gateCommit("test.generationFence.oldDelayed");
        const oldCommit = harness.write({
            target: 91,
            expectedVersion: first.session.version,
            cause: "test.generationFence.oldDelayed",
            operations: [{
                type: "appendEntries",
                entries: [{kind: "test.generationFence.oldDelayed", payload: {value: 2}}],
            }],
        });
        await oldCommitGate.committed.promise;

        store.reset(1);
        const createGate = store.gateCreate();
        const replacement = harness.createSession({
            sessionId: 91,
            profileKey: "generation-fence",
            initial: {},
            hostContext: {},
        });
        await createGate.created.promise;
        oldCommitGate.release.resolve();
        await oldCommit;
        createGate.release.resolve();
        const replaced = await replacement;
        expect(replaced.session.version).toBe(0);
        expect(replaced.session.entries).toHaveLength(0);
        events.publish({
            sessionId: 91,
            kind: "host",
            event: {type: "host", name: "test.generationFence.sentinel", payload: null},
        });

        const entryKinds: string[] = [];
        const versions: number[] = [];
        const snapshotReasons: string[] = [];
        while (true) {
            const next = await subscription.next();
            expect(next.done).toBe(false);
            if (next.done) break;
            if (next.value.kind === "host" && next.value.event.name === "test.generationFence.sentinel") {
                break;
            }
            if (next.value.kind !== "session") continue;
            if (next.value.event.type === "session_entry") {
                entryKinds.push(next.value.event.entry.kind);
            } else if (next.value.event.type === "session_status") {
                versions.push(next.value.event.version);
            } else if (next.value.event.type === "snapshot_required") {
                snapshotReasons.push(next.value.event.reason);
            }
        }
        expect({entryKinds, versions, snapshotReasons}).toEqual({
            entryKinds: [],
            versions: [],
            snapshotReasons: ["commit_order"],
        });
        await subscription.return();
    });

    test("recreation pending 期间捕获的旧 commit 不冒充新 generation", async () => {
        const schema = defineSchema<JsonObject>((value) => {
            if (value === null || typeof value !== "object" || Array.isArray(value)) throw new Error("必须是 object");
            return value;
        });
        const profile = defineProfile({
            manifest: {key: "pending-generation-fence", name: "Pending Generation Fence"},
            initial: schema,
            payload: schema,
            prepare: () => ({systemPrompt: "test", modelConfig: {}}),
        });
        const store = new SwitchableSessionStore(1);
        const events = new SessionEventHub<number>({eventEpoch: "pending-generation-fence"});
        const harness = new NeuroAgentHarness({
            store,
            profiles: new ProfileRegistry().add(profile),
            model: new ScriptedModelRuntime([]),
            events,
        });
        const created = await harness.createSession({
            sessionId: 96,
            profileKey: "pending-generation-fence",
            initial: {},
            hostContext: {},
        });
        const subscription = harness.subscribe(96, created.cursor);
        const createGate = store.gateBeforeReplacementCreate(1);
        const replacement = harness.createSession({
            sessionId: 96,
            profileKey: "pending-generation-fence",
            initial: {},
            hostContext: {},
        });
        await createGate.started.promise;
        const commitGate = store.gateCommit("test.pendingGenerationFence.old");
        const oldCommit = harness.write({
            target: 96,
            expectedVersion: 0,
            cause: "test.pendingGenerationFence.old",
            operations: [{
                type: "appendEntries",
                entries: [{kind: "test.pendingGenerationFence.old", payload: {value: 1}}],
            }],
        });
        await commitGate.committed.promise;

        createGate.release.resolve();
        const replaced = await replacement;
        expect(replaced.session.version).toBe(0);
        expect(replaced.session.entries).toHaveLength(0);
        commitGate.release.resolve();
        await oldCommit;
        events.publish({
            sessionId: 96,
            kind: "host",
            event: {type: "host", name: "test.pendingGenerationFence.sentinel", payload: null},
        });

        const entryKinds: string[] = [];
        const versions: number[] = [];
        const snapshotReasons: string[] = [];
        while (true) {
            const next = await subscription.next();
            expect(next.done).toBe(false);
            if (next.done) break;
            if (next.value.kind === "host" && next.value.event.name === "test.pendingGenerationFence.sentinel") {
                break;
            }
            if (next.value.kind !== "session") continue;
            if (next.value.event.type === "session_entry") {
                entryKinds.push(next.value.event.entry.kind);
            } else if (next.value.event.type === "session_status") {
                versions.push(next.value.event.version);
            } else if (next.value.event.type === "snapshot_required") {
                snapshotReasons.push(next.value.event.reason);
            }
        }
        expect({entryKinds, versions, snapshotReasons}).toEqual({
            entryKinds: [],
            versions: [],
            snapshotReasons: ["commit_order"],
        });
        await subscription.return();
    });

    test("失败的 Session recreation fence 不会永久污染原 generation", async () => {
        const schema = defineSchema<JsonObject>((value) => {
            if (value === null || typeof value !== "object" || Array.isArray(value)) throw new Error("必须是 object");
            return value;
        });
        const profile = defineProfile({
            manifest: {key: "failed-generation-fence", name: "Failed Generation Fence"},
            initial: schema,
            payload: schema,
            prepare: () => ({systemPrompt: "test", modelConfig: {}}),
        });
        const store = new GatedRejectedCreateStore({now: () => 1});
        const events = new SessionEventHub<number>({eventEpoch: "failed-generation-fence"});
        const harness = new NeuroAgentHarness({
            store,
            profiles: new ProfileRegistry().add(profile),
            model: new ScriptedModelRuntime([]),
            events,
        });
        const created = await harness.createSession({
            sessionId: 101,
            profileKey: "failed-generation-fence",
            initial: {},
            hostContext: {},
        });
        const subscription = harness.subscribe(101, created.cursor);
        const createGate = store.gateNextCreate();
        const rejectedCreate = harness.createSession({
            sessionId: 101,
            profileKey: "failed-generation-fence",
            initial: {},
            hostContext: {},
        });
        void rejectedCreate.catch(() => undefined);
        await createGate.started.promise;
        await harness.write({
            target: 101,
            expectedVersion: 0,
            cause: "test.failedGenerationFence.during",
            operations: [{
                type: "appendEntries",
                entries: [{kind: "test.failedGenerationFence.during", payload: {value: 1}}],
            }],
        });
        await expect(subscription.next()).resolves.toMatchObject({
            done: false,
            value: {
                kind: "session",
                event: {type: "snapshot_required", reason: "commit_order"},
            },
        });
        await subscription.return();
        createGate.release.resolve();
        await expect(rejectedCreate).rejects.toThrow();

        const recovered = await harness.snapshot(101);
        expect(recovered.session.version).toBe(1);
        expect(recovered.session.entries.map((entry) => entry.kind)).toEqual([
            "test.failedGenerationFence.during",
        ]);
        const resumed = harness.subscribe(101, recovered.cursor);
        await harness.write({
            target: 101,
            expectedVersion: recovered.session.version,
            cause: "test.failedGenerationFence.after",
            operations: [{
                type: "appendEntries",
                entries: [{kind: "test.failedGenerationFence.after", payload: {value: 2}}],
            }],
        });
        await expect(resumed.next()).resolves.toMatchObject({
            done: false,
            value: {
                kind: "session",
                event: {
                    type: "session_entry",
                    entry: {kind: "test.failedGenerationFence.after"},
                },
            },
        });
        await expect(resumed.next()).resolves.toMatchObject({
            done: false,
            value: {
                kind: "session",
                event: {type: "session_status", version: 2},
            },
        });
        await resumed.return();
    });

    test("durable batch 序列化失败不发布前缀，并要求 Snapshot 后恢复连续增量", async () => {
        const schema = defineSchema<JsonObject>((value) => {
            if (value === null || typeof value !== "object" || Array.isArray(value)) throw new Error("必须是 object");
            return value;
        });
        const profile = defineProfile({
            manifest: {key: "partial-publication", name: "Partial Publication"},
            initial: schema,
            payload: schema,
            prepare: () => ({systemPrompt: "test", modelConfig: {}}),
        });
        const store = new MalformedPublicationResultStore();
        const events = new SessionEventHub<number>({eventEpoch: "partial-publication"});
        const harness = new NeuroAgentHarness({
            store,
            profiles: new ProfileRegistry().add(profile),
            model: new ScriptedModelRuntime([]),
            events,
        });
        const created = await harness.createSession({
            profileKey: "partial-publication",
            initial: {},
            hostContext: {},
        });
        const sessionId = created.session.metadata.sessionId;
        const subscription = harness.subscribe(sessionId, created.cursor);

        await expect(harness.write({
            target: sessionId,
            expectedVersion: 0,
            cause: "test.partialPublication.invalidBatch",
            operations: [{
                type: "appendEntries",
                entries: [{kind: "test.partialPublication.durable", payload: {value: 1}}],
            }],
        })).rejects.toThrow();

        await expect(subscription.next()).resolves.toMatchObject({
            done: false,
            value: {
                kind: "session",
                event: {type: "snapshot_required", reason: "commit_order"},
            },
        });
        expect(events.latestSeq(sessionId)).toBe(1);
        await subscription.return();

        const recovered = await harness.snapshot(sessionId);
        expect(recovered.session.version).toBe(1);
        expect(recovered.session.entries.map((entry) => entry.kind)).toEqual([
            "test.partialPublication.durable",
        ]);
        const resumed = harness.subscribe(sessionId, recovered.cursor);
        await harness.write({
            target: sessionId,
            expectedVersion: recovered.session.version,
            cause: "test.partialPublication.afterRecovery",
            operations: [{
                type: "appendEntries",
                entries: [{kind: "test.partialPublication.afterRecovery", payload: {value: 2}}],
            }],
        });
        await expect(resumed.next()).resolves.toMatchObject({
            done: false,
            value: {
                kind: "session",
                event: {
                    type: "session_entry",
                    entry: {kind: "test.partialPublication.afterRecovery"},
                },
            },
        });
        await expect(resumed.next()).resolves.toMatchObject({
            done: false,
            value: {
                kind: "session",
                event: {type: "session_status", version: 2},
            },
        });
        await resumed.return();
    });

    test("commit 失败时不发布未持久化的 session_entry", async () => {
        const schema = defineSchema<JsonObject>((value) => {
            if (value === null || typeof value !== "object" || Array.isArray(value)) throw new Error("必须是 object");
            return value;
        });
        const profile = defineProfile({
            manifest: {key: "failure", name: "Failure"},
            initial: schema,
            payload: schema,
            prepare: () => ({systemPrompt: "test", modelConfig: {}}),
        });
        const harness = new NeuroAgentHarness({
            store: new FailingTranscriptStore(),
            profiles: new ProfileRegistry().add(profile),
            model: new ScriptedModelRuntime([{
                message: {role: "assistant", content: [{type: "text", text: "not durable"}], timestamp: 1},
            }]),
        });
        const created = await harness.createSession({profileKey: "failure", initial: {}, hostContext: {}});
        const subscription = harness.subscribe(created.session.metadata.sessionId, created.cursor);
        const result = await (await harness.invoke({sessionId: created.session.metadata.sessionId, payload: {}})).result();
        expect(result.status).toBe("failed");

        const events: HarnessEvent<number>[] = [];
        const iterator = subscription[Symbol.asyncIterator]();
        while (true) {
            const item = await iterator.next();
            if (item.done) break;
            events.push(item.value);
            if (item.value.kind === "runtime" && item.value.event.type === "agent_end") break;
        }
        await subscription.close();
        expect(events.some((event) => event.kind === "session" && event.event.type === "session_entry")).toBe(false);
        expect(events.some((event) => event.kind === "session" && event.event.type === "session_status" && event.event.status === "idle")).toBe(true);
        const snapshot = await harness.snapshot(created.session.metadata.sessionId);
        expect(snapshot.session.entries).toHaveLength(0);
        expect(snapshot.session.invocations[0]?.status).toBe("failed");
    });
});
