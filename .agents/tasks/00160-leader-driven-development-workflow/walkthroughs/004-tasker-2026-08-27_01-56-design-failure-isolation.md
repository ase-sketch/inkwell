---
schema: nbook.walkthrough/v1
taskId: 00160-leader-driven-development-workflow
sequence: 4
role: tasker
status: verifying
createdAt: 2026-08-27T01:56:22Z
---

# Design 失败隔离修复验证

## 变更

- `readLegacyTaskIdentitySet()`改用本地失败收集；只有该 helper 自身的 metadata、密封快照或 sourceRevision 错误才回传调用方，避免此前已经记录的无关 Design 错误使有效 legacy identity 失效。
- 根 Task 目录枚举改为稳定字典序；回归中的`00161-design`因此确定先于`99-legacy`处理，旧 helper 在该顺序下稳定复现污染，避免依赖文件系统枚举顺序。
- `scripts/ci/agent-governance.test.ts`新增回归：有效`99-legacy`与无关非法`00161-design`同时存在时，只报告 Design 产物路径错误，不报告`根 Task 标识无效：99-legacy`。

## 聚焦验证

- 原 Tasker 记录中的模糊选择器 `-t "无关 Design 合同错误不污染有效 legacy identity"` 证据已撤回：该选择器不再匹配当前最终测试标题，不作为本轮 RED/GREEN 结果。
- Leader 受控 RED（2026-08-27T02:32:52Z 前后）：在当前最终测试标题与稳定根 Task 排序下，临时仅将 helper 最终返回恢复为旧逻辑 `failures.length > 0 ? null`；精确命令 `bun x vitest run --config scripts/vitest.config.ts scripts/ci/agent-governance.test.ts -t "按稳定根 Task 顺序先处理无关 Design 错误且不污染有效 legacy identity"` 真实结果为 `1 failed / 99 skipped (100)`，失败为 `根 Task 标识无效：99-legacy`。
- Leader 受控 GREEN（同一时间边界）：恢复 `localFailures.length > 0 ? fail() : {taskIds, destinations}` 后，使用同一精确命令，真实结果为 `1 passed / 99 skipped (100)`。
- 另行聚焦回归：`bun x vitest run --config scripts/vitest.config.ts scripts/ci/agent-governance.test.ts -t "按稳定根 Task 顺序先处理无关 Design 错误且不污染有效 legacy identity|当前迁移 metadata 含畸形 mapping 时 fail closed|密封迁移快照含畸形 mapping 时 fail closed|历史身份在 index 与 marker 密封值不一致时 fail closed"`；`4 passed / 96 skipped (100)`。
- `git diff --check`：退出码0，无输出。

## 未运行项

- 按本次 Tasker assignment 未运行 formatter、lint、`docs:check`、`governance:check`和项目全量测试。
- 未执行 commit、push、PR、Issue/Project写入、合并、发布或部署。
