---
schema: nbook.walkthrough/v1
taskId: 00154-project-agent-skills
sequence: 004
role: tasker
status: complete
createdAt: 2026-08-24T10:23:44Z
---

# Tasker：补充 Report 仓库状态卡片

## 变更

开发者指出 `report` 未明确报告开发者关注的仓库状态。已在 `.agents/skills/report/SKILL.md` 的“当前状态”中增加固定状态卡片，要求报告：

- Task ID、Task README 路径和 Task status；
- Issue/Project 编号与状态，或 `actionIssueId: null`、授权来源和无 Issue/Project 例外；
- 当前 worktree/checkout 路径与 Task `worktreeId`；
- branch 与 Task `branchId`；
- HEAD、最新已验证 revision 和一致性；
- staged/unstaged/untracked/clean 的提交状态；
- diff 是否都能由当前 Task 解释；
- 未授权的 push、PR、合并、发布和部署动作。

无 Task、无 Issue、detached HEAD、路径不一致和未运行检查均要求显式报告，不允许推断或使用旧证据覆盖当前状态。

## 验证计划

本轮变更后执行 `docs:check`、focused governance test、scripts typecheck、`governance:check` 和 `git diff --check`；结果追加至 `evidences/final-verification.txt`，Task 通过本轮验证后恢复 `verifying`。
