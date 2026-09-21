---
schema: nbook.walkthrough/v1
taskId: t01-migration-design
sequence: 2
role: leader
status: completed
createdAt: 2026-08-29T07:07:51Z
---

# t01 当前设计基线收口

## 结论

`t01-migration-design` 已在当前 master 重新建立 Issue #191 的 UI Foundation 静态基线。旧 `.worktree/t162-ui-foundation-proposal` 与 `.worktree/t163-ui-migration-baseline` 仅作为非 canonical 参考；当前交付没有把旧 Proposal/Task 状态写成 master 已落地事实。

开发者本轮明确接受继续 Issue #191、保持旧 p-006 的 UI Foundation 目标、排除 Workbench/View Host、禁止 alias/adapter/双重 authority，并要求 t01 闭合后创建两份 planned Spec，再创建 A 实现 Task。两份 planned Spec 的批准依据因此是本轮开发者指令与本 t01 current evidence，不依赖 PM、claimed 或恢复旧 Proposal 文件。

## 当前事实

- `packages/neuro-book/app/components/**/*.vue`：232 个已跟踪 SFC。
- `packages/nb-ui/src/components/**/*.vue`：72 个组件 SFC。
- common 与 nb-ui basename 重叠：16 个；名字重叠不代表接口兼容。
- preview 源文件：14 个；稳定 scenario：31 个，其中 `product-behavior` 5 个、`demo-only` 26 个，ID 全局唯一。
- 主应用仍未声明 `@notnotype/nb-ui`，未接 nb-ui CSS/transpile/module，主题仍是当前 implemented 的 8 套主题/自定义主题合同。

## 审查修复

fresh-context 反证审查与后续合同一致性检查共提出 5 个 material finding，均已按 current source 修复：

1. catalog 的虚拟 `nbook/app/components/` source 与物理 `packages/neuro-book/app/components/` 路径增加可测试的无损双射和拒绝条件。
2. Plot owner 闭合改为 K 的 4 页/9 场景与 L 的 1 页/1 场景。
3. `theme.system` 明确在 B 闭合后、C Task 创建或派发前原地从 `implemented` 切为 `planned`，C 行为与证据闭合后再恢复 `implemented`。
4. `real-fanout` 保留 `product-behavior`，但明确当前触发器是 `/api/agent/workflow-demo/runs`；Agent Composer 只是尚未验证的目标正式 surface。其真实 Provider/Model/Session 副作用使其不能降为 deterministic Lab。
5. `destinationContract` 要求每个 product 场景都有 current trigger；其余四条已从当前页面/组件/API补齐 `currentTrigger`，旧 `formalSurface` 统一改为 `targetFormalSurface`，不再把迁移目标冒充当前入口。

另补唯一 catalog authority：每条 entry 只存在于一个 owner slice；A-owned aggregate 只 import/concat 并校验，不复制记录；E–O 只修改自己的 slice。

外部交叉审查未形成结论：按开发者要求运行 `claude -p` 时返回 `429 Service Unavailable`；后续短复审又因 `524` 超时失败。两次工具失败均不记为审查通过，Leader 已对五项修复逐项回读 current source 与产物。

## 验证

- Leader 结构化检查：`problems: []`；组件 232、页面 14、场景 31、唯一 ID 31、kind 为 5/26、K=9、L=1。
- 两份 JSON 可解析；source coverage exact match；5 个 product 场景全部有非空 `currentTrigger` 与 `targetFormalSurface`，且没有 product `formalSurface` 残留。
- `bun run docs:check`：`failures: []`、`checkedFiles: 5363`。
- `bun run governance:check`：`failures: []`、`warnings: []`。
- t01 路径 `git diff --check`：退出码 0。

## 未运行与下一步

未运行产品测试、typecheck、browser、Product build、Desktop smoke、真实 API 或真实 Provider/Model；t01 只交付静态设计证据。下一步由 Leader在同一 Work 创建 `role: leader` 的 Spec 合同 Task，创建并登记 `ui.component-contracts` 与 `ui.component-lab` 两份 planned Spec；门禁闭合后再创建唯一 A 实现 Task。

未执行 push、PR、Issue/Project 写入、合并、发布或部署。
