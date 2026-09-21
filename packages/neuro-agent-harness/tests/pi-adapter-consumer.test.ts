import {afterEach, describe, expect, test} from "bun:test";
import {mkdtemp, rm} from "node:fs/promises";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {
    ModelTurnError,
    NeuroAgentHarness,
    ProfileRegistry,
    defineProfile,
    defineSchema,
    defineTool,
    invocationUsage,
    type AgentMessage,
    type JsonObject,
    type JsonValue,
    type ModelRuntime,
    type ModelRuntimeEvent,
    type ModelTurnRequest,
    type ModelTurnResult,
    type TokenUsage,
} from "../src/index.js";
import {JsonlSessionStore} from "../src/storage/jsonl.js";
import {MemorySessionStore} from "../src/storage/memory.js";

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

type PiLikeUsage = {
    readonly input: number;
    readonly output: number;
    readonly cacheRead: number;
    readonly cacheWrite: number;
    readonly totalTokens: number;
    readonly cost: {
        readonly total: number;
    };
};

type PiLikeContent =
    | {readonly type: "text"; readonly text: string}
    | {readonly type: "thinking"; readonly thinking: string; readonly thinkingSignature?: string}
    | {
        readonly type: "toolCall";
        readonly id: string;
        readonly name: string;
        readonly arguments: JsonValue;
        readonly partialJson?: string;
    };

type PiLikeAssistant = {
    readonly role: "assistant";
    readonly content: readonly PiLikeContent[];
    readonly usage: PiLikeUsage;
    readonly stopReason: "stop" | "length" | "toolUse" | "error" | "aborted";
    readonly errorMessage?: string;
    readonly timestamp: number;
    readonly provider: string;
    readonly model: string;
};

type PiLikeEvent =
    | {readonly type: "start"; readonly partial: PiLikeAssistant}
    | {readonly type: "text_delta"; readonly delta: string; readonly partial: PiLikeAssistant}
    | {readonly type: "thinking_delta"; readonly delta: string; readonly partial: PiLikeAssistant}
    | {
        readonly type: "toolcall_delta";
        readonly delta: string;
        readonly partial: PiLikeAssistant;
        readonly toolCallId: string;
        readonly toolName: string;
        readonly arguments: JsonValue;
    }
    | {readonly type: "done"; readonly message: PiLikeAssistant}
    | {readonly type: "error"; readonly error: PiLikeAssistant};

type PiLikeStream = {
    [Symbol.asyncIterator](): AsyncIterator<PiLikeEvent>;
    result(): Promise<PiLikeAssistant>;
};

type PiLikeStreamFactory = (request: ModelTurnRequest<JsonObject>) => PiLikeStream;

/**
 * Consumer-side Adapter fixture based on Pi 0.80.6's cumulative partial + result() contract.
 *
 * Provider-specific fields stay local. Core only receives normalized messages, deltas and
 * ModelTurnError usage.
 */
class HostPiLikeModelRuntime implements ModelRuntime<JsonObject> {
    readonly requests: ModelTurnRequest<JsonObject>[] = [];
    private readonly factories: PiLikeStreamFactory[];

    constructor(factories: readonly PiLikeStreamFactory[]) {
        this.factories = [...factories];
    }

    async runTurn(request: ModelTurnRequest<JsonObject>): Promise<ModelTurnResult> {
        this.requests.push(request);
        const factory = this.factories.shift();
        if (!factory) {
            throw new Error("Pi-like stream script 已耗尽");
        }
        const stream = factory(request);
        let lastPartial: PiLikeAssistant | undefined;
        try {
            for await (const event of stream) {
                const current = "partial" in event
                    ? event.partial
                    : event.type === "done"
                        ? event.message
                        : event.error;
                lastPartial = current;
                await projectRuntimeEvent(request, event);
            }
            const message = toAgentAssistant(await stream.result());
            await request.onEvent?.({type: "message_end", message});
            return {message};
        } catch (error) {
            throw new ModelTurnError(error instanceof Error ? error.message : String(error), {
                cause: error,
                ...(lastPartial ? {usage: toTokenUsage(lastPartial.usage)} : {}),
            });
        }
    }
}

async function projectRuntimeEvent(
    request: ModelTurnRequest<JsonObject>,
    event: PiLikeEvent,
): Promise<void> {
    let projected: ModelRuntimeEvent | undefined;
    if (event.type === "start") {
        projected = {type: "message_start"};
    } else if (event.type === "text_delta") {
        projected = {type: "text_delta", delta: event.delta};
    } else if (event.type === "thinking_delta") {
        projected = {type: "thinking_delta", delta: event.delta};
    } else if (event.type === "toolcall_delta") {
        projected = {
            type: "tool_call_delta",
            toolCallId: event.toolCallId,
            toolName: event.toolName,
            arguments: event.arguments,
        };
    }
    if (projected) {
        await request.onEvent?.(projected);
    }
}

function toAgentAssistant(message: PiLikeAssistant): Extract<AgentMessage, {role: "assistant"}> {
    return {
        role: "assistant",
        content: message.content.map((block) => {
            if (block.type === "text") {
                return {type: "text", text: block.text};
            }
            if (block.type === "thinking") {
                return {type: "thinking", thinking: block.thinking};
            }
            return {
                type: "toolCall",
                call: {
                    id: block.id,
                    name: block.name,
                    arguments: block.arguments,
                },
            };
        }),
        timestamp: message.timestamp,
        usage: toTokenUsage(message.usage),
    };
}

function toTokenUsage(usage: PiLikeUsage): TokenUsage {
    return {
        input: usage.input,
        output: usage.output,
        total: usage.totalTokens,
    };
}

function piUsage(
    input: number,
    output: number,
    cacheRead = 0,
    cacheWrite = 0,
): PiLikeUsage {
    return {
        input,
        output,
        cacheRead,
        cacheWrite,
        totalTokens: input + output + cacheRead + cacheWrite,
        cost: {total: 123.45},
    };
}

function piAssistant(
    content: readonly PiLikeContent[],
    usage: PiLikeUsage,
    options: {
        readonly stopReason?: PiLikeAssistant["stopReason"];
        readonly errorMessage?: string;
        readonly timestamp?: number;
    } = {},
): PiLikeAssistant {
    return {
        role: "assistant",
        content,
        usage,
        stopReason: options.stopReason ?? "stop",
        ...(options.errorMessage === undefined ? {} : {errorMessage: options.errorMessage}),
        timestamp: options.timestamp ?? usage.totalTokens,
        provider: "fixture-provider",
        model: "fixture-model",
    };
}

function scriptedStream(
    events: readonly PiLikeEvent[],
    result: PiLikeAssistant | Error,
): PiLikeStream {
    return {
        async *[Symbol.asyncIterator]() {
            for (const event of events) {
                yield event;
            }
        },
        async result() {
            if (result instanceof Error) {
                throw result;
            }
            return result;
        },
    };
}

function profile(key: string) {
    return defineProfile({
        manifest: {key, name: key},
        initial: objectSchema,
        payload: objectSchema,
        prepare: () => ({systemPrompt: key, modelConfig: {}}),
    });
}

async function replayRuntimeEvents<TModelConfig extends JsonValue>(
    harness: NeuroAgentHarness<number, JsonObject, TModelConfig>,
    sessionId: number,
): Promise<ModelRuntimeEvent[]> {
    const subscription = harness.subscribe(sessionId, {after: 0});
    await subscription.close();
    const events: ModelRuntimeEvent[] = [];
    for await (const envelope of subscription) {
        if (envelope.kind === "runtime" && envelope.event.type === "model_event") {
            events.push(envelope.event.event);
        }
    }
    return events;
}

function durableAssistantText(entries: readonly {readonly kind: string; readonly payload: JsonValue}[]): string {
    return entries
        .filter((entry) => entry.kind === "agent.message")
        .map((entry) => JSON.stringify(entry.payload))
        .join("\n");
}

describe("host-local Pi-like ModelRuntime Adapter", () => {
    test("maps multi-turn success, Tool calls, thinking and token totals without provider metadata", async () => {
        let toolCalls = 0;
        const step = defineTool({
            name: "step",
            description: "continue",
            parameters: objectSchema,
            execute: () => {
                toolCalls += 1;
                return {content: "continued"};
            },
        });
        const turnProfile = defineProfile({
            manifest: {key: "pi-like-success", name: "pi-like-success"},
            initial: objectSchema,
            payload: objectSchema,
            prepare: () => ({systemPrompt: "success", modelConfig: {}, tools: [step]}),
        });
        const first = piAssistant([{
            type: "toolCall",
            id: "step-1",
            name: "step",
            arguments: {},
        }], piUsage(2, 1, 1), {stopReason: "toolUse"});
        const second = piAssistant([
            {type: "thinking", thinking: "brief thought", thinkingSignature: "provider-private"},
            {type: "text", text: "done"},
        ], piUsage(1, 2));
        const model = new HostPiLikeModelRuntime([
            () => scriptedStream([
                {type: "start", partial: first},
                {
                    type: "toolcall_delta",
                    delta: "{}",
                    partial: first,
                    toolCallId: "step-1",
                    toolName: "step",
                    arguments: {},
                },
                {type: "done", message: first},
            ], first),
            () => scriptedStream([
                {type: "start", partial: second},
                {type: "thinking_delta", delta: "brief thought", partial: second},
                {type: "text_delta", delta: "done", partial: second},
                {type: "done", message: second},
            ], second),
        ]);
        const store = new MemorySessionStore<number, JsonObject>();
        const harness = new NeuroAgentHarness({
            store,
            profiles: new ProfileRegistry().add(turnProfile),
            model,
        });
        const created = await harness.createSession({profileKey: "pi-like-success", initial: {}, hostContext: {}});
        const handle = await harness.invoke({sessionId: created.session.metadata.sessionId, payload: {}});
        const result = await handle.result();
        const snapshot = await store.read(created.session.metadata.sessionId);
        const modelEvents = await replayRuntimeEvents(harness, created.session.metadata.sessionId);

        expect(result.status).toBe("completed");
        expect(result.usage).toEqual({input: 3, output: 3, total: 7});
        expect(toolCalls).toBe(1);
        expect(model.requests).toHaveLength(2);
        expect(model.requests[0]?.tools.map((tool) => tool.name)).toEqual(["step"]);
        expect(model.requests[1]?.messages.some((message) => message.role === "toolResult")).toBe(true);
        expect(modelEvents.map((event) => event.type)).toContain("tool_call_delta");
        expect(modelEvents.map((event) => event.type)).toContain("thinking_delta");
        expect(modelEvents.map((event) => event.type)).toContain("text_delta");
        expect(invocationUsage(snapshot, handle.invocationId)).toEqual({input: 3, output: 3, total: 7});
        expect(durableAssistantText(snapshot.entries)).not.toContain("provider-private");
        expect(durableAssistantText(snapshot.entries)).not.toContain("123.45");
    });

    test("maps an error event plus rejected result to durable failure usage without partial transcript", async () => {
        const directory = await mkdtemp(join(tmpdir(), "neuro-harness-pi-adapter-"));
        directories.push(directory);
        const partial = piAssistant(
            [{type: "text", text: "half generated"}],
            piUsage(7, 2, 1),
            {stopReason: "error", errorMessage: "gateway dropped"},
        );
        const model = new HostPiLikeModelRuntime([
            () => scriptedStream([
                {type: "start", partial},
                {type: "text_delta", delta: "half generated", partial},
                {type: "error", error: partial},
            ], new Error("gateway dropped")),
        ]);
        const firstStore = new JsonlSessionStore<JsonObject>({directory});
        const harness = new NeuroAgentHarness({
            store: firstStore,
            profiles: new ProfileRegistry().add(profile("pi-like-result-reject")),
            model,
        });
        const created = await harness.createSession({profileKey: "pi-like-result-reject", initial: {}, hostContext: {}});
        const handle = await harness.invoke({sessionId: created.session.metadata.sessionId, payload: {}});
        const result = await handle.result();
        const modelEvents = await replayRuntimeEvents(harness, created.session.metadata.sessionId);
        await harness.dispose();

        const restored = await new JsonlSessionStore<JsonObject>({directory}).read(created.session.metadata.sessionId);

        expect(result.status).toBe("failed");
        expect(result.persistence).toBe("confirmed");
        expect(result.error?.message).toBe("gateway dropped");
        expect(result.usage).toEqual({input: 7, output: 2, total: 10});
        expect(modelEvents).toContainEqual({type: "text_delta", delta: "half generated"});
        expect(durableAssistantText(restored.entries)).not.toContain("half generated");
        expect(invocationUsage(restored, handle.invocationId)).toEqual({input: 7, output: 2, total: 10});
    });

    test("uses the last cumulative partial when the async iterator itself throws", async () => {
        const partial = piAssistant(
            [{type: "thinking", thinking: "unfinished thought"}],
            piUsage(3, 4, 1),
            {stopReason: "error", errorMessage: "stream disconnected"},
        );
        let resultCalls = 0;
        const model = new HostPiLikeModelRuntime([
            () => ({
                async *[Symbol.asyncIterator]() {
                    yield {type: "start", partial} as const;
                    yield {type: "thinking_delta", delta: "unfinished thought", partial} as const;
                    throw new Error("stream disconnected");
                },
                async result() {
                    resultCalls += 1;
                    throw new Error("result should not be called");
                },
            }),
        ]);
        const store = new MemorySessionStore<number, JsonObject>();
        const harness = new NeuroAgentHarness({
            store,
            profiles: new ProfileRegistry().add(profile("pi-like-iterator-throw")),
            model,
        });
        const created = await harness.createSession({profileKey: "pi-like-iterator-throw", initial: {}, hostContext: {}});
        const handle = await harness.invoke({sessionId: created.session.metadata.sessionId, payload: {}});
        const result = await handle.result();
        const snapshot = await store.read(created.session.metadata.sessionId);

        expect(result.status).toBe("failed");
        expect(result.error?.message).toBe("stream disconnected");
        expect(result.usage).toEqual({input: 3, output: 4, total: 8});
        expect(resultCalls).toBe(0);
        expect(durableAssistantText(snapshot.entries)).not.toContain("unfinished thought");
        expect(invocationUsage(snapshot, handle.invocationId)).toEqual({input: 3, output: 4, total: 8});
    });

    test("maps signal-driven error/result rejection to cooperative aborted usage", async () => {
        let markWaitingForAbort!: () => void;
        const waitingForAbort = new Promise<void>((resolve) => {
            markWaitingForAbort = resolve;
        });
        const partial = piAssistant(
            [{type: "text", text: "stopped half"}],
            piUsage(5, 1, 1),
            {stopReason: "aborted"},
        );
        const model = new HostPiLikeModelRuntime([
            (request) => {
                const aborted = new Promise<void>((resolve) => {
                    if (request.signal.aborted) {
                        resolve();
                    } else {
                        request.signal.addEventListener("abort", () => resolve(), {once: true});
                    }
                });
                return {
                    async *[Symbol.asyncIterator]() {
                        yield {type: "start", partial} as const;
                        yield {type: "text_delta", delta: "stopped half", partial} as const;
                        markWaitingForAbort();
                        await aborted;
                        yield {type: "error", error: partial} as const;
                    },
                    async result() {
                        await aborted;
                        throw new Error("Request was aborted");
                    },
                };
            },
        ]);
        const store = new MemorySessionStore<number, JsonObject>();
        const harness = new NeuroAgentHarness({
            abortGraceMs: 200,
            store,
            profiles: new ProfileRegistry().add(profile("pi-like-cooperative-abort")),
            model,
        });
        const created = await harness.createSession({profileKey: "pi-like-cooperative-abort", initial: {}, hostContext: {}});
        const handle = await harness.invoke({sessionId: created.session.metadata.sessionId, payload: {}});
        await waitingForAbort;

        handle.abort();

        const result = await handle.result();
        const snapshot = await store.read(created.session.metadata.sessionId);
        const modelEvents = await replayRuntimeEvents(harness, created.session.metadata.sessionId);

        expect(result.status).toBe("aborted");
        expect(result.persistence).toBe("confirmed");
        expect(result.usage).toEqual({input: 5, output: 1, total: 7});
        expect(modelEvents).toContainEqual({type: "text_delta", delta: "stopped half"});
        expect(durableAssistantText(snapshot.entries)).not.toContain("stopped half");
        expect(invocationUsage(snapshot, handle.invocationId)).toEqual({input: 5, output: 1, total: 7});
        await harness.dispose();
    });
});
