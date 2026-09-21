# Issue 229 Manager installation entry 修复

实现、验证、独立 Reviewer 审查、PR #231 远端合并与 Issue #229 关闭完成。Work：`w00013-issue-229-manager-installation-entry-load`；Task：`t01-manager-installation-entry-load-fix`；原始实现提交为 `c2ff524f`，跨平台 pack smoke 修复提交为 `f8afd616`，交付记录提交为 `63953f73`。PR #231 已合并至远端 `master`，merge commit 为 `c3df7be3`；Issue #229 已以 `completed` 原因关闭。

## 根因

clean Manager build 使用 `Bun.build({target: "bun", format: "esm", minify: true})` 时，`installation-entry.ts` 通过 `manifest-store` 和 `@notnotype/neuro-book-contracts/installation` 内联 `yaml` 的 CommonJS 实现。Bun 1.3.14 将该 CJS 依赖中的 `require("process")` 生成成 `var Q9=import.meta.require`；Node/Vitest 导入产物时该绑定不可调用，因而在模块初始化阶段抛出 `TypeError: Q9 is not a function`，测试未进入用例。`portable` 入口也包含同类内联依赖模式。

## 改动

- `packages/neuro-book-manager/scripts/build.mjs`
  - 将 Manager 多入口 bundle target 改为 `node`。
  - 保留 ESM、minification、Blessed runtime plugin、所有公开 entry 和生产依赖内联。
  - 注释记录 Node/Vitest 与 Bun 双运行时消费边界及 `import.meta.require` 根因。
- `scripts/release/manager-release-contract.test.ts`
  - 新增 clean build 后的真实 Node 子进程 smoke。
  - 从生成的 `dist/installation-entry.mjs` import，检查 5 个公开导出，并调用 `installationPaths` 检查实际路径结果。
- `packages/neuro-book-manager/scripts/pack-check.mjs`
  - 在隔离 tarball 安装后用 Node 实际 import `@notnotype/neuro-book-manager/installation`。
  - 检查 `writeInstallationManifest` 与 `installationPaths` 的公开 package export 和 Windows 路径行为。

## 验证

以下命令均在实现 worktree、Bun `1.3.14` 下执行：

| 命令 | 结果 |
| --- | --- |
| `bun run --cwd packages/neuro-book nuxt:prepare` | 通过；为根 release 测试生成 `.nuxt/tsconfig.json` |
| `bun run manager:typecheck` | 通过 |
| `bun run manager:test` | 通过：Manager 41 files passed / 1 skipped；336 tests passed / 3 skipped；release contract 1 file / 4 tests passed |
| `bun run manager:pack` | 通过；packed tarball 11 files，standalone CLI、依赖闭包、Blessed 资源和隔离安装后的 `./installation` Node import smoke 均通过 |
| `bun x vitest run --config scripts/vitest.config.ts scripts/release/windows-portable-manager.test.ts` | 通过：1 file / 6 tests |
| `bun --no-install --no-env-file -e "import(...)"`（7 个 Manager entry） | 通过：所有 entry 均可由 Bun 冷加载；`installation-entry` 导出 5 项 |
| `grep` 搜索生成 `dist` 中 `import.meta.require` | 无匹配 |
| `git diff --check` | 通过 |

Windows Portable 测试第一次未运行用例，因 clean worktree 缺少 `.nuxt/tsconfig.json`；先执行 `nuxt:prepare` 后 6/6 通过。该失败是测试前置缺失，不是本修复失败。

`release-container.yml` 的 Windows job 在 `package:windows-portable` 前执行 `bun run manager:build`；因此后续正式 Windows Portable 构建会把新的 `target: "node"` Manager bundle 纳入归档。等价 clean Source/Product archive fixture 经 `windows-portable-manager.test.ts` 的完整 archive provenance、Installation Manifest、Release Manifest 和 Runtime Image identity verifier 通过。未执行远端已发布归档下载或正式 Release workflow，不能把本地等价归档结果写成真实远端归档已验收；现有已发布旧归档不因源码合并自动改变。

## 未运行项与边界

- 已执行远端 PR/Issue 写入：PR #231 已合并，Issue #229 已自动关闭；未同步 Project 状态、未发布资产、未部署且未运行正式 Release workflow。
- PR 的 `Governance and repository contracts` 检查失败于远端基线已有问题：缺失 `.agents/works/w00003-neurobook-ui-foundation-migration/tasks/t14-agent-profile-nav-lab-migration/README.md`，以及 #225 遗留的两处应用跨根 `#scripts` 导入违规；本 PR 未触及这些路径。其余相关平台、Product、文档和本地 Manager 门禁均通过。
- 未执行真实 Provider/Model、Docker 或浏览器人工验收；均不属于本 Issue 的必要门禁。
- 主工作区保留既有 `w00009` 未提交改动，未暂存、修改或删除这些改动。
- 生成 `dist`、`.nuxt`、`node_modules` 为本地忽略产物，未纳入提交；本轮隔离 worktree 清理时一并移除。
