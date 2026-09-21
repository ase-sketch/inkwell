# NeuroAgentHarness 文档索引

只加载当前任务需要的分支；`AGENTS.md` 保留执行规则，本文件负责导航。

## 按任务进入

| 任务 | 先读 | 关注点 |
| --- | --- | --- |
| 了解包边界、安装和脚本 | [`README.md`](../README.md)、[`package.json`](../package.json) | 公共包、导出、`bun` 命令 |
| 修改 Session / Invocation / Event / Store 合同 | [`CONTEXT.md`](../CONTEXT.md)、[`architecture.md`](architecture.md) | append-only、Snapshot 恢复、cursor 和 commit 顺序 |
| 修改宿主扩展或模块边界 | [`architecture.md`](architecture.md) | Core、Adapter、Capability、Workflow 的职责 |
| 接入或评估 Pi / provider | [`pi-adapter-design.md`](pi-adapter-design.md) | provider-neutral runtime、取消、usage 和 compaction |
| 评估 NeuroBook 迁移或兼容性 | [`neuro-book-extension-study.md`](neuro-book-extension-study.md) | 概念映射、迁移前门禁和明确非目标 |
| 建立或继续重大 Task | 根 [`.agents/works/README.md`](../../../.agents/works/README.md)、对应 Work/Task `README.md` | 目标、决策、walkthrough、验证和未完成边界 |
| 继续 Issue #193 重新设计 | [`issue-193-roadmap.md`](issue-193-roadmap.md)、[`w00002-neuro-agent-harness-redesign`](../../../.agents/works/w00002-neuro-agent-harness-redesign/README.md) | 当前唯一活动 Task、非绑定候选阶段和创建下一 Task 的触发条件 |
| 改公开 API 或修复回归 | `src/index.ts`、相关 `src/*.ts`、对应 `tests/*.test.ts` | 导出、实现、行为测试三者一致 |
| 改存储或恢复 | `src/storage/`、`tests/*store*.test.ts`、`tests/recovery.test.ts` | Memory/JSONL 对照、恢复和持久事件 |
| 改打包或发布 | [`package.json`](../package.json)、[`scripts/pack-smoke.ts`](../scripts/pack-smoke.ts) | build、包内容和安装后 smoke；发布由 monorepo 根治理 |

## 源码与测试地图

- `src/`：公开合同、Run Kernel、协调、工作流和事件/Session 投影。
- `src/storage/`：可替换 Session Store；Memory 用于测试和原型，JSONL 是第一方持久化实现。
- `src/testing/`：黑盒测试用 Model Runtime 和辅助工具。
- `tests/`：合同、恢复、并行 Tool、Approval、Workflow、存储和持久事件测试。
- `scripts/`：发布前的包安装 smoke。
- 事件类型与发布点逐项对应清单见 [`events-inventory.md`](events-inventory.md)。

## 任务记录

Current 跨模块或合同级工作在根 [`.agents/works/`](../../../.agents/works/) 下建立 Work 与 Task；本包 [`.agents/tasks/`](../.agents/tasks/) 只保存历史 Task provenance，不创建新任务。完整模型与命名规则见根 [`.agents/works/README.md`](../../../.agents/works/README.md)。
 
## 项目归属

本目录归 `neuro-agent-harness` 自治项目，承载本包的架构、ADR、研究、测试和迁移说明；NeuroBook 产品与 monorepo 共享治理仍归仓库根 `docs/` 和根规则。历史 Task 原样保留在 [`.agents/tasks/`](../.agents/tasks/)，current Work/Task 只在根 `.agents/works/` 维护。

本次收编是 S0 manifest 固定快照导入；源 checkout 保持只读，目标包的包身份、私有发布边界和 monorepo 治理入口以本包 `package.json`、`AGENTS.md` 与 `PROJECT-STATUS.md` 为准。
