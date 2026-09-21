# Markdown Studio Welcome Agent Onboarding

## Relative documents refs

- [MarkdownStudioWelcome.vue](../../../app/components/markdown-studio/MarkdownStudioWelcome.vue)
- [MarkdownStudioWorkbench.vue](../../../app/components/markdown-studio/MarkdownStudioWorkbench.vue)
- [NovelIdeHeader.vue](../../../app/components/novel-ide/NovelIdeHeader.vue)
- [Agent Mode Layout](../27-agent-mode-layout/README.md)
- [User Onboarding Tutorials](../33-user-onboarding-tutorials/README.md)
- [认识你的小说工作台](../../tutorials/01-studio-tour.md)
- [Project Structure](../../../reference/content/project-structure.md)

## User Request / Topic

- 优化 `MarkdownStudioWelcome.vue` 欢迎界面。
- 欢迎界面不应只是“未选择文件”的空状态，而应更像 VS Code Welcome / 浏览器空白页，用来快速引导用户进入工作。
- 最重要的是 Agent 界面的引导：
  - 解释 Agent 模式是什么、什么时候应该切到 Agent。
  - 说明 Agent 模式的基本布局：左侧 session，中间 Agent 对话，右侧 Studio。
  - 引导用户理解当前右上角入口：书架、剧本工作台、RAG、用户资产、Agent / Studio。
- 欢迎页可以预留一个教程对话框入口：
  - 用户能通过这个对话框和一个教程特化的 leader Agent 对话。
  - 该 Agent 能查询文档，帮助用户理解 NeuroBook。
  - 后续可扩展为能帮用户打开界面、切换模式或执行轻量引导动作。

## Goal

重新设计 Markdown Studio 欢迎页的信息架构，让它承担“新标签页”和“产品功能地图”的职责，帮助用户从空白编辑区快速知道下一步该做什么，特别是知道 Agent 模式和顶部导航功能如何使用。

成功标准：

- 未选择文件时，欢迎页能清楚提供正文写作、世界书整理、文件选择、Agent 模式和教程帮助的入口。
- 欢迎页首屏说明 Agent 模式，而不是把 Agent 作为隐藏高级功能。
- 顶部导航入口在欢迎页中有简短说明，用户能理解：
  - `书架`：管理 / 切换 Project。
  - `剧本工作台`：整理 Story / Thread / Scene / Plot。
  - `RAG`：查看与检索项目记忆 / subject memory。
  - `用户资产`：管理用户级 skills、profiles、templates 等资源。
  - `Agent`：打开 IDE 右侧 Agent 面板；进入 Agent Mode 后同一按钮变为 `Studio`，用于收起 / 展开右侧 Studio。
- 预留教程 Agent 对话框的 UI 和合同边界，但不要求第一版完成真实 Agent profile、工具调用或自动打开界面的能力。
- 不引入默认弹窗打扰用户；欢迎页应像浏览器空白页一样安静，用户主动点击后才展开教程对话。

Blocked stop condition：

- 如果欢迎页需要直接调用尚不存在的 Agent profile 或前端动作协议，不用临时 hack；先实现静态/占位入口，并在本文档记录后续需要补齐的 profile 与 UI action contract。
- 如果需要新增大范围 onboarding 系统或全局引导状态，先停止并重新拆 task，避免把欢迎页改造成过重的新手教程框架。

## Current State

- `MarkdownStudioWelcome.vue` 当前是一个居中的状态卡：
  - 无文件时显示“未选择文件”。
  - 不可编辑节点时显示“当前文件不可编辑”。
  - 如果传入 `node`，展示 path、editable 和 type。
- `MarkdownStudioWorkbench.vue` 只在没有 active file / node，或当前 node 不可编辑时显示欢迎页。
- 顶部导航入口位于 `NovelIdeHeader.vue`：
  - 左侧有 IDE / Agent layout mode switch。
  - 右侧有 `书架`、`剧本工作台`、`RAG`、`用户资产`。
  - 最右侧主按钮在 IDE 模式下显示 `Agent`，在 Agent Mode 下显示 `Studio`。
- Agent Mode 已有独立 task，当前产品心智是：
  - IDE 模式：左侧文件树，中间 Markdown Studio，右侧 Agent 面板。
  - Agent 模式：左侧 session 列表，中间 Agent 主体，右侧 Studio。
- 用户教程已有 `docs/tutorials/`，但欢迎页里尚未把教程、Agent 和顶部功能入口串起来。

## Design Direction

### 1. 欢迎页应是 Studio 新标签页

欢迎页不是营销落地页，也不是文档页。它应该像编辑器的新标签页：

- 信息密度适中。
- 优先可点击动作。
- 文案短，避免长段教学。
- 视觉上贴近编辑器画布，不使用大阴影大圆角居中卡片。

建议分区：

| 区域 | 目的 |
| --- | --- |
| 开始 | 新建章节、新建 Lorebook 条目、新建 Markdown、打开文件树 |
| 继续 | 最近打开 / 当前 tabs / 推荐目录入口 |
| Agent 引导 | 说明 Agent 模式、打开 Agent 面板、切换 Agent Mode、预留教程 Agent 对话框 |
| 顶部入口地图 | 用一行或紧凑网格解释书架、剧本工作台、RAG、用户资产、Agent / Studio |

### 2. Agent 引导是主角

欢迎页需要把 Agent 放到用户路径里，而不是当成右上角按钮的附属说明。

建议 Agent 引导块包含：

- 标题：`和 Agent 一起推进项目`
- 三个短说明：
  - `IDE 模式`：边写边问，Agent 在右侧辅助。
  - `Agent 模式`：让 Agent 成为主工作区，适合规划、整理、长任务。
  - `Studio`：Agent 模式右侧仍能查看和编辑当前 Project 文件。
- 可点击动作：
  - `打开 Agent 面板`
  - `切到 Agent 模式`
  - `询问教程 Agent`

### 3. 顶部入口地图

根据当前截图和 `NovelIdeHeader.vue`，欢迎页应解释右上角入口，但不要写成帮助文档。推荐做成小型功能地图：

```text
书架        管理 Project
剧本工作台  整理剧情结构
RAG         查看记忆检索
用户资产    管理 skills / profiles / templates
Agent       在 IDE 中打开 Agent；Agent Mode 中变为 Studio
```

每个入口用 lucide 图标、短标题、单句说明。点击能力可以分两步：

- V1：只显示说明，后续接 emit 事件打开对应界面。
- V2：欢迎页按钮直接复用 header emit，打开书架、剧本工作台、RAG、用户资产或 Agent。

### 4. 教程 Agent 对话框预留

欢迎页可以预留 `TutorialAgentDialog`，但第一版不必完成完整 Agent runtime 接入。

预期产品语义：

- 它是一个“问 NeuroBook 怎么用”的轻量对话框。
- 背后是教程特化 leader，例如暂名 `leader.tutorial` 或 `onboarding.leader`。
- 它默认能查询：
  - `docs/tutorials/**`
  - `reference/**`
  - 当前 Project 基础结构
  - 当前打开文件 / 当前模式
- 后续可以新增 UI action 协议，让它请求前端执行：
  - 打开书架。
  - 切换 Agent Mode。
  - 打开剧本工作台。
  - 打开 RAG Inspector。
  - 展开文件树并定位某个目录。

第一版实现建议：

- 对话框可以先是占位 UI，展示“教程 Agent 准备中”与示例问题。
- 入口和状态先稳定下来，后续再接真实 profile / session。
- 不要把教程 Agent 塞进普通 Agent session 列表，除非后续明确它也应成为持久 session。

## Decisions / Discussion

- 欢迎页优先服务第一次打开 Studio 的用户，也服务中途关闭所有 tab 后的“回到工作台”场景。
- 欢迎页的核心信息不应超过一屏；更多说明交给教程 Agent 或文档。
- Agent 引导优先级高于普通文件入口，因为用户已经明确这是最重要的部分。
- 顶部右侧功能入口需要在欢迎页里解释，避免用户只看到图标和短词却不知道它们和写作流程的关系。
- 不自动弹出教程对话框，避免打断熟练用户。
- 不把“浏览器验证”作为任务默认步骤；如后续实现 UI，可建议用户手动要求浏览器验收。

## Implementation Walkthrough

- 2026-06-13：根据用户对 Markdown Studio 欢迎页、Agent 引导、顶部入口说明和教程 Agent 对话框预留的补充要求，新建本 task。
- 2026-06-13：确认当前 `MarkdownStudioWelcome.vue` 仍是简单空状态卡；`NovelIdeHeader.vue` 已存在书架、剧本工作台、RAG、用户资产、Agent / Studio 等入口；本 task 第一阶段记录产品设计，不直接改 UI。
- 2026-06-13：实现 V1 欢迎页：
  - `MarkdownStudioWelcome.vue` 从居中状态卡改为 Studio 新标签页式布局。
  - 首屏提供新建章节、新建世界书条目、新建 Markdown、打开文件树、切到 Agent 模式和询问教程 Agent。
  - 增加 Agent 引导块，解释 IDE 模式、Agent 模式和 Studio 的关系。
  - 增加顶部入口地图，连接书架、剧本工作台、RAG、用户资产和 Agent / Studio。
  - 保留不可编辑节点状态，但改为更轻量的状态页，并保留文件树和教程 Agent 入口。
- 2026-06-13：新增 `MarkdownStudioTutorialAgentDialog.vue` 作为教程 Agent 占位对话框。第一版只保留入口、示例问题和能力边界说明，不接入真实 Agent profile / session，也不加入普通 session 列表。
- 2026-06-13：扩展 `MarkdownStudioWorkbench.vue` 的 welcome props / emits，把欢迎页动作向页面层转发。
- 2026-06-13：在 `app/pages/index.vue` 接入欢迎页动作：
  - 打开 Project 目录时复用 `selectWorkspacePath()`，并在 IDE / Agent Mode 下打开对应文件树。
  - 新建章节、Markdown、Lorebook 条目时复用 workspace file API 创建 Markdown 文件并打开。
  - Agent 入口复用现有右侧 Agent 面板与 Agent Mode 切换。
  - 顶部入口地图复用已有书架、剧本工作台、RAG、用户资产和 Profile 工作台入口。
- 2026-06-13：修复审查发现的两个问题：
  - 欢迎页新建 Lorebook 条目的类型收敛到当前文件树和详情面板支持的 `location` / `character` / `item` / `rule` / `note`，不再暴露会被现有 UI 当作普通文件处理的 `world` 等类型。
  - 欢迎页新建章节改用章节专用路径归一化：目录输入和无扩展名输入默认生成 `index.md`，避免创建 `.../.md` 这类异常文件。

## Files Changed

- [../../../app/components/markdown-studio/MarkdownStudioWelcome.vue](../../../app/components/markdown-studio/MarkdownStudioWelcome.vue)
- [../../../app/components/markdown-studio/MarkdownStudioTutorialAgentDialog.vue](../../../app/components/markdown-studio/MarkdownStudioTutorialAgentDialog.vue)
- [../../../app/components/markdown-studio/MarkdownStudioWorkbench.vue](../../../app/components/markdown-studio/MarkdownStudioWorkbench.vue)
- [../../../app/pages/index.vue](../../../app/pages/index.vue)
- [../../../PROJECT-STATUS.md](../../../PROJECT-STATUS.md)
- [README.md](README.md)

## Verification / Test

- 已完成：创建 active task walkthrough。
- 已完成：同步 `PROJECT-STATUS.md` Recent Tasks。
- 已完成：`bunx vue-tsc --noEmit --pretty false 2>&1` 输出中过滤 `MarkdownStudioWelcome|MarkdownStudioTutorialAgentDialog|MarkdownStudioWorkbench|app/pages/index.vue`，结果为 `NO_RELEVANT_ERRORS`。
- 已完成：审查修复后再次运行同一相关文件过滤检查，结果为 `NO_RELEVANT_ERRORS`。
- 未执行浏览器验证：遵循项目指令不自动进行浏览器验证；如需视觉和交互验收，可后续手动要求打开本地页面检查。

## TODO / Follow-ups

- 后续定义教程 Agent profile：
  - profile key 命名。
  - 文档检索范围。
  - 是否持久化 session。
  - UI action contract。
- 后续接入真实 `TutorialAgentDialog` 对话：
  - 创建或复用教程特化 leader。
  - 读取 `docs/tutorials/**`、`reference/**` 和当前 Project 上下文。
  - 允许 Agent 请求前端执行打开界面、切换模式、定位文件树等动作。
- 如果欢迎页开始承载“最近打开”能力，补 store 层最近文件来源，避免只从当前 tabs 猜测。
- 后续按用户要求进行浏览器验收，重点看桌面 / Agent Mode 窄 Studio / 不可编辑节点三种状态。
