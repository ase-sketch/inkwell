# Leader：S5 应用身份、双根、Source Dev 与 Prisma

## 变更

- 新增未注册 workspace 的 `packages/neuro-book/package.json`，固定应用 identity：`@notnotype/neuro-book`、S0 产品版本 `0.9.5-canary.20260814.021137Z.323410b8`、`private: true`、`type: module`。
- 新增 `scripts/utils/workspace-roots.ts`：显式区分 `repositoryRoot`、`applicationSourceRoot` 和 `.deploy`；S5 在根运行，检测到 `packages/neuro-book/nuxt.config.ts` 后为 S6 物理迁移切换应用根。
- 新增 `scripts/utils/application-package.ts`：root adapter 读取固定 manifest 路径，并复用 contracts 的严格 identity parser。Product Runtime Builder 的版本来自该 identity；lockfile/Git/staging 仍来自 repository root，Nuxt/Nitro 版本来自 application source root。
- Source Dev launcher 将应用根显式注入 `NEURO_BOOK_APPLICATION_ROOT`；未显式设置 State/Cache 时使用平台用户级根：Windows `%LOCALAPPDATA%/NeuroBook/{data,cache}`、macOS `Application Support/NeuroBook/data` + `Caches/NeuroBook`、Linux/其他 POSIX XDG data/cache 根。默认结果不落入 repository/application source root，显式配置保持原值。
- Prisma config、generate、migrate 以显式 application root 和 config root 运行；仍按 SQLite-only 合同生成 App/Project 两个 Client，deploy 继续走受控 SQLite migration adapter。
- Manager runtime-image fixture 改用 Manager verifier + contracts 自构造验证镜像，不再从 Manager 深导入 root `scripts/build` Builder；Manager package tsc 因此保持边界闭合。

## S5 聚焦验证

| 命令/场景 | 结果 |
| --- | --- |
| Source Dev / 双根 / Prisma env / Product Builder | 5 files / 33 tests passed；覆盖平台用户根、source-root containment、identity manifest、boot config 环境展开 |
| Source Dev launcher | 8 tests passed；默认 State/Cache 注入平台用户目录，显式 Cache Root 不改写 |
| scripts typecheck | `bun x tsc --noEmit -p scripts/tsconfig.json` 通过 |
| Manager typecheck + test | `bun x tsc --noEmit -p packages/neuro-book-manager/tsconfig.json` 通过；41 files / 330 passed / 3 skipped |
| Prisma 实链 | `bun run generate` 依次生成 `schema.sqlite.prisma` 与 `project.schema.prisma`；`bun run migrate:deploy` 应用 4 个 SQLite migrations；隔离临时 State Root 后清理 |
| Prisma 脚本/config 语法 | `prisma.config.ts` Bun import、`prisma-env.mjs`、`prisma-generate.mjs`、`prisma-migrate.mjs` 通过 |
| workspace governance | `failures=[]`、`warnings=[]` |

## 检查点 clean 验证

候选 commit：`b3d202ff`（`75626392` S5 实现 + `b3d202ff` Manager fixture 解耦修复）。从该 commit 创建独立 `.worktree/s5-clean-verify`，完成后已移除：

- root、`desktop/electron`、`packages/llmlint/web`、`packages/llmlint/skill` 四份 frozen install 通过。
- 四份 lock SHA-256 前后不变：
  - `bun.lock`: `8ef0f78f611089540cdae3714024b0d9bfc9427b7dfe65ea5e8a57ed35a246f1`
  - `desktop/electron/bun.lock`: `2d077a712a2b26465d9d3ae519fc5bf0ccad68a8b7630a955891d48e0ec8dd9a`
  - `packages/llmlint/web/bun.lock`: `2ad60c501682d0ae51189a1db5369d4ef5ec0040deca176245b4d2a71e620d8b`
  - `packages/llmlint/skill/bun.lock`: `6bda2ed28651c5e8d4aa931215b6eb8493da9a60f852d649a910fba5ff3c1214`
- clean Nuxt prepare、contracts `6 files / 32 tests`、S5 scripts `5 files / 33 tests`、Manager `41 files / 330 passed / 3 skipped`、Manager tsc、Electron typecheck/build/audit、Desktop contract `13 files / 41 tests`、Desktop security audit `22/22 true`、clean Prisma generate/migrate 全部通过。
- 最终 clean `git status --short` 为空；最终 governance `failures=[]`、`warnings=[]`。

## 未验收边界

真实 provider/model、私有 corpus、Docker/远端部署、Windows runner、签名发行链和公开发布仍不在本机 S5 验收范围。S6 仍需执行主应用物理迁移，并将 root build/release/CI 入口切换为 repository/application 双根编排。

## 检查点结论

S5 `application-identity-roots-source-dev-prisma` 已由 `b3d202ff` 的独立 clean worktree 验证确认绿色，可进入 S6 主应用物理迁移。
