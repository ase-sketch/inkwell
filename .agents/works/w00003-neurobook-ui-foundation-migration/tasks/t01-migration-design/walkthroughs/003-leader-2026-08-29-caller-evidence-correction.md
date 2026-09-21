---
schema: nbook.walkthrough/v1
taskId: t01-migration-design
sequence: 3
role: leader
status: verifying
createdAt: 2026-08-29T07:20:00Z
---

# t01 调用方证据更正

## 结论

`t01` 暂不视为闭合。提交 `75947f40` 只保存当前路径、场景和切片基线，不满足 Task README 的完整完成门禁，不能据此创建 planned Spec 或 A 实现 Task。

## 缺口

Task 要求 NeuroBook 当前本地实现与 nb-ui 对应公开表面逐项映射，并明确所有调用方与旧入口删除条件。现有产物只有：

- 232/72 路径集合与 16 个 basename 重叠；
- 少数 Dialog/Dropdown/IconButton/composable/util 示例；
- 14 页/31 scenario 静态基线。

这些材料没有为每个迁移候选登记完整 caller 集合，也没有把 current contract、目标 owner 和删除条件做成可机器复核的一对一记录。`sourceEvidence` 只证明来源，不等于 caller 清单。

## verifying 范围

补一份精简结构化 evidence，至少覆盖当前与 nb-ui 对应的全部公共组件、composable、util 与主题/样式入口。每条记录包含：

- current local surface 与 nb-ui target surface；
- 当前可观察合同差异；
- 通过 LSP references/结构化搜索得到的完整直接 caller；
- 目标迁移 owner；
- 旧入口删除前置条件与零引用检查；
- 静态推断、未验证与停止条件。

不修改产品源码、Proposal、Spec、依赖或 Task 身份。证据和语义审查闭合前，不创建 `ui.component-contracts`、`ui.component-lab` 或 A Task。

## 历史处理

不 amend、reset 或重写 `75947f40`；后续修正以新提交追加，保留错误关闭与更正链路。远端动作仍未授权。
