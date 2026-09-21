---
schema: nbook.walkthrough/v1
taskId: 00154-project-agent-skills
sequence: 007
role: tasker
status: complete
createdAt: 2026-08-24T11:27:04Z
---

# Tasker：按当前正文同步 Task 135 治理登记

## 授权与决策

开发者明确授权在当前 `master` checkout 本地修改，采用“保留当前 Task 135 正文、更新治理登记”的策略；不执行提交、push、PR、合并、发布或部署。

## 观察值

- 物理文件：`packages/neuro-book/.agents/tasks/135-agent-asset-install-protocol/README.md`
- 当前正文 actual：`sha256:f61030bd56975e50a69edd99414a8c62c204ba151840d6f9e4d8b376c53591a7`
- 修复前 `ownership.json.sha256` 与 `legacy-index.json.destinationSha256` 均为 `sha256:00caa493f58eb042276d7b8292d97ec744562f106d2d83c583e5c5fe23ab096a`
- `sourceSha256` 保持原迁移源登记，不因 destination 漂移改写。

## 同步内容

- `.agents/tasks/ownership.json` Task 135 `file.sha256` 更新为当前正文 actual。
- `.agents/tasks/legacy-index.json` Task 135 mapping `destinationSha256` 更新为当前正文 actual。
- 按治理 contract L871-L879 对完整 mappings manifest 重算：`sha256:bd0fe64ad664533a2826a1b31e1567f842cb3ca73c721338c667892cbe8be679`。
- `.agents/tasks/legacy-index.json` 与 `.agents/tasks/.migration-complete` 顶层 `manifestSha256` 同步为该值。

## 结果

修复后的 `governance:check` 输出 `failures: []`、`warnings: []`。`.omp/RULES.md:5` 仍引用不存在的 `AGENTS.md#汇报与提问`；该文件不在本 Task 当前允许范围，本轮未修改，作为范围外残余风险保留。

## 实际 diff 范围澄清

- 实际修改：`.agents/tasks/ownership.json`、`.agents/tasks/legacy-index.json`、`.agents/tasks/.migration-complete`。
- 只读核对：`packages/neuro-book/.agents/tasks/135-agent-asset-install-protocol/README.md`；当前正文未修改、未回滚。
- 保持不变：`legacy-index.json.sourceRevision` 与 Task 135 mapping 的 `sourceSha256`。
- Task 00154 的允许文件已按开发者授权扩展，当前状态卡片不得再把这三份基线登记文件排除在实际 diff 范围之外。
