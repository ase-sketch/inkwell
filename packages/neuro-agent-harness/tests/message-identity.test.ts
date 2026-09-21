import {afterEach, describe, expect, test} from "bun:test";
import {mkdtemp, rm} from "node:fs/promises";
import {join} from "node:path";
import {tmpdir} from "node:os";
import {
    NeuroAgentHarness,
    ProfileRegistry,
    defineSchema,
    type AgentCallRequest,
    type JsonObject,
} from "../src/index.js";
import {JsonlSessionStore} from "../src/storage/jsonl.js";
import {MemorySessionStore} from "../src/storage/memory.js";
import {ScriptedModelRuntime} from "../src/testing/index.js";

const directories: string[] = [];
afterEach(async () => {
    await Promise.all(directories.splice(0).map((directory) => rm(directory, {recursive: true, force: true})));
});

const objectSchema = defineSchema<JsonObject>((value) => {
    if (value === null || typeof value !== "object" || Array.isArray(value)) {
        throw new Error("必须是 object");
    }
    return value;
});

function profiles(): ProfileRegistry {
    const registry = new ProfileRegistry();
    registry.define({
        manifest: {key: "message-identity", name: "Message identity"},
        initial: objectSchema,
        payload: objectSchema,
        prepare: () => ({systemPrompt: "test", modelConfig: {}}),
    });
    return registry;
}

function assistant(text: string, timestamp = 2) {
    return {
        message: {
            role: "assistant" as const,
            content: [{type: "text" as const, text}],
            timestamp,
        },
    };
}

describe("Caller and durable message identity", () => {
    test("system identity is durable without changing provider-visible user role", async () => {
        const model = new ScriptedModelRuntime([{
            message: {
                role: "assistant",
                content: [{type: "text", text: "done"}],
                timestamp: 2,
            },
        }]);
        const harness = new NeuroAgentHarness({
            store: new MemorySessionStore(),
            profiles: profiles(),
            model,
        });
        const session = await harness.createSession({
            profileKey: "message-identity",
            initial: {},
            hostContext: {},
        });

        const handle = await harness.invoke({
            sessionId: session.session.metadata.sessionId,
            payload: {prompt: "system input"},
            messageIdentity: "system",
        });
        expect((await handle.result()).status).toBe("completed");

        const snapshot = await harness.snapshot(session.session.metadata.sessionId);
        expect(snapshot.session.invocations[0]?.messageIdentity).toBe("system");
        expect(snapshot.session.entries.find((entry) => entry.kind === "agent.message")?.payload).toMatchObject({
            messageIdentity: "system",
        });
        expect(model.requests[0]?.messages[0]).toMatchObject({
            role: "user",
        });
        expect(model.requests[0]?.messages[0]).not.toHaveProperty("messageIdentity");
    });

    test("system follow-up keeps queue caller and identity across JSONL restart and drain", async () => {
        const directory = await mkdtemp(join(tmpdir(), "neuro-harness-message-identity-"));
        directories.push(directory);
        let markStarted!: () => void;
        const started = new Promise<void>((resolve) => {
            markStarted = resolve;
        });
        const firstHarness = new NeuroAgentHarness({
            abortGraceMs: 10,
            store: new JsonlSessionStore({directory}),
            profiles: profiles(),
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
        const session = await firstHarness.createSession({
            profileKey: "message-identity",
            initial: {},
            hostContext: {},
        });
        const sessionId = session.session.metadata.sessionId;
        const first = await firstHarness.invoke({sessionId, payload: {prompt: "first"}});
        await started;

        const queued = await firstHarness.followUp(sessionId, {prompt: "system follow-up"}, {
            caller: {kind: "system", name: "workflow"},
            messageIdentity: "system",
        });
        expect(queued).toMatchObject({
            kind: "followUp",
            caller: {kind: "system", name: "workflow"},
            messageIdentity: "system",
        });
        expect((await firstHarness.followUpState(sessionId)).items[0]).toMatchObject({
            caller: {kind: "system", name: "workflow"},
            messageIdentity: "system",
        });
        await firstHarness.dispose();
        await first.result();

        const resumedModel = new ScriptedModelRuntime([assistant("recovered")]);
        const restoredHarness = new NeuroAgentHarness({
            store: new JsonlSessionStore({directory}),
            profiles: profiles(),
            model: resumedModel,
        });
        try {
            expect((await restoredHarness.followUpState(sessionId)).items[0]).toMatchObject({
                caller: {kind: "system", name: "workflow"},
                messageIdentity: "system",
            });
            const resumed = await restoredHarness.resumeFollowUps(sessionId);
            expect(resumed).not.toBeNull();
            expect((await resumed!.result()).status).toBe("completed");

            const snapshot = await restoredHarness.snapshot(sessionId);
            const invocation = snapshot.session.invocations.at(-1);
            expect(invocation).toMatchObject({
                caller: {kind: "system", name: "workflow"},
                messageIdentity: "system",
            });
            const messageEntry = snapshot.session.entries.find((entry) =>
                entry.kind === "agent.message" && entry.invocationId === invocation?.id
                && entry.payload !== null
                && typeof entry.payload === "object"
                && !Array.isArray(entry.payload)
                && typeof entry.payload.message === "object"
                && entry.payload.message !== null
                && !Array.isArray(entry.payload.message)
                && entry.payload.message.role === "user"
                && typeof entry.payload.message.content === "string"
                && entry.payload.message.content.includes("system follow-up"));
            expect(messageEntry?.payload).toMatchObject({
                messageIdentity: "system",
            });
            const followUpMessage = resumedModel.requests[0]?.messages.find((message) =>
                message.role === "user" && typeof message.content === "string" && message.content.includes("system follow-up"));
            expect(followUpMessage).toMatchObject({role: "user"});
            expect(followUpMessage).not.toHaveProperty("messageIdentity");
        } finally {
            await restoredHarness.dispose();
        }
    });

    test("steer carries caller and identity into the durable next-turn user message", async () => {
        let markStarted!: () => void;
        let release!: () => void;
        const started = new Promise<void>((resolve) => {
            markStarted = resolve;
        });
        const gate = new Promise<void>((resolve) => {
            release = resolve;
        });
        const model = new ScriptedModelRuntime([
            async () => {
                markStarted();
                await gate;
                return assistant("first");
            },
            (request) => {
                const steerMessage = request.messages.find((message) =>
                    message.role === "user" && typeof message.content === "string" && message.content.includes("steered"));
                expect(steerMessage).toMatchObject({role: "user"});
                expect(steerMessage).not.toHaveProperty("messageIdentity");
                return assistant("steer complete", 3);
            },
        ]);
        const harness = new NeuroAgentHarness({
            store: new MemorySessionStore(),
            profiles: profiles(),
            model,
        });
        const session = await harness.createSession({
            profileKey: "message-identity",
            initial: {},
            hostContext: {},
        });
        const sessionId = session.session.metadata.sessionId;
        const handle = await harness.invoke({sessionId, payload: {prompt: "first"}});
        await started;

        const queued = await harness.steer(sessionId, {prompt: "steered"}, {
            caller: {kind: "system", name: "workflow-steer"},
            messageIdentity: "system",
        });
        expect(queued).toMatchObject({
            kind: "steer",
            caller: {kind: "system", name: "workflow-steer"},
            messageIdentity: "system",
        });
        release();
        expect((await handle.result()).status).toBe("completed");

        const snapshot = await harness.snapshot(sessionId);
        const steerEntry = snapshot.session.entries.find((entry) =>
            entry.kind === "agent.message"
            && entry.payload !== null
            && typeof entry.payload === "object"
            && !Array.isArray(entry.payload)
            && typeof entry.payload.message === "object"
            && entry.payload.message !== null
            && !Array.isArray(entry.payload.message)
            && entry.payload.message.role === "user"
            && typeof entry.payload.message.content === "string"
            && entry.payload.message.content.includes("<user_steer>"));
        expect(steerEntry?.payload).toMatchObject({
            messageIdentity: "system",
        });
    });

    test("legacy queue, message and invocation records default missing identity to user", async () => {
        const model = new ScriptedModelRuntime([assistant("legacy queue recovered")]);
        const store = new MemorySessionStore<number, JsonObject>();
        const harness = new NeuroAgentHarness({
            store,
            profiles: profiles(),
            model,
        });
        const session = await harness.createSession({
            profileKey: "message-identity",
            initial: {},
            hostContext: {},
        });
        const sessionId = session.session.metadata.sessionId;
        const started = await harness.write({
            target: sessionId,
            expectedVersion: session.session.version,
            cause: "legacy.invocation.start",
            operations: [{
                type: "startInvocation",
                invocation: {
                    id: "legacy-invocation",
                    sessionId,
                    profileKey: "message-identity",
                    caller: {kind: "system", name: "legacy"},
                    input: {prompt: "legacy invocation"},
                    createdAt: 1,
                },
            }],
        });
        const withMessage = await harness.write({
            target: sessionId,
            expectedVersion: started.session.version,
            expectedActiveInvocationId: "legacy-invocation",
            cause: "legacy.message",
            operations: [{
                type: "appendEntries",
                entries: [{
                    kind: "agent.message",
                    invocationId: "legacy-invocation",
                    payload: {
                        turn: 0,
                        message: {role: "user", content: "legacy input", timestamp: 1},
                    },
                }],
            }],
        });
        // Direct Store injection represents a pre-reservation legacy record; public Harness writes must reject it.
        const withQueue = await store.commit({
            target: sessionId,
            expectedVersion: withMessage.session.version,
            expectedActiveInvocationId: "legacy-invocation",
            cause: "legacy.followUp.queue",
            operations: [{
                type: "appendEntries",
                entries: [{
                    kind: "harness.followUp.queued",
                    payload: {
                        id: "legacy-follow-up",
                        kind: "followUp",
                        payload: {prompt: "legacy follow-up"},
                        createdAt: 1,
                    },
                }],
            }],
        });
        const completed = await harness.write({
            target: sessionId,
            expectedVersion: withQueue.snapshot.version,
            expectedActiveInvocationId: "legacy-invocation",
            cause: "legacy.invocation.finish",
            operations: [{
                type: "finishInvocation",
                invocationId: "legacy-invocation",
                status: "completed",
                turnCount: 1,
                terminationReason: "natural_stop",
            }],
        });

        expect(completed.session.invocations[0]?.messageIdentity).toBe("user");
        expect(completed.session.entries.find((entry) => entry.kind === "agent.message")?.payload).toMatchObject({
            messageIdentity: "user",
        });
        expect((await harness.followUpState(sessionId)).items[0]).toMatchObject({
            messageIdentity: "user",
        });

        const resumed = await harness.resumeFollowUps(sessionId);
        expect(resumed).not.toBeNull();
        expect((await resumed!.result()).status).toBe("completed");
        const snapshot = await harness.snapshot(sessionId);
        expect(snapshot.session.invocations.at(-1)?.messageIdentity).toBe("user");
        expect(model.requests[0]?.messages.every((message) => !("messageIdentity" in message))).toBe(true);
    });

    test("invokeAt and retry preserve explicit identity, while nested AgentCallRequest exposes the same option", async () => {
        const model = new ScriptedModelRuntime([assistant("anchored"), assistant("retried")]);
        const harness = new NeuroAgentHarness({
            store: new MemorySessionStore(),
            profiles: profiles(),
            model,
        });
        const session = await harness.createSession({
            profileKey: "message-identity",
            initial: {},
            hostContext: {},
        });
        const sessionId = session.session.metadata.sessionId;
        const anchor = {
            version: session.session.version,
            activeLeafId: session.session.activeLeafId,
        };
        const first = await harness.invokeAt({
            sessionId,
            payload: {prompt: "anchored input"},
            anchor,
            messageIdentity: "system",
        });
        expect((await first.result()).status).toBe("completed");

        const retry = await harness.retry(sessionId, first.invocationId, {
            caller: {kind: "system", name: "retry"},
            messageIdentity: "system",
        });
        expect((await retry.result()).status).toBe("completed");

        const snapshot = await harness.snapshot(sessionId);
        expect(snapshot.session.invocations.map((invocation) => invocation.messageIdentity)).toEqual(["system", "system"]);
        const nestedRequest: AgentCallRequest<number> = {
            sessionId,
            payload: {prompt: "nested"},
            caller: {kind: "system", name: "workflow"},
            messageIdentity: "system",
        };
        expect(nestedRequest.messageIdentity).toBe("system");
        await harness.dispose();
    });
});
