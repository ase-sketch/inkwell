import {describe, expect, test} from "bun:test";
import {NeuroAgentHarness, ProfileRegistry, SessionConflictError, defineSchema, defineTool, type JsonObject} from "../src/index.js";
import {MemorySessionStore} from "../src/storage/memory.js";
import {ScriptedModelRuntime} from "../src/testing/index.js";

const schema = defineSchema<JsonObject>((value) => {
    if (value === null || typeof value !== "object" || Array.isArray(value)) throw new Error("必须是 object");
    return value;
});

function deferred(): {
    readonly promise: Promise<void>;
    readonly resolve: () => void;
} {
    let resolve!: () => void;
    const promise = new Promise<void>((resolvePromise) => {
        resolve = resolvePromise;
    });
    return {promise, resolve};
}

describe("approval lifecycle", () => {
    test("Harness 持久化 waiting，获批后用同一 Invocation 恢复 Tool batch", async () => {
        let executions = 0;
        const destructive = defineTool({
            name: "delete_file",
            description: "删除文件",
            parameters: schema,
            approval: {
                request(argumentsValue) {
                    return {prompt: `确认删除 ${String(argumentsValue.path)}？`, details: {risk: "destructive"}};
                },
            },
            execute(argumentsValue, context) {
                executions += 1;
                expect(context.approval?.data).toEqual({confirmedBy: "tester"});
                return {content: `deleted:${String(argumentsValue.path)}`};
            },
        });
        const registry = new ProfileRegistry();
        registry.define({
            manifest: {key: "approval", name: "Approval"},
            initial: schema,
            payload: schema,
            prepare: () => ({systemPrompt: "approval", modelConfig: {}, tools: [destructive]}),
        });
        const model = new ScriptedModelRuntime([
            {message: {role: "assistant", content: [{type: "toolCall", call: {id: "delete-1", name: "delete_file", arguments: {path: "a.md"}}}], timestamp: 1, usage: {input: 1, output: 2, total: 3}}},
            (request) => {
                const result = request.messages.find((message) => message.role === "toolResult" && message.toolCallId === "delete-1");
                expect(result?.content).toBe("deleted:a.md");
                return {message: {role: "assistant", content: [{type: "text", text: "done"}], timestamp: 2, usage: {input: 2, output: 3, total: 5}}};
            },
        ]);
        const harness = new NeuroAgentHarness({store: new MemorySessionStore(), profiles: registry, model});
        const session = await harness.createSession({profileKey: "approval", initial: {}, hostContext: {}});
        const handle = await harness.invoke({sessionId: session.session.metadata.sessionId, payload: {instruction: "delete"}});
        const waiting = await handle.result();
        expect(waiting.status).toBe("waiting");
        expect(waiting.pendingApprovals?.[0]).toMatchObject({toolCallId: "delete-1", toolName: "delete_file", prompt: "确认删除 a.md？"});
        expect(executions).toBe(0);
        const waitingSnapshot = await harness.snapshot(session.session.metadata.sessionId);
        expect(waitingSnapshot.session.status).toBe("waiting");
        expect(waitingSnapshot.session.invocations[0]?.status).toBe("waiting");
        await expect(harness.resume(session.session.metadata.sessionId, handle.invocationId, [])).rejects.toThrow("不完整");

        const resumed = await harness.resume(session.session.metadata.sessionId, handle.invocationId, [{
            toolCallId: "delete-1",
            approved: true,
            data: {confirmedBy: "tester"},
        }]);
        const completed = await resumed.result();
        expect(completed.status).toBe("completed");
        expect(completed.usage.total).toBe(8);
        expect(completed.invocationId).toBe(handle.invocationId);
        expect(executions).toBe(1);
        const completedSnapshot = await harness.snapshot(session.session.metadata.sessionId);
        expect(completedSnapshot.session.invocations).toHaveLength(1);
        expect(completedSnapshot.session.invocations[0]?.pendingApprovals).toBeUndefined();
    });

    test("拒绝 approval 产生 Tool error result，不执行 Tool", async () => {
        let executed = false;
        const tool = defineTool({
            name: "danger",
            description: "danger",
            parameters: schema,
            approval: {request: () => ({prompt: "approve?"})},
            execute() {
                executed = true;
                return {content: "executed"};
            },
        });
        const registry = new ProfileRegistry();
        registry.define({manifest: {key: "reject", name: "Reject"}, initial: schema, payload: schema, prepare: () => ({systemPrompt: "x", modelConfig: {}, tools: [tool]})});
        const model = new ScriptedModelRuntime([
            {message: {role: "assistant", content: [{type: "toolCall", call: {id: "d", name: "danger", arguments: {}}}], timestamp: 1}},
            (request) => {
                const result = request.messages.find((message) => message.role === "toolResult");
                expect(result).toMatchObject({isError: true, content: "用户拒绝"});
                return {message: {role: "assistant", content: [{type: "text", text: "cancelled"}], timestamp: 2}};
            },
        ]);
        const harness = new NeuroAgentHarness({store: new MemorySessionStore(), profiles: registry, model});
        const session = await harness.createSession({profileKey: "reject", initial: {}, hostContext: {}});
        const waiting = await harness.invoke({sessionId: session.session.metadata.sessionId, payload: {}});
        await waiting.result();
        const result = await (await harness.resume(session.session.metadata.sessionId, waiting.invocationId, [{toolCallId: "d", approved: false, message: "用户拒绝"}])).result();
        expect(result.status).toBe("completed");
        expect(executed).toBe(false);
    });

    test("独立 Harness 并发 resume 只能一个 durable claim 成功，Tool 不重复执行", async () => {
        const firstExecution = deferred();
        const releaseExecution = deferred();
        let executions = 0;
        const tool = defineTool({
            name: "external_write",
            description: "external write",
            parameters: schema,
            approval: {request: () => ({prompt: "approve external write?"})},
            async execute() {
                executions += 1;
                firstExecution.resolve();
                await releaseExecution.promise;
                return {content: "written"};
            },
        });
        const registry = new ProfileRegistry();
        registry.define({
            manifest: {key: "concurrent-resume", name: "Concurrent Resume"},
            initial: schema,
            payload: schema,
            prepare: () => ({systemPrompt: "x", modelConfig: {}, tools: [tool]}),
        });
        const waitingTurn = {
            message: {
                role: "assistant" as const,
                content: [{type: "toolCall" as const, call: {id: "write-1", name: "external_write", arguments: {}}}],
                timestamp: 1,
            },
        };
        const completedTurn = {
            message: {
                role: "assistant" as const,
                content: [{type: "text" as const, text: "done"}],
                timestamp: 2,
            },
        };
        const store = new MemorySessionStore();
        const first = new NeuroAgentHarness({
            store,
            profiles: registry,
            model: new ScriptedModelRuntime([waitingTurn, completedTurn]),
        });
        const second = new NeuroAgentHarness({
            store,
            profiles: registry,
            model: new ScriptedModelRuntime([completedTurn]),
        });
        const session = await first.createSession({profileKey: "concurrent-resume", initial: {}, hostContext: {}});
        const waiting = await first.invoke({sessionId: session.session.metadata.sessionId, payload: {}});
        expect((await waiting.result()).status).toBe("waiting");

        const resolution = [{toolCallId: "write-1", approved: true}] as const;
        const admissions = await Promise.allSettled([
            first.resume(session.session.metadata.sessionId, waiting.invocationId, resolution),
            second.resume(session.session.metadata.sessionId, waiting.invocationId, resolution),
        ]);
        await firstExecution.promise;
        await new Promise<void>((resolve) => setTimeout(resolve, 20));
        const observedExecutions = executions;
        releaseExecution.resolve();
        await new Promise<void>((resolve) => setTimeout(resolve, 20));
        await Promise.allSettled([first.dispose(), second.dispose()]);

        const fulfilled = admissions.filter((result) => result.status === "fulfilled");
        const rejected = admissions.filter((result) => result.status === "rejected");
        expect(observedExecutions).toBe(1);
        expect(fulfilled).toHaveLength(1);
        expect(rejected).toHaveLength(1);
        expect(rejected[0]?.reason).toBeInstanceOf(SessionConflictError);
    });

    test("重复 resolution ID 不伪装成完整集合，且在 durable claim 与 Tool 前拒绝", async () => {
        let executions = 0;
        const tool = defineTool({
            name: "gated_write",
            description: "gated write",
            parameters: schema,
            approval: {request: (argumentsValue) => ({prompt: `approve ${String(argumentsValue.target)}?`})},
            execute() {
                executions += 1;
                return {content: "written"};
            },
        });
        const registry = new ProfileRegistry();
        registry.define({
            manifest: {key: "duplicate-resolution", name: "Duplicate Resolution"},
            initial: schema,
            payload: schema,
            prepare: () => ({systemPrompt: "x", modelConfig: {}, tools: [tool]}),
        });
        const harness = new NeuroAgentHarness({
            store: new MemorySessionStore(),
            profiles: registry,
            model: new ScriptedModelRuntime([{
                message: {
                    role: "assistant",
                    content: [
                        {type: "toolCall", call: {id: "write-a", name: "gated_write", arguments: {target: "a"}}},
                        {type: "toolCall", call: {id: "write-b", name: "gated_write", arguments: {target: "b"}}},
                    ],
                    timestamp: 1,
                },
            }]),
        });
        const session = await harness.createSession({profileKey: "duplicate-resolution", initial: {}, hostContext: {}});
        const waiting = await harness.invoke({sessionId: session.session.metadata.sessionId, payload: {}});
        expect((await waiting.result()).status).toBe("waiting");

        const outcome = await harness.resume(session.session.metadata.sessionId, waiting.invocationId, [
            {toolCallId: "write-a", approved: true},
            {toolCallId: "write-a", approved: true},
        ]).then(
            () => "accepted" as const,
            () => "rejected" as const,
        );
        await new Promise<void>((resolve) => setTimeout(resolve, 10));
        const snapshot = await harness.snapshot(session.session.metadata.sessionId);
        await harness.dispose();

        expect(outcome).toBe("rejected");
        expect(executions).toBe(0);
        expect(snapshot.session.invocations.find((item) => item.id === waiting.invocationId)?.status).toBe("waiting");
    });

    test("durable waiting Invocation 可以由 Harness abort", async () => {
        const tool = defineTool({name: "gated", description: "gated", parameters: schema, approval: {request: () => ({prompt: "wait"})}, execute: () => ({content: "ok"})});
        const registry = new ProfileRegistry();
        registry.define({manifest: {key: "abort-waiting", name: "Abort Waiting"}, initial: schema, payload: schema, prepare: () => ({systemPrompt: "x", modelConfig: {}, tools: [tool]})});
        const harness = new NeuroAgentHarness({
            store: new MemorySessionStore(),
            profiles: registry,
            model: new ScriptedModelRuntime([{message: {role: "assistant", content: [{type: "toolCall", call: {id: "g", name: "gated", arguments: {}}}], timestamp: 1}}]),
        });
        const session = await harness.createSession({profileKey: "abort-waiting", initial: {}, hostContext: {}});
        await (await harness.invoke({sessionId: session.session.metadata.sessionId, payload: {}})).result();
        await harness.abort(session.session.metadata.sessionId);
        const snapshot = await harness.snapshot(session.session.metadata.sessionId);
        expect(snapshot.session.invocations[0]?.status).toBe("aborted");
        expect(snapshot.session.activeInvocationId).toBeNull();
    });
});
