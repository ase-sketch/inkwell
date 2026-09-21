---
schema: nbook.walkthrough/v1
taskId: 00150-monorepo-boundary-convergence
sequence: 004
role: leader
status: in-progress
createdAt: 2026-08-19T21:00:00Z
---

# 应用 Task 双根归属收敛

## 范围

完成批准计划的应用 Task 物理归位与双根治理。根 `.agents/tasks/ownership.json` 是唯一 owner 索引；91 个批准应用 Task 目录进入 `packages/neuro-book/.agents/tasks/`，批准根 Task 保留在根，新增但未登记的根 Task 继续归根。Task 正文、历史 walkthrough/evidence 和 legacy ledger 未批量改写。

## 物理结果

- 应用 root：91 个 Task 目录、855 个迁移文件；应用包额外持有包级 `README.md` 与 `AGENTS.md`，不计入迁移文件数。
- 根 root：批准清单中的 33 个历史 Task 目录；`00150-monorepo-boundary-convergence`、`00150-ui-spec-verification` 和 `archived/` 按既有任务/历史边界保留。
- 误触的 5 个应用目录与 6 个根目录已按批准清单校正。
- ownership manifest：`schema=nbook.task-ownership/v1`、`taskCount=91`、`fileCount=855`；每个文件的 SHA-256 复用 `legacy-index.json` destination hash。

## 治理实现

- `verifyTaskMigration()` 读取 ownership manifest 后按登记 owner 精确解析；未登记 Task 只归根，不尝试应用 root fallback。
- 治理校验覆盖 tracked/index、旧 `docs/tasks` 删除、物理 bytes、ownership hash、`.gitignore`、双 root 重复和 Task ID 冲突。
- `agent-context.ts` 输出精确 `taskReadme` 与 `taskReadmeCheckedRoots`；缺失 Task 明确失败并列出已检查 root。
- 文档治理同时识别根与应用包的新 schema Task README，并覆盖应用包 Task 的 Spec/链接检查。
- `governance:migrate-task-ownership` 支持 dry-run/`--apply`；dry-run 产出系统 Temp 下的 ownership draft/report，不写仓库。

## 已验证

- `bun run governance:migrate-task-ownership`：dry-run，91 Task、855 文件、0 blocker、0 move；仅报告一条应用 research 文档旧链接 warning。
- `bun run governance:check`：`failures: []`、`warnings: []`。
- `bun x vitest run --config scripts/vitest.config.ts scripts/ci/agent-governance.test.ts scripts/ci/check-documentation.test.ts --reporter=dot`：2 files、33 tests passed。
- `bun x tsc --noEmit -p scripts/tsconfig.json`：0 errors。
- `governance:context -- --role tasker --task 01-agent-roleplay-mode`：精确返回应用 Task README。
- `governance:context -- --role tasker --task 00149-monorepo-workspace-consolidation`：精确返回根 Task README。
- 缺失 Task `99999-does-not-exist`：退出码 1，输出已检查 `.agents/tasks`，无跨 root fallback。

- Evidence: [s4-task-ownership-summary.json](../evidences/s4-task-ownership-summary.json)

## 未执行与风险

Reference 归位、Desktop 收口和最终全局验证仍未完成。真实 Docker、Windows runner/portable、浏览器人工验收、真实 Provider/Model、发布部署、tag、旧 worktree 删除和真实数据库 migration 仍未执行。`packages/neuro-book/docs/research/memory-engines-mem0-graphiti.md` 的旧 Task 链接由迁移工具作为 active research warning 单独保留，后续文档切换处理。
