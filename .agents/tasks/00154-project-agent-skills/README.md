---
schema: nbook.task/v1
taskId: 00154-project-agent-skills
actionIssueId: null
worktreeId: null
branchId: master
status: verifying
createdAt: 2026-08-24T08:32:18Z
updatedAt: 2026-08-24T12:26:54Z
agentWorkflow:
  profile: nbook.agent-skills/v1
  kind: feature
  routes:
    - writing-for-agents
    - api-and-interface-design
    - incremental-implementation
    - test-driven-development
    - code-review-and-quality
  verification:
    required:
      - docs-check
      - governance-check
      - focused-test
      - typecheck
      - diff-check
    notRun: []
---

# Task 00154：项目级 Report 与 Load Role Skills

## 目标

在 `.agents/skills/` 新增主动状态汇报 Skill `report`，并以用户更正后的 `load_role` 参数化角色加载 Skill 干净替换 `agent-workflow-router`。`load_role` 使用现有 canonical `.agents/roles/<role>/AGENTS.md`，不创建第二套 `.agents/rules` 角色真相源。

## Agent 工作

- Tasker 完成 Skill、入口引用、静态治理检查和测试的干净切换，并把命令与结果写入 walkthrough/evidence。
- Reviewer 核对行为、Revision、manifest 联动和允许文件；Leader按完成门禁处理当前 `verifying` 状态。

## 开发者参与

开发者已完成命名判断：入口名为 `load_role`，并已授权当前 checkout 的本地治理修改。后续无新的参与点；Agent 在既有合同内完成验证和交付报告。

## 任务产物

- Tasker：`.agents/skills/report/`、`.agents/skills/load_role/`、引用方和治理测试，供开发 Agent 使用。
- Tasker：`evidences/final-verification.txt` 与各 Tasker walkthrough，供 Leader 验收。
- Reviewer：`walkthroughs/003-reviewer-2026-08-24_17-06-cutover-review.md`，供 Leader 判断交付。

## 修改计划

1. 切换 `report` 与 `load_role` 唯一入口并删除旧路由。
2. 同步角色、Task、Proposal 和治理校验消费者。
3. 更新 Task 135 的三份迁移 hash 登记并运行 required 检查。
4. Reviewer复核后由Leader报告仍需授权的远端动作。

## 完成门禁

- `docs-check`、`governance-check`、focused governance test、scripts TypeScript typecheck 和 `diff-check` 均有当前真实结果。
- `load_role` 是唯一角色加载入口，Task 135 三份登记一致，Reviewer无未处理 required finding。
- 不执行未授权的 push、PR、合并、发布、部署或其它远端动作。

## Leader 继续条件

Leader读取本 README、`context.md`、Reviewer walkthrough 和 `evidences/final-verification.txt`；确认 required 检查仍对应当前 diff 且没有未处理 finding 后，才能把 Task 从 `verifying` 更新为 `completed`并报告下一受限动作。

## 行为合同未变依据

本 Task 只改变开发 Agent 的仓库治理 Skill、入口引用和静态治理检查，不改变 NeuroBook 产品输入、输出、数据、权限、公开接口、失败语义、运行时 Skill 或用户 Workspace，因此不创建产品 Spec。相关治理 Proposal 保持 accepted，并记录本次干净切换。

## 授权与隔离

当前对话中开发者明确授权直接在当前 `master` checkout 修改，不创建新 worktree 或 branch。该无 Issue/Project 例外只授权本地 Task、Skill、治理合同、测试与验证；不授权 push、PR、合并、发布、部署、数据库迁移、真实 Provider/Model、浏览器人工验收或数据删除。

Task 00153 的未提交 P-005 改动继续隔离在 `.worktree/t153-p005-workflow-ux`，不并入本 Task diff；两项治理文档若存在后续集成冲突，交付时单独列明。

## 允许文件

`.omp/RULES.md`、`.agents/skills/**`、`.agents/README.md`、`.agents/tasks/AGENTS.md`、`.agents/roles/tasker/AGENTS.md`、`scripts/ci/agent-governance-contract.ts`、`scripts/ci/agent-governance.test.ts`、`packages/neuro-book/docs/proposals/agent-skills-adaptation.md`、`docs/proposals/p-005-development-workflow-governance.md`、本 Task 目录，以及经开发者授权的 `.agents/tasks/ownership.json`、`.agents/tasks/legacy-index.json`、`.agents/tasks/.migration-complete`。Task 135 正文 `packages/neuro-book/.agents/tasks/135-agent-asset-install-protocol/README.md` 只读核对，未修改；其当前 actual hash 被登记为 canonical destination。

本轮实际基线登记改动：`.agents/tasks/ownership.json` 的 Task 135 `file.sha256`、`.agents/tasks/legacy-index.json` 的 Task 135 `destinationSha256` 与顶层 `manifestSha256`、`.agents/tasks/.migration-complete` 的顶层 `manifestSha256`。`.agents/tasks/legacy-index.json` 的 `sourceRevision` 与该 mapping 的 `sourceSha256` 保持不变。

## 验证画像

必须闭合 `docs-check`、`governance-check`、focused governance test、scripts TypeScript typecheck 和 `diff-check`。实际命令与结果进入 walkthrough/evidence；Task 完成前进行独立审查，未获远端授权时不执行交付动作。
Reviewer walkthrough：[`walkthroughs/003-reviewer-2026-08-24_17-06-cutover-review.md`](walkthroughs/003-reviewer-2026-08-24_17-06-cutover-review.md)。结论为“建议合并”；本轮将用户更正后的 `load_role` 设为实际入口，修复 report 引用、Revision 合同、manifest 联动说明，并按授权同步 Task 135 三份治理登记。最新 required 验证窗口见 `evidences/final-verification.txt`；Task 135 登记当前已通过 `governance:check`（`failures: []`、`warnings: []`）。本轮同时修复 `.omp/RULES.md` 的汇报格式指针并同步范围记录。Task 继续 `verifying`；未授权远端动作。
