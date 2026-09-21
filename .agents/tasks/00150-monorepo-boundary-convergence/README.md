---
schema: nbook.task/v1
taskId: 00150-monorepo-boundary-convergence
actionIssueId: null
worktreeId: null
branchId: master
status: completed
createdAt: 2026-08-19T08:29:41Z
updatedAt: 2026-08-20T08:41:47Z
---

# Monorepo 边界收敛

- 本次迁移的产品行为合同未变；所有物理所有权、开发入口、治理和交付边界变化均按批准计划验证。

按已批准的 `local://monorepo-boundary-migration-plan.md` 收敛剩余物理边界：VitePress 成为整个 monorepo 的统一中英文用户文档站；应用专属脚本、Task 和运行期 Reference 归 `packages/neuro-book`；Desktop 保持根级交付宿主并通过 Manager 正式入口消费跨边界能力。

## 执行范围

- 迁移 VitePress 双语内容根、共享图片、导航、站点页面、staging 与文档治理。
- 下沉批准清单中的应用脚本，保留唯一 `source-dev.ts` 到根 `workspace-roots.ts` 的宿主 bridge。
- 整树迁移 91 个应用 Task，保留 33 个根 Task，新增 ownership manifest 与双根精确解析。
- 将 63 个运行期 Reference 文件迁入应用 assets，把 Theme/Media 迁入根 Spec，并删除根过渡书架。
- 保持 `desktop/` 根级边界，把 UAC client 收回 Manager 正式 subpath，修复 portable、workflow 和测试漂移。

## 权威来源

- 批准计划：`local://monorepo-boundary-migration-plan.md`
- Monorepo 边界唯一正文：[Monorepo Module 边界与迁移规范](../../../docs/modules/monorepo-boundaries.md)
- 当前规范注册表：[NeuroBook 规范编程](../../../docs/specs/README.md)
- 本任务改变物理所有权、开发入口、治理和交付边界；既有产品行为保持不变。Theme/Media 现有合同只在代码与测试证据闭合后迁入 `implemented` Spec。

## 完成标准

批准计划的六个迁移阶段完成 clean cutover；所有旧入口和物理根消费者删除；文档、脚本、Task、Reference、Manager/Desktop 的聚焦验证通过；全局治理、文档构建、应用和 scripts 类型检查通过。未授权的真实 Provider、Docker、Windows runner/portable、浏览器人工验收、发布、部署、tag、数据库 migration 和旧 worktree 删除继续明确记录为未执行。

## 追加边界收敛

在原计划完成后继续收敛应用交付配置：`Dockerfile*`、`docker-compose.yml`、`.env.docker.example` 与包级 `.gitignore` 归 `packages/neuro-book`；根 `.dockerignore` 因 Docker build context 仍是 monorepo 根而保留。State Root 的 `.env`、`config.yaml` 和 checkout 根 `assets/`、`workspace/` 是本机运行数据，不作为源码迁移物，不覆盖或删除。
