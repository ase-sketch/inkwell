# ADR-0035: Session Entry Parent Reference Admission

- Status: Accepted (standalone Core, first-party Memory/JSONL scope)
- Date: 2026-08-11

## Context

`SessionEntry.parentId` 是 Session tree 的恢复事实，不能在 durable append 成功后才由 `activeSessionPath()` 发现其无效。第六十二轮审查确认 public `write()` 可以持久化指向不存在 Entry 的 parent，随后 transcript/恢复才失败。

## Decision

- 领域术语：**Entry Parent Reference** 是同一 Session 内指向直接上级 Entry 的持久引用；**Active Leaf** 是当前选中 branch 末端；**Active Path** 是从 Active Leaf 沿 parent 回溯到 root 的有限链。
- draft 省略 `parentId` 继承当前 Active Leaf；显式 `null` 建立 root branch；显式非空值必须指向当前 reducer projection 中已存在的同一 Session Entry（含 inactive branch 的既有 Entry）。
- `SessionEntryDraft` 不携带 Entry ID，因此宿主不能可靠地显式引用同一 appendEntries 内尚未生成的 Entry；若 Store 提供确定性 `entryId` 使同批前序新 Entry 恰好可被引用，结果图自洽但 Core 不承诺该能力。
- 悬挂 Active Leaf、悬挂 parent、空/空白 parent、空/空白 Entry ID、重复 Entry ID 和 parent 环在 shared reducer、`normalizeSessionSnapshot()` 与 `activeSessionPath()` 统一 fail closed；历史损坏不自动修复。
- 该决定只约束 standalone Core 与 first-party Memory/JSONL 的写入/恢复边界，不新增 generic branch/fork API，不处理跨 Session 引用、merge 或自动修复。

## Consequences

- public `write()`、Profile/Tool/hook plan-array projection 与 Memory/JSONL commit 在任何 durable 写入前拒绝结构非法 plan；读取已损坏历史时 fail closed 而不是静默投影。
- 既有合法 Session 不受影响：持久化 Entry 自 0.1.0 起 `parentId` 必填
  （`string | null`）；draft 省略 `parentId`（继承 active leaf）与显式 `null`
  是唯一两种合法 legacy 写行为；手写缺失该字段的持久化 record 会 fail
  closed（与「历史损坏 fail closed」一致）。`moveLeaf` 到已存在 Entry 的
  rewind/branch 语义不变。
- 第三方 Store Adapter 若绕过 shared reducer 直接写坏 parent graph，只有其自身读取路径 fail closed；本 ADR 不宣称所有 Store 自动修复或迁移历史数据。

## Evidence and acceptance

第六十三轮实现与验证：parent admission 12 条 public regression、forced-abort unknown/waiting 收口 2 条 gate；focused `26 pass / 0 fail / 87 assertions`（parent 12 + abort-boundary 14）；`bun run verify` `359 pass / 0 fail / 1525 assertions`（54 files，typecheck/build 通过）；`bun run pack:smoke` prepack 同为 `359/0/1525`，113 files，`125.8 kB`/`597.7 kB`，Bun/Node ESM consumers 通过。

保留条件收口与后续证据（2026-08-12 复审，Carson）：

- 第六十三轮同生命周期 P1（abort 与 waiting 同步竞态）已收口：
  `abort-boundary.test.ts` 14 条 gate（forced abort terminal 未 durable 前不
  提前结算 unknown result、waiting 同步 abort 由 forced boundary 以 aborted
  收口、瞬时 conflict 重试、耗尽不伪造 terminal、单 terminal event）；
- 第六十四轮大 Session 图校验成本探针：10k Entry 线性（read 13.3ms/path
  2.8ms/commit 13.0ms），`session-graph-scale-bounded.test.ts` 锁定有界回归；
- 第六十五轮 JSONL 跨 record replay gate（跨 record 重复 ID/同批重复/环/
  悬挂 parent）锁定历史损坏读取 fail closed；
- 第六十六轮 Session Invocation coherence 与第六十七轮 Approval fact
  coherence（waiting 空/缺失 approvals 审批绕过安全洞）与本节 admission 同族
  收口；
- 全仓基线：`bun run verify` `414 pass / 0 fail / 1703 assertions`、63 files，
  pack smoke 通过（113 files，`132.0 kB`/`621.2 kB`）；commit 链
  `8142656 → a18fa05` 与 Task README 逐轮记录一致。

真实 NeuroBook/Cosmos consumer、第三方 Store（绕道 shared reducer 时只有其
自身读取路径 fail closed）、Transport/Product 验收继续单独报告，不阻塞
standalone Core acceptance。
