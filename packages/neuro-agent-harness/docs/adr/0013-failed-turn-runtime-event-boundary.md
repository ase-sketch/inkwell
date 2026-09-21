# ADR-0013: Failed Turn Runtime Event Boundary

- Status: Accepted (standalone Core scope)
- Date: 2026-08-10
- Task: [`01-harness-decoupling`](../tasks/01-harness-decoupling/README.md)

## Context

`HarnessRuntimeEvent` 已公开以下 turn boundary：

```ts
type HarnessRuntimeEvent =
    | {type: "turn_start"; turn: number}
    | {type: "turn_end"; turn: number; status: "completed" | "failed"};
```

（第九十二轮补充：`turn_end.status` 现含 `"waiting"`——进入 approval
waiting 的 turn 以 `turn_end(turn, "waiting")` 闭合，resume 后从下一 turn
继续；`completed` / `failed` 语义不变。）

但当前 Run Kernel 只发布 `turn_end(completed)`。Model、Compactor、ContextProvider、before/afterTurn Hook、transcript commit 或 Tool error 上限在 `turn_start` 后抛错时，消费者直接收到 `agent_end(failed)`，已开始的 turn 没有闭合事件。

Public red 已复现：

```text
actual:   turn_start:1 → agent_end:failed
expected: turn_start:1 → turn_end:1:failed → agent_end:failed
```

这不是 HTTP/SSE 实现问题；Transport 只能投影 Core 实际发布的事件。

## Decision

Run Kernel 显式跟踪当前 open turn，并遵守以下顺序：

- `turn_start(n)` 发布后，该 turn 进入 open；
- 正常、Tool 完成或 waiting 边界发布 `turn_end(n, completed)` 后清除 open；
- active attempt 在 open turn 内失败时，catch 在运行 failure settlement 前发布一次 `turn_end(n, failed)` 并清除 open；
- Profile prepare、Capability open、prepareWrites 或 prepareRun Hook 在首个 `turn_start` 前失败时不伪造 `turn_end`；
- 已发布 `turn_end(completed)` 后，`settleRun`、output parser 或 terminal commit 失败不重写该 turn，也不发布第二个 `turn_end`；
- abort 或 ownership loss 已使 attempt invalidated 时，现有 runtime event fence 继续丢弃普通 failed boundary；forced abort 仍只保证 durable Invocation terminal 与唯一 `agent_end(aborted)`。

`turn_end` 是 runtime boundary，不是 durable commit 证明。Snapshot、Session events 与 Invocation terminal record 仍是恢复真相源。

## Ordering rationale

Failed boundary 在 `settleFailure` 前发布：

- turn 已经失败，不能因 settlement Hook 卡住而长期保持 open；
- `settleFailure` 属于 Invocation 收尾，不属于失败 turn 本身；
- terminal `agent_end` 仍只在 durable terminal 已确认后发布；
- 如果 durable terminal 无法写入，消费者看到 failed turn 但不会看到伪造的 terminal Agent event。

## Deliberate boundary

本 ADR 不定义：

- partial assistant persistence、provider `stopReason`、message status 或错误正文；
- provider timeout/retry、usage/cost/quota 或 Pi-specific stream；
- abort 后补发普通 turn event；
- HTTP/SSE DTO、重连策略或跨进程 EventHub；
- Job、Lease、Outbox、sidecar 或 Cosmos durable runtime。

NeuroBook Task 07/139 的 partial ingest、UI error projection 和 Pi stream catch 继续是宿主对照，不直接进入本决定。

## Verification and acceptance gate

- Model throw：`turn_start → turn_end(failed) → agent_end(failed)`；
- prepare-before-turn failure：没有 `turn_end`；
- settle-after-completed failure：只有既有 `turn_end(completed)`；
- 至少覆盖一个非 Model 的 in-turn failure；
- failed terminal Store commit 未确认时可以保留 runtime `turn_end(failed)`，但不得伪造 `agent_end`；
- abort/ownership focused tests 不出现迟到普通 runtime event；
- `bun run verify`、`git diff --check`；
- 无公共类型或 package 内容变化时不要求重复 `pack:smoke`；
- 独立审查确认没有把 runtime boundary 误报成 durable 或 Transport 保证。

## 2026-08-10 implementation and acceptance

- 第一条 public red 精确得到 `turn_start:1 → agent_end:failed`，证明公开 `"failed"` variant 从未由 Run Kernel 发布；prepare-before-turn 与 settle-after-completed 两个边界同时保持绿灯。
- `run()` 只增加一个 invocation-local `openTurn`：`turn_start` 后设置，三个 completed/waiting 出口清除；catch 在 failure settlement 前发布一次 failed boundary，再清除。
- beforeTurn Hook 失败证明非 Model 路径使用相同边界；既有 abort/ownership tests 证明 invalidated attempt 不会补发迟到普通 runtime event。
- 第一次独立审查发现既有 P1：failure terminal Store commit 未确认时，`durableTerminal` 被误传为 `allowInvalidated`，导致可能伪造 `agent_end(failed)`。新增 `FailingTerminalStore` red 后，terminal publish 改为显式受 `durableTerminal` gate；Snapshot 保持 running，交给 restart reconcile。
- Focused：`tests/turn-failure-events.test.ts` 为 5 pass / 0 fail / 13 expect calls；abort/ownership/events/persistence 相关套件为 33 pass / 0 fail / 118 expect calls。
- 全仓：`bun run verify` 为 133 pass / 0 fail / 664 expect calls，覆盖 33 个测试文件；`git diff --check` 通过。
- 没有公共类型、导出或 package 内容变化，因此未重复 `pack:smoke`。
- Post-fix 独立审查未发现 P0/P1。`allowInvalidated=true` 仍是内部调用点纪律，但本轮所有 completed/failure/forced terminal 调用均在 durable terminal 已确认后执行。

因此本 ADR 在 standalone Core runtime event 范围接受。真实 HTTP/SSE、跨进程 EventHub、真实 provider、partial assistant、NeuroBook/Cosmos 产品接入、浏览器和发布验收仍未验证。
