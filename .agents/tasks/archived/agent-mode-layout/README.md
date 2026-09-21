# Agent Mode Layout

## User Request

- 当前项目主界面截图中的布局称为 IDE 模式，核心体验聚焦中间 Markdown Studio / 编辑区域。
- 需要新增一个 Agent 模式，让 [NovelAgentDrawer.vue](../../../app/components/novel-ide/NovelAgentDrawer.vue) 从右侧抽屉升级为中间主体。
- Agent 模式左侧改为 session 列表。
- Agent 模式右侧改为文件 / studio 面板，命名暂不确定。
- 右侧文件面板内部仍然需要支持在右侧展开文件树。

## Goal

新增一个 Agent 模式主界面规划：用户可以在 IDE 模式与 Agent 模式之间切换；Agent 模式以 Agent 对话为中心，左侧承担当前 Project Workspace 内的 session 导航，右侧承担 Studio 辅助工作区，并保留文件树展开能力。实现完成后应通过前端结构检查和实际页面验收确认：IDE 模式现有编辑体验不回退，Agent 模式能正常显示 session 列表、主体 Agent 对话和右侧 Studio 面板。

## Current State

- 现有 IDE 模式是左侧文件树、中间编辑器、右侧 Agent 抽屉。
- [NovelAgentDrawer.vue](../../../app/components/novel-ide/NovelAgentDrawer.vue) 当前作为右侧 Agent 面板存在，用户希望它在 Agent 模式成为主工作区。
- 顶部导航已有 `AGENT` 入口视觉，但当前任务尚未核对它的真实路由 / 状态切换实现。
- session 管理已存在相关能力，但本任务尚未核对其组件边界与能否直接复用到左侧栏。
- 右侧“文件 / studio 面板”的准确命名与内部层级暂未定稿。
- 现有 [NovelAgentDrawer.vue](../../../app/components/novel-ide/NovelAgentDrawer.vue) 不只是聊天组件，它还承担 session 恢复 / 列表刷新、SSE 连接状态、linked agent、模型选择、composer、Plan Mode、审批恢复等抽屉级 glue。Agent 模式实现前需要拆清“Agent 主体聊天”和“抽屉外壳 / 导航状态”。
- 当前 IDE 模式的 Studio 和文件树组件是复用目标。本任务不应该为 IDE 模式和 Agent 模式新建两套不同的 Studio / 文件树组件。

## Reference: Codex Agent Mode

- 用户提供的 Codex Agent 模式参考图显示为三块工作区：
  - 左侧是会话 / 项目导航：新对话、搜索、技能、插件、自动化、置顶会话、项目会话列表。
  - 中间是 Agent 对话主体：当前会话内容、运行状态、输入框、权限 / 模型等运行控制。
  - 右侧是项目上下文工作区：编辑器 tab、文档内容、文件树和打开方式入口。
- 对 NeuroBook 的启发：
  - Agent 模式不应只是“把右侧抽屉放大”，而应把 Agent 作为主工作台，中间区域承载完整运行循环。
  - 左侧 session 列表应成为 Agent 模式的一等导航，而不是继续藏在弹窗中。
  - 右侧 Studio 面板应能承载 Project Workspace 上下文：文件树、已打开文件、Markdown Studio 或后续 Plot / Reference 等辅助视图。
  - 右侧文件树可以作为右侧 studio 面板内的可展开区域，不必复用 IDE 模式的左侧文件树位置。

## Walkthrough

- 2026-06-01：根据用户截图和描述创建本任务，先记录布局目标、现状假设、实现边界和待决问题；本轮不开始实现。
- 2026-06-01：根据 Codex Agent 模式参考图补充空间分工：左侧会话导航、中间 Agent 运行主体、右侧项目上下文 / 文件工作区；确认后续需要先拷问产品边界再实现。
- 2026-06-01：第一轮拷问确认：不做跨项目切换；左侧仍需要置顶等 session 操作；IDE 右侧 Agent 抽屉退场为同一 Agent chat surface 的布局槽位复用；Agent 模式中间始终只给 Agent；右侧正式命名为 Studio，并直接复用当前 Studio 和文件树组件。
- 2026-06-01：第二轮拷问确认：模式状态可作为主界面 layout mode 保存；切换模式时不允许因重挂载导致流式输出、SSE、滚动位置或 session 状态丢失；IDE 模式仍可隐藏右侧 Agent；Agent Mode 的关闭行为回到 IDE Mode；session 置顶第一版是本机 UI 偏好；左侧列表默认只显示 leader sessions；窄屏优先保护中间 Agent，Studio 可收起；动画服从状态稳定性。
- 2026-06-01：第三轮拷问确认：接受把 [NovelAgentDrawer.vue](../../../app/components/novel-ide/NovelAgentDrawer.vue) 改成薄壳并拆出可复用 Agent Chat Surface；Agent Mode 左侧常驻 session 列表是主要入口，现有 session 弹窗在 Agent Mode 中退为筛选 / 高级管理或暂不出现；Studio 默认显示当前打开文件，文件树作为 Studio 内可展开栏；进入 Agent Mode 时若 IDE Agent 隐藏，也应自动打开并恢复最近 session；新对话沿用当前 workspace 默认 leader profile 解析逻辑。
- 2026-06-01：实现第一版 Agent Mode 主布局：`AGENT` 顶部入口切换 `layoutMode`；同一个 `AgentChatSurface` 在 IDE 右侧槽位和 Agent Mode 中间槽位之间复用；Agent Mode 左侧新增当前 Project Workspace 的 leader session 列表，支持搜索、刷新、新建、归档和本机置顶；右侧 Studio 复用 `MarkdownStudioWorkbench` 和 `WorkspaceFilePanel`，可在 Studio 内展开文件树。
- 2026-06-01：根据代码结构审查修正状态边界：隐藏 IDE Agent 槽位时不销毁 chat flow / composer 子树，避免丢滚动和输入草稿；Project Workspace identity 变化时硬重置 Agent session / SSE / session list，避免同 profile 的不同项目复用旧 session；Agent Mode 左侧新建 session 改走带 loading guard 的 UI action；`MarkdownStudioWorkbench` 增加 `compact` 布局入口，Agent Mode 右侧 Studio 展开文件树时不再把完整编辑器塞进 360px 窄栏。
- 2026-06-01：浏览器验收发现 `AgentChatSurface` 内误用裸 `<template>` 包裹导致中间 Agent 主体 DOM 存在但不可见，已移除该包裹；同时把 Agent Mode Studio 文件树宽度收紧到 240px、compact Studio 最小宽度收紧到 320px，保证 1120px 视口下 session 列表、Agent 主体、Studio 文件树和 Studio 编辑区同时可见且不产生横向页面溢出。
- 2026-06-01：根据后续 UI 调整，右上角 `Agent` 不再作为 IDE / Agent 模式切换入口，只保留为 IDE 模式右侧 Agent 面板开关；模式切换入口移到 header 左侧，位于 Neuro Book 标识和项目选择之间，用 `IDE` / `Agent` 胶囊表达当前主工作区模式。
- 2026-06-01：根据最新 UI 调整，Agent Mode 继续保留 IDE 窄 sidebar，但窄 sidebar 在 Agent Mode 下只显示 `Sessions` 一个入口；右上角按钮在 Agent Mode 下从 `Agent` 改为 `Studio`，用于收起 / 展开右侧 Studio；Studio 内文件树改为在 Studio 右侧展开。
- 2026-06-01：验收发现加回 IDE 窄 sidebar 后，1120px 宽度下四列最小宽度超过视口，会把最左侧 sidebar 挤到屏幕外；已收紧 Agent Mode 专用列宽，保证 `sidebar + session list + Agent + Studio/file tree` 同屏不溢出。
- 2026-06-01：同步 IDE 模式的侧栏体验：Agent Mode 左侧 session panel 和右侧 Studio 都改为宽度动画收起 / 展开，并接入 `useResizablePanel`；session panel 宽度、Studio 宽度和展开状态写入 `novel-ide` store local persistence。同步优化 session list 卡片层级，加入三行摘要截断，避免长 summary 把列表项拉得过高。
- 2026-06-01：将 header 左侧 `IDE / Agent` 模式入口改为开关式滑块：默认 IDE 模式滑块在右侧，切到 Agent 模式滑到左侧；同步统一 Agent Mode session panel、Agent 主体槽位和 Studio 的 300ms cubic-bezier 过渡曲线，减少模式切换时的硬切感。
- 2026-06-01：微调 header 模式开关：只在当前选中模式显示文字，未选中模式只保留图标，降低开关视觉噪音。
- 2026-06-01：继续优化 IDE / Agent 模式切换动画：保留浏览器 View Transition 支持时的同文档过渡；在当前浏览器不支持 `document.startViewTransition` 时，使用 FLIP fallback 平滑移动 header switch、IDE 工具栏、Agent session panel、Studio 和 Agent 主体槽位；IDE 工具栏也改为宽度 / 透明度动画，不再在切 Agent 时硬切消失。
- 2026-06-01：根据用户希望的“纸张左右平移”手感继续调整：进入 Agent Mode 时强制使用自定义纸面 fallback，先克隆 IDE 工具栏和 Studio 作为纸面快照，让该快照整体向左滑出屏幕；真实 Agent 主体从右侧旧槽位 FLIP 到中间，真实 Agent Mode Studio 延后显露，避免和滑出的旧 Studio 重叠抢视觉。
- 2026-06-01：Agent Mode 的 Studio 内部文件树也接入 `useResizablePanel`，支持从左边缘拖拽调整宽度，并把宽度写入本地偏好。
- 2026-06-01：宽度拖拽性能优化：`useResizablePanel` 改为用 `requestAnimationFrame` 合并 pointermove 更新，并支持 `onResizeEnd`；Agent Mode session panel、Studio 和 Studio 内文件树拖拽中只使用本地预览尺寸，松手后再提交 Pinia / 持久化状态，减少拖拽过程中的响应式和 storage 写入。
- 2026-06-01：继续优化 resize 性能：`useResizablePanel` 默认改为松手提交外部状态，仅对需要父布局同步的面板显式开启 `syncDuringResize`；Agent drawer / SideDetailPanel 改为结束提交；Studio、Agent flow、文件树、session list 和 IDE 工具面板内容层增加 layout/paint containment，并在 resize 中进一步关闭 transition / pointer 交互。

## Decisions

- 使用“IDE 模式”指代现有以中间编辑器为核心的布局。
- 使用“Agent 模式”指代新增以 Agent 对话为核心的布局。
- Agent 模式的主体复用现有 [NovelAgentDrawer.vue](../../../app/components/novel-ide/NovelAgentDrawer.vue) 中的会话、消息、输入和工具入口能力，而不是重新实现一套 Agent chat。
- IDE 模式右侧 Agent 抽屉作为独立产品形态退场；更准确地说，同一个 Agent chat surface 在 IDE 模式位于右侧，在 Agent 模式移动到中间。切换时可以做整体水平滑动动画：进入 Agent 模式时界面向左滚动，回到 IDE 模式时向右回收。
- Agent 模式左侧 session 列表不做项目切换，只服务当前 Project Workspace；但需要支持置顶等 session 管理操作。
- Agent 模式中间区域只承载 Agent 主体，不放编辑器 tab。
- Agent 模式右侧正式命名为 Studio。
- Studio 和文件树直接复用当前 IDE 模式的组件和状态；本任务不新建两套 IDE / Agent 专用组件。
- 参考 Codex Agent 模式时只吸收工作区分工，不默认照搬 Codex 的全局产品导航项。
- `AGENT` 顶部入口应切换当前主界面的 layout mode，而不是进入新的项目路由；刷新页面可以保留上次模式。
- 模式切换必须保护 Agent Chat Surface 的运行状态：正在流式输出时不应因为切换 IDE / Agent 模式而销毁组件、重连 SSE、清空滚动位置或丢失输入草稿。
- IDE 模式仍允许隐藏右侧 Agent 槽位；在 Agent Mode 中关闭 Agent 的语义是回到 IDE Mode。
- session 置顶第一版是本机 UI 偏好，作用域为当前 Project Workspace 的 session list；不要写入 Agent session JSONL。
- Agent Mode 左侧 session 列表默认只展示 leader sessions；linked agents 后续再作为独立能力进入左侧列表。
- 窄屏时优先保护中间 Agent 主体，Studio 可以收起或压缩。
- 进入 / 退出 Agent Mode 的水平滑动动画只作为布局容器表现，不能为了动画牺牲运行状态稳定性。
- 接受把 [NovelAgentDrawer.vue](../../../app/components/novel-ide/NovelAgentDrawer.vue) 改成 IDE 右侧槽位薄壳，并拆出可被 IDE Mode 和 Agent Mode 共同承载的 Agent Chat Surface。
- Agent Mode 左侧常驻 session 列表是主要 session 入口；现有 [AgentSessionDialog.vue](../../../app/components/novel-ide/agent/AgentSessionDialog.vue) 在 Agent Mode 中不再作为主入口，可后续退为筛选 / 高级管理入口。
- Studio 在 Agent Mode 中默认显示当前打开文件；文件树作为 Studio 内的可展开栏。
- 切换进入 Agent Mode 时，即使 IDE Mode 下 Agent 右侧槽位隐藏，也要自动打开 Agent Chat Surface 并恢复最近可用 session。
- Agent Mode 左侧“新对话”沿用当前 workspace 的默认 leader profile 解析逻辑，不新增 profile 选择器。
- 模式切换入口放在 header 左侧，右上角按钮在 IDE Mode 下是 `Agent` 面板开关，在 Agent Mode 下改为 `Studio` 面板开关。
- Agent Mode 仍保留 IDE 窄 sidebar，但窄 sidebar 只显示 `Sessions` 一个入口；真实 session 列表显示在窄 sidebar 右侧。
- Agent Mode 的 Studio 文件树在 Studio 内部右侧展开，不占用 Agent 主体左侧空间。
- Agent Mode 左侧 session panel 和右侧 Studio 与 IDE 模式一样支持宽度拖拽；收起时使用宽度动画，不销毁中间 Agent 主体。
- Agent Mode 的侧栏宽度持久化到本地偏好；Studio 最大宽度根据视口和左侧已占空间动态夹住，优先避免横向溢出。
- Agent Mode Studio 内展开的文件树也支持宽度拖拽；它属于 Studio 内部布局，不新增第二套文件树组件。
- 宽度拖拽优先保持实时 resize 手感；拖拽中由 `useResizablePanel` 管理本地预览尺寸，持久化宽度只在拖拽结束时提交。
- `useResizablePanel` 默认不再拖拽中同步外部状态；只有父容器宽度必须实时跟随的场景使用 `syncDuringResize`。
- Header 左侧模式入口使用 `role="switch"` 表达 Agent Mode 开关；视觉上左侧是 Agent、右侧是 IDE，IDE 默认选中右侧。
- Header 模式开关只展示当前模式文字；另一个模式保留图标提示。
- 模式切换相关面板统一使用 300ms `cubic-bezier(0.4,0,0.2,1)` 过渡，和 header 滑块同步。
- 退出 Agent Mode 可继续使用同文档 View Transition；进入 Agent Mode 固定使用本地纸面 fallback，以保证 IDE 工具栏和 Studio 整体左滑出屏的视觉语义。
- IDE 左侧工具栏在 Agent Mode 下保留外层动画容器，收起为 0 宽并淡出，而不是直接通过 `v-if` 从布局中消失。
- 进入 Agent Mode 的 fallback 动画语义是“旧 IDE 纸面整体左滑出屏幕 + Agent flow 从右侧滑入中间”；旧纸面由快照承担，不让真实 Studio 在动画过程中同时变成右侧窄面板。

## Grill Questions

- 已确认：Agent 模式左侧 session 列表不做项目切换，但仍需要置顶等 session 操作。
- 已确认：IDE 右侧 Agent 抽屉不作为第二套长期 UI 并存；同一个 Agent chat surface 在模式切换时移动槽位。
- 已确认：右侧 Studio 直接复用当前 Studio 和文件树组件，本次不为 IDE / Agent 新建两套不同组件。
- 已确认：Agent 模式中间主体永远只给 Agent。
- 已确认：右侧面板命名为 Studio。
- 已确认：模式状态可以作为当前主界面的 layout mode，而不是新路由。
- 已确认：切换模式时应尽量保持同一个 Agent Chat Surface 实例或同一份 session state，不允许打断流式运行状态。
- 已确认：IDE 模式右侧 Agent 仍可隐藏；Agent Mode 的关闭动作回到 IDE Mode。
- 已确认：session 置顶先做本机 UI 偏好，不写 Agent session JSONL。
- 已确认：左侧 session 列表默认只显示 leader sessions，linked agent 后续再做。
- 已确认：窄屏优先保护 Agent 主体，Studio 可收起。
- 已确认：动画优先级低于状态稳定性。
- 已确认：可以把 `NovelAgentDrawer.vue` 改为薄壳，拆出可复用 `AgentChatSurface`。
- 已确认：Agent Mode 左侧常驻 session 列表是主要入口，现有 session 弹窗不作为 Agent Mode 主入口。
- 已确认：Agent Mode 的 Studio 默认显示当前打开文件，文件树在 Studio 内可展开。
- 已确认：进入 Agent Mode 时自动打开并恢复 Agent session。
- 已确认：Agent Mode 新对话沿用当前 workspace 默认 leader profile。
- 已确认：Agent Mode 保留 IDE 窄 sidebar，且该 sidebar 只显示 `Sessions` 入口。
- 已确认：Agent Mode 下右上角按钮作为 `Studio` 收起 / 展开入口。
- 已确认：Agent Mode Studio 的文件树在右侧展开。
- 已确认：Agent Mode 左侧 session panel 和右侧 Studio 都应与 IDE 模式一样有收起 / 展开动画和可拖拽宽度。
- 已确认：Agent session 列表需要优化密度，避免长摘要把列表项撑得过高。
- 已确认：Header 左侧模式切换入口应改成开关式滑块，IDE 默认在右，点击切到左侧 Agent。

## Files Changed

- [docs/tasks/27-agent-mode-layout/README.md](README.md)
- [../../../PROJECT-STATUS.md](../../../PROJECT-STATUS.md)
- [../../../app/stores/novel-ide.ts](../../../app/stores/novel-ide.ts)
- [../../../app/pages/index.vue](../../../app/pages/index.vue)
- [../../../app/components/novel-ide/NovelIdeHeader.vue](../../../app/components/novel-ide/NovelIdeHeader.vue)
- [../../../app/components/novel-ide/NovelAgentDrawer.vue](../../../app/components/novel-ide/NovelAgentDrawer.vue)
- [../../../app/components/novel-ide/agent/AgentChatSurface.vue](../../../app/components/novel-ide/agent/AgentChatSurface.vue)
- [../../../app/components/novel-ide/agent/AgentModeSessionSidebar.vue](../../../app/components/novel-ide/agent/AgentModeSessionSidebar.vue)
- [../../../app/components/markdown-studio/MarkdownStudioWorkbench.vue](../../../app/components/markdown-studio/MarkdownStudioWorkbench.vue)

## Verification

- 已完成：创建 active task walkthrough。
- 已完成：把任务加入 `PROJECT-STATUS.md` Recent Tasks。
- 已完成：实现 Agent Mode 结构；`AGENT` 顶部入口切换主 layout mode，不新增路由。
- 已完成：结构检查确认首页使用单个 `AgentChatSurface` 实例承载 IDE 右侧槽位和 Agent Mode 中间槽位。
- 已完成：`bunx vue-tsc --noEmit --pretty false 2>&1 | Select-String -Pattern "app/pages/index.vue|NovelAgentDrawer.vue|NovelIdeHeader.vue|AgentChatSurface.vue|AgentModeSessionSidebar.vue|MarkdownStudioWorkbench.vue|app/stores/novel-ide.ts"` 对当前改动文件无输出。
- 已完成：浏览器验收 `http://localhost:3000/?project=workspace/.codex-roleplay-template-smoke.creating-bCqddF`：
  - IDE 模式初始可显示现有左侧文件树、中间 Studio 和隐藏的 Agent surface。
  - 点击顶部 `AGENT` 后进入 Agent Mode，左侧 `Agent Sessions`、中间 Agent 主体、右侧 `Studio` 均可见。
  - 在 Studio 内点击“展开文件树”后，右侧文件树和 Studio 编辑区同时可见，页面没有横向溢出。
  - 在 Agent composer 输入 `agent-mode-draft-check`，切回 IDE 模式再切回 Agent Mode 后草稿仍保留，证明 mode 切换未销毁 chat surface 状态。
- 已完成：浏览器热更新验收确认 header 左侧出现 `IDE` / `Agent` 模式按钮；Agent Mode 下右上角按钮为 `Studio`，title 为“收起 Studio” / “展开 Studio”，不再承担模式切换。
- 已完成：浏览器验收确认 Agent Mode 左侧保留 IDE 窄 sidebar，窄 sidebar 只显示 `Sessions` 入口；右侧相邻区域显示 `Agent Sessions` 列表。
- 已完成：浏览器验收确认 Agent Mode 点击右上角 `Studio` 可收起 / 展开右侧 Studio，收起时左侧窄 sidebar、session 列表和中间 Agent 主体保持可见。
- 已完成：浏览器验收确认 Agent Mode 中点击 Studio 的“展开文件树”后，文件树位于 Studio 内部右侧。
- 已完成：相关文件 `vue-tsc` 过滤检查无输出。
- 已完成：浏览器验收确认 Agent Mode 点击左侧 `Sessions` 图标时，session panel 通过宽度动画收起到 0 / 再展开到持久化宽度，Agent 主体自动接管空间且无横向溢出。
- 已完成：浏览器验收确认 Agent Mode 点击右上角 `Studio` 时，Studio 通过宽度动画收起到 0 / 再展开，按钮 title 在“展开 Studio”和“收起 Studio”之间切换。
- 已完成：浏览器验收确认左侧 session panel 拖拽宽度可从 280px 调整到 352px；右侧 Studio 可在当前视口约束下拖拽缩窄到 320px，且全程无横向溢出。
- 已完成：代码层确认 session list 摘要使用 scoped 三行截断，避免长 summary 挤占过多列表空间。
- 已完成：浏览器验收确认 header 模式开关为单个 `role="switch"`；Agent Mode 下 `aria-checked="true"` 且滑块在左，IDE Mode 下 `aria-checked="false"` 且滑块在右。
- 已完成：浏览器验收确认模式来回切换时 session panel、Agent 主体槽位和 Studio 使用同一 300ms cubic-bezier 过渡曲线，且页面没有横向溢出。
- 已完成：浏览器验收确认当前环境不支持 `document.startViewTransition` 时会走 fallback 动画；切换到 IDE 时，IDE 工具栏从 0 宽渐进到 340px，Agent session panel 从 352px 渐进到 0，Agent 槽位和 Studio 同步移动 / 变宽；全程没有横向溢出。
- 已完成：浏览器验收确认进入 Agent Mode 时会创建 `.mode-transition-paper` 快照，快照承载 IDE 工具栏和 Studio 并向左出屏；真实 Agent Mode Studio 在动画中保持隐藏，最终布局稳定为 `session panel + Agent flow + Studio`，全程没有横向页面溢出。
- 已完成：浏览器验收确认 Agent Mode Studio 内文件树展开后有左边缘拖拽手柄，当前 1120px 视口下可从 200px 拖到 240px，页面横向溢出保持 0。
- 已完成：相关文件 `vue-tsc` 过滤检查无输出；浏览器复验确认 Agent Mode Studio 文件树在优化后仍可从 200px 拖到 240px，横向溢出保持 0。
- 已完成：第二轮 resize 优化后相关文件 `vue-tsc` 过滤检查无输出；浏览器确认 containment 生效为 `layout paint`，Agent Mode Studio 文件树可从 240px 收到约 196px，横向溢出保持 0。
- 已知：全量 `bunx vue-tsc --noEmit --pretty false` 仍失败，错误集中在既有 SillyTavern / RP 测试噪音：`assets/workspace/.nbook/agent/skills/SillyTavern角色卡导入/scripts/silly-tavern-card.ts`、`server/agent/profiles/rp-profiles.test.ts`、`server/agent/skills/silly-tavern-card-cli.test.ts`。

## TODO / Follow-ups

- 后续可继续优化 Agent Mode 水平切换动画；第一版优先保证状态稳定。
- 后续可把 Agent Mode 左侧 session 列表的筛选能力扩展到现有 session 弹窗同等完整度；第一版只做 leader active sessions 常驻入口。
