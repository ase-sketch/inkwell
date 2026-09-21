# Profile Compaction Config and History Reinjection

## User Request

- 新建 task。
- 删除 `<Compaction>` DSL 节点，采用和 `summarizer` 一样的 profile 顶层配置方式设定 compaction。
- `HistorySet` 能够在 compact 后继续注入一次。

## Goal

把 compaction 从 prompt DSL 节点迁移为 `defineAgentProfile({ compaction })` 顶层静态配置，保持“无 compaction 配置就不压缩”的入口语义；自动 compact 成功后，在同一 next-turn 边界把 profile `HistorySet` 重新注入一次，确保被摘要替换掉的初始化参考上下文可以回到模型可见历史。验证面包括 profile DSL 单测、harness compaction 行为测试、内置 profile 编译，以及相关 runtime 窄测试。

## Current State

- 2026-06-03：上一轮已移除默认 `builtin.compact`，自动和手动压缩统一依赖 profile 显式声明 compaction policy。
- `<Compaction>` 曾是 `<ProfilePrompt>` 顶层 DSL 节点，编译后进入 `ProfileTurnPlan.compaction`；本任务将其迁到 `defineAgentProfile({ compaction })` 顶层配置。
- `HistorySet` 目前只在 prepareRun 且 `context.messages.length === 0` 时写入一次；compact 后 `context.messages` 会变成 `summaryMessage + keptRecentMessages`，因此不会再次注入。

## Walkthrough

- 2026-06-03：建立本任务，计划将 compaction policy 提升到 `AgentProfile.compaction`，并在 compact 成功后显式追加一次 `HistorySet` 初始化消息。
- 2026-06-03：删除 Profile DSL 的 `Compaction` / `CompactionPrompt` / `CompactionSummaryPrefix` 节点，`ProfileTurnPlan` 不再携带 compaction；harness 改读 `profile.compaction`。
- 2026-06-03：自动 compact 成功后，harness 在 next-turn 边界重新 prepare 当前 profile，只取 `historyInitMessages` 写入 `custom_message visibleToModel`，然后重建 `RunFrame.messages`。

## Decisions

- Compaction policy 采用和 `summarizer` 一样的 profile 顶层静态配置，不再作为 prompt DSL 节点参与渲染。
- Compact 后的 `HistorySet` 重新注入只在自动 compact 成功后的 next-turn 边界发生一次；普通每轮 prepare 不重复注入。

## Files Changed

- `server/agent/profiles/types.ts`：`AgentProfile` 新增顶层 `compaction`，`ProfileTurnPlan` 删除 compaction 字段。
- `server/agent/profiles/profile-dsl.ts` / `profile-dsl/jsx-runtime.ts` / `profile-dsl-source-parser.ts`：删除 `Compaction` 相关 DSL 节点和工作台解析入口。
- `server/agent/profiles/define-agent-profile.ts` / `profile-http-service.ts`：顶层 compaction 校验与预览。
- `server/agent/harness/neuro-agent-harness.ts` / `compaction.ts`：harness 读取 `profile.compaction`，compact 后重新注入一次 `HistorySet`。
- `assets/workspace/.nbook/agent/profiles/builtin/*` 和 `workspace/.nbook/agent/profiles/builtin/*`：内置主路径 profile 迁移到顶层 `compaction`。
- `server/agent/profiles/default-profile.ts`：fallback profile 迁移到顶层 `compaction`。
- 相关 profile / harness 测试。

## Verification

- `bun scripts/build/profile.ts compile --all --system`：通过，写入 9 个 system artifact。
- `bun scripts/build/profile.ts compile --all`：通过，写入 9 个 user artifact。
- `bunx vitest run server/agent/profiles/profile-dsl.test.ts server/agent/profiles/define-agent-runtime.test.ts server/agent/harness/compaction.test.ts server/agent/harness/neuro-agent-harness.test.ts server/agent/harness/run-frame-state.test.ts server/agent/harness/prepare-next-turn.test.ts server/agent/harness/turn-failure.test.ts server/agent/harness/turn-transaction.test.ts --reporter=dot`：8 files / 152 tests passed。
- 中途同套件曾出现一次无关 approval 测试 5s timeout；单独重跑该测试通过，随后完整相关套件重跑通过。
- `bunx tsc --noEmit --pretty false`：仍失败在既有 unrelated SillyTavern / RP profile test 类型错误；本任务没有新增 compaction 类型错误。

## TODO / Follow-ups

- 无本任务后续 TODO。
