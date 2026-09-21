import {describe, expect, test} from "bun:test";
import {
    NeuroAgentHarness,
    ProfileRegistry,
    SessionEventHub,
    defineProfile,
    defineSchema,
    serializeSseJsonEvent,
    type HarnessEvent,
    type JsonObject,
} from "../src/index.js";
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

// 宿主侧 SSE frame 编码使用第一方 serializer（HTTP 服务仍为宿主职责）。
function toSseFrame(event: HarnessEvent<number>): string {
    return serializeSseJsonEvent({event: event.kind, data: JSON.parse(JSON.stringify(event))});
}

async function collectUntil(
    subscription: AsyncIterable<HarnessEvent<number>>,
    predicate: (event: HarnessEvent<number>) => boolean,
): Promise<HarnessEvent<number>[]> {
    const received: HarnessEvent<number>[] = [];
    for await (const event of subscription) {
        received.push(event);
        if (predicate(event)) {
            break;
        }
    }
    return received;
}

describe("SSE Transport 消费：游标续传", () => {
    test("宿主序列化事件帧，用 lastSeq 游标续传只收到新事件", async () => {
        const harness = new NeuroAgentHarness({
            store: new MemorySessionStore(),
            profiles: new ProfileRegistry().add(profile("sse-continue")),
            model: new ScriptedModelRuntime([completed("first"), completed("second")]),
        });
        const created = await harness.createSession({profileKey: "sse-continue", initial: {}, hostContext: {}});
        const sessionId = created.session.metadata.sessionId;

        // 第一段连接：从空游标开始，等第一次运行完成。
        const first = harness.subscribe(sessionId, {});
        const firstInvocation = await harness.invoke({sessionId, payload: {}});
        const firstEvents = await collectUntil(first, (event) => {
            return event.kind === "runtime" && event.event.type === "agent_end";
        });
        const firstFrames = firstEvents.map(toSseFrame);
        expect(firstFrames.every((frame) => frame.startsWith("event: "))).toBe(true);
        expect(first.connected.snapshotRequired).toBe(false);
        expect(firstEvents.at(-1)?.event.type).toBe("agent_end");
        await (await firstInvocation).result();

        // 第二段连接：用上次的 eventEpoch + after 续传，只收到新事件。
        const cursor = {eventEpoch: first.connected.eventEpoch, after: firstEvents.at(-1)?.seq ?? 0};
        const second = harness.subscribe(sessionId, cursor);
        expect(second.connected.snapshotRequired).toBe(false);
        const secondInvocation = await harness.invoke({sessionId, payload: {}});
        const secondEvents = await collectUntil(second, (event) => {
            return event.kind === "runtime" && event.event.type === "agent_end";
        });
        expect(secondEvents.every((event) => event.seq > cursor.after)).toBe(true);
        expect(secondEvents.map((event) => event.seq)).toEqual(
            [...secondEvents.map((event) => event.seq)].sort((a, b) => a - b),
        );
        expect(new Set(secondEvents.map((event) => event.seq)).size).toBe(secondEvents.length);
        await (await secondInvocation).result();
        await harness.dispose();
    });
});

describe("SSE Transport 消费：snapshotRequired 恢复循环", () => {
    test("陈旧 cursor 收到 snapshotRequired，宿主用 snapshot 重新同步后继续", async () => {
        const harness = new NeuroAgentHarness({
            store: new MemorySessionStore(),
            profiles: new ProfileRegistry().add(profile("sse-recover")),
            model: new ScriptedModelRuntime([completed("done")]),
        });
        const created = await harness.createSession({profileKey: "sse-recover", initial: {}, hostContext: {}});
        const sessionId = created.session.metadata.sessionId;
        await (await harness.invoke({sessionId, payload: {}})).result();

        // 陈旧 epoch 的连接：不 replay，明确要求 Snapshot。
        const stale = harness.subscribe(sessionId, {eventEpoch: "stale-epoch", after: 0});
        expect(stale.connected.snapshotRequired).toBe(true);
        await stale.close();

        // 宿主恢复循环：snapshot() 拿真相 + 新 cursor → 重新订阅。
        const resync = await harness.snapshot(sessionId);
        const recovered = harness.subscribe(sessionId, resync.cursor);
        expect(recovered.connected.snapshotRequired).toBe(false);
        expect(recovered.connected.eventEpoch).toBe(resync.cursor.eventEpoch);
        await recovered.close();
        await harness.dispose();
    });

    test("慢消费者 overflow 关闭后，宿主经 snapshot 重同步继续接收", async () => {
        const events = new SessionEventHub<number>({subscriberQueueLimit: 2, subscriberQueueByteLimit: 4096});
        const harness = new NeuroAgentHarness({
            store: new MemorySessionStore(),
            profiles: new ProfileRegistry().add(profile("sse-overflow")),
            model: new ScriptedModelRuntime([completed("done")]),
            events,
        });
        const created = await harness.createSession({profileKey: "sse-overflow", initial: {}, hostContext: {}});
        const sessionId = created.session.metadata.sessionId;
        const baseline = await harness.invoke({sessionId, payload: {}});
        await (await baseline).result();

        // 慢消费者：不迭代订阅，第二次运行的 live 事件溢出 2 条队列上限。
        const baselineCursor = (await harness.snapshot(sessionId)).cursor;
        const slow = harness.subscribe(sessionId, {
            eventEpoch: baselineCursor.eventEpoch,
            after: baselineCursor.after,
        });
        const overflowRun = await harness.invoke({sessionId, payload: {}});
        await (await overflowRun).result();
        expect(slow.signal.aborted).toBe(true);
        expect(slow.closeReason).toBe("queue_overflow");

        const resync = await harness.snapshot(sessionId);
        const recovered = harness.subscribe(sessionId, resync.cursor);
        expect(recovered.connected.snapshotRequired).toBe(false);
        await recovered.close();
        await harness.dispose();
    });
});
