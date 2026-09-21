---
schema: nbook.work/v1
workId: w00014-issue-227-inline-ai-send-owner
issueId: i227
---

# Issue 227 Inline AI 发送与 Session 聊天入口修复

修复 0.10.x 上 Inline AI Prompt Bar 发送完全失效：点「发送给 Inline AI」只转圈复位或弹「Agent 面板尚未准备好。」。根因是页面把操作所有权绑在右侧面板组件 `AgentChatSurface` 的实例与其独立 `@inline:<n>` 计数上，而 Prompt Bar 的 session 与发送由 `useInlineEditorAgentController` 拥有——面板挂载时两套计数器恒不相等（静默 `superseded`），面板未挂载时 owner 捕获直接返回 null。目标状态：Inline AI 的 Project 代次与 session 由 controller 单点拥有，页面不依赖面板是否挂载；「打开 Session 聊天」把 inline session 交回面板主会话槽显示（#47 之前的既有路径）。

## 交付边界

- `app/pages/index.vue` 的 `InlinePromptOwner` 只依赖 `inlineEditorAgent.operationScopeKey`，发送调用不再传 surface 的 operation key。
- `useInlineEditorAgentController` 的 `captureOperation()` 与 `sendPrompt()` 不再接受外部 `expectedOperationKey`；跨 Project 代次保护留在页面 owner（key + revision）与 controller 内部 `acceptsOperation`。
- 「打开 Session 聊天」= `inlineEditorAgent.openSession()` + `showAgentSession(sessionId)`；不再经由 surface 的 inline 选择路径，也不再写 `agentSessionPanelOpen`。
- 门禁：`test -- useInlineEditorAgentController`、`typecheck` 退出码 0，隔离状态根上的浏览器实测覆盖发送（面板关闭/打开）与打开 Session 聊天。

## 非目标

- 不删除或合并 `AgentChatSurface` 自带的 inline 机制（`openInlineEditorSession`/`sendInlineEditorPrompt`/`refreshInlineEditorSessions`/`inlineEditorStream` 等）：修复后已无外部消费方（其中 `sendInlineEditorPrompt` 在本 patch 之前很可能就已无调用方），收敛另开 Task。
- 不实现 Agent 模式布局入口（`layoutMode` 当前无 UI 入口）。
- 不处理浏览器记忆中旧 surface schema-2 JSON 与 controller 纯数字的格式兼容。
- 本次不新建或迁移 `docs/specs/` 正文（**不是规范豁免**：`docs/specs/README.md` 的 Bug 流仍要求同一 Task 补齐 `implemented` 行为合同）；**开发者已决定（2026-09-14）按该文件「规范缺口」表中 Markdown Studio 与编辑工作台的 P1 优先级排期迁移**——该表只登记优先级与缺口，**当前没有既有 owner/workstream**，需后续新建 Task 承载；本 Work 不另建正文，缺口 8 仍阻塞 Task 关闭。
- 本次不为改动的组件补同名 `*.md` 与能力标签（**不是规范豁免**：`docs/standards/code/components.md` 把组件同名文档列为「不可缺省」）；按 Task 缺口 9 跟踪，后续 Task 或文档迁移必须补齐。
- 不调用真实 Provider/Model；不执行远端 Issue/Project/PR 写入、push、合并、发布或部署。**（上一行是范围边界，不是执行日志**：本次实际执行的受限动作有「登记提交 push」「Issue #227 回帖」「实现分支 push 与 PR #235 创建」，均经开发者本会话明确授权；**合并与发布/部署仍未授权**，留痕见 Task README 的「已执行的远端写入」。）
