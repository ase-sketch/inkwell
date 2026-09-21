import { describe, expect, test } from "bun:test";
import { makeEnv } from "./helpers";
import type {
    AgentWorkflowDefinition as WorkflowDefinition,
    JsonValue,
    Wf,
} from "../src/index";

/**
 * 场景四：sidecar 形态（面 B/C 的 caller 操作）。
 * 对 caller 做 excursion 旁路检索，把结论 append 回主线——
 * 替代原 SidecarProfilePass 的 fork-leaf + merge(persistedMessages)。
 */
describe("场景：sidecar 旁路", () => {
    test("excursion 检索 + 主线 append，caller 主线不被旁支污染", async () => {
        const { store, agents, runner } = makeEnv();
        agents.register("simulator.actor", ({ message }) => ({ message: `actor 回应：${message}` }));
        agents.register("retrieval.subject", ({ input }) => ({
            message: "检索完成",
            data: { facts: [`关于「${(input as { query: string }).query}」的两条往事`] },
        }));

        // 预置 caller：一个已有历史的 actor session（模拟主 run 前的状态）
        const caller = await store.createSession({ profileKey: "simulator.actor", kind: "chat", tags: ["rp:actor:alice"] });
        const e1 = await store.append(caller.sessionId, null, { role: "user", message: "回合一输入", origin: "direct" });
        await store.append(caller.sessionId, e1, { role: "assistant", message: "回合一回应", origin: "direct" });

        const contextLoad: WorkflowDefinition = {
            key: "actor-context-load",
            run: async (wf: Wf, args) => {
                const target = await wf.caller();
                // 旁路：在 caller 树上开旁支做探针式检索（不污染主线）
                const facts = await target.excursion("leaf", async (branch) => {
                    await branch.append({ role: "user", message: "（旁路探针：请回忆相关往事）" });
                    const retr = await wf.agents.create("retrieval.subject", { ephemeral: true });
                    const r = await retr.invoke({ input: { query: (args as { packet: string }).packet } });
                    return (r.result.data as { facts: string[] }).facts;
                });
                // 结论写回主线（原 merge.persistedMessages 的通用化）
                await target.append({ role: "user", input: { actorContext: facts } as unknown as JsonValue });
                return { injected: facts.length } as JsonValue;
            },
        };

        const view = await runner.start(contextLoad, { packet: "酒馆的旧识" }, { callerSessionId: caller.sessionId });
        expect(view.status).toBe("completed");
        expect(view.result).toEqual({ injected: 1 });

        // 主线 = 原历史 + 注入的 context；探针不在主线
        const mainline = await store.transcript(caller.sessionId, await store.activeLeaf(caller.sessionId));
        expect(mainline.map((e) => e.message ?? "ctx")).toEqual(["回合一输入", "回合一回应", "ctx"]);
        expect((mainline[2]!.input as { actorContext: string[] }).actorContext[0]).toContain("酒馆的旧识");
        // 旁支探针仍在树上可追溯
        expect(store.allEntries(caller.sessionId).some((e) => e.message?.includes("旁路探针"))).toBe(true);
        // 检索 agent 是 ephemeral，run 后归档
        expect((await store.meta(caller.sessionId + 1)).archived).toBe(true);
    });
});
