# ADR-0025: Tool Call Identity Admission

- Status: Accepted (standalone Harness Tool Call identity scope)
- Date: 2026-08-11
- Task: [`01-harness-decoupling`](../tasks/01-harness-decoupling/README.md)

## Context

`AgentToolCall.id` 当前同时承担四个 provider-neutral 关联：

- assistant Tool Call 与 durable `toolResult`；
- `tool_execution_start/end` runtime event；
- durable `ApprovalRequest` 与宿主 `ApprovalResolution`；
- waiting resume 和 compaction 对未完成 Tool Call 的识别。

Harness 当前不验证最终 assistant message 的 Tool Call ID。两个 public spike 已证明这不是纯输入卫生问题。

同一 assistant message 返回两个同名、同 ID、不同 arguments 的 Tool Call 时，sequential Kernel 会执行 Tool 两次，持久化两个相同 `toolCallId` 的 result，并把 Invocation 报告为 completed：

```json
{
  "executions": 2,
  "status": "completed",
  "toolResults": ["dup", "dup"]
}
```

当后续 turn 重用已经完成的 ID，并让新调用进入 approval waiting 时，`resolveApprovals()` 当前用全局 completed-ID Set 过滤未决调用。旧 result 会把新的已批准调用误判为已完成；Invocation 最终 completed，但新 Tool 从未执行：

```json
{
  "executions": ["first"],
  "waiting": "waiting",
  "status": "completed",
  "toolResults": ["ok:first"]
}
```

因此重复 identity 既可能重复外部副作用，也可能跳过已经批准的副作用。

## Decision

### Final-message admission

Model Runtime 返回的最终 assistant message 必须满足：

- 每个 Tool Call ID 是非空字符串；
- 当前 message 内没有重复 ID；
- ID 不与当前 active durable Session transcript 中仍可见的历史 Tool Call 重复。

Harness 在以下操作之前执行校验：

```text
assistant transcript commit
→ approval request/waiting commit
→ Tool execution / tool_execution_* runtime event
```

违反合同使当前 Invocation 按既有 run-failure/terminal-persistence 路径失败；无效 assistant message、Tool result 和 approval request 不写入 Session，Tool 不执行。

Model Runtime 已返回的合法 `TokenUsage` 是本次 Invocation 已发生的计费事实。Harness 在 identity admission 前聚合它，并在失败 terminal plan 中持久化；这不会让无效 assistant message 进入 transcript。

唯一性范围是当前 active durable transcript：branch rewind 或 compaction 已从 durable provider transcript 移除的历史调用不继续占用 identity。`PreparedRun.messages`、当前请求 Context sections 与 Hook runtime messages 仍是宿主临时上下文，不进入这条 durable identity admission。

Model Runtime 的 `onEvent` 是 final-message admission 前的 provisional Provider stream。streaming `tool_call_delta` 可以多次更新同一 accumulator，`message_end` 也可能携带最终被拒绝的 ID；Harness 不把这些事件缓冲到 turn 结束。订阅者不得用 `model_event` 授权 Tool/approval 副作用，必须以 Invocation result 与 Snapshot 对账。本决定只 admission Model Runtime 最终返回的 assistant message。

### Legacy occurrence matching

已持久化的旧 Session 继续可读。waiting resume 和 pending Tool Call 检查不能再把全部 result ID 压成全局 Set，而要按 transcript 顺序一对一消费 occurrence：

```text
assistant call(id)
→ 后续第一个尚未匹配的 toolResult(id)
```

这允许旧 transcript 中“旧 call/result 已完成，后续 call 误用同一 ID”的 waiting Invocation 仍执行后续已批准调用一次，而不是被旧 result 吞掉。

### Identity is not idempotency

Tool Call Identity 只做 Harness transcript / approval 关联。它不承诺：

- Tool 外部副作用 exactly-once；
- 进程在外部成功、result commit 前崩溃后的自动判断；
- Cosmos Job/Run/Step、Lease、Outbox、幂等键或补偿。

宿主仍需为真实外部副作用提供自己的 idempotency/query/compensation 合同。

## Alternatives

- **按 ID 静默去重 Tool Call**：拒绝。Harness 无法判断重复 block 是 Provider bug 还是两个不同 arguments 的真实意图；保留其中一个会制造误导性成功。
- **允许重复，仅按出现次序关联**：拒绝新 admission。虽然可用于 legacy recovery，但 provider-visible Tool result 与 runtime event 仍歧义，parallel/sequential 副作用也会重复。
- **让每个 Tool 自己处理**：拒绝。Approval resume 在进入 Tool 前已经可能跳过调用；Tool 无法修复 Harness transcript 关联。
- **由 Harness 重写/生成 ID**：拒绝。会切断 Provider streaming event、最终 message、Tool result 和宿主 UI 之间的原始关联。
- **把 Tool Call ID 当外部幂等键**：拒绝。它没有跨进程、跨 retry 或外部系统原子性保证。

## Verification gate

- 同一 assistant message 的重复 ID 在 sequential 与 parallel Tool 副作用前失败；
- JavaScript Adapter 返回的非字符串 ID 以明确的 admission error 失败；
- 重复 ID 的无效 assistant message和 Tool result 不持久化；
- identity admission 失败仍保留 Model Runtime 已返回的合法 usage；
- 当前可见 transcript 中跨 turn ID 复用在 approval request/waiting 前失败；
- 唯一 ID 的 multi-Tool sequential/parallel 与 approval 行为保持；
- legacy waiting Snapshot 中，旧 completed call/result 与后续同 ID pending call 按 occurrence 恢复，获批 Tool 恰好执行一次；
- compaction pending-call 检查对 legacy duplicate occurrence 不再被单个旧 result 欺骗；
- focused、`bun run verify`、`bun run pack:smoke`、`git diff --check` 与独立审查完成。

## Out of scope

- Provider SDK 自己的 stream accumulator，以及对 pre-admission `model_event` 的缓冲或 identity validation；
- Tool name/schema registry 重复；
- 外部副作用 exactly-once、Job/Lease/Outbox/delivery；
- HTTP/SSE DTO、审批 UI、NeuroBook/Cosmos 修改；
- 对绕过 Harness 直接写入的任意 malformed Store 记录做完整 schema migration。
