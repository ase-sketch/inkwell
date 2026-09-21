# Round 3 - Workbench Subject Stats Module

## Background

继续按 Task 66 的循环推进代码清理：

1. 先从 git / tasks / 当前代码读取证据。
2. 列出问题与候选。
3. 对复杂候选做深入评估。
4. 从系统角度制定计划。
5. 修复一个低风险、高收益点。
6. 把实际结果写回 walkthrough。

本轮仍然避免大拆 `WorldEngineWorkbenchDialog.vue`。当前 worktree 有大量未提交变更，直接重组 Workbench 的 session / API orchestration 会和其它改动缠在一起。

## Evidence

- `git status --short` 显示 worktree 仍有大量 World Engine、Agent、Project Workspace、文档与模板变更。
- `docs/adr` 当前不存在，因此没有可读取的 ADR 约束。
- `docs/tasks/66-codebase-cleanup/README.md` 已将 Workbench Dialog、Preview 页面、任务 README 和高噪声静态测试列为主要清理候选。
- 当前热点行数：
  - `app/components/novel-ide/world-engine/WorldEngineWorkbenchDialog.vue`：2349 行。
  - `app/utils/world-engine-workbench-real.ts`：665 行。
  - `app/utils/world-engine-ide-entry.test.ts`：1741 行。
- `WorldEngineWorkbenchDialog.vue` 中 `subjectStats` 原本内联在 computed 里，混合：
  - subject 初始统计结构。
  - 过滤主体系统维护 slice。
  - slice / mutation 计数。
  - review issue 的 open / confirmed / ignored 计数。

## Candidate Problems

1. **Workbench 请求编排仍在 Dialog 内**
   - 这是大候选，但若只抽 `$fetch` pass-through，会形成浅 Module。
   - 真正值得抽的 Module 需要同时收敛 request token、busy/error/notice、reload 后状态回流和入口差异。
   - 本轮不做，先继续降低 Vue 文件里的纯逻辑噪音。

2. **subject stats 是可下沉的纯逻辑 Module**
   - Interface 很小：subjects、slices、reviewQueueItems。
   - Implementation 承担多个容易出错的规则：维护 slice 不计入作者浏览事件，issue triage 状态计数，未知 subject issue 不污染列表。
   - 删除测试：如果删掉这个 Module，复杂度会重新回到 Dialog 和测试里，不会消失。

3. **测试仍有大量源码字符串断言**
   - 本轮没有重写整份入口测试。
   - 只新增一个行为测试，把一部分验证面从源码字符串移动到 util Interface。

## Plan

- 在 `app/utils/world-engine-workbench-real.ts` 新增 `buildWorldWorkbenchSubjectStats`。
- `WorldEngineWorkbenchDialog.vue` 的 `subjectStats` computed 只负责传入当前响应式状态。
- 在 `app/utils/world-engine-ide-entry.test.ts` 新增一个窄行为测试，覆盖：
  - 主体系统维护 slice 不计入 subject 的 slice / mutation 统计。
  - persisted issue 和 transient issue 的 open / confirmed / ignored 计数。
  - 未登场 subject 保持零统计。

## Changes

- `app/utils/world-engine-workbench-real.ts`
  - 新增 `buildWorldWorkbenchSubjectStats(input)`。
  - 复用 `isWorldWorkbenchSubjectSystemMaintenanceSlice` 排除项目级主体系统维护 slice。
- `app/components/novel-ide/world-engine/WorldEngineWorkbenchDialog.vue`
  - `subjectStats` computed 从内联 50 行统计逻辑改为调用 `buildWorldWorkbenchSubjectStats`。
- `app/utils/world-engine-ide-entry.test.ts`
  - 新增 “真实 Workbench util 统计 subject 事件和 issue 状态” 用例。

## Verification

已运行：

```powershell
bunx vitest run app/utils/world-engine-ide-entry.test.ts
```

结果：

- 1 file passed。
- 4 tests passed。

本轮没有跑全量 typecheck。修改集中在已有测试覆盖的 Workbench util 和 Dialog 调用，按“不过度测试”原则只跑了最相关的窄测试。

## Result vs Plan

- 与计划一致：没有大拆 Workbench Dialog，也没有抽浅 API client。
- 与计划一致：只移动纯逻辑，模板和交互不变。
- 额外发现：当前 `WorldEngineWorkbenchDialog.vue` 已是 2349 行，和 Round 2 后记录的约 2286 行不一致，应以后续当前文件读数为准。

## Follow-ups

- 继续寻找 Workbench 内部其它“纯逻辑但规则密集”的下沉点，例如 empty state 决策、filter label / view label、review summary。
- 请求编排 Module 仍需先做设计，不应在没有清晰 Interface 前直接抽 `$fetch` wrapper。
- `world-engine-ide-entry.test.ts` 本身已经 1700+ 行，后续应逐步把源码字符串断言替换为更深的 util / contract 行为测试。
