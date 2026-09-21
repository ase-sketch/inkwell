import { describe, expect, test } from "bun:test";
import { makeEnv } from "./helpers";
import { MemorySessionStore, WorkflowRunner } from "../src/index";
import type {
    AgentWorkflowDefinition as WorkflowDefinition,
    AgentPort,
    JsonValue,
    Wf,
} from "../src/index";

/** journal / 重放 / 并发 / 挂起 的内核语义 */
describe("journal 内核", () => {
    test("不同 Runner 实例分配的 Run ID 不重用", async () => {
        const first = makeEnv().runner;
        const second = makeEnv().runner;
        const def: WorkflowDefinition = {
            key: "unique-run-id",
            run: async () => null,
        };

        const [left, right] = await Promise.all([
            first.start(def, null),
            second.start(def, null),
        ]);

        expect(left.runId).toMatch(/^run_[0-9a-f-]{36}$/);
        expect(right.runId).toMatch(/^run_[0-9a-f-]{36}$/);
        expect(left.runId).not.toBe(right.runId);
    });

    test("waiting run 取消后立即成为 cancelled，且不能 resume 或 rerun", async () => {
        const { runner } = makeEnv();
        const def: WorkflowDefinition = {
            key: "cancel-waiting",
            run: async (wf: Wf) => await wf.ask({
                kind: "approve",
                title: "继续？",
            }),
        };
        const waiting = await runner.start(def, null);
        expect(waiting.status).toBe("waiting");

        await runner.cancel(waiting.runId);

        expect(runner.view(waiting.runId)).toMatchObject({
            status: "cancelled",
            pendingAsks: [],
        });
        await expect(runner.resume(waiting.runId, {})).rejects.toThrow(
            /非 waiting 状态/,
        );
        await expect(runner.rerun(waiting.runId)).rejects.toThrow(/已取消/);
    });

    test("最后一个 activity 运行期间取消，迟到成功不能覆盖 cancelled", async () => {
        const { agents, runner } = makeEnv();
        let release: (() => void) | undefined;
        const gate = new Promise<void>((resolve) => {
            release = resolve;
        });
        agents.register("slow", async () => {
            await gate;
            return { message: "late success" };
        });
        const def: WorkflowDefinition = {
            key: "cancel-last-activity",
            run: async (wf: Wf) => {
                const agent = await wf.agents.create("slow");
                return await agent.invoke({ message: "wait" }) as unknown as JsonValue;
            },
        };
        const { runId, done } = runner.begin(def, null);
        await new Promise((resolve) => setTimeout(resolve, 0));

        await runner.cancel(runId);
        release!();

        await expect(done).resolves.toMatchObject({ status: "cancelled" });
        expect(runner.view(runId).result).toBeUndefined();
        expect(
            runner.view(runId).journal.some(
                (record) => record.kind === "agents.invoke",
            ),
        ).toBe(false);
    });

    test("Run cancel 将同一个 signal 传给当前 Agent activity 并有界收口", async () => {
        const store = new MemorySessionStore();
        let observedSignal: AbortSignal | undefined;
        const agents: AgentPort = {
            async profileInfo(profileKey) {
                return { profileKey };
            },
            async invoke(_sessionId, fromLeaf, opts) {
                observedSignal = opts.signal;
                await new Promise<void>((_resolve, reject) => {
                    opts.signal?.addEventListener(
                        "abort",
                        () => reject(new Error("agent aborted")),
                        { once: true },
                    );
                });
                return {
                    status: "completed",
                    message: "unreachable",
                    data: null,
                    newLeaf: fromLeaf,
                };
            },
        };
        const runner = new WorkflowRunner({ sessions: store, agents });
        const def: WorkflowDefinition = {
            key: "cancel-agent-signal",
            run: async (wf: Wf) => {
                const agent = await wf.agents.create("slow");
                return await agent.invoke({ message: "wait" }) as unknown as JsonValue;
            },
        };
        const { runId, done } = runner.begin(def, null);
        await new Promise((resolve) => setTimeout(resolve, 0));

        await runner.cancel(runId);

        expect(observedSignal?.aborted).toBe(true);
        await expect(done).resolves.toMatchObject({ status: "cancelled" });
        expect(
            runner.view(runId).journal.some(
                (record) => record.kind === "agents.invoke",
            ),
        ).toBe(false);
    });

    test("Run cancel 同时取消 wf.all 的全部并发 Agent activity", async () => {
        const store = new MemorySessionStore();
        const observedSignals: AbortSignal[] = [];
        let markAllStarted: (() => void) | undefined;
        const allStarted = new Promise<void>((resolve) => {
            markAllStarted = resolve;
        });
        const agents: AgentPort = {
            async profileInfo(profileKey) {
                return { profileKey };
            },
            async invoke(_sessionId, fromLeaf, opts) {
                if (!opts.signal) {
                    throw new Error("并发 Agent activity 缺少 Run signal");
                }
                observedSignals.push(opts.signal);
                if (observedSignals.length === 3) {
                    markAllStarted!();
                }
                await new Promise<void>((_resolve, reject) => {
                    opts.signal!.addEventListener(
                        "abort",
                        () => reject(new Error("agent aborted")),
                        { once: true },
                    );
                });
                return {
                    status: "completed",
                    message: "unreachable",
                    data: null,
                    newLeaf: fromLeaf,
                };
            },
        };
        const runner = new WorkflowRunner({ sessions: store, agents });
        const def: WorkflowDefinition = {
            key: "cancel-concurrent-agents",
            run: async (wf: Wf) => {
                const workers = await Promise.all([
                    wf.agents.create("slow"),
                    wf.agents.create("slow"),
                    wf.agents.create("slow"),
                ]);
                return await wf.all(
                    workers.map(
                        (worker) => () => worker.invoke({ message: "wait" }),
                    ),
                ) as unknown as JsonValue;
            },
        };
        const { runId, done } = runner.begin(def, null);
        await allStarted;

        await runner.cancel(runId);

        expect(observedSignals).toHaveLength(3);
        expect(new Set(observedSignals).size).toBe(1);
        expect(observedSignals.every((signal) => signal.aborted)).toBe(true);
        await expect(done).resolves.toMatchObject({ status: "cancelled" });
        expect(
            runner.view(runId).journal.some(
                (record) => record.kind === "agents.invoke",
            ),
        ).toBe(false);
    });

    test("崩溃后 rerun：已完成 Activity 命中缓存不重跑", async () => {
        const { agents, runner } = makeEnv();
        let calls = 0;
        let crashOnce = true;
        agents.register("echo", ({ message }) => {
            calls++;
            return { message: `echo:${message}` };
        });
        const def: WorkflowDefinition = {
            key: "crash-demo",
            run: async (wf: Wf) => {
                const a = await wf.agents.create("echo", { ephemeral: true });
                const r1 = await a.invoke({ message: "one" });
                if (crashOnce) {
                    crashOnce = false;
                    throw new Error("模拟崩溃");
                }
                const r2 = await a.invoke({ message: "two" });
                return { first: r1.result.message, second: r2.result.message };
            },
        };
        const v1 = await runner.start(def, null);
        expect(v1.status).toBe("failed");
        expect(calls).toBe(1);

        const v2 = await runner.rerun(v1.runId);
        expect(v2.status).toBe("completed");
        expect(v2.result).toEqual({ first: "echo:one", second: "echo:two" });
        expect(calls).toBe(2); // "one" 命中缓存，只有 "two" 真跑
    });

    test("参数变化：该路径从不匹配处后缀失效", async () => {
        const { agents, runner } = makeEnv();
        const seen: string[] = [];
        agents.register("echo", ({ message }) => {
            seen.push(message ?? "");
            return { message: `echo:${message}` };
        });
        // 用同一 run 的 journal 手动改指纹不可行（脚本是函数），改用 rerun 前改脚本行为等价验证：
        // 第一次跑 A/B；第二次（rerun）脚本第二步参数变为 B2 → 第一步命中，第二步重跑
        let secondArg = "B";
        const def: WorkflowDefinition = {
            key: "dirty-demo",
            run: async (wf: Wf) => {
                const a = await wf.agents.create("echo", {});
                await a.invoke({ message: "A" });
                await a.invoke({ message: secondArg });
                if (secondArg === "B") throw new Error("首跑止步于此");
                return null;
            },
        };
        const v1 = await runner.start(def, null);
        expect(v1.status).toBe("failed");
        expect(seen).toEqual(["A", "B"]);

        secondArg = "B2"; // 等价于编辑脚本
        const v2 = await runner.rerun(v1.runId);
        expect(v2.status).toBe("completed");
        expect(seen).toEqual(["A", "B", "B2"]); // A 命中；B2 指纹不匹配转真跑
    });

    test("参数变化会从 journal 中移除不再执行的同路径后缀", async () => {
        const { agents, runner } = makeEnv();
        agents.register("echo", ({ message }) => ({
            message: `echo:${message}`,
        }));
        let shortVersion = false;
        const definition: WorkflowDefinition = {
            key: "prune-stale-suffix",
            run: async (wf) => {
                const agent = await wf.agents.create("echo");
                await agent.invoke({ message: "A" });
                await agent.invoke({ message: shortVersion ? "B2" : "B" });
                if (!shortVersion) {
                    await agent.invoke({ message: "C" });
                    throw new Error("rerun with shorter suffix");
                }
                return null;
            },
        };
        const first = await runner.start(definition, null);
        expect(first.status).toBe("failed");

        shortVersion = true;
        const second = await runner.rerun(first.runId);

        expect(second.status).toBe("completed");
        expect(
            second.journal
                .filter((record) => record.kind === "agents.invoke")
                .map((record) => {
                    if (record.result.kind !== "inline") {
                        throw new Error("small mock output should be inline");
                    }
                    return (
                        record.result.value as { message: string }
                    ).message;
                }),
        ).toEqual(["echo:A", "echo:B2"]);
    });

    test("map：并发上限生效，分支路径 seq 与完成顺序无关", async () => {
        const { agents, runner } = makeEnv();
        let inFlight = 0;
        let peak = 0;
        agents.register("worker", async ({ input }) => {
            inFlight++;
            peak = Math.max(peak, inFlight);
            // 故意让完成顺序乱序
            await new Promise((r) => setTimeout(r, (input as number) % 3 === 0 ? 15 : 1));
            inFlight--;
            return { message: "done", data: (input as number) * 10 };
        });
        const def: WorkflowDefinition = {
            key: "map-demo",
            run: async (wf: Wf) => {
                const results = await wf.map([0, 1, 2, 3, 4, 5, 6, 7], async (n) => {
                    const a = await wf.agents.create("worker", { ephemeral: true });
                    const r = await a.invoke({ input: n });
                    return r.result.data;
                }, { concurrency: 3 });
                return results as JsonValue;
            },
        };
        const view = await runner.start(def, null);
        expect(view.status).toBe("completed");
        expect(view.result).toEqual([0, 10, 20, 30, 40, 50, 60, 70]); // 顺序保持
        expect(peak).toBeLessThanOrEqual(3);
        // 分支路径身份：每个分支的 journal 独立成路径
        const paths = new Set(view.journal.map((r) => r.path));
        expect([...paths].filter((p) => p.includes(":")).length).toBe(8);
    });

    test("map 输入缩短后会移除已不存在分支的 journal", async () => {
        const { agents, runner } = makeEnv();
        agents.register("worker", ({ input }) => ({
            message: `done:${input}`,
        }));
        let items = [1, 2, 3];
        let failOnce = true;
        const definition: WorkflowDefinition = {
            key: "map-prunes-removed-branches",
            run: async (wf) => {
                const result = await wf.map(items, async (item) => {
                    const worker = await wf.agents.create("worker");
                    return await worker.invoke({ input: item });
                });
                if (failOnce) {
                    failOnce = false;
                    throw new Error("shorten map input");
                }
                return result as unknown as JsonValue;
            },
        };
        const first = await runner.start(definition, null);
        expect(first.status).toBe("failed");

        items = [1];
        const second = await runner.rerun(first.runId);

        expect(second.status).toBe("completed");
        expect(
            [...new Set(
                second.journal
                    .filter((record) => record.path.includes(":"))
                    .map((record) => record.path),
            )],
        ).toEqual(["root/0:0"]);
    });

    test("ask：挂起 → resume 应答进 journal → 续跑不重跑前缀", async () => {
        const { agents, runner } = makeEnv();
        let calls = 0;
        agents.register("echo", ({ message }) => {
            calls++;
            return { message: `echo:${message}` };
        });
        const def: WorkflowDefinition = {
            key: "ask-demo",
            run: async (wf: Wf) => {
                const a = await wf.agents.create("echo", {});
                await a.invoke({ message: "before" });
                const answer = await wf.ask({
                    kind: "text",
                    title: "叫什么名字？",
                    description: "请填写 **显示名称**。",
                });
                const r = await a.invoke({ message: `hello ${answer}` });
                return r.result.message;
            },
        };
        const v1 = await runner.start(def, null);
        expect(v1.status).toBe("waiting");
        expect(v1.pendingAsks).toHaveLength(1);
        expect(v1.pendingAsks[0]!.spec.title).toBe("叫什么名字？");
        expect(v1.pendingAsks[0]!.spec.description).toBe(
            "请填写 **显示名称**。",
        );
        expect(calls).toBe(1);

        const v2 = await runner.resume(v1.runId, { [v1.pendingAsks[0]!.key]: "艾丽丝" });
        expect(v2.status).toBe("completed");
        expect(v2.result).toBe("echo:hello 艾丽丝");
        expect(calls).toBe(2); // before 命中缓存
    });

    test("excursion：异常也恢复游标，旁支留在树上", async () => {
        const { store, agents, runner } = makeEnv();
        agents.register("echo", ({ message }) => ({ message: `echo:${message}` }));
        const def: WorkflowDefinition = {
            key: "excursion-demo",
            run: async (wf: Wf) => {
                const a = await wf.agents.create("echo", {});
                await a.append({ role: "user", message: "主线一" });
                const anchor = a.leaf()!;
                await a.append({ role: "user", message: "主线二" });
                const mainTip = a.leaf()!;
                try {
                    await a.excursion(anchor, async (branch) => {
                        await branch.append({ role: "user", message: "旁支探针" });
                        throw new Error("旁路失败");
                    });
                } catch { /* 吞掉验证恢复 */ }
                return { restored: a.leaf() === mainTip, sessionId: a.id };
            },
        };
        const view = await runner.start(def, null);
        expect(view.status).toBe("completed");
        const { restored, sessionId } = view.result as { restored: boolean; sessionId: number };
        expect(restored).toBe(true);
        const all = store.allEntries(sessionId);
        expect(all.some((e) => e.message === "旁支探针")).toBe(true); // 旁支还在树上
        const mainline = await store.transcript(sessionId, await store.activeLeaf(sessionId));
        expect(mainline.map((e) => e.message)).toEqual(["主线一", "主线二"]); // 主线不含探针
    });
});
