---
schema: nbook.walkthrough/v1
taskId: t03-ui-planned-specs
sequence: 2
role: leader
status: completed
createdAt: 2026-08-29T15:00:00Z
---

# Catalog owner 分区合同更正

## 问题

首次语义闭合漏掉一处可执行矛盾：`ui.component-contracts`要求每个catalog条目直接提供`owner`，但`t01-migration-design`冻结的`NeuroBookComponentCatalogEntry`类型没有`owner`字段。t01只规定每个entry恰好存在于一个最终owner slice，aggregate只组合各slice并校验。

因此，原Spec会迫使A实现者在“修改冻结entry类型”和“无法满足owner查询”之间自行选择，不能视为已闭合合同。

## 决定

保持t01类型基线不变。owner定义为条目所属唯一分区的关系，而不是entry中的重复字段：

- 每个entry恰好存在于一个owner slice。
- 唯一aggregate组合并校验slice，同时提供`entry → owner`唯一查询关系。
- aggregate不得把owner写回entry、复制entry或建立第二registry。
- 条目的owner解析结果不是恰好一个（即得到零个或两个及以上owner）时，catalog验证失败并拒绝状态晋升。

该决定与t01“每条entry只存在于一个owner slice、aggregate只import/concat、A-owned types与aggregate是唯一索引”一致，没有扩大A实现范围。

## 验证

修正后重跑：

- `bun run docs:check`；
- `bun run governance:check`；
- 当前更正路径`git diff --check`；
- 人工核对Spec的输入、输出、失败、边界和Smoke都采用同一owner分区语义。

本更正不创建A Task，不修改产品源码、依赖、lockfile或运行时行为。
