import {describe, expect, test} from "bun:test";
import {
    NeuroAgentHarness,
    ProfileRegistry,
    createReadTool,
    defineCapability,
    defineProfile,
    defineSchema,
    type CapabilityScope,
    type CapabilityToken,
    type JsonObject,
    type ModelTurnRequest,
    type ReadCapability,
    type ReadRequest,
} from "../src/index.js";
import {MemorySessionStore} from "../src/storage/memory.js";
import {ScriptedModelRuntime} from "../src/testing/index.js";

interface HostContext extends JsonObject {
    readonly namespace: string;
}

const objectSchema = defineSchema<JsonObject>((value) => {
    if (value === null || typeof value !== "object" || Array.isArray(value)) {
        throw new Error("必须是 object");
    }
    return value;
});

describe("opt-in Read Tool Adapter", () => {
    test("显式 CapabilityToken 的 read factory 透传 request 并映射所有 ReadResult details", async () => {
        const capability = defineCapability<"read", ReadCapability>("read");
        const requests: ReadRequest[] = [];
        let providerToolName = "";
        let providerToolDescription = "";
        const readTool = createReadTool<"read", number, HostContext>({
            capability,
            name: "read_resource",
            description: "读取授权资源",
        });
        const profile = defineProfile<JsonObject, JsonObject, JsonObject, number, HostContext, JsonObject>({
            manifest: {key: "read-factory", name: "Read Factory"},
            initial: objectSchema,
            payload: objectSchema,
            requiredCapabilities: [capability],
            prepare: () => ({
                systemPrompt: "read factory",
                modelConfig: {},
                tools: [readTool],
                limits: {maxTurns: 2},
            }),
        });
        const model = new ScriptedModelRuntime<JsonObject>([
            {
                message: {
                    role: "assistant",
                    content: [{
                        type: "toolCall",
                        call: {
                            id: "read-factory-1",
                            name: "read_resource",
                            arguments: {reference: "opaque://doc/1", offset: 6, limit: 4},
                        },
                    }],
                    timestamp: 1,
                },
            },
            (request: ModelTurnRequest<JsonObject>) => {
                providerToolName = request.tools[0]?.name ?? "";
                providerToolDescription = request.tools[0]?.description ?? "";
                const toolResult = request.messages.find((message) => message.role === "toolResult");
                expect(toolResult?.content).toBe("line 7\nline 8");
                expect(toolResult?.details).toEqual({
                    provenance: "opaque://doc/1",
                    truncated: true,
                    nextOffset: 10,
                });
                return {
                    message: {
                        role: "assistant",
                        content: [{type: "text", text: "done"}],
                        timestamp: 2,
                    },
                };
            },
        ]);
        const harness = new NeuroAgentHarness<number, HostContext, JsonObject>({
            store: new MemorySessionStore<number, HostContext>(),
            profiles: new ProfileRegistry<number, HostContext, JsonObject>().add(profile),
            model,
            capabilities: [{
                capability,
                open: (context) => ({
                    read: async (request: ReadRequest) => {
                        expect(context.hostContext.namespace).toBe("docs");
                        requests.push(request);
                        return {
                            content: "line 7\nline 8",
                            provenance: request.reference,
                            truncated: true,
                            nextOffset: (request.offset ?? 0) + (request.limit ?? 0),
                        };
                    },
                }),
            }],
        });

        try {
            const created = await harness.createSession({
                profileKey: "read-factory",
                initial: {},
                hostContext: {namespace: "docs"},
            });
            const result = await (await harness.invoke({
                sessionId: created.session.metadata.sessionId,
                payload: {},
            })).result();
            const snapshot = await harness.snapshot(created.session.metadata.sessionId);

            expect({
                resultStatus: result.status,
                providerToolName,
                providerToolDescription,
                requests,
                transcript: JSON.stringify(snapshot.session.entries),
            }).toEqual({
                resultStatus: "completed",
                providerToolName: "read_resource",
                providerToolDescription: "读取授权资源",
                requests: [{reference: "opaque://doc/1", offset: 6, limit: 4}],
                transcript: expect.stringContaining("\"truncated\":true"),
            });
        } finally {
            await harness.dispose();
        }
    });

    test("factory 的基础 schema 拒绝无 reference/非 finite pagination，并保留 EOF 的空 details", async () => {
        const capability = defineCapability<"readEof", ReadCapability>("readEof");
        const readTool = createReadTool({capability});
        expect(readTool.parameters.parse({reference: "opaque://eof", offset: 1.5, limit: 2})).toEqual({
            reference: "opaque://eof",
            offset: 1.5,
            limit: 2,
        });
        expect(() => readTool.parameters.parse({})).toThrow("read reference");
        expect(() => readTool.parameters.parse({reference: "opaque://eof", offset: Number.NaN})).toThrow("read offset");

        const capabilities = {
            require(token: CapabilityToken<"readEof", ReadCapability>) {
                expect(token).toBe(capability);
                return {read: async () => ({content: "end of file"})};
            },
            optional: () => undefined,
        } as unknown as CapabilityScope;
        const result = await readTool.execute(
            {reference: "opaque://eof"},
            {
                sessionId: 1,
                invocationId: "read-eof",
                profileKey: "read-eof",
                turn: 1,
                caller: {kind: "user"},
                hostContext: {},
                snapshot: {} as never,
                capabilities,
                signal: new AbortController().signal,
            },
            {id: "read-eof-call", name: "read", arguments: {reference: "opaque://eof"}},
        );
        expect(result).toEqual({content: "end of file"});
    });

    test("ReadCapability provider failure follows ordinary Tool error path", async () => {
        const capability = defineCapability<"readDenied", ReadCapability>("readDenied");
        const readTool = createReadTool({capability});
        const profile = defineProfile({
            manifest: {key: "read-factory-denied", name: "Read Factory Denied"},
            initial: objectSchema,
            payload: objectSchema,
            requiredCapabilities: [capability],
            prepare: () => ({
                systemPrompt: "read factory denied",
                modelConfig: {},
                tools: [readTool],
                limits: {maxTurns: 2},
            }),
        });
        const model = new ScriptedModelRuntime([
            {
                message: {
                    role: "assistant",
                    content: [{
                        type: "toolCall",
                        call: {id: "read-factory-denied-1", name: "read", arguments: {reference: "secret://blocked"}},
                    }],
                    timestamp: 1,
                },
            },
            (request: ModelTurnRequest) => {
                const toolResult = request.messages.find((message) => message.role === "toolResult");
                expect(toolResult?.isError).toBe(true);
                expect(toolResult?.content).toContain("read denied");
                return {
                    message: {
                        role: "assistant",
                        content: [{type: "text", text: "handled"}],
                        timestamp: 2,
                    },
                };
            },
        ]);
        const harness = new NeuroAgentHarness({
            store: new MemorySessionStore(),
            profiles: new ProfileRegistry().add(profile),
            model,
            capabilities: [{
                capability,
                open: () => ({
                    read: () => Promise.reject(new Error("read denied")),
                }),
            }],
        });

        try {
            const created = await harness.createSession({
                profileKey: "read-factory-denied",
                initial: {},
                hostContext: {},
            });
            expect((await (await harness.invoke({
                sessionId: created.session.metadata.sessionId,
                payload: {},
            })).result()).status).toBe("completed");
        } finally {
            await harness.dispose();
        }
    });
});
