# 011-leader-2026-08-19-final-clean-runner-repair-and-docs-cutover.md

## 背景

`t149-final-verify-3` 的验证结论被生成物掩盖：该树在验证前执行过安装与构建，`registry.json`、`dist/` 等 gitignored 产物让 llmlint 与 Desktop 的前置链看起来自洽。改用迁移 worktree 自身做 clean-runner 复现后，暴露四类真实缺陷。同一轮用户追加要求：主 checkout 的 `docs/` 尚未迁入 `packages/neuro-book/docs`，需要按 monorepo 收敛完成主应用文档切换。

## 复现与修复

### 1. Manager typecheck 14 诊断（clean checkout 红态）

- 5 个测试文件（`installation-mutation`、`maintenance`、`state-integrity`、`uninstaller`、`windows-uninstall-host`）存在迁移批改残留的重复 `testHostPath` 导入（紧凑样式 + 带空格样式各一行）→ 10x TS2300，删除重复行。
- `docker.ts` 从 `#manager/types` 聚合导入 `ContainerEngine/InstallProfile/ProductComponent`，但该聚合只 re-import 不 re-export → 3x TS2459；改从 `@notnotype/neuro-book-contracts/installation` 导入，`CommandInspection` 保留 `#manager/types`。
- `app-commands.test.ts` Podman 噪声用例引用已删除的 `tmpdir()`（1x TS2304）；改用已导入的 `testHostPath("manager-podman-migration-noise-")`。

### 2. llmlint fresh-clone 缺 registry.json

删除 gitignored 的 `web/app/data/registry.json` 与 `rules-report.json` 后，根 `typecheck` 报 4x TS2307（tests 与 web/server 直接 import JSON）。根 `typecheck` 原来没有 registry 前置，而 `verify` 链以 typecheck 开头，导致 fresh-clone 下 verify 必然失败。按 web 侧既有显式前置模式改为 `registry:build && tsc --noEmit`，与 `test` 的既有前置一致。

### 3. Desktop build 依赖 Manager dist —— 不成立

clean checkout 实测 `bun run build` / `typecheck` / `audit` 全绿：`desktop/electron/build.mjs` 与源码不引用 `@notnotype/neuro-book-manager` 或 `dist/runtime-projection.mjs`。该诊断来自旧验证树的产物状态，未做修改。

### 4. testHostPath 父目录无人创建（advisory 复核发现）

`test-path.ts` 只把 `testHostPath` 拼成 `<agent-temp>/test-paths`，而 `vitest.ts` 的 global setup 只创建 `vitest/<runId>` 根，没有任何代码创建 `test-paths`。本机已有历史残留目录，掩盖了 fresh-host 上首个 `mkdtemp(testHostPath(...))` 的 ENOENT。修复：`TEST_HOST_PATHS_DIR` 常量由 `test-path.ts` 导出，`vitest.ts` 的 `setup()` 每次 run 前 `mkdir(..., {recursive: true})`；新增回归测试 `packages/neuro-book-test-support/tests/vitest.test.ts`，用全新 `NBOOK_AGENT_TEMP_ROOT` 验证 setup 后 `mkdtemp(testHostPath(...))` 直接可用。

### 5. 应用包测试漂移（同一批改的完整面）

应用包 `bun run test` 在干净检出暴露了同族遗留：tsc 报 12 个文件的重复 `testHostPath` 导入（24 诊断），esbuild transform 又抓出 5 个 tsc 未覆盖的文件；另有三个确定性缺陷——`nb-history-package-smoke` 残留 `os.tmpdir()` 引用、`workspace-archive` 丢失 `testHostPath` 导入且 corrupt-archive 子脚本硬编码旧版 `@libsql/client/lib-esm/node.js`（hoisting + 0.17.4 布局变化后失效，改用 `import.meta.resolve("@libsql/client")` 注入）、`sweepStaleFixtureRoots` 扫描系统 Temp 根而 fixture 实际创建在 agent temp fixtures 根。修复提交 `2ec6e5be`，三套件隔离跑绿。

Harness 的 abort 队列两例与 black-box 外部 signal 例在全量负载下偶发失败（ENOTEMPTY 锁释放竞态 / queue projection 时序），单跑通过；按 `docs/testing/README` 的既有 advisory 口径登记，不作为本轮变更回归。

## 主应用文档切换

按用户要求把主应用专属文档迁入 `packages/neuro-book/docs/`：

- 迁入：`adr/`、`archived/`、`migrations/`、`research/`、`runbooks/`、`specs/foundation/`、`proposals/character-workbench.md`；同时把主 checkout 未跟踪的 `research/{deepseek-harness-testing-strategy.md,vscode-extension-system.md,vscode/}` 复制进包内（用户已有工作）。
- 留根：`docs/{README,AGENTS}.md`、`standards/`、`testing/`、`modules/`、`specs/{README,AGENTS,TEMPLATE}.md`、`proposals/README.md`（monorepo 治理）。
- 链接重写：根 `AGENTS.md`、`CONTRIBUTING(.en).md`、`PROJECT-STATUS.md`、`docs/README.md`、`docs/specs/README.md`、`docs/modules/monorepo-boundaries.md`、`docs/proposals/README.md`、`docs/testing/README.md`、`reference/**` 中所有活跃链接；ADR 内部链接（`.agents/tasks`、`reference/`、`modules/`、`scripts/`）按新深度重写；归档与研究内部保留历史 provenance。
- 校验器跟随：`check-documentation.ts` 的 `REQUIRED_DOC_INDEXES`、ADR 扫描前缀、Spec 识别与活跃链接分类覆盖包内路径；`check-documentation.test.ts` 同步；`agent-governance.ts` 历史分类加包内 `docs/archived|research`。
- 发布合同切换：`docs/migrations/` 是 `state-migration-declaration.ts` 的 guide 根与 Source archive 清单路径，一并切到 `packages/neuro-book/docs/migrations/`；`release-state-migration.json` 的 guide 值、`release-assets.test.ts` fixture 同步更新。
- `docs/.vitepress/dist/` 是历史构建产物，未编辑。

## 验证（全部记录真实退出码，不使用 tail 管道状态）

- Manager：typecheck exit 0；test 41 files / 336 tests passed（3 skipped，真实 exit 0）；build exit 0（7 个 dist 产物）。
- Manager fresh-host：`NBOOK_AGENT_TEMP_ROOT=<全新空目录>` 下 `docker.test.ts` 2 files / 38 tests、真实 exit 0。
- llmlint：`bun run verify` 全链真实 exit 0；删除 registry 后 typecheck 真实 exit 0。
- Desktop：typecheck / build / audit 全绿（真实 exit 0）。
- 测试支持包：test + typecheck 真实 exit 0（2 files / 8 tests）。
- 早期文档切换验证：`docs:check` 5046 文件 failures=[]；`governance:check` failures=[]、warnings=[]；check-documentation + agent-governance + workspace-workflows 3 files / 35 tests；release-assets 21 tests；docker.test 30 tests；scripts tsc exit 0；`docs:build` 完成（仅既有 chunk size advisory）。

## 提交

- `5ac495a6` docs(main-app): move application docs under packages/neuro-book/docs
- `8bbf5296` fix: repair fresh-clone prerequisites in manager and llmlint
- `fefbc81b` fix(test-support): create testHostPath parent in vitest global setup
- `2ec6e5be` fix: repair application package test drift after workspace merge

## 未运行/阻塞
## 资源边界审计与本机启动 Smoke

用户追加要求是确认 `reference`、`assets`、`patches` 未随主应用目录迁移是否会阻止启动。审计结论：不迁移这三类目录。

- `reference/` 保持仓库级 Reference Bookshelf：`profile-dsl.ts` 通过 `NEURO_BOOK_REPOSITORY_ROOT` 解析 `reference/**`；现有 `leader-owned-plot-reference.test.ts` 以仓库根读取并通过。
- `packages/neuro-book/assets/` 是主应用系统资产 canonical root；本机 `dev:runtime` 日志确认从这里完成 `1` 个变量定义 manifest、`14` 个 profile 准备，并完成 llmlint skill projection 与 user asset sync。
- `patches/nitropack@2.13.4.patch` 是根 Bun workspace 的 patched dependency 输入，由根 `package.json`、Docker dependency stage 和 CI patch validator 共同消费；迁入应用包会破坏 workspace 安装边界。
- 计数证据：根 `reference/` 为 `67` 个 tracked 文件，包内 `assets/` 为 `224` 个 tracked 文件，根 `patches/` 为 `1` 个 tracked 文件；`packages/neuro-book/reference/` 与 `packages/neuro-book/patches/` 无 tracked 文件。
- Desktop 边界：`desktop/` 保留 49 个 tracked 文件，作为根级 Desktop Envelope（Electron/Tauri）宿主，不属于 `packages/neuro-book` 应用源码；根 `assets/` 无 tracked 文件，当前观察到的是被忽略的本机生成/运行残留。

在当前 `master` 运行：

- `bun run --cwd packages/neuro-book nuxt:prepare && bun run --cwd packages/neuro-book generate && bun run --cwd packages/neuro-book typecheck`：真实退出码 `0`。
- `bun run --cwd packages/neuro-book test -- server/agent/profiles/leader-owned-plot-reference.test.ts server/agent/profiles/leader-assets-profile.test.ts --reporter=dot`：`2 files / 18 tests passed`。
- `PORT=3149 NUXT_PORT=3149 NITRO_PORT=3149 bun run --cwd packages/neuro-book dev`：Nuxt/Nitro 监听 `127.0.0.1:3149`；随后 `GET /`、`GET /api/hello`、`GET /api/app/version`、`GET /api/agent/skills`、`GET /api/agent/profiles/catalog`、`GET /api/agent/workflow/catalog` 均返回 HTTP `200`。`/api/hello` 返回 `Hello from Nuxt server api` 及时间戳。

本次验证产生的 Prisma generated client 差异已恢复；资源审计未发现需要修改的源码路径，因此没有新增代码迁移提交。

真实 Docker 镜像构建、Windows runner、浏览器人工验收、真实 Provider、Windows portable 与最终绿色 tag 仍按计划记录为阻塞；Task 保持 `blocked`。

## 文档计数与目录边界收口

- 早期文档切换验证记录 `docs:check` 为 5046 files，发生在资源审计证据加入前；该数字保留为历史运行记录，不代表最终收口计数。
- 资源审计后的最新实际 `bun run docs:check` 输出为 `checkedFiles: 5047`、`failures: []`；README 与 evidence 均以 5047 files 作为最终收口记录。
- 目录归属最终确认：`packages/neuro-book/assets/` 为主应用系统资产 canonical root；`desktop/` 保持根级 Desktop Envelope；根 `reference/` 与 `patches/` 分别保持仓库级 Reference Bookshelf 和 workspace patched dependency 输入；根 `assets/` 无 tracked 文件且不作为迁移源。
