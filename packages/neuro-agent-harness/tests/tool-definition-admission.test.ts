import {describe, expect, test} from "bun:test";
import {NeuroAgentHarness, ProfileRegistry, defineSchema, defineTool, type AssistantContent, type JsonObject} from "../src/index.js";
import {MemorySessionStore} from "../src/storage/memory.js";
import {ScriptedModelRuntime} from "../src/testing/index.js";

const schema = defineSchema<JsonObject>((value) => {
    if (value === null || typeof value !== "object" || Array.isArray(value)) {
        throw new Error("必须是 object");
    }
    return value;
}, {type: "object"});

function assistant(content: string | readonly AssistantContent[], timestamp: number) {
    return {
        message: {
            role: "assistant" as const,
            content: typeof content === "string" ? [{type: "text" as const, text: content}] : content,
            timestamp,
            usage: {input: 1, output: 1, total: 2},
        },
    };
}

describe("PreparedRun Tool identity admission", () => {
    test("普通 invoke 在 Model 前拒绝同名 Tool，不选择第一份 handler", async () => {
        let modelCalls = 0;
        let firstExecutions = 0;
        let secondExecutions = 0;
        const first = defineTool({
            name: "duplicate",
            description: "first",
            parameters: schema,
            execute: () => {
                firstExecutions += 1;
                return {content: "first"};
            },
        });
        const second = defineTool({
            name: "duplicate",
            description: "second",
            parameters: schema,
            execute: () => {
                secondExecutions += 1;
                return {content: "second"};
            },
        });
        const registry = new ProfileRegistry();
        registry.define({
            manifest: {key: "duplicate", name: "Duplicate"},
            initial: schema,
            payload: schema,
            prepare: (context) => ({
                systemPrompt: "x",
                modelConfig: {},
                tools: [first, second],
                prepareWrites: [{
                    target: context.sessionId,
                    expectedVersion: context.snapshot.version,
                    cause: "test.duplicate-tool.prepare",
                    operations: [{
                        type: "appendEntries",
                        entries: [{kind: "test.duplicate-tool.prepare", payload: true}],
                    }],
                }],
            }),
        });
        const model = new ScriptedModelRuntime([
            () => {
                modelCalls += 1;
                return assistant([{type: "toolCall", call: {id: "duplicate-1", name: "duplicate", arguments: {}}}], 1);
            },
            () => {
                modelCalls += 1;
                return assistant("done", 2);
            },
        ]);
        const harness = new NeuroAgentHarness({
            store: new MemorySessionStore(),
            profiles: registry,
            model,
        });
        const session = await harness.createSession({profileKey: "duplicate", initial: {}, hostContext: {}});
        const handle = await harness.invoke({sessionId: session.session.metadata.sessionId, payload: {}});
        const result = await handle.result();
        const snapshot = await harness.snapshot(session.session.metadata.sessionId);

        expect(firstExecutions).toBe(0);
        expect(secondExecutions).toBe(0);
        expect(modelCalls).toBe(0);
        expect(result.status).toBe("failed");
        expect(result.error?.message).toContain("重复 Tool name");
        expect(snapshot.session.entries.some((entry) => entry.kind === "test.duplicate-tool.prepare")).toBe(false);
        await harness.dispose();
    });

    test("approval resume 在 Tool 前拒绝新 Profile 返回的同名 Tool", async () => {
        let modelCalls = 0;
        let executions = 0;
        const approved = defineTool({
            name: "danger",
            description: "approved",
            parameters: schema,
            approval: {request: () => ({prompt: "approve?"})},
            execute: () => {
                executions += 1;
                return {content: "executed"};
            },
        });
        const firstDuplicate = defineTool({
            name: "danger",
            description: "first duplicate",
            parameters: schema,
            execute: () => {
                executions += 1;
                return {content: "first"};
            },
        });
        const secondDuplicate = defineTool({
            name: "danger",
            description: "second duplicate",
            parameters: schema,
            execute: () => {
                executions += 1;
                return {content: "second"};
            },
        });
        const registry = new ProfileRegistry();
        registry.define({
            manifest: {key: "approval-duplicate", name: "Approval Duplicate"},
            initial: schema,
            payload: schema,
            prepare: () => ({systemPrompt: "x", modelConfig: {}, tools: [approved]}),
        });
        const model = new ScriptedModelRuntime([
            () => {
                modelCalls += 1;
                return assistant([{type: "toolCall", call: {id: "danger-1", name: "danger", arguments: {}}}], 1);
            },
            () => {
                modelCalls += 1;
                return assistant("done", 2);
            },
        ]);
        const harness = new NeuroAgentHarness({
            store: new MemorySessionStore(),
            profiles: registry,
            model,
        });
        const session = await harness.createSession({profileKey: "approval-duplicate", initial: {}, hostContext: {}});
        const waitingHandle = await harness.invoke({sessionId: session.session.metadata.sessionId, payload: {}});
        const waiting = await waitingHandle.result();
        expect(waiting.status).toBe("waiting");
        expect(modelCalls).toBe(1);

        registry.replace({
            manifest: {key: "approval-duplicate", name: "Approval Duplicate"},
            initial: schema,
            payload: schema,
            prepare: () => ({systemPrompt: "x", modelConfig: {}, tools: [firstDuplicate, secondDuplicate]}),
        });
        const resumed = await harness.resume(session.session.metadata.sessionId, waitingHandle.invocationId, [{
            toolCallId: "danger-1",
            approved: true,
        }]);
        const result = await resumed.result();

        expect(executions).toBe(0);
        expect(modelCalls).toBe(1);
        expect(result.status).toBe("failed");
        expect(result.error?.message).toContain("重复 Tool name");
        await harness.dispose();
    });
});
