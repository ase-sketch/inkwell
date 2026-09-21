import {describe, expect, test} from "bun:test";
import {NeuroAgentHarness, ProfileRegistry, defineSchema, defineTool, type JsonObject} from "../src/index.js";
import {MemorySessionStore} from "../src/storage/memory.js";
import {ScriptedModelRuntime} from "../src/testing/index.js";

const schema = defineSchema<JsonObject>((value) => {
    if (value === null || typeof value !== "object" || Array.isArray(value)) throw new Error("必须是 object");
    return value;
});

describe("parallel Tool scheduling", () => {
    test("Tool 并发执行，但 toolResult 按 provider call 顺序原子提交", async () => {
        const started: string[] = [];
        let release!: () => void;
        const bothStarted = new Promise<void>((resolve) => { release = resolve; });
        const makeTool = (name: string) => defineTool({
            name,
            description: name,
            parameters: schema,
            executionMode: "parallel" as const,
            async execute() {
                started.push(name);
                if (started.length === 2) release();
                await bothStarted;
                if (name === "first") await new Promise((resolve) => setTimeout(resolve, 5));
                return {content: `${name}-result`};
            },
        });
        const registry = new ProfileRegistry();
        registry.define({
            manifest: {key: "parallel", name: "Parallel"},
            initial: schema,
            payload: schema,
            prepare: () => ({
                systemPrompt: "parallel",
                modelConfig: {},
                toolExecution: "parallel",
                tools: [makeTool("first"), makeTool("second")],
            }),
        });
        const model = new ScriptedModelRuntime([
            {message: {role: "assistant", content: [
                {type: "toolCall", call: {id: "a", name: "first", arguments: {}}},
                {type: "toolCall", call: {id: "b", name: "second", arguments: {}}},
            ], timestamp: 1}},
            (request) => {
                const results = request.messages.filter((message) => message.role === "toolResult");
                expect(results.map((message) => message.toolCallId)).toEqual(["a", "b"]);
                return {message: {role: "assistant", content: [{type: "text", text: "done"}], timestamp: 2}};
            },
        ]);
        const harness = new NeuroAgentHarness({store: new MemorySessionStore(), profiles: registry, model});
        const session = await harness.createSession({profileKey: "parallel", initial: {}, hostContext: {}});
        expect((await (await harness.invoke({sessionId: session.session.metadata.sessionId, payload: {}})).result()).status).toBe("completed");
        expect(started).toEqual(["first", "second"]);
    });

    test("parallel Tool 返回 SessionWritePlan 会失败并提示改为 sequential", async () => {
        const writingTool = defineTool({
            name: "writer",
            description: "writer",
            parameters: schema,
            executionMode: "parallel" as const,
            execute(_arguments, context) {
                return {
                    content: "write",
                    writePlans: [{target: context.sessionId, expectedVersion: context.snapshot.version, cause: "bad.parallel.write", operations: []}],
                };
            },
        });
        const registry = new ProfileRegistry();
        registry.define({
            manifest: {key: "parallel-write", name: "Parallel Write"},
            initial: schema,
            payload: schema,
            prepare: () => ({systemPrompt: "test", modelConfig: {}, toolExecution: "parallel", tools: [writingTool]}),
        });
        const model = new ScriptedModelRuntime([{
            message: {role: "assistant", content: [{type: "toolCall", call: {id: "w", name: "writer", arguments: {}}}], timestamp: 1},
        }]);
        const harness = new NeuroAgentHarness({store: new MemorySessionStore(), profiles: registry, model});
        const session = await harness.createSession({profileKey: "parallel-write", initial: {}, hostContext: {}});
        const result = await (await harness.invoke({sessionId: session.session.metadata.sessionId, payload: {}})).result();
        expect(result.status).toBe("failed");
        expect(result.error?.message).toContain("executionMode=sequential");
    });
});
