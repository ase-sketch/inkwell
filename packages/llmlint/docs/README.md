# 文档索引

本目录保存 llmlint 开发仓的文档资产。稳定实现契约放在 `skill/references/`，仓库级现状放在根目录 `PROJECT-STATUS.md`。

## 目录分工

- `.agents/tasks/`：重大任务的持续 walkthrough；active task 使用 `{order}-{slug}`，已归档任务放入 `.agents/tasks/archived/`。
- `docs/adr/`：已经拍板且会约束实现或部署的架构决策。
- `docs/research/`：第三方库、外部资料和方案调研。
- `docs/drafts/`：未定稿草案。
- `docs/promo/`：面向外部渠道的宣传预热物料（众筹期未定稿，随宣传节奏改写）。约束：单文件 HTML、零构建依赖；页面中的数字与事实必须能在仓库文档或实验记录中溯源；各页页脚免责声明（内部实验口径、规划中能力、排行榜非首版承诺）不得删改。
- `docs/proposed/`：面向立项的未实施方案提案。
- `docs/specs/`：跨任务的架构与产品规格；`Draft` 只供讨论，`Accepted` 后约束新实现。
- `docs/archived/`：过期但仍有参考价值的文档。

## 关键入口

- [../CONTEXT.md](../CONTEXT.md)：项目领域语言（术语）+ 硬不变量（代码遵守）。
- [../evals/METHODOLOGY.md](../evals/METHODOLOGY.md)：评测方法论 / 流程规范（代码按它实现）。
- [../PROJECT-STATUS.md](../PROJECT-STATUS.md)：仓库现状和近期任务。
- [../README.md](../README.md) / [../README.en.md](../README.en.md)：项目入口（中文 / English）。
- [specs/README.md](specs/README.md)：架构与产品规格地图、状态和讨论顺序。
- [../.agents/tasks/README.md](../.agents/tasks/README.md)：任务 walkthrough 规则。
- [../.agents/tasks/TEMPLATE.md](../.agents/tasks/TEMPLATE.md)：新任务 walkthrough 模板。
- [../skill/references/rule-model.md](../skill/references/rule-model.md)：**规则数据模型的活契约**（磁盘形态、detector、loader 不变量、命中类型、报告投影）。写规则或改规则模型前先读；`tests/rule-model-doc.test.ts` 守着它不漂移。
- [../skill/references/cli-usage.md](../skill/references/cli-usage.md)：CLI 参数、输出格式、JSON schema 稳定参考。
- [../skill/references/patterns.md](../skill/references/patterns.md)：中文规则模式库。
- [../skill/references/workflow.md](../skill/references/workflow.md)：6 步润色流程。
- [../skill/SKILL.md](../skill/SKILL.md)：Agent Skill manifest 与工作流合同。
- [../evals/README.md](../evals/README.md)：评测 harness 说明。

## 维护规则

- 新文档先判断用途：稳定运行时契约进入 `skill/references/`，跨任务架构与产品合同进入 `docs/specs/`，面向立项但未实施的方案进入 `docs/proposed/`，过程性未定稿内容进入 `docs/drafts/`。
- 外部资料和技术选型调研进入 `docs/research/`，不要混入稳定参考。
- 对外宣传物料进入 `docs/promo/`：只放可直接打开的静态页，不混入契约或提案；文案口径与页脚声明不一致时以仓库文档为准并回改物料。
- 重大任务完成后更新 `PROJECT-STATUS.md` 和对应 active `.agents/tasks/<order>-<task-slug>/README.md` 或 archived `.agents/tasks/archived/<task-slug>/README.md`。
- 同一功能的后续调整继续更新原任务 walkthrough，除非目标已经明显独立。
