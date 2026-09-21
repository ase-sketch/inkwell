# ADR-0034: Store Commit Cancellation Fence

- Status: Accepted (standalone Core, first-party Memory/JSONL final-write scope)
- Date: 2026-08-11

## Context

ADR-0007 的 attempt fence 会在外部 await 前后保护迟到结果，但 `SessionStore.commit()` 自己可能在 reducer 通过后继续等待文件锁、尾部修复或数据库 I/O。若 Invocation 在这个窗口内 abort，单纯写入 durable `status: "aborting"` 不能撤回已经进入 Store 的计划；同一 Session lock 还可能让 abort marker 排在迟到计划之后。

这会让 `agent.compaction` 或其它 Invocation-owned plan 在 Invocation 最终为 `aborted` 后仍落盘，破坏 Snapshot/Transcript 恢复真相。

## Decision

### Runtime-only Store commit signal

`SessionStore.commit()` 增加可选的非持久化参数：

```ts
commit(
    plan: SessionWritePlan<TSessionId, THostContext>,
    options?: {readonly signal?: AbortSignal},
): Promise<SessionCommitResult<TSessionId, THostContext>>;
```

Harness 为已经注册 active Invocation 的 Invocation-owned commit 传递该 attempt 的 `AbortSignal`。abort terminal commit 明确不受该 signal 拒绝，因为它负责收口 Invocation。signal 不进入 `SessionWritePlan`、Snapshot、JSONL record 或 Event DTO。

Store Adapter 必须在自己的串行/事务边界中，在最终 durable write 开始前检查 signal；first-party Memory Store 在取得 Session lock 后检查，JSONL Store 在 reducer 后、尾部修复/append 前再次检查。append 已经开始后不承诺可撤回。

Core 提供 `SessionCommitAbortedError` 与 `assertSessionCommitNotAborted()`，方便自定义 Adapter 复用同一 taxonomy。

### Durable abort overlay and recovery

active Invocation 的 abort 请求先提交 `setStatus: "aborting"`。Reducer 在该 overlay 下只允许显式 `setStatus` transition 或当前 owner 的精确 `finishInvocation(status: "aborted")` terminal plan；普通迟到 Invocation-owned plan fail closed。

如果进程在 `aborting` 已持久化、terminal 尚未持久化时重启，`reconcileInterrupted()` 将该 active owner 收口为 `aborted`，而不是 `interrupted`。正常 `running` owner 仍按 ADR-0007 恢复为 `interrupted`。

## Consequences

- Compaction、transcript、Tool effect 和其它 active Invocation commit 在 Store 最终写边界前可响应 abort，不再依赖 abort marker 抢先取得 Session lock。
- `InvocationHandle.abort(): void`、durable terminal shape、Snapshot shape、entry namespace 和 public HTTP/SSE 边界不变。
- Custom Store Adapter 需要实现可选 signal 检查；忽略 signal 的 Adapter 仍可运行，但 Harness 不能为其宣称“最终写边界前的迟到写入绝不落盘”。
- Store commit cancellation 只保护 Harness 可观察的 runtime cancel；它不强杀外部 provider/tool，不撤销已经发生的宿主副作用，也不替代 Cosmos 的 Job/Lease/Receipt/Outbox 语义。
- Invocation start admission 仍遵循 ADR-0017：start commit 前的 request signal 不传入 Store；start 成功后复用现有 bounded abort pipeline。

## Evidence and acceptance

第六十二轮 post-fix review 已完成。证据：

- reducer 已通过、Session commit lock 保持、durable append 前 abort 的确定性 public regression；
- Memory/JSONL/custom Store contract 的 signal 行为与 aborted recovery；
- focused `80 pass / 0 fail / 381 assertions`；Store contract + recovery + race `42 pass / 0 fail / 253 assertions`；
- `bun run verify` `345 pass / 0 fail / 1490 assertions`，包含 typecheck/build；`bun run pack:smoke` prepack 同为 `345 / 0 / 1490`，113 files，package `124.6 kB` / unpacked `591.5 kB`，Bun/Node ESM consumers 通过；
- Production review 发现的 reducer-after-append abort race 与 `aborting` restart deadlock 已分别由 Store final-boundary signal 和 aborting→aborted recovery 修复；API/domain、Task contract 与 test-sensitivity post-fix review 未发现本 ADR 范围内新的 P0/P1；
- 真实第三方 Store、provider、NeuroBook/Cosmos、Transport/Product 验收仍不由本 ADR 推导为已完成。
