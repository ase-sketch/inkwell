import {describe, expect, test} from "bun:test";
import {
    ModelTurnError,
    NeuroAgentHarness,
    ProfileRegistry,
    defineProfile,
    defineSchema,
    invocationPartial,
    type JsonObject,
    type ModelRuntime,
    type ModelTurnRequest,
} from "../src/index.js";
import {MemorySessionStore} from "../src/storage/memory.js";

const objectSchema = defineSchema<JsonObject>((value) => {
    if (value === null || typeof value !== "object" || Array.isArray(value)) {
        throw new Error("必须是 object");
    }
    return value;
});

function profile(key: string) {
    return defineProfile<JsonObject, JsonObject, JsonObject, number, JsonObject, JsonObject>({
        manifest: {key, name: key},
        initial: objectSchema,
        payload: objectSchema,
        prepare: () => ({
            systemPrompt: key,
            modelConfig: {},
        }),
    });
}

class AbortAwareStreamingRuntime implements ModelRuntime<JsonObject> {
    readonly ready: Promise<void>;
    private markReady!: () => void;
    readonly observedEvents: string[] = [];

    constructor() {
        this.ready = new Promise<void>((resolve) => {
            this.markReady = resolve;
        });
    }

    async runTurn(request: ModelTurnRequest<JsonObject>): Promise<never> {
        const partialText = "streamed before provider abort";
        request.onEvent?.({type: "message_start"});
        request.onEvent?.({type: "text_delta", delta: partialText});

        try {
            await new Promise<never>((_, reject) => {
                request.signal.addEventListener("abort", () => reject(new Error("Request was aborted")), {once: true});
                this.markReady();
            });
        } catch (error) {
            if (!request.signal.aborted) {
                throw error;
            }
            throw new ModelTurnError("provider stream aborted", {
                partial: {content: [{type: "text", text: partialText}]},
                cause: error,
            });
        }

        throw new Error("unreachable");
    }
}

describe("streaming ModelRuntime consumer tracer", () => {
    test("provider stream abort 可由现有 ModelTurnError.partial seam 恢复，无需 Core stream API", async () => {
        const runtime = new AbortAwareStreamingRuntime();
        const originalOnEvent = runtime.runTurn.bind(runtime);
        runtime.runTurn = async (request) => {
            const onEvent = request.onEvent;
            return originalOnEvent({
                ...request,
                onEvent: (event) => {
                    runtime.observedEvents.push(event.type);
                    return onEvent?.(event);
                },
            });
        };
        const store = new MemorySessionStore<number, JsonObject>();
        const harness = new NeuroAgentHarness<number, JsonObject, JsonObject>({
            abortGraceMs: 200,
            store,
            profiles: new ProfileRegistry<number, JsonObject, JsonObject>().add(profile("streaming-partial")),
            model: runtime,
        });

        try {
            const created = await harness.createSession({
                profileKey: "streaming-partial",
                initial: {},
                hostContext: {},
            });
            const handle = await harness.invoke({
                sessionId: created.session.metadata.sessionId,
                payload: {},
            });
            await runtime.ready;
            handle.abort();

            const result = await handle.result();
            const snapshot = await store.read(created.session.metadata.sessionId);
            const partial = invocationPartial(snapshot, handle.invocationId);

            expect({
                resultStatus: result.status,
                partial,
                restoredPartial: partial,
                observedEvents: runtime.observedEvents,
                transcriptContainsPartial: snapshot.entries.some((entry) => {
                    return entry.kind === "agent.message"
                        && JSON.stringify(entry.payload).includes("streamed before provider abort");
                }),
            }).toEqual({
                resultStatus: "aborted",
                partial: {turn: 1, content: [{type: "text", text: "streamed before provider abort"}]},
                restoredPartial: {turn: 1, content: [{type: "text", text: "streamed before provider abort"}]},
                observedEvents: ["message_start", "text_delta"],
                transcriptContainsPartial: false,
            });
        } finally {
            await harness.dispose();
        }
    });
});
