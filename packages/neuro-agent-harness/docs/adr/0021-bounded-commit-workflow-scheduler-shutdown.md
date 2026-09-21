# ADR-0021: Bounded Commit Workflow Scheduler Shutdown

- Status: Accepted (standalone Scheduler lifecycle scope)
- Date: 2026-08-11
- Task: [`01-harness-decoupling`](../tasks/01-harness-decoupling/README.md)

## Context

`CommitWorkflowScheduler` 是 commit observer 后的进程内、best-effort Workflow 调度器。它按 key 合并 dirty rerun，并把 `AbortSignal` 交给 `run()`；它不是 durable Job、Lease 或 Workflow journal。

当前 `dispose()` 先 abort，再调用无界 `drain()`。如果 `run()` 或 `onError()` 忽略取消且永不 settle，Scheduler 生命周期永久悬挂。公开探针在隔离 Scheduler 上得到：

```json
{"result":"timeout","observedAbort":true}
```

这不是 signal 传递失败，而是 Scheduler 把宿主 raw handler 的真实结束误当成自身 shutdown completion。Harness 的 ADR-0008 已为 Invocation 建立 bounded completion，但该合同不会自动覆盖独立 `CommitWorkflowScheduler`。

## Decision

计划在 standalone Scheduler 范围建立 bounded shutdown：

- 构造器增加可选 `CommitWorkflowSchedulerOptions`；`abortGraceMs` 默认 150ms，接受 0，拒绝负数与非有限值；
- 第一次 `dispose()` 同步关闭 admission、abort controller，并丢弃尚未执行的 pending/dirty rerun；
- 合作式 `run()` / `onError()` 在 grace 内继续按现有错误出口收敛；
- grace 到期后触发一次 Scheduler-owned forced completion boundary；`runState` 不再等待 raw handler、不会启动 dirty rerun或调用迟到 `onError()`；
- raw Promise 的迟到 resolve/reject 继续被观察，不能产生 unhandled rejection；Scheduler 不声称能终止 handler 自己持有的网络、进程或其它资源；
- 重复/并发 `dispose()` 返回同一个 Promise；dispose 后 `afterCommit()` 在 `select()` 前后都复核关闭状态，不能通过 reentrant select 重新入队；
- `drain()` 保留“等待 Scheduler-owned queued/running state 收敛”的语义：单独调用且没有 dispose 时仍可等待不合作 handler；与 dispose 并发时最多等到 forced completion boundary。

该边界不改变同 key coalescing、非阻塞 commit observer、`run`/`onError` 错误不反向破坏 Store commit 的现有语义。

## Implementation evidence

- `dispose()` 改为缓存单一 Promise；第一次调用同步 abort admission，并清空每个 state 的 pending dirty job；
- `run()` 与 `onError()` 都通过同一个 forced-completion `AbortSignal` 等待；grace 到期后 `runState` detach 并删除 Scheduler state；
- 正常 operation settle 时立即移除 forced-boundary listener，避免一个永不 resolve 的共享 Promise 为每个历史 job 永久保留 reaction；
- detach 后仍保留 raw Promise 的 fulfilled/rejected observer，但 outcome 已线性化，迟到 rejection 不进入 `onError()`；
- `afterCommit()` 在 `select()` 前后检查 abort，覆盖 `select()` 内 reentrant dispose；
- package smoke 已增加根导出的 `CommitWorkflowSchedulerOptions` 与构造/dispose consumer。

正式 public red：

```text
bun test tests/workflow-scheduler.test.ts
1 pass
1 fail
4 assertions

failure: bounded scheduler dispose 未在 300ms 内完成
```

首轮 green 后的内部审查发现 1 个 P1：最初用永不 resolve 的共享 Promise 表示 forced boundary，每个正常 job 都会留下无法注销的 `.then` reaction。实现改为可移除的 `AbortSignal` listener。

第一次独立 pre-acceptance review 随后发现第二个 P1：`disposePromise ??= disposeOnce()` 会先执行 RHS，`controller.abort()` 同步触发 handler listener 时可重入 `dispose()`，得到不同的 Promise。公开回归先得到 9 pass / 1 fail / 21 assertions；修复在触发任何 abort 副作用前安装 deferred cached Promise，重入调用只能返回该对象。最终证据：

```text
bun test tests/workflow-scheduler.test.ts
10 pass
0 fail
21 assertions

bun test tests/workflow-scheduler.test.ts tests/commit-observer.test.ts tests/workflow-extension.test.ts tests/workflow-result-writeback.test.ts tests/abort-boundary.test.ts
29 pass
0 fail
104 assertions

bun run verify
220 pass
0 fail
1033 assertions

bun run pack:smoke
exit 0
101 files
102.0 kB package / 494.6 kB unpacked

git diff --check
exit 0
```

Package smoke 的 prepack 同为 220/0/1033；tarball 安装后的 Bun 与 Node ESM consumer 均导入 `CommitWorkflowSchedulerOptions`、构造 Scheduler 并调用 `dispose()`。Post-fix 独立只读审查返回 `No P0/P1/P2 findings.`。

本决定在 standalone Scheduler lifecycle 范围接受。forced boundary 只收口 Scheduler 自己的 admission、pending/running state 与 error hook 等待；handler 自己持有的网络、进程、Provider request 和外部副作用仍由宿主负责终止或 fencing。

## Alternatives

- **继续永久等待 raw handler**：拒绝。公开 red 已证明进程关闭可以永久悬挂。
- **grace 到期让 `dispose()` reject**：拒绝。Scheduler 已完成自己可控的 admission/queue/observer 收口；把宿主不合作依赖改成 dispose 异常会破坏现有 `Promise<void>` 使用方式。
- **给每个 Workflow run 增加执行 timeout**：拒绝。执行预算属于 Workflow/宿主策略，不是 Scheduler shutdown grace。
- **让 `drain()` 也默认有界**：拒绝。显式 drain 用于等待正常 dirty rerun；停止与排空是不同操作。
- **引入 Job、Lease、checkpoint 或 durable cancellation**：拒绝。Cosmos/NeuroBook 的 durable Workflow truth 继续属于宿主。

## Verification gate

- 默认/显式 `abortGraceMs` 合同与非法值校验；
- 不合作 `run()` 观察到 abort，`dispose()` 在 grace 后有界完成；
- 不合作 `onError()` 也不能让 dispose 无界；
- dispose 丢弃 pending dirty rerun，关闭后 commit 不再调用 `select()`；
- `select()` 内 reentrant dispose 不能在关闭后留下 state；
- grace 内合作式完成仍被等待，正常错误仍调用一次 `onError()`；
- forced boundary 后 raw handler 的迟到 resolve/reject 不触发 rerun、迟到 `onError` 或 unhandled rejection；
- 重复/并发 dispose 共享同一 Promise，timer 在正常/forced 路径均释放；
- 既有 coalescing/drain 行为保持通过；
- focused、`bun run verify`、`bun run pack:smoke`、`git diff --check` 与独立审查。

## Out of scope

- 杀死或 fence handler 自己创建的进程、socket、Provider request 或外部副作用；
- run timeout、retry、backoff、priority、budget、Job、Lease、Outbox、delivery 或 exactly-once；
- durable Workflow resume、跨进程 Scheduler、HTTP/SSE 或产品 shutdown；
- 修改 NeuroBook、Cosmos 或其持久化合同。

本 ADR 不改变 Cosmos/NeuroBook 的 durable Workflow truth 边界。
