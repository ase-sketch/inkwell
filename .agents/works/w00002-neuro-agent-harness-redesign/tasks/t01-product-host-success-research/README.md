---
schema: nbook.task/v2
taskId: t01-product-host-success-research
role: tasker
---

# 目标宿主与首版成功标准

## 目标

为 Issue #193 持久决定两个问题：`D-PRODUCT-01` 第一版首先服务哪类宿主；`D-PRODUCT-02` 宿主观察到什么结果才算第一版成功。本 Task 不设计 API，不选择 Runtime、Session、Store 或包拓扑；这些必须由本 Task 的真实结果约束后续路线。

本 Task 由 legacy `02-product-host-success-research` 原地迁入 Work 容器。迁移只切换 current 身份和路径；已有 001/manifest 保留生成时的 legacy Task ID、来源 revision 与内容，作为历史 provenance。

## 当前状态

- 来源证据、三类宿主画像与空白开发者观察模板已经完成。
- `evidences/host-evidence-manifest.json` 状态为 `evidence-ready-observation-pending`。
- 当前停止在开发者独立观察点；观察仍为 `not-recorded`。
- Agent 不得代填观察、提前写 002 简报或形成产品决定。

## Agent 工作

1. 开发者完成独立观察后，核对观察来源、未检查项和证据缺口；只有观察完整时才写 `walkthroughs/002-product-decision-brief.md`。
2. 简报分别为两个 decision ID 给出候选、建议、选错代价、可逆性和证据缺口，不修改产品合同或路线图。
3. 开发者明确判断后，Leader 写 `walkthroughs/003-product-decision-record.md`，保存引用版本、结论、拒绝项、适用范围、不服务范围和重开条件。
4. 完成门禁满足后，Leader 更新 Issue #193 路线图；不自动恢复已删除的 03–11，不预建完整后续链。

## 开发者参与

开发者阅读 `walkthroughs/001-host-evidence-and-observation.md` 与 `evidences/host-evidence-manifest.json`，填写 001 的“空白开发者独立观察模板”：每类宿主的真实需要、假想需要、明确不服务、不可接受失败、观察来源与方法、未检查项和证据缺口。

简报完成后，开发者针对 `D-PRODUCT-01` 与 `D-PRODUCT-02` 明确选择、拒绝或判定证据不足。开发者不审批 Skill、允许文件、验证命令或 Task 状态。

## 任务产物

- `walkthroughs/001-host-evidence-and-observation.md`：固定证据、三类宿主画像和观察模板；已完成。
- `evidences/host-evidence-manifest.json`：来源 provenance、覆盖、限制和阶段状态；已完成。
- `walkthroughs/002-product-decision-brief.md`：等待开发者观察完成。
- `walkthroughs/003-product-decision-record.md`：等待两个 decision ID 都有开发者判断。

## 完成门禁

- `D-PRODUCT-01` 与 `D-PRODUCT-02` 均有固定证据、开发者独立观察、决策简报、明确判断和持久记录，或明确记录为 `evidence-insufficient` 并说明缺口。
- 首要宿主有边界，不能只写“所有人”；成功标准是宿主可观察或可测量的结果，不是内部实现清单。
- 明确记录首版不服务范围、不可接受失败和两个决定的重开条件。
- 001/manifest、002、003 的引用版本一致；外部事实、研究推论和开发者判断可区分。
- `docs-check`、`governance-check` 与 `diff-check` 对 current revision 有真实结果；每个未运行项都有真实原因。

## Leader 继续条件

1. 开发者完整填写 001 的独立观察模板后，Agent 核对覆盖与证据缺口，再写 002。
2. 开发者针对两个 decision ID 和对应简报版本明确判断后，Leader 写 003 并检查完成门禁。
3. walkthrough 已记录 `evidence-insufficient`、精确缺口和所需材料时，Leader 保存阻塞并停止。

恢复所需最小集合：Issue #193、[`packages/neuro-agent-harness/docs/issue-193-roadmap.md`](../../../../../packages/neuro-agent-harness/docs/issue-193-roadmap.md)、本 README、`context.md`、001/manifest，以及存在时的 002/003。

## 决策与权限边界

开发者只决定首要宿主和首版成功标准。Runtime、Session 字段、Store、API、包拓扑、Proposal 和 Spec 不在本 Task 决策范围内。

当前不授权源码、依赖/lockfile、scratch、branch/worktree、真实 Provider/Model、Proposal、Spec、Issue/Project 远端写入、浏览器人工验收或数据删除。受限动作必须按根治理另行授权。
