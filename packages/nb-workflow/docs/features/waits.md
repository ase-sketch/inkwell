# 等待与恢复

workflow 可以挂起，等外部条件满足后再继续。挂起时 run 落盘为 `waiting`
状态，进程可以退出。

## Signal

```ts
// workflow 里
const approval = await workflow.waitForSignal("briefing-approved");
```

```ts
// 另一个 Runner，从共享 Backend 恢复后投递
await runner.signal(runId, "briefing-approved", { ok: true });
```

Signal 消费绑定 Activity 身份。同一个 signal 重放不会被重复消费，重复
投递同一条 signal 幂等。

## Timer

```ts
await workflow.sleep(5_000);
```

首次调用时算出到期时间并记入账本。重放不会重新计时，到期时间保持不变。
宿主在到点后重新驱动 run。

## Child Workflow

```ts
const child = await workflow.startChildWorkflow(
    "research.deep@1",
    { topic: "outage" },
    { wait: true, cancelPolicy: "propagate" },
);
```

父的等待绑定一个子 Run。重放时同一个 Activity 永远对应同一个子 Run。
子 Run 由宿主执行，完成后把终态写回 ChildWorkflowStore，父再恢复。

`cancelPolicy: "propagate"` 表示父取消时子也取消。取消发生在子启动
过程中，引擎会补一次取消，不留孤儿。

## 恢复入口

```text
signal   -> runner.signal(runId, reference, value)
timer    -> 宿主到点后 runner.rerun(runId)
child    -> 子完成后 runner.rerun(runId)
ask      -> runner.resume(runId, answers)
```

`rerun` 允许恢复没有未回答问题（pendingAsks）的 waiting run。带着未回答
问题的 waiting run 会拒绝 rerun，防止丢掉用户还没答的问题。

## 相关

- [取消](/features/cancel)
- [概念：重放](/concepts/replay)
