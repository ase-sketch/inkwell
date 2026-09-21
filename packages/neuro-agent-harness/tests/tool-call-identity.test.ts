import {describe, expect, test} from "bun:test";
import {
    NeuroAgentHarness,
    ProfileRegistry,
    createAgentMessageEntryDraft,
    defineSchema,
    defineProfile,
    defineTool,
    invocationUsage,
    jsonValueSchema,
    type AgentMessage,
    type AssistantContent,
    type JsonObject,
} from "../src/index.js";
import {MemorySessionStore} from "../src/storage/memory.js";
import {ScriptedModelRuntime} from "../src/testing/index.js";

const objectSchema = defineSchema<JsonObject>((value) => {
    if (value === null || typeof value !== "object" || Array.isArray(value)) {
        throw new Error("expected object");
    }
    return value;
}, {type: "object"});

function assistant(content: readonly AssistantContent[], timestamp: number) {
    return {
        message: {
            role: "assistant" as const,
            content,
            timestamp,
        },
    };
}

function persistedMessages(entries: readonly {kind: string; payload: unknown}[]): AgentMessage[] {
    return entries.flatMap((entry) => {
        if (entry.kind !== "agent.message"
            || entry.payload === null
            || typeof entry.payload !== "object"
            || Array.isArray(entry.payload)
            || !("message" in entry.payload)) {
            return [];
        }
        return [entry.payload.message as AgentMessage];
    });
}

describe("Tool Call identity admission", () => {
    test("同一 assistant message 的重复 Tool Call ID 在副作用和持久化前失败", async () => {
        let executions = 0;
        const sideEffect = defineTool({
            name: "side_effect",
            description: "records one external side effect",
            parameters: jsonValueSchema,
            execute() {
                executions += 1;
                return {content: "executed"};
            },
        });
        const profile = defineProfile({
            manifest: {key: "duplicate-tool-call", name: "Duplicate Tool Call"},
            initial: jsonValueSchema,
            payload: jsonValueSchema,
            prepare: () => ({
                systemPrompt: "test",
                modelConfig: {},
                tools: [sideEffect],
                limits: {maxTurns: 2},
            }),
        });
        const model = new ScriptedModelRuntime([
            assistant([
                {type: "toolCall", call: {id: "duplicate", name: "side_effect", arguments: {value: 1}}},
                {type: "toolCall", call: {id: "duplicate", name: "side_effect", arguments: {value: 2}}},
            ], 1),
            assistant([{type: "text", text: "done"}], 2),
        ]);
        const harness = new NeuroAgentHarness({
            store: new MemorySessionStore(),
            profiles: new ProfileRegistry().add(profile),
            model,
        });
        const created = await harness.createSession({
            profileKey: "duplicate-tool-call",
            initial: {},
            hostContext: {},
        });

        const result = await (await harness.invoke({
            sessionId: created.session.metadata.sessionId,
            payload: {},
        })).result();
        const snapshot = await harness.snapshot(created.session.metadata.sessionId);
        const messages = persistedMessages(snapshot.session.entries);

        expect(result.status).toBe("failed");
        expect(result.error?.message).toContain("Tool Call ID");
        expect(result.error?.message).toContain("duplicate");
        expect(executions).toBe(0);
        expect(messages.filter((message) => message.role === "assistant")).toEqual([]);
        expect(messages.filter((message) => message.role === "toolResult")).toEqual([]);
        await harness.dispose();
    });

    test("重复 Tool Call ID 失败仍保留已发生的 Model usage", async () => {
        let executions = 0;
        const sideEffect = defineTool({
            name: "usage_side_effect",
            description: "must not execute when identity admission fails",
            parameters: jsonValueSchema,
            execute() {
                executions += 1;
                return {content: "executed"};
            },
        });
        const profile = defineProfile({
            manifest: {key: "duplicate-tool-call-usage", name: "Duplicate Tool Call Usage"},
            initial: jsonValueSchema,
            payload: jsonValueSchema,
            prepare: () => ({
                systemPrompt: "test",
                modelConfig: {},
                tools: [sideEffect],
                limits: {maxTurns: 2},
            }),
        });
        const model = new ScriptedModelRuntime([{
            message: {
                role: "assistant",
                content: [{
                    type: "toolCall",
                    call: {id: "duplicate-usage", name: "usage_side_effect", arguments: {value: 1}},
                }, {
                    type: "toolCall",
                    call: {id: "duplicate-usage", name: "usage_side_effect", arguments: {value: 2}},
                }],
                timestamp: 1,
                usage: {input: 2, output: 3, total: 5},
            },
        }]);
        const harness = new NeuroAgentHarness({
            store: new MemorySessionStore(),
            profiles: new ProfileRegistry().add(profile),
            model,
        });
        const created = await harness.createSession({
            profileKey: "duplicate-tool-call-usage",
            initial: {},
            hostContext: {},
        });

        const result = await (await harness.invoke({
            sessionId: created.session.metadata.sessionId,
            payload: {},
        })).result();
        const snapshot = await harness.snapshot(created.session.metadata.sessionId);
        const messages = persistedMessages(snapshot.session.entries);

        expect(result.status).toBe("failed");
        expect(result.usage).toEqual({input: 2, output: 3, total: 5});
        expect(invocationUsage(snapshot.session, result.invocationId)).toEqual({input: 2, output: 3, total: 5});
        expect(executions).toBe(0);
        expect(messages.filter((message) => message.role === "assistant")).toEqual([]);
        await harness.dispose();
    });

    test("parallel Tool batch 的重复 ID 也在调度前失败", async () => {
        let executions = 0;
        const sideEffect = defineTool({
            name: "parallel_side_effect",
            description: "must not enter parallel scheduling with duplicate identity",
            parameters: jsonValueSchema,
            execute() {
                executions += 1;
                return {content: "executed"};
            },
        });
        const profile = defineProfile({
            manifest: {key: "parallel-duplicate-tool-call", name: "Parallel Duplicate Tool Call"},
            initial: jsonValueSchema,
            payload: jsonValueSchema,
            prepare: () => ({
                systemPrompt: "test",
                modelConfig: {},
                tools: [sideEffect],
                toolExecution: "parallel" as const,
                limits: {maxTurns: 2},
            }),
        });
        const harness = new NeuroAgentHarness({
            store: new MemorySessionStore(),
            profiles: new ProfileRegistry().add(profile),
            model: new ScriptedModelRuntime([
                assistant([
                    {type: "toolCall", call: {id: "parallel-duplicate", name: "parallel_side_effect", arguments: {value: 1}}},
                    {type: "toolCall", call: {id: "parallel-duplicate", name: "parallel_side_effect", arguments: {value: 2}}},
                ], 1),
            ]),
        });
        const created = await harness.createSession({
            profileKey: "parallel-duplicate-tool-call",
            initial: {},
            hostContext: {},
        });

        const result = await (await harness.invoke({
            sessionId: created.session.metadata.sessionId,
            payload: {},
        })).result();

        expect(result.status).toBe("failed");
        expect(executions).toBe(0);
        await harness.dispose();
    });

    test("当前可见 transcript 中跨 turn 复用 Tool Call ID 在新 approval 前失败", async () => {
        const executions: string[] = [];
        const sideEffect = defineTool({
            name: "gated_side_effect",
            description: "records an optionally gated side effect",
            parameters: objectSchema,
            approval: {
                request(argumentsValue) {
                    return argumentsValue.gated === true ? {prompt: "approve"} : null;
                },
            },
            execute(argumentsValue) {
                executions.push(String(argumentsValue.step));
                return {content: `executed:${String(argumentsValue.step)}`};
            },
        });
        const profile = defineProfile({
            manifest: {key: "reused-tool-call", name: "Reused Tool Call"},
            initial: objectSchema,
            payload: objectSchema,
            prepare: () => ({
                systemPrompt: "test",
                modelConfig: {},
                tools: [sideEffect],
                limits: {maxTurns: 3},
            }),
        });
        const model = new ScriptedModelRuntime([
            assistant([{
                type: "toolCall",
                call: {id: "reused", name: "gated_side_effect", arguments: {step: "first", gated: false}},
            }], 1),
            assistant([{
                type: "toolCall",
                call: {id: "reused", name: "gated_side_effect", arguments: {step: "second", gated: true}},
            }], 2),
        ]);
        const harness = new NeuroAgentHarness({
            store: new MemorySessionStore(),
            profiles: new ProfileRegistry().add(profile),
            model,
        });
        const created = await harness.createSession({
            profileKey: "reused-tool-call",
            initial: {},
            hostContext: {},
        });

        const result = await (await harness.invoke({
            sessionId: created.session.metadata.sessionId,
            payload: {},
        })).result();
        const snapshot = await harness.snapshot(created.session.metadata.sessionId);
        const messages = persistedMessages(snapshot.session.entries);

        expect(result.status).toBe("failed");
        expect(result.error?.message).toContain("Tool Call ID");
        expect(result.error?.message).toContain("reused");
        expect(result.pendingApprovals).toBeUndefined();
        expect(executions).toEqual(["first"]);
        expect(messages.filter((message) => message.role === "assistant")).toHaveLength(1);
        expect(messages.filter((message) => message.role === "toolResult")).toHaveLength(1);
        await harness.dispose();
    });

    test("空 Tool Call ID 在副作用和持久化前失败", async () => {
        let executions = 0;
        const sideEffect = defineTool({
            name: "empty_identity_side_effect",
            description: "must not execute without a call identity",
            parameters: jsonValueSchema,
            execute() {
                executions += 1;
                return {content: "executed"};
            },
        });
        const profile = defineProfile({
            manifest: {key: "empty-tool-call", name: "Empty Tool Call"},
            initial: jsonValueSchema,
            payload: jsonValueSchema,
            prepare: () => ({
                systemPrompt: "test",
                modelConfig: {},
                tools: [sideEffect],
                limits: {maxTurns: 2},
            }),
        });
        const model = new ScriptedModelRuntime([
            assistant([{
                type: "toolCall",
                call: {id: "   ", name: "empty_identity_side_effect", arguments: {}},
            }], 1),
            assistant([{type: "text", text: "done"}], 2),
        ]);
        const harness = new NeuroAgentHarness({
            store: new MemorySessionStore(),
            profiles: new ProfileRegistry().add(profile),
            model,
        });
        const created = await harness.createSession({
            profileKey: "empty-tool-call",
            initial: {},
            hostContext: {},
        });

        const result = await (await harness.invoke({
            sessionId: created.session.metadata.sessionId,
            payload: {},
        })).result();
        const snapshot = await harness.snapshot(created.session.metadata.sessionId);
        const messages = persistedMessages(snapshot.session.entries);

        expect(result.status).toBe("failed");
        expect(result.error?.message).toContain("Tool Call ID 不能为空");
        expect(executions).toBe(0);
        expect(messages.filter((message) => message.role === "assistant")).toEqual([]);
        expect(messages.filter((message) => message.role === "toolResult")).toEqual([]);
        await harness.dispose();
    });

    test("非字符串 Tool Call ID 在副作用和持久化前失败", async () => {
        let executions = 0;
        const sideEffect = defineTool({
            name: "malformed_identity_side_effect",
            description: "must not execute with a non-string call identity",
            parameters: jsonValueSchema,
            execute() {
                executions += 1;
                return {content: "executed"};
            },
        });
        const profile = defineProfile({
            manifest: {key: "malformed-tool-call", name: "Malformed Tool Call"},
            initial: jsonValueSchema,
            payload: jsonValueSchema,
            prepare: () => ({
                systemPrompt: "test",
                modelConfig: {},
                tools: [sideEffect],
                limits: {maxTurns: 2},
            }),
        });
        const malformedIdentity = {trim: () => "looks-valid"};
        const model = new ScriptedModelRuntime([
            assistant([{
                type: "toolCall",
                call: {
                    id: malformedIdentity as unknown as string,
                    name: "malformed_identity_side_effect",
                    arguments: {},
                },
            }], 1),
            assistant([{type: "text", text: "done"}], 2),
        ]);
        const harness = new NeuroAgentHarness({
            store: new MemorySessionStore(),
            profiles: new ProfileRegistry().add(profile),
            model,
        });
        const created = await harness.createSession({
            profileKey: "malformed-tool-call",
            initial: {},
            hostContext: {},
        });

        const result = await (await harness.invoke({
            sessionId: created.session.metadata.sessionId,
            payload: {},
        })).result();
        const snapshot = await harness.snapshot(created.session.metadata.sessionId);
        const messages = persistedMessages(snapshot.session.entries);

        expect(result.status).toBe("failed");
        expect(result.error?.message).toContain("Tool Call ID 必须是非空字符串");
        expect(executions).toBe(0);
        expect(messages.filter((message) => message.role === "assistant")).toEqual([]);
        expect(messages.filter((message) => message.role === "toolResult")).toEqual([]);
        await harness.dispose();
    });

    test("legacy waiting transcript 按 occurrence 匹配复用 ID 并执行新的已批准 Tool", async () => {
        const executions: string[] = [];
        const sideEffect = defineTool({
            name: "legacy_gated_side_effect",
            description: "executes the pending legacy call",
            parameters: objectSchema,
            approval: {request: () => ({prompt: "approve"})},
            execute(argumentsValue) {
                executions.push(String(argumentsValue.step));
                return {content: `executed:${String(argumentsValue.step)}`};
            },
        });
        const profile = defineProfile({
            manifest: {key: "legacy-reused-tool-call", name: "Legacy Reused Tool Call"},
            initial: objectSchema,
            payload: objectSchema,
            prepare: () => ({
                systemPrompt: "test",
                modelConfig: {},
                tools: [sideEffect],
                limits: {maxTurns: 3},
            }),
        });
        const store = new MemorySessionStore();
        const created = await store.create({
            profileKey: "legacy-reused-tool-call",
            initial: {},
            hostContext: {},
        });
        const invocationId = "legacy-waiting";
        const firstCall = assistant([{
            type: "toolCall",
            call: {id: "legacy-reused", name: "legacy_gated_side_effect", arguments: {step: "first"}},
        }], 1).message;
        const firstResult: AgentMessage = {
            role: "toolResult",
            toolCallId: "legacy-reused",
            toolName: "legacy_gated_side_effect",
            content: "legacy:first",
            isError: false,
            timestamp: 2,
        };
        const pendingCall = assistant([{
            type: "toolCall",
            call: {id: "legacy-reused", name: "legacy_gated_side_effect", arguments: {step: "second"}},
        }], 3).message;
        await store.commit({
            target: created.metadata.sessionId,
            expectedVersion: 0,
            cause: "test.legacy-tool-call.waiting",
            operations: [{
                type: "startInvocation",
                invocation: {
                    id: invocationId,
                    sessionId: created.metadata.sessionId,
                    profileKey: "legacy-reused-tool-call",
                    caller: {kind: "user"},
                    input: {},
                    createdAt: 1,
                },
            }, {
                type: "appendEntries",
                entries: [
                    createAgentMessageEntryDraft(firstCall, {turn: 1, invocationId}),
                    createAgentMessageEntryDraft(firstResult, {turn: 1, invocationId}),
                    createAgentMessageEntryDraft(pendingCall, {turn: 2, invocationId}),
                ],
            }, {
                type: "waitInvocation",
                invocationId,
                turnCount: 2,
                pendingApprovals: [{
                    toolCallId: "legacy-reused",
                    toolName: "legacy_gated_side_effect",
                    prompt: "approve",
                    arguments: {step: "second"},
                }],
            }],
        });
        const harness = new NeuroAgentHarness({
            store,
            profiles: new ProfileRegistry().add(profile),
            model: new ScriptedModelRuntime([
                assistant([{type: "text", text: "done"}], 4),
            ]),
        });

        const result = await (await harness.resume(created.metadata.sessionId, invocationId, [{
            toolCallId: "legacy-reused",
            approved: true,
        }])).result();
        const snapshot = await harness.snapshot(created.metadata.sessionId);
        const toolResults = persistedMessages(snapshot.session.entries)
            .filter((message): message is Extract<AgentMessage, {role: "toolResult"}> => message.role === "toolResult");

        expect(result.status).toBe("completed");
        expect(executions).toEqual(["second"]);
        expect(toolResults.map((message) => message.content)).toEqual(["legacy:first", "executed:second"]);
        expect(snapshot.session.invocations[0]?.pendingApprovals).toBeUndefined();
        await harness.dispose();
    });

    test("legacy duplicate occurrence 不能用一个旧 result 闭合悬挂 call（启动期拒绝）", async () => {
        const store = new MemorySessionStore();
        const created = await store.create({
            profileKey: "legacy-pending-compaction",
            initial: {},
            hostContext: {},
        });
        const firstCall = assistant([{
            type: "toolCall",
            call: {id: "legacy-pending", name: "legacy_tool", arguments: {step: "first"}},
        }], 1).message;
        const firstResult: AgentMessage = {
            role: "toolResult",
            toolCallId: "legacy-pending",
            toolName: "legacy_tool",
            content: "legacy:first",
            isError: false,
            timestamp: 2,
        };
        const unmatchedCall = assistant([{
            type: "toolCall",
            call: {id: "legacy-pending", name: "legacy_tool", arguments: {step: "second"}},
        }], 3).message;
        await store.commit({
            target: created.metadata.sessionId,
            expectedVersion: 0,
            cause: "test.legacy-tool-call.pending-compaction",
            operations: [{
                type: "appendEntries",
                entries: [
                    createAgentMessageEntryDraft(firstCall, {turn: 1}),
                    createAgentMessageEntryDraft(firstResult, {turn: 1}),
                    createAgentMessageEntryDraft(unmatchedCall, {turn: 2}),
                ],
            }],
        });
        let summaryCalls = 0;
        const profile = defineProfile({
            manifest: {key: "legacy-pending-compaction", name: "Legacy Pending Compaction"},
            initial: objectSchema,
            payload: objectSchema,
            prepare: () => ({
                systemPrompt: "test",
                modelConfig: {},
                compaction: {triggerTokens: 2, keepRecentTokens: 1},
                limits: {maxTurns: 1},
            }),
        });
        const model = new ScriptedModelRuntime([
            assistant([{type: "text", text: "done"}], 4),
        ]);
        const harness = new NeuroAgentHarness({
            store,
            profiles: new ProfileRegistry().add(profile),
            model,
            compactor: {
                estimate: () => 1,
                async summarize() {
                    summaryCalls += 1;
                    return "summary";
                },
            },
        });

        // 第八十八轮起，悬挂 Tool Call 在启动入口即被拒绝（不再先启动
        // Invocation 再在 compaction 阶段失败），语义比原断言更强。
        await expect(harness.invoke({
            sessionId: created.metadata.sessionId,
            payload: {},
        })).rejects.toThrow(/存在未完成 Tool Call，不能启动新 Invocation/);
        const snapshot = await harness.snapshot(created.metadata.sessionId);

        expect(summaryCalls).toBe(0);
        expect(model.requests).toHaveLength(0);
        expect(snapshot.session.invocations).toHaveLength(0);
        expect(snapshot.session.entries.some((entry) => entry.kind === "agent.compaction")).toBe(false);
        await harness.dispose();
    });
});
