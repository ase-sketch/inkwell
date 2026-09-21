import {describe, expect, test} from "bun:test";
import {mkdtemp, rm} from "node:fs/promises";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {
    InvocationConflictError,
    NeuroAgentHarness,
    ProfileRegistry,
    createAgentMessageEntryDraft,
    defineProfile,
    defineSchema,
    type ContextCompactor,
    type HarnessEvent,
    type JsonObject,
} from "../src/index.js";
import {projectSessionTranscript} from "../src/session-transcript.js";
import {JsonlSessionStore} from "../src/storage/jsonl.js";
import {MemorySessionStore} from "../src/storage/memory.js";
import {ScriptedModelRuntime} from "../src/testing/index.js";

const objectSchema = defineSchema<JsonObject>((value) => {
    if (value === null || typeof value !== "object" || Array.isArray(value)) {
        throw new Error("必须是 object");
    }
    return value;
}, {type: "object"});

function completed(text: string, timestamp = 1) {
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

function harnessWith(store: MemorySessionStore<number, JsonObject> | JsonlSessionStore<JsonObject>, overrides: {
    compactor?: ContextCompactor;
    model?: ScriptedModelRuntime<JsonObject>;
} = {}) {
    return new NeuroAgentHarness({
        store,
        profiles: new ProfileRegistry().add(defineProfile({
            manifest: {key: "compact-session", name: "Compact Session"},
            initial: objectSchema,
            payload: objectSchema,
            prepare: () => ({systemPrompt: "compact-session", modelConfig: {}}),
        })),
        model: overrides.model ?? new ScriptedModelRuntime([
            completed("a1", 1),
            completed("a2", 2),
        ]),
        ...(overrides.compactor ? {compactor: overrides.compactor} : {}),
    });
}

// 第九十五轮：ADR-0037 手动 compact（宿主驱动、idle-only、复用切分语义）。
describe("compactSession", () => {
    test("idle Session 上折叠历史：写 entry、投影更新、不创建 Invocation、不发 runtime 事件", async () => {
        const harness = harnessWith(new MemorySessionStore(), {
            compactor: {
                estimate: () => 1,
                summarize: async (request) => {
                    expect(request.instructions).toBeUndefined();
                    return "S";
                },
            },
        });
        const created = await harness.createSession({profileKey: "compact-session", initial: {}, hostContext: {}});
        const sessionId = created.session.metadata.sessionId;
        await (await harness.invoke({sessionId, payload: {}})).result();
        await (await harness.invoke({sessionId, payload: {}})).result();
        const received: HarnessEvent<number>[] = [];
        const subscription = harness.subscribe(sessionId, {});
        const collector = (async () => {
            for await (const event of subscription) {
                received.push(event);
                if (event.kind === "session"
                    && event.event.type === "session_entry"
                    && event.event.entry.kind === "agent.compaction") {
                    break;
                }
            }
        })();

        const outcome = await harness.compactSession(sessionId, {keepRecentTokens: 1});
        expect(outcome.compacted).toBe(true);
        await collector;

        const snapshot = await harness.snapshot(sessionId);
        const entry = snapshot.session.entries.find((candidate) => candidate.kind === "agent.compaction");
        expect(entry).toBeDefined();
        expect(entry).not.toHaveProperty("invocationId");
        expect((entry!.payload as {summary: string}).summary).toBe("S");
        expect(snapshot.session.invocations).toHaveLength(2);
        const projection = projectSessionTranscript(snapshot.session);
        expect(projection.messages.map((message) => textOf(message))).toEqual(["S", "a2"]);
        // 手动路径不发布 invocation-scoped compaction runtime 事件。
        expect(received.some((event) => {
            return event.kind === "runtime"
                && (event.event.type === "compaction_start" || event.event.type === "compaction_end");
        })).toBe(false);
        await harness.dispose();
    });

    test("instructions 原样传给 summarize", async () => {
        const seen: string[] = [];
        const harness = harnessWith(new MemorySessionStore(), {
            compactor: {
                estimate: () => 1,
                summarize: async (request) => {
                    seen.push(request.instructions ?? "");
                    return "S";
                },
            },
        });
        const created = await harness.createSession({profileKey: "compact-session", initial: {}, hostContext: {}});
        const sessionId = created.session.metadata.sessionId;
        await (await harness.invoke({sessionId, payload: {}})).result();
        await (await harness.invoke({sessionId, payload: {}})).result();
        await harness.compactSession(sessionId, {
            keepRecentTokens: 1,
            instructions: "总结历史",
        });
        await harness.dispose();
        expect(seen).toEqual(["总结历史"]);
    });

    test("空窗口时返回 compacted false 且不写 entry", async () => {
        let summarizeCalls = 0;
        const harness = harnessWith(new MemorySessionStore(), {
            compactor: {
                estimate: () => 1,
                summarize: async () => {
                    summarizeCalls += 1;
                    return "S";
                },
            },
            model: new ScriptedModelRuntime([completed("a1", 1)]),
        });
        const created = await harness.createSession({profileKey: "compact-session", initial: {}, hostContext: {}});
        const sessionId = created.session.metadata.sessionId;
        await (await harness.invoke({sessionId, payload: {}})).result();
        // 单次 invoke 产生 [user, assistant] 两条消息；keepRecent 覆盖全部
        // 可见 token 时 walk 停在 index 0 → 空窗口 skip。
        const outcome = await harness.compactSession(sessionId, {keepRecentTokens: 2});
        expect(outcome.compacted).toBe(false);
        expect(summarizeCalls).toBe(0);
        const snapshot = await harness.snapshot(sessionId);
        expect(snapshot.session.entries.some((entry) => entry.kind === "agent.compaction")).toBe(false);
        await harness.dispose();
    });

    test("active Invocation 存在时抛 InvocationConflictError", async () => {
        let release!: () => void;
        const gate = new Promise<void>((resolve) => {
            release = resolve;
        });
        const harness = harnessWith(new MemorySessionStore(), {
            compactor: {estimate: () => 1, summarize: async () => "S"},
            model: new ScriptedModelRuntime([async () => {
                await gate;
                return completed("a1", 1);
            }]),
        });
        const created = await harness.createSession({profileKey: "compact-session", initial: {}, hostContext: {}});
        const sessionId = created.session.metadata.sessionId;
        const handle = await harness.invoke({sessionId, payload: {}});
        await expect(harness.compactSession(sessionId, {keepRecentTokens: 1}))
            .rejects.toBeInstanceOf(InvocationConflictError);
        release();
        await handle.result();
        await harness.dispose();
    });

    test("未配置 ContextCompactor 时明确失败", async () => {
        const harness = harnessWith(new MemorySessionStore());
        const created = await harness.createSession({profileKey: "compact-session", initial: {}, hostContext: {}});
        await expect(harness.compactSession(created.session.metadata.sessionId, {keepRecentTokens: 1}))
            .rejects.toThrow("Harness 未配置 ContextCompactor，不能手动压缩");
        await harness.dispose();
    });

    test("非法 keepRecentTokens 拒绝", async () => {
        const harness = harnessWith(new MemorySessionStore(), {
            compactor: {estimate: () => 1, summarize: async () => "S"},
        });
        const created = await harness.createSession({profileKey: "compact-session", initial: {}, hostContext: {}});
        const sessionId = created.session.metadata.sessionId;
        for (const keepRecentTokens of [0, -1, 1.5, Number.NaN]) {
            await expect(harness.compactSession(sessionId, {keepRecentTokens}))
                .rejects.toThrow("keepRecentTokens 必须是正整数");
        }
        await harness.dispose();
    });

    test("悬挂 Tool Call 使手动压缩 fail closed", async () => {
        const store = new MemorySessionStore();
        const created = await store.create({profileKey: "compact-session", initial: {}, hostContext: {}});
        await store.commit({
            target: created.metadata.sessionId,
            expectedVersion: 0,
            cause: "test.dangling",
            operations: [{
                type: "appendEntries",
                entries: [createAgentMessageEntryDraft({
                    role: "assistant",
                    content: [{type: "toolCall", call: {id: "d-1", name: "noop", arguments: {}}}],
                    timestamp: 1,
                }, {turn: 1})],
            }],
        });
        const harness = harnessWith(store, {
            compactor: {estimate: () => 1, summarize: async () => "S"},
        });
        await expect(harness.compactSession(created.metadata.sessionId, {keepRecentTokens: 1}))
            .rejects.toThrow(/存在未完成 Tool Call/);
        await harness.dispose();
    });

    test("摘要失败时抛错且不写 entry", async () => {
        const harness = harnessWith(new MemorySessionStore(), {
            compactor: {
                estimate: () => 1,
                summarize: async () => {
                    throw new Error("summarizer down");
                },
            },
        });
        const created = await harness.createSession({profileKey: "compact-session", initial: {}, hostContext: {}});
        const sessionId = created.session.metadata.sessionId;
        await (await harness.invoke({sessionId, payload: {}})).result();
        await (await harness.invoke({sessionId, payload: {}})).result();
        await expect(harness.compactSession(sessionId, {keepRecentTokens: 1}))
            .rejects.toThrow("summarizer down");
        const snapshot = await harness.snapshot(sessionId);
        expect(snapshot.session.entries.some((entry) => entry.kind === "agent.compaction")).toBe(false);
        await harness.dispose();
    });

    test("summarize 返回空 summary 时抛错且不写 entry", async () => {
        const harness = harnessWith(new MemorySessionStore(), {
            compactor: {
                estimate: () => 1,
                summarize: async () => "   ",
            },
        });
        const created = await harness.createSession({profileKey: "compact-session", initial: {}, hostContext: {}});
        const sessionId = created.session.metadata.sessionId;
        await (await harness.invoke({sessionId, payload: {}})).result();
        await (await harness.invoke({sessionId, payload: {}})).result();
        await expect(harness.compactSession(sessionId, {keepRecentTokens: 1}))
            .rejects.toThrow("ContextCompactor 返回了空 summary");
        const snapshot = await harness.snapshot(sessionId);
        expect(snapshot.session.entries.some((entry) => entry.kind === "agent.compaction")).toBe(false);
        await harness.dispose();
    });

    test("summarize 后 signal 中止使手动压缩可见失败", async () => {
        const harness = harnessWith(new MemorySessionStore(), {
            compactor: {
                estimate: () => 1,
                summarize: async () => "S",
            },
        });
        const created = await harness.createSession({profileKey: "compact-session", initial: {}, hostContext: {}});
        const sessionId = created.session.metadata.sessionId;
        await (await harness.invoke({sessionId, payload: {}})).result();
        await (await harness.invoke({sessionId, payload: {}})).result();
        const controller = new AbortController();
        controller.abort();
        await expect(harness.compactSession(sessionId, {keepRecentTokens: 1, signal: controller.signal}))
            .rejects.toThrow();
        await harness.dispose();
    });

    test("JSONL 重启后手动压缩的投影可恢复", async () => {
        const directory = await mkdtemp(join(tmpdir(), "harness-compact-session-"));
        try {
            const store = new JsonlSessionStore<JsonObject>({directory});
            const first = harnessWith(store, {
                compactor: {estimate: () => 1, summarize: async () => "S-restart"},
                model: new ScriptedModelRuntime([
                    completed("a1", 1),
                    completed("a2", 2),
                    completed("a3", 3),
                ]),
            });
            const created = await first.createSession({profileKey: "compact-session", initial: {}, hostContext: {}});
            const sessionId = created.session.metadata.sessionId;
            await (await first.invoke({sessionId, payload: {}})).result();
            await (await first.invoke({sessionId, payload: {}})).result();
            await first.compactSession(sessionId, {keepRecentTokens: 1});
            await first.dispose();

            const restoredStore = new JsonlSessionStore<JsonObject>({directory});
            const model = new ScriptedModelRuntime<JsonObject>([{
                message: {
                    role: "assistant",
                    content: [{type: "text", text: "a3"}],
                    timestamp: 3,
                },
            }]);
            const second = harnessWith(restoredStore, {
                compactor: {estimate: () => 1, summarize: async () => "unused"},
                model,
            });
            const result = await (await second.invoke({sessionId, payload: {}})).result();
            expect(result.status).toBe("completed");
            const request = model.requests[0]!;
            expect(request.messages.map((message) => textOf(message)))
                .toContain("S-restart");
            await second.dispose();
        } finally {
            await rm(directory, {recursive: true, force: true});
        }
    });
});
