# ADR-0010: Provider-Neutral Model Context Appending

- Status: Accepted (standalone Core scope)
- Date: 2026-08-09

## Context

NeuroBook TSX Profile 将 `modelContextMessages` 与 `modelContextAppendingMessages` 分开表达，但当前 standalone Core 只有 `modelContext` 和 `appending` 两个动态分区。两者的 prompt 位置不同：ModelContext 动态消息之后、贴近当前输入的 AppendingSet 之前。

NeuroBook 对 `modelContextAppendingMessages` 的持久化语义目前存在冲突：一处文档称其按 AppendingSet 语义写入当前光标，另一处文档和当前模型上下文说明称其不写产品历史。Core 不应在语义未冻结时复制这套 Profile/Host 行为。

## Decision

先建立 A0 provider-neutral、request-only 分区：

- `ContextMessageSections` 新增可选 `modelContextAppending`；
- `ContextProviderResult` 可以返回 `modelContextAppending`；
- `mergeContextMessageSections()` 按声明来源顺序合并该分区；
- `composeContextMessages()` 固定顺序为：

```text
history → durable transcript → modelContext
        → modelContextAppending → appending
```

- ContextProvider 产物只进入当前 model request，不写 Session，不自动生成 settlement 或 state write；
- 旧扁平 `runtimeMessages` 和已有三分区调用保持兼容。

本 ADR 不决定 `modelContextAppending` 的持久化，也不把 NeuroBook TSX 节点、Reminder、Watch、ProfileRuntimeState、`stateWrites` 或 AppendingSet settlement 引入 Core。

## Consequences

- Profile/Host Adapter 可以表达“只在当前 provider request 中、但位于 AppendingSet 之前”的上下文位置。
- Core 不需要猜测 NeuroBook 当前文档冲突的 durable truth。
- Provider 结果和普通 Hook sections 可以保持同一 assembler 顺序；迟到 Provider 结果继续受现有 attempt/ownership fence 保护。

## Out of scope

- TSX DSL 编译、Profile Workbench、Workspace/Profile Home；
- Reminder/Watch fingerprint、repeatEveryTurns、baseline 和 `ProfileRuntimeState`；
- HistorySet/AppendingSet 持久化、成功交付 settlement、动态提醒重试；
- Job、Workflow、SSE、Transport、sidecar、provider-specific message 类型。

## Evidence and acceptance

接受前需要：

- `composeContextMessages()` 的分区顺序回归；
- `mergeContextMessageSections()` 和多个 ContextProvider 的顺序回归；
- 多 turn 中该分区只进入当前 request，不进入 Session transcript；
- approval waiting/resume、旧扁平 runtimeMessages 和 existing modelContext 行为不退化；
- Memory/JSONL 与包 smoke 验证；
- 独立审查确认没有把 NeuroBook 的持久化或 Reminder/Watch 语义误报为 Core 合同。

## 2026-08-09 Planning Walkthrough

- 对照 NeuroBook `reference/agent/context.md`、`profile-sdk/contracts.ts` 和 `server/agent/harness/prepare-run.ts`，确认当前实现存在文档/实现语义冲突。
- 规划 A0 只抽“消息位置”，不抽“生命周期”或“持久化”。
- 下一步按 TDD 先添加 compose order red test，再最小修改 `src/context.ts` 和 Harness Provider resolution，随后补不持久化/approval resume focused 证据。

## 2026-08-09 Implementation Walkthrough

- `ContextMessageSections` 与 `ContextProviderResult` 新增 `modelContextAppending`；assembler 固定为 `history → transcript → modelContext → modelContextAppending → appending`。
- Harness 每轮重新解析 ContextProvider 时保留该分区；它只进入当前 model request，不写 Session，也不改变 approval resume 或旧扁平 runtimeMessages。
- focused `bun test tests/context.test.ts tests/context-provider-capability.test.ts` 为 9 pass / 0 fail / 57 expect calls。
- 全仓 `bun run verify` 为 107 pass / 0 fail / 502 expect calls；`bun run pack:smoke` 通过，包含 tarball、Bun consumer 和 Node ESM consumer。

## 2026-08-09 Acceptance review

- 当前 standalone Core 范围内没有 P0/P1 缺陷或 scope overclaim；新增合同是 additive，旧 context、approval resume、Memory/JSONL 和包消费者验证均通过。
- 接受范围只包括 provider-neutral 的 request-only 分区位置；NeuroBook `modelContextAppendingMessages` 的 durable 语义、Reminder/Watch、ProfileRuntimeState、stateWrites 和 settlement 仍留在宿主 Adapter，不由本 ADR 冻结。
