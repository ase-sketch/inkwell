---
schema: nbook.walkthrough/v1
taskId: 00160-leader-driven-development-workflow
sequence: 1
role: leader
status: completed
createdAt: 2026-08-26T18:10:00Z
---

# Leader 主导的顺序开发流程

## 开发者决策

- 主线改为开发者→Leader→Tasker→Leader→开发者；Leader不等待PM、`status: claimed`或Project状态。
- Leader正式产出五类文件合同：交给下一位Leader继续拆分的Issue、不可执行的draft Task、可执行的planned Task、Proposal、Spec。
- Leader可创建`agentWorkflow.kind: design`设计Task。design Tasker可直接与开发者协作制定API等合同，只更新Task指定的Proposal/Spec草案和报告，不实现业务代码。
- 普通Tasker只通过文件合同实现、验证和报告偏差；PM与Reviewer按需。
- 开发者批准范围覆盖本地可逆动作；远端写入、push、PR、合并、发布、部署、数据库迁移、真实Provider/Model、浏览器人工验收和数据删除仍分别授权。

## 已完成合同

- 同步根入口、OMP规则、四个canonical角色、Task目录规则、Proposal/Spec生命周期、仓库Issue/Project/Git工作流与accepted P-005。
- `draft`与`planned`成为Task执行成熟度边界；`design`加入`nbook.agent-skills/v1`合法kind，并要求受控类型、唯一Proposal/Spec产物、决策范围和允许文件。
- Issue成为唯一多Task聚合根。未编号Issue使用`.agents/issues/drafts/<slug>.md`恢复；取得远端编号后创建带`actionIssueId`的同批扁平Task，闭合链接再删除草稿，不伪造Issue ID或本地`actionIssueId`。
- 根Task `00152+`和应用Task `149+`使用完整当前合同；应用ownership只接受两至五位数字ID，数值`1..148`为迁移历史。新Task拒绝缺README、错schema、非法`actionIssueId`和`parentTaskId`/`actionIssueIds`/`issueIds`。
- 旧`verifyPostMergeUnifiedReviewContract()` clean cutover为`verifyLeaderDrivenDevelopmentContract()`；检查覆盖12份canonical合同，并用表驱动mutation拒绝PM/claimed前置、planned直接授权受限动作、draft执行以及Task/PR/Reviewer/CI单独导致Project Done。
- Issue #191及其产品计划保持暂停；本Task不修改产品代码或产品Spec。

## 验证证据

- 初始RED：聚焦测试为37 passed / 3 failed；失败仅为`design`尚未合法及新verifier未实现。
- 中间GREEN：实现首轮合同后为40 passed / 40；后续增强到43 passed / 43。
- PR基线聚焦测试最终为：`bun x vitest run --config scripts/vitest.config.ts scripts/ci/agent-governance.test.ts`，52 passed / 52；覆盖根/应用Task ID、历史截止线、执行身份、Issue聚合、design边界和反向语义。
- `bun x tsc --noEmit -p scripts/tsconfig.json`：退出码0。
- PR基线`bun run docs:check`：通过，`failures: []`，`checkedFiles: 5282`。
- PR基线`bun run governance:check`：通过，`failures: []`、`warnings: []`。
- PR基线`git diff --check`与`git diff --cached --check`：均退出码0；索引恰好包含23个Task 00160目标文件，`.gitignore`已暂存，未暂存文件为空。
- 独立Reviewer两次因基础设施返回`404 Model "gpt-5.6-luna" is not supported by any configured account in this group`，未形成Reviewer通过证据。
- fresh-context审查共三轮：修复非法Task ID绕过、当前Task执行身份缺失、Issue草稿迁移顺序和目录摘要漂移；“历史Task仍校验v1基础字段”判定为合同误读，并以测试和文案澄清。三轮上限后无未处理有效finding。
- 最终完成时间：`2026-08-26T19:58:20+08:00`。ownership审计确认91个应用Task中64个为两位历史ID、27个为`101..148`历史ID、无`149+`；非法ID由owner对应门禁拒绝。
- PR交付基线：从`origin/master@8fdb304130e42fa04876b8b470bf3aaf3b9997aa`创建`.worktree/t160-leader-driven-workflow`和`refactor/t160-leader-driven-workflow`；开发者明确授权本地commit、push当前分支和创建PR。

## 工作区边界

原主工作区包含本Task外既有差异；PR交付已在专用worktree隔离，只移植Task 00160角色、流程、Task、Proposal/Spec规则、Issue草稿规则、`.gitignore`治理allowlist和治理脚本改动。未移植Task 00158/00159、Agent Harness、产品Spec、产品assets、ownership清单或`.agents/skills/report/SKILL.md`既有diff。
