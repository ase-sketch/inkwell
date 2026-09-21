# 第四十三轮：Tool Call Identity Admission

## 规划结论

本轮完成三路只读规划：

### NeuroBook / Cosmos consumer

- NeuroBook 的 Harness 相关提交仍止于 2026-08-08；`1c0a13d0` recovery 与 `2e0c94a6` durable Job history 已在前序轮次完成归属判断；
- Cosmos 最新需求继续让 Cosmos 持有 Workflow/Run/Step/Job、Lease、Outbox、DomainEvent 和 HTTP/SSE Transport；Phase 1 仍直接使用 `pi-ai`；
- 已有 Cosmos public consumer tracer 覆盖 Capability、structured output、JSONL restart 与 cursor event，没有新的 packed consumer red。

### Store / package

只读 storage reviewer 提出 `MemorySessionStore.create()` 未使用 queue，可能让同 ID 并发 create 双成功。真实 public tracer 结果：

```text
statuses: fulfilled, rejected
persisted initial: first
```

原因是 explicit-ID create 在首次异步让出前已完成 `has → set`；该候选被证伪。Reviewer 同时建议让 package smoke 执行更多 JSONL 行为，但当前 tarball consumer 已通过，缺少测试本身不是 production correctness red。

### Core

Core reviewer提出两个后续候选：

- durable start 后 Event Hub publication 失败可能让 `invoke()` 拒绝但 Store 留下 running owner；
- public `setStatus(idle)` 可以与 running `activeInvocationId` 形成矛盾 projection。

两者均保留；前者当前需要宿主在 Harness 活跃时关闭 injected shared Hub，后者需要受信任宿主直接提交低层状态操作。它们低于已经由普通 Model Runtime 输出稳定复现的 Tool side-effect 问题。

## 选中问题

`AgentToolCall.id` 被 Harness 用于：

- Tool result；
- runtime event；
- Approval request/resolution；
- waiting resume；
- compaction pending-call 检查。

但最终 assistant message 没有 identity admission。

### Spike A：同 message 重复

Scripted Model 在同一 assistant message 返回：

```text
call(id="dup", arguments={n: 1})
call(id="dup", arguments={n: 2})
```

当前输出：

```json
{
  "executions": 2,
  "status": "completed",
  "toolResults": ["dup", "dup"]
}
```

同一 identity 产生两次副作用和两个 result，Harness 仍报告成功。

### Spike B：跨 turn 重用 + approval

第一 turn 的 `id="dup"` 已执行并产生 result；第二 turn 复用同一 ID 并进入 approval waiting。批准后当前输出：

```json
{
  "executions": ["first"],
  "waiting": "waiting",
  "status": "completed",
  "toolResults": ["ok:first"]
}
```

`resolveApprovals()` 的全局 completed-ID Set 把第二次调用误判为旧调用，已经批准的新副作用被静默跳过。

## 决策边界

建立 [`ADR-0025`](../../../adr/0025-tool-call-identity-admission.md)，状态保持 `Proposed`：

- Tool Call Identity 是 transcript/approval 关联，不是 idempotency key；
- 最终 assistant Tool Call ID 必须是非空字符串，并在当前 active durable Session transcript 中唯一；
- validation 位于 assistant durable commit、approval waiting 和 Tool execution 前；
- 无效 message 不进入 transcript，Tool/approval 不产生副作用；
- 旧 durable waiting transcript 按 call/result occurrence 顺序匹配，继续可恢复；
- compaction 也不能用全局 Set 把一个旧 result 同时匹配多个 call；
- streaming delta accumulator、Tool registry、Provider DTO、外部 exactly-once、Job/Lease/Outbox 不在本轮。

## TDD 顺序

Public seam 只使用根导出的 Profile/Tool/Harness/Model 合同：

1. 同一 assistant message 的 duplicate ID：当前 red 应观察 Tool 执行 2 次；目标是 Invocation failed、执行 0 次、无 invalid assistant/result fact；
2. 前一 turn 已完成 ID 的复用：目标是在新 approval request/waiting 前失败；
3. 通过 Store public plan 构造 legacy waiting transcript：旧 call/result 与新 pending call 同 ID，resume 后新 Tool 必须执行一次；
4. legacy pending-call compaction characterization：一个 result 不能匹配两个 call occurrence；
5. 独立审查发现的 malformed JavaScript Adapter 与失败 turn usage 通过同一 public seam 各做一条 red→green。

每条采用一 test → 一最小实现，不预先批量修改。

## 验证计划

```text
bun test tests/tool-call-identity.test.ts
bun test tests/tool-call-identity.test.ts tests/approval.test.ts tests/parallel-tools.test.ts tests/compaction.test.ts tests/recovery.test.ts tests/model-turn-partial.test.ts
bun run typecheck
bun run verify
bun run pack:smoke
git diff --check
```

## 未验证边界

- 真实 Pi/其它 Provider 是否曾返回重复或空 Tool Call ID；
- streaming SDK 如何累积 `tool_call_delta`；
- 外部 Tool side-effect idempotency、查询和补偿；
- 真实 NeuroBook/Cosmos consumer、HTTP/SSE、浏览器和产品验收；
- 绕过 Harness 的任意 malformed third-party Store migration。

## 执行记录

### Slice 1：同 message duplicate

Formal red：

```text
expected Invocation status: failed
received: completed

0 pass
1 fail
1 assertion
```

在 Model Runtime 返回后、`messages.push()` / usage / assistant commit 前加入当前 message identity admission。第一条 green：

```text
1 pass
0 fail
6 assertions
```

### Slice 2：跨 turn reuse

Formal red：

```text
expected Invocation status: failed
received: waiting
```

校验扩展到 `sessionMessages(snapshot)` 形成的 active durable transcript；第一 turn 的 assistant/result 保持，第二个同 ID call 不进入 approval waiting。两条 green：

```text
2 pass
0 fail
13 assertions
```

### Slice 3：空 identity

Whitespace-only ID formal red 返回 completed；加入 non-empty admission 后：

```text
3 pass
0 fail
18 assertions
```

### Slice 4：legacy waiting recovery

测试通过 public Store plan 构造：

```text
assistant call(id="legacy-reused")
toolResult(id="legacy-reused")
assistant pending call(id="legacy-reused")
waiting approval(id="legacy-reused")
```

旧实现 resume 后 completed，但 `executions=[]`。新增 internal `pendingToolCalls()` 按 transcript 顺序维护 pending occurrence；每个 Tool result 只消费一个更早的同 ID call。修复后新 pending call 执行一次：

```text
executions=["second"]
toolResults=["legacy:first", "executed:second"]

4 pass
0 fail
22 assertions
```

### Slice 5：legacy compaction guard

旧实现用 completed-ID Set 判断 pending；一个旧 result 同时掩盖两个同 ID call，compactor 被调用且 Invocation completed。`assertNoPendingToolCalls()` 改用 occurrence projection 后：

```text
Invocation status: failed
summary calls: 0
model requests: 0
compaction facts: 0
```

补 parallel admission regression 后，单文件最终：

```text
6 pass
0 fail
29 assertions
```

实现没有增加根导出、Store schema、Tool DTO 或外部幂等合同。

### Slice 6：非字符串 identity

独立 reviewer 用公开 JavaScript Adapter seam 返回一个带 `trim()` 方法的对象。旧实现把它当成合法 ID，Tool 执行且 Invocation completed：

```text
expected Invocation status: failed
received: completed

0 pass
1 fail
1 assertion
```

admission 现先检查 `typeof call.id === "string"`。该 tracer 转绿后，Tool 0 次，无 assistant/toolResult 持久化。

### Slice 7：identity 失败的 usage

自审发现 identity validation 位于 usage 聚合前。duplicate-ID assistant 已返回 `{input: 2, output: 3, total: 5}` 时，旧实现结果为：

```text
expected usage: 2 / 3 / 5
received usage: 0 / 0 / 0

0 pass
1 fail
2 assertions
```

合法 usage 现先进入 Invocation 聚合，再做 identity admission；无效 assistant 仍不进入 transcript，Tool 仍为 0 次，失败 result 与 Snapshot terminal fact 均恢复 2/3/5。单文件：

```text
8 pass
0 fail
39 assertions
```

## 验证

Focused：

```text
bun test \
  tests/tool-call-identity.test.ts \
  tests/approval.test.ts \
  tests/parallel-tools.test.ts \
  tests/compaction.test.ts \
  tests/recovery.test.ts \
  tests/model-turn-partial.test.ts \
  tests/harness.test.ts

45 pass
0 fail
205 assertions
```

类型与全仓：

```text
bun run typecheck
exit 0

bun run verify
244 pass
0 fail
1148 assertions
```

包边界：

```text
bun run pack:smoke
exit 0
105 files
108.8 kB package
523.5 kB unpacked
Bun and Node ESM consumers passed
```

`git diff --check` exit 0。pack prepack 再次执行同一 244/0/1148 全仓门禁；post-fix 独立审查仍待执行。

## 独立审查

首次只读审查发现 1 个 P1：非字符串但带 `trim()` 的对象可通过 admission、进入 Tool 副作用与 durable Tool result。其余 identity scope、legacy occurrence matching、compaction、approval 与性能未发现 P0/P1/P2。该 P1 已按 Slice 6 修复；post-fix review 等待完整 gate。

Post-fix 审查未发现 durable transcript、usage、Tool、approval、compaction 或唯一性范围的 P0/P1/P2，另发现 1 个公开边界 P2：Provider `onEvent` 会在 final-message admission 前发布 `tool_call_delta` / `message_end`，因此订阅者可能先看到最终被拒绝的 ID。直接缓冲会取消实时 stream，按 delta ID 去重又会破坏同一 accumulator 的合法更新；实现保持不变，公共类型、README、CONTEXT 与 ADR 现明确把 `model_event` 定义为不可授权的 provisional observation，并要求以 Invocation result/Snapshot 对账。

边界文档窄复审对照 `onEvent → final admission → assistant commit → approval/Tool` 顺序后返回：

```text
No P0/P1/P2 findings.
```

ADR-0025 已在 standalone Harness Tool Call identity scope 接受。
