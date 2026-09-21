import {describe, expect, test} from "bun:test";
import {
    NeuroAgentHarness,
    ProfileRegistry,
    defineProfile,
    defineSchema,
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

// 第八十五轮 P2 吸收：session 事件正向 smoke（steer_queued/steer_drained
// 此前仅有负向或无断言）。
describe("steer session 事件", () => {
    test("steer 入队与注入发布 steer_queued / steer_drained，内容进入 transcript", async () => {
        let release!: () => void;
        const gate = new Promise<void>((resolve) => {
            release = resolve;
        });
        const harness = new NeuroAgentHarness({
            store: new MemorySessionStore(),
            profiles: new ProfileRegistry().add(profile("steer-events")),
            model: new ScriptedModelRuntime([
                async () => {
                    await gate;
                    return completed("first");
                },
                completed("second"),
            ]),
        });
        const created = await harness.createSession({profileKey: "steer-events", initial: {}, hostContext: {}});
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
        await harness.steer(sessionId, {text: "steer-me"});
        await new Promise<void>((resolve) => setTimeout(resolve, 50));
        release();
        await handle.result();
        await collector;

        const sessionEvents = received.filter((event) => event.kind === "session");
        const queued = sessionEvents.find((event) => event.event.type === "steer_queued");
        expect(queued).toBeDefined();
        expect(queued && queued.event.type === "steer_queued"
            ? queued.event.item.payload
            : undefined).toEqual({text: "steer-me"});
        expect(sessionEvents.some((event) => event.event.type === "steer_drained")).toBe(true);

        const snapshot = await harness.snapshot(sessionId);
        expect(snapshot.session.entries.some((entry) => {
            return entry.kind === "agent.message"
                && JSON.stringify((entry.payload as {message?: unknown}).message).includes("steer-me");
        })).toBe(true);
        await harness.dispose();
    });
});
