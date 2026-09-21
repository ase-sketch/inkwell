import {afterEach, describe, expect, test} from "bun:test";
import {mkdtemp, rm} from "node:fs/promises";
import {join} from "node:path";
import {tmpdir} from "node:os";
import {
    NeuroAgentHarness,
    ProfileRegistry,
    createAgentMessageEntryDraft,
    defineCapability,
    defineProfile,
    defineSchema,
    defineSessionEntryCodec,
    defineTool,
    invocationResultFromSnapshot,
    type AgentMessage,
    type JsonObject,
    type JsonValue,
    type SessionCommitNotification,
    type SessionEntry,
    type SessionStore,
} from "../src/index.js";
import {JsonlSessionStore} from "../src/storage/jsonl.js";
import {MemorySessionStore} from "../src/storage/memory.js";
import {ScriptedModelRuntime} from "../src/testing/index.js";

interface DynamicHistoryItem {
    readonly id: string;
    readonly text: string;
}

interface DynamicDeliveryPayload extends JsonObject {
    readonly deliveryId: string;
    readonly historyId: string;
    readonly text: string;
    readonly invocationId: string;
    readonly turn: number;
}

interface GenerationCapability {
    readonly generation: string;
}

const objectSchema = defineSchema<JsonObject>((value) => {
    if (value === null || typeof value !== "object" || Array.isArray(value)) {
        throw new Error("必须是 object");
    }
    return value;
});

const deliveryCodec = defineSessionEntryCodec(
    "test.profile-context.delivery",
    defineSchema<DynamicDeliveryPayload>((value) => {
        if (value === null || typeof value !== "object" || Array.isArray(value)
            || typeof value.deliveryId !== "string"
            || typeof value.historyId !== "string"
            || typeof value.text !== "string"
            || typeof value.invocationId !== "string"
            || typeof value.turn !== "number"
            || !Number.isInteger(value.turn)) {
            throw new Error("dynamic delivery payload 无效");
        }
        return value as DynamicDeliveryPayload;
    }),
);

const generationCapability = defineCapability<"dynamicGeneration", GenerationCapability>("dynamicGeneration");
const directories: string[] = [];

afterEach(async () => {
    await Promise.all(directories.splice(0).map((directory) => rm(directory, {recursive: true, force: true})));
});

async function tempDirectory(): Promise<string> {
    const directory = await mkdtemp(join(tmpdir(), "neuro-harness-profile-context-delivery-"));
    directories.push(directory);
    return directory;
}

function user(content: string, timestamp: number): Extract<AgentMessage, {role: "user"}> {
    return {role: "user", content, timestamp};
}

function assistantText(text: string, timestamp: number) {
    return {
        message: {
            role: "assistant" as const,
            content: [{type: "text" as const, text}],
            timestamp,
        },
    };
}

function approvalToolCall(id: string) {
    return {
        message: {
            role: "assistant" as const,
            content: [{
                type: "toolCall" as const,
                call: {id, name: "gated", arguments: {}},
            }],
            timestamp: 1,
        },
    };
}

function countText(value: string, text: string): number {
    let count = 0;
    let offset = 0;
    while (true) {
        const index = value.indexOf(text, offset);
        if (index < 0) return count;
        count += 1;
        offset = index + text.length;
    }
}

function payloadMessageRole(value: JsonValue): string | undefined {
    if (value === null || typeof value !== "object" || Array.isArray(value)) return undefined;
    const message = value.message;
    if (message === null || typeof message !== "object" || Array.isArray(message)) return undefined;
    return typeof message.role === "string" ? message.role : undefined;
}

function deliveryFromEntry(entry: SessionEntry): DynamicDeliveryPayload | undefined {
    return deliveryCodec.parse(entry);
}

function assistantMessageEntry(entry: SessionEntry): boolean {
    return entry.kind === "agent.message" && payloadMessageRole(entry.payload) === "assistant";
}

class FakeDynamicHistory {
    private readonly items: DynamicHistoryItem[] = [];
    private readonly settled = new Set<string>();
    readonly settlementLog: string[] = [];

    constructor(items: readonly DynamicHistoryItem[] = []) {
        this.items.push(...items);
    }

    add(item: DynamicHistoryItem): void {
        this.items.push(item);
    }

    unseen(): readonly DynamicHistoryItem[] {
        return this.items.filter((item) => !this.settled.has(item.id));
    }

    isSettled(historyId: string): boolean {
        return this.settled.has(historyId);
    }

    settle(historyId: string): void {
        if (this.settled.has(historyId)) {
            throw new Error("dynamic history 重复 settlement：" + historyId);
        }
        if (!this.items.some((item) => item.id === historyId)) {
            throw new Error("dynamic history 不存在：" + historyId);
        }
        this.settled.add(historyId);
        this.settlementLog.push(historyId);
    }
}

class DynamicContextAdapter {
    readonly name = "dynamic-context-adapter";
    readonly materializedIds: string[] = [];
    readonly requestDeliveries: string[][] = [];
    readonly providerGenerations: string[] = [];
    readonly openedGenerations: string[] = [];
    readonly closedGenerations: string[] = [];
    readonly toolGenerations: string[] = [];
    private generationNumber = 0;

    constructor(readonly history: FakeDynamicHistory) {}

    readonly profile = defineProfile({
        manifest: {key: "profile-context-delivery", name: "Profile Context Delivery", version: 1},
        initial: objectSchema,
        payload: objectSchema,
        requiredCapabilities: [generationCapability],
        hooks: [{
            name: "materialize-dynamic-context",
            stage: "beforeTurn" as const,
            run: (context) => {
                const existing = new Set(context.snapshot.entries.flatMap((entry) => {
                    const delivery = deliveryFromEntry(entry);
                    return delivery ? [delivery.historyId] : [];
                }));
                const entries = this.history.unseen()
                    .filter((item) => !existing.has(item.id))
                    .flatMap((item) => [
                        deliveryCodec.draft({
                            deliveryId: item.id,
                            historyId: item.id,
                            text: item.text,
                            invocationId: context.invocationId,
                            turn: context.turn ?? 0,
                        }, {invocationId: context.invocationId}),
                        createAgentMessageEntryDraft(user("durable-dynamic:" + item.id, 10 + (context.turn ?? 0)), {
                            turn: context.turn ?? 0,
                            invocationId: context.invocationId,
                        }),
                    ]);
                return entries.length === 0 ? {} : {
                    writePlans: [{
                        target: context.sessionId,
                        expectedVersion: context.snapshot.version,
                        cause: "test.context.materialize",
                        operations: [{type: "appendEntries" as const, entries}],
                    }],
                };
            },
        }],
        prepare: (context) => {
            const gated = defineTool({
                name: "gated",
                description: "需要 approval 的动态 context 测试 Tool",
                parameters: objectSchema,
                approval: {request: () => ({prompt: "approve gated tool"})},
                execute: (_argumentsValue, toolContext) => {
                    this.toolGenerations.push(toolContext.capabilities.require(generationCapability).generation);
                    return {content: "approved"};
                },
            });
            return {
                systemPrompt: "profile context delivery",
                modelConfig: {},
                context: {appending: [user("appending-tail", 99)]},
                contextProviders: [{
                    name: "dynamic-context-provider",
                    resolve: (providerContext) => {
                        const generation = providerContext.capabilities.require(generationCapability).generation;
                        const deliveries = providerContext.snapshot.entries
                            .flatMap((entry) => {
                                const delivery = deliveryFromEntry(entry);
                                return delivery && !this.history.isSettled(delivery.historyId) ? [delivery] : [];
                            });
                        this.requestDeliveries.push(deliveries.map((delivery) => delivery.deliveryId));
                        this.providerGenerations.push(generation);
                        return {
                            modelContext: [user("generation:" + generation, 20 + providerContext.turn)],
                            modelContextAppending: deliveries.map((delivery) => user("dynamic-request:" + delivery.deliveryId, 30 + providerContext.turn)),
                        };
                    },
                }],
                tools: [gated],
                limits: {maxTurns: 2},
            };
        },
    });

    afterCommit(notification: SessionCommitNotification<number, JsonObject>): void {
        if (notification.plan.cause === "test.context.materialize") {
            for (const entry of notification.result.entries) {
                const delivery = deliveryFromEntry(entry);
                if (delivery) this.materializedIds.push(delivery.deliveryId);
            }
            return;
        }
        if (notification.plan.cause !== "harness.transcript.commit") return;
        if (!notification.result.entries.some(assistantMessageEntry)) return;
        for (const entry of notification.result.snapshot.entries) {
            const delivery = deliveryFromEntry(entry);
            if (delivery && !this.history.isSettled(delivery.historyId)) {
                this.history.settle(delivery.historyId);
            }
        }
    }

    capabilityProvider() {
        return {
            capability: generationCapability,
            open: () => {
                const generation = String.fromCharCode("A".charCodeAt(0) + this.generationNumber);
                this.generationNumber += 1;
                this.openedGenerations.push(generation);
                return {generation};
            },
            close: (value: GenerationCapability) => {
                this.closedGenerations.push(value.generation);
            },
        };
    }
}

function createHarness(
    store: SessionStore<number, JsonObject>,
    model: ScriptedModelRuntime<JsonObject>,
    adapter: DynamicContextAdapter,
): NeuroAgentHarness<number, JsonObject, JsonObject> {
    return new NeuroAgentHarness({
        store,
        profiles: new ProfileRegistry<number, JsonObject, JsonObject>().add(adapter.profile),
        model,
        capabilities: [adapter.capabilityProvider()],
        commitObservers: [adapter],
    });
}

class FailingTranscriptStore extends MemorySessionStore<number, JsonObject> {
    failAssistantTranscript = false;

    override async commit(
        plan: Parameters<MemorySessionStore<number, JsonObject>["commit"]>[0],
        options?: Parameters<MemorySessionStore<number, JsonObject>["commit"]>[1],
    ) {
        const assistantAppend = plan.operations.some((operation) => operation.type === "appendEntries"
            && operation.entries.some((entry) => payloadMessageRole(entry.payload) === "assistant"));
        if (this.failAssistantTranscript && plan.cause === "harness.transcript.commit" && assistantAppend) {
            this.failAssistantTranscript = false;
            throw new Error("transcript ingest down");
        }
        return super.commit(plan, options);
    }
}

describe("Profile dynamic context delivery parity", () => {
    test("successful transcript ingest settles before approval waiting, and resume uses the next History item", async () => {
        const directory = await tempDirectory();
        const history = new FakeDynamicHistory([{id: "h1", text: "first unseen"}]);
        const adapter = new DynamicContextAdapter(history);
        const firstModel = new ScriptedModelRuntime<JsonObject>([approvalToolCall("gate-1")]);
        const firstHarness = createHarness(new JsonlSessionStore<JsonObject>({directory}), firstModel, adapter);
        let secondHarness: ReturnType<typeof createHarness> | undefined;
        try {
            const created = await firstHarness.createSession({profileKey: adapter.profile.manifest.key, initial: {}, hostContext: {}});
            const waitingHandle = await firstHarness.invoke({sessionId: created.session.metadata.sessionId, payload: {instruction: "wait"}});
            const waiting = await waitingHandle.result();

            expect(waiting.status).toBe("waiting");
            expect(history.settlementLog).toEqual(["h1"]);
            expect(adapter.materializedIds).toEqual(["h1"]);
            expect(adapter.requestDeliveries).toEqual([["h1"]]);
            expect(adapter.openedGenerations).toEqual(["A"]);
            expect(adapter.closedGenerations).toEqual(["A"]);
            const firstRequest = JSON.stringify(firstModel.requests[0]?.messages);
            expect(countText(firstRequest, "dynamic-request:h1")).toBe(1);
            expect(firstRequest.indexOf("dynamic-request:h1")).toBeLessThan(firstRequest.indexOf("appending-tail"));

            const waitingSnapshot = await firstHarness.snapshot(created.session.metadata.sessionId);
            expect(waitingSnapshot.session.entries.filter((entry) => deliveryFromEntry(entry)).map((entry) => deliveryFromEntry(entry)?.deliveryId)).toEqual(["h1"]);
            expect(JSON.stringify(waitingSnapshot.session.entries)).toContain("durable-dynamic:h1");
            expect(JSON.stringify(waitingSnapshot.session.entries)).not.toContain("dynamic-request:h1");
            expect(invocationResultFromSnapshot(waitingSnapshot.session, waitingHandle.invocationId)?.status).toBe("waiting");
            history.add({id: "h2", text: "second unseen"});
            await firstHarness.dispose();

            const secondModel = new ScriptedModelRuntime<JsonObject>([assistantText("resumed", 2)]);
            secondHarness = createHarness(new JsonlSessionStore<JsonObject>({directory}), secondModel, adapter);
            const resumed = await secondHarness.resume(
                created.session.metadata.sessionId,
                waitingHandle.invocationId,
                [{toolCallId: "gate-1", approved: true}],
            );
            const completed = await resumed.result();
            expect(completed.status).toBe("completed");
            expect(resumed.invocationId).toBe(waitingHandle.invocationId);
            expect(history.settlementLog).toEqual(["h1", "h2"]);
            expect(adapter.materializedIds).toEqual(["h1", "h2"]);
            expect(adapter.requestDeliveries).toEqual([["h1"], ["h2"]]);
            expect(adapter.openedGenerations).toEqual(["A", "B"]);
            expect(adapter.closedGenerations).toEqual(["A", "B"]);
            expect(adapter.providerGenerations).toEqual(["A", "B"]);
            expect(adapter.toolGenerations).toEqual(["B"]);
            const resumedRequest = JSON.stringify(secondModel.requests[0]?.messages);
            expect(countText(resumedRequest, "durable-dynamic:h1")).toBe(1);
            expect(countText(resumedRequest, "dynamic-request:h1")).toBe(0);
            expect(countText(resumedRequest, "dynamic-request:h2")).toBe(1);
            expect(countText(resumedRequest, "generation:B")).toBe(1);
            expect(resumedRequest.indexOf("dynamic-request:h2")).toBeLessThan(resumedRequest.indexOf("appending-tail"));
            const restored = await secondHarness.snapshot(created.session.metadata.sessionId);
            expect(invocationResultFromSnapshot(restored.session, waitingHandle.invocationId)).toMatchObject({status: "completed", persistence: "confirmed"});
        } finally {
            await firstHarness.dispose();
            await secondHarness?.dispose();
        }
    });

    test("model failure keeps the materialized History unseen and retries the same durable delivery without duplication", async () => {
        const history = new FakeDynamicHistory([{id: "h3", text: "retryable unseen"}]);
        const adapter = new DynamicContextAdapter(history);
        const model = new ScriptedModelRuntime<JsonObject>([
            new Error("provider down"),
            assistantText("retry succeeded", 3),
        ]);
        const harness = createHarness(new MemorySessionStore<number, JsonObject>(), model, adapter);
        try {
            const created = await harness.createSession({profileKey: adapter.profile.manifest.key, initial: {}, hostContext: {}});
            const failed = await (await harness.invoke({sessionId: created.session.metadata.sessionId, payload: {instruction: "fail"}})).result();
            expect(failed.status).toBe("failed");
            expect(history.settlementLog).toEqual([]);
            expect(adapter.requestDeliveries).toEqual([["h3"]]);
            const afterFailure = await harness.snapshot(created.session.metadata.sessionId);
            expect(afterFailure.session.entries.filter((entry) => deliveryFromEntry(entry)?.deliveryId === "h3")).toHaveLength(1);

            const retried = await (await harness.invoke({sessionId: created.session.metadata.sessionId, payload: {instruction: "retry"}})).result();
            expect(retried.status).toBe("completed");
            expect(history.settlementLog).toEqual(["h3"]);
            expect(adapter.materializedIds).toEqual(["h3"]);
            expect(adapter.requestDeliveries).toEqual([["h3"], ["h3"]]);
            expect(model.requests).toHaveLength(2);
        } finally {
            await harness.dispose();
        }
    });

    test("assistant transcript ingest failure does not settle delivery, then a later successful ingest can settle it", async () => {
        const history = new FakeDynamicHistory([{id: "h4", text: "ingest retry"}]);
        const adapter = new DynamicContextAdapter(history);
        const store = new FailingTranscriptStore();
        const model = new ScriptedModelRuntime<JsonObject>([
            assistantText("first ingest fails", 4),
            assistantText("second ingest succeeds", 5),
        ]);
        const harness = createHarness(store, model, adapter);
        try {
            const created = await harness.createSession({profileKey: adapter.profile.manifest.key, initial: {}, hostContext: {}});
            store.failAssistantTranscript = true;
            const failed = await (await harness.invoke({sessionId: created.session.metadata.sessionId, payload: {instruction: "ingest failure"}})).result();
            expect(failed.status).toBe("failed");
            expect(history.settlementLog).toEqual([]);
            expect(adapter.materializedIds).toEqual(["h4"]);

            const completed = await (await harness.invoke({sessionId: created.session.metadata.sessionId, payload: {instruction: "ingest retry"}})).result();
            expect(completed.status).toBe("completed");
            expect(history.settlementLog).toEqual(["h4"]);
            expect(adapter.materializedIds).toEqual(["h4"]);
            expect(adapter.requestDeliveries).toEqual([["h4"], ["h4"]]);
        } finally {
            await harness.dispose();
        }
    });
});
