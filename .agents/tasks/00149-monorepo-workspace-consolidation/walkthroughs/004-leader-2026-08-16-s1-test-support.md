---
schema: nbook.walkthrough/v1
taskId: 00149-monorepo-workspace-consolidation
sequence: 004
role: leader
status: complete
createdAt: 2026-08-16T17:26:39Z
---

# Leader：S1 通用测试支持与治理门禁

## 实施

- 新增私有 `@notnotype/neuro-book-test-support`：
  - `./paths`：系统 Temp、Agent temp、Vitest run、fixture、run、acceptance、cache、scratch、evidence 和 worktree resolver。
  - `./tmp`：测试临时根、fixture/snapshot marker、fail-closed sweep、owner 进程判断和 junction-safe 删除。
  - `./test-path`：`testHostPath` 与 `testAbsoluteFsPath`；绝对路径品牌改为结构兼容，包不依赖应用源码。
  - `./vitest`：globalSetup/teardown 与 worker `TMPDIR`/`TEMP`/`TMP` 收敛；应用 System Assets snapshot 仍由应用 global setup 管理。
- 根 workspace 显式列出四个现有包，三个现有包和 root 仅在 dev/test 图声明 test-support；`bun.lock` 与 Docker deps stage 同步。
- 根、Manager、owned-process、file-snapshot-cache、Desktop packaging、release 专用 Vitest 配置切换包入口；删除旧路径实现与 setup 文件。
- Manager shim 放入包内；scripts 的 `proper-lockfile`/`yazl` shim 放入 `scripts/types`，scripts tsconfig 不再 include 根 Manager shim。
- governance 新增：workspace 包 `.agent/.local/.worktree` 运行垃圾、自治包治理资产、自治包 Task ID 重复、NeuroBook 内部包第二治理根检查。历史 Task 链接检查增加显式 `--require-canonical-task-links`，待物理 Task 路径迁移后启用，避免当前既有测试仍依赖 `.agents/tasks` 时误报。

## 验证证据

| 命令 | 结果 |
| --- | --- |
| `bun install --frozen-lockfile --linker hoisted` | 通过；1599 installs，lockfile 未变化 |
| `bun run governance:check` | 通过；`failures=[]`、`warnings=[]` |
| `bun run --cwd packages/neuro-book-test-support typecheck` | 通过 |
| `bun run --cwd packages/neuro-book-test-support test` | 1 file / 7 tests passed |
| `bunx tsc --noEmit -p scripts/tsconfig.json` | 通过 |
| `bun run manager:typecheck` | 通过 |
| S1 受影响聚焦集 | owned-process 44 passed；file-snapshot-cache 15 passed / 3 skipped |
| `bun run test -- --retry=3` | 通过；500 files passed / 1 skipped，3496 passed / 14 skipped |
| `git diff --cached --check` | 通过；Windows CRLF 仅为 Git 警告边界 |

无重试的两次根全量 run 分别出现 1/2 个既有 Harness black-box 清理竞态：测试结束时异步 trace 写入仍占用 `.agent/.../.nbook/agent/traces/1`，Windows `rm` 报 `ENOTEMPTY`；失败文件未被 S1 修改，单文件重跑与 `--retry=3` 全部通过。SQLite experimental、history warm-up 注入失败和 World Engine EBUSY 均为现有测试内预期日志。

## 未运行/边界

- 未运行真实 Docker build；本阶段只运行 Dockerfile contract，并加入 test-support manifest copy。
- 未运行浏览器、真实 provider/model、私有 corpus、远端部署、发布或 push。
- 六个自治项目尚未进入 workspace，留给 S2；应用物理迁移、contracts 和历史/Workflow vendor 删除留给后续检查点。
