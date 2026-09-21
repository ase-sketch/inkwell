import {describe, expect, test} from "bun:test";
import {SessionEventHub, type EventCursor} from "../src/index.js";

describe("EventCursor epoch admission", () => {
    test("non-zero after without eventEpoch must require Snapshot recovery", async () => {
        const hub = new SessionEventHub<number>({
            eventEpoch: "epoch-current",
            replayLimit: 10,
        });
        hub.publish({
            sessionId: 1,
            kind: "session",
            event: {type: "session_status", status: "idle", activeInvocationId: null, version: 1},
        });
        hub.publish({
            sessionId: 1,
            kind: "session",
            event: {type: "session_status", status: "idle", activeInvocationId: null, version: 2},
        });

        // Deliberately omit eventEpoch: the Hub's own epoch must not be inferred into a partial cursor.
        const cursorWithoutEpoch = {after: 1} satisfies EventCursor;
        const subscription = hub.subscribe(1, cursorWithoutEpoch);
        expect(subscription.connected.snapshotRequired).toBe(true);
        await subscription.close();
    });

    test("after=0 无 epoch 与空 cursor 仍保持合法初始订阅语义", async () => {
        const hub = new SessionEventHub<number>({
            eventEpoch: "epoch-initial",
        });
        const published = hub.publish({
            sessionId: 1,
            kind: "session",
            event: {type: "session_status", status: "idle", activeInvocationId: null, version: 1},
        });

        const fromZero = hub.subscribe(1, {after: 0});
        expect(fromZero.connected.snapshotRequired).toBe(false);
        expect((await fromZero.next()).value).toBe(published);
        await fromZero.close();

        const fromTail = hub.subscribe(1);
        expect(fromTail.connected.snapshotRequired).toBe(false);
        await fromTail.close();
    });
});
