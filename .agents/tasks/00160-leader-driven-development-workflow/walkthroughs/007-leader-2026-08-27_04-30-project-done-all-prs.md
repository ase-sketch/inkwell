---
schema: nbook.walkthrough/v1
taskId: 00160-leader-driven-development-workflow
sequence: 7
role: leader
status: verifying
createdAt: 2026-08-27T04:30:58Z
---

# Project Done 全部 PR 门禁返工

## Finding

独立旁路审查指出，PM canonical把Project `Done`写成“覆盖范围的PR已合并”，而唯一仓库流程合同要求“覆盖范围的PR已全部合并”。在Issue由多个扁平Task和多个PR交付时，PM文案可能允许首个PR合并后进入Done；开发者统一评审条件不能补足尚有覆盖范围PR未合并的缺口。

## 证据

- `.agents/roles/pm/AGENTS.md`当前Done条件缺少“全部”。
- `docs/standards/repository-workflow.md`明确要求“覆盖范围的PR已全部合并”。
- `verifyLeaderDrivenDevelopmentContract()`对PM只检查“可选Project”“不成为等待条件”“当前merge revision集合”，未检查全部PR条件。
- 现有forbidden mutation只拒绝单个PR合并直接触发Done，不证明多PR覆盖范围必须全部合并。

## 修复边界

- PM canonical统一为“覆盖范围的PR已全部合并”。
- 治理marker固定该精确语义；增加确定性回归，使删掉“全部”的PM文案失败。
- 不修改repository workflow、Task范围、Issue #191、产品行为或远端Issue/Project。
- Task保持verifying；Tasker先RED再GREEN，Leader重跑全部required并独立复核后才能恢复completed。

## 远端边界

T160 context允许本地治理编辑、验证、commit和push当前分支；不授权PR正文更新、Issue/Project写入、合并、发布或部署。本轮技术简报只进入本地报告和最终交付。
