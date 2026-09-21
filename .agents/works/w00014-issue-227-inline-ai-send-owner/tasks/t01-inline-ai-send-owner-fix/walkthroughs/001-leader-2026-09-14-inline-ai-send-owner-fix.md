# t01 叙事记录：Inline AI 发送 owner 修复

> **状态：治理链已完成。** 本文件与 `evidences/` 已在实现分支 `fix/w00014-inline-ai-send-owner` 提交；登记提交 `5c4fccfc` 已在 `origin/master`，主工作区不再保留副本。遗留：分支已 push 并开 PR **#235**，待 review/合并（勿 squash，需保留登记提交祖先关系）。
>
> 执行者：Leader（开发者在本会话直接授权执行实现与验证）；Task canonical role 登记为 `tasker`（结果类型是实现），属对 `.agents/roles/leader/AGENTS.md` 分工的会话内偏离。

## 症状与范围

Issue #227（0.10.2 / Windows 免安装包）报告：Inline AI 点发送后转圈复位、任务不运行；排查中还观察到「Agent 面板尚未准备好。」与「打开 Session 聊天」无反应。

## 根因

`app/pages/index.vue` 的 Inline AI 入口把操作所有权绑在右侧面板组件 `AgentChatSurface` 上：

- 面板未挂载 → `captureInlinePromptOwner()` 返回 null → 只弹「Agent 面板尚未准备好。」，零请求。
- 面板已挂载 → 页面把 surface 的 `@inline:<n>` 计数当 `expectedOperationKey` 传给 controller，controller 用自己独立的 `@inline:<n>` 计数比对，二者恒不相等（首次激活 surface=1、controller=2）→ `{status:"superseded"}` 静默返回（转圈复位、无提示、输入不清空、无请求）。

回归来源 `7db550e5`（2026-08-25, #47）：`v0.9.6` 不含该提交，`v0.10.0` 起包含；`v0.10.1 → v0.10.2` 在 `packages/neuro-book/{app,server,shared}` 零差异。

## 决策

- 采用最小修复（A）：owner 回归 controller 单点拥有；「打开 Session 聊天」回到 `openSession()` + `showAgentSession()`（#47 之前的既有形状）。
- 结构性收敛（B：surface 自带 inline 机制的归属）延后为独立 Task（见 Task README 缺口 5）。
- Spec 行为合同：开发者决定（2026-09-14）按 `docs/specs/README.md`「规范缺口」中 Markdown Studio 与编辑工作台的 **P1 优先级**排期迁移补齐（该表只登记优先级/证据/缺口，**无既有 owner 或 workstream**，需后续新建 Task 承载），本 Work 不新建 capability 正文（见 Task README 缺口 8；决策来源为开发者消息「可以交给 P1 迁移」）。

## 验证

命令、请求编号与原始输出见 `../evidences/2026-09-14-inline-ai-send-owner-verification.md`。摘要：

- 聚焦测试 4 次通过；`typecheck` 退出码 0、0 条 `error TS`。
- 面板关闭时发送 → `POST /api/agent/sessions/1/invocations => 200`；面板打开时同样 `200`。
- 「打开 Session 聊天」→ `[data-agent-panel]` 0→1，并 `GET /api/agent/sessions/1?view=recovery`。
- 机器人按钮开合面板 1→0→1；「Session 列表」弹窗可开；`console error` 0 条（2 条 Nuxt dev timer warning）。

## 自审（code-review-and-quality 五轴）

结论：**代码修复审查通过（Approve）**——仅针对本次 diff 与已列出的验证证据；**不代表 Task 可关闭、可提交或可合并**（治理迁移未完成、Spec 缺口、组件文档缺失分别见 Task 缺口 1/8/9）。改动是单一逻辑变更（3 文件、6 处、约 40 行）；这类页面 wiring 缺陷此前只能在整页层面观察，本次已在真实浏览器上端到端复核（覆盖范围见下）。

- **Correctness（仅限已执行范围）**：owner 的 key + revision 与 controller 内部 `acceptsOperation` 双层拦截保留，跨 Project 代次的陈旧请求语义与修复前一致（watcher 数据源由 surface 的 `@inline:N` 换成 controller 的 `@inline:N`，失效触发条件同为激活/失效事件）。**已验证**：浏览器实测覆盖发送（面板关闭/打开两种状态，均产生 invoke 200）与「打开 Session 聊天」（面板挂载 + recovery）；既有单测覆盖 controller 的 `createSession` 与 `sendPrompt`（fake services）。**未验证 / 未单独执行**：`selectInlineEditorSession`、`stopInlineEditorPrompt` 两条页面路径本次未跑——「停止」按钮只在 `inlinePromptRunning` 为真时渲染，而本环境无可用模型，invoke 在 438ms 内以 error 结束（`errorPhase: "pre_loop"`），无法进入 running 状态，故该路径在当前环境不可观测；发送失败分支只在无模型环境下走过（invoke 返回 error 结果）一次。
- **Readability**：命名与注释保持既有风格，`openInlineEditorSessionChat` 的文档注释随行为更新。
- **Architecture**：删除了「页面 → surface 实例 → controller key」这一所有权倒置，页面不再要求面板已挂载，概念数减少；`showAgentSession()` 保留在展示层，边界正确。
- **Security**：无新增输入面、无密钥、无 SQL/渲染变更。
- **Performance**：删除页面侧 inline session 列表 watcher，减少重复列表请求；未新增轮询或 N+1。

### 分级意见

- **Optional（缺口 4）**：缺少自动化回归测试。该缺陷只有端到端可观测，`product:browser-smoke` 目前只覆盖首屏挂载；建议按 Task README 缺口 4 的方案独立排期，不在本 Task 内扩为新的 E2E 层。
- **Optional（缺口 5）**：`AgentChatSurface` 的 inline 机制在本次修复后**失去全部外部入口**（全仓检索确认），成为与 controller 重复的第二份实现；其中 `sendInlineEditorPrompt` 可能在本 patch 之前就已无调用方（页面发送一直走 controller 的 `sendPrompt`）。其内部调用图仍自洽可运行，不能按可证明死代码直接删除。按仓库约定先登记、删除/合并前确认，不在本 Task 内静默处理。
- **Nit**：`captureInlinePromptOwner()` 的 `if (!operationKey) return null` 实际不可达（`operationScopeKey` 恒为非空模板串 `${scopeKey}@inline:${revision}`），它维持了 `| null` 返回类型与 4 个调用点的 `if (!owner)` 守卫（含保留的 `ide.inlineAi.agentNotReady` 防御分支）。保持最小 diff 不改。
- **FYI**：surface 与 controller 共用 `agent:inline-editor-session:<scope>`，前者写 schema-2 JSON、后者写纯数字；修复后页面路径不再触发 surface 写入，旧值回落为列表首项（缺口 6）。
- **Optional（缺口 9）**：所改 `.vue` 组件缺同名文档。`docs/standards/code/components.md` 要求每个 `app/**` 组件有同名 Markdown（含能力标签 frontmatter），`AgentChatSurface.md` 全仓不存在，`app/**` 整体缺该层文档且仓库无自查脚本，按规范记为「待声明」；本 Task 未补。
- **FYI（缺口 10/11）**：`frontend.md` 要求前端改动说明桌面**与窄屏**影响，本次只有桌面 1280×720 的真实证据，390×844 未验证；另 `index.vue`（2852 行）与 `AgentChatSurface.vue`（4454 行）均远超其 800 行硬审查线（本次未新增职责、净减代码）。
- **规范路由已覆盖**：`docs/standards/code/README.md` 路由命中 `common.md`、`languages/typescript.md`、`frontend.md`，因改 `.vue` 追加 `components.md`，四份均已读（`app/**` 另见最近作用域 `AGENTS.md`）。

## 独立复核（reviewer: InlineAiOwnerReview）

结论：**未发现 Critical / Required 问题**，findings 为空。结构化结论（`agent://InlineAiOwnerReview`）：`overall_correctness: "correct"`、`confidence: 0.91`、`findings: []`（首轮 yield 因 findings schema 校验失败，经纯文本重发后落定；纯文本版与结构化版结论一致）。逐项：

- **(a) owner 语义**：页面 capture/accepts 与 controller 现在读同一 canonical key（`scopeKey@inline:operationRevision`），跨 Project、active 翻转、ready revision 与 operation revision 的旧请求由 controller `acceptsOperation` 与页面 key+revision 双重拦截；静态阅读未发现会把当前发送误判为陈旧的新增时序。**追加复核**：专门核对了 active=false/true 与 scopeKey 因 `projectSwitching` 暂时变化的时序——controller watcher 与模板渲染同批调度、`beginOperations/invalidateOperations` 无 await，key 不会在一次激活中被半更新，新 key 只在 controller owner 失效时变化；异步发送期间即使发生 Project/reconnect 代次变化，controller 内 `acceptsOperation` 也会在每个 await 边界拦截。reviewer 结论（**静态判断，非修复前基线测量**）：未见「当前发送被无故误判为陈旧」的路径；普通异步切换竞态**未证明由本 patch 引入**（旧实现同样不取消已发出的 HTTP），故未列为 finding，仍属待运行验证项。
- **(b) 调用点**：controller 侧无旧 `expectedOperationKey` 调用方、无三参数 `sendPrompt`（测试与页面均为两参数）；`defineExpose` 去掉 `inlineOperationScopeKey` 后无模板、组件、测试或其它读取方。Surface 内部同名参数仍在，属独立旧机制。
- **(c) 打开 Session**：`superseded`/owner 失效静默返回，真实异常走 `openModelPanelFailed`，成功才 `showAgentSession`；surface 未挂载时 `agentPanelOpen` 会在 nextTick 挂载后取 template ref，取不到即安全 return。**该路径已在浏览器验证**（见「验证」一节 V3）。
- **(d) watcher/清理**：无悬空变量、失效 import 或本次删除导致的悬空 i18n；`unref` 在页面无剩余引用；`bindFailed`/`agentNotReady`/`openModelPanelFailed` 各自仍有使用者。
- **(e) 测试/文案**：`useInlineEditorAgentController.test.ts` 仍覆盖「不挂载 Agent Chat Surface 也能创建并调用 Inline Session」、两参数 `sendPrompt` 断言 `current` 与 create/recovery/invoke；**未覆盖**页面 `openSession()+showAgentSession()` 与 `operationScopeKey` 跨代竞态。注释与 `ide.inlineAi.*` 文案与实际右侧面板路径一致。

独立复核未把「异步切换竞态」列为 finding——**未证明由本 patch 引入、待运行验证**（非基线测量）；其长期载体仍是 Task 缺口 4 的自动化回归测试。`openSession()+showAgentSession()` 已由 V3 覆盖。

## 提交信息（已使用）

登记提交 → `5c4fccfc`（已推送 `origin/master`）；实现提交 → `32bcf73a`（分支上紧随登记提交的实现提交；其后只会追加记录修正提交，不再 amend）。两条提交信息如下：

登记提交（仅 `.agents/works/w00014-issue-227-inline-ai-send-owner/**`）：

```
chore(governance): register Issue 227 inline AI send owner fix
```

实现提交（仅本 Task 涉及的三个应用文件）：

```
fix(agent): Inline AI 发送与 Session 聊天不再依赖面板挂载

页面把 inline prompt 的 operation key 取自已挂载的面板组件实例（@inline:<n>），
而 session 与发送由 useInlineEditorAgentController 拥有，两套计数器恒不相等：
面板挂载时静默 superseded，未挂载时弹「Agent 面板尚未准备好。」且不发请求。
回归自 7db550e5（#47），v0.9.6 不受影响，v0.10.0 起包含（Issue #227）。

- owner 改用 inlineEditorAgent.operationScopeKey，发送不再传 surface key
- captureOperation()/sendPrompt() 去掉 expectedOperationKey 形参
- openInlineEditorSessionChat() 回到 openSession() + showAgentSession()
- 删除页面侧 surface inline 列表 watcher，scope watcher 改看 controller key
- AgentChatSurface.defineExpose 移除已无消费方的 inlineOperationScopeKey

验证：聚焦单测 useInlineEditorAgentController 通过、typecheck 退出码 0；
隔离状态根 + Chrome 实测：面板关闭/打开时发送均产生
POST /api/agent/sessions/1/invocations 200，打开 Session 聊天挂载面板并拉取 recovery。
未包含：surface inline 机制删除（另开 Task）、真实模型运行（未授权）。
```
