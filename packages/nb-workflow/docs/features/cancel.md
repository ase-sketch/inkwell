# 取消

取消一个 run，让它进入 `cancelled` 终态。

```ts
await runner.cancel(runId);
```

## 两种状态

等待中的 run（waiting）取消后立即变成 cancelled，未回答的问题作废，
不能 resume 也不能 rerun。

运行中的 run 取消后，当前 Activity 收到中止信号。Activity 返回时引擎
检查取消标记，迟到的结果不会写进账本。

## 外部信号

启动时传一个 AbortSignal，外部中止也会触发取消：

```ts
const controller = new AbortController();
const { runId } = runner.begin(definition, null, {
    signal: controller.signal,
});
controller.abort();
```

外部中止触发的取消如果持久化失败，会通过 `control_error` 观测事件报告，
不会产生未处理的 Promise 拒绝。

## 取消的边界

- 取消请求本身会先落盘，再等 Activity 收尾。
- cancelled 事件在持久化成功后才发出。
- 取消失败（Backend 写不进去）以 `WorkflowPersistenceError` 拒绝，不伪装
  成业务失败。
- 父 run 取消时，propagate 的子 workflow 一起取消。

## 相关

- [等待与恢复](/features/waits)
- [概念：重放](/concepts/replay)
