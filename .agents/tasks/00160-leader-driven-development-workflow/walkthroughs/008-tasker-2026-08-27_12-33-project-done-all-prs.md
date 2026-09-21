---
schema: nbook.walkthrough/v1
taskId: 00160-leader-driven-development-workflow
sequence: 8
role: tasker
status: verifying
createdAt: 2026-08-27T12:33:57Z
---

# PM Project Done 全部 PR 合同修复

## 变更

- `.agents/roles/pm/AGENTS.md` 将 Project `Done` 条件统一为“覆盖范围的PR已全部合并，且开发者针对当前merge revision集合明确确认统一评审通过”。
- `verifyLeaderDrivenDevelopmentContract()` 对 PM canonical 增加精确 marker“覆盖范围的PR已全部合并”，确保多 PR 覆盖范围不能被首个合并的 PR 提前标记完成。
- 聚焦回归先退化 PM 文案为“覆盖范围的PR已合并”，断言缺失精确 marker；恢复完整文案后通过，证明测试不是只依赖整文件缺失。

## 聚焦验证

- RED：`bun x vitest run --config scripts/vitest.config.ts scripts/ci/agent-governance.test.ts -t "当前角色与文件交互合同闭合|任一顺序流程合同丢失时失败"`；退化期间 `任一顺序流程合同丢失时失败` 为 `1 failed / 98 skipped (100)`，缺少 `.agents/roles/pm/AGENTS.md` 的精确 marker；`当前角色与文件交互合同闭合` 通过。
- GREEN：恢复 PM 完整文案与 marker 后同一命令为 `2 passed / 98 skipped (100)`。
- `git diff --check`：退出码0；仅有 Git 报告 `.agents/roles/pm/AGENTS.md` 工作副本 LF 将在下次 Git 操作替换为 CRLF 的 warning，无 whitespace error。

## 未运行项

- 按本次 Tasker assignment 未运行 formatter、lint、`docs:check`、`governance:check`和项目全量测试。
- 未执行 commit、push、PR、Issue/Project写入、合并、发布或部署。
