import {describe, expect, test} from "bun:test";
import {
    NeuroAgentHarness,
    ProfileRegistry,
    SessionEventHub,
    defineSchema,
    defineTool,
    type JsonObject,
} from "../src/index.js";
import {MemorySessionStore} from "../src/storage/memory.js";
import {ScriptedModelRuntime} from "../src/testing/index.js";

const objectSchema = defineSchema<JsonObject>((value) => {
    if (value === null || typeof value !== "object" || Array.isArray(value)) {
        throw new Error("必须是 object");
    }
    return value;
});

function profilePayloadSchema(parsedBy: string) {
    return defineSchema<JsonObject>({
        parse(value) {
            const parsed = objectSchema.parse(value);
            if (typeof parsed.prompt !== "string") {
                throw new Error("prompt 必须是 string");
            }
            return {
                prompt: parsed.prompt,
                parsedBy,
            };
        },
        validateParsed(value) {
            const parsed = objectSchema.parse(value);
            if (typeof parsed.prompt !== "string" || typeof parsed.parsedBy !== "string") {
                throw new Error("parsed payload 无效");
            }
            return parsed;
        },
    });
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

describe("Active Profile steer admission", () => {
    test("Registry replacement 不改变 running attempt 的 steer payload parser", async () => {
        let markStarted!: () => void;
        let releaseFirstTurn!: () => void;
        const firstTurnStarted = new Promise<void>((resolve) => {
            markStarted = resolve;
        });
        const firstTurnGate = new Promise<void>((resolve) => {
            releaseFirstTurn = resolve;
        });
        let versionOnePrepares = 0;
        let versionTwoPrepares = 0;
        let secondTurn: {systemPrompt: string; steerContent: string | undefined} | undefined;
        const registry = new ProfileRegistry();
        registry.define({
            manifest: {key: "active-profile-steer", name: "Active Profile Steer", version: 1},
            initial: objectSchema,
            payload: profilePayloadSchema("v1"),
            prepare: () => {
                versionOnePrepares += 1;
                return {
                    systemPrompt: "system-v1",
                    modelConfig: {},
                    limits: {maxTurns: 3},
                };
            },
        });
        const model = new ScriptedModelRuntime([
            async () => {
                markStarted();
                await firstTurnGate;
                return assistant("first", 1);
            },
            (request) => {
                const steerMessage = request.messages.find((message) =>
                    message.role === "user" && typeof message.content === "string" && message.content.includes("<user_steer>"));
                secondTurn = {
                    systemPrompt: request.systemPrompt,
                    steerContent: steerMessage?.role === "user" && typeof steerMessage.content === "string" ? steerMessage.content : undefined,
                };
                return assistant("second", 2);
            },
        ]);
        const harness = new NeuroAgentHarness({
            store: new MemorySessionStore(),
            profiles: registry,
            model,
        });

        try {
            const session = await harness.createSession({
                profileKey: "active-profile-steer",
                initial: {},
                hostContext: {},
            });
            const sessionId = session.session.metadata.sessionId;
            const active = await harness.invoke({
                sessionId,
                payload: {prompt: "start"},
            });
            await firstTurnStarted;

            registry.replace({
                manifest: {key: "active-profile-steer", name: "Active Profile Steer", version: 2},
                initial: objectSchema,
                payload: profilePayloadSchema("v2"),
                prepare: () => {
                    versionTwoPrepares += 1;
                    return {
                        systemPrompt: "system-v2",
                        modelConfig: {},
                        limits: {maxTurns: 3},
                    };
                },
            });
            const queued = await harness.steer(sessionId, {prompt: "change"});
            releaseFirstTurn();
            const result = await active.result();

            expect({
                queuedPayload: queued.payload,
                resultStatus: result.status,
                secondTurn,
                versionOnePrepares,
                versionTwoPrepares,
            }).toEqual({
                queuedPayload: {
                    prompt: "change",
                    parsedBy: "v1",
                },
                resultStatus: "completed",
                secondTurn: {
                    systemPrompt: "system-v1",
                    steerContent: '<user_steer>\n{"prompt":"change","parsedBy":"v1"}\n</user_steer>',
                },
                versionOnePrepares: 1,
                versionTwoPrepares: 0,
            });
        } finally {
            releaseFirstTurn();
            await harness.dispose();
        }
    });

    test("same-version replacement parser 拒绝输入时，running attempt 仍按已捕获 parser 接受 steer", async () => {
        let markStarted!: () => void;
        let releaseFirstTurn!: () => void;
        const firstTurnStarted = new Promise<void>((resolve) => {
            markStarted = resolve;
        });
        const firstTurnGate = new Promise<void>((resolve) => {
            releaseFirstTurn = resolve;
        });
        let providerSteer: {systemPrompt: string; content: string | undefined} | undefined;
        const registry = new ProfileRegistry();
        registry.define({
            manifest: {key: "active-profile-steer-reject", name: "Active Profile Steer Reject", version: 1},
            initial: objectSchema,
            payload: profilePayloadSchema("v1"),
            prepare: () => ({
                systemPrompt: "system-v1",
                modelConfig: {},
                limits: {maxTurns: 3},
            }),
        });
        const model = new ScriptedModelRuntime([
            async () => {
                markStarted();
                await firstTurnGate;
                return assistant("first", 1);
            },
            (request) => {
                const steerMessage = request.messages.find((message) =>
                    message.role === "user" && typeof message.content === "string" && message.content.includes("<user_steer>"));
                providerSteer = {
                    systemPrompt: request.systemPrompt,
                    content: steerMessage?.role === "user" && typeof steerMessage.content === "string" ? steerMessage.content : undefined,
                };
                return assistant("second", 2);
            },
        ]);
        const harness = new NeuroAgentHarness({
            store: new MemorySessionStore(),
            profiles: registry,
            model,
        });

        try {
            const session = await harness.createSession({
                profileKey: "active-profile-steer-reject",
                initial: {},
                hostContext: {},
            });
            const sessionId = session.session.metadata.sessionId;
            const active = await harness.invoke({
                sessionId,
                payload: {prompt: "start"},
            });
            await firstTurnStarted;

            registry.replace({
                manifest: {key: "active-profile-steer-reject", name: "Active Profile Steer Reject", version: 1},
                initial: objectSchema,
                payload: defineSchema<JsonObject>(() => {
                    throw new Error("replacement parser 不接受 active steer");
                }),
                prepare: () => ({
                    systemPrompt: "system-v2",
                    modelConfig: {},
                }),
            });
            const steerOutcome = await harness.steer(sessionId, {prompt: "change"}).then(
                (queued) => ({status: "fulfilled" as const, queued}),
                (error: unknown) => ({status: "rejected" as const, error}),
            );
            releaseFirstTurn();
            const result = await active.result();

            expect({
                steerStatus: steerOutcome.status,
                queuedPayload: steerOutcome.status === "fulfilled" ? steerOutcome.queued.payload : undefined,
                resultStatus: result.status,
                modelCalls: model.requests.length,
                providerSteer,
            }).toEqual({
                steerStatus: "fulfilled",
                queuedPayload: {
                    prompt: "change",
                    parsedBy: "v1",
                },
                resultStatus: "completed",
                modelCalls: 2,
                providerSteer: {
                    systemPrompt: "system-v1",
                    content: '<user_steer>\n{"prompt":"change","parsedBy":"v1"}\n</user_steer>',
                },
            });
        } finally {
            releaseFirstTurn();
            await harness.dispose();
        }
    });

    test("approval resume 建立的 running attempt 使用 resume admission 捕获的 steer parser", async () => {
        let markResumedTurnStarted!: () => void;
        let releaseResumedTurn!: () => void;
        const resumedTurnStarted = new Promise<void>((resolve) => {
            markResumedTurnStarted = resolve;
        });
        const resumedTurnGate = new Promise<void>((resolve) => {
            releaseResumedTurn = resolve;
        });
        let finalSteer: {systemPrompt: string; content: string | undefined} | undefined;
        const approvalTool = defineTool({
            name: "resume-gate",
            description: "wait for approval",
            parameters: objectSchema,
            approval: {
                request: () => ({prompt: "允许恢复？"}),
            },
            execute: () => ({content: "approved"}),
        });
        const registry = new ProfileRegistry();
        registry.define({
            manifest: {key: "resumed-profile-steer", name: "Resumed Profile Steer", version: 1},
            initial: objectSchema,
            payload: profilePayloadSchema("start-v1"),
            prepare: () => ({
                systemPrompt: "system-start-v1",
                modelConfig: {},
                limits: {maxTurns: 4},
                tools: [approvalTool],
            }),
        });
        const model = new ScriptedModelRuntime([
            {
                message: {
                    role: "assistant",
                    content: [{
                        type: "toolCall",
                        call: {
                            id: "resume-gate-1",
                            name: "resume-gate",
                            arguments: {},
                        },
                    }],
                    timestamp: 1,
                },
            },
            async () => {
                markResumedTurnStarted();
                await resumedTurnGate;
                return assistant("after approval", 2);
            },
            (request) => {
                const steerMessage = request.messages.find((message) =>
                    message.role === "user" && typeof message.content === "string" && message.content.includes("<user_steer>"));
                finalSteer = {
                    systemPrompt: request.systemPrompt,
                    content: steerMessage?.role === "user" && typeof steerMessage.content === "string" ? steerMessage.content : undefined,
                };
                return assistant("after steer", 3);
            },
        ]);
        const harness = new NeuroAgentHarness({
            store: new MemorySessionStore(),
            profiles: registry,
            model,
        });

        try {
            const session = await harness.createSession({
                profileKey: "resumed-profile-steer",
                initial: {},
                hostContext: {},
            });
            const sessionId = session.session.metadata.sessionId;
            const waiting = await harness.invoke({
                sessionId,
                payload: {prompt: "start"},
            });
            const waitingResult = await waiting.result();
            registry.replace({
                manifest: {key: "resumed-profile-steer", name: "Resumed Profile Steer", version: 1},
                initial: objectSchema,
                payload: profilePayloadSchema("resume-v1"),
                prepare: () => ({
                    systemPrompt: "system-resume-v1",
                    modelConfig: {},
                    limits: {maxTurns: 4},
                    tools: [approvalTool],
                }),
            });
            const resumed = await harness.resume(sessionId, waiting.invocationId, [{
                toolCallId: "resume-gate-1",
                approved: true,
            }]);
            await resumedTurnStarted;

            registry.replace({
                manifest: {key: "resumed-profile-steer", name: "Resumed Profile Steer", version: 2},
                initial: objectSchema,
                payload: profilePayloadSchema("v2"),
                prepare: () => ({
                    systemPrompt: "system-v2",
                    modelConfig: {},
                }),
            });
            const queued = await harness.steer(sessionId, {prompt: "change after resume"});
            releaseResumedTurn();
            const result = await resumed.result();

            expect({
                waitingStatus: waitingResult.status,
                queuedPayload: queued.payload,
                resultStatus: result.status,
                finalSteer,
                modelCalls: model.requests.length,
            }).toEqual({
                waitingStatus: "waiting",
                queuedPayload: {
                    prompt: "change after resume",
                    parsedBy: "resume-v1",
                },
                resultStatus: "completed",
                finalSteer: {
                    systemPrompt: "system-resume-v1",
                    content: '<user_steer>\n{"prompt":"change after resume","parsedBy":"resume-v1"}\n</user_steer>',
                },
                modelCalls: 3,
            });
        } finally {
            releaseResumedTurn();
            await harness.dispose();
        }
    });

    test("captured active parser 拒绝 steer 时不写 queue、事件或 durable message", async () => {
        let markStarted!: () => void;
        let releaseFirstTurn!: () => void;
        const firstTurnStarted = new Promise<void>((resolve) => {
            markStarted = resolve;
        });
        const firstTurnGate = new Promise<void>((resolve) => {
            releaseFirstTurn = resolve;
        });
        const rejectingPayloadSchema = defineSchema<JsonObject>((value) => {
            const parsed = objectSchema.parse(value);
            if (parsed.prompt === "reject") {
                throw new Error("active parser 拒绝 steer");
            }
            return parsed;
        });
        const registry = new ProfileRegistry();
        registry.define({
            manifest: {key: "active-parser-reject", name: "Active Parser Reject", version: 1},
            initial: objectSchema,
            payload: rejectingPayloadSchema,
            prepare: () => ({
                systemPrompt: "active parser reject",
                modelConfig: {},
                limits: {maxTurns: 3},
            }),
        });
        const events = new SessionEventHub<number>();
        const model = new ScriptedModelRuntime([
            async () => {
                markStarted();
                await firstTurnGate;
                return assistant("first", 1);
            },
            () => assistant("unexpected second", 2),
        ]);
        const harness = new NeuroAgentHarness({
            store: new MemorySessionStore(),
            profiles: registry,
            events,
            model,
        });
        let subscription: ReturnType<SessionEventHub<number>["subscribe"]> | undefined;

        try {
            const session = await harness.createSession({
                profileKey: "active-parser-reject",
                initial: {},
                hostContext: {},
            });
            const sessionId = session.session.metadata.sessionId;
            subscription = events.subscribe(sessionId, session.cursor);
            const active = await harness.invoke({
                sessionId,
                payload: {prompt: "start"},
            });
            await firstTurnStarted;

            const steerOutcome = await harness.steer(sessionId, {prompt: "reject"}).then(
                (queued) => ({status: "fulfilled" as const, queued}),
                (error: unknown) => ({status: "rejected" as const, error}),
            );
            const sentinel = events.publish({
                sessionId,
                kind: "host",
                event: {
                    type: "host",
                    name: "test.active-profile-steer.reject.sentinel",
                    payload: null,
                },
            });
            const sessionEvents: string[] = [];
            const iterator = subscription[Symbol.asyncIterator]();
            let lastSeq = 0;
            while (lastSeq < sentinel.seq) {
                const next = await iterator.next();
                if (next.done) {
                    break;
                }
                lastSeq = next.value.seq;
                if (next.value.kind === "session") {
                    sessionEvents.push(next.value.event.type);
                }
            }
            releaseFirstTurn();
            const result = await active.result();
            const snapshot = await harness.snapshot(sessionId);

            expect({
                steerStatus: steerOutcome.status,
                errorMessage: steerOutcome.status === "rejected" && steerOutcome.error instanceof Error
                    ? steerOutcome.error.message
                    : undefined,
                publishedSteer: sessionEvents.includes("steer_queued"),
                durableSteer: snapshot.session.entries.some((entry) =>
                    entry.kind === "agent.message" && JSON.stringify(entry.payload).includes("<user_steer>")),
                resultStatus: result.status,
                modelCalls: model.requests.length,
            }).toEqual({
                steerStatus: "rejected",
                errorMessage: "active parser 拒绝 steer",
                publishedSteer: false,
                durableSteer: false,
                resultStatus: "completed",
                modelCalls: 1,
            });
        } finally {
            releaseFirstTurn();
            await subscription?.close();
            await harness.dispose();
            events.close();
        }
    });
});
