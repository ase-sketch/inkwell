# ADR-0005: Per-turn Context Provider Resolution

- Status: Accepted
- Date: 2026-08-08
- Task: [`01-harness-decoupling`](../tasks/01-harness-decoupling/README.md)

## Context

NeuroBook 当前把 Profile 上下文分成不同生命周期：

- `HistorySet` 是缺少稳定前缀时才写入 Session 的长期上下文；
- `ModelContext` 只进入本轮 provider request，不写入产品历史；
- `AppendingSet` 进入 provider request，并有独立的历史写入与 settlement 语义；
- 当前用户输入由 Harness 作为独立 durable prompt 管理，不属于 Profile 的上下文分区。

独立 Harness 已有 provider-neutral `ContextMessageSections`，但动态上下文仍主要通过 `beforeTurn` / `afterTurn` hook 返回。Hook 可以携带 write plan，且 approval resume 对 prepare-time effect 的生命周期仍是 provisional；这使“基于最新 Snapshot 重新计算、只服务当前 model request”的能力没有一个清晰的只读合同。

本 ADR 只吸收 TSX Profile 的生命周期洞见，不把 JSX、Workspace、Reminder/Watch、文件变更查询、Profile runtime state 或 NeuroBook 产品 DTO 带入 Core。

## Decision

提出一个窄的、只读的 `PreparedRun.contextProviders` seam：

- `PreparedRun` 可以声明有序的 `contextProviders`；
- Provider 在每个实际 model turn、`beforeTurn` 的 write plans 已经应用之后执行；
- Provider 只接收当前最新的 `SessionSnapshot`、Invocation 元数据、Capability scope、Host Context 和 `AbortSignal`，不能访问 Store，也不能返回 `SessionWritePlan`；
- Provider 只产生当前 request 的 provider-neutral `modelContext` 消息；结果不自动写入 Session，不进入下一 turn，也不在 Invocation 恢复时从旧 request 重放；
- 多个 Provider 按声明顺序解析，结果按顺序追加；Provider 失败则当前 Invocation 在 model call 前失败，并保留现有错误/settlement 语义；
- approval resolution 的 durable commit 完成后，恢复的下一个 model turn 重新解析 Provider，因此 Provider 看到的是 resolution 后的 Snapshot；
- Capability scope 属于一次 run attempt：首次 `invoke()` 和 approval `resume()` 各自 open/close 一个新的 scope，不承诺跨 waiting 或进程复用同一 Capability 实例；
- `PreparedRun.context`、`RuntimeEffect.context` 和既有扁平 `runtimeMessages` 保持兼容；本 ADR 不改变它们的已有位置或 resume 语义；
- `history` provider 和带持久化/settlement 的 `AppendingSet` provider 不在 A1 范围内，后续需要分别提出可验证合同。

这里的“只读”是 Harness 合同：Provider 可以通过显式 Capability 读取宿主投影，但不能凭借 Provider 接口偷偷写入 Session 或执行未声明的外部副作用。

## Lifecycle boundary

```text
latest Snapshot
  -> beforeTurn hooks
  -> apply hook write plans
  -> resolve contextProviders
  -> compose model request
  -> model turn / durable transcript commit
```

Provider 不缓存上一个 turn 的结果。每次解析都以当前 Snapshot 为输入；如果 Provider 需要持久化观察点、游标或 settlement，必须另行返回明确的 `SessionWritePlan` seam，而不是借用本 ADR。

## Alternatives

- **继续只使用 `beforeTurn` hook**：暂缓；它适合需要返回 effect 的扩展，但不能清楚表达只读、每 request、不可持久化的上下文 provider。
- **每个 turn 重新调用 `Profile.prepare()`**：拒绝；会重复执行 prepare-time 配置和潜在 effect，且扩大 Profile prepare 的生命周期。
- **允许 Context Provider 返回 write plan**：拒绝；会让只读上下文重新获得隐式持久化能力，混淆 provider request 与 Session fact。
- **在 Harness 中实现 History/Workspace/Reminder/Watch**：拒绝；这些语义依赖宿主投影、路径和产品 runtime state。
- **一次性引入通用 settlement、History handle 或 Job**：暂缓；这些能力有独立恢复、幂等和跨进程合同，不应和 A1 绑定。

## Scope

A1 只允许修改：

- `src/profile.ts`：`ContextProvider` 类型和 `PreparedRun.contextProviders`；
- `src/context.ts`：必要的 provider result/compose helper；
- `src/harness.ts`：按 Snapshot 生命周期解析 provider；
- `src/index.ts`：同步公开导出；
- focused context/provider behavior tests；
- Task walkthrough 与本 ADR。

不修改 NeuroBook、Cosmos、Pi、Store record 格式、JSONL lock、Workflow Job、SSE 或 sidecar API。

## Verification plan

- Provider 每个 model turn 都重新执行，并能看到上一 turn 已 durable commit 的最新 Snapshot；
- `beforeTurn` write plan 在 Provider 解析前可见；
- approval resume 的 resolution commit 后，Provider 看到更新后的 Snapshot；
- Provider 输出只出现在当前 model request，不出现在 Session entries、下一 turn 或恢复后的旧 request；
- Provider 顺序稳定，失败发生在 model call 前且不产生伪造的 durable context entry；
- Provider 可通过声明的 `CapabilityScope` 使用宿主授权能力；Capability 在同一 Invocation 的多 turn 中复用，并在成功/失败路径结束时 close；
- 既有 `PreparedRun.context`、hook context 和 `runtimeMessages` focused 回归保持通过；
- `bun run verify`、必要时 `bun run pack:smoke`、`git diff --check`；
- 独立审查完成后再决定是否把 ADR 升格为 `Accepted`；真实 NeuroBook/Cosmos 接入仍单独报告。

## Current planning note

2026-08-08 完成 NeuroBook context 文档的只读对照：`HistorySet` 的首次稳定写入、`ModelContext` 的本轮 model-only 语义、`AppendingSet` 的持久化/settlement 和独立的 CurrentUserInput 均不能在一个 A1 provider 中混合。已实现 provisional `PreparedRun.contextProviders` vertical slice，并以 focused/full/package smoke 证明其当前行为：

- Provider 按声明顺序在 `beforeTurn` write plans 应用后读取最新 Snapshot；
- 结果只进入当前 request 的 `modelContext`，不写入 Session、不进入下一 turn；
- approval resolution 后 Provider 看到更新后的 Snapshot，Provider 失败发生在 model call 前；
- JSONL waiting → 新 Harness `resume()` 已证明 `profile.prepare()` 使用 waiting Snapshot，而 Provider 使用 resolution commit 后的 Snapshot；
- waiting approval 不触发 `afterTurn`；resume 后完成没有新 pending approval 的 Tool turn 才触发 `afterTurn`；
- 新增 Capability boundary focused 回归：Provider 使用显式 Capability 成功，失败发生在 model call 前，Capability close 与 open 使用同一 Invocation 实例；
- 当前全量验证为 67 tests / 0 failures / 356 expect calls。

2026-08-08 独立 acceptance review 确认 A1 合同满足：Provider 顺序、最新 Snapshot、当前 request-only、不持久化、model call 前失败和 Capability 生命周期均有实现与 focused/full 证据。ADR-0005 仅接受 A1 的 run-attempt-scoped Capability 语义；不接受跨 waiting/process 复用 Capability、AppendingSet/History settlement、Job、Workspace 或真实宿主产品接入。真实 NeuroBook/Cosmos 和生产验收继续单独报告。
