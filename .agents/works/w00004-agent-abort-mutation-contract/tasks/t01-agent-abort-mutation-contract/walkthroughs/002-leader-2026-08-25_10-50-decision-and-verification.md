---
schema: nbook.walkthrough/v1
taskId: 00159-agent-abort-mutation-contract
sequence: 2
role: leader
status: blocked
createdAt: 2026-08-25T10:50:02Z
---

# 方案 B 决策与验证状态

## 决策

开发者选择**方案 B：明确窄化例外**：

- 普通 abort admission 继续通过 `withSessionMutation()`。
- 宽限期到点的 forced-abort 保留同步 control-plane fence，不重新等待可能被长写入占用的 mutation lock。
- 唯一 forced-abort `aborted` lifecycle 继续经同一个 `SessionWriteExecutor`，由 per-session write queue 保证后续 invocation `start` 排在旧终态之后。
- 既有 `INVOCATION_ABORT_GRACE_MS = 150` 与 forced-abort `300ms` 上界不变。

该决策只解除“选 A 还是 B”的产品/架构歧义，不代表代码、Reference 或黑盒合同已经闭合。Task 仍保持 `blocked`。

## 验证

- `bun run governance:check`：通过，exit code `0`；`failures: []`、`warnings: []`。
- `bun run docs:check`：通过，exit code `0`；`checkedFiles: 5281`、`failures: []`。
- Task 00159 自身的 frontmatter、链接和“行为合同未变”标记已通过当前文档检查逻辑；仓库级 `docs:check` 也已在补齐 Agent abort Spec、ADR 与 Reference 引用后通过。
- Task 00159 的 `focused-test`、`regression-test`、`typecheck` 和实现级 `diff-check` 未运行；本轮只完成根工作区合同登记。`browser` 与 `smoke` 按 README frontmatter 记录在 `verification.notRun`。

## 未完成与下一步

方案 B 的实现、Reference/ADR 与黑盒合同仍由后续独立 worktree Task 继续处理；本次根工作区只完成目标 Spec、ADR、Reference 引用和 Task 18 合同登记，不宣称业务代码已实现。
