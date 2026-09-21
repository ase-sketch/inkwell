# Architecture

## Module Map

```text
Host composition root
  -> NeuroAgentHarness Facade
      -> Profile Registry
      -> Invocation Coordinator
      -> Run Kernel
      -> SessionWritePlan compiler
      -> Event Hub
  -> Workflow (fork / rewind / summarize / orchestration)
  -> Session Store Adapter (Memory / JSONL / future Prisma)
  -> Model Runtime Adapter (host supplied / optional Pi adapter)
  -> typed Capability providers
```

## Provisional Evolution Direction

> 2026-08-07；这是初步设计方向，不是不可调整的 V1 完成合同。

- TSX Profile 可以在保持上下文、Profile、Session 和 Capability 合同去领域化的前提下，逐步吸收到本库；NeuroBook 的产品专属 Profile、Workspace 和文件 watcher 不应直接进入 Core。
- Sidecar 不属于 Harness 核心职责。需要旁路 Agent、串行/并行编排或后续处理时，优先由 Workflow、受限 Agent caller 和 Capability 组合实现。
- 本库可以逐步附带领域无关的常用工具（例如 `read`）和 SSE Transport Adapter，但工具、DTO、鉴权、heartbeat 和宿主路径不能穿透 Core。
- NeuroBook 的 Harness 已经继续演进并修复了更多生产问题；独立库可能暂时落后。两者不能默认行为完全一致，迁移需要依赖版本化合同、Adapter 和行为测试。
- 当前 Agent 使用量较少的宿主可以直接使用 `pi-ai`。待本库稳定后，再通过 `ModelRuntime` Adapter 切换到 Harness；Core 和 Profile 不得暴露 Pi 私有类型。
- 存储、SQLite/Prisma、Transport 和桌面宿主等技术选择保持可替换；真实实现、跨进程恢复和产品验收可以推翻本节的初步选择。

## NeuroBook Concepts

| Concept | Library placement |
| --- | --- |
| NeuroSessionContext | 由 Capability 从 Snapshot active path 派生；不是 Session metadata |
| SessionWritePlan | Core 一等合同 |
| Skill Catalog | typed Capability |
| Variables | typed Capability + host Session entries |
| Profile Home | runtime Capability；声明作为 Profile Facet |
| Low-Code Form | Profile Facet，Core 不解释 |
| Project Workspace | Host Context + typed Capability |
| sessionId: number | 默认 Session ID；JSONL Adapter 固定正整数 |
| Workflow 旁路运行 | 位于 Core 之上，通过 fork / rewind / invoke / SessionWritePlan 组合 |
| Agent caller | Core 一等 caller 合同与受限调用能力 |
| Approval | Core waiting/resume 状态机；宿主提交 resolution |
| Compaction | Core 负责触发、切分和 entry；ContextCompactor Adapter 生成摘要 |
| Parallel Tools | Core 调度并按 provider call 顺序提交；Session 写 Tool 必须 sequential |
| Steer / Follow-up | Core Invocation Coordinator；steer 进入当前 run，follow-up 创建后续 Invocation |
| Relation index | SessionCommitObserver materialized view；失败不否决 durable commit |
| Host entry kinds | typed SessionEntryCodec；Core 不解释产品 payload |
| Summarizer | CommitWorkflowScheduler；按 Session key 合并 dirty rerun |
| JSONL checkpoint | Store Adapter 可选 delta record；默认仍为完整 Snapshot |

## Explicit Non-goals For V1

- NeuroBook 专属的 Profile TSX 编译器、watcher 与 Workbench；去领域化 TSX Profile 是否进入本库仍需真实迁移验证。
- NeuroBook EffectiveConfig、Project Workspace 路径解析和内置工具。
- llmlint Prisma Adapter、Revision/report/hits/edit 业务。
- NeuroBook 专属的 Nuxt/H3 SSE route、鉴权和 heartbeat；通用 SSE Adapter 后置。
- 多进程 EventHub 或分布式事务。
- 宿主专属的 Sidecar Supervisor；旁路运行由 Core 之上的 Workflow 组合。

## Research

- [NeuroBook extension study](./neuro-book-extension-study.md)
- [Pi adapter design](./pi-adapter-design.md)
