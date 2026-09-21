import {describe, expect, test} from "bun:test";
import {
    NeuroAgentHarness,
    ProfileRegistry,
    createAgentMessageEntryDraft,
    defineProfile,
    defineSchema,
    defineTool,
    type JsonObject,
} from "../src/index.js";
import {projectSessionTranscript} from "../src/session-transcript.js";
import {MemorySessionStore} from "../src/storage/memory.js";
import {ScriptedModelRuntime} from "../src/testing/index.js";

const objectSchema = defineSchema<JsonObject>((value) => {
    if (value === null || typeof value !== "object" || Array.isArray(value)) {
        throw new Error("必须是 object");
    }
    return value;
}, {type: "object"});

function assistant(text: string, timestamp = 1) {
    return {
        message: {
            role: "assistant" as const,
            content: [{type: "text" as const, text}],
            timestamp,
        },
    };
}

function toolCallMessage(callId: string, toolName: string, timestamp = 1) {
    return {
        message: {
            role: "assistant" as const,
            content: [{type: "toolCall" as const, call: {id: callId, name: toolName, arguments: {}}}],
            timestamp,
        },
    };
}

function textOf(message: {role: string; content: unknown}): string {
    if (typeof message.content === "string") return message.content;
    return (message.content as Array<{text?: string; type?: string}>)
        .map((block) => block.text ?? block.type)
        .join("|");
}

// 第九十轮：compactIfNeeded 切分合同收口（parity 代理 B/Hume 的 B 组缺口）。
// 以下行为此前存在但零断言：二次压缩（previousSummary 传递与 boundary 之后
// 切分）、toolResult cut 前移、空窗口 skip、非法 settings 拒绝、悬挂
// firstKeptEntryId fail-closed；并钉住 C2 语义（previous summary 计入
// keepRecent 预算，与 NeuroBook 不同，SA 更保守）。
describe("compaction splitting contract", () => {
    test("二次压缩：previousSummary 传入，从 boundary 之后切分，firstKeptEntryId 指向真实 entry", async () => {
        const summaryRequests: Array<{messages: string[]; previousSummary?: string}> = [];
        let summarizeCalls = 0;
        const harness = new NeuroAgentHarness({
            store: new MemorySessionStore(),
            profiles: new ProfileRegistry().add(defineProfile({
                manifest: {key: "compact-twice", name: "Compact Twice"},
                initial: objectSchema,
                payload: objectSchema,
                prepare: () => ({
                    systemPrompt: "twice",
                    modelConfig: {},
                    compaction: {triggerTokens: 4, keepRecentTokens: 1},
                }),
            })),
            model: new ScriptedModelRuntime([
                assistant("a1", 1),
                assistant("a2", 2),
                assistant("a3", 3),
                assistant("a4", 4),
            ]),
            compactor: {
                estimate: () => 1,
                async summarize(request) {
                    summarizeCalls += 1;
                    const previousSummary = request.previousSummary;
                    summaryRequests.push({
                        messages: request.messages.map((message) => textOf(message)),
                        ...(previousSummary !== undefined ? {previousSummary} : {}),
                    });
                    return `summary-${summarizeCalls}`;
                },
            },
        });
        const created = await harness.createSession({profileKey: "compact-twice", initial: {}, hostContext: {}});
        const sessionId = created.session.metadata.sessionId;
        for (const payload of [{step: 1}, {step: 2}, {step: 3}, {step: 4}]) {
            const result = await (await harness.invoke({sessionId, payload})).result();
            expect(result.status).toBe("completed");
        }

        expect(summarizeCalls).toBe(2);
        expect(summaryRequests[0]).toEqual({
            messages: ['{"step":1}', "a1", '{"step":2}', "a2"],
        });
        expect(summaryRequests[1]).toEqual({
            messages: ['{"step":3}', "a3"],
            previousSummary: "summary-1",
        });
        const snapshot = await harness.snapshot(sessionId);
        const compactionEntries = snapshot.session.entries.filter((entry) => entry.kind === "agent.compaction");
        expect(compactionEntries).toHaveLength(2);
        const second = compactionEntries[1]!.payload as {summary: string; firstKeptEntryId: string | null; tokensBefore: number};
        // C2：previous summary 计入预算——若不计，第二次触发点只有 3 条
        // 消息 < trigger 4，不会发生第二次压缩；tokensBefore 实测 4。
        expect(second.tokensBefore).toBe(4);
        expect(second.firstKeptEntryId).not.toBeNull();
        expect(snapshot.session.entries.some((entry) => entry.id === second.firstKeptEntryId)).toBe(true);
        const projection = projectSessionTranscript(snapshot.session);
        expect(projection.previousSummary).toBe("summary-2");
        expect(projection.messages.map((message) => textOf(message))).toEqual(["summary-2", '{"step":4}', "a4"]);
        await harness.dispose();
    });

    test("keepRecent 落在 toolResult 上时 cut 前移到匹配 assistant，投影不出现半截 toolResult", async () => {
        const noop = defineTool({
            name: "noop",
            description: "noop",
            parameters: objectSchema,
            execute: () => ({content: "ok"}),
        });
        const summaryRequests: string[][] = [];
        let summarizeCalls = 0;
        const harness = new NeuroAgentHarness({
            store: new MemorySessionStore(),
            profiles: new ProfileRegistry().add(defineProfile({
                manifest: {key: "compact-cut", name: "Compact Cut"},
                initial: objectSchema,
                payload: objectSchema,
                prepare: () => ({
                    systemPrompt: "cut",
                    modelConfig: {},
                    tools: [noop],
                    compaction: {triggerTokens: 4, keepRecentTokens: 3},
                }),
            })),
            model: new ScriptedModelRuntime([
                toolCallMessage("cut-1", "noop", 2),
                assistant("a2", 3),
                assistant("a3", 4),
            ]),
            compactor: {
                estimate: () => 1,
                async summarize(request) {
                    summarizeCalls += 1;
                    summaryRequests.push(request.messages.map((message) => textOf(message)));
                    return "summary-cut";
                },
            },
        });
        const created = await harness.createSession({profileKey: "compact-cut", initial: {}, hostContext: {}});
        const sessionId = created.session.metadata.sessionId;
        await (await harness.invoke({sessionId, payload: {}})).result();
        const result = await (await harness.invoke({sessionId, payload: {}})).result();
        expect(result.status).toBe("completed");

        // 第一次压缩只应把 u1 折叠：walk-back 落在 toolResult 上时前移到
        // 匹配的 assistant toolCall，pair 保持完整。
        expect(summarizeCalls).toBe(1);
        expect(summaryRequests[0]).toEqual(["{}"]);
        const snapshot = await harness.snapshot(sessionId);
        const compaction = snapshot.session.entries.find((entry) => entry.kind === "agent.compaction");
        const payload = compaction?.payload as {summary: string; firstKeptEntryId: string | null; tokensBefore: number};
        const keptEntry = snapshot.session.entries.find((entry) => entry.id === payload.firstKeptEntryId);
        expect(keptEntry).toBeDefined();
        expect(JSON.stringify((keptEntry!.payload as {message?: unknown}).message)).toContain("cut-1");
        const projection = projectSessionTranscript(snapshot.session);
        expect(projection.messages.map((message) => textOf(message)))
            .toEqual(["summary-cut", "toolCall", "ok", "a2", "{}", "a3"]);
        await harness.dispose();
    });

    test("keepRecent 覆盖全部可见 token 时跳过压缩（不写 entry）", async () => {
        let summarizeCalls = 0;
        const harness = new NeuroAgentHarness({
            store: new MemorySessionStore(),
            profiles: new ProfileRegistry().add(defineProfile({
                manifest: {key: "compact-skip", name: "Compact Skip"},
                initial: objectSchema,
                payload: objectSchema,
                prepare: () => ({
                    systemPrompt: "skip",
                    modelConfig: {},
                    compaction: {triggerTokens: 3, keepRecentTokens: 1},
                }),
            })),
            model: new ScriptedModelRuntime([assistant("done", 1)]),
            compactor: {
                estimate: () => 3,
                async summarize() {
                    summarizeCalls += 1;
                    return "should-not-happen";
                },
            },
        });
        const created = await harness.createSession({profileKey: "compact-skip", initial: {}, hostContext: {}});
        const sessionId = created.session.metadata.sessionId;
        const result = await (await harness.invoke({sessionId, payload: {}})).result();
        expect(result.status).toBe("completed");
        expect(summarizeCalls).toBe(0);
        const snapshot = await harness.snapshot(sessionId);
        expect(snapshot.session.entries.some((entry) => entry.kind === "agent.compaction")).toBe(false);
        await harness.dispose();
    });

    test("非法 compaction settings（keepRecent >= trigger）使 Invocation 明确失败", async () => {
        const harness = new NeuroAgentHarness({
            store: new MemorySessionStore(),
            profiles: new ProfileRegistry().add(defineProfile({
                manifest: {key: "compact-invalid", name: "Compact Invalid"},
                initial: objectSchema,
                payload: objectSchema,
                prepare: () => ({
                    systemPrompt: "invalid",
                    modelConfig: {},
                    compaction: {triggerTokens: 2, keepRecentTokens: 2},
                }),
            })),
            model: new ScriptedModelRuntime([assistant("done", 1)]),
            compactor: {estimate: () => 1, summarize: async () => "x"},
        });
        const created = await harness.createSession({profileKey: "compact-invalid", initial: {}, hostContext: {}});
        const result = await (await harness.invoke({sessionId: created.session.metadata.sessionId, payload: {}})).result();
        expect(result.status).toBe("failed");
        expect(result.error?.message).toContain("compaction 要求 0 < keepRecentTokens < triggerTokens");
        await harness.dispose();
    });

    test("悬挂 firstKeptEntryId 在投影时 fail closed", async () => {
        const store = new MemorySessionStore();
        const created = await store.create({
            profileKey: "compact-ghost",
            initial: {},
            hostContext: {},
        });
        await store.commit({
            target: created.metadata.sessionId,
            expectedVersion: 0,
            cause: "test.compaction.ghost",
            operations: [{
                type: "appendEntries",
                entries: [{
                    kind: "agent.compaction",
                    payload: {summary: "ghost", firstKeptEntryId: "does-not-exist", tokensBefore: 1},
                }],
            }],
        });
        const harness = new NeuroAgentHarness({
            store,
            profiles: new ProfileRegistry().add(defineProfile({
                manifest: {key: "compact-ghost", name: "Compact Ghost"},
                initial: objectSchema,
                payload: objectSchema,
                prepare: () => ({systemPrompt: "ghost", modelConfig: {}}),
            })),
            model: new ScriptedModelRuntime([assistant("done", 1)]),
        });
        await expect(harness.invoke({sessionId: created.metadata.sessionId, payload: {}}))
            .rejects.toThrow(/compaction firstKeptEntryId 不存在/);
        await harness.dispose();
    });

    test("prepareWrites 贡献与 compaction 组合：贡献进入摘要窗口，cut 映射不漂移", async () => {
        const noop = defineTool({
            name: "noop",
            description: "noop",
            parameters: objectSchema,
            execute: () => ({content: "ok"}),
        });
        const summaryInputs: string[][] = [];
        const harness = new NeuroAgentHarness({
            store: new MemorySessionStore(),
            profiles: new ProfileRegistry().add(defineProfile({
                manifest: {key: "compact-contrib", name: "Compact Contrib"},
                initial: objectSchema,
                payload: objectSchema,
                prepare: (context) => ({
                    systemPrompt: "contrib",
                    modelConfig: {},
                    tools: [noop],
                    compaction: {triggerTokens: 3, keepRecentTokens: 1},
                    prepareWrites: [{
                        target: context.sessionId,
                        expectedVersion: context.snapshot.version,
                        cause: "test.compact-contrib",
                        operations: [{
                            type: "appendEntries",
                            entries: [createAgentMessageEntryDraft({
                                role: "user",
                                content: "CONTRIB",
                                timestamp: 5,
                            }, {turn: 0, invocationId: context.invocationId})],
                        }],
                    }],
                }),
            })),
            model: new ScriptedModelRuntime([
                toolCallMessage("t-1", "noop", 2),
                assistant("a2", 3),
            ]),
            compactor: {
                estimate: () => 1,
                async summarize(request) {
                    summaryInputs.push(request.messages.map((message) => textOf(message)));
                    return "S";
                },
            },
        });
        const created = await harness.createSession({
            profileKey: "compact-contrib",
            initial: {},
            hostContext: {},
        });
        const sessionId = created.session.metadata.sessionId;
        const result = await (await harness.invoke({sessionId, payload: {}})).result();
        expect(result.status).toBe("completed");
        // 贡献必须进入摘要窗口（与用户消息一起被折叠），而不是被投影丢弃。
        expect(summaryInputs[0]).toEqual(["CONTRIB", "{}"]);
        const snapshot = await harness.snapshot(sessionId);
        const projection = projectSessionTranscript(snapshot.session);
        expect(projection.messages.map((message) => textOf(message)))
            .toEqual(["S", "toolCall", "ok", "a2"]);
        // durable 记录保留贡献本身。
        expect(JSON.stringify(snapshot.session.entries)).toContain("CONTRIB");
        await harness.dispose();
    });
});
