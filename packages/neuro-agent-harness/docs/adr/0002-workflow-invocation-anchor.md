# ADR-0002: Strict Workflow Invocation Anchor

- Status: Accepted
- Date: 2026-08-07
- Task: [`01-harness-decoupling`](../tasks/01-harness-decoupling/README.md)

## Context

NeuroBook 的 Workflow AgentPort 以 `sessionId + fromLeaf` 调用 Agent；调用前会把 Session 恢复到该游标。这样 Workflow 在等待或编排期间，即使同一 Session 出现新的直聊写入，也不会把旁路 Invocation 写到错误分支。

独立 `neuro-agent-harness` 当前的 `invoke()` 只读取调用瞬间的 `activeLeafId`，然后使用 Store 的 `expectedVersion` 启动 Invocation。消费者可以手工完成 `snapshot → write(moveLeaf) → invoke`，但无法把它观察到的 Snapshot 作为调用前提表达给 Harness；Workflow 只能依赖闭包和宿主锁来避免这个窗口。

这两个语义不能混为一谈：本 ADR 只解决“观察点仍是当前 Session head 时才启动”的严格前提，不承诺从已经变成非 active 的历史 leaf 执行；后者需要 fork 或持久化 branch cursor。

## Decision

新增一个窄的、可选的 `invokeAt({anchor, ...})` API（语义名：`invoke-if-current`）：

- `anchor` 只包含 `version` 和 `activeLeafId`；
- Harness 在启动 Invocation 前校验当前 Snapshot 与 anchor 一致；
- Invocation start commit 使用 anchor 的 `version` 作为 `expectedVersion`，并把 anchor leaf 作为可选的 `expectedActiveLeafId` 诊断前提；因此读取之后发生的并发写入会明确失败。该保证依赖 Store Adapter 在自己的串行或事务边界内实现 `expectedVersion` CAS；
- anchor 不匹配使用现有 `SessionConflictError`，并保留期望/实际 leaf 作为诊断信息；
- Store reducer 在同一串行/事务边界内生成 `actualVersion` 和 `actualActiveLeafId`；Harness 不通过 CAS 失败后的事后 `read` 拼接跨版本诊断；
- 同一 anchor 的并发启动在 Store Adapter 已验证的串行或事务边界内只允许一个成功；失败方保持为 `SessionConflictError`，不能仅凭重读时的 `activeInvocationId` 推断冲突来源；
- 当前 anchor 与已持久化的 active Invocation 冲突时，Reducer 返回 `InvocationConflictError`；这可以来自同一 Harness、另一个 Harness 实例或重启恢复状态；
- `InvocationConflictError` 只表示当前 Harness 在 anchor 校验通过后已知存在本地 active Invocation；跨 Harness 或读后提交竞态不承诺细分为该错误；
- 现有 `invoke()` 保持原语义，不强制所有消费者迁移；
- API 不创建 Workflow/Job/Lease，不负责 session lock、retry、journal、delivery、HTTP/SSE 或 sidecar。

`invokeAt` 不改变 `InvocationRecord` 的 branch cursor，也不让 `resume()`、`retry()` 或 compaction 从历史 leaf 恢复；Workflow 若需要历史分支，应先通过 `createSession + write(appendEntries)` 或未来明确的 fork API 建立独立 Session。

## Alternatives

- **只继续使用 `snapshot → write → invoke`**：拒绝；能工作但调用位置不是单个可复用合同，消费者必须自行复制并发防护。
- **把 `fromLeaf` 直接加入 `invoke()`**：拒绝；会让所有调用都承担锚定语义，且容易与“按当前 Session 调用”的简单用例混淆。
- **把 NeuroBook 的 Workflow AgentPort 或 durable Job 搬入 Core**：拒绝；会固化宿主权限、锁、等待恢复和 Job 生命周期。
- **新增完整 `InvocationHandle`/Workflow runtime**：暂缓；当前 slice 只验证调用位置，避免同时改变等待、取消和恢复合同。
- **让同一 Session 从历史 inactive leaf 直接运行**：暂缓；需要把 branch cursor 进入 Invocation/recovery 合同，成本和错误面明显扩大；当前优先使用 fork Session。

## Scope

本轮只允许修改：

- `src/harness.ts`：公开 request/anchor 类型和 `invokeAt`；
- `src/session.ts`：必要的冲突诊断字段和 `SessionWritePlan.expectedActiveLeafId`；
- `src/index.ts`：若新增类型不由已有 `export *` 覆盖则同步导出；
- 一个 focused 行为测试；
- Task walkthrough 与本 ADR。

不修改 NeuroBook、Cosmos、Pi、Store Adapter 的 durable 事实、Workflow scheduler 或 HTTP 层。

## Verification

- focused `invokeAt` tests：成功锚定调用、旧 version/leaf 拒绝、读后写入竞态保留 leaf 诊断、CAS 失败后再次写入不拼接跨版本诊断、同一 anchor 并发只保留一个 Invocation；
- focused `invokeAt` test：anchor 仍匹配但 Session 已有持久化 active Invocation 时返回 `InvocationConflictError`；
- `bun run verify`；
- `bun run pack:smoke`（公开包合同变化）；
- `git diff --check`；
- 独立审查通过后才可将 Status 改为 `Accepted`，并记录未验证的真实 NeuroBook/Cosmos 接入边界；历史 branch anchor 单独回到规划阶段。

## Current implementation note

2026-08-08 已完成 strict `invoke-if-current` 的实现与 acceptance review。`tests/workflow-agent-invocation.test.ts` 现在覆盖两个独立 JSONL Store/Harness 竞争同一 anchor：一个 Invocation 成功、另一个得到 `SessionConflictError`，并由新 Harness 恢复获胜 Invocation。结合 JSONL Bun/Node 子进程 commit CAS、Memory focused 冲突测试和 `bun run verify`，以下范围接受：

- `anchor` 只包含 `version` 和 `activeLeafId`；
- `invokeAt()` 只在当前 Snapshot 仍匹配 anchor 时启动；
- start commit 使用 anchor version 做 CAS；
- version/leaf 诊断来自同一 reducer/Store 边界；
- 并发失败方保持为 `SessionConflictError`，已有持久化 active Invocation 时返回 `InvocationConflictError`；
- 普通 `invoke()` 保持原语义，不强制消费者迁移。

本 ADR 不接受历史 inactive leaf 执行语义。Bun/Node 子进程直接通过 Harness 执行 `invokeAt`、JSONL 中已有 active Invocation 的专项组合测试、`resume()`/`retry()`/compaction 中持久化 anchor、网络文件系统 fencing，以及真实 NeuroBook/Cosmos 运行时接入仍未验证或明确不在本 ADR 范围；这些边界不能被本 ADR 的 `Accepted` 状态推断为已完成。

Review evidence:

- focused `bun test tests/workflow-agent-invocation.test.ts`: 7 pass / 34 expect calls；
- `bun run verify`: 63 pass / 0 fail / 323 expect calls；
- `bun run pack:smoke` 与 `git diff --check`：通过（Windows LF/CRLF 警告不构成 whitespace failure）。
