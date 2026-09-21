import { describe, expect, test } from "bun:test";
import { directChat, makeEnv } from "./helpers";
import { SessionBusyError } from "../src/index";
import type {
    AgentWorkflowDefinition as WorkflowDefinition,
    JsonValue,
    Wf,
} from "../src/index";

/**
 * 场景三：角色扮演的持久参与者。
 * 用户输入 → leader 世界模拟 → 派发多个 actor → leader 汇总。
 * leader / actor 都不是用完即弃：跨 run 复用，run 之间用户可与 leader 直接对话。
 */
describe("场景：RP 持久参与者", () => {
    function setup() {
        const env = makeEnv();
        const busyErrors: string[] = [];
        let leaderStore = env.store;
        env.agents.register("simulator.leader", ({ mode, message, input, history }) => {
            if (mode === "followup") {
                const reactions = (input as { reactions: { message: string }[] }).reactions;
                return { message: `本回合结算：${reactions.map((r) => r.message).join("；")}`, data: { historyLen: history.length } as JsonValue };
            }
            // 用户直聊（direct 入口）时给闲聊应答；workflow 回合给派发计划
            if (message?.startsWith("聊：")) return { message: `闲聊回应（${message}）` };
            return {
                message: "世界模拟完成，派发角色",
                data: { dispatch: [{ subjectId: "alice", packet: `艾丽丝对「${message}」的反应` }, { subjectId: "bob", packet: `鲍勃对「${message}」的反应` }] } as JsonValue,
            };
        });
        env.agents.register("simulator.actor", async ({ input, history, sessionId }) => {
            // 演练锁：actor 执行期间尝试用户直聊 leader，应被拒
            try {
                await leaderStore.lock(1, "direct");
                await leaderStore.releaseAll("direct");
            } catch (error) {
                if (error instanceof SessionBusyError) busyErrors.push(error.message);
            }
            return { message: `扮演(${(input as { packet: string }).packet})`, data: { memory: history.length, actor: sessionId } };
        });
        return { ...env, busyErrors };
    }

    const rpTurn: WorkflowDefinition = {
        key: "rp-turn",
        run: async (wf: Wf, args) => {
            const userInput = (args as { userInput: string }).userInput;
            const leader = await wf.agents.acquire({ profileKey: "simulator.leader", tag: "rp:main" });
            const plan = await leader.invoke({ message: userInput });

            const dispatch = (plan.result.data as { dispatch: { subjectId: string; packet: string }[] }).dispatch;
            const reactions = await wf.map(dispatch, async (d) => {
                const actor = await wf.agents.acquire({
                    profileKey: "simulator.actor", tag: `rp:actor:${d.subjectId}`, parent: leader,
                });
                const r = await actor.invoke({ input: { packet: d.packet } });
                return { subjectId: d.subjectId, message: r.result.message, actorSession: actor.id };
            }, { concurrency: 2 });

            const final = await leader.invoke({ mode: "followup", input: { reactions } });
            return { narration: final.result.message, reactions, leaderSession: leader.id } as JsonValue;
        },
    };

    test("两轮 workflow + 轮间用户直聊：session 跨 run 复用且历史连续", async () => {
        const { store, agents, runner, busyErrors } = setup();

        // 第一回合
        const r1 = await runner.start(rpTurn, { userInput: "我推开酒馆的门" });
        expect(r1.status).toBe("completed");
        const out1 = r1.result as { leaderSession: number; reactions: { actorSession: number; subjectId: string }[] };
        expect(out1.reactions.map((r) => r.subjectId)).toEqual(["alice", "bob"]);

        // run 期间 actor 内尝试用户直聊 leader → 被锁拒绝
        expect(busyErrors.length).toBeGreaterThan(0);
        expect(busyErrors[0]).toContain(`正被 ${r1.runId} 占用`);

        // 回合之间：用户单独找 leader 聊天（run 已结束，锁已释放）
        const chat = await directChat(store, agents, out1.leaderSession, "聊：刚才的酒保是谁？");
        expect(chat.message).toContain("闲聊回应");

        // 第二回合：acquire 拿到同一批 session
        const r2 = await runner.start(rpTurn, { userInput: "我向吧台走去" });
        expect(r2.status).toBe("completed");
        const out2 = r2.result as { leaderSession: number; reactions: { actorSession: number }[] };
        expect(out2.leaderSession).toBe(out1.leaderSession);
        expect(out2.reactions.map((r) => r.actorSession)).toEqual(out1.reactions.map((r) => r.actorSession));

        // leader 历史连续：回合一(4) + 直聊(2) + 回合二(4)，且直聊 entry 在主线上
        const transcript = await store.transcript(out1.leaderSession, await store.activeLeaf(out1.leaderSession));
        expect(transcript).toHaveLength(10);
        expect(transcript.filter((e) => e.origin === "direct")).toHaveLength(2);
        // 回合二的 followup 结算里，leader 能看到含直聊在内的全部历史（到本轮输入为止 9 条）
        const lastData = transcript[transcript.length - 1]!.data as { historyLen: number };
        expect(lastData.historyLen).toBe(9);

        // actor 记忆随回合增长（第二回合 history 包含第一回合）
        const actorMeta = await store.meta(out1.reactions[0]!.actorSession);
        expect(actorMeta.tags).toEqual(["rp:actor:alice"]);
        expect(actorMeta.parentSessionId).toBe(out1.leaderSession);
        expect(actorMeta.archived).toBe(false); // 持久参与者不归档
    });
});
