---
schema: nbook.walkthrough/v1
taskId: 00150-monorepo-boundary-convergence
sequence: 003
role: leader
status: in-progress
createdAt: 2026-08-19T19:42:00Z
---

# 应用脚本边界收敛

## 范围

本轮只闭合批准计划的应用脚本归位阶段；Task 双根迁移支线停止推进。应用运行期脚本进入 `packages/neuro-book/scripts/`，应用包命令不再通过 `../../scripts` 跨根调用；根宿主只保留批准的 `source-dev.ts` bridge。既有 Task staged 迁移不在本轮提交范围。

## 物理迁移与入口

- 迁移 9 个批准脚本到 `packages/neuro-book/scripts/{smoke,seed,cli}/`，并采用批准的短名。
- 应用包新增 smoke、seed、`dev:warmup` 与 `scripts:typecheck` 命令；根应用脚本目录的对应旧入口已删除。
- `packages/neuro-book/scripts/tsconfig.json` 覆盖应用脚本 TypeScript，并显式纳入 `web-extraction-modules.d.ts`。
- `agent` smoke 暴露可注入 harness/workspace 生命周期，`finally` 保证 workspace 清理；subject RAG smoke 按现行单 source 合同分两次检索。
- Manager pack check 的运行时 `yaml` 依赖移入 `dependencies`；`semver` 作为 runtime dependency 外置，避免 Bun 压缩 bundle 重建 semver 正则时失败。

## 治理与保留边界

- 应用脚本边界治理只允许 `scripts/cli/source-dev.ts` 到 `#scripts/utils/workspace-roots` 的批准 bridge。
- 本轮没有新增 `.agents/tasks/ownership.json`、应用 Task `README.md`/`AGENTS.md`，也没有推进 Task 目录选择逻辑。
- 本轮恢复了先前误触的 Task 路径；既有 855 个 Task staged 迁移变更按用户要求保留、未改写、未提交到本 checkpoint。

## 已验证

- `bun --cwd packages/neuro-book run scripts:typecheck`：0 errors。
- `bun x tsc --noEmit -p scripts/tsconfig.json`：0 errors。
- `bun run test -- scripts/smoke/agent.test.ts server/agent/tools/sqlite-vec-smoke.test.ts`：2 files、5 tests passed。
- `bun x vitest run --config scripts/vitest.config.ts scripts/ci/agent-governance.test.ts --reporter=verbose`：14 tests passed（既有结果）。
- `bun run smoke:subject-rag`：输出 `subject-rag smoke ok`（既有结果）。
- `bun run manager:pack`：packed Manager 在隔离临时安装中通过 `--version`、`status --help`、`instances config` 与 install dry-run 路由检查。
- `bun run governance:check`：`failures: []`、`warnings: []`。
- `git diff --check`：无 whitespace error；仅有 Windows CRLF 转换提示。
- Evidence: [s3-application-scripts-summary.json](../evidences/s3-application-scripts-summary.json)

## 未执行与阻塞

真实 Docker、Windows runner/portable、浏览器人工验收、真实 Provider/Model、私有 corpus、远端部署/发布/tag、旧 worktree 删除和真实数据库 migration 仍未执行。Task 双根 ownership 治理、Reference 归位、Desktop 收口与最终全局验证仍未完成。
