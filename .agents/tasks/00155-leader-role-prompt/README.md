---
schema: nbook.task/v1
taskId: 00155-leader-role-prompt
actionIssueId: null
worktreeId: null
branchId: master
status: completed
createdAt: 2026-08-24T13:52:33Z
updatedAt: 2026-08-24T14:37:41Z
agentWorkflow:
  profile: nbook.agent-skills/v1
  kind: refactor
  routes:
    - writing-for-agents
    - api-and-interface-design
    - doubt-driven-development
    - code-review-and-quality
  verification:
    required:
      - docs-check
      - governance-check
      - focused-test
      - diff-check
    notRun: []
---

# Task 00155：调优 Leader 角色提示词

## 目标与范围

参考 `.agents/roles/pm/AGENTS.md` 已有的角色、资料索引、输入分流、工作步骤和权限边界，重写 `.agents/roles/leader/AGENTS.md`。Leader 聚焦已授权目标的技术交付：建立 Task 与合同依据、拆分可验证切片、组织 Tasker、集成证据并请求 Reviewer 独立验收。

## 行为合同未变依据

本 Task 只调整开发 Agent 的 Leader 角色合同，不改变 NeuroBook 产品输入、输出、数据、权限、公开接口、失败语义、运行时 Agent Profile 或用户 Workspace，因此不创建或修改产品 Spec。

## 授权与边界

开发者在当前对话明确要求“调 leader 的 role 提示词，可以参考 pm 的”，构成本地文档修改授权。`actionIssueId: null` 是无 Issue/Project 的本地例外；当前 checkout 使用 `master`，不创建 worktree 或 branch。开发者随后明确授权本 Task 执行 commit + push；该授权不外推到 branch、worktree、checkout、PR、合并、发布或部署。

## 允许文件

`.agents/roles/leader/AGENTS.md` 与本 Task 目录。PM、Tasker、Reviewer 角色合同作为边界依据只读，不在本轮同步改写；Task 00154 的提交后状态文字残留不属于本 Task。

## 验收

- Leader 与 PM、Tasker、Reviewer、人类维护者之间的责任边界唯一且无重叠。
- 已批准目标进入 Task、技术切片、`agentWorkflow`、集成和独立验收的步骤有可检查完成条件。
- Issue/Project 元数据继续由 PM 管理；Leader 只提供技术内容，不把 `ready` 当作具体实现授权。
- 产品歧义、范围扩大、数据/安全/迁移/发布风险会停止实现并交回人类决策。
- 文档链接、治理合同、focused governance test 和 diff check 通过，实际命令结果进入 walkthrough/evidence。

## 完成记录

Leader 合同已按 PM 的信息结构完成重写，三轮 fresh-context 对抗审查后无剩余实质问题；advisor follow-up 进一步明确范围授权不替代 branch、worktree 或 checkout 的逐次许可，且 Leader 只消费 PM 已确认的 `claimed` 范围，不复制排期职责。正式 required 结果见 [`evidences/final-verification.txt`](evidences/final-verification.txt)，过程与角色边界见 [`walkthroughs/001-leader-2026-08-24_14-22-role-contract.md`](walkthroughs/001-leader-2026-08-24_14-22-role-contract.md)、[`walkthroughs/002-reviewer-2026-08-24_14-22-role-contract.md`](walkthroughs/002-reviewer-2026-08-24_14-22-role-contract.md) 和 [`walkthroughs/003-leader-2026-08-24_14-37-git-action-boundary.md`](walkthroughs/003-leader-2026-08-24_14-37-git-action-boundary.md)。Claude Opus 5 跨模型调用因模型不可用失败，未产生第二意见；该失败未被记作通过。开发者已授权本 Task commit + push，尚未授权 PR、合并、发布或部署。
