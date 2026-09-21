# Agent Compaction Visible Context Contract

## User Request

- 排查 `.agent/workspace/373.jsonl` 中频繁自动 compaction 的原因；该 session 出现大量 compaction entry。
- 理清 compaction 应有机制、bug 复现路径和系统性修复方案。
- 评估 compaction 是否能记录最近 token。
- 将 compaction 默认参数统一到可配置入口：
  - `reserveTokens = 25_600`
  - `keepRecentTokens = 24_000`
  - `enabled = true`
  - `prompt = COMPACTION_PROMPT`
  - `summaryPrefix = COMPACTION_SUMMARY_PREFIX`

## Goal

修复自动 compaction 对模型可见上下文的合同漂移，确保 compaction planner、session reducer 和 profile HistorySet reinjection 对“模型可见消息”的定义一致。完成后，长 session 不应因为重复注入的 visible `custom_message` 在 recent tail 中堆积而反复自动压缩；验证通过 `.agent/workspace/373.jsonl` 复现形态的回归测试，以及 harness/compaction 窄测试。

## Current State

- 已修复：`server/agent/harness/compaction.ts` 的 `selectCompactionPlan()` 现在按模型可见 entry 计算 recent cut，包含普通 `message` 与 `custom_message && visibleToModel`。
- 已修复：`messagesToSummarize` 与 recent cut 分离，summary 输入默认只包含普通 `message`，visible `custom_message` 参与 token/cut 预算但不交给 LLM 摘要。
- `server/agent/session/session-repo.ts` 的 reducer 继续按 `firstKeptEntryId` 保留 recent tail 中的 `message` 与 visible `custom_message`；本轮不需要修改 reducer。
- `server/agent/harness/neuro-agent-harness.ts` 继续在自动 compact 成功后调用 `reinjectHistorySetAfterCompaction()`。修复后的 cut 合同会切掉旧 HistorySet 形态的 visible `custom_message`，避免每次 reinject 后旧批次继续留在 recent tail。

## Diagnosis Evidence

- `.agent/workspace/373.jsonl` 文件约 17.1 MB。
- 文件内共有 83 条 `compaction` entry，active path 上有 82 条。
- 没有 `model_change` entry；该 session 不是由已记录的 model change 导致窗口异常。
- 第一次 compaction 的 `tokensBefore = 103692`。若模型窗口为 128000，当前默认触发线为 `128000 - 25600 = 102400`，该数值与触发点吻合。
- 后续 `tokensBefore` 曾增长到 `856594`，最后一次仍为 `681492`。
- 最新 compaction summary 只有约 1642 字符，说明膨胀不是 summary 自身导致。
- 最新 compaction 的 `firstKeptEntryId` 到 compaction entry 之间保留了约 510 个 active path entry：
  - 278 个 `custom_message`
  - 145 个普通 `message`
  - 51 个旧 `compaction`
- 重复的 HistorySet / 系统上下文在 active path 中大量出现：
  - `Available Agents`：83 次
  - `SkillCatalog`：83 次
  - `AGENTS.md`：83 次
  - `reference/agent/leader-default.md`：83 次
  - `reference/content/markdown-dialect.md`：83 次
  - `reference/agent/neurobook-project-guide.md`：52 次

## Intended Mechanism

- JSONL session 继续 append-only，不删除旧 entry。
- 自动 compact 触发时写一条 `compaction` entry，记录：
  - `summary`
  - `firstKeptEntryId`
  - `tokensBefore`
  - compaction policy details
  - planned recent-token metrics
- reducer 给 provider 的模型上下文应为：
  - 最新 compaction summary
  - 从 `firstKeptEntryId` 开始的模型可见 recent tail
- “模型可见 recent tail / cut 预算”应包含：
  - `message`
  - `custom_message && visibleToModel`
- “进入 compaction summary 的文本”与“参与 cut 预算的可见上下文”分开处理：
  - 默认只把普通 `message` 纳入 summary 输入。
  - `custom_message` 默认不进入 summary 输入，尤其是 Import/HistorySet 注入的参考文档、`system-reminder`、runtime reminder 等系统上下文。
  - 被 cut 掉的 `custom_message` 由下一次 HistorySet/relevant runtime 注入补回需要保留的系统上下文，而不是让 LLM 在 summary 中复述。
- 不参与模型上下文的 entry 不应参与 recent token 预算：
  - `leaf`
  - `custom`
  - `invocation_lifecycle`
  - invisible `custom_message`
  - `session_update` 等 projection-only state
- tool call / toolResult 的切割边界仍需保持完整。

## Bug Reproduction

1. 用 `leader.default` 创建长 session。
2. 上下文超过默认触发线：`model.contextWindow - reserveTokens`。
3. 自动 compact 写入 compaction entry。
4. harness 调用 `reinjectHistorySetAfterCompaction()`，把 profile `HistorySet` 重新写成 visible `custom_message`。
5. 下一轮继续对话或工具调用。
6. 再次 compact 时，planner 只计算普通 `message` token，忽略这些 visible `custom_message`。
7. cut point 选得过早，旧 HistorySet custom messages 被留在 recent tail。
8. 每次 compact 后又注入一批新 HistorySet，重复 visible custom messages 持续堆积，最终触发频繁 compaction。

## Decisions

- 不采用单纯的“高水位阈值”作为根因修复。该方案可能缓解频率，但不解决 planner 与 reducer 对模型可见上下文定义不一致的问题。
- compaction 的单位应从“普通 message”升级为“模型可见 session entry”。
- recent token 可以记录，而且应该记录。建议记录在 `compaction.details` 中，用于诊断和 UI 展示。
- 默认 `keepRecentTokens` 统一为 `24_000`；不保留 `leader.default` / `leader.assets` / `director` / `simulator.leader` 的 `32_000` 特例。
- 不迁移旧 JSONL session。旧 entry 保持 append-only，新 compaction/reducer 行为从后续写入开始阻止继续堆积。
- compaction metrics 写入 `compaction.details`，先作为内部诊断字段维护。
- 统一 compaction 默认配置时，同步代码默认、builtin profile 源、compiled artifacts / metadata，避免 profile 源与编译产物漂移。
- 暂不为 `custom_message` 新增 `source/origin` 字段；这轮先用“参与 cut，但默认不进 summary”的保守合同修复。后续如需要精细区分 Import、HistorySet、system-reminder、一次性 runtime context，再补来源字段。
- `enabled: true` 是 compaction plan 的默认值，不表示所有 profile 都获得全局自动 compaction。仍然只有显式配置了 compaction 的 profile 才会进入自动压缩流程。

## Proposed Fix Plan

1. 建立模型可见 entry helper
   - 新增内部类型或 helper，例如 `ModelVisibleSessionEntry`。
   - 识别 `message` 与 `custom_message && visibleToModel`。
   - 提供 `entryMessage(entry)` 将其转成 `AgentMessage`。

2. 修复 `selectCompactionPlan()`
   - recent tail token 统计包含所有模型可见 entry。
   - `firstKeptEntryId` 允许指向 `message` 或 visible `custom_message`。
   - `messagesToSummarize` 保持 summary eligibility 过滤：默认只包含被压缩掉的普通 `message`。
   - visible `custom_message` 被计入 cut/token 预算，但默认不交给 LLM summary。
   - `keepRecentTokens` 表示保留的模型可见 token，而不是只保留普通 message token。

3. 保持 tool call 边界
   - 如果 cut point 落在 `toolResult`，继续前移到对应 assistant tool call。
   - pending tool call 检查基于模型可见消息执行。
   - 如果 visible `custom_message` 未来可能包含 assistant/toolResult，也一并纳入检查。

4. 记录 compaction metrics
   - 在 `compaction.details` 中增加诊断字段，候选：
     - `recentTokens`
     - `summarizedTokens`
     - `visibleTokensBefore`
     - `firstKeptEntryType`
     - `visibleEntryCountBefore`
     - `recentEntryCount`
     - `summarizedEntryCount`
   - `recentTokens` 记录实际保留 recent tail 的估算 token。
   - `tokensBefore` 继续保留，表示 compact 前模型可见上下文估算 token。
   - `visibleTokensBefore` 与 `tokensBefore` 同口径，记录 compact 前 provider 实际模型上下文估算 token，包含 previous summary 等 reducer 产物。

5. 统一 compaction 默认值
   - `resolveCompactionOptions()` 作为默认值收敛入口；`ProfileCompactionPlan` 字段留空时统一得到：
     - `enabled: true`
     - `reserveTokens: 25_600`
     - `keepRecentTokens: 24_000`
     - `prompt: COMPACTION_PROMPT`
     - `summaryPrefix: COMPACTION_SUMMARY_PREFIX`
   - 当前 builtin profiles 都使用默认 compaction 值，不再写重复的 `reserveTokens: 25_600` / `keepRecentTokens` 覆盖。
   - `leader.default` / `leader.assets` / `director` / `simulator.leader` 当前 `keepRecentTokens = 32_000` 不再作为 profile 差异保留，统一走默认 `24_000`。

6. 测试
   - 单测 `selectCompactionPlan()` 或 `compactIfNeeded()`：
     - visible `custom_message` 被计入 recent token。
     - `firstKeptEntryId` 不会因为忽略 custom message 而指向过早位置。
     - repeated HistorySet 不会在 repeated compaction 后堆积在 reducer 输出中。
   - 回归构造 373.jsonl 的最小形态：
     - compact -> reinject HistorySet -> compact。
     - 断言第二次 compact 的 recent tail 不包含多份旧 HistorySet。
   - 保留现有 tool call / toolResult cut point 测试。

## Files Expected To Change

- `server/agent/harness/compaction.ts`
- `server/agent/harness/compaction.test.ts`
- `server/agent/session/types.ts`
- `server/agent/session/session-repo.ts`（如需共享模型可见 entry helper）
- `server/agent/profiles/default-profile.ts`
- `assets/workspace/.nbook/agent/profiles/builtin/*.profile.tsx`
- `workspace/.nbook/agent/profiles/builtin/*.profile.tsx`
- 可能需要同步 profile compile artifacts / metadata。

## Verification

- `bunx vitest run server/agent/harness/compaction.test.ts --reporter=dot`：通过，7 tests passed。
- `bunx vitest run server/agent/harness/run-frame-state.test.ts server/agent/harness/prepare-next-turn.test.ts server/agent/harness/turn-transaction.test.ts server/agent/harness/turn-failure.test.ts server/agent/harness/compaction.test.ts --reporter=dot`：通过，5 files / 26 tests passed。
- `bun scripts/build/profile.ts compile --all --system`：通过，写入 10 个 system artifact。
- `bun scripts/build/profile.ts compile --all`：通过，写入 10 个 user artifact。
- `bun scripts/build/profile.ts check --all --system`：通过。
- `bun scripts/build/profile.ts check --all`：通过。

## Implementation Notes

- `CompactionPlan.firstKeptEntry` 现在可以是普通 `message` 或 visible `custom_message`。
- 新增内部 helper：`isModelVisibleEntry()`、`entryMessage()`、`sumVisibleEntryTokens()` 等，用于把 cut eligibility 与 summary eligibility 分开。
- `compaction.details` 新增内部诊断字段：
  - `recentTokens`
  - `summarizedTokens`
  - `visibleTokensBefore`
  - `firstKeptEntryType`
  - `visibleEntryCountBefore`
  - `recentEntryCount`
  - `summarizedEntryCount`
- 回归测试新增 373 最小形态：`compact -> reinject visible custom_message -> compact`，断言旧 HistorySet 形态 custom message 不留在 reducer 输出中，且 custom message 不进入 summary prompt。
- `visibleTokensBefore` 已锁定为与 `tokensBefore` 同口径，避免二次 compaction 时 previous summary 被漏算。
- 已撤销“高水位阈值”实验性 diff，没有保留 `previousCompaction.tokensBefore + reserveTokens` 这类症状 gate。
- builtin profiles 的 `reserveTokens` / `keepRecentTokens` 覆盖已收敛为 `compaction: {}`，由 `resolveCompactionOptions()` 统一提供默认值。

## TODO / Follow-ups

- 已完成：撤销本轮诊断中关于“高水位阈值”的实验性 diff，避免把症状补丁混入根因修复。
- 已完成：实现模型可见 entry 统一 helper。
- 已完成：补 373 形态回归测试。
- 已完成：统一 compaction 默认配置和 builtin profile 覆盖方式，并同步 compiled artifacts。
- 已决策：不迁移旧 session。旧 JSONL 可不修改，新 reducer / future compaction 会阻止继续堆积。
- 已完成：明确 summary eligibility，默认排除 visible `custom_message`，避免 Import/HistorySet/system-reminder 被 LLM 摘要复述。
- 后续可考虑给 `custom_message` 增加来源字段，用于区分可重建系统上下文和一次性重要上下文；本轮不做。
