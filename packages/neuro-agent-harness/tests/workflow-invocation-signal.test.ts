import {describe, expect, spyOn, test} from "bun:test";
import {
    NeuroAgentHarness,
    ProfileRegistry,
    SessionEventHub,
    defineCapability,
    defineProfile,
    defineSchema,
    defineTool,
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

function profile(key: string) {
    return defineProfile({
        manifest: {key, name: key},
        initial: objectSchema,
        payload: objectSchema,
        prepare: () => ({systemPrompt: key, modelConfig: {}}),
    });
}

function completed(text: string, timestamp = 1) {
    return {
        message: {
            role: "assistant" as const,
            content: [{type: "text" as const, text}],
            timestamp,
        },
    };
}

class DelayedStartStore extends MemorySessionStore<number, JsonObject> {
    private markStartCommitEntered!: () => void;
    private releaseStartCommit!: () => void;
    readonly startCommitEntered = new Promise<void>((resolve) => {
        this.markStartCommitEntered = resolve;
    });
    private readonly startCommitReleased = new Promise<void>((resolve) => {
        this.releaseStartCommit = resolve;
    });

    constructor(private readonly failAfterRelease = false) {
        super();
    }

    release(): void {
        this.releaseStartCommit();
    }

    override async commit(plan: SessionWritePlan<number, JsonObject>): Promise<SessionCommitResult<number, JsonObject>> {
        if (plan.cause === "harness.invocation.start") {
            this.markStartCommitEntered();
            await this.startCommitReleased;
            if (this.failAfterRelease) {
                throw new Error("start commit unavailable");
            }
        }
        return await super.commit(plan);
    }
}

describe("Workflow parent signal", () => {
    test("already-aborted signal rejects before creating a durable Invocation", async () => {
        const store = new MemorySessionStore<number, JsonObject>();
        const model = new ScriptedModelRuntime([completed("must not run")]);
        const harness = new NeuroAgentHarness({
            store,
            profiles: new ProfileRegistry().add(profile("signal-before-start")),
            model,
        });
        const created = await harness.createSession({profileKey: "signal-before-start", initial: {}, hostContext: {}});
        const controller = new AbortController();
        controller.abort(new Error("workflow cancelled before start"));

        await expect(harness.invoke({
            sessionId: created.session.metadata.sessionId,
            payload: {},
            signal: controller.signal,
        })).rejects.toThrow("workflow cancelled before start");

        const snapshot = await store.read(created.session.metadata.sessionId);
        expect(snapshot.invocations).toHaveLength(0);
        expect(model.requests).toHaveLength(0);
        await harness.dispose();
    });

    test("signal aborted during start commit enters bounded abort after the durable start", async () => {
        const admissionCapability = defineCapability<"admission", object>("admission");
        let capabilityOpens = 0;
        const store = new DelayedStartStore();
        const model = new ScriptedModelRuntime([completed("must not complete")]);
        const harness = new NeuroAgentHarness({
            abortGraceMs: 100,
            store,
            profiles: new ProfileRegistry().add(defineProfile({
                manifest: {key: "signal-during-start", name: "signal-during-start"},
                initial: objectSchema,
                payload: objectSchema,
                requiredCapabilities: [admissionCapability],
                prepare: () => ({systemPrompt: "signal-during-start", modelConfig: {}}),
            })),
            model,
            capabilities: [{
                capability: admissionCapability,
                open: () => {
                    capabilityOpens += 1;
                    return {};
                },
            }],
        });
        const created = await harness.createSession({profileKey: "signal-during-start", initial: {}, hostContext: {}});
        const controller = new AbortController();
        const handlePromise = harness.invokeAt({
            sessionId: created.session.metadata.sessionId,
            payload: {},
            signal: controller.signal,
            anchor: {
                version: created.session.version,
                activeLeafId: created.session.activeLeafId,
            },
        });

        await store.startCommitEntered;
        controller.abort();
        store.release();
        const handle = await handlePromise;
        const result = await handle.result();
        const snapshot = await store.read(created.session.metadata.sessionId);

        expect(result.status).toBe("aborted");
        expect(result.persistence).toBe("confirmed");
        expect(snapshot.invocations[0]?.status).toBe("aborted");
        expect(snapshot.invocations[0]).not.toHaveProperty("signal");
        expect(capabilityOpens).toBe(0);
        expect(model.requests).toHaveLength(0);
        await harness.dispose();
    });

    test("start commit failure remains the error when its in-flight signal also aborts", async () => {
        const store = new DelayedStartStore(true);
        const model = new ScriptedModelRuntime([completed("must not run")]);
        const harness = new NeuroAgentHarness({
            store,
            profiles: new ProfileRegistry().add(profile("signal-start-failure")),
            model,
        });
        const created = await harness.createSession({profileKey: "signal-start-failure", initial: {}, hostContext: {}});
        const controller = new AbortController();
        const handlePromise = harness.invoke({
            sessionId: created.session.metadata.sessionId,
            payload: {},
            signal: controller.signal,
        });

        await store.startCommitEntered;
        controller.abort();
        store.release();

        await expect(handlePromise).rejects.toThrow("start commit unavailable");
        expect((await store.read(created.session.metadata.sessionId)).invocations).toHaveLength(0);
        expect(model.requests).toHaveLength(0);
        await harness.dispose();
    });

    test("signal aborted during an active Model turn reuses the Invocation abort boundary", async () => {
        const controller = new AbortController();
        let markStarted!: () => void;
        const started = new Promise<void>((resolve) => {
            markStarted = resolve;
        });
        const store = new MemorySessionStore<number, JsonObject>();
        const model = new ScriptedModelRuntime([
            async (request) => {
                markStarted();
                await new Promise<void>((resolve) => {
                    controller.signal.addEventListener("abort", () => resolve(), {once: true});
                });
                if (request.signal.aborted) {
                    throw request.signal.reason;
                }
                return completed("signal was ignored");
            },
        ]);
        const harness = new NeuroAgentHarness({
            abortGraceMs: 100,
            store,
            profiles: new ProfileRegistry().add(profile("signal-active-model")),
            model,
        });
        const created = await harness.createSession({profileKey: "signal-active-model", initial: {}, hostContext: {}});
        const handle = await harness.invoke({
            sessionId: created.session.metadata.sessionId,
            payload: {},
            signal: controller.signal,
        });
        await started;
        controller.abort();

        const result = await handle.result();
        const snapshot = await store.read(created.session.metadata.sessionId);
        expect(result.status).toBe("aborted");
        expect(result.persistence).toBe("confirmed");
        expect(snapshot.entries.map((entry) => JSON.stringify(entry.payload)).join("\n"))
            .not.toContain("signal was ignored");
        await harness.dispose();
    });

    test("settled handle removes its external abort listener", async () => {
        const controller = new AbortController();
        const addListener = spyOn(controller.signal, "addEventListener");
        const removeListener = spyOn(controller.signal, "removeEventListener");
        const harness = new NeuroAgentHarness({
            store: new MemorySessionStore<number, JsonObject>(),
            profiles: new ProfileRegistry().add(profile("signal-listener-cleanup")),
            model: new ScriptedModelRuntime([completed("done")]),
        });
        const created = await harness.createSession({profileKey: "signal-listener-cleanup", initial: {}, hostContext: {}});
        const result = await (await harness.invoke({
            sessionId: created.session.metadata.sessionId,
            payload: {},
            signal: controller.signal,
        })).result();

        expect(result.status).toBe("completed");
        expect(addListener).toHaveBeenCalledWith("abort", expect.any(Function), {once: true});
        expect(removeListener).toHaveBeenCalledWith("abort", expect.any(Function));
        await harness.dispose();
    });

    test("signal aborted during durable waiting reuses the waiting abort boundary", async () => {
        const approvalTool = defineTool({
            name: "approval-signal",
            description: "approval signal",
            parameters: objectSchema,
            approval: {request: () => ({prompt: "approve"})},
            execute: () => ({content: "approved"}),
        });
        const waitingProfile = defineProfile({
            manifest: {key: "signal-waiting-abort", name: "Signal Waiting Abort"},
            initial: objectSchema,
            payload: objectSchema,
            prepare: () => ({systemPrompt: "waiting", modelConfig: {}, tools: [approvalTool]}),
        });
        const events = new SessionEventHub<number>();
        const harness = new NeuroAgentHarness({
            abortGraceMs: 0,
            store: new MemorySessionStore(),
            profiles: new ProfileRegistry<number>().add(waitingProfile),
            model: new ScriptedModelRuntime([{
                message: {
                    role: "assistant",
                    content: [{type: "toolCall", call: {id: "approval-signal-1", name: "approval-signal", arguments: {}}}],
                    timestamp: 1,
                },
            }]),
            events,
        });
        const created = await harness.createSession({profileKey: "signal-waiting-abort", initial: {}, hostContext: {}});
        const subscription = harness.subscribe(created.session.metadata.sessionId, created.cursor);
        const terminalStatuses: string[] = [];
        let markApprovalArrived!: () => void;
        const approvalArrived = new Promise<void>((resolve) => {
            markApprovalArrived = resolve;
        });
        const controller = new AbortController();
        const handlePromise = harness.invoke({
            sessionId: created.session.metadata.sessionId,
            payload: {},
            signal: controller.signal,
        });
        const collector = (async () => {
            for await (const event of subscription) {
                if (event.kind === "runtime" && event.event.type === "approval_required") {
                    markApprovalArrived();
                }
                if (event.kind === "runtime" && event.event.type === "agent_end") {
                    terminalStatuses.push(event.event.status);
                }
            }
        })();
        await approvalArrived;
        controller.abort();
        const handle = await handlePromise;
        const result = await handle.result();
        await subscription.close();
        await collector;
        const snapshot = await harness.snapshot(created.session.metadata.sessionId);

        expect(result.status).toBe("aborted");
        expect(terminalStatuses).toEqual(["waiting", "aborted"]);
        expect(snapshot.session.status).toBe("idle");
        expect(snapshot.session.activeInvocationId).toBeNull();
        expect(snapshot.session.invocations[0]?.status).toBe("aborted");
        await harness.dispose();
    });

    test("signal after settled waiting is not persisted; durable cancel stays with harness.abort", async () => {
        const approvalTool = defineTool({
            name: "approval-settled-signal",
            description: "approval settled signal",
            parameters: objectSchema,
            approval: {request: () => ({prompt: "approve"})},
            execute: () => ({content: "approved"}),
        });
        const waitingProfile = defineProfile({
            manifest: {key: "signal-settled-waiting", name: "Signal Settled Waiting"},
            initial: objectSchema,
            payload: objectSchema,
            prepare: () => ({systemPrompt: "waiting", modelConfig: {}, tools: [approvalTool]}),
        });
        const harness = new NeuroAgentHarness({
            store: new MemorySessionStore(),
            profiles: new ProfileRegistry().add(waitingProfile),
            model: new ScriptedModelRuntime([{
                message: {
                    role: "assistant",
                    content: [{type: "toolCall", call: {id: "approval-settled-1", name: "approval-settled-signal", arguments: {}}}],
                    timestamp: 1,
                },
            }]),
        });
        const created = await harness.createSession({profileKey: "signal-settled-waiting", initial: {}, hostContext: {}});
        const controller = new AbortController();
        const handle = await harness.invoke({
            sessionId: created.session.metadata.sessionId,
            payload: {},
            signal: controller.signal,
        });
        expect((await handle.result()).status).toBe("waiting");

        controller.abort();
        await new Promise<void>((resolve) => setTimeout(resolve, 0));
        let snapshot = await harness.snapshot(created.session.metadata.sessionId);
        expect(snapshot.session.status).toBe("waiting");
        expect(snapshot.session.invocations[0]?.status).toBe("waiting");
        expect(snapshot.session.activeInvocationId).not.toBeNull();

        await harness.abort(created.session.metadata.sessionId);
        snapshot = await harness.snapshot(created.session.metadata.sessionId);
        expect(snapshot.session.status).toBe("idle");
        expect(snapshot.session.activeInvocationId).toBeNull();
        expect(snapshot.session.invocations[0]?.status).toBe("aborted");
        await harness.dispose();
    });
});
