---
schema: nbook.walkthrough/v1
taskId: 00160-leader-driven-development-workflow
sequence: 9
role: leader
status: completed
createdAt: 2026-08-27T04:52:43Z
---

# Project Done 全部 PR 门禁完成

## 结论

PM canonical现与repository workflow一致：只有覆盖范围的PR已全部合并，且开发者针对当前merge revision集合明确确认统一评审通过，才能进入Project `Done`。多Task/多PR Issue不能由首个PR合并提前结束。

## 证据

- Tasker RED：PM文案退化为“覆盖范围的PR已合并”时，精确聚焦命令为`1 failed / 98 skipped (100)`，失败为PM合同缺少必需marker。
- Tasker GREEN：PM文案和marker恢复“已全部合并”后，同一命令为`2 passed / 98 skipped (100)`。
- Leader完整治理回归：`100 passed`。
- `bun x tsc --noEmit -p scripts/tsconfig.json`：退出码0，无输出。
- `bun run docs:check`：`failures: []`、`checkedFiles: 5289`。
- `bun run governance:check`：`failures: []`、`warnings: []`。
- `git diff --check`与`git diff --cached --check`：退出码0；仅换行转换warning，无whitespace错误。

## 审查

独立Reviewer为`overall_correctness: correct`、置信度0.98，确认补丁收紧PM条件并复用repository workflow真相源，mutation回归在删除“全部”时稳定失败，不依赖整文件缺失；未发现material bug，建议恢复completed。

## 边界

本轮只修T160既有治理合同并追加证据。按context可commit/push当前分支；未授权也未执行PR正文更新、Issue/Project写入、合并、发布或部署。
