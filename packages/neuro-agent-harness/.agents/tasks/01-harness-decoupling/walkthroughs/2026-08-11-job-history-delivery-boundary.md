# 第六十轮：Job history / Workflow feedback delivery boundary audit

## 状态

完成 NeuroBook durable Job history、结果回流与 standalone Workflow/follow-up/result writeback 的边界审计；没有发现应下沉到 Core 的公共合同缺口。本轮为规划/证据 walkthrough，不修改生产代码，不新增 public API、ADR、依赖或测试文件。

## 规划取证

1. NeuroBook ADR-0014 的 durable truth 是 Workspace 内 Job 文件：保存公开 Job snapshot、完整 result、usage/session 摘要、stable `deliveryId`/`clientMessageId` 与 delivery status。
2. NeuroBook restart recovery 处理的是 Job 列表与 delivery：
   - terminal Job 重新进入列表；
   - running/waiting Job 变为 interrupted；
   - pending delivery 用 stable identity 重新进入 Harness follow-up queue；
   - `accepted=queued` 只触发 drain，不重复写用户消息。
3. 这些事实依赖 Workspace Root、Job 状态、delivery retry/clear policy 和产品 UI；它们不是一个 Agent Invocation 的 Session/Transcript/Workflow commit fact。
4. standalone 已提供可组合的通用原语：
   - `followUp()` / `followUpState()` / pause/cancel/reorder 与 durable owner/version CAS；
   - `messageIdentity: "system"` 与 caller provenance；
   - `createSession()`、`invokeAt()`、`write()`、`SessionEntryCodec` 组成 Workflow result writeback；
   - `CommitWorkflowScheduler` 只负责 commit 后 best-effort handler，不是 durable Job runtime。
5. standalone 明确不承诺 external exactly-once；重复回流、delivery identity、Job terminal result 与 Outbox/Lease 由宿主通过 Workflow/Adapter 组合。

## 决定

- 不把 NeuroBook 的 `deliveryId`/`clientMessageId`、Job durable file、deliveryStatus、Job recovery 或 clear-finished policy 搬入 Harness Core。
- 不新增 `enqueueDurableSystemFollowUp()` 之类的产品 API；宿主可用现有 system `followUp` + 自己的 durable delivery identity/去重 ledger 组合。
- 不修改 `Workflow`、`followUp`、Session durable shape 或 ADR；此前 ADR-0001 的 Cosmos Job/Lease/Outbox boundary 与 ADR-0009 的 anchored result writeback 继续有效。

## 可复核探针/对照

- NeuroBook source of truth：`docs/adr/0014-agent-job-durable-history.md`、commit `2e0c94a` 的 `enqueueDurableSystemFollowUp()` 与 `recoverDurableFollowUps()`。
- standalone source of truth：`src/harness.ts` 的 generic `followUp()`/queue controls、`src/workflow.ts` 的 commit scheduler、`tests/workflow-result-writeback.test.ts` 的 Memory/JSONL anchored writeback 与 duplicate/no-exactly-once boundary。
- 结论不是“Job history 已接入”，而是“已有 Core primitives 足够作为宿主 Job/Delivery 的组合底座，Job durable truth 仍留在宿主”。

## 未验证边界

真实 NeuroBook/Cosmos delivery、Workspace durable Job store、跨进程 delivery retry、Outbox/Lease、HTTP/SSE Job API、浏览器 Job history 与生产结果回流仍未验证。本轮不修改 NeuroBook/Cosmos，不 push、发布或部署。
