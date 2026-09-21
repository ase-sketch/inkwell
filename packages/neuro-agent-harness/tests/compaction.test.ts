import {describe, expect, test} from "bun:test";
import {NeuroAgentHarness, ProfileRegistry, defineSchema, type CompactionRequest, type JsonObject} from "../src/index.js";
import {MemorySessionStore} from "../src/storage/memory.js";
import {ScriptedModelRuntime} from "../src/testing/index.js";

const schema = defineSchema<JsonObject>((value) => {
    if (value === null || typeof value !== "object" || Array.isArray(value)) throw new Error("必须是 object");
    return value;
});

describe("Harness compaction", () => {
    test("Harness 决定触发和切分，Adapter 只生成 summary", async () => {
        const summaryRequests: CompactionRequest[] = [];
        const registry = new ProfileRegistry();
        registry.define({
            manifest: {key: "compact", name: "Compact"},
            initial: schema,
            payload: schema,
            prepare: () => ({
                systemPrompt: "compact",
                modelConfig: {},
                compaction: {triggerTokens: 3, keepRecentTokens: 1},
            }),
        });
        const model = new ScriptedModelRuntime([
            {message: {role: "assistant", content: [{type: "text", text: "old answer"}], timestamp: 1}},
            (request) => {
                const text = JSON.stringify(request.messages);
                expect(text).toContain("summary of old history");
                expect(text).toContain("new prompt");
                expect(text).not.toContain("old answer");
                return {message: {role: "assistant", content: [{type: "text", text: "new answer"}], timestamp: 2}};
            },
        ]);
        const harness = new NeuroAgentHarness({
            store: new MemorySessionStore(),
            profiles: registry,
            model,
            compactor: {
                estimate: () => 1,
                async summarize(request) {
                    summaryRequests.push(request);
                    return "summary of old history";
                },
            },
        });
        const session = await harness.createSession({profileKey: "compact", initial: {}, hostContext: {}});
        await (await harness.invoke({sessionId: session.session.metadata.sessionId, payload: {instruction: "old prompt"}})).result();
        const result = await (await harness.invoke({sessionId: session.session.metadata.sessionId, payload: {instruction: "new prompt"}})).result();
        expect(result.status).toBe("completed");
        expect(summaryRequests).toHaveLength(1);
        expect(JSON.stringify(summaryRequests[0]?.messages)).toContain("old answer");
        const snapshot = await harness.snapshot(session.session.metadata.sessionId);
        expect(snapshot.session.entries.some((entry) => entry.kind === "agent.compaction")).toBe(true);
    });

    test("摘要失败时不写 compaction entry，并使 Invocation 明确失败", async () => {
        const registry = new ProfileRegistry();
        registry.define({
            manifest: {key: "compact-fail", name: "Compact Fail"},
            initial: schema,
            payload: schema,
            prepare: () => ({systemPrompt: "x", modelConfig: {}, compaction: {triggerTokens: 3, keepRecentTokens: 1}}),
        });
        const harness = new NeuroAgentHarness({
            store: new MemorySessionStore(),
            profiles: registry,
            model: new ScriptedModelRuntime([{
                message: {role: "assistant", content: [{type: "text", text: "old"}], timestamp: 1},
            }]),
            compactor: {estimate: () => 1, summarize: async () => { throw new Error("summary provider failed"); }},
        });
        const session = await harness.createSession({profileKey: "compact-fail", initial: {}, hostContext: {}});
        await (await harness.invoke({sessionId: session.session.metadata.sessionId, payload: {first: true}})).result();
        const result = await (await harness.invoke({sessionId: session.session.metadata.sessionId, payload: {second: true}})).result();
        expect(result.status).toBe("failed");
        const snapshot = await harness.snapshot(session.session.metadata.sessionId);
        expect(snapshot.session.entries.some((entry) => entry.kind === "agent.compaction")).toBe(false);
    });

    test("summarize 返回空 summary 时 Invocation 明确失败且不写 entry", async () => {
        const registry = new ProfileRegistry();
        registry.define({
            manifest: {key: "compact-empty-summary", name: "Compact Empty Summary"},
            initial: schema,
            payload: schema,
            prepare: () => ({systemPrompt: "x", modelConfig: {}, compaction: {triggerTokens: 3, keepRecentTokens: 1}}),
        });
        const harness = new NeuroAgentHarness({
            store: new MemorySessionStore(),
            profiles: registry,
            model: new ScriptedModelRuntime([
                {message: {role: "assistant", content: [{type: "text", text: "old"}], timestamp: 1}},
            ]),
            compactor: {
                estimate: () => 1,
                summarize: async () => "   ",
            },
        });
        const session = await harness.createSession({profileKey: "compact-empty-summary", initial: {}, hostContext: {}});
        const sessionId = session.session.metadata.sessionId;
        await (await harness.invoke({sessionId, payload: {first: true}})).result();
        const result = await (await harness.invoke({sessionId, payload: {second: true}})).result();
        expect(result.status).toBe("failed");
        expect(result.error?.message).toContain("ContextCompactor 返回了空 summary");
        const snapshot = await harness.snapshot(sessionId);
        expect(snapshot.session.entries.some((entry) => entry.kind === "agent.compaction")).toBe(false);
        await harness.dispose();
    });
    test("自动压缩摘要期间 follow-up 写入不应使当前 Invocation 失败", async () => {
        let releaseSummary!: () => void;
        const summaryGate = new Promise<void>((resolve) => {
            releaseSummary = resolve;
        });
        const registry = new ProfileRegistry();
        registry.define({
            manifest: {key: "compact-follow-up-race", name: "Compact Follow-up Race"},
            initial: schema,
            payload: schema,
            prepare: () => ({
                systemPrompt: "x",
                modelConfig: {},
                compaction: {triggerTokens: 3, keepRecentTokens: 1},
            }),
        });
        const harness = new NeuroAgentHarness({
            store: new MemorySessionStore(),
            profiles: registry,
            model: new ScriptedModelRuntime([
                {message: {role: "assistant", content: [{type: "text", text: "old"}], timestamp: 1}},
                {message: {role: "assistant", content: [{type: "text", text: "new"}], timestamp: 2}},
            ]),
            compactor: {
                estimate: () => 1,
                async summarize() {
                    await summaryGate;
                    return "summary";
                },
            },
        });
        const created = await harness.createSession({profileKey: "compact-follow-up-race", initial: {}, hostContext: {}});
        const sessionId = created.session.metadata.sessionId;
        expect((await (await harness.invoke({sessionId, payload: {old: true}})).result()).status).toBe("completed");
        const current = await harness.invoke({sessionId, payload: {new: true}});
        await Promise.resolve();
        const queued = await harness.followUp(sessionId, {follow: true});
        releaseSummary();

        const result = await current.result();
        const snapshot = await harness.snapshot(sessionId);
        expect(result.status).toBe("completed");
        expect(snapshot.session.entries.some((entry) => entry.kind === "agent.compaction")).toBe(true);
        expect(snapshot.session.entries.some((entry) => entry.kind === "harness.followUp.queued")).toBe(true);
        await harness.dispose();
    });
});
