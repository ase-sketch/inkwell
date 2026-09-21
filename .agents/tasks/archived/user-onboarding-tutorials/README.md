# User Onboarding Tutorials

## User Request

- 阅读最新文档，可以继续查询相关 tasks、reference、docs。
- 完善基础教程，流程和命名可以优化，要激发用户兴趣。
- 最终目标是让用户创建一个项目、初始化项目、学会调用 Skill、写前三章、学会导入角色卡，并能够进入 RP 模式。

## Goal

新增一套面向普通作者用户的基础教程，验证方式是 VitePress 文档构建通过，且站点导航能从首页进入教程总览，再按顺序到达创建项目、Skill 初始化、前三章写作、SillyTavern 角色卡导入和世界模拟 / RP。

## Current State

- `docs/` 负责用户向文档、任务 walkthrough、调研和草案。
- `reference/` 是稳定参考书架，不能把上手教程混进 reference。
- 站点配置仍保留旧 `/agent/`、`/profile/`、`/profile-tsx/` 入口，但这些 active 页面已经不再是当前文档结构的主入口。
- 写作流程、simulation / RP、SillyTavern 导入和 workflow skill 的稳定说明已经沉淀在 `reference/agent/`、`reference/content/` 和系统 skill 中。

## Walkthrough

- 复核 `docs/README.md`、`docs/index.md`、`docs/quick-start.md`、`docs/.vitepress/config.ts`。
- 复核 `reference/agent/novel-writing-workflow.md`、`reference/content/README.md` 和系统 skill 目录，确认教程使用当前 `simulation/` 与 workflow skill 名称。
- 新增 `docs/tutorials/`，按“从第一本书到第一次 RP”的路线组织教程。
- 更新站点首页、快速开始、文档索引和 VitePress 导航。
- 根据后续要求恢复 `/agent/`、`/profile/`、`/profile-tsx/` 站内路由，并重写为当前 Agent / Profile / TSX DSL 导读页。
- 按作者用户视角补强教程：新增开始前检查，细化项目创建、Skill 初始化、前三章写作、角色卡导入和世界模拟的操作路径、成功标志、文件树与常见返工提示词。

## Decisions

- 教程面向普通作者用户；Agent Harness、TSX Profile DSL、Sidecar 等实现细节只链接到 Reference。
- 教程入口命名为“从第一本书到第一次 RP”，比“基础教程”更能表达完整路径和最终成果。
- RP / 世界模拟教程使用当前 `simulation/` 命名，不恢复旧 `roleplay/` 目录心智。
- `/agent/`、`/profile/`、`/profile-tsx/` 保留为站内导读页；详细实现合同继续由 GitHub `reference/` 承接。

## Files Changed

- `docs/tutorials/index.md`
- `docs/tutorials/00-before-you-start.md`
- `docs/tutorials/01-studio-tour.md`
- `docs/tutorials/02-first-project.md`
- `docs/tutorials/03-skills-bootstrap.md`
- `docs/tutorials/04-first-three-chapters.md`
- `docs/tutorials/05-import-character-card.md`
- `docs/tutorials/06-enter-world-simulation.md`
- `docs/.vitepress/config.ts`
- `docs/index.md`
- `docs/quick-start.md`
- `docs/README.md`
- `docs/agent/index.md`
- `docs/agent/tools.md`
- `docs/agent/sidecar.md`
- `docs/agent/advanced.md`
- `docs/profile/index.md`
- `docs/profile/leader.md`
- `docs/profile/writer.md`
- `docs/profile/other-profiles.md`
- `docs/profile-tsx/index.md`
- `docs/profile-tsx/nodes.md`
- `docs/profile-tsx/examples.md`
- `PROJECT-STATUS.md`

## Verification

- Passed: `bun run docs:build`
- Passed: 搜索 `docs/.vitepress`、`docs/index.md`、`docs/quick-start.md`、`docs/tutorials`，未发现旧 `/agent/`、`/profile/`、`/profile-tsx/` 站内导航残留。
- Passed: 恢复 `/agent/`、`/profile/`、`/profile-tsx/` 后重新运行 `bun run docs:build`。
- Passed: 使用 fixed-string 搜索确认 `/agent/`、`/profile/`、`/profile-tsx/` 入口已恢复到 VitePress nav/sidebar 和首页文档分区。
- Passed: 教程用户视角补强后重新运行 `bun run docs:build`。

## TODO / Follow-ups

- 后续可补真实截图或页面动线图。
- 后续如果产品 UI 名称稳定，再把教程里的“Agent 抽屉”“文件树”等描述和 UI 文案逐项对齐。
