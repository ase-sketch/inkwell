# nb-workflow 专属规则

共享协作、安全、Git、临时目录和 monorepo 规则统一见 [`../../AGENTS.md`](../../AGENTS.md)；本文件只记录 `nb-workflow` 自治项目的边界。

- 本包是 `@notnotype/nb-workflow` 的固定快照，维护脚本式 durable-execution workflow spike 的源码、demo 和测试；不把 spike 宣称为 NeuroBook 主应用集成或稳定产品合同。
- 保持源项目的 `src/`、`test/`、`demo/`、README、TypeScript 配置、`test`/`demo` scripts、exports（如有）和运行依赖语义；变更应先在本项目范围内说明影响。
- 本 monorepo 包为私有包，不新增发布入口；现有 Registry 版本和源 checkout 不在此处改写。跨项目采用、共享合同或根 workspace 变更由根治理协调。
- 项目 docs 和状态归本包；包内 `.agents/tasks/` 只保留 legacy 索引或迁入记录。current 新工作统一在根 `.agents/works/` 创建 Work/Task，没有历史记录时不伪造 taskId、正文或 roadmap。
- 运行产生的数据库、缓存、secret、环境文件和临时目录放在根规则指定的临时根，不写入包目录。
