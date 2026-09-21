---
schema: nbook.walkthrough/v1
taskId: t03-ui-planned-specs
sequence: 1
role: leader
status: completed
createdAt: 2026-08-29T14:10:00Z
---

# UI planned Spec 闭合

## 结论

依据开发者明确批准和已闭合的`t01-migration-design`，Leader创建并登记了两份尚未实现的行为合同：

- `ui.component-contracts`：组件行为、唯一catalog、`pending`/`ready`状态、owner与迁移删除门禁。
- `ui.component-lab`：Source Dev-only deterministic fixture、responsive检视、scenario分类和Product排除边界。

两份Spec均保持`status: planned`。本Task没有创建A实现Task，没有修改产品源码、依赖、lockfile、`theme.system`或任何运行时配置。

## 机器验证

- `bun run docs:check`：`failures: []`，`checkedFiles: 5369`。
- `bun run governance:check`：`failures: []`、`warnings: []`。
- 当前允许路径`git diff --check`：无输出，退出码0。
- 两份Spec各包含行为Spec固定九章；`capability`分别唯一为`ui.component-contracts`和`ui.component-lab`，owner均为`ui`。

## Leader语义核对

- 批准依据明确来自开发者本轮指令与t01 current evidence，不依赖旧worktree Proposal或历史Task完成态。
- `ui.component-contracts`拥有组件合同、catalog状态与迁移删除边界；`ui.component-lab`只消费唯一catalog并拥有Source Dev fixture与Product排除合同，两者没有第二registry或重叠authority。
- `pending`不被写成可验收；`ready`需要确定性fixture或正式surface证据。`planned`没有被写成当前产品事实。
- 26个`demo-only`场景只能进入确定性Lab；5个`product-behavior`必须在formal surface保留真实触发和副作用证据，不能由mock替代。
- Product排除要求构建图、路由、文本和manifest均无Lab；运行时隐藏不算通过。
- Workbench/View Host、alias、adapter、双入口、静默fallback和主题第二authority均明确排除。

## 未运行与授权边界

本轮是规范交付，未运行产品测试、typecheck、Nuxt build、Product build、Desktop smoke、浏览器、真实API或真实Provider/Model。上述项目需要后续实现Task和相应授权，不能由文档门禁替代。

开发者明确要求不创建A实现Task、不实现产品代码。因此本Task闭合后停止；A Task继续保持未创建和blocked，等待新的明确批准。
