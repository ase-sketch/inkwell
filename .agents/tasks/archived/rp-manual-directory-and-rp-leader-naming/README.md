# RP Manual Directory And RP Leader Naming

## Relative documents refs

- [Agent RP Mode](../01-agent-roleplay-mode/README.md)
- [Project Structure](../../reference/content/project-structure.md)
- [Simulation Directory](../../reference/content/simulation.md)
- [Project Workspace Guide](../../reference/agent/project-workspace-guide.md)
- [Profile Context Memory](../../reference/agent/profile-context-memory.md)

## User Request / Topic

- 先不改具体 Project Workspace，例如 `workspace/ming-ding-zhi-shi-2`。
- 先改 NeuroBook 的 Project Workspace 目录规范和默认模板，让 RP 项目可以拥有项目级说明书目录。
- 新增 `manual/` 作为 Project Workspace 顶层目录，用来保存玩家手册、快速开始、规则速查、RP 主持说明等可读说明书。
- 统一 RP 主持命名：只使用 `rp.leader` 这个名字，不再使用 `rp.gm`、`leader.rp` 或其他同义名。
- 明确 `simulator.leader` 与 `rp.leader` 分工：
  - `simulator.leader` 负责世界模拟、裁决、subject / entity state 和 simulation runs。
  - `rp.leader` 负责 RP 统筹、用户交流、主持陪伴、开局引导、桌规解释和调用模拟内核。
- 当前先做陪伴模式的 `rp.leader`，允许它有预设性格，能陪用户一起玩和讨论剧情。
- 记录 TODO：以后可能把“性格”和“RP 能力”分离，形成带个性的 leader + RP skill / personalized Agent。
- 记录 TODO：随机表、GM 屏幕、战斗模块等可以考虑由 CLI 脚本管理。

## Goal

把 `manual/` 与 `rp.leader` 命名收敛成 NeuroBook 的稳定目录和 RP 入口规划，后续通过 reference 文档、默认 Project 模板和相关 task walkthrough 验证：

- `manual/` 进入 Project Workspace 顶层目录规范。
- 默认模板包含最小可用的 `manual/` 说明书结构。
- 默认模板包含 `agent-context/rp.leader/`，用于未来 RP 主持的 Project 专用上下文与记忆。
- 文档不再把 `rp.gm`、`leader.rp` 当作新合同名；历史资料可以保留 legacy 说明，但活跃命名只使用 `rp.leader`。
- `simulator.leader` 与 `rp.leader` 的边界清晰，不把世界模拟内核和用户陪伴主持混成一个 profile。

## Current State

- 当前稳定 RP / simulation 合同已经转向 `simulator.leader`、`simulator.actor`、`rp.writer`、`agent-context/` 和 `simulation/`。
- `leader.rp` 在当前文档中被标记为 legacy / removed profile。
- `simulation/` 当前只保存 runtime state：`subjects/`、`entities/`、`runs/`。
- profile guidance 当前位于 `agent-context/{profile}/context.md`、`memory.md`、`generated.md`。
- 默认 Project 模板已包含 `manual/`。
- 默认 Project 模板已包含 `agent-context/rp.leader/`。
- `rp.leader` builtin profile 已实现为可运行的 RP 用户交流与陪伴主持层。
- 默认 Project 模板的 `manual/` 已按 5e 启发重组为人类跑团手册结构：`README.md`、`world-guide.md`、`rules-guide.md`、`gm-guide.md`、`reference.md`、`player-guide/README.md`、`player-guide/character-creation.md`、`player-guide/playable-characters/README.md` 和 `player-guide/playable-characters/player.md`。
- `workspace/ming-ding-zhi-shi-2` 已补齐厚版 `manual/`，并把手册正文从 Agent / NeuroBook 原理说明改为面向玩家和人类 GM 的跑团手册；`agent-context/rp.leader/` 仍保存 profile 专用项目上下文。
- RP 正文归属已收紧：开场白、初始化 prose 和常规 Tick prose 都必须由 `rp.writer` 根据 Writer Brief 写入，初始化固定落点为 `simulation/runs/ticks/000000-initial-state/prose.md`；`rp.leader` 只组装正文链接和元场景引导。

## Decisions / Discussion

- 只使用 `rp.leader` 作为 RP 主持的 canonical 名称。
- `rp.gm` 不作为目录、profile 或合同名；如果旧资料出现，只解释为历史口语别名。
- `leader.rp` 不再作为新合同名；如果需要恢复 RP 主持能力，应恢复为 `rp.leader`。
- `simulator.leader` 继续负责世界模拟，不承担完整的用户陪伴主持身份。
- `rp.leader` 是用户面对的 RP 主持层，负责开局引导、桌规解释、玩家可见信息整理、陪伴式互动、剧情讨论和调用 `simulator.leader`。
- 陪伴模式允许 `rp.leader` 有预设性格，但它不能随意破坏 simulation state、泄露隐藏真相或把讨论内容自动写成 canon。
- 玩家和 `rp.leader` 的 meta 讨论不自动成为世界事实；需要由用户确认，或通过 `simulator.leader` / Plot / lorebook / simulation commit 落地。
- “GM 开后门”可以作为桌规的一部分讨论，但要转化成显式难度、叙事宽容度或失败代价策略，而不是无记录地绕过世界因果。
- `manual/` 负责“怎么玩”“如何开局”“如何主持”和“如何速查”，`lorebook/` 负责稳定世界事实，`simulation/` 负责当前运行态，`agent-context/` 负责 profile 专用上下文与记忆。人类手册正文不应暴露 NeuroBook / Agent 运行分工。
- “开场白发生在第一个 Tick 前”只表示它不是用户行动触发的常规 Tick，不表示 `rp.leader` 可以直接写正文。它仍是正文产物，必须走 `rp.writer`。

## Manual Directory Draft

首版默认模板应当完整可用，但仍避免跑团书式无限拆分。`manual/` 可以比普通写作项目更厚一点，因为它承担 RP 项目的开箱说明、玩家入口和主持入口。默认结构建议：

```text
manual/
|-- README.md
|-- world-guide.md
|-- rules-guide.md
|-- gm-guide.md
|-- reference.md
`-- player-guide/
    |-- README.md
    |-- character-creation.md
    `-- playable-characters/
        |-- README.md
        `-- player.md
```

文件含义：

- `manual/README.md`：说明书入口、阅读顺序、快速开始、当前 Project 的 RP 入口。它回答“我现在怎么开一局”。
- `manual/world-guide.md`：玩家和 `rp.leader` 都可读的世界观导览。它提炼世界基调、地图/地域、主要势力、常识和禁忌，并用链接指向 `lorebook/`。它回答“这是一个什么世界”。
- `manual/rules-guide.md`：规则参考手册。它整理行动裁决、判定原则、失败代价、资源、成长、经济、旅行、战斗、生产和可选系统模块。它回答“这局怎么裁决”。
- `manual/gm-guide.md`：面向人类 GM 的主持人手册。它整理第一场准备、场景节奏、NPC 扮演、陪伴式主持、开后门边界、剧透策略和记录边界。它回答“我怎么主持这一局”。
- `manual/reference.md`：主持人速查屏。它汇总开局信息、难度、生命层级、初始角色、失败代价、NPC 反应、战斗流程、旅行、经济和提示边界。它回答“跑的时候要快速查什么”。
- `manual/player-guide/README.md`：玩家手册。它只放玩家可见信息、开局身份、基础行动、角色创建/选择和玩家不该提前知道的边界。它回答“我是谁，我知道什么，我能做什么”。
- `manual/player-guide/character-creation.md`：玩家侧角色创建指南。它说明创建阶段可披露信息、可自定义项目、默认值、不能提前确认的隐藏真相和开局确认模板。
- `manual/player-guide/playable-characters/README.md`：预设角色索引。它列出可直接开局的角色入口，帮助新手快速选择。
- `manual/player-guide/playable-characters/player.md`：默认可玩角色。它让用户不用手动捏角色也能直接开始；具体 Project 可以新增更多可玩角色文件。

暂不进入默认模板的拆分目录：

- `manual/quickstart.md`：先折叠进 `manual/README.md`。
- `manual/table-contract.md`：先折叠进 `manual/gm-guide.md`。
- `manual/adventures/`：首版不建；具体 Project 需要多个模组时再建。
- `manual/random-tables/`、`manual/cheatsheet/`、`manual/combat/`：首版不建；先在 `manual/rules-guide.md` 与 `manual/reference.md` 里设入口，后续优先考虑由 CLI 管理并生成索引或摘要。

文件数控制原则：

- 默认模板要完整可用，但不预设大型跑团书的全部扩展书结构。
- 顶层文件按读者任务分：开局、世界、规则、主持、速查、玩家。
- 只有当同类内容会出现多个独立条目，或需要脚本管理时，才提升为子目录。
- `manual/` 不替代 `lorebook/`。稳定事实仍放在 `lorebook/`，说明书只整理读者路径、裁决入口和少量摘要。
- `manual/` 不替代 `simulation/`。当前局势、Tick 日志、战斗进行中状态仍放在 `simulation/runs/`、`subjects/` 或 `entities/`。

## Tabletop RPG References To Borrow

- 快速开始 / Starter：借鉴进 `manual/README.md` 的 Quickstart 章节。
- 玩家手册 / Player Guide：借鉴为 `manual/player-guide/README.md`。
- 角色创建 / Step-by-Step Characters：借鉴为 `manual/player-guide/character-creation.md`，但只保留 Project 需要的轻量创建清单。
- 预设角色 / Pregenerated Characters：借鉴为 `manual/player-guide/playable-characters/`。
- 主持人手册 / GM Guide：借鉴为 `manual/gm-guide.md`。文件名使用人类跑团语境，runtime profile 仍使用 `rp.leader`。
- 规则参考 / Rules Reference：借鉴为 `manual/rules-guide.md` 与 `manual/reference.md`。
- 系统模块 / System Modules：折叠进 `manual/rules-guide.md` 和 `manual/reference.md`，用于说明经济、声望、战斗、探索、关系、魔法、职业、任务、随机表等是否启用。
- 世界设定集 / Campaign Setting：借鉴为 `manual/world-guide.md`；稳定事实仍放在 `lorebook/`。
- 冒险模组 / Adventure Module：首版不建目录；如果 Project 真有多个可运行模组，再放进 `manual/adventures/` 或项目自定义目录。
- 随机表 / Random Tables：首版只在 `manual/rules-guide.md` 和 `manual/reference.md` 设入口，后续可由 CLI 管理。
- GM 屏幕 / Cheat Sheet：首版并入 `manual/reference.md`，后续可由 CLI 管理。
- 战斗模块 / Combat Module：首版在 `manual/rules-guide.md` 说明抽象裁决，不做复杂规则引擎；后续可由 CLI 管理。
- 战役日志 / Campaign Journal：不放 `manual/`，继续使用 `simulation/runs/`。

## Implementation Walkthrough

- 2026-06-09：创建本 task，记录 `manual/` 目录规划、`rp.leader` 唯一命名、`rp.leader` 与 `simulator.leader` 分工、陪伴模式和 CLI 管理 TODO。
- 2026-06-09：参考跑团说明书结构继续收敛 `manual/` V1，先尝试把默认模板压缩为 4 个文件。
- 2026-06-09：根据“内容可以多一点、主持人手册/规则/系统/世界观需要完整可用、player-guide + 可玩角色文件夹可以加上”的反馈，调整为当前 V1：顶层保留 `README.md`、`world-guide.md`、`rules.md`、`systems.md`、`rp-leader-guide.md`、`reference.md`，并新增 `player-guide/README.md` 与 `player-guide/playable-characters/player.md`。
- 2026-06-09：按实现计划落地 reference 和默认模板：新增 `reference/content/manual.md`，同步 Project 结构、content 入口、directory protocol、Agent Project Workspace guide、simulation profile 分工和 profile context memory；默认 Project 模板新增 `manual/` 说明书骨架与 `agent-context/rp.leader/` context/memory；同步 `docs/tasks/01-agent-roleplay-mode/README.md` 与 `PROJECT-STATUS.md` 当前状态。
- 2026-06-09：实现 `rp.leader` builtin profile：新增 `RpLeaderInputSchema` / `RpLeaderOutputSchema`，新增 `assets/workspace/.nbook/agent/profiles/builtin/rp.leader.profile.tsx`，并更新 `server/agent/profiles/rp-profiles.test.ts` 覆盖 catalog、schema、prompt、manual imports、完整工具集和无 `report_result` 合同。
- 2026-06-09：改造 `workspace/ming-ding-zhi-shi-2`：新增厚版 `manual/`，包含开箱流程、玩家手册、默认可玩角色、世界观、规则、系统、主持手册和速查索引；重写 `agent-context/rp.leader/context.md` / `memory.md`，从“未来 profile 规格”切到当前可运行 `rp.leader` 项目上下文，并移除旧 `events.md` / `knowledge.md` 口径。
- 2026-06-09：根据 5e PHB / DMG / DM Screen 的目录启发，将 `manual/` 从项目/Agent 说明改为面向人类的跑团手册结构：`rules.md` 改为 `rules-guide.md`，`rp-leader-guide.md` 改为 `gm-guide.md`，`systems.md` 折叠进规则与速查；《命定之诗》手册正文移除内部运行分工，默认模板、reference、profile prompt 和测试同步新文件名。
- 2026-06-09：检查并优化默认 Project manual 模板：统一中文标题和人类跑团手册口吻，移除模板中的 `rp.leader`、`simulation/`、`agent-context/`、`subject` 等内部运行说明，让新 Project 生成的 manual 默认面向玩家和主持人。
- 2026-06-09：继续弱化《命定之诗》manual 的跑团桌面感，改为“化身 / 引导者 / 暂停沉浸 / 信息差”口径；删除 `默认桌规`、`GM 屏幕`、`开后门` 等出戏词，并在 `world-guide.md`、`rules-guide.md`、`reference.md` 中加入 Project-relative lorebook 引用。
- 2026-06-09：同步 Markdown 引用规范：正文链接支持绝对路径、Project-relative path 和 Markdown-relative path，其中 Project-relative path 是推荐写法；更新 `reference/content/markdown-dialect.md`、`reference/content/content-references.md`、`reference/agent/project-workspace-guide.md` 与 `reference/content/state.md`。
- 2026-06-09：按用户反馈补强开局引导：新增 `manual/player-guide/character-creation.md`，将自定义化身从默认角色文件中拆出；在《命定之诗》manual 中明确 tick 为“处境 -> 行动 -> 世界回应 -> 新选择点”的最小沉浸节拍，并补充创建阶段披露、跳过创建、开场白和第一个 tick 的信息披露边界；同步默认模板、manual reference、`rp.leader` prompt 和窄测试断言。
- 2026-06-10：继续把《命定之诗》manual 从“可读”推进到“可游玩”：新增 `player-guide/playable-characters/README.md` 与三名预设化身 `observer.md`、`guardian.md`、`spark.md`；扩写 `character-creation.md` 为分步创建与渐进世界观输入；同步 `gm-guide.md` / `reference.md` 的预设化身开场差异和开局速查；默认模板与 `reference/content/manual.md` 也新增预设角色索引。
- 2026-06-09：审查开局引导补丁后继续优化：移除玩家侧 `character-creation.md` 对命定系统具体核心条目的直接链接，避免创建阶段提前暴露隐藏机制；将《命定之诗》manual 中残留的“用户 / NPC”等桌边称谓改为“你 / 对方 / 人物”，保持化身沉浸口径。
- 2026-06-09：再次参考 `.local/5etools-books/books` 中 PHB / DMG / DM Screen：提取 PHB 的“描述环境 -> 说明行动 -> 描述结果”循环、Step-by-Step Characters 的短清单创建法、DMG 的 Know Your Players / Start Small / Resolution and Consequences，以及 DM Screen 的运行速查结构；将这些结构落到 `rp.leader` 与 `RP模式` skill，而不是照搬 D&D 术语。
- 2026-06-09：优化 `rp.leader` prompt：职责口径从“主持/桌规/NPC”收敛为“RP 引导 / 体验边界 / 化身可见信息 / 人物与环境反应”；新增“处境 -> 行动 -> 世界回应 -> 新选择点”Tick 骨架、默认化身/调整默认化身/自定义化身三入口、创建阶段渐进披露、第一个 Tick 前开场白、失败代价和用户偏好观察规则。
- 2026-06-09：重写 `RP模式` skill：普通 RP 入口改为优先创建或切换到 `rp.leader`；只有调试世界模拟或明确 simulation 任务才直接进入 `simulator.leader`；同步当前 subject memory 合同为 `events.jsonl` / `memory.jsonl`，并更新 emulation bootstrap/tick、SillyTavern 导入迁移建议、默认模板和《命定之诗》项目上下文中的旧 `events.md` / `knowledge.md` 提示。
- 2026-06-09：同步上层 prompt reference：`leader.default` 的 RP 协作说明改为普通 RP 先进入 `rp.leader`，再由 `rp.leader` 委托 `simulator.leader` 裁决；`docs/tasks/01-agent-roleplay-mode/README.md` 与 `PROJECT-STATUS.md` 更新为新的 RP 引导层合同。
- 2026-06-14：按用户反馈收紧 `rp.leader` 正文归属提示词：开场白 / 初始化正文必须走 `rp.writer`，固定写入 `simulation/runs/ticks/000000-initial-state/prose.md`；同步 `reference/agent/rp-tick/` 协议、默认 `simulation/runs` 模板、`rp-profiles.test.ts` 断言、`docs/tasks/01-agent-roleplay-mode/README.md` 与 `PROJECT-STATUS.md`。
- 2026-06-14：按用户反馈精简 Writer Brief tag：删除历史格式说明和重复格式模板，将合同收敛为 `<writer_brief>` / `<context>` / `<materials>` / `<beats>` / `<style>` 轻量骨架；`<context>` 内 Markdown 链接成为唯一 read 白名单入口，`<materials>`、`<beats>`、`<style>` 允许自定义语义 tag 但不扩大读取权限；同步 `rp.leader` / `rp.writer` prompt、`rp-writer-interaction.md`、`rp-profiles.test.ts` 和 `PROJECT-STATUS.md`。
- 2026-06-14：审查后修复 `rp.writer` 链接边界：`<context>` 内 Markdown 链接只作为读取元数据，不能原样写进正文；只有 `<materials>`、`<beats>` 或 `<style>` 明确标为用户可见的 Markdown 链接才可保留，并补充 `rp-profiles.test.ts` 断言。

## Implementation Plan

### Phase 1: Stable directory protocol

目标：让 `manual/` 成为 NeuroBook Project Workspace 的稳定顶层目录，而不是某个 Project 的临时习惯。

改动：

- 新增 `reference/content/manual.md`，定义 `manual/` 的职责、默认结构、边界和文件数控制原则。
- 更新 `reference/content/project-structure.md`，把 `manual/` 加入 Project Workspace sketch、Core Split 和 boundary bullets。
- 更新 `reference/content/README.md` 与 `reference/content/directory-protocol.md`，把 `manual.md` 加入内容结构入口。
- 更新 `reference/agent/project-workspace-guide.md`，告诉 Agent 何时读 `manual/`，以及它和 `lorebook/`、`simulation/`、`agent-context/` 的关系。

验收：

- `manual/` 在 reference 中有唯一稳定说明，不只出现在 task 里。
- `manual/` 的边界清楚：说明书 / 玩法入口，不替代 canon、runtime state 或 profile memory。
- 文档中没有把 `manual/` 说成 raw import、content node root 或 simulation state。

### Phase 2: Default Project template

目标：新 Project 创建后自带最小但完整可用的 `manual/` 说明书骨架。

改动：

- 在 `assets/workspace/.nbook/templates/project-directory-templates/manual/` 下新增：
  - `README.md`
  - `world-guide.md`
  - `rules-guide.md`
  - `gm-guide.md`
  - `reference.md`
  - `player-guide/README.md`
  - `player-guide/character-creation.md`
  - `player-guide/playable-characters/README.md`
  - `player-guide/playable-characters/player.md`
- 模板内容只写通用结构和填写提示，不写某个具体作品的设定。
- `manual/` 文件使用普通 Markdown，不走 lorebook content node frontmatter。

验收：

- 默认模板文件数可控，但能覆盖开局、世界观、规则、系统、主持、速查和默认可玩角色。
- 模板中所有路径使用 Project-relative path，例如 `lorebook/...`、`simulation/...`、`agent-context/...`。
- 没有把 `manual/` 模板写成《命定之诗》专属内容。

### Phase 3: RP leader naming and context

目标：收敛 RP 主持命名，只保留 `rp.leader`，并明确它和 `simulator.leader` 的分工。

改动：

- 更新 `reference/content/simulation.md`，说明：
  - `rp.leader` 是用户面对的 RP 统筹和陪伴主持层。
  - `simulator.leader` 是世界模拟和裁决内核。
  - 新合同不使用 `rp.gm` 或 `leader.rp`。
- 更新 `reference/agent/profile-context-memory.md`，加入 `agent-context/rp.leader/` 作为 profile-scoped context memory 示例。
- 在默认 Project 模板中新增：
  - `agent-context/rp.leader/context.md`
  - `agent-context/rp.leader/memory.md`
- `agent-context/rp.leader/memory.md` 记录 TODO：未来可保存用户画像、陪伴偏好、难度偏好、开后门偏好、剧透容忍度；长期可能把性格和 RP 能力拆成个性化 leader + RP skill。

验收：

- 新增文档和模板只使用 `rp.leader`。
- `leader.rp` 只在历史记录或 legacy 说明中出现，不作为当前推荐入口。
- 不把 `rp.leader` 写成 `simulator.leader` 的替代品；两者分工明确。

### Phase 4: Existing task and status sync

目标：避免 reference / template 已改，但任务文档和仓库状态仍停留在旧口径。

改动：

- 更新 `docs/tasks/01-agent-roleplay-mode/README.md` 的 Current Target，说明 `rp.leader` 作为 RP 用户交流层回归规划，`simulator.leader` 继续是 simulation runtime owner。
- 更新本 task 的 walkthrough 和 verification。
- 更新 `PROJECT-STATUS.md` 的 RP / simulation 状态摘要。

验收：

- `PROJECT-STATUS.md`、本 task、旧 RP task 和 reference 文档不互相冲突。
- 旧 `leader.rp` 的历史记录保留为历史实现，不误导为当前合同。

### Phase 5: Narrow verification

目标：本轮主要是文档和模板，不跑大测试，但要做可防错的窄检查。

检查：

- `rg -n "rp\\.gm|leader\\.rp|rp\\.leader|manual/" reference docs/tasks PROJECT-STATUS.md assets/workspace/.nbook/templates/project-directory-templates`
- 检查新增模板路径是否存在。
- 检查 `manual/` 默认结构是否与 `reference/content/manual.md` 一致。
- 检查 `rp.leader` 命名是否没有被 `rp.gm` / `leader.rp` 混写。

本轮追加实现：

- 已实现 `rp.leader` builtin profile。
- 已修改 `workspace/ming-ding-zhi-shi-2`，补齐项目级厚版 `manual/` 与 `agent-context/rp.leader/`。
- 仍不实现随机表、GM 屏幕或战斗模块 CLI。

### Phase 6: Follow-up CLI design

目标：先记录方向，不进入本轮实现。

后续可单独设计 CLI：

- 管理随机表：生成、索引、抽取、引用。
- 管理速查屏：从 `manual/rules-guide.md` 和 `lorebook/system/` 汇总常用裁决入口。
- 管理战斗模块：维护抽象战斗规则、状态入口、战斗日志和相关 `simulation/` 更新建议。

这类 CLI 需要单独任务，避免本轮目录规范任务膨胀成规则引擎实现。

## Verification / Test

- 已新增和同步：
  - `server/agent/profiles/builtin-contracts.ts`
  - `assets/workspace/.nbook/agent/profiles/builtin/rp.leader.profile.tsx`
  - `server/agent/profiles/rp-profiles.test.ts`
  - `workspace/ming-ding-zhi-shi-2/manual/`
  - `workspace/ming-ding-zhi-shi-2/agent-context/rp.leader/context.md`
  - `workspace/ming-ding-zhi-shi-2/agent-context/rp.leader/memory.md`
  - `reference/content/manual.md`
  - `reference/content/project-structure.md`
  - `reference/content/README.md`
  - `reference/content/directory-protocol.md`
  - `reference/agent/project-workspace-guide.md`
  - `reference/content/simulation.md`
  - `reference/agent/profile-context-memory.md`
  - `assets/workspace/.nbook/templates/project-directory-templates/manual/`
  - `assets/workspace/.nbook/templates/project-directory-templates/agent-context/rp.leader/`
  - `docs/tasks/01-agent-roleplay-mode/README.md`
  - `PROJECT-STATUS.md`
- 已按本任务计划进行窄验证；结果见本轮执行总结。
- 本轮实现 `rp.leader` 与《命定之诗》手册后已验证：
  - `bun scripts/build/profile.ts check builtin/rp.leader.profile.tsx --system`：通过。
  - `bun scripts/build/profile.ts compile --all --system`：通过，生成 12 个 system profile artifact，包含 `rp.leader`。
  - `bun run profile:metadata`：通过，系统 profile metadata 覆盖 12 个 profile。
  - `bunx vitest run server/agent/profiles/rp-profiles.test.ts`：通过，8 个测试通过。
  - `rg -n "rp\\.gm|leader\\.rp|events\\.md|knowledge\\.md|simulation/simulator\\.md|simulation/writer\\.md" workspace/ming-ding-zhi-shi-2/manual workspace/ming-ding-zhi-shi-2/agent-context/rp.leader -S`：无结果，项目侧新 manual/context 未残留旧命名或旧 subject 文件合同。
- 本轮按 5e 目录启发重组 manual 后已验证：
  - `rg -n "NeuroBook|Agent|agent|rp\\.leader|simulator\\.leader|simulation/|agent-context/|events\\.jsonl|memory\\.jsonl|Project Workspace" workspace/ming-ding-zhi-shi-2/manual -S`：无结果，说明《命定之诗》人类手册未残留内部运行说明。
  - `rg -n "rp-leader-guide|rules\\.md" workspace/ming-ding-zhi-shi-2 reference docs/tasks assets/workspace/.nbook/agent/profiles -S`：仅命中本 task 的历史记录与迁移说明，活跃 Project / reference / profile 路径已改为 `gm-guide.md` 与 `rules-guide.md`。
  - `rg -n "manual/rp-leader-guide\\.md|manual/rules\\.md|manual/systems\\.md|rp-leader-guide\\.md|systems\\.md" reference PROJECT-STATUS.md assets/workspace/.nbook/templates/project-directory-templates assets/workspace/.nbook/agent/profiles server/agent/profiles workspace/ming-ding-zhi-shi-2 -S`：无结果，默认模板、reference、profile 和项目侧活跃引用没有旧 manual 文件名。
  - `bun scripts/build/profile.ts check builtin/rp.leader.profile.tsx --system`：通过。
  - `bun scripts/build/profile.ts compile --all --system`：通过，生成 12 个 system profile artifact，包含 `rp.leader`。
  - `bun run profile:metadata`：通过。
  - `bunx vitest run server/agent/profiles/rp-profiles.test.ts`：通过，8 个测试通过。
- 本轮 manual 模板人类化优化后已验证：
  - `rg -n "NeuroBook|Agent|agent|rp\\.leader|simulator\\.leader|simulation/|agent-context/|events\\.jsonl|memory\\.jsonl|Project Workspace|profile|runtime|subject" workspace/ming-ding-zhi-shi-2/manual assets/workspace/.nbook/templates/project-directory-templates/manual -S`：无结果，项目手册与默认模板都未残留内部运行说明。
  - `rg -n "rp-leader-guide|manual/rules\\.md|manual/systems\\.md|manual/rp-leader-guide\\.md|rp-leader-guide\\.md|systems\\.md" workspace/ming-ding-zhi-shi-2 reference PROJECT-STATUS.md assets/workspace/.nbook/templates/project-directory-templates assets/workspace/.nbook/agent/profiles server/agent/profiles docs/tasks/01-agent-roleplay-mode/README.md docs/tasks/45-rp-manual-directory-and-rp-leader-naming/README.md -S`：仅命中本 task 的历史记录与迁移说明。
  - `bun scripts/build/profile.ts check builtin/rp.leader.profile.tsx --system`：通过。
  - `bunx vitest run server/agent/profiles/rp-profiles.test.ts`：通过，8 个测试通过。
- 本轮沉浸化与 Project-relative 引用后已验证：
  - `rg -n "默认桌规|桌规|GM|跑团|主持人|玩家|游戏|桌外|开后门|可玩角色|角色扮演|速查屏|非玩家角色" workspace/ming-ding-zhi-shi-2/manual -S`：无结果，manual 未残留主要跑团桌面词。
  - `rg -n "\\]\\((\\.\\./|/|[A-Za-z]:\\\\|workspace/|ming-ding-zhi-shi-2/)" workspace/ming-ding-zhi-shi-2/manual -S`：无结果，manual 新增引用未使用 Markdown-relative、绝对路径或 Workspace Root 前缀。
  - 自定义链接检查：`workspace/ming-ding-zhi-shi-2/manual` 中 31 个 `lorebook/...` Markdown 链接全部解析到存在的文件或 content node。
  - `rg -n "正文内部引用优先使用相对链接|正文内部 Markdown link \\| 相对当前|Reference targets are workspace-relative|Use relative Markdown links inside prose|workspace 相对路径" reference/content/markdown-dialect.md reference/content/content-references.md reference/agent/project-workspace-guide.md reference/content/state.md -S`：无结果，相关 reference 文档不再把 Markdown 正文链接写成仅相对路径。
  - 尝试运行 `workspace node validate` 时，当前 shell 没有 `workspace` shim；改用 `bun ..\assets\workspace\.nbook\agent\scripts\workspace.ts node validate ...` 可执行，但目标既有 lorebook 条目报 `missing-frontmatter-field ext`，与本轮 manual 链接无关。
- 本轮开局引导 / tick / 化身创建补强后已验证：
  - `rg -n "NeuroBook|Agent|agent|rp\\.leader|simulator\\.leader|simulation/|agent-context/|events\\.jsonl|memory\\.jsonl|Project Workspace|profile|runtime|subject" workspace/ming-ding-zhi-shi-2/manual -S`：无结果，项目 manual 没有内部实现词。
  - `rg -n "默认桌规|桌规|GM|跑团|主持人|玩家|游戏|桌外|开后门|可玩角色|角色扮演|速查屏|非玩家角色" workspace/ming-ding-zhi-shi-2/manual -S`：无结果，项目 manual 仍保持沉浸口径。
  - `rg -n "\\]\\((\\.\\./|/|[A-Za-z]:\\\\|workspace/|ming-ding-zhi-shi-2/)" workspace/ming-ding-zhi-shi-2/manual -S`：无结果，项目 manual 仍使用 Project-relative 引用。
  - 自定义链接检查：`workspace/ming-ding-zhi-shi-2/manual` 中 34 个 `lorebook/...` Markdown 链接全部解析到存在的文件或 content node。
  - `rg -n "命定系统：阿米娅核心|阿米娅核心|lorebook/system/命定系统" workspace/ming-ding-zhi-shi-2/manual/player-guide -S`：无结果，玩家侧创建/开局手册不再直接链接隐藏系统核心条目。
  - `rg -n "rp-leader-guide|manual/rules\\.md|manual/systems\\.md|manual/rp-leader-guide\\.md|rp-leader-guide\\.md|systems\\.md" workspace/ming-ding-zhi-shi-2 reference PROJECT-STATUS.md assets/workspace/.nbook/templates/project-directory-templates assets/workspace/.nbook/agent/profiles server/agent/profiles docs/tasks/01-agent-roleplay-mode/README.md docs/tasks/45-rp-manual-directory-and-rp-leader-naming/README.md -S`：仅命中本 task 的历史记录与迁移说明。
  - `bun scripts/build/profile.ts check builtin/rp.leader.profile.tsx --system`：通过。
  - `bun scripts/build/profile.ts compile --all --system`：通过，生成 12 个 system profile artifact，包含 `rp.leader`。
  - `bun run profile:metadata`：通过，系统 metadata 更新完成。
  - `bunx vitest run server/agent/profiles/rp-profiles.test.ts`：通过，8 个测试通过。
- 本轮 `rp.leader` / RP skill prompt 优化后已验证：
  - `rg -n "启动 simulator\\.leader|选择 `simulator\\.leader`|subject-facing `knowledge\\.md`|subject `knowledge\\.md`|subject `events\\.md`|events\\.md.*knowledge\\.md|leader\\.default 引导用户" assets/workspace/.nbook/agent/skills assets/workspace/.nbook/templates/project-directory-templates workspace/ming-ding-zhi-shi-2/agent-context assets/workspace/.nbook/agent/profiles/builtin/rp.leader.profile.tsx -S`：无结果，活跃 skill / template / project context / profile 不再把普通 RP 入口指向 `simulator.leader`，也不再使用旧 subject memory 文件合同。
  - `rg -n "RP 引导|处境 -> 行动 -> 世界回应 -> 新选择点|默认化身|自定义化身|体验边界|events\\.jsonl|memory\\.jsonl" assets/workspace/.nbook/agent/profiles/builtin/rp.leader.profile.tsx assets/workspace/.nbook/agent/skills/RP模式/SKILL.md server/agent/profiles/rp-profiles.test.ts -S`：命中新合同关键词，确认 prompt、skill 与测试断言已同步。
  - `bun scripts/build/profile.ts compile --all --system`：通过，生成 12 个 system profile artifact。
  - `bun run profile:metadata`：通过，系统 profile metadata 更新完成。
  - `bun scripts/build/profile.ts check builtin/rp.leader.profile.tsx --system`：通过。
  - `bunx vitest run server/agent/profiles/rp-profiles.test.ts`：通过，8 个测试通过。
- 本轮 Writer Brief tag 精简后已验证：
  - 历史 tag / 历史格式关键词静态搜索：无结果，活跃 reference / profile / status 不再暴露旧 tag 口径。
  - `bun scripts/build/profile.ts check builtin/rp.leader.profile.tsx --system`：通过；提示 `compile_stale`，因为本轮只做 check 未重新编译 artifact。
  - `bun scripts/build/profile.ts check builtin/rp.writer.profile.tsx --system`：通过；提示 `compile_stale`，因为本轮只做 check 未重新编译 artifact。
  - `bunx vitest run server/agent/profiles/rp-profiles.test.ts`：通过，10 个测试通过。
  - 计划出入：`bun test server/agent/profiles/rp-profiles.test.ts` 会额外运行 `product/server/agent/profiles/rp-profiles.test.ts` 同名测试；目标 `server/...` 测试均通过，但 product 镜像测试有一个既有模板断言失败（sample-npc `events.jsonl` 不含“起始场景”），本轮未处理该无关偏差。

## TODO / Follow-ups

- 设计随机表、速查屏和战斗模块的 CLI 管理方向，例如生成、索引、抽取和引用 `manual/` / `lorebook/` / `simulation/` 中的规则材料。
- 记录长期方向：未来可能把 `rp.leader` 的性格与 RP 能力拆分，形成带个性的 leader + RP skill / personalized Agent。
