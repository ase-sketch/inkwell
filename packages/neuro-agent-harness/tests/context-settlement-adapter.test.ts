import {afterEach, describe, expect, test} from "bun:test";
import {mkdtemp, rm} from "node:fs/promises";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {
    NeuroAgentHarness,
    ProfileRegistry,
    defineProfile,
    defineSchema,
    defineTool,
    invocationResultFromSnapshot,
    type AgentMessage,
    type InvocationHandle,
    type InvocationResult,
    type JsonObject,
    type JsonValue,
    type ModelRuntime,
    type ModelTurnRequest,
    type ToolDefinition,
} from "../src/index.js";
import {JsonlSessionStore} from "../src/storage/jsonl.js";
import {MemorySessionStore} from "../src/storage/memory.js";
import {ScriptedModelRuntime} from "../src/testing/index.js";

interface HistoryEntry {
    readonly id: string;
    readonly content: string;
}

interface HistoryObservation {
    readonly invocationId: string;
    readonly turn: number;
    readonly unseen: readonly string[];
}

/**
 * Host-owned History adapter used to trace the settlement boundary. The
 * Harness only receives materialized modelContextAppending messages; it never
 * reads or advances this cursor through a Core API.
 */
class FakeHistory {
    private cursor = 0;
    private readonly entries: HistoryEntry[];
    readonly settlements: string[] = [];

    constructor(entries: readonly HistoryEntry[]) {
        this.entries = [...entries];
    }

    append(entry: HistoryEntry): void {
        this.entries.push(entry);
    }

    readUnseen(): readonly HistoryEntry[] {
        return this.entries.slice(this.cursor);
    }

    materializeUnseen(): readonly AgentMessage[] {
        return this.readUnseen().map((entry, index) => ({
            role: "user" as const,
            content: `history:${entry.id}:${entry.content}`,
            timestamp: 10 + index,
        }));
    }

    settle(invocationId: string): void {
        this.settlements.push(invocationId);
        this.cursor = this.entries.length;
    }

    get position(): number {
        return this.cursor;
    }
}

const objectSchema = defineSchema<JsonObject>((value) => {
    if (value === null || typeof value !== "object" || Array.isArray(value)) {
        throw new Error("必须是 object");
    }
    return value;
});

const directories: string[] = [];

afterEach(async () => {
    await Promise.all(directories.splice(0).map((directory) => rm(directory, {recursive: true, force: true})));
});

async function tempDirectory(): Promise<string> {
    const directory = await mkdtemp(join(tmpdir(), "neuro-harness-context-settlement-"));
    directories.push(directory);
    return directory;
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

function historyProfile(
    history: FakeHistory,
    observed: HistoryObservation[],
    tools: readonly ToolDefinition<JsonValue, number, JsonObject>[] = [],
) {
    return defineProfile({
        manifest: {key: "context-settlement", name: "Context settlement"},
        initial: objectSchema,
        payload: objectSchema,
        prepare: (context) => ({
            systemPrompt: "context settlement",
            modelConfig: {},
            contextProviders: [{
                name: "fake-history",
                resolve: (providerContext) => {
                    const unseen = history.readUnseen();
                    observed.push({
                        invocationId: providerContext.invocationId,
                        turn: providerContext.turn,
                        unseen: unseen.map((entry) => entry.id),
                    });
                    return {modelContextAppending: history.materializeUnseen()};
                },
            }],
            ...(tools.length > 0 ? {tools} : {}),
            limits: {maxTurns: 2},
        }),
    });
}

async function settleCompleted(
    history: FakeHistory,
    handle: InvocationHandle<number>,
): Promise<InvocationResult<number>> {
    const result = await handle.result();
    if (result.status === "completed" && result.persistence === "confirmed") {
        history.settle(result.invocationId);
    }
    return result;
}

function userMessageContents(messages: readonly AgentMessage[]): string[] {
    return messages.flatMap((message) => {
        if (message.role !== "user") return [];
        return typeof message.content === "string" ? [message.content] : [];
    });
}

function countContent(messages: readonly AgentMessage[], content: string): number {
    return userMessageContents(messages).filter((item) => item === content).length;
}

function deferred<T>(): {promise: Promise<T>; resolve: (value: T) => void} {
    let resolve!: (value: T) => void;
    const promise = new Promise<T>((resolvePromise) => {
        resolve = resolvePromise;
    });
    return {promise, resolve};
}

class AbortAwareModel implements ModelRuntime<JsonValue> {
    readonly requests: ModelTurnRequest<JsonValue>[] = [];
    readonly started = deferred<void>();

    async runTurn(request: ModelTurnRequest<JsonValue>): Promise<never> {
        this.requests.push(request);
        this.started.resolve();
        return new Promise<never>((_resolve, reject) => {
            const rejectOnAbort = (): void => reject(new Error("provider cancelled"));
            if (request.signal.aborted) {
                rejectOnAbort();
                return;
            }
            request.signal.addEventListener("abort", rejectOnAbort, {once: true});
        });
    }
}

describe("Context settlement adapter boundary", () => {
    test("宿主只在 completed 后 settle，failed 保留新增 unseen cursor", async () => {
        const history = new FakeHistory([
            {id: "h1", content: "first"},
            {id: "h2", content: "second"},
        ]);
        const observed: HistoryObservation[] = [];
        const model = new ScriptedModelRuntime<JsonValue>([
            assistant("done", 100),
            new Error("provider failed"),
        ]);
        const profile = historyProfile(history, observed);
        const harness = new NeuroAgentHarness({
            store: new MemorySessionStore(),
            profiles: new ProfileRegistry().add(profile),
            model,
        });
        const session = await harness.createSession({profileKey: profile.manifest.key, initial: {}, hostContext: {}});

        const firstHandle = await harness.invoke({
            sessionId: session.session.metadata.sessionId,
            payload: {instruction: "complete"},
        });
        const first = await settleCompleted(history, firstHandle);
        expect(first.status).toBe("completed");
        expect(history.position).toBe(2);
        expect(history.settlements).toEqual([firstHandle.invocationId]);
        expect(countContent(model.requests[0]!.messages, "history:h1:first")).toBe(1);
        expect(countContent(model.requests[0]!.messages, "history:h2:second")).toBe(1);

        history.append({id: "h3", content: "new after completion"});
        const secondHandle = await harness.invoke({
            sessionId: session.session.metadata.sessionId,
            payload: {instruction: "fail"},
        });
        const second = await settleCompleted(history, secondHandle);
        expect(second.status).toBe("failed");
        expect(history.position).toBe(2);
        expect(history.settlements).toEqual([firstHandle.invocationId]);
        expect(observed.find((item) => item.invocationId === secondHandle.invocationId)?.unseen).toEqual(["h3"]);
        expect(countContent(model.requests[1]!.messages, "history:h3:new after completion")).toBe(1);
        await harness.dispose();
    });

    test("waiting/restart 在可继续前不 settle，公开 resume 完成后才 settle 并保留投影", async () => {
        const history = new FakeHistory([{id: "h1", content: "approval context"}]);
        const observed: HistoryObservation[] = [];
        const gated = defineTool({
            name: "gated",
            description: "等待宿主审批",
            parameters: objectSchema,
            approval: {request: () => ({prompt: "approve"})},
            execute: () => ({content: "approved"}),
        });
        const profile = historyProfile(history, observed, [gated]);
        const directory = await tempDirectory();
        const firstModel = new ScriptedModelRuntime<JsonValue>([{
            message: {
                role: "assistant",
                content: [{type: "toolCall", call: {id: "gated-1", name: "gated", arguments: {}}}],
                timestamp: 100,
            },
        }]);
        const firstHarness = new NeuroAgentHarness({
            store: new JsonlSessionStore({directory}),
            profiles: new ProfileRegistry().add(profile),
            model: firstModel,
        });
        const session = await firstHarness.createSession({profileKey: profile.manifest.key, initial: {}, hostContext: {}});
        const waitingHandle = await firstHarness.invoke({
            sessionId: session.session.metadata.sessionId,
            payload: {instruction: "wait"},
        });
        const waiting = await settleCompleted(history, waitingHandle);
        expect(waiting.status).toBe("waiting");
        expect(history.position).toBe(0);
        expect(history.settlements).toEqual([]);
        expect(countContent(firstModel.requests[0]!.messages, "history:h1:approval context")).toBe(1);
        await firstHarness.dispose();

        const resumedModel = new ScriptedModelRuntime<JsonValue>([assistant("resumed", 200)]);
        const resumedHarness = new NeuroAgentHarness({
            store: new JsonlSessionStore({directory}),
            profiles: new ProfileRegistry().add(profile),
            model: resumedModel,
        });
        const resumedHandle = await resumedHarness.resume(
            session.session.metadata.sessionId,
            waitingHandle.invocationId,
            [{toolCallId: "gated-1", approved: true}],
        );
        const completed = await settleCompleted(history, resumedHandle);
        expect(completed.status).toBe("completed");
        expect(history.position).toBe(1);
        expect(history.settlements).toEqual([waitingHandle.invocationId]);
        expect(observed.filter((item) => item.invocationId === waitingHandle.invocationId).map((item) => item.unseen))
            .toEqual([["h1"], ["h1"]]);
        expect(countContent(resumedModel.requests[0]!.messages, "history:h1:approval context")).toBe(1);
        const restored = await resumedHarness.snapshot(session.session.metadata.sessionId);
        const projected = invocationResultFromSnapshot(restored.session, waitingHandle.invocationId);
        expect(projected?.status).toBe("completed");
        expect(projected?.output).toBe("resumed");
        expect(projected?.persistence).toBe("confirmed");
        await resumedHarness.dispose();
    });

    test("aborted Invocation 不触发宿主 History settlement", async () => {
        const history = new FakeHistory([{id: "h1", content: "abort context"}]);
        const observed: HistoryObservation[] = [];
        const model = new AbortAwareModel();
        const profile = historyProfile(history, observed);
        const harness = new NeuroAgentHarness({
            abortGraceMs: 50,
            store: new MemorySessionStore(),
            profiles: new ProfileRegistry().add(profile),
            model,
        });
        const session = await harness.createSession({profileKey: profile.manifest.key, initial: {}, hostContext: {}});
        const handle = await harness.invoke({
            sessionId: session.session.metadata.sessionId,
            payload: {instruction: "abort"},
        });
        await model.started.promise;
        handle.abort();
        const result = await settleCompleted(history, handle);
        expect(result.status).toBe("aborted");
        expect(history.position).toBe(0);
        expect(history.settlements).toEqual([]);
        expect(observed[0]?.unseen).toEqual(["h1"]);
        expect(countContent(model.requests[0]!.messages, "history:h1:abort context")).toBe(1);
        await harness.dispose();
    });
});
