---
schema: nbook.walkthrough/v1
taskId: 00149-monorepo-workspace-consolidation
sequence: 005
role: leader
status: complete
createdAt: 2026-08-16T18:40:00Z
---

# Leader：S2 收编六个自治项目

## 实施

- 按 S0 import manifest 将 `nb-history`、`nb-workflow`、`nb-memory`、`nb-ui`、`neuro-agent-harness`、`llmlint` 导入 `packages/*`；源 checkout 未写入、未运行 Git 操作。
- 每个自治包保留项目自己的 README/docs/许可证/状态边界，建立 `AGENTS.md`、`.agents/tasks/`、`docs/` 和 `PROJECT-STATUS.md`；Harness 与 llmlint 的历史 Task 从源任务目录重定位到本包 `.agents/tasks/`。
- 根 workspace 扩展为 10 个显式成员，根 `bun.lock` 更新；llmlint 根包改用 `@notnotype/neuro-agent-harness: workspace:*`，移除旧 NeuroBook 同步入口；`web` 与 `skill` lockfile 保持独立岛屿。
- 源 `.gitignore` 和自治包根 lockfile 不复制；包级生成物、数据库、评测语料、运行态与 Web 临时输出改由根 `.gitignore` 锚定；llmlint 已跟踪的 Prisma client 源文件保留 manifest 字节；nb-ui 按 PolyForm 官方文本补入许可证并重建 `dist/nb-ui.css`。
- Docker deps stage 增加六个 workspace manifest；包文档的活跃旧任务入口改到本包 `.agents/tasks` 或根 `.agents/tasks`，历史 Task 正文不批量改写。

## 导入证据

正式逐文件证据：`evidences/s2-import-summary.json`。

- S0 included entries：1264/1264 source bytes + SHA-256 复核通过。
- 目标 exact copy：1225；Task 文件重定位：140；受控变更：26（package manifest、项目治理入口/索引、活跃文档 canonical links、llmlint 报告默认输出）；策略跳过：13；S0 manifest 明确排除：71。
- `missing=0`、`mismatches=0`、`sourceDrift=0`。
- nb-ui 官方 PolyForm-Noncommercial-1.0.0 SHA-256：`c0ea4a896d2c8c394b29f9427589996db826cd501c512279ff0ed3ef48fabbe5`。

## 验证证据

| 命令/场景 | 结果 |
| --- | --- |
| `bun install --linker hoisted` + `bun install --frozen-lockfile --linker hoisted` | 通过；frozen 检查 1680 installs / 1938 packages，无 lockfile 变化；`bun.lock` SHA-256 `1433b696f687d2d7942c50386846a286ae5bdf77780e3b674f12e17fde490ff8` |
| nb-history | typecheck；49 tests / 200 expect calls |
| nb-workflow | 18 tests / 96 expect calls；demo 70 frames、15 invalid snapshots、2 reruns |
| nb-memory | typecheck；86 tests / 464 expect calls |
| nb-ui | `build:css`、typecheck、13 files / 185 tests；`dist/nb-ui.css` 39954 bytes；Playground `/lab` 桌面 1280×900 与窄屏 390×844 均有 19 controls、无横向溢出，并显示 390px responsive 场景 |
| neuro-agent-harness | build、typecheck、verify；529 tests / 2204 expect calls；pack smoke 安装生成 tarball |
| llmlint Skill/Web | Skill version/rules/guide CLI 通过；Web island frozen install、Nuxt prepare、Prisma generate/init、typecheck、server typecheck、production build 通过，report 缺失按已记录 degraded 模式；根 verify 保留 S0 同一缺口：367 pass / 7 fail / 7 errors（`llmlint/fix`、`evals-generator/agent-loop`、`#shared/analysis` unresolved） |
| root | desktop/electron island frozen install 后 root typecheck 通过；`nuxt:prepare` + `bun run test -- --retry=3` 通过：500 files passed / 1 skipped，3496 passed / 14 skipped |
| `bun run governance:check` | 通过；`failures=[]`、`warnings=[]` |
| nb-ui browser smoke | 实际服务页面 `/lab` 在 1280×900、390×844 均完成 DOM/overflow/controls 断言；服务随后停止 |

## 未验收边界

- 未运行真实 provider/model、私有 corpus、远端部署、发布或 Docker build；llmlint 私有 eval report 不存在，因此 Web 构建使用明确 degraded no-report 模式。
- 六原仓仍保持原地不变；vendor/sync 删除、正式 workspace 集成和主应用物理迁移留给 S3–S6。
