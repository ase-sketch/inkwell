---
schema: nbook.task/v1
taskId: 00160-leader-driven-development-workflow
actionIssueId: null
worktreeId: .worktree/t160-leader-driven-workflow
branchId: refactor/t160-leader-driven-workflow
status: completed
createdAt: 2026-08-26T00:00:00Z
updatedAt: 2026-08-27T05:58:41Z
agentWorkflow:
  profile: nbook.agent-skills/v1
  kind: refactor
  routes:
    - writing-for-agents
    - documentation-and-adrs
    - code-review-and-quality
  verification:
    required:
      - focused-test
      - docs-check
      - governance-check
      - diff-check
    notRun:
      - check: browser
        reason: 本Task仅修改开发治理文档和静态脚本，没有浏览器可见表面
---

# Task 00160：Leader 主导的顺序开发流程

## 目标

把开发治理收敛为开发者→Leader→Tasker→Leader→开发者的顺序流程，并采用Issue/Task二层模型：Issue只记录重大或长期交付，Task可关联一个Issue或作为无Issue本地工作；Agent主导执行，开发者按明示节点参与，Leader按真实结果逐个创建`planned` Task并在派发后停止。

## 授权来源

开发者明确要求Leader不等待PM，负责Issue、Spec、roadmap与Task；创建Task时区分Agent工作与开发者参与，并规定任务产物、修改计划、完成门禁和继续条件。开发者选择把Issue #193 的预建03–11收敛为路线图，后续按上游结果创建唯一下一Task。

开发者此前明确要求“提交 PR”，授权本 Task 在专用 worktree 创建本地 commit、push `refactor/t160-leader-driven-workflow` 并创建 PR；该授权不包含本轮新的push、PR更新、合并、发布、部署或 Issue/Project 元数据写入。

## 范围

- 根开发入口与仓库工作流中的角色顺序和授权边界。
- PM、Leader、Tasker、Reviewer canonical 角色合同。
- Task 创建、恢复、交接和验证合同。
- accepted P-005 的当前决策与索引。
- 与上述文本耦合的治理静态检查和测试。

## 非目标

- 不修改产品代码、产品 Spec 或 Issue #191 实现计划。
- 不执行远端Issue/Project元数据写入、合并、发布、部署、数据库迁移、真实Provider/Model、浏览器人工验收或数据删除。
- 不新增角色状态机、交接 CLI、权限沙箱或第二套 Task schema。
- 不批量改写历史 Task 和 walkthrough。

本Task只调整开发治理合同，NeuroBook产品行为合同未变，因此不创建或修改产品Spec。

## 行为合同

1. 开发者批准目标后，Leader可完成范围内本地编排，不以claimed、PM同步或逐项本地许可为前置。
2. Issue只服务重大或长期交付；Issue可含`0..N`个Task，Task通过可空`actionIssueId`关联`0..1`个Issue。
3. 不值得创建Issue的本地治理、隔离实验和机械工作继续使用`actionIssueId: null`；删除owner分叉和`issueRequired`。
4. Task目录创建即为完整`planned`合同；Task状态不再包含`draft`。roadmap不是Task，不能执行。
5. Leader必须写Agent工作、开发者参与、任务产物、修改计划、完成门禁、Leader继续条件和允许文件；派发后停止，不预建依赖未知结果的后续Task。
6. Tasker主导执行；到达开发者参与点时提供证据、选项和建议，未取得设计、观察、验证、判断或授权结果时不自行替代。
7. `research`和`design`保留专属章节；Design密封真实diff、`verifying`同合同返工、required/notRun和受限动作分别授权规则保持。
8. PM/Reviewer按需；合并前仍有人审查，高风险改动使用独立Reviewer。具体动作、范围与来源以`context.md`为准。

## 验收

- Issue/Task二层模型、可空`actionIssueId`、无Issue Task和Issue拆分阈值一致。
- Task创建即`planned`；八章节、Agent主导、开发者参与点、派发后停止和按结果创建下一Task有静态门禁。
- 根、主应用和自治包当前v1 Task使用同一合同；历史completed/abandoned和无frontmatter记录不回填。
- Issue #193 的03–11不再作为可执行Task，Task 02成为端到端样例，路线图只保存候选阶段。
- P-005、角色合同、Task/Issue合同、仓库流程和治理检查语义一致。
- 聚焦治理测试、scripts typecheck、`docs:check`、`governance:check`与diff check通过。
