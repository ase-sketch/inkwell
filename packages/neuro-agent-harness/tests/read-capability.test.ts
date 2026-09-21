import {describe, expect, test} from "bun:test";
import {
    NeuroAgentHarness,
    ProfileRegistry,
    defineCapability,
    defineProfile,
    defineSchema,
    defineTool,
    type CapabilityToken,
    type JsonObject,
    type ModelTurnRequest,
    type ReadCapability,
    type ReadRequest,
} from "../src/index.js";
import {MemorySessionStore} from "../src/storage/memory.js";
import {ScriptedModelRuntime} from "../src/testing/index.js";

interface HostContext extends JsonObject {
    resourceNamespace: string;
}

interface ReadArguments extends JsonObject {
    readonly reference: string;
    readonly offset?: number;
    readonly limit?: number;
}

const objectSchema = defineSchema<JsonObject>((value) => {
    if (value === null || typeof value !== "object" || Array.isArray(value)) throw new Error("必须是 object");
    return value;
});

// This host fixture chooses zero-based numeric offsets; ReadCapability does not.
const fixtureReadArgumentsSchema = defineSchema<ReadArguments>((value) => {
    if (value === null || typeof value !== "object" || Array.isArray(value)) {
        throw new Error("read arguments 无效");
    }
    const record = value as Record<string, unknown>;
    if (typeof record.reference !== "string") throw new Error("read reference 无效");
    if (record.offset !== undefined && (typeof record.offset !== "number" || !Number.isInteger(record.offset) || record.offset < 0)) throw new Error("read offset 无效");
    if (record.limit !== undefined && (typeof record.limit !== "number" || !Number.isInteger(record.limit) || record.limit <= 0)) throw new Error("read limit 无效");
    return value as ReadArguments;
}, {
    type: "object",
    properties: {
        reference: {type: "string"},
        offset: {type: "integer", minimum: 0},
        limit: {type: "integer", minimum: 1},
    },
    required: ["reference"],
});

function readTool<TName extends string>(readCapability: CapabilityToken<TName, ReadCapability>) {
    return defineTool<ReadArguments, number, HostContext>({
        name: "read",
        description: "读取宿主授权的文本资源",
        parameters: fixtureReadArgumentsSchema,
        execute: async (argumentsValue, context) => {
            const result = await context.capabilities.require(readCapability).read(argumentsValue);
            return {
                content: result.content,
                details: {
                    ...(result.provenance !== undefined ? {provenance: result.provenance} : {}),
                    ...(result.truncated !== undefined ? {truncated: result.truncated} : {}),
                    ...(result.nextOffset !== undefined ? {nextOffset: result.nextOffset} : {}),
                },
            };
        },
    });
}

describe("Host-neutral ReadCapability", () => {
    test("传递 opaque reference 和分页参数，并保留 provenance/truncated 事实", async () => {
        const readCapability = defineCapability<"read", ReadCapability>("read");
        const requests: ReadRequest[] = [];
        const profile = defineProfile({
            manifest: {key: "read-capability", name: "Read Capability"},
            initial: objectSchema,
            payload: objectSchema,
            requiredCapabilities: [readCapability],
            prepare: () => ({
                systemPrompt: "read capability",
                modelConfig: {},
                tools: [readTool(readCapability)],
                limits: {maxTurns: 2},
            }),
        });
        const model = new ScriptedModelRuntime([
            {
                message: {
                    role: "assistant",
                    content: [{type: "toolCall", call: {id: "read-1", name: "read", arguments: {reference: "cosmos://doc/1", offset: 6, limit: 4}}}],
                    timestamp: 1,
                },
            },
            (request: ModelTurnRequest) => {
                const toolResult = request.messages.find((message) => message.role === "toolResult");
                expect(toolResult?.content).toBe("line 7\nline 8");
                expect(toolResult?.details).toEqual({provenance: "cosmos://doc/1", truncated: true, nextOffset: 10});
                return {message: {role: "assistant", content: [{type: "text", text: "done"}], timestamp: 2}};
            },
        ]);
        const harness = new NeuroAgentHarness<number, HostContext>({
            store: new MemorySessionStore<number, HostContext>(),
            profiles: new ProfileRegistry<number, HostContext>().add(profile),
            model,
            capabilities: [{
                capability: readCapability,
                open: (context) => ({
                    read: async (request: ReadRequest) => {
                        expect(context.hostContext.resourceNamespace).toBe("cosmos");
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
        const created = await harness.createSession({
            profileKey: "read-capability",
            initial: {},
            hostContext: {resourceNamespace: "cosmos"},
        });

        const result = await (await harness.invoke({
            sessionId: created.session.metadata.sessionId,
            payload: {instruction: "read"},
        })).result();

        expect(result.status).toBe("completed");
        expect(requests).toEqual([{reference: "cosmos://doc/1", offset: 6, limit: 4}]);
        const snapshot = await harness.snapshot(created.session.metadata.sessionId);
        const durableTranscript = JSON.stringify(snapshot.session.entries);
        expect(durableTranscript).toContain("cosmos://doc/1");
        expect(durableTranscript).toContain("\"truncated\":true");
        expect(durableTranscript).toContain("\"nextOffset\":10");
        await harness.dispose();
    });

    test("Provider 拒绝资源时只产生 Tool error，不伪造 read content", async () => {
        const readCapability = defineCapability<"readDenied", ReadCapability>("readDenied");
        const profile = defineProfile({
            manifest: {key: "read-capability-denied", name: "Read Capability denied"},
            initial: objectSchema,
            payload: objectSchema,
            requiredCapabilities: [readCapability],
            prepare: () => ({
                systemPrompt: "read capability denied",
                modelConfig: {},
                tools: [readTool(readCapability)],
                limits: {maxTurns: 2},
            }),
        });
        const model = new ScriptedModelRuntime([
            {
                message: {
                    role: "assistant",
                    content: [{type: "toolCall", call: {id: "read-denied", name: "read", arguments: {reference: "secret://blocked"}}}],
                    timestamp: 1,
                },
            },
            (request: ModelTurnRequest) => {
                const toolResult = request.messages.find((message) => message.role === "toolResult");
                expect(toolResult?.isError).toBe(true);
                expect(toolResult?.content).toBe("read denied");
                return {message: {role: "assistant", content: [{type: "text", text: "handled"}], timestamp: 2}};
            },
        ]);
        const harness = new NeuroAgentHarness<number, HostContext>({
            store: new MemorySessionStore<number, HostContext>(),
            profiles: new ProfileRegistry<number, HostContext>().add(profile),
            model,
            capabilities: [{
                capability: readCapability,
                open: () => ({read: () => Promise.reject(new Error("read denied"))}),
            }],
        });
        const created = await harness.createSession({
            profileKey: "read-capability-denied",
            initial: {},
            hostContext: {resourceNamespace: "cosmos"},
        });

        const result = await (await harness.invoke({
            sessionId: created.session.metadata.sessionId,
            payload: {instruction: "read secret"},
        })).result();

        expect(result.status).toBe("completed");
        await harness.dispose();
    });
});
