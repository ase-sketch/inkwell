---
schema: nbook.walkthrough/v1
taskId: 00155-leader-role-prompt
sequence: 003
role: leader
status: complete
createdAt: 2026-08-24T14:37:41Z
---

# Leader：收紧 Git 动作与 PM 边界

## Advisor 修正

- 目标和范围获批不等于 branch、worktree 或 checkout 获批；Leader 合同现在要求开发者对本次动作分别明确许可后才能执行。
- branch、worktree、checkout、commit、push 和 PR 是相互独立的动作授权，一个许可不外推到其它动作。
- Leader 只消费 PM 已确认并进入 `claimed` 的 Issue 范围，或无 Issue 时当前对话明确批准的本地范围；Issue、Project 和 PR 元数据继续由 PM 管理，Leader 不复制排期职责。

## 正式证据闭合

- 已将此前实际执行的 `2026-08-24T14:27:05Z–14:27:06Z` required 终轮结果追加到 `evidences/final-verification.txt`。
- 该终轮覆盖 advisor follow-up 前已完成的 Task README、context、walkthrough、evidence 和 Leader 合同；本 follow-up 修改后必须再跑完整 required，不能沿用旧窗口证明当前最终工作树。

## 当前授权

开发者已明确授权本 Task commit + push；未授权 branch、worktree、checkout、PR、合并、发布或部署。
