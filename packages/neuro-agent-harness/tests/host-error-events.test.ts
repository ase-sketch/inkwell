import {describe, expect, test} from "bun:test";
import {mkdir, mkdtemp, rm, writeFile} from "node:fs/promises";
import {join} from "node:path";
import {tmpdir} from "node:os";
import {
    NeuroAgentHarness,
    ProfileRegistry,
    SessionConflictError,
    defineProfile,
    defineSchema,
    type HarnessEvent,
    type JsonObject,
    type SessionCommitResult,
    type SessionWritePlan,
} from "../src/index.js";
import {JsonlSessionStore} from "../src/storage/jsonl.js";
import {MemorySessionStore} from "../src/storage/memory.js";
import {ScriptedModelRuntime} from "../src/testing/index.js";

const objectSchema = defineSchema<JsonObject>((value) => {
    if (value === null || typeof value !== "object" || Array.isArray(value)) {
        throw new Error("必须是 object");
    }
    return value;
}, {type: "object"});

function profile(key: string) {
    return defineProfile({
        manifest: {key, name: key},
        initial: objectSchema,
        payload: objectSchema,
        prepare: () => ({systemPrompt: key, modelConfig: {}}),
    });
}

function completed(text: string, timestamp = 1) {
    return {
        message: {
            role: "assistant" as const,
            content: [{type: "text" as const, text}],
            timestamp,
        },
    };
}

// 失败注入 Store：abort.request 持久化失败（非 CAS 类错误），其余 commit
// 正常。用于验证 host 错误事件发布路径（第八十二轮审查记录的边界候选）。
class AbortRequestFailStore extends MemorySessionStore<number, JsonObject> {
    override async commit(
        plan: SessionWritePlan<number, JsonObject>,
        options?: Parameters<MemorySessionStore<number, JsonObject>["commit"]>[1],
    ): Promise<SessionCommitResult<number, JsonObject>> {
        if (plan.cause === "harness.invocation.abort.request") {
            throw new Error("abort request commit unavailable");
        }
        return super.commit(plan, options);
    }
}

describe("host 错误事件发布", () => {
    test("abort.request 持久化失败发布 abort_request_error，且强制收口仍完成", async () => {
        let releaseModel!: () => void;
        const modelGate = new Promise<void>((resolve) => {
            releaseModel = resolve;
        });
        const harness = new NeuroAgentHarness({
            store: new AbortRequestFailStore(),
            profiles: new ProfileRegistry().add(profile("host-error")),
            model: new ScriptedModelRuntime([async () => {
                await modelGate;
                return completed("never");
            }]),
            abortGraceMs: 0,
        });
        const created = await harness.createSession({profileKey: "host-error", initial: {}, hostContext: {}});
        const sessionId = created.session.metadata.sessionId;
        const received: HarnessEvent<number>[] = [];
        const subscription = harness.subscribe(sessionId, {});
        const collector = (async () => {
            for await (const event of subscription) {
                received.push(event);
                if (event.kind === "runtime" && event.event.type === "agent_end") {
                    break;
                }
            }
        })();
        const handle = await harness.invoke({sessionId, payload: {}});
        await harness.abort(sessionId);
        await handle.result();
        await collector;

        const hostEvents = received.filter((event) => event.kind === "host");
        expect(hostEvents).toEqual([expect.objectContaining({
            event: {
                type: "host",
                name: "abort_request_error",
                payload: "abort request commit unavailable",
            },
        })]);
        const hostIndex = received.findIndex((event) => event.kind === "host");
        const agentEndIndex = received.findIndex((event) => {
            return event.kind === "runtime" && event.event.type === "agent_end";
        });
        expect(hostIndex).toBeGreaterThanOrEqual(0);
        expect(agentEndIndex).toBeGreaterThan(hostIndex);

        const snapshot = await harness.snapshot(sessionId);
        expect(snapshot.session.status).toBe("idle");
        expect(snapshot.session.invocations[0]?.status).toBe("aborted");
        releaseModel();
        await harness.dispose();
    });

    test("abort.request 的 CAS 类失败不发布 abort_request_error（静默吞掉）", async () => {
        class AbortRequestConflictStore extends MemorySessionStore<number, JsonObject> {
            override async commit(
                plan: SessionWritePlan<number, JsonObject>,
                options?: Parameters<MemorySessionStore<number, JsonObject>["commit"]>[1],
            ): Promise<SessionCommitResult<number, JsonObject>> {
                if (plan.cause === "harness.invocation.abort.request") {
                    throw new SessionConflictError(plan.target, 0, 1);
                }
                return super.commit(plan, options);
            }
        }
        let releaseModel!: () => void;
        const modelGate = new Promise<void>((resolve) => {
            releaseModel = resolve;
        });
        const harness = new NeuroAgentHarness({
            store: new AbortRequestConflictStore(),
            profiles: new ProfileRegistry().add(profile("host-error-silent")),
            model: new ScriptedModelRuntime([async () => {
                await modelGate;
                return completed("never");
            }]),
            abortGraceMs: 0,
        });
        const created = await harness.createSession({profileKey: "host-error-silent", initial: {}, hostContext: {}});
        const sessionId = created.session.metadata.sessionId;
        const received: HarnessEvent<number>[] = [];
        const subscription = harness.subscribe(sessionId, {});
        const collector = (async () => {
            for await (const event of subscription) {
                received.push(event);
                if (event.kind === "runtime" && event.event.type === "agent_end") {
                    break;
                }
            }
        })();
        await harness.invoke({sessionId, payload: {}});
        await harness.abort(sessionId);
        await collector;

        expect(received.some((event) => {
            return event.kind === "host" && event.event.type === "host";
        })).toBe(false);
        releaseModel();
        await harness.dispose();
    });

    test("follow-up 自动启动失败发布 follow_up_error，队列保留", async () => {
        const directory = await mkdtemp(join(tmpdir(), "harness-followup-error-"));
        try {
            const sessionsDirectory = join(directory, "sessions");
            await mkdir(sessionsDirectory, {recursive: true});
            const snapshot = {
                metadata: {sessionId: 1, profileKey: "follow-error", initial: {}, hostContext: {}, createdAt: 1},
                version: 0,
                status: "idle",
                activeLeafId: "q1",
                activeInvocationId: null,
                entries: [{
                    id: "q1",
                    kind: "harness.followUp.queued",
                    parentId: null,
                    timestamp: 1,
                    payload: {
                        id: "follow-1",
                        kind: "followUp",
                        payload: {bad: true},
                        caller: {kind: "system", name: "followUp"},
                        messageIdentity: "user",
                        createdAt: 1,
                    },
                }],
                invocations: [],
            };
            await writeFile(
                join(sessionsDirectory, "1.jsonl"),
                `${JSON.stringify({kind: "snapshot", cause: "test.follow-error", snapshot, appendedEntryIds: ["q1"]})}\n`,
                "utf8",
            );
            const payloadSchema = defineSchema<JsonObject>((value) => {
                if (value === null || typeof value !== "object" || Array.isArray(value) || typeof value.text !== "string") {
                    throw new Error("follow-error payload 必须包含 text");
                }
                return value;
            }, {type: "object"});
            const harness = new NeuroAgentHarness({
                store: new JsonlSessionStore<JsonObject>({directory}),
                profiles: new ProfileRegistry().add(defineProfile({
                    manifest: {key: "follow-error", name: "follow-error"},
                    initial: objectSchema,
                    payload: payloadSchema,
                    prepare: () => ({systemPrompt: "follow-error", modelConfig: {}}),
                })),
                model: new ScriptedModelRuntime([completed("done")]),
            });
            const sessionId = 1;
            const received: HarnessEvent<number>[] = [];
            const subscription = harness.subscribe(sessionId, {});
            let markPaused!: () => void;
            const pausedSeen = new Promise<void>((resolve) => {
                markPaused = resolve;
            });
            const collector = (async () => {
                for await (const event of subscription) {
                    received.push(event);
                    if (event.kind === "session"
                        && event.event.type === "follow_up_state"
                        && event.event.state.paused) {
                        markPaused();
                        break;
                    }
                }
            })();
            let raceTimer: ReturnType<typeof setTimeout> | undefined;
            try {
                // 主运行完成触发 watchFollowUps 自动启动；队列项 payload 被
                // 当前 Profile 拒绝 → start 失败 → follow_up_error。
                await (await harness.invoke({sessionId, payload: {text: "ok"}})).result();
                await Promise.race([
                    pausedSeen,
                    new Promise<never>((_, reject) => {
                        raceTimer = setTimeout(() => reject(new Error("自动 pause 未发布")), 5_000);
                    }),
                ]);
                await collector;
                const hostEvents = received.filter((event) => event.kind === "host");
                expect(hostEvents).toEqual([expect.objectContaining({
                    event: {
                        type: "host",
                        name: "follow_up_error",
                        payload: "follow-error payload 必须包含 text",
                    },
                })]);
                const snapshotAfter = await harness.snapshot(sessionId);
                expect(snapshotAfter.session.invocations).toHaveLength(1);
                const state = await harness.followUpState(sessionId);
                expect(state.items).toHaveLength(1);
                // 第九十三轮：自动 drain 失败后 durable 自动 pause 并携带
                // pausedBy（队首 item + admission_failed + 截断原因）。
                expect(state.paused).toBe(true);
                expect(state.pausedBy).toEqual({
                    itemId: "follow-1",
                    reason: "admission_failed",
                    message: "follow-error payload 必须包含 text",
                });
            } finally {
                if (raceTimer !== undefined) {
                    clearTimeout(raceTimer);
                }
                await harness.dispose();
            }
        } finally {
            await rm(directory, {recursive: true, force: true});
        }
    });
});
