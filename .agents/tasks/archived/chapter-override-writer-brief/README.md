# Chapter Override / Writer Brief

> **已归档（2026-07-05）**：本任务从未落地。它规划的 `ChapterOverride`（章级 writer 指令层）被 **Task 87「Plot 两棵树重设计 + Writer 双模式 + ChapterBrief」** 吸收并重设计——`ChapterOverride` 更名为 `ChapterBrief`，作为一等实体 `StoryChapter` 上的字段组落地，不再按 `chapterPath` 字符串关联，而是章实体 + Prose frontmatter 反指。本任务保留仅作历史与需求溯源。当前实现见 [docs/tasks/87-plot-two-trees-and-writer-modes/README.md](../../87-plot-two-trees-and-writer-modes/README.md) 与 [reference/plot/writer-brief.md](../../../../reference/plot/writer-brief.md)。

## User Request / Topic

Task 78 已完成 Scene ↔ World Engine 桥接闭环，但不实现章节覆盖。本任务单列 `ChapterOverride`：作为章节级 writer 指令层，服务章节写作交接、节奏控制和信息控制，不保存动态世界状态，也不替代 Scene / World Engine。

## Goal

设计并落地 `ChapterOverride` 与 `WriterBriefService`：

- `ChapterOverride` 存放在 Project SQLite，按 `chapterPath` 关联 manuscript chapter。
- `WriterBriefService` 汇总 ChapterOverride、章内 scenes、thread summary、Scene World Context 和 unresolved warnings，形成 writer 可直接消费的只读 brief。
- Agent / UI 可以读取章节级 writer 指令，但事实推进仍必须回到 World Engine slice / patch。

边界更新（2026-06-29）：如果 Task 78 先实现 scene/world-only `get_chapter_writer_brief` v1，本任务不重新创建第二套工具，而是在同一 brief 合同上扩展 ChapterOverride 字段与服务逻辑。

## Scope

`ChapterOverride` 负责章节级 writer-facing 指令：

- POV：本章视角、可用叙述距离、视角切换限制。
- 语气：本章语言气质、情绪温度、风格约束。
- 节奏：起承转合、密度、爽点、悬念、反转和停顿。
- 信息控制：读者已知、主角已知、必须隐藏、可暗示但不可明说。
- 开头 / 收尾：开场钩子、章节落点、下一章牵引。
- 禁写事项：不要暴露的秘密、不要提前确认的事实、不要破坏的角色动机。

## Boundaries

- 不保存 subject 当前状态、世界事实或时间线真相；这些属于 World Engine。
- 不重新引入 `StoryPlot / Plot Beat`。
- 不把 Chapter 变成 Story 层级；Chapter 仍是正文承载与 writer 指令层。
- 不在 Task 78 内实现 ChapterOverride；Task 78 可以先实现不含 ChapterOverride 的 scene/world-only brief v1。

## Initial Plan

1. 设计 Project SQLite 表结构和 DTO。
2. 增加 `GET/PATCH /api/projects/plot/chapters/:chapterPath/override` 或等价 query 路由。
3. 扩展只读 `get_chapter_writer_brief` 聚合层：若 Task 78 已落地 v1，则合入 ChapterOverride；若尚未落地，则一并实现 scene/world 基础 brief。
4. 在 Plot Workbench Chapter 视图加入章节覆盖编辑入口。
5. 为 Agent tool 输出 unresolved subject warning、时间未连接 warning 和 reader/protagonist information-control 摘要。

## Verification Plan

- DTO schema 测试：nullable 字段、信息控制数组、禁写事项。
- Service 测试：按 `chapterPath` 读取/更新，路径校验，空 override 默认值。
- Writer brief 测试：聚合 ChapterOverride + scenes + Scene World Context，并保留 unresolved warnings。
- HTTP 集成测试：缺 `projectPath`、非法 `chapterPath`、正常读写。
