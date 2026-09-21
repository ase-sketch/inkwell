import {afterEach, describe, expect, test} from "bun:test";
import {mkdtemp, rm} from "node:fs/promises";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {
    NeuroAgentHarness,
    ProfileRegistry,
    SessionEventHub,
    defineCapability,
    defineProfile,
    defineSchema,
    defineTool,
    type AssistantContent,
    type JsonObject,
} from "../src/index.js";
import {JsonlSessionStore} from "../src/storage/jsonl.js";
import {ScriptedModelRuntime} from "../src/testing/index.js";

interface CosmosHostContext extends JsonObject {
    flowId: string;
    runId: string;
    workspaceKey: string;
}

interface CosmosActionPayload extends JsonObject {
    instruction: string;
}

interface CosmosActionOutput extends JsonObject {
    status: "complete";
    content: string;
}

interface DynamicActionInitial extends JsonObject {
    actionVersion: number;
    outputField: "answer" | "score";
}

interface DynamicActionArguments extends JsonObject {
    result: string;
    data: JsonObject;
}

interface AuthorizedRead {
    read(reference: string): Promise<{content: string; provenance: string}>;
}

const directories: string[] = [];

afterEach(async () => {
    await Promise.all(directories.splice(0).map((directory) => rm(directory, {recursive: true, force: true})));
});

const objectSchema = defineSchema<JsonObject>((value) => {
    if (value === null || typeof value !== "object" || Array.isArray(value)) {
        throw new Error("必须是 object");
    }
    return value;
}, {type: "object"});

const payloadSchema = defineSchema<CosmosActionPayload>((value) => {
    if (value === null || typeof value !== "object" || Array.isArray(value) || typeof value.instruction !== "string") {
        throw new Error("Cosmos Action payload 无效");
    }
    return value as CosmosActionPayload;
}, {
    type: "object",
    properties: {instruction: {type: "string"}},
    required: ["instruction"],
});

const readArgumentsSchema = defineSchema<{reference: string}>((value) => {
    if (value === null || typeof value !== "object" || Array.isArray(value) || typeof value.reference !== "string") {
        throw new Error("read arguments 无效");
    }
    return value as {reference: string};
}, {
    type: "object",
    properties: {reference: {type: "string"}},
    required: ["reference"],
});

const outputSchema = defineSchema<CosmosActionOutput>((value) => {
    if (
        value === null
        || typeof value !== "object"
        || Array.isArray(value)
        || value.status !== "complete"
        || typeof value.content !== "string"
    ) {
        throw new Error("Cosmos Action output 无效");
    }
    return value as CosmosActionOutput;
}, {
    type: "object",
    properties: {
        status: {type: "string"},
        content: {type: "string"},
    },
    required: ["status", "content"],
});

const dynamicInitialSchema = defineSchema<DynamicActionInitial>((value) => {
    if (
        value === null
        || typeof value !== "object"
        || Array.isArray(value)
        || typeof value.actionVersion !== "number"
        || (value.outputField !== "answer" && value.outputField !== "score")
    ) {
        throw new Error("Cosmos dynamic Action initial 无效");
    }
    return value as DynamicActionInitial;
}, {
    type: "object",
    properties: {
        actionVersion: {type: "number"},
        outputField: {type: "string", enum: ["answer", "score"]},
    },
    required: ["actionVersion", "outputField"],
});

function dynamicActionArgumentsSchema(field: DynamicActionInitial["outputField"]) {
    return defineSchema<DynamicActionArguments>((value) => {
        if (value === null || typeof value !== "object" || Array.isArray(value) || typeof value.result !== "string") {
            throw new Error("complete_action.result 必填");
        }
        if (value.data === null || typeof value.data !== "object" || Array.isArray(value.data)) {
            throw new Error("complete_action.data 必须是 object");
        }
        const data = value.data as JsonObject;
        if (field === "answer" && typeof data.answer !== "string") {
            throw new Error("complete_action.data.answer 必填");
        }
        if (field === "score" && typeof data.score !== "number") {
            throw new Error("complete_action.data.score 必填");
        }
        return {result: value.result, data};
    }, {
        type: "object",
        properties: {
            result: {type: "string"},
            data: {
                type: "object",
                properties: {
                    [field]: field === "answer" ? {type: "string"} : {type: "number"},
                },
                required: [field],
                additionalProperties: false,
            },
        },
        required: ["result", "data"],
        additionalProperties: false,
    });
}

function assistant(content: readonly AssistantContent[], timestamp: number) {
    return {
        message: {
            role: "assistant" as const,
            content,
            timestamp,
        },
    };
}

async function tempDirectory(): Promise<string> {
    const directory = await mkdtemp(join(tmpdir(), "neuro-harness-cosmos-consumer-"));
    directories.push(directory);
    return directory;
}

describe("Cosmos consumer compatibility", () => {
    test("Cosmos 风格 Agent Action 可注入 read、恢复 Session 并消费 cursor 事件", async () => {
        const directory = await tempDirectory();
        const readCapability = defineCapability<"authorizedRead", AuthorizedRead>("authorizedRead");
        const registry = new ProfileRegistry<number, CosmosHostContext>();
        const readTool = defineTool<{reference: string}, number, CosmosHostContext>({
            name: "read",
            description: "读取宿主授权范围内的一个引用",
            parameters: readArgumentsSchema,
            execute: async (argumentsValue, context) => {
                const result = await context.capabilities.require(readCapability).read(argumentsValue.reference);
                return {
                    content: result.content,
                    details: {provenance: result.provenance},
                    output: {status: "complete", content: result.content},
                };
            },
        });
        registry.add(defineProfile({
            manifest: {key: "cosmos-agent-action", name: "Cosmos Agent Action"},
            initial: objectSchema,
            payload: payloadSchema,
            output: outputSchema,
            requiredCapabilities: [readCapability],
            hooks: [{
                name: "cosmos-structured-result",
                stage: "settleRun" as const,
                run(context) {
                    const toolResult = [...(context.messages ?? [])]
                        .reverse()
                        .find((message) => message.role === "toolResult" && message.toolCallId === "read-1");
                    return typeof toolResult?.content === "string"
                        ? {output: {status: "complete" as const, content: toolResult.content}}
                        : {};
                },
            }],
            prepare(context) {
                expect(context.hostContext.flowId).toBe("flow-1");
                expect(context.hostContext.runId).toBe("run-1");
                return {
                    systemPrompt: "You are a Cosmos Flow Action.",
                    modelConfig: {provider: "fake", model: "deterministic"},
                    tools: [readTool],
                    limits: {maxTurns: 2},
                };
            },
        }));

        const eventHub = new SessionEventHub<number>({eventEpoch: "cosmos-epoch", replayLimit: 100});
        const model = new ScriptedModelRuntime([
            (request) => {
                expect(request.profileKey).toBe("cosmos-agent-action");
                expect(request.modelConfig).toEqual({provider: "fake", model: "deterministic"});
                expect(JSON.stringify(request.messages)).toContain("summarize");
                return {
                    message: {
                        role: "assistant",
                        content: [{
                            type: "toolCall",
                            call: {id: "read-1", name: "read", arguments: {reference: "workspace/input.md"}},
                        }],
                        timestamp: 1,
                    },
                };
            },
            (request) => {
                const toolResult = request.messages.find((message) => message.role === "toolResult");
                expect(toolResult?.content).toBe("hello cosmos");
                expect(toolResult?.details).toEqual({provenance: "cosmos://workspace/input.md"});
                return {
                    message: {
                        role: "assistant",
                        content: [{type: "text", text: "finished"}],
                        timestamp: 2,
                    },
                };
            },
        ]);
        const harness = new NeuroAgentHarness({
            store: new JsonlSessionStore<CosmosHostContext>({directory}),
            profiles: registry,
            model,
            events: eventHub,
            capabilities: [{
                capability: readCapability,
                open(context) {
                    return {
                        read: async (reference: string) => {
                            expect(context.hostContext.workspaceKey).toBe("workspace-a");
                            return {content: "hello cosmos", provenance: `cosmos://${reference}`};
                        },
                    };
                },
            }],
        });

        const created = await harness.createSession({
            profileKey: "cosmos-agent-action",
            initial: {profileVersion: 1},
            hostContext: {flowId: "flow-1", runId: "run-1", workspaceKey: "workspace-a"},
        });
        const handle = await harness.invoke({
            sessionId: created.session.metadata.sessionId,
            payload: {instruction: "summarize"},
            caller: {kind: "system", name: "cosmos.flow.agent-action"},
        });
        const result = await handle.result();

        expect(result.status).toBe("completed");
        expect(result.output).toEqual({status: "complete", content: "hello cosmos"});

        const snapshot = await harness.snapshot(created.session.metadata.sessionId);
        expect(snapshot.session.invocations[0]?.caller).toEqual({kind: "system", name: "cosmos.flow.agent-action"});
        expect(snapshot.session.metadata.hostContext).toEqual({
            flowId: "flow-1",
            runId: "run-1",
            workspaceKey: "workspace-a",
        });

        const replay = harness.subscribe(created.session.metadata.sessionId, {eventEpoch: eventHub.eventEpoch, after: 0});
        expect(replay.connected.snapshotRequired).toBe(false);
        const replayed: string[] = [];
        const iterator = replay[Symbol.asyncIterator]();
        for (let index = 0; index < replay.connected.latestSeq; index += 1) {
            const next = await iterator.next();
            if (!next.done && next.value.kind === "session") {
                replayed.push(next.value.event.type);
            }
        }
        await replay.close();
        expect(replayed).toContain("session_entry");
        expect(replayed).toContain("session_status");

        const restartEventHub = new SessionEventHub<number>({eventEpoch: "cosmos-restart-epoch"});
        const restoredHarness = new NeuroAgentHarness({
            store: new JsonlSessionStore<CosmosHostContext>({directory}),
            profiles: registry,
            model: new ScriptedModelRuntime([]),
            events: restartEventHub,
            capabilities: [{
                capability: readCapability,
                open: () => ({read: async () => ({content: "unused", provenance: "unused"})}),
            }],
        });
        const restored = await restoredHarness.snapshot(created.session.metadata.sessionId);
        expect(restored.session.invocations[0]?.status).toBe("completed");
        expect(restored.session.invocations[0]?.output).toEqual({status: "complete", content: "hello cosmos"});
        expect(restored.session.entries.some((entry) => entry.kind === "agent.message")).toBe(true);

        const recovered = restoredHarness.subscribe(created.session.metadata.sessionId, snapshot.cursor);
        expect(recovered.connected.snapshotRequired).toBe(true);
        await recovered.close();
    });

    test("Invocation-scoped structured output 可由普通 Tool 表达并在 JSONL 重启后恢复", async () => {
        const directory = await tempDirectory();
        const registry = new ProfileRegistry<number, CosmosHostContext>();
        registry.add(defineProfile({
            manifest: {key: "cosmos-dynamic-action", name: "Cosmos Dynamic Agent Action"},
            initial: dynamicInitialSchema,
            payload: payloadSchema,
            prepare(context) {
                const completion = defineTool<DynamicActionArguments, number, CosmosHostContext>({
                    name: "complete_action",
                    description: "提交当前 Action 版本声明的结构化结果",
                    parameters: dynamicActionArgumentsSchema(context.initial.outputField),
                    execute(argumentsValue) {
                        return {
                            content: argumentsValue.result,
                            output: argumentsValue.data,
                            terminate: true,
                        };
                    },
                });
                return {
                    systemPrompt: `Cosmos Action v${context.initial.actionVersion}`,
                    modelConfig: {provider: "fake", model: "dynamic"},
                    tools: [completion],
                    limits: {maxTurns: 3},
                };
            },
        }));

        const model = new ScriptedModelRuntime([
            (request) => {
                const completion = request.tools.find((tool) => tool.name === "complete_action");
                expect(completion?.parameters.required).toEqual(["result", "data"]);
                const parameterProperties = completion?.parameters.properties as JsonObject | undefined;
                const dataSchema = parameterProperties?.data as JsonObject | undefined;
                const dataProperties = dataSchema?.properties as JsonObject | undefined;
                expect(dataProperties?.answer).toEqual({type: "string"});
                expect(dataProperties).not.toHaveProperty("score");
                return assistant([{
                    type: "toolCall",
                    call: {id: "dynamic-missing-data", name: "complete_action", arguments: {result: "先提交"}},
                }], 1);
            },
            (request) => {
                const toolResult = request.messages.findLast((message) => message.role === "toolResult");
                expect(toolResult?.isError).toBe(true);
                expect(toolResult?.content).toContain("data");
                return assistant([{
                    type: "toolCall",
                    call: {
                        id: "dynamic-valid-answer",
                        name: "complete_action",
                        arguments: {result: "answer ready", data: {answer: "structured answer"}},
                    },
                }], 2);
            },
            (request) => {
                const completion = request.tools.find((tool) => tool.name === "complete_action");
                const parameterProperties = completion?.parameters.properties as JsonObject | undefined;
                const dataSchema = parameterProperties?.data as JsonObject | undefined;
                const dataProperties = dataSchema?.properties as JsonObject | undefined;
                expect(dataProperties?.score).toEqual({type: "number"});
                expect(dataProperties).not.toHaveProperty("answer");
                return assistant([{
                    type: "toolCall",
                    call: {
                        id: "dynamic-valid-score",
                        name: "complete_action",
                        arguments: {result: "score ready", data: {score: 7}},
                    },
                }], 3);
            },
        ]);
        const harness = new NeuroAgentHarness({
            store: new JsonlSessionStore<CosmosHostContext>({directory}),
            profiles: registry,
            model,
        });

        const answerSession = await harness.createSession({
            profileKey: "cosmos-dynamic-action",
            initial: {actionVersion: 1, outputField: "answer"},
            hostContext: {flowId: "flow-dynamic", runId: "run-answer", workspaceKey: "workspace-a"},
        });
        const answerResult = await (await harness.invoke({
            sessionId: answerSession.session.metadata.sessionId,
            payload: {instruction: "produce answer"},
        })).result();
        expect(answerResult.status).toBe("completed");
        expect(answerResult.terminationReason).toBe("tool_terminate");
        expect(answerResult.output).toEqual({answer: "structured answer"});

        const scoreSession = await harness.createSession({
            profileKey: "cosmos-dynamic-action",
            initial: {actionVersion: 2, outputField: "score"},
            hostContext: {flowId: "flow-dynamic", runId: "run-score", workspaceKey: "workspace-a"},
        });
        const scoreResult = await (await harness.invoke({
            sessionId: scoreSession.session.metadata.sessionId,
            payload: {instruction: "produce score"},
        })).result();
        expect(scoreResult.status).toBe("completed");
        expect(scoreResult.output).toEqual({score: 7});

        const restoredHarness = new NeuroAgentHarness({
            store: new JsonlSessionStore<CosmosHostContext>({directory}),
            profiles: registry,
            model: new ScriptedModelRuntime([]),
        });
        const restoredAnswer = await restoredHarness.snapshot(answerSession.session.metadata.sessionId);
        const restoredScore = await restoredHarness.snapshot(scoreSession.session.metadata.sessionId);
        expect(restoredAnswer.session.invocations[0]?.output).toEqual({answer: "structured answer"});
        expect(restoredScore.session.invocations[0]?.output).toEqual({score: 7});
        expect(JSON.stringify(restoredAnswer.session.entries)).toContain("complete_action.data");
        expect(JSON.stringify(restoredAnswer.session.entries)).toContain("\"isError\":true");
    });
});
