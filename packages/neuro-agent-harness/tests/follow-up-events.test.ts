import {describe, expect, test} from "bun:test";
import {
    NeuroAgentHarness,
    ProfileRegistry,
    defineSchema,
    type HarnessEvent,
    type JsonObject,
} from "../src/index.js";
import {MemorySessionStore} from "../src/storage/memory.js";
import {ScriptedModelRuntime} from "../src/testing/index.js";

const schema = defineSchema<JsonObject>((value) => {
    if (value === null || typeof value !== "object" || Array.isArray(value)) {
        throw new Error("必须是 object");
    }
    return value;
});

function completed(text: string, timestamp = 1) {
    return {
        message: {
            role: "assistant" as const,
            content: [{type: "text" as const, text}],
            timestamp,
        },
    };
}

// 第八十七轮：follow_up_queued 正向运行时 smoke。
// 此前仅 harness-dispose 有「拒绝路径不发布」的负向断言；
// 本用例验证入队事件载荷与 durable 队列项一致，并随当前 Invocation
// 完成后自动启动（同一 item id 的 follow_up_started）。
describe("follow-up session 事件", () => {
    test("followUp 入队发布 follow_up_queued，完成后自动启动同一 item", async () => {
        let release!: () => void;
        const gate = new Promise<void>((resolve) => {
            release = resolve;
        });
        const registry = new ProfileRegistry();
        registry.define({
            manifest: {key: "followup-events", name: "FollowUp Events"},
            initial: schema,
            payload: schema,
            prepare: () => ({systemPrompt: "followup-events", modelConfig: {}}),
        });
        const harness = new NeuroAgentHarness({
            store: new MemorySessionStore(),
            profiles: registry,
            model: new ScriptedModelRuntime([
                async () => {
                    await gate;
                    return completed("first");
                },
                completed("second"),
            ]),
        });
        const created = await harness.createSession({
            profileKey: "followup-events",
            initial: {},
            hostContext: {},
        });
        const sessionId = created.session.metadata.sessionId;
        const received: HarnessEvent<number>[] = [];
        const subscription = harness.subscribe(sessionId, {});
        const collector = (async () => {
            let agentEnds = 0;
            for await (const event of subscription) {
                received.push(event);
                if (event.kind === "runtime" && event.event.type === "agent_end") {
                    agentEnds += 1;
                    if (agentEnds === 2) break;
                }
            }
        })();
        const handle = await harness.invoke({
            sessionId,
            payload: {instruction: "first"},
        });
        await new Promise<void>((resolve) => setTimeout(resolve, 50));
        const item = await harness.followUp(sessionId, {instruction: "follow-up"});
        release();
        await handle.result();
        await collector;

        const sessionEvents = received.filter((event) => event.kind === "session");
        const queued = sessionEvents.find((event) => event.event.type === "follow_up_queued");
        expect(queued).toBeDefined();
        expect(queued && queued.event.type === "follow_up_queued"
            ? queued.event.item.id
            : undefined).toBe(item.id);
        expect(queued && queued.event.type === "follow_up_queued"
            ? queued.event.item.payload
            : undefined).toEqual({instruction: "follow-up"});
        expect(queued && queued.event.type === "follow_up_queued"
            ? queued.event.item.caller
            : undefined).toEqual({kind: "user"});
        expect(queued && queued.event.type === "follow_up_queued"
            ? queued.event.item.messageIdentity
            : undefined).toBe("user");
        const started = sessionEvents.find((event) => event.event.type === "follow_up_started");
        expect(started).toBeDefined();
        expect(started && started.event.type === "follow_up_started"
            ? started.event.item.id
            : undefined).toBe(item.id);
        const state = await harness.followUpState(sessionId);
        expect(state.items).toHaveLength(0);
        // 第八十九轮：followUp 不带 options 时默认 caller 为 user（对齐
        // NeuroBook 与 invoke/retry 的缺省），自动启动的 Invocation 同样
        // 携带该 caller。
        const snapshot = await harness.snapshot(sessionId);
        expect(snapshot.session.invocations[1]?.caller).toEqual({kind: "user"});
        await harness.dispose();
    });
});
