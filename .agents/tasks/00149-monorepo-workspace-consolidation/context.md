# 任务上下文

生成时间：2026-08-16T14:59:07Z

## 基线快照

- 当前 root 工作树提交：`d1772041a8d41fb2d819287e0acca9f01336ed0e`。
- baseline tag：`monorepo-main-app-migration-baseline-d1772041a8d41fb2d819287e0acca9f01336ed0e`。
- 迁移分支：`chore/t149-monorepo-workspace`；worktree：`.worktree/monorepo-main-app-migration`。
- `origin/master`：`5e55c54e13cd67f6e19c5361931fca1fe9ae4241`；baseline 不追赶远端，也不覆盖 root 用户改动。
- baseline 提交只包含已完成治理迁移、任务合同与 S0 摘要证据；root 未暂存用户改动不在其中。

## 任务输入

- 权威执行计划：`local://monorepo-main-app-migration-plan.md`。
- 用户明确批准计划后执行；批准不扩大计划范围。
- 根现有用户内容、`.env`、`config.yaml`、`workspace/`、`.local/`、既有停工 worktree 和六个原仓均为不可覆盖输入。

## 目标拓扑摘要

- root private orchestrator：无产品 `version`，显式列 12 个 workspace。
- `packages/neuro-book`：唯一产品身份与 Nuxt/Prisma 应用命令。
- `packages/neuro-book-contracts`：跨宿主纯合同。
- `packages/neuro-book-test-support`：测试临时根、路径、marker 和 Vitest 薄适配器。
- 六个自治项目各自保留 README、Task/docs、状态与项目专属验证；共享治理只引用根规则。
- `desktop/electron`、`packages/llmlint/web`、`packages/llmlint/skill` 保持独立安装岛。

## 数据与恢复

所有 Agent/test/fixture/browser/build scratch 使用系统临时根或明确 owner 目录。任何失败创建 `recovery/monorepo-main-app-migration-<phase>-<timestamp>` 现场并从上一绿色检查点新建修复 worktree；禁止 reset、stash、checkout 清理或 junction。

## S0 结果

1. root 工作树的 status、暂存/未暂存 diff hash、未跟踪文件 path/bytes/SHA-256已记录在 `evidences/s0-baseline-summary.json` 及其系统临时 full evidence。
2. `bun run governance:check`、`bun run test`、`bun run docs:build`、`git diff --check && git diff --cached --check`均退出 0。
3. baseline commit/tag/worktree已创建，原 root 工作树未 reset、stash、checkout 或清理。
4. 下一步重新核对六个原 checkout 并建立只读 import manifest；任何原仓聚焦验证失败都停止该包收编。

## S1 结果（2026-08-16）

- 新增私有 `@notnotype/neuro-book-test-support`，提供 `./paths`、`./tmp`、`./test-path` 和 `./vitest`；应用 System Assets snapshot 逻辑仍留 `server/workspace-files/test-workspace-fixture.ts`，只消费包内通用 marker、sweep、进程和删除工具。
- 根 workspace 已从 `packages/*` 收敛为四个真实成员：`packages/neuro-book-manager`、`packages/owned-process`、`packages/file-snapshot-cache`、`packages/neuro-book-test-support`；root、三个现有包的测试开发依赖和 `bun.lock` 同步更新。Docker deps stage 已复制 test-support manifest，保持 frozen install 合同。
- 根、Manager、owned-process、file-snapshot-cache、Desktop packaging 和 release 专用 Vitest 配置已切换到 `@notnotype/neuro-book-test-support/vitest`；旧 `scripts/utils/agent-paths`、`server/runtime/paths/test-path`、`server/workspace-files/test-tmp-sweep` 与两个旧 Vitest setup 入口已删除。
- governance 新增 workspace 运行垃圾、自治项目治理资产、Task ID 唯一性与内部包第二治理根门禁；`governance:check` 当前 `failures=[]/warnings=[]`。历史 Task 链接硬切保留显式 `--require-canonical-task-links` 入口，待 S6/S8 物理迁移同步切换，避免在旧路径测试尚未迁移时误报。
- 根 shim 分配：Manager 有包内 `proper-lockfile.d.ts`；scripts 使用 `scripts/types/proper-lockfile.d.ts` 与 `scripts/types/yazl.d.ts`；应用 shim 暂留根，随 S6 应用物理迁移。

### S1 验证

- `bun install --frozen-lockfile --linker hoisted`：通过，`1599 installs`，lockfile 未变化。
- `bun run governance:check`：通过，`failures=[]`、`warnings=[]`。
- `bun run --cwd packages/neuro-book-test-support typecheck`：通过；测试 `1 file / 7 passed`。
- `bunx tsc --noEmit -p scripts/tsconfig.json`、`bun run manager:typecheck`：均通过。
- 受影响聚焦集：owned-process `44 passed`；file-snapshot-cache `15 passed / 3 skipped`。
- 无重试的两次根 `bun run test` 分别因既有 Harness black-box trace 清理竞态出现 `1/2` 个 `ENOTEMPTY`；失败文件未被 S1 修改，单文件重跑通过；`bun run test -- --retry=3` 通过，`500 files passed / 1 skipped`、`3496 passed / 14 skipped`。SQLite experimental warning、history warm-up 注入失败和 World Engine EBUSY 为测试内预期日志。
- `git diff --cached --check`：通过；仅保留 Git 在 Windows checkout 下的 CRLF 警告边界。

## S2 结果（2026-08-16）

- 六个 S0 snapshot 已导入 `packages/nb-history`、`packages/nb-workflow`、`packages/nb-memory`、`packages/nb-ui`、`packages/neuro-agent-harness`、`packages/llmlint`；源 checkout 均未写入。
- 逐文件证据 `evidences/s2-import-summary.json`：included 1264/1264 source bytes+SHA-256 通过；exact 1225、Task relocation 140、受控变更 26、策略跳过 13、manifest excluded 71，missing/mismatch/sourceDrift 全为 0。llmlint `web`/`skill` lockfile 保留，六包根 lockfile 不导入；nb-ui PolyForm 官方 SHA-256 已核对。
- 根 workspace 已显式列 10 个成员，根 `bun.lock` SHA-256 为 `1433b696f687d2d7942c50386846a286ae5bdf77780e3b674f12e17fde490ff8`；root frozen install 检查 `1680 installs / 1938 packages` 无变化。Docker deps stage 已加入六个包 manifest。
- 包验证：nb-history 49 tests、nb-workflow 18 tests+demo、nb-memory 86 tests、nb-ui 185 tests+CSS+Playground 1280/390 smoke、Harness 529 tests+verify+pack smoke 均通过；llmlint Skill CLI 和 Web island 门禁通过。
- llmlint 根 `verify` 仍为 S0 已记录的继承缺口：367 pass / 7 fail / 7 errors，未通过的模块别名为 `llmlint/fix`、`evals-generator/agent-loop`、`#shared/analysis`；未修改业务代码掩盖。root typecheck（先安装 desktop/electron island）和 root `bun run test -- --retry=3` 均通过。

## S3 结果（2026-08-16）

- 主应用所有 History/Workflow callsite 已改为 `@notnotype/nb-history` / `@notnotype/nb-workflow`；History 按 `resolvePath` 适配当前 v0.2 API，Workflow 正式入口声明 `exports["."]`，CFG 改为静态包入口。
- `server/vendor/nb-history`、`server/vendor/nb-workflow`、两个 `VENDOR.json`、三个同步脚本、root `sync:nb-*` 命令和 tracked `assets/workspace/.nbook/agent/skills/llmlint` 镜像已删除。`packages/llmlint/skill` 成为唯一 Skill source；system assets prepare/test snapshot 共用 manifest 校验投影器，生成目标由 root `.gitignore` 忽略。
- 证据 `evidences/s3-single-source-summary.json`：真实 system-assets prepare 投影 llmlint 123 files / 921649 bytes，manifest SHA-256=`ddfe2ab5c59d7a15dbacc7d9d7d062bd605be885245206b1002889654f13c111`；运行态目标已在验证后清除。
- S3 验证：`governance:check` 通过且 failures/warnings 为空；`bun run typecheck` 通过；frozen install `1680 installs / 1938 packages` 且 lock SHA-256 前后均为 `79a377863680ae48265ebc4277d44e5df1dce832e0b441f4b5c8ade1bb19f3a8`；History `5 files / 29 tests`、Workflow `5 / 29`、llmlint `2 / 56`、System Assets `5 / 11`、Product closure `6 / 28` 均通过；root retry=3 全量 `501 files passed / 1 skipped`、`3498 passed / 14 skipped`。
- `bun pm untrusted` 列出 5 个被阻塞第三方生命周期脚本；没有 S3 验证路径需要信任，保持 fail-closed。真实 provider/model、私有 corpus、Docker、远端部署、发布和生产 Product measurement 未验收，Product owner baseline 未更新。
