# ADR-0018: Reserved Follow-up Coordination Entries

- Status: Accepted (standalone Core scope)
- Date: 2026-08-11
- Task: [`01-harness-decoupling`](../tasks/01-harness-decoupling/README.md)

## Context

`SessionWritePlan.appendEntries` intentionally允许宿主定义开放的 entry kinds，`harness.write()`、Profile Hook 和 Tool effect 共用该扩展 seam。但 Core 同时把以下 kinds 解释为 durable follow-up 状态机：

- `harness.followUp.queued`
- `harness.followUp.consumed`
- `harness.followUp.cancelled`
- `harness.followUp.paused`
- `harness.followUp.ordered`

当前只有 `harness.invocation.usage` 与 `harness.invocation.partial` 受到保留 fact 检查。宿主 write 或运行期 effect 可以直接追加 `harness.followUp.*`，绕过 payload parsing、active owner、observed-version CAS、caller/message identity 和 queue control API。

## Decision

`harness.followUp.*` 是 Core-owned entry namespace：

- 只有 Harness 内部 follow-up admission/control/consume 路径可以提交；
- `harness.write()`、Profile/Hook/Tool write plans 在 Store commit 前原子拒绝任何该前缀 entry；
- 拒绝使用 `SessionInvariantError`，不得产生部分 entry 或事件；
- Memory/JSONL 中已有合法或旧版 follow-up entries 继续读取和恢复，不迁移；
- 受信任宿主仍可直接实现/操作自己的 `SessionStore`，但绕过 Harness 写入不属于 Core 可执行的权限边界；
- 其它宿主 entry kind 保持开放，Core 不在本轮保留整个 `harness.*` 前缀。

Harness 内部放行是私有 commit 权限，不新增公共 token、Store operation 或 entry schema。

## Alternatives

- **只校验 follow-up payload shape**：拒绝。shape-valid `cancelled` / `consumed` 仍能越权改变 queue，问题不是 JSON 形状。
- **立即保留所有 `harness.*`**：暂缓。当前只对 usage、partial 与 follow-up 有明确 Core projection 和测试证据，扩大前缀会无证据收紧宿主扩展。
- **隐藏 `SessionWritePlan` / `harness.write()`**：拒绝。Workflow、Host Context projection 和产品扩展仍需要公开 append-only write seam。

## Verification gate

- public `harness.write()` 不能 queue/cancel/pause/reorder/consume；
- Profile/Hook/Tool effect 不能改变 follow-up state；
- 拒绝发生在 Store commit 前，Snapshot version、entries 和 events 不变；
- 合法 `followUp()`、pause/cancel/reorder/resume、consume/start 与 JSONL recovery 保持；
- raw legacy JSONL 继续投影；
- focused、`bun run verify`、包边界评估和独立审查。

本 ADR 不定义不可信宿主沙箱、Store ACL、插件权限、delivery/exactly-once、Job/Workflow DTO 或通用 entry namespace registry。

## Evidence and acceptance

- public host forge red 为 0 pass / 1 fail / 1 assertion；实现后五种已知 follow-up facts 均在 Store 前拒绝。
- reserved facts 单文件为 2 pass / 0 fail / 12 assertions；受影响 focused 为 54 pass / 0 fail / 231 assertions。
- legacy identity fixture 改由受信任 Store 注入 pre-reservation record，缺失 identity 的旧 queue 仍能恢复并实际消费。
- `bun run verify` 为 183 pass / 0 fail / 906 assertions，覆盖 39 个测试文件并通过 typecheck/build。
- `bun run pack:smoke` exit code 0；prepack 同为 183/906，101-file tarball 的 Bun 与 Node ESM consumer 均通过。
- post-fix 独立只读审查返回 `No P0/P1/P2 findings.`。

因此本 ADR 只在 standalone Core 的 `harness.followUp.*` 写入权限、合法内部状态机和 legacy read compatibility 范围接受。第三方 Store、直接 Store writer、不可信插件、真实 NeuroBook/Cosmos、HTTP/SSE、浏览器、发布与生产仍未验收。

## 2026-08-13 扩展：终态自动暂停

第九十九轮吸收 NeuroBook `pauseFollowUps`：failed/aborted 终态结果 resolve 后，队列非空且未暂停时 Harness 写入 `harness.followUp.paused {paused: true, itemId, reason: "error" | "aborted", invocationId}`，`pausedBy` 投影新增可选 `invocationId`。pause 晚于终态结果异步落盘（失败吞掉、不掩盖终态），宿主用 `follow_up_state` 事件或轮询 `followUpState` 观测；resume/cancel 语义与 `admission_failed` 相同。本扩展不改变 Core-owned namespace 与写入权限。

## 2026-08-14 审计整改补充：stale watcher 归因

自动 follow-up watcher 现在携带实际尝试的 queue item ID；只有该 item 仍是当前队首且队列未暂停时，admission 错误才可写入 `pausedBy`。队首被 cancel/reorder 替换后，旧 watcher 的错误不会暂停新队首；手动 `resumeFollowUps()` 仍保留原始公共错误类型。该补充不改变 `harness.followUp.*` Core-owned namespace 或终态 pause 的 best-effort 语义。
第九十九轮吸收 NeuroBook `pauseFollowUps`：failed/aborted 终态结果 resolve 后，队列非空且未暂停时 Harness 写入 `harness.followUp.paused {paused: true, itemId, reason: "error" | "aborted", invocationId}`，`pausedBy` 投影新增可选 `invocationId`。pause 晚于终态结果异步落盘（失败吞掉、不掩盖终态），宿主用 `follow_up_state` 事件或轮询 `followUpState` 观测；resume/cancel 语义与 `admission_failed` 相同。终态 pause 为单次 best-effort：宿主并发写使 CAS 冲突时 pause 事实静默丢失（不重试、不重发 `follow_up_state`），与 NeuroBook 在 terminal mutation 内原子 pause 的差异为既定取舍，宿主据事件/轮询自行干预。本扩展不改变 Core-owned namespace 与写入权限。
