---
schema: nbook.walkthrough/v1
taskId: 00160-leader-driven-development-workflow
sequence: 3
role: leader
status: verifying
createdAt: 2026-08-27T01:37:30Z
---

# Design 失败污染历史身份诊断

## 复现

在PR #217治理revision `9e54e5d3863d3505ce26db149164e95d60950df6`上创建一个格式错误的当前Design Task：`设计产物`与`允许文件`不满足既有机器合同。`bun run governance:check`除报告该Task的5个真实Design错误外，还把全部根/应用历史Task误报为`Task 标识无效`。同一基线上、不含该错误Design Task的另一个当前Task检查为`failures: []`。

## 根因

`verifyTaskAgentWorkflowProfiles()`把全局`failures`数组传给`readLegacyTaskIdentitySet()`。helper在读取密封index/marker后用`if (failures.length > 0) return null`判断自身失败；因此任何此前已记录的无关Task错误都会让legacy identity返回null，继而把全部历史Task误报无效。

## 修复边界

- 保持历史身份、Design合同、Task ID和owner语义不变。
- 隔离`readLegacyTaskIdentitySet()`的本地错误收集，只有该helper自身失败才返回null；真实helper失败仍追加到调用方并fail closed。
- 在`agent-governance.test.ts`增加回归：一个无关当前Design合同错误与有效legacy fixture并存时，只报告Design根因，不产生历史Task标识噪声；真实legacy metadata错误仍失败。
- 重跑聚焦治理测试、TypeScript、docs、governance及diff检查。Task保持`verifying`，Leader读取证据后决定是否恢复`completed`。

## 授权

本缺陷属于Task 00160已接受治理合同内的验证修复；当前context已授权本地治理编辑、验证、本地commit、push当前分支和更新既有PR。未授权合并、发布、部署、Issue/Project写入或浏览器人工验收。
