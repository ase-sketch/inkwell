# ADR-0003: Provider-Neutral Context Sections

- Status: Accepted
- Date: 2026-08-08
- Task: [`01-harness-decoupling`](../tasks/01-harness-decoupling/README.md)

## Context

NeuroBook 的 TSX Profile 将一次模型请求拆成稳定的上下文分区：`HistorySet`、`ModelContext` 和 `AppendingSet`。其中后两者可以在每个 turn 根据宿主状态重建；这部分能力值得复用，但 JSX、文件导入、Reminder/Watch 状态和产品运行时不应进入独立 Harness Core。

独立 Harness 当前同时存在 durable Session transcript 和 Profile/Hook 返回的扁平 runtime `messages`，消费者无法表达“历史前置、当前 Session transcript、动态上下文、每轮追加”的顺序合同。

## Decision

新增 provider-neutral 的 `ContextMessageSections`：

- `history`：放在 durable Session transcript 之前；
- durable Session transcript：仍由 Session Snapshot 投影，不能被 Profile 替换；
- `modelContext`：放在 durable transcript 之后；
- `appending`：放在 `modelContext` 之后；
- 既有扁平 `PreparedRun.messages` 和 `RuntimeEffect.runtimeMessages` 保持原有位置和兼容语义。

Profile prepare 可以提供静态 sections，runtime hook 可以提供每轮 sections；同一来源的各 section 按声明顺序追加。该 ADR 不引入 JSX、路径读取、Reminder/Watch、Job、Lease、Transport 或新的持久化事实。

## Lifecycle boundary

- `PreparedRun.context` 是一次 `run()` 重建得到的静态基线，位于每个 turn 的 durable transcript 周围；
- `profile.prepare()` 在每次 Invocation run attempt 中执行一次，包含 approval `resume()`；它收到的是本次 attempt 开始时读取的 Snapshot，返回的 `PreparedRun.context/messages` 只属于本次 attempt，不从上一次 run 持久化恢复；
- `prepareRun` hook 只在 Invocation 首次准备阶段运行；approval resume 不重放该 hook，避免重复执行其潜在的 write effect；
- approval resume 会先用 waiting Snapshot 重建 `PreparedRun`，再提交 approval resolution 的 durable tool result；因此 `ContextProvider` 在该次 resume 的 model turn 中看到的是 resolution commit 之后的最新 Snapshot，而不是 `profile.prepare()` 看到的 waiting Snapshot；
- `beforeTurn.context` 每个 turn 重新计算，包含 approval resume 后的下一 turn；
- waiting approval 的路径在 `afterTurn` 之前返回；`afterTurn` 只在 Tool call turn 已完成且没有新的 pending approval 时运行，其 context 只作为下一 turn 的基线，不回写 Session，也不会跨 Invocation 持久化；
- 扁平 `PreparedRun.messages` 和 `prepareRun.runtimeMessages` 仍属于首次准备阶段；`beforeTurn.runtimeMessages` 属于当前 turn，`afterTurn.runtimeMessages` 进入下一 turn。resume 不承诺重放已完成阶段的 runtime message。

这组 resume 语义只承诺可重建的输入边界，不承诺恢复上一次 `profile.prepare()` 或 hook 的内存对象；若未来需要 approval 跨进程恢复同一份 prepare-time context，应单独提出可重建的 Context Provider 或持久化事实，不通过重复执行任意 `prepareRun` effect 解决。

## Alternatives

- **继续使用扁平 `messages`**：拒绝；无法表达 TSX context 的稳定分区顺序。
- **直接移植 NeuroBook TSX DSL**：拒绝；会把 JSX 编译、文件导入和产品状态带入 Core。
- **把 sections 持久化到 Session**：暂缓；当前只需要请求组装合同，Session transcript 仍是唯一恢复真相。

## Verification

- focused tests 证明静态 prepare sections、多 turn hook sections、旧扁平 runtime messages 的相对位置，以及 approval resume 的 lifecycle 边界；
- JSONL waiting → 新 Harness `resume()` 测试证明 `profile.prepare()` 的 waiting Snapshot 与 resolution 后 `ContextProvider` Snapshot 的边界；
- `bun run verify`；
- `bun run pack:smoke` 仅在公开导出改变且包边界验证需要时追加；
- 独立审查通过后再将 ADR 升格为 `Accepted`。

## Current implementation note

2026-08-08 已完成实现、focused/full 验证和独立 acceptance review。ADR-0003 接受的范围是 provider-neutral sections 顺序，以及每次 run attempt 的静态 context/runtime message 重建边界：resume 使用 waiting Snapshot 重建 `PreparedRun`、不重放 `prepareRun` effect，Provider 在 approval resolution commit 后读取最新 Snapshot，waiting 路径不触发 `afterTurn`。不接受持久化 prepare-time 内存对象、历史 branch context、Job/Lease/Transport 或宿主产品语义。
