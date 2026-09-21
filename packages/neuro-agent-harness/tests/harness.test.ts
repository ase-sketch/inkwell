import {describe, expect, test} from "bun:test";
import {
    NeuroAgentHarness,
    InvocationConflictError,
    InvocationNotRetryableError,
    ProfileRegistry,
    defineCapability,
    defineProfile,
    defineProfileFacet,
    defineSchema,
    defineTool,
    type AssistantContent,
    type JsonObject,
    type JsonValue,
} from "../src/index.js";
import {MemorySessionStore} from "../src/storage/memory.js";
import {ScriptedModelRuntime} from "../src/testing/index.js";

interface NeuroHostContext extends JsonObject {
    projectWorkspace: string;
    profileHome: string;
}

const objectSchema = defineSchema<JsonObject>((value) => {
    if (value === null || typeof value !== "object" || Array.isArray(value)) {
        throw new Error("必须是 object");
    }
    return value;
}, {type: "object"});

function assistant(content: string | readonly AssistantContent[], timestamp = 10) {
    return {
        message: {
            role: "assistant" as const,
            content: typeof content === "string" ? [{type: "text" as const, text: content}] : content,
            timestamp,
            usage: {input: 2, output: 3, total: 5},
        },
    };
}

describe("NeuroAgentHarness", () => {
    test("完成工具循环，并在下一 turn 前持久化 toolResult", async () => {
        const variables = defineCapability<"variables", {read(name: string): string}>("variables");
        let capabilityClosed = false;
        const tool = defineTool({
            name: "lookup",
            description: "读取变量",
            parameters: objectSchema,
            execute(argumentsValue, context) {
                return {
                    content: context.capabilities.require(variables).read(String(argumentsValue.name)),
                    writePlans: [{
                        target: context.sessionId,
                        expectedVersion: context.snapshot.version,
                        cause: "tool.variables.read",
                        operations: [{type: "appendEntries", entries: [{kind: "variable.read", payload: argumentsValue}]}],
                    }],
                };
            },
        });
        const profile = defineProfile({
            manifest: {key: "rewrite", name: "AI 改写"},
            initial: objectSchema,
            payload: objectSchema,
            output: defineSchema<string>((value) => {
                if (typeof value !== "string") throw new Error("output 必须是 string");
                return value;
            }),
            requiredCapabilities: [variables],
            facets: [defineProfileFacet("lowCodeForm", {fields: [{name: "instruction", type: "text"}]})],
            hooks: [{
                name: "dynamic-context",
                stage: "beforeTurn" as const,
                run(context) {
                    return {runtimeMessages: [{role: "user", content: `dynamic turn ${context.turn}`, timestamp: 1}]};
                },
            }],
            prepare(context) {
                expect(context.hostContext.projectWorkspace).toBe("book-a");
                return {systemPrompt: "rewrite", userMessage: "custom input", modelConfig: {}, tools: [tool], limits: {maxTurns: 3}};
            },
        });
        const model = new ScriptedModelRuntime([
            (request) => {
                expect(JSON.stringify(request.messages)).toContain("dynamic turn 1");
                expect(JSON.stringify(request.messages)).toContain("custom input");
                return assistant([{type: "toolCall", call: {id: "call-1", name: "lookup", arguments: {name: "tone"}}}]);
            },
            (request) => {
                expect(request.messages.some((message) => message.role === "toolResult")).toBe(true);
                expect(JSON.stringify(request.messages)).toContain("dynamic turn 2");
                expect(JSON.stringify(request.messages)).not.toContain("dynamic turn 1");
                return assistant("改写完成", 11);
            },
        ]);
        const registry = new ProfileRegistry<number, NeuroHostContext>().add(profile);
        const harness = new NeuroAgentHarness({
            store: new MemorySessionStore<number, NeuroHostContext>(),
            profiles: registry,
            model,
            capabilities: [{
                capability: variables,
                open: () => ({read: (name: string) => name === "tone" ? "克制" : ""}),
                close: () => { capabilityClosed = true; },
            }],
        });
        const created = await harness.createSession({
            profileKey: "rewrite",
            initial: {document: "chapter-1"},
            hostContext: {projectWorkspace: "book-a", profileHome: "profiles/rewrite"},
        });
        const handle = await harness.invoke({sessionId: created.session.metadata.sessionId, payload: {instruction: "改写"}});
        const result = await handle.result();
        expect(result.status).toBe("completed");
        expect(result.output).toBe("改写完成");
        expect(result.usage.total).toBe(10);
        expect(capabilityClosed).toBe(true);
        const snapshot = await harness.snapshot(created.session.metadata.sessionId);
        expect(snapshot.session.entries.map((entry) => entry.kind)).toEqual([
            "agent.message",
            "agent.message",
            "variable.read",
            "agent.message",
            "agent.message",
            "harness.invocation.usage",
        ]);
        expect(snapshot.session.invocations[0]?.status).toBe("completed");
        expect(registry.facets("rewrite")[0]?.name).toBe("lowCodeForm");
    });

    test("hook 通过 Effect 合并，不获得 Store", async () => {
        const stages: string[] = [];
        const profile = defineProfile({
            manifest: {key: "hooks", name: "Hooks"},
            initial: objectSchema,
            payload: objectSchema,
            hooks: [{
                name: "after-turn",
                stage: "afterTurn" as const,
                run(context) {
                    stages.push(`hook:${context.stage}`);
                    return {runtimeMessages: [{role: "user", content: "after-turn context", timestamp: 1}]};
                },
            }, {
                name: "settle",
                stage: "settleRun" as const,
                run(context) {
                    stages.push(`hook:${context.stage}`);
                    return {output: "hook-output"};
                },
            }],
            prepare: () => ({systemPrompt: "test", modelConfig: {}}),
        });
        const model = new ScriptedModelRuntime([assistant("model-output")]);
        const harness = new NeuroAgentHarness({
            store: new MemorySessionStore<number, NeuroHostContext>(),
            profiles: new ProfileRegistry<number, NeuroHostContext>().add(profile),
            model,
        });
        const session = await harness.createSession({profileKey: "hooks", initial: {}, hostContext: {projectWorkspace: "p", profileHome: "h"}});
        const result = await (await harness.invoke({sessionId: session.session.metadata.sessionId, payload: {}})).result();
        expect(result.output).toBe("hook-output");
        expect(stages).toEqual(["hook:settleRun"]);
    });

    test("自然停止原因通过公开结果和持久快照恢复", async () => {
        const profile = defineProfile({
            manifest: {key: "natural-stop", name: "自然停止"},
            initial: objectSchema,
            payload: objectSchema,
            prepare: () => ({systemPrompt: "test", modelConfig: {}}),
        });
        const harness = new NeuroAgentHarness({
            store: new MemorySessionStore<number, NeuroHostContext>(),
            profiles: new ProfileRegistry<number, NeuroHostContext>().add(profile),
            model: new ScriptedModelRuntime([assistant("自然结束")]),
        });
        const session = await harness.createSession({profileKey: "natural-stop", initial: {}, hostContext: {projectWorkspace: "p", profileHome: "h"}});

        const result = await (await harness.invoke({sessionId: session.session.metadata.sessionId, payload: {}})).result();

        expect(result.terminationReason).toBe("natural_stop");
        const snapshot = await harness.snapshot(session.session.metadata.sessionId);
        expect(snapshot.session.invocations[0]?.terminationReason).toBe("natural_stop");
    });

    test("maxTurns 进入 settleRun 并允许 Profile 产出部分结果", async () => {
        const edit = defineTool({
            name: "edit",
            description: "记录一次编辑",
            parameters: objectSchema,
            execute: () => ({content: "已编辑"}),
        });
        const profile = defineProfile({
            manifest: {key: "max-turns", name: "轮次上限"},
            initial: objectSchema,
            payload: objectSchema,
            output: objectSchema,
            hooks: [{
                name: "partial-on-max-turns",
                stage: "settleRun" as const,
                run(context) {
                    expect(context.terminationReason).toBe("max_turns");
                    return {output: {partial: true}};
                },
            }],
            prepare: () => ({systemPrompt: "test", modelConfig: {}, tools: [edit], limits: {maxTurns: 1}}),
        });
        const harness = new NeuroAgentHarness({
            store: new MemorySessionStore<number, NeuroHostContext>(),
            profiles: new ProfileRegistry<number, NeuroHostContext>().add(profile),
            model: new ScriptedModelRuntime([assistant([{type: "toolCall", call: {id: "edit-1", name: "edit", arguments: {}}}])]),
        });
        const session = await harness.createSession({profileKey: "max-turns", initial: {}, hostContext: {projectWorkspace: "p", profileHome: "h"}});

        const result = await (await harness.invoke({sessionId: session.session.metadata.sessionId, payload: {}})).result();

        expect(result.status).toBe("completed");
        expect(result.terminationReason).toBe("max_turns");
        expect(result.output).toEqual({partial: true});
    });

    test("Tool terminate 使用 tool_terminate 原因完成", async () => {
        const finish = defineTool({
            name: "finish",
            description: "完成",
            parameters: objectSchema,
            execute: () => ({content: "完成", output: "done", terminate: true}),
        });
        const profile = defineProfile({
            manifest: {key: "tool-terminate", name: "工具终止"},
            initial: objectSchema,
            payload: objectSchema,
            output: defineSchema<string>((value) => {
                if (typeof value !== "string") throw new Error("output 必须是 string");
                return value;
            }),
            prepare: () => ({systemPrompt: "test", modelConfig: {}, tools: [finish]}),
        });
        const harness = new NeuroAgentHarness({
            store: new MemorySessionStore<number, NeuroHostContext>(),
            profiles: new ProfileRegistry<number, NeuroHostContext>().add(profile),
            model: new ScriptedModelRuntime([assistant([{type: "toolCall", call: {id: "finish-1", name: "finish", arguments: {}}}])]),
        });
        const session = await harness.createSession({profileKey: "tool-terminate", initial: {}, hostContext: {projectWorkspace: "p", profileHome: "h"}});

        const result = await (await harness.invoke({sessionId: session.session.metadata.sessionId, payload: {}})).result();

        expect(result.status).toBe("completed");
        expect(result.terminationReason).toBe("tool_terminate");
        expect(result.output).toBe("done");
    });

    test("abort 结束为 aborted，retry 创建新 Invocation 并记录 retryOf", async () => {
        let markModelStarted: (() => void) | undefined;
        const modelStarted = new Promise<void>((resolve) => {
            markModelStarted = resolve;
        });
        const profile = defineProfile({
            manifest: {key: "abort", name: "Abort"},
            initial: objectSchema,
            payload: objectSchema,
            prepare: () => ({systemPrompt: "test", modelConfig: {}}),
        });
        const model = new ScriptedModelRuntime([
            async (request) => new Promise((resolve, reject) => {
                markModelStarted?.();
                if (request.signal.aborted) {
                    reject(new Error("cancelled"));
                    return;
                }
                request.signal.addEventListener("abort", () => reject(new Error("cancelled")), {once: true});
            }),
            assistant("retry-ok"),
        ]);
        const harness = new NeuroAgentHarness({
            store: new MemorySessionStore<number, NeuroHostContext>(),
            profiles: new ProfileRegistry<number, NeuroHostContext>().add(profile),
            model,
        });
        const session = await harness.createSession({profileKey: "abort", initial: {}, hostContext: {projectWorkspace: "p", profileHome: "h"}});
        const first = await harness.invoke({sessionId: session.session.metadata.sessionId, payload: {value: 1}});
        await bounded(modelStarted, "model start");
        first.abort();
        expect((await bounded(first.result(), "abort result")).status).toBe("aborted");
        const retried = await harness.retry(session.session.metadata.sessionId, first.invocationId, {kind: "system", name: "retry-test"});
        expect((await bounded(retried.result(), "retry result")).status).toBe("completed");
        const snapshot = await harness.snapshot(session.session.metadata.sessionId);
        expect(snapshot.session.invocations).toHaveLength(2);
        expect(snapshot.session.invocations[1]?.retryOf).toBe(first.invocationId);
        expect(snapshot.session.invocations[1]?.caller).toEqual({kind: "system", name: "retry-test"});
    });

    test("Invocation 冲突和不可重试状态使用可识别错误", async () => {
        let markStarted!: () => void;
        const started = new Promise<void>((resolve) => { markStarted = resolve; });
        const profile = defineProfile({
            manifest: {key: "conflict", name: "冲突"},
            initial: objectSchema,
            payload: objectSchema,
            prepare: () => ({systemPrompt: "test", modelConfig: {}}),
        });
        const harness = new NeuroAgentHarness({
            store: new MemorySessionStore<number, NeuroHostContext>(),
            profiles: new ProfileRegistry<number, NeuroHostContext>().add(profile),
            model: new ScriptedModelRuntime([async (request) => new Promise((_, reject) => {
                markStarted();
                request.signal.addEventListener("abort", () => reject(new Error("aborted")), {once: true});
            })]),
        });
        const session = await harness.createSession({profileKey: "conflict", initial: {}, hostContext: {projectWorkspace: "p", profileHome: "h"}});
        const first = await harness.invoke({sessionId: session.session.metadata.sessionId, payload: {}});
        await started;

        await expect(harness.invoke({sessionId: session.session.metadata.sessionId, payload: {}})).rejects.toBeInstanceOf(InvocationConflictError);
        await expect(harness.retry(session.session.metadata.sessionId, first.invocationId)).rejects.toBeInstanceOf(InvocationNotRetryableError);
        first.abort();
        await first.result();
    });

    test("缺失 Capability 在模型调用前失败", async () => {
        const workspace = defineCapability<"workspace", {root: string}>("workspace");
        const profile = defineProfile({
            manifest: {key: "needs-workspace", name: "Needs Workspace"},
            initial: objectSchema,
            payload: objectSchema,
            requiredCapabilities: [workspace],
            prepare: () => ({systemPrompt: "test", modelConfig: {}}),
        });
        const model = new ScriptedModelRuntime([]);
        const harness = new NeuroAgentHarness({
            store: new MemorySessionStore<number, NeuroHostContext>(),
            profiles: new ProfileRegistry<number, NeuroHostContext>().add(profile),
            model,
        });
        const session = await harness.createSession({profileKey: "needs-workspace", initial: {}, hostContext: {projectWorkspace: "p", profileHome: "h"}});
        const result = await (await harness.invoke({sessionId: session.session.metadata.sessionId, payload: {}})).result();
        expect(result.status).toBe("failed");
        expect(result.error?.message).toContain("Capability Provider");
        expect(model.requests).toHaveLength(0);
    });

    test("abort 时 settleFailure 可以持久化部分 output", async () => {
        const profile = defineProfile({
            manifest: {key: "partial-abort", name: "部分结果"},
            initial: objectSchema,
            payload: objectSchema,
            output: defineSchema<string>((value) => {
                if (typeof value !== "string") throw new Error("output 必须是 string");
                return value;
            }),
            hooks: [{
                name: "partial-on-abort",
                stage: "settleFailure" as const,
                run(context) {
                    return context.signal.aborted ? {output: "partial"} : {};
                },
            }],
            prepare() {
                return {systemPrompt: "partial", modelConfig: {}};
            },
        });
        const model = new ScriptedModelRuntime([async (request) => new Promise((_, reject) => {
            request.signal.addEventListener("abort", () => reject(new Error("aborted")), {once: true});
        })]);
        const harness = new NeuroAgentHarness({
            store: new MemorySessionStore<number, NeuroHostContext>(),
            profiles: new ProfileRegistry<number, NeuroHostContext>().add(profile),
            model,
        });
        const created = await harness.createSession({profileKey: "partial-abort", initial: {}, hostContext: {projectWorkspace: "book", profileHome: "profile"}});
        const handle = await harness.invoke({sessionId: created.session.metadata.sessionId, payload: {}});
        handle.abort();

        const result = await handle.result();
        expect(result.status).toBe("aborted");
        expect(result.output).toBe("partial");
        const snapshot = await harness.snapshot(created.session.metadata.sessionId);
        expect(snapshot.session.invocations[0]?.output).toBe("partial");
    });
});

async function bounded<TResult>(promise: Promise<TResult>, label: string): Promise<TResult> {
    return Promise.race([
        promise,
        new Promise<TResult>((_, reject) => setTimeout(() => reject(new Error(`${label} 超时`)), 500)),
    ]);
}
