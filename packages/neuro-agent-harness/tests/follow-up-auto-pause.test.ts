import {describe, expect, test} from "bun:test";
import {
    NeuroAgentHarness,
    ProfileRegistry,
    defineProfile,
    defineSchema,
    type HarnessEvent,
    type JsonObject,
} from "../src/index.js";
import {truncateUtf8Bytes} from "../src/follow-up-ledger.js";
import {MemorySessionStore} from "../src/storage/memory.js";
import {ScriptedModelRuntime} from "../src/testing/index.js";

const objectSchema = defineSchema<JsonObject>((value) => {
    if (value === null || typeof value !== "object" || Array.isArray(value)) {
        throw new Error("必须是 object");
    }
    return value;
});

const strictSchema = defineSchema<JsonObject>((value) => {
    if (value === null || typeof value !== "object" || Array.isArray(value) || value.bad === true) {
        throw new Error("follow-error payload 必须包含 text");
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
class DelayedWatcherStartStore extends MemorySessionStore<number, JsonObject> {
    readonly startCommitStarted: Promise<void>;
    readonly startCommitReleased: Promise<void>;
    private markStartCommitStarted!: () => void;
    private releaseStartCommit!: () => void;
    private delayStart = false;

    constructor() {
        super();
        this.startCommitStarted = new Promise<void>((resolve) => {
            this.markStartCommitStarted = resolve;
        });
        this.startCommitReleased = new Promise<void>((resolve) => {
            this.releaseStartCommit = resolve;
        });
    }

    delayNextStart(): void {
        this.delayStart = true;
    }

    releaseStart(): void {
        this.releaseStartCommit();
    }

    override async commit(plan: Parameters<MemorySessionStore<number, JsonObject>["commit"]>[0]) {
        if (this.delayStart && plan.cause === "harness.invocation.start") {
            this.delayStart = false;
            this.markStartCommitStarted();
            await this.startCommitReleased;
        }
        return super.commit(plan);
    }
}


// 第九十三轮：自动 drain 失败后 durable 自动 pause 并携带 pausedBy
// （对齐 NeuroBook harness:6477-6510），宿主 cancel 队首后可 resume。
describe("follow-up auto-pause", () => {
    test("自动启动失败后自动 pause 携带 pausedBy，cancel 后可 resume", async () => {
        let release!: () => void;
        const gate = new Promise<void>((resolve) => {
            release = resolve;
        });
        const registry = new ProfileRegistry();
        registry.define({
            manifest: {key: "auto-pause", name: "Auto Pause"},
            initial: objectSchema,
            payload: objectSchema,
            prepare: () => ({systemPrompt: "auto-pause", modelConfig: {}}),
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
        const created = await harness.createSession({profileKey: "auto-pause", initial: {}, hostContext: {}});
        const sessionId = created.session.metadata.sessionId;
        const received: HarnessEvent<number>[] = [];
        const subscription = harness.subscribe(sessionId, {});
        const collector = (async () => {
            for await (const event of subscription) {
                received.push(event);
                if (event.kind === "session"
                    && event.event.type === "follow_up_state"
                    && event.event.state.paused) {
                    break;
                }
            }
        })();
        const handle = await harness.invoke({sessionId, payload: {}});
        const item = await harness.followUp(sessionId, {bad: true});
        // 入队后替换 Profile：队列时接受，自动启动时被当前 Profile 拒绝。
        registry.replace(defineProfile({
            manifest: {key: "auto-pause", name: "Auto Pause", version: 2},
            initial: objectSchema,
            payload: strictSchema,
            prepare: () => ({systemPrompt: "auto-pause", modelConfig: {}}),
        }));
        release();
        await handle.result();
        await collector;

        const state = await harness.followUpState(sessionId);
        expect(received.some((event) => {
            return event.kind === "host"
                && event.event.type === "host"
                && event.event.name === "follow_up_error";
        })).toBe(true);
        expect(state.paused).toBe(true);
        expect(state.pausedBy).toEqual({
            itemId: item.id,
            reason: "admission_failed",
            message: "follow-error payload 必须包含 text",
        });
        expect(state.items).toHaveLength(1);
        const snapshot = await harness.snapshot(sessionId);
        const pausedFacts = snapshot.session.entries
            .filter((entry) => entry.kind === "harness.followUp.paused");
        expect(pausedFacts.at(-1)?.payload).toMatchObject({
            paused: true,
            itemId: item.id,
            reason: "admission_failed",
        });
        // 宿主补救闭环：cancel 队首 → resume → 恢复消费。
        const afterCancel = await harness.cancelFollowUp(sessionId, item.id);
        expect(afterCancel.paused).toBe(true);
        expect(afterCancel.items).toHaveLength(0);
        const resumed = await harness.resumeFollowUps(sessionId);
        expect(resumed).toBeNull();
        const finalState = await harness.followUpState(sessionId);
        expect(finalState.paused).toBe(false);
        expect(finalState.pausedBy).toBeUndefined();
        await harness.dispose();
    });

    test("pausedBy message 按 UTF-8 字节截断到 500", () => {
        expect(truncateUtf8Bytes("short", 500)).toBe("short");
        expect(truncateUtf8Bytes("a".repeat(600), 500)).toHaveLength(500);
        const chinese = "汉".repeat(200); // 600 bytes
        const truncated = truncateUtf8Bytes(chinese, 500);
        expect(new TextEncoder().encode(truncated).length).toBeLessThanOrEqual(500);
        expect(truncated).toHaveLength(166); // 166 × 3 = 498 bytes
        // astral 字符（surrogate pair）不切在中间：末尾无孤立高位代理。
        const astral = truncateUtf8Bytes("a".repeat(497) + "😀", 500);
        expect(new TextEncoder().encode(astral).length).toBeLessThanOrEqual(500);
        expect(astral).toBe("a".repeat(497));
        expect(truncateUtf8Bytes("😀", 3)).toBe("");
    });
    test("自动 watcher admission 过期时不得暂停替换后的新队首", async () => {
        let release!: () => void;
        const gate = new Promise<void>((resolve) => {
            release = resolve;
        });
        const registry = new ProfileRegistry();
        registry.define({
            manifest: {key: "watcher-stale", name: "Watcher Stale"},
            initial: objectSchema,
            payload: objectSchema,
            prepare: () => ({systemPrompt: "watcher-stale", modelConfig: {}}),
        });
        const store = new DelayedWatcherStartStore();
        const harness = new NeuroAgentHarness({
            store,
            profiles: registry,
            model: new ScriptedModelRuntime([
                async () => {
                    await gate;
                    return completed("first");
                },
            ]),
        });
        const created = await harness.createSession({profileKey: "watcher-stale", initial: {}, hostContext: {}});
        const sessionId = created.session.metadata.sessionId;
        const first = await harness.invoke({sessionId, payload: {}});
        const a = await harness.followUp(sessionId, {item: "A"});
        const b = await harness.followUp(sessionId, {item: "B"});
        store.delayNextStart();
        release();
        await first.result();
        await store.startCommitStarted;
        await harness.cancelFollowUp(sessionId, a.id);
        store.releaseStart();
        await new Promise<void>((resolve) => setImmediate(resolve));
        const state = await harness.followUpState(sessionId);
        expect(state.paused).toBe(false);
        expect(state.items.map((item) => item.id)).toEqual([b.id]);
        expect(state.pausedBy).toBeUndefined();
        await harness.dispose();
    });
});
