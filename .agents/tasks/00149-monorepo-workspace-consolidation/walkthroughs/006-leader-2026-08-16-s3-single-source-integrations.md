---
schema: nbook.walkthrough/v1
taskId: 00149-monorepo-workspace-consolidation
sequence: 006
role: leader
status: complete
createdAt: 2026-08-16T20:05:00Z
---

# Leader：S3 删除 vendor 与同步双真相源

## 实施

- 主应用所有 History 消费者改用 `@notnotype/nb-history`；`WorkspaceHistory.open()` 按当前包的 `resolvePath` 合同把 Project 相对路径映射回磁盘。History 包冒烟测试移出 vendored 命名，保留真实写入、timeline、diff、purge 和 close/delete 验收。
- 主应用所有 Workflow 消费者（包括 Vue 展示组件）改用 `@notnotype/nb-workflow`；Workflow 包增加正式 `exports["."] = "./src/index.ts"`，CFG 使用静态包入口 `extractCfg`，不保留 `await import()` 或 tsconfig sibling-src alias。为保持现有 pending ask 展示合同，包类型保留可选 Markdown `AskSpec.description`。
- 删除 `server/vendor/nb-history`、`server/vendor/nb-workflow` 及两个 `VENDOR.json`；删除 `scripts/cli/sync-nb-history.ts`、`scripts/cli/sync-nb-workflow.ts`、`scripts/cli/sync-llmlint-skill.ts` 和 root `sync:nb-*` 命令。过时的 History v0.2 vendor 迁移说明一并删除。
- 删除 tracked `assets/workspace/.nbook/agent/skills/llmlint` 镜像。新增 `server/workspace-files/llmlint-skill-projection.ts`：Source 唯一读取 `packages/llmlint/skill`，排除 `node_modules`、评测目录、用户/运行状态、构建目录、env/log 和特殊文件；目标文件集合、逐文件 SHA-256 与 `package.json` name/version/manifest hash 在复制后双向校验。目标路径由 root `.gitignore` 忽略，运行时可重建。
- `prepareSystemAssets()` 在可写 Source/Product preparation 阶段执行 llmlint projection；只读 Product runtime root 不重写已验证 image。测试 global setup 在共享 system-assets snapshot 前执行同一投影，避免 clean checkout 因 tracked mirror 删除而失去 Skill。
- llmlint 主应用测试的源码 helper 改从 `packages/llmlint/skill` 静态导入；CLI/catalog 行为仍经过 system asset projection 语境验证。llmlint package README、英文 README、root 状态、v0.9 changelog 和测试手册改为唯一 source/projection 表述；历史 Task 正文中的考古同步记录未批量改写。

## 证据

正式证据：[`evidences/s3-single-source-summary.json`](../evidences/s3-single-source-summary.json)。

- 真实 `bun run system-assets:prepare`：1 个 variable definition、14 个 profile、0 个 stale profile；llmlint projection `123` files / `921649` bytes；source manifest SHA-256 `ddfe2ab5c59d7a15dbacc7d9d7d062bd605be885245206b1002889654f13c111`。
- projection smoke 结束后删除运行时生成的 tracked-target 路径，工作树不保留镜像副本；安装/测试时由准备器重建。
- root package 新增 `@notnotype/nb-history`、`@notnotype/nb-workflow` workspace 依赖；frozen lockfile 通过，`bun.lock` 前后 SHA-256 均为 `79a377863680ae48265ebc4277d44e5df1dce832e0b441f4b5c8ade1bb19f3a8`。
- `bun run governance:check` 通过，`failures=[]`、`warnings=[]`；`bun run typecheck`（Nuxt + Electron）通过；`git diff --check` 通过，仅有 Windows 换行转换提示。

## 验证

| 命令/场景 | 结果 |
| --- | --- |
| History 应用集成 | 5 files passed；29 tests passed |
| Workflow 应用集成 | 5 files passed；29 tests passed |
| llmlint Skill catalog/CLI | 2 files passed；56 tests passed |
| System Assets projection/preflight | 5 files passed；11 tests passed |
| Product module closure/bundle/contracts | 6 files passed；28 tests passed |
| root 全量回归 | `bun run test -- --retry=3`：501 files passed / 1 skipped；3498 tests passed / 14 skipped |
| 安装图 | `bun install --frozen-lockfile --linker hoisted`：1680 installs / 1938 packages；lockfile 无变化 |

全量回归日志中的 SQLite experimental、注入的 History maintenance、注入的 World Engine EBUSY 和非法 Workflow 请求警告均为既有/测试内预期日志；没有失败测试。

## 未验收边界

- 未运行真实 provider/model、私有 corpus、Docker build、远端部署、发布或生产 Product build；因此未更新 Product owner baseline。Product closure 是现有 contract/module/bundle 测试，不等同于实际发布镜像测量。
- `bun pm untrusted` 仍列出 5 个第三方生命周期脚本依赖；本阶段未信任它们。当前类型、聚焦测试、全量测试和 system-assets prepare 均不需要放开这些脚本，继续保持 Bun fail-closed 策略。
- llmlint root `verify` 的 S0 已知 367 pass / 7 fail / 7 errors 别名缺口未在 S3 修复；S3 只验证主应用从唯一 Skill 源投影后的 catalog/CLI 集成。

## 检查点

S3 `single-source-integrations` 已具备提交条件：源码无 History/Workflow vendor import，vendor/sync 文件删除，llmlint 镜像删除且可由 `packages/llmlint/skill` 重建；下一阶段为 S4 contracts 与 Manager/Desktop/scripts 边界拆分。
