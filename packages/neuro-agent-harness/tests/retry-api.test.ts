import {describe, expect, test} from "bun:test";
import {
    AbortBoundaryError,
    HarnessAdmissionError,
    NeuroAgentHarness,
    ProfileRegistry,
    defineProfile,
    defineSchema,
    type AgentMessage,
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

function assistant(text: string, timestamp: number): Extract<AgentMessage, {role: "assistant"}> {
    return {role: "assistant", content: [{type: "text", text}], timestamp};
}

function registry(): ProfileRegistry {
    return new ProfileRegistry().add(defineProfile({
        manifest: {key: "retry-api", name: "Retry API"},
        initial: objectSchema,
        payload: objectSchema,
        prepare: () => ({systemPrompt: "retry", modelConfig: {}}),
    }));
}

// 第一百零五轮（C3）：retry options+signal 与错误面收敛。
describe("retry options 与错误面", () => {
    test("旧重载保持可用：retry(id, inv) 与 retry(id, inv, caller, messageIdentity)", async () => {
        const model = new ScriptedModelRuntime<JsonObject>([
            {message: assistant("first", 1)},
            {message: assistant("second", 2)},
            {message: assistant("third", 3)},
        ]);
        const harness = new NeuroAgentHarness({
            store: new MemorySessionStore(),
            profiles: registry(),
            model,
        });
        const created = await harness.createSession({profileKey: "retry-api", initial: {}, hostContext: {}});
        const sessionId = created.session.metadata.sessionId;
        const first = await harness.invoke({sessionId, payload: {n: 1}});
        await first.result();

        const retried = await harness.retry(sessionId, first.invocationId);
        expect((await retried.result()).status).toBe("completed");
        const retriedSystem = await harness.retry(sessionId, retried.invocationId, {kind: "user"}, "system");
        expect((await retriedSystem.result()).status).toBe("completed");
        const snapshot = await harness.snapshot(sessionId);
        const systemEntry = snapshot.session.entries.find((entry) => entry.kind === "agent.message" && entry.payload !== null && typeof entry.payload === "object" && !Array.isArray(entry.payload) && entry.payload.messageIdentity === "system");
        expect(systemEntry).toBeDefined();
        await harness.dispose();
    });

    test("retry options.signal 在运行中取消复用 bounded abort", async () => {
        let markStarted!: () => void;
        const started = new Promise<void>((resolve) => {
            markStarted = resolve;
        });
        const model = new ScriptedModelRuntime<JsonObject>([
            {message: assistant("first", 1)},
            async () => {
                markStarted();
                return new Promise<never>(() => {});
            },
        ]);
        const harness = new NeuroAgentHarness({
            abortGraceMs: 20,
            store: new MemorySessionStore(),
            profiles: registry(),
            model,
        });
        const created = await harness.createSession({profileKey: "retry-api", initial: {}, hostContext: {}});
        const sessionId = created.session.metadata.sessionId;
        const first = await harness.invoke({sessionId, payload: {}});
        await first.result();

        const controller = new AbortController();
        const retried = await harness.retry(sessionId, first.invocationId, {signal: controller.signal});
        await started;
        controller.abort(new Error("parent cancelled"));
        const result = await retried.result();
        expect(result.status).toBe("aborted");
        await harness.dispose();
    });

    test("pre-aborted signal 不创建新的 durable Invocation", async () => {
        const model = new ScriptedModelRuntime<JsonObject>([{message: assistant("first", 1)}]);
        const harness = new NeuroAgentHarness({
            store: new MemorySessionStore(),
            profiles: registry(),
            model,
        });
        const created = await harness.createSession({profileKey: "retry-api", initial: {}, hostContext: {}});
        const sessionId = created.session.metadata.sessionId;
        const first = await harness.invoke({sessionId, payload: {}});
        await first.result();
        const before = (await harness.snapshot(sessionId)).session.invocations.length;

        const controller = new AbortController();
        controller.abort(new Error("already cancelled"));
        await expect(harness.retry(sessionId, first.invocationId, {signal: controller.signal})).rejects.toThrow();
        const after = (await harness.snapshot(sessionId)).session.invocations.length;
        expect(after).toBe(before);
        await harness.dispose();
    });

    test("公共 admission 失败抛导出的 HarnessAdmissionError（message 不变）", async () => {
        const harness = new NeuroAgentHarness({
            store: new MemorySessionStore(),
            profiles: registry(),
            model: {runTurn: async () => ({message: assistant("x", 1)})},
        });
        const created = await harness.createSession({profileKey: "retry-api", initial: {}, hostContext: {}});
        const sessionId = created.session.metadata.sessionId;

        await expect(harness.steer(sessionId, {})).rejects.toThrow(HarnessAdmissionError);
        await expect(harness.compactSession(sessionId, {keepRecentTokens: 10})).rejects.toThrow(HarnessAdmissionError);
        await expect(harness.cancelFollowUp(sessionId, "missing")).rejects.toThrow(HarnessAdmissionError);
        await expect(harness.retry(sessionId, "missing-invocation")).rejects.toThrow(HarnessAdmissionError);
        expect(new HarnessAdmissionError("x").name).toBe("HarnessAdmissionError");
        expect(AbortBoundaryError.name).toBe("AbortBoundaryError");
        await harness.dispose();
    });
});
