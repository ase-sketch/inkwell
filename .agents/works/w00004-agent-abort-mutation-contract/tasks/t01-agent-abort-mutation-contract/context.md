# Agent abort mutation 合同恢复卡

## 当前基线

- Current Task：`w00004-agent-abort-mutation-contract/tasks/t01-agent-abort-mutation-contract`；legacy 来源为 `00159-agent-abort-mutation-contract`。
- checkout：仓库主 checkout；迁移前登记基线 `bf07359d3966900ddf9bfc4ad0031fa2b956f29d`。
- Work `issueId: null`；本地治理/实现合同，不为其单独建立远端 Issue。
- 开发者已选择方案 B：普通 abort admission 经 `withSessionMutation()`；forced-abort 是窄化同步 control-plane fence；唯一 `aborted` lifecycle 经同一 per-session write queue。
- `INVOCATION_ABORT_GRACE_MS = 150` 与 forced-abort `300ms` 上界不变。

## 当前工作树事实

- `docs/specs/agent/session-abort.md`、ADR 0019、Reference、Task 18 黑盒合同、HTTP/DTO 和 Session runtime 已表达同一方案 B 边界。
- `SessionWriteExecutor.enqueueForcedAbort()`、forced authorization、pending recovery、active-leaf repair、HTTP 409/503 错误合同及状态矩阵测试已实现。
- 权威后同步修复计划已批准上述可逆本地业务合同、源码、测试和验证；当前阶段为 Reviewer 复核与临时所有权提交。

## 当前权限

- 已授权：维护本 Task；在 README allowlist 内完成 Abort 业务合同、源码和测试修改；运行离线/本地门禁；构造权威计划规定的临时与 detached 提交。
- 仍需另行授权：移动本地 `master`、创建保护 ref、删除 reflog/对象和运行 gc。
- 未授权：真实 Provider、浏览器人工验收、远端 Issue/Project 写入、push、PR、发布、部署、数据库迁移或其它数据删除。

## 已有证据

- Task 147 合入提交：`6a79bfd96dbefbe017bfb9f912985507d0ba1b72`，是登记基线的祖先。
- `walkthroughs/001-leader-2026-08-25_09-56-abort-contract-blocker.md`：原始冲突。
- `walkthroughs/002-leader-2026-08-25_10-50-decision-and-verification.md`：方案 B 决定与当时验证边界。
- `walkthroughs/003-leader-2026-08-29-implementation-verification.md`：本次授权来源、状态矩阵、实际门禁和残余边界。

## 下一合法动作

完成 Reviewer 对抗审查；没有未处理 finding 后形成临时 Abort 所有权提交。之后与 governance、nb-ui、research 三组验证文件集合互斥，再构造不移动 ref 的 detached clean chain。
