import {describe, expect, test} from "bun:test";
import {
    NeuroAgentHarness,
    ProfileRegistry,
    defineCapability,
    defineProfile,
    defineSchema,
    defineTool,
    type AgentMessage,
    type JsonObject,
} from "../src/index.js";
import {MemorySessionStore} from "../src/storage/memory.js";
import {ScriptedModelRuntime} from "../src/testing/index.js";

interface ContextLookupCapability {
    readonly invocationId: string;
    lookup(snapshotVersion: number): string;
}

const objectSchema = defineSchema<JsonObject>((value) => {
    if (value === null || typeof value !== "object" || Array.isArray(value)) throw new Error("必须是 object");
    return value;
});

function user(text: string, timestamp: number): AgentMessage {
    return {role: "user", content: text, timestamp};
}

describe("ContextProvider Capability boundary", () => {
    test("多 turn 共用一个 Invocation-scoped Capability，并在结束时 close", async () => {
        const lookup = defineCapability<"contextLookup", ContextLookupCapability>("contextLookup");
        const openedInvocationIds: string[] = [];
        const closedInvocationIds: string[] = [];
        const observedVersions: number[] = [];
        const step = defineTool({
            name: "step",
            description: "执行一步",
            parameters: objectSchema,
            execute: () => ({content: "step complete"}),
        });
        const profile = defineProfile({
            manifest: {key: "context-provider-capability", name: "ContextProvider Capability"},
            initial: objectSchema,
            payload: objectSchema,
            requiredCapabilities: [lookup],
            prepare: () => ({
                systemPrompt: "context provider capability",
                modelConfig: {},
                contextProviders: [{
                    name: "lookup-context",
                    resolve: (context) => {
                        observedVersions.push(context.snapshot.version);
                        const value = context.capabilities.require(lookup).lookup(context.snapshot.version);
                        return {
                            modelContext: [user(value, 10 + context.turn)],
                            modelContextAppending: [user(`append ${value}`, 20 + context.turn)],
                        };
                    },
                }],
                tools: [step],
                limits: {maxTurns: 2},
            }),
        });
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
            store: new MemorySessionStore(),
            profiles: new ProfileRegistry().add(profile),
            model,
            capabilities: [{
                capability: lookup,
                open: (context) => {
                    openedInvocationIds.push(context.invocationId);
                    return {
                        invocationId: context.invocationId,
                        lookup: (snapshotVersion: number) => `capability v${snapshotVersion}`,
                    };
                },
                close: (value) => {
                    closedInvocationIds.push((value as ContextLookupCapability).invocationId);
                },
            }],
        });

        const created = await harness.createSession({profileKey: "context-provider-capability", initial: {}, hostContext: {}});
        const result = await (await harness.invoke({
            sessionId: created.session.metadata.sessionId,
            payload: {instruction: "use capability"},
        })).result();

        expect(result.status).toBe("completed");
        expect(openedInvocationIds).toHaveLength(1);
        expect(closedInvocationIds).toEqual(openedInvocationIds);
        expect(observedVersions).toHaveLength(2);
        expect(observedVersions[1]).toBeGreaterThan(observedVersions[0]!);
        expect(JSON.stringify(model.requests[0]?.messages)).toContain(`capability v${observedVersions[0]}`);
        expect(JSON.stringify(model.requests[1]?.messages)).toContain(`capability v${observedVersions[1]}`);
        const firstRequestTexts = model.requests[0]?.messages.flatMap((message) => message.role === "assistant" ? [] : [message.content]) ?? [];
        expect(firstRequestTexts.indexOf(`capability v${observedVersions[0]}`)).toBeLessThan(firstRequestTexts.indexOf(`append capability v${observedVersions[0]}`));
        const snapshot = await harness.snapshot(created.session.metadata.sessionId);
        expect(JSON.stringify(snapshot.session.entries)).not.toContain("append capability v");
        await harness.dispose();
    });

    test("ContextProvider Capability 失败发生在 model call 前，不持久化动态 context，并仍 close", async () => {
        const lookup = defineCapability<"contextLookupDenied", ContextLookupCapability>("contextLookupDenied");
        let closeCalls = 0;
        const profile = defineProfile({
            manifest: {key: "context-provider-capability-denied", name: "ContextProvider Capability denied"},
            initial: objectSchema,
            payload: objectSchema,
            requiredCapabilities: [lookup],
            prepare: () => ({
                systemPrompt: "context provider capability denied",
                modelConfig: {},
                contextProviders: [{
                    name: "denied-context",
                    resolve: (context) => ({
                        modelContext: [user(context.capabilities.require(lookup).lookup(context.snapshot.version), 10)],
                    }),
                }],
                limits: {maxTurns: 1},
            }),
        });
        const model = new ScriptedModelRuntime([]);
        const harness = new NeuroAgentHarness({
            store: new MemorySessionStore(),
            profiles: new ProfileRegistry().add(profile),
            model,
            capabilities: [{
                capability: lookup,
                open: () => ({
                    invocationId: "denied",
                    lookup: () => {
                        throw new Error("capability denied");
                    },
                }),
                close: () => {
                    closeCalls += 1;
                },
            }],
        });

        const created = await harness.createSession({profileKey: "context-provider-capability-denied", initial: {}, hostContext: {}});
        const result = await (await harness.invoke({
            sessionId: created.session.metadata.sessionId,
            payload: {instruction: "denied"},
        })).result();

        expect(result.status).toBe("failed");
        expect(result.error?.message).toContain("ContextProvider denied-context 解析失败：capability denied");
        expect(model.requests).toHaveLength(0);
        expect(closeCalls).toBe(1);
        const snapshot = await harness.snapshot(created.session.metadata.sessionId);
        expect(JSON.stringify(snapshot.session.entries)).not.toContain("capability v");
        expect(snapshot.session.invocations[0]?.status).toBe("failed");
        await harness.dispose();
    });
});
