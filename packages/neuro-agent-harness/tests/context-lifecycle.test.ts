import {afterEach, describe, expect, test} from "bun:test";
import {mkdtemp, rm} from "node:fs/promises";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {
    NeuroAgentHarness,
    ProfileRegistry,
    createAgentMessageEntryDraft,
    defineProfile,
    defineSchema,
    defineSessionEntryCodec,
    defineTool,
    type AgentMessage,
    type JsonObject,
    type JsonValue,
    type SessionEntry,
} from "../src/index.js";
import {JsonlSessionStore} from "../src/storage/jsonl.js";
import {MemorySessionStore} from "../src/storage/memory.js";
import {ScriptedModelRuntime} from "../src/testing/index.js";

interface ContextContributionPayload extends JsonObject {
    readonly key: string;
    readonly lifecycle: "history" | "appending";
    readonly invocationId: string | null;
}

interface TurnFactPayload extends JsonObject {
    readonly turn: number;
}

const objectSchema = defineSchema<JsonObject>((value) => {
    if (value === null || typeof value !== "object" || Array.isArray(value)) {
        throw new Error("必须是 object");
    }
    return value;
});

const contributionCodec = defineSessionEntryCodec("test.context.contribution", defineSchema<ContextContributionPayload>((value) => {
    if (value === null || typeof value !== "object" || Array.isArray(value)
        || typeof value.key !== "string"
        || (value.lifecycle !== "history" && value.lifecycle !== "appending")
        || (value.invocationId !== null && typeof value.invocationId !== "string")) {
        throw new Error("context contribution payload 无效");
    }
    return value as ContextContributionPayload;
}));

const turnFactCodec = defineSessionEntryCodec("test.context.turn-fact", defineSchema<TurnFactPayload>((value) => {
    if (value === null || typeof value !== "object" || Array.isArray(value)
        || typeof value.turn !== "number" || !Number.isInteger(value.turn) || value.turn < 1) {
        throw new Error("context turn fact 无效");
    }
    return value as TurnFactPayload;
}));

const directories: string[] = [];

afterEach(async () => {
    await Promise.all(directories.splice(0).map((directory) => rm(directory, {recursive: true, force: true})));
});

async function tempDirectory(): Promise<string> {
    const directory = await mkdtemp(join(tmpdir(), "neuro-harness-context-lifecycle-"));
    directories.push(directory);
    return directory;
}

function user(content: string, timestamp: number): Extract<AgentMessage, {role: "user"}> {
    return {role: "user", content, timestamp};
}

function assistant(content: string, timestamp: number): Extract<AgentMessage, {role: "assistant"}> {
    return {role: "assistant", content: [{type: "text", text: content}], timestamp};
}

function textCount(messages: readonly AgentMessage[], text: string): number {
    return JSON.stringify(messages).split(text).length - 1;
}

function durableUserTexts(entries: readonly SessionEntry[]): string[] {
    return entries.flatMap((entry) => {
        if (entry.kind !== "agent.message" || entry.payload === null || typeof entry.payload !== "object" || Array.isArray(entry.payload)) {
            return [];
        }
        const message = entry.payload.message;
        return message !== null && typeof message === "object" && !Array.isArray(message)
            && message.role === "user" && typeof message.content === "string"
            ? [message.content]
            : [];
    });
}

describe("Context lifecycle adapter", () => {
    test("canonical message draft 保留 owner/branch/identity，并拒绝非法 turn", () => {
        const message = user("system-shaped context", 5);
        expect(createAgentMessageEntryDraft(message, {
            turn: 2,
            invocationId: "invocation-2",
            parentId: "leaf-1",
            messageIdentity: "system",
        })).toEqual({
            kind: "agent.message",
            invocationId: "invocation-2",
            parentId: "leaf-1",
            payload: {
                turn: 2,
                message: JSON.parse(JSON.stringify(message)),
                messageIdentity: "system",
            },
        });
        expect(createAgentMessageEntryDraft(message, {
            turn: 0,
            messageIdentity: "user",
        })).toEqual({
            kind: "agent.message",
            payload: {
                turn: 0,
                message: JSON.parse(JSON.stringify(message)),
            },
        });
        for (const turn of [-1, 0.5, Number.NaN, Number.POSITIVE_INFINITY]) {
            expect(() => createAgentMessageEntryDraft(message, {turn})).toThrow("turn 必须是非负整数");
        }
    });

    test("stable History 只写一次，每个 Invocation 的 Appending contribution 单源注入恰好一次", async () => {
        const preparedInvocationIds: string[] = [];
        const observedPrepareCommits: Array<{
            readonly owner: string | null | undefined;
            readonly kinds: string[];
        }> = [];
        const profile = defineProfile({
            manifest: {key: "context-lifecycle-adapter", name: "Context lifecycle adapter"},
            initial: objectSchema,
            payload: objectSchema,
            prepare: (context) => {
                preparedInvocationIds.push(context.invocationId);
                const contributions = context.snapshot.entries.flatMap((entry) => {
                    const parsed = contributionCodec.parse(entry);
                    return parsed ? [parsed] : [];
                });
                const needsHistory = !contributions.some((item) => item.lifecycle === "history" && item.key === "stable");
                const needsAppending = !contributions.some((item) => {
                    return item.lifecycle === "appending" && item.invocationId === context.invocationId;
                });
                const historyMessage = user("stable-history", 10);
                const appendingMessage = user(`appending:${context.invocationId}`, 20);
                const entries = [
                    ...(needsHistory ? [
                        contributionCodec.draft({
                            key: "stable",
                            lifecycle: "history",
                            invocationId: null,
                        }, {invocationId: context.invocationId}),
                        createAgentMessageEntryDraft(historyMessage, {
                            turn: 0,
                            invocationId: context.invocationId,
                        }),
                    ] : []),
                    ...(needsAppending ? [
                        contributionCodec.draft({
                            key: context.invocationId,
                            lifecycle: "appending",
                            invocationId: context.invocationId,
                        }, {invocationId: context.invocationId}),
                        createAgentMessageEntryDraft(appendingMessage, {
                            turn: 0,
                            invocationId: context.invocationId,
                        }),
                    ] : []),
                ];
                return {
                    systemPrompt: "context lifecycle",
                    modelConfig: {},
                    ...(entries.length > 0 ? {
                        prepareWrites: [{
                            target: context.sessionId,
                            expectedVersion: context.snapshot.version,
                            cause: "test.context.prepare",
                            operations: [{
                                type: "appendEntries" as const,
                                entries,
                            }],
                        }],
                    } : {}),
                };
            },
        });
        const model = new ScriptedModelRuntime<JsonValue>([
            {message: assistant("first completed", 100)},
            {message: assistant("second completed", 200)},
        ]);
        const harness = new NeuroAgentHarness({
            store: new MemorySessionStore(),
            profiles: new ProfileRegistry().add(profile),
            model,
            commitObservers: [{
                name: "context-contribution-audit",
                afterCommit(notification) {
                    if (notification.plan.cause === "test.context.prepare") {
                        observedPrepareCommits.push({
                            owner: notification.plan.expectedActiveInvocationId,
                            kinds: notification.result.entries.map((entry) => entry.kind),
                        });
                    }
                },
            }],
        });
        const created = await harness.createSession({
            profileKey: profile.manifest.key,
            initial: {},
            hostContext: {},
        });

        const first = await harness.invoke({
            sessionId: created.session.metadata.sessionId,
            payload: {instruction: "first"},
        });
        expect((await first.result()).status).toBe("completed");
        const second = await harness.invoke({
            sessionId: created.session.metadata.sessionId,
            payload: {instruction: "second"},
        });
        expect((await second.result()).status).toBe("completed");

        expect(preparedInvocationIds).toEqual([first.invocationId, second.invocationId]);
        expect(observedPrepareCommits).toEqual([{
            owner: first.invocationId,
            kinds: [
                contributionCodec.kind,
                "agent.message",
                contributionCodec.kind,
                "agent.message",
            ],
        }, {
            owner: second.invocationId,
            kinds: [
                contributionCodec.kind,
                "agent.message",
            ],
        }]);
        expect(textCount(model.requests[0]!.messages, "stable-history")).toBe(1);
        expect(textCount(model.requests[0]!.messages, `appending:${first.invocationId}`)).toBe(1);
        expect(textCount(model.requests[1]!.messages, "stable-history")).toBe(1);
        expect(textCount(model.requests[1]!.messages, `appending:${first.invocationId}`)).toBe(1);
        expect(textCount(model.requests[1]!.messages, `appending:${second.invocationId}`)).toBe(1);

        const snapshot = await harness.snapshot(created.session.metadata.sessionId);
        const contributionEntries = snapshot.session.entries.flatMap((entry) => {
            const parsed = contributionCodec.parse(entry);
            return parsed ? [parsed] : [];
        });
        expect(contributionEntries).toEqual([
            {key: "stable", lifecycle: "history", invocationId: null},
            {key: first.invocationId, lifecycle: "appending", invocationId: first.invocationId},
            {key: second.invocationId, lifecycle: "appending", invocationId: second.invocationId},
        ]);
        const durableTexts = durableUserTexts(snapshot.session.entries);
        expect(durableTexts.filter((text) => text === "stable-history")).toHaveLength(1);
        expect(durableTexts.filter((text) => text === `appending:${first.invocationId}`)).toHaveLength(1);
        expect(durableTexts.filter((text) => text === `appending:${second.invocationId}`)).toHaveLength(1);
        await harness.dispose();
    });

    test("beforeTurn write plan 提交后，ContextProvider 从最新 Snapshot 读取本轮事实", async () => {
        const hookVersions: number[] = [];
        const providerVersions: number[] = [];
        const profile = defineProfile({
            manifest: {key: "context-lifecycle-before-turn", name: "Context lifecycle before turn"},
            initial: objectSchema,
            payload: objectSchema,
            hooks: [{
                name: "persist-turn-fact",
                stage: "beforeTurn",
                run: (context) => {
                    const turn = context.turn ?? -1;
                    hookVersions.push(context.snapshot.version);
                    return {
                        writePlans: [{
                            target: context.sessionId,
                            expectedVersion: context.snapshot.version,
                            cause: "test.context.before-turn",
                            operations: [{
                                type: "appendEntries",
                                entries: [turnFactCodec.draft({turn}, {invocationId: context.invocationId})],
                            }],
                        }],
                    };
                },
            }],
            prepare: () => ({
                systemPrompt: "context lifecycle before turn",
                modelConfig: {},
                contextProviders: [{
                    name: "read-turn-fact",
                    resolve: (context) => {
                        providerVersions.push(context.snapshot.version);
                        const facts = context.snapshot.entries.flatMap((entry) => {
                            const parsed = turnFactCodec.parse(entry);
                            return parsed ? [parsed] : [];
                        });
                        const latest = facts.at(-1);
                        if (!latest) throw new Error("missing turn fact");
                        return {
                            modelContext: [user(`observed-turn:${latest.turn}:v${context.snapshot.version}`, 50)],
                        };
                    },
                }],
                limits: {maxTurns: 1},
            }),
        });
        const model = new ScriptedModelRuntime<JsonValue>([{
            message: assistant("completed", 100),
        }]);
        const harness = new NeuroAgentHarness({
            store: new MemorySessionStore(),
            profiles: new ProfileRegistry().add(profile),
            model,
        });
        const created = await harness.createSession({
            profileKey: profile.manifest.key,
            initial: {},
            hostContext: {},
        });
        const handle = await harness.invoke({
            sessionId: created.session.metadata.sessionId,
            payload: {instruction: "observe latest"},
        });
        expect((await handle.result()).status).toBe("completed");

        expect(hookVersions).toHaveLength(1);
        expect(providerVersions).toHaveLength(1);
        expect(providerVersions[0]).toBe(hookVersions[0]! + 1);
        expect(textCount(model.requests[0]!.messages, `observed-turn:1:v${providerVersions[0]}`)).toBe(1);
        const snapshot = await harness.snapshot(created.session.metadata.sessionId);
        expect(snapshot.session.entries.flatMap((entry) => {
            const fact = turnFactCodec.parse(entry);
            return fact ? [fact] : [];
        })).toEqual([{turn: 1}]);
        await harness.dispose();
    });

    test("JSONL waiting restart 重建 prepare 时 Appending 恰好恢复一次，model-only context 只生成最新一份", async () => {
        const directory = await tempDirectory();
        const prepareVersions: number[] = [];
        const providerVersions: number[] = [];
        const gated = defineTool({
            name: "gated",
            description: "需要 approval 的测试 Tool",
            parameters: objectSchema,
            approval: {request: () => ({prompt: "approve context contribution"})},
            execute: () => ({content: "approved"}),
        });
        const profile = defineProfile({
            manifest: {key: "context-lifecycle-restart", name: "Context lifecycle restart"},
            initial: objectSchema,
            payload: objectSchema,
            prepare: (context) => {
                prepareVersions.push(context.snapshot.version);
                const needsAppending = !context.snapshot.entries.some((entry) => {
                    const contribution = contributionCodec.parse(entry);
                    return contribution?.lifecycle === "appending"
                        && contribution.invocationId === context.invocationId;
                });
                const appendingMessage = user(`restart-appending:${context.invocationId}`, 30);
                return {
                    systemPrompt: "context lifecycle restart",
                    modelConfig: {},
                    contextProviders: [{
                        name: "latest-model-context",
                        resolve: (providerContext) => {
                            providerVersions.push(providerContext.snapshot.version);
                            return {
                                modelContext: [user(`model-only:v${providerContext.snapshot.version}`, 40)],
                            };
                        },
                    }],
                    ...(needsAppending ? {prepareWrites: [{
                        target: context.sessionId,
                        expectedVersion: context.snapshot.version,
                        cause: "test.context.restart.prepare",
                        operations: [{
                            type: "appendEntries",
                            entries: [
                                contributionCodec.draft({
                                    key: context.invocationId,
                                    lifecycle: "appending",
                                    invocationId: context.invocationId,
                                }, {invocationId: context.invocationId}),
                                createAgentMessageEntryDraft(appendingMessage, {
                                    turn: 0,
                                    invocationId: context.invocationId,
                                }),
                            ],
                        }],
                    }]} : {}),
                    tools: [gated],
                    limits: {maxTurns: 2},
                };
            },
        });
        const firstModel = new ScriptedModelRuntime<JsonValue>([{
            message: {
                role: "assistant",
                content: [{
                    type: "toolCall",
                    call: {id: "gated-1", name: "gated", arguments: {}},
                }],
                timestamp: 100,
            },
        }]);
        const firstHarness = new NeuroAgentHarness({
            store: new JsonlSessionStore({directory}),
            profiles: new ProfileRegistry().add(profile),
            model: firstModel,
        });
        const created = await firstHarness.createSession({
            profileKey: profile.manifest.key,
            initial: {},
            hostContext: {},
        });
        const waitingHandle = await firstHarness.invoke({
            sessionId: created.session.metadata.sessionId,
            payload: {instruction: "wait"},
        });
        const waiting = await waitingHandle.result();
        expect(waiting.status).toBe("waiting");
        expect(providerVersions).toHaveLength(1);
        const firstProviderVersion = providerVersions[0]!;
        expect(textCount(firstModel.requests[0]!.messages, `restart-appending:${waitingHandle.invocationId}`)).toBe(1);
        expect(textCount(firstModel.requests[0]!.messages, `model-only:v${firstProviderVersion}`)).toBe(1);
        await firstHarness.dispose();

        const resumedModel = new ScriptedModelRuntime<JsonValue>([{
            message: assistant("resumed completed", 200),
        }]);
        const resumedHarness = new NeuroAgentHarness({
            store: new JsonlSessionStore({directory}),
            profiles: new ProfileRegistry().add(profile),
            model: resumedModel,
        });
        const resumedHandle = await resumedHarness.resume(
            created.session.metadata.sessionId,
            waitingHandle.invocationId,
            [{toolCallId: "gated-1", approved: true}],
        );
        expect((await resumedHandle.result()).status).toBe("completed");

        expect(prepareVersions).toHaveLength(2);
        expect(providerVersions).toHaveLength(2);
        expect(providerVersions[1]).toBeGreaterThan(firstProviderVersion);
        expect(textCount(resumedModel.requests[0]!.messages, `restart-appending:${waitingHandle.invocationId}`)).toBe(1);
        expect(textCount(resumedModel.requests[0]!.messages, `model-only:v${firstProviderVersion}`)).toBe(0);
        expect(textCount(resumedModel.requests[0]!.messages, `model-only:v${providerVersions[1]}`)).toBe(1);

        const restored = await resumedHarness.snapshot(created.session.metadata.sessionId);
        const contributions = restored.session.entries.flatMap((entry) => {
            const parsed = contributionCodec.parse(entry);
            return parsed?.lifecycle === "appending" && parsed.invocationId === waitingHandle.invocationId ? [parsed] : [];
        });
        expect(contributions).toHaveLength(1);
        const durableTexts = durableUserTexts(restored.session.entries);
        expect(durableTexts.filter((text) => text === `restart-appending:${waitingHandle.invocationId}`)).toHaveLength(1);
        expect(JSON.stringify(restored.session.entries)).not.toContain("model-only:");
        await resumedHarness.dispose();
    });

    test("仅 prepareWrites 的贡献同 Invocation 立即可见且恰好一次，顺序先于当前用户消息", async () => {
        const profile = defineProfile({
            manifest: {key: "prepare-writes-only", name: "Prepare Writes Only"},
            initial: objectSchema,
            payload: objectSchema,
            prepare: (context) => {
                const contribution = user(`deferred:${context.invocationId}`, 30);
                return {
                    systemPrompt: "deferred",
                    modelConfig: {},
                    prepareWrites: [{
                        target: context.sessionId,
                        expectedVersion: context.snapshot.version,
                        cause: "test.context.deferred",
                        operations: [{
                            type: "appendEntries",
                            entries: [createAgentMessageEntryDraft(contribution, {
                                turn: 0,
                                invocationId: context.invocationId,
                            })],
                        }],
                    }],
                };
            },
        });
        const model = new ScriptedModelRuntime<JsonValue>([
            {message: assistant("first", 100)},
            {message: assistant("second", 200)},
        ]);
        const harness = new NeuroAgentHarness({
            store: new MemorySessionStore(),
            profiles: new ProfileRegistry().add(profile),
            model,
        });
        const created = await harness.createSession({
            profileKey: "prepare-writes-only",
            initial: {},
            hostContext: {},
        });
        const sessionId = created.session.metadata.sessionId;
        const first = await harness.invoke({sessionId, payload: {}});
        await first.result();
        // 第一百零三轮新合同（ADR-0039）：prepareWrites 贡献 durable 且同一
        // Invocation 首个模型请求立即可见、恰好一次；位置在随后提交的当前
        // 用户消息之前（对齐 NeuroBook Appending → CurrentUserInput）。
        const firstRequest = model.requests[0]!.messages;
        expect(textCount(firstRequest, `deferred:${first.invocationId}`)).toBe(1);
        const deferredIndex = firstRequest.findIndex((message) => message.role === "user" && typeof message.content === "string" && message.content.startsWith("deferred:"));
        const firstUserIndex = firstRequest.findIndex((message) => message.role === "user" && message.content === "{}");
        expect(deferredIndex).toBeGreaterThanOrEqual(0);
        expect(deferredIndex).toBeLessThan(firstUserIndex);
        const second = await harness.invoke({sessionId, payload: {}});
        await second.result();
        // 下一 Invocation 从 transcript 看到上一轮贡献；本轮自己的贡献同样同轮可见。
        expect(textCount(model.requests[1]!.messages, `deferred:${first.invocationId}`)).toBe(1);
        expect(textCount(model.requests[1]!.messages, `deferred:${second.invocationId}`)).toBe(1);
        await harness.dispose();
    });
});
