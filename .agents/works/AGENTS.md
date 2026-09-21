# Work 与 Task Agent 指令

Work 与 Task 的 current schema、目录和 role 规则见 [`README.md`](README.md)。本文件只定义执行动作：

1. Leader 恢复或创建 current 工作时先定位唯一 Work；新编号按 [`README.md#编号分配与记录位置`](README.md#编号分配与记录位置) 由唯一分配者在主工作区串行登记，不在各 worktree 独立取号。目标属于重大或长期 GitHub Issue 时写 `issueId: i<编号>`，否则写 `issueId: null`。
2. 每个 Work 在 `tasks/` 直接包含至少一个 Task。Task 按结果拆分并指定一个 canonical `role`；未知结果不预建 Task 链。
3. 执行者读取 Work README、指定 Task README、相关 Proposal/Spec 和 `.agents/roles/<role>/AGENTS.md`。需要隔离代码改动时默认共享 `.worktree/<workId>`；恢复时用 `governance:context` 核对实际 worktree/branch，默认路径冲突则停止并报告。
4. Task 正文是协作参考，不是机器权限或状态门禁。产品取舍、风险接受和受限动作仍由开发者决定；远端或不可逆动作仍需明确授权。
5. 完成后把叙事记录与 Reviewer 结论写入 Task 的 `walkthroughs/`，原始命令输出或结构化证据按需写入 `evidences/`；记录真实改动、验证、未运行项和偏差。需要继续拆分时由 Leader 根据已知结果在同一 Work 下创建下一 Task。

`.agents/tasks/` 与 `packages/*/.agents/tasks/` 是 legacy archive；其中 `agentWorkflow` 仅用于历史 provenance，current Task 必须位于 Work 内。
