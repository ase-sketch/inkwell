import {describe, expect, test} from "bun:test";
import {mkdtemp, rm} from "node:fs/promises";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {
    NeuroAgentHarness,
    ProfileRegistry,
    SchemaCanonicalValueError,
    defineSchema,
    defineSessionEntryCodec,
    defineTool,
    parseSchemaValue,
    type JsonObject,
    type JsonValue,
    type ResolvedProfile,
    type SessionEntry,
    type SessionSnapshot,
    type ValueSchema,
} from "../src/index.js";
import {JsonlSessionStore} from "../src/storage/jsonl.js";
import {MemorySessionStore} from "../src/storage/memory.js";
import {ScriptedModelRuntime} from "../src/testing/index.js";

interface ParsedInitial extends JsonObject {
    readonly revision: number;
    readonly decodedBy: "initial";
}

interface ParsedPayload extends JsonObject {
    readonly value: number;
    readonly decodedBy: "payload";
}

interface ParsedEntryPayload extends JsonObject {
    readonly value: number;
    readonly decodedBy?: "entry";
}

interface ReceiverAwareSchema extends ValueSchema<ParsedPayload> {
    readonly increment: number;
}

interface ParsedOutput extends JsonObject {
    readonly text: string;
    readonly decodedBy: "output";
}

interface ParsedToolArguments extends JsonObject {
    readonly value: number;
    readonly decodedBy: "tool";
}

const initialSchema: ValueSchema<ParsedInitial> = {
    parse(value: JsonValue): ParsedInitial {
        if (value === null || typeof value !== "object" || Array.isArray(value) || typeof value.revision !== "number") {
            throw new Error("initial revision 必须是 number");
        }
        return {revision: value.revision + 1, decodedBy: "initial"};
    },
    validateParsed(value: JsonValue): ParsedInitial {
        if (
            value === null
            || typeof value !== "object"
            || Array.isArray(value)
            || typeof value.revision !== "number"
            || value.decodedBy !== "initial"
        ) {
            throw new Error("parsed initial 无效");
        }
        return value as ParsedInitial;
    },
};

const payloadSchema: ValueSchema<ParsedPayload> = {
    parse(value: JsonValue): ParsedPayload {
        if (value === null || typeof value !== "object" || Array.isArray(value) || typeof value.value !== "number") {
            throw new Error("payload value 必须是 number");
        }
        return {value: value.value + 1, decodedBy: "payload"};
    },
    validateParsed(value: JsonValue): ParsedPayload {
        if (
            value === null
            || typeof value !== "object"
            || Array.isArray(value)
            || typeof value.value !== "number"
            || value.decodedBy !== "payload"
        ) {
            throw new Error("parsed payload 无效");
        }
        return value as ParsedPayload;
    },
};

const objectSchema = defineSchema<JsonObject>((value) => {
    if (value === null || typeof value !== "object" || Array.isArray(value)) {
        throw new Error("必须是 object");
    }
    return value;
});

function assistant(text: string, timestamp: number) {
    return {
        message: {
            role: "assistant" as const,
            content: [{type: "text" as const, text}],
            timestamp,
        },
    };
}

function deferred() {
    let resolve!: () => void;
    const promise = new Promise<void>((resolvePromise) => {
        resolve = resolvePromise;
    });
    return {promise, resolve};
}

class CorruptingReadStore extends MemorySessionStore<number, JsonObject> {
    private corruptNextRead = false;

    corruptNextInvocationInput(): void {
        this.corruptNextRead = true;
    }

    readActual(sessionId: number): Promise<SessionSnapshot<number, JsonObject>> {
        return super.read(sessionId);
    }

    override async read(sessionId: number): Promise<SessionSnapshot<number, JsonObject>> {
        const snapshot = await super.read(sessionId);
        if (!this.corruptNextRead) return snapshot;
        this.corruptNextRead = false;
        return {
            ...snapshot,
            invocations: snapshot.invocations.map((invocation) => ({
                ...invocation,
                input: {value: "corrupt", decodedBy: "payload"},
            })),
        };
    }
}

class LegacyResolvedProfileRegistry extends ProfileRegistry<number, JsonObject, JsonObject> {
    constructor(private readonly legacyProfile: ResolvedProfile<number, JsonObject, JsonObject>) {
        super();
    }

    override resolve(): ResolvedProfile<number, JsonObject, JsonObject> {
        return this.legacyProfile;
    }
}

describe("canonical schema value admission", () => {
    test("direct invoke 只解析一次 raw initial/payload，并在 durable、prepare 与 provider 复用 Parsed Value", async () => {
        const preparedInitials: JsonValue[] = [];
        const preparedPayloads: JsonValue[] = [];
        const profiles = new ProfileRegistry();
        profiles.define({
            manifest: {key: "canonical-direct", name: "Canonical Direct"},
            initial: initialSchema,
            payload: payloadSchema,
            prepare: (context) => {
                preparedInitials.push(context.initial);
                preparedPayloads.push(context.payload);
                return {systemPrompt: "canonical", modelConfig: {}};
            },
        });
        const model = new ScriptedModelRuntime([assistant("done", 1)]);
        const harness = new NeuroAgentHarness({
            store: new MemorySessionStore(),
            profiles,
            model,
        });

        try {
            const created = await harness.createSession({
                profileKey: "canonical-direct",
                initial: {revision: 10},
                hostContext: {},
            });
            const handle = await harness.invoke({
                sessionId: created.session.metadata.sessionId,
                payload: {value: 20},
            });
            expect((await handle.result()).status).toBe("completed");

            const snapshot = await harness.snapshot(created.session.metadata.sessionId);
            const providerUserMessage = model.requests[0]?.messages.findLast((message) => message.role === "user");
            expect({
                durableInitial: snapshot.session.metadata.initial,
                durableInput: snapshot.session.invocations[0]?.input,
                preparedInitials,
                preparedPayloads,
                providerUserContent: providerUserMessage?.content,
            }).toEqual({
                durableInitial: {revision: 11, decodedBy: "initial"},
                durableInput: {value: 21, decodedBy: "payload"},
                preparedInitials: [{revision: 11, decodedBy: "initial"}],
                preparedPayloads: [{value: 21, decodedBy: "payload"}],
                providerUserContent: "{\"value\":21,\"decodedBy\":\"payload\"}",
            });
        } finally {
            await harness.dispose();
        }
    });

    test("durable follow-up consume 后保持 queue 已接受的 Parsed Value", async () => {
        const firstTurnStarted = deferred();
        const releaseFirstTurn = deferred();
        const preparedPayloads: JsonValue[] = [];
        const profiles = new ProfileRegistry();
        profiles.define({
            manifest: {key: "canonical-follow-up", name: "Canonical Follow-up"},
            initial: initialSchema,
            payload: payloadSchema,
            prepare: (context) => {
                preparedPayloads.push(context.payload);
                return {systemPrompt: "canonical", modelConfig: {}};
            },
        });
        const model = new ScriptedModelRuntime([
            async () => {
                firstTurnStarted.resolve();
                await releaseFirstTurn.promise;
                return assistant("first done", 1);
            },
            assistant("follow-up done", 2),
        ]);
        const harness = new NeuroAgentHarness({
            store: new MemorySessionStore(),
            profiles,
            model,
        });

        try {
            const created = await harness.createSession({
                profileKey: "canonical-follow-up",
                initial: {revision: 1},
                hostContext: {},
            });
            const sessionId = created.session.metadata.sessionId;
            await harness.pauseFollowUps(sessionId);
            const first = await harness.invoke({sessionId, payload: {value: 10}});
            await firstTurnStarted.promise;

            const queued = await harness.followUp(sessionId, {value: 40});
            const queuedState = await harness.followUpState(sessionId);
            releaseFirstTurn.resolve();
            expect((await first.result()).status).toBe("completed");

            const followUp = await harness.resumeFollowUps(sessionId);
            expect(followUp).not.toBeNull();
            expect((await followUp!.result()).status).toBe("completed");

            const snapshot = await harness.snapshot(sessionId);
            const secondProviderUser = model.requests[1]?.messages.findLast((message) => message.role === "user");
            expect({
                returnedQueuePayload: queued.payload,
                projectedQueuePayload: queuedState.items[0]?.payload,
                invocationInputs: snapshot.session.invocations.map((invocation) => invocation.input),
                preparedPayloads,
                secondProviderUserContent: secondProviderUser?.content,
                remainingQueue: (await harness.followUpState(sessionId)).items,
            }).toEqual({
                returnedQueuePayload: {value: 41, decodedBy: "payload"},
                projectedQueuePayload: {value: 41, decodedBy: "payload"},
                invocationInputs: [
                    {value: 11, decodedBy: "payload"},
                    {value: 41, decodedBy: "payload"},
                ],
                preparedPayloads: [
                    {value: 11, decodedBy: "payload"},
                    {value: 41, decodedBy: "payload"},
                ],
                secondProviderUserContent: "{\"value\":41,\"decodedBy\":\"payload\"}",
                remainingQueue: [],
            });
        } finally {
            releaseFirstTurn.resolve();
            await harness.dispose();
        }
    });

    test("retry 创建新 Invocation 时复用 prior durable Parsed Value", async () => {
        const preparedPayloads: JsonValue[] = [];
        const profiles = new ProfileRegistry();
        profiles.define({
            manifest: {key: "canonical-retry", name: "Canonical Retry"},
            initial: initialSchema,
            payload: payloadSchema,
            prepare: (context) => {
                preparedPayloads.push(context.payload);
                return {systemPrompt: "canonical", modelConfig: {}};
            },
        });
        const model = new ScriptedModelRuntime([
            assistant("first done", 1),
            assistant("retry done", 2),
        ]);
        const harness = new NeuroAgentHarness({
            store: new MemorySessionStore(),
            profiles,
            model,
        });

        try {
            const created = await harness.createSession({
                profileKey: "canonical-retry",
                initial: {revision: 1},
                hostContext: {},
            });
            const sessionId = created.session.metadata.sessionId;
            const first = await harness.invoke({sessionId, payload: {value: 50}});
            expect((await first.result()).status).toBe("completed");

            const retried = await harness.retry(sessionId, first.invocationId);
            expect((await retried.result()).status).toBe("completed");

            const snapshot = await harness.snapshot(sessionId);
            expect({
                inputs: snapshot.session.invocations.map((invocation) => invocation.input),
                retryOf: snapshot.session.invocations[1]?.retryOf,
                preparedPayloads,
                providerUserContents: model.requests.map((request) => {
                    return request.messages.findLast((message) => message.role === "user")?.content;
                }),
            }).toEqual({
                inputs: [
                    {value: 51, decodedBy: "payload"},
                    {value: 51, decodedBy: "payload"},
                ],
                retryOf: first.invocationId,
                preparedPayloads: [
                    {value: 51, decodedBy: "payload"},
                    {value: 51, decodedBy: "payload"},
                ],
                providerUserContents: [
                    "{\"value\":51,\"decodedBy\":\"payload\"}",
                    "{\"value\":51,\"decodedBy\":\"payload\"}",
                ],
            });
        } finally {
            await harness.dispose();
        }
    });

    test("approval resume 在 durable claim 与副作用前拒绝损坏的 Parsed Value", async () => {
        let toolExecutions = 0;
        const approvalTool = defineTool({
            name: "canonical_approval",
            description: "canonical approval",
            parameters: objectSchema,
            approval: {request: () => ({prompt: "approve?"})},
            execute: () => {
                toolExecutions += 1;
                return {content: "executed"};
            },
        });
        const profiles = new ProfileRegistry();
        profiles.define({
            manifest: {key: "canonical-approval", name: "Canonical Approval"},
            initial: initialSchema,
            payload: payloadSchema,
            prepare: () => ({
                systemPrompt: "canonical",
                modelConfig: {},
                tools: [approvalTool],
            }),
        });
        const store = new CorruptingReadStore();
        const model = new ScriptedModelRuntime([{
            message: {
                role: "assistant",
                content: [{
                    type: "toolCall",
                    call: {id: "canonical-approval-1", name: "canonical_approval", arguments: {}},
                }],
                timestamp: 1,
            },
        }]);
        const harness = new NeuroAgentHarness({store, profiles, model});

        try {
            const created = await harness.createSession({
                profileKey: "canonical-approval",
                initial: {revision: 1},
                hostContext: {},
            });
            const sessionId = created.session.metadata.sessionId;
            const waiting = await harness.invoke({sessionId, payload: {value: 70}});
            expect((await waiting.result()).status).toBe("waiting");

            store.corruptNextInvocationInput();
            const outcome = await harness.resume(sessionId, waiting.invocationId, [{
                toolCallId: "canonical-approval-1",
                approved: true,
            }]).then(
                async (handle) => ({kind: "accepted" as const, result: await handle.result()}),
                (error: unknown) => ({kind: "rejected" as const, error}),
            );
            const actual = await store.readActual(sessionId);
            const invocation = actual.invocations.find((item) => item.id === waiting.invocationId);

            expect({
                kind: outcome.kind,
                error: outcome.kind === "rejected" && outcome.error instanceof Error ? outcome.error.message : undefined,
                resultStatus: outcome.kind === "accepted" ? outcome.result.status : undefined,
                sessionStatus: actual.status,
                activeInvocationId: actual.activeInvocationId,
                invocationStatus: invocation?.status,
                toolExecutions,
                modelRequests: model.requests.length,
            }).toEqual({
                kind: "rejected",
                error: "parsed payload 无效",
                resultStatus: undefined,
                sessionStatus: "waiting",
                activeInvocationId: waiting.invocationId,
                invocationStatus: "waiting",
                toolExecutions: 0,
                modelRequests: 1,
            });
        } finally {
            await harness.dispose();
        }
    });

    test("SessionEntryCodec projection 只验证 draft 已保存的 Parsed Value", () => {
        const codec = defineSessionEntryCodec("canonical.entry", {
            parse(value: JsonValue): ParsedEntryPayload {
                if (value === null || typeof value !== "object" || Array.isArray(value) || typeof value.value !== "number") {
                    throw new Error("entry value 必须是 number");
                }
                return {value: value.value + 1, decodedBy: "entry"};
            },
            validateParsed(value: JsonValue): ParsedEntryPayload {
                if (
                    value === null
                    || typeof value !== "object"
                    || Array.isArray(value)
                    || typeof value.value !== "number"
                    || value.decodedBy !== "entry"
                ) {
                    throw new Error("parsed entry 无效");
                }
                return value as ParsedEntryPayload;
            },
        });

        const draft = codec.draft({value: 5});
        const entry: SessionEntry = {
            ...draft,
            id: "canonical-entry-1",
            parentId: null,
            timestamp: 1,
        };

        expect({
            durablePayload: draft.payload,
            projectedPayload: codec.parse(entry),
        }).toEqual({
            durablePayload: {value: 6, decodedBy: "entry"},
            projectedPayload: {value: 6, decodedBy: "entry"},
        });
    });

    test("defineSchema object form 为非幂等 decoder 显式提供 Parsed Value validator", () => {
        const schema = defineSchema<ParsedPayload>({
            jsonSchema: {
                type: "object",
                properties: {value: {type: "number"}},
                required: ["value"],
            },
            parse(value: JsonValue): ParsedPayload {
                if (value === null || typeof value !== "object" || Array.isArray(value) || typeof value.value !== "number") {
                    throw new Error("payload value 必须是 number");
                }
                return {value: value.value + 1, decodedBy: "payload"};
            },
            validateParsed(value: JsonValue): ParsedPayload {
                if (
                    value === null
                    || typeof value !== "object"
                    || Array.isArray(value)
                    || typeof value.value !== "number"
                    || value.decodedBy !== "payload"
                ) {
                    throw new Error("parsed payload 无效");
                }
                return value as ParsedPayload;
            },
        });

        expect({
            parsed: parseSchemaValue(schema, {value: 80}),
            jsonSchema: schema.jsonSchema,
        }).toEqual({
            parsed: {value: 81, decodedBy: "payload"},
            jsonSchema: {
                type: "object",
                properties: {value: {type: "number"}},
                required: ["value"],
            },
        });
    });

    test("无 validateParsed 的不稳定 parser 在 Invocation durable mutation 前 fail closed", async () => {
        let prepares = 0;
        const unstableSchema = defineSchema<ParsedEntryPayload>((value) => {
            if (value === null || typeof value !== "object" || Array.isArray(value) || typeof value.value !== "number") {
                throw new Error("value 必须是 number");
            }
            return {value: value.value + 1, decodedBy: "entry"};
        });
        const profiles = new ProfileRegistry();
        profiles.define({
            manifest: {key: "unstable-fallback", name: "Unstable Fallback"},
            initial: objectSchema,
            payload: unstableSchema,
            prepare: () => {
                prepares += 1;
                return {systemPrompt: "must not prepare", modelConfig: {}};
            },
        });
        const model = new ScriptedModelRuntime([]);
        const harness = new NeuroAgentHarness({
            store: new MemorySessionStore(),
            profiles,
            model,
        });

        try {
            const created = await harness.createSession({
                profileKey: "unstable-fallback",
                initial: {},
                hostContext: {},
            });
            const sessionId = created.session.metadata.sessionId;
            const before = await harness.snapshot(sessionId);
            const outcome = await harness.invoke({sessionId, payload: {value: 1}}).then(
                () => ({kind: "accepted" as const}),
                (error: unknown) => ({kind: "rejected" as const, error}),
            );
            const after = await harness.snapshot(sessionId);

            expect({
                kind: outcome.kind,
                canonicalError: outcome.kind === "rejected" && outcome.error instanceof SchemaCanonicalValueError,
                versionBefore: before.session.version,
                versionAfter: after.session.version,
                activeInvocationId: after.session.activeInvocationId,
                invocations: after.session.invocations,
                prepares,
                modelRequests: model.requests.length,
            }).toEqual({
                kind: "rejected",
                canonicalError: true,
                versionBefore: 0,
                versionAfter: 0,
                activeInvocationId: null,
                invocations: [],
                prepares: 0,
                modelRequests: 0,
            });
        } finally {
            await harness.dispose();
        }
    });

    test("JSONL restart 后 follow-up 仍消费 durable Parsed Value，不重新 decode", async () => {
        const directory = await mkdtemp(join(tmpdir(), "neuro-harness-canonical-schema-"));
        const firstTurnStarted = deferred();
        const releaseFirstTurn = deferred();
        const preparedPayloads: JsonValue[] = [];
        const profiles = new ProfileRegistry();
        profiles.define({
            manifest: {key: "canonical-jsonl", name: "Canonical JSONL"},
            initial: initialSchema,
            payload: payloadSchema,
            prepare: (context) => {
                preparedPayloads.push(context.payload);
                return {systemPrompt: "canonical", modelConfig: {}};
            },
        });
        const firstHarness = new NeuroAgentHarness({
            store: new JsonlSessionStore<JsonObject>({directory}),
            profiles,
            model: new ScriptedModelRuntime([async () => {
                firstTurnStarted.resolve();
                await releaseFirstTurn.promise;
                return assistant("first done", 1);
            }]),
        });
        let restoredHarness: NeuroAgentHarness<number, JsonObject> | undefined;

        try {
            const created = await firstHarness.createSession({
                profileKey: "canonical-jsonl",
                initial: {revision: 1},
                hostContext: {},
            });
            const sessionId = created.session.metadata.sessionId;
            await firstHarness.pauseFollowUps(sessionId);
            const first = await firstHarness.invoke({sessionId, payload: {value: 10}});
            await firstTurnStarted.promise;
            const queued = await firstHarness.followUp(sessionId, {value: 90});
            releaseFirstTurn.resolve();
            expect((await first.result()).status).toBe("completed");
            await firstHarness.dispose();

            const restoredModel = new ScriptedModelRuntime([assistant("restored follow-up", 2)]);
            restoredHarness = new NeuroAgentHarness({
                store: new JsonlSessionStore<JsonObject>({directory}),
                profiles,
                model: restoredModel,
            });
            const restoredQueue = await restoredHarness.followUpState(sessionId);
            const resumed = await restoredHarness.resumeFollowUps(sessionId);
            expect(resumed).not.toBeNull();
            expect((await resumed!.result()).status).toBe("completed");
            const restored = await restoredHarness.snapshot(sessionId);
            const providerUser = restoredModel.requests[0]?.messages.findLast((message) => message.role === "user");

            expect({
                returnedQueuePayload: queued.payload,
                restoredQueuePayload: restoredQueue.items[0]?.payload,
                invocationInputs: restored.session.invocations.map((invocation) => invocation.input),
                preparedPayloads,
                providerUserContent: providerUser?.content,
                remainingQueue: (await restoredHarness.followUpState(sessionId)).items,
            }).toEqual({
                returnedQueuePayload: {value: 91, decodedBy: "payload"},
                restoredQueuePayload: {value: 91, decodedBy: "payload"},
                invocationInputs: [
                    {value: 11, decodedBy: "payload"},
                    {value: 91, decodedBy: "payload"},
                ],
                preparedPayloads: [
                    {value: 11, decodedBy: "payload"},
                    {value: 91, decodedBy: "payload"},
                ],
                providerUserContent: "{\"value\":91,\"decodedBy\":\"payload\"}",
                remainingQueue: [],
            });
        } finally {
            releaseFirstTurn.resolve();
            await Promise.allSettled([
                firstHarness.dispose(),
                restoredHarness?.dispose() ?? Promise.resolve(),
            ]);
            await rm(directory, {recursive: true, force: true});
        }
    });

    test("普通 invoke 在 durable start 前验证 current Profile 是否接受 Session initial", async () => {
        let replacementPrepares = 0;
        const profiles = new ProfileRegistry();
        profiles.define({
            manifest: {key: "canonical-initial-replacement", name: "Canonical Initial v1", version: 1},
            initial: initialSchema,
            payload: payloadSchema,
            prepare: () => ({systemPrompt: "v1", modelConfig: {}}),
        });
        const model = new ScriptedModelRuntime([
            assistant("recovered after compatible replacement", 1),
        ]);
        const harness = new NeuroAgentHarness({
            store: new MemorySessionStore(),
            profiles,
            model,
        });

        try {
            const created = await harness.createSession({
                profileKey: "canonical-initial-replacement",
                initial: {revision: 1},
                hostContext: {},
            });
            const sessionId = created.session.metadata.sessionId;
            const before = await harness.snapshot(sessionId);
            profiles.replace({
                manifest: {key: "canonical-initial-replacement", name: "Canonical Initial v2", version: 2},
                initial: {
                    parse: initialSchema.parse,
                    validateParsed: () => {
                        throw new Error("current Profile 不接受 durable initial");
                    },
                },
                payload: payloadSchema,
                prepare: () => {
                    replacementPrepares += 1;
                    return {systemPrompt: "v2", modelConfig: {}};
                },
            });

            const outcome = await harness.invoke({sessionId, payload: {value: 1}}).then(
                async (handle) => ({kind: "accepted" as const, result: await handle.result()}),
                (error: unknown) => ({kind: "rejected" as const, error}),
            );
            const after = await harness.snapshot(sessionId);
            expect({
                kind: outcome.kind,
                error: outcome.kind === "rejected" && outcome.error instanceof Error ? outcome.error.message : undefined,
                resultStatus: outcome.kind === "accepted" ? outcome.result.status : undefined,
                versionBefore: before.session.version,
                versionAfter: after.session.version,
                activeInvocationId: after.session.activeInvocationId,
                invocations: after.session.invocations,
                replacementPrepares,
                modelRequests: model.requests.length,
            }).toEqual({
                kind: "rejected",
                error: "current Profile 不接受 durable initial",
                resultStatus: undefined,
                versionBefore: 0,
                versionAfter: 0,
                activeInvocationId: null,
                invocations: [],
                replacementPrepares: 0,
                modelRequests: 0,
            });

            profiles.replace({
                manifest: {key: "canonical-initial-replacement", name: "Canonical Initial v3", version: 3},
                initial: initialSchema,
                payload: payloadSchema,
                prepare: () => {
                    replacementPrepares += 1;
                    return {systemPrompt: "v3", modelConfig: {}};
                },
            });
            const recovered = await harness.invoke({sessionId, payload: {value: 2}});
            expect({
                status: (await recovered.result()).status,
                replacementPrepares,
                modelRequests: model.requests.length,
            }).toEqual({
                status: "completed",
                replacementPrepares: 1,
                modelRequests: 1,
            });
        } finally {
            await harness.dispose();
        }
    });

    test("Tool dispatch 在执行副作用前拒绝不稳定的 arguments parser", async () => {
        let toolExecutions = 0;
        const unstableArguments = defineSchema<ParsedEntryPayload>((value) => {
            if (value === null || typeof value !== "object" || Array.isArray(value) || typeof value.value !== "number") {
                throw new Error("Tool value 必须是 number");
            }
            return {value: value.value + 1, decodedBy: "entry"};
        });
        const tool = defineTool({
            name: "unstable_arguments",
            description: "unstable arguments",
            parameters: unstableArguments,
            execute: () => {
                toolExecutions += 1;
                return {content: "executed"};
            },
        });
        const profiles = new ProfileRegistry();
        profiles.define({
            manifest: {key: "canonical-tool", name: "Canonical Tool"},
            initial: objectSchema,
            payload: objectSchema,
            prepare: () => ({
                systemPrompt: "canonical",
                modelConfig: {},
                tools: [tool],
            }),
        });
        const model = new ScriptedModelRuntime([
            {
                message: {
                    role: "assistant",
                    content: [{
                        type: "toolCall",
                        call: {id: "unstable-arguments-1", name: "unstable_arguments", arguments: {value: 1}},
                    }],
                    timestamp: 1,
                },
            },
            assistant("done after tool error", 2),
        ]);
        const harness = new NeuroAgentHarness({
            store: new MemorySessionStore(),
            profiles,
            model,
        });

        try {
            const created = await harness.createSession({
                profileKey: "canonical-tool",
                initial: {},
                hostContext: {},
            });
            const result = await (await harness.invoke({
                sessionId: created.session.metadata.sessionId,
                payload: {},
            })).result();
            const toolResult = model.requests[1]?.messages.findLast((message) => message.role === "toolResult");

            expect({
                resultStatus: result.status,
                toolExecutions,
                modelRequests: model.requests.length,
                toolResult,
            }).toEqual({
                resultStatus: "completed",
                toolExecutions: 0,
                modelRequests: 2,
                toolResult: {
                    role: "toolResult",
                    toolCallId: "unstable-arguments-1",
                    toolName: "unstable_arguments",
                    content: "ValueSchema 对 Parsed Value 的验证不得继续转换该值",
                    isError: true,
                    timestamp: expect.any(Number),
                },
            });
        } finally {
            await harness.dispose();
        }
    });

    test("approval request 不接受无法形成稳定 Parsed Value 的 Tool arguments", async () => {
        let approvalRequests = 0;
        let toolExecutions = 0;
        const unstableArguments = defineSchema<ParsedEntryPayload>((value) => {
            if (value === null || typeof value !== "object" || Array.isArray(value) || typeof value.value !== "number") {
                throw new Error("Tool value 必须是 number");
            }
            return {value: value.value + 1, decodedBy: "entry"};
        });
        const tool = defineTool({
            name: "unstable_approval_arguments",
            description: "unstable approval arguments",
            parameters: unstableArguments,
            approval: {
                request: () => {
                    approvalRequests += 1;
                    return {prompt: "must not approve"};
                },
            },
            execute: () => {
                toolExecutions += 1;
                return {content: "must not execute"};
            },
        });
        const profiles = new ProfileRegistry();
        profiles.define({
            manifest: {key: "canonical-approval-arguments", name: "Canonical Approval Arguments"},
            initial: objectSchema,
            payload: objectSchema,
            prepare: () => ({
                systemPrompt: "canonical",
                modelConfig: {},
                tools: [tool],
            }),
        });
        const model = new ScriptedModelRuntime([{
            message: {
                role: "assistant",
                content: [{
                    type: "toolCall",
                    call: {
                        id: "unstable-approval-arguments-1",
                        name: "unstable_approval_arguments",
                        arguments: {value: 1},
                    },
                }],
                timestamp: 1,
            },
        }]);
        const harness = new NeuroAgentHarness({
            store: new MemorySessionStore(),
            profiles,
            model,
        });

        try {
            const created = await harness.createSession({
                profileKey: "canonical-approval-arguments",
                initial: {},
                hostContext: {},
            });
            const result = await (await harness.invoke({
                sessionId: created.session.metadata.sessionId,
                payload: {},
            })).result();
            const snapshot = await harness.snapshot(created.session.metadata.sessionId);
            const invocation = snapshot.session.invocations[0];

            expect({
                resultStatus: result.status,
                resultError: result.error,
                invocationStatus: invocation?.status,
                pendingApprovals: invocation?.pendingApprovals,
                activeInvocationId: snapshot.session.activeInvocationId,
                approvalRequests,
                toolExecutions,
                modelRequests: model.requests.length,
            }).toEqual({
                resultStatus: "failed",
                resultError: {
                    name: "SchemaCanonicalValueError",
                    message: "ValueSchema 对 Parsed Value 的验证不得继续转换该值",
                    phase: "run",
                    retryable: false,
                },
                invocationStatus: "failed",
                pendingApprovals: undefined,
                activeInvocationId: null,
                approvalRequests: 0,
                toolExecutions: 0,
                modelRequests: 1,
            });
        } finally {
            await harness.dispose();
        }
    });

    test("Parsed Value validation 保留自定义 schema method receiver", async () => {
        const schema: ReceiverAwareSchema = {
            increment: 1,
            parse(value: JsonValue): ParsedPayload {
                if (value === null || typeof value !== "object" || Array.isArray(value) || typeof value.value !== "number") {
                    throw new Error("value 必须是 number");
                }
                return {value: value.value + this.increment, decodedBy: "payload"};
            },
            validateParsed(value: JsonValue): ParsedPayload {
                if (
                    this.increment !== 1
                    || value === null
                    || typeof value !== "object"
                    || Array.isArray(value)
                    || typeof value.value !== "number"
                    || value.decodedBy !== "payload"
                ) {
                    throw new Error("receiver-aware parsed payload 无效");
                }
                return value as ParsedPayload;
            },
        };

        expect(parseSchemaValue(schema, {value: 100})).toEqual({
            value: 101,
            decodedBy: "payload",
        });

        const preparedPayloads: JsonValue[] = [];
        const profiles = new ProfileRegistry();
        profiles.define({
            manifest: {key: "canonical-receiver", name: "Canonical Receiver"},
            initial: objectSchema,
            payload: schema,
            prepare: (context) => {
                preparedPayloads.push(context.payload);
                return {systemPrompt: "receiver", modelConfig: {}};
            },
        });
        const model = new ScriptedModelRuntime([
            assistant("receiver preserved", 1),
        ]);
        const harness = new NeuroAgentHarness({
            store: new MemorySessionStore(),
            profiles,
            model,
        });

        try {
            const created = await harness.createSession({
                profileKey: "canonical-receiver",
                initial: {},
                hostContext: {},
            });
            const result = await (await harness.invoke({
                sessionId: created.session.metadata.sessionId,
                payload: {value: 200},
            })).result();
            const snapshot = await harness.snapshot(created.session.metadata.sessionId);

            expect({
                resultStatus: result.status,
                invocationInput: snapshot.session.invocations[0]?.input,
                preparedPayloads,
                providerUserContent: model.requests[0]?.messages.findLast((message) => message.role === "user")?.content,
            }).toEqual({
                resultStatus: "completed",
                invocationInput: {value: 201, decodedBy: "payload"},
                preparedPayloads: [{value: 201, decodedBy: "payload"}],
                providerUserContent: "{\"value\":201,\"decodedBy\":\"payload\"}",
            });
        } finally {
            await harness.dispose();
        }
    });

    test("follow-up 由 compatible replacement Profile 验证旧 Parsed Value，而不重新 decode", async () => {
        const firstTurnStarted = deferred();
        const releaseFirstTurn = deferred();
        const prepared: Array<{profile: string; payload: JsonValue}> = [];
        const versionOnePayload = defineSchema<JsonObject>({
            parse(value: JsonValue): JsonObject {
                if (value === null || typeof value !== "object" || Array.isArray(value) || typeof value.value !== "number") {
                    throw new Error("v1 value 必须是 number");
                }
                return {value: value.value + 1, parsedBy: "v1"};
            },
            validateParsed(value: JsonValue): JsonObject {
                if (
                    value === null
                    || typeof value !== "object"
                    || Array.isArray(value)
                    || typeof value.value !== "number"
                    || value.parsedBy !== "v1"
                ) {
                    throw new Error("v1 Parsed Value 无效");
                }
                return value;
            },
        });
        const versionTwoPayload = defineSchema<JsonObject>({
            parse(value: JsonValue): JsonObject {
                if (value === null || typeof value !== "object" || Array.isArray(value) || typeof value.value !== "number") {
                    throw new Error("v2 value 必须是 number");
                }
                return {value: value.value + 100, parsedBy: "v2"};
            },
            validateParsed(value: JsonValue): JsonObject {
                if (
                    value === null
                    || typeof value !== "object"
                    || Array.isArray(value)
                    || typeof value.value !== "number"
                    || (value.parsedBy !== "v1" && value.parsedBy !== "v2")
                ) {
                    throw new Error("v2 不接受 Parsed Value");
                }
                return value;
            },
        });
        const profiles = new ProfileRegistry();
        profiles.define({
            manifest: {key: "canonical-compatible-replacement", name: "Compatible v1", version: 1},
            initial: objectSchema,
            payload: versionOnePayload,
            prepare: (context) => {
                prepared.push({profile: "v1", payload: context.payload});
                return {systemPrompt: "v1", modelConfig: {}};
            },
        });
        const model = new ScriptedModelRuntime([
            async () => {
                firstTurnStarted.resolve();
                await releaseFirstTurn.promise;
                return assistant("first done", 1);
            },
            assistant("replacement done", 2),
        ]);
        const harness = new NeuroAgentHarness({
            store: new MemorySessionStore(),
            profiles,
            model,
        });

        try {
            const created = await harness.createSession({
                profileKey: "canonical-compatible-replacement",
                initial: {},
                hostContext: {},
            });
            const sessionId = created.session.metadata.sessionId;
            await harness.pauseFollowUps(sessionId);
            const first = await harness.invoke({sessionId, payload: {value: 0}});
            await firstTurnStarted.promise;
            const queued = await harness.followUp(sessionId, {value: 10});
            releaseFirstTurn.resolve();
            expect((await first.result()).status).toBe("completed");

            profiles.replace({
                manifest: {key: "canonical-compatible-replacement", name: "Compatible v2", version: 2},
                initial: objectSchema,
                payload: versionTwoPayload,
                prepare: (context) => {
                    prepared.push({profile: "v2", payload: context.payload});
                    return {systemPrompt: "v2", modelConfig: {}};
                },
            });
            const resumed = await harness.resumeFollowUps(sessionId);
            expect(resumed).not.toBeNull();
            expect((await resumed!.result()).status).toBe("completed");
            const snapshot = await harness.snapshot(sessionId);
            const state = await harness.followUpState(sessionId);

            expect({
                queuedPayload: queued.payload,
                invocationInputs: snapshot.session.invocations.map((invocation) => invocation.input),
                invocationVersions: snapshot.session.invocations.map((invocation) => invocation.profileVersion),
                prepared,
                secondSystemPrompt: model.requests[1]?.systemPrompt,
                remainingQueue: state.items,
                consumed: snapshot.session.entries.some((entry) => {
                    return entry.kind === "harness.followUp.consumed"
                        && entry.payload !== null
                        && typeof entry.payload === "object"
                        && !Array.isArray(entry.payload)
                        && entry.payload.id === queued.id;
                }),
            }).toEqual({
                queuedPayload: {value: 11, parsedBy: "v1"},
                invocationInputs: [
                    {value: 1, parsedBy: "v1"},
                    {value: 11, parsedBy: "v1"},
                ],
                invocationVersions: [1, 2],
                prepared: [
                    {profile: "v1", payload: {value: 1, parsedBy: "v1"}},
                    {profile: "v2", payload: {value: 11, parsedBy: "v1"}},
                ],
                secondSystemPrompt: "v2",
                remainingQueue: [],
                consumed: true,
            });
        } finally {
            releaseFirstTurn.resolve();
            await harness.dispose();
        }
    });

    test("follow-up 被 incompatible replacement 拒绝时不 consume queue 或启动 Invocation", async () => {
        const firstTurnStarted = deferred();
        const releaseFirstTurn = deferred();
        const profiles = new ProfileRegistry();
        profiles.define({
            manifest: {key: "canonical-incompatible-replacement", name: "Incompatible v1", version: 1},
            initial: objectSchema,
            payload: defineSchema<JsonObject>({
                parse(value: JsonValue): JsonObject {
                    if (value === null || typeof value !== "object" || Array.isArray(value) || typeof value.value !== "number") {
                        throw new Error("v1 value 必须是 number");
                    }
                    return {value: value.value + 1, parsedBy: "v1"};
                },
                validateParsed(value: JsonValue): JsonObject {
                    if (value === null || typeof value !== "object" || Array.isArray(value) || value.parsedBy !== "v1") {
                        throw new Error("v1 Parsed Value 无效");
                    }
                    return value;
                },
            }),
            prepare: () => ({systemPrompt: "v1", modelConfig: {}}),
        });
        const model = new ScriptedModelRuntime([async () => {
            firstTurnStarted.resolve();
            await releaseFirstTurn.promise;
            return assistant("first done", 1);
        }]);
        const harness = new NeuroAgentHarness({
            store: new MemorySessionStore(),
            profiles,
            model,
        });

        try {
            const created = await harness.createSession({
                profileKey: "canonical-incompatible-replacement",
                initial: {},
                hostContext: {},
            });
            const sessionId = created.session.metadata.sessionId;
            await harness.pauseFollowUps(sessionId);
            const first = await harness.invoke({sessionId, payload: {value: 0}});
            await firstTurnStarted.promise;
            const queued = await harness.followUp(sessionId, {value: 10});
            releaseFirstTurn.resolve();
            expect((await first.result()).status).toBe("completed");

            profiles.replace({
                manifest: {key: "canonical-incompatible-replacement", name: "Incompatible v2", version: 2},
                initial: objectSchema,
                payload: defineSchema<JsonObject>({
                    parse(value: JsonValue): JsonObject {
                        if (value === null || typeof value !== "object" || Array.isArray(value)) {
                            throw new Error("v2 payload 必须是 object");
                        }
                        return {...value, parsedBy: "v2"};
                    },
                    validateParsed: () => {
                        throw new Error("v2 不接受 v1 Parsed Value");
                    },
                }),
                prepare: () => ({systemPrompt: "v2", modelConfig: {}}),
            });
            const beforeResume = await harness.snapshot(sessionId);
            const outcome = await harness.resumeFollowUps(sessionId).then(
                () => ({kind: "accepted" as const}),
                (error: unknown) => ({kind: "rejected" as const, error}),
            );
            const snapshot = await harness.snapshot(sessionId);
            const state = await harness.followUpState(sessionId);

            expect({
                kind: outcome.kind,
                error: outcome.kind === "rejected" && outcome.error instanceof Error ? outcome.error.message : undefined,
                invocationCount: snapshot.session.invocations.length,
                activeInvocationId: snapshot.session.activeInvocationId,
                versionBefore: beforeResume.session.version,
                versionAfter: snapshot.session.version,
                entryCountBefore: beforeResume.session.entries.length,
                entryCountAfter: snapshot.session.entries.length,
                newEntries: snapshot.session.entries.slice(beforeResume.session.entries.length).map((entry) => ({
                    kind: entry.kind,
                    payload: entry.payload,
                })),
                paused: state.paused,
                remainingIds: state.items.map((item) => item.id),
                consumed: snapshot.session.entries.some((entry) => {
                    return entry.kind === "harness.followUp.consumed"
                        && entry.payload !== null
                        && typeof entry.payload === "object"
                        && !Array.isArray(entry.payload)
                        && entry.payload.id === queued.id;
                }),
                modelRequests: model.requests.length,
            }).toEqual({
                kind: "rejected",
                error: "v2 不接受 v1 Parsed Value",
                invocationCount: 1,
                activeInvocationId: null,
                versionBefore: beforeResume.session.version,
                versionAfter: beforeResume.session.version + 1,
                entryCountBefore: beforeResume.session.entries.length,
                entryCountAfter: beforeResume.session.entries.length + 1,
                newEntries: [{
                    kind: "harness.followUp.paused",
                    payload: {paused: false},
                }],
                paused: false,
                remainingIds: [queued.id],
                consumed: false,
                modelRequests: 1,
            });
        } finally {
            releaseFirstTurn.resolve();
            await harness.dispose();
        }
    });

    test("explicit output decoder 只转换一次并持久化 Parsed Value", async () => {
        const outputSchema = defineSchema<ParsedOutput>({
            parse(value: JsonValue): ParsedOutput {
                if (typeof value !== "string") {
                    throw new Error("output 必须是 string");
                }
                return {text: value.toUpperCase(), decodedBy: "output"};
            },
            validateParsed(value: JsonValue): ParsedOutput {
                if (
                    value === null
                    || typeof value !== "object"
                    || Array.isArray(value)
                    || typeof value.text !== "string"
                    || value.decodedBy !== "output"
                ) {
                    throw new Error("parsed output 无效");
                }
                return value as ParsedOutput;
            },
        });
        const profiles = new ProfileRegistry();
        profiles.define({
            manifest: {key: "canonical-output", name: "Canonical Output"},
            initial: objectSchema,
            payload: objectSchema,
            output: outputSchema,
            prepare: () => ({systemPrompt: "canonical", modelConfig: {}}),
        });
        const harness = new NeuroAgentHarness({
            store: new MemorySessionStore(),
            profiles,
            model: new ScriptedModelRuntime([assistant("canonical output", 1)]),
        });

        try {
            const created = await harness.createSession({
                profileKey: "canonical-output",
                initial: {},
                hostContext: {},
            });
            const result = await (await harness.invoke({
                sessionId: created.session.metadata.sessionId,
                payload: {},
            })).result();
            const snapshot = await harness.snapshot(created.session.metadata.sessionId);

            expect({
                resultStatus: result.status,
                resultOutput: result.output,
                durableOutput: snapshot.session.invocations[0]?.output,
            }).toEqual({
                resultStatus: "completed",
                resultOutput: {text: "CANONICAL OUTPUT", decodedBy: "output"},
                durableOutput: {text: "CANONICAL OUTPUT", decodedBy: "output"},
            });
        } finally {
            await harness.dispose();
        }
    });

    test("approval prompt 与 resume Tool execution 分别从同一 durable raw arguments decode", async () => {
        const approvalArguments: JsonValue[] = [];
        const executedArguments: JsonValue[] = [];
        const parameters = defineSchema<ParsedToolArguments>({
            parse(value: JsonValue): ParsedToolArguments {
                if (value === null || typeof value !== "object" || Array.isArray(value) || typeof value.value !== "number") {
                    throw new Error("Tool value 必须是 number");
                }
                return {value: value.value + 1, decodedBy: "tool"};
            },
            validateParsed(value: JsonValue): ParsedToolArguments {
                if (
                    value === null
                    || typeof value !== "object"
                    || Array.isArray(value)
                    || typeof value.value !== "number"
                    || value.decodedBy !== "tool"
                ) {
                    throw new Error("parsed Tool arguments 无效");
                }
                return value as ParsedToolArguments;
            },
        });
        const tool = defineTool({
            name: "canonical_approval_arguments",
            description: "canonical approval arguments",
            parameters,
            approval: {
                request: (argumentsValue) => {
                    approvalArguments.push(argumentsValue);
                    return {prompt: "approve canonical arguments?"};
                },
            },
            execute: (argumentsValue) => {
                executedArguments.push(argumentsValue);
                return {content: "executed"};
            },
        });
        const profiles = new ProfileRegistry();
        profiles.define({
            manifest: {key: "canonical-approved-tool", name: "Canonical Approved Tool"},
            initial: objectSchema,
            payload: objectSchema,
            prepare: () => ({
                systemPrompt: "canonical",
                modelConfig: {},
                tools: [tool],
            }),
        });
        const model = new ScriptedModelRuntime([
            {
                message: {
                    role: "assistant",
                    content: [{
                        type: "toolCall",
                        call: {
                            id: "canonical-approved-tool-1",
                            name: "canonical_approval_arguments",
                            arguments: {value: 5},
                        },
                    }],
                    timestamp: 1,
                },
            },
            assistant("approved done", 2),
        ]);
        const harness = new NeuroAgentHarness({
            store: new MemorySessionStore(),
            profiles,
            model,
        });

        try {
            const created = await harness.createSession({
                profileKey: "canonical-approved-tool",
                initial: {},
                hostContext: {},
            });
            const sessionId = created.session.metadata.sessionId;
            const waiting = await harness.invoke({sessionId, payload: {}});
            expect((await waiting.result()).status).toBe("waiting");
            const waitingSnapshot = await harness.snapshot(sessionId);

            const resumed = await harness.resume(sessionId, waiting.invocationId, [{
                toolCallId: "canonical-approved-tool-1",
                approved: true,
            }]);
            expect((await resumed.result()).status).toBe("completed");

            expect({
                durableApprovalArguments: waitingSnapshot.session.invocations[0]?.pendingApprovals?.[0]?.arguments,
                approvalArguments,
                executedArguments,
            }).toEqual({
                durableApprovalArguments: {value: 5},
                approvalArguments: [{value: 6, decodedBy: "tool"}],
                executedArguments: [{value: 6, decodedBy: "tool"}],
            });
        } finally {
            await harness.dispose();
        }
    });

    test("pre-ADR-0030 ResolvedProfile shape 无 validator 时仍可运行", async () => {
        const preparedPayloads: JsonValue[] = [];
        const legacyProfile: ResolvedProfile<number, JsonObject, JsonObject> = {
            key: "legacy-resolved-profile",
            version: 1,
            facets: [],
            requiredCapabilities: [],
            hooks: [],
            parseInitial: (value) => objectSchema.parse(value),
            parsePayload: (value) => objectSchema.parse(value),
            parseOutput: (value) => value,
            prepare: async (context) => {
                preparedPayloads.push(context.payload);
                return {systemPrompt: "legacy", modelConfig: {}};
            },
        };
        const harness = new NeuroAgentHarness({
            store: new MemorySessionStore<number, JsonObject>(),
            profiles: new LegacyResolvedProfileRegistry(legacyProfile),
            model: new ScriptedModelRuntime<JsonObject>([assistant("legacy done", 1)]),
        });

        try {
            const created = await harness.createSession({
                profileKey: "legacy-resolved-profile",
                initial: {},
                hostContext: {},
            });
            const result = await (await harness.invoke({
                sessionId: created.session.metadata.sessionId,
                payload: {legacy: true},
            })).result();
            const snapshot = await harness.snapshot(created.session.metadata.sessionId);

            expect({
                status: result.status,
                durableInput: snapshot.session.invocations[0]?.input,
                preparedPayloads,
            }).toEqual({
                status: "completed",
                durableInput: {legacy: true},
                preparedPayloads: [{legacy: true}],
            });
        } finally {
            await harness.dispose();
        }
    });
    test("fork 默认继承 Parsed initial，不重复执行 initial parser", async () => {
        const profiles = new ProfileRegistry();
        profiles.define({
            manifest: {key: "canonical-fork", name: "Canonical Fork"},
            initial: initialSchema,
            payload: payloadSchema,
            prepare: () => ({systemPrompt: "canonical", modelConfig: {}}),
        });
        const harness = new NeuroAgentHarness({
            store: new MemorySessionStore(),
            profiles,
            model: new ScriptedModelRuntime([]),
        });
        try {
            const source = await harness.createSession({profileKey: "canonical-fork", initial: {revision: 10}, hostContext: {}});
            const fork = await harness.forkSession(source.session.metadata.sessionId);
            expect(source.session.metadata.initial).toEqual({revision: 11, decodedBy: "initial"});
            expect(fork.session.metadata.initial).toEqual(source.session.metadata.initial);
        } finally {
            await harness.dispose();
        }
    });
});
