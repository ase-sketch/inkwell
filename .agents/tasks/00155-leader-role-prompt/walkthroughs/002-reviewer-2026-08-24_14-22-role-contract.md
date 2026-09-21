---
schema: nbook.walkthrough/v1
taskId: 00155-leader-role-prompt
sequence: 002
role: reviewer
status: complete
createdAt: 2026-08-24T14:22:58Z
---

# Reviewer：Leader 角色合同终轮审查

## 结论

建议合并。

## 已核对

- 输入门禁区分无 Issue 的当前对话授权，与关联 Issue 的 `claimed`、指定实现者和 `blocked by` 解除条件。
- 稳定切片覆盖目标、非目标、依赖、交付物、验收、required 检查和停止条件；每次派发只绑定一个切片。
- Reviewer“无法判断”、Task blocked、同 Task 重切片与接续 Task 的状态和 owner 归属已闭合。
- 完成标准要求 required 通过、Reviewer“建议合并”、产品行为变化 Spec 晋升 `implemented`，并在全部 Task 执行合同闭合后更新 Task 状态。
- Leader 创建 PR 受单独授权约束；PM 继续维护 PR 元数据，没有可证明的权限重叠。

## 未作为证据

`claude -p --model opus5` 调用因模型不可用返回 exit code 1，未产生跨模型审查结果。
