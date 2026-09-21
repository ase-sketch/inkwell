# Inkwell — 架构设计（architecture）

> 这份文档解决什么问题：Inkwell 在 neuro-book 基座上的模块边界、依赖方向与数据流。
> 当前状态：**已确认**（2026-09-20 门禁通过）。基座 = neuro-book 4590627（0.10.3-canary）。

## 总原则：基座不动，改造集中

Inkwell = neuro-book 基座 + 一层尽量薄的「改造层」。凡是能靠改 prompt/配置达成的，绝不改 harness 机制；凡是基座已有的能力，绝不重写。~~这样跟进上游 canary 时冲突最小~~（2026-09-21 拍板：fork 为一次性取材、不跟进上游——边界约束的目的从「给跟进留路」变为控制改动风险与认知成本；基座层可按路线需要改动，非平凡改动必须走决策笔记。）

## 分层与模块边界

```
┌─ Inkwell 改造层（我们写的）──────────────────────────┐
│  I1 访谈 profile 层   assets/workspace/.nbook/agent/  │
│     profiles/builtin/*.profile.tsx（改 prompt，放开   │
│     并引导苏格拉底式追问；新增访谈模式 profile）        │
│  I2 会话闸门          server/agent/session/ +         │
│     harness/prepare-next-turn.ts（追问=阻塞轮次）      │
│  I3 作者界面层        app/components/novel-ide/        │
│     （2026-09-21 起从聊天面板扩为整壳）{agent,shell}/  │
│     + app/utils/{ide-shell-layout,writing-assets}.ts   │
│     布局骨架借 Codex 桌面版；视觉=暖色编辑风；         │
│     资产投影：正文/大纲/细纲/设定                      │
│  I4 阅读模块（新增）  复用 web_search/fetch 工具，      │
│     消化结果沉淀为 workspace 笔记 Markdown             │
├─ neuro-book 基座（尽量不改，一次性取材不跟进）─────────┤
│  agent 运行时  neuro-agent-harness + nb-workflow      │
│  写作工程化    world-engine / plot(promise 账本) /    │
│               llmlint                                 │
│  模型接入      server/models/ + pi-ai（BYOK 多渠道）   │
│  存储         Prisma + SQLite（App/Project 双 schema）│
│  记忆/历史     nb-memory / nb-history                 │
└──────────────────────────────────────────────────────┘
```

依赖方向：contracts ← 各自治包 ← neuro-book 主应用（上游既定，见基座 docs/upstream/modules/monorepo-boundaries.md）；改造层只往下依赖基座，基座不得依赖改造层。

## 关键数据流

**开新书访谈（M1 核心闭环）**：
作者在聊天面板发起开新书 → leader profile（I1 改造后）主导苏格拉底追问 → request_user_input 阻塞轮次（I2 闸门）→ 作者逐条回答 → 访谈结论由 agent 调 write/edit 工具沉淀为 workspace 设定文档（Markdown）→ 设定文档进而被 world-engine / promise 账本消费（基座既有能力）。

**阅读（M4）**：作者给资料主题 → agent 调 web_search/fetch（基座既有工具）→ 消化为笔记 Markdown 落 workspace → 访谈/写作时可被引用。

## 数据目录

State Root 默认目录改名为 inkwell 专属（M0 完成），App SQLite 与 Project SQLite（.nbook/）均落在其下，与上游已装版本隔离。

## 公开接口草案（改造层）

- I1：访谈模式 profile —— `interview.new-book` / `interview.stuck` / `review.chapter` 三个 profile（或一个 profile 三模式，实现时定）
- I2：会话闸门对外不新增接口，只改追问轮次的阻塞行为
- I4：阅读笔记落盘约定 `workspace/references/` 目录 + frontmatter（来源 URL、抓取日期）

## I3 蓝本：用户给定参考（2026-09-20，ChatGPT 桌面版截图）

用户反馈：上游原样 UI「不够开箱即用」，I3 要做到足够人性化。参考图布局要点：
- 左侧栏：新聊天入口置顶，下面是功能导航（图像/定时任务/插件类），再下面是「项目」分组与「最近」会话列表；底栏是用户头像区
- 顶部中央：**聊天 / 工作** 双模式切换（对照 Inkwell：访谈模式 ↔ 写作/审稿模式的入口可以借鉴这个形态）
- 空态首页：居中大标题问句 + 居中大输入框，零配置直接开始对话——「开箱即用」的核心是这个空态，不要一进来先面对工程结构
- 输入框：附件 + 主输入 + 语音/模式切换集中在一行，右侧主按钮突出
- 整体：留白充足、无拥挤的工具栏，高级能力（工程/伏笔/世界状态）收进侧栏与二级页，不抢主路径

I3 验收直觉（用户原话）：上游界面「打开看了意义不明不知道干什么用」——Inkwell 首次打开必须让用户一眼知道「这里是聊出你小说设定的地方」，空态文案与引导按此设计。

## 明确不改的

- harness 会话协议与 profile 编译链（耦合最重区，踩坑点 1）
- 模型接入层 pi-ai（钉死 0.80.6，跟随上游）
- Windows portable 打包链门禁