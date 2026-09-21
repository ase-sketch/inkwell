# 第三十八轮：bounded Commit Workflow Scheduler shutdown

## 规划结论

三条只读规划线得到：

- standalone `CommitWorkflowScheduler.dispose()` 会等待 `run()` / `onError()` 的 raw Promise；handler 忽略 signal 时无生命周期上界；
- NeuroBook 最新 Harness 变化仍集中在 relation recovery、durable Job history 和产品 SSE shutdown；这些不应搬入 Core Scheduler。较早的 summarizer/background-task 证据只证明宿主需要统一登记和 drain，不证明 raw handler 必须被 Core 永久等待；
- Cosmos 明确由自己持有 Workflow/Run/Step/Job、Lease、retry、Outbox、budget 和外部副作用；Phase 1 继续使用 `pi-ai`。当前没有新文档要求 Harness 下沉这些 durable truth。

两个独立只读规划器分别审查 API 和并发生命周期，均建议保留 `drain()` 的显式等待语义，为 `dispose()` 增加 Scheduler-owned forced completion boundary；同时必须处理 pending dirty job、`onError()`、迟到 rejection、reentrant `select()` 和重复 dispose，不能只做表面 `Promise.race`。

## Public red

探针只使用公开构造器、`afterCommit()` 和 `dispose()`：

```text
run() 注册 abort listener 后永不 settle
afterCommit() 启动该 job
dispose() 与 100ms timer 竞争
```

结果：

```json
{"result":"timeout","observedAbort":true}
```

signal 已送达，Scheduler 仍永久等待 `states[*].running`。根因位于 `dispose() -> drain() -> runState()` 的 completion ownership，不是 Store、Harness Invocation 或 Transport。

## Planned contract

详见 [ADR-0021](../../../adr/0021-bounded-commit-workflow-scheduler-shutdown.md)。

- 可选 `abortGraceMs`，默认 150ms；
- dispose 同步关闭 admission、abort 并清 pending dirty rerun；
- grace 内等待合作式 `run` / `onError`；
- 到期后让 Scheduler-owned `runState` detach，继续观察 raw rejection但不再调用迟到 hook/rerun；
- repeated dispose 共用 Promise；
- `afterCommit()` 在 `select()` 前后检查关闭，覆盖 reentrant dispose；
- 不实现 run timeout、Job/Lease、durable cancellation 或产品 shutdown。

## TDD order

1. 非合作 `run()` red，冻结 bounded dispose 与 abort signal；
2. option validation、zero grace 和合作式 settle；
3. dirty pending drop 与 dispose 后 admission；
4. 不合作 `onError()`；
5. late resolve/reject、无迟到 rerun/onError 和无 unhandled rejection；
6. reentrant select、concurrent/repeated dispose；
7. 既有 coalescing → focused → full/package → 独立审查。

## 当前状态

ADR-0021 为 `Proposed`。正式 public red 为 1 pass / 1 fail / 4 assertions，唯一失败是 dispose 300ms timeout。

## Red → green

- 构造器增加可选 `CommitWorkflowSchedulerOptions.abortGraceMs`，默认 150ms，接受 0 并拒绝负数/非有限值；
- dispose 缓存单一 Promise，同步 abort admission、清 pending dirty rerun，并在 grace 到期后触发 Scheduler-owned forced boundary；
- `run()` / `onError()` 的等待都可被 forced boundary detach；raw Promise 的迟到 rejection 仍被观察，不再启动 rerun或调用迟到 `onError()`；
- `afterCommit()` 在 `select()` 前后复核 abort，覆盖 reentrant dispose；
- 首轮 9/0/20 green 后，主线审查发现共享永不 resolve Promise 会为每个正常 job 永久保留 reaction 的 P1；改为正常 settle 可移除的 forced-completion `AbortSignal` listener；
- 第一次独立 review 发现 `disposePromise ??= disposeOnce()` 的同步重入 P1：RHS 在缓存赋值前 abort，handler listener 可重入并取得第二个 Promise。public red 为 9/1/21；改为先安装 deferred cache、再启动 `disposeOnce()` 后为 10/0/21；
- package smoke 增加 `CommitWorkflowScheduler` 与 options type 的 Bun/Node 根导出、构造和 dispose consumer。

新增 public 行为覆盖：

1. option validation 与 zero grace；
2. 不合作 `run()` bounded dispose；
3. 合作式 run 与 repeated dispose Promise identity；
4. dirty pending drop 与迟到 resolve；
5. 迟到 run rejection 不触发 `onError`；
6. 不合作/迟到 rejection 的 `onError`；
7. 正常 error → `onError` → drain；
8. dispose 后不 select，以及 reentrant select/dispose；
9. 既有 same-key dirty rerun。

## 当前验证

```text
bun run typecheck
exit 0

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

`git diff --check` 只有 Windows working tree 的 LF → CRLF 提示。Package prepack 同为 220/0/1033；Bun/Node tarball consumer 均验证公开 options 和 dispose。

## Review 与收尾

- 第一次独立 pre-acceptance review 的唯一 P0/P1/P2 finding 是 abort-listener 重入 dispose Promise identity P1；
- 修复后重新完成 Scheduler、扩大 focused、full 和 package；
- post-fix 独立只读审查返回 `No P0/P1/P2 findings.`；
- raw handler 的真实资源终止、run timeout、durable cancellation、真实 NeuroBook/Cosmos consumer、Transport、浏览器和产品验收仍未执行，也不由本 ADR 承诺。

ADR-0021 已在 standalone Scheduler lifecycle 范围接受。三处既有 dirty 文件继续受保护，本轮未修改 NeuroBook 或 Cosmos。
