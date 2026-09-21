---
schema: nbook.walkthrough/v1
taskId: t01-agent-abort-mutation-contract
sequence: 3
role: leader
status: verifying
createdAt: 2026-08-29T05:14:20.029Z
---

# Agent abort mutation 实现与验证交接

## 授权与边界

开发者已批准 `local://post-sync-review-fixes-plan.md`。其中第 5 节授权在本 Task allowlist 内完成方案 B 的业务合同、源码、测试和本地验证；不改变 `INVOCATION_ABORT_GRACE_MS = 150`、forced-abort `300ms` 上界、HTTP 成功 DTO 或 durable truth。

本轮没有调用真实 Provider，没有执行浏览器人工验收、远端写入、push、PR、发布、部署、数据库迁移、ref 替换、reflog/对象删除或 gc。

## 实现合同

- 普通 abort admission 继续由 Session mutation owner 线性化；forced-abort 使用精确 `(sessionId, invocationId)` authorization。
- 唯一 `aborted` lifecycle、active-leaf repair、pending recovery 与后续 invocation start 共用 `SessionWriteExecutor` 的 per-session queue。
- forced enqueue 同步失败保留 aborting ownership；physical append、partial leaf、after-write 或 live-state 失败保留可重试 recovery；已有 lifecycle 时只补 leaf/发布步骤。
- 迟到 Provider、tool 和 settlement 不能恢复 ownership 或污染后续 invocation。
- 不允许 abort 固定映射为 `409/session_abort_not_allowed/retryable:false`；durability failure 固定映射为 `503/session_abort_durability_unavailable/retryable:true`，底层 cause 不进入 HTTP body。
- Abort request body 使用 strict DTO；Spec 已原地晋升为 `implemented` 并登记到 `docs/specs/README.md` 的已实现规范表。

## 实际验证

所有命令由仓库根一次性 Bun driver 以 argv 数组执行，并为 Git 子进程注入 `-c maintenance.auto=false -c gc.auto=0`。脱敏命令证据位于系统 Temp 审计根，不提交 stdout 原文。

1. 候选提交父链：计划列出的 9 组 parent 关系全部匹配，`9/9` 通过。
2. Abort 聚焦回归：cwd `packages/neuro-book`，执行 `bun x vitest run`，覆盖 abort route、HTTP、DTO、write plan、Harness 单元与黑盒测试；`6` 个 test files、`306` tests 全部通过，exit code `0`。
3. Agent 回归：cwd `packages/neuro-book`，`bun run test:agent`，exit code `0`。
4. 类型检查：cwd `packages/neuro-book`，`bun run typecheck`，exit code `0`。
5. 文档检查：仓库根 `bun run docs:check`，`checkedFiles: 5352`、`failures: []`，exit code `0`。
6. 治理检查：仓库根 `bun run governance:check`，`failures: []`、`warnings: []`，exit code `0`。
7. Abort allowlist 的 `git diff --ignore-space-at-eol --check` 通过。整仓 `git diff --check` 仍只报告执行前用户保全文件 `WATCHDOG.md:1` 的尾随空格；本 Task 未修改或清理该用户内容。

状态矩阵覆盖 Idle、Waiting User、Running、Aborting 与 Archived，以及 cooperative/forced 竞争、同步 enqueue 失败、physical/partial-leaf/after-write/live-state recovery、重复 abort、后续 start 排序、进程重启投影和迟到结果隔离。

## 当前状态

实现与自动化门禁已闭合。Fresh-context Reviewer 正在对并发 ownership、durability recovery、事件排序和错误投影做对抗审查；审查 finding 未全部处理前保持 `verifying`，不形成 Abort 所有权提交。
