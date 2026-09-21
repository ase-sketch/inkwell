import {describe, expect, test} from "bun:test";
import {
    NeuroAgentHarness,
    ProfileRegistry,
    composeContextMessages,
    defineProfile,
    defineSchema,
    mergeContextMessageSections,
    defineTool,
    type AgentMessage,
    type JsonObject,
} from "../src/index.js";
import {MemorySessionStore} from "../src/storage/memory.js";
import {ScriptedModelRuntime} from "../src/testing/index.js";

const objectSchema = defineSchema<JsonObject>((value) => {
    if (value === null || typeof value !== "object" || Array.isArray(value)) throw new Error("必须是 object");
    return value;
});

function user(text: string, timestamp: number): AgentMessage {
    return {role: "user", content: text, timestamp};
}

describe("Provider-neutral context sections", () => {
    test("按 history → transcript → modelContext → modelContextAppending → appending 组装，并保留旧扁平 runtime messages", async () => {
        const requests: AgentMessage[][] = [];
        const profile = defineProfile({
            manifest: {key: "context-sections", name: "Context sections"},
            initial: objectSchema,
            payload: objectSchema,
            hooks: [{
                name: "dynamic-context",
                stage: "beforeTurn",
                run: () => ({
                    context: {
                        modelContext: [user("dynamic model context", 5)],
                        appending: [user("dynamic appending", 6)],
                    },
                }),
            }],
            prepare: () => ({
                systemPrompt: "context",
                modelConfig: {},
                messages: [user("legacy runtime", 1)],
                context: {
                    history: [user("history", 2)],
                    modelContext: [user("static model context", 3)],
                    appending: [user("static appending", 4)],
                },
            }),
        });
        const harness = new NeuroAgentHarness({
            store: new MemorySessionStore(),
            profiles: new ProfileRegistry().add(profile),
            model: new ScriptedModelRuntime([
                (request) => {
                    requests.push([...request.messages]);
                    return {message: {role: "assistant", content: [{type: "text", text: "done"}], timestamp: 7}};
                },
            ]),
        });

        const created = await harness.createSession({profileKey: "context-sections", initial: {}, hostContext: {}});
        await (await harness.invoke({
            sessionId: created.session.metadata.sessionId,
            payload: {instruction: "prompt"},
        })).result();

        const texts = requests[0]?.flatMap((message) => message.role === "assistant" ? [] : [message.content]) ?? [];
        expect(texts).toEqual([
            "legacy runtime",
            "history",
            '{"instruction":"prompt"}',
            "static model context",
            "dynamic model context",
            "static appending",
            "dynamic appending",
        ]);
        await harness.dispose();
    });

    test("合并 sections 时同名分区按来源顺序追加", () => {
        expect(composeContextMessages([
            user("transcript", 1),
        ], {
            history: [user("history", 0)],
            modelContext: [user("model", 2)],
            modelContextAppending: [user("model context append", 2.5)],
            appending: [user("append", 3)],
        }).map((message) => message.content)).toEqual([
            "history",
            "transcript",
            "model",
            "model context append",
            "append",
        ]);
        expect(mergeContextMessageSections(
            {modelContextAppending: [user("first", 1)]},
            {modelContextAppending: [user("second", 2)]},
        ).modelContextAppending?.map((message) => message.content)).toEqual(["first", "second"]);
    });

    test("多 turn 中 beforeTurn 只作用于当前 turn，afterTurn 进入下一 turn，并保持旧 runtimeMessages 位置", async () => {
        const step = defineTool({
            name: "step",
            description: "执行一步",
            parameters: objectSchema,
            execute(argumentsValue) {
                return {content: `step:${String(argumentsValue.name)}`};
            },
        });
        const profile = defineProfile({
            manifest: {key: "context-lifecycle", name: "Context lifecycle"},
            initial: objectSchema,
            payload: objectSchema,
            hooks: [
                {
                    name: "prepare-runtime",
                    stage: "prepareRun",
                    run: () => ({
                        runtimeMessages: [user("prepare runtime", 2)],
                    }),
                },
                {
                    name: "before-turn-context",
                    stage: "beforeTurn",
                    run: (context) => {
                        const turn = context.turn ?? 0;
                        return {
                            context: {
                                modelContext: [user(`before model ${turn}`, 10 + turn)],
                                appending: [user(`before append ${turn}`, 20 + turn)],
                            },
                            runtimeMessages: [user(`before runtime ${turn}`, 30 + turn)],
                        };
                    },
                },
                {
                    name: "after-turn-context",
                    stage: "afterTurn",
                    run: (context) => {
                        const turn = context.turn ?? 0;
                        return {
                            context: {
                                modelContext: [user(`after model ${turn}`, 40 + turn)],
                                appending: [user(`after append ${turn}`, 50 + turn)],
                            },
                            runtimeMessages: [user(`after runtime ${turn}`, 60 + turn)],
                        };
                    },
                },
            ],
            prepare: () => ({
                systemPrompt: "context lifecycle",
                modelConfig: {},
                messages: [user("prepared runtime", 1)],
                context: {
                    history: [user("history", 3)],
                    modelContext: [user("prepared model", 4)],
                    appending: [user("prepared append", 5)],
                },
                tools: [step],
                limits: {maxTurns: 3},
            }),
        });
        const model = new ScriptedModelRuntime([
            {
                message: {
                    role: "assistant",
                    content: [{type: "toolCall", call: {id: "step-1", name: "step", arguments: {name: "one"}}}],
                    timestamp: 100,
                },
            },
            {
                message: {
                    role: "assistant",
                    content: [{type: "toolCall", call: {id: "step-2", name: "step", arguments: {name: "two"}}}],
                    timestamp: 101,
                },
            },
            {
                message: {
                    role: "assistant",
                    content: [{type: "text", text: "done"}],
                    timestamp: 102,
                },
            },
        ]);
        const harness = new NeuroAgentHarness({
            store: new MemorySessionStore(),
            profiles: new ProfileRegistry().add(profile),
            model,
        });

        const created = await harness.createSession({profileKey: "context-lifecycle", initial: {}, hostContext: {}});
        const handle = await harness.invoke({
            sessionId: created.session.metadata.sessionId,
            payload: {instruction: "prompt"},
        });
        expect((await handle.result()).status).toBe("completed");

        const requestTexts = model.requests.map((request) => request.messages.map((message) => {
            if (message.role === "assistant") {
                return message.content.map((part) => {
                    if (part.type === "text") return part.text;
                    if (part.type === "toolCall") return `tool call ${part.call.id}`;
                    return `thinking ${part.thinking}`;
                }).join("|");
            }
            return message.content;
        }));
        expect(requestTexts).toEqual([
            [
                "prepared runtime",
                "prepare runtime",
                "history",
                '{"instruction":"prompt"}',
                "prepared model",
                "before model 1",
                "prepared append",
                "before append 1",
                "before runtime 1",
            ],
            [
                "prepared runtime",
                "prepare runtime",
                "after runtime 1",
                "history",
                '{"instruction":"prompt"}',
                "tool call step-1",
                "step:one",
                "prepared model",
                "after model 1",
                "before model 2",
                "prepared append",
                "after append 1",
                "before append 2",
                "before runtime 2",
            ],
            [
                "prepared runtime",
                "prepare runtime",
                "after runtime 1",
                "after runtime 2",
                "history",
                '{"instruction":"prompt"}',
                "tool call step-1",
                "step:one",
                "tool call step-2",
                "step:two",
                "prepared model",
                "after model 2",
                "before model 3",
                "prepared append",
                "after append 2",
                "before append 3",
                "before runtime 3",
            ],
        ]);
        await harness.dispose();
    });

    test("contextProviders 按顺序读取每轮最新 Snapshot，结果只进入当前 request", async () => {
        const observedVersions: number[] = [];
        const providerOrder: string[] = [];
        const step = defineTool({
            name: "step",
            description: "写入一个测试事实",
            parameters: objectSchema,
            execute: (_argumentsValue, context) => ({
                content: "step complete",
                writePlans: [{
                    target: context.sessionId,
                    expectedVersion: context.snapshot.version,
                    cause: "test.context-provider",
                    operations: [{
                        type: "appendEntries",
                        entries: [{kind: "test.context-provider.marker", payload: {turn: context.turn}}],
                    }],
                }],
            }),
        });
        const profile = defineProfile({
            manifest: {key: "context-provider", name: "Context provider"},
            initial: objectSchema,
            payload: objectSchema,
            prepare: () => ({
                systemPrompt: "context provider",
                modelConfig: {},
                contextProviders: [
                    {
                        name: "first",
                        resolve: (context) => {
                            observedVersions.push(context.snapshot.version);
                            providerOrder.push(`first:${context.turn}`);
                            return {
                                modelContext: [user(`provider first turn ${context.turn} v${context.snapshot.version}`, 10)],
                                modelContextAppending: [user(`provider first append ${context.turn} v${context.snapshot.version}`, 12)],
                            };
                        },
                    },
                    {
                        name: "second",
                        resolve: (context) => {
                            providerOrder.push(`second:${context.turn}`);
                            return {
                                modelContext: [user(`provider second turn ${context.turn} v${context.snapshot.version}`, 11)],
                                modelContextAppending: [user(`provider second append ${context.turn} v${context.snapshot.version}`, 13)],
                            };
                        },
                    },
                ],
                tools: [step],
                limits: {maxTurns: 2},
            }),
        });
        const store = new MemorySessionStore();
        const model = new ScriptedModelRuntime([
            {
                message: {
                    role: "assistant",
                    content: [{type: "toolCall", call: {id: "step-1", name: "step", arguments: {}}}],
                    timestamp: 100,
                },
            },
            {
                message: {
                    role: "assistant",
                    content: [{type: "text", text: "done"}],
                    timestamp: 101,
                },
            },
        ]);
        const harness = new NeuroAgentHarness({
            store,
            profiles: new ProfileRegistry().add(profile),
            model,
        });

        const created = await harness.createSession({profileKey: "context-provider", initial: {}, hostContext: {}});
        const result = await (await harness.invoke({
            sessionId: created.session.metadata.sessionId,
            payload: {instruction: "prompt"},
        })).result();

        expect(result.status).toBe("completed");
        expect(providerOrder).toEqual(["first:1", "second:1", "first:2", "second:2"]);
        expect(observedVersions).toHaveLength(2);
        expect(observedVersions[1]).toBeGreaterThan(observedVersions[0]!);
        const firstRequest = JSON.stringify(model.requests[0]?.messages);
        const secondRequest = JSON.stringify(model.requests[1]?.messages);
        expect(firstRequest).toContain("provider first turn 1");
        expect(firstRequest).toContain("provider second turn 1");
        expect(firstRequest.indexOf("provider first turn 1")).toBeLessThan(firstRequest.indexOf("provider second turn 1"));
        expect(firstRequest).toContain("provider first append 1");
        expect(firstRequest).toContain("provider second append 1");
        expect(firstRequest.indexOf("provider first append 1")).toBeLessThan(firstRequest.indexOf("provider second append 1"));
        expect(secondRequest).toContain("provider first turn 2");
        expect(secondRequest).toContain("provider second turn 2");
        expect(secondRequest).not.toContain("provider first turn 1");
        expect(secondRequest).toContain("provider first append 2");
        expect(secondRequest).toContain("provider second append 2");
        expect(secondRequest).not.toContain("provider first append 1");
        const snapshot = await store.read(created.session.metadata.sessionId);
        expect(JSON.stringify(snapshot.entries)).not.toContain("provider first turn");
        await harness.dispose();
    });

    test("approval resume 不重放 prepareRun effect，但重建 PreparedRun context 并运行新的 beforeTurn", async () => {
        let prepareHookCalls = 0;
        const providerVersions: number[] = [];
        const gated = defineTool({
            name: "gated",
            description: "需要审批的操作",
            parameters: objectSchema,
            approval: {request: () => ({prompt: "approve"})},
            execute: () => ({content: "approved"}),
        });
        const profile = defineProfile({
            manifest: {key: "context-approval-resume", name: "Context approval resume"},
            initial: objectSchema,
            payload: objectSchema,
            hooks: [
                {
                    name: "prepare-context",
                    stage: "prepareRun",
                    run: () => {
                        prepareHookCalls += 1;
                        return {
                            context: {modelContext: [user("prepare hook context", 10)]},
                            runtimeMessages: [user("prepare hook runtime", 11)],
                        };
                    },
                },
                {
                    name: "before-context",
                    stage: "beforeTurn",
                    run: (context) => ({
                        context: {modelContext: [user(`before context ${context.turn}`, 20 + (context.turn ?? 0))]},
                        runtimeMessages: [user(`before runtime ${context.turn}`, 30 + (context.turn ?? 0))],
                    }),
                },
            ],
            prepare: () => ({
                systemPrompt: "context approval resume",
                modelConfig: {},
                contextProviders: [{
                    name: "approval-snapshot",
                    resolve: (context) => {
                        providerVersions.push(context.snapshot.version);
                        return {
                            modelContext: [user(`approval provider v${context.snapshot.version}`, 40)],
                            modelContextAppending: [user(`approval append v${context.snapshot.version}`, 41)],
                        };
                    },
                }],
                messages: [user("prepared runtime", 1)],
                context: {
                    history: [user("prepared history", 2)],
                    modelContext: [user("prepared context", 3)],
                    appending: [user("prepared appending", 4)],
                },
                tools: [gated],
                limits: {maxTurns: 3},
            }),
        });
        const model = new ScriptedModelRuntime([
            {
                message: {
                    role: "assistant",
                    content: [{type: "toolCall", call: {id: "gated-1", name: "gated", arguments: {}}}],
                    timestamp: 100,
                },
            },
            (request) => {
                const serialized = JSON.stringify(request.messages);
                expect(serialized).toContain("prepared context");
                expect(serialized).toContain("before context 2");
                expect(serialized).toContain("before runtime 2");
                expect(serialized).toContain(`approval provider v${providerVersions[1]}`);
                expect(serialized).toContain(`approval append v${providerVersions[1]}`);
                expect(serialized).not.toContain("prepare hook context");
                expect(serialized).not.toContain("prepare hook runtime");
                expect(serialized).not.toContain("before runtime 1");
                expect(serialized).not.toContain(`approval provider v${providerVersions[0]}`);
                expect(serialized).not.toContain(`approval append v${providerVersions[0]}`);
                return {
                    message: {
                        role: "assistant",
                        content: [{type: "text", text: "resumed"}],
                        timestamp: 101,
                    },
                };
            },
        ]);
        const harness = new NeuroAgentHarness({
            store: new MemorySessionStore(),
            profiles: new ProfileRegistry().add(profile),
            model,
        });

        const created = await harness.createSession({profileKey: "context-approval-resume", initial: {}, hostContext: {}});
        const waiting = await (await harness.invoke({
            sessionId: created.session.metadata.sessionId,
            payload: {instruction: "approve"},
        })).result();
        expect(waiting.status).toBe("waiting");

        const resumed = await harness.resume(created.session.metadata.sessionId, waiting.invocationId, [{
            toolCallId: "gated-1",
            approved: true,
        }]);
        expect((await resumed.result()).output).toBe("resumed");
        expect(prepareHookCalls).toBe(1);
        expect(providerVersions).toHaveLength(2);
        expect(providerVersions[1]).toBeGreaterThan(providerVersions[0]!);
        expect(model.requests).toHaveLength(2);
        expect(JSON.stringify(model.requests[0]?.messages)).toContain("prepare hook context");
        expect(JSON.stringify(model.requests[0]?.messages)).toContain("prepare hook runtime");
        expect(JSON.stringify(model.requests[0]?.messages)).toContain(`approval append v${providerVersions[0]}`);
        await harness.dispose();
    });

    test("approval waiting 不运行 afterTurn，resume 完成后续 Tool turn 才运行 afterTurn", async () => {
        const afterTurnTurns: number[] = [];
        const gated = defineTool({
            name: "gated",
            description: "需要审批的操作",
            parameters: objectSchema,
            approval: {request: () => ({prompt: "approve"})},
            execute: () => ({content: "approved"}),
        });
        const step = defineTool({
            name: "step",
            description: "普通操作",
            parameters: objectSchema,
            execute: () => ({content: "stepped"}),
        });
        const profile = defineProfile({
            manifest: {key: "context-approval-after-turn", name: "Context approval afterTurn"},
            initial: objectSchema,
            payload: objectSchema,
            hooks: [{
                name: "after-turn",
                stage: "afterTurn",
                run: (context) => {
                    afterTurnTurns.push(context.turn ?? -1);
                    return {
                        context: {
                            modelContext: [user(`after-turn ${context.turn}`, 50)],
                        },
                    };
                },
            }],
            prepare: () => ({
                systemPrompt: "context approval afterTurn",
                modelConfig: {},
                tools: [gated, step],
                limits: {maxTurns: 3},
            }),
        });
        const model = new ScriptedModelRuntime([
            {
                message: {
                    role: "assistant",
                    content: [{type: "toolCall", call: {id: "gated-1", name: "gated", arguments: {}}}],
                    timestamp: 100,
                },
            },
            {
                message: {
                    role: "assistant",
                    content: [{type: "toolCall", call: {id: "step-2", name: "step", arguments: {}}}],
                    timestamp: 101,
                },
            },
            (request) => {
                expect(JSON.stringify(request.messages)).toContain("after-turn 2");
                return {
                    message: {
                        role: "assistant",
                        content: [{type: "text", text: "done"}],
                        timestamp: 102,
                    },
                };
            },
        ]);
        const harness = new NeuroAgentHarness({
            store: new MemorySessionStore(),
            profiles: new ProfileRegistry().add(profile),
            model,
        });

        const created = await harness.createSession({profileKey: "context-approval-after-turn", initial: {}, hostContext: {}});
        const waiting = await (await harness.invoke({
            sessionId: created.session.metadata.sessionId,
            payload: {instruction: "approve"},
        })).result();
        expect(waiting.status).toBe("waiting");
        expect(afterTurnTurns).toEqual([]);

        const resumed = await harness.resume(created.session.metadata.sessionId, waiting.invocationId, [{
            toolCallId: "gated-1",
            approved: true,
        }]);
        expect((await resumed.result()).status).toBe("completed");
        expect(afterTurnTurns).toEqual([2]);
        expect(model.requests).toHaveLength(3);
        await harness.dispose();
    });

    test("contextProvider 失败发生在 model call 前并使 Invocation 失败", async () => {
        let modelCalls = 0;
        const profile = defineProfile({
            manifest: {key: "context-provider-failure", name: "Context provider failure"},
            initial: objectSchema,
            payload: objectSchema,
            prepare: () => ({
                systemPrompt: "context provider failure",
                modelConfig: {},
                contextProviders: [{
                    name: "broken",
                    resolve: () => {
                        throw new Error("provider exploded");
                    },
                }],
                limits: {maxTurns: 1},
            }),
        });
        const store = new MemorySessionStore();
        const harness = new NeuroAgentHarness({
            store,
            profiles: new ProfileRegistry().add(profile),
            model: new ScriptedModelRuntime([() => {
                modelCalls += 1;
                return {message: {role: "assistant", content: [{type: "text", text: "unexpected"}], timestamp: 1}};
            }]),
        });

        const created = await harness.createSession({profileKey: "context-provider-failure", initial: {}, hostContext: {}});
        const result = await (await harness.invoke({
            sessionId: created.session.metadata.sessionId,
            payload: {instruction: "fail"},
        })).result();

        expect(result.status).toBe("failed");
        expect(result.error?.message).toContain("ContextProvider broken 解析失败：provider exploded");
        expect(modelCalls).toBe(0);
        const snapshot = await store.read(created.session.metadata.sessionId);
        expect(snapshot.invocations.find((invocation) => invocation.id === result.invocationId)?.status).toBe("failed");
        await harness.dispose();
    });
});
