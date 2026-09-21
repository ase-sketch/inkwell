import { describe, expect, test } from "bun:test";
import { makeEnv } from "./helpers";
import type {
    AgentWorkflowDefinition as WorkflowDefinition,
    JsonValue,
    Wf,
} from "../src/index";

/**
 * 场景二：写作流水线。
 * writer 写正文 ↔ critic 批判循环（上限约束在代码里）→ worldUpdater 收尾。
 * 另验证：子代理 waiting 是普通返回值，可转发给用户再 followup。
 */
describe("场景：写作流水线", () => {
    test("writer↔critic 循环收敛，worldUpdater 恰好一次", async () => {
        const { agents, runner } = makeEnv();
        let draftVersion = 0;
        let criticRounds = 0;
        let worldUpdates = 0;
        agents.register("writer", ({ mode }) => {
            draftVersion++;
            return { message: `draft v${draftVersion}`, data: { draft: `正文 v${draftVersion}`, mode: mode ?? "prompt" } };
        });
        agents.register("critic", () => {
            criticRounds++;
            const pass = criticRounds >= 3;
            return { message: pass ? "通过" : "驳回", data: { pass, issues: pass ? [] : [`问题#${criticRounds}`] } };
        });
        agents.register("world.updater", () => {
            worldUpdates++;
            return { message: "World Engine 已更新" };
        });

        const pipeline: WorkflowDefinition = {
            key: "write-chapter",
            run: async (wf: Wf, args) => {
                const brief = (args as { brief: string }).brief;
                const writer = await wf.agents.create("writer", {});
                const critic = await wf.agents.create("critic", {});

                let draft = (await writer.invoke({ input: { brief } })).result;
                let rounds = 0;
                for (; rounds < 5; rounds++) {
                    const review = (await critic.invoke({ input: { draft: draft.data } })).result;
                    if ((review.data as { pass: boolean }).pass) break;
                    draft = (await writer.invoke({
                        mode: "followup",
                        input: { revisions: (review.data as { issues: string[] }).issues },
                    })).result;
                }

                const updater = await wf.agents.create("world.updater", { ephemeral: true });
                await updater.invoke({ input: { finalDraft: draft.data } });
                return { draft: draft.data, criticRounds: rounds + 1 } as JsonValue;
            },
        };

        const view = await runner.start(pipeline, { brief: "第一章：玉佩现世" });
        expect(view.status).toBe("completed");
        const result = view.result as { draft: { draft: string }; criticRounds: number };
        expect(result.draft.draft).toBe("正文 v3"); // 两轮驳回 + 一轮通过
        expect(result.criticRounds).toBe(3);
        expect(worldUpdates).toBe(1); // 收尾是代码结构，跳不过
        // writer session 持久保留了完整迭代史（3 次 invoke = 6 条 entry）
    });

    test("子代理 waiting 转发给用户，followup 续跑", async () => {
        const { agents, runner } = makeEnv();
        let asked = false;
        agents.register("writer", ({ mode, input }) => {
            if (!asked && mode === "prompt") {
                asked = true;
                return { message: "主角的金手指是什么？我需要这个设定才能写", waiting: true };
            }
            return { message: "写完了", data: { draft: `基于设定「${(input as { answer?: string })?.answer ?? "无"}」的正文` } };
        });

        const def: WorkflowDefinition = {
            key: "waiting-forward",
            run: async (wf: Wf) => {
                const writer = await wf.agents.create("writer", {});
                const first = await writer.invoke({ message: "写第一章" });
                if (first.status === "waiting") {
                    // waiting 是普通返回值：转发给用户，拿到答案再 followup
                    const answer = await wf.ask({ kind: "text", title: first.result.message });
                    const second = await writer.invoke({ mode: "followup", input: { answer: answer as string } });
                    return second.result.data;
                }
                return first.result.data;
            },
        };

        const v1 = await runner.start(def, null);
        expect(v1.status).toBe("waiting");
        expect(v1.pendingAsks[0]!.spec.title).toContain("金手指");

        const v2 = await runner.resume(v1.runId, { [v1.pendingAsks[0]!.key]: "一块能吐槽的玉佩" });
        expect(v2.status).toBe("completed");
        expect(v2.result).toEqual({ draft: "基于设定「一块能吐槽的玉佩」的正文" });
    });
});
