# Task 02 Walkthrough：审计修复与 0.1.2 发布

> 状态：Merged via PR #5（2026-08-12）
>
> Task：[`README.md`](README.md)

## Round 0：基线、worktree 与范围

日期：2026-08-12

- 基线：`origin/master@d5ff6ea`（含 PR #1-#4 与 0.1.1 发布）。
- 新建 worktree `nb-workflow-t02-audit-hardening`，分支
  `codex/fix-t02-audit-hardening`。
- 用户本地 dirty master（`cf34d156`，6 个文件）继续只读保护。
- 范围来自上一轮 5 agent 审计 + 人工复核，决策点经用户确认（全量修复、
  rerun 收紧、0.1.2 + deprecate）。

## Round 1：Runner 语义修复（TDD）

- rerun 门控：拒绝带 ask 的 waiting 与 running（无 processRestart）；允许
  completed/failed 与纯 wait 的 waiting（timer/child 恢复原语）。
- checkpoint 确定性：终态投影从 journal 按 `(path, seq)` 重算。
- child 启动窗口：`children.start` 返回后检查取消并补 `cancelForParent`。
- ephemeral 归档：集合移到 RunRecord（进程内），所有终态归档；waiting 取消
  也归档。
- `agents.invoke` options 白名单；`InvokeOptions.message` 允许 null。
- `SessionPort.acquireByTag` 原子 find-or-create；Memory 同步实现。

## Round 2：边界与持久化（TDD）

- persistence poisoned：保存首次失败原因，后续 save 拒绝；工作流吞错不能
  伪装 completed。
- fingerprint 数组：索引 descriptor 检查、symbol 键拒绝；错误消息转义与截断。
- `begin()` 同步校验 callerSessionId/defaultModel；hydrate 复查 requires。
- ask 缓存命中路径补取消检查；AskSpec/emit 形状校验。
- capability 参数化测试补齐四项。

## Round 3：发布链路与收口（TDD）

- `extractCfg` 惰性加载 typescript + optional peerDependency。
- 隔离目录 smoke（tarball 安装 + hostile NODE_PATH + extractCfg 错误断言），
  `verify:package` 与 CI 共用。
- `prepublishOnly` gate（README/package.json/LICENSE 无未提交差异）。
- cancel 事件在持久化后发出；resume/signal 执行收尾期预检；persist 失败后
  view/loadView 一致；traceGraph 嵌套分支解析。

## 当前验证

```text
bun test            -> 99 tests / 279 assertions / 0 failures
bun run typecheck   -> passed
bun run verify:package
  -> NODE_PACKAGE_SMOKE_OK
  -> ISOLATED_PACKAGE_SMOKE_OK
```

## Round 4：合并与发布准备

日期：2026-08-12

- 两个语义提交：`ee5946f fix(kernel): close audit correctness gaps`（21 个
  文件，代码与回归测试）与 `b289d84 chore(task): add release gates and
  Task 02 docs`（脚本、package.json、README、Task 文档）。
- PR #5 经 Ubuntu CI `verify` SUCCESS 后 merge commit 合并：
  `6d45cf4 Merge pull request #5`。
- `chore/release-0.1.2` 分支：package.json 版本 `0.1.2`、README 版本行、
  Task 02 状态更新。
- 发布动作（npm publish 0.1.2 + deprecate 0.1.1）为外部副作用，需用户
  2FA 确认后执行。

## Round 5：0.1.2 发布与 registry 核验

日期：2026-08-12

- 用户在 release worktree 执行 `npm publish` 与 `npm deprecate`（2FA）。
- registry 核验（`npm view`）：
  - `versions`: `["0.1.1", "0.1.2"]`；
  - `dist-tags.latest`: `0.1.2`；
  - `@notnotype/nb-workflow@0.1.1` deprecated 消息：
    `0.1.1 fails on clean installs (missing optional typescript); upgrade to 0.1.2`；
  - 0.1.2 license MIT、engines node>=20、exports 与仓库一致。
- 最终消费者验证：系统临时目录下载 0.1.2 tarball、隔离安装、hostile
  `NODE_PATH`，`import '@notnotype/nb-workflow'` 并执行 workflow 成功
  （`FINAL_CONSUMER_OK`）——0.1.1 的发布阻断在 0.1.2 已彻底修复。

## 下一步

- PR #5（ee5946f + b289d84）已合并，merge commit `6d45cf4`。
- `chore/release-0.1.2` 发布提交：版本号 0.1.2、README 版本行、本 walkthrough
  状态更新。
- 发布已完成并核验；后续 Task：真实进程重启、多 Worker、Cosmos Prisma
  Backend 与 Harness 接入。
