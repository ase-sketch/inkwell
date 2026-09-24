# neuro-agent-harness 包规则

`@notnotype/neuro-agent-harness` 是宿主无关的 TypeScript Agent Harness，提供 append-only session、profile、tool 调度、事件恢复与可插拔存储。

## 边界与依赖方向
- Core 宿主无关：Core 层严禁依赖主应用（`packages/neuro-book`）、Nuxt、Prisma、Vue 或特定工作区布局。
- 依赖注入：宿主能力、外部模型（如 Pi / provider）及 UI 交互一律通过 Adapter、Capability 或 Workflow 注入。

## 底线与验收
- 数据一致性：Session、Entry 和 Invocation 记录保持 append-only；Snapshot 是状态恢复的唯一真相源。
- 状态写入纪律：Profile 和 Tool 严禁直接改写 Store，必须返回 `SessionWritePlan` 或 Tool result。
- 测试与数据隔离：测试数据与运行产物走隔离临时目录，严禁污染源码树。
- 验收标准：保持严格类型与 ESM 兼容，改动通过单元测试与 `bun run --cwd packages/neuro-agent-harness build`。
