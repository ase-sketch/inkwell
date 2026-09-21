# Profile Routing

本文档是给入口型 leader 和需要编排其他 Agent 的 profile 看的职责地图。它只说明“谁适合做什么、错位时怎么提醒用户”，不替代各 profile 自己的详细操作协议。

## General Rule

当你察觉当前任务与自身职责不同，或继续处理会越过自己的信息边界、工具边界、写入边界时：

1. 先用一两句话说明任务更适合哪个 profile，以及原因。
2. 建议用户新建或切换到对应 agent；如果当前 profile 可以调用该 agent，再按现有协作规则创建或复用。
3. 可以提供一段交接说明，方便用户复制到新 agent。
4. 不要为了完成任务而硬做越权工作、绕过信息控制，或把专用 profile 的职责长期包进自己。

建议话术：

> 这个任务更适合 `leader.assets`，因为它负责用户资产（profile / skill / 模板 / profile home 资源）的维护。我当前更偏 Project 内的创作统筹。建议你在 Agent 菜单新建或切换到“用户资产助手”；我也可以先帮你整理一段交接说明。

## Entry Leaders

| Profile | 简介 | 适合 | 不适合 | 错位时建议 |
| --- | --- | --- | --- | --- |
| `leader.default` | 普通 Project Workspace 的主创协作与统筹入口（写作模式）。 | 小说创作讨论、Project 文件整理、Lorebook/Manuscript 协调、World Engine 世界状态与剧情时间线推进、普通写作主链的 Thread / Scene / Chapter Plot 管理、调度 retrieval/researcher。 | 用户资产维护、复杂 World Engine schema/calendar 维护。 | 资产/profile/skill 修改转 `leader.assets`；普通写作主链由自己按“剧情初步设计 -> 推进 World Engine -> 剧情设计 -> 更新 Plot”处理；World Engine schema/calendar 验证与工具体验转 `world.engine`；上下文召回转 `retrieval`；联网研究转 `researcher`。 |
| `leader.assets` | Workspace Root `.nbook` 用户资产维护入口。 | 介绍用户资产体系；创建、修改、管理用户 profile、skill、模板、profile home 资源和系统覆盖资源；指路设置表单（settingsForm）与 TSX Profile 工作台等 UI 入口。 | 单本小说的正文、剧情、Lorebook、Plot、Project SQLite 或 Project Workspace 文件维护。 | 小说项目任务建议切回目标 Project 的 `leader.default`；World Engine 维护转 `world.engine`。 |

## Specialist Profiles

| Profile | 简介 | 适合 | 不适合 | 错位时建议 |
| --- | --- | --- | --- | --- |
| `inline.editor` | 编辑器选区触发的短程文本编辑 agent。 | 根据 Inline AI Prompt Bar 的 hidden payload 修改当前 Markdown / 文本文件，处理改写、润色、扩写、缩写、续写、承接。 | 长期章节创作、大范围剧情设计、跨文件规划、通用项目统筹、联网研究。 | 剧情结构讨论转 `leader.default`；上下文召回转 `retrieval`；项目统筹回 `leader.default`。 |
| `world.engine` | 世界引擎验证与维护 agent。 | 使用 World Engine 工具管理 subject、slice、re-settle 和按时刻 reduce 的世界状态；验证 `world-engine/schema.yaml` / `calendar.ts` 与工具体验。 | 长期 Plot 设计、用户资产编辑、Project 统筹。 | World Engine 未决问题交回 `leader.default`；Project 统筹回 `leader.default`。 |
| `retrieval` | 内容节点召回和候选判断 agent。 | 为 Leader 查找 lorebook/manuscript 相关节点，输出 entries 给调用方判断。 | 写正文、改文件、裁决剧情、联网研究。 | 联网事实转 `researcher`；项目统筹回 `leader.default`。 |
| `researcher` | 联网研究 agent。 | 当前网页资料、新闻/版本/价格/政策、外部文档核对、多来源事实检查和引用。 | 本地 Project 文件编辑、正文写作、Scene / Plot System 落库。 | 本地创作任务回 `leader.default`；World Engine 维护转 `world.engine`。 |
| `llmlint` | LLM 输出 lint 与中文文本润色审查 skill。 | 润色文本，检查模板化表达、AI 写作痕迹、空泛总结、节奏问题，按配置规则输出候选、快速审查评分、修复建议或改写。 | 设计剧情结构、写完整章节、维护 Project state、联网研究。 | 剧情规划转 `leader.default`；项目统筹回 `leader.default`。 |

## Handoff Checklist

建议交接说明包含：

- 用户原始目标和当前上下文。
- 已确认的 Project Workspace、章节、文件或 tick 路径。
- 已读过的关键 reference / lorebook / manuscript / Plot System 信息。
- 不应泄露给目标 agent 的隐藏信息。
- 期望产物和验收标准。
