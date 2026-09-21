import {describe, expect, test} from "bun:test";
import {
    NeuroAgentHarness,
    ProfileRegistry,
    SessionEventHub,
    defineProfile,
    defineSchema,
    type JsonObject,
} from "../src/index.js";
import {MemorySessionStore} from "../src/storage/memory.js";
import {ScriptedModelRuntime} from "../src/testing/index.js";

const objectSchema = defineSchema<JsonObject>((value) => {
    if (value === null || typeof value !== "object" || Array.isArray(value)) {
        throw new Error("必须是 object");
    }
    return value;
});

async function bounded<TResult>(promise: Promise<TResult>, label: string, timeoutMs = 250): Promise<TResult> {
    return Promise.race([
        promise,
        new Promise<TResult>((_, reject) => setTimeout(() => reject(new Error(`${label} 超时`)), timeoutMs)),
    ]);
}

function eventProfiles(): ProfileRegistry {
    return new ProfileRegistry().add(defineProfile({
        manifest: {key: "event-lifecycle", name: "Event Lifecycle"},
        initial: objectSchema,
        payload: objectSchema,
        prepare: () => ({systemPrompt: "event lifecycle", modelConfig: {}}),
    }));
}

describe("SessionEventHub", () => {
    test("event memory hard limits 只接受正整数", () => {
        expect(() => new SessionEventHub({replayLimit: 0})).toThrow("replayLimit");
        expect(() => new SessionEventHub({replayByteLimit: Number.POSITIVE_INFINITY})).toThrow("replayByteLimit");
        expect(() => new SessionEventHub({subscriberQueueLimit: 1.5})).toThrow("subscriberQueueLimit");
        expect(() => new SessionEventHub({subscriberQueueByteLimit: Number.NaN})).toThrow("subscriberQueueByteLimit");
    });

    test("explicit close 停止接收新事件，并 graceful drain 已排队的 live events", async () => {
        const hub = new SessionEventHub<number>({eventEpoch: "close-epoch"});
        const subscription = hub.subscribe(1, {eventEpoch: "close-epoch", after: 0});
        const iterator = subscription[Symbol.asyncIterator]();
        const queued = hub.publish({
            sessionId: 1,
            kind: "session",
            event: {type: "session_status", status: "idle", activeInvocationId: null, version: 1},
        });

        await subscription.close();

        expect((await iterator.next()).value).toBe(queued);
        expect(await iterator.next()).toEqual({done: true, value: undefined});
    });

    test("Async Iterator return 结束订阅并拒绝后续 live events", async () => {
        const hub = new SessionEventHub<number>({eventEpoch: "return-epoch"});
        const subscription = hub.subscribe(1, {eventEpoch: "return-epoch", after: 0});
        const iterator = subscription[Symbol.asyncIterator]();

        expect(iterator.return).toBeFunction();
        await iterator.return?.();
        hub.publish({
            sessionId: 1,
            kind: "session",
            event: {type: "session_status", status: "idle", activeInvocationId: null, version: 1},
        });

        expect(await iterator.next()).toEqual({done: true, value: undefined});
    });

    test("Event Subscription 自身就是可直接 return 的 Async Iterator", async () => {
        const hub = new SessionEventHub<number>({eventEpoch: "direct-return-epoch"});
        const subscription = hub.subscribe(1, {eventEpoch: "direct-return-epoch", after: 0});
        hub.publish({
            sessionId: 1,
            kind: "session",
            event: {type: "session_status", status: "idle", activeInvocationId: null, version: 1},
        });

        expect(subscription[Symbol.asyncIterator]()).toBe(subscription);
        expect(subscription.return).toBeFunction();
        await subscription.return();

        expect(subscription.signal.aborted).toBe(true);
        expect(subscription.closeReason).toBe("consumer_closed");
        expect(await subscription.next()).toEqual({done: true, value: undefined});
    });

    test("for await break 自动关闭 Event Subscription", async () => {
        const hub = new SessionEventHub<number>({eventEpoch: "for-await-epoch"});
        const subscription = hub.subscribe(1, {eventEpoch: "for-await-epoch", after: 0});
        const consuming = (async () => {
            for await (const _event of subscription) {
                break;
            }
        })();

        hub.publish({
            sessionId: 1,
            kind: "session",
            event: {type: "session_status", status: "idle", activeInvocationId: null, version: 1},
        });
        await consuming;

        expect(subscription.signal.aborted).toBe(true);
        expect(subscription.closeReason).toBe("consumer_closed");
        expect(hub.metrics(1).subscriberCount).toBe(0);
    });

    test("Async Iterator throw 保留原错误并关闭 Event Subscription", async () => {
        const hub = new SessionEventHub<number>({eventEpoch: "throw-epoch"});
        const subscription = hub.subscribe(1, {eventEpoch: "throw-epoch", after: 0});
        const original = new Error("consumer failed");

        await expect(subscription.throw(original)).rejects.toBe(original);

        expect(subscription.signal.aborted).toBe(true);
        expect(subscription.closeReason).toBe("consumer_closed");
        expect(hub.metrics(1).subscriberCount).toBe(0);
    });

    test("并发 next 按调用顺序各接收一个 live event", async () => {
        const hub = new SessionEventHub<number>({eventEpoch: "concurrent-next-epoch"});
        const subscription = hub.subscribe(1, {eventEpoch: "concurrent-next-epoch", after: 0});
        const first = subscription.next();
        const second = subscription.next();

        const firstEvent = hub.publish({
            sessionId: 1,
            kind: "session",
            event: {type: "session_status", status: "idle", activeInvocationId: null, version: 1},
        });
        const secondEvent = hub.publish({
            sessionId: 1,
            kind: "session",
            event: {type: "session_status", status: "idle", activeInvocationId: null, version: 2},
        });
        expect(await bounded(Promise.all([first, second]), "并发 next FIFO 交付")).toEqual([
            {done: false, value: firstEvent},
            {done: false, value: secondEvent},
        ]);
        await subscription.return();
    });

    test("close 结算全部并发 pending next", async () => {
        const hub = new SessionEventHub<number>({eventEpoch: "concurrent-close-epoch"});
        const subscription = hub.subscribe(1, {eventEpoch: "concurrent-close-epoch", after: 0});
        const first = subscription.next();
        const second = subscription.next();

        await subscription.close();

        expect(await bounded(Promise.all([first, second]), "并发 next close")).toEqual([
            {done: true, value: undefined},
            {done: true, value: undefined},
        ]);
        expect(hub.metrics(1).subscriberCount).toBe(0);
    });

    test("publish 与调用方后续修改隔离，并 replay 同一份稳定事件", async () => {
        const hub = new SessionEventHub<number>({eventEpoch: "immutable-epoch"});
        const source = {
            sessionId: 1,
            kind: "host" as const,
            event: {
                type: "host" as const,
                name: "mutable",
                payload: {text: "before"},
            },
        };

        const published = hub.publish(source);
        source.event.payload.text = "after";
        const subscription = hub.subscribe(1, {eventEpoch: "immutable-epoch", after: 0});
        const replayed = (await subscription[Symbol.asyncIterator]().next()).value;

        expect(published.event).toEqual({type: "host", name: "mutable", payload: {text: "before"}});
        expect(replayed).toBe(published);
        await subscription.close();
    });

    test("published event 递归冻结，消费者不能改写 replay", async () => {
        const hub = new SessionEventHub<number>({eventEpoch: "frozen-epoch"});
        const published = hub.publish({
            sessionId: 1,
            kind: "host",
            event: {type: "host", name: "frozen", payload: {text: "before"}},
        });
        if (published.kind !== "host") {
            throw new Error("expected host event");
        }

        expect(() => {
            (published.event.payload as {text: string}).text = "after";
        }).toThrow();
        const replay = hub.subscribe(1, {eventEpoch: "frozen-epoch", after: 0});
        const replayed = (await replay[Symbol.asyncIterator]().next()).value;

        expect(replayed?.event).toEqual({type: "host", name: "frozen", payload: {text: "before"}});
        await replay.close();
    });

    test("不可序列化 event 失败时不推进 seq 或留下 replay", () => {
        const hub = new SessionEventHub<number>({eventEpoch: "serialization-failure-epoch"});
        const cyclic: Record<string, unknown> = {};
        cyclic.self = cyclic;

        expect(() => hub.publish({
            sessionId: 1,
            kind: "host",
            event: {
                type: "host",
                name: "cyclic",
                payload: cyclic as JsonObject,
            },
        })).toThrow();

        expect(hub.latestSeq(1)).toBe(0);
        expect(hub.metrics(1).replayCount).toBe(0);
    });

    test("慢消费者超过 live queue count 时 fail closed 并释放事件", async () => {
        const hub = new SessionEventHub<number>({
            eventEpoch: "overflow-epoch",
            subscriberQueueLimit: 2,
        });
        const subscription = hub.subscribe(1, {eventEpoch: "overflow-epoch", after: 0});
        for (let version = 1; version <= 3; version += 1) {
            hub.publish({
                sessionId: 1,
                kind: "session",
                event: {type: "session_status", status: "idle", activeInvocationId: null, version},
            });
        }

        expect(subscription.signal.aborted).toBe(true);
        expect(subscription.closeReason).toBe("queue_overflow");
        expect(await subscription[Symbol.asyncIterator]().next()).toEqual({done: true, value: undefined});
    });

    test("slow-consumer overflow 不影响同 Session 的快速订阅", async () => {
        const hub = new SessionEventHub<number>({
            eventEpoch: "isolated-overflow-epoch",
            subscriberQueueLimit: 1,
        });
        const slow = hub.subscribe(1, {eventEpoch: "isolated-overflow-epoch", after: 0});
        const fast = hub.subscribe(1, {eventEpoch: "isolated-overflow-epoch", after: 0});
        const received: number[] = [];
        for (let version = 1; version <= 3; version += 1) {
            const next = fast.next();
            const published = hub.publish({
                sessionId: 1,
                kind: "session",
                event: {type: "session_status", status: "idle", activeInvocationId: null, version},
            });
            received.push((await next).value?.seq ?? -1);
            expect(published.seq).toBe(version);
        }

        expect(slow.closeReason).toBe("queue_overflow");
        expect(fast.signal.aborted).toBe(false);
        expect(received).toEqual([1, 2, 3]);
        expect(hub.metrics(1).subscriberCount).toBe(1);
        await fast.close();
    });

    test("慢消费者超过 live queue serialized bytes 时 fail closed", () => {
        const hub = new SessionEventHub<number>({
            eventEpoch: "byte-overflow-epoch",
            subscriberQueueLimit: 10,
            subscriberQueueByteLimit: 512,
        });
        const subscription = hub.subscribe(1, {eventEpoch: "byte-overflow-epoch", after: 0});
        hub.publish({
            sessionId: 1,
            kind: "host",
            event: {type: "host", name: "large", payload: {text: "x".repeat(256)}},
        });
        expect(subscription.signal.aborted).toBe(false);

        hub.publish({
            sessionId: 1,
            kind: "host",
            event: {type: "host", name: "large", payload: {text: "y".repeat(256)}},
        });

        expect(subscription.signal.aborted).toBe(true);
        expect(subscription.closeReason).toBe("queue_overflow");
    });

    test("单个事件超过 live queue 字节预算即 fail closed（per-event 边界）", () => {
        const hub = new SessionEventHub<number>({
            eventEpoch: "single-event-bytes-epoch",
            subscriberQueueByteLimit: 512,
        });
        const subscription = hub.subscribe(1, {eventEpoch: "single-event-bytes-epoch", after: 0});
        hub.publish({
            sessionId: 1,
            kind: "host",
            event: {type: "host", name: "huge", payload: {text: "x".repeat(700)}},
        });
        expect(subscription.signal.aborted).toBe(true);
        expect(subscription.closeReason).toBe("queue_overflow");
    });
    test("queue overflow 的 abort listener 重入 publish 不得倒置 seq", async () => {
        const hub = new SessionEventHub<number>({
            eventEpoch: "reentrant-overflow-epoch",
            subscriberQueueLimit: 1,
        });
        const slow = hub.subscribe(1, {eventEpoch: "reentrant-overflow-epoch", after: 0});
        const fast = hub.subscribe(1, {eventEpoch: "reentrant-overflow-epoch", after: 0});
        slow.signal.addEventListener("abort", () => {
            hub.publish({
                sessionId: 1,
                kind: "host",
                event: {type: "host", name: "nested", payload: {seq: "nested"}},
            });
        });
        const first = fast.next();
        const second = fast.next();
        const third = fast.next();
        hub.publish({
            sessionId: 1,
            kind: "host",
            event: {type: "host", name: "outer", payload: {seq: "outer-1"}},
        });
        hub.publish({
            sessionId: 1,
            kind: "host",
            event: {type: "host", name: "outer", payload: {seq: "outer-2"}},
        });
        const received = [
            (await first).value?.seq ?? -1,
            (await second).value?.seq ?? -1,
            (await third).value?.seq ?? -1,
        ];
        expect(received).toEqual([1, 2, 3]);
        expect(hub.latestSeq(1)).toBe(3);
        await slow.close();
        await fast.close();
    });


    test("replay serialized-byte hard limit 让过旧 cursor 明确要求 Snapshot", async () => {
        const hub = new SessionEventHub<number>({
            eventEpoch: "replay-bytes-epoch",
            replayLimit: 10,
            replayByteLimit: 700,
        });
        hub.publish({
            sessionId: 1,
            kind: "host",
            event: {type: "host", name: "large", payload: {text: "x".repeat(256)}},
        });
        const recoverable = hub.subscribe(1, {eventEpoch: "replay-bytes-epoch", after: 0});
        expect(recoverable.connected.snapshotRequired).toBe(false);
        await recoverable.close();

        hub.publish({
            sessionId: 1,
            kind: "host",
            event: {type: "host", name: "large", payload: {text: "y".repeat(256)}},
        });

        expect(hub.subscribe(1, {eventEpoch: "replay-bytes-epoch", after: 0}).connected.snapshotRequired).toBe(true);
    });

    test("单个超大事件立即触发 replay 字节预算的 Snapshot 要求", () => {
        const hub = new SessionEventHub<number>({
            eventEpoch: "single-replay-bytes-epoch",
            replayByteLimit: 700,
        });
        hub.publish({
            sessionId: 1,
            kind: "host",
            event: {type: "host", name: "huge", payload: {text: "x".repeat(900)}},
        });
        expect(hub.subscribe(1, {eventEpoch: "single-replay-bytes-epoch", after: 0}).connected.snapshotRequired)
            .toBe(true);
    });

    test("pending replay 与 live queue 分离并保持单调交付顺序", async () => {
        const hub = new SessionEventHub<number>({
            eventEpoch: "replay-live-epoch",
            replayLimit: 10,
            subscriberQueueLimit: 1,
        });
        for (let version = 1; version <= 3; version += 1) {
            hub.publish({
                sessionId: 1,
                kind: "session",
                event: {type: "session_status", status: "idle", activeInvocationId: null, version},
            });
        }
        const subscription = hub.subscribe(1, {eventEpoch: "replay-live-epoch", after: 0});
        hub.publish({
            sessionId: 1,
            kind: "session",
            event: {type: "session_status", status: "idle", activeInvocationId: null, version: 4},
        });

        expect(hub.metrics(1)).toMatchObject({
            pendingReplayCount: 3,
            queuedCount: 1,
        });
        const received = [];
        for (let index = 0; index < 4; index += 1) {
            received.push((await subscription.next()).value?.seq);
        }

        expect(received).toEqual([1, 2, 3, 4]);
        expect(subscription.signal.aborted).toBe(false);
        await subscription.close();
    });

    test("metrics 只统计 Hub 当前持有的 replay 与 active subscriptions", async () => {
        const hub = new SessionEventHub<number>({eventEpoch: "metrics-epoch"});
        const subscription = hub.subscribe(1, {eventEpoch: "metrics-epoch", after: 0});
        hub.publish({
            sessionId: 1,
            kind: "session",
            event: {type: "session_status", status: "idle", activeInvocationId: null, version: 1},
        });

        const active = hub.metrics(1);
        expect(active).toMatchObject({
            replayCount: 1,
            subscriberCount: 1,
            queuedCount: 1,
            pendingReplayCount: 0,
        });
        expect(active.replayBytes).toBeGreaterThan(0);
        expect(active.queuedBytes).toBeGreaterThan(0);

        await subscription.close();

        expect(hub.metrics(1)).toMatchObject({
            replayCount: 1,
            subscriberCount: 0,
            queuedCount: 0,
            queuedBytes: 0,
            pendingReplayCount: 0,
            pendingReplayBytes: 0,
        });
    });

    test("Hub close 中止全部订阅、释放状态并拒绝新工作", async () => {
        const hub = new SessionEventHub<number>({eventEpoch: "hub-close-epoch"});
        const subscription = hub.subscribe(1, {eventEpoch: "hub-close-epoch", after: 0});
        hub.publish({
            sessionId: 1,
            kind: "session",
            event: {type: "session_status", status: "idle", activeInvocationId: null, version: 1},
        });

        hub.close();

        expect(subscription.signal.aborted).toBe(true);
        expect(subscription.closeReason).toBe("hub_closed");
        expect(await subscription[Symbol.asyncIterator]().next()).toEqual({done: true, value: undefined});
        expect(hub.metrics(1)).toEqual({
            replayCount: 0,
            replayBytes: 0,
            subscriberCount: 0,
            queuedCount: 0,
            queuedBytes: 0,
            pendingReplayCount: 0,
            pendingReplayBytes: 0,
        });
        expect(() => hub.publish({
            sessionId: 1,
            kind: "session",
            event: {type: "session_status", status: "idle", activeInvocationId: null, version: 2},
        })).toThrow("event_hub_closed");
        expect(() => hub.subscribe(1)).toThrow("event_hub_closed");
        expect(() => hub.close()).not.toThrow();
    });

    test("Harness dispose 关闭自己创建的 Event Hub", async () => {
        const harness = new NeuroAgentHarness({
            store: new MemorySessionStore<number, JsonObject>(),
            profiles: eventProfiles(),
            model: new ScriptedModelRuntime([]),
        });
        const created = await harness.createSession({
            profileKey: "event-lifecycle",
            initial: {},
            hostContext: {},
        });
        const subscription = harness.subscribe(created.session.metadata.sessionId, created.cursor);

        await harness.dispose();

        expect(subscription.signal.aborted).toBe(true);
        expect(subscription.closeReason).toBe("hub_closed");
        expect(await subscription[Symbol.asyncIterator]().next()).toEqual({done: true, value: undefined});
    });

    test("Harness dispose 不关闭宿主注入的共享 Event Hub", async () => {
        const events = new SessionEventHub<number>({eventEpoch: "injected-epoch"});
        const harness = new NeuroAgentHarness({
            store: new MemorySessionStore<number, JsonObject>(),
            profiles: eventProfiles(),
            model: new ScriptedModelRuntime([]),
            events,
        });
        const created = await harness.createSession({
            profileKey: "event-lifecycle",
            initial: {},
            hostContext: {},
        });
        const subscription = harness.subscribe(created.session.metadata.sessionId, created.cursor);

        await harness.dispose();
        const published = events.publish({
            sessionId: created.session.metadata.sessionId,
            kind: "session",
            event: {type: "session_status", status: "idle", activeInvocationId: null, version: 2},
        });

        expect(subscription.signal.aborted).toBe(false);
        expect((await subscription[Symbol.asyncIterator]().next()).value).toBe(published);
        await subscription.close();
        events.close();
    });

    test("按 Session seq replay 并检测无效 cursor", async () => {
        const hub = new SessionEventHub<number>({eventEpoch: "epoch-a", replayLimit: 2});
        for (let version = 1; version <= 3; version += 1) {
            hub.publish({
                sessionId: 1,
                kind: "session",
                event: {type: "session_status", status: "idle", activeInvocationId: null, version},
            });
        }
        const valid = hub.subscribe(1, {eventEpoch: "epoch-a", after: 1});
        expect(valid.connected.snapshotRequired).toBe(false);
        const iterator = valid[Symbol.asyncIterator]();
        expect((await iterator.next()).value?.seq).toBe(2);
        expect((await iterator.next()).value?.seq).toBe(3);
        await valid.close();

        expect(hub.subscribe(1, {eventEpoch: "old", after: 3}).connected.snapshotRequired).toBe(true);
        expect(hub.subscribe(1, {eventEpoch: "epoch-a", after: 99}).connected.snapshotRequired).toBe(true);
        expect(hub.subscribe(1, {eventEpoch: "epoch-a", after: 0}).connected.snapshotRequired).toBe(true);
    });
});
