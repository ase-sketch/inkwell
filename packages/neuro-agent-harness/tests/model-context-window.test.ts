import {describe, expect, test} from "bun:test";
import {
    NeuroAgentHarness,
    ProfileRegistry,
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

function assistant(text: string, timestamp: number) {
    return {
        message: {
            role: "assistant" as const,
            content: [{type: "text" as const, text}],
            timestamp,
        },
    };
}

function profile(key: string) {
    return defineProfile({
        manifest: {key, name: key},
        initial: objectSchema,
        payload: objectSchema,
        prepare: () => ({systemPrompt: "window", modelConfig: {}}),
    });
}

// 第一百轮：ModelRuntime.contextWindow 可选 seam + 超窗 fail closed
// （对齐 NeuroBook assertContextWithinWindow，neuro-agent-harness.ts:5062-5071）。
describe("Model contextWindow 保护", () => {
    test("声明 contextWindow 且估计超窗时在模型调用前 fail closed", async () => {
        let modelCalls = 0;
        const harness = new NeuroAgentHarness({
            store: new MemorySessionStore(),
            profiles: new ProfileRegistry().add(profile("window-guard")),
            model: {
                contextWindow: 4,
                async runTurn() {
                    modelCalls += 1;
                    throw new Error("must not run");
                },
            },
            compactor: {
                estimate: () => 5,
                summarize: async () => "s",
            },
        });
        const created = await harness.createSession({profileKey: "window-guard", initial: {}, hostContext: {}});
        const result = await (await harness.invoke({sessionId: created.session.metadata.sessionId, payload: {}})).result();

        expect(modelCalls).toBe(0);
        expect(result.status).toBe("failed");
        expect(result.error?.phase).toBe("run");
        expect(result.error?.message).toContain("超过模型窗口 4 token 限制");
        await harness.dispose();
    });

    test("估计在窗口内时正常调用模型并完成", async () => {
        const harness = new NeuroAgentHarness({
            store: new MemorySessionStore(),
            profiles: new ProfileRegistry().add(profile("window-pass")),
            model: {
                contextWindow: 100,
                runTurn: async () => assistant("ok", 1),
            },
            compactor: {
                estimate: () => 5,
                summarize: async () => "s",
            },
        });
        const created = await harness.createSession({profileKey: "window-pass", initial: {}, hostContext: {}});
        const result = await (await harness.invoke({sessionId: created.session.metadata.sessionId, payload: {}})).result();

        expect(result.status).toBe("completed");
        await harness.dispose();
    });

    test("未声明 contextWindow 时不启用守卫", async () => {
        const harness = new NeuroAgentHarness({
            store: new MemorySessionStore(),
            profiles: new ProfileRegistry().add(profile("window-none")),
            model: new ScriptedModelRuntime<JsonObject>([assistant("ok", 1)]),
            compactor: {
                estimate: () => 5,
                summarize: async () => "s",
            },
        });
        const created = await harness.createSession({profileKey: "window-none", initial: {}, hostContext: {}});
        const result = await (await harness.invoke({sessionId: created.session.metadata.sessionId, payload: {}})).result();

        expect(result.status).toBe("completed");
        await harness.dispose();
    });

    test("声明 contextWindow 但未配置 compactor 时守卫跳过（Core 无内置 tokenizer）", async () => {
        const harness = new NeuroAgentHarness({
            store: new MemorySessionStore(),
            profiles: new ProfileRegistry().add(profile("window-no-estimator")),
            model: {
                contextWindow: 4,
                runTurn: async () => assistant("ok", 1),
            },
        });
        const created = await harness.createSession({profileKey: "window-no-estimator", initial: {}, hostContext: {}});
        const result = await (await harness.invoke({sessionId: created.session.metadata.sessionId, payload: {}})).result();

        expect(result.status).toBe("completed");
        await harness.dispose();
    });

    test("构造时拒绝非法 contextWindow", () => {
        const base = {
            store: new MemorySessionStore(),
            profiles: new ProfileRegistry().add(profile("window-invalid")),
            model: {
                contextWindow: 0,
                runTurn: async () => assistant("ok", 1),
            },
        };
        expect(() => new NeuroAgentHarness(base)).toThrow();
        expect(() => new NeuroAgentHarness({...base, model: {...base.model, contextWindow: -1}})).toThrow();
        expect(() => new NeuroAgentHarness({...base, model: {...base.model, contextWindow: Number.NaN}})).toThrow();
        expect(() => new NeuroAgentHarness({...base, model: {...base.model, contextWindow: Number.POSITIVE_INFINITY}})).toThrow();
    });
});
