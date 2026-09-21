---
schema: nbook.walkthrough/v1
taskId: 00157-post-merge-unified-review
sequence: 1
role: leader
status: completed
createdAt: 2026-08-25T07:49:00Z
---

# 合并后统一评审工作流

## 已验证问题

- 仓库开发工作流正文位于 `docs/standards/repository-workflow.md`；根 `AGENTS.md` 与 PM、Leader、Reviewer、Task 合同是执行入口。
- Issue #131 在 `2026-08-25T05:35:55Z` 被关闭，同一秒由 `github-project-automation[bot]` 写入 Project `Done`；真实外部源是 workflow #7 `Item closed`。
- 开发者亲自在 UI 关闭 #7；`2026-08-25T07:25:40Z` 只读回读确认 #7 `enabled=false`，#8 `Pull request merged` 仍为 `enabled=true`。view 1「执行中」filter 已回读为空字符串，可以包含已关闭 Issue。

## 合同决策

- Issue 项目条目是需求交付状态唯一 owner；PR 条目只跟踪 PR 生命周期。
- Issue 条目从 `In progress` 进入技术审查时改为 `In review`；PR 合并后继续保持 `In review`。
- 覆盖当前批准范围的关联 PR 全部合并后，只有开发者在当前对话针对具体 Issue 和 merge revision 集合明确确认统一评审通过，PM 才写 `Done` 并记录 Issue、条目 ID、PR、revision 与确认来源。
- Reviewer 要求修复、验证未完成或统一评审失败时退回 `In progress`；已关闭 Issue 重开后恢复指定实现者与准确的 `status: claimed` / `status: blocked`。
- `Item closed` 自动化保持关闭；`Pull request merged` 继续处理 PR 条目；统一评审视图不得使用 `is:open`。

## 实现与门禁

- 状态机正文、根入口、PM / Leader / Reviewer、Task 状态边界已同步。
- 新增 `verifyPostMergeUnifiedReviewContract()` 并接入 `governance:check`；六份 canonical 文档任一丢失必需标记时 focused test 变红。
- 多 PR 回归用例把“全部合并”退化成“关联 PR 已合并”，校验只报告 `repository-workflow.md`，恢复后回到绿色。
- RED：新增 verifier 尚不存在时 focused test 为 2 failed / 38 passed；GREEN 中间态暴露旧 CLI fixture 为 1 failed / 39 passed；修复实现、CLI 聚合、fixture 与多 PR 门槛后为 40 passed。
- 未修改 Tasker 合同、Issue 标签、产品 Spec、业务代码或现有 Project 条目。
