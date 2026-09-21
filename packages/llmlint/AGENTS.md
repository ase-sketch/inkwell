# llmlint 包规则

共享协作、安全、Git、临时目录和验证门禁遵循仓库根 [`../../AGENTS.md`](../../AGENTS.md)；不要在此复制或分叉根规则。

## 项目边界

- `skill/` 是可安装、可发布的 Agent Skill / CLI runtime 真相源；根目录只承载 llmlint 开发工作区、`tests/`、`evals/` 与 Web 应用。
- 规则库同时服务写作期 `guide` 与审查期 `check` / `fix` / `detect` / `rules`；修改提示词、文档或 CLI 描述时，检查两个消费时机。
- CLI 稳定入口是 `bun skill/bin/llmlint.ts …`；也支持 Node >=22.19 + `tsx`，裸 `node` 不作为运行入口。
- `web/` 是独立 Nuxt/Nitro 检测与采集站，`web/` 与 `skill/` 各自保留自己的安装图和 lockfile；它们不是根 workspace 的运行时复制品。
- `evals/` 是开发仓一等资产；主语料、真实模型配置和运行输出只放在受忽略的本地目录，不导入或提交私有 corpus、secret、数据库和运行态。
- `@notnotype/neuro-agent-harness` 通过 workspace 依赖接入 llmlint；本包不声明替换 NeuroBook 自有 Agent Harness。

## 文档与任务

- `CONTEXT.md` 是术语与硬不变量的真相源；`evals/METHODOLOGY.md` 是评测方法论真相源；`PROJECT-STATUS.md` 是本包状态入口。
- 历史 Task 位于 [`.agents/tasks/`](.agents/tasks/)，只作源仓迁入的 legacy provenance。llmlint 的 current 新工作统一在 monorepo 根 `.agents/works/` 创建 Work/Task；既有 legacy walkthrough 只在修复或补充历史结果时原地更新。
- 稳定实现合同位于 `skill/references/`；跨任务规格、提案和 ADR 留在本包 `docs/`。
- 改动任务、文档路径或命令时同步检查相对链接；根共享规则只引用，不在此重复。

## 变更与验证

- 保持 AGPL-3.0-only 边界，不以 monorepo 根许可证替换本包或 `skill/` 的许可证。
- 根 `package.json` 的 workspace 安装图由 monorepo 维护；本包不复制根 `bun.lock`。`skill/` 和 `web/` 的 lockfile 属于各自独立 package island，按各自合同维护。
- 常规 llmlint 变更使用本包 manifest 中的 `typecheck`、`test`、`verify`、`web:*` 命令；评测与 Web 数据库必须使用显式临时/本地路径。
- 导入、文档迁移或 manifest 机械变更不自动运行 `verify`、`test`、`build`；报告中如实注明未运行的验证项。
