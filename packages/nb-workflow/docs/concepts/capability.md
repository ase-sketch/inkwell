# 能力协商

能力协商是启动前的检查：workflow 声明自己需要什么能力，宿主实际能提供
什么，对不上就拒绝。

## 为什么需要

一个 workflow 可能依赖持久信号。如果宿主没配 SignalStore，跑到一半才
报错，浪费时间也难排查。能力协商把这类错误提前到启动。

## 声明方式

workflow 定义里写 `requires`：

```ts
const definition = {
    key: "needs-signals",
    manifestHash: "sha256:needs-signals-v1",
    requires: { durableSignals: true },
    run: async (workflow) => {
        return await workflow.waitForSignal("approval");
    },
};
```

## 检查方式

Backend 声明自己有什么能力，比如：

```ts
const backend = new MemoryWorkflowBackend();
backend.capabilities.durableSignals;  // false
```

Runner 把 Backend 声明和实际注入的 Port 取交集。Backend 说支持持久信号，
但没注入 SignalStore，同样算能力不足。

能力不足时 `begin()` 直接抛 `WorkflowBackendCapabilityError`，workflow
代码不会执行。

## 能力清单

```text
durability         memory / durable / distributed
processRestart     进程崩溃后能否接管
concurrentExecution 同进程并发
multiWorker        多 Worker
leases             租约
durableSignals     持久信号
durableTimers      持久定时器
childWorkflows     子任务
externalReceipts   外部执行回执
outbox             事件外发
valueReferences    大值引用
```

控制操作（resume、rerun、signal、cancel）从账本恢复 run 时也会复查能力，
宿主配置漂移会被及时发现。

## 相关

- [Backend](/concepts/backend)
- [Port 与宿主](/concepts/ports)
