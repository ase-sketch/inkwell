import {createPinia, defineStore, setActivePinia} from "pinia";
import {computed, effectScope, nextTick, ref, watch} from "vue";
import {beforeAll, beforeEach, describe, expect, it, vi} from "vitest";
import type {InlineEditorAgentControllerServices} from "nbook/app/composables/useInlineEditorAgentController";
import type {AgentSessionRecoveryDto, AgentSessionSummaryDto} from "nbook/shared/dto/agent-session.dto";

describe("useInlineEditorAgentController", () => {
    beforeAll(() => {
        const globals = globalThis as typeof globalThis & Record<string, unknown>;
        globals.defineStore = defineStore;
        globals.ref = ref;
        globals.computed = computed;
        globals.watch = watch;
        globals.piniaPluginPersistedstate = {sessionStorage: () => ({})};
    });

    beforeEach(() => {
        setActivePinia(createPinia());
    });

    it("IDE 模式不挂载 Agent Chat Surface 也能创建并调用 Inline Session", async () => {
        const {useInlineEditorAgentController} = await import("nbook/app/composables/useInlineEditorAgentController");
        const {useNovelIdeStore} = await import("nbook/app/stores/novel-ide");
        const active = ref(false);
        const projectReadyRevision = ref<number | null>(7);
        const selectedFilePath = ref("manuscript/chapter-01.md");
        const store = useNovelIdeStore();
        store.workspaceKind = "novel";
        store.currentProjectRoot = "book-a";

        let summaries: AgentSessionSummaryDto[] = [];
        const listSessions = vi.fn(async () => ({
            items: summaries,
            total: summaries.length,
            offset: 0,
            limit: 50,
            hasMore: false,
        }));
        const createSession = vi.fn(async () => {
            summaries = [summary(41)];
            return {sessionId: 41, profileKey: "inline.editor"};
        });
        const getSessionRecovery = vi.fn(async (sessionId: number) => recovery(sessionId));
        const invokeSession = vi.fn(async () => ({
            sessionId: 41,
            invocationId: "invocation-1",
            status: "completed" as const,
            finalMessage: "完成",
            acceptance: {
                state: "persisted" as const,
                clientMessageId: "client-message-1",
                entryId: "entry-1",
            },
        }));
        const stream = {
            ensure: vi.fn(async () => {}),
            start: vi.fn(async () => {}),
            stop: vi.fn(),
            syncRecovery: vi.fn(async () => true),
        };
        const services: InlineEditorAgentControllerServices = {
            api: {
                abortSession: vi.fn(async () => ({sessionId: 41, status: "aborted" as const})),
                createSession,
                getSessionRecovery,
                invokeSession,
                listSessions,
                runCommand: vi.fn(),
                subscribeSessionEvents: vi.fn(async () => {}),
            },
            createStream: vi.fn(() => stream),
            loadSelectableModels: vi.fn(async () => []),
            acknowledgeClientPatch: vi.fn(async () => {}),
            buildClientState: vi.fn(() => ({})),
            notifyError: vi.fn(),
            storage: memoryStorage(),
            translate: (key) => key,
            createClientMessageId: () => "client-message-1",
        };

        const scope = effectScope();
        const controller = scope.run(() => useInlineEditorAgentController({
            active,
            projectReadyRevision,
            selectedFilePath,
        }, services))!;

        active.value = true;
        await nextTick();
        await controller.whenReady();

        const result = await controller.sendPrompt({
            version: 1,
            task: "rewrite",
            targetPath: "manuscript/chapter-01.md",
            instruction: "收紧这段文字",
            references: [],
        }, "收紧这段文字");

        expect(result).toEqual({status: "current", value: undefined});
        expect(createSession).toHaveBeenCalledWith({
            profileKey: "inline.editor",
            initial: {},
            currentProjectRoot: "book-a",
        });
        expect(getSessionRecovery).toHaveBeenCalledWith(41);
        expect(stream.ensure).toHaveBeenCalledOnce();
        expect(invokeSession).toHaveBeenCalledWith(41, expect.objectContaining({
            mode: "prompt",
            clientMessageId: "client-message-1",
            message: {text: "收紧这段文字"},
            input: expect.objectContaining({
                targetPath: "manuscript/chapter-01.md",
            }),
        }));
        expect(controller.sessionId.value).toBe(41);
        expect(controller.resultText.value).toBe("完成");
        scope.stop();
    });
    it("从消息流 toolCalls 中识别 propose_edit 并解析为结构化提案状态机，支持 acceptEdit 与落盘", async () => {
        const {useInlineEditorAgentController} = await import("nbook/app/composables/useInlineEditorAgentController");
        const {useNovelIdeStore} = await import("nbook/app/stores/novel-ide");
        const {INLINE_PROPOSE_EDIT_TOOL} = await import("nbook/shared/inline-proposal");
        const active = ref(true);
        const projectReadyRevision = ref<number | null>(1);
        const selectedFilePath = ref("manuscript/chapter-01.md");
        const store = useNovelIdeStore();
        store.workspaceKind = "novel";
        store.currentProjectRoot = "book-a";

        // 模拟当前文件草稿与保存通道
        const initialContent = "少年站在青石台阶上，望着远方的落日，心中充满了迷茫。\n风吹过树梢。";
        store.activeWorkspaceFile = {
            node: {
                path: "manuscript/chapter-01.md",
                name: "chapter-01.md",
                kind: "file",
                editable: true,
                isDirectory: false,
                size: initialContent.length,
                mtimeMs: 1,
            } as any,
            content: initialContent,
            lastSyncedContent: initialContent,
            lastSyncedMtimeMs: 1,
        };
        const saveSpy = vi.fn(async () => null);
        store.saveCurrentFile = saveSpy;

        const mockMessages = ref<any[]>([]);
        const mockSession = {
            messages: mockMessages,
            running: ref(false),
            recoveryShell: ref(null),
            reset: vi.fn(),
            appendOptimisticUserMessage: vi.fn(() => "opt-1"),
            removeOptimisticUserMessage: vi.fn(),
            markOptimisticUserMessageUnknown: vi.fn(),
            applyRecovery: vi.fn(),
        } as any;

        const services: InlineEditorAgentControllerServices = {
            session: mockSession,
            api: {
                abortSession: vi.fn(),
                createSession: vi.fn(async () => ({sessionId: 42, profileKey: "inline.editor"})),
                getSessionRecovery: vi.fn(async (id: number) => recovery(id)),
                invokeSession: vi.fn(async () => ({
                    sessionId: 42,
                    invocationId: "inv-1",
                    status: "completed" as const,
                    acceptance: {
                        state: "persisted" as const,
                        clientMessageId: "client-message-2",
                        entryId: "entry-1",
                    },
                })),
                listSessions: vi.fn(async () => ({items: [summary(42)], total: 1, offset: 0, limit: 50, hasMore: false})),
                runCommand: vi.fn(),
                subscribeSessionEvents: vi.fn(),
            },
            createStream: vi.fn(() => ({
                ensure: vi.fn(async () => {}),
                start: vi.fn(async () => {}),
                stop: vi.fn(),
                syncRecovery: vi.fn(async () => true),
            })),
            loadSelectableModels: vi.fn(async () => []),
            acknowledgeClientPatch: vi.fn(async () => {}),
            buildClientState: vi.fn(() => ({})),
            notifyError: vi.fn(),
            storage: memoryStorage(),
            translate: (key) => key,
            createClientMessageId: () => "client-message-2",
        };

        const scope = effectScope();
        const controller = scope.run(() => useInlineEditorAgentController({
            active,
            projectReadyRevision,
            selectedFilePath,
        }, services))!;

        await nextTick();
        await controller.whenReady();
        expect(controller.proposal.value).toBeNull();

        // 模拟推送 AI 消息与 propose_edit 工具调用
        mockMessages.value = [
            {id: "user-1", type: "user", content: "润色"},
            {
                id: "ai-1",
                type: "ai",
                content: "已生成修改提案",
                toolCalls: [
                    {
                        id: "call-1",
                        index: 0,
                        name: INLINE_PROPOSE_EDIT_TOOL,
                        argsText: JSON.stringify({
                            summary: "强化夕阳氛围",
                            targetPath: "manuscript/chapter-01.md",
                            edits: [
                                {
                                    original: "心中充满了迷茫。",
                                    replacement: "目光坚毅而沉静。",
                                    rationale: "体现心态转变",
                                },
                                {
                                    original: "风吹过树梢。",
                                    replacement: "秋风掠过松林，带来一丝寒意。",
                                    rationale: "丰富景物层次",
                                },
                            ],
                        }),
                        status: "success",
                    },
                ],
            },
        ];

        await nextTick();

        // 验证提案状态已解析
        expect(controller.proposal.value).not.toBeNull();
        expect(controller.proposal.value?.summary).toBe("强化夕阳氛围");
        expect(controller.proposal.value?.items).toHaveLength(2);
        expect(controller.proposal.value?.items[0]?.status).toBe("pending");
        expect(controller.proposal.value?.items[1]?.status).toBe("pending");

        // 验证采纳第 0 条：更新编辑器内容并走 saveCurrentFile
        const accepted = await controller.acceptEdit(0);
        expect(accepted).toBe(true);
        expect(controller.proposal.value?.items[0]?.status).toBe("accepted");
        expect(controller.proposal.value?.items[0]?.applied).toBe(true);
        expect(store.selectedFileContent).toContain("目光坚毅而沉静。");
        expect(store.selectedFileContent).not.toContain("心中充满了迷茫。");
        expect(store.selectedFileContent).toContain("风吹过树梢。"); // 第二条尚未修改
        expect(saveSpy).toHaveBeenCalledWith({content: store.selectedFileContent});

        // 验证拒绝第 1 条带附言
        controller.rejectEdit(1, "这一句留着");
        expect(controller.proposal.value?.items[1]?.status).toBe("rejected");
        expect(controller.proposal.value?.items[1]?.note).toBe("这一句留着");
        expect(controller.proposal.value?.items[1]?.applied).toBe(false);

        scope.stop();
    });

    it("支持全部采纳、全部拒绝与再改一版", async () => {
        const {useInlineEditorAgentController} = await import("nbook/app/composables/useInlineEditorAgentController");
        const {useNovelIdeStore} = await import("nbook/app/stores/novel-ide");
        const {INLINE_PROPOSE_EDIT_TOOL} = await import("nbook/shared/inline-proposal");
        const active = ref(true);
        const projectReadyRevision = ref<number | null>(1);
        const selectedFilePath = ref("manuscript/chapter-01.md");
        const store = useNovelIdeStore();
        store.workspaceKind = "novel";
        store.currentProjectRoot = "book-a";

        const initialContent2 = "少年站在青石台阶上。\n风吹过树梢。";
        store.activeWorkspaceFile = {
            node: {
                path: "manuscript/chapter-01.md",
                name: "chapter-01.md",
                kind: "file",
                editable: true,
                isDirectory: false,
                size: initialContent2.length,
                mtimeMs: 1,
            } as any,
            content: initialContent2,
            lastSyncedContent: initialContent2,
            lastSyncedMtimeMs: 1,
        };
        const saveSpy = vi.fn(async () => null);
        store.saveCurrentFile = saveSpy;

        const mockMessages = ref<any[]>([]);
        const mockSession = {
            messages: mockMessages,
            running: ref(false),
            recoveryShell: ref({summary: summary(43)}),
            reset: vi.fn(),
            appendOptimisticUserMessage: vi.fn(() => "opt-1"),
            removeOptimisticUserMessage: vi.fn(),
            markOptimisticUserMessageUnknown: vi.fn(),
            applyRecovery: vi.fn(),
        } as any;

        const invokeSessionSpy = vi.fn(async () => ({
            sessionId: 43,
            invocationId: "inv-rev",
            status: "completed" as const,
            finalMessage: "新提案已生成",
            acceptance: {
                state: "persisted" as const,
                clientMessageId: "client-message-3",
                entryId: "entry-rev",
            },
        }));

        const services: InlineEditorAgentControllerServices = {
            session: mockSession,
            api: {
                abortSession: vi.fn(),
                createSession: vi.fn(async () => ({sessionId: 43, profileKey: "inline.editor"})),
                getSessionRecovery: vi.fn(async (id: number) => recovery(id)),
                invokeSession: invokeSessionSpy,
                listSessions: vi.fn(async () => ({items: [summary(43)], total: 1, offset: 0, limit: 50, hasMore: false})),
                runCommand: vi.fn(),
                subscribeSessionEvents: vi.fn(),
            },
            createStream: vi.fn(() => ({
                ensure: vi.fn(async () => {}),
                start: vi.fn(async () => {}),
                stop: vi.fn(),
                syncRecovery: vi.fn(async () => true),
            })),
            loadSelectableModels: vi.fn(async () => []),
            acknowledgeClientPatch: vi.fn(async () => {}),
            buildClientState: vi.fn(() => ({})),
            notifyError: vi.fn(),
            storage: memoryStorage(),
            translate: (key) => key,
            createClientMessageId: () => "client-message-3",
        };

        const scope = effectScope();
        const controller = scope.run(() => useInlineEditorAgentController({
            active,
            projectReadyRevision,
            selectedFilePath,
        }, services))!;

        await nextTick();
        await controller.whenReady();
        controller.sessionId.value = 43;

        mockMessages.value = [
            {
                id: "ai-2",
                type: "ai",
                content: "提案",
                toolCalls: [
                    {
                        id: "call-2",
                        index: 0,
                        name: INLINE_PROPOSE_EDIT_TOOL,
                        argsText: JSON.stringify({
                            summary: "全面润色",
                            targetPath: "manuscript/chapter-01.md",
                            edits: [
                                {original: "少年站在青石台阶上。", replacement: "青年独立峰顶。", rationale: "r1"},
                                {original: "风吹过树梢。", replacement: "云雾缭绕。", rationale: "r2"},
                            ],
                        }),
                        status: "success",
                    },
                ],
            },
        ];

        await nextTick();
        expect(controller.proposal.value?.items).toHaveLength(2);

        // 全部采纳
        const allAccepted = await controller.acceptAll();
        expect(allAccepted).toBe(true);
        expect(controller.proposal.value?.items[0]?.applied).toBe(true);
        expect(controller.proposal.value?.items[1]?.applied).toBe(true);
        expect(store.selectedFileContent).toBe("青年独立峰顶。\n云雾缭绕。");
        expect(saveSpy).toHaveBeenCalledTimes(1);

        // 再改一版
        await controller.requestRevision("语气再温和一点");
        expect(invokeSessionSpy).toHaveBeenCalledWith(43, expect.objectContaining({
            message: {text: "再改一版：语气再温和一点"},
            input: expect.objectContaining({
                instruction: expect.stringContaining("语气再温和一点"),
            }),
        }));

        scope.stop();
    });

    it("parseProposalInput 逐条校验 edits：缺 original 或 replacement 时返回 null", async () => {
        const {parseProposalInput} = await import("nbook/app/composables/useInlineEditorAgentController");
        // 缺 original 的合法 JSON（流式半截快照）
        const partialJson1 = JSON.stringify({
            summary: "修改建议",
            targetPath: "manuscript/ch1.md",
            edits: [
                {rationale: "优化开头"},
            ],
        });
        expect(parseProposalInput(partialJson1)).toBeNull();

        // 缺 replacement
        const partialJson2 = JSON.stringify({
            summary: "修改建议",
            targetPath: "manuscript/ch1.md",
            edits: [
                {original: "旧开头", rationale: "优化开头"},
            ],
        });
        expect(parseProposalInput(partialJson2)).toBeNull();

        // edits 为空数组
        const emptyEditsJson = JSON.stringify({
            summary: "修改建议",
            targetPath: "manuscript/ch1.md",
            edits: [],
        });
        expect(parseProposalInput(emptyEditsJson)).toBeNull();

        // 完整合法 JSON
        const completeJson = JSON.stringify({
            summary: "修改建议",
            targetPath: "manuscript/ch1.md",
            edits: [
                {original: "旧文本", replacement: "新文本", rationale: "优化"},
            ],
        });
        expect(parseProposalInput(completeJson)).toEqual({
            summary: "修改建议",
            targetPath: "manuscript/ch1.md",
            edits: [
                {original: "旧文本", replacement: "新文本", rationale: "优化"},
            ],
        });
    });

    it("提案闩锁加状态闸门：status=streaming 即使 args 结构完整也不生成提案，转 success 后才正常建出", async () => {
        const {useInlineEditorAgentController} = await import("nbook/app/composables/useInlineEditorAgentController");
        const {useNovelIdeStore} = await import("nbook/app/stores/novel-ide");
        const {INLINE_PROPOSE_EDIT_TOOL} = await import("nbook/shared/inline-proposal");
        const active = ref(true);
        const projectReadyRevision = ref<number | null>(1);
        const selectedFilePath = ref("manuscript/chapter-01.md");
        const store = useNovelIdeStore();
        store.workspaceKind = "novel";
        store.currentProjectRoot = "book-a";

        const mockMessages = ref<any[]>([]);
        const mockSession = {
            messages: mockMessages,
            running: ref(true),
            recoveryShell: ref(null),
            reset: vi.fn(),
            appendOptimisticUserMessage: vi.fn(() => "opt-1"),
            removeOptimisticUserMessage: vi.fn(),
            markOptimisticUserMessageUnknown: vi.fn(),
            applyRecovery: vi.fn(),
        } as any;

        const services: InlineEditorAgentControllerServices = {
            session: mockSession,
            api: {
                abortSession: vi.fn(),
                createSession: vi.fn(async () => ({sessionId: 45, profileKey: "inline.editor"})),
                getSessionRecovery: vi.fn(async (id: number) => recovery(id)),
                invokeSession: vi.fn(async () => ({
                    sessionId: 45,
                    invocationId: "inv-gate",
                    status: "completed" as const,
                    acceptance: {state: "persisted" as const, clientMessageId: "c1", entryId: "e1"},
                })),
                listSessions: vi.fn(async () => ({items: [summary(45)], total: 1, offset: 0, limit: 50, hasMore: false})),
                runCommand: vi.fn(),
                subscribeSessionEvents: vi.fn(),
            },
            createStream: vi.fn(() => ({
                ensure: vi.fn(async () => {}),
                start: vi.fn(async () => {}),
                stop: vi.fn(),
                syncRecovery: vi.fn(async () => true),
            })),
            loadSelectableModels: vi.fn(async () => []),
            acknowledgeClientPatch: vi.fn(async () => {}),
            buildClientState: vi.fn(() => ({})),
            notifyError: vi.fn(),
            storage: memoryStorage(),
            translate: (key) => key,
            createClientMessageId: () => "client-message-gate",
        };

        const scope = effectScope();
        const controller = scope.run(() => useInlineEditorAgentController({
            active,
            projectReadyRevision,
            selectedFilePath,
        }, services))!;

        await nextTick();
        await controller.whenReady();

        // 1. 流式阶段快照：status === "streaming"，args 结构虽完整（replacement 此时可能仍为空）
        const streamingArgs = JSON.stringify({
            summary: "润色中",
            targetPath: "manuscript/chapter-01.md",
            edits: [
                {original: "少年站在青石台阶上。", replacement: "", rationale: "优化表达"},
            ],
        });

        mockMessages.value = [
            {
                id: "ai-gate-1",
                type: "ai",
                content: "",
                toolCalls: [
                    {
                        id: "call-gate-1",
                        index: 0,
                        name: INLINE_PROPOSE_EDIT_TOOL,
                        argsText: streamingArgs,
                        status: "streaming",
                    },
                ],
            },
        ];

        await nextTick();

        // 此时应被状态闸门拦截，proposal 必须为 null！
        expect(controller.proposal.value).toBeNull();

        // 2. 流式完成阶段：同一 toolCall 转为 status === "success"，args 携带最终完整改写
        const finalArgs = JSON.stringify({
            summary: "润色完成",
            targetPath: "manuscript/chapter-01.md",
            edits: [
                {original: "少年站在青石台阶上。", replacement: "青石阶苍苔斑驳，少年迎风伫立。", rationale: "增强画面感"},
            ],
        });

        mockMessages.value = [
            {
                id: "ai-gate-1",
                type: "ai",
                content: "已生成提案",
                toolCalls: [
                    {
                        id: "call-gate-1",
                        index: 0,
                        name: INLINE_PROPOSE_EDIT_TOOL,
                        argsText: finalArgs,
                        status: "success",
                    },
                ],
            },
        ];

        await nextTick();

        // 转为 success 后，提案卡正常建出，且持有完整的 replacement！
        expect(controller.proposal.value).not.toBeNull();
        expect(controller.proposal.value?.toolCallStatus).toBe("success");
        expect(controller.proposal.value?.items[0]?.replacement).toBe("青石阶苍苔斑驳，少年迎风伫立。");
        expect(controller.proposal.value?.items[0]?.rationale).toBe("增强画面感");

        scope.stop();
    });

});

function summary(sessionId: number): AgentSessionSummaryDto {
    return {
        sessionId,
        profileKey: "inline.editor",
        sessionIdentity: "sha256:" + "0".repeat(64),
        status: "idle",
        updatedAt: 1,
        archived: false,    };
}

function recovery(sessionId: number): AgentSessionRecoveryDto {
    return {
        kind: "recovery",
        eventCursor: {eventEpoch: "epoch-1", after: 0},
        summary: summary(sessionId),
        activeLeafId: null,
        activePathRevision: "revision-1",
        history: {entries: [], previousCursor: null},
        tree: [],
        linkedAgents: [],
        linkedByAgents: [],
        pendingUserInputs: [],
        steerQueue: {items: [], omittedItems: 0},
        followUpQueue: {status: "ready", items: [], omittedItems: 0},
        activeInvocation: null,
        model: null,
        thinkingLevel: null,
        effectiveThinkingLevel: "off",
        agentMode: "normal",
    };
}

function memoryStorage(): Pick<Storage, "getItem" | "setItem"> {
    const values = new Map<string, string>();
    return {
        getItem: (key) => values.get(key) ?? null,
        setItem: (key, value) => {
            values.set(key, value);
        },
    };
}
