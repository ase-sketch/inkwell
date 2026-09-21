---
schema: nbook.task/v1
taskId: 00150-ui-spec-verification
actionIssueId: null
worktreeId: .worktree/t150-ui-spec-verification
branchId: feat/t150-ui-spec-verification
status: completed
createdAt: 2026-08-19T07:39:57Z
updatedAt: 2026-08-19T12:41:00Z
---

# nb-ui UI 规范与验证体系补齐

## 目标

补齐 nb-ui 的四块验证与规范缺口：动效规范章节（含实现对齐）、组件 token 消费静态检查、诊断实验室 e2e 全量用例、视觉回归本地基线门禁。用户在对话中直接批准目标、范围与验收条件，无 GitHub Issue（`actionIssueId: null` 经用户确认）。
本任务行为合同未变；nb-ui 的动效、token 消费和验证门禁沿用包内设计规范，未改变主应用的跨包接口或数据合同。

## 执行范围

- A：`packages/nb-ui/docs/design-language.md` 插入「七、动效」节（现七→八、八→九），判据式文体。
- B：7 处组件硬编码时长改消费 motion token；FormSelect/Dropdown 浮层补入退场过渡（`.nb-ui-popover-motion` modifier）。
- C：新增 `packages/nb-ui/src/components/token-consumption.test.ts` 静态扫描（rounded 档、写死时长、字面色、transition-all），逐条红翻转验证。
- D：`packages/nb-ui/e2e/lab.spec.ts` 按 14 条清单填充阶段 D 用例。
- E：新增 `packages/nb-ui/e2e/visual.spec.ts` 视觉基线（约 12 张，提交快照目录）；`packages/nb-ui/AGENTS.md` 完成门禁追加 `bun run test:e2e`。

不修改：CI workflow、GitHub Issue、`packages/neuro-book` 业务代码、Reka 原语内部。push 与开 PR 前单独征求用户确认，不自行合并。

## 权威来源

- 批准计划：`local://radiant-beacon-newton-_o-Lsp3G.md`（用户已在计划模式批准，含三项决策：规范+实现同批对齐、视觉回归本地门禁、只登记 Task 不开 Issue）
- 当前治理规则：根 `AGENTS.md`、`.omp/RULES.md`、`.agents/tasks/README.md`、`packages/nb-ui/AGENTS.md`
- 当前产品规范：`packages/nb-ui/docs/design-language.md`、`packages/nb-ui/docs/ui-development-spec.md`、`packages/nb-ui/docs/authoring-themes.md`

## 完成标准

- nb-ui 门禁 `bun run test`、`bun run typecheck`、`bun run build:css`、`git diff --check` 通过；D/E 完成后 `bun run test:e2e` 通过。
- 静态检查每条规则有红翻转证据；视觉基线经用户人审后提交。
- 真实 playground 桌面与 390px 验收（读元素计算样式），记录主题 × 配色、控制台与页面错误。
- 验收命令与可观察结果写入 walkthrough；未执行项明确披露。
