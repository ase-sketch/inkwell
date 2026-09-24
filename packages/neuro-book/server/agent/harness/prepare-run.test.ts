import {describe, expect, it} from "vitest";
import {createUserMessage} from "nbook/server/agent/messages/message-utils";
import type {NeuroSessionContext, SessionSnapshot} from "nbook/server/agent/session/types";
import {buildPromptPrefixAttribution, compilePrepareRunWritePlan} from "nbook/server/agent/harness/prepare-run";

describe("prepare run reducer", () => {
    it("session context 启用时会编译 HistorySet 和 AppendingSet 写入", () => {
        const init = createUserMessage({text: "INIT"});
        const append = createUserMessage({text: "APPEND"});
        const modelAppend = createUserMessage({text: "MODEL_APPEND"});

        const plan = compilePrepareRunWritePlan({
            sessionId: 7,
            profileKey: "test.profile",
            context: fakeContext({messageCount: 0}),
            sessionContextEnabled: true,
            prepared: {
                historyInitMessages: [init],
                appendingMessages: [append],
                modelContextAppendingMessages: [modelAppend],
            },
        });

        expect(plan).toMatchObject({
            target: {sessionId: 7},
            cause: "profile.prepare",
            ops: [{
                kind: "appendMany",
                entries: [
                    {type: "custom_message", message: init, visibleToModel: true},
                    {type: "custom_message", message: modelAppend, visibleToModel: true},
                    {type: "custom_message", message: append, visibleToModel: true},
                ],
            }],
        });
    });

    it("session context 关闭时只保留 profile 私有 stateWrites", () => {
        const plan = compilePrepareRunWritePlan({
            sessionId: 7,
            profileKey: "test.profile",
            context: fakeContext({messageCount: 0}),
            sessionContextEnabled: false,
            prepared: {
                historyInitMessages: [createUserMessage({text: "INIT"})],
                appendingMessages: [createUserMessage({text: "APPEND"})],
                stateWrites: [{
                    type: "custom",
                    key: "profileState.test.profile",
                    value: {ok: true},
                }],
            },
        });

        expect(plan?.ops).toEqual([{
            kind: "appendMany",
            entries: [{
                type: "custom",
                key: "profileState.test.profile",
                value: {ok: true},
            }],
        }]);
    });

    it("已有消息时不会再次写入 history init messages", () => {
        const plan = compilePrepareRunWritePlan({
            sessionId: 7,
            profileKey: "test.profile",
            context: fakeContext({messageCount: 1}),
            sessionContextEnabled: true,
            prepared: {
                historyInitMessages: [createUserMessage({text: "INIT"})],
            },
        });

        expect(plan).toBeUndefined();
    });

    it("按分区写入 promptSource：HistorySet 与 AppendingSet 的 zone 和来源名各归各位", () => {
        const init = createUserMessage({text: "INIT"});
        const append = createUserMessage({text: "APPEND"});
        const modelAppend = createUserMessage({text: "MODEL_APPEND"});

        const plan = compilePrepareRunWritePlan({
            sessionId: 7,
            profileKey: "test.profile",
            context: fakeContext({messageCount: 0}),
            sessionContextEnabled: true,
            prepared: {
                historyInitMessages: [init],
                appendingMessages: [append],
                modelContextAppendingMessages: [modelAppend],
                promptSourceLabels: {
                    historyInit: [["Import:AGENTS.md"]],
                    appending: [["Reminder:agent-mode"]],
                    modelContextAppending: [["Reminder:workspace-focus"]],
                },
            },
        });

        const entries = plan?.ops[0]?.kind === "appendMany" ? plan.ops[0].entries : [];
        expect(entries.map((entry) => entry.type === "custom_message" ? entry.promptSource : null)).toEqual([
            {zone: "historySet", labels: ["Import:AGENTS.md"]},
            // modelContextAppending 排在 appending 之前，顺序错位会让归因整体串行。
            {zone: "appending", labels: ["Reminder:workspace-focus"]},
            {zone: "appending", labels: ["Reminder:agent-mode"]},
        ]);
    });

    it("首轮混合场景：每条 entry 的 labels/retrieval 与它自己的正文一致（防跨数组错位）", () => {
        // 真实首轮形态：DSL 静态消息与 turnContext 注入交错，多条注入共用同一个插入点。
        // prepare 时 harness 已用 mergeProfileTurnContextMessages 把注入插进 appendingMessages，
        // 所以这里喂进来的 appendingMessages 是 **merged 顺序**（长度 5），
        // 而 promptSourceLabels.appending 仍是 **DSL 编译顺序**（长度 2）。两者绝不可共用一个下标。
        const focus = createUserMessage({text: "FOCUS"});
        const availability = createUserMessage({text: "AVAIL"});
        const fcn = createUserMessage({text: "FCN"});
        const ledger = createUserMessage({text: "LEDGER"});
        const entities = createUserMessage({text: "ENTITIES"});

        const plan = compilePrepareRunWritePlan({
            sessionId: 7,
            profileKey: "test.profile",
            context: fakeContext({messageCount: 1}),
            sessionContextEnabled: true,
            prepared: {
                appendingMessages: [focus, fcn, ledger, entities, availability],
                // DSL 编译期只见过两条静态消息。
                promptSourceLabels: {
                    appending: [["Reminder:workspace-focus"], ["Reminder:mode-availability"]],
                },
            },
            turnContextInsertions: [
                {appendingIndex: 1, message: fcn, labels: ["TurnContext:file-change-notice"]},
                {
                    appendingIndex: 1,
                    message: ledger,
                    labels: ["TurnContext:promise-ledger"],
                    retrieval: {kind: "promise-ledger", items: [{title: "断剑之誓", promiseId: 11}], omittedCount: 0},
                },
                {
                    appendingIndex: 1,
                    message: entities,
                    labels: ["TurnContext:mentioned-entities"],
                    retrieval: {
                        kind: "mentioned-entities",
                        items: [{title: "苏云", category: "character", path: "lorebook/character/su-yun", trigger: "云哥"}],
                        omittedCount: 0,
                    },
                },
            ],
        });

        const entries = plan?.ops[0]?.kind === "appendMany" ? plan.ops[0].entries : [];
        const byText = new Map(entries.map((entry) => [
            entry.type === "custom_message" ? (entry.message.content[0] as {text: string}).text : "?",
            entry,
        ]));
        const labelsOf = (text: string) => {
            const entry = byText.get(text);
            return entry?.type === "custom_message" ? entry.promptSource?.labels : undefined;
        };
        const retrievalOf = (text: string) => {
            const entry = byText.get(text);
            return entry?.type === "custom_message" ? entry.retrieval : undefined;
        };

        expect(labelsOf("FOCUS")).toEqual(["Reminder:workspace-focus"]);
        expect(labelsOf("FCN")).toEqual(["TurnContext:file-change-notice"]);
        expect(labelsOf("LEDGER")).toEqual(["TurnContext:promise-ledger"]);
        expect(labelsOf("ENTITIES")).toEqual(["TurnContext:mentioned-entities"]);
        expect(labelsOf("AVAIL")).toEqual(["Reminder:mode-availability"]);

        expect(retrievalOf("LEDGER")).toEqual({kind: "promise-ledger", items: [{title: "断剑之誓", promiseId: 11}], omittedCount: 0});
        expect(retrievalOf("ENTITIES")?.kind).toBe("mentioned-entities");
        // 静态消息与不产出检索的注入都不该被塞 retrieval。
        expect(retrievalOf("FOCUS")).toBeUndefined();
        expect(retrievalOf("FCN")).toBeUndefined();
        expect(retrievalOf("AVAIL")).toBeUndefined();
    });

    it("turnContext 注入把检索明细与来源标签一并写进 custom_message entry", () => {
        const ledger = createUserMessage({text: "LEDGER"});
        const entities = createUserMessage({text: "ENTITIES"});
        const staticAppend = createUserMessage({text: "STATIC"});

        const plan = compilePrepareRunWritePlan({
            sessionId: 7,
            profileKey: "test.profile",
            context: fakeContext({messageCount: 1}),
            sessionContextEnabled: true,
            prepared: {appendingMessages: [staticAppend, ledger, entities]},
            turnContextInsertions: [
                {
                    appendingIndex: 1,
                    message: ledger,
                    labels: ["TurnContext:promise-ledger"],
                    retrieval: {kind: "promise-ledger", items: [{title: "断剑之誓", promiseId: 11}], omittedCount: 0},
                },
                {
                    appendingIndex: 2,
                    message: entities,
                    labels: ["TurnContext:mentioned-entities"],
                    retrieval: {
                        kind: "mentioned-entities",
                        items: [{title: "苏云", category: "character", path: "lorebook/character/hero", trigger: "云哥"}],
                        omittedCount: 2,
                    },
                },
            ],
        });

        const entries = plan?.ops[0]?.kind === "appendMany" ? plan.ops[0].entries : [];
        expect(entries[0]?.type === "custom_message" ? entries[0].promptSource : null).toEqual({zone: "appending"});
        expect(entries[0]?.type === "custom_message" ? entries[0].retrieval : undefined).toBeUndefined();

        expect(entries[1]).toMatchObject({
            type: "custom_message",
            promptSource: {zone: "appending", labels: ["TurnContext:promise-ledger"]},
            retrieval: {kind: "promise-ledger", items: [{title: "断剑之誓", promiseId: 11}], omittedCount: 0},
        });
        expect(entries[2]).toMatchObject({
            type: "custom_message",
            promptSource: {zone: "appending", labels: ["TurnContext:mentioned-entities"]},
            retrieval: {kind: "mentioned-entities", omittedCount: 2},
        });
    });

    it("后续 invocation 首轮：无静态消息、多类注入共用 index 0 时仍各归各位", () => {
        // 真实 session 13 第 26 行的形态：Reminder 因为状态没变不再重发，
        // 这一轮 appending 里只有注入，DSL 侧一条静态消息都没有（labels.appending === undefined），
        // 且所有注入的 appendingIndex 都是 0。
        // 旧实现用 Map<index, insertion> 会让 index 0 只剩最后一条，前面的注入集体挂错。
        const ledger = createUserMessage({text: "LEDGER"});
        const entities = createUserMessage({text: "ENTITIES"});

        const plan = compilePrepareRunWritePlan({
            sessionId: 7,
            profileKey: "test.profile",
            context: fakeContext({messageCount: 5}),
            sessionContextEnabled: true,
            prepared: {
                appendingMessages: [ledger, entities],
                promptSourceLabels: {appending: [null, null]},
            },
            turnContextInsertions: [
                {
                    appendingIndex: 0,
                    message: ledger,
                    labels: ["TurnContext:promise-ledger"],
                    retrieval: {kind: "promise-ledger", items: [{title: "断剑之誓", promiseId: 11}], omittedCount: 0},
                },
                {
                    appendingIndex: 0,
                    message: entities,
                    labels: ["TurnContext:mentioned-entities"],
                    retrieval: {
                        kind: "mentioned-entities",
                        items: [{title: "黑鸦堡", category: "location", path: "lorebook/location/hei-ya-bao", trigger: "黑鸦堡"}],
                        omittedCount: 0,
                    },
                },
            ],
        });

        const entries = plan?.ops[0]?.kind === "appendMany" ? plan.ops[0].entries : [];
        expect(entries).toHaveLength(2);
        expect(entries[0]).toMatchObject({
            promptSource: {zone: "appending", labels: ["TurnContext:promise-ledger"]},
            retrieval: {kind: "promise-ledger"},
        });
        expect(entries[1]).toMatchObject({
            promptSource: {zone: "appending", labels: ["TurnContext:mentioned-entities"]},
            retrieval: {kind: "mentioned-entities", items: [expect.objectContaining({title: "黑鸦堡"})]},
        });
    });

    it("注入未按引用命中 appendingMessages 时抛错，绝不把归因挂到别的消息上", () => {
        // 归因只认消息对象引用。物化器给的插入参数与 prepare 产出若不是同一批对象，
        // 旧实现会按位置硬套（挂错位），这里必须当场炸。
        expect(() => compilePrepareRunWritePlan({
            sessionId: 7,
            profileKey: "test.profile",
            context: fakeContext({messageCount: 1}),
            sessionContextEnabled: true,
            prepared: {appendingMessages: [createUserMessage({text: "APPEND"})]},
            turnContextInsertions: [{
                appendingIndex: 0,
                message: createUserMessage({text: "NOT_IN_LIST"}),
                labels: ["TurnContext:promise-ledger"],
                retrieval: {kind: "promise-ledger", items: [{title: "断剑之誓", promiseId: 11}]},
            }],
        })).toThrow(/注入未能按引用命中 appendingMessages/u);
    });

    it("多条注入共用同一插入点时不互相覆盖，各自按引用拿到归因", () => {
        const first = createUserMessage({text: "FIRST"});
        const second = createUserMessage({text: "SECOND"});
        const plan = compilePrepareRunWritePlan({
            sessionId: 7,
            profileKey: "test.profile",
            context: fakeContext({messageCount: 1}),
            sessionContextEnabled: true,
            prepared: {appendingMessages: [first, second]},
            turnContextInsertions: [
                {
                    appendingIndex: 1,
                    message: first,
                    labels: ["TurnContext:promise-ledger"],
                    retrieval: {kind: "promise-ledger", items: [{title: "断剑之誓", promiseId: 11}]},
                },
                {
                    appendingIndex: 1,
                    message: second,
                    labels: ["TurnContext:mentioned-entities"],
                    retrieval: {kind: "mentioned-entities", items: [{title: "苏云", category: "character", path: "lorebook/character/su-yun", trigger: "云哥"}]},
                },
            ],
        });

        const entries = plan?.ops[0]?.kind === "appendMany" ? plan.ops[0].entries : [];
        expect(entries).toHaveLength(2);
        expect(entries[0]).toMatchObject({
            promptSource: {zone: "appending", labels: ["TurnContext:promise-ledger"]},
            retrieval: {kind: "promise-ledger"},
        });
        expect(entries[1]).toMatchObject({
            promptSource: {zone: "appending", labels: ["TurnContext:mentioned-entities"]},
            retrieval: {kind: "mentioned-entities"},
        });
    });

    it("无具名来源时仍写入 zone，匿名 AppendingSet 消息不会被当成普通对话", () => {
        const plan = compilePrepareRunWritePlan({
            sessionId: 7,
            profileKey: "test.profile",
            context: fakeContext({messageCount: 0}),
            sessionContextEnabled: true,
            prepared: {appendingMessages: [createUserMessage({text: "ANON"})]},
        });

        const entries = plan?.ops[0]?.kind === "appendMany" ? plan.ops[0].entries : [];
        expect(entries[0]?.type === "custom_message" ? entries[0].promptSource : null).toEqual({zone: "appending"});
    });

    it("拒绝 profile 写入非自身 state key", () => {
        expect(() => compilePrepareRunWritePlan({
            sessionId: 7,
            profileKey: "test.profile",
            context: fakeContext({messageCount: 0}),
            sessionContextEnabled: true,
            prepared: {
                stateWrites: [{
                    type: "custom",
                    key: "other",
                    value: null,
                }],
            },
        })).toThrow("stateWrites 只允许写 profileState.test.profile");
    });
});

describe("buildPromptPrefixAttribution", () => {
    it("按 promptSource 区分 HistorySet 前缀、历史沉淀的旧提醒与普通对话", () => {
        const history = createUserMessage({text: "HISTORY_SET"});
        const oldReminder = createUserMessage({text: "OLD_REMINDER"});
        const chat = createUserMessage({text: "CHAT"});
        const appending = createUserMessage({text: "APPENDING"});
        const currentInput = createUserMessage({text: "NOW"});
        const persistedMessages = [history, oldReminder, chat, appending, currentInput];

        const attribution = buildPromptPrefixAttribution({
            snapshot: fakeSnapshot([
                {message: history, promptSource: {zone: "historySet", labels: ["Import:AGENTS.md"]}},
                {message: oldReminder, promptSource: {zone: "appending", labels: ["Reminder:agent-mode"]}},
                {message: appending, promptSource: {zone: "appending", labels: ["Reminder:workspace-focus"]}},
            ]),
            persistedMessages,
            modelContextCount: 1,
            appendingCount: 1,
            currentUserInputCount: 1,
        });

        expect(attribution.kinds).toEqual([
            "historySet",
            // 历史里沉淀的旧 AppendingSet 提醒仍归 appending，不该被混进对话历史。
            "appending",
            "conversation",
            "modelContext",
            "appending",
            "currentInput",
        ]);
        expect(attribution.labels).toEqual([
            ["Import:AGENTS.md"],
            ["Reminder:agent-mode"],
            null,
            null,
            ["Reminder:workspace-focus"],
            null,
        ]);
    });

    it("有 promptSource 时 mode 为 full", () => {
        const message = createUserMessage({text: "H"});
        const attribution = buildPromptPrefixAttribution({
            snapshot: fakeSnapshot([{message, promptSource: {zone: "historySet"}}]),
            persistedMessages: [message],
            modelContextCount: 0,
            appendingCount: 0,
            currentUserInputCount: 0,
        });
        expect(attribution.mode).toBe("full");
    });

    it("旧 session 无 promptSource 时按位置推断：首条真实消息之前的 custom_message 判为 HistorySet", () => {
        const historyA = createUserMessage({text: "HISTORY_A"});
        const historyB = createUserMessage({text: "HISTORY_B"});
        const chat = createUserMessage({text: "CHAT"});
        const laterReminder = createUserMessage({text: "LATER_REMINDER"});
        const persistedMessages = [historyA, historyB, chat, laterReminder];

        const attribution = buildPromptPrefixAttribution({
            snapshot: {
                entries: [
                    {id: "e0", parentId: null, timestamp: 0, type: "custom_message", message: historyA, visibleToModel: true},
                    {id: "e1", parentId: null, timestamp: 1, type: "custom_message", message: historyB, visibleToModel: true},
                    {id: "e2", parentId: null, timestamp: 2, type: "message", message: chat},
                    {id: "e3", parentId: null, timestamp: 3, type: "custom_message", message: laterReminder, visibleToModel: true},
                ],
            } as unknown as SessionSnapshot,
            persistedMessages,
            modelContextCount: 0,
            appendingCount: 0,
            currentUserInputCount: 0,
        });

        expect(attribution.mode).toBe("legacy");
        // 首条真实 message 之前 = HistorySet（含分不开的首轮提醒）；之后的 custom_message = AppendingSet。
        expect(attribution.kinds).toEqual(["historySet", "historySet", "conversation", "appending"]);
        // 位置推断给不出具名来源。
        expect(attribution.labels).toEqual([null, null, null, null]);
    });

    it("完全没有 custom_message 的旧 session 全部按对话归因，不报错", () => {
        const messages = [createUserMessage({text: "A"}), createUserMessage({text: "B"})];
        const attribution = buildPromptPrefixAttribution({
            snapshot: {
                entries: messages.map((message, index) => ({id: `e${String(index)}`, parentId: null, timestamp: index, type: "message", message})),
            } as unknown as SessionSnapshot,
            persistedMessages: messages,
            modelContextCount: 0,
            appendingCount: 0,
            currentUserInputCount: 0,
        });

        expect(attribution.kinds).toEqual(["conversation", "conversation"]);
        expect(attribution.labels).toEqual([null, null]);
    });

    it("ModelContext 插在 AppendingSet 之前——顺序与 assemblePersistedProfilePromptMessages 一致", () => {
        const messages = [createUserMessage({text: "H"}), createUserMessage({text: "APPEND"})];
        const attribution = buildPromptPrefixAttribution({
            snapshot: fakeSnapshot([{message: messages[1]!, promptSource: {zone: "appending"}}]),
            persistedMessages: messages,
            modelContextCount: 2,
            appendingCount: 1,
            currentUserInputCount: 0,
        });

        expect(attribution.kinds).toEqual(["conversation", "modelContext", "modelContext", "appending"]);
    });
});

function fakeSnapshot(entries: Array<{message: ReturnType<typeof createUserMessage>; promptSource?: {zone: "historySet" | "appending"; labels?: string[]}}>): SessionSnapshot {
    return {
        entries: entries.map((entry, index) => ({
            id: `e${String(index)}`,
            parentId: null,
            timestamp: index,
            type: "custom_message" as const,
            message: entry.message,
            visibleToModel: true,
            ...(entry.promptSource ? {promptSource: entry.promptSource} : {}),
        })),
    } as unknown as SessionSnapshot;
}

function fakeContext(input: {messageCount: number}): NeuroSessionContext {
    return {
        sessionId: 7,
        profileKey: "test.profile",
        workspaceRoot: "workspace",
        workspaceKey: "global",
        systemPrompt: "",
        model: null,
        thinkingLevel: null,
        messages: Array.from({length: input.messageCount}, (_, index) => createUserMessage({text: `message-${index}`})),
        customState: {},
        linkedAgents: [],
        agentMode: "normal",
        archived: false,
    } as NeuroSessionContext;
}
