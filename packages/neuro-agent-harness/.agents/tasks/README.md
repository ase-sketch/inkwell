# NeuroAgentHarness 任务导航

本目录只保存真实执行过的 Harness legacy Task。Issue #193 原 Task 02 已在模型切换后迁入根 Work 容器；本目录不再提供 current 执行入口，路线图也不是 Task 合同。

## 当前状态

- [`01-harness-decoupling`](01-harness-decoupling/README.md)：历史项目演进记录，无 `nbook.task/v1` frontmatter，按导入历史只读。
- 原 `02-product-host-success-research` 的 current 合同与产物已迁至 [`w00002-neuro-agent-harness-redesign/t01-product-host-success-research`](../../../../.agents/works/w00002-neuro-agent-harness-redesign/tasks/t01-product-host-success-research/README.md)；legacy Task ID 与 revision provenance 保存在 current context 和原始 evidence 中。
- 后续工作只在根 `.agents/works/` 创建 Work/Task，不在本目录创建新的 Task。

## Task 与路线图区别

- 本目录中的记录只作历史 provenance，不派发 current 工作。
- 路线图只保存候选阶段、上游触发和新 Leader 复核点，没有 Task ID、owner、允许文件或授权。
- 不预建依赖未知结果的 Task 链，不从路线图恢复已删除的 03–11 草案。

## 当前人机协作

Current Task 由 Agent 主导执行。开发者只在 current README 的 `开发者参与` 节点完成设计、实际观察/验证、产品判断、风险接受或受限动作授权；不审批 Skill、文件列表或验证命令。

Issue #193 当前需要开发者阅读 current Task 的 `walkthroughs/001-host-evidence-and-observation.md` 与 evidence manifest，并填写空白观察模板。观察完成后 Agent 才能形成 `002-product-decision-brief.md`；开发者再对 `D-PRODUCT-01` 和 `D-PRODUCT-02` 判断，Leader 写 `003-product-decision-record.md`。

## 文件与权限

本目录的 README 与历史附件只作 provenance。Current Task 的 README、context、walkthroughs 和 evidences 位于根 Work 容器；源码、依赖/lockfile、Proposal、Spec、Issue/Project 远端写入、数据库迁移、真实 Provider/Model、浏览器人工验收和数据删除仍需具体授权。
