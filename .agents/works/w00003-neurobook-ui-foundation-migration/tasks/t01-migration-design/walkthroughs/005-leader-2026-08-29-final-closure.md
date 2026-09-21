---
schema: nbook.walkthrough/v1
taskId: t01-migration-design
sequence: 5
role: leader
status: completed
createdAt: 2026-08-29T13:45:00Z
---

# t01 迁移设计最终闭合

## 结论

开发者已明确批准闭合 `t01-migration-design`，并只允许随后创建 `ui.component-contracts` 与 `ui.component-lab` 两份 `planned` Spec；未批准创建 A 实现 Task或修改产品代码。

Leader 已复核 walkthrough001–004、组件与 preview 基线以及最终 caller migration map。t01 的设计交付满足以下边界：

- 232 个 NeuroBook 组件 SFC、14 个 preview 源和31个稳定scenario已冻结；scenario分类为5个`product-behavior`与26个`demo-only`。
- 29个迁移表面已逐项记录current caller、目标owner、依赖和binding-aware删除条件；16个同名组件、`DropdownItem` sidecar type及5个composable/util均在范围内。
- 首个A切片只允许建立组件合同、唯一catalog、pending基线和静态合同测试；不接入`@notnotype/nb-ui`，不创建Lab，不修改产品行为。
- Workbench/View Host不进入本Work；迁移不得保留alias、adapter、双入口或静默fallback。

因此t01作为静态迁移设计Task闭合。该闭合不表示任何UI迁移、Lab、主题切换或产品验收已经实现。

## 已验证

- `bun run docs:check`：`failures: []`。
- `bun run governance:check`：`failures: []`、`warnings: []`。
- t01路径`git diff --check`通过。
- caller map可解析，记录数为29；组件、symbol/type caller集合与current源码静态集合无差异。
- binding-aware门禁的限定正反例符合预期；这些命令只证明证据协议可执行，不是产品实现或浏览器验收。

## 未验证

未运行或未获授权的项目继续保持未验证：LSP references、Nuxt build、nb-ui与UnoCSS真实cascade、Desktop/1440px/390px浏览器行为、FOUC、Product build、真实API、真实Provider/Model以及A–P任何实现切片。

## 下一步边界

Leader可创建一个`role: leader`的Spec合同Task，建立并登记两份`planned` Spec并运行文档、治理和语义门禁。开发者明确要求不创建A实现Task、不修改产品代码；两份Spec闭合后必须停下报告。
