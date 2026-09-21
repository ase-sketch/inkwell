# ADR-0001: Cosmos Consumer Boundary and Workflow Ownership

- Status: Accepted
- Date: 2026-08-07
- Task: [`01-harness-decoupling`](../tasks/01-harness-decoupling/README.md)

## Context

Cosmos 的需求把 Agent 定义为普通 Flow Action，并把 durable Flow/Job、Lease、Heartbeat、Retry、Outbox、外部副作用账本和 HTTP/SSE Transport 归为 Cosmos 运行时职责。NeuroBook 的近期演进也表明 durable Job、delivery 幂等和事件恢复是高价值能力，但这些实现绑定宿主 DTO、文件布局或产品生命周期。

`neuro-agent-harness` 已经提供 provider-neutral `ModelRuntime`、`SessionStore`、`Profile`、`Capability`、`AgentInvoker`、`snapshot()`、`write()`、`createSession()`、`invoke()` 和带 cursor 的 `SessionEventHub`。直接搬入 NeuroBook 的 Job Manager 或 Cosmos 的 Flow/Job 持久化会造成双重真相源和宿主耦合。

## Decision

1. Harness Core 只提供 Agent Invocation、Session/Invocation recovery、受限 Agent caller、Workflow 组合原语和 provider-neutral event/transport seam。
2. Cosmos 保留 Flow/Job 调度、Lease、Heartbeat、Retry、Dead Letter、Outbox、外部副作用、Prisma/SQLite 和公共 HTTP/SSE DTO。
3. Sidecar 不恢复为 Harness Core API；旁路 Agent 通过 `snapshot → createSession/write → invoke → write` 或受限 `AgentInvoker` 组合。
4. 第一轮实现验证一个 Cosmos 风格 consumer compatibility slice：宿主注入 `ModelRuntime`、`Profile`、`SessionStore`、受限 `read` Capability 和事件消费，完成 deterministic Agent Action、恢复和 cursor 事件测试；暂不修改 Cosmos，也不要求真实 provider。
5. Durable Workflow Job 若未来需要进入 Harness，只能以可替换 Port/Adapter 形式提案；Job 的 durable 事实、delivery 状态和 lease 不能同时由 Harness 与 Cosmos 持有。

## Consequences

### Positive

- Cosmos 可以先继续直接使用 `pi-ai`，之后再通过 Adapter 接入 Harness。
- Harness 的 API 以可测试的 ports/capabilities 为中心，能被多个宿主复用。
- Workflow 与 Agent 调用的边界可在 deterministic fake runtime 中验证，不需要复制产品实现。

### Costs and risks

- Harness 不会自动提供完整 durable Flow/Job 编排；Cosmos 仍需实现自己的 Job/Lease/Outbox。
- consumer compatibility slice 可能暴露现有公开 API 的可用性缺口，需要后续 ADR 或 additive API 调整。
- `read` 和 SSE 只能进入可选 Adapter/Capability；权限、路径、鉴权和 HTTP 恢复不属于 Core。

## Alternatives considered

- **把 NeuroBook AgentJobManager 搬进 Harness**：拒绝；会把产品 DTO、文件布局和 Job 生命周期带入 Core。
- **让 Harness 接管 Cosmos Flow/Job 持久化**：拒绝；会产生两个 durable truth source，并固化 Prisma/SQLite 或通用 Job schema。
- **只做文档，不做 consumer smoke**：拒绝；无法证明 API 真能被 Cosmos 风格宿主使用。

## Verification plan

- 新增 Cosmos 风格宿主 fixture 和 deterministic `ModelRuntime` consumer test。
- 覆盖结构化 output、Tool/Capability 注入、Agent caller provenance、Session Snapshot 恢复和 event cursor replay。
- 若发现公开合同缺口，先补测试和 Task 讨论，再决定 additive API；不以实现细节替代 consumer 证据。

## Review outcome

2026-08-07 完成独立审查。Cosmos 需求文档将 Agent 定义为普通 Flow Action，并将 durable Flow/Job、Lease、Retry、Outbox、外部副作用和 HTTP/SSE DTO 留在 Cosmos；当前 Harness 的 Workflow、受限 Agent caller、Session recovery 和 event cursor 原语足以支持本 ADR 的首轮 consumer slice。Cosmos consumer compatibility test、`bun run verify` 和 `bun run pack:smoke` 均通过，因此本 ADR 接受为当前边界；未来若引入通用 Job/Delivery port，仍需单独 ADR 和可替换 Adapter 证据。
