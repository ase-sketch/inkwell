---
schema: nbook.walkthrough/v1
taskId: 00155-leader-role-prompt
sequence: 001
role: leader
status: complete
createdAt: 2026-08-24T14:22:58Z
---

# Leader：角色合同调优

## 基线与范围

- baseline revision：`02b1d1e70b0d69484b0862969368bfdc4d595e4e`
- 修改范围：`.agents/roles/leader/AGENTS.md` 与 Task 00155 记录。
- 行为合同未变：本轮只调整开发 Agent 的 Leader 角色合同，不改变 NeuroBook 产品或运行时 Agent Profile。
- PM、Tasker、Reviewer 合同只读对照；Task 00154 的提交后旧状态文字不在本 Task 范围。

## 合同决策

- Leader 是技术交付 owner：接收已经授权的目标，建立 Task、合同依据、验证画像、可验收切片、Tasker 交接、集成证据和 Reviewer 验收包。
- PM 继续管理 Issue、Project 与 PR 元数据；Tasker 只实现稳定切片；Reviewer 独立给出结论；产品取舍、风险接受和不可逆动作由人类决定。
- 有关联 Issue 时必须 `claimed`、指定实现者且 `blocked by` 前置项已解除；无 Issue 本地目标才可直接使用当前对话授权。一般目标授权不隐含依赖豁免。
- 每次 Tasker 派发只绑定一个稳定切片，交接包显式覆盖边界、依赖、交付物、验收、required 检查和停止条件。
- required 运行中不可用形成 blocker，不降级为 notRun；完成必须 required 全部通过、Reviewer 最终“建议合并”，产品行为变化 Spec 晋升 `implemented`，且 Task 执行合同闭合。
- 无法判断时先区分证据缺口与合同歧义；后者交回开发者。重拆分先阻塞原 Task，并保留双向链接、剩余范围和唯一 owner。

## 对抗审查

- 第一轮 fresh-context Reviewer 提出 5 项：完成结论过宽、Tasker 交接包不完整、无法判断分流不清、blocked 记录归属不清、前置依赖未成为硬门禁；全部修正。
- 第二轮 fresh-context Reviewer 提出 5 项：直接授权可能绕过依赖、派发未绑定单一切片、重拆分不可恢复、required 只需有结果、Task/Spec 生命周期未闭合；全部修正。
- 第三轮 fresh-context Reviewer 逐项核对后未发现新增实质问题，`overall_correctness: correct`，`confidence: 0.97`。
- 用户指定 `claude -p opus5` 做跨模型第二意见。已确认 Claude Code `2.1.222`，并使用 `--permission-mode plan --tools "" --no-session-persistence` 调用；命令 exit code 1，原文：`There's an issue with the selected model (opus5). It may not exist or you may not have access to it.`。未产生跨模型审查结果，不把该失败写成通过。

## 远端边界

当前授权只覆盖本地修改和验证；未授权 commit、push、PR、合并、发布或部署。
