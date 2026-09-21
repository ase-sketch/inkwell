---
schema: nbook.walkthrough/v1
taskId: t01-proper-lockfile-exfat
sequence: 4
role: reviewer
status: completed
createdAt: 2026-09-07T15:45:00Z
---

# 审查整改后的验证结论

## 结论

**未完成验证。** 审查指出的本地整改项已闭合并已合并到 `master`：manifest/lock 同步漂移已按开发者明确要求记录并接受；planned Spec 已移除具体依赖和载荷实现细节；Task 已明确 `precisionUnsupported` 与普通 I/O `ENOTSUP` 的不同重试语义；新增补丁校验脚本；heartbeat 测试现在对 async 与 sync 均观察至少三次成功 `utimes` 更新。master 合并后的本地验证已全绿，但 Product/Portable、真实 NTFS 120 秒和真实 exFAT 验收仍未完成，因此不能宣称 Issue #123 已完成验收或已发布。

## 已验证命令

- `bun scripts/ci/validate-proper-lockfile-patch.ts`：通过；精确依赖登记、Bun lock 映射、补丁上游坐标、补丁关键载荷和安装产物均通过。
- `bun x vitest run --config scripts/vitest.config.ts scripts/build/proper-lockfile-patch.test.ts`：通过；1 file passed，13 tests passed，包含错位安装根回归。
- `bun x tsc --noEmit -p scripts/tsconfig.json`：通过，无输出。
- `bun run --cwd packages/neuro-book test -- server/agent/session/agent-session-store-lease.test.ts server/agent/session/agent-session-store-lease-compromise.test.ts server/agent/session/agent-session-store-release.test.ts`：通过；3 files passed，14 tests passed。
- `bun run --cwd packages/neuro-book test -- server/workspace-files/project-lock.test.ts`：通过；1 file passed，9 tests passed。
- `bun run docs:check`：通过；`failures: []`，`checkedFiles: 5417`。
- 由提交 `7176da61fc4c5dfc8eda2f65e22ae36b744d80af` 创建全新系统 Temp worktree `C:/Users/notnotype/AppData/Local/Temp/neuro-book/issue-123-lock-clean-7176da61`，执行 `bun install --frozen-lockfile --ignore-scripts --linker hoisted`：通过；Bun `1.3.14`，安装 `1534 packages`。
- 在该 clean-install 根执行的 validator、13 项聚焦回归和 `bun x tsc --noEmit -p scripts/tsconfig.json` 均通过；这些命令使用各自 worktree 的默认 `repositoryRoot`。测试中的错位安装根回归才显式传入 fixture root。
- 合并提交 `83f231344bcfe85ee2111cb8d96b8569da62598f` 后，在 `master` 默认 `repositoryRoot` 上重复 validator、13 项聚焦回归、typecheck、Session Store 14 项、Project Lock 9 项和 docs check，全部通过。

## 整改内容

- `evidences/lockfile-sync-acceptance.json` 明确接受当前 manifest 与旧 `bun.lock` 不一致所导致的 workspace 版本、`@types/bun`、`bun-types`、`@types/node` 和 Windows 路径解析同步结果；不把它们描述为依赖升级，不手工编辑 lockfile。
- `scripts/ci/validate-proper-lockfile-patch.ts` 校验精确版本、package.json 登记、Bun lock 文本映射、patch 上游文件与 index、关键补丁载荷、无 `.bun-tag-*` 元数据，以及 `root/node_modules/proper-lockfile` 安装产物。
- `scripts/build/proper-lockfile-patch.test.ts` 的健康 async/sync 场景通过 adapter 的成功 `utimes` 回调计数，要求三轮心跳完成至少三次有效更新。
- `docs/specs/agent/session-store-lease.md` 的 planned Spec 仅保留可观察兼容边界；不再规定 proper-lockfile 版本、hoisted/vendor/inline 等实现方式。
- Task README 明确：只有精度探测耗尽产生的、带 `precisionUnsupported` 标记的 `ENOTSUP` 跳过 retries；普通 I/O `ENOTSUP` 继续重试。

## 未完成门禁

- `product:stage` 仍被既有 `ReferenceError: ProductRuntimeImageBuilder is not defined` 阻塞，已记录 GitHub [#226](https://github.com/notnotype/neuro-book/issues/226)。
- Product/Portable 载荷重建与 `product:start` smoke 未完成。
- 真实 Windows NTFS 120 秒 Product 观察未完成。
- 当前主机无 exFAT 卷，真实 exFAT 120 秒观察未完成。
- Spec 保持 `status: planned`。

## 证据索引

- 最终结构化证据：`evidences/review-2026-09-07-final.json`。
- 整改前历史证据：`evidences/review-2026-09-07.json`，状态为 `superseded`，保留其 11 tests 历史记录，不作为最终状态。
- Issue #226 迁移记录：`evidences/issue-226-migration.json` 与 `walkthroughs/001-leader-2026-09-07-issue-226-migration.md`。
