# nb-workflow 项目状态

## 当前快照

- **身份**：`@notnotype/nb-workflow`，版本 `0.1.2`，Composable script-first Workflow Kernel。
- **状态**：已收编到 monorepo；canonical source 在 `packages/nb-workflow`，源 checkout 与 T02 worktree 均保持只读未改写。
- **范围**：包含 Activity/Backend/ValueStore/Signal/Timer/Child Workflow、Agent/Session Extension、journal replay、等待恢复、取消和投影 API；NeuroBook 主应用从正式包入口消费。
- **包治理**：monorepo 包为 `private: true`，`exports["."]` 指向 `src/index.ts`；本次保留包级 `test`、`demo` scripts，不新增 build、pack 或发布入口。

## 来源与语义合并

本次快照以 `nb-workflow@cf34d156` 当前 checkout 和 dirty T02 worktree `aa691270` 为只读输入，在系统临时根完成 scratch merge。`src/index.ts`、`src/ports.ts`、`src/runner.ts`、`src/types.ts` 与 `test/kernel.test.ts` 的重叠 hunk 采用 T02 完整 API；其取消、Agent signal、唯一 Run ID 和 usage 合同已由 canonical 源验证存在。

## 文档与任务

- 概念、特性和 API 参考位于本包 `docs/`。
- `01-kernel-stabilization` 与 `02-audit-hardening` 历史 Task 位于 [`.agents/tasks/`](.agents/tasks/)。
- 根 T149 Task 记录跨包同步、源仓只读边界和联合验收；本包后续行为变化继续写本包 Task。

## 验证状态

本次同步后的 `bun test`、主应用 Workflow consumer、lockfile/frozen install 和根 governance 仍待本 checkpoint 执行；未把源仓或 scratch 验证结果提前写成通过。
