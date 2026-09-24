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

依赖方向：contracts ← 各自治包 ← neuro-book 主应用；改造层只往下依赖基座，基座不得依赖改造层。

## 关键数据流

**开新书访谈（M1 核心闭环）**：
作者在聊天面板发起开新书 → leader profile（I1 改造后）主导苏格拉底追问 → request_user_input 阻塞轮次（I2 闸门）→ 作者逐条回答 → 访谈结论由 agent 调 write/edit 工具沉淀为 workspace 设定文档（Markdown）→ 设定文档进而被 world-engine / promise 账本消费（基座既有能力）。

**长篇上下文与卡文追问（M2 核心数据流）**：
作者输入或划词触发 → harness 组装 turnContext（未决伏笔恒定注入 + 实体按需匹配注入 + $key 显式唤起技能注入）→ `interview.stuck` / `leader.default` 执行追问 → 仅返回追问/分析（物理白名单隔离 manuscript 直写）。

**内联编辑提案卡（M2.5b 数据流）**：
作者在编辑器划选或调用内联编辑 → profile 调用 propose_edit 工具提出修改建议（零写盘）→ 前端渲染就地提案卡（Diff 审阅）→ 作者确认采纳后经本地作者通道落盘（USER_LOCAL_ACTOR）。

**阅读（M4）**：作者给资料主题 → agent 调 web_search/fetch（基座既有工具）→ 消化为笔记 Markdown 落 workspace → 访谈/写作时可被引用。

## 数据目录

State Root 默认目录改名为 inkwell 专属（M0 完成），App SQLite 与 Project SQLite（.nbook/）均落在其下，与上游已装版本隔离。

## 公开接口与契约（改造层）

- I1：访谈模式 profile —— `interview.new-book` / `interview.stuck` / `review.chapter`；技能包约定 `.nbook/skills/{name}/SKILL.md`
- I2：会话闸门对外不新增接口，控制追问轮次的阻塞行为与 turnContext 注入
- I3：内联提案契约 `shared/inline-proposal.ts`；界面布局状态推导 `app/utils/ide-shell-layout.ts` 与资产投影 `app/utils/writing-assets.ts`
- I4：阅读笔记落盘约定 `workspace/references/` 目录 + frontmatter（来源 URL、抓取日期）

## 界面与交互约定

界面与交互参考详见 `docs/spec.md` 及 `docs/research/` 调研档案，行为与功能定义不在本架构文档中重复记录（一事一处原则）。I3 代码结构详见 `app/components/novel-ide/` 与 `app/utils/`。

## 明确不改的

- harness 会话协议与 profile 编译链（耦合最重区，踩坑点 1）
- 模型接入层 pi-ai（钉死 0.80.6，跟随上游）
- Windows portable 打包链门禁