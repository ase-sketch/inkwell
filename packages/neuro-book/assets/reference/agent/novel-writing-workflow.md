# Novel Writing Workflow

本文定义普通写作模式的 skill 体系和主协作链。World Engine 是写作模式下动态世界状态与时间线的唯一真相源；旧 `simulation/` / `emulation` 流程只作为历史资料保留（skill 已归档到 `packages/neuro-book/docs/archived/skills/`）。Plot System 在普通写作模式下只作为 Scene / Chapter 结构层，由 `leader.default` 管理，不保存第二份动态世界状态。

完整 World Engine 原理与 leader 的 Plot / World Engine 协作契约见 [../world-engine/workflow.md](../world-engine/workflow.md)。写作 skill 的全局路线图是 Bundled Workspace Template 中的 `novel-guide` skill；本文与它保持同一口径。

## Current Contract

当前普通写作链路由 `leader.default` 直接负责 Plot / Scene、World Engine 推进与 ChapterBrief 维护。**Inkwell 不代写正文**：代写引擎（writer / 剧情导演 / rp.* / simulator.* profile 与配套 workflow）已在 M1c 整体下线，文风参考容器改由 M2 的 Skill 双轨承接。

- `leader.default` 负责和用户讨论剧情、确认 canon、推进 World Engine、维护 Thread / Scene / Chapter Plot、选择必要 lorebook，并编译 `get_chapter_writer_brief`。
- 主链止步于「更新 Plot」与 ChapterBrief；leader 不调度代写 agent，也不替用户成稿。
- 正文由用户自己写；leader 的价值在追问、结构梳理、设定一致性与状态维护。
- 稳定设定走 `lorebook/`，动态世界状态与时间线走 World Engine，Plot System 只承担 Scene / Chapter 结构层。

## Standard Flow

1. **Intent routing**：判断用户是在灵感探索、项目初始化、设定补全、剧情推进、章节规划，还是导入素材。不确定时读 `novel-guide`。
2. **Project check**：确认 Current Project Workspace、目标章节、World Engine 是否已初始化、是否已有本章可写的剧情事实。
3. **Canon preparation**：稳定设定进入 `lorebook/`；动态状态和时间线进入 World Engine。项目搭建（定位、世界书框架、角色设计）走 `novel-setup` 阶段一到三。
4. **World Engine init**：项目有明确时间线和需追踪对象时，使用 `novel-setup` 阶段四建立 `calendar.ts`、`schema/index.ts`、纪元锚点和开局状态。
5. **Plot / state planning**：使用 `novel-writing`（剧情设计 → 拍板落库环节）讨论剧情。leader 按固定主链推进：**剧情初步设计 -> 推进 World Engine -> 剧情设计 -> 更新 Plot**——先做剧情初步设计并把确认后的动态事实写入 World Engine，再细化剧情并更新 Thread / Scene / Chapter Plot。
6. **Retrieval handoff**：需要设定上下文时先调用 `retrieval`，leader 选择 `entries[].path` 作为当前工作集的参考，不把 retrieval 的 reason / use / risk 原样转述给用户。
7. **Brief readiness**：调用 `get_chapter_writer_brief` 编译 Chapter Writer Brief；若 status 不是 `ready`，先补 Plot、World Anchor 或 World Context。brief 是给用户对照的结构化写作提纲，不再交给任何代写 agent。
8. **Post-planning check**：用户按 brief 自己成稿后，leader 检查是否产生新的动态事实；如有，回到拍板落库环节做 World Engine 回补。


## Writing Skills

Bundled Workspace Template 中的写作 skill 分三层（详见 `novel-guide`）：

| Skill | 层 | Purpose |
| --- | --- | --- |
| `novel-guide` | 总览 | 写作流程唯一路线图：三层结构、阶段判断、内置 workflow 一览。 |
| `novel-import-silly-tavern-card` | 工具支持 | 导入本地 SillyTavern 角色卡 / worldbook。 |
| `novel-import-tomato-reference` | 工具支持 | 导入番茄小说等外部书稿供拆书分析。 |
| `novel-idea-exploration` | 随时可用 | 从模糊灵感整理成故事雏形；不急着初始化 World Engine。 |
| `novel-genre-research` | 随时可用 | 题材分析、竞品拆书、调研（骨架占位版）。 |
| `novel-technique-character-card-workshop` | 随时可用 | 重量级角色理解与写卡技法（20/24/80/200 问）。 |
| `novel-setup` | 创作流程 | 项目搭建四阶段：项目初始化 → 世界书框架 → 角色设计与细化 → World Engine 初始化。 |
| `novel-writing` | 创作流程 | 剧情写作循环：剧情设计 → 拍板落库 → 结构提纲；开局模式覆盖黄金三章。 |
Legacy（已归档到 `packages/neuro-book/docs/archived/skills/`，不进 skill catalog）：`novel-workflow-05-emulation-bootstrap`、`novel-workflow-06-emulation-tick`。

## Legacy Boundary

`simulation/`、`emulation` 和 RP Tick reference 属于 legacy RP 资料，已在 M1c 随代写引擎一并从本包移除；历史项目维护请查阅 `packages/neuro-book/docs/archived/` 下的归档副本。普通写作模式下不要把旧 simulation 当作动态状态源，也不要让 Plot System 覆盖 World Engine 的时间线真相源。
