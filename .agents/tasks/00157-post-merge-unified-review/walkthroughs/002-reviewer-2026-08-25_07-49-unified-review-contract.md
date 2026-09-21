---
schema: nbook.walkthrough/v1
taskId: 00157-post-merge-unified-review
sequence: 2
role: reviewer
status: completed
createdAt: 2026-08-25T07:49:00Z
---

# 统一评审合同对抗审查

## 第一轮

结论：需要修复，置信度 0.97。

发现并修复三项实质问题：

1. `Done` 确认未绑定具体 Issue、Project item、已合并 PR 和 revision，存在错项或提前写入风险。
2. Issue 与 PR 项目条目未定义唯一状态 owner，合并后可能分叉。
3. Leader 把 `In review` 交接写成建议，不能保证 PM 执行状态迁移。

修正后又补齐 Reviewer 返工回退、全部关联 PR 合并门槛、关闭 Issue 重开恢复、`is:open` 视图约束，以及 workflow #7/#8 的对象边界。

## 第二轮

结论：正确，未发现实质问题，置信度 0.95。

复核覆盖提前 `Done`、Issue/PR owner、合并后统一评审、返工回退、已关闭 Issue 视图、#7/#8 自动化边界、多 PR 合并门槛和 Leader → PM 强制通知，未构造出可证实的失败路径。

## 后续 advisor 修正

advisor 发现状态表一度仍使用单数“关联 PR 已合并”，与正文“覆盖范围的关联 PR 全部合并”冲突。已统一为全部合并，并增加专门负向回归断言。

跨模型第二意见：开发者选择跳过；未计入任何验证结论。
