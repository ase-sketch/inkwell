import {describe, expect, test} from "bun:test";
import {
    CommitWorkflowScheduler,
    NeuroAgentHarness,
    ProfileRegistry,
    defineSchema,
    type JsonObject,
    type SessionCommitNotification,
} from "../src/index.js";
import {MemorySessionStore} from "../src/storage/memory.js";
import {ScriptedModelRuntime} from "../src/testing/index.js";

const schema = defineSchema<JsonObject>((value) => {
    if (value === null || typeof value !== "object" || Array.isArray(value)) throw new Error("必须是 object");
    return value;
});

function notification(version = 1): SessionCommitNotification {
    const snapshot = {
        metadata: {
            sessionId: 1,
            profileKey: "workflow",
            initial: {},
            hostContext: {},
            createdAt: 1,
        },
        version,
        status: "idle" as const,
        activeLeafId: null,
        activeInvocationId: null,
        entries: [],
        invocations: [],
    };
    return {
        plan: {
            target: 1,
            expectedVersion: version - 1,
            cause: "test.workflow.commit",
            operations: [],
        },
        result: {
            snapshot,
            entries: [],
        },
    };
}

function bounded<T>(promise: Promise<T>, label: string, timeoutMs = 300): Promise<T> {
    return new Promise<T>((resolve, reject) => {
        const timeout = setTimeout(() => reject(new Error(`${label} 未在 ${timeoutMs}ms 内完成`)), timeoutMs);
        promise.then(
            (value) => {
                clearTimeout(timeout);
                resolve(value);
            },
            (error: unknown) => {
                clearTimeout(timeout);
                reject(error);
            },
        );
    });
}

function deferred<T = void>(): {
    readonly promise: Promise<T>;
    readonly resolve: (value: T) => void;
    readonly reject: (error: unknown) => void;
} {
    let resolve!: (value: T) => void;
    let reject!: (error: unknown) => void;
    const promise = new Promise<T>((resolvePromise, rejectPromise) => {
        resolve = resolvePromise;
        reject = rejectPromise;
    });
    return {promise, resolve, reject};
}

describe("CommitWorkflowScheduler", () => {
    test("abortGraceMs 接受 0 并拒绝负数或非有限值", async () => {
        const definition = {
            name: "validation",
            select: () => null,
            async run() {},
        };

        expect(() => new CommitWorkflowScheduler(definition, {abortGraceMs: -1})).toThrow("abortGraceMs 必须是非负有限数");
        expect(() => new CommitWorkflowScheduler(definition, {abortGraceMs: Number.NaN})).toThrow("abortGraceMs 必须是非负有限数");
        expect(() => new CommitWorkflowScheduler(definition, {abortGraceMs: Number.POSITIVE_INFINITY}))
            .toThrow("abortGraceMs 必须是非负有限数");
        await new CommitWorkflowScheduler(definition, {abortGraceMs: 0}).dispose();
    });

    test("dispose 在 run 忽略 AbortSignal 时仍有界完成", async () => {
        let observedAbort = false;
        const scheduler = new CommitWorkflowScheduler<JsonObject>({
            name: "non-cooperative",
            select: () => ({key: "session-1", payload: {}}),
            async run(_job, signal) {
                signal.addEventListener("abort", () => {
                    observedAbort = true;
                }, {once: true});
                await new Promise<void>(() => undefined);
            },
        });

        scheduler.afterCommit(notification());
        await Promise.resolve();
        await bounded(scheduler.dispose(), "bounded scheduler dispose");

        expect(observedAbort).toBe(true);
    });

    test("dispose 在 grace 内等待合作式 run，重复调用共享同一 Promise", async () => {
        const started = deferred();
        const release = deferred();
        const scheduler = new CommitWorkflowScheduler<JsonObject>({
            name: "cooperative",
            select: () => ({key: "session-1", payload: {}}),
            async run() {
                started.resolve();
                await release.promise;
            },
        }, {abortGraceMs: 200});

        scheduler.afterCommit(notification());
        await started.promise;
        const first = scheduler.dispose();
        const second = scheduler.dispose();
        expect(first).toBe(second);
        let disposed = false;
        void first.then(() => {
            disposed = true;
        });
        await Promise.resolve();
        expect(disposed).toBe(false);

        release.resolve();
        await bounded(first, "cooperative scheduler dispose");
        expect(disposed).toBe(true);
    });

    test("run abort listener 重入 dispose 时仍共享首次 shutdown Promise", async () => {
        const started = deferred();
        let reentrantDispose: Promise<void> | undefined;
        let scheduler!: CommitWorkflowScheduler<JsonObject>;
        scheduler = new CommitWorkflowScheduler<JsonObject>({
            name: "reentrant-abort-listener",
            select: () => ({key: "session-1", payload: {}}),
            async run(_job, signal) {
                signal.addEventListener("abort", () => {
                    reentrantDispose = scheduler.dispose();
                }, {once: true});
                started.resolve();
                await new Promise<void>(() => undefined);
            },
        }, {abortGraceMs: 0});

        scheduler.afterCommit(notification());
        await started.promise;
        const first = scheduler.dispose();

        expect(reentrantDispose).toBe(first);
        await bounded(first, "reentrant abort-listener dispose", 100);
    });

    test("dispose 丢弃 dirty rerun，迟到 resolve 不会重新启动", async () => {
        const started = deferred();
        const release = deferred();
        let runs = 0;
        const scheduler = new CommitWorkflowScheduler<JsonObject>({
            name: "drop-dirty",
            select: (commit) => ({key: "session-1", payload: {version: commit.result.snapshot.version}}),
            async run() {
                runs += 1;
                started.resolve();
                await release.promise;
            },
        }, {abortGraceMs: 0});

        scheduler.afterCommit(notification(1));
        await started.promise;
        scheduler.afterCommit(notification(2));
        await bounded(scheduler.dispose(), "zero-grace scheduler dispose", 100);
        expect(runs).toBe(1);

        release.resolve();
        await new Promise<void>((resolve) => setTimeout(resolve, 0));
        expect(runs).toBe(1);
    });

    test("forced boundary 观察迟到 run rejection，且不再调用 onError", async () => {
        const started = deferred();
        const lateRun = deferred();
        let errors = 0;
        const scheduler = new CommitWorkflowScheduler<JsonObject>({
            name: "late-rejection",
            select: () => ({key: "session-1", payload: {}}),
            async run() {
                started.resolve();
                await lateRun.promise;
            },
            onError() {
                errors += 1;
            },
        }, {abortGraceMs: 0});

        scheduler.afterCommit(notification());
        await started.promise;
        await bounded(scheduler.dispose(), "late-rejection scheduler dispose", 100);
        lateRun.reject(new Error("late failure"));
        await new Promise<void>((resolve) => setTimeout(resolve, 0));

        expect(errors).toBe(0);
    });

    test("dispose 在 onError 不合作时仍有界，并观察迟到 rejection", async () => {
        const onErrorStarted = deferred();
        const lateOnError = deferred();
        const scheduler = new CommitWorkflowScheduler<JsonObject>({
            name: "non-cooperative-on-error",
            select: () => ({key: "session-1", payload: {}}),
            async run() {
                throw new Error("run failed");
            },
            async onError() {
                onErrorStarted.resolve();
                await lateOnError.promise;
            },
        }, {abortGraceMs: 20});

        scheduler.afterCommit(notification());
        await onErrorStarted.promise;
        await bounded(scheduler.dispose(), "onError scheduler dispose", 100);
        lateOnError.reject(new Error("late onError failure"));
        await new Promise<void>((resolve) => setTimeout(resolve, 0));
    });

    test("正常 run failure 调用一次 onError，且不破坏 drain", async () => {
        const errors: Error[] = [];
        const scheduler = new CommitWorkflowScheduler<JsonObject>({
            name: "normal-error",
            select: () => ({key: "session-1", payload: {}}),
            async run() {
                throw new Error("run failed");
            },
            onError(_job, error) {
                errors.push(error);
            },
        });

        scheduler.afterCommit(notification());
        await scheduler.drain();

        expect(errors.map((error) => error.message)).toEqual(["run failed"]);
    });

    test("dispose 后不再 select，select 内 reentrant dispose 也不能入队", async () => {
        let selects = 0;
        let runs = 0;
        const disposed = new CommitWorkflowScheduler<JsonObject>({
            name: "already-disposed",
            select: () => {
                selects += 1;
                return {key: "session-1", payload: {}};
            },
            async run() {
                runs += 1;
            },
        }, {abortGraceMs: 0});
        const first = disposed.dispose();
        expect(disposed.dispose()).toBe(first);
        await first;
        disposed.afterCommit(notification());
        expect(selects).toBe(0);
        expect(runs).toBe(0);

        let reentrant!: CommitWorkflowScheduler<JsonObject>;
        reentrant = new CommitWorkflowScheduler<JsonObject>({
            name: "reentrant-dispose",
            select: () => {
                selects += 1;
                void reentrant.dispose();
                return {key: "session-1", payload: {}};
            },
            async run() {
                runs += 1;
            },
        }, {abortGraceMs: 0});
        reentrant.afterCommit(notification());
        await reentrant.dispose();
        expect(selects).toBe(1);
        expect(runs).toBe(0);
    });

    test("commit observer 非阻塞，同 key 在 running 期间合并成一次 dirty rerun", async () => {
        let release!: () => void;
        const gate = new Promise<void>((resolve) => { release = resolve; });
        const versions: number[] = [];
        const scheduler = new CommitWorkflowScheduler<{version: number}>({
            name: "summarizer",
            select(notification) {
                return notification.plan.cause === "harness.transcript.commit"
                    ? {key: String(notification.plan.target), payload: {version: notification.result.snapshot.version}}
                    : null;
            },
            async run(job) {
                versions.push(job.payload.version);
                if (versions.length === 1) await gate;
            },
        });
        const profiles = new ProfileRegistry();
        profiles.define({manifest: {key: "workflow", name: "Workflow"}, initial: schema, payload: schema, prepare: () => ({systemPrompt: "x", modelConfig: {}})});
        const harness = new NeuroAgentHarness({
            store: new MemorySessionStore(),
            profiles,
            model: new ScriptedModelRuntime([{message: {role: "assistant", content: [{type: "text", text: "done"}], timestamp: 1}}]),
            commitObservers: [scheduler],
        });
        const session = await harness.createSession({profileKey: "workflow", initial: {}, hostContext: {}});
        const result = await (await harness.invoke({sessionId: session.session.metadata.sessionId, payload: {}})).result();
        expect(result.status).toBe("completed");
        expect(versions).toHaveLength(1);
        release();
        await scheduler.drain();
        expect(versions).toHaveLength(2);
        expect(versions[1]).toBeGreaterThan(versions[0] ?? 0);
    });
});
