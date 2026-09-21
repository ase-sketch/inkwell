# TSX Profile Template Editor

## 背景

用户希望把 TSX profile 的模板和 profile 代码拆开，让 profile 后续可以切换多种 TSX 预设，并为低代码可视化编辑器提供独立模板真值源。

第一版范围收敛为：模板真值源使用 TSX 文件，入口使用独立 preview 页面，保存模板后只用于预览和验证，不接入真实 Agent 运行。

## 当前定位更新

后续用户 assets 工作区的 profile 方向已经调整：不再把“profile 模板与 profile 代码拆分”作为长期主线。完整 `.profile.tsx` 单文件是 profile 真相源，用户或 Agent 直接编辑 TSX；旧 `profile-templates` / `user-profile-templates` 写入 API 已从 active surface 移除。新的 TSX Profile Workbench 计划以 `docs/tasks/04-tsx-profile-workbench/README.md` 为准；本文只作为旧 AST/受限 TSX 编辑实验的历史背景。本文中的旧 API、Zod Schema Builder 和 `leader/subagent` 新建语义不再代表当前计划；已调好的可视化编辑器 UI 可作为 `ProfilePrompt` 可视化辅助编辑基底继续微调。

本任务产出的 AST 解析、受限 TSX 节点树、画布拖拽、源码编辑和静态 preview 能力会被用户 assets Profile 工作台复用，但 runtime 语义由 [用户 Assets 工作区](../user-assets-workspace/README.md) 继续推进：

- Inspector / schema / catalog / load issue 归用户 assets Profile 工作台。
- `/api/agent/profile-templates/preview` 继续作为 AST 静态结构预览。
- 真实 Message[] 预览以后走 agent profile 语义 API，例如 `/api/agent/profiles/preview-prepare`，并以真实 `profile.prepare()` 结果为准。
- “模板选择接入真实 profile runtime”不再是推荐方向；后续应以动态 `.profile.tsx` catalog、scope 默认 profile 配置和用户 assets 覆盖为主。

## 目标

- 在 `server/agent/profiles/templates/` 下维护可编辑 TSX 模板。
- 支持解析受限 TSX ProfilePrompt DSL 为结构化节点树。
- 支持从节点树生成规范化 TSX。
- 提供模板列表、读取、保存、验证和预览 API。
- 提供独立页面 `/tsx-profile-editor.preview`，用于低代码编辑模板树、属性和消息内容。
- Preview 页面升级为对齐主 Novel IDE 的主题化三栏工作台：组件库、模板画布、TSX 预览和属性/变量面板。
- Preview 页面进一步升级为低代码拖拽工作台：左侧组件库可直接拖入画布，画布节点支持跨父级 before / after / inside / root 明确落点移动，并在拖拽过程中实时预览插入后的位置。
- `leader-runtime` 模板从演示文案升级为接近真实 leader prompt 的模板副本；编辑器仍读写 `server/agent/profiles/templates/leader-runtime.tsx`，不直接修改生产 `server/agent/profiles/builtin/leader-default.profile.tsx`。
- 右侧源码预览展示纯 `<ProfilePrompt>...</ProfilePrompt>` TSX 片段，不展示 import、函数包装或 `return (...)`。
- 预览 Prompt 采用消息列表形式，展示解析后可能进入 prompt 的 role/text/source，而不是模拟聊天气泡。
- 预览调试弹窗接入真实 leader 线程 scope：左侧可选择线程、查看变量当前值，并允许第一版编辑 `input.prompt`；右侧消息列表默认 Markdown 渲染，可切换源码视图。
- 编辑器真相源切换为完整 `leader-runtime.tsx` 文本：右侧源码区可直接编辑 TSX，画布和属性面板从源码解析出的最近可用 `ProfilePrompt` 派生。

## 关键决策

- 低代码编辑器只支持受限 TSX DSL，不支持任意 TypeScript 逻辑的可视化往返编辑。
- 第一版支持组件：`ProfilePrompt`、`HistorySet`、`DynamicSet`、`AppendingSet`、`Message`、`Reminder`、`Watch`、`If`、`SkillCatalog`、`ActivatedSkills`。
- `Watch` 组件扩展为可选 `children`：保留原 `render(change)` 形式，同时允许模板里写 `<Watch path="..."><Message ... /></Watch>`，便于可视化编辑。
- TypeScript compiler API 通过 `createRequire()` 加载，避免 Nitro dev bundle 直接内联 TypeScript 后触发 ESM `__filename` 问题。
- 第一版不修改 `AgentProfileRegistry`、`config.yaml` 或 thread metadata，不提供真实运行时模板切换。
- UI 主题复用 Novel IDE 的 `themeTokens` 与 store 中的当前主题，不维护第二套视觉变量。
- Preview 工具页复用 Novel IDE 当前主题系统，并提供浅色、暖色、暗色切换；页面颜色优先消费主题变量，不维护独立硬编码主题。
- 节点排序和组件投放使用项目已有 `@dnd-kit/vue`。左侧组件库使用 `useDraggable`，画布节点使用 `useSortable`，节点边缘和内部区域使用 `useDroppable` 表达明确落点。
- 画布拖拽不做“悬停即嵌套”，只接受 `before`、`after`、`inside`、`root` 四类显式落点；拖拽中渲染 `dragVisualRoot`，真实 `root` 只在松手成功后更新，避免不同高度节点因为自动排序和 transition 抖动。
- 拖拽源子树和组件库临时预览节点的 drop zone 会在拖拽过程中禁用，避免拖到自身、后代或临时节点内部造成循环和跳动。
- Preview 页面维护本地撤销/重做快照栈，只影响当前前端编辑会话，不进入 DTO、API 或 runtime。
- History 快照记录完整 `sourceText`，支持 `Ctrl+Z` 撤销和 `Ctrl+Shift+Z` 重做；源码编辑器、表单输入和富文本正文聚焦时优先使用局部编辑器自己的撤销。
- 自动保存以 `sourceText` dirty 状态为准，源码解析中或存在 error 级 issue 时暂停写入，解析恢复后继续通过现有保存 API 写回模板文件。
- 右侧变量面板仍可做模板文本插入；预览 DTO 额外返回变量 `path/currentValue/editable`，仅用于调试界面展示和本地 input 覆盖，不改变真实 profile runtime 运行语义。
- `leader-runtime.tsx` 保持合法 TSX 模块包装，便于 typecheck、保存和后续接入 runtime；纯 `<ProfilePrompt>...</ProfilePrompt>` 只作为编辑器展示视图。
- DTO 支持表达式属性 `{kind: "expression", code}` 和 `Message.textKind = "source"`，用于保留 `watchValue={...}`、`when={...}`、`render={...}` 和正文中的 `{...}` TSX 片段，避免保存时把真实模板逻辑拍平成普通字符串。
- 节点与组件库共用同一套语义配色，使用纯色主题混合背景，不使用半透明渐变效果。
- 节点 children 规则记录在 [`CHILDREN-RULES.md`](CHILDREN-RULES.md)。`Message` 的正文仍是字符串字段，但允许 `SkillCatalog`、`ActivatedSkills` 这类返回 string 的内联节点作为 children；不允许嵌套 `Message` 或其他消息/容器节点。

## 变更文件

- `shared/dto/profile-template.dto.ts`
- `server/agent/profile-templates/profile-template-service.ts`
- `server/api/agent/profile-templates*.ts`
- `server/api/agent/threads/[threadId].get.ts`
- `server/agent/profiles/templates/leader-runtime.tsx`
- `server/agent/profiles/context-prompt.tsx`
- `app/pages/tsx-profile-editor.preview.vue`
- `app/components/profile-template-editor/ProfileTemplateNodeView.vue`
- `app/components/profile-template-editor/ProfileTemplateLibraryItem.vue`
- `app/components/profile-template-editor/ProfileTemplateDropZone.vue`

## 验证

- `bun run typecheck`
- `bun run test server/agent/profile-templates/profile-template-service.test.ts server/agent/profiles/simple-profile.test.ts`
- `profile-template-service.test.ts` 覆盖表达式属性往返、Message TSX 表达式片段保真，以及 `leader-runtime.tsx` 可解析为无错误 `ProfilePrompt`。
- `profile-template-service.test.ts` 额外覆盖预览变量当前值、`input.prompt` 覆盖和变量 token 替换。
- Dev server smoke:
  - `GET /api/agent/profile-templates` 返回 `leader-runtime`
  - `GET /api/agent/profile-templates/leader-runtime` 返回结构化 AST 且无 issues
  - `POST /api/agent/profile-templates/preview` 返回预览消息
  - `GET /tsx-profile-editor.preview` 返回页面 HTML
- 浏览器检查：
  - 页面复用主 IDE 主题变量，不再使用独立硬编码主题。
  - 左侧组件库按集合、消息、流程控制、特权节点分组。
  - 左侧组件库可拖拽新增节点，点击组件仍可快速追加到当前选中容器。
  - 中间模板画布支持节点选择、复制、删除、折叠、跨父级拖拽、before / after / inside / root 落点、拖拽中实时位置预览，以及子节点在父节点卡片内嵌展示。
  - 折叠容器仍保留内部落点，拖拽时可把节点或组件投放进折叠节点。
  - 撤销和重做对新增、删除、复制、拖拽、属性编辑和变量插入生效。
  - 右侧源码区直接编辑 TSX 后，解析成功会同步画布；解析失败时画布保留上一份可用结构并显示错误。
  - 自动保存会在源码稳定且无错误后写回模板；`Ctrl+Z` / `Ctrl+Shift+Z` 在非文本编辑区回退完整源码快照。
  - 右侧属性面板、变量面板、运行时变量和 Prompt 消息预览可切换；源码预览为暗色只读代码区。
  - Prompt 预览调试弹窗为左右布局：左侧线程和变量，右侧消息卡片；消息卡片默认 Markdown 渲染，可切换源码。

## 后续 TODO

- 将模板选择接入真实 profile runtime。
- 决定模板选择落点：全局 `config.yaml`、profile 默认配置，还是 thread metadata。
- 支持更多表达式和更精确的变量插入位置。
- 增加更完整的 Monaco/属性面板交互，以及面向大模板的批量折叠、节点搜索和结构导航。
