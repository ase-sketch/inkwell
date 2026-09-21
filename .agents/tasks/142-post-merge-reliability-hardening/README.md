# Post-merge Reliability Hardening

> 本 Task 承接 Task 140/141 对 #64、#61、#59、#63、#65 合并后的审查与浏览器验收，关闭已确认的配置、恢复、持久化、跨平台和窄屏问题。

## Relative documents refs

- [Task 140 PR review and release gates](../140-pr-review-and-release-gates/README.md)
- [Task 141 merged PR browser acceptance](../141-merged-pr-browser-acceptance/README.md)
- [Task 111 Workflow integration](../111-workflow-agent-integration/README.md)
- [Task 130 desktop application foundation](../130-desktop-application-foundation/README.md)

## Goal

修复审查确认的运行时 P1/P2，补齐 Job 终态结果的跨进程持久化与可靠结果回流，完成 Source Dev Cache Root、Profile 窄屏布局和浏览器验收收口。focused tests、typecheck、全仓测试、浏览器和正式发布门禁分别记录，未完成的 Product 多平台门禁继续归 Task 130。

## Decisions

- retrieval、researcher、summarizer、memory.curator 继承全局默认模型，不增加静默 fallback。
- Source Dev 只迁出 Cache Root，State Root 保持当前 checkout。
- 持久化 Job 终态、完整结果、Session/usage 摘要与回流状态；Workflow 图、journal、逐步时间线和 pending ask 继续由当前进程拥有。
- 进程重启时 active Job 转为 `interrupted`，不续跑旧 Workflow；已完成 Job 的结果继续可查询，Run 细节不可用时不得把终态降级为 `interrupted`。
- #47 不合并，只移植关联 Session 缺失的最小降级合同。
- Job 历史不设置猜测性自动过期；用户通过“清除已结束”显式删除。
- 当前 Workspace 的四个目标 Profile 已经使用 `modelKey: null` 继承全局默认模型；本 Task 只做真实无 model 调用复核，不再修改配置。
- 2026-08-07 只读复查确认先前列出的 8 个历史测试实体已经不存在；本 Task 不执行数据删除，不重置 SQLite sequence。

## Implementation Walkthrough

### 2026-08-06：retrieval Git Bash 路径枚举

- 将内置 retrieval 的固定元数据清单命令改为 `rg --files -g 'index.md' | workspace node parse --stdin --ndjson`，避免 MSYS 把正则中的裸 `/` 改写成 Git 安装路径。
- Profile 测试同时断言新命令存在、旧命令消失。
- bash focused test 执行与 Profile 完全相同的真实命令，并验证 NDJSON 中包含目标节点路径与标题，不再用不含 `/` 的替代正则冒充覆盖。

### 2026-08-07：收紧重启持久化和清理边界

- 重启可靠性目标收窄为“Job 终态和结果不丢失”。完整 Workflow Run 历史和断点续跑需要持久脚本、参数、锁、Project 上下文和重放语义，不进入本轮。
- Workspace 配置已恢复为继承全局默认模型，不增加运行时静默 fallback。
- 先前报告中的 8 个历史测试实体已不存在；不再安排删除或 sequence 重置。

## Verification

- `bun run test -- server/agent/profiles/leader-assets-profile.test.ts -t "retrieval profile 使用 Git Bash 安全的路径枚举提示"`：1 passed / 14 skipped。
- `bun run test -- server/agent/tools/file-tools.test.ts -t "retrieval 的 index.md 清单命令可在真实 bash 中执行"`：1 passed / 48 skipped；测试通过 Harness 的真实 bash 工具执行完整命令。
- `bun run typecheck`：退出码 0。
- `git diff --check`：退出码 0。

## TODO / Follow-ups

- [ ] 修复停止失败用户提示。
- [ ] 修复主 Session / 关联 Session 恢复语义与重复 recovery。
- [ ] 实现持久化 Agent Job 终态、完整结果和可靠回流；保留 Workflow 进程内观察边界。
- [ ] 调整 Source Dev Cache Root 与 Profile 窄屏布局。
- [ ] 复核 retrieval、researcher、summarizer 的真实默认模型调用和 memory.curator 的静态继承配置。
- [ ] 完成 Task 141 遗留浏览器场景和最终整体门禁。

### 2026-08-07：实现完成与最终验证

本 Task 的实现基线先进入 `master` `7f29bf8fbc6c4776702382dd9df33b0d006f16f2`；随后补上 clean-runner 和 Windows Portable 发布验收修复，最终 canary revision 为 `69313ad5ccc0e54203daeeebe69589f108fa3572`。下面的实现状态覆盖上方早期 TODO，早期记录保留用于追溯。

#### 已完成实现

- retrieval 固定命令改为 `rg --files -g 'index.md' | workspace node parse --stdin --ndjson`，并用真实 Bash 工具执行回归。
- 停止请求失败复用统一错误解析和通知出口，不再只写控制台。
- Agent Job 终态、完整 `result`、kind detail、Session/usage 摘要和稳定回流身份写入 `<Workspace Root>/.nbook/agent/jobs/<jobId>.json`；终态 durable commit 先于终态 SSE，旧 `jobs.jsonl` 只迁移 active 行。
- 重启时 `running/waiting` 转为 `interrupted`；已完成 Job 重新出现在列表并可读取完整结果；损坏单文件隔离，`deliveryStatus=pending` 的 Job 不可被“清除已结束”删除。完整设计见 [ADR 0014](../../adr/0014-agent-job-durable-history.md) 和 [Agent Jobs reference](../../reference/agent/jobs.md)。
- Session recovery 只把关联目标缺失计入 `unavailableLinkedAgents`，主 Session 仍保持可用；自动 recovery 按连接代和原因最多尝试一次，失败后清理 latch 并恢复连接状态。
- Source Dev 未显式指定 Cache Root 时注入 `<checkout>/.agent/cache`；显式 Cache Root 保持原值，通用 runtime fallback 不改写。
- 配置中心在小于 `md` 的视口使用上下布局和横向紧凑导航；桌面 220px 侧栏保持不变。
- clean-runner 先生成 Prisma/Nuxt 产物，并修复 POSIX runner 的真实临时路径合同；cover 路由冷导入预算调整为 30 秒。

#### 自动验证

- `bun run generate`、`bun run typecheck`、`git diff --check`：通过。
- Agent/Workflow/Composer/Settings/Cache/Session focused：11 个文件、82 项通过；补充 recovery/path/image focused：5 个文件、48 项通过。
- 本地 Windows 默认 Vitest pool 全量为 `495 passed / 1 skipped / 1 failed`（`3442 passed / 14 skipped / 1 failed`）；唯一失败为 `subject-memory-tools.test.ts` 的 File Index 时序敏感用例。单文件 `16/16` 通过；`--pool=forks` 全量为 `496 passed / 1 skipped`、`3443 passed / 14 skipped`。这项差异记录为 runner 调度敏感性，不放宽生产路径校验。
- GitHub PR #83 和 #86 的 Typecheck、Full tests advisory 和四个平台 Product checks 已成功；`bun scripts/ci/validate-nitropack-patch.ts`、`bun scripts/ci/validate-community-files.ts` 通过。`bun run docs:build` 的页面渲染和输出构建通过；普通 Windows 模式在清理 `docs/.vitepress/.temp` 时遇到 `EPERM`，用 `DEBUG=1`（保留 VitePress 临时目录）完成了同一构建，因此该项的内容验证通过、临时目录清理仍受本机环境限制。
- `bun run manager:test`：`38 passed / 1 skipped` 个文件，`281 passed / 3 skipped` 项；Manager typecheck、pack check 和 Desktop Contract `7 files / 29 tests` 通过。
- `manager-v0.1.0-canary.51` 的 GitHub `release-manager.yml` 首次在 clean runner 的 Manager test 阶段失败：18 个 suite 因缺少 `.nuxt/tsconfig.json` 报 `Failed to load tsconfig for '../../shared/product-runtime-receipt.ts': Tsconfig not found`；随后补上 Manager release workflow 的 `bun run nuxt:prepare` 和 contract 回归，发布 `manager-v0.1.0-canary.52` 成功。
- `bun run manager:verify-public` 现已通过：公开 npm Manager `0.1.0-canary.52` 的 `gitHead=470ad7ad271f10996ec8eab182fa170e151c2be5` 与当前构建输入一致。

#### 当前剩余边界

- 真实 provider 驱动的 retrieval、researcher、summarizer 调用和 Composer/Workflow 浏览器流程仍需人工重跑；本轮限量 canary 允许在隔离 State Root 使用本机凭证 smoke，但未取得的证据仍记录为未验证。
- 完整 Workflow Run 历史、断点续跑、逐步 journal、时间线和 pending ask 持久化不属于本 Task；重启后只保证 Job 终态和结果可读。
- Source Dev 旧仓库根 `cache/image-variants` 不自动迁移或删除，详见 [0.9.3-canary 迁移指南](../../migrations/0.9.3-canary.md)。

### 结论

- 本 Task 的代码范围 P0/P1 已收口，未新增必须立即修复的 P2。
- 发布前的硬门禁是公开 Manager provenance、发布 workflow、公开资产和 GHCR 验证；真实 provider/人工浏览器验收按限量 canary 作为已知未完成项，不通过“静默 fallback”或伪造测试结果掩盖。

### 2026-08-07：0.9.3-canary 发布收口

- Manager `0.1.0-canary.51` 曾在 clean runner 因缺少 `.nuxt/tsconfig.json` 失败；补上 `nuxt:prepare` 后，`manager-v0.1.0-canary.52` 发布成功，`bun run manager:verify-public` 通过。
- NeuroBook 候选 `v0.9.3-canary.20260807.173243Z.673c4bde` 曾在 Windows Portable 验收中暴露真实合同错误：脚本把 `--password-stdin` 传给不支持该参数的 Manager `admin create`。修复为通过 `AUTH_ADMIN_PASSWORD` 由 Manager 按既有 stdin 合同转交 Product 后，重新创建候选。
- 最终 `v0.9.3-canary.20260807.175842Z.771ac42b` 已公开；Release workflow `31204827527` 的 preflight、五平台 Product、Portable、容器、公开 payload、GHCR、Windows data reuse、`publish-index` 和 `activate-container-tags` 全部通过。
- 发布后仍保留明确边界：完整 Workflow Run 历史/断点续跑不属于本 Task；真实 provider 驱动的 Composer/Workflow 人工流程未写成全量通过；Source Dev 旧仓库根 `cache/image-variants` 不自动迁移或删除。
