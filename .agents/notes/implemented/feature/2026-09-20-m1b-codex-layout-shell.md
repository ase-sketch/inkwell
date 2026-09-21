# Agent Note: M1b Codex 式布局壳（B1 + B3）

Status: implemented

## Problem

基座 neuro-book 的 IDE 壳面向程序员：左侧常驻工具面板、中间编辑画布、右侧 Agent 抽屉，横向空间被三条栏位切碎。Inkwell 的定位是「码字工具 + 苏格拉底式访谈」，M1a 用户验收已经实测出「UI 太难受」。上一轮决策笔记（[M1b Codex 式布局重排 + 首次使用引导](../../proposed/feature/2026-09-20-m1b-codex-layout-plan.md)）敲定了四路调研的共识骨架，但骨架落成代码时有两个问题必须先回答：主区情境（访谈态 / 码字态）由什么事实决定、旧 IDE 壳怎么藏。

## Decision

**码字态编辑器顶部是轻量文件名标签条。** 基座 `MarkdownStudioToolbar` 是一条 IDE 控件带（多行标签、固定页签、富文本/源码视图切换、评论、更多菜单），与 Codex 式壳的克制气质冲突。`MarkdownStudioWorkbench` 新增 `simpleTabs` 开关与 `tab-bar` 插槽：开关打开时隐藏基座工具条，由宿主注入 `IdeDocumentTabs`（只有文件名、未保存圆点、关闭；横向可滚，多开章节时自然成为一排标签）。基座工具条组件本身不删——旧 IDE / Agent 壳不传 `simpleTabs`，行为完全不变。

**码字态只对作者裸露正文，基座内部文件一律不进界面。** workspace 是一棵混合树：`manuscript/` 与 `agents/`、`world-engine/schema`、`project.yaml`、`manual/rules-guide.md`、`reference/` 并排。作者视角只该看到正文，因此新增 `app/utils/writing-assets.ts` 做投影：`projectWritingTree` 只保留 `manuscript/` 下的节点，并从扁平列表里补齐祖先目录保证树连通（祖先只从真实输入取，不凭空造节点）。内部文件「藏而不删」——agent 仍然照常读写，只是 UI 不展示。旧的文件浏览器（`WorkspaceFilePanel`）已从新壳完全移除；旧 Agent 壳里那棵 Studio 文件树连同它的开关、拖拽尺寸状态一起删掉（旧壳本身不可达）。

**码字态是「正文清单常驻 + 右侧空态/编辑器二选一」。** 首版把清单和编辑器做成了互斥分支，结果打开一章后清单消失、换不了章——本次已改为同一 flex 行内并存：左 248px 是 `IdeManuscriptPanel`（正文树 + 新建章节），右侧按状态显示空作品引导、选章提示或 `MarkdownStudioWorkbench`（可直接编辑）。没有文稿时显示 `IdeWritingEmptyState`：一句话说明 + 「新建第一章」+「先去访谈」，新建走 `nextChapterPath` 顺延序号，不覆盖已有章节。

**设定抽屉按作者类目分组，9 个类目全部露面。** 基座 lorebook 9 个类目一个不动，只在呈现层映射成作者语言（character→人物档案、system→力量体系、instruction→写作规范……），每组带一句话定义。空类目以弱化样式列出并标注「暂无条目」——首版决策是「空类目不出现」，2026-09-21 用户新书试用时反馈「设定区是不是漏了」，证明隐藏空类目会让作者以为分类体系不存在，遂推翻；搜索态仍只列有命中的类目，避免空组干扰结果。原先抽屉平铺出「角色档案 / 事件 / 势力 …」加英文摘要，根因是**把类目说明页当成了条目**：`lorebook/<类目>/index.md` 是基座生成的 `subtype: directory-index` 占位页，摘要写着 "Character lorebook category."。现在判定要求路径深度 ≥ 2 且排除 directory-index，条目摘要只取作者自己填的 `summary`（没有就不显示），状态标签只对草稿显示「草稿」，`已生效/已归档` 不再打扰作者。

**左栏是 240-260px 带文字标签的侧栏，不是图标窄轨。** 首版按「极窄图标栏」实现后被用户以 ChatGPT/Codex 桌面版截图否决返工：一级导航必须带文字标签，且左栏要同时承载品牌位、项目列表与最近会话，纯图标轨装不下这些。最终左栏自上而下是：品牌/当前作品名 → 「聊天 / 码字 / 设定 / 新访谈」（图标 + 文字）→「项目」分组（作品列表）→「最近」分组（搜索 + 会话列表 + 新建对话）→ 底部用户名 + 设置齿轮。会话列表 2026-09-21 起按「今天 / 昨天 / 近 7 天 / 更早」时间分组（groupSessionsByRecency，按本地日历日切边界，空组不出现；搜索态保持扁平结果）——会话本就已按书隔离（AgentChatSurface 的 sessionScope 带 projectRoot），要解的只是单本书内会话变多后的层次问题。同日补会话行悬停操作：重命名与归档（复用旧侧栏 AgentModeSessionSidebar 的规则与 index.vue 既有 renameAgentModeSession/archiveAgentModeSession 处理器；运行中/等待输入不可归档）。首版新壳只迁了选中/新建，归档缺失是用户试用发现的迁移遗漏；行结构为此从单 button 改为 div+主按钮+操作钮，避免 button 嵌套。`IdeIconRail.vue` 已删除，不留死代码；图标栏语义的 `IdeRailEntryId` 与 `data-rail-entry` 命名保留，避免为改名再动一遍测试。

**主区互换入口是顶部居中胶囊，不是把手。** `IdeShellModePill.vue` 固定在主区顶部居中，两态「聊天 / 工作」直接对应主区中央给谁。有文稿时它在两态间自由切换；没有任何文稿且没进过码字态时，「工作」不可达（对话是唯一去处）。

**布局模式三值化，默认新壳。** `NovelIdeLayoutMode` 从 `"ide" | "agent"` 扩为 `"ide" | "agent" | "codex"`，store 默认值改为 `"codex"`。旧 IDE 壳与旧 Agent 壳代码一行未删，只是不再是默认入口；新壳需要临时回退时把默认值改回 `"ide"` 即可。

**主区情境由一份纯函数事实表推导，不维护 UI 开关。** `app/utils/ide-shell-layout.ts` 的 `resolveIdeShellView(context)` 接收三个事实：

- `documentOpen`：已打开可编辑文稿（等价于 `workspaceReady`）；
- `writingRequested`：没有文稿时用户点了图标栏「码字」，写作面显示文件浏览而不是把用户困在纯对话里；
- `lorebookDrawerOpen`：右侧设定抽屉是否展开。

推导结果只有两态：`{surface: "chat", agentChatCentered: true, editorVisible: false}`（访谈态）与 `{surface: "editor", agentChatCentered: false, editorVisible: true}`（码字态）。设定抽屉**不改变主区情境**，只决定图标栏高亮，因此抽屉展开时右栏是「伴随对话 + 设定抽屉」两栏共存。

**主区靠 CSS order 互换，不靠 v-if 换组件。** 新壳主区是一个 flex 行，对话面的 DOM 位置固定，只切换 class：`agentChatCentered` 为真时走 `order-2` 居中，否则走 `order-4` 收进右侧伴随栏（320-380px，`useResizablePanel` + store `agentCompanionWidth`）。这条约束是为了让 `AgentChatSurface` 不随情境切换重挂载——重挂载会丢会话流、重连 SSE。

**互换是「瞬态偏好」，不进 store 持久化。** 互换偏好 `swapPreference` 与 `writingRequested` 放在页面 `ref` 而不是 pinia store：store 走 localStorage 持久化，把「本次会话切到对话」写进去会让下次启动莫名停在对话态。文稿关闭或换 Project 时偏好被重置回「编辑器居中」。

**工作态下 AI 不消失：伴随栏可见性与顶部胶囊解耦。** 胶囊只管「主区中央给谁」；对话即使在码字态也默认留在右侧 320-380px 伴随栏，由写作面工具条右侧的独立开关收起/展开。两者不是互斥关系——用户可以在码字态下把对话收起来专注写，也可以让它一直挂着当顾问（easy-writing「妙笔对话」形态）。开合状态是页面级 `companionVisible` 瞬态 ref，切 Project 时重置为「展开」。

**空态向 Codex 观感靠拢，B2 引导卡原样保留。** 空态主区是「居中大标题问候语 + 居中访谈卡 + 居中药丸输入框」：问候语取当前用户名（`{name}，随时可以开始。`）。输入框用 `AgentComposer` 新增的 `variant="pill"` 形态表达——整块圆角药丸、左侧「+」、右侧模型选择与圆形发送钮，走既有输入组件而不是新写一个。B2 的模型引导卡与访谈卡从 `AgentChatFlow.vue` 抽到 `AgentChatFlowEmptyState.vue`，DOM 与判定逻辑逐字保留，B2 的契约测试改为断言「AgentChatFlow 保留挂载点 + 子组件含原逻辑」。

**旧把手实现说明。** 编辑器居中时**不**额外叠浮层按钮：编辑器自己已有标签栏与工具栏，右上角浮层会与之重叠，而伴随栏里的对话随时可用，同一屏内不需要第二个出口。反过来，当用户把中央让给对话、而文稿仍然开着时，对话区右缘出现一枚圆形小把手（`data-role="ide-shell-swap-companion"`）把码字态换回来——这是回到编辑器的唯一出口，所以必须存在。没有文稿而用户主动进码字态时把手不出现（`swapHandleVisible` 只跟 `documentOpen` 走），此时对话就在右手边。

**抽屉排在伴随栏右侧。** 设定抽屉用 `order-5` 排在对话伴随栏之后，展开抽屉不会把对话挤掉，右栏变成「设定抽屉 + 伴随对话」两栏。

**设定入右抽屉，只读浏览。** `IdeLorebookDrawer.vue` 复用 `projectLorebookNodes()` 投影 lorebook 内容节点，走新增的 store 只读 API `readWorkspaceFileContent()`（`/api/workspace-files/read`，不激活编辑器、不写标签与缓冲区），正文用 `AgentMarkdownContent` 渲染。编辑能力不在本里程碑。

**SSR 水合锚点。** `shellHasOpenDocument` 依赖 `workspaceReady`，而它来自客户端 socket。新壳分支上图标栏等结构性节点的 `v-if` 只看 `isCodexMode`（store 默认值，SSR 与客户端一致），只有主区内部「编辑器 or 对话」这一个二选一依赖运行时事实：SSR 首帧固定渲染对话居中，客户端水合后才切到码字态。

**旧入口收口：藏而不删。** 旧图标栏 `NovelIdeActivityBar` 与工具面板 `NovelIdeToolPanel` 只在新壳分支之外渲染；旧布局的离开出口（world-engine 弹窗、trace viewer、history inbox、Plot 工作台、文档引用跳转）全部改成回到 `"codex"` 而不是 `"ide"`。新增契约测试 `ide-shell-legacy-entry.contract.test.ts` 把这条规则钉住：新壳分支里不允许出现旧组件，两个图标栏必须互斥渲染。

**主题纪律。** 新组件只消费 `app/utils/theme/README.md` 登记的主题变量，没有新增 Tailwind 调色板、`dark:` 变体或固定 hex。对话居中的阅读宽度靠 `IdeChatHost` 的 scoped `max-width: 720px` 表达，不为它新增组件层变量。

## Alternatives considered

- **用 v-if 在主区中心和右侧栏之间切换对话组件**：会重挂载 `AgentChatSurface`，丢会话流并重连 SSE；改为同一实例切 CSS order。
- **把「切到对话」偏好写进 store 持久化**：用户下次启动会莫名停在对话态，且与「有文稿就该看到编辑器」的默认预期冲突；改为页面级瞬态 ref。
- **没有文稿时点「码字」直接空转**：图标栏会出现「点了没反应」的死角；改为该态下写作面渲染 `WorkspaceFilePanel`，让用户先挑文件。
- **设定抽屉复用 `selectWorkspacePath` 打开条目**：会占用主编辑器、产生未保存状态、与「抽屉是浏览」的定位冲突；改为新增只读读取 API。
- **删除旧 IDE 壳代码**：回滚成本高，且 lorebook 编辑、world-engine 等功能模块还没迁进新壳；按决策笔记第 7 条藏而不删。
- **把新文案 key 内联中文**：违背「用户可见文案走 i18n」的既有约定；改为扩展现有 `ide.rail` / `ide.shell` 命名空间。

## Consequences

- 新壳成为唯一可达布局；旧 IDE 壳保留渲染能力与全部代码，上游 UI 跟进基本终止（这是决策笔记第 1 条的有意代价）。
- `AgentModeSessionSidebar` 在新壳里是只做会话导航的独立实例，对话流仍在主区 `AgentChatSurface`，两者各自调用服务端；宽高偏好暂时共用旧的 `agentSessionPanelWidth`。
- 新增 store 只读 API `readWorkspaceFileContent()`，后续任何只读浏览入口都可以复用它。
- 本分支给 i18n 新增了 ide.rail.* 与 ide.shell.* 共 16 个 key（中英各一份，共 32 条文案）；B2（首次引导）收尾时只按需调整位置，不改 key。2026-09-21 会话分组与空类目占位再增 5 个 key（ide.rail.sessionGroup_* × 4 + ide.shell.lorebookCategoryEmpty，中英各一份）。
- 「新书看不到完整设定类目」这类发现性（discoverability）问题靠用户试用才能暴露；涉及「隐藏 vs 展示」的呈现决策，默认向「让作者看到结构」倾斜。

## 视觉身份定稿（2026-09-21 用户拍板）

Codex 蓝本只借布局骨架，配色与字体走 Inkwell 自己的**暖色编辑风**：赤陶橙 accent + 米白底 + 全局衬线。落法：

- **配色**：sepia 主题米白化（降黄调，bg-main #f4ecd8→#f7f2e8 等），accent 保持 #d97743（本身就是赤陶橙）；fallback（theme-vars.css）按规范同步，对齐测试钉住。
- **字体**：全局衬线（body 级 font-family），打包 @fontsource-variable/noto-serif-sc（按 unicode-range 分片按需加载，任何 Windows 机器效果一致，不赌系统装了什么字体）；编辑器默认字体栈同步把打包字体放栈首。极小字号（分组小标题 10px、徽章 9px）保留无衬线防糊，走 .font-ui-sans。
- **被否方案**：系统衬线栈（Windows 裸机回退宋体，小字发糊）；新增第 9 套主题（两套近似暖色互相稀释，sepia 本就是暖色底）。
- **Windows 迁移收尾**（同期完成）：清掉 Linux 时代失效软链（根 node_modules、包内 node_modules、.nuxt、.output），bun install 重建；npm 装的 bun 是 .cmd  shim，脚本里 Node spawn bun 会 EINVAL，PATH 前置 npm/node_modules/bun/bin 的 bun.exe 绕过；首次起 dev 前跑 migrate:deploy + migrate:application-state。
- 新壳内暂不可达：World Engine 工作台、请求记录、文件变更收件箱、Plot 工作台、用户资产上传下载——这些入口随旧壳一起收口，回迁排进后续里程碑。
- 水合后首帧是「对话居中 → 编辑器居中」的一次切换，可见但很短；如果后续觉得晃眼，可把 `workspaceReady` 换成服务端可判定的事实。
