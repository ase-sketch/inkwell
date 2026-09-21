# nb-memory 项目状态

## 当前快照

- **身份**：`@notnotype/nb-memory`，版本 `0.1.0`，NeuroBook 记忆框架自治包。
- **状态**：已按 S0 import manifest 收编到 monorepo；源 checkout 保持只读且不作为本包的开发路径。
- **公开入口**：`src/index.ts`；包保留原有 `test` 与 `typecheck` 脚本、exports 和依赖语义。
- **能力边界**：episode、facts、subject registry、state、双时间轴查询、可注入 LLM/embedding/storage/index port，以及相关 TypeScript/Bun 实现。
- **产品关系**：本快照只完成收编，不声明接入 NeuroBook 主应用，也不替代主应用现有记忆实现。

## 文档与任务

项目设计决策、架构图和回归报告见 [`docs/README.md`](docs/README.md)。本快照没有可迁入的历史 Task；项目 Task 入口见 [`.agents/tasks/README.md`](.agents/tasks/README.md)。

## 风险与限制

评测语料、私有配置和运行产物不属于本包快照。任何产品采用、跨包依赖或公开合同变化须由根 monorepo 治理协调并单独验证。
