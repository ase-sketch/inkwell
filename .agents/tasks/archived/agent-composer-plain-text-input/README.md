# Agent Composer Plain Text Input

## User Request

- `request_user_input` 期间前端不再显示两个输入框；审批/回答时只复用底部 Agent Composer 这一个输入框。
- Agent Composer 输入框需要按内容自动撑高。
- Agent Composer 不再承担 Markdown 富文本编辑语义，避免用户输入自定义 XML tag 时被 Markdown / HTML 解析误伤。
- `nb-reference-chip` 等引用 chip 仍需要能在输入框内展示。
- 虽然后端支持 waiting_user / approval 期间继续 `steer` / `followup`，本轮前端明确不允许这个操作。

## Goal

将 Agent Composer 收敛为一个面向聊天/审批的纯文本输入器：普通消息、`request_user_input` 开放回答和备注都使用同一个底部输入框；输入框根据真实内容高度自动增长；输入内容按纯文本处理，只有明确识别出的引用和 skill token 渲染为 inline chip。完成后，waiting_user 期间前端只能提交当前审批/回答 resolution，不能再发起 steer / followup。

## Initial State

- `AgentComposer.vue` 当前在 `pendingSession` 存在时显示 `AgentUserInputPrompt`，并额外显示一个“运行中消息...（Enter 引导，Ctrl+Enter 队列）”输入框。
- 额外的运行中消息输入框写入全局 `inputText`，提交时 Enter 触发 `steer`，Ctrl/Meta+Enter 触发 `followup`。
- 底部主输入框在 `pendingSession` 存在时写入当前问题的 `notes[activeQuestionKey]`，但提交入口被禁用，用户需要通过 `AgentUserInputPrompt` 的继续按钮提交。
- `AgentReferenceInput.vue` 通过 `StructuredTextEditor mode="rich"` 间接复用 `TipTapMarkdownEditor`，因此当前 Agent Composer 仍携带完整 Markdown 富文本编辑语义。
- `StructuredTextEditor` 已有 `autoHeight` prop，但 Agent Composer 未启用；该实现也只是按文本换行数估算高度，无法准确处理自动换行、chip 和容器宽度变化。

## Walkthrough

- 先确认 waiting_user 的第二个输入框不是普通重复 UI，而是 steer / followup 前端入口。
- 用户决定简化前端：即使后端支持审批期间 steer / followup，前端也不允许这个操作。
- 因此本任务的 UI 合同改为：waiting_user 期间只保留审批/回答通道；queued steer / followup chip 在该状态下不展示，也不能新增。
- Agent Composer 的编辑器需要从 Markdown Studio 的完整 Markdown 编辑器中拆出，改为纯文本编辑器，只保留 inline chip 和 trigger 能力。

## Decisions

- waiting_user / approval / request_user_input 期间，前端不再提供 steer / followup 输入入口。
- `pendingSession` 存在时，底部唯一 Composer 输入框绑定当前 active question 的 note / open answer draft，而不是全局 `inputText`。
- `pendingSession` 存在时，底部提交按钮语义改为继续/提交当前问题；不再因为 `pendingSession` 直接禁用。
- `AgentUserInputPrompt` 继续负责问题卡片、选项状态和整组 resolution payload；Composer 只负责当前 active question 的文本 draft 和提交触发。
- Agent Composer 不再通过 `StructuredTextEditor mode="rich"` 复用 `TipTapMarkdownEditor`。
- 不建议给 `StructuredTextEditor` 新增 Agent 专用模式。`StructuredTextEditor` 继续作为 Markdown 表单编辑器；Agent Composer 使用独立的 plain text composer editor。
- 新编辑器仍可使用 TipTap / ProseMirror 作为输入内核，但不能使用 Markdown parser 作为内容真相。
- XML / HTML-like 输入例如 `<foo attr="bar">text</foo>` 必须作为普通文本保留，不解析成 HTML，也不进入 Markdown 富文本节点。
- 只有明确识别出的引用 token 和 skill token 可以转成 inline atom chip；序列化时再还原成后端已支持的文本格式。
- 引用 chip 序列化继续沿用现有后端可识别格式，例如 `[label](target)`；本任务不改 runtime 对引用文本的理解。
- 引用 token 识别范围只覆盖系统 reference menu / serializer 会产出的格式；不要把所有 Markdown link 都泛化渲染成 chip。
- `$ skill` trigger / chip 继续保留，它属于 Agent Composer 的结构化输入能力，不属于 Markdown 富文本语义。
- `pendingSession` 存在时，Enter 提交/继续当前 active question，Shift+Enter 插入换行。
- `pendingSession` 存在时，不展示已有 steer / followup queue chips，保持审批/回答界面简单。
- 自动撑高应基于编辑器 DOM 的真实 `scrollHeight` / ResizeObserver，而不是按字符串换行数估算。
- plain text editor 可以做成通用组件，但不作为 `StructuredTextEditor` 的新模式。Agent Composer 通过 Agent wrapper 复用该通用组件。
- 粘贴统一按纯文本处理；不保留网页/Markdown/富文本里的 HTML、粗体、标题或列表结构，只在纯文本中扫描可识别 reference / skill token。
- 通用 `ReferencePlainTextEditor` 不感知 session、pendingSession、request_user_input、steer/followup、model select 或 Plan Mode 按钮，这些业务语义由外层 wrapper 处理。
- 多题 `request_user_input` 切换 active question 时必须保留每题 draft，Composer 只切换当前绑定的 `notes[key]`。
- `app/components/novel-ide/agent/tiptap/AgentReferenceNode.ts` 和对应 View 当前没有被 active editor extension 引入，已作为旧 Agent 引用节点遗产清理；新通用编辑器不基于它实现。

## Proposed Component Shape

当前关系：

```text
AgentComposer
  -> AgentReferenceInput
    -> StructuredTextEditor(mode="rich")
      -> TipTapMarkdownEditor
        -> createMarkdownEditorExtensions(...)

MarkdownStudio
  -> TipTapMarkdownEditor
  -> MarkdownSourceEditor
```

目标关系：

```text
AgentComposer
  -> AgentUserInputPrompt
  -> AgentComposerInput
    -> ReferencePlainTextEditor
      -> createPlainReferenceTextExtensions(...)

MarkdownStudio
  -> TipTapMarkdownEditor
  -> MarkdownSourceEditor

StructuredTextEditor
  -> TipTapMarkdownEditor / MarkdownSourceEditor
```

## Implementation Status

- 已按目标关系落地：`AgentComposer` 改用 `AgentComposerInput -> ReferencePlainTextEditor -> createPlainReferenceTextExtensions(...)`。
- `StructuredTextEditor` 没有新增 Agent 专用模式，Markdown Studio 仍独立使用 `TipTapMarkdownEditor` / `MarkdownSourceEditor`。
- `request_user_input` pending 时已删除第二个运行中消息输入框，底部 Composer 的 Enter / 按钮改为继续或提交当前 active question。
- pending 时前端不再触发 steer / followup，也不展示已有 steer / followup queue chips。
- 自动撑高使用 DOM `scrollHeight` 测量，并在测量前临时恢复 `height: auto`，确保内容删除后也能收缩。
- plain editor 粘贴只消费 `text/plain`，不接收 HTML fragment；XML-like 文本按普通文本保留。
- slash command trigger 只插入普通文本，不执行 Markdown heading/list/code 等富文本命令，并保留旧 quick trigger 的 `hasPlainTextBeforeTrigger` 过滤语义。
- 已补充回归修复：`nb-reference-chip` / `nb-skill-chip` 样式抽到全局 stylesheet，避免 plain editor 手写 node view 在未加载 Vue chip 组件时显示成裸文本。
- 已补充回归修复：`ReferencePlainTextEditor` 现在响应 `menuRefreshKey`，active `$ skill` 菜单会在 skill catalog 首次加载完成后自动从 loading 刷到真实结果。
- 已补充大文本模式：Agent Composer 可原地展开，展开态使用更大的编辑高度，并把 Enter / Ctrl+Enter 都改成换行语义；提交只走右下角按钮。
- 已补充根级 workspace 文件引用稳定序列化：菜单插入的 `AGENTS.md` 一类根级文件会序列化成 `workspace/AGENTS.md`，避免重新解析后无法渲染 chip。
- 已补充长文滚动 UX 修复：`ReferencePlainTextEditor` 不再因 selection-only transaction 测高并强制滚到底部，内部滚动改为接近底部才吸底，用户在上方点选或用方向键移动光标时会保留当前位置。
- 已补齐已有长文打开/切换场景：`ReferencePlainTextEditor` 初始和外部 `modelValue` 替换长文本时默认回到顶部；只有用户已经在底部附近时，内部输入增长才继续贴底。

`createPlainReferenceTextExtensions(...)` 只保留：

- document / paragraph / text / hardBreak
- placeholder
- workspace reference chip
- agent skill chip
- `@` / `$` / `/` trigger menu
- Enter submit、Shift+Enter newline、Shift+Tab Plan Mode

明确不包含：

- heading / list / blockquote
- bold / italic / underline / strike
- code / table / image
- frontmatter
- inline comment
- Markdown HTML/XML parsing
- Markdown Studio context menu / selection menu

## Implementation Plan

### Slice 1: Plain Reference Text Model

目标：先把“纯文本 + 少量 atom”的内容模型做成可测工具，避免在 Vue 组件里堆字符串逻辑。

- 新增工具模块：
  - `app/utils/plain-reference-text.ts`
  - 负责 plain text parser / serializer 的纯函数。
- Parser 输入：普通字符串。
- Parser 输出：可喂给 TipTap `setContent()` 的 ProseMirror JSON。
- Serializer 输入：ProseMirror doc JSON 或 `Editor.state.doc`。
- Serializer 输出：普通字符串。
- 文本规则：
  - 普通 text 原样保留。
  - `\n` 保留为 hardBreak / paragraph boundary，序列化回 `\n`。
  - XML / HTML-like 文本原样保留，例如 `<custom-tag attr="x">hello</custom-tag>`。
  - 不调用 Markdown parser，不使用 `contentType: "markdown"`。
- Reference 规则：
  - 只识别系统 reference menu / serializer 会产出的格式。
  - 优先复用 `parseReferenceLink()`、`parseWorkspaceReferenceLink()` 和现有 reference target 判断。
  - 不把普通 Markdown link、HTTP link 或任意 `[label](target)` 泛化成 chip。
  - reference atom 序列化回现有后端可识别文本，例如 `[label](target)`。
- Skill 规则：
  - 识别 `$skillName` / `${skillName}` 这类现有 Agent skill token。
  - skill atom 序列化回 `$skillName`。

验证：

- 为 `app/utils/plain-reference-text.ts` 增加 focused unit tests。
- 覆盖 XML tag 原样保留、普通 Markdown link 不转 chip、系统 reference 转 chip 后可序列化回原格式、skill token round-trip、换行 round-trip。

### Slice 2: Generic ReferencePlainTextEditor

目标：实现通用输入器，不带任何 Agent session 业务语义。

- 新增通用组件：
  - `app/components/common/form/ReferencePlainTextEditor.vue`
- 建议 props：
  - `modelValue: string`
  - `placeholder?: string`
  - `minHeight?: number`
  - `maxHeight?: number`
  - `readonly?: boolean`
  - `borderless?: boolean`
  - `submitOnEnter?: boolean`
  - `enableQuickTriggers?: boolean`
  - `matchPopoverWidth?: boolean`
  - `menuRefreshKey?: string | number`
  - `resolveMenu?: (context: AgentTriggerMenuContext) => AgentTriggerMenuState`
  - `onSkillTriggerStart?: () => void`
- 建议 emits：
  - `update:modelValue`
  - `submit`，携带 `{ ctrlKey?: boolean; metaKey?: boolean }`
  - `shift-tab`
  - `focus`
  - `blur`
- 建议 expose：
  - `focus()`
  - `insertText(text: string)`
  - `getText()`
- 新增轻量 extension factory：
  - `app/components/common/form/tiptap/plain-reference-text-extensions.ts`
  - 只注册 document / paragraph / text / hardBreak / placeholder / reference atom / skill atom / quick trigger。
  - 不注册 Markdown、StarterKit 里的 marks、table、image、code、frontmatter、inline comment。
- Reference atom：
  - 新建 plain reference node，不直接复用 Markdown Studio `WorkspaceReference` 的 Markdown tokenizer。
  - 可以复用 `ReferenceChip.vue` / `reference-chip.ts` 的视觉和 meta 逻辑。
  - trigger menu 可复用现有 `agent-suggestion` 渲染和 `ReferenceSelectorPopover`，但 extension 不依赖 Markdown Studio 的 full editor。
- Skill atom：
  - 可先复用 `AgentSkillNode` 的 node view / suggestion 行为；如果它的 Markdown tokenizer 与 plain editor 边界冲突，再拆出 plain skill node。
- 粘贴：
  - 强制读取 `event.clipboardData.getData("text/plain")`。
  - 阻止 HTML fragment 进入 ProseMirror。
  - 对粘贴文本跑 plain parser，只把系统 reference / skill token 转 atom。
- 自动撑高：
  - 输入、外部 `modelValue` 同步、粘贴、chip 渲染后 `nextTick()` 测量内容 DOM。
  - 用 `ResizeObserver` 监听容器宽度和内容高度变化。
  - 高度 clamp 到 `minHeight` / `maxHeight`。
  - 超过 `maxHeight` 后内部 `overflow-y: auto`。

验证：

- unit test 覆盖 parser / serializer。
- 组件层手工或轻量测试覆盖 `submitOnEnter`、`Shift+Enter`、`Shift+Tab`、paste plain text、auto-height clamp。

### Slice 3: AgentComposerInput Wrapper

目标：把通用编辑器包成 Agent Composer 的输入条，不让通用组件知道 Agent 业务状态。

- 新增 Agent wrapper：
  - `app/components/novel-ide/agent/AgentComposerInput.vue`
- Wrapper 负责：
  - 传入 `resolveMenu` / `menuRefreshKey` / `onSkillTriggerStart`。
  - 统一 placeholder。
  - 统一 `borderless` 和 composer 内部样式。
  - 根据 `expanded` 切换普通聊天模式和大文本模式的高度与 Enter 语义。
  - 把 `submit` / `shift-tab` 继续向 `AgentComposer.vue` 抛出。
  - expose `focus()` / `insertText()` / `getText()`。
- 替换现有 `AgentReferenceInput.vue`：
  - `AgentComposer.vue` 改用 `AgentComposerInput`。
  - 如果 `AgentReferenceInput.vue` 替换后无引用，删除该旧 wrapper。

验证：

- `rg "AgentReferenceInput"` 确认替换范围。
- 普通 idle 发送、running steer、running Ctrl/Meta+Enter followup 的 submit 分派仍在 `AgentComposer.vue` 中保持。
- 大文本模式下 Enter / Ctrl+Enter 不触发 submit，右下角按钮仍保持普通 send / running steer / pending continue 语义。

### Slice 4: request_user_input Single Composer

目标：pendingSession 下只保留底部唯一 Composer，并把底部提交按钮接到当前题继续/提交。

- 调整 `AgentComposer.vue`：
  - 删除 `pendingSession` 下的“运行中消息...（Enter 引导，Ctrl+Enter 队列）”输入框。
  - `activeComposerValue` 在 pending 下继续绑定 `notes[activeQuestionKey]`。
  - `updateComposerValue()` 保持每题 draft 写入 `notes[key]`。
  - `sendDisabled` 在 pending 下不再固定 `true`，而是读取当前题是否可继续。
  - `sendIconClass` / `sendButtonTitle` 在 pending 下改成继续/提交语义。
  - `submitComposer()` 在 pending 下调用当前题继续/提交，不触发 `send` / `steer` / `followup`。
  - `submitButton()` 在 pending 下同样调用当前题继续/提交。
  - `queuedMessages` 区块加 `!props.pendingSession` 条件，pending 下不展示 queue chips。
  - running 且非 pending 时保留原有 steer / followup 逻辑。
- 调整 `AgentUserInputPrompt.vue`：
  - 给 `active-question-change` 增加当前题状态，例如：
    - `canContinue: boolean`
    - `canSubmitAll: boolean`
    - `submitButtonLabel: string`
  - 在 `selectedAnswers` / `notes` / `activeQuestion` 变化时同步 emit 当前题状态。
  - `defineExpose({ continueQuestion })`，供底部 Composer Enter / 按钮调用。
  - 保持 `submit()`、`ignoreQuestion()` 和 payload 组装逻辑不变。
- 交互规则：
  - pending 下 Enter：调用 `continueQuestion()`。
  - pending 下 Shift+Enter：编辑器插入换行。
  - pending 下 Ctrl/Meta+Enter：不触发 followup，按 Enter 同样处理当前题或忽略 modifier。
  - 没有 pending 时，运行中 Enter / Ctrl+Enter 继续沿用 steer / followup。

验证：

- request_user_input pending 时 DOM 里只有一个 composer editor。
- pending 下输入开放回答后 Enter 能提交/进入下一题。
- 多题切换时每题 draft 保留。
- pending 下不展示 queued steer / followup chips，也不能新增 queue item。
- 非 pending running 下 steer / followup 不回归。

### Slice 5: Cleanup And Documentation

目标：移除旧链路遗留，保持任务文档和状态一致。

- 删除被替换后无引用的旧 wrapper：
  - `app/components/novel-ide/agent/AgentReferenceInput.vue`
- 保持 `StructuredTextEditor.vue` 不新增 Agent 模式，不因为本任务改 Markdown 表单编辑器语义。
- 如发现 `StructuredTextEditor` 只剩其他表单正常使用，不做额外重构。
- 更新本 task 的 Files Changed / Verification。
- 如实现改变用户可见行为，按项目规范同步 `PROJECT-STATUS.md` 的相关 TODO 或 Recent Tasks 状态。

验证：

- `rg "AgentReferenceInput|AgentReferenceNode|agentReference"` 确认旧遗产清理干净。
- 运行 focused tests：
  - `bun test app/utils/plain-reference-text.test.ts`
  - 视实现影响追加 `app/components/novel-ide/agent/*.test.ts` 相关用例。
- 不自动做浏览器验证；完成后建议用户允许一次真实浏览器交互验收。

## Files Changed

- Documentation:
  - `docs/tasks/40-agent-composer-plain-text-input/README.md`
  - `PROJECT-STATUS.md`
- Plain text model:
  - `app/utils/plain-reference-text.ts`
  - `app/utils/plain-reference-text.test.ts`
- Generic editor:
  - `app/components/common/form/ReferencePlainTextEditor.vue`
  - `app/components/common/form/tiptap/plain-reference-text-extensions.ts`
- Shared styles:
  - `app/styles/reference-chips.css`
  - `nuxt.config.ts`
  - `app/components/common/ReferenceChip.vue`
  - `app/components/common/SkillChip.vue`
- Agent Composer:
  - `app/components/novel-ide/agent/AgentComposer.vue`
  - `app/components/novel-ide/agent/AgentComposerInput.vue`
  - `app/components/novel-ide/agent/AgentUserInputPrompt.vue`
- Legacy cleanup:
  - deleted `app/components/novel-ide/agent/AgentReferenceInput.vue`
  - deleted `app/components/novel-ide/agent/tiptap/AgentReferenceNode.ts`
  - deleted `app/components/novel-ide/agent/tiptap/AgentReferenceNodeView.vue`

## Verification

- Passed: `bun test shared/reference-trigger.test.ts app/utils/plain-reference-text.test.ts app/components/novel-ide/agent/agent-message.test.ts app/utils/agent-message-projection.test.ts`
  - 60 tests passed.
  - 覆盖 XML-like 文本原样保留、XML/template 变量不误转 skill、普通 Markdown link 不转 chip、label 内含方括号的系统 reference、domain reference / skill token round-trip、多行文本、`hasPlainTextBeforeTrigger` 和 request_user_input projection 相关回归。
- Passed after follow-up fixes: `bun test app/components/novel-ide/agent/tiptap/agent-suggestion.test.ts app/utils/plain-reference-text.test.ts shared/reference-trigger.test.ts app/components/novel-ide/agent/useStructuredReferenceMenu.test.ts`
  - 34 tests passed.
  - 覆盖根级 workspace 文件引用稳定序列化、普通 link 不转 chip、XML/template 不误转 skill、trigger 匹配、skill catalog 首次加载菜单刷新，以及 command trigger 的 `hasPlainTextBeforeTrigger` 菜单状态透传。
- Checked: `rg "AgentReferenceInput|AgentReferenceNode|agentReference" app server shared`
  - 无 active 代码残留。
- Checked: old legacy files no longer exist.
  - `app/components/novel-ide/agent/AgentReferenceInput.vue`
  - `app/components/novel-ide/agent/tiptap/AgentReferenceNode.ts`
  - `app/components/novel-ide/agent/tiptap/AgentReferenceNodeView.vue`
- Checked after long-text scroll fix: `rg "onTransaction|scrollTop = body.scrollHeight|scrollBodyToBottom|handleBodyScroll|scrollToTopOnNextMeasure" app/components/common/form/ReferencePlainTextEditor.vue`
  - `ReferencePlainTextEditor` 已无 selection-only transaction 测高与无条件滚到底部逻辑；自动贴底只走内部 sticky-bottom 状态，外部内容替换会重置下一次测高到顶部。
- Passed after latest long-text scroll fix: `bun run typecheck`
- Not run: browser interaction verification.
  - 仓库指令要求不自动做浏览器验证；后续建议在 dev server 中手工确认 pending request_user_input 单 Composer、Enter/Shift+Enter、queue chip 隐藏、自动撑高和 chip 渲染。

## TODO / Follow-ups

- 做一次真实浏览器交互验收：pending request_user_input、普通 running steer/followup、plain paste、chip trigger、自动撑高收缩。
- 做一次真实浏览器交互验收：第一次输入 `$` 的 skill loading 刷新、根级文件 chip 渲染、大文本模式 Enter 只换行且按钮提交。
- 后续如果普通表单要使用该能力，直接复用 `ReferencePlainTextEditor`；不要把它塞进 `StructuredTextEditor` 的 mode 系统。
