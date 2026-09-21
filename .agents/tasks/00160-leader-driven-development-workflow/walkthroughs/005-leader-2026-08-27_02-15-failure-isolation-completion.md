---
schema: nbook.walkthrough/v1
taskId: 00160-leader-driven-development-workflow
sequence: 5
role: leader
status: verifying
createdAt: 2026-08-27T02:15:49Z
---

# Design 失败隔离先前完成判断撤回

## 结论

本文件先前的`completed`结论已撤回：原Tasker RED/GREEN记录使用的`-t`选择器不匹配最终测试标题，不能产生所声称的结果。代码修复本身保留，但Task回到`verifying`，必须以最终标题补可复现证据、重跑全部required并重新审查后才能恢复`completed`。

## 更正证据

- 原模糊选择器证据不再使用，详见更正后的walkthrough 004。
- Leader受控RED：在最终测试标题和稳定根Task排序保持不变时，临时仅恢复旧helper返回条件；精确标题命令真实为`1 failed / 99 skipped (100)`，失败包含`根 Task 标识无效：99-legacy`。
- Leader受控GREEN：恢复`localFailures`返回条件后，同一精确标题命令真实为`1 passed / 99 skipped (100)`。
- Leader聚焦GREEN：精确列出污染回归与三个真实legacy metadata fail-closed标题，结果为`4 passed / 96 skipped (100)`。
- 先前完整`100 passed`、TypeScript、docs、governance和diff结果发生在本次证据更正前，只是历史结果；Task恢复completed前必须在当前树从头重跑。

## 审查状态

先前Reviewer确认代码逻辑与稳定排序正确，但没有识别选择器证据错误。该结论不足以恢复completed；当前树完成全量重验后必须再次请求独立Reviewer复核代码与证据。

## 授权与未执行

按既有Task context，本修复可本地commit、push当前分支并更新既有PR #217。未执行合并、发布、部署、Issue/Project写入、浏览器人工验收或真实Provider/Model。
