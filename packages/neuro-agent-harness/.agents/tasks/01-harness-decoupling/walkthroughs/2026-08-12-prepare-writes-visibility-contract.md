# 第九十一轮：prepareWrites 可见性合同钉住 + in-invocation compaction 索引错位修复

## 状态

第八十八轮 parity 对照代理 B（Hume）的 P3（prepareWrites 可见性陷阱）收口。
先判定「合同而非缺陷」用测试钉住；随后独立审查（James P2-1）引出
in-invocation compaction 边界，探针复现 work-copy/path 索引错位缺陷并修复
（`src/` 变更）。本轮 = 合同钉住 + 真实缺陷修复 + 文档；用户保护文件未纳入
范围。

## 规划依据（Hume P3 + 本轮实现核查）

- Hume 证据（第八十八轮行号快照）：SA 的 `messages` 数组在 prepareWrites
  commit 之前构建，provider request 与 compaction 预算看不到刚写入的
  durable contribution；NB 写入后重读 snapshot 再组装，写入即对模型可见。
- 本轮实现核查（当前行号）：messages 工作副本构建于 harness.ts:1371，
  prepareWrites 提交于 1390-1392；`commitMessages` / `commitWritePlans` /
  hook writePlans 只落盘、不更新工作副本（applyEffect 只 push
  runtimeMessages）；provider request 由 `composeContextMessages(messages,
  turnContext)` 组装，不含宿主条目；ContextProvider 读最新 Snapshot
  （1423）立即可见；下一 Invocation 在 1371 从最新 Snapshot 重建后可见。

## 判定：合同而非缺陷（钉住部分）

- 修复选项（提交后重读 snapshot 自动注入）会破坏既有双写消费方（context
  sections + prepareWrites 同时提供会重复）并改变 provider-visible 消息
  顺序（贡献插入到当前用户消息之前）；context-lifecycle 既有测试即双写
  模式并断言文本恰好出现 1 次。
- 按目标规则（只有证据证明 Core 缺口才扩展公共 API/建立 ADR），无真实
  消费者迁移证据前不做破坏性合同变更；当前行为已有明确 seam（context
  sections 与 ContextProvider 承担同轮可见性）。

## 变更（钉住 + 文档）

- `tests/context-lifecycle.test.ts` 新增第 5 条：仅 prepareWrites（不重复
  context）的贡献对模型延迟到下一 Invocation 可见——第一次 invoke 的
  provider request 不含 `deferred:<inv1>`，第二次 invoke 的 request 含
  `deferred:<inv1>` 但不含 `deferred:<inv2>`（本轮贡献在 prepareWrites
  提交前构建）。
- `docs/adr/0012-durable-context-contribution-entry.md` 新增「2026-08-12
  provider 可见性边界」小节（两层可见性、与 NeuroBook 差异、单独 ADR
  候选、compaction 边界）。
- `CONTEXT.md` 新增对应不变式条款。

## 探针复现与修复（in-invocation compaction 索引错位）

- James P2-1 指出：文档「同一 Invocation 只看到 Harness 提交的消息」在
  compaction 路径下不绝对成立——`compactIfNeeded` 执行压缩后会用最新
  Snapshot 重建工作副本。
- 探针（prepareWrites 贡献 CONTRIB + compaction trigger 2/keep 1 + Tool
  循环）复现更深的缺陷：run 的 messages 工作副本在 prepareWrites 提交前
  构建，与 path 索引错位——`projection.entries[keepIndex]` 少算了贡献
  条目偏移，`firstKeptEntryId` 指向错误 entry。后果：CONTRIB 被投影整体
  丢弃（既不在摘要窗口也不在保留区），且被摘要的 u1 在保留区重复出现。
- 修复：`compactIfNeeded` 改用 `projectSessionTranscript(snapshot)` 的
  对齐投影（messages）做触发计数、walk-back、toolResult cut 与摘要窗口；
  work-copy 仅在压缩提交后照旧 splice。对齐视图使宿主贡献进入摘要窗口、
  `firstKeptEntryId` 指向真实 entry、无重复/丢失。不配置 compaction 时
  行为不变（第 5 条钉住测试仍成立）。
- `tests/compaction-splitting.test.ts` 新增第 6 条：贡献进入摘要窗口
  （`["CONTRIB", "{}"]`）、投影 `["S", "toolCall", "ok", "a2"]` 无重复/
  丢失、durable 记录保留贡献。public red 先行（修复前摘要窗口 `["{}"]`、
  投影含重复 `"{}"` 且丢 CONTRIB）；初版 trigger 2 使压缩提前到 turn 1
  （窗口 `["CONTRIB"]`，u1 保留），改为 trigger 3 让压缩发生在 turn 2 以
  演示对齐修复。
- `CHANGELOG.md` Unreleased 新增 fix 条目。

## 门禁

- focused：`bun test tests/compaction-splitting.test.ts tests/compaction.test.ts
  tests/compaction-events.test.ts tests/context-lifecycle.test.ts
  tests/core-owned-entry-admission.test.ts tests/model-turn-partial.test.ts
  tests/recovery.test.ts tests/fork-session.test.ts
  tests/tool-write-plan-batch-admission.test.ts` → `48 pass / 0 fail /
  226 assertions`（9 files；修复前同集合为 48/1/226，唯一失败即第 6 条
  red）。
- `bun run verify`：`453 pass / 0 fail / 1863 assertions`，76 test files；
  typecheck/build 通过（42.17s，串行模式）。
- `bun run pack:smoke`：通过——prepack 同为 453/0/1863，tarball 113 files、
  138.7 kB / 643.6 kB unpacked，Bun 与 Node ESM consumer 均通过。
- `git diff --check` 仅 Windows LF/CRLF warning。

## 结论

- prepareWrites / hook / Tool writePlans 的 provider 可见性合同已测试钉住并
  文档化：durable 贡献对 ContextProvider 与下一 Invocation 可见；当前
  Invocation 的模型调用（未发生 in-invocation compaction 时）需要 context
  sections 重复提供；compaction 场景使用对齐投影，贡献进入摘要窗口。
- 修复宿主贡献 + compaction 组合的索引错位缺陷（贡献丢失 + 摘要消息
  重复），cut 点与 `firstKeptEntryId` 始终指向真实 entry。

## 未验证与保留边界

- 真实 NeuroBook/Cosmos consumer、真实 provider/tool、第三方 Store、
  HTTP/SSE、浏览器/产品和生产验收仍未运行。
- 仍为候选：`turn_end waiting` 语义、pausedBy/自动 pause、per-event 字节
  预算（P2）；窗口保护（C10）与手动 compact（C11）需新合同；自动注入
  ADR（等真实消费者证据）。

## 独立审查

- 只读独立审查（James）：机制依据（messages 工作副本 1371 vs prepareWrites
  1390-1392）、钉住测试断言与实现一致、ADR/双写论证成立、focused
  `33/0/148` 实测复现；**No P0/P1**。
- P2-1（in-invocation compaction 使贡献在压缩后进入 transcript）：经探针
  升级为真实缺陷并修复（见「探针复现与修复」）；文档改为限定「未发生
  in-invocation compaction 时」并记录 compaction 边界。
- P2-2（历史行号漂移）：Hume 证据行号属第八十八轮快照，已按历史引用标注。
