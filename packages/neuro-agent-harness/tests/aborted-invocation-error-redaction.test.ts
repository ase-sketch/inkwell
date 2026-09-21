import {describe, expect, test} from "bun:test";
import {
    NeuroAgentHarness,
    ProfileRegistry,
    defineProfile,
    defineSchema,
    defineTool,
    type JsonValue,
    type JsonObject,
    type ToolDefinition,
} from "../src/index.js";
import {MemorySessionStore} from "../src/storage/memory.js";
import {ScriptedModelRuntime} from "../src/testing/index.js";

const objectSchema = defineSchema<JsonObject>((value) => {
    if (value === null || typeof value !== "object" || Array.isArray(value)) {
        throw new Error("必须是 object");
    }
    return value;
});

function profile(key: string, tools?: readonly ToolDefinition<JsonValue, number, JsonObject>[]) {
    return defineProfile<JsonObject, JsonObject, JsonValue, number, JsonObject, JsonValue>({
        manifest: {key, name: key},
        initial: objectSchema,
        payload: objectSchema,
        prepare: () => ({
            systemPrompt: key,
            modelConfig: {},
            ...(tools ? {tools} : {}),
        }),
    });
}

describe("aborted Invocation error redaction", () => {
    test("cooperative abort 保留本地诊断，但不把 provider error 写入 durable Snapshot", async () => {
        let markStarted!: () => void;
        const started = new Promise<void>((resolve) => {
            markStarted = resolve;
        });
        const model = new ScriptedModelRuntime<JsonObject>([
            async (request) => new Promise<never>((_, reject) => {
                markStarted();
                request.signal.addEventListener("abort", () => reject(new Error("Request was aborted")), {once: true});
            }),
        ]);
        const harness = new NeuroAgentHarness({
            store: new MemorySessionStore(),
            profiles: new ProfileRegistry().add(profile("cooperative-redaction")),
            model,
        });

        try {
            const created = await harness.createSession({
                profileKey: "cooperative-redaction",
                initial: {},
                hostContext: {},
            });
            const handle = await harness.invoke({
                sessionId: created.session.metadata.sessionId,
                payload: {},
            });
            await started;
            handle.abort();

            const result = await handle.result();
            const snapshot = await harness.snapshot(created.session.metadata.sessionId);
            expect({
                resultStatus: result.status,
                localError: result.error?.message,
                durableError: snapshot.session.invocations[0]?.error,
            }).toEqual({
                resultStatus: "aborted",
                localError: "Request was aborted",
                durableError: undefined,
            });
        } finally {
            await harness.dispose();
        }
    });

    test("forced abort 不把 Harness 的强制终止说明写入 durable Snapshot 或恢复结果", async () => {
        let markStarted!: () => void;
        const started = new Promise<void>((resolve) => {
            markStarted = resolve;
        });
        const model = new ScriptedModelRuntime<JsonObject>([
            async () => {
                markStarted();
                return new Promise<never>(() => {});
            },
        ]);
        const harness = new NeuroAgentHarness({
            abortGraceMs: 5,
            store: new MemorySessionStore(),
            profiles: new ProfileRegistry().add(profile("forced-redaction")),
            model,
        });

        try {
            const created = await harness.createSession({
                profileKey: "forced-redaction",
                initial: {},
                hostContext: {},
            });
            const handle = await harness.invoke({
                sessionId: created.session.metadata.sessionId,
                payload: {},
            });
            await started;
            handle.abort();

            const result = await handle.result();
            const snapshot = await harness.snapshot(created.session.metadata.sessionId);
            expect({
                resultStatus: result.status,
                resultError: result.error,
                durableError: snapshot.session.invocations[0]?.error,
            }).toEqual({
                resultStatus: "aborted",
                resultError: undefined,
                durableError: undefined,
            });
        } finally {
            await harness.dispose();
        }
    });

    test("waiting Invocation 的 durable owner CAS abort 不保存 approval 取消说明", async () => {
        const approvalTool = defineTool({
            name: "needs_approval",
            description: "needs approval",
            parameters: objectSchema,
            approval: {
                request: () => ({prompt: "approve"}),
            },
            execute: () => ({content: "approved"}),
        });
        const waitingProfile = profile("waiting-redaction", [approvalTool]);
        const model = new ScriptedModelRuntime<JsonObject>([{
            message: {
                role: "assistant",
                content: [{
                    type: "toolCall",
                    call: {id: "redaction-approval", name: "needs_approval", arguments: {}},
                }],
                timestamp: 1,
            },
        }]);
        const harness = new NeuroAgentHarness({
            store: new MemorySessionStore(),
            profiles: new ProfileRegistry().add(waitingProfile),
            model,
        });

        try {
            const created = await harness.createSession({
                profileKey: "waiting-redaction",
                initial: {},
                hostContext: {},
            });
            const handle = await harness.invoke({
                sessionId: created.session.metadata.sessionId,
                payload: {},
            });
            expect((await handle.result()).status).toBe("waiting");

            await harness.abort(created.session.metadata.sessionId);
            const snapshot = await harness.snapshot(created.session.metadata.sessionId);
            expect({
                status: snapshot.session.invocations[0]?.status,
                durableError: snapshot.session.invocations[0]?.error,
            }).toEqual({
                status: "aborted",
                durableError: undefined,
            });
        } finally {
            await harness.dispose();
        }
    });

    test("failed Invocation 继续持久化 provider error", async () => {
        const model = new ScriptedModelRuntime<JsonObject>([
            async () => {
                throw new Error("provider failed");
            },
        ]);
        const harness = new NeuroAgentHarness({
            store: new MemorySessionStore(),
            profiles: new ProfileRegistry().add(profile("failed-retains-error")),
            model,
        });

        try {
            const created = await harness.createSession({
                profileKey: "failed-retains-error",
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
                resultError: snapshot.session.invocations[0]?.error?.message,
            }).toEqual({
                resultStatus: "failed",
                resultError: "provider failed",
            });
        } finally {
            await harness.dispose();
        }
    });

    test("legacy aborted Snapshot 的恢复 projection 也隐藏旧 error", async () => {
        const harness = new NeuroAgentHarness({
            store: new MemorySessionStore(),
            profiles: new ProfileRegistry().add(profile("legacy-redaction")),
            model: new ScriptedModelRuntime([]),
        });

        try {
            const created = await harness.createSession({
                profileKey: "legacy-redaction",
                initial: {},
                hostContext: {},
            });
            const snapshot = (await harness.snapshot(created.session.metadata.sessionId)).session;
            const invocationId = "legacy-aborted";
            const legacySnapshot = {
                ...snapshot,
                invocations: [{
                    id: invocationId,
                    sessionId: created.session.metadata.sessionId,
                    profileKey: "legacy-redaction",
                    profileVersion: 1,
                    caller: {kind: "user" as const},
                    messageIdentity: "user" as const,
                    input: {},
                    createdAt: 1,
                    status: "aborted" as const,
                    turnCount: 0,
                    error: {name: "AbortError", message: "legacy provider abort", phase: "abort" as const},
                    finishedAt: 2,
                }],
            };
            const projection = (harness as unknown as {
                resultFromSnapshot(
                    value: typeof legacySnapshot,
                    id: string,
                ): {error?: unknown} | undefined;
            }).resultFromSnapshot(legacySnapshot, invocationId);

            expect(projection).toBeDefined();
            expect(projection?.error).toBeUndefined();
        } finally {
            await harness.dispose();
        }
    });
});
