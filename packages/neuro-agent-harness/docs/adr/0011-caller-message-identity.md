# ADR-0011: Caller and Durable Message Identity

- Status: Accepted (standalone Core scope)
- Date: 2026-08-09

## Context

NeuroBook 已将 Invocation 的调用来源 `caller.kind` 与落盘消息的展示/归属身份 `messageIdentity` 分开。这样，Workflow 或系统回流可以由 system caller 发起，同时仍明确声明这条消息是否应作为 user 或 system 消息投影。

当前 standalone Harness 只有 `caller`：

- `InvocationRecord` 保存调用来源，但没有消息身份；
- `invoke()`、`steer()` 和 `followUp()` 生成的 durable/provider-visible 输入都默认是普通 user 消息；
- follow-up ledger 只保存 payload，重启 drain 时重新硬编码 system caller；
- `agent.message` entry 只保存 `{turn, message}`，宿主无法区分“系统调用产生的 user-shaped 消息”和真实用户输入。

直接搬入 NeuroBook 的 `custom_message`、HTTP DTO、delivery 状态或 UI 投影会把产品语义重新耦合进 Core。另一方面，从 `caller.kind` 自动推断消息身份也会破坏调用方对回流消息的显式控制。

## Decision

增加 provider-neutral 的 `MessageIdentity = "user" | "system"` 元数据，并在以下边界显式传递：

1. `InvokeRequest` / `InvokeAtRequest` / `AgentCallRequest` 可声明 `messageIdentity`；
2. `InvocationRecord` 保存本次 Invocation 的 identity；新 Invocation 默认写入 `"user"`；
3. `steer()` 与 `followUp()` 的 `QueuedInvocationInput` 保存 caller 和 identity；follow-up JSONL drain 使用队列中保存的值；
   - `followUp()` 不带 `caller` 选项时缺省为 `{kind: "user"}`（与
     `invoke()` / `retry()` 的缺省一致，对齐 NeuroBook
     `normalizeInvokeCaller`）；旧 queue item 缺 caller 时 drain 回退同样为
     `{kind: "user"}`。第八十九轮修正：此前实现缺省
     `{kind: "system", name: "followUp"}`，会让用户提交的 follow-up 对
     hooks/Pi trace/授权呈现为 system；ADR 此前未记录该缺省（仅第八十七轮
     测试锁定旧值），属静默选择；
4. `agent.message` entry payload 扩展为可选 `messageIdentity` envelope 字段；
5. `messageIdentity` 缺失的旧 Snapshot、旧 queue entry 和旧 message entry 按 `"user"` 兼容；
6. provider-visible `AgentMessage` 保持现有 `role: "user"`；identity 不进入 Model Runtime 的消息 role，也不新增 `role: "system"`；
7. Core 只保存和恢复元数据，宿主 Adapter 自行把它投影为 `custom_message`、系统卡片、通知或其它产品形态。

默认策略是“缺失即 user”，不是“根据 caller 推断”。因此 `{kind: "system"}` 与 `messageIdentity: "user"` 是合法且有意的组合。

## Consequences

- Workflow 可以把旁路 Agent 结果通过 durable follow-up 回流，并在 JSONL 重启后保持 system identity。
- Cosmos 可以在自己的 Job/Workflow/幂等交付层决定何时创建 system follow-up，而不要求 Harness 持有 Job durable truth。
- transcript 仍能复用现有 `AgentMessage[]` provider contract；只有宿主读取 Snapshot/entry 时才消费 identity。
- 旧 JSONL 文件和旧 follow-up ledger 不需要迁移。

## Out of scope

- NeuroBook `custom_message`、HTTP DTO、Composer 或其它 UI projection；
- Job、Run、Step、Lease、Outbox、deliveryId、exactly-once 或跨 Session 事务；
- `role: "system"` provider message；
- 自动从 `caller.kind` 推断 identity；
- system identity 的权限、鉴权、审计策略；
- `report_result`、Reminder/Watch、SSE Transport 或 sidecar。

## Evidence and acceptance

接受前需要：

- `invoke()`、`invokeAt()`、`retry()` 的 Invocation identity focused tests；
- `steer()` 与 `followUp()` 的 caller/identity 传递和 follow-up ledger projection tests；
- JSONL follow-up queue restart 后仍保留 identity；
- 旧 queue/message/invocation 记录缺失字段时按 user 恢复；
- `agent.message` provider transcript 仍保持原有消息 role 和顺序；
- `bun run verify` 与公开导出变化后的 `bun run pack:smoke`；
- 独立审查确认没有引入产品 DTO、Job durable truth 或 identity 推断。

## 2026-08-09 Planning Walkthrough

- 对照 NeuroBook `invocation-caller.ts`、`types.ts`、`stored-types.ts` 和 system follow-up recovery tests，确认 caller/identity 分离是已验证的宿主无关 seam。
- 对照 Cosmos Workflow Runtime ADR，确认 Harness 只需要保存 Agent Invocation/Session 事实；Job、幂等 delivery 和 Workflow Run/Step 继续由 Cosmos 持有。
- 选择 additive metadata envelope，不改变 provider-visible `AgentMessage`，以降低迁移与 Pi/其它 Model Runtime 的兼容风险。
- 按 TDD 先添加 Memory/JSONL 红测，再实现 caller、queue、Invocation 和 transcript 的最小传递链。

## 2026-08-09 Implementation and Reopened Review

- `src/caller.ts` 新增 `MessageIdentity` 与 `InvocationInputOptions`；`InvokeRequest`、`InvokeAtRequest`、`AgentCallRequest`、`retry()`、`steer()` 和 `followUp()` 均可显式传递 identity。
- `InvocationRecord`、follow-up queue projection/JSONL ledger 和 `agent.message` user envelope 保存 identity；旧 Invocation、旧 queue 和旧 user message entry 缺字段时归一化为 `"user"`。
- provider-visible `AgentMessage` 未增加 identity 字段，仍保持 `role: "user"`；system identity 只存在于 durable metadata。
- follow-up 的 `startInvocation` 与 `harness.followUp.consumed` 现在在同一个 admission commit 中提交，修复了 consume 成功而 start 失败时永久吞队列项的 P1 断点；该 hardening 不新增 Job、delivery 或 exactly-once 语义。
- 之前的 focused、`bun run verify` 和 `bun run pack:smoke` 证据证明了 message identity 与 consume/start 原子提交，但不足以覆盖 admission 读到旧队首后与 cancel/reorder 并发的边界。
- 独立审查新发现 P1：admission 必须在 durable commit 边界拒绝旧快照，不能执行已取消或已重排的队首；原 acceptance 结论因此撤回，ADR 降回 `Proposed`。
- `tests/follow-up-admission-race.test.ts` 已改为在 admission `startInvocation` 提交前冻结旧快照，期间执行 cancel/reorder，再验证 `SessionConflictError`、无旧 Invocation、queue 保留；当前相关 focused 结果为 8 pass / 0 fail / 41 expect calls。
- 仍需重新运行受影响全仓验证、包 smoke 和独立 acceptance review；在这些门槛完成前不升格为 `Accepted`。

未验证边界保持明确：真实 NeuroBook/Cosmos consumer、真实 provider/tool、跨进程 EventHub、系统 identity 的权限/审计策略、Job/Lease/Outbox、delivery/exactly-once、HTTP/SSE Transport 和 sidecar 均不在本 ADR。

## 2026-08-10 Follow-up Admission Review

- 将 stale admission 回归夹具改为阻塞 `harness.invocation.start` commit，而不是阻塞 read；这样 cancel/reorder 确实发生在旧 Snapshot 已选中、尚未 durable commit 的窗口。
- 新增 `tests/follow-up-admission-jsonl.test.ts`：两个独立 JsonlSessionStore/Harness 共享目录，分别覆盖 cancel/reorder、旧 admission 冲突和新 Harness 继续消费队列。
- 新增 `tests/message-identity-legacy-jsonl.test.ts`：直接写入缺字段的 raw JSONL Snapshot，验证 invocation、`agent.message`、queue projection 和实际 resume 都按 `"user"` 兼容。
- focused：5 个相关测试文件合计 11 pass / 0 fail / 60 expect calls。
- 全仓：`bun run verify` 为 118 pass / 0 fail / 571 expect calls。
- 包边界：`bun run pack:smoke` 通过，prepack、tarball、Bun consumer 和 Node ESM consumer 均通过；`git diff --check` 无 whitespace error。
- 当前实现的 `observedSnapshot + expectedVersion` CAS 已通过 Memory/JSONL Harness 与 raw legacy focused 验证；ADR 等待最终独立 acceptance review。

## 2026-08-10 Acceptance Review

- 最终独立审查确认没有 P0/P1 correctness 缺陷，也没有把 NeuroBook/Cosmos 的 Job、delivery、UI、SSE 或 sidecar 语义下沉到 Core。
- focused：5 个相关测试文件 11 pass / 0 fail / 60 expect calls；全仓 `bun run verify` 为 118 pass / 0 fail / 571 expect calls；`bun run pack:smoke` 通过。
- JSONL 组合证据覆盖两个独立 Harness/Store 的 cancel/reorder stale admission、旧队首拒绝、队列保留和后续消费；raw legacy fixture 覆盖缺字段 Invocation、`agent.message`、queue projection 与 resume。
- 因此本 ADR 在 standalone Core 范围内升格为 `Accepted`。

仍未验证真实 NeuroBook/Cosmos consumer、真实 provider/tool、跨进程 EventHub、第三方 Store Adapter、system identity 权限/审计策略、HTTP/SSE Transport 和生产验收；这些不由本 ADR 的 Accepted 状态推断为已完成。

## 2026-08-10 Cross-Harness Follow-up Admission Hardening

- 后续 parity 审查发现 `followUp()` 把本进程 `active` Map 当作 admission 真相源；Harness A 持有 JSONL Session 的 durable owner 时，Harness B 会错误拒绝排队。
- admission 改为读取 Snapshot `activeInvocationId`，并在 `harness.followUp.queue` commit 上使用 `expectedActiveInvocationId`。running/waiting owner 都能接收 durable follow-up；若 observed owner 已 terminal，Store reducer 以 `InvocationOwnershipError` 拒绝，不能追加孤立 queue item。
- 新增两个独立 Harness/JsonlSessionStore 的 running、waiting 与 read→commit terminal race 回归；没有增加 delivery ID、exactly-once、Job/Workflow DTO 或 queue-if-busy `invoke()` API。
- focused coordination/admission/recovery/identity/abort 矩阵为 34 pass / 0 fail / 173 expect calls；`bun run verify` 为 179 pass / 0 fail / 888 expect calls；post-fix 独立只读审查返回 `No P0/P1/P2 findings.`。

## 2026-08-11 Follow-up Control CAS Hardening

- `cancelFollowUp()` 与 `reorderFollowUps()` 原来只在 read 阶段检查 pending item，commit 没有携带 observed version。队首 admission 若先提交 `startInvocation + consumed`，迟到的 cancel/reorder entry 会成为 no-op，但 API 仍返回成功。
- 两个控制操作现在从同一 Snapshot 投影 queue，并在 control commit 使用 `expectedVersion`。admission、其它 queue control 或 Session mutation先赢时，旧控制请求以 `SessionConflictError` fail closed。
- `pauseFollowUps()` / `resumeFollowUps()` 仍是显式最后命令优先的 boolean 控制，不依赖 exact item set，本次不改变。
- 没有增加 queue revision、公共参数、delivery/exactly-once、busy invoke 或 Workflow/Job DTO；focused 为 36/0/179，`bun run verify` 为 181/0/894，post-fix 独立只读审查返回 `No P0/P1/P2 findings.`。
