# 任务上下文

快照截止时间：2026-08-25T09:00:48Z

## 基线与授权

- checkout：仓库主 checkout
- branch：`master`
- baseline revision：`a35f3c68c1b7ad6ad4bc0fc1653f7eeb6275dade`
- `actionIssueId: null`：开发者当前对话直接授权本地调整开发工作流
- 未授权：branch、worktree、checkout、commit、push、PR、合并、发布、部署和任何 GitHub Issue / Project 条目或 workflow 写入；workflow #7 由开发者亲自在 UI 关闭，Agent 只读回读

## 已验证现状

- 仓库工作流正文位于 `docs/standards/repository-workflow.md`；根 `AGENTS.md` 和四角色合同提供入口与执行边界。
- 修改前 PM 合同把关联 PR 等待审查映射为 `In review`，把实现、验证和必要审查完成映射为 `Done`，没有定义合并后统一评审阶段。
- Issue #131 当前为 `CLOSED / COMPLETED`，Project Status 为 `Done`。事件证据显示 `2026-08-25T05:35:55Z` Issue 被关闭后，`github-project-automation[bot]` 同秒触发 `project_v2_item_status_changed`；这证明启用的 `Item closed` 自动化是提前 `Done` 的真实外部写入源。
- GraphQL schema 只暴露 `deleteProjectV2Workflow`，没有 enabled 更新入口。开发者亲自在 UI 关闭 #7 `Item closed`（`PWF_lAHOAzdmXs4BfO0pzgZ_XzY`）；Agent 于 `2026-08-25T07:25:40Z` 回读确认 #7 `enabled=false`，#8 `Pull request merged` 仍为 `enabled=true`。view 1「执行中」已通过 API 回读确认为空过滤器，可以显示已关闭 Issue。

## 本轮决策

- 不新增 Issue 状态标签；统一评审使用现有 Project `In review`。
- Issue 项目条目是需求交付状态的唯一 owner；PR 条目只跟踪 PR 生命周期，可在合并后由 #8 自动置为 `Done`。
- PR 技术审查开始后 Issue 条目进入 `In review`，合并后继续保持，直到覆盖当前批准范围的 PR 全部合并，且开发者在当前对话针对该 Issue 和 merge revision 集合明确统一评审通过。
- Reviewer 要求修复、验证未完成或统一评审失败时 Issue 条目回 `In progress`；若需要在同一 Issue 下继续实现且 Issue 已关闭，则重新打开，恢复指定实现者和 `status: claimed`，确有外部阻塞时改用 `status: blocked`。
- PM 写 `Done` 时记录 Issue 编号、Issue 项目条目 ID、PR 编号、merge revision 和确认来源；CI、Task、Reviewer、合并事件、历史授权或一般收尾指令均不能代替该确认。统一评审视图不得使用 `is:open` 过滤器。
- 治理门禁新增静态合同检查，防止后续角色文档改写重新引入“合并即 Done”或丢失 Leader → PM 强制状态交接。

## 完成状态

- workflow #7 已由开发者关闭并由 Agent 只读回读；#8 继续启用；view 1 filter 为空。
- 状态机、角色交接、Task 边界与治理回归已同步；evidence 更新后的最终树五项 required 全部通过，Task 状态为 `completed`。
- commit、push、PR、合并、发布和部署仍未授权、未执行。

## 非目标

- 不改变 Task frontmatter 状态枚举。
- 不新增或修改 GitHub 标签和 Project 字段；workflow #7 的 UI 开关由开发者亲自关闭，Agent 仅执行只读确认。
- 不回写 Issue #131 或其它远端条目。
- 不改变业务代码、产品 Spec 或运行时 Profile。
