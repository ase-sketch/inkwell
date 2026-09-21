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

// 第八十六轮：compaction_start / compaction_end 运行时事件 smoke。
// 此前事件清单只做了代码引用审计，未在运行时验证发布顺序与载荷。
describe("compaction runtime 事件", () => {
    test("触发 compaction 时先发 compaction_start，摘要落盘后发 compaction_end", async () => {
        const registry = new ProfileRegistry();
        registry.define({
            manifest: {key: "compact-events", name: "Compact Events"},
            initial: schema,
            payload: schema,
            prepare: () => ({
                systemPrompt: "compact-events",
                modelConfig: {},
                compaction: {triggerTokens: 3, keepRecentTokens: 1},
            }),
        });
        const harness = new NeuroAgentHarness({
            store: new MemorySessionStore(),
            profiles: registry,
            model: new ScriptedModelRuntime([
                completed("old answer"),
                completed("new answer"),
            ]),
            compactor: {
                estimate: () => 1,
                async summarize(request) {
                    return `summary of ${request.messages.length} messages`;
                },
            },
        });
        const session = await harness.createSession({
            profileKey: "compact-events",
            initial: {},
            hostContext: {},
        });
        const sessionId = session.session.metadata.sessionId;
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
        await (await harness.invoke({
            sessionId,
            payload: {instruction: "old prompt"},
        })).result();
        await (await harness.invoke({
            sessionId,
            payload: {instruction: "new prompt"},
        })).result();
        await collector;

        const runtimeEvents = received
            .filter((event) => event.kind === "runtime")
            .map((event) => event.event);
        const starts = runtimeEvents.filter((event) => event.type === "compaction_start");
        const ends = runtimeEvents.filter((event) => event.type === "compaction_end");
        expect(starts).toHaveLength(1);
        expect(ends).toHaveLength(1);
        expect(starts[0] && starts[0].type === "compaction_start"
            ? starts[0].tokensBefore
            : undefined).toBe(3);
        expect(ends[0] && ends[0].type === "compaction_end"
            ? ends[0].tokensBefore
            : undefined).toBe(3);
        expect(ends[0] && ends[0].type === "compaction_end"
            ? ends[0].keptMessages
            : undefined).toBeGreaterThan(0);
        const types = runtimeEvents.map((event) => event.type);
        expect(types.indexOf("compaction_start")).toBeGreaterThanOrEqual(0);
        expect(types.indexOf("compaction_start")).toBeLessThan(types.indexOf("compaction_end"));
        expect(types.indexOf("compaction_end")).toBeLessThan(types.lastIndexOf("agent_end"));
        await harness.dispose();
    });
});
