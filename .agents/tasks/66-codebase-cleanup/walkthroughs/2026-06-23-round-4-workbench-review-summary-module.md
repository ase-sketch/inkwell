# Round 4 - Workbench Review Summary Module

## Background

继续 Task 66 的代码清理循环。本轮目标不是扩大改动面，而是在 Round 3 已经下沉 `subjectStats` 的基础上，继续收拢 Workbench review issue 规则，让 `WorldEngineWorkbenchDialog.vue` 少承担规则计算。

## Evidence

- `git status --short` 仍显示 worktree 有大量未提交变更，因此本轮继续避免大拆。
- `docs/adr` 当前不存在，没有额外 ADR 约束。
- `CONTEXT.md` 当前稳定领域词仍以 Project Workspace、Project Path、Project SQLite、IDE Mode、Agent Mode 等为核心；本轮只改 World Engine Workbench 内部 Module，不新增领域词。
- `WorldEngineWorkbenchDialog.vue` 中仍内联：
  - `reviewTriageSummary`：遍历 review queue 统计 open / confirmed / ignored。
  - `sliceReviewSummaries`：按 slice 过滤 review queue，再统计 open / confirmed / ignored。
- Round 3 后 `buildWorldWorkbenchReviewQueueItems` 和 `buildWorldWorkbenchSubjectStats` 已在 `world-engine-workbench-real.ts`，但 review summary 规则仍分散在 Dialog。

## Assessment

候选问题：

1. **继续抽请求编排 Module**
   - 仍然不适合本轮。
   - 如果只封装 `$fetch`，Interface 会几乎等于 Implementation，是浅 Module。
   - 真正值得抽时，应同时收拢 request token、busy/error/notice、reload 后状态回流和入口差异。

2. **收拢 review summary Module**
   - 适合本轮。
   - Interface 很小：`reviewQueueItems`，或 `reviewQueueItems + slices`。
   - Implementation 包含状态计数和按 slice 分组规则。
   - 删除测试：如果删除这个 Module，计数规则会回到 Dialog、Sidebar、Inspector 或测试里，不会消失。

## Plan

- 在 `app/utils/world-engine-workbench-real.ts` 新增：
  - `buildWorldWorkbenchIssueTriageSummary(reviewQueueItems)`。
  - `buildWorldWorkbenchSliceReviewSummaries({reviewQueueItems, slices})`。
- `WorldEngineWorkbenchDialog.vue` 只保留 computed 调用，不再内联计数循环。
- 复用 Round 3 的 issue 场景，在 `app/utils/world-engine-ide-entry.test.ts` 里补行为断言。

## Changes

- `app/utils/world-engine-workbench-real.ts`
  - 新增 `buildWorldWorkbenchIssueTriageSummary`。
  - 新增 `buildWorldWorkbenchSliceReviewSummaries`。
  - 新增内部 `summarizeWorldWorkbenchReviewItems`，集中 open / confirmed / ignored 计数规则。
- `app/components/novel-ide/world-engine/WorldEngineWorkbenchDialog.vue`
  - `reviewTriageSummary` 改为调用 util。
  - `sliceReviewSummaries` 改为调用 util。
- `app/utils/world-engine-ide-entry.test.ts`
  - 在现有 Workbench util 行为测试中新增 overall summary 和 per-slice summary 断言。

## Verification

已运行：

```powershell
bunx vitest run app/utils/world-engine-ide-entry.test.ts
```

结果：

- 1 file passed。
- 4 tests passed。

本轮没有跑全量 typecheck。修改范围集中在已有窄测试覆盖的 Workbench util 和 Dialog 调用。

## Result vs Plan

- 与计划一致：没有抽请求 Module，没有改变 UI 模板和交互。
- 与计划一致：把 review summary 规则集中到 `world-engine-workbench-real.ts`。
- 额外结果：`WorldEngineWorkbenchDialog.vue` 从 2349 行降到 2334 行。

## Current Measurements

- `app/components/novel-ide/world-engine/WorldEngineWorkbenchDialog.vue`：2334 行。
- `app/utils/world-engine-workbench-real.ts`：705 行。
- `app/utils/world-engine-ide-entry.test.ts`：1755 行。

## Follow-ups

- 继续寻找 Workbench 内部和 Vue 响应式无关的规则密集点，例如 empty state 决策、filter label / view label。
- `world-engine-ide-entry.test.ts` 仍偏大，后续应继续把源码字符串断言换成 util / contract 行为测试。
- 请求编排 Module 仍需要先做 Interface 设计，不应从 `$fetch` wrapper 起步。
