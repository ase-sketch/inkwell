---
schema: nbook.walkthrough/v1
taskId: 00150-monorepo-boundary-convergence
sequence: 006
role: leader
status: completed
createdAt: 2026-08-20T08:41:47+08:00
---

# 应用配置、交付入口与 Workspace 边界续作

## 结论

本轮追加边界收敛已完成，Task 保持 `completed`。主应用交付配置已从根移入 `packages/neuro-book`；发布 workflow、Manager Source Docker builder、Compose、忽略规则和应用根解析均已切换到新 owner。根 `.dockerignore` 保留，因为 Docker build context 仍必须是 monorepo 根以安装全部 workspace。

## 资产与 Workspace 结论

- `packages/neuro-book/assets/` 是已跟踪的应用分发资产：`assets/workspace/` 是系统 `.nbook` 模板/profile/skill，`assets/reference/` 是运行期 Reference。
- checkout 根 `assets/` 是历史运行残留/生成资产，根 `workspace/` 是本机用户数据；两者均未复制、覆盖或删除。
- `bun --cwd packages/neuro-book run dev` 通过 `source-dev.ts` 注入 State Root。Windows 默认 State Root 为 `%LOCALAPPDATA%/NeuroBook/data`，实际 Workspace 为 `%LOCALAPPDATA%/NeuroBook/data/workspace`；只有显式设置 `NEURO_BOOK_STATE_ROOT` 才改变它。当前运行环境未设置该变量。
- `.env`、`config.yaml` 是 State Root 本机运行文件，不是源码迁移文件。仓库 canonical 示例为 `packages/neuro-book/.env.example`、`.env.product`、`.env.typecheck`、`.env.docker.example` 和 `config.example.yaml`。

## 物理迁移

迁移到 `packages/neuro-book/`：

- `Dockerfile`
- `Dockerfile.runner`
- `docker-compose.yml`
- `.env.docker.example`
- `.gitignore`（应用生成物与本机运行态；根 `.gitignore` 继续负责 monorepo-wide 规则）

同时修正：

- `.github/workflows/release-container.yml` 的 `docker/build-push-action@v6.with.file` 为 `packages/neuro-book/Dockerfile`。
- `publish-ghcr-image.mjs`、Manager `buildSourceDockerImage()` 和对应测试的 Dockerfile 路径。
- Docker contract 明确断言 workflow 的 `context: .` 与 `file: packages/neuro-book/Dockerfile` 相邻存在；根 Dockerfile 缺失也有负断言。
- `resolveApplicationRoot()` 拒绝把 monorepo 根遗留 `assets/workspace` 识别为应用根；Source Dev 仍解析到 `packages/neuro-book`。
- 根 `.gitattributes`、CI trigger、社区文件校验、边界正文、应用包规则和中英文 Operator 文档。

## 本轮验证

- Docker/Workflow 合同：3 files、11 tests passed；包含 `release-container.yml` 的 `file: packages/neuro-book/Dockerfile` 断言。
- Source Dev/Workspace/系统 assets：3 files、11 tests passed。
- Manager Docker 合同：1 file、30 tests passed。
- 应用 `scripts:typecheck`：通过。
- 应用 Nuxt `typecheck`：通过。
- `bun run docs:check`：`failures: []`、`checkedFiles: 5126`。
- `bun run docs:build`：通过。
- `bun run governance:check`：`failures: []`、`warnings: []`。
- `bun install --offline --frozen-lockfile`：通过。
- `git diff --check`：通过；仅输出 Windows 行尾提示。
- 根 `Dockerfile`、`Dockerfile.runner`、`docker-compose.yml`、`.env.docker.example` 不存在；对应应用包文件存在。

## 未执行

未执行真实 Docker build、真实发布 workflow、Windows runner/portable 与真实安装、真实 Provider/Model、浏览器人工验收、远端发布/部署/tag、真实数据库 migration 和旧 worktree 删除。追加迁移没有触碰本机根 `.env`、`config.yaml`、`assets/` 或 `workspace/` 数据。
