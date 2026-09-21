---
schema: nbook.task/v1
taskId: 00157-post-merge-unified-review
actionIssueId: null
worktreeId: null
branchId: master
status: completed
createdAt: 2026-08-25T05:52:45Z
updatedAt: 2026-08-25T09:42:19Z
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

# Task 00157：合并后统一评审工作流

## 目标与范围

调整仓库开发工作流，使实现完成、技术审查、PR 合并与开发者统一评审成为可区分的阶段。Issue 项目条目是需求交付状态的唯一 owner：开始实现进入 `In progress`，PR 等待审查或合并后等待开发者统一评审时保持 `In review`；只有覆盖批准范围的关联 PR 全部合并，且开发者针对具体 Issue 和当前 merge revision 集合明确确认统一评审通过后才进入 `Done`。PR 条目只跟踪 PR 生命周期。

## 行为合同未变依据

本 Task 只调整仓库维护者和开发 Agent 的交付治理，不改变 NeuroBook 产品输入、输出、数据、权限、公开接口、失败语义、运行时 Agent Profile 或用户 Workspace，因此不创建或修改产品 Spec。

## 授权与边界

开发者在当前对话明确要求调整当前开发工作流，构成本地治理文档修改授权。`actionIssueId: null` 是无 Issue/Project 的本地治理例外；当前 checkout 使用 `master`，不创建 worktree 或 branch。开发者选择亲自在 GitHub UI 关闭 Project workflow #7 `Item closed`；这是本地合同生效的外部前置条件，不构成 Agent 的远端写入授权。Task 初始快照阶段未授权 commit、push、PR、合并、发布、部署或当前 GitHub Issue / Project 条目与 workflow 写入；本轮已单独授权本地 commit，`push master` 仍需明确的远端动作授权。

## 允许文件

- `AGENTS.md`
- `docs/standards/repository-workflow.md`
- `.agents/roles/pm/AGENTS.md`
- `.agents/roles/leader/AGENTS.md`
- `.agents/roles/reviewer/AGENTS.md`
- `.agents/tasks/README.md`
- `scripts/ci/agent-governance-contract.ts`
- `scripts/ci/agent-governance.ts`
- `scripts/ci/agent-governance.test.ts`
- 本 Task 目录

Tasker 合同、Issue 标签清单、产品 Spec 和业务代码保持不变。

## 验收

- `docs/standards/repository-workflow.md` 是状态机唯一正文；其它入口只保留角色动作或指针。
- `In review` 同时覆盖 PR 技术审查和 PR 合并后等待开发者统一评审；Issue 项目条目是唯一需求交付状态 owner，PR 条目不驱动它。
- PR 合并、Issue 自动关闭、Task `completed`、CI 通过和 Reviewer“建议合并”均不能单独触发 Issue 条目的 `Done`。
- 只有覆盖当前批准范围的 PR 全部合并，且开发者在当前对话针对具体 Issue 和当前 merge revision 集合明确确认统一评审通过，PM 才把对应 Issue 条目改为 `Done` 并记录完整来源。
- Reviewer 要求修复、验证未完成或统一评审失败时，Issue 条目回到 `In progress`；已关闭 Issue 需要继续同一范围时重新打开，并恢复指定实现者和准确的 `status:*`。
- 文档、治理、focused governance test 和 diff check 通过；focused test 必须覆盖状态机正文、PM / Leader / Reviewer 交接和 Task 状态边界，实际结果写入 walkthrough / evidence。

## 外部生效前置条件

Issue #131 的事件证据表明，`2026-08-25T05:35:55Z` Issue 关闭后由 `github-project-automation[bot]` 同秒把 Issue 条目置为 `Done`。开发者随后亲自在 Project UI 关闭 workflow #7 `Item closed`（`PWF_lAHOAzdmXs4BfO0pzgZ_XzY`）；Agent 于 `2026-08-25T07:25:40Z` 只读回读确认 #7 `enabled=false`，同时 #8 `Pull request merged` 仍为 `enabled=true`。远端动作由开发者执行，不构成 Agent 的远端写入授权。

当前 view 1「执行中」已通过 API 回读确认为空过滤器；这能包含关闭后仍在 `In review` 的 Issue。后续不得改回 `is:open`，否则统一评审项会从视图消失。

## 完成记录

本地状态机正文、根入口、PM / Leader / Reviewer 合同、Task 边界和静态治理门禁已经闭合。开发者已在 UI 关闭 #7 `Item closed`；只读回读确认 #7=false、#8=true，view 1 filter 为空。两轮 fresh-context 对抗审查在修复 3 项实质问题后收敛为无实质问题；advisor 后续发现的多 PR 门槛矛盾已修复并加入负向回归。最终验证见 [`evidences/final-verification.txt`](evidences/final-verification.txt)，过程见 [`walkthroughs/001-leader-2026-08-25_07-49-unified-review-workflow.md`](walkthroughs/001-leader-2026-08-25_07-49-unified-review-workflow.md) 与 [`walkthroughs/002-reviewer-2026-08-25_07-49-unified-review-contract.md`](walkthroughs/002-reviewer-2026-08-25_07-49-unified-review-contract.md)。本 Task 未获 commit、push、PR、合并、发布或部署授权。
