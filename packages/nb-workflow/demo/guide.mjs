/**
 * nb-workflow 0.1.2 特性演示（教学脚本）
 *
 * 运行方式：
 *   bun run build          # 先构建 dist（脚本从包名导入，验证发布 API）
 *   node demo/guide.mjs    # Node 20+ 消费者视角运行
 *   bun demo/guide.mjs     # 或直接用 Bun 运行
 *
 * 核心思想一句话：workflow 是普通 async 脚本，Kernel 把它执行的每个
 * "Activity"（副作用调用）记进 journal；崩溃/重放时按 journal 恢复，
 * 不重复执行已完成的外部副作用。
 */

import {
    MemoryActivityExecutor,
    MemoryChildWorkflowStore,
    MemoryDefinitionRegistry,
    MemorySessionStore,
    MemorySignalStore,
    MemoryTimerStore,
    MemoryValueStore,
    MemoryWorkflowBackend,
    MockAgentPort,
    extractCfg,
    skeletonMermaid,
    traceGraph,
    WorkflowBackendCapabilityError,
    WorkflowPersistenceError,
    WorkflowRunner,
} from "@notnotype/nb-workflow";

function section(title) {
    console.log(`\n${"─".repeat(72)}\n${title}\n${"─".repeat(72)}`);
}

function ok(label, value) {
    console.log(`  ✔ ${label}:`, typeof value === "string" ? value : JSON.stringify(value));
}

/** 固定时钟：演示 timer 时手动推进时间，模拟宿主时钟前进。 */
class MutableClock {
    constructor(iso) {
        this.value = new Date(iso);
    }
    set(iso) {
        this.value = new Date(iso);
    }
    now() {
        return this.value;
    }
}

// ─────────────────────────────────────────────────────────────
// 1. 最小 workflow：callAction 进入 journal，rerun 不重跑
// ─────────────────────────────────────────────────────────────
section("1. Activity journal 与确定性 replay");

{
    const activities = new MemoryActivityExecutor();
    let doubleCalls = 0;
    // TS 里可以显式给输入/输出类型，不需要 as：
    //   activities.registerAction<{ value: number }, { value: number }>(
    //       "math.double@1",
    //       ({ value }) => ({ value: value * 2 }),
    //   );
    activities.registerAction("math.double@1", (input) => {
        doubleCalls += 1;
        return { value: input.value * 2 };
    });

    const definition = {
        key: "guide-first",
        version: "1",
        manifestHash: "sha256:guide-first-v1",
        run: async (workflow) => {
            const doubled = await workflow.callAction(
                "math.double@1",
                { value: 21 },
            );
            await workflow.checkpoint({ step: "doubled" });
            return doubled;
        },
    };

    const runner = new WorkflowRunner({}, {}, { activities });
    const first = await runner.start(definition, null);
    ok("首次运行结果", first.result);
    ok("math.double 执行次数", doubleCalls);

    // 模拟崩溃后恢复：同一 Backend 上重新 rerun，journal 命中缓存
    const recovered = await runner.rerun(first.runId);
    ok("rerun 恢复结果", recovered.result);
    ok("math.double 仍然只执行了 1 次（journal 命中）", doubleCalls);
    ok("journal 内容", recovered.journal.map((r) => r.kind));
}

// ─────────────────────────────────────────────────────────────
// 2. 受控非确定性：now/random 也进 journal，重放保持稳定
// ─────────────────────────────────────────────────────────────
section("2. 受控非确定性：now()/random() 重放稳定");

{
    const clock = new MutableClock("2026-08-12T00:00:00.000Z");
    const definition = {
        key: "guide-controlled",
        manifestHash: "sha256:guide-controlled-v1",
        run: async (workflow) => ({
            now: await workflow.now(),
            random: await workflow.random(),
        }),
    };
    const runner = new WorkflowRunner({}, {}, { clock });
    const first = await runner.start(definition, null);

    clock.set("2030-01-01T00:00:00.000Z"); // 换一个完全不同的时钟
    const replay = await runner.rerun(first.runId);
    ok("重放后 now 仍是首次值（不重新读时钟）", replay.result.now);
    ok("重放后 random 仍是首次值", replay.result.random);
    console.log("  ℹ workflow 代码里不要直接用 Date.now()/Math.random()。");
}

// ─────────────────────────────────────────────────────────────
// 3. map/all：稳定分支路径 + 有界并发
// ─────────────────────────────────────────────────────────────
section("3. map 并发：分支身份稳定、并发有上限");

{
    const activities = new MemoryActivityExecutor();
    let peak = 0;
    let inFlight = 0;
    activities.registerAction("guide.work@1", async (input) => {
        inFlight += 1;
        peak = Math.max(peak, inFlight);
        await new Promise((resolve) => setTimeout(resolve, 2));
        inFlight -= 1;
        return { item: input.item, worker: input.worker };
    });

    const definition = {
        key: "guide-map",
        manifestHash: "sha256:guide-map-v1",
        run: async (workflow) => await workflow.map(
            [1, 2, 3, 4, 5, 6],
            (item) => workflow.callAction("guide.work@1", {
                item,
                worker: `w${item}`,
            }),
            { concurrency: 2 },
        ),
    };
    const runner = new WorkflowRunner({}, {}, { activities });
    const view = await runner.start(definition, null);
    ok("6 个分支全部完成、顺序保持", view.result.map((r) => r.item));
    ok("并发峰值（上限 2）", peak);
    ok("分支路径（root/0:N 稳定身份）", view.journal.filter((r) => r.path.includes(":")).map((r) => r.path));
}

// ─────────────────────────────────────────────────────────────
// 4. 等待与恢复：signal 跨 Runner 唤醒
// ─────────────────────────────────────────────────────────────
section("4. 等待：Signal 从另一个 Runner 唤醒");

{
    const backend = new MemoryWorkflowBackend();
    const definitions = new MemoryDefinitionRegistry();
    const signals = new MemorySignalStore();
    const definition = {
        key: "guide-signal",
        manifestHash: "sha256:guide-signal-v1",
        run: async (workflow) => ({
            approval: await workflow.waitForSignal("approval"),
        }),
    };

    // Runner A 启动：没有 signal，run 进入 waiting 并落盘
    const first = new WorkflowRunner(
        {},
        {},
        { backend, definitions, signals },
    );
    const waiting = await first.start(definition, null);
    ok("无 signal 时状态", waiting.status);
    ok("等待引用", waiting.pendingWaits.map((w) => w.reference));

    // Runner B（模拟另一个进程）从共享 Backend 恢复并投递 signal
    const second = new WorkflowRunner(
        {},
        {},
        { backend, definitions, signals },
    );
    const completed = await second.signal(waiting.runId, "approval", {
        approved: true,
    });
    ok("signal 唤醒后状态", completed.status);
    ok("workflow 拿到的值", completed.result);
}

// ─────────────────────────────────────────────────────────────
// 5. timer：首次 dueAt 固定，replay 不滑动
// ─────────────────────────────────────────────────────────────
section("5. 等待：Timer 首次 dueAt 固定");

{
    const backend = new MemoryWorkflowBackend();
    const definitions = new MemoryDefinitionRegistry();
    const timers = new MemoryTimerStore();
    const clock = new MutableClock("2026-08-12T00:00:00.000Z");
    const definition = {
        key: "guide-timer",
        manifestHash: "sha256:guide-timer-v1",
        run: async (workflow) => {
            await workflow.sleep(1_000);
            return "awake";
        },
    };
    const runner = new WorkflowRunner(
        {},
        {},
        { backend, definitions, timers, clock },
    );
    const waiting = await runner.start(definition, null);
    ok("sleep 未到期时状态", waiting.status);
    ok("计划唤醒时间", waiting.pendingWaits[0].reference);

    // 宿主推进时钟后重新驱动（waiting 纯 wait 的 run 允许 rerun 恢复）
    clock.set("2026-08-12T00:00:00.500Z");
    const early = await runner.rerun(waiting.runId);
    ok("未到点重放后仍 waiting", early.status);
    ok("dueAt 没有滑动", early.pendingWaits[0].reference);

    clock.set("2026-08-12T00:00:01.000Z");
    const done = await runner.rerun(waiting.runId);
    ok("到点后恢复完成", done.status);
    ok("结果", done.result);
}

// ─────────────────────────────────────────────────────────────
// 6. child workflow：父等待子完成，重放绑定同一子 Run
// ─────────────────────────────────────────────────────────────
section("6. 等待：Child Workflow 绑定与结果恢复");

{
    const backend = new MemoryWorkflowBackend();
    const definitions = new MemoryDefinitionRegistry();
    const children = new MemoryChildWorkflowStore();
    const definition = {
        key: "guide-child",
        manifestHash: "sha256:guide-child-v1",
        run: async (workflow) => {
            const child = await workflow.startChildWorkflow(
                "research.deep@1",
                { topic: "DeepSeek outage" },
                { wait: true, cancelPolicy: "propagate" },
            );
            return child;
        },
    };
    const first = new WorkflowRunner(
        {},
        {},
        { backend, definitions, children },
    );
    const waiting = await first.start(definition, null);
    const child = children.list()[0];
    ok("父进入 waiting，子 Run 已创建", child.runId);

    // 宿主执行子 workflow 后把终态写回 Child Store，再驱动父
    await children.complete(child.runId, { findings: 3 });
    const second = new WorkflowRunner(
        {},
        {},
        { backend, definitions, children },
    );
    const completed = await second.rerun(waiting.runId);
    ok("子完成后面父恢复", completed.status);
    ok("父拿到的子结果", completed.result);
}

// ─────────────────────────────────────────────────────────────
// 7. 取消：waiting 取消立即终态；运行中取消阻断迟到成功
// ─────────────────────────────────────────────────────────────
section("7. 取消：waiting 与运行中");

{
    const backend = new MemoryWorkflowBackend();
    const definitions = new MemoryDefinitionRegistry();
    const runner = new WorkflowRunner(
        {},
        {},
        { backend, definitions },
    );
    const askDefinition = {
        key: "guide-cancel-waiting",
        manifestHash: "sha256:guide-cancel-waiting-v1",
        run: async (workflow) => await workflow.ask({
            kind: "approve",
            title: "继续吗？",
        }),
    };
    const waiting = await runner.start(askDefinition, null);
    const cancelled = await runner.cancel(waiting.runId);
    ok("waiting run 取消后状态", cancelled.status);
    ok("取消后不能 resume", await runner.resume(cancelled.runId, {
        [cancelled.pendingAsks[0]?.key ?? "root#0"]: true,
    }).then(
        () => "不应成功",
        (error) => error.message,
    ));

    // 运行中取消：Activity 返回值在取消后才到达，不得写入 journal
    const activities = new MemoryActivityExecutor();
    let release;
    const gate = new Promise((resolve) => {
        release = resolve;
    });
    let markStarted;
    const started = new Promise((resolve) => {
        markStarted = resolve;
    });
    activities.registerAction("guide.slow@1", async () => {
        markStarted();
        await gate;
        return { late: true };
    });
    const runningRunner = new WorkflowRunner(
        {},
        {},
        { backend: new MemoryWorkflowBackend(), definitions, activities },
    );
    const { runId, done } = runningRunner.begin({
        key: "guide-cancel-running",
        manifestHash: "sha256:guide-cancel-running-v1",
        run: async (workflow) => await workflow.callAction(
            "guide.slow@1",
            {},
        ),
    }, null);
    await started;
    await runningRunner.cancel(runId);
    release();
    const final = await done;
    ok("运行中取消的终态", final.status);
    ok("迟到成功没有写进 journal", final.journal);
}

// ─────────────────────────────────────────────────────────────
// 8. ValueStore：大值只保存内容寻址引用
// ─────────────────────────────────────────────────────────────
section("8. ValueStore：大 Activity 输出不进 journal");

{
    const activities = new MemoryActivityExecutor();
    const values = new MemoryValueStore();
    activities.registerAction("guide.large@1", () => ({
        text: "big-payload-".repeat(20),
    }));
    const definition = {
        key: "guide-value",
        manifestHash: "sha256:guide-value-v1",
        run: async (workflow) => await workflow.callAction(
            "guide.large@1",
            {},
        ),
    };
    const runner = new WorkflowRunner(
        {},
        {},
        {
            activities,
            values,
            inlineValueLimitBytes: 32, // 超过 32 字节就走 ValueStore
        },
    );
    const view = await runner.start(definition, null);
    ok("大输出完整返回", view.result.text.length);
    ok("journal 里只存 ref", view.journal[0].result);
}

// ─────────────────────────────────────────────────────────────
// 9. Agent Extension：会话、调用与 ephemeral 归档
// ─────────────────────────────────────────────────────────────
section("9. Agent Extension（可选）：会话与调用");

{
    const sessions = new MemorySessionStore();
    const agents = new MockAgentPort(sessions);
    agents.register(
        "analyst",
        ({ input }) => ({
            message: "分析完成",
            data: { summary: input.text.length },
        }),
    );
    const runner = new WorkflowRunner(
        { sessions, agents },
        {},
        {},
    );
    const definition = {
        key: "guide-agent",
        manifestHash: "sha256:guide-agent-v1",
        run: async (workflow) => {
            const analyst = await workflow.agents.create(
                "analyst",
                { ephemeral: true },
            );
            const reply = await analyst.invoke({
                input: { text: "今天 DeepSeek 有新版本" },
            });
            return reply.result.data;
        },
    };
    const view = await runner.start(definition, null);
    ok("agent 调用返回", view.result);
    ok("ephemeral 会话已归档", (await sessions.meta(1)).archived);
}

// ─────────────────────────────────────────────────────────────
// 10. 错误语义与能力协商
// ─────────────────────────────────────────────────────────────
section("10. 错误语义与能力协商");

{
    // Backend 持久化失败 → WorkflowPersistenceError，不伪装业务 failed
    class BrokenBackend extends MemoryWorkflowBackend {
        async saveRun() {
            throw new Error("磁盘故障");
        }
    }
    const runner = new WorkflowRunner(
        {},
        {},
        { backend: new BrokenBackend() },
    );
    const failure = await runner.start({
        key: "guide-error",
        manifestHash: "sha256:guide-error-v1",
        run: async () => "业务成功",
    }, null).then(
        () => "不应成功",
        (error) => `${error.name}: ${error.message}`,
    );
    ok("Backend 失败以基础设施错误拒绝", failure);

    // 能力协商：requires 声明的能力不足时，脚本执行前就拒绝
    const strictRunner = new WorkflowRunner({}, {}, {});
    const capabilityError = (() => {
        try {
            strictRunner.begin({
                key: "guide-requires",
                manifestHash: "sha256:guide-requires-v1",
                requires: { durableSignals: true },
                run: async () => null,
            }, null);
            return "不应成功";
        } catch (error) {
            return error instanceof WorkflowBackendCapabilityError
                ? `WorkflowBackendCapabilityError: ${error.message}`
                : String(error);
        }
    })();
    ok("能力不足在 begin 时拒绝", capabilityError);
}

// ─────────────────────────────────────────────────────────────
// 11. 可视化：六种视角
// ─────────────────────────────────────────────────────────────
section("11. 可视化：六种视角");

{
    const activities = new MemoryActivityExecutor();
    activities.registerAction("viz.work@1", (input) => input);
    const definition = {
        key: "guide-viz",
        phases: [
            { key: "fetch", title: "拉取" },
            { key: "analyze", title: "分析" },
        ],
        manifestHash: "sha256:guide-viz-v1",
        run: async (workflow) => {
            workflow.progress({ phase: "fetch" });
            await workflow.callAction("viz.work@1", { step: "fetch" });
            workflow.chart.node("analysis", "分析");
            workflow.chart.move("root", "analysis", {
                token: "main",
            });
            await workflow.map([1, 2], (item) => workflow.callAction(
                "viz.work@1",
                { item },
            ));
            workflow.log("完成");
            workflow.progress({ phase: "analyze", done: 1, total: 1 });
            return null;
        },
    };
    const runner = new WorkflowRunner({}, {}, { activities });
    const view = await runner.start(definition, null);

    console.log("  ① 声明骨架（运行前，来自 definition.phases）:");
    console.log(skeletonMermaid(definition).split("\n").map((line) => `     ${line}`).join("\n"));
    console.log("  ② AST 静态 CFG（运行前，扫描脚本源码）:");
    console.log(extractCfg(definition.run.toString()).mermaid.split("\n").slice(0, 5).map((line) => `     ${line}`).join("\n"));
    console.log("  ℹ ③ journal 精确 trace（运行后，含分支派生/汇合边）:");
    const trace = traceGraph(view.journal);
    console.log("     节点:", trace.nodes.map((n) => `${n.kind}@${n.key}`).join(" "));
    console.log("     边:", trace.edges.map(([a, b]) => `${a}→${b}`).join(" "));
    console.log("  ④ wf.chart 运行时状态图事件（token=main 的 move）: 已发出（见上方 chart.move）");
    console.log("  ⑤ 进度/日志视图:", JSON.stringify({ progress: view.progress, logs: view.logs }));
    console.log("  ⑥ 交互播放器: bun run demo 生成 demo/index.html（含 ask 暂停点与失效重放帧）");
}

console.log(`\n${"─".repeat(72)}\n演示完成：11 个特性全部走通 ✅\n${"─".repeat(72)}`);
