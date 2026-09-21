import {describe, expect, test} from "bun:test";
import {NeuroAgentHarness, ProfileRegistry, defineSchema, defineTool, type JsonObject} from "../src/index.js";
import {MemorySessionStore} from "../src/storage/memory.js";
import {ScriptedModelRuntime} from "../src/testing/index.js";

const schema = defineSchema<JsonObject>((value) => {
    if (value === null || typeof value !== "object" || Array.isArray(value)) throw new Error("必须是 object");
    return value;
});

describe("SessionCommitObserver", () => {
    test("materialized view 在 durable commit 后同步更新，observer 失败不回滚事实", async () => {
        const observedCauses: string[] = [];
        const observedOwners: Array<string | null | undefined> = [];
        const observerErrors: string[] = [];
        const registry = new ProfileRegistry();
        registry.define({manifest: {key: "observer", name: "Observer"}, initial: schema, payload: schema, prepare: () => ({systemPrompt: "x", modelConfig: {}})});
        const harness = new NeuroAgentHarness({
            store: new MemorySessionStore(),
            profiles: registry,
            model: new ScriptedModelRuntime([{message: {role: "assistant", content: [{type: "text", text: "done"}], timestamp: 1}}]),
            commitObservers: [{
            name: "relation-index",
            afterCommit(notification) {
                observedCauses.push(notification.plan.cause);
                observedOwners.push(notification.plan.expectedActiveInvocationId);
            },
            }, {
                name: "broken-view",
                afterCommit() {
                    throw new Error("view unavailable");
                },
            }],
            onObserverError(name, error) {
                observerErrors.push(`${name}:${error.message}`);
            },
        });
        const session = await harness.createSession({profileKey: "observer", initial: {}, hostContext: {}});
        const result = await (await harness.invoke({sessionId: session.session.metadata.sessionId, payload: {}})).result();
        expect(result.status).toBe("completed");
        expect(observedCauses).toEqual([
            "harness.invocation.start",
            "harness.transcript.commit",
            "harness.transcript.commit",
            "harness.invocation.finish",
        ]);
        const snapshot = await harness.snapshot(session.session.metadata.sessionId);
        const invocationId = snapshot.session.invocations[0]?.id;
        expect(observedOwners[0]).toBeNull();
        expect(observedOwners.slice(1).every((owner) => owner === invocationId)).toBe(true);
        expect(observerErrors).toHaveLength(4);
        expect(snapshot.session.invocations[0]?.status).toBe("completed");
    });

    test("无 shutdown 时 public write 仍等待 async observer", async () => {
        let observerStartedResolve!: () => void;
        const observerStarted = new Promise<void>((resolve) => {
            observerStartedResolve = resolve;
        });
        let observerRelease!: () => void;
        const observerGate = new Promise<void>((resolve) => {
            observerRelease = resolve;
        });
        const registry = new ProfileRegistry();
        registry.define({manifest: {key: "async-observer", name: "Async Observer"}, initial: schema, payload: schema, prepare: () => ({systemPrompt: "x", modelConfig: {}})});
        const harness = new NeuroAgentHarness({
            store: new MemorySessionStore(),
            profiles: registry,
            model: new ScriptedModelRuntime([]),
            commitObservers: [{
                name: "async-view",
                afterCommit(notification) {
                    if (notification.plan.cause !== "test.async-observer") return;
                    observerStartedResolve();
                    return observerGate;
                },
            }],
        });
        const created = await harness.createSession({profileKey: "async-observer", initial: {}, hostContext: {}});
        const writing = harness.write({
            target: created.session.metadata.sessionId,
            expectedVersion: created.session.version,
            cause: "test.async-observer",
            operations: [{
                type: "appendEntries",
                entries: [{kind: "test.async-observer", payload: {value: 1}}],
            }],
        });
        await observerStarted;
        let settled = false;
        void writing.then(() => {
            settled = true;
        });
        await Promise.resolve();
        expect(settled).toBe(false);

        observerRelease();
        const written = await writing;
        expect(written.session.entries.some((entry) => entry.kind === "test.async-observer")).toBe(true);
        expect(settled).toBe(true);
        await harness.dispose();
    });
    test("approval claim 后 observer 重入 abort 不得放行 Tool", async () => {
        let executions = 0;
        let harness!: NeuroAgentHarness;
        let sessionId!: number;
        let abortPromise: Promise<void> | undefined;
        const tool = defineTool({
            name: "reentrant_approval_tool",
            description: "reentrant approval tool",
            parameters: schema,
            approval: {request: () => ({prompt: "approve?"})},
            execute() {
                executions += 1;
                return {content: "executed"};
            },
        });
        const registry = new ProfileRegistry();
        registry.define({
            manifest: {key: "reentrant-approval", name: "Reentrant Approval"},
            initial: schema,
            payload: schema,
            prepare: () => ({systemPrompt: "x", modelConfig: {}, tools: [tool]}),
        });
        harness = new NeuroAgentHarness({
            store: new MemorySessionStore(),
            profiles: registry,
            model: new ScriptedModelRuntime([
                {message: {role: "assistant", content: [{type: "toolCall", call: {id: "approval-1", name: "reentrant_approval_tool", arguments: {}}}], timestamp: 1}},
                {message: {role: "assistant", content: [{type: "text", text: "done"}], timestamp: 2}},
            ]),
            commitObservers: [{
                name: "reentrant-abort",
                afterCommit(notification) {
                    if (notification.plan.cause === "harness.invocation.resumeApproval.admit") {
                        abortPromise = harness.abort(sessionId);
                    }
                },
            }],
        });
        const created = await harness.createSession({profileKey: "reentrant-approval", initial: {}, hostContext: {}});
        sessionId = created.session.metadata.sessionId;
        const waiting = await harness.invoke({sessionId, payload: {}});
        expect((await waiting.result()).status).toBe("waiting");

        const resumed = await harness.resume(sessionId, waiting.invocationId, [{toolCallId: "approval-1", approved: true}]);
        expect(abortPromise).toBeDefined();
        await abortPromise;
        const result = await resumed.result();
        const snapshot = await harness.snapshot(sessionId);
        expect(result.status).toBe("aborted");
        expect(executions).toBe(0);
        expect(snapshot.session.invocations[0]?.status).toBe("aborted");
        expect(snapshot.session.entries.some((entry) => {
            if (entry.kind !== "agent.message" || entry.payload === null || typeof entry.payload !== "object" || Array.isArray(entry.payload)) {
                return false;
            }
            const message = entry.payload.message;
            return message !== null
                && typeof message === "object"
                && !Array.isArray(message)
                && message.role === "toolResult";
        })).toBe(false);
        await harness.dispose();
    });
});
