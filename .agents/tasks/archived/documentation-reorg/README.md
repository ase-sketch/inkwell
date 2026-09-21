# 文档体系重整

## User Request

- 整理和组织当前项目文档。
- 明确 `docs` 和 `reference` 的功能划分。
- 在 `AGENTS.md` 中加入文档约定。
- 文档按模块分类。
- 新增根级 `PROJECT-STATUS.md` 用于报告仓库现状。
- 每个重大任务维护一个类似 walkthrough 的任务文档；同一功能后续调节继续更新同一个任务文档。

## Goal

- 建立稳定、可持续维护的项目文档结构。
- 避免 TODO、草案、调研、规范混在同一层级。
- 让后续 Agent run 能明确知道何时更新仓库状态和任务 walkthrough。

## Current State

- 已新增根级 `PROJECT-STATUS.md`。
- 已新增 `docs/README.md`、`reference/README.md`、`docs/modules/README.md`、`docs/tasks/README.md` 和任务模板。
- 已将稳定规范迁移到 `reference/<module>/`。
- 已将调研资料迁移到 `docs/research/`，将旧草案迁移到 `docs/drafts/` 或 `docs/archived/`。

## Walkthrough

- 盘点现有 `docs/`、`reference/`、`README.md`、`architecture.md` 和 `AGENTS.md`。
- 确认用户偏好：模块重排、按影响更新、任务记录放在 `docs/tasks/`、同一功能持续续写同一个任务文档。
- 建立新目录结构并移动文档。
- 重写项目入口、文档入口、规范入口和仓库状态。
- 更新文档维护规则，要求重大任务同步更新 `PROJECT-STATUS.md` 和任务 walkthrough。
- 后续补充 `AGENTS.md` 的“文档索引”章节，让 Agent 能直接找到项目入口、状态报告、规范索引和任务 walkthrough 规则。

## Decisions

- `reference/` 只保存稳定规范和实现契约。
- `docs/` 保存模块文档、调研、草案、归档和任务 walkthrough。
- 仓库级状态文件固定为根目录 `PROJECT-STATUS.md`。
- 任务 walkthrough 固定放在 `docs/tasks/<task-slug>/README.md`。
- 同一功能的后续调节继续更新原任务目录，不按每轮对话新建碎片文档。

## Files Changed

- `README.md`
- `architecture.md`
- `AGENTS.md`
- `PROJECT-STATUS.md`
- `docs/README.md`
- `docs/modules/README.md`
- `docs/tasks/README.md`
- `docs/tasks/TEMPLATE.md`
- `docs/tasks/archived/documentation-reorg/README.md`
- `reference/README.md`
- `docs/` 与 `reference/` 下多份文档路径按模块重排。
- `AGENTS.md` 后续新增“文档索引”章节。

## Verification

- 使用 `rg --files docs spec` 检查文档落位。
- 使用 `rg` 检查旧路径、绝对 Markdown 链接和关键入口残留。
- 本任务只调整 Markdown 和文档路径，不需要运行代码测试。

## TODO / Follow-ups

- 后续新增或调整模块时，继续补充 `docs/modules/README.md` 和 `reference/README.md`。
- 若新增拆书等长期功能，应创建对应 `docs/tasks/<task-slug>/README.md` 并在后续调节中持续更新。
