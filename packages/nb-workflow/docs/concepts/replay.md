# 重放与恢复

重放是引擎的核心能力：进程崩溃后，按账本把 workflow 重新跑一遍，已经
完成的 Activity 不重复执行。

## 场景

workflow 跑完了三步中的两步，进程崩溃。重启后：

```text
root#0  fetch RSS（账本有，读旧结果）
root#1  fetch 动态（账本有，读旧结果）
root#2  汇总并发送（账本没有，真的执行）
```

前两步不会重新请求外部接口，只有没做完的第三步执行。

## 触发方式

`WorkflowRunner` 提供四个控制入口：

```ts
await runner.rerun(runId);    // 重放失败的或已完成的 run
await runner.resume(runId, answers);  // 回答挂起的问题后继续
await runner.signal(runId, "name", value);  // 投递等待的信号
await runner.cancel(runId);   // 取消
```

`rerun` 只允许 `failed`、`completed`，以及没有未回答问题的 `waiting`。
运行中的 run 除非 Backend 声明支持进程重启，否则拒绝重放。这是为了防止
两个执行者同时跑同一个 run。

## 重放的两个前提

第一，账本要存在持久的地方，也就是 [Backend](/concepts/backend)。
第二，workflow 代码要确定。同一份账本重放两次，走的路必须一样。

为此引擎提供受控的时钟和随机数：

```ts
const now = await workflow.now();      // 记账，重放时返回旧值
const pick = await workflow.random();  // 记账，重放时返回旧值
```

workflow 代码里不要直接调 `Date.now()` 或 `Math.random()`，它们不记账，
重放会走出不同的路。

## 重放和"重新执行"的区别

重放不重新执行已完成的外部副作用。失败重试则相反：Activity 抛错不会进
账本，重跑时会真的再执行一次。所以宿主在实现 Activity 时要按幂等键
保证外部副作用可以安全重试。

## 相关

- [journal 与 fingerprint](/concepts/journal)
- [Backend](/concepts/backend)
