# NeuroAgentHarness 去领域化与能力演进

> Active task directory format: `NN-kebab-case-name/`. 本 Task 已建立；新 Goal 已于 2026-08-10 以 10,000,000,000 tokens 预算启动，第一百一十七轮已完成：workflowz 审计后的六项 Harness 整改、回归测试、全量门禁、独立复审和本地 checkpoint `06f706c` 均已收口。
>
> 第一百一十七轮后回到规划入口：继续优先寻找新的真实 consumer/provider/Transport 边界；没有新问题来源时不扩展 Core，也不把 deterministic consumer 测试外推为网络或产品验收。

## Relative documents refs

- [Task 协作规则](../README.md)
- [阶段进度简报（2026-08-10）](walkthroughs/2026-08-10-progress-brief.md)
- [第二十轮 Context lifecycle walkthrough](walkthroughs/2026-08-10-context-lifecycle.md)
- [第二十一轮 Prompt/continue lifecycle audit](walkthroughs/2026-08-10-prompt-continue-lifecycle.md)
- [第二十二轮 Invocation ownership acceptance](walkthroughs/2026-08-10-invocation-ownership-acceptance.md)
- [第二十三轮 ReadCapability acceptance](walkthroughs/2026-08-10-read-capability-acceptance.md)
- [第二十四轮 JSONL lock acceptance](walkthroughs/2026-08-10-jsonl-lock-acceptance.md)
- [第二十五轮 structured output consumer tracer](walkthroughs/2026-08-10-structured-output-consumer-tracer.md)
- [第二十六轮 failed turn event boundary](walkthroughs/2026-08-10-failed-turn-event-boundary.md)
- [第二十七轮 partial assistant contract audit](walkthroughs/2026-08-10-partial-assistant-contract-audit.md)
- [第二十八轮 Invocation result persistence and usage](walkthroughs/2026-08-10-invocation-result-persistence-and-usage.md)
- [第二十九轮 typed Model turn failure usage](walkthroughs/2026-08-10-typed-model-turn-failure-usage.md)
- [第三十轮 Pi Adapter consumer tracer](walkthroughs/2026-08-10-pi-adapter-consumer-tracer.md)
- [第三十一轮 terminal partial model output](walkthroughs/2026-08-10-terminal-partial-model-output.md)
- [第三十二轮 Workflow parent signal](walkthroughs/2026-08-10-workflow-parent-signal.md)
- [第三十三轮 cross-Harness follow-up admission](walkthroughs/2026-08-10-cross-harness-follow-up-admission.md)
- [第三十四轮 follow-up control CAS](walkthroughs/2026-08-11-follow-up-control-cas.md)
- [第三十五轮 reserved follow-up facts](walkthroughs/2026-08-11-reserved-follow-up-facts.md)
- [第三十六轮 bounded Event Subscription lifecycle](walkthroughs/2026-08-11-bounded-event-subscription-lifecycle.md)
- [第三十七轮 JSONL Session creation race](walkthroughs/2026-08-11-jsonl-session-creation-race.md)
- [第三十八轮 bounded Commit Workflow Scheduler shutdown](walkthroughs/2026-08-11-bounded-workflow-scheduler-shutdown.md)
- [第三十九轮 durable approval resume admission](walkthroughs/2026-08-11-durable-approval-resume-admission.md)
- [第四十轮 Snapshot Replay Cut](walkthroughs/2026-08-11-snapshot-replay-cut.md)
- [第四十一轮 Durable Event Causality Guard](walkthroughs/2026-08-11-durable-event-causality-guard.md)
- [第四十二轮 JSONL Recovery Scan Error Preservation](walkthroughs/2026-08-11-jsonl-recovery-scan-errors.md)
- [第四十三轮 Tool Call Identity Admission](walkthroughs/2026-08-11-tool-call-identity-admission.md)
- [第四十四轮 Session Status Ownership Invariant](walkthroughs/2026-08-11-session-status-ownership-invariant.md)
- [第四十五轮 Concurrent Interrupted Reconciliation](walkthroughs/2026-08-11-concurrent-interrupted-reconciliation.md)
- [第四十六轮 Harness Shutdown Join Barrier](walkthroughs/2026-08-11-harness-shutdown-join-barrier.md)
- [第四十七轮 Public Mutation Shutdown Admission](walkthroughs/2026-08-11-public-mutation-shutdown-admission.md)
- [第四十八轮 Prepared Tool Identity Admission](walkthroughs/2026-08-11-prepared-tool-identity-admission.md)
- [第四十九轮 Profile Version Approval Admission](walkthroughs/2026-08-11-profile-version-approval-admission.md)
- [第五十轮 Active Profile Steer Admission](walkthroughs/2026-08-11-active-profile-steer-admission.md)
- [第五十一轮 Canonical Schema Value Admission](walkthroughs/2026-08-11-canonical-schema-value-admission.md)
- [第五十二轮 Tool writePlans 批量 admission](walkthroughs/2026-08-11-tool-write-plan-batch-admission.md)
- [第五十三轮 plan 数组批量 admission](walkthroughs/2026-08-11-plan-array-batch-admission.md)
- [第五十四轮 JSONL delta + checkpoint 模式回归](walkthroughs/2026-08-11-jsonl-checkpoint-delta-mode.md)
- [第五十五轮 Aborted Invocation Error Redaction](walkthroughs/2026-08-11-aborted-invocation-error-redaction.md)
- [第五十六轮 Streaming ModelRuntime partial consumer tracer](walkthroughs/2026-08-11-streaming-model-runtime-partial-consumer.md)
- [第五十七轮 Event Cursor Epoch Admission](walkthroughs/2026-08-11-event-cursor-epoch-admission.md)
- [第五十八轮 EventHub 单事件大小与 Transport boundary audit](walkthroughs/2026-08-11-event-size-transport-boundary.md)
- [第五十九轮 Opt-in Read Tool Adapter](walkthroughs/2026-08-11-opt-in-read-tool-adapter.md)
- [第六十轮 Job history / Workflow feedback delivery boundary audit](walkthroughs/2026-08-11-job-history-delivery-boundary.md)
- [第六十一轮 Read Tool Adapter public surface audit](walkthroughs/2026-08-11-read-tool-surface-audit.md)
- [第六十二轮 Core-owned compaction admission](walkthroughs/2026-08-11-core-owned-compaction-admission.md)
- [第六十三轮 Session Entry parent reference admission](walkthroughs/2026-08-11-session-entry-parent-reference-admission.md)
- [第六十四轮 大 Session 图校验成本探针](walkthroughs/2026-08-12-session-graph-scale-bound.md)
- [第六十五轮 JSONL replay 图 admission 与 external-signal gate 补测](walkthroughs/2026-08-12-jsonl-replay-signal-gates.md)
- [第六十六轮 Session Invocation coherence admission](walkthroughs/2026-08-12-session-invocation-coherence.md)
- [第六十七轮 Approval fact coherence admission](walkthroughs/2026-08-12-approval-fact-coherence.md)
- [第六十八轮 invocationResultFromSnapshot 公开只读投影](walkthroughs/2026-08-12-invocation-result-projection.md)
- [第六十九轮 Session Fork API](walkthroughs/2026-08-12-session-fork-api.md)
- [第七十轮 Cosmos 编排消费切片 v2](walkthroughs/2026-08-12-cosmos-orchestration-consumer.md)
- [第七十一轮 SSE Transport 消费切片](walkthroughs/2026-08-12-sse-transport-consumer.md)
- [第七十二轮 message_committed 合同漂移修复](walkthroughs/2026-08-12-message-committed-event.md)
- [第七十三轮 事件发布点一致性审计](walkthroughs/2026-08-12-event-publisher-inventory.md)
- [第七十四轮 ADR-0035 acceptance 复审](walkthroughs/2026-08-12-adr-0035-acceptance.md)
- [第七十五轮 跨进程 fork/恢复证据](walkthroughs/2026-08-12-fork-recovery-process.md)
- [第七十六轮 跨进程 waiting 恢复与 resume 证据](walkthroughs/2026-08-12-waiting-resume-process.md)
- [第七十七轮 跨进程 waiting 控制面证据](walkthroughs/2026-08-12-waiting-control-process.md)
- [第七十八轮 跨进程 follow-up 注入与自动启动证据](walkthroughs/2026-08-12-follow-up-process.md)
- [第七十九轮 CHANGELOG 补录与对应审计](walkthroughs/2026-08-12-changelog-backfill-audit.md)
- [第八十轮 waitForInvocation 有界等待原语](walkthroughs/2026-08-12-wait-for-invocation.md)
- [第八十一轮 waitForFollowUpQueueDrain 有界排空等待](walkthroughs/2026-08-12-wait-follow-up-drain.md)
- [第八十二轮 model_event 发布路径运行时 smoke](walkthroughs/2026-08-12-model-event-publisher.md)
- [第八十三轮 host 错误事件运行时覆盖](walkthroughs/2026-08-12-host-error-events.md)
- [第八十四轮 follow_up_error 运行时覆盖](walkthroughs/2026-08-12-follow-up-error-event.md)
- [第八十五轮 tool_call_delta 流式事件运行时覆盖](walkthroughs/2026-08-12-tool-call-delta-event.md)
- [第八十六轮 compaction 运行时事件覆盖](walkthroughs/2026-08-12-compaction-events.md)
- [第八十七轮 follow_up_queued 正向运行时覆盖](walkthroughs/2026-08-12-follow-up-events.md)
- [第八十八轮 悬挂 Tool Call 启动闭合 admission](walkthroughs/2026-08-12-closed-tool-call-admission.md)
- [第八十九轮 followUp 默认 caller 对齐](walkthroughs/2026-08-12-follow-up-default-caller.md)
- [第九十轮 compaction 切分与二次压缩合同收口](walkthroughs/2026-08-12-compaction-splitting-contract.md)
- [第九十一轮 prepareWrites 可见性合同钉住](walkthroughs/2026-08-12-prepare-writes-visibility-contract.md)
- [第九十二轮 turn_end waiting 事件语义对齐](walkthroughs/2026-08-12-turn-end-waiting.md)
- [第九十三轮 follow-up 自动 pause（pausedBy）](walkthroughs/2026-08-12-follow-up-auto-pause.md)
- [第九十四轮 per-event 字节预算边界钉住](walkthroughs/2026-08-12-event-byte-budget-pinning.md)
- [第九十五轮 手动 compact（ADR-0037）](walkthroughs/2026-08-12-manual-compact-session.md)
- [第九十六轮 Cosmos 消费切片 v3](walkthroughs/2026-08-12-cosmos-consumer-v3.md)
- [第九十七轮 公开 API 面全面审计](walkthroughs/2026-08-12-public-surface-audit.md)
- [第九十八轮 InvocationError.phase stage 归因](walkthroughs/2026-08-13-run-stage-phase.md)
- [第九十九轮 NB 黑盒终态语义吸收](walkthroughs/2026-08-13-nb-terminal-parity.md)
- [第一百轮 Model contextWindow 窗口保护](walkthroughs/2026-08-13-model-context-window.md)
- [第一百零一轮 多角度规划（API/附件/自动注入）](walkthroughs/2026-08-13-multi-angle-planning-101.md)
- [第一百零二轮 appendEntries 便捷 API](walkthroughs/2026-08-13-append-entries-api.md)
- [第一百零三轮 prepareWrites 自动注入](walkthroughs/2026-08-13-prepare-write-auto-injection.md)
- [第一百零四轮 attachment 内容块 seam](walkthroughs/2026-08-13-attachment-content-blocks.md)
- [第一百零五轮 retry options 与错误面收敛](walkthroughs/2026-08-13-retry-api-errors.md)
- [第一百零六轮 公开 API 面再审计](walkthroughs/2026-08-13-public-surface-re-audit-106.md)
- [第一百零七轮 ADR-0038/0039/0040 升格](walkthroughs/2026-08-13-adr-acceptance-107.md)
- [第一百零八轮 SSE 帧序列化](walkthroughs/2026-08-13-sse-frame-serialization-108.md)
- [第一百零九轮真实 HTTP SSE Transport 边界](walkthroughs/2026-08-13-sse-http-transport.md)
- [第一百一十轮 Context settlement 与 Cosmos-style Agent Action](walkthroughs/2026-08-13-context-settlement-cosmos-action.md)
- [第一百一十一轮安装后 package consumer](walkthroughs/2026-08-13-installed-package-consumer.md)
- [第一百一十二轮动态 Profile context delivery parity](walkthroughs/2026-08-13-profile-context-delivery-parity.md)
- [第一百一十三轮 NeuroBook SSE/EventHub/recovery 合同审计](walkthroughs/2026-08-13-neurobook-sse-recovery-contract-audit.md)
- [第一百一十四轮 NeuroBook partial/interruption 与宿主展示投影边界](walkthroughs/2026-08-13-neurobook-partial-projection-boundary.md)
- [第一百一十五轮 Profile/Model replacement 与 retry 语义](walkthroughs/2026-08-13-profile-model-replacement-retry.md)
- [第一百一十六轮 llmlint consumer acceptance](walkthroughs/2026-08-14-llmlint-consumer-acceptance.md)
- [第一百一十七轮 审计整改与 Harness 生命周期收口](walkthroughs/2026-08-14-audit-remediation.md)
- [Harness 文档索引](../../README.md)
- [Architecture](../../architecture.md)
- [NeuroBook extension study](../../neuro-book-extension-study.md)
- [Pi adapter design](../../pi-adapter-design.md)
- [NeuroAgentHarness Context](../../../CONTEXT.md)
- [ADR-0001: Cosmos consumer boundary and Workflow ownership](../../adr/0001-cosmos-consumer-workflow-boundary.md)
- [ADR-0002: Strict Workflow Invocation Anchor](../../adr/0002-workflow-invocation-anchor.md)
- [ADR-0003: Provider-Neutral Context Sections](../../adr/0003-provider-neutral-context-sections.md)
- [ADR-0004: JSONL cross-process commit lock](../../adr/0004-jsonl-cross-process-commit-lock.md)
- [ADR-0005: Per-turn Context Provider Resolution](../../adr/0005-per-turn-context-provider.md)
- [ADR-0006: Host-Neutral Read Capability Contract](../../adr/0006-host-neutral-read-capability.md)
- [ADR-0007: Invocation Ownership Fence](../../adr/0007-invocation-ownership-fence.md)
- [ADR-0008: Bounded Abort and Terminal Completion](../../adr/0008-bounded-abort-terminal-completion.md)
- [ADR-0009: Workflow Anchored Result Writeback](../../adr/0009-workflow-anchored-result-writeback.md)
- [ADR-0010: Provider-Neutral Model Context Appending](../../adr/0010-provider-neutral-model-context-appending.md)
- [ADR-0011: Caller and Durable Message Identity](../../adr/0011-caller-message-identity.md)
- [ADR-0012: Durable Context Contribution Entry Boundary](../../adr/0012-durable-context-contribution-entry.md)
- [ADR-0013: Failed Turn Runtime Event Boundary](../../adr/0013-failed-turn-runtime-event-boundary.md)
- [ADR-0014: Invocation Result Persistence and Durable Usage](../../adr/0014-invocation-result-persistence-and-usage.md)
- [ADR-0015: Typed Model Turn Failure Usage](../../adr/0015-typed-model-turn-failure-usage.md)
- [ADR-0016: Terminal Partial Model Output Fact](../../adr/0016-terminal-partial-model-output.md)
- [ADR-0017: External Invocation Abort Signal](../../adr/0017-external-invocation-abort-signal.md)
- [ADR-0018: Reserved Follow-up Coordination Entries](../../adr/0018-reserved-follow-up-coordination-entries.md)
- [ADR-0019: Bounded Event Subscription Lifecycle](../../adr/0019-bounded-event-subscription-lifecycle.md)
- [ADR-0020: JSONL Cross-process Session Creation](../../adr/0020-jsonl-cross-process-session-creation.md)
- [ADR-0021: Bounded Commit Workflow Scheduler Shutdown](../../adr/0021-bounded-commit-workflow-scheduler-shutdown.md)
- [ADR-0022: Durable Approval Resume Admission](../../adr/0022-durable-approval-resume-admission.md)
- [ADR-0023: Snapshot Replay Cut](../../adr/0023-snapshot-replay-cut.md)
- [ADR-0024: Durable Event Causality Guard](../../adr/0024-durable-event-causality-guard.md)
- [ADR-0025: Tool Call Identity Admission](../../adr/0025-tool-call-identity-admission.md)
- [ADR-0030: Canonical Schema Value Admission](../../adr/0030-canonical-schema-value-admission.md)
- [ADR-0031: Aborted Invocation Error Redaction](../../adr/0031-aborted-invocation-error-redaction.md)
- [ADR-0032: Event Cursor Epoch Admission](../../adr/0032-event-cursor-epoch-admission.md)
- [ADR-0033: Opt-in Read Tool Adapter](../../adr/0033-opt-in-read-tool-adapter.md)
- [ADR-0034: Store Commit Cancellation Fence](../../adr/0034-session-commit-cancellation-fence.md)
- [ADR-0036: Session Fork API](../../adr/0036-session-fork-api.md)
- [ADR-0037: Manual Compact Session](../../adr/0037-manual-compact-session.md)
- [ADR-0038: Model Context Window Protection](../../adr/0038-model-context-window-protection.md)
- [ADR-0039: Prepare Write Auto-Injection](../../adr/0039-prepare-write-auto-injection.md)
- [ADR-0040: Attachment Reference Content Blocks](../../adr/0040-attachment-reference-content-blocks.md)
- [ADR-0041: First-party SSE Frame Serialization](../../adr/0041-sse-frame-serialization.md)
- [ADR-0026: Harness Shutdown Admission](../../adr/0026-harness-shutdown-admission.md)
- [ADR-0027: Prepared Tool Identity Admission](../../adr/0027-prepared-tool-identity-admission.md)
- [ADR-0028: Durable Profile Version Approval Admission](../../adr/0028-profile-version-approval-admission.md)
- [ADR-0029: Active Profile Steer Admission](../../adr/0029-active-profile-steer-admission.md)

## User Request / Topic

- 建立 `neuro-agent-harness` 的长期自主开发入口，重点关注去领域化、解耦和测试。
- TSX Profile 可以继续去领域化并逐步吸收到 Harness；其上下文管理能力值得复用。
- sidecar 不进入 Harness 核心；旁路 Agent 优先通过 Workflow 组合。
- Harness 可继续去领域化，并评估常用 `read` 工具和 SSE 能力。
- NeuroBook Harness 已继续演进；独立库可能落后，两者行为不能默认一致。
- Cosmos 当前优先直接使用 `pi-ai`；Harness 稳定后再评估切换。
- Cosmos 的 SQLite、Prisma 和其它基础设施选型保持可逆。

## Goal

在 `neuro-agent-harness` 中持续自主探索和开发库本身，按以下循环推进：

```text
规划（可派发多角度只读调研）
  -> 计划任务（必要时记录 ADR）
  -> 执行
  -> 记录 walkthrough
  -> 收尾
  -> 审查
  -> 修复并回到规划，或结束
```

目标不是一次性完成所有迁移，而是在保持 standalone Core 宿主无关的前提下，持续识别并实现高价值、可逆的解耦增量：

1. 优先评估 TSX Profile 上下文管理能力的去领域化 seam；
2. 其次验证 Workflow 是否足以承载旁路 Agent，sidecar 不进入 Core；
3. 只有在合同足够通用、权限边界清楚且测试可证明时，才实现 `read` 或 SSE Adapter；否则保留设计结论；
4. 保持 NeuroBook 与独立库的行为差异可见，不假设两者已经兼容；
5. 让 Cosmos 在 Harness 稳定前继续直接使用 `pi-ai`，不提前制造强制迁移；
6. 保持 SQLite、Prisma、Transport 和其它基础设施选择可逆。

### 完成证据

- 至少完成一个可运行的 code + test vertical slice；最多引入两个相关的公开合同增量；
- 受影响的公开类型、导出、实现、行为/恢复测试和设计文档保持一致；
- `bun run verify` 通过；公开包边界变化时追加 `bun run pack:smoke`；
- focused、全量、包 smoke、浏览器/产品验收（适用时）分别报告；
- Task walkthrough 记录每轮的依据、变更、验证、未验证项、绕道、审查结果和下一步。

### 边界与阻塞停止

- 只修改 `neuro-agent-harness`，保留已有 dirty worktree；
- 允许创建任务范围内的本地 checkpoint commit；不 push、不发布、不部署、不跨仓库修改，不做真实生产操作；
- 需要产品取舍、真实 provider/消费者、外部权限或不可逆设计时停止并报告，不用猜测替用户决定；
- 没有安全、可逆且能被测试证明的下一步时，记录已尝试路径和阻塞，结束本轮。

### 运行方式

- 不设固定截止时间；持续到用户停止、Goal 完成或满足阻塞停止条件。
- 每轮必须产生一个可验证的代码、测试或文档增量，或记录一份明确、可复核的阻塞证据；不能只重复尝试。
- 用户已授权新增依赖和 spike，但采用前必须记录理由、替代方案、验证结果和回退成本。

## Current State

- 2026-08-07 已建立本 Task 并补齐 Task/Goal 协作流程；第一阶段第十九轮收口后曾暂停。用户于 2026-08-10 重新创建 10,000,000,000 tokens Goal，当前状态为 `active`。
- 第二十二至二十四轮已分别接受 standalone Invocation ownership fence、shape-only ReadCapability 和 Windows local filesystem / commit-only JSONL lock；checkpoints 为 `494b51c`、`5607c06`、`172e599`。
- 第二十五轮动态结构化 output consumer tracer checkpoint 为 `a9d95df`；现有 `PreparedRun.tools + ToolResult.output + Profile.output` 足以表达宿主动态 completion，不新增 Core API。
- 第二十六轮补齐 failed turn runtime boundary，并修复 terminal Store 未确认时伪造 `agent_end` 的既有 P1；第二十七轮完成 partial assistant/provider throw 合同审计，checkpoint 为 `d13aa83`。
- 第二十八轮新增 `InvocationResult.persistence`、append-only terminal usage fact、canonical `invocationUsage()` 和 cleanup reconciliation；ADR-0014 已在 standalone Core 范围接受。
- 第二十九轮新增 typed `ModelTurnError`、duplicate-package stable brand 和失败 turn usage 聚合；cooperative/forced abort winner 已有回归，ADR-0015 已在 standalone Core 范围接受。
- 第三十轮完成无依赖 Pi-like Adapter consumer tracer：现有公开 seam 足以映射两 turn + Tool、thinking/delta、error event + rejected result、iterator throw 和 cooperative abort；没有新增 Core API 或 Pi dependency。
- 第三十一轮已实现 text/thinking-only `ModelTurnError.partial`、独立 terminal partial fact、`InvocationResult.partial` 与 Snapshot projection；focused/full/package smoke 和两轮独立审查已通过，ADR-0016 已接受。
- 第三十二轮已实现 `InvokeRequest.signal` / inherited `InvokeAtRequest.signal`：覆盖 pre-start、start-commit admission window 与 Capability-open fence，并复用 bounded abort；focused/full/package smoke 与 post-fix 独立审查已通过，ADR-0017 已在 standalone Core 范围接受。
- 第三十三轮已把 durable follow-up admission 从本进程 `active` Map 切到 Store Snapshot owner，并用 owner CAS 拒绝 terminal race；双 Harness running/waiting、孤立 queue focused、全仓门禁与独立审查均已通过。
- 第三十四轮已为 cancel/reorder 增加 observed-version CAS，修复 admission 先赢后控制请求仍返回成功的竞态；顺序 TDD、focused、全仓门禁与独立审查均已通过。
- 第三十五轮已将 `harness.followUp.*` 收口为 Core-owned namespace；host write 与 Profile/Tool effect 共用的 commit seam 不能伪造 coordination facts，legacy fixture、全仓/包门禁和独立审查均已通过。
- 第三十六轮多角度规划确认 NeuroBook relation recovery/Job history 与 Cosmos durable Workflow 仍属于宿主；standalone 已实现 bounded Event Subscription lifecycle。首次独立审查发现并复现并发 `next()` 覆盖旧 waiter 的 P1，FIFO/close 全结算修复及 focused/full/package 已通过；post-fix 审查无 P0/P1/P2。ADR-0019 已在 standalone Core 范围接受。
- 第三十七轮三路规划没有发现新的 NeuroBook portable gap 或 Cosmos Core API 缺口；公开探针确认 JSONL 自动/显式 Session 创建在两个 Store 间会重复成功、覆盖或损坏。sequence/per-session lock、strict fail-closed、`wx` 和 Bun/Node process 回归已完成，full/package 与独立审查通过；ADR-0020 已在 Windows 本地文件系统、第一方 allocate/create 范围接受。
- 第三十八轮修复 `CommitWorkflowScheduler.dispose()` 对不合作 `run` / `onError` 的无界等待；内部审查与首次独立 review 分别发现 forced-boundary listener 泄漏和 abort-listener 重入 Promise identity 两个 P1，均有 public red/green。最终 full/package 与 post-fix review 通过，ADR-0021 已在 standalone Scheduler lifecycle 范围接受。
- 第三十九轮对齐 NeuroBook 的并发 resolution claim 行为：approval `resume()` 在 Tool 前以 durable owner/version CAS claim，Memory/JSONL 跨 Harness contender 只有一个执行者。重复 resolution ID、prepare Snapshot 回归和 durable running abort race 均已修复；full/package 与 post-fix review 通过，ADR-0022 已在 standalone Harness approval-admission 范围接受。
- 第四十轮对齐 NeuroBook recovery cut：`snapshot()` / `write()` / `createSession()` 的 cursor 不晚于返回 Session projection，Snapshot + replay 允许 overlap 但不再静默跳过窗口内 durable event。三类 public red、full/package 与独立审查通过，ADR-0023 已在 standalone HarnessSnapshot recovery-cut 范围接受。
- 第四十一轮修复 shared EventHub durable publication 的 Store/generation/version 因果混流、partial batch 和 creation fence 竞态；五次独立审查后的 full/package gate 通过，ADR-0024 已在 standalone in-process durable-publication 范围接受。
- 第四十二轮修复 JSONL recovery scan catch-all；只有缺失 `sessions` 目录返回空恢复集，其它 errno 原样上抛。focused/full/package 和独立审查通过，checkpoint 为 `d748fc9`。
- 已完成 Cosmos 风格 consumer fixture、strict `invokeAt({anchor})`、Context sections/per-turn Provider、JSONL per-session commit lock、host-neutral `ReadCapability`、Invocation ownership/有界 abort、Workflow 结果回写、`modelContextAppending` 以及 durable message identity/follow-up recovery。
- 当前 29 个 ADR 已在各自限定范围接受：0001、0002、0003、0004、0005（A1）、0006、0007、0008、0009、0010、0011、0012、0013、0014、0015、0016、0017、0018、0019、0020、0021、0022、0023、0024、0025、0026、0027、0028、0029。
- ADR-0028 已在 standalone Profile Version approval-admission 范围接受；Profile Version approval admission 的最终 focused/full/package 与三路合并窄复审均已通过。
- ADR-0029 已在 standalone Active Profile steer-admission 范围接受；active v1 attempt 与 current v2 Registry 的 steer parser 撕裂已完成 public TDD、三个 test-sensitivity P2 返修、最终 full/package 与三路窄复审。
- 第五十一轮已收口 Canonical Schema Value Admission：raw decode 与 durable Parsed Value validation 已分离，17 条 public regression、focused 43/0/138、全仓 305/0/1395 和 package smoke 均通过；test-sensitivity 的四个 P2 与 pack tracer 的 generic P2 已返修，post-fix 三路窄复审均无 P0/P1/P2，ADR-0030 已在 standalone Core canonical-value admission 范围接受。
- 第五十二轮已收口 Tool writePlans 批量 admission：multi-plan 先整批通过 commit 守卫与纯投影校验再逐 plan CAS 提交，plan 内部非法不再产生孤儿 durable 写入；6 条 public red→green、focused 49/0/206、全仓 311/0/1402 均通过，三路窄复审无 P0/P1/P2，不新增 public API、durable shape、ADR 或依赖。
- 第五十三轮已收口 plan 数组批量 admission：`commitWritePlans` 复用到 Profile `prepareWrites` 与全部 hook effect `writePlans`（prepareRun/beforeTurn/afterTurn/settleRun/settleFailure），同一"先整批校验、后逐 plan CAS"合同；8 条 public red→green、focused 51/0/223、全仓 319/0/1410 均通过，三路窄复审无 P0/P1/P2，不新增 public API、durable shape、ADR 或依赖。
- 第五十四轮已收口 JSONL delta + checkpoint 实验模式回归：`checkpointEvery > 1` 首次获得 11 条公开测试（交替恢复、torn 尾修复、reconcile、跨模式/跨实例读取、entry ID 与 version 连续性 fail-closed、非法参数构造拒绝）；探针与测试均未发现生产缺口，本轮为测试 + 文档增量，不新增 public API、durable shape、ADR 或依赖。
- 第五十五轮已收口 Aborted Invocation Error Redaction：新的 aborted terminal 不再持久化取消实现细节，local cooperative result 保留诊断，failed/completed 不变，legacy aborted projection 隐藏旧 error；5 条 public red→green、focused 64/0/238、全仓 335/0/1452、pack smoke 均通过，ADR-0031 已接受。
- 第五十六轮已收口 Streaming ModelRuntime partial consumer tracer：用 test-only provider-neutral runtime 模拟 stream delta 后 abort exception，证明现有 `onEvent` + `ModelTurnError.partial` + `invocationPartial()` seam 足够，无 Core API/生产代码变更；1 条 consumer tracer、focused 41/0/177、全仓 336/0/1453、pack smoke 均通过。
- 第五十七轮已收口 Event Cursor Epoch Admission：正数 `after` 缺少 `eventEpoch` 时 EventHub fail closed 为 Snapshot recovery，`after: 0`/空 cursor 兼容；2 条 public red→green、focused 23/0/74、全仓 338/0/1457、pack smoke 均通过，ADR-0032 已接受。
- 第五十八轮已收口 EventHub 单事件大小与 Transport boundary audit：探针证明现有 replay/live serialized-byte budgets 已能把超大事件导向 Snapshot/queue_overflow recovery；NeuroBook `maxEventBytes` 依赖 SSE frame 编码，保留在 Transport/Job 层，不新增 Core API/ADR/生产代码。
- 第五十九轮已收口 Opt-in Read Tool Adapter：新增显式 Capability-bound `createReadTool` factory，复用基础 reference/offset/limit schema 与 ReadResult details mapping，不创建全局 token/默认注册/文件系统策略；3 条 public red→green、focused 5/0/30、全仓 341/0/1469、pack smoke 均通过，ADR-0033 已接受。
- 第六十轮已收口 Job history / Workflow feedback delivery boundary audit：确认 durable Job history、delivery identity、pending delivery retry、Job restart recovery、Outbox/Lease 与 HTTP/SSE DTO 继续属于 NeuroBook/Cosmos 宿主层；不新增 Core API、ADR、依赖或测试。
- 第六十一轮已收口 Read Tool Adapter public surface audit：交叉核对 root export、实现、声明类型、Bun/Node package consumer、README/CHANGELOG/CONTEXT、ADR-0006/0033 与 Task 索引；无遗漏或冲突，不新增代码、public API、ADR 或依赖。复用第五十九轮的 focused/full/package smoke 证据；真实消费者、文件权限和产品 UI 仍未验证。
- 第六十二轮先收口 Core-owned `agent.compaction` admission，随后由独立审查发现 abort 与异步 Store commit 的真实 P1；修复扩展为 runtime-only `SessionCommitOptions.signal`、durable `aborting` overlay 下的 late-plan rejection，以及 `aborting` owner 的 restart→aborted recovery。新增 ADR-0034，不改变 durable Snapshot shape；公开 `write()` 接受不存在 `parentId` 的 P1 仍保留为下一候选。
- 第六十三轮已收口 Session Entry parent reference admission 与 abort 结算竞态：`assertSessionEntryGraph()` 在 shared reducer 投影边界拒绝悬挂/环/重复/空白 parent 与 ID；`aborting` 下 `persistence:"unknown"` 和同步 waiting abort 不再提前结算，由 forced abort boundary 收口；focused 26/0/87、全仓 359/0/1525、pack smoke 均通过，ADR-0035 保持 Proposed。
- 第六十四轮已收口大 Session 图校验成本探针：1000/10000 条 Entry 下 read/activeSessionPath/commit 近似线性（10k 时 13.29/2.79/12.96ms），无缓存必要；新增有界回归测试与探针脚本，无 `src/` 变更；全仓 360/0/1533、55 files。
- 第六十五轮已收口 JSONL 跨 record replay 图 admission 与 external-signal gate 补测：4 条 JSONL replay fail-closed gate（跨 record 重复 ID/同批重复/环/悬挂 parent）+ 2 条 signal waiting gate（结算前 bounded abort、结算后不保存 signal、durable cancel 走 harness.abort）；现有合同足够，无 `src/` 变更；全仓 366/0/1549、56 files。
- 第六十六轮已收口 Session Invocation coherence admission：`normalizeSessionSnapshot()` 读侧拒绝重复 Invocation ID、悬挂/terminal active owner、非 active running/waiting、无 active owner 的 running/waiting/aborting；与第四十四轮写侧 setStatus invariant 和第六十三轮 entry graph admission 同族；全仓 377/0/1568、57 files，pack smoke 通过。
- 第六十七轮已收口 Approval fact coherence admission：三路只读调查发现 waiting + 空/缺失 `pendingApprovals` 会静默绕过审批门禁直接执行 Tool（P1 安全洞），读侧与 reducer 写侧同时拒绝空/缺失 approvals、重复 toolCallId、非负整数外 turnCount 与 turnCount 回退，`resumeOnce` 对第三方 Store 防御性归一化；全仓 388/0/1586、57 files，pack smoke 通过。
- 第六十八轮已收口 `invocationResultFromSnapshot` 公开只读投影：宿主编排器跨进程恢复后无需复制 private 映射即可重建 `InvocationResult`（terminal/waiting，aborted error redaction 与 durable 恢复结果同规则），private `resultFromSnapshot`/`confirmedResult` 委托去重；全仓 396/0/1608、58 files，pack smoke（113 files、129.7 kB/613.3 kB）通过。
- 第六十九轮已收口 `forkSession` Session Fork API：从 active path 派生持久副本（复制 agent.message/宿主条目，丢弃 usage/partial/compaction/followUp 内部事实与 Invocation/approval/queue，剥离 invocationId 归属，parentSessionId 溯源），替代会踩保留 kinds/幽灵队列/compaction 断链的手工复制；ADR-0036 Proposed；全仓 402/0/1639、59 files，pack smoke 通过。
- 第七十轮已收口 Cosmos 编排消费切片 v2：真实消费者流程组合 `forkSession` + `invocationResultFromSnapshot` + 锚定回写 + 跨 Store 实例恢复，四条编排闭环全部由公开 API 表达，未暴露 Core 缺口；纯测试轮；全仓 404/0/1659、60 files；ADR-0036 升格 Accepted。
- 第七十一轮已收口 SSE Transport 消费切片：宿主侧 SSE 式交付循环（游标续传、snapshotRequired 恢复、overflow 重同步）全部由公开事件 seam 表达，帧编码留在宿主侧；NeuroBook parity 扫描确认 08-08 后无新提交；发现 `message_committed` 声明但未发布的合同漂移（下一轮修复）；纯测试轮；全仓 407/0/1672、61 files。
- 第七十二轮已收口 `message_committed` 合同漂移修复：消息 durable 提交后统一发布 `{turn, message}`（user/assistant/toolResult/approval resume 全覆盖，attempt fence 约束；合同明确「仅 Harness 发起的提交发布」，宿主 write/prepareWrites/writePlans/forkSession 只经 session_entry 投递），公开合同从「声明未实现」变为「声明即实现」；全仓 413/0/1691、62 files，pack smoke 通过。
- 第七十三轮已收口事件发布点一致性审计：全部 21 个公开事件类型与发布点逐项对应（新清单 `docs/events-inventory.md` + 运行时 smoke）；审计发现并收窄 `snapshot_required.reason`（仅 `commit_order` 被发布，订阅期恢复由 connected 标志承担）；全仓 414/0/1703、63 files，pack smoke（113 files、132.0 kB/621.2 kB）通过。
- 第七十四轮已收口 ADR-0035 acceptance 复审：唯一残留 Proposed 升格 Accepted（standalone Core, first-party Memory/JSONL scope），保留条件（abort/waiting P1）收口与 64-73 证据链已回写 ADR 正文，索引补齐 0036；纯文档轮。
- 第七十五轮已收口跨进程 fork/恢复证据：真实 Node ESM 子进程完成运行后，主进程仅凭公开 API 投影终态、fork 会话并继续（补齐第七十轮 P2-2 进程边界组合）；纯测试轮；全仓 415/0/1712、64 files。
- 第七十六轮已收口跨进程 waiting 恢复与 resume 证据：子进程进入 durable waiting 后退出，主进程投影 waiting（含 pendingApprovals）、owner CAS resume 同一 Invocation 并完成、再 fork 继续；进程边界证据补齐 waiting 态恢复路径；抽公共 `process-test-utils` 复用两轮 worker 测试；纯测试轮；全仓 416/0/1725、65 files。
- 第七十七轮已收口跨进程 waiting 控制面证据：新进程 abort 另一进程的 durable waiting（durable owner CAS、模型不运行）与 approval 拒绝（Tool 不执行、isError 结果继续并完成）均由真实子进程覆盖；纯测试轮；全仓 418/0/1735、66 files。
- 第七十八轮已收口跨进程 follow-up 注入与自动启动证据：worker 在 durable waiting 期间入队 follow-up 后退出，主进程 resume 后 `watchFollowUps` 自动启动 follow-up Invocation 并完成（队列跨进程可见含 payload/caller、排空）；steer 确认内存态不适用跨进程；纯测试轮；全仓 419/0/1746、67 files。
- 第七十九轮已收口 CHANGELOG 补录与全量对应审计：0.1.0 之后 46 个 feat/fix 提交中 11 个无条目（含第六十三轮 parent admission、第六十二轮 compaction guard 与 ADR-0005~0013 时代提交），全部补录；Unreleased 现 48 条与 feat/fix 分支全量对应；纯文档轮。
- 第八十轮已收口 `waitForInvocation` 有界等待原语：以公开投影为判据的纯读侧轮询（terminal/waiting 返回、running/interrupted 继续、超时 `InvocationWaitTimeoutError` 携带最后状态、signal 中止、dispose 拒绝），消除宿主自写轮询样板并覆盖跨进程等待；全仓 428/0/1761、68 files，pack smoke 通过。
- 第八十一轮已收口 `waitForFollowUpQueueDrain` 有界排空等待：follow-up 链排空（active null + 队列空）返回，paused/waiting 视为稳定态返回，超时 `FollowUpDrainTimeoutError` 携带剩余项数与 active 状态；跨进程 follow-up-process 重构为直接使用；全仓 435/0/1776、69 files，pack smoke 通过。
- 第八十二轮已收口 `model_event` 发布路径运行时 smoke：真实形状 ModelRuntime 的 runTurn.onEvent 逐条转发为 model_event（顺序/turn/载荷断言），且不进入 durable transcript，补齐第七十三轮审计明示的覆盖缺口；events-inventory 行号校准；纯测试轮；全仓 436/0/1788、70 files。
- 第八十三轮已收口 host 错误事件运行时覆盖：失败注入 Store 触发 abort.request 持久化失败 → `abort_request_error` 发布且强制收口仍完成，CAS 类失败静默路径同样钉死；`follow_up_error` 保留代码审计；纯测试轮；全仓 438/0/1794、71 files。
- 第八十四轮已收口 `follow_up_error` 运行时覆盖：手工 JSONL 队列项 payload 被当前 Profile 拒绝 → 主运行完成后自动启动失败 → `follow_up_error` 发布、队列保留、不启动新 Invocation；host 事件全部类型完成运行时闭环；纯测试轮；全仓 439/0/1797、71 files。
- 第八十五轮已收口 `tool_call_delta` 流式事件运行时覆盖：五种 `ModelRuntimeEvent` 全部完成运行时覆盖（toolCallId/toolName/arguments 精确载荷，provisional 不触发 Tool 副作用）；另补 steer 正向 smoke（`steer_drained` 此前无任何断言）；纯测试轮；全仓 441/0/1804、72 files。
- 第八十六轮已收口 `compaction_start` / `compaction_end` 运行时事件覆盖：compactor 配置触发后断言两事件各发布一次、`tokensBefore` 精确为 3、`keptMessages > 0`、顺序为 compaction_start → compaction_end → 第二次 invoke 的 agent_end；runtime 12 类型全部完成运行时覆盖，事件发布点清单不再有「仅代码引用审计」的公开类型；纯测试轮；全仓 442/0/1812、73 files。
- 第八十七轮已收口 `follow_up_queued` 正向运行时覆盖：门控 invoke 期间入队 → 断言事件载荷与 durable 队列项一致（id/payload/caller/messageIdentity）、完成后自动启动携带同一 item id、消费后队列为空；session 事件全部类型完成正向或负向运行时覆盖，事件面覆盖闭环；NeuroBook parity 扫描确认 08-08 后无生产 Harness 变更可吸收；纯测试轮；全仓 443/0/1820、74 files。
- 第八十八轮已收口悬挂 Tool Call 的启动闭合 admission（NeuroBook parity 深度对照）：三路并行只读代理比对核心循环/compaction/identity 合同，选中 A/D1 P1——`startOnce` 在 startInvocation 落盘前对 idle Session 检查 `pendingToolCalls`，悬挂 call 使 invoke/invokeAt/retry/follow-up 启动显式失败（resume 不受影响），不再把未闭合 call 喂给 provider；legacy compaction guard 用例同步改为启动期拒绝（语义更强）；审查确认 guard 的其余公开入口已被启动 admission + resume exact-set 封死，保留为不可达的 legacy 防御；src 变更 + CHANGELOG/CONTEXT 同步；全仓 446/0/1829、75 files，pack smoke 通过。
- 第八十九轮已收口 `followUp()` 默认 caller 对齐（parity 代理 C/Jason 的 P1）：不带 `caller` 时缺省从 `{kind: "system", name: "followUp"}` 改为 `{kind: "user"}`（入队 + legacy drain 回退两处），与 `invoke()`/`retry()` 缺省一致并对齐 NeuroBook `normalizeInvokeCaller`——用户提交的 follow-up 不再对 hooks/Pi trace/授权呈现为 system；显式 system caller 透传不变；ADR-0011 补缺省记录（此前是静默选择）；全仓 446/0/1831、75 files，pack smoke 通过。
- 第九十轮已收口 compaction 切分与二次压缩合同（parity 代理 B/Hume 的 B 组）：5 条测试钉住二次压缩（previousSummary 传递、boundary 后切分、firstKeptEntryId 真实）、toolResult cut 前移（pair 不半截）、空窗口 skip、非法 settings 拒绝、悬挂 firstKeptEntryId fail-closed；C2 语义决策落盘（previous summary 计入预算，SA 更保守，与 NeuroBook 不同）；纯测试 + 文档轮；全仓 451/0/1856、76 files。
- 第九十一轮已收口 prepareWrites 可见性合同 + in-invocation compaction 索引错位修复（parity 代理 B/Hume 的 P3 + 审查 James P2-1）：判定「durable 贡献对 ContextProvider 与下一 Invocation 可见、当前 Invocation 需 context sections 重复提供」为合同并测试钉住；探针复现并修复 `compactIfNeeded` 用 work-copy 导致的索引错位（宿主贡献被投影丢弃 + 摘要消息重复保留），改用最新 Snapshot 对齐投影做触发/切分/摘要窗口；ADR-0012 新增可见性边界小节、CHANGELOG 新增 fix 条目；src + 测试 + 文档轮；全仓 453/0/1863、76 files，pack smoke 通过。
- 第九十二轮已收口 `turn_end waiting` 事件语义（parity 代理 C/Jason 的 E2）：进入 approval waiting 的 turn 以 `turn_end(turn, "waiting")` 闭合（原标 completed，与「工具待批、turn 未完成」不符），`turn_end.status` 联合类型增加 `"waiting"`；resume 后从下一 turn 以 completed 闭合；新增 turn-end-waiting 测试钉住 `waiting → completed` 序列（含 turn_end 恰 2 条加固）；events-inventory 全表行号按第九十二轮校准；全仓 454/0/1869、77 files，pack smoke 通过。
- 第九十三轮已收口 follow-up 自动 drain 失败 durable 自动 pause（parity 代理 C/Jason 的 F3）：`FollowUpQueueState.pausedBy {itemId, reason, message≤500 UTF-8 字节}` + `harness.followUp.paused` 事实扩展，自动 drain 失败后发布 `follow_up_error` 并自动 pause（CAS 对齐 cancel/reorder；宿主 cancel/reorder 后 resume；手动 resume 失败仍原样抛出）；另修 `test` 脚本 Windows 包装器停滞（默认改直接 `bun test --parallel=1`，`test:bounded` 保留）；全仓 456/0/1888、78 files，pack smoke 通过。
- 第九十四轮已收口 per-event 字节预算边界（parity 代理 C/Jason 的 E4）：核实 replay/live 序列化字节预算（默认 4 MiB / 1 MiB）已覆盖单事件路径（第 58 轮审计结论成立），补 2 条直接钉住测试（单事件超 live 预算 fail closed、单事件超 replay 预算 snapshotRequired）与 CONTEXT 条款；纯测试 + 文档轮；全仓 458/0/1891、78 files。
- 第九十五轮已收口手动 compact（parity 审计 C11 落地，ADR-0037 Proposed）：新增 `harness.compactSession(sessionId, {keepRecentTokens, instructions?, signal?})`——idle-only、复用自动压缩全部切分合同（对齐投影/pending 拒绝/walk-back/cut/skip/悬挂 fail-closed）、entry 无 invocationId、不发 invocation-scoped runtime 事件、signal 覆盖 read/summarize 阶段；抽取共享 `compactTranscript`（自动路径行为不变）、compaction fact 守卫放宽（allowed 仅 Harness 内部可设）；`CompactionRequest.instructions` 可选摘要提示；全仓 470/0/1920、79 files，pack smoke 通过。
- 第九十六轮已收口 Cosmos 消费切片 v3：`compactSession`（手动压缩 → fork 无 compaction 残留 → 分支回写）与 `pausedBy`（坏项自动 pause → cancel → 好项 resume → JSONL 重启恢复）在编排器流程中组合验证，公开 API 全部表达；ADR-0037 升格 Accepted（37 份 ADR 全 Accepted）；纯测试 + 文档轮；全仓 472/0/1938、80 files。
- 第九十七轮已收口公开 API 面全面审计：第 61 轮后新增 8+ 公开 API 全部交叉核对（root exports ↔ README ↔ CHANGELOG ↔ pack consumer）；pack-smoke 双 consumer 补 `compactSession` 检查、README 开发节修正（默认 test 已改直接串行）、follow-up 段补 pausedBy；无 `src/` 变更、无导出遗漏；全仓 472/0/1940、80 files，pack smoke 通过。
- 第九十八轮已收口 InvocationError.phase 的 stage 级归因（parity 审计 A/Boole 的 D2）：model（runTurn）/ingest（transcript 提交）/compaction/settleRun 失败分别得到对应 phase（对齐 NeuroBook RunKernelStageError；内部 RunStageError 保留 cause，SessionConflictError 的 retryable 语义不变），未包装阶段保持粗粒度 run；新增 run-stage-phase 6 条测试（含 beforeTurn fallback 与 ingest 内冲突的 name/retryable 继承）；src + 测试 + 文档轮；全仓 478/0/1954、81 files（工作区口径，含用户保护 tests/context.test.ts；提交范围口径 471/0/1903、80 files）、focused 60/0/243、8 files，pack smoke 通过。
- 第九十九轮已收口 NB 黑盒终态语义（NB black-box 25 场景矩阵映射）：failed/aborted 终态自动 durable 暂停 follow-up（pausedBy 新增可选 invocationId，reason "error"/"aborted"，队列空跳过；对齐 NB pauseFollowUps）+ tool throw=可恢复（显式 terminate 致命）分流、终态未消费 steer 不注入、强制取消后 settleRun 迟到写拒绝三条边界钉住；parity 源确认穷尽（NB server/agent 自 08-08 无新提交）；src + 测试 + 文档轮；全仓 485/0/1986、82 files（工作区口径，含用户保护 tests/context.test.ts；提交范围口径 478/0/1935、80 files）、focused 81/0/325、14 files，pack smoke 通过。
- 第一百轮已收口 Model contextWindow 窗口保护（parity C10）：ModelRuntime 新增可选 contextWindow（正有限数），声明且配置 ContextCompactor 时每轮模型调用前用 compactor.estimate 求和估计，超窗 fail closed（phase run，不发送请求）；未声明或无 compactor 跳过（Core 无内置 tokenizer）；ADR-0038 Accepted。interrupted 终态暂停候选否定（NB pauseFollowUps 的 "interrupted" 为死参数，无调用点），并以第 8 条 parity 测试钉住 SA 现状（显式 store.reconcileInterrupted 收口后队列未暂停、宿主可 resume）；src + 测试 + 文档轮；全仓 491/0/2007、83 files（工作区口径，含用户保护 tests/context.test.ts；提交范围口径 484/0/1956、82 files）、focused 104/0/423、18 files，pack smoke 通过。
- 第一百零一轮已收口多角度规划（纯规划轮，无 src 变更）：三路只读代理确定方向——A（API 形态）3 个非破坏改进候选（Store 合同文档化+合同测试随包、appendEntries/listSessionIds、retry 签名与错误面）、B（附件）最小 Core seam（attachment 引用块类型合同，blob/授权/hydration 留宿主）、C（自动注入）升级吸收但限定 prepareWrites 路径（NB 有测试钉住，Tool/hook writePlans 不吸收）；外部复核 NB 无新变更、Cosmos Task 06/07 走 nb-workflow 收敛无新 SA 缺口；第 102 轮执行 A-C2 + 文档偏差修复 + 「实现自定义 SessionStore」README 文档节，103 轮自动注入 ADR，104 轮 attachment seam。
- 第一百零二轮已收口 appendEntries 便捷 API（规划 A-C2 + C1 文档节 + (d) 偏差修复）：harness.appendEntries(sessionId, drafts, {cause?, expectedVersion?, expectedActiveInvocationId?}) 免手拼五层 SessionWritePlan（Core-owned kind 拒绝、空 drafts 拒绝）；JsonlSessionStore.listSessionIds() 重启枚举（严格十进制解析，reconcile 扫描同步收紧）；README 新增「实现自定义 SessionStore」节并修正 compactSession 前置条件、createAgentMessageEntryDraft 的 parentId 与根导出清单；纯新增 API + 文档轮；全仓 498/0/2023、84 files（工作区口径，含用户保护 tests/context.test.ts；提交范围口径 491/0/1972、83 files）、focused 84/0/384、10 files，pack smoke 通过。
- 第一百零三轮已收口 prepareWrites 自动注入（ADR-0039 Accepted，合同变更）：Profile prepareWrites 中的 agent.message 贡献在成功落盘后自动注入当前 Invocation 的模型请求（同轮可见、恰好一次、先于当前用户消息；resume 不重复；注入口径与 durable 投影共用 messageFromEntry）；Tool/hook writePlans 同轮注入不吸收、custom 事实不注入；双写消费方迁移（context-lifecycle test 2/4 改单源、test 5 改写新合同）+ 新增 auto-inject 范围钉住测试；ADR-0012/CONTEXT/README/CHANGELOG 同步；src + 测试 + 文档轮；全仓 500/0/2031、85 files（工作区口径，含用户保护 tests/context.test.ts；提交范围口径 493/0/1980、84 files）、focused 77/0/417、15 files，pack smoke 通过（首次停滞重试通过）。
- 第一百零四轮已收口 attachment 引用内容块最小 Core seam（ADR-0040 Accepted）：user content 扩为 string | readonly AgentUserContentBlock[]（attachment 块只含 {id, mimeType, bytes, name?} 引用），根导出 userMessageText marker 降级（不读 blob）；blob/授权/admission/hydration 留宿主；JSONL 零迁移；机械收窄 7 处测试 string 假设 + 2 处等价对象改写 + 新增 4 条 seam 钉住测试（JSONL 往返+投影/注入组合/fork+estimate/userMessageText）；类型 + 测试 + 文档轮；全仓 504/0/2047、86 files（工作区口径，含用户保护 tests/context.test.ts；提交范围口径 497/0/1996、85 files）、focused 79/0/420、13 files，pack smoke 通过。
- 第一百零五轮已收口 retry options+signal 与错误面收敛（规划 A 的 C3）：retry 接受 RetryOptions {caller?, messageIdentity?, signal?}（旧 caller+messageIdentity 重载兼容，signal 为 runtime-only 父取消、语义与 invoke 一致）；12 处公共 admission 裸 Error 改抛根导出的 HarnessAdmissionError（message 原文不变）；AbortBoundaryError/InvocationWriteFenceError 导出；waitForFollowUpQueueDrain 独立选项类型名；API 轮；全仓 508/0/2059、87 files（工作区口径，含用户保护 tests/context.test.ts；提交范围口径 501/0/2008、86 files）、focused 85/0/294、14 files，pack smoke 通过。
- 第一百零六轮已收口公开 API 面再审计（覆盖第 98-105 轮新增）：19 模块导出枚举与 README/CHANGELOG/CONTEXT 交叉核对无缺口；pack-smoke 双 consumer 扩展钉住新根导出（HarnessAdmissionError/AbortBoundaryError/InvocationWriteFenceError/userMessageText + RetryOptions/WaitForFollowUpQueueDrainOptions/AgentAttachmentRef/AgentUserContentBlock 类型）；审计/脚本轮，无 src/测试行为变更；pack:smoke 通过（prepack verify 508/0；tarball 113 files / 152.1 kB；Bun/Node consumer 新检查全过）。
- 第一百零七轮已收口 ADR-0038/0039/0040 升格 Accepted（standalone Core scope）：三份 ADR 的证据门禁均在第 100/103/104 轮通过独立审查，本轮补录验证数字与审查结果并升格；外部复核 NB/Cosmos 无新吸收项；纯文档轮（工作区口径，含用户保护 tests/context.test.ts 的前序未提交改动，未纳入本轮）；Task README 状态同步 + CHANGELOG 升格条目；40 份 ADR 全部 Accepted。
- 第一百零八轮已收口第一方 SSE 帧序列化（ADR-0041 Accepted）+ 公开入口覆盖收口：根导出 serializeSseEvent/serializeSseComment/serializeSseJsonEvent（WHATWG event-stream 帧，无 HTTP），第 71 轮消费切片改用本 helper；覆盖矩阵确认 22 个公开方法全部有测试钉住；src + 测试 + 文档轮；全仓 512/0/2074、88 files（工作区口径，含用户保护 tests/context.test.ts；提交范围口径 505/0/2023、87 files）、focused 47/0/164、8 files，pack smoke 通过（首次停滞重试通过）。
- 第一百零九轮已补真实 HTTP/SSE 宿主边界：Bun.serve worker + Node http driver 验证有限 SSE 首连全量、event/id/data 帧解析、eventEpoch/seq 一致性与 Last-Event-ID 续传只收新事件；没有新增 Core API、durable shape、依赖或 HTTP 服务实现；focused 1/0/3、typecheck 通过；最终全量与 pack smoke 数字见第 109 轮执行记录。
- ADR-0018 只保留 `harness.followUp.*` coordination facts，不锁死整个 `harness.*` namespace。
- 第三十轮 Pi consumer/typed error/result durability/abort/events focused 为 38 pass / 0 fail / 199 expect calls；`bun run verify` 为 158 pass / 0 fail / 805 expect calls，包含 typecheck、build 和 36 个测试文件。
- 用户/前序已有的 `docs/architecture.md`、`docs/pi-adapter-design.md` 与 `tests/context.test.ts` 继续受保护且未纳入本 Task checkpoints。
- 第一百一十六轮已完成真实 tracked llmlint 消费链验收：当前 `dist` 被 `../llmlint` 的 `@notnotype/neuro-agent-harness@0.1.0` 入口解析，七个消费者测试文件共 47 tests 全部通过，llmlint `typecheck` 通过；未修改消费者仓库。
- 本轮确认 Pi 类型、Prisma schema/事务、权限/HTTP 409、SSE DTO、MachineLlmReview 业务投影均留在 llmlint 宿主；Core 保持 provider-neutral、host-neutral。真实网络 Provider、产品/浏览器、Cosmos/NeuroBook 接入仍未验证。
- 第一百一十七轮已完成 workflowz 只读审查后的六项整改：approval claim→run reservation fence、EventHub staged FIFO reentrant dispatch、自动 compaction 的受限 follow-up-only CAS rebase、watcher stale 队首错误归因、fork Parsed initial validation，以及 Windows 默认 `test`/`verify` 入口恢复。新增红测先复现旧实现失败；最终聚焦为 145/0/534（13 files），默认测试为 529/0/2204（94 files），`bun run typecheck`、`bun run build`、`bun run verify` 均通过；合并 `verify && pack:smoke` 的 720 秒命令窗口曾在重复 prepack 阶段停滞，但随后单独重试 `bun run pack:smoke` 已通过，包含 prepack、tarball 安装和 Bun/Node ESM consumer smoke。本轮源码/脚本未改变公开导出或包 manifest。独立只读复审结论为 `No P0/P1/P2 findings`（confidence 0.84）。
- 本轮源码/测试/`package.json` 整改保持 Core provider-neutral、host-neutral，无公开 API、Pi/provider 依赖或 durable schema 变化；原有 `docs/architecture.md`、`docs/pi-adapter-design.md`、`tests/context.test.ts` dirty 内容继续保护，package 只调整批准的 `test`/`verify` 脚本。本地整改 checkpoint 已创建为 `06f706c`，提交不包含受保护 dirty 内容；`f1b8572` 为提交前最近一次提交。

## ADR / Decisions / Discussion

- **Core 边界**：NeuroBook、Nuxt、Prisma、Pi、provider、路径和 UI 通过 Adapter、Capability 或 Workflow 注入。
- **旁路 Agent**：sidecar 不是 Core 公共职责；先用 snapshot、write、createSession、invoke 和显式合并等 Workflow 原语组合。
- **模型运行时**：Cosmos 可继续直接使用 `pi-ai`；Harness 只定义 provider-neutral `ModelRuntime`，待合同稳定后再评估独立 Pi Adapter。
- **基础设施**：SQLite、Prisma、Transport 和桌面宿主保持可替换，真实验证不足时不提前固化。
- **代理协作**：规划可并行派发 API 形态、模块边界、迁移成本和测试缺口调查；执行与最终审查由一个集成负责人收敛。
- **状态落盘**：参考 `$night-audit` 的跨轮状态原则，但本 Task 不是只读巡检；每轮状态和证据必须回写 Task，实际代码写入仍受本 Goal 边界约束。
- **Checkpoint**：阶段性本地 commit 只保存已验证、任务范围内的完整增量；不把用户 dirty 改动或未审查 spike 混入提交。
- **首轮计划**：先执行 Cosmos consumer compatibility slice；TSX context、Workflow durable job port、read/SSE 和 NeuroBook bug parity 由该切片暴露的合同缺口与后续调研决定。
- **ADR-0001**：已在 deterministic consumer test 和独立审查完成后升格为 `Accepted`；未来新增 Job/Delivery port 仍需单独 ADR。
- **第二轮计划（Proposed）**：为旁路 Workflow 增加 `invokeAt(anchor)`，将 Snapshot 的 `version + activeLeafId` 作为显式调用锚点；不引入 sidecar、Job、Lease 或 HTTP/SSE。
- **第二轮实现语义**：`invokeAt` 只承诺 `invoke-if-current`，不承诺历史 inactive leaf 执行；anchor preflight 或 start CAS 失败统一使用带同一观察边界 version/leaf 诊断的 `SessionConflictError`，不通过重读的 `activeInvocationId` 猜测冲突来源。
- **第三轮计划（Proposed）**：新增 provider-neutral `ContextMessageSections`，把 `history → durable transcript → modelContext → appending` 变成可测试的请求组装合同；保留旧扁平 runtime messages 的兼容位置。
- **ADR-0002 acceptance**：strict `invoke-if-current` 已接受；anchor preflight、start CAS、同一 reducer 边界的 version/leaf 诊断、active Invocation 冲突和普通 `invoke()` 兼容均有 focused 与 JSONL 跨实例证据。历史 inactive leaf、`resume()`/`retry()`/compaction 中的持久化 anchor、网络文件系统 fencing 和真实宿主接入不在接受范围。
- **第四轮规划（Proposed）**：为第一方 `JsonlSessionStore.commit()` 增加跨进程 per-session lock，修复已复现的重复 version/恢复损坏窗口；不把 stale takeover、`allocateId()`、`create()` 或整个 JSONL Store 宣称为 process-safe。
- **第四轮实现边界**：锁目录通过原子 `mkdir` 竞争，owner 使用随机 token 和 heartbeat；锁覆盖 `read → reduce/CAS → append`，只释放自己的 owner 目录，默认不自动接管 stale lock。锁忙、结构损坏和所有权丢失保持为独立错误，不伪装成 `SessionConflictError`。
- **第五轮规划（Proposed）**：为 `PreparedRun` 增加只读 `contextProviders`，在每个 model turn 的最新 Snapshot 上重新解析，只把 `modelContext` 放入当前 provider request；不引入 History handle、AppendingSet settlement、Workspace、Job、SSE 或 NeuroBook 产品语义。
- **第五轮实现边界**：`contextProviders` 在 `beforeTurn` write plans 应用后按声明顺序串行解析；Provider 只返回当前 request 的 `modelContext`，失败在 model call 前结束 Invocation，不写入 Session。
- **第六轮实现边界**：Node ESM worker 由 Bun 临时 bundle、由 Node 进程执行；lock 在 owner 崩溃后 fail closed，晚释放只允许原 owner 删除自己的目录，busy/lost 不伪装成 `SessionConflictError`。仍不自动接管 stale lock。
- **ADR-0004（Accepted，Windows local filesystem / commit-only 范围）**：per-session lock 覆盖 `read → reduce/CAS → tail repair → append`；Busy/Corrupt/Lost/Io taxonomy 从 `storage/jsonl` 公开。默认不自动 stale takeover，人工清理前必须确认旧 owner 已终止；不宣称 syscall fencing 或整个 Store process-safe。
- **第七轮规划（Proposed）**：只定义 host-neutral `ReadCapability` 的 opaque reference、offset/limit、文本结果、provenance 和明确截断状态；不实现 `fs`、Workspace Root、默认 read Tool、图片、bash 或编辑能力。
- **ADR-0006（Accepted，standalone Core shape-only 范围）**：只接受 host-neutral request/result/interface 与既有 Invocation-scoped Capability 生命周期；offset 单位/起点、权限和结果一致性由宿主定义。Tool arguments/details 可以 durable，reference/provenance 不得携带 credential。Core 不提供全局 token、默认 Tool 或文件系统 Adapter。
- **SSE 边界审查（第七轮当时结论，第三十六轮由 ADR-0019 修订）**：cursor/envelope 继续属于 Core，HTTP/SSE encoder、socket backpressure、reconnect 和鉴权留在 Transport；Core 自己持有的 replay/live count、serialized-byte budget 与 subscription lifecycle 不能外推给 Transport。
- **ADR-0007（Accepted，standalone Core 范围）**：`SessionWritePlan.expectedActiveInvocationId` 提供 durable owner CAS；每次 `start()`/`resume()` 建立不可复用 attempt，取消先失效 attempt，再由 post-await fence 隔离迟到 Model/Tool/Hook/ContextProvider/Compactor/Approval/Capability 结果。同 Harness runtime event fence 已接受；跨进程 EventHub 不在范围内，bounded completion 由 ADR-0008 负责。
- **ADR-0008（Accepted，standalone Core 范围）**：为非合作式取消增加可配置 grace 和一次性 completion boundary；强制 durable `aborted` finish 后释放 admission、resolve `result()`、发布唯一 terminal `agent_end`，迟到 raw Promise 只允许后台结束，不再等待或写入。跨进程 EventHub 和真实消费者接入另行验收。
- **ADR-0009（Accepted，standalone Core 范围）**：Workflow 结果回写复用 `snapshot → createSession → invokeAt → write` 和 `SessionEntryCodec`；目标回写使用 `expectedVersion` / `expectedActiveLeafId`，不引入跨 Session 事务、自动 retry、幂等键或 exactly-once。
- **ADR-0010（Accepted，standalone Core 范围）**：只抽 provider-neutral 的 `modelContextAppending` 当前请求分区和顺序；不决定持久化，不搬入 TSX Reminder/Watch、ProfileRuntimeState 或 settlement。

## Verification / Test

### 已完成

- `git diff --check`：通过。
- 新增 Markdown 相对链接检查：通过。
- `bun test tests/jsonl-store.test.ts`：通过，9 tests / 0 failures / 39 expect calls；包含 Bun 与 Node ESM 子进程竞争、恢复和损坏 lock 回归。
- `bun test tests/jsonl-lock.test.ts`：通过，6 tests / 0 failures / 22 expect calls；包含 acquire 后 crash、busy fail-closed、owner 晚释放/fencing、人工删除 lock 后 ownership loss、幂等 release、owner 丢失和 corruption 分类。
- `bun test tests/workflow-agent-invocation.test.ts`：通过，7 tests / 0 failures / 34 expect calls；新增独立 JSONL Harness anchor 竞争和重启恢复回归。
- `bun run verify`：本轮通过，70 tests / 0 failures / 369 expect calls。
- 历史轮次 `bun run pack:smoke`：公开 API slice 曾通过；当时 `prepack` 的全量验证为 63 tests / 0 failures / 323 expect calls，Bun 与 Node ESM 包消费者检查通过，并编译检查 ReadCapability/ReadRequest。
- `git diff --check`：通过；仅有现有工作区的 LF/CRLF 转换警告。
- `bun test tests/invocation-ownership.test.ts tests/commit-observer.test.ts`：14 pass / 0 fail / 38 expect calls；覆盖 owner CAS、Memory/JSONL reconcile、取消/terminal 迟到结果和事件、Capability cleanup、旧 Harness ownership loss 及新 Harness retry。
- `bun run verify`：83 pass / 0 fail / 403 expect calls；TypeScript typecheck、build 和全仓 Bun 测试均通过。
- `bun run pack:smoke`：当前包 smoke 通过，包含 prepack 的 83 pass / 0 fail / 403 expect calls、tarball 安装、Bun consumer 和 Node ESM consumer 检查。
- `git diff --check`：通过；仅报告 Windows 工作区的 LF/CRLF 转换警告。
- ADR-0007 acceptance focused：`tests/invocation-ownership.test.ts`、`tests/abort-boundary.test.ts`、`tests/recovery.test.ts`、`tests/commit-observer.test.ts` 共 37 pass / 0 fail / 141 expect calls；独立 reviewer 单独复跑 ownership 文件为 19 pass / 0 fail / 55 expect calls。
- ADR-0007 acceptance 全仓：`bun run verify` 为 122 pass / 0 fail / 610 expect calls；本轮没有公共包变化，未重复 package smoke。
- ADR-0006 acceptance focused：`tests/read-capability.test.ts`、`tests/context-provider-capability.test.ts`、`tests/harness.test.ts` 共 13 pass / 0 fail / 63 expect calls；覆盖 request/result、durable transcript、通用 Tool error 与 Capability open/close。
- ADR-0006 acceptance 全仓：`bun run verify` 为 122 pass / 0 fail / 613 expect calls；`bun run pack:smoke` 通过，tarball 的 Bun 与 Node ESM TypeScript consumer 均通过。
- ADR-0004 acceptance focused：`tests/jsonl-store.test.ts`、`tests/jsonl-lock.test.ts`、`tests/jsonl-lock-crash-phases.test.ts`、`tests/recovery.test.ts` 共 27 pass / 0 fail / 140 expect calls；包含 partial-tail、Windows metadata/heartbeat `EBUSY`、Bun/Node 竞争与恢复。
- ADR-0004 acceptance 全仓：`bun run verify` 为 127 pass / 0 fail / 635 expect calls；`bun run pack:smoke` 通过且 prepack 同为 127/635，Bun/Node tarball consumer 验证公开 lock error exports。
- ADR-0014 acceptance focused：`tests/invocation-result-durability.test.ts`、`tests/persistence-events.test.ts`、`tests/abort-boundary.test.ts`、`tests/approval.test.ts`、`tests/invocation-ownership.test.ts` 共 48 pass / 0 fail / 205 expect calls。
- ADR-0014 acceptance 全仓：`bun run verify` 为 146 pass / 0 fail / 738 expect calls，覆盖 34 个测试文件并通过 typecheck/build；`bun run pack:smoke` exit code 0，Bun/Node tarball consumer 验证 `InvocationResult.persistence` 与 `invocationUsage()`。
- ADR-0015 focused：`tests/model-turn-error.test.ts` 为 8 pass / 0 fail / 36 expect calls；与 result durability、persistence event、abort、ownership 合并为 52 pass / 0 fail / 217 expect calls。
- ADR-0015 全仓：`bun run verify` 为 154 pass / 0 fail / 774 expect calls，覆盖 35 个测试文件并通过 typecheck/build；`bun run pack:smoke` exit code 0，Bun/Node tarball consumer 验证 `ModelTurnError`、options 与 `isModelTurnError()`。
- Pi-like Adapter consumer tracer：`tests/pi-adapter-consumer.test.ts` 为 4 pass / 0 fail / 31 expect calls；与 typed error、result durability、abort、events 合并为 38 pass / 0 fail / 199 expect calls。
- 第三十轮全仓：`bun run verify` 为 158 pass / 0 fail / 805 expect calls，覆盖 36 个测试文件并通过 typecheck/build。本轮没有生产 API 或 package 内容变化，未重复 `pack:smoke`。
- 第三十一轮 focused：partial/error/result durability/abort/Harness/compaction 共 57 pass / 0 fail / 259 expect calls；partial 文件单独为 13/0/51。
- 第三十一轮全仓：`bun run verify` 为 171 pass / 0 fail / 856 expect calls，覆盖 37 个测试文件并通过 typecheck/build。
- 第三十一轮 package：`bun run pack:smoke` exit code 0；prepack 同为 171/856，101-file tarball 的 Bun/Node ESM consumer 均验证 partial public API。
- 第三十二轮 focused：signal + Workflow anchor/branch/writeback/scheduler + abort/approval 为 34 pass / 0 fail / 152 expect calls；signal 文件单独为 5/0/18。
- 第三十二轮全仓：`bun run verify` 为 176 pass / 0 fail / 874 expect calls，覆盖 38 个测试文件并通过 typecheck/build。
- 第三十二轮 package：`bun run pack:smoke` exit code 0；prepack 同为 176/874，tarball 为 101 files / 95.3 kB / 462.1 kB unpacked，Node ESM consumer 编译检查 `InvokeAtRequest.signal`。
- 第三十三轮 focused：coordination、双 Harness admission、consume recovery、message identity、JSONL recovery 与 abort 为 34 pass / 0 fail / 173 expect calls；双 Harness 文件单独为 5/0/26。
- 第三十三轮全仓：`bun run verify` 为 179 pass / 0 fail / 888 expect calls，覆盖 38 个测试文件并通过 typecheck/build；无公开类型、导出、包入口或依赖变化，未重复 `pack:smoke`。
- 第三十三轮 post-fix 独立只读审查：`No P0/P1/P2 findings.`。
- 第三十四轮 focused：coordination、Memory/JSONL admission、consume recovery、identity、JSONL recovery 与 abort 为 36 pass / 0 fail / 179 expect calls；Memory admission race 文件单独为 4/0/14。
- 第三十四轮全仓：`bun run verify` 为 181 pass / 0 fail / 894 expect calls，覆盖 38 个测试文件并通过 typecheck/build；无公共包边界变化，未重复 `pack:smoke`。
- 第三十四轮 post-fix 独立只读审查：`No P0/P1/P2 findings.`。
- 第三十五轮 focused：reserved facts、coordination、Memory/JSONL admission、consume recovery、identity/legacy、JSONL recovery、Harness 与 ownership 为 54 pass / 0 fail / 231 expect calls；reserved 文件单独为 2/0/12。
- 第三十五轮全仓：`bun run verify` 为 183 pass / 0 fail / 906 expect calls，覆盖 39 个测试文件并通过 typecheck/build。
- 第三十五轮 package：`bun run pack:smoke` exit code 0；prepack 同为 183/906，tarball 为 101 files / 96.1 kB / 466.1 kB unpacked，Bun 与 Node ESM consumer 均通过。
- 第三十五轮 post-fix 独立只读审查：`No P0/P1/P2 findings.`。
- 第三十六轮首次独立审查发现 1 个 P1：并发 `next()` 覆盖旧 resolver，公开探针得到首个 Promise 永久 pending；无 P0/P2。红测为 19/1/68。
- P1 修复后 EventHub 单文件为 21 pass / 0 fail / 70 expect calls；events/turn failure/abort/ownership/Cosmos focused 为 59/0/225，typecheck 通过。
- P1 修复后全仓为 203/0/970，覆盖 39 个测试文件并通过 typecheck/build；package smoke exit code 0、prepack 同为 203/970，tarball 101 files / 99.5 kB / 482.7 kB unpacked。
- 第三十六轮 post-fix 独立只读审查复跑 EventHub 21/0/70 与 typecheck，返回 `No P0/P1/P2 findings.`；其 full verify 仅因 read-only sandbox 的 Bun `package.json` EACCES 未执行。

### 任务级门禁

- 每次实现先跑受影响的 focused tests，再跑 `bun run verify`。
- 修改公开包边界、导出或发布内容时追加 `bun run pack:smoke`。
- 本库无浏览器产品入口；只有发生 NeuroBook/Cosmos 消费者接入时才做对应浏览器或产品验收，不能用 focused 测试替代。
- 未运行的验证、环境阻塞和与本 Task 无关的基线失败必须单独列出。

## Implementation Walkthrough

### 阶段总览（截至 2026-08-10）

供快速判断的阶段成果、正式 ADR 状态、验证边界与恢复入口见 [阶段进度简报](walkthroughs/2026-08-10-progress-brief.md)。下文保留每一轮的完整规划、执行、绕道、审查和收尾证据。

### 2026-08-07：建立 Task 与协作规则

- 读取 NeuroBook 的 `docs/tasks/README.md`、`CONTRIBUTING.md` Task 规则和 active Task 样例。
- 确认当前 Harness 原有 `AGENTS.md` 只索引 `docs/tasks/<slug>.md`，没有规定编号目录、goal 前置条件、循环阶段和每轮证据回写。
- 新增本 Task 目录，并将 Task 协作规则放入 `docs/tasks/README.md`；`AGENTS.md` 只保留指针和短规则。
- 按用户要求先不启动 goal 循环，未修改 Harness 业务代码；随后由用户明确启动 Goal。

### 2026-08-07：确定自主开发 Goal 合同

- 用户明确 Goal 是库级自主探索开发，不是一次性功能交付；循环固定为“规划 → 计划任务/ADR → 执行 → walkthrough → 收尾 → 审查 → 回到规划或结束”。
- 将 TSX Profile context seam、Workflow 旁路 Agent、可选 `read`/SSE Adapter、NeuroBook 行为差异和 Cosmos 的 `pi-ai` 过渡列为有优先级的探索方向。
- 采用 `$night-audit` 的跨轮状态落盘和可恢复原则，但保留本 Goal 的写入能力与本仓边界；规划可并行派发只读代理，执行和最终审查由集成负责人收敛。
- 当时 Goal 尚未启动；本轮只完成合同和 Task 记录。之后已由用户明确启动 Goal。

### 2026-08-07：用户确认运行边界

- 用户确认允许公开 API 演进、独立 worktree、规划阶段多代理、新增依赖和 spike。
- 用户确认不设固定时间窗口；允许过程中的本地 checkpoint commit，但不自动 push、发布或部署。
- 用户要求继续调研 Cosmos 需求文档，并将 Workflow 是否进入 Harness 交给后续证据和 ADR 决定。
- “每轮最低成果”尚未单独指定，本 Task 暂按“至少一个可验证增量或明确阻塞证据”执行。

### 2026-08-07：规划首个实现切片

- NeuroBook 对照确认近期高价值差异集中在 durable Job/recovery/delivery 幂等、关联 Session 局部恢复和事件预算；这些不直接搬入 Core。
- Cosmos 需求确认 Agent 是普通 Flow Action，Cosmos 自己拥有 Flow/Job/Lease/Outbox/外部副作用；Harness 只提供 provider-neutral ports、Session/Invocation 和 Workflow 组合能力。
- 新增 ADR-0001（当时为 Proposed），首个执行目标确定为 Cosmos 风格 consumer compatibility slice。

### 2026-08-07：执行 Cosmos consumer compatibility slice

- 新增 `tests/cosmos-consumer-compatibility.test.ts`，用 Cosmos 风格的 `ModelRuntime`、Profile、JSONL SessionStore、受限 `read` Capability 和 `SessionEventHub` 完成一次 deterministic Agent Action。
- 测试覆盖结构化 `settleRun` output、Tool provenance、system caller provenance、JSONL 重启后的 Session/Invocation 恢复、cursor replay 和新 event epoch 下的 `snapshot_required`。
- 首次 focused 失败暴露了测试对普通 Tool `output` 跨 turn 保留的错误假设；未改动 Core 语义，改用现有 `settleRun` seam 从持久化 Tool result 生成结构化 output。
- 第二次因 `ToolDefinition` 的 `THostContext` 泛型和 `JsonValue` 收窄失败；显式绑定 `CosmosHostContext` 并收窄 `toolResult.content` 后修复。
- focused test 通过：1 test / 0 failures / 19 expect calls；完整 `bun run verify` 通过：39 tests / 0 failures / 188 expect calls。
- 本轮未修改 `src/`；ADR-0001 在独立审查完成后升格为 `Accepted`。

### 2026-08-07：独立审查与本轮收尾

- 独立审查确认 ADR-0001 的边界与 Cosmos 需求、当前 Workflow 原语和 NeuroBook 对照结果一致：Harness 提供 provider-neutral Agent/Session/Invocation/Capability/Workflow/Event seam；Cosmos 保留 Flow/Job/Lease/Retry/Outbox、外部副作用、Prisma/SQLite 和 HTTP/SSE DTO。
- 审查确认 sidecar 不应恢复为 Core API；现有 `snapshot → createSession/write → invoke → write` 组合足以作为下一轮旁路 Agent vertical slice 的候选基础。
- NeuroBook 的 durable Job、delivery 幂等和事件字节预算被记录为后续去领域化候选，但本轮不把产品 DTO、Job Store、Lease 或 SSE HTTP 实现搬入 Core。
- consumer slice 的 deterministic 测试、`bun run verify`、`bun run pack:smoke` 和文档边界均已核对；未验证真实 `pi-ai`、跨进程 Job、浏览器 SSE、Cosmos 实际接入和生产部署。
- ADR-0001 在完成独立审查和 consumer 证据后升格为 `Accepted`；本轮收尾，下一阶段回到规划。

### 2026-08-07：第二轮规划与任务计划

- NeuroBook 的 `HarnessAgentPort.invoke(sessionId, fromLeaf, opts)` 会在调用前恢复游标；其 Workflow 合同明确把游标锚定作为 F2，避免挂起期间直聊改变 active leaf 后把结果写错分支。
- 独立 Harness 当前 `invoke()` 只读取调用瞬间的 active leaf；已有 `snapshot()`、`write()`、`createSession()` 和 `invoke()` 可以手工组合，但不能把 Workflow 观察到的 Snapshot 作为启动前提传回 Harness。
- 规划代理建议新增窄的 `invokeAt({anchor: {version, activeLeafId}, ...})`。锚点不匹配时在 Invocation start commit 前失败；commit 竞态继续由 `expectedVersion` 提供乐观冲突保护。
- 本轮执行边界：新增一个 additive public request/method、一个冲突回归测试和必要文档；不改变现有 `invoke()`、`InvocationHandle`、Workflow scheduler、Store 持久化事实或宿主副作用。
- 已建立 [`ADR-0002`](../../adr/0002-workflow-invocation-anchor.md)（Proposed）；实现和独立审查通过后再升格为 Accepted。

### 2026-08-08：执行 strict Workflow Invocation Anchor

- 按第二轮计划新增 `InvocationAnchor`、`InvokeAtRequest` 和 `NeuroAgentHarness.invokeAt()`；`src/index.ts` 已通过 `export *` 暴露新增类型。
- `invokeAt` 在读取 Snapshot 后先校验 `version + activeLeafId`；anchored 路径不在 CAS 前用本地 active map 绕过提交保护。
- start commit 使用 anchor version 作为 `expectedVersion`，并传递 `expectedActiveLeafId`；Reducer 在同一串行/事务边界生成 `actualVersion` 和 `actualActiveLeafId`，不再通过事后读取拼接诊断。
- 同一 anchor 的并发启动由 Store CAS 保证最多一个成功；失败方保持 `SessionConflictError`，不把当前 `activeInvocationId` 误当作冲突来源。
- 新增 focused 行为测试覆盖成功调用、过期 anchor、读后写入、过期 anchor 优先级、同 anchor 并发 CAS，以及 CAS 失败后再次写入不产生跨版本诊断。
- 本轮没有修改 NeuroBook、Cosmos、Pi、Store durable schema、Workflow scheduler、HTTP/SSE 或 sidecar；未把 historical `fromLeaf` 语义偷换成当前 API。

### 2026-08-08：本轮验证与收尾状态

- `bun test tests/workflow-agent-invocation.test.ts`：5 pass / 0 fail / 21 expect calls。
- `bun run verify`：45 pass / 0 fail / 205 expect calls。
- `bun run pack:smoke`：上一轮公开 API slice 已通过；Context/SessionWritePlan 新公开合同的本轮 smoke 待重跑。
- `git diff --check`：通过。
- 未验证真实 NeuroBook/Cosmos 接入、真实 provider、跨进程 JSONL 竞争、historical branch recovery、浏览器/产品 SSE 和生产部署；这些不作为本轮完成证据。
- 截至该轮记录时 ADR-0002 在独立审查完成前保持 `Proposed`；后续已补齐独立 JSONL Store/Harness anchor 竞争与恢复测试，并在本轮 acceptance review 后只接受 strict `invoke-if-current`，historical anchor 另开规划。

### 2026-08-08：第三轮规划

- 对照 NeuroBook `ProfileTurnPlan` 和 TSX DSL，确认可去领域化的最小稳定能力是 context sections 的顺序，而不是 JSX、文件导入或提醒/观察状态。
- 当前 Harness 的 `PreparedRun.messages` 与 `RuntimeEffect.runtimeMessages` 都是扁平数组；它们不足以表达 `HistorySet`、`ModelContext`、`AppendingSet` 的边界。
- 建立 ADR-0003（Proposed），本轮实现纯消息 sections、请求组装和基础行为测试；不修改 Session 持久化、不引入新依赖、不实现 read/SSE。Context lifecycle 仍需补齐多 turn、旧 runtimeMessages 和 approval resume 证据。

### 2026-08-08：修复 Workflow anchor 的原子冲突诊断

- 审查发现 CAS 失败后通过事后 `store.read()` 重建错误，会把失败时的 `actualVersion` 与后续写入的 `actualActiveLeafId` 拼在一起。
- 新增可选的 `SessionWritePlan.expectedActiveLeafId`；Reducer 在 Store Adapter 的同一串行/事务边界内同时读取当前 version 和 active leaf，并构造 `SessionConflictError`。
- `invokeAt` 将 anchor leaf 传入 start plan；unanchored `invoke()` 保持原有前置互斥和 CAS 语义。
- 新增回归测试：CAS 失败后再发生一次写入时，错误仍报告第一次冲突的 version/leaf，而不会组合跨版本诊断。
- focused：5 pass / 0 fail / 21 expect calls；`bun run verify`：45 pass / 0 fail / 205 expect calls；独立审查和包 smoke 待本轮完成。

### 2026-08-08：Context sections provisional implementation

- 新增 provider-neutral `ContextMessageSections` 与 `composeContextMessages`，公开 `history → durable transcript → modelContext → appending` 顺序。
- `PreparedRun.context` 提供静态 sections，Hook `RuntimeEffect.context` 提供 prepare/before/after turn sections；既有扁平 `messages` / `runtimeMessages` 保留兼容位置。
- 当前基础 focused 测试通过；已知合同待定项是 `prepareRun` 在 approval resume 时不重放，且旧 `runtimeMessages` 的 resume 语义需要明确。
- ADR-0003 保持 `Proposed`，等待 lifecycle 回归测试、公开包 smoke 和独立审查。

### 2026-08-08：本轮审查、approval resume 与持久 active 冲突回归

- 全量验证首次被 `tests/context.test.ts` 中未覆盖 assistant `thinking` 分支的测试类型窄化阻断；只修正测试分支，未改变生产合同。
- 新增 Context approval-resume focused 测试：证明首轮 `prepareRun` context/runtime effect 出现一次，resume 不重放该 effect，`PreparedRun.context/messages` 重新建立，approval resolution 后进入新的 `beforeTurn`。
- 新增 Workflow anchor 测试：当前 anchor 仍匹配但 Session 已有持久化 active Invocation 时返回 `InvocationConflictError`；测试等待模型 turn 稳定后再取 anchor，避免把真实读后写竞态误判为测试失败。
- 独立 CAS 审查确认 strict anchor 实现、Reducer 同边界诊断和同实例并发行为正确；未验证跨 Store 实例/跨进程 JSONL CAS，因此 ADR-0002 不在本轮直接接受。
- 独立 Context 审查确认正常多 turn 顺序成立；approval resume 的不对称行为已有 focused 证据，但长期可重建合同仍未定案，因此 ADR-0003 保持 `Proposed`。
- 本轮未修改 NeuroBook、Cosmos 或用户已有 dirty 文档；read/SSE、historical branch recovery、跨进程锁仍留给后续规划。

### 2026-08-08：第四轮规划——JSONL 跨进程 CAS

- 独立只读 spike 在两个 Store 实例和多个子进程竞争时复现两个 writer 同时提交同一 version；后续 append 后会把问题从可忽略尾行升级为中间 version 不连续，确认这是 correctness blocker。
- 建立 ADR-0004（Proposed）：只锁住 `JsonlSessionStore.commit()` 的 per-session `read → reduce → append`，不引入 sidecar、Workflow、HTTP/SSE 或 Cosmos 变更。
- 先不自动 stale takeover；若不能证明 fencing，锁忙、锁损坏和锁丢失必须 fail closed，不能伪装成 `SessionConflictError`。
- 下一步执行最小 lock helper + 跨实例/子进程测试；`allocateId()`、显式 `create()` 冲突、网络文件系统和全 Store process-safe 另行处理。

### 2026-08-08：执行 ADR-0004 最小 lock vertical slice

- 按 TDD 先新增跨进程行为测试；在未加锁实现上，两个独立 Bun 子进程竞争同一 `expectedVersion` 可同时成功，红灯复现了原有 correctness 窗口。
- 新增内部 `src/storage/jsonl-lock.ts`：以 `<session>.jsonl.lock/owner.<random-token>/` 作为 per-session lock；`mkdir` 负责原子竞争，owner metadata 和 heartbeat 只用于所有权校验/诊断，不用于 stale takeover。
- `JsonlSessionStore.commit()` 保留现有进程内队列，并在其外层包住完整 `acquire → read → reduce/CAS → append → release`；新增锁忙、结构损坏和所有权丢失错误，未修改 `SessionStore` 公共接口或 JSONL record 格式。
- focused 结果：`bun test tests/jsonl-store.test.ts` 为 8 pass / 0 fail / 32 expect calls；当前直接检查单次 Bun 子进程竞争产生的 `[0, 1, 2]` version 序列、恢复到 version 2、有效非法尾记录、无残留 lock 和损坏 lock 不伪装 CAS 冲突；不外推为整个 JSONL Store 已 process-safe。
- 全量 `bun run verify` 为 52 pass / 0 fail / 240 expect calls；`bun run pack:smoke` 通过并完成 Bun/Node ESM 包消费者检查；`git diff --check` 通过。
- 未验证：Node 子进程竞争、进程在 lock 各阶段崩溃、owner 晚释放与 contender/fencing、自动 stale recovery、网络文件系统、`allocateId()`/`create()` 竞争和整个 JSONL Store 的 process-safe 语义。专项预审已完成，但 ADR-0004 的最终 acceptance review 尚未完成，仍保持 `Proposed`。

### 2026-08-08：第五轮规划——Per-turn Context Provider

- 对照 NeuroBook 当前 context 文档，确认 `HistorySet`、`ModelContext`、`AppendingSet` 和 CurrentUserInput 具有不同的持久化与恢复生命周期，不能直接合并为一个“动态上下文”开关。
- 建立 ADR-0005（Proposed）：规划 `PreparedRun.contextProviders`，每个 model turn 在 `beforeTurn` write plans 应用后基于最新 Snapshot 重新解析，只输出当前 request 的 `modelContext`。
- 明确 A1 不处理 `AppendingSet` 的历史写入/settlement，不重复调用 `Profile.prepare()`，不引入 Workspace、Reminder/Watch、History handle、Job、SSE、sidecar 或产品 DTO。
- 下一步执行最小 provider vertical slice：先补类型和失败/恢复/不持久化行为测试，再决定是否需要调整 Context sections 合成顺序。

### 2026-08-08：执行 ADR-0005 最小 Context Provider vertical slice

- `src/context.ts` 新增 `ContextProviderContext`、`ContextProviderResult` 和 `ContextProvider`；`PreparedRun.contextProviders` 只暴露 `modelContext` 结果。
- Harness 在 `beforeTurn` write plans 应用后，按 Provider 声明顺序基于最新 Snapshot 串行解析；结果只合并到当前 model request，不进入 durable transcript、下一 turn 或恢复后的旧 request。
- focused `bun test tests/context.test.ts`：6 pass / 0 fail / 35 expect calls；覆盖每轮 version 变化、Provider 顺序、approval resolution 后重新解析、不持久化和 model call 前失败。
- 全量 `bun run verify`：54 pass / 0 fail / 259 expect calls；`bun run pack:smoke` 通过，包消费者可导入新的 ContextProvider 声明；文档修改后的 `git diff --check` 通过。
- 未验证：真实 NeuroBook Profile 接入、Provider 外部 Capability 的实际权限边界、AppendingSet/History settlement、跨进程 Provider 状态、Node/浏览器/生产验收；ADR-0005 继续 `Proposed`。

### 回到规划：第六轮候选（2026-08-08）

- 最近 NeuroBook 的 `1c0a13d0` recovery 修复和 `2e0c94a6` durable Job 演进已写入 [`neuro-book-extension-study`](../../neuro-book-extension-study.md)：前者属于宿主关系/DTO 投影，后者属于 NeuroBook/Cosmos Job durable truth，均不扩大 Harness Core。
- 候选按优先级排序：
  1. **ADR-0004 lock robustness**：先补 Node 22+ 子进程、lock 各阶段崩溃、owner 晚释放/fencing、busy/lost 深度回归；这是现有 Core correctness 风险，验收条件已经明确。
  2. **ADR-0005 consumer/acceptance review**：用一个最小宿主 Profile fixture 复核 Provider 顺序、Capability 读取权限、approval/restart 边界；不把真实 NeuroBook 接入伪装成完成。
  3. **read Capability spike**：只做宿主注入的受限文件读取合同，先验证路径/权限/输出上限/错误分类，再决定是否提供常用实现；不把 Workspace Root 或 `fs` 直接带入 Core。
  4. **SSE Adapter spike**：复用已有 `SessionEventHub` cursor/replay 合同，评估 HTTP/SSE 适配层；不把 HTTP DTO、鉴权、heartbeat 或 Job delivery 放入 Core。
- 暂缓 historical inactive-leaf Invocation、通用 `AppendingSet` settlement 和 Job/Lease/Outbox；它们分别需要 branch recovery 或宿主 durable contract，当前不应和第六轮混合。
- 本机只读可行性检查为 Node `v24.13.0`、Bun `1.3.14`；第六轮已把 worker 临时 bundle 为 Node ESM 并补上 crash/fencing 基础证据。下一轮继续补 lock 各阶段崩溃，再决定是否接受 ADR-0004。

### 2026-08-08：执行 ADR-0004 Node/crash/fencing 基础回归

- 新增 `tests/fixtures/jsonl-commit-worker-node.ts`：由 Bun 临时 bundle，实际由 Node ESM 进程执行；两个 Node worker 竞争同一 `expectedVersion` 时只允许一个成功，恢复记录 version 序列为 `[0, 1, 2]`。
- 新增 `tests/fixtures/jsonl-lock-crash-worker-node.ts` 和 `tests/jsonl-lock.test.ts`：覆盖 owner 在 acquire 后退出、后续 commit fail-closed 为 `JsonlLockBusyError`；原 owner 晚释放不会删除 contender；owner token 丢失分类为 `JsonlLockLostError`。
- 新增 `tests/fixtures/jsonl-lock-phase-crash-worker-node.ts` 和 `tests/jsonl-lock-crash-phases.test.ts`：逐一覆盖 root、owner、metadata、heartbeat、append 之后立即退出；每个 phase 的 contender 都 fail-closed，append phase 的已落盘 Snapshot 仍可恢复。
- focused 结果：`bun test tests/jsonl-store.test.ts` 为 9 pass / 0 fail / 39 expect calls；`bun test tests/jsonl-lock.test.ts` 为 3 pass / 0 fail / 11 expect calls。
- focused phase matrix：`bun test tests/jsonl-lock-crash-phases.test.ts` 为 1 pass / 0 fail / 25 expect calls。
- 全量 `bun run verify` 为 60 pass / 0 fail / 304 expect calls；`bun run pack:smoke` 和最终 `git diff --check` 通过。
- 未验证：各 phase 内更细的系统级中断点、自动 stale recovery、网络文件系统和整个 JSONL Store process-safe 语义仍不宣称。ADR-0004 继续 `Proposed`。

### 回到规划：第七轮 Read Capability

- NeuroBook 当前 `read` 工具绑定 workspace cwd，并包含 offset/limit、行号、截断、图片和宿主文件策略；Cosmos 当前只在 consumer fixture 中自定义 `read(reference)`。
- 建立 ADR-0006（Proposed）：复用现有 Capability 生命周期，只抽出 opaque reference + 文本结果/provenance/truncation 的最小数据合同；路径解析、权限、输出上限和图片/二进制全部留在宿主。
- 下一步执行最小 deterministic consumer slice；如果分页和错误语义不能在不引入文件系统假设的情况下稳定表达，则停止在 ADR，不实现默认 read Tool。

### 2026-08-08：执行 ADR-0006 最小 ReadCapability consumer slice

- `src/capability.ts` 新增 `ReadRequest`、`ReadResult` 和 `ReadCapability`；reference 保持 opaque，Core 不读取文件系统或解释路径。
- `tests/read-capability.test.ts` 覆盖 offset/limit 透传、provenance/truncated/nextOffset 结果、Provider 拒绝和 Tool error 归并。
- focused 结果：2 pass / 0 fail / 8 expect calls；全量 `bun run verify` 为 62 pass / 0 fail / 312 expect calls。
- `bun run pack:smoke` 通过，Bun/Node consumer 额外编译检查 `ReadCapability` / `ReadRequest`；文档修改后的 `git diff --check` 通过。
- 未验证：真实 NeuroBook/Cosmos 文件权限、Workspace/cwd、图片/二进制、输出存储和生产接入；ADR-0006 继续 `Proposed`，当前没有默认 read Tool。

### SSE Transport 规划审查（2026-08-08）

- 对照 NeuroBook `reference/agent/sse.md` 与 Jobs SSE 合同，确认现有 `SessionEventHub` 已覆盖 Core 所需的 `eventEpoch + seq`、cursor replay、snapshot-required 信号和 runtime/session event 分层。
- 不新增 SSE ADR 或 HTTP 实现：`connected` 握手、snapshot GET 与 SSE 建连窗口、重连退避、帧/队列字节预算、慢消费者关闭、鉴权和 Job delivery 都需要宿主 Transport/前端状态机。
- 结论：SSE 目前已有可消费的 Core seam；下一步只有在真实宿主需要时，才建立单独 Transport Adapter consumer test，不把它伪装成 Harness Core 功能已完成。
- 后续 ADR-0019 用可复现的 Core-owned queue 证据修订了其中“队列字节预算/慢消费者全部属于 Transport”的部分；SSE frame、socket backpressure、heartbeat、鉴权和 reconnect 边界不变。

### 2026-08-08：ADR acceptance review 与回到规划

- ADR-0002 已接受 strict `invoke-if-current`：新增测试让两个独立 JSONL Store/Harness 竞争同一 anchor，一个成功、一个得到同一 reducer 边界的 `SessionConflictError`，获胜 Invocation 可由新 Harness 恢复；历史 inactive leaf、持久化 branch anchor 和真实宿主接入仍不承诺。
- ADR-0003 继续 `Proposed`：sections 顺序和正常多 turn 已稳定，但 approval resume 中 `profile.prepare()` 的等待前 Snapshot、resolution 后 Provider Snapshot、waiting 是否触发 `afterTurn` 以及 JSONL 重启组合语义尚未冻结。
- ADR-0004 继续 `Proposed`：现有竞争、Node/Bun、crash phase、busy/lost、corruption 和 fencing 证据已完成；下一轮专门处理独立 Store 实例重复竞争、release `operationCompleted`、Windows I/O 错误分类和 stale 清理操作合同。
- ADR-0005 继续 `Proposed`：Provider 顺序、最新 Snapshot、approval resume、不持久化和前置失败已有证据；Capability 权限、跨 Harness resume 和直接公开类型 smoke 仍需补齐。
- ADR-0006 继续 `Proposed`：shape-only `ReadCapability` 接近可接受，但 Cosmos/NeuroBook 仍未使用新合同完成真实 file permission、Workspace/cwd、图片/二进制或生产接入；当前没有默认 `read` Tool。
- 本轮验证：focused Workflow anchor 7/34，`bun run verify` 63/323，`bun run pack:smoke` 通过，`git diff --check` 通过。用户已有 `docs/architecture.md` 与 `docs/pi-adapter-design.md` 未被修改。

### 回到规划：第八轮候选（2026-08-08）

按“先冻结已有实现合同，再扩展高风险组合”的规则，下一轮候选排序为：

1. **ADR-0003 approval resume 合同**：增加 JSONL waiting → 新 Harness resume、`prepare()` 依赖 Snapshot version、waiting 不触发 `afterTurn` 的 focused 回归，并把完整 runtime message 顺序写入 ADR。
2. **ContextProvider Capability 权限 slice**：Provider 使用声明的 Capability 成功/失败两条路径，确认 model call 前失败、不写入 Session，以及 `open/close` 仍是 Invocation-scoped；同步 pack smoke 直接编译 `ContextProvider` 相关公开类型。
3. **ADR-0004 lock robustness**：补独立 Store 实例重复竞争、正常 acquire/release、release failure 的 `operationCompleted`，并明确人工 stale 清理前必须确认旧 owner 已终止；Windows I/O 错误分类单独 spike。
4. **Workflow 旁路结果回写 spike**：只研究 `createSession(parentSessionId) → invokeAt → 父 Session expectedVersion/expectedActiveLeafId 写入一个结果 Entry`，不实现通用 fork/merge，不复制 transcript，不引入 Job/Lease/sidecar。

下一轮不把真实 NeuroBook/Cosmos 接入、Pi Adapter 迁移、HTTP/SSE route、Job/Lease/Outbox 或 generic branch recovery 混入上述 slice；它们继续作为宿主或独立 ADR 的后置边界。

### 2026-08-08：执行第八轮 ADR-0003 approval resume 合同

- 新增 `tests/context.test.ts` 回归：waiting approval 不运行 `afterTurn`；resume 在后续 Tool call turn 完成且没有新的 pending approval 后运行 `afterTurn`，其 context 进入下一次 model request。
- 新增 `tests/recovery.test.ts` JSONL 跨 Harness 回归：新 Harness 的 `profile.prepare()` 观察 waiting Snapshot；approval resolution durable commit 后，`ContextProvider` 观察更新后的 Snapshot；静态 `PreparedRun.context/messages` 在 resume 中重新建立，旧 attempt 的内存 runtime message 不会带入。
- focused：`bun test tests/context.test.ts tests/recovery.test.ts` 为 11 pass / 0 fail / 65 expect calls。
- 本轮未修改生产 API 或 Session durable schema；未修改 NeuroBook、Cosmos、用户已有 `docs/architecture.md` 与 `docs/pi-adapter-design.md`。
- ADR-0003 的 resume 生命周期边界已从 provisional ambiguity 收敛为可测试合同，但仍保持 `Proposed`，等待独立审查和后续 Capability 权限 slice。
- 全量 `bun run verify`：65 pass / 0 fail / 343 expect calls；`git diff --check`：通过。未重复 `bun run pack:smoke`，因为本轮没有公开包边界变化；真实 NeuroBook/Cosmos、真实 provider、浏览器/产品和生产验收仍未运行。
- 本轮安全范围文件准备作为本地 checkpoint；用户 dirty 文件不纳入提交。

### 回到规划：第九轮候选（2026-08-08）

1. **ADR-0003 独立 acceptance review**：核对新恢复证据与公开类型/文档，决定是否接受；不把真实 NeuroBook 接入当作必要前提。
2. **ContextProvider Capability 权限 slice**：验证 Provider 使用声明 Capability 的成功/失败、Invocation-scoped open/close、model call 前失败和 Session 不持久化。
3. **ADR-0004 lock robustness**：补独立 Store 正常 acquire/release、`operationCompleted` 和 Windows I/O 错误分类；继续不引入 stale takeover。
4. **Workflow 旁路结果回写 spike**：只研究显式父 Session version/leaf CAS 回写，不实现 generic fork/merge、Job、Lease 或 sidecar。

### 2026-08-08：执行第九轮 ContextProvider Capability slice

- 新增 `tests/context-provider-capability.test.ts`：Provider 通过声明的 host-neutral Capability 读取当前 Snapshot，多个 model turn 复用一个 Invocation-scoped value，并验证 `close()` 收到同一 Invocation 实例。
- 失败路径验证 Capability 内部错误被包装为 ContextProvider 解析失败；model 未被调用，动态 context 未写入 Session，Capability 仍完成 close。
- focused：`bun test tests/context-provider-capability.test.ts` 为 2 pass / 0 fail / 13 expect calls。
- 本轮仍未修改生产 API、Capability 实现或 Session durable schema；真实宿主权限策略、NeuroBook/Cosmos 接入和生产验收未运行。
- ADR-0005 的 Capability 生命周期余项已有行为证据；ADR-0003/0005 仍待独立 acceptance review。
- 全量 `bun run verify`：67 pass / 0 fail / 356 expect calls；`git diff --check`：通过。由于本轮没有公开包边界变化，未重复 `bun run pack:smoke`。

### 回到规划：第十轮候选（2026-08-08）

1. **ADR-0003/0005 独立 acceptance review**：核对恢复、Provider、Capability 与公开包边界，决定是否接受；保持真实宿主接入单独报告。
2. **ADR-0004 lock robustness**：补正常 acquire/release、`operationCompleted` 与 Windows I/O 错误分类，不引入 stale takeover。
3. **Workflow 旁路结果回写 spike**：只研究父 Session version/leaf CAS 结果回写，不实现 generic fork/merge、Job、Lease 或 sidecar。
4. **NeuroBook parity research**：继续只读追踪 Harness 最新 bug 修复，筛选可去领域化且能在 Core 测试证明的增量。

### 2026-08-08：执行第十轮 ADR-0004 lock robustness slice

- 新增 `tests/jsonl-store.test.ts` 回归：两个独立 `JsonlSessionStore` 实例竞争同一版本时只允许一个成功，恢复 Snapshot 保持 version/entry 一致。
- 新增 `tests/jsonl-lock.test.ts` 回归：release 原始错误被归一化为 `JsonlLockError`；commit 已完成时 `operationCompleted=true`，task 与 release 同时失败时为 `false`。
- `src/storage/jsonl-lock.ts` 只做内部错误归一化，不改变 Store 公共接口、JSONL record 或 stale takeover 策略。
- focused：`bun test tests/jsonl-lock.test.ts` 为 5 pass / 0 fail / 20 expect calls；`bun test tests/jsonl-store.test.ts` 为 10 pass / 0 fail / 43 expect calls。
- 全量：`bun run verify` 为 69 pass / 0 fail / 367 expect calls；`git diff --check`：通过。未重复 `bun run pack:smoke`，因为本轮没有公开包边界变化。
- ADR-0004 仍保持 `Proposed`：人工 stale 清理前确认旧 owner 已终止的 fencing 操作合同已写入决策并有 ownership-loss 回归；Windows I/O 错误分类和 syscall 内部中断仍未验证。

### 2026-08-08：第十轮独立 acceptance review

- 独立 reviewer 核对了当前 `src/harness.ts`、Context/Recovery/Capability focused tests、ADR 和公开包边界，确认 ADR-0003 可接受。
- ADR-0005 以 A1 范围接受：Capability 明确为每次 run attempt open/close；approval `resume()` 会新建 scope，不承诺跨 waiting/process 复用。
- focused：Context/Recovery/Capability 合计 13 pass / 0 fail / 78 expect calls；全量 `bun run verify` 为 69 pass / 0 fail / 367 expect calls。
- ADR-0004 仍为 `Proposed`，剩余 Windows I/O 分类、人工 stale 清理前确认 owner 已终止的操作合同和 syscall 内部中断边界未冻结。
- 未验证真实 NeuroBook/Cosmos、真实 provider、浏览器/产品和生产验收；这些不影响本次 Core ADR acceptance。

### 回到规划：第十一轮候选（2026-08-08）

1. **ADR-0004 Windows I/O/fencing spike**：只做错误分类与人工清理操作合同验证，不引入 stale takeover。
2. **Workflow 旁路结果回写 spike**：只研究父 Session version/leaf CAS 回写，不实现 generic fork/merge、Job、Lease 或 sidecar。
3. **NeuroBook parity research**：继续筛选可证明、宿主无关的 Harness bug fix 与 API seam。
4. **ADR-0006 shape-only acceptance review**：只接受 Core opaque read 数据合同；真实 NeuroBook/Cosmos file tool 仍单独报告。

### 2026-08-09：第十一轮 ADR-0004 lock ownership contract 收尾

- 新增 `tests/jsonl-lock.test.ts` 回归：人工删除原 owner 的 lock root、由 contender 重新取得 lock 后，原 owner 的 `assertOwnedOnDisk()` 明确得到 `JsonlLockLostError`；原 owner 的 release 不会删除 contender 的 lock。
- 新增正常 `release()` 的幂等回归：重复释放不抛错，也不留下 lock root。
- focused：`bun test tests/jsonl-lock.test.ts` 为 6 pass / 0 fail / 22 expect calls；全量 `bun run verify` 为 70 pass / 0 fail / 369 expect calls；`git diff --check` 通过。
- ADR-0004 仍为 `Proposed`。本轮冻结人工 stale 清理的操作前提：必须先确认旧 owner 已终止；不把当前 ownership check 宣称为系统级 fencing。Windows 真实 I/O 错误分类和 syscall 内部中断仍未验证。
- 未运行 `bun run pack:smoke`：没有公开包边界变化；未运行真实 NeuroBook/Cosmos、真实 provider、浏览器/产品或生产验收。

### 回到规划：第十二轮候选（2026-08-09）

1. **P0 取消后的 ownership fence**：追 `src/harness.ts` 的 abort、迟到 provider/tool 结果和 Invocation ownership；先建立可复现的非合作式迟到结果模型与 ADR/失败测试，再决定最小 fence seam。
2. **NeuroBook parity：system-origin message identity**：研究 `AgentCaller.system` 与 queued follow-up 的独立消息身份是否能抽成 provider-neutral 合同；不搬 NeuroBook `custom_message` DTO。
3. **ADR-0004 Windows I/O 分类 spike**：只在真实 Windows 文件操作可控复现时扩展错误分类；否则保留 `Proposed`，不引入 stale takeover。
4. **动态结构化完成协议 spike**：对照 NeuroBook 的动态 output schema，先验证当前 `settleRun` 是否足够，不直接引入 `report_result`。

### 第十二轮计划：Invocation Ownership Fence（2026-08-09）

- 依据：NeuroBook Task 139 / `4179f736` 的取消与 provider error 分离，以及更早的 `bf9dfffa` 中 `ownsInvocation()`、迟到 runtime event 丢弃和物理写入 ownership fence；当前 standalone Harness 的 `abort()`、model/tool/hook await 和 `reconcileInterrupted()` 尚无等价 durable owner 条件。
- ADR：建立 [`ADR-0007`](../../adr/0007-invocation-ownership-fence.md)，状态保持 `Proposed`，直到实现、focused/full 验证和独立审查完成。
- 红测矩阵：reducer owner CAS；Memory/JSONL reconcile 后旧 plan；非合作式 Model；sequential/parallel Tool；Hook、ContextProvider、Compactor、Approval、Capability；同一 EventHub 的取消/terminal 迟到 runtime event；旧 Harness → reconcile → 新 Harness retry。
- 明确延后：`abortGraceMs`、bounded completion、partial assistant 语义、retry admission、terminal `agent_end` 唯一性、跨进程 EventHub fencing、父 Workflow signal、取消 DTO 和 SSE Transport。
- 执行顺序：红测 → 最小实现 → focused/full/pack（公开边界变化时）→ walkthrough/审查 → 本地 checkpoint → 回到规划。

### 2026-08-09：执行 ADR-0007 Invocation Ownership Fence

- 先按 TDD 建立 `tests/invocation-ownership.test.ts`：第一版红灯复现了 owner CAS 缺失、非合作式 Model 迟到 assistant/runtime event、sequential Tool 迟到 write plan、parallel Tool batch 迟到 toolResult、Hook/ContextProvider/Compactor 迟到 effect、Approval 迟到 waiting 和旧 Harness reconcile 后继续写入等缺口。
- `src/session.ts` 新增可选 `SessionWritePlan.expectedActiveInvocationId` 和公开 `InvocationOwnershipError`；Reducer 在 version CAS 前检查 owner，字段省略保持 `harness.write()`/Workflow 兼容，`startInvocation` 保留既有 `InvocationConflictError` 诊断。
- `MemorySessionStore` 与 `JsonlSessionStore` 的 `reconcileInterrupted()` 将观察到的 owner 带入 finish plan；Harness 内部 Invocation-owned commit 自动附加 owner 条件，commit observer 能观察实际执行的 owner precondition。
- `src/harness.ts` 为每次 `start()`/`resume()` 建立不可复用 attempt；abort/dispose 先 invalidate，再 abort；所有 Model、Tool、Approval、Hook、ContextProvider、Compactor 和 Capability open 的外部 await 返回后执行 fence，迟到 Capability resource 会被关闭，`settleFailure` 仅作为取消清理例外保留。
- `publishRuntime()` 同时丢弃失效 attempt 和 terminal attempt 的迟到 runtime event；本轮只承诺同一 Harness/EventHub，不扩展跨进程 EventHub fencing。
- 中途遇到一次组合测试超时，证据定位为 `afterTurn` 调用漏传 attempt，修复后 focused/full 均恢复；没有留下调试日志或临时进程。

### 2026-08-09：第十二轮收尾与集成审查

- 聚焦验证：`bun test tests/invocation-ownership.test.ts tests/commit-observer.test.ts` 为 14 pass / 0 fail / 38 expect calls。
- 全仓验证：`bun run verify` 为 83 pass / 0 fail / 403 expect calls；包含 typecheck、build 和 24 个测试文件。
- 包边界验证：`bun run pack:smoke` 通过，tarball 安装、Bun consumer、Node ESM consumer 和 prepack 全量验证均通过。
- 文档/工作区验证：`git diff --check` 通过；现有用户 dirty 的 `docs/architecture.md` 与 `docs/pi-adapter-design.md` 未纳入本轮修改范围。
- 集成审查结论：owner 条件只在 Invocation-owned plan 自动注入，公开 `harness.write()` 仍兼容；旧 owner 在 Store reducer 边界无法写入；bounded abort、跨进程 EventHub、终端事件跨进程唯一性和真实 NeuroBook/Cosmos/provider 验收仍未完成，因此 ADR-0007 保持 `Proposed`。
- 下一轮回到规划：优先研究 ADR-0008 bounded abort/terminal completion，或先完成 ADR-0004/0006 的 acceptance review；不把两者混成一个实现切片。

### 回到规划：第十三轮候选（2026-08-09）

1. **P0 ADR-0008 bounded abort/terminal completion**：先冻结 `abortGraceMs`、completion boundary、forced `aborted` finish、retry admission、`dispose()` 和唯一 `agent_end`，不引入 partial assistant 或 provider timeout。
2. **ADR-0006 A1 acceptance review**：可以接受 shape-only Core seam，但必须把真实 NeuroBook/Cosmos file Adapter 接入继续列为未验证。
3. **ADR-0004 scoped acceptance / Windows I/O spike**：先补真实可控 `EPERM`/`EACCES`/`EBUSY` 分类，再决定是否接受；不引入 stale takeover。
4. **NeuroBook parity：adhoc/report_result 或 system-origin message identity**：只有在 bounded abort 后仍有清晰 provider-neutral seam 时才建立新 ADR。

### 第十三轮计划：Bounded Abort and Terminal Completion（2026-08-09）

- 规划依据：NeuroBook Task 139 的真实 provider 取消可能直接 throw；当前 standalone `abort()` 只失效 attempt，`result()`/`dispose()` 仍可能永久等待。并行规划代理确认这是比 ReadCapability 扩展和只做 acceptance 更高的活性风险。
- ADR：建立 [`ADR-0008`](../../adr/0008-bounded-abort-terminal-completion.md)，状态保持 `Proposed`，先以非合作式 Model/Tool red tests 验证合同。
- 最小候选 API：`NeuroAgentHarnessOptions.abortGraceMs?: number`，`InvocationHandle.abort(): void` 保持兼容；不新增 HTTP/DTO/SSE 字段。
- 红测矩阵：永不 resolve Model/Tool；grace 内/外迟到成功；normal completion race；forced finish 后 transcript/write/effect/event；waiting/repeated/no-active abort；retry、follow-up、dispose；Memory/JSONL recovery。
- 明确不做：partial assistant、provider timeout/retry、强杀外部进程、外部副作用撤销、Job/Lease/Outbox、sidecar、跨进程 EventHub、SQLite/Prisma。
- 执行顺序：红测 → completion boundary 实现 → focused/full/pack → terminal/race 审查 → walkthrough/checkpoint → 回到规划。

### 第十三轮执行与 walkthrough：Bounded Abort（2026-08-09）

- 先修复审查发现的三个 owner P1：Invocation-owned plan 不能跨 Session；组合 `finish -> start` 不能绕过 `expectedActiveInvocationId: null`；`settleFailure` 在 reconcile 期间重新确认 durable owner。
- `src/harness.ts` 新增 `abortGraceMs` 和一次性 completion boundary。abort 先失效 attempt，再触发 `AbortController`；宽限期后在 owner CAS 内 forced `aborted` finish，释放 active admission，迟到 raw Promise 不再写 Session 或普通 runtime event。
- terminal race 采用 first durable terminal wins：正常 `completed` 先落盘时保留 completed；forced abort、迟到正常返回和重复 abort 只允许一个 `agent_end`。
- `tests/abort-boundary.test.ts` 覆盖永不 resolve Model/Tool、dispose、forced/finish-first race、重复 abort、retry 和 `abortGraceMs` 校验；`tests/invocation-ownership.test.ts` 覆盖跨 Session write、组合 start CAS 和 settlement owner race。
- Walkthrough 证据：focused `bun test tests/abort-boundary.test.ts tests/invocation-ownership.test.ts` 为 23 pass / 0 fail / 62 expect calls；全仓 `bun run verify` 为 93 pass / 0 fail / 433 expect calls；`bun run pack:smoke` 也通过。跨进程 EventHub、真实 provider/tool、Store dispose 异常路径和 NeuroBook/Cosmos 真实接入仍需单独验证。

### 回到规划：第十四轮候选（2026-08-09）

上一轮集成审查没有推翻 ADR-0008 的方向，但发现 completion boundary 的 durable write 与本地 write fence 仍有一个重要的实现缺口：forced abort 复用了带旧 `expectedVersion` 的普通 `finish()`，而已建立的 `invocationWriteFences` 尚未参与 `commit()` admission。下一轮按以下优先级推进：

1. **P0 forced terminal owner-CAS**：新增内部 forced-abort finish 路径，使用 `expectedActiveInvocationId` 精确 owner、刻意省略 `expectedVersion`，有限次处理 Store conflict；已有 durable terminal 或 owner 丢失时采用 durable 状态，耗尽重试时返回明确的 `AbortBoundaryError`，不伪造 `aborted` 或 terminal event。
2. **P0 sealed write fence**：forced abort 入口先 seal Invocation binding；普通 Invocation-owned plan 在本地被拒绝，只有恰好一个 `harness.invocation.forceAbort` 的 `finishInvocation(status: "aborted")` 计划可以通过内部例外。binding 继续保留到 raw run 真正结束。
3. **P1 settlement commit race**：补 owner 检查通过、forced terminal seal/commit、迟到 `settleFailure` effect 才提交的回归，证明 late write 不落盘。
4. **P1 waiting event contract**：验证 `agent_end(waiting)` 是可恢复边界，之后 `abort()` 只产生一个 `agent_end(aborted)`；重复 abort 不产生第二个终态事件。

本轮明确不做：partial assistant、provider timeout/retry、跨进程 EventHub fencing、Job/Lease/Outbox、sidecar、HTTP/SSE DTO、NeuroBook/Cosmos 真实接入和其它仓库修改。执行完成后重新跑 focused、`bun run verify`、`bun run pack:smoke` 与 `git diff --check`，再做独立审查；审查未通过则回到规划，不接受 ADR-0008。

### 第十四轮计划（2026-08-09）

- 先在现有 `tests/abort-boundary.test.ts`、`tests/invocation-ownership.test.ts` 增加/调整红测：versionless forced owner-CAS、conflict exhausted、late settlement commit race、waiting→aborted event order。
- 再最小修改 `src/harness.ts`：分离 forced terminal write；将 sealed fence 接入 `assertInvocationTarget()`/`commit()`；保留绑定生命周期和一次性终态事件 gate。
- 证据门槛：focused 全绿后才跑全仓和包 smoke；所有验证数字、未验证边界和 review 结论写入本 Task 与 ADR walkthrough。

### 第十四轮执行、收尾与审查记录（2026-08-09）

- `src/harness.ts` 将 forced abort 分离为 versionless `expectedActiveInvocationId` owner-CAS terminal write；普通 terminal finish 仍保留版本检查，forced conflict 限定 3 次重试，耗尽时返回 `AbortBoundaryError`，不伪造 `aborted` 或终态事件。
- forced abort 入口 seal Invocation write fence；`commit()`/`assertInvocationTarget()` 拒绝 sealed 后的普通 late plan，只允许精确的单一 `harness.invocation.forceAbort` `finishInvocation(status: "aborted")` 例外。binding 继续保留到 raw run 的 `finally`，并拒绝 sealed Invocation ID 的重入绑定。
- 终态事件 gate 按 Session+Invocation 去重，覆盖无 active admission 的 waiting abort；waiting abort 对 Store conflict 做有限重试，仍无法确认时抛出明确的 `AbortBoundaryError`。
- 新增/调整 focused 回归：`tests/abort-boundary.test.ts` 11 tests，覆盖 forced versionless CAS、冲突耗尽、waiting conflict retry、waiting→aborted 顺序、重复终态、late Model/Tool、dispose 和 finish-first race；`tests/invocation-ownership.test.ts` 18 tests，覆盖 sealed 后 same-session settlement commit race；`tests/recovery.test.ts` 新增 JSONL forced-abort terminal 的新 Harness 恢复。
- 验证证据：focused `bun test tests/abort-boundary.test.ts tests/invocation-ownership.test.ts tests/recovery.test.ts` 为 34 pass / 0 fail / 115 expect calls；全量 `bun run verify` 为 100 pass / 0 fail / 462 expect calls；`bun run pack:smoke` 通过（prepack 同为 100/462，tarball、Bun consumer 和 Node ESM consumer 通过）；`git diff --check` 通过，仅有 Windows 工作树的 LF/CRLF 转换警告。
- 独立审查先发现 waiting abort conflict 只重读一次、缺少 JSONL forced recovery；两项已补齐并重新完成 focused/full/pack 验证。第十四轮收尾时仍不接受 ADR-0008；当时记录的跨进程 EventHub fencing、真实 provider/tool、Store dispose 失败路径、真实 NeuroBook/Cosmos 接入、浏览器/产品和生产验收仍未运行，详见第十五轮 acceptance review。

### 第十五轮执行、收尾与 acceptance review（2026-08-09）

- 新增 waiting abort 冲突耗尽回归：连续 3 次 `harness.invocation.abort` Store conflict 后返回 `AbortBoundaryError`，不发布 `agent_end(aborted)`，Snapshot 仍保持 waiting 且 active owner 不变。
- 新增固定 Invocation ID 生命周期回归：forced abort seal 后同一 Session 重入被拒绝；raw run 未结束时绑定另一 Session 被拒绝；raw run 的 `finally` 清理完成后，新 Session 可以复用同一 ID 并发布该 Session 的唯一 completed terminal event。
- focused：`bun test tests/abort-boundary.test.ts tests/invocation-ownership.test.ts tests/recovery.test.ts` 为 36 pass / 0 fail / 135 expect calls。
- 全仓：`bun run verify` 为 102 pass / 0 fail / 482 expect calls，typecheck、build 和 25 个测试文件均通过。
- 包边界：`bun run pack:smoke` 通过，包含 prepack、tarball 安装、Bun consumer 和 Node ESM consumer；`git diff --check` 通过，仅有 Windows LF/CRLF 转换警告。
- 独立审查确认没有本轮范围内的 P0/P1 缺陷，ADR-0008 升格为 `Accepted (standalone Core scope)`。跨进程 EventHub fencing、真实 provider/tool、Store `dispose()` 失败路径、真实 NeuroBook/Cosmos、浏览器/产品和生产验收继续列为未验证，不阻塞本轮收口。

### 回到规划：第十六轮候选（2026-08-09）

1. **TSX Profile context seam**：优先验证 NeuroBook `HistorySet`、`ModelContext`、`modelContextAppending`、`AppendingSet` 的生命周期能否映射为新的 provider-neutral Context/Provider 合同；不直接搬入 TSX DSL、Profile Home、Workspace 或 Workbench。
2. **Workflow 旁路 Agent 回写**：用现有 `snapshot → createSession → invoke → write` 组合做一个结果回写 CAS spike；不引入 generic fork/merge、Job、Lease、Outbox 或 sidecar。
3. **Read/SSE 暂缓扩张**：`ReadCapability` 先保持 shape-only，`SessionEventHub` 继续作为 Core 事件源；HTTP DTO、鉴权、reconnect、byte budget 和 slow-consumer 仍留在 Transport Adapter，除非新的 consumer 证据要求窄增量。
4. **其它 acceptance**：ADR-0004、0006、0007 的接受门槛分别独立处理，不与 TSX/Workflow 新合同混成一个实现切片。

### 第十六轮执行、收尾与 acceptance review（2026-08-09）

- 新增 `tests/workflow-result-writeback.test.ts`，通过公开 `snapshot()`、`createSession()`、`invokeAt()`、`write()`、`SessionEntryCodec` 验证旁路结果回写；未修改 `src/` 生产代码。
- focused：5 pass / 0 fail / 17 expect calls；覆盖 Memory 成功回写、JSONL 新 Harness 恢复、目标 stale version/active leaf 冲突诊断、冲突无部分结果和无 CAS 重复 entry。
- 全仓：`bun run verify` 为 107 pass / 0 fail / 499 expect calls，typecheck、build 和 26 个测试文件均通过。
- 包边界：`bun run pack:smoke` 通过，包含 prepack、tarball 安装、Bun consumer 和 Node ESM consumer；`git diff --check` 无 whitespace error，仅有 Windows LF/CRLF 转换警告。
- 独立审查结论：现有 API 足够，未发现 P0/P1 或 scope overclaim；ADR-0009 升格为 `Accepted (standalone Core scope)`。跨 Session 事务、Job/Lease/delivery、自动 retry/rebase、幂等键、exactly-once、真实消费者和产品验收仍未验证。

### 第十七轮执行、收尾与 acceptance review（2026-08-09）

- 对照 NeuroBook `reference/agent/context.md`、`profile-sdk/contracts.ts` 和 `prepare-run.ts`，确认 `modelContextAppendingMessages` 的 durable 语义存在文档/实现冲突；本轮只抽当前 request 的 provider-neutral 消息位置。
- `src/context.ts` 新增 `modelContextAppending` 分区与固定 assembler 顺序；`src/harness.ts` 保留 ContextProvider 返回的该分区；未引入持久化、Reminder/Watch 或 settlement。
- focused：`bun test tests/context.test.ts tests/context-provider-capability.test.ts` 为 9 pass / 0 fail / 57 expect calls。
- 全仓：`bun run verify` 为 107 pass / 0 fail / 502 expect calls；包边界 `bun run pack:smoke` 通过，包含 prepack、tarball、Bun consumer 和 Node ESM consumer。
- 当前范围审查未发现 P0/P1 或 scope overclaim，ADR-0010 升格为 `Accepted (standalone Core scope)`；NeuroBook durable 语义、Reminder/Watch、stateWrites、settlement、真实消费者和产品验收继续留在未验证范围。

### 回到规划：第十八轮候选与选择（2026-08-09）

并行只读调研比较了 NeuroBook parity、Workflow/旁路组合、Harness 恢复测试缺口和 Cosmos 需求：

1. Workflow 的 `createSession → invokeAt → write` 已足够支持宿主组合旁路 Agent 与 best-effort CAS 回写；完整 Cosmos Run/Step/Job、幂等 delivery、lease 和 Outbox 明确不进入 Harness。
2. NeuroBook 最新且可去领域化的缺口是 `caller.kind` 与 `messageIdentity` 分离：system follow-up 需要在 queue、Invocation、落盘 entry 和重启恢复中保留 system identity。
3. `report_result`/动态 output schema 仍保留为宿主可注入 Tool/Adapter；当前 Core 的 `PreparedRun.tools`、`ToolResult.output` 和 `Profile.output` 尚不足以证明应把 NeuroBook 的报告政策下沉。
4. 本轮选择 ADR-0011 的最小 message identity metadata slice；不修改 provider-visible role、不引入 `custom_message`、Job、SSE 或 exactly-once。

计划顺序：先补 `message-identity.test.ts` 红测，再实现 caller/queue/Invocation/transcript 传递与旧记录兼容，最后跑 focused、`bun run verify`、`bun run pack:smoke` 并独立审查。

### 第十八轮执行、收尾与 acceptance review（2026-08-09）

- 先由多个规划代理对照 NeuroBook caller/message identity、Workflow 旁路组合、Harness durable recovery 和 Cosmos Workflow Runtime 边界；Locke 另外复现了 follow-up consume/start 非原子断点。
- 新增 `MessageIdentity = "user" | "system"` 与 `InvocationInputOptions`；`InvokeRequest`、`invokeAt()`、`retry()`、`steer()`、`followUp()` 和 `AgentCallRequest` 支持显式 caller/identity 分离。
- `InvocationRecord`、queue ledger、JSONL recovery 和 user-shaped `agent.message` envelope 保存 identity；`MemorySessionStore`、`JsonlSessionStore` 和 reducer 对旧缺字段记录默认 `"user"`。provider-visible `AgentMessage` 未被污染。
- follow-up admission 将 `startInvocation` 与 `harness.followUp.consumed` 合并为一个 CAS commit；新增 `tests/follow-up-consume-recovery.test.ts`，验证 start 失败时 queue item 保留。
- 新增 `tests/message-identity.test.ts`，覆盖 invoke、invokeAt、retry、system follow-up JSONL 重启、steer、AgentCallRequest 类型 seam、provider-visible role 和 legacy defaults。
- focused：`bun test tests/message-identity.test.ts tests/follow-up-consume-recovery.test.ts` 为 6 pass / 0 fail / 33 expect calls；受影响测试集为 38 pass / 0 fail / 183 expect calls。
- 全仓：`bun run verify` 为 113 pass / 0 fail / 544 expect calls；typecheck、build 和 28 个测试文件均通过。
- 包边界：`bun run pack:smoke` 通过，包含 prepack、tarball 安装、Bun consumer 和 Node ESM consumer；`git diff --check` 通过，仅有 Windows LF/CRLF 转换警告。
- acceptance 结论曾将 ADR-0011 升格为 `Accepted (standalone Core scope)`，但后续独立审查发现 follow-up admission stale queue P1，故该结论已撤回，ADR-0011 当前为 `Proposed`；本轮未引入 NeuroBook `custom_message`、Cosmos Job/Run/Step/Lease/Outbox、delivery/exactly-once、SSE 或 sidecar。
- 未验证项：真实 NeuroBook/Cosmos consumer、真实 provider/tool、跨进程 EventHub、系统 identity 权限/审计、HTTP/SSE Transport 和生产验收。

### 回到规划：第十九轮候选（2026-08-09）

1. 完成 ADR-0004 JSONL lock 的最终 acceptance review，继续不引入自动 stale takeover。
2. 完成 ADR-0006 shape-only ReadCapability 与 ADR-0007 ownership fence 的独立 acceptance review，或补齐真实 consumer 证据后再决定。
3. 用 Cosmos 的真实需求建立一个仅在 consumer/Workflow 层维护 `jobId/runId/stepId/idempotencyKey ↔ childSessionId/invocationId` 的 spike；不把 Job durable truth 下沉 Harness。
4. 评估常用 `read` Capability 与 SSE Transport Adapter 的最小真实消费者合同；若没有新的可复现需求，保持当前 Core 边界。

### 第十九轮执行与重新审查（2026-08-10，已完成）

- 独立审查复现了 follow-up admission 读到旧队首后与 cancel/reorder 并发的 P1 风险；该风险不能由第十八轮的普通 happy-path focused 测试覆盖。
- `tests/follow-up-admission-race.test.ts` 已改为在 `harness.invocation.start` 原子提交前冻结 admission，期间执行 cancel/reorder，随后验证旧 admission 以 `SessionConflictError` 失败，未启动旧队首且队列保留。
- `tests/follow-up-admission-jsonl.test.ts` 补齐两个独立 JsonlSessionStore/Harness 的 cancel/reorder 竞争；`tests/message-identity-legacy-jsonl.test.ts` 直接恢复缺字段 raw JSONL Snapshot。
- 当前 focused：5 个相关测试文件为 11 pass / 0 fail / 60 expect calls。
- 全仓：`bun run verify` 为 118 pass / 0 fail / 571 expect calls；包边界 `bun run pack:smoke` 通过，包含 prepack、tarball、Bun consumer 和 Node ESM consumer；`git diff --check` 无 whitespace error。
- 最终独立 acceptance review 通过，ADR-0011 已在 standalone Core 范围内升格为 `Accepted`；已创建本地 checkpoint `5744744`，用户已有 dirty 文档仍保持原样并未纳入提交。

### 2026-08-10：ADR-0011 最终 acceptance review

- 审查确认 `MessageIdentity` 保持 provider-neutral，follow-up admission 的 `observedSnapshot + expectedVersion` CAS 与 `startInvocation + consumed` 原子提交覆盖 Memory/JSONL；没有发现 P0/P1 或 scope overclaim。
- 接受证据：5 个相关测试文件 11 pass / 0 fail / 60 expect calls；全仓 118 pass / 0 fail / 571 expect calls；包 smoke 通过；raw legacy JSONL 与两个独立 JSONL Harness 竞态均有可复现回归。
- ADR-0011 已接受的范围仍不包含真实 NeuroBook/Cosmos consumer、真实 provider/tool、跨进程 EventHub、第三方 Store Adapter、权限/审计策略、HTTP/SSE Transport、Job/Lease/Outbox、delivery/exactly-once 或 sidecar。

### 回到规划：第二十轮候选（2026-08-10）

1. **TSX Profile context seam**：重新对照 NeuroBook 最新 Context/History 生命周期，筛选下一个仍能保持 provider-neutral、可逆且可测试的窄合同；不把 durable Reminder/Watch、Profile Home 或 Workspace 状态搬入 Core。
2. **ADR-0004 JSONL lock 最终 acceptance**：补 Windows I/O 错误分类和人工 stale 清理操作边界；继续不引入自动 stale takeover，不把当前证据外推为网络文件系统 fencing。
3. **ADR-0006/0007 acceptance**：分别检查真实 read consumer 与更广 Invocation ownership/跨进程 EventHub 证据；没有消费者证据就保持 Proposed，不为接受而扩张 API。
4. **Cosmos 可逆 consumer spike**：只在 Cosmos consumer/Workflow 层验证 `jobId/runId/stepId/idempotencyKey ↔ childSessionId/invocationId` 投影和 `pi-ai` 过渡，不让 Job durable truth 或强制 provider 迁移进入 Harness。

下一轮先做并行只读规划，再选择一个能形成独立 vertical slice 的候选；选择门槛仍是：Core 宿主无关、可回退、没有真实消费者/权限依据就不固化公共合同，且每轮继续分别报告 focused、全仓、包和未验证边界。

### 第二十轮计划：Context lifecycle adapter-only spike（2026-08-10）

- **已确认的公开 seam**：测试只通过 `defineProfile()` / `PreparedRun.context` / `prepareWrites` / `contextProviders`、`NeuroAgentHarness.invoke()` / `resume()`、公开 Session Snapshot 和 JSONL restart 观察行为；不调用 Harness 私有方法，不让测试 Adapter 直接操作 Store。
- **对照依据**：NeuroBook 的 `HistorySet` 是首次稳定写入，`ModelContext` 是每个 provider request 重新计算且不持久化，`AppendingSet` 是贴近输入并持久化的 contribution；Reminder/Watch、Profile runtime state、Workspace 和 settlement 仍是宿主语义。
- **第一条 tracer bullet**：用公开 API 构造最小 Adapter，验证 stable History contribution 只写一次、每个 Invocation 的 Appending contribution 与 marker 在同一个 `SessionWritePlan` 中原子写入，并在后续 Invocation 中各出现一次。
- **当前已知缺口候选**：`prepareWrites` 可以携带任意 `SessionEntryDraft`，但公开包没有 Core `agent.message` envelope 的类型安全 draft helper；消费者必须复制私有 `{turn, message, messageIdentity}` JSON 形状。先以红测证明，再决定是否建立 ADR-0012 或只做 additive helper。
- **后续 vertical slice**：Memory 通过后再补 JSONL waiting/restart，验证同一 Invocation 的 Appending 不因 `Profile.prepare()` 重建而重复，ContextProvider 的 model-only 结果不落盘且恢复后只生成最新一份。
- **决策门槛**：如果公开合同已足够，则本轮只提交测试和 walkthrough；如果红测证明缺少通用 Core primitive，新增合同必须仅解决 durable message contribution，不引入 HistorySet/AppendingSet 类型、TSX DSL 或宿主 state。
- **本轮非目标**：不改变当前已接受的 `history → durable transcript → modelContext → modelContextAppending → appending` assembler；NeuroBook 的 `CurrentUserInput` 尾置顺序若需对齐，另立 prompt/continue lifecycle ADR。也不混入 ADR-0004、SSE、Cosmos Workflow、sidecar、Job/Lease/Outbox 或其它仓库修改。

第一条 focused red 已确认：`bun test tests/context-lifecycle.test.ts` 在加载测试时以 `Export named 'createAgentMessageEntryDraft' not found` 失败，尚未进入行为断言。缺口位于包根公开 seam，而不是 Store 或测试 Adapter 的实现细节；因此建立 [ADR-0012](../../adr/0012-durable-context-contribution-entry.md)，状态保持 `Proposed`，待 Memory/JSONL lifecycle、全仓、包 smoke 与独立审查完成后再决定是否接受。

### 第二十轮执行、walkthrough、收尾与审查（2026-08-10）

- 新增 `createAgentMessageEntryDraft(message, options)` 与 `AgentMessageEntryDraftOptions` 根导出；helper 复用 canonical `{turn, message, messageIdentity}` serializer，拒绝非法 turn，只在显式提供时携带 invocation/parent/identity metadata。
- 第一条 Memory tracer bullet 证明 stable History 只写一次，每个 Invocation 的 Appending marker/message 在同一个 owner-fenced durable commit 中写入，后续 model request 与 Session Snapshot 均各出现一次。
- 第二条 JSONL tracer bullet 先复现 waiting restart 后 Appending 出现两份；测试 Adapter 改为从 Snapshot marker 判断后，同一 Invocation 在新 Harness `resume()` 中恰好恢复一次。旧 model-only ContextProvider 文本没有落盘，resume 后只生成最新 Snapshot 对应内容。
- 第三条行为证据证明 `beforeTurn` write plan 先提交，ContextProvider 随后读取的新 Snapshot version 恰好增加 1。
- README、CONTEXT、ADR 和 pack smoke 同步公开边界；没有新增 HistorySet/AppendingSet Core 类型、TSX DSL、settlement 或 prompt ordering API。
- focused：4 pass / 0 fail / 39 expect calls；全仓与最终 prepack：122 pass / 0 fail / 610 expect calls；tarball Bun consumer、Node ESM TypeScript consumer 和 `AgentMessageEntryDraftOptions` 直接类型导入均通过；`git diff --check` 通过。
- 独立只读 reviewer 未发现 P0/P1。Residual：helper 本身不验证错误的 `invocationId`/`parentId`，仍依赖既有 plan/Store 合同；reviewer 的 read-only sandbox 无法运行 Bun，但主集成流程已现场完成两次 package smoke，其中最终一次包含 122/610。
- ADR-0012 升格为 `Accepted (standalone Core scope)`。完整证据与未验证边界见 [第二十轮 walkthrough](walkthroughs/2026-08-10-context-lifecycle.md)。
- 已创建功能 checkpoint `fd1a9df`；Task 与 walkthrough 使用独立 docs checkpoint，避免把用户已有 dirty 文件混入。

### 回到规划：第二十一轮候选（2026-08-10）

1. **Prompt/continue lifecycle**：NeuroBook 使用 `HistoryWithoutCurrentUserInput → ModelContext → AppendingSet → CurrentUserInput`，standalone 当前 assembler 是 `history → full transcript（含当前输入）→ modelContext → modelContextAppending → appending`。先建立只读行为矩阵，不直接改变已接受顺序；若要对齐必须单独 ADR。
2. **ADR-0004 最终 acceptance**：补 Windows I/O 错误分类与旧 owner 已退出后的人工 stale 清理 fixture，不引入自动 takeover。
3. **ADR-0006/0007 acceptance**：分别接受 shape-only ReadCapability 与 standalone ownership fence，继续把真实 consumer、权限和跨进程 EventHub 列为未验证。
4. **Cosmos consumer mapping**：只在测试/consumer 层验证 Workflow ID 与 Session/Invocation ID 投影，不修改 Cosmos，也不让 Job durable truth 进入 Core。

下一轮优先做 Prompt/continue lifecycle 只读矩阵，因为第二十轮已经证明 durable contribution 能表达“写什么、恢复几次”，但尚未证明“当前用户输入在 provider prompt 的哪里”；该调查不得与 API 修改混为同一步。

### 第二十一轮计划：Prompt/continue lifecycle 只读矩阵（2026-08-10）

- **公开 seam**：只通过 `defineProfile()`、`NeuroAgentHarness.invoke()` / `resume()`、Scripted Model request 和 durable Snapshot 观察；不测试私有 assembler。
- **已确认差异一**：NeuroBook prompt 首轮把已落盘尾部分为 `history / appending / currentUserInput`，再把 model-only context 插到 appending 前；standalone 当前把新 user message 放进 full transcript 后，再在 transcript 后追加 model/appending sections。
- **已确认差异二**：NeuroBook `continue` 不接受 message/input，也不写新 user entry；standalone `invoke()` 始终把 `PreparedRun.userMessage ?? payload` 生成 user message，只有 approval `resume()` 不新增输入。
- **必须分开的阶段**：首轮 prompt ordering、无输入 continue、首轮前 steer、Tool 后续 turn、approval resume 与 compaction 后首轮不能用一个“把最后一条 user 移到末尾”的实现概括。
- **tracer bullet**：写一个临时 public test，只证明首轮期望 `History → ModelContext → Appending → CurrentInput` 时现有请求顺序红灯；记录精确差异后移除临时红测，不把未决定的新语义提交为回归合同。
- **决策门槛**：只有同时定义 prompt/continue 输入模式、首轮 tail 范围、steer、compaction 和 resume 行为后才建立 ADR。若本轮无法形成窄且兼容的 additive API，则以审计 walkthrough 收口，不修改生产代码。
- **非目标**：不改 ADR-0003/0010 已接受 assembler，不用 NeuroBook DTO/`custom_message`/clientMessageId 污染 Core，不混入 TSX、settlement、SSE、Cosmos Job 或 sidecar。

### 第二十一轮审计、walkthrough 与收尾（2026-08-10）

- 临时 public-seam test 已精确复现首轮差异：期望 `HISTORY → MODEL_CONTEXT → APPENDING → CURRENT_INPUT`，standalone 实际为 `HISTORY → CURRENT_INPUT → MODEL_CONTEXT → APPENDING`。该 spike 测试已按计划删除，没有把未决定的新语义留成长期红灯。
- NeuroBook 的差异不是一个纯 assembler 参数：prompt admission 会先写 Appending、再写 pending user message，并用 `appendingCount + currentUserInputCount` 从 durable 尾部重组；`continue` 则不接受新 message/input，`currentUserInputCount=0`。
- Standalone 没有无输入 `continue`：普通 `invoke()` 总会从 `PreparedRun.userMessage ?? payload` 生成并持久化 user message；approval `resume()` 才是不新增 input 的独立路径。
- 首轮前 steer、Tool 后续 turn、approval resume 和 compaction 会改变 live transcript；“移动最后一条 user message”无法稳定识别当前输入，也会误排 steer、Tool Result 或被 summary 替代的输入。
- 决策：本轮不建立 ADR、不改生产 API。未来候选必须同时定义 additive input mode、仅首轮 tail 范围、steer/compaction/resume 行为和兼容默认；否则继续保留 standalone 已接受顺序。
- 本轮只有 Task/walkthrough 文档增量；重新运行 `bun run verify` 为 122 pass / 0 fail / 610 expect calls。本轮不重复 package smoke；`git diff --check` 在 docs checkpoint 前执行。
- 集成审查确认矩阵分别描述首轮输入、无输入 continue 和后续 turn，没有把 NeuroBook RunFrame 语义误报为 standalone 已实现能力。
- 完整矩阵、证据与下一步见 [第二十一轮 audit](walkthroughs/2026-08-10-prompt-continue-lifecycle.md)。

### 回到规划：第二十二轮选择（2026-08-10）

下一轮选择 **ADR-0007 standalone ownership fence acceptance review**：

- 先核对 owner CAS、run-attempt invalidation、runtime/terminal event fence、Memory/JSONL reconcile/retry 和 bounded abort 的现有证据；
- 补一个 `resume()` / `dispose()` 后迟到 Model 的 focused 回归，仅在审查证明现有矩阵未覆盖该边界时执行；
- 不把跨进程 EventHub、真实 provider/tool 或 Cosmos/NeuroBook 接入作为 standalone acceptance 前提，也不误报它们完成；
- 不与 ADR-0004 Windows lock 或 ADR-0006 consumer acceptance 混成同一轮。

### 第二十二轮计划：ADR-0007 standalone acceptance（2026-08-10）

- **接受范围**：`expectedActiveInvocationId` reducer CAS、Harness Invocation-owned plan 自动 owner 条件、run-attempt invalidation、同 Harness runtime event fence、Memory/JSONL reconcile 与 retry。
- **现有证据**：精确 owner/`null`/省略、组合 start、非合作 Model、sequential/parallel Tool、Hook、ContextProvider、Compactor、Approval、Capability、settleFailure race、跨 Session write、fixed Invocation ID、terminal callback 和 JSONL old/new Harness。
- **补测门槛**：只有 `resume()` 或 `dispose()` 存在上述矩阵未覆盖的独立旧 attempt 写入窗口才新增测试。waiting resume 在旧 run 已返回后创建新 attempt；dispose 的非合作依赖和迟到正常返回已由 bounded abort tests 覆盖，因此当前先不重复。
- **明确不接受**：跨进程 EventHub、跨进程 terminal event 唯一性、真实 provider/tool、第三方 Store、父 Workflow signal、HTTP/SSE、NeuroBook/Cosmos 和产品验收。
- **执行顺序**：focused ownership/abort/recovery → 全仓 → 独立只读 review → 更新 ADR/walkthrough；无公共包变化时不重复 pack smoke。

### 第二十二轮执行、审查与收尾（2026-08-10）

- 逐项核对 reducer owner 字符串/`null`/省略、Invocation start admission、Harness 自动 owner 注入、abort attempt invalidation，以及 Model、sequential/parallel Tool、Hook、ContextProvider、Compactor、Approval、Capability、settleFailure、terminal callback/runtime event 和 Memory/JSONL reconcile/retry 证据。
- waiting `resume()` 在旧 run 已返回后建立新 attempt；`dispose()` 的非合作式依赖与迟到正常返回已在 bounded-abort 回归中覆盖，没有发现独立的未 fenced 写入窗口，因此没有为了 acceptance 重复增加测试。
- focused 四文件套件为 37 pass / 0 fail / 141 expect calls；最终 `bun run verify` 为 122 pass / 0 fail / 610 expect calls。没有公共 API/包内容变化，本轮不重复 `pack:smoke`。
- 第一次独立只读 review 超时且未修改文件；第二次 reviewer 完成代码、测试与 ADR 对照，未发现 P0/P1，并单独复跑 ownership 文件为 19 pass / 0 fail / 55 expect calls。
- ADR-0007 升格为 `Accepted (standalone Core scope)`。公开 `harness.write()` 省略 owner 仍是兼容设计；跨进程 EventHub、真实 provider/tool、第三方 Store、Transport 和真实 NeuroBook/Cosmos consumer 仍未验证。
- 完整证据与 residual 见 [第二十二轮 walkthrough](walkthroughs/2026-08-10-invocation-ownership-acceptance.md)。

### 回到规划：第二十三轮选择（2026-08-10）

下一轮优先执行 **ADR-0006 shape-only ReadCapability acceptance review**：

- 只判断 opaque reference、offset/limit、content/provenance/truncated/nextOffset 和 Invocation-scoped Capability 形状是否能在 standalone Core 范围内接受；
- 核对参数边界、Provider 拒绝、Tool error、Capability lifecycle、根导出与 package consumer 现有证据，只在发现真实合同缺口时补测试；
- 不把默认 `read` Tool、文件系统、Workspace/cwd、symlink、图片/二进制、权限策略或真实 NeuroBook/Cosmos 接入误报为 Core 已完成；
- 不与 ADR-0004 Windows lock acceptance 或 prompt/continue API 混在同一轮。

### 第二十三轮计划：ADR-0006 shape-only acceptance（2026-08-10）

- **接受候选**：只接受 `ReadRequest`、`ReadResult`、`ReadCapability` 的 host-neutral 类型形状，以及它复用现有 Invocation-scoped `CapabilityProvider` open/close/abort 生命周期；不新增 token singleton、默认 Tool 或文件系统 Adapter。
- **对照结论**：NeuroBook 当前 `read` 仍是产品 Tool，绑定 1-indexed 行号、Workspace/Project File Address 授权、图片 attachment、Context Access 和输出预算；这些继续留在宿主。standalone 的 numeric offset/limit 只是未指定单位与起点的分页提示，由 Provider/Tool schema 解释和校验。
- **已发现文档缺口**：ADR 当前声称 Core 不把 reference 写入 Session；实际上 Tool call arguments 和 ToolResult details 遵循普通 transcript 持久化。修正文档并用公开 Snapshot 回归证明 reference/provenance 可能 durable，调用方不得把 credential 放进这些字段。
- **Focused 策略**：让拒绝场景直接抛出 Provider error，证明 Harness 既有 Tool error path 生效；成功场景同时核对 opaque request/result 透传与 durable transcript。再组合运行 generic Capability lifecycle tests。
- **接受门槛**：focused、全仓、package smoke、文档链接/diff 检查和独立只读 review 全部通过后，才把 ADR-0006 升格为 `Accepted (standalone Core scope)`；任何发现的 Core/API 缺口先保持 Proposed。

### 第二十三轮执行、审查与收尾（2026-08-10）

- 对照 NeuroBook 当前 `file-tools.ts`，确认其 1-based 行分页、Workspace/Project File Address、授权、symlink/绝对路径、图片 attachment、Context Access、bash-output locator 和输出预算都属于产品 Adapter，不进入 standalone Core。
- `read-capability` fixture 的拒绝路径改为直接抛 Provider error，验证 Harness 通用 Tool error 归并；成功路径从公开 Snapshot 证明 reference、truncated 与 nextOffset 会随 Tool transcript durable。
- 初次独立审查未发现 P0 或实现层 P1，但指出 ADR 把 reference 错写成“不进 Session”的 P1，以及 continuation 组合、fixture offset 起点两个 P2。公开类型注释、README、CONTEXT、ADR 和 fixture 已同步修正：reference/provenance 必须是非 secret；offset 单位/起点由宿主解释；Core 不推断 continuation 权限或完整性。
- post-fix 独立只读复核确认上述 P1/P2 全部关闭，没有新增 P0/P1 或 scope overclaim。
- 没有新增全局 read token、默认 Tool、文件系统实现或运行时结果 validator；相同 token instance 继续由定义 Profile/Tool 的集成模块与 Provider 共享。
- focused 三文件套件为 13 pass / 0 fail / 63 expect calls；`bun run verify` 为 122 pass / 0 fail / 613 expect calls；`bun run pack:smoke` 通过 Bun/Node tarball consumer。
- ADR-0006 升格为 `Accepted (standalone Core scope)`；完整证据与 residual 见 [第二十三轮 walkthrough](walkthroughs/2026-08-10-read-capability-acceptance.md)。

### 回到规划：第二十四轮选择（2026-08-10）

下一轮优先执行 **ADR-0004 JSONL per-session commit lock 最终 acceptance review**：

- 重新核对 Bun/Node 多进程竞争、crash phases、heartbeat/ownership loss、release、独立 Store/Harness 和损坏分类证据；
- 在 Windows 上用可控 fixture 判断 `EPERM` / `EACCES` / `EBUSY` 等 I/O 分类是否真有 acceptance 缺口，不能稳定复现就记录平台边界，不伪造覆盖；
- 只评估本地文件系统上的第一方 `JsonlSessionStore.commit()` 锁，不宣称 `create()` / `allocateId()`、网络文件系统或整个 Store process-safe；
- 不引入自动 stale takeover；人工清理仍要求先确认旧 owner 已终止。

### 第二十四轮计划：JSONL partial-tail recovery before lock acceptance（2026-08-10）

- **发现的 P1 候选**：`readSnapshot()` 会忽略 crash 留下的最后一段 malformed JSON，但后续 `commit()` 直接 `appendFile()`，新 record 会粘在无换行残片后；该 commit 虽返回成功，重启读取仍回到旧 version，再写一次会让 malformed line 变成非尾行并永久失败。
- **Red fixture**：在隔离 JSONL Session 尾部写入 `"{broken"`，先确认 public `read()` 恢复旧 Snapshot，再执行一次正常 commit；预期新 Store 必须恢复新 version 且文件每个非空行都可 JSON parse。现有实现应先红灯。
- **最小修复方向**：在同一个 per-session lock 内解析 JSONL 时保留 byte-level append boundary；reduce/CAS 成功后、append 前截断 malformed tail，或在完整但缺 newline 的合法 record 后补 separator。不得额外整文件读取，也不得把语义扩大为 fsync/crash-atomic write。
- **安全顺序**：repair 只能发生在 plan 已通过 reducer 后，并在 append 前再次确认 lock owner；stale/invalid plan 不应借 commit 修改文件。repair 自身可中断但必须幂等，下一次仍可恢复。
- **后续 acceptance**：partial-tail focused 绿灯后再审 Windows I/O 分类、真实 errno 可复现性和 ADR 范围；不自动 stale takeover，不宣称 syscall 原子性、网络文件系统或整个 JSONL Store process-safe。

### 第二十四轮执行、审查与收尾（2026-08-10）

- 第一条 public Store red 证明真实 P1：malformed tail 后 `commit()` 返回 version 1，但 restart 仍恢复 version 0；新 record 被粘进残片并整体忽略。
- `readSnapshotState()` 改为单次 Buffer/byte-line 解析；只把最后一个非空 `SyntaxError` 记为 repair boundary。reducer/CAS 成功后才 truncate，完整无 newline record 只补 separator；stale plan 不改文件。
- 测试覆盖中文 metadata 的 byte offset、repair 后继续提交、完整无 newline、truncate 完成但 append 前退出，以及有效但不连续 JSON record 继续 fail closed。
- 最初的 shell errno spike 被执行策略拦截且未产生文件；第一版 PowerShell fixture 因参数传递未 ready 超时。fixture 改用环境变量和隐藏 `FileShare.None` holder 后，真实复现 metadata `EBUSY` 被误报成 `JsonlLockLostError`。
- 新增 `JsonlLockIoError(operation, code, cause)`，并将 acquire/assert/heartbeat/release 的非 ENOENT I/O 与 Busy/Corrupt/Lost 分开。第一次独立 review 随后发现 heartbeat timer 会把 Io 二次包装成 Lost；补 heartbeat `EBUSY` red 后修复为保留已有 taxonomy。
- `storage/jsonl` additive 导出五个错误类，内部 lock handle 不公开；package smoke 的 Bun/Node consumer 已验证 runtime/type seam。
- focused 为 27 pass / 0 fail / 140 expect calls；全仓与 package prepack 为 127 pass / 0 fail / 635 expect calls；tarball Bun/Node consumers 通过。
- post-fix 独立只读 review 未发现 P0/P1，建议在 Windows local filesystem、`JsonlSessionStore.commit()`、无自动 stale takeover 的范围接受 ADR-0004。
- 完整 red→green、绕道、error taxonomy 与 residual 见 [第二十四轮 walkthrough](walkthroughs/2026-08-10-jsonl-lock-acceptance.md)。

### 回到规划：第二十五轮选择（2026-08-10）

下一轮回到 **NeuroBook 最新 Harness bug-fix parity 与 Cosmos structured action 需求审计**：

- 从 NeuroBook 当前 Harness、Task 和近期 commits 提取 standalone 尚未吸收的 provider-neutral correctness fixes，不按文件 diff 机械搬运；
- 优先核对动态 output schema / structured result、turn failure、provider request/usage、compaction/recovery 与 message identity，排除 Job/Lease/Outbox、产品 DTO 和 UI；
- 对照 Cosmos Agent Action 的结构化输出、取消与可逆 `pi-ai` 过渡，判断下一个最窄 tracer bullet；
- 先形成行为矩阵和 red candidate；没有可复用 Core 缺口就记录审计，不为新增 API 而新增 API。

### 第二十五轮计划：Invocation-scoped structured output consumer tracer（2026-08-10）

- **NeuroBook 对照**：`b1bc9feb` 修复的是产品侧 `report_result` binding 漏判。动态或显式空 `outputSchema` 必须让模型可见参数要求 `data`，执行校验失败形成 Tool error 并允许下一 turn 修正；无 schema 的 adhoc 调用继续兼容 text-only。`report_result` 名称、binding DTO、TypeBox 和 Workflow projection 不直接进入 standalone Core。
- **现有 Core seam**：静态 `Profile.output` 负责 Profile 级终态校验；Invocation 动态 schema 可由 `prepare(context.initial)` 解析后生成普通 `defineTool()`，其 `ValueSchema.jsonSchema` 进入 provider request、`parse()` 负责执行校验、`ToolResult.output + terminate` 负责 Invocation 收口。Tool 参数错误已由 Harness 转成 `isError` transcript 并继续 turn。
- **待验证 tracer**：在 Cosmos consumer fixture 中让同一个 Profile 根据持久化 initial 解析版本化 Action output 合同；首轮故意缺少动态必填字段，断言 provider-visible schema、durable error ToolResult 和模型修正；第二轮返回合法结构化结果，断言 Invocation output 与 JSONL restart 恢复。
- **决策门槛**：若 public consumer tracer 通过，则不新增 `PreparedRun.output` 或 completion Tool factory，避免 Profile 与 Invocation 重复持有 schema；宿主继续用普通 Tool 组合完成政策。只有 tracer 暴露无法在公开 API 表达的 provider-neutral correctness 缺口，才建立新 ADR 和 production red test。
- **Cosmos 边界**：结构化结果只投影为 Harness Invocation output。ActionDefinition version/schema、Run/Step/Job、lease、预算、checkpoint、领域写入和失败策略仍由 Cosmos 持有；Phase 1 继续直接使用 `pi-ai`，本轮不修改 Cosmos 或强制迁移。
- **验证顺序**：focused consumer test → `bun run verify` → 独立只读审查 → walkthrough/checkpoint。没有公共导出或包内容变化时不重复 `pack:smoke`；真实 provider、真实 Cosmos/NeuroBook 接入和 HTTP/SSE 另行报告。

### 第二十五轮执行、审查与收尾（2026-08-10）

- 新增 public Cosmos consumer tracer：同一个 Profile 根据持久化 initial 生成 `answer` / `score` 两套 Tool schema；断言 provider-visible 参数、缺失 `data` 的 durable Tool error、下一 turn 修正、`tool_terminate` output 和 JSONL restart recovery。
- 第一轮 focused red 是测试误用不存在的 `assistant()` fixture，Harness 正常将 callback `ReferenceError` 收口为 failed；补齐测试 Adapter 后 focused 为 2 pass / 0 fail / 35 expect calls。
- `bun run typecheck` 通过；最终 `bun run verify` 为 128 pass / 0 fail / 651 expect calls，覆盖 32 个测试文件。`git diff --check` 通过。
- 本轮没有生产代码、公共导出或 package 内容变化，因此未重复 `pack:smoke`；没有修改 NeuroBook/Cosmos，也没有 push、发布或部署。
- 前两次外部 reviewer 尝试分别超时和因错误 auth 路径返回 401，均未写文件；最终 ephemeral/read-only reviewer 未发现 P0/P1。自然停止不强制 completion Tool、真实 provider/Cosmos/Transport 和连续 Tool error 上限继续作为 residual。
- 结论是不新增 `PreparedRun.output` 或 Core completion Tool factory；NeuroBook `report_result` 继续是宿主政策。完整证据见 [第二十五轮 walkthrough](walkthroughs/2026-08-10-structured-output-consumer-tracer.md)。

### 回到规划：第二十六轮候选（2026-08-10）

继续从 NeuroBook 当前 Harness 提取 provider-neutral correctness fixes，优先窄审：

1. turn failure 是否存在 standalone 未覆盖的 transcript / terminal ordering；
2. provider request 与 usage 是否有可恢复、可去领域化的事实缺口；
3. compaction/recovery 是否有比现有 Snapshot/ownership tests 更晚的 bug fix；
4. message identity 已完成的范围是否还存在无产品 DTO 的恢复缺口。

先用近期 commit、Task 和 focused behavior matrix 形成 red candidate；没有 Core 缺口则记录审计，不机械搬运 NeuroBook 文件。

### 第二十六轮计划：Failed turn runtime event boundary（2026-08-10）

- **发现的合同断点**：公开 `HarnessRuntimeEvent` 已声明 `turn_end.status: "completed" | "failed"`，但 `src/harness.ts` 只发布 `"completed"`。Model、Compactor、ContextProvider、before/afterTurn Hook、transcript commit 或 Tool error 上限在 `turn_start` 后失败时，消费者只收到 terminal `agent_end(failed)`，当前 turn 没有闭合事件。
- **NeuroBook 对照**：Task 07/139 将 provider turn transaction、partial assistant ingest 和 Invocation terminal 分层；失败 turn 先闭合，再由 Invocation lifecycle 收口。standalone 本轮只吸收 provider-neutral turn event ordering，不移植 `stopReason`、`messageStatus`、Pi stream、UI projection 或 partial assistant。
- **Public red matrix**：
  1. Model 在 `turn_start` 后抛错，事件必须按 `turn_start → turn_end(failed) → agent_end(failed)` 排序；
  2. `Profile.prepare()` 在首个 turn 前失败，不得伪造 `turn_end`；
  3. 自然 turn 已发布 `turn_end(completed)` 后，`settleRun` 失败不得再补第二个 failed turn。
- **最小实现候选**：Run Kernel 只跟踪当前是否有 open turn；所有 completed/waiting turn 边界清除标记；catch 在 failure settlement 前最多发布一次 failed boundary。现有 attempt/ownership fence 继续丢弃 abort 或 ownership-lost 后的普通 runtime event。
- **ADR 门槛**：red 证明现有公开事件合同不成立后建立 ADR-0013，冻结“已 start 的失败 turn 恰好闭合一次”及 settle/abort 边界；不借此扩张 durable schema。
- **非目标**：partial assistant、provider `stopReason`/error/usage 扩展、真实 Pi Adapter、HTTP/SSE、跨进程 EventHub、Job/Lease/Outbox、NeuroBook/Cosmos 修改。
- **验证顺序**：focused red → ADR/最小实现 → event/abort focused → `bun run verify` → 公共包变化时 `pack:smoke` → 独立审查 → walkthrough/checkpoint。

### 第二十六轮执行、审查与收尾（2026-08-10）

- Public red 得到 `turn_start:1 → agent_end:failed`，证明公开 `turn_end(failed)` variant 从未由 Run Kernel 发布；prepare-before-turn 和 settle-after-completed 边界保持绿灯。
- 建立 ADR-0013；`run()` 以一个 invocation-local `openTurn` 跟踪 started boundary，在 natural/waiting/Tool completed 出口清除，在 active failure settlement 前发布一次 failed boundary。beforeTurn Hook 回归证明非 Model 失败同样闭合。
- 第一次独立 review 发现既有 P1：failure terminal Store commit 未确认时，`durableTerminal` 被误传为 `allowInvalidated` 而不是 publish gate，可能伪造 `agent_end(failed)`。`FailingTerminalStore` red 复现后改为显式 durable gate；Snapshot 保持 running，留给 restart reconcile。
- Focused 为 5 pass / 0 fail / 13 expect calls；abort/ownership/events/persistence 为 33 pass / 0 fail / 118 expect calls；最终 `bun run verify` 为 133 pass / 0 fail / 664 expect calls，覆盖 33 个测试文件。`git diff --check` 通过。
- 没有公共类型、导出或 package 内容变化，不重复 `pack:smoke`；没有修改 NeuroBook/Cosmos，也没有 push、发布或部署。
- Post-fix 独立 review 无 P0/P1；P2 为 `allowInvalidated` 仍依赖内部调用点纪律。ADR-0013 升格为 `Accepted (standalone Core scope)`。完整证据见 [第二十六轮 walkthrough](walkthroughs/2026-08-10-failed-turn-event-boundary.md)。

### 回到规划：第二十七轮候选（2026-08-10）

1. **Partial assistant / provider throw**：先定义 provider-neutral partial message、未闭合 toolCall 剥离、abort grace/ownership 与 retry transcript 语义；没有完整矩阵前不改 public Model contract。
2. **Provider request / usage**：审计失败、abort、compaction 和多 turn 的 usage 是否丢失或重复；Pi cost/cache/provider metadata 保持 Adapter 私有。
3. **Compaction/recovery**：对照 NeuroBook 最新 visible-context 与 re-injected History 规则，只选择不依赖 Workspace/TSX/sidecar 的恢复缺口。
4. **Terminal publish internal API**：若后续继续修改 terminal pipeline，评估把 durable gate 与 invalidated-attempt 例外封装为不可误用的内部 helper；不为纯重命名单独扩张 API。

下一轮先做 behavior matrix 和临时 tracer；partial assistant 是高风险持久化合同，必须单独 ADR，不能与 usage 或 compaction 混成一个实现切片。

### 第二十七轮计划：Partial assistant/provider throw contract audit（2026-08-10）

- **并行规划结论**：
  - 不采用 Harness 从 `ModelRuntimeEvent` delta 反推 durable message：event 是观察流，Tool arguments 没有 fragment/replacement、closure、sequence 或完整性合同；
  - 暂不把 `ModelTurnResult` 改成 success/failure 判别联合：这会把现有 provider reject 控制流整体改写；
  - 若未来实现，优先候选是 additive typed `ModelTurnError`，携带只含完整 text/thinking block 的 provider-neutral partial draft；取消身份仍由 `AbortSignal`/ADR-0008 决定。
- **当前未决合同**：abort 时 partial 的冻结点、是否允许 invalidated attempt 在 grace 内写入、forceAbort 是否原子提交 partial + terminal、thinking 是否持久化、retry transcript 是否包含 partial、terminal durability unknown 如何暴露。
- **临时 public tracer**：
  1. Model 先发 text delta 再普通 throw；
  2. Model 先发 text delta，收到 abort 后 throw；
  3. Model 发未闭合 tool-call delta 后 throw；
  4. 对每种情况核对 runtime events、Snapshot transcript、Invocation terminal 和 retry request。
- **决策门槛**：tracer 只用于确认当前事实，完成后移除，不把“丢失 partial”写成期望回归。只有 typed error 能同时定义 owner CAS、toolCall 剥离、retry/recovery 和 Store failure 时才建立 ADR-0014。
- **非目标**：本轮不修改 public Model contract、AgentMessage durable schema、NeuroBook/Cosmos、真实 provider、UI/SSE、usage 或 compaction。
- **收尾**：将矩阵、被否决方案和下一最小切片写入 walkthrough；若证据仍不足，明确暂缓 production change，不为追求代码增量固化含混合同。

### 第二十七轮执行、审计与收尾（2026-08-10）

- 临时 public tracer 证明 text delta 在普通 throw/abort throw 前只存在于 runtime replay；Snapshot 不保留 partial，普通 failure 后的 retry request 也不包含 partial。未闭合 Tool delta 同样不落入 durable transcript，避免制造伪造的 pending Tool。
- 临时测试为 3 pass / 0 fail / 12 expect calls，`bun run typecheck` 通过；测试随后删除，避免把“partial 永久丢失”固化为回归合同。
- 三路规划均否决从 `ModelRuntimeEvent` 反推 durable message；additive typed `ModelTurnError` 只是未接受候选，仍缺 abort freeze、invalidated write、Tool completeness、retry transcript 和 terminal durability 合同。
- 本轮不修改生产代码、不建立 ADR-0014。第二十六轮全仓基线仍为 133 pass / 0 fail / 664 expect calls；删除临时测试后没有生产树或 package 内容变化，因此不重复 full/`pack:smoke`。
- 第一次独立只读 reviewer 在 60 秒内未返回且未修改文件；缩窄到本轮 Task/walkthrough 后，第二次 reviewer 未发现 P0/P1，并注明未在该限定审查中重验 NeuroBook Task 07/139 与第二十六轮基线。
- 未运行真实 Pi/Cosmos/NeuroBook provider、HTTP/SSE、浏览器、发布或生产验收。完整矩阵与 residual 见 [第二十七轮 walkthrough](walkthroughs/2026-08-10-partial-assistant-contract-audit.md)。

### 回到规划：第二十八轮选择（2026-08-10）

下一轮选择 **provider failure usage 与 terminal durability unknown 合同审计**：

- 先用 public tracer 核对已完成 turn 的 usage 在后续 Provider/Hook failure、abort 和 restart 中是否保持、丢失或重复；
- 核对 terminal Store commit 未确认时，`InvocationResult`、runtime terminal event 与 durable Snapshot 分别表达什么，避免把进程内 execution observation 误报为 durable terminal；
- 判断未来 typed `ModelTurnError` 是否必须把 provider-neutral usage 与 partial 一起携带，普通 Provider DTO、cost、cache 和 quota metadata 继续留在 Adapter；
- 先形成行为矩阵和 red candidate；只有公开消费者无法区分的真实 correctness 缺口才扩展 API 或建立 ADR，不把 partial、usage 和 terminal persistence 一次性混成大改。

### 第二十八轮计划：Result persistence 与 terminal usage（2026-08-10）

- **Public tracer**：临时测试 4 pass / 0 fail / 18 expect calls，`bun run typecheck` 通过。它分别确认：
  1. durable completed-turn usage 能穿过后续 Provider failure；
  2. assistant transcript commit 失败会让 observed usage 与 durable transcript 分叉；
  3. terminal commit 失败时 handle 返回 failed、Snapshot 仍 running；
  4. Capability close error 会把 durable completed/13 usage 的结果改写成进程内 failed/0 usage。
- **P1 判断**：第 4 项让同一个 Invocation 的 handle 与 Snapshot 给出相反终态，且 `InvocationResult` 对第 3 项没有 Store confirmation 标记；这不是 Provider 或 Transport 问题。
- **ADR-0014**：新增 `InvocationResult.persistence = "confirmed" | "unknown"`；terminal plan 用保留的 `harness.invocation.usage` entry 原子保存非零 provider-neutral usage，全零保持旧 plan 形状且不改变 `finishInvocation` operation keys；canonical usage helper 优先该 fact、旧记录回退 transcript。
- **Cleanup 规则**：Capability 逆序全部尝试 close；cleanup exception 不覆盖已确认的 completed/waiting/failed/aborted 结果。`observeRunResult()` 从 Snapshot 恢复 confirmed result，无法确认时才返回 unknown。
- **明确不做**：本轮不增加 partial assistant/typed `ModelTurnError`，不处理 abort 后迟到 usage，不引入 cost/cache/quota/provider metadata，不修改 NeuroBook/Cosmos。
- **验证顺序**：把 tracer 转为 public red → 最小类型/reducer/Run Kernel 实现 → focused Memory/JSONL/abort/approval → `bun run verify` → `bun run pack:smoke` → 独立只读审查 → walkthrough/checkpoint。
- **规划绕道**：三个并行 CLI reviewer 都在 60 秒内超时且未修改文件；主线以源码、NeuroBook Task 07/139 对照和可复现 tracer 收敛，不把 reviewer 超时当作证据。

### 第二十八轮执行、审查与收尾（2026-08-10）

- `InvocationResult` 新增必填 `persistence: "confirmed" | "unknown"`；terminal Store 未确认时保留本地 outcome，但 Snapshot 仍是恢复真相源且不发布伪造的 `agent_end`。
- 非零 usage 由原形状 `finishInvocation` 与 `harness.invocation.usage` 在同一 Store commit 中原子保存；全零 usage 保持旧 plan 形状。根导出 `invocationUsage()` 优先 terminal fact，旧记录回退 active-path assistant transcript。
- usage fact 是 Harness 保留 kind；公共 `write()`、Profile 和 Tool 无法伪造。Provider usage 必须是有限非负数，避免 `NaN`、`Infinity` 或负数污染 Memory/JSONL。
- Capability 逆序全部 close；cleanup failure 不跳过其余资源，也不覆盖 durable completed/waiting/failed/aborted 或 unknown outcome 的原始错误。
- 第一次独立审查发现三个 P1：严格旧 Store operation shape、cleanup 掩盖原始 failure、缺少 abort/resume CAS race；三项均已修复并回归。最终独立审查无 P0/P1，后续 usage admission P2 也已补为 finite/nonnegative 校验。
- Focused 为 48 pass / 0 fail / 205 expect calls；`bun run verify` 为 146 pass / 0 fail / 738 expect calls；最终 `bun run pack:smoke` exit code 0，`git diff --check` 通过。
- 真实 Provider、NeuroBook/Cosmos、HTTP/SSE、第三方 Store 产品实现和发布/生产验收仍未运行。完整 red→green、兼容策略、race 与 residual 见 [第二十八轮 walkthrough](walkthroughs/2026-08-10-invocation-result-persistence-and-usage.md)。

### 回到规划：第二十九轮选择（2026-08-10）

第二十九轮选择 **typed Model turn failure usage seam**，暂不持久化 partial assistant：

- NeuroBook Task 07/139 与当前 Pi 0.80.6 源码确认，真实 stream 在 error/abort 时仍保留最后一份 partial assistant，部分 Provider 已在其中更新 usage；但 `stream.result()` 会失败，standalone `ModelRuntime` 只能抛普通 Error，无法把已观察 usage 交给 Core。
- ADR-0014 已解决 terminal usage fact、result persistence unknown 和 forced terminal sealed fence，失败 turn usage 现在可以在不修改 Store operation shape 的前提下独立落地。
- partial assistant 仍缺 durable message status、branch/retry projection、thinking 政策和未闭合 Tool delta 完整性；把它与 usage 同轮实现会让 Adapter 观察事实和 transcript 语义再次耦合。
- Cosmos 当前没有依赖 partial transcript 的已验证需求；先保留 direct `pi-ai`，不因本轮强制迁移。

### 第二十九轮计划：Typed ModelTurnError usage（2026-08-10）

- **公共合同**：新增 additive `ModelTurnError` 和 options；可选 `usage` 只表示当前失败 provider turn 已观察到的 provider-neutral token 数，不是 Invocation aggregate。普通 Error 保持现状。
- **运行规则**：Harness 只在 `model.runTurn()` 直接抛出该类型时，把 usage 加入本次 run 聚合一次，然后复用既有 failure/abort settlement；不能通过给任意 Error 动态挂 `usage` 绕过 typed seam。
- **取消规则**：`ModelTurnError` 不决定 aborted 身份，仍由 request `AbortSignal` 决定。合作式 abort 在 grace 内返回 typed error 时可原子保存 usage；forced abort 若先赢，迟到 error/usage 不得突破 sealed terminal，handle 恢复 Store 中的 durable winner。
- **校验**：usage 必须是有限非负数；无效值在 Provider transcript/terminal fact 前 fail closed。不要求 `total === input + output`，不接受 cost/cache/quota/provider DTO。
- **明确不做**：本轮不增加 partial message、message status、stopReason、Tool delta 重组、自动 Provider retry、Pi Adapter package、NeuroBook/Cosmos 修改或 HTTP/SSE DTO。
- **Red matrix**：普通 typed failure、前序成功 turn + 当前失败 usage、terminal commit unknown、合作式 abort、forced-abort winner、ad-hoc Error property 和非法 usage。
- **门禁**：focused failure/abort/ownership/persistence tests → `bun run verify` → `bun run pack:smoke` → 独立只读审查 → walkthrough/checkpoint。

### 第二十九轮执行、审查与收尾（2026-08-10）

- 第一层 public red 为 0 pass / 1 fail / 1 load error，证明根包没有 typed failure seam；只加入类型壳后为 3 pass / 4 fail / 23 expect calls，四个红灯均是当前失败 turn usage 没有进入 result/terminal fact。
- 新增 `ModelTurnError(message, {usage, cause})` 和 `isModelTurnError()`。构造时验证 finite/nonnegative 并冻结 usage；stable `Symbol.for()` brand 支持同 realm duplicate package copy，普通 Error 的 ad-hoc `usage` 不被猜测。
- Run Kernel 只在 `model.runTurn()` catch 边界累计一次，再复用既有 failure/abort terminal pipeline；partial runtime event、transcript schema、Store operation shape均未改变。
- cooperative abort 在 grace 内可保存 typed usage；forced-abort 先赢时迟到 usage 被 owner/sealed fence 拒绝。terminal commit 未确认仍返回 local usage + `persistence: "unknown"`，不伪造 durable fact。
- 最终 typed test 为 8 pass / 0 fail / 36 expect calls；focused 五文件为 52/0/217；全仓为 154/0/774；tarball smoke exit code 0。
- 独立只读审查无 P0/P1。P2 的 attempt ordering 和同-realm 限制均是 ADR 明示边界并有 race 回归；测试暂存后的最终 reviewer 看到完整文件并再次给出 `No P0/P1`。
- 未运行真实 Pi/其它 Provider、NeuroBook/Cosmos、跨 Worker/VM error transport、HTTP/SSE、浏览器、发布或生产计量验收。完整证据见 [第二十九轮 walkthrough](walkthroughs/2026-08-10-typed-model-turn-failure-usage.md)。

### 回到规划：第三十轮选择（2026-08-10）

第三十轮选择 **host-local Pi Adapter consumer tracer**，不新增 Core API 或 Pi dependency：

- 当前 Pi 0.80.6 的 package metadata 为约 6.0 MB unpacked / 594 files，并依赖 Anthropic、OpenAI、Google、Mistral、Bedrock 等 SDK；只为验证 Adapter 映射把它加入 standalone Core/devDependency 会扩大安装与版本耦合。
- NeuroBook 当前 `streamAssistant()` 的关键真实形态是：for-await 持续收到 cumulative partial；error/abort event 后 `stream.result()` reject；也可能在 iterator 本身抛错前只留下最后一份 partial。
- ADR-0015 已提供 host-local Adapter 报告失败 usage 的 typed seam。本轮先证明公开 `ModelRuntime`、`ModelRuntimeEvent`、`ModelTurnError` 和 `AbortSignal` 是否足够，不把 Pi `AssistantMessageEvent` 或 Provider DTO复制到 Core。
- partial 正文仍只进入 runtime delta，不写 durable transcript；这不是 partial persistence acceptance。

### 第三十轮计划：Pi-like event/result Adapter tracer（2026-08-10）

- 在 consumer test 内定义最小 Pi-like structural event stream，不从 sibling NeuroBook 或 node_modules 导入运行时类型。
- Adapter 保存最后一份 cumulative partial，只向 Core 投影 message start/text/thinking/tool delta；成功时返回 provider-neutral assistant，失败时用最后 partial 的 usage 构造 `ModelTurnError`。
- 行为矩阵覆盖：success + usage、error event 后 result reject、iterator 在 partial 后直接 throw、signal 驱动的 cooperative abort。
- 断言失败/取消 usage 穿过 terminal fact 与 JSONL/Memory Snapshot，partial text 只在 runtime replay 可见，不进入 durable assistant transcript。
- 若 tracer 全绿，则结论是当前 Core seam 足够，Pi Adapter继续属于宿主/未来独立 package；不为测试而新增 `stopReason`、cache/cost、message status 或 partial DTO。
- 验证顺序：consumer focused → ADR-0015/abort/events focused → `bun run verify`；无生产 API/package 内容变化时不重复 `pack:smoke` → walkthrough → 独立只读审查。

### 第三十轮执行、审查与收尾（2026-08-10）

- 新增纯 consumer `HostPiLikeModelRuntime` fixture，模拟 Pi 0.80.6 的 cumulative partial + async iterator + `result()` 双边界；Provider/model/cost/cache/signature 只在 Adapter 内部存在。
- 成功 tracer 运行两次 model turn 和一次 Tool，投影 tool/thinking/text delta，并把 `totalTokens` 保留为 Core total；cache/cost/provider metadata 不进入 durable transcript。
- 失败 tracer 覆盖 error event 后 `result()` reject 和 iterator 直接 throw；Adapter 用最后一份 cumulative partial 的 usage 抛 `ModelTurnError`，partial text/thinking 只在 runtime replay 可见，JSONL/Memory transcript 不持久化。
- cooperative abort 由同一个 request `AbortSignal` 驱动 stream error/result reject，最终返回 aborted/confirmed 并保存 usage，不引入 Provider 错误文案或 stopReason。
- 第一轮行为测试为 4 pass / 0 fail / 31 expect calls；初次 typecheck 只暴露 replay helper 把 `TModelConfig` 写死为 `JsonObject`，泛化测试 helper 后 typecheck 通过。
- 相关 focused 为 38/0/199；全仓为 158/0/805，36 个测试文件并通过 typecheck/build。本轮只有 test/Task 文档，不重复 package smoke。
- 第一轮独立 reviewer 在 55 秒超时；最终 staged 窄审查结论为 `No P0/P1`，确认 structural fixture 与 scope 边界合理。reviewer 在只读 sandbox 中复跑 Bun 被 EPERM 拒绝，不能替代主流程验证。完整依据、映射形态与 residual 见 [第三十轮 walkthrough](walkthroughs/2026-08-10-pi-adapter-consumer-tracer.md)。

### 回到规划：第三十一轮选择（2026-08-10）

第三十一轮选择 **独立 terminal partial model output fact**：

- 不把半截 assistant 写成普通 `agent.message`；否则 retry/compaction 会把截断正文误当成完整历史。
- `ModelTurnError.partial` 只允许完整的 text/thinking block，从类型和运行时都排除 Tool call；Adapter 继续负责从 cumulative Provider partial 中剥离未闭合 Tool。
- Harness 使用自己已知的 turn，把 partial 与 failed/aborted terminal、非零 usage 在同一个 Store commit 中写入保留 fact。
- 根 helper 和 `InvocationResult.partial` 提供恢复/本地观察；`projectSessionTranscript()` / `sessionMessages()` 刻意忽略 partial fact。
- cooperative abort 在 grace 内可提交；forced-abort 先赢时迟到 partial 不突破 sealed terminal。terminal commit unknown 时只在本地 result 暴露，Snapshot 不伪造。

### 第三十一轮计划：ADR-0016 terminal partial fact（2026-08-10）

- 建立 `ModelTurnPartial`（text/thinking only）和 `InvocationPartial`（增加 Core turn）公共类型。
- 新增保留 `harness.invocation.partial` entry 与 `invocationPartial(snapshot, invocationId)` projection；host/Profile/Tool 不能伪造。
- 将 partial/usage 合并在原形状 `finishInvocation + appendEntries` 两 operation plan 中，保持严格旧 Store 对 `finishInvocation` keys 的兼容。
- public red 覆盖 failed + JSONL restart、local unknown、retry/provider context 排除、compaction projection、cooperative/forced abort winner、host forge 和非法/Tool partial。
- 不增加 stopReason、message status、provider metadata、UI 气泡、HTTP/SSE DTO，也不修改 NeuroBook/Cosmos。
- 门禁：partial focused + ADR-0014/0015/abort/retry/compaction → `bun run verify` → 公共包变化时 `bun run pack:smoke` → walkthrough/独立审查/checkpoint。

### 第三十一轮执行与主流程验证（2026-08-10）

- `ModelTurnError.partial` 对完整 text/thinking block 做 clone/freeze；非法、空内容和 Tool block 在构造边界拒绝。
- 新增 `harness.invocation.partial` 与 `invocationPartial()`；Harness 使用当前 turn 构造事实，partial、非零 usage 与 failed/aborted terminal 在同一个 Store commit 中提交。
- `finishInvocation` keys 保持不变；strict legacy Store 的 partial + usage 组合通过。host write 不能伪造保留 fact，malformed 最新事实 fail closed。
- `InvocationResult.partial` 区分 confirmed Snapshot recovery 与 unknown local observation；retry Provider request 和 compaction summary input 都不包含 partial。
- cooperative abort 在 grace 内保存 partial；forced-abort winner 丢弃迟到 partial。
- public red 经 `0 pass / 1 fail / 1 load error`、类型壳后的 `1 pass / 5 fail / 19 expect calls`，最终为 9/0/39。
- focused 为 53/0/247；全仓为 167/0/844；package smoke exit code 0。完整证据和未验证边界见 [第三十一轮 walkthrough](walkthroughs/2026-08-10-terminal-partial-model-output.md)。
- 第一轮独立审查为 `No P0/P1`；随后补齐 failed/aborted status、exact terminal turn、rewind 后 Invocation-addressed recovery 和 acknowledgement-loss reread。post-fix 复审为 `No P0/P1/P2`。
- ADR-0016 已在 standalone Core 范围接受。真实 Provider/NeuroBook/Cosmos、HTTP/SSE、UI message status 与自动 continuation 仍未验证。

### 回到规划：第三十二轮选择（2026-08-10）

第三十二轮选择 **Workflow parent signal → Invocation bounded abort**：

- standalone 已有 branch/fork、strict `invokeAt(anchor)`、parent/child Session identity、CAS result writeback、JSONL recovery 和 duplicate-delivery boundary；这些足以表达 sidecar 数据面，不恢复 sidecar API。
- NeuroBook 当前 Workflow sidecar 使用 `excursion` 保留旁支探针、ephemeral participant archive 和 caller mainline writeback；branch/participant/archive/relation 是 Workflow/宿主政策，不属于 Harness Core。
- 明确的 Core 缺口是取消 admission：NeuroBook `HarnessAgentPort` 在调用时传入 Workflow Run signal；standalone 只能在 handle 返回后 abort，Store read/start commit 期间父取消无法关联到尚未取得的 handle。
- Cosmos 的 Run/Step/Job/Lease/cancel/Outbox 与持久 SSE 已有独立 durable truth；本轮不能把它们复制进 Harness，也不修改 Cosmos。
- SSE 候选没有新证据：现有 `SessionEventHub` 继续提供 epoch/seq/replay/snapshot-required，HTTP framing、keepalive、auth、byte budget 和 durable domain events 留在宿主。

### 第三十二轮计划：ADR-0017 external Invocation signal（2026-08-10）

- 只给 `InvokeRequest` / inherited `InvokeAtRequest` 增加 optional `AbortSignal`；不放进 Session、queued input 或 Store。
- already-aborted 和 Store read 后/pre-commit abort 不创建 Invocation；start commit 期间 abort 在 commit 成功后复用 existing `requestAbort()`。
- external signal 只链接当前 handle；waiting 后的 durable cancel 仍由 Workflow 调用 `harness.abort(sessionId)`，不保存 signal。
- public red 覆盖 pre-aborted、delayed start-commit race、active Model abort 和 listener cleanup；只通过公开 invoke/snapshot/ModelRuntime/Store seam 观察。
- focused：新 signal test + workflow anchor/writeback + abort/approval；再跑 `bun run verify`、`bun run pack:smoke`、walkthrough 和独立审查。
- 明确不做：sidecar、ephemeral archive、linked relation、Workflow journal、Job/Lease/Outbox、HTTP/SSE DTO、NeuroBook/Cosmos 修改。

### 第三十二轮执行与主流程验证（2026-08-10）

- `InvokeRequest.signal?` 同时覆盖普通 `invoke()` 和 inherited `invokeAt()`，只作为 runtime field，不写 Invocation record。
- durable start 前 already-aborted/read-wait abort 不创建 Invocation；start commit 成功后 abort 复用 existing `requestAbort()`，commit 失败时保留原 Store error。
- active listener 在 handle settle 后移除；waiting 后不跨 `resume()` 保存 signal，durable waiting cancel 仍由 Workflow/宿主调用 `harness.abort(sessionId)`。
- public red 为 0 pass / 4 fail / 5 expect calls，类型有四个 `TS2353`；初始实现达到 5/0/17 后，自审追加“start commit 期间 abort 不得打开 Capability”断言并先红 `Expected: 0 / Received: 1`，最终 signal 文件为 5/0/18。
- focused 为 34/0/152；全仓为 176/0/874；package smoke exit code 0，tarball 为 101 files / 95.3 kB / 462.1 kB unpacked。完整证据与 sidecar/Cosmos/SSE 边界见 [第三十二轮 walkthrough](walkthroughs/2026-08-10-workflow-parent-signal.md)。
- post-fix 独立只读审查返回 `No P0/P1/P2 findings.`；ADR-0017 已在 standalone Core 范围接受。现有 branch/fork、strict anchor、结果回写、JSONL recovery 与 request-scoped parent abort 已覆盖 sidecar 数据面；宿主 archive/relation/durable Job 边界不下沉 Core。

### 回到规划：第三十三轮 cross-Harness follow-up admission（2026-08-10）

多角度只读规划得到三个结论：

- NeuroBook parity 审查指出 standalone `followUp()` 先检查本进程 `active` Map；当 Harness A 持有 durable active Invocation、Harness B 连接同一 JSONL Session 时，B 会错误报告“没有 active Invocation”。源码复核确认 Store Snapshot 已有 `activeInvocationId` 真相，但 queue commit 没有使用它。
- Cosmos 审查确认当前 `Profile + ModelRuntime + Capability + SessionStore + EventSubscription` 已足以作为未来 Agent Action Adapter seam；Run/Step/Job/Lease/Outbox/idempotency 与 durable SSE 继续由 Cosmos 持有，没有证据要求本轮扩 Harness Core。
- 另一个 standalone 广审在时限内没有返回结论，不作为选型证据。`queueIfBusy` 公共 admission API 和 stable delivery key 都会扩大当前合同，其中 delivery/exactly-once 明确不属于本 Goal 的 Core 范围。

第三十三轮因此只修复一个可复现的一致性 bug，不建立新 ADR：

1. 用两个公开 `NeuroAgentHarness`、同一个 `JsonlSessionStore` directory、`followUp()`、handle result 与 Snapshot/queue projection 建立红测；不读取私有 Map 或锁 helper。
2. Harness A 的 Model 保持 active，Harness B 向同一 Session durable queue 一个 follow-up；当前应红于本地 `active` 检查，目标是两端都能看到同一 queue item，并在 A 完成后只启动一次。
3. queue admission 以 Store Snapshot 的 `activeInvocationId` 为事实，并在同一次 commit 使用 `expectedActiveInvocationId`，避免 Invocation 已 terminal 后仍接受孤立 queue item。
4. 保留既有无 active Invocation 拒绝、payload validation、caller/message identity、pause/reorder/cancel 与 follow-up consume/start CAS；不增加 `queueIfBusy`、delivery key、Job/Workflow DTO、sidecar、SSE Transport 或 NeuroBook/Cosmos 修改。
5. 先跑单文件 red→green，再跑 coordination/admission/recovery/identity focused、`bun run verify`；只有公共包边界变化时才追加 `pack:smoke`。

### 第三十三轮执行与 focused 验证（2026-08-10）

- public red 使用两个独立 Harness/JsonlSessionStore 和同一 directory：Harness A 的 Model 保持 running，Harness B 调用 `followUp()`。基线为 2 pass / 1 fail / 12 expect calls，精确错误是 `Session 1 没有 active Invocation`。
- `followUp()` 现在先读 Snapshot `activeInvocationId`，无 owner 仍保留原拒绝；queue commit 增加 `expectedActiveInvocationId`。没有新增类型、ledger entry、Store operation 或公共参数。
- 初始 green 为 3/0/19；随后补齐 durable waiting owner 与 observed owner 在 queue commit 前 terminal 的回归。最终单文件为 5/0/26；terminal race 返回 `InvocationOwnershipError`，queue 保持为空。
- 受影响 focused 为 34/0/173，typecheck 与 `git diff --check` 通过。完整 red→green、边界和后续门禁见 [第三十三轮 walkthrough](walkthroughs/2026-08-10-cross-harness-follow-up-admission.md)。
- `bun run verify` 为 179/0/888，覆盖 38 个测试文件并通过 typecheck/build；post-fix 独立只读审查返回 `No P0/P1/P2 findings.`。本轮没有公开类型、导出、包入口或依赖变化，未重复 `pack:smoke`。

### 回到规划：第三十四轮 follow-up control CAS（2026-08-11）

第三十三轮修复 queue admission owner 后，继续审计同一 ledger 的控制面：

- `cancelFollowUp()` 先用 `followUpState()` 确认 item 存在，再无条件追加 `harness.followUp.cancelled`；
- `reorderFollowUps()` 先确认 IDs 是当前 queue 的 exact permutation，再无条件追加 `harness.followUp.ordered`；
- 若 `startNextFollowUp()` 在两者 read 与 commit 之间先原子提交 `startInvocation + harness.followUp.consumed`，后到的 cancel/reorder entry 只会成为 no-op，但 API 仍返回成功。调用方会误以为尚未开始的 item 已取消或按原集合重排。

第三十四轮选择两个顺序 TDD tracer，共用一个合同：依赖“item 仍 pending / IDs 仍是 exact permutation”的控制操作必须把 observed Snapshot version 带到 commit。

1. 先冻结 stale cancel commit，让 `resumeFollowUps()` 先启动并 consume 队首；当前 cancel 会假成功，目标是 `SessionConflictError` 且已启动 Invocation 不被改写。
2. cancel green 后，再以同样顺序冻结 stale reorder；目标是队列集合变化后拒绝旧 permutation，而不是静默把已消费 ID 过滤掉。
3. 只修改 cancel/reorder 的 Snapshot read 与 `expectedVersion`；pause/resume 是独立的最后命令优先 boolean，不依赖 exact item 集，本轮不改变。
4. 不增加 queue revision、公共参数、delivery key、exactly-once、busy invoke、Job/Workflow DTO 或跨进程 EventHub。
5. focused 覆盖 Memory/JSONL admission、coordination、consume/recovery 与 identity；再跑 `bun run verify`、walkthrough 和独立审查。无公共包边界变化时不重复 `pack:smoke`。

### 第三十四轮执行与 focused 验证（2026-08-11）

- cancel tracer 先冻结 `harness.followUp.cancel` commit，让 `resumeFollowUps()` 先原子启动并 consume 队首。基线 2 pass / 1 fail / 10 expect calls，失败原文为 `Expected promise that rejects / Received promise that resolved`。
- cancel 改为从同一 Store Snapshot 投影 queue，并在 control commit 使用 `expectedVersion`；单文件转为 3/0/11。
- reorder tracer 再冻结 `harness.followUp.reorder` commit并重复 admission-first 顺序。基线 3/1/13，同样因 promise resolved 而红；加入同一 observed-version CAS 后最终单文件 4/0/14。
- focused 为 36/0/179，typecheck 与 `git diff --check` 通过。完整 seam、red→green、兼容边界和最终门禁见 [第三十四轮 walkthrough](walkthroughs/2026-08-11-follow-up-control-cas.md)。
- `bun run verify` 为 181/0/894，覆盖 38 个测试文件并通过 typecheck/build；post-fix 独立只读审查返回 `No P0/P1/P2 findings.`。无公开类型、导出、包入口或依赖变化，未重复 `pack:smoke`。

### 回到规划：第三十五轮 reserved follow-up facts（2026-08-11）

follow-up admission/control CAS 收口后，继续检查 ledger 的写权限边界：

- public `harness.write()` 可以直接追加 shape-valid `harness.followUp.queued/paused/cancelled/ordered/consumed`；
- Profile Hook 与 Tool effect 的 write plan 也走同一 `commit()`，当前只自动附加 Invocation owner，不拒绝 follow-up kinds；
- `projectFollowUps()` 会解释这些 entry，因此调用方可以绕过 payload parser、owner CAS、message identity 和 control precondition。

这不是把宿主视为不可信沙箱，而是维护 Harness 深模块合同：调用 Harness 的公开 write/effect seam 时，Core-owned coordination facts 只能由对应状态机产生。直接绕过 Harness 操作自定义 Store 仍属于受信任宿主责任。

本轮建立 ADR-0018（Proposed），顺序执行两个 public tracer：

1. `harness.write()` 尝试伪造 queued/paused fact；当前会改变 `followUpState()`，目标是在 Store 前以 `SessionInvariantError` 拒绝且 Snapshot 不变。
2. host-write green 后，Profile `beforeTurn` effect 尝试写 paused fact；目标是 Invocation 明确失败、Model 不运行、queue state 不改变。
3. 内部 `followUp()`、pause/cancel/reorder/resume 和 consume/start 通过私有 commit permission 继续工作；legacy JSONL 只读恢复不受影响。
4. 只保留 `harness.followUp.*`，不在无证据时锁死整个 `harness.*`；不增加公共 token、namespace registry、Store ACL、delivery/Job 或插件沙箱。
5. public behavior 收紧后跑 focused、`bun run verify` 与 `bun run pack:smoke`，再做独立审查并决定 ADR-0018 是否接受。

### 第三十五轮执行与 focused 验证（2026-08-11）

- public host forge tracer 基线为 0 pass / 1 fail / 1 expect call，失败原文是 `Expected promise that rejects / Received promise that resolved`；shape-valid queued fact 会进入真实 projection。
- `commit()` 新增私有 `allowFollowUpFact` permission 与统一前缀检查；queue、pause/cancel/reorder/resume 和 atomic consume/start 六类内部提交显式放行，public write 与 invocation-owned effect 默认拒绝。
- host green 后枚举 queued/consumed/cancelled/paused/ordered 五种 fact；Profile `beforeTurn` effect forge 以 failed Invocation 收口，Model 请求为 0，queue 不改变。最终 reserved 文件为 2/0/12。
- 首次受影响 focused 为 53 pass / 1 fail / 224 expect calls，唯一失败是 identity legacy fixture 使用 public write 伪造旧 queue。fixture 改为受信任 Store 直写后，继续证明缺失 identity 的旧记录可恢复，生产 API 不放宽。
- 最终 focused 为 54/0/231，typecheck 与 `git diff --check` 通过。完整决策、red→green、legacy 路径和边界见 [第三十五轮 walkthrough](walkthroughs/2026-08-11-reserved-follow-up-facts.md)。
- `bun run verify` 为 183/0/906，覆盖 39 个测试文件并通过 typecheck/build；`bun run pack:smoke` exit code 0，101-file tarball 的 Bun/Node ESM consumer 均通过。
- post-fix 独立只读审查返回 `No P0/P1/P2 findings.`；ADR-0018 已在 standalone Core 范围接受，本轮收口并回到规划。

### 回到规划：第三十六轮 bounded Event Subscription lifecycle（2026-08-11）

三路只读规划与主线源码复核得到：

- NeuroBook `1c0a13d0` 的 missing linked Session recovery 是 relation/DTO 产品合同，`2e0c94a6` 的 durable Job history 继续归宿主；两者不移植到 Core。
- Cosmos PRD v0.13 与 durable Workflow ADR 仍要求 Cosmos 持有 Workflow/Run/Step/Job、Lease、Outbox、DomainEvent 和 HTTP/SSE，Harness 只作为 Agent Invocation/Session/Model/Capability Adapter。
- 当前 `EventQueue.values` 对每个慢 subscriber 无上限；iterator 没有 `return()`，`for await` break 不注销 subscriber。既有 explicit close 则有 intentional graceful-drain 兼容语义，不能收紧成 discard。
- replay 只有条数上限，没有 serialized-byte 上限；publish 的嵌套 payload 仍引用调用方可变对象。上述状态由 Core Event Hub 自己持有，不能依赖 HTTP writer 修复。

第三十六轮先以 `Proposed` 状态建立 ADR-0019，只做 provider-neutral Event Subscription 生命周期：

1. 先以 public `close()` tracer 审计关闭后的 queued event；初始假设“立即 discard”被既有 terminal-event focused 否决，最终保留 graceful drain；
2. 逐个 vertical slice 增加 iterator return、count/byte overflow、replay byte bound、immutable publish、Hub close 与 Harness owned/injected ownership；
3. pending replay 与 live queue 分离，避免合法 replay 被较小 live limit 误判为 slow consumer；
4. overflow 关闭单一 subscription 并释放引用，不阻塞 publish、不静默丢事件后继续；
5. HTTP/SSE frame、socket backpressure、heartbeat、鉴权、前端 reconnect、产品 DTO、跨进程 EventHub 和 durable domain event 继续留在宿主。

### 第三十六轮执行、绕道与主流程验证（2026-08-11）

- 初始 public close tracer 为 1 pass / 1 fail / 7 expect calls：旧实现 close 后仍返回 queued event。最初将目标设为 immediate discard，单文件转绿，但扩大 focused 后出现 43/12/196，所有失败都是 terminal events 被清空。
- 既有 abort/ownership/turn-failure tests 证明 public `close()` 的兼容语义是“停止接收新事件后 graceful drain”。实现修订为：explicit close 保留队列；iterator return/throw、overflow 与 Hub close 才 immediate discard。同一 focused 随后为 55/0/215。
- publish 现在在推进 seq 前一次性 JSON serialize、detach 与 recursive freeze；循环 payload 失败时 seq/replay 不变。Replay 与 live item 共享内部 `{event, serializedBytes}`，公开 API 不暴露 Buffer/SSE frame。
- `SessionEventHubOptions` 增加 replay/live count + serialized-byte hard limits；pending replay 与 live queue 分离。slow subscriber overflow 只关闭自身，暴露 abort signal 与 `queue_overflow`，快速 subscriber 继续收到单调 seq。
- `EventSubscription` 现在同时是 AsyncIterable/AsyncIterator，公开 `next/return/throw`、signal 和 close reason；Hub 提供 payload-free metrics 与幂等 close。
- Harness 记录 Event Hub ownership：dispose 关闭默认 owned Hub，但不关闭宿主注入的共享 Hub。
- 首次独立审查发现单一 pending resolver 被并发 `next()` 覆盖的 P1；公开红测为 19/1/68，确定性探针显示 first timeout、second 收到 event。
- 内部改为 FIFO pending waiter，publish 按调用顺序交付，所有关闭路径结算全部 waiter；EventHub 为 21/0/70，受影响 focused 为 59/0/225，typecheck 通过。
- P1 修复后 `bun run verify` 为 203/0/970；`bun run pack:smoke` exit code 0，101-file tarball 的 Bun/Node ESM consumer 通过。
- Post-fix 独立只读审查返回 `No P0/P1/P2 findings.`；ADR-0019 已在 standalone Core 范围接受，本轮收口并回到规划。

### 回到规划：第三十七轮 JSONL Session creation race（2026-08-11）

- NeuroBook 对照确认 message identity、bounded abort/partial、动态结构化结果已有 standalone 等价合同；最新 SSE product shutdown 继续属于 Transport。
- Cosmos 当前没有真实 Agent/LLM 生产调用路径；现有 consumer fixture 已覆盖文档可推出的 Profile、ModelRuntime、Capability、结构化 output、JSONL recovery 和 cursor seam，不新增推测 API。
- standalone reviewer 发现 `CommitWorkflowScheduler.dispose()` 对非合作 handler 可无限等待；主线公开探针确认 abort signal 已触发但 100ms 后仍 timeout，保留为下一候选。
- 更高优先级的 JSONL public probe：两个独立 Store 自动 create 30/30 重复 ID，2/30 随后不可读；显式同 ID 30/30 双成功，4/30 随后不可读。序列损坏还会被 catch-all 当作 0。
- ADR-0020（Proposed）单独扩展 ADR-0004：sequence 全局锁、严格 fail-closed、显式 ID 推进、per-session create lock 和 `wx`；不改写 0004 的 commit-only 历史，不引入新依赖或数据库。

### 第三十七轮执行与局部验证（2026-08-11）

- `allocateId()` 现在同时经过实例内 FIFO tail 与 `session-seq.json.lock`；只有 `ENOENT` 代表初始 0，malformed、非法/耗尽 value 和其它 I/O 均 fail closed。
- 显式 ID 会先推进 sequence；初始 Session 文件复用 per-session lock 并以 `wx` exclusive create。自动创建遇到旧目录中已存在 candidate 时继续分配，允许 gap、不得复用。
- 新增两个独立 Store、Bun 子进程和 Node ESM 子进程的自动/显式竞争回归，以及 sequence corruption、value validation、显式推进和落后 candidate 回归。
- 当前 `bun run typecheck` 通过；扩大 focused 为 38 pass / 0 fail / 198 expect calls；`git diff --check` exit 0，仅有 Windows LF → CRLF 提示。
- `bun run verify` 为 211 pass / 0 fail / 1016 expect calls；`bun run pack:smoke` exit code 0，101-file tarball 为 100.5 kB / 487.5 kB unpacked，Bun/Node ESM consumer 通过。
- 独立只读 pre-acceptance review 重跑 JSONL/lock 29/0/133 并返回 `No P0/P1/P2 findings.`；只读 sandbox 未运行 full/package，不替代主流程证据。
- ADR-0020 已在 Windows 本地文件系统、第一方 allocate/create 范围接受。SMB/NFS、无锁 read 线性一致、自动 stale takeover、fsync/syscall 原子性和真实消费者/Transport/产品验收继续不承诺。完整 red→green 与范围见 [第三十七轮 walkthrough](walkthroughs/2026-08-11-jsonl-session-creation-race.md)。

### 回到规划：第三十八轮候选（2026-08-11）

- 首选重新验证 `CommitWorkflowScheduler.dispose()` 对不合作 handler 的无界等待；第 37 轮公开探针已经观察到 abort signal，但 100ms 后仍 timeout。
- 先冻结 Scheduler 当前 queue/dirty rerun/dispose 合同，再决定是只做 bounded shutdown、增加显式 timeout/结果，还是把 handler ownership 留给宿主。只有 public red 能证明 Core 生命周期缺口时才建立 ADR。
- 继续并行核对 NeuroBook portable parity 与 Cosmos 真实文档需求；不把 Job/Run/Step/Lease/Outbox、durable delivery、HTTP/SSE 或产品 DTO 下沉 Core。

### 第三十八轮计划：bounded Commit Workflow Scheduler shutdown（2026-08-11）

- 三路只读规划确认 NeuroBook 最新变化仍是 relation/Job/product SSE，Cosmos 继续持有 durable Workflow truth；没有新的消费者依据要求扩张 Core API。
- 公开探针再次得到 `{"result":"timeout","observedAbort":true}`：Scheduler 已发送 abort，但 `dispose()` 仍被不合作 `run()` 永久悬挂。
- ADR-0021（Proposed）计划增加可选 `abortGraceMs` 和 Scheduler-owned forced completion boundary；保留普通 `drain()`、same-key coalescing 与 observer 非阻塞语义。
- 执行不能只在 `dispose()` 外层加 race：必须同时关闭 admission、丢弃 dirty pending、detach `runState` / `onError`、观察迟到 rejection、处理 reentrant select 和共享 repeated-dispose Promise。
- 不实现 run timeout、Job/Lease/Outbox、durable cancellation、HTTP/SSE 或宿主产品 shutdown。详细 public red、API 取舍和 TDD 顺序见 [第三十八轮 walkthrough](walkthroughs/2026-08-11-bounded-workflow-scheduler-shutdown.md)。

### 第三十八轮执行与局部验证（2026-08-11）

- 正式 public red 为 1 pass / 1 fail / 4 assertions，唯一失败是 `dispose()` 未在 300ms 内完成；handler 已观察到 abort。
- 新增可选 `abortGraceMs`、共享 dispose Promise、pending dirty drop、forced `runState` / `onError` completion、迟到 rejection observer 与 reentrant admission double-check。
- 首轮 Scheduler 9/0/20 green 后，主线发现共享永不 resolve Promise 会为每个正常 job 保留 reaction 的 P1；改为可移除的 forced-completion AbortSignal listener。
- 第一次独立 review 发现 abort listener 可在 `disposePromise` 缓存赋值前重入的 P1；public 9/1/21 red 后改为先安装 deferred cache，再触发 abort。
- 最终 Scheduler 为 10/0/21；Workflow/observer/abort 扩大 focused 为 29/0/104；`bun run verify` 为 220/0/1033。
- `bun run pack:smoke` exit code 0；101-file tarball 为 102.0 kB / 494.6 kB unpacked，Bun/Node consumer 均验证 Scheduler options/构造/dispose。
- Post-fix 独立 review 返回 `No P0/P1/P2 findings.`；ADR-0021 已在 standalone Scheduler lifecycle 范围接受。raw handler 资源终止与 durable Workflow truth 继续归宿主。

### 回到规划：第三十九轮候选（2026-08-11）

- 重新从 NeuroBook portable parity、Cosmos Adapter 需求和 standalone 公共合同三路审计，不默认继续扩 Scheduler。
- 优先选择可由 public tracer 证明的 correctness/recovery 缺口；若只有产品 Job/SSE/Relation 或推测 API，则记录边界并转向下一候选。
- 继续排除 sidecar、Job/Run/Step/Lease/Outbox/delivery/exactly-once 和宿主 DTO，不修改 NeuroBook/Cosmos。

### 第三十九轮计划：durable approval resume admission（2026-08-11）

- standalone 广审发现 approval resolution 的 durable `resumeInvocation` 位于 Tool 执行之后；跨 Harness contender 会先重复副作用，再由后置 commit 冲突。
- NeuroBook 当前已有“waiting 后并发 resolution 只能一个 claim 成功”的回归；portable 行为应吸收，产品 Session mutation lock/acceptance DTO 不移植。
- Cosmos 继续持有 Workflow/Run/Step/Job、Lease、Outbox 和副作用；当前无真实 Agent path，不要求新 Core API。
- 正式 public red 使用两个 Harness + 共享 Memory Store：3/1/21，两个 resume admission 都 fulfilled，获批 Tool 执行 2 次。
- ADR-0022（Proposed）计划在 Capability/Tool/Provider 前用 observed version + durable owner CAS 提交 waiting → running claim；winner 执行，loser fail closed。外部 exactly-once、Job/Lease/Outbox 和自动 interrupted replay 明确不承诺。
- Snapshot/cursor 竞态与 JSONL recovery I/O 吞错分别保留为后续候选，不与本轮混合。详细证据与 TDD 顺序见 [第三十九轮 walkthrough](walkthroughs/2026-08-11-durable-approval-resume-admission.md)。

### 第三十九轮执行与局部验证（2026-08-11）

- `resume()` 先提交 `expectedVersion + expectedActiveInvocationId + resumeInvocation` claim，再创建 attempt/执行 Tool；Memory 跨 Harness red 已转绿。
- 新增独立 JSONL Store/Harness 竞争：恰好一个 claim，Tool 一次，winner completed Snapshot 与唯一 Tool result 可由新 Store 恢复。
- 首次扩大 focused 暴露 prepare Snapshot 回归；保留 observed waiting Snapshot 作为 attempt-only prepare/Capability 输入，ContextProvider 继续读取 resolution 后最新 Snapshot。
- 发现重复 resolution ID 可伪装完整集合的第二个 P1；public 4/1/26 red 后增加 pending/resolution exact-set 校验，claim/Tool 前 fail closed。
- durable claim 后既有 cross-Harness abort race 首次失败；`abort()` 对无本地 handle 的 durable running/waiting owner 统一使用有限重试 CAS，恢复 aborted terminal/usage 合同。
- 最终 approval/recovery/context/ownership/abort/result focused 为 77/0/387；`bun run verify` 为 223/0/1050。
- `bun run pack:smoke` exit code 0；101-file tarball 为 102.6 kB / 497.0 kB unpacked，Bun/Node consumer 通过。
- 独立 review 唯一 finding 是 README 可能把 admission 误读为 exactly-once 的 P2；文档收窄后 post-fix review 返回 `No P0/P1/P2 findings.`。ADR-0022 已在 standalone Harness approval-admission 范围接受。

### 回到规划：第四十轮候选（2026-08-11）

- 第一候选是 `snapshot()` 的 Store read 与 Event cursor 竞态：若并发 commit 位于两次读取之间，可能返回旧 Snapshot + 新 cursor，使恢复消费者跳过对应 event。先用可控 public Store/event tracer 验证，不预设修法。
- 第二候选是 JSONL `reconcileInterrupted()` 对 `sessions` 目录非 ENOENT I/O 的 catch-all；先证明普通文件/权限错误会被静默当成空恢复集。
- 继续并行检查 NeuroBook portable parity 与 Cosmos Adapter 需求；没有 public correctness 证据时不扩 API。

### 第四十轮计划：Snapshot Replay Cut（2026-08-11）

- NeuroBook 当前 Task 106 与公开 `session-query.test.ts` 已确认同类 recovery 缺口：cursor 必须先于 Session read 捕获，读取期间 append/publish 允许与 Snapshot 重叠，并按稳定 Entry ID 去重。
- standalone 当前 `snapshot()` 顺序仍是 `store.read()` → `events.cursor()`；先用 gated public Store + `snapshot()` / `write()` / `subscribe()` 建立正式 red。
- ADR-0023（Proposed）把 `HarnessSnapshot.cursor` 定义为 replay-safe lower bound，而不是 Store/Event exactly-once cut；随后逐个审计 `write()` 与 `createSession()`，不能只修一个 producer。
- 明确排除跨进程 EventHub、Outbox、HTTP/SSE DTO、Job/Lease/delivery/exactly-once 和 NeuroBook/Cosmos 修改。

### 第四十轮执行与局部验证（2026-08-11）

- 三类 public tracer 分别在 `snapshot()` Store read、`write()` commit return、`createSession()` create return 窗口插入 durable write；旧实现都能得到“返回 Session 未覆盖、返回 cursor 已越过”的静默缺口。
- red 依次为 1/1/7、2/1/10、3/1/17；`snapshot()` 改为 cursor → read，`write()` 改为 commit 前 cursor，`createSession()` 成功后复用 `snapshot()`。
- 最终 persistence-events 单文件为 4/0/17；events/Harness/Cosmos/Workflow/recovery focused 为 55/0/254，typecheck 通过。
- overlap 允许 replay 已在 Snapshot 中的 durable entry/status；消费者按 Entry ID 合并并按 version 单调应用 status。
- gated write 额外证明共享 Event Hub 的跨 Harness publication 可能与 Store version 顺序不同；作为下一轮候选，不混入 ADR-0023 的返回 cut。
- `bun run verify` 为 226/0/1062；`bun run pack:smoke` 为 exit 0，101-file tarball 103.1 kB / 498.2 kB unpacked，Bun/Node consumer 通过。
- 独立 read-only review 返回 `No P0/P1/P2 findings.`；reviewer 复跑测试因只读 Bun `EPERM` 未执行，不替代主流程门禁。ADR-0023 已在 standalone HarnessSnapshot recovery-cut 范围接受。

### 回到规划：第四十一轮候选（2026-08-11）

- 第一候选是共享 `SessionEventHub` 的跨 Harness durable publication ordering：Store version 2 的 entry/status 可以先于 version 1 发布，seq 连续但 projection 因果顺序倒置。先把第四十轮 gated commit 观察升级为正式 public red，评估 EventHub batch/order seam；不预设进入跨进程 EventHub。
- 第二候选继续保留 JSONL `reconcileInterrupted()` 对 `sessions` 目录非 ENOENT I/O 的 catch-all，验证普通文件/权限错误是否被静默当成空恢复集。
- 继续对照 NeuroBook portable parity 与 Cosmos Adapter 需求；不把 HTTP/SSE DTO、Outbox、Job/Lease/delivery/exactly-once 下沉到 Core。

### 第四十一轮计划：Durable Event Causality Guard（2026-08-11）

- NeuroBook 通过 per-session `SessionWriteExecutor` queue 保持 repo append 与 event publication 因果顺序；Cosmos 的 durable DomainEvent/Outbox 继续归宿主。
- standalone 不给可注入 Store 强加 EventHub mutation lock；ADR-0024（Proposed）计划把每次 Harness commit 的 entry/status 当作 batch，version 不连续/倒退时整批 fail closed 为 `snapshot_required(commit_order)`。
- 第一条 public tracer 复用 gated Memory Store、两个 Harness 与 shared EventHub；可接受结果是因果顺序完整交付，或在旧 batch 前明确要求 Snapshot，不能继续输出 seq 连续但 version 倒置的 stream。
- runtime/host events、跨进程 EventHub、SessionCommitObserver 派生 view ordering、HTTP/SSE 和产品 DTO不在本轮。

### 第四十一轮执行与局部验证（2026-08-11）

- 两 Harness + shared Memory Store/EventHub 的正式 red 为 4/1/23：entry 顺序为 version 2 fact → version 1 fact，status versions 为 2 → 1，且没有 recovery signal。
- process-local EventHub/Session version guard 将一次 commit 的 entry/status 作为 batch；倒退、重复或 forward gap 整批替换为 `snapshot_required(commit_order)`，不新增 Store lock 或公共 coordinator。
- forward-gap tracer 证明 signal 可 replay，Snapshot 恢复含全部 dropped-publication facts，下一连续 version 可恢复增量；新 EventHub 首次观察非 1 version 不误报。
- 最终 persistence-events 为 6/0/29；events/observer/terminal/Cosmos/Workflow focused 为 83/0/313，typecheck 通过。
- 直接 host publish、跨进程/duplicate-package EventHub、observer 派生 view ordering、HTTP/SSE recovery 与产品接入仍未验证。
- 首次独立 review 发现不同 Store 同名 Session 与同 Store 重用 Session ID 两个 P1，以及 guard map/Store 引用不随 Hub close 释放的 P2。
- 两个 P1 分别以 6/1/35、7/1/40 public red 复现；baseline 现绑定弱 Store identity token + `metadata.createdAt` generation + version。identity/generation mismatch 持续 fail closed，要求新 Hub/epoch。
- guard 已移入 internal module，Hub close 清理 baseline且不强引用 Store；post-fix events+persistence 为 29/0/109，typecheck 通过，等待 full/package/post-fix review。
- 第二次独立 review 又发现 `createdAt` 碰撞与 batch 中途 publish failure 两个 P1；同 timestamp recreation 与 hostile Store partial-publication 正式 red 合计为 7/2/42。
- generation 改用 Store-local opaque token；commit 在 await Store 前捕获 token，EventHub batch 先完成原子 staging。
- EventHub internal atomic batch 在任何 seq/replay mutation 前 stage 全部 event；失败时不留前缀，只 replay `snapshot_required(commit_order)`，Snapshot 后下一连续 version 恢复。
- 第二次修复后 persistence-events 为 9/0/46，扩大 focused 为 86/0/332，typecheck 通过。
- 第三次独立 review 发现 recreation 可超越旧 commit return：旧 fact 会在新 Store generation 已建立、Harness handshake 未完成时泄漏；filtered red 为 0/1/6。
- create 现在从调用 Store 前持有 pending publication fence；pending commit 只发 recovery signal，成功绑定新 token，失败撤销 fence。旧 delayed commit 与 failed duplicate create recovery 都有 public regression。
- 第三次修复后 persistence-events 为 11/0/57，扩大 focused 为 88/0/343，`bun run verify` 为 233/0/1102；package smoke 为 105 files、107.6/518.8 kB。
- 第四次独立 review 发现 pending 期间捕获、写入旧 Session、create 成功后才返回的 commit 会冒充新 generation；无旧 baseline 的 filtered red 为 0/1/6。
- publication attempt 现永久保存 `capturedDuringCreation`，create 成功不能追认 pending-captured commit；对称 interleaving public tracer 已转绿。
- 第四次修复后 persistence-events 为 12/0/62，扩大 focused 为 89/0/348，`bun run verify` 为 234/0/1107；package smoke 为 105 files、107.8/519.5 kB。
- 第五次独立 review 按 capture/publication × create pending/success/failure 的完整时间线、unknown ID、atomic batch、Hub lifecycle 与 package boundary 重审，返回 `No P0/P1/P2 findings.`。
- ADR-0024 已在 standalone in-process Harness durable-publication scope 接受；跨进程 EventHub、Transport 产品恢复、observer 派生 view 与 exactly-once 继续不在 Core 本轮范围。

### 回到规划：第四十二轮候选（2026-08-11）

- 第一候选继续验证 JSONL `reconcileInterrupted()` 枚举 `sessions` 目录时的 catch-all：非 `ENOENT` I/O、路径类型或权限错误不能被静默当成“没有可恢复 Session”。先用 public Store tracer 建立错误 taxonomy red，不预设实现。
- 第二候选是 portable package 的内部 declaration/export hygiene；ADR-0024 的 symbol seam 已通过 package smoke，本轮只在真实 consumer 证据发现问题时再扩展。
- 继续对照 NeuroBook portable fixes 与 Cosmos Adapter 需求；不把 Job/Run/Step/Lease/Outbox/delivery/exactly-once、HTTP DTO 或产品 mutation lock 下沉到 Core。

### 第四十二轮计划：JSONL Recovery Scan Error Preservation（2026-08-11）

- `JsonlSessionStore.reconcileInterrupted()` 当前用 `readdir(...).catch(() => [])` 枚举 `sessions`，会把目录不存在与目录形状错误、权限/占用及未知 I/O 全部解释为“没有可恢复 Session”。
- Bun/Windows 实际文件系统 spike 已确认：当 `<root>/sessions` 是普通文件时，`readdir(..., {withFileTypes: true})` 以 `code=ENOTDIR`、`syscall=scandir` 拒绝；旧实现会静默返回空数组。
- public seam 固定为 `JsonlSessionStore.reconcileInterrupted()`：先保留“全新 root / `sessions` 不存在返回 `[]`”的兼容性，再用普通文件 fixture 建立 `ENOTDIR` red；测试不调用内部 helper、不 mock 文件系统。
- 最小实现只把 `ENOENT` 归一为空列表，其它错误原样上抛。`JsonlLockIoError` 属于 lock taxonomy 且携带 `lockPath`，不用于普通 recovery scan；本轮没有公共 API、持久格式或跨 Task 决策，不建立新 ADR。
- 单个 `.jsonl` 在枚举后消失、损坏或不可读时继续 fail closed；不扩展为 per-file skip、产品 issue/listing projection、自动修复或迁移系统。
- 计划 gate：`tests/jsonl-store.test.ts` red/green；随后 `jsonl-store + recovery + invocation-ownership` focused、typecheck、`bun run verify`、`bun run pack:smoke`、`git diff --check` 和独立只读审查。真实权限拒绝、网络文件系统、NeuroBook/Cosmos 接入与产品恢复 UI 仍不在本轮验收范围。
- 详细证据与执行记录见 [第四十二轮 walkthrough](walkthroughs/2026-08-11-jsonl-recovery-scan-errors.md)。

### 第四十二轮执行与验证（2026-08-11）

- 先建立缺失 `sessions` 目录的兼容护栏：1/0/1；随后普通文件 fixture 的正式 red 为 0/1/1，旧实现意外 resolve 空数组而不是拒绝 `ENOTDIR`。
- `reconcileInterrupted()` 现在只在 `readErrorCode(error) === "ENOENT"` 时返回空列表，其它错误对象原样上抛；没有增加公共错误类型、Store API 或持久格式。
- filtered green 为 2/0/2；完整 `jsonl-store` 为 23/0/106；`jsonl-store + recovery + invocation-ownership` focused 为 48/0/197；typecheck 通过。
- `bun run verify` 为 236/0/1109；`bun run pack:smoke` exit 0，105-file tarball 为 107.9 kB / 520.1 kB unpacked，Bun/Node consumer 通过。
- 首次独立只读 review 未发现代码、跨平台 errno、TOCTOU 或测试敏感性 P0/P1/P2；唯一 P2 是 walkthrough 尚停留在计划态。执行证据回写后，第二次 review 只指出 acceptance/TODO 仍保留“等待复核”状态；这些跟踪字段现已关闭，未留下 P0/P1/P2。
- 真实 ACL/sharing violation、Linux/macOS/网络文件系统、单文件枚举后消失与真实 NeuroBook/Cosmos 产品恢复仍未验证，不从本轮结果外推。

### 回到规划：第四十三轮候选（2026-08-11）

- 重新从 NeuroBook 最新 portable Harness 修复、Cosmos 可逆 consumer 需求与 standalone 公共包边界三路取证，不默认延续 JSONL 小修。
- portable declaration/export hygiene 只有在 packed Bun/Node consumer 或公开类型 tracer 出现真实 red 时才进入实现；当前 `pack:smoke` 仍是 green。
- `reconcileInterrupted()` 的 per-file TOCTOU、权限矩阵与产品 issue projection 保留为边界，不在缺少稳定 public red 时扩成迁移/容错系统。
- 下一轮继续优先选择会导致事实丢失、重复副作用、恢复跳过或误导性成功的 correctness 缺口；若只有宿主 Job/Transport/DTO 需求，记录归属后换候选。

### 第四十三轮计划：Tool Call Identity Admission（2026-08-11）

- NeuroBook 的 Harness 相关提交仍止于 2026-08-08；其最新 recovery/Job 差异已经归入 standalone 或宿主边界。Cosmos 继续明确持有 Workflow/Run/Step/Job/Lease/Outbox，当前没有新的 Core consumer API red。
- 三份只读规划中，consumer 审查没有 actionable gap；storage 审查提出的 Memory concurrent create race 被真实 public tracer 证伪，结果为一 fulfilled / 一 rejected 且首个 initial 未被覆盖；package smoke 行为覆盖属于后续 gate 增强，不是当前 production bug。
- Core 审查保留 publication-failure orphan 与公开 `setStatus` 矛盾状态两个候选；前者依赖宿主在 Harness 活跃时关闭 injected Hub，后者依赖受信任宿主直接提交低层状态操作，均低于真实 Provider 可触发的 Tool side-effect 缺口。
- 正式选择 Tool Call Identity：同 assistant 重复 ID 已实际执行两次并 completed；跨 turn 复用 ID 后，approval resume 被旧 completed-ID Set 吞掉，新 Tool 未执行却 completed。
- ADR-0025（Proposed）冻结：最终 assistant Tool Call ID 非空、在当前 active durable Session transcript 内唯一；校验发生在 assistant commit/approval/Tool 前；legacy waiting transcript 用按顺序一对一 occurrence matching 恢复。ID 不是外部幂等键。
- TDD 分三条垂直切片：同 message duplicate → visible transcript reuse → legacy waiting recovery；随后补 compaction occurrence guard。每条先 public red，再最小 green，不把 Tool registry、Provider DTO 或 exactly-once 混入。
- 计划 gate：新 identity focused + approval/parallel/compaction/recovery/model tests，typecheck、`bun run verify`、`bun run pack:smoke`、`git diff --check` 和独立只读审查。
- 详细证据见 [第四十三轮 walkthrough](walkthroughs/2026-08-11-tool-call-identity-admission.md)。

### 第四十三轮执行与验证（2026-08-11）

- 同 message duplicate formal red 为 0/1/1：旧实现返回 completed；当前在 assistant commit 前失败，Tool 0 次且无 invalid assistant/result fact。
- 跨 turn reuse red 返回 waiting 而非 failed；active durable transcript admission 后，第二个同 ID 调用在 approval request/waiting 前失败，第一 turn 已确认结果保持。
- 空 ID red 返回 completed；当前 whitespace-only ID 在副作用与 transcript 前失败。
- legacy waiting red 虽 completed，但新 Tool 执行数组为空；`pendingToolCalls()` 现按 transcript occurrence 一对一消费 result，新 pending call 获批后执行一次。
- legacy compaction red 返回 completed 且执行 summarizer；`assertNoPendingToolCalls()` 复用同一 occurrence projection 后，单个旧 result 不再同时完成两个 call。
- 首次独立 review 发现 1 个 P1：带 `trim()` 的非字符串 ID 可通过校验、执行 Tool 并进入 durable result。public red 为 0/1/1；显式 string guard 后转绿。
- 自审将 identity failure usage 丢失升级为 public red：Provider 已返回 2/3/5，但失败 result 为 0/0/0。usage 现于 admission 前聚合，无效 assistant 不持久化，失败 terminal fact 恢复 2/3/5。
- identity 单文件现为 8/0/39；approval/parallel/compaction/recovery/partial/Harness focused 为 45/0/205，typecheck 通过。
- post-fix `bun run verify` 为 244/0/1148；`bun run pack:smoke` exit 0，105-file tarball 为 108.8/523.5 kB，Bun/Node consumer 通过；`git diff --check` exit 0。
- post-fix review 未发现 durable identity/usage/Tool/approval/compaction 的 P0/P1/P2，另指出 pre-admission `model_event` 可携带最终被拒绝 ID 的文档 P2。该流保持实时且不授权副作用；类型、README、CONTEXT、ADR 已明确 provisional/reconcile 合同，窄复审返回 `No P0/P1/P2 findings.`。
- 唯一性范围已收窄为 active durable Session transcript；临时 `PreparedRun.messages`/Context/Hook messages、stream accumulator 和外部 idempotency 不在承诺内。
- ADR-0025 已在 standalone Harness Tool Call identity scope 接受；真实 Provider、NeuroBook/Cosmos consumer、HTTP/SSE 产品 projection 与外部副作用幂等仍未验证。

### 回到规划：第四十四轮候选（2026-08-11）

- NeuroBook parity 审查确认 2026-08-08 后只有 turn transaction fixture timestamp 稳定化，没有新的 portable Harness 实现或公共合同；桌面安装、Manager、Job/relation/UI/HTTP/SSE 变化继续归产品宿主。
- Cosmos 仍明确持有 Workflow/Run/Step/Job/Lease/Outbox/DomainEvent/HTTP Transport；现有 Capability、anchor、structured output、event cursor 和 host metadata seam 足够保持未来 Adapter 可逆，Phase 1 不从 `pi-ai` 强迁。
- package smoke 可以继续增加 tarball 行为覆盖，但当前 Bun/Node consumer 已通过且没有 production red；测试增强低于已复现的 durable projection 矛盾。
- 三个 public spike 分别证明：
  - `setStatus(idle)` 可得到 `Session=idle + activeInvocationId=<running owner> + Invocation=running`；
  - 宿主在 Harness 活跃期关闭 injected EventHub 后，`invoke()` 抛 `event_hub_closed` 但 Store 留下 running owner；
  - mixed approval 被拒后，后续普通 Tool 仍执行。该行为属于 ADR-0022 已接受的多 approval exact-set/batch 语义，不能直接套用 NeuroBook 的 first-barrier 产品合同。
- 正式选择 Session Status / active Invocation 一致性：它由受信任宿主的公开 Store/write plan 稳定触发，会让 event consumer 误判 idle、而 abort/recovery 仍按 active owner 运行。publication-failure orphan 依赖宿主违反 injected Hub 生命周期，保留为下一候选。

### 第四十四轮计划：Session Status Ownership Invariant（2026-08-11）

- `SessionStatus` 已声明为 active Invocation 的 projection，但 reducer 的 `setStatus` 当前只赋值，不检查 durable owner 或 Invocation status。
- 新 canonical `Session Status` 明确为投影，不是第二份运行真相：
  - active `running` / `waiting` owner 只允许同名 Session Status 或 `aborting`；
  - 无 active owner 只允许 `idle` / `interrupted` / `archived`；
  - `startInvocation`、`waitInvocation`、`resumeInvocation`、`finishInvocation` 继续自动维护正常投影。
- Public TDD seam 复用 `verifyNumericStore()`，因此 Memory 与 JSONL 必须同时满足同一行为；先锁 active owner → idle rejection，再锁无 owner → running rejection，最后补 `aborting` / `archived` 正向护栏。
- 最小实现位于共享 reducer 的 `setStatus` admission，使用既有 `SessionInvariantError`；不新增类型、Store 方法、持久格式或 ADR。
- 计划 gate：Memory/JSONL Store contract red→green，store/recovery/events/Harness focused、typecheck、`bun run verify`；公共类型/导出与 package 内容不变，是否重跑 `pack:smoke` 由审查后的包边界判断。
- publication failure、mixed approval policy、跨进程 EventHub、Cosmos Job/Lease/Outbox、HTTP/SSE DTO、真实 NeuroBook/Cosmos 产品接入与任意 third-party malformed Snapshot migration 不在本轮。
- 详细证据见 [第四十四轮 walkthrough](walkthroughs/2026-08-11-session-status-ownership-invariant.md)。

### 第四十四轮执行与局部验证（2026-08-11）

- active owner → idle formal red 为 0/1/6；旧 Store commit 意外 resolve 并形成 `idle + running owner`。第一条 guard 后为 1/0/13。
- terminal owner 清除后 → running formal red 为 0/1/13；对称 no-owner guard 后为 1/0/17。
- running owner → waiting formal red 为 0/1/10，促使 active 侧从 idle 特判收敛为“匹配 Invocation status 或 aborting”；green 为 1/0/18。
- no owner → waiting formal red 为 0/1/18，no-owner 允许集收敛为 idle/interrupted/archived；green 为 1/0/19。
- 正向 contract 保留 active running/waiting → aborting、waiting restore 与 inactive archived；Memory/JSONL shared contract 为 2/0/58。
- store/recovery/ownership/events/Harness focused 为 81/0/356，typecheck 通过。
- `bun run verify` 为 244/0/1188；`bun run pack:smoke` exit 0，105-file tarball 为 109.6/526.6 kB，Bun/Node consumer 通过；`git diff --check` exit 0。
- 独立 review 复跑 Memory/JSONL 两文件为 26/0/158，并返回 `No P0/P1/P2 findings.`；本轮在 standalone first-party Store/reducer Session Status ownership scope 接受。

### 回到规划：第四十五轮候选（2026-08-11）

- 三路只读审查复核 durable publication acknowledgement、injected Event Hub lifecycle 和更普通的 public correctness gap。
- post-durable publication failure 已复现，但稳定触发依赖宿主在 Harness 活跃时关闭 injected Hub；typed post-commit error 与严格 host lifecycle 尚有合同分歧，attachment lease/refcount 又会扩大共享 Hub 和 shutdown 语义，本轮不抢跑 ADR-0024。
- package smoke 没有 package-only runtime red；mixed approval 属于 ADR-0022 exact-set batch policy；create/write acknowledgement 已由 Snapshot Replay Cut 覆盖；third-party malformed Snapshot migration 继续 out of scope。
- Tool 多 `writePlans` 的 partial commit 是真实风险，但现有合同只保证单 `SessionWritePlan` 内 operations 原子；是否增加 additive batch seam 需要独立 ADR，优先级低于既有恢复 API 的确定性竞争错误。
- 正式选择 concurrent Interrupted Reconciliation：两个公开 recovery caller 读取同一 running owner 后，winner terminalize，loser 的 owner/version CAS 冲突会 reject 整个 sweep，并可能跳过后续 Session。

### 第四十五轮计划：Concurrent Interrupted Reconciliation（2026-08-11）

- canonical `Interrupted Reconciliation` 表示启动恢复时把失去运行进程的 active running Invocation 收口为 interrupted；返回集合只包含本调用实际提交的 transition。
- 并发 reconciler 必须收敛：winner 提交一次；loser 回读到同一 Invocation 已 terminal 后跳过并继续扫描；同 owner 仍 running 时基于最新 Snapshot 有界重试。
- 无关 Store、I/O、lock、malformed Snapshot 与 invariant 错误继续 fail closed；不新增公共类型、持久格式、Job/Lease/Outbox、跨进程 Event Hub 或 exactly-once。
- Public TDD seam 为 `SessionStore.create/commit/reconcileInterrupted/read`：先同一 Memory Store red→green，再做共享目录的独立 JSONL Store，随后补继续扫描、冲突重试和非竞争错误护栏。
- 不建立新 ADR：这是既有 owner/version CAS 下的启动恢复幂等性修复，不形成不可逆架构选择。Event Hub acknowledgement 与 Tool multi-plan batch 继续作为后续独立候选。
- 详细依据、顺序和边界见 [第四十五轮 walkthrough](walkthroughs/2026-08-11-concurrent-interrupted-reconciliation.md)。

### 第四十五轮执行与验证（2026-08-11）

- Memory 与独立 JSONL Store 的并发 recovery formal red 都抛 `InvocationOwnershipError(expected=active, actual=null)`；winner 已 durable interrupted，但 loser 让整个 sweep reject。
- 同 owner 的普通并发写入 formal red 抛 `SessionConflictError(expected=1, actual=2)`；恢复者现在回读最新 Snapshot，同一 running owner 最多重试 3 次，已不再 active running 则跳过。
- 内部 `reconcileInterruptedSession()` 统一第一方 Store 状态机；返回集合只包含本调用实际提交的 transition。持续冲突耗尽、owner 形状异常和非 CAS Store/I/O/lock/invariant 错误继续 fail closed。
- multi-session guard 证明一个 benign loser 不阻止后续 Session；exhaustion guard 证明 3 次冲突后保留最后原始错误且不伪造 interrupted。
- Memory 为 7/0/57，JSONL 为 25/0/138；recovery/ownership/abort focused 为 69/0/338，typecheck 通过。
- `bun run verify` 为 250/0/1225；`bun run pack:smoke` exit 0，109-file tarball 为 110.7/529.4 kB，Bun/Node consumer 通过；`git diff --check` exit 0。
- 独立 review 覆盖 conflict/waiting/new-owner/retry/return/multi-session/JSONL/ESM/package/docs，并返回 `No P0/P1/P2 findings.`；本轮在 standalone first-party Memory/JSONL Store scope 接受。

### 回到规划：第四十六轮候选（2026-08-11）

- 三路只读规划比较 Tool multi-plan partial commit、Harness dispose/Event Hub lifecycle 与更普通的 NeuroBook/Cosmos/package correctness gap。
- `ToolResult.writePlans` 当前只承诺按序独立提交和单 `SessionWritePlan` operations 原子；数组级事务没有既有保证，当前定为 P2 API footgun。真实 batch consumer 出现前不引入自动 rebase、compensation、跨 Session transaction、Outbox 或 exactly-once。
- shared closable Store ownership 是 P1 候选，但当前 `dispose()` 明确释放 required Store，改变 borrowed/owned 默认会影响现有消费者；没有真实 shared closable Store red，保留为独立 ADR 候选。
- post-durable Event Hub ambiguity 本身仍需 typed acknowledgement ADR；但 concurrent Harness dispose 已提供普通合法入口：第二个 shutdown caller 会提前 resolve，宿主据此关闭 injected Hub 时，第一次 shutdown 仍可能执行 durable terminal publication。
- 公开延迟 Store spike 得到 `samePromise=false, firstSettled=false, secondSettled=true`。正式选择 Harness Shutdown Barrier。

### 第四十六轮计划：Harness Shutdown Join Barrier（2026-08-11）

- canonical `Harness Shutdown Barrier` 是首次 `NeuroAgentHarness.dispose()` 建立的唯一 completion Promise；concurrent、repeated 和 abort-listener reentrant caller 必须共享。
- barrier 等待已进入的 Invocation admission、active Invocation completion boundaries、Harness background work、owned Event Hub close 与 Store dispose；Store dispose rejection 也由所有 caller 共享。forced boundary 后的 raw 外部 Promise 继续不在等待范围。
- injected Event Hub 仍由宿主管理，但必须 outlive 所有使用它的 Harness barriers；不新增 Hub lease/refcount、typed post-commit error、Store ownership flag 或宿主基础设施。
- Public TDD 先锁延迟 Store cleanup 的 Promise identity/settlement，再锁 abort listener reentry、injected Hub close ordering 和 Store rejection。
- 不建立新 ADR：这是既有 `dispose()` 生命周期的并发 join 修复，并复用 ADR-0021 Scheduler 的 deferred shared-Promise 模式。
- 详细依据、TDD 顺序与边界见 [第四十六轮 walkthrough](walkthroughs/2026-08-11-harness-shutdown-join-barrier.md)。

### 第四十六轮执行与验证（2026-08-11）

- `dispose()` 现在先安装唯一 deferred Promise，再同步关闭新 admission；concurrent、repeated、abort-listener reentrant caller 共享 completion/rejection。barrier 循环排空已进入的 `invoke()` / approval `resume()` / `resumeFollowUps()` admission、active completion 与 follow-up background，再关闭 owned Hub 并 dispose Store。
- public red→green 覆盖延迟 Store cleanup、Store rejection、invoke/approval/public follow-up admission、automatic follow-up read 和 reentrant payload validator。已经进入的 admission 可完成 durable start，但必须在 barrier 内被 abort；gated start commit 证明 barrier 不在 mutation/publication 前完成。
- 独立 review 先后发现 invoke admission、automatic follow-up read、public `resumeFollowUps()` 三个 P1，以及 injected Hub 表述和 reentrant validator 两个 P2；均有公开回归或文档收窄。最终窄复审返回 `No P0/P1/P2 findings.`。
- 最终 focused 为 78/0/284；`bun run verify` 为 258/0/1264，包含 typecheck、build 和 41 个测试文件；`bun run pack:smoke` exit 0，109-file tarball 为 111.5/533.3 kB，Bun/Node ESM consumer 通过；`git diff --check` exit 0。
- 本轮不建立 ADR、不新增 public export/持久格式。shared closable Store ownership、普通 public read/write/create 的全量 in-flight drain、typed post-durable acknowledgement、违规提前关闭 injected Hub、非合作式 Store dispose、真实 NeuroBook/Cosmos/HTTP/SSE/进程退出仍未验证。

### 第四十七轮计划：Public Mutation Shutdown Admission（2026-08-11）

- 三路只读规划确认第四六轮只覆盖 Invocation/follow-up-start admission；普通 public Store mutation 仍可越过 barrier。第四路 priority planner 因服务过载未形成结论，不影响已收敛的 public tracer。
- 首选 `write()` 确定性窗口：commit 被延迟时，旧 barrier 先完成，durable `session_entry` 位于宿主 barrier sentinel 之后。相同类别继续审计 create、steer、follow-up control 与 durable abort；pure read/subscribe 不机械纳入。
- 采用内部 operation admission：已经进入不可取消 create/commit 的 mutation 在 barrier 内完成；仍停在可取消 read/validation 的操作在 shutdown recheck 后不新增副作用。
- async commit observer 可以重入并等待 `dispose()`；shutdown 开始后 Core 必须脱离该外部等待、完成 durable publication并观察迟到 rejection，避免 operation/observer/dispose 环。
- ADR 门槛在审查后重新判断：该切片与第四六轮共同冻结 `dispose()` 和 public mutation 的稳定跨 Task 生命周期语义，因此建立 ADR-0026；all-public read drain、Store ownership/lease、typed acknowledgement 仍是独立 ADR 阈值。
- 详细矩阵、red/green 和剩余顺序见 [第四十七轮 walkthrough](walkthroughs/2026-08-11-public-mutation-shutdown-admission.md)。

### 第四十七轮执行、返修与当前验证（2026-08-11）

- public shutdown admission 已覆盖 create/write/steer/follow-up/pause/cancel/reorder/local + durable abort，并延续 invoke/resume/resumeFollowUps admission；已进入 Store create/commit 在 barrier 内完成，可取消 read/validation 在 shutdown recheck 后停止。pure Snapshot/queue-state read 不承诺 drain。
- async observer / error reporter 重入并等待 dispose 时，shutdown-start signal 让 durable publication 脱离外部等待并观察迟到 rejection；普通无 shutdown write 仍等待 observer。
- 完整门禁绕道发现 active transcript 连续跨 follow-up ledger write 的第二次 conflict；`commitMessages()` 与 terminal `finish()` 现在共用最多 3 次、只接受纯 follow-up 追加且 owner 不变的有界 rebase。首版回归被最终 reviewer 指出可一次吸收 queue + pause 而 false-pass；返修后用 Store gate 把 queue/pause 精确插入 transcript attempt 1/2 之间，并补第三次 conflict exhaustion 与 unrelated mutation。上限临时降为 2 时为 0/1/1，恢复 3 后单文件 4/0/12，10 次反馈环 40/0/120。
- 首轮 API review 无 P0/P1/P2。lifecycle reviewer 的“同步 Store commit callback 在 tracker 登记前触发 dispose”P1 按其 public seam 加入回归后直接为 1/0/3：`disposeOnce()` 在资源关闭前复核 live admission Set，settlement 顺序为 write → shutdown，因此没有 production red，不做无证据 thunk 重写。
- tests/docs review 的固定 10ms pending assertion P1 已用 task checkpoint 替代，并以临时绕过 write admission 的 mutation check 证明会稳定变红；`bounded()` timer 已在 `finally` 清理。稳定公共 lifecycle 决策曾以 ADR-0026（Proposed）进入验收，acceptance gate 明确区分 criteria 与当时状态。
- 历史 lifecycle 最终 reviewer 返回 `No P0/P1/P2 findings.`；tests/docs reviewer 复跑为 250/0/970，除上述 ADR 状态文字外无 finding。第一轮 postfix 窄复审中 lifecycle 与 JSONL 均无 finding；rebase reviewer 只指出本节把“历史审查已绿”和“当前尚未验收”混写的文档 P2，contracts reviewer 只指出 tracked `git diff --check` 未覆盖两个 untracked 新文档的证据 P2。修正并暂存精确 checkpoint 后，最终 production/tests reviewer 返回 `No P0/P1/P2 findings.`；acceptance docs reviewer 留下两处最新 package 数字与 ADR staged-check 命令精度共 3 个文档 P2，修正后的最终文档窄复审返回 `No P0/P1/P2 findings.`
- 首次 post-P2 package prepack 暴露 round 45 JSONL retry test 的约 2% ordering flake：旧测试没有保证 concurrent write 先于 recovery commit。四路 800× feedback loop 先得到 3/6/2/5 次相同 conflict；测试 Store 改为 gate recovery 首次 commit、确认 write durable 后释放。recovery 上限临时降为 1 时确定性 red，恢复后 targeted 100/0、四路 800/0，JSONL/Memory/recovery focused 38/0/232；生产 recovery 无需修改。
- 最新 `bun run verify` 为 275/0/1321，覆盖 41 个测试文件并通过 typecheck/build；最新 `bun run pack:smoke` exit 0，109-file tarball 为 113.7/544.1 kB，Bun/Node consumer 通过。精确 checkpoint 暂存集合为 14 个文件，包含 ADR-0026 与本轮 walkthrough；`git diff --cached --check` exit 0，三个受保护工作树文件与暂存集合交集为 0。production/tests 与最终文档窄复审均无 P0/P1/P2；ADR-0026 已在 standalone Harness shutdown-admission scope 接受，第四十七轮收口。

### 第四十八轮规划：Prepared Tool Identity Admission（2026-08-11）

- 五路规划结果：NeuroBook 当前没有新的 provider-neutral parity gap；Context 的 `History/ModelContext/Appending/CurrentUserInput` 位置差异仍由 Adapter 负责，不能单独重构 Core。
- Cosmos 窄审查确认当前没有真实 Harness consumer；Cosmos 仍直接使用 `pi-ai`，未来 `Run/Step/Job` 到 Harness `Invocation/Session` 的映射属于 Cosmos-owned Adapter，不能反向扩展 Harness durable truth。
- Storage/lifecycle 审查把不合作 observer、shared closable Store、typed post-durable acknowledgement 和 `ToolResult.writePlans` partial success 分开：前三项需要新的 ownership/ack 合同且缺少第一方 consumer red；数组级 partial success 保留为后续 P2 候选，不在本轮抢跑 transaction/compensation。
- Package/API 审查确认 ESM 根包与 subpath 可达；CJS、structured output narrowing、read Tool recipe、SSE cursor 编码是文档/真实消费者门槛，不足以支持本轮新增 Provider/Transport/API。
- 选定最窄公共切片：`PreparedRun.tools` 允许同名 Tool，但 Model 声明与 Harness `tools.find()` dispatch 会分叉。NeuroBook 的 object-key Tool binding 已提供对照证据；本轮先用 public tracer 建立 red，再决定是否接受 ADR-0027。
- 执行边界：在 Model、approval、Tool execute 与 Tool `writePlans` 前拒绝重复 Tool name；覆盖普通 invoke 与 approval resume；不修改 Tool Call ID、Store、Workflow、SSE、Cosmos/NeuroBook。
- 详细 TDD 顺序、证据和未验证项见 [第四十八轮 walkthrough](walkthroughs/2026-08-11-prepared-tool-identity-admission.md)。

### 第四十八轮执行与当前验证（2026-08-11）

- 普通 invoke 与 approval resume 两个 public red 均稳定复现错误 dispatch：旧实现实际执行第一份同名 Tool，`Expected: 0 / Received: 1`，并继续调用第二个 Model turn；正式 red 为 0/2/4。
- 最小实现只在每次 `Profile.prepare()` 返回后调用 `assertPreparedToolIdentities()`；该 seam 位于 `prepareWrites`、普通 Model request、approval resume Tool dispatch 和 Tool write plan 之前。名称按精确字符串比较，不 trim、不自动改名。
- 普通 invoke 回归额外返回一个 `prepareWrites` entry，证明重复名称失败后该 durable plan 没有提交；两份 Tool execute 与普通 Model call 均为 0。approval resume 在初始 waiting 的一次 Model call 后不再增加 Model call，也不执行重复 Tool。
- 当前单文件为 2/0/12；扩大到 approval/parallel Tool/Tool Call identity 四文件为 17/0/84。没有新增 public export、持久格式、Provider dependency、Tool namespace 或 Cosmos/NeuroBook 修改。
- `bun run verify` 为 277/0/1333，覆盖 42 个测试文件并通过 typecheck/build；`bun run pack:smoke` exit 0，prepack 同为 277/0/1333，109-file tarball 为 114.1/545.9 kB，Bun/Node consumer 通过。
- implementation 与 test-sensitivity reviewer 均无 P0/P1/P2。contracts reviewer 的 PreparedRun/Invocation scope、resume 初始 Model count 和未验证 Provider 表述共 2 个 P1、1 个 P2 已修正；post-fix contracts review 返回 `No P0/P1/P2 findings.`
- ADR-0027 已在 standalone PreparedRun Tool identity scope 接受，第四十八轮收口。

### 第四十九轮规划：Profile Version Approval Admission（2026-08-11）

- 四路只读规划确认一个 standalone approval gap：v1 Profile 产生 durable waiting request 后，当前 `resume()` 会按同一 `profileKey` 解析 Registry 中的 v2 Profile，并可能用旧 resolution 执行 v2 同名 Tool。
- NeuroBook 当前也按当前 catalog 解释 resume；其 watcher generation、compiled artifact 和 catalog freshness 不是 durable Invocation version pin，不能机械移入 Core。
- 选定最窄合同：`manifest.version ?? 1` 是 Profile 的 approval-resume 兼容身份；新 Invocation 持久化有效版本，legacy 缺字段按 1。宿主改变 Tool/approval/Capability/handler 相关语义时必须 bump；same-version replacement 声明兼容。
- resume 必须在 durable claim、Capability、prepare、Tool 和 Provider 前比较版本；mismatch 以 typed error fail closed，Snapshot 保持 waiting。retry 创建新 Invocation 并捕获当前版本。
- 第一方 Memory/JSONL 可 additive 保存 optional Invocation 字段；严格拒绝未知字段的第三方 Store 需要升级，当前不宣称兼容。闭包 fingerprint、prompt 比较、内存 pin 和产品 catalog DTO 均不采用。
- ADR-0028 已以 Proposed 落盘；下一步按 Memory red → minimal green → JSONL restart → legacy/same-version/retry 的纵切顺序执行。详细证据见 [第四十九轮 walkthrough](walkthroughs/2026-08-11-profile-version-approval-admission.md)。

### 第四十九轮执行与当前验证（2026-08-11）

- 旧实现 public red 为 0/1/4：v1 waiting 后加载 v2，同一旧 resolution 实际得到 accepted/completed；v2 prepare=1、Tool execute=1、Model calls=2，Invocation 从 waiting 变为 completed。
- 最小实现让 Resolved Profile 暴露 effective version，新 Invocation 保存 `profileVersion`；`resume()` 用 `invocationProfileVersion()` 处理 legacy=1 并在 claim 前抛 typed `ProfileVersionConflictError`。mismatch 后 Capability/prepare/Tool/Provider 为 0，Session version 与 waiting 状态不变。
- JSONL `checkpointEvery: 2` restart、legacy 删除字段、same-version replacement、retry 当前版本和 invalid durable value 均有公开回归；首次单文件为 6/0/16。
- 首次 approval/recovery/Profile/Tool/Capability/result/message identity 扩大 focused 为 40/0/215；`bun run verify` 与 package prepack 均为 283/0/1349，43 files；109-file tarball 为 115.5/551.6 kB，Bun/Node consumer 通过。
- 三路 review 中 implementation 无 finding；tests 提出 `null` 被当 legacy、JSONL default=1 可能假绿、Snapshot/error identity 不完整和 resolve→claim replacement 四项。contracts 独立复现 `null` P1。
- 返修后只有 `undefined` 使用 legacy=1；JSONL 改为 7→8 并按 record kind 证明 commit/snapshot 都保存 7；mismatch 完整比较 Session/error identity；Store gate 证明 claim 等待期间 replacement 不会把已校验 v1 attempt 重定向到 v2。invalid/producer cleanup 均有失败路径收口。
- production reviewer 进一步发现自定义 Store 的 existing invalid Invocation 可穿过 reducer 继续 mutation；public reducer red 为 0/1/3。现有 Invocation 也统一调用 `invocationProfileVersion()` 后转绿。最终单文件 7/0/23，扩大 focused 41/0/222。
- README、CHANGELOG、CONTEXT、ADR-0028 与本 walkthrough 已同步；最终 `bun run verify` 为 284/0/1356，43 files，typecheck/build 通过；package prepack 同为 284/0/1356，109-file tarball 为 115.7/552.2 kB，Bun/Node consumer 通过。
- 合并后的 production、test-sensitivity 与 contract 三路最终窄复审均返回 `No P0/P1/P2 findings.`；ADR-0028 在 standalone Profile Version approval-admission 范围接受，第四十九轮收口。

### 第五十轮规划：Active Profile Steer Admission（2026-08-11）

- standalone `run()` 在 start/resume 时捕获精确 Profile；当前 `steer()` 却在入队时重新解析 mutable Registry，随后直接把 parsed payload 注入旧 attempt，存在 v1 prompt/Tools/hooks 与 v2 payload parser 混用。
- NeuroBook 当前 catalog watcher 路径也存在同类 current-catalog admission；Project generation 只保护 Workspace 生命周期，不是 Profile pin。Cosmos 没有当前 consumer，继续 `pi-ai` 并保留未来 Adapter seam。
- 选定最窄合同：active attempt 捕获 payload parser；steer 保留 Store read、shutdown 与 active identity recheck。replacement 只影响之后 resolution，不新增 public API、durable shape、依赖或产品 catalog policy。
- durable follow-up payload re-admission 是独立候选，不混入本轮。ADR-0029 已以 Proposed 落盘；下一步用 v1/v2 transformation public tracer 确认旧行为。详细证据见 [第五十轮 walkthrough](walkthroughs/2026-08-11-active-profile-steer-admission.md)。

### 第五十轮执行与当前验证（2026-08-11）

- public red 为 0/1/1：queued 与 provider-visible steer payload 均为 `parsedBy:v2`，同一 request 的 system prompt 仍为 v1，v2 prepare 为 0。
- private active state 现在保存 start/resume admission 捕获的 payload parser；`steer()` 保留 Store read、shutdown 与 active identity recheck。没有新增 public API、durable shape、依赖或 NeuroBook/Cosmos 修改。
- transformation + same-version replacement-reject 两条正式测试为 2/0/2。approval resume 直测加入后正式为 3/0/3；恢复旧 steer parser 的合并 mutation check 为 0/3/3，只 mutation resume 注册入口时为 2 pass / 1 fail，均随后还原。
- pre-review 扩大 focused 为 45/0/197，覆盖 7 files；`bun run verify` 为 287/0/1359、44 files，typecheck/build 通过。`bun run pack:smoke` exit 0，prepack 同为 287/0/1359，109-file tarball 为 115.9/553.1 kB，Bun/Node consumer 通过。
- production 与 contract review 无 P0/P1/P2；test-sensitivity 的 active parser rejection、same-version provider message 和 resume binding 可区分性三个 P2 均已补公开回归。返修后单文件 4/0/4、扩大 focused 47/0/199。
- 最终 `bun run verify` 为 288/0/1360、44 files，typecheck/build 通过；`bun run pack:smoke` 的 prepack 同为 288/0/1360，109-file tarball 为 115.9/553.1 kB，Bun/Node ESM consumer 通过。最终 production、test-sensitivity 与 contract 三路窄复审均返回 `No P0/P1/P2 findings.`。
- 收口检查曾连续出现两个不同的一次性全仓失败：Windows heartbeat sharing fixture 超时，以及 JSONL restart follow-up 偶发返回 null；两条 focused 均立即转绿。六文件前置链 47/0/287，压力环 restart-follow-up 500/0/4500、heartbeat 20/0/60、crash phases 2/0/50 均未复现，随后 complete test/verify/package-prepack 连续 288/0/1360；没有稳定 red 或本轮生产改动因果证据，因此未混入无依据的 timeout/实现修改，绕道已记录在 walkthrough。
- ADR-0029 已在 standalone Active Profile steer-admission 范围接受，第五十轮收口。

### 第五十一轮规划：Canonical Schema Value Admission（2026-08-11）

- 三路规划与集成审计确认 `ValueSchema.parse()` 同时承担 raw decode 与 durable value revalidation：普通 invoke/initial 至少两次，follow-up 最多三次，retry、approval resume 和 `SessionEntryCodec` 也存在 parsed-on-parsed 路径。
- NeuroBook 的 TypeBox parser 当前是 validate-and-return，重复调用隐含幂等；standalone 允许 transformation，不能把该行为外推为安全。
- raw queue 方案被拒绝：它会改变既有 `QueuedInvocationInput.payload` / `InvocationRecord.input` 语义，并可能持久化 parser 有意移除的未知字段或 secret。
- 选定 Parsed Value 权威合同：`parse(raw)` 只在 ingress 产生 canonical JSON；durable reuse 只能验证并原样返回。非幂等 decoder 可提供可选 `validateParsed`，未提供时以 parse + JSON equality 保持旧 identity/idempotent schema 兼容并对不稳定 parser fail closed。
- follow-up consume、retry、approval resume、Profile prepare 与 codec projection 只验证 durable Parsed Value；不新增 raw 字段、durable marker、Profile closure、依赖或宿主产品语义。
- ADR-0030 已以 Proposed 落盘；下一步按 direct invoke → follow-up → JSONL restart → retry/resume/codec 的公开纵向 TDD 顺序执行。详细依据与 seam 见 [第五十一轮 walkthrough](walkthroughs/2026-08-11-canonical-schema-value-admission.md)。

### 第五十一轮执行与当前验证（2026-08-11）

- `ValueSchema` 新增 optional `validateParsed`、object-form `defineSchema()`、`parseSchemaValue()`、`validateParsedSchemaValue()` 与 typed `SchemaCanonicalValueError`。Session initial、Invocation input、durable follow-up、retry、approval resume 和 codec projection 只验证并复用 Parsed Value，不继续 transformation。
- `ResolvedProfile.validateInitial/validatePayload` 保持 optional；pre-ADR-0030 手工结构体通过 Harness fallback、runtime tracer 与 Node package type tracer，避免公共结构类型破坏。
- Tool transcript/approval request 继续保存 provider raw arguments；approval prompt 与恢复后 execution 从同一 raw 值各自 decode。public tracer 证明 durable raw `{value:5}` 两次都只形成 `{value:6, decodedBy:"tool"}`。
- canonical/active Profile/Profile Version/approval/recovery 六文件 focused 为 43/0/138；最终 `bun run verify` 为 305/0/1395、45 files，typecheck/build 通过；package prepack 同为 305/0/1395，109-file tarball 为 118.8/564.5 kB，Bun/Node ESM consumers 通过。
- 首次 full gate 暴露既有 JSONL anchor test 约 1% 的过强断言。诊断 200 次中 5 次均为合法 `version 0→1 / leaf null→null`，只修测试的同一 reducer 边界配对；正常反馈环 50/0，生产 Harness/Store 未修改。200 次同进程极限循环另有 4 个 5 秒资源饱和 timeout，未据此放宽正常门禁。
- 首次 production reviewer 的 Tool double-parse 前提经数据流和 tracer 证伪；API reviewer 的 required `ResolvedProfile` validator 兼容 finding 有效并已返修。test-sensitivity reviewer 的 4 个 P2 与 pack tracer 的 generic P2 均已在最终门禁前补齐，post-fix 三路窄复审均为 `No P0/P1/P2 findings.`；ADR-0030 已在 standalone Core canonical-value admission 范围接受，本轮收口。

### 第五十二轮规划：Tool writePlans 批量 admission（2026-08-11）

- 候选审计发现 `ToolResult.writePlans` 公开数组合同在 multi-plan 时按序逐条 `commit()`：plan2 的 `expectedVersion` 相对 Tool 捕获的 Snapshot 过期或操作非法时，plan1 先持久化、plan2 才失败，产生无 toolResult 解释的孤儿 durable 写入。
- NeuroBook 对照：其 harness 测试均为单 plan，hook 批量路径把 writePlans 数组交给 `writeExecutor.execute`（等价批量语义）；没有真实 multi-plan 消费者，但 standalone Core 的数组合同应自行收敛。
- 修复语义：所有 plan 先通过与 `commit()` 相同的守卫 + `reduceSessionWritePlan` 纯投影校验（project 前一个 plan 的结果），全部合法后才逐 plan CAS 提交。plan 内部非法 → 零 durable 写入；并发外部 CAS 仍可能早退，属固有边界，不承诺原子批或 exactly-once。
- 不新增 public API、durable shape、ADR 或依赖。详细依据与 seam 见 [第五十二轮 walkthrough](walkthroughs/2026-08-11-tool-write-plan-batch-admission.md)。

### 第五十二轮执行与当前验证（2026-08-11）

- `src/harness.ts` 新增 private `commitToolWritePlans`：每 plan 先过 usage/partial/followUp/target 守卫并自动注入 invocation owner（与 `commit()` 一致），再以 `reduceSessionWritePlan` 逐步投影，全部合法后才逐 plan `commit()`；普通 sequential Tool 路径与 approval resume 路径共用该入口。
- 新增 6 条 public 测试：批尾旧 version CAS 冲突、合法多 plan 全提交、plan2 非法操作（missing leaf）、批首 expectedVersion 过期整批零写入、空 writePlans 数组 no-op、approval resume 零写入拒绝。Red 阶段 3 条均命中 `firstCommitted: true` 孤儿写入，修复后 focused 49/0/206、7 files。
- 最终 `bun run verify` 为 311/0/1402、46 files，typecheck/build 通过；pack smoke（prepack 311/0/1402、109 files、119.8/568.9 kB、Bun/Node ESM consumers）与 `git diff --check` 通过。production 首次 1 P1 + 3 P2 经 adjudication 全部撤销（JSDoc 已补两层守卫原因），API/domain 首次即干净，test-sensitivity 3 个 P2 中 2 个已补测试、1 个经全仓 durable 合同约定裁决不成立，post-fix 复审均无 P0/P1/P2。第五十二轮收口，checkpoint commit 为本轮本地增量。

### 第五十三轮规划：plan 数组批量 admission（2026-08-11）

- 全仓扫描发现第五十二轮只覆盖 `ToolResult.writePlans`；同一"逐 plan 顺序提交"模式还存在于 `PreparedRun.prepareWrites`（prepare 路径）与 `RuntimeEffect.writePlans`（applyEffect，被 prepareRun/beforeTurn/afterTurn/settleRun/settleFailure 全部 hook 阶段复用）。
- parallel Tool 路径已显式拒绝 writePlans；follow-up rebase 是单 plan 重试语义，均不并入本轮。
- 决定：private `commitToolWritePlans` 更名为 `commitWritePlans` 并复用到所有公开 plan 数组入口；语义与第五十二轮一致（先整批守卫 + 纯投影校验，后逐 plan CAS 提交），per-plan `assertAttemptActive` 统一为批次后单次检查，`applyEffect` 的 `allowInvalidated`（abort settlement）语义不变。
- 不新增 public API、durable shape、ADR 或依赖。详细依据与 seam 见 [第五十三轮 walkthrough](walkthroughs/2026-08-11-plan-array-batch-admission.md)。

### 第五十三轮执行与当前验证（2026-08-11）

- `src/harness.ts`：`commitWritePlans` 复用至 prepareWrites 与 applyEffect 两个入口；Tool 两个调用点同步改名；JSDoc 泛化三种 plan 数组来源。
- 新增 8 条 public 测试：prepareWrites / beforeTurn / settleFailure 的批尾 stale、批内非法操作、批首 stale、abort settlement（allowInvalidated）与合法序列均零写入/全提交，并含 hook 运行计数、原始错误保留与 payload 顺序断言。Red 阶段 5 条均命中 `firstCommitted: true` 孤儿写入，修复后 focused 51/0/223、9 files。
- 最终 `bun run verify` 为 319/0/1410、47 files，typecheck/build 通过；pack smoke（prepack 319/0/1410、109 files、119.9/569.3 kB、Bun/Node ESM consumers）与 `git diff --check` 通过。production 与 API/domain 首次即干净；test-sensitivity 的 1 P1 + 6 P2 中 4 项已补测试（settleFailure 可区分性、批首 stale、payload/顺序、abort settlement），2 项经同路径/既有覆盖裁决不成立，post-fix 复审无 P0/P1/P2。第五十三轮收口，checkpoint commit 为本轮本地增量。

### 第五十四轮规划：JSONL delta + checkpoint 模式回归（2026-08-11）

- NeuroBook 最新 harness 修复（linked relations unavailable、Job history、SSE 客户端 connection generation）经提交对照均为宿主/产品侧，无可移植 Core 缺口。
- standalone 自身测试缺口扫描发现 `checkpointEvery > 1` 的 delta + checkpoint 实验模式已实现但零专属测试：交替 record 恢复、torn 尾修复、reconcile、损坏守卫全部没有锁定。
- 决定：不改生产代码（探针全过），新增 11 条公开回归把实验模式合同锁定为可验证行为；不新增 public API、durable shape、ADR 或依赖。详细依据见 [第五十四轮 walkthrough](walkthroughs/2026-08-11-jsonl-checkpoint-delta-mode.md)。

### 第五十四轮执行与当前验证（2026-08-11）

- 新增 `tests/jsonl-checkpoint-delta.test.ts` 11 条测试：交替写/恢复、torn delta 与 checkpoint 尾修复、中段损坏 fail-closed、reconcile（clean/torn）、跨模式读取、跨实例 lock 串行化、entry ID 重复与 version 跳跃守卫、非法 `checkpointEvery` 拒绝。
- 测试过程发现并修正两处测试自身问题：entry ID 用例需 3 条 commit 才有两条 delta；跨实例竞争断言不依赖赢家顺序。8 次连跑 11/0 稳定，focused 71/0/317、6 files。
- typecheck 阶段还修正了测试自身合同形状（`create` 需 `profileKey`、invocation 用 `caller + createdAt`）并把中段损坏断言精确到 `SyntaxError`（JSON.parse 原始错误保留语义）。最终 `bun run verify` 为 330/0/1445、48 files，typecheck/build 通过；pack smoke 与 `git diff --check` 通过。production/API 首次即干净，test-sensitivity 的 1 P1 + 4 P2 中 2 项已修、3 项经既有覆盖/语义裁决不成立，post-fix 复审无 P0/P1/P2。第五十四轮收口，checkpoint commit 为本轮本地增量。

### 第五十五轮规划：Aborted Invocation Error Redaction（2026-08-11）

- NeuroBook 最新 Harness 修复已将取消与失败分开投影：`status: "aborted"` 是完整取消事实，durable 不保存 provider/取消正文；调用方本地结果仍可保留技术诊断。
- standalone 取证确认 cooperative abort、forced abort、waiting owner CAS abort 三条路径都会把取消原因写入 durable `InvocationRecord.error`；恢复后的 terminal result 因而暴露 SDK/内部实现文本。
- 选定最小 Core 合同：新的 aborted terminal 不持久化 `error`；本地 cooperative `InvocationResult` 继续可带 error；Snapshot 恢复对 aborted 一律不暴露 error（包括 legacy record 的 projection，不迁移旧数据）。failed/completed/usage/partial/output 语义不变。
- 该决定影响 durable/result public contract，已记录为 [ADR-0031（Accepted）](../../adr/0031-aborted-invocation-error-redaction.md)，并以 cooperative/forced/waiting/failed/legacy public regression 锁定边界。

### 第五十五轮执行与当前验证（2026-08-11）

- `src/harness.ts` 的 `terminalInvocationOperations()` 过滤 aborted error，覆盖 cooperative finish、forced abort 与 waiting owner CAS；`resultFromSnapshot()` 对 aborted（含 legacy record）隐藏 error。failed Invocation 仍保留 provider error。
- 新增 5 条 public regression：cooperative 本地 error/durable omission、forced omission、waiting CAS omission、failed retention、legacy projection omission。Red 阶段三条 abort 路径复现 durable error，修复后 focused 64/0/238、6 files。
- 最终 `bun run verify` 为 335/0/1452、49 files，typecheck/build 通过；pack smoke（prepack 335/0/1452、109 files、120.4/570.8 kB、Bun/Node ESM consumers）与 `git diff --check` 通过。production/API/test-sensitivity 三路 post-fix review 均无 P0/P1/P2；ADR-0031 已在 standalone Core aborted terminal / Snapshot projection 范围接受。

### 第五十六轮执行与当前验证（2026-08-11）

- 新增 `tests/streaming-model-runtime-partial-consumer.test.ts`：Adapter 通过公开 `ModelRuntime.runTurn` / `request.onEvent` 发出 `message_start` 与 `text_delta`，在 abort 后转换为 `ModelTurnError.partial`；Harness 恢复 durable partial，且不写入 `agent.message` transcript。
- test-only tracer 为 1/0/1；focused 41/0/177、5 files；无生产代码、public API、ADR 或依赖变更。
- 最终 `bun run verify` 为 336/0/1453、50 files，typecheck/build 通过；pack smoke（prepack 336/0/1453、109 files、120.4/570.8 kB、Bun/Node ESM consumers）与 `git diff --check` 通过。production/API/test-sensitivity 三路复审均无 P0/P1/P2。第五十六轮收口，checkpoint commit 为本轮本地增量。

### 第五十七轮执行与当前验证（2026-08-11）

- `src/events.ts` 新增 `missingEpoch` admission：`after > 0` 且无 `eventEpoch` 时 `connected.snapshotRequired=true`、不 replay；不关闭 subscription，保留 Host/SSE Adapter 的 lifecycle 决定权。
- 新增 2 条 public regression：显式缺 epoch 的 `{after:1}` fail closed；`after:0` 与空 cursor 仍合法。Red 阶段原实现返回 `snapshotRequired:false`，修复后 EventHub focused 23/0/74。
- 最终 `bun run verify` 为 338/0/1457、51 files，typecheck/build 通过；pack smoke（prepack 338/0/1457、109 files、120.7/571.9 kB、Bun/Node ESM consumers）与 `git diff --check` 通过。production/API/test-sensitivity post-fix review 均无 P0/P1/P2；ADR-0032 已在 standalone EventHub cursor-admission 范围接受。

### 第五十八轮取证与收尾（2026-08-11）

- 临时只读探针：`replayByteLimit=1000` + 5000-char event → 新 cursor `snapshotRequired=true`；`subscriberQueueByteLimit=1000` + 5000-char live event → `queue_overflow`。
- NeuroBook `maxEventBytes` 测量完整 SSE frame，属于 Transport/Job event boundary；standalone Core 不编码 frame，现有 replay/live budgets 已足够表达 recovery 边界。本轮无 focused/full/package 代码变更；保留第五十七轮最终门禁作为当前基线。
- 该轮 walkthrough 已记录探针、决定与真实 HTTP/SSE/浏览器/跨进程未验证边界；回到下一轮规划。

### 第五十九轮执行与当前验证（2026-08-11）

- 新增 `src/read-tool.ts` 与根导出 `createReadTool`、`ReadToolArguments`、`ReadToolOptions`；factory 只绑定显式 CapabilityToken，透传 opaque request，映射 content/details，provider failure 复用普通 Tool error。
- `ReadToolArguments` 采用 `JsonObject & {...}` type alias，修复首次 pack smoke 暴露的 public `.d.ts` optional index-signature 冲突；pack smoke fixture 的两次声明顺序问题也已修正。
- 新增 3 条 public regression：custom metadata/full details、invalid schema/EOF empty details、provider failure；focused 5/0/30、全仓 341/0/1469、52 files。
- 最终 pack smoke（prepack 341/0/1469、113 files、122.1/578.4 kB、Bun/Node ESM consumers）与 `git diff --check` 通过；production/API/test-sensitivity post-fix review 无 P0/P1/P2。ADR-0033 已在 standalone Core Read Tool Adapter 范围接受。

### 第六十轮规划与取证：Job history / Workflow feedback delivery boundary（2026-08-11）

- NeuroBook ADR-0014 与 commit `2e0c94a` 的 durable Job history、stable delivery identity、pending delivery retry 和 Job restart recovery 都属于 Workspace/Job/Delivery 宿主层。
- standalone 已有 generic follow-up queue、system messageIdentity、Workflow anchored writeback 与 commit scheduler；但没有 delivery/exactly-once/Job durable truth，符合 ADR-0001/0009 和用户的 sidecar/Job/Outbox 边界。
- 决定不新增 Core API；不把 `deliveryId`/`clientMessageId` 或 `enqueueDurableSystemFollowUp()` 迁移进 Harness。详细对照见 [第六十轮 walkthrough](walkthroughs/2026-08-11-job-history-delivery-boundary.md)。

### 第六十二轮规划：Core-owned `agent.compaction` admission（2026-08-11）

- 测试缺口审查通过 public `harness.write()` 复现：shape-valid `agent.compaction` 可以被宿主追加；随后 `projectSessionTranscript()` 会把旧 durable transcript 隐藏，造成可恢复上下文被公开扩展 seam 篡改。
- 该 entry 是 Core 解释的 transcript projection fact，不是普通宿主扩展。现有 `CONTEXT.md` 已声明 Core-owned Entry 不能由 public write/effect 伪造，但当前 guard 只覆盖 `harness.followUp.*`、`harness.invocation.usage` 与 `harness.invocation.partial`。
- 本轮最小合同：generic `write()` 与 `commitWritePlans()` 一律拒绝 `agent.compaction`；Harness 内部仅允许 `cause: "harness.compaction"`、当前 Invocation、单一 `agent.compaction` append entry 的精确 plan。复用现有 Invocation owner/fence，不改变 compaction payload、Snapshot shape 或 transcript projection。
- TDD 顺序：先锁 public `write()` red；再锁 Profile Hook/Tool effect 的 shared write-plan red；实现 private allow flag 与 exact-plan guard；最后验证正常 compaction 仍能写入。
- 明确不做：不存在 `parentId` 的引用校验、整个 `harness.*` namespace、generic transaction/ACL、Job/Lease/Outbox、SSE/Transport、NeuroBook/Cosmos 修改。

### 第六十三轮规划：Session Entry parent reference admission（2026-08-11）

- 公开 `harness.write()` 目前可以接受不存在的 `parentId`；随后 `activeSessionPath()` 才抛出 `active path entry ... 不存在`，使 durable Snapshot 已成功但 transcript/恢复不可用。
- 领域术语收敛为 Entry Parent Reference、Active Leaf、Active Path：`null` 是 root branch，省略 parent 使用当前 active leaf，显式非空 parent 必须指向当前 reducer projection 中已存在的同一 Session Entry。
- 共享 reducer 在任何 Memory/JSONL durable write、Harness public write、Profile/Tool/hook plan-array projection 前 fail closed；active leaf 悬挂、空 parent、悬挂 parent 和循环链不产生 durable event/publication。
- 本轮不新增 generic branch/fork API，不允许跨 Session parent，不处理 merge、历史损坏自动修复或 NeuroBook/Cosmos。
- ADR-0035 先保持 Proposed，待 public red/green、Memory/JSONL contract、全仓/package smoke 与独立审查完成后再接受或撤回。

### 第六十三轮执行与当前验证（2026-08-11）

- shared reducer 新增 `assertSessionEntryGraph()`：Entry ID 非空唯一、parent 非空、Active Leaf 存在、parent 引用存在、环 fail closed；`normalizeSessionSnapshot()`、`activeSessionPath()` 与每次 append 共用该投影校验。
- 新增 `tests/session-entry-parent-admission.test.ts` 12 条 public regression（含 inactive-branch parent、空白 parent/ID 拒绝）；focused parent+abort 为 `26/0/87`，全仓 `359/0/1525`、54 files，pack smoke（prepack `359/0/1525`、113 files、`125.8 kB`/`597.7 kB`）均通过。
- pack smoke 复现并修复 abort restart 相邻 flaky：abort 后 `persistence:"unknown"` 不再提前结算 active，必须由 forced abort boundary（terminal 确认、耗尽或失败）收口；新增 deterministic gate，原 30 次重复从 `20/10` 变为 `30/0`。
- 独立审查 P1 已收口：`waitInvocation` durable 后同步 abort 不再提前结算 waiting，由 forced abort boundary 以 aborted 收口；P2 按审查吸收（fence seal 移入 try、冗余预检合并、补测试与 ADR 分节）。
- ADR-0035 保持 Proposed；真实 consumer/第三方 Store/Transport/Product 未运行。

### 第六十三轮收尾与下一候选（2026-08-11）

- 独立审查 Mendel 无 P0；P1（waitInvocation 后同步 abort 的 waiting 竞态）已收口，P2 已按审查吸收；walkthrough 已更新最终证据。
- 本地 checkpoint `8142656`；用户已有 `docs/architecture.md`、`docs/pi-adapter-design.md`、`tests/context.test.ts` 保持未纳入。
- 下一轮候选：图校验在 `normalizeSessionSnapshot()`/每次 Store read/commit 的 O(n) 遍历成本基准（大 Session 探针，必要时再决定缓存或缩小校验面）；同时可补 JSONL 跨 record 重复 ID/环 replay 与 external-signal gate 的 P2 测试缺口。

### 第六十四轮规划：大 Session 图校验成本探针（2026-08-12）

- 第六十三轮引入的 `assertSessionEntryGraph()` 进入每次 read/commit/active path
  调用；walkthrough 明示「超大历史 Session 的单次全图遍历成本未做基准测量」。
- 计划先量化 1000/10000 条 Entry 的成本，再决策：优化 / 缓存 / 仅记录边界。
  若为线性且绝对值可接受，不新增缓存状态；可选加一条「大 Session 有界」回归
  固定线性边界。

### 第六十四轮执行与当前验证（2026-08-12）

- 探针 `scripts/bench-parent-graph.ts`：批量 commit 播种 1000/10000 条链式
  Entry，测量 seed/read/`activeSessionPath`/commit，并测 JSONL 10000 条单批
  提交后的 read。数据：1k 为 `1.37/0.34/1.25ms`，10k 为 `13.29/2.79/12.96ms`，
  JSONL read 10k 为 `24.81ms`；近似线性，无图校验 O(N²) 退化。
- 此前 304s 超时来自逐条 commit 时 Memory Store 每次 `structuredClone` 全量
  Snapshot（O(N²)），属既有 append-only 快照特性；按 1000 条批量 commit 后
  10k 播种仅 74.6ms。探针初版 `expectedVersion: offset` 断言错误（版本按 commit
  次数 +1）导致 10k 段冲突，去掉 expectedVersion 后跑通。
- 新增 `tests/session-graph-scale-bounded.test.ts`：10k 链式 Entry 下验证
  read/path/commit 正确性，并以测量值百倍余量（read/path < 2s、commit < 5s）
  拦截 O(N²) 退化；focused `27/0/95`，全仓 `bun run verify` `360/0/1533`、
  55 files，typecheck/build 通过。
- 无 `src/` 变更、无公共 API/ADR/依赖变化；`package.json` 的 `files` 不含
  scripts/tests，包内容与第六十三轮一致，本轮不重复 `pack:smoke`。
- 下一轮候选：JSONL 跨 record 重复 ID/环 replay fail-closed 测试、external-signal
  （`linkInvocationSignal`）路径 gate 测试，或继续吸收 NeuroBook 已验证修复。

### 第六十五轮规划：JSONL replay 图 admission 与 external-signal gate 补测（2026-08-12）

- 只读调查确认两个候选缺口的实现现状：JSONL replay 逐 record 合并只检查
  version 连续与跨 record 重复 ID，环/悬挂 parent/同批重复 ID 由最终
  `normalizeSessionSnapshot()` 的 `assertSessionEntryGraph()` 兜底；两级
  fail-closed 都有实现但缺专门回归。
- `linkInvocationSignal` 的 listener 在 `active.result` 结算时移除；waiting
  结算后 signal abort 不生效，durable cancel 由 Workflow 调用
  `harness.abort(sessionId)`——第三十二轮已记录的既定设计边界（不保存
  signal）。本轮用 gate 测试把两个方向钉死，不扩展 Core API。

### 第六十五轮执行与当前验证（2026-08-12）

- 新增 `tests/jsonl-replay-graph-admission.test.ts` 4 条 gate：跨 record
  重复 ID（replay 边界 `JSONL commit entry ID 重复`）、同批重复 ID（全图
  校验）、跨 record 环（全图校验）、跨 record 悬挂 parent（全图校验）；
  手工构造 JSONL 文件，锁定 entry-graph 维度损坏历史 read fail closed；
  invocation 数组 coherence 保留为后续候选。
- `tests/workflow-invocation-signal.test.ts` 新增 2 条 gate：waiting 结算前
  signal abort → bounded abort（终态 aborted、`["waiting", "aborted"]` 事件
  序列）；waiting 结算后 signal abort 不持久化且 `harness.abort()` 完成
  durable cancel。首版事件收集在 approval_required 处 break 漏收
  `agent_end`，改为 collector 持续收集 + close 后排空。
- focused `80/0/338`（7 files）；全仓 `bun run verify` `366/0/1549`、
  56 files，typecheck/build 通过；无 `src/` 变更，本轮不重复 `pack:smoke`。
- 下一轮候选：继续吸收 NeuroBook 已验证修复（对照独立库落后清单），或评估
  Workflow/SSE/工具组合的新增解耦切片。

### 第六十六轮规划：Session Invocation coherence admission（2026-08-12）

- 第六十五轮审查 P2-2 指出 invocation 数组一致性是 JSONL read admission 的
  预存边界；只读探针确认重复 Invocation ID、悬挂 active owner、`running`
  Session 无 owner、`idle` Session 配 `running` Invocation 全部被 read/reconcile
  接受，后者形成永不收口的僵尸 owner。
- 写侧（reducer 的 startInvocation/setStatus/finish/wait/resume）从第四十四轮起
  已保证这些矛盾无法产生；本轮在 `normalizeSessionSnapshot()` 加读侧 admission
  兜底，与第六十三轮 entry graph admission 同族，不新增公共类型/API/ADR。

### 第六十六轮执行与当前验证（2026-08-12）

- `src/session.ts` 新增 `assertSessionInvocationCoherence()`：重复 ID、active
  owner 悬挂/terminal、非 active running/waiting 僵尸、无 owner 的
  running/waiting/aborting、idle/interrupted/archived 携带 owner、
  running/waiting 与 active owner 状态不匹配，全部 fail closed；Memory/JSONL
  的 read 与 reconcile 经 read 共用 normalize 入口，缺失 `activeInvocationId`
  按 null 归一。
- `CONTEXT.md` 增加 Invocation Coherence 术语与读侧不变式；新增
  `tests/session-invocation-coherence.test.ts` 11 条（8 拒绝 + 合法组合 +
  JSONL read + 缺失 owner 归一），初始 `1/9` red → 最终 `11/0/19` green；
  全仓 `377/0/1568`、57 files，pack smoke（113 files、`127.0 kB`/`603.4 kB`）
  通过，legacy fixture
  无一误伤。
- 下一轮候选：pendingApprovals 内部一致性/Invocation-Entry 引用等更细事实的
  审计，或回到 NeuroBook 已验证修复吸收与 Workflow/SSE/工具组合切片。

### 第六十七轮规划：Approval fact coherence admission（2026-08-12）

- 三路并行只读调查（Workflow 组合缺口 / Invocation 细粒度 coherence / NeuroBook
  2026-08-05 后 parity）：
  - Workflow：公开 `invocationResultFromSnapshot` 投影与 `forkSession` 原语有
    证据，本轮后置；
  - NeuroBook：幂等 follow-up deliveryId 与启动自动恢复 queue 属
    delivery/exactly-once 宿主语义，拒绝下沉；
  - coherence 探针：waiting + 空 `pendingApprovals` 时 `resume(id, [])` 绕过
    审批直接执行 gated Tool（P1 安全洞）；重复 toolCallId 死锁；turnCount 回退
    产生非单调 transcript 与潜在重复副作用。

### 第六十七轮执行与当前验证（2026-08-12）

- `assertSessionInvocationCoherence()` 追加 approval fact 阶段：waiting
  Invocation 的 `pendingApprovals` 缺失/空、重复 `toolCallId`、非负整数外
  turnCount、turnCount 低于自身已提交最大 `agent.message` turn（active path +
  invocationId 归属）全部 fail closed；reducer `waitInvocation` 写侧对称拒绝，
  `resumeOnce` 防御性归一化覆盖第三方 Store，`SessionStore` 接口文档固化义务。
- `tests/session-invocation-coherence.test.ts` 新增 11 条 approval fact gate
  （含 JSONL read + `harness.resume` 双重 fail closed、`toolExecutions === 0`
  的 public seam 安全断言、写侧 reducer admission 与第三方 Store 归一化）；
  第 66 轮合法 waiting 用例补齐 approvals。
- focused `59/0/192`（6 files）；全仓 `388/0/1586`、57 files，pack smoke
  （113 files、`128.7 kB`/`610.8 kB`）通过，legacy waiting fixture 无一误伤。
- 下一轮候选：公开 `invocationResultFromSnapshot` 只读投影（宿主跨进程恢复后
  无需复制 private 映射），或 `forkSession` 原语（ADR-0002 预告的 defer，
  需定义 Core-owned kinds 复制/重写规则）。

### 第六十八轮规划：invocationResultFromSnapshot 公开只读投影（2026-08-12）

- 第六十七轮 Workflow 缺口调查结论：进程重启后宿主只能轮询 `snapshot()` 并
  自行把 `InvocationRecord` 映射回结果视图，而该映射 Core 内部已有但 private
  （`resultFromSnapshot` / `confirmedResult`）；现有测试重启后也只读裸字段
  `invocations[0]?.output`。
- 本轮把该映射公开化为与 `invocationUsage` / `invocationPartial` 同级的纯函数，
  内部实现委托去重；不新增跨进程等待/轮询/Job 语义（ADR-0001 宿主）。

### 第六十八轮执行与当前验证（2026-08-12）

- 根导出 `invocationResultFromSnapshot(snapshot, invocationId)`：terminal 返回
  完整结果（terminationReason/output/usage/partial，aborted 按 redaction 排除
  error），waiting 返回 `pendingApprovals` + usage，running/interrupted/缺失
  返回 `undefined`；private `resultFromSnapshot`/`confirmedResult` 委托该函数，
  行为逐字段核对一致。
- 新增 `tests/invocation-result-projection.test.ts` 8 条（纯投影 + Memory 真实
  运行 + JSONL 重启投影 + waiting 投影）；初始 export red → 最终 `8/0/22`。
- focused 8 文件 `74/0/308`；全仓 `396/0/1608`、58 files，pack smoke
  （113 files、`129.7 kB`/`613.3 kB`，Bun/Node consumer 含新符号 runtime
  断言）通过；README/CHANGELOG 同步。
- 下一轮候选：`forkSession` 原语（ADR-0002 预告的 defer），或继续
  Workflow/SSE/工具组合切片。

### 第六十九轮规划：Session Fork API（2026-08-12）

- 第六十七轮调查确认手工 fork 复制有三个真实陷阱：Core-owned kinds 被公开
  write admission 拒绝（usage/partial/compaction/followUp 全部无法复制）、
  绕过 Harness 会产生幽灵队列被 `resumeFollowUps` 真的启动、原样复制
  `agent.compaction` 会断链。
- 设计：`forkSession(sourceSessionId, options?)` 只复制 active path 的
  `agent.message`/宿主条目（保留 payload，不复制 invocationId 归属），丢弃
  Core-owned 内部事实（usage/partial/compaction/followUp.*，与 write
  admission 保留集对齐；其它 `harness.*` 宿主扩展事实保留）；新 Session 继承
  profileKey/initial/hostContext 且可覆盖、`parentSessionId` 溯源、无
  Invocation/approval/queue；经既有 createSession + write seam 落盘，源不被
  修改。

### 第六十九轮执行与当前验证（2026-08-12）

- `src/harness.ts` 新增 `forkSession` + `ForkSessionOptions`；
  `isCoreOwnedForkFact` 定义复制边界（usage/partial/compaction/followUp.*，
  剥离 invocationId 归属）；空 active path 返回干净副本；未知源 fail closed。
- 新增 `tests/fork-session.test.ts` 6 条（富事实源丢弃/链重根/幽灵队列防护/
  宿主 harness.custom 保留/源不变、真实运行副本、覆盖参数、JSONL 重启读取、
  空 Session、未知源）；
  ADR-0036（Proposed）落盘。
- focused `17/0/96`（fork + workflow-extension + cosmos + projection）；全仓
  `402/0/1639`、59 files，pack smoke（113 files、`131.2 kB`/`618.9 kB`，双
  consumer 含
  `forkSession` 断言）通过。
- 下一轮候选：Workflow/SSE/工具组合的新增切片（如多 Session 编排便利），或
  NeuroBook 已验证修复吸收的下一轮扫描。

### 第七十轮规划：Cosmos 编排消费切片 v2（2026-08-12）

- 第 68/69 轮新增两个公开 API，消费证据只到单元级；本轮用真实编排流程组合
  验证「fork 探索 → 结果投影 → 锚定回写」与「重启后投影 + 继续 fork」两条
  闭环，直接服务「支持作为 Cosmos 使用对象」的目标。
- 纯测试轮：若组合暴露 Core 缺口才记录/扩展 API，否则现有合同足够。

### 第七十轮执行与当前验证（2026-08-12）

- 新增 `tests/cosmos-orchestration-consumer.test.ts` 2 条：主会话派生探索分支
  → `invocationResultFromSnapshot` 重建分支结果 → ADR-0009 模式 CAS 回写
  `cosmos.exploration` → 分支不被回写修改；JSONL 重启后仅靠 read + 投影重建
  终态 → 新 Harness `forkSession` 恢复分支并继续跑。
- 修正：共享 ScriptedModelRuntime 需按调用顺序提供脚本；回写 payload 的
  undefined 按 `?? null` 归一。
- focused `18/0/108`（4 files）；全仓 `404/0/1659`、60 files；无 `src/`
  变更，不重复 `pack:smoke`。
- 结论：现有 provider-neutral 合同足以表达 Cosmos 编排闭环，不新增 Core API；
  ADR-0036 已由独立审查裁定升格 Accepted（standalone Core scope）。
- 下一轮候选：ADR-0036 acceptance 裁定后的收尾，或 NeuroBook parity 下一轮
  扫描、SSE/Transport 组合切片。

### 第七十一轮规划：SSE Transport 消费切片（2026-08-12）

- NeuroBook parity 扫描：`server/agent` 自 2026-08-08 起无代码提交（仅
  docs/release chore），无新候选。
- 事件 seam 已有单元测试但缺宿主侧完整交付/恢复循环证据；本轮用三条闭环
  （游标续传、snapshotRequired 恢复、overflow 重同步）验证
  「Core 提供 envelope、Transport 提供编码/投递」的既有边界。

### 第七十一轮执行与当前验证（2026-08-12）

- 新增 `tests/sse-transport-consumer.test.ts` 3 条：宿主侧 `toSseFrame`
  序列化 + `{eventEpoch, after}` 续传只收新事件（seq 单调）；陈旧 epoch →
  `snapshotRequired` → `snapshot()` 重同步 → 新 cursor 恢复；慢消费者
  `queue_overflow` 关闭后同样经 snapshot 恢复。
- focused `38/0/149`（含 events/persistence-events/epoch 套件回归）；全仓
  `407/0/1672`、61 files；无 `src/` 变更，不重复 `pack:smoke`。
- 结论：现有事件 seam 足以表达宿主侧 SSE 交付闭环，不新增 Core API；
  encoder/backpressure/reconnect/鉴权/多 Session 扇出继续留在 Transport。
  独立审查发现 `message_committed` 公开类型声明但全仓无发布点（预存漂移），
  宿主消息投递必须消费 `session_entry`；修复排入下一轮。
- 下一轮候选：修复 `message_committed` 合同漂移（补发布点或从公开类型移除
  并记录 ADR，TDD + 独立审查），或 NeuroBook parity 下一轮扫描。

### 第七十二轮规划：message_committed 合同漂移修复（2026-08-12）

- 第七十一轮审查（Hilbert）P2-1：公开类型 `message_committed` 自 0.1.0 声明
  后从未发布；裁定补发布点（优于移除）——类型是公开合同一部分，`{turn,
  message}` 正是 live 流式投递所需，移除是更大破坏面。
- 发布点：`commitMessages`（user/assistant/parallel/sequential toolResults
  统一入口）+ `resolveApprovals`（approval resume 直接 commit 的 toolResult
  路径），均在 durable commit 成功后发布，attempt fence 约束迟到场景。

### 第七十二轮执行与当前验证（2026-08-12）

- `src/harness.ts`：两处发布点；`tests/message-committed-event.test.ts` 5 条
  （顺序、durable 后置、宿主 write 不触发、sequential toolResult、approval
  resume）；初始 `0/5` red → `5/0/14` green。
- focused 9 文件 `69/0/264`（事件顺序/计数套件无一受影响）；全仓
  `413/0/1691`、62 files，pack smoke（113 files、`131.7 kB`/`620.6 kB`）
  通过。
- 结论：公开合同从「声明未实现」修复为「声明即实现」，不新增 ADR；载荷去重
  由 Transport 层按事件类型分工。
- 下一轮候选：核对公开事件类型与发布点的一致性审计（防止再次漂移），或
  NeuroBook parity 下一轮扫描、Tool/API 组合切片。

### 第七十三轮规划：事件发布点一致性审计（2026-08-12）

- 第七十一/七十二轮连续两轮暴露「声明但未发布」漂移；本轮对 `HarnessEvent`
  全类型做发布点逐项审计，建立人工清单 + 运行时 smoke 双层防线。

### 第七十三轮执行与当前验证（2026-08-12）

- 审计结论：12 个 runtime + 8 个 session + 1 个 host 类型全部有发布点；
  发现并收窄 `snapshot_required.reason`（`epoch_mismatch`/`cursor_ahead`/
  `replay_expired` 从未发布，订阅期恢复由 `EventConnected.snapshotRequired`
  承担；无任何引用依赖被移除值）。
- 新增 `docs/events-inventory.md`（类型 × 发布点 × 触发条件矩阵）与
  `tests/event-publisher-coverage.test.ts`（富会话 smoke 断言 9 个核心
  runtime 类型 + session_entry/status 实际发布）。
- focused `42/0/167`（5 files）；全仓 `414/0/1703`、63 files，pack smoke
  （113 files、`132.0 kB`/`621.2 kB`）通过。
- 下一轮候选：NeuroBook parity 下一轮扫描，或 Tool/API 组合切片（如
  Workflow 组合的下一处便利 API）。

### 第七十四轮规划：ADR-0035 acceptance 复审（2026-08-12）

- ADR 目录盘点确认 0035 是唯一残留 Proposed；第六十三轮审查保留条件为
  「同生命周期 P1 收口后重新评估」，而 abort/waiting 竞态已在第六十三轮收口、
  第六十四至七十三轮同族证据链完整。
- NeuroBook parity 扫描（08-12）无新提交，本轮不并入。

### 第七十四轮执行与当前验证（2026-08-12）

- 独立复审（Carson）No P0/P1：Decision 每条与实现一一对应、Consequences 经
  源码顺序核验成立、保留条件满足、与 ADR-0036 正交兼容；裁定升格 Accepted。
- 变更：ADR-0035 状态/证据/措辞（P2-3 legacy 明确为 draft 省略与显式 null）、
  ADR 索引补 0036（P2-1）、CHANGELOG 记录；纯文档轮，基线沿用第七十三轮
  `414/0/1703`、63 files。
- 全部 ADR 现为 Accepted；下一轮回到功能演进（NeuroBook parity 扫描 /
  Tool·API 组合切片）。

### 第七十五轮规划：跨进程 fork/恢复证据（2026-08-12）

- 第七十轮审查 P2-2 保留项：fork+恢复的进程边界组合未被真实子进程覆盖；
  NeuroBook parity 扫描（08-12）无新提交。
- 复用 jsonl-store 的 Bun→Node ESM worker 模式，把证据级别扩展到
  「worker 完成 → 主进程投影 + fork + 继续」组合。

### 第七十五轮执行与当前验证（2026-08-12）

- 新增 `tests/fixtures/fork-recovery-worker.ts`（子进程完成一次运行并输出
  worker-done marker）与 `tests/fork-recovery-process.test.ts`（bundle +
  spawn + 30s 有界等待；主进程 read/投影/fork/继续/源不变）。
- focused `42/0/224`（5 files，含 worker 套件回归）；全仓 `415/0/1712`、
  64 files；无 `src/` 变更，不重复 `pack:smoke`。
- 结论：跨进程编排闭环（投影 + fork + 继续）全部由公开 API 表达。
- 下一轮候选：waiting 跨进程恢复 + resume 的 worker 组合，或
  Tool/API 组合的下一处便利切片、NeuroBook parity 扫描。

### 第七十六轮规划：跨进程 waiting 恢复与 resume 证据（2026-08-12）

- 第七十五轮 walkthrough 明示保留项：「waiting 跨进程恢复 + resume 仍由
  同进程 Store 实例套件覆盖，未做 worker 组合」；本轮补齐，复用既有
  fixture/bundle/spawn 模式与超时/诊断加固经验。

### 第七十六轮执行与当前验证（2026-08-12）

- 新增 `tests/fixtures/waiting-resume-worker.ts`（子进程进入 durable waiting
  并输出 marker）、`tests/fixtures/process-test-utils.ts`（bundle/spawn/marker
  公共工具，第七十五轮 fork 测试同步重构复用）与
  `tests/waiting-resume-process.test.ts`：主进程投影 waiting（confirmed +
  pendingApprovals）→ owner CAS resume 同一 Invocation → completed（toolResult
  "approved run" 实际执行断言）→ fork 恢复分支继续。
- focused `21/0/111`（5 files，含 recovery/approval 回归）；全仓
  `416/0/1725`、65 files；无 `src/` 变更，不重复 `pack:smoke`。
- 进程边界证据现覆盖完成态（第七十五轮）与 waiting 态（本轮）两条恢复路径。
- 下一轮候选：跨进程 abort waiting 与 approval 拒绝的 worker 组合，或
  Tool/API 组合切片、NeuroBook parity 扫描。

### 第七十七轮规划：跨进程 waiting 控制面证据（2026-08-12）

- 第七十六轮 walkthrough 明示保留项：跨进程 abort waiting 与 approval 拒绝
  未做 worker 组合；复用既有 waiting fixture 与 process-test-utils。

### 第七十七轮执行与当前验证（2026-08-12）

- 新增 `tests/waiting-control-process.test.ts` 2 条：新进程 abort 另一进程的
  durable waiting（throw-model 钉死模型不运行、终态 aborted、投影无 error）；
  新进程拒绝 approval（Tool 不执行、isError "Rejected." 继续、completed、
  transcript 无 "approved run"）；`process-test-utils` 新增 `runWorkerFixture`
  收敛三轮重复的 bundle/spawn/marker 组装（fork-recovery / waiting-resume /
  waiting-control 复用），超时诊断附带部分输出。
- focused `23/0/120`（5 files，含 approval/abort 回归）；全仓 `418/0/1735`、
  66 files；无 `src/` 变更，不重复 `pack:smoke`。
- 进程边界证据闭合：完成态 + waiting 态 + abort/拒绝控制面。
- 下一轮候选：跨进程 steer/follow-up 注入组合，或 Tool/API 组合切片、
  NeuroBook parity 扫描。

### 第七十八轮规划：跨进程 follow-up 注入与自动启动（2026-08-12）

- 第七十七轮 walkthrough 保留项；规划核对：steer 是内存态（`steerOnce` 检查
  本进程 active Map），跨进程注入按设计不适用；follow-up 是 durable ledger，
  跨进程注入 + resume 后自动启动（`resumeOnce` 注册 `watchFollowUps`）是
  round-33/34 已建立合同，本轮补真实子进程证据。

### 第七十八轮执行与当前验证（2026-08-12）

- 新增 `tests/fixtures/follow-up-worker.ts`（waiting 期间由 worker 写入
  durable follow-up 队列）与 `tests/follow-up-process.test.ts`：主进程可见
  队列（followUpState 1 项）→ resume → 自动启动 follow-up Invocation →
  完成（"follow-up done"、transcript 含 follow-up 消息、队列排空）。
- focused `13/0/88`（6 files，含 coordination/follow-up 回归）；全仓
  `419/0/1746`、67 files；无 `src/` 变更，不重复 `pack:smoke`。
- 进程边界证据完整闭合（75-78 四轮）；下一轮候选：Tool/API 组合切片或
  NeuroBook parity 扫描。

### 第七十九轮规划：CHANGELOG 补录与全量对应审计（2026-08-12）

- 第六十六轮审查（Planck P2-2）遗留：CHANGELOG 未补「（及 63–65 轮）」的
  公共行为变化；纯测试轮不写条目、文档轮改变合同状态时写条目（第 74 轮为
  例）。

### 第七十九轮执行与当前验证（2026-08-12）

- 全量审计（`git log 07d1ae8..HEAD`：81 提交 / 46 feat/fix）发现 11 个
  feat/fix 提交无条目，全部补录（parent admission、compaction guard、
  ADR-0005~0013 时代 8 个、interrupted 收敛）；Unreleased 现 48 条；
  README/CONTEXT 抽查无漂移。
- 纯文档轮：verify/pack 基线沿用第七十八轮 `419/0/1746`、67 files。
- 下一轮候选：Tool/API 组合切片或 NeuroBook parity 扫描。

### 第八十轮规划：waitForInvocation 有界等待原语（2026-08-12）

- 双路只读调查：Kant（API 舒适度）确认宿主仍重复编写「等待 Invocation 到
  终态」的有界轮询（coordination 8 行 × 2、follow-up-process 13 行），终止
  判定是 Core 投影知识、宿主容易写错；判定纯读侧值得 Core 提供（不越
  ADR-0001）。Gauss（遗留审计）确认 63-79 轮无未吸收项。

### 第八十轮执行与当前验证（2026-08-12）

- `src/harness.ts` 新增 `WaitForInvocationOptions`、`InvocationWaitTimeoutError`
  与 `waitForInvocation`（invocationResultFromSnapshot 判据、timeout 必填、
  signal/pollIntervalMs、assertUsable 每轮、Session 缺失立即传播）。
- 新增 `tests/wait-for-invocation.test.ts` 7 条（含跨进程等待复用 worker
  fixture）；follow-up-process 13 行轮询重构为 waitForInvocation；
  pack-smoke consumer 补新符号断言（首次暴露 import 缺 error 类型，已修正）。
- focused `14/0/54`（4 files）；全仓 `428/0/1761`、68 files，pack smoke
  （113 files、`135.1 kB`/`631.4 kB`）通过。
- 下一候选：`waitForFollowUpQueueDrain`（follow-up 链排空等待，paused 视为
  稳定态），或 NeuroBook parity 扫描。

### 第八十一轮规划：waitForFollowUpQueueDrain 有界排空等待（2026-08-12）

- 第八十轮候选 B；实现前核对 watchFollowUps 时序：active null + 队列非空是
  链处理瞬时态，不能作为返回条件（否则假排空）；paused 与 active waiting
  视为稳定态返回。

### 第八十一轮执行与当前验证（2026-08-12）

- `src/harness.ts` 新增 `FollowUpDrainTimeoutError` 与
  `waitForFollowUpQueueDrain`（projectFollowUps 投影、返回条件 a/b/c、
  signal/dispose/options 同款）；`tests/wait-follow-up-drain.test.ts` 6 条
  （链完成/paused/waiting/超时/signal/非法 options）；跨进程
  follow-up-process 重构为直接使用。
- focused `20/0/60`（4 files）；全仓 `435/0/1776`、69 files，pack smoke
  （113 files、`136.5 kB`/`638.2 kB`）通过。
- 等待族 API 闭环（waitForInvocation + waitForFollowUpQueueDrain）；
  下一候选：NeuroBook parity 扫描或 Tool/API 组合的下一处便利。

### 第八十二轮规划：model_event 发布路径运行时 smoke（2026-08-12）

- 第七十三轮审计与 `docs/events-inventory.md` 明示的覆盖缺口：`model_event`
  只有代码引用审计；第八十轮遗留审计再次列出。本轮用真实形状的
  ModelRuntime（runTurn 内 request.onEvent 转发）补运行时证据。

### 第八十二轮执行与当前验证（2026-08-12）

- 新增 `tests/model-event-publisher.test.ts`：5 条流式事件按序转发为
  `model_event`（类型序列/delta/turn 精确断言）、全部先于同 turn 的
  `message_committed`、不进入 durable entries；events-inventory 结论行更新。
- focused `8/0/43`（3 files）；全仓 `436/0/1788`、70 files；无 `src/`
  变更，不重复 `pack:smoke`。
- 事件发布防线补全（compaction_* 保留代码审计，需 compactor 配置）；
  下一候选：NeuroBook parity 扫描或 Tool/API 组合切片。

### 第八十三轮规划：host 错误事件运行时覆盖（2026-08-12）

- 第八十二轮审查记录边界候选：`abort_request_error`/`follow_up_error` 无
  运行时断言（触发需失败注入 Store）；本轮补 `abort_request_error` 两条路径
  （非 CAS 类发布 + CAS 类静默）。

### 第八十三轮执行与当前验证（2026-08-12）

- 新增 `tests/host-error-events.test.ts` 2 条：失败注入 Store 对
  `harness.invocation.abort.request` commit 抛普通 Error → host 事件发布且
  强制收口完成（snapshot idle + aborted）；抛 `SessionConflictError` → 静默
  不发布；events-inventory host 行更新。
- focused `38/0/148`（4 files，含 abort/events 回归）；全仓 `438/0/1794`、
  71 files；无 `src/` 变更，不重复 `pack:smoke`。
- 事件覆盖面补全（`follow_up_error`/`tool_call_delta` 留候选）；
  下一候选：NeuroBook parity 扫描或 Tool/API 组合切片。

### 第八十四轮规划：follow_up_error 运行时覆盖（2026-08-12）

- 第八十三轮收尾记录候选：`follow_up_error` 无运行时断言；手工 JSONL +
  Profile payload 拒绝场景触发 `watchFollowUps` 自动启动失败路径。

### 第八十四轮执行与当前验证（2026-08-12）

- `tests/host-error-events.test.ts` 新增第 3 条：手工队列项 payload 被拒绝 →
  `follow_up_error` 精确形状断言、队列保留、不启动新 Invocation；collector
  改为等 host 事件 + 5s 有界 race；events-inventory host 行更新。
- focused `39/0/151`（4 files）；全仓 `439/0/1797`、71 files；无 `src/`
  变更，不重复 `pack:smoke`。
- host 事件全部类型运行时闭环；下一候选：`tool_call_delta` 流式覆盖或
  NeuroBook parity 扫描、Tool/API 组合切片。

### 第八十五轮规划：tool_call_delta 流式事件运行时覆盖（2026-08-12）

- 第八十二/八十四轮收尾明示的最后未覆盖 `ModelRuntimeEvent` 类型；
  provisional 流式事件（tool_call_delta 不与最终消息的 Tool 调用耦合）。

### 第八十五轮执行与当前验证（2026-08-12）

- `tests/model-event-publisher.test.ts` 新增 tool_call_delta 用例：
  message_start → tool_call_delta（toolCallId/toolName/arguments 精确载荷）
  → message_end，3 条 model_event 类型序列与载荷断言；五种
  `ModelRuntimeEvent` 全覆盖；新增 `tests/steer-events.test.ts` 正向断言
  steer_queued/steer_drained 与 transcript 内容（审查 P2 吸收）。
- focused `13/0/59`（5 files）；全仓 `441/0/1804`、72 files；无 `src/`
  变更，不重复 `pack:smoke`。
- 事件运行时覆盖仅剩 `compaction_start/compaction_end`（需 compactor
  配置注入，代码引用审计）；下一候选：NeuroBook parity 扫描或
  Tool/API 组合切片。

### 第八十六轮规划：compaction_start / compaction_end 运行时事件覆盖（2026-08-12）

- 第八十五轮收尾记录的最后两个未覆盖 runtime 事件类型；
  `docs/events-inventory.md` 行号（1832/1857）与第七十三轮审计一致；
  触发需要 compactor 配置注入，本轮补运行时证据。

### 第八十六轮执行与当前验证（2026-08-12）

- 新增 `tests/compaction-events.test.ts`：`triggerTokens: 3` +
  `estimate: () => 1` 在第二次 invoke 触发 compaction；subscribe 断言恰好
  各 1 条 `compaction_start`/`compaction_end`、`tokensBefore === 3`、
  `keptMessages > 0`、顺序在第二次 `agent_end` 之前（初版 `indexOf` 误匹配
  第一次 invoke 的 `agent_end`，改 `lastIndexOf` 后通过）；
  events-inventory 结论行更新。
- focused `31/0/123`（6 files）；全仓 `442/0/1812`、73 files；无 `src/`
  变更，不重复 `pack:smoke`。
- 事件面运行时覆盖闭环（runtime 12 类型全部有 smoke）；下一候选：
  `follow_up_queued` 正向 smoke、NeuroBook parity 扫描或 Tool/API 组合切片。

### 第八十七轮规划：follow_up_queued 正向运行时覆盖（2026-08-12）

- 第八十六轮收尾记录的最后 session 事件覆盖缺口（拒绝路径已有负向断言）；
  NeuroBook parity 扫描同期进行，确认无新生产变更可吸收。

### 第八十七轮执行与当前验证（2026-08-12）

- 新增 `tests/follow-up-events.test.ts`：门控 invoke 期间 `followUp()` 入队
  → `follow_up_queued` 载荷与 durable 队列项一致（id/payload/caller/
  messageIdentity）、完成后自动启动同一 item 的 `follow_up_started`、
  消费后 `followUpState().items` 为空；初版 dispose 顺序错误已修正。
- focused `27/0/127`（5 files）；全仓 `443/0/1820`、74 files；无 `src/`
  变更，不重复 `pack:smoke`。
- 事件面运行时覆盖全部闭环（runtime 12 类型 / session 8 类型 / host 1
  类型含 2 个 name）；
  下一候选：NeuroBook parity 深度对照、Tool/API 组合切片或 ADR acceptance
  收尾审计。

### 第八十八轮规划：悬挂 Tool Call 启动闭合 admission（2026-08-12）

- NeuroBook parity 深度对照：三路并行只读代理（Boole/Hume/Jason）逐模块
  比对核心运行循环、compaction/prepare、identity/事件/队列合同；产出 3 个
  P1（D1 悬挂 call 无闭合 admission、C2 follow-up 默认 caller 分歧、
  B 组 compaction 切分测试收口）与若干 P2。本轮选中 D1（正确性缺口，影响
  真实副作用面）。

### 第八十八轮执行与当前验证（2026-08-12）

- `src/harness.ts` `startOnce` 新增 idle Session 的 `pendingToolCalls`
  闭合检查（anchor/expectedFollowUpId 之后、commit 之前；resume 独立路径
  不误伤）；新增 `tests/closed-tool-call-admission.test.ts` 3 条
  （retry 拒绝 / invoke 拒绝 / 干净路径不受影响）；legacy duplicate
  occurrence 用例从「compaction 阶段 failed」改为「启动期 rejects +
  零 Invocation」；CHANGELOG/CONTEXT 同步。
- focused `59/0/280`（10 files）；全仓 `446/0/1829`、75 files；
  `bun run pack:smoke` 通过（prepack 446/0/1827，113 files，137.3 kB /
  640.6 kB；P2 吸收为纯测试/文档变更，包边界不变）。
- 下一候选：follow-up 默认 caller 对齐（P1）；compaction 切分/二次压缩
  测试收口（P1/P2）；`turn_end waiting`、pausedBy/自动 pause、
  per-event 字节预算（P2）。

### 第八十九轮规划：followUp 默认 caller 对齐（2026-08-12）

- 第八十八轮 parity 对照产出 P1（Jason C2）：NeuroBook 缺省 user，
  standalone 缺省 system/followUp；ADR-0011 无缺省记录、测试仅第八十七轮
  锁定旧值——静默分歧，本轮对齐。

### 第八十九轮执行与当前验证（2026-08-12）

- `src/harness.ts` 两处默认值改为 `{kind: "user"}`（followUpOnce queue
  item 与 startNextFollowUp legacy 回退）；follow-up-events 测试改期望 +
  新增自动启动 Invocation 的 caller 断言（red→green）；ADR-0011 Decision
  补缺省记录、CHANGELOG 新增 fix 条目。
- focused `19/0/114`（7 files）；全仓 `446/0/1831`、75 files；
  `bun run pack:smoke` 通过（prepack 446/0/1830，113 files，137.5 kB /
  641.1 kB）。
- 绕道：`scripts/test-with-timeout.ts` 增加 `--parallel=1`——bun test 默认
  并行 worker 在 Windows 上间歇性整体挂死（今日多次 900s 兜底命中，
  串行 42s 稳定），门禁恢复确定性。
- 下一候选：compaction 切分/二次压缩/toolResult cut/skip/悬挂
  firstKeptEntryId 测试收口（B 组，含 previous-summary 预算语义决策）；
  prepareWrites 当前 invocation 可见性陷阱（P3）文档+测试；
  `turn_end waiting`、pausedBy/自动 pause、per-event 字节预算（P2）。

### 第九十轮规划：compaction 切分与二次压缩合同收口（2026-08-12）

- 第八十八轮 parity 对照 B 组：切分行为存在但零断言（C2/C3/C4 为 P1/P2），
  本轮测试钉住 + C2 语义决策落盘；纯测试 + 文档轮。

### 第九十轮执行与当前验证（2026-08-12）

- 新增 `tests/compaction-splitting.test.ts` 5 条（二次压缩、toolResult
  cut、空窗口 skip、非法 settings、悬挂 firstKeptEntryId）；探针确认
  walk-back 落点与 tokensBefore 口径后修正参数与断言形状；CONTEXT.md 新增
  切分合同条款（含 C2 差异声明）。
- focused `41/0/214`（8 files）；全仓 `451/0/1856`、76 files；无 `src/`
  变更，不重复 `pack:smoke`。
- B 组零断言清单清空；下一候选：prepareWrites 当前 invocation 可见性陷阱
  （P3）文档+红测、`turn_end waiting`、pausedBy/自动 pause、per-event
  字节预算、窗口保护/手动 compact（需新合同）。

### 第九十一轮规划：prepareWrites 可见性合同钉住（2026-08-12）

- parity 对照 B 组最后的 P3：messages 工作副本在 prepareWrites commit 前
  构建，宿主贡献对当前 Invocation 模型不可见；先核查机制（commitMessages/
   commitWritePlans 只落盘不更新工作副本），再判定合同 vs 缺陷。

### 第九十一轮执行与当前验证（2026-08-12）

- 判定：合同而非缺陷（自动注入与双写消费方冲突、改变消息顺序，无真实
  消费者证据前不做破坏性变更）；新增 context-lifecycle 第 5 条钉住
  「prepareWrites 贡献延迟到下一 Invocation 才对模型可见」；ADR-0012 新增
  可见性边界小节（含 NeuroBook 差异与单独 ADR 候选）；CONTEXT 同步。
- 审查 James P2-1 引出 in-invocation compaction 边界：探针复现
  work-copy/path 索引错位（宿主贡献被投影丢弃 + 摘要消息重复保留），修复
  `compactIfNeeded` 改用最新 Snapshot 对齐投影；compaction-splitting 新增
  第 6 条（贡献进入摘要窗口、投影无重复/丢失）；CHANGELOG 新增 fix 条目。
- focused `48/0/226`（9 files）；全仓 `453/0/1863`、76 files；
  `bun run pack:smoke` 通过（prepack 453/0/1863，113 files，138.7 kB /
  643.6 kB）。
- 下一候选：`turn_end waiting` 语义、pausedBy/自动 pause、per-event 字节
  预算（P2）；窗口保护/手动 compact（需新合同）；自动注入 ADR（等真实
  消费者证据）。

### 第九十二轮规划：turn_end waiting 事件语义对齐（2026-08-12）

- parity 对照 C 组 E2（P2）：NB turn_end status 含 waiting，SA 等待轮标
  completed；先核查 waiting 路径与 resume turn 编号（resume 从下一 turn
  继续，waiting turn 不再以 completed 闭合），再改类型与发布点。

### 第九十二轮执行与当前验证（2026-08-12）

- `src/events.ts` turn_end.status 增加 `"waiting"`；`src/harness.ts`
  approval waiting 路径发布 `turn_end(turn, "waiting")`；新增
  `tests/turn-end-waiting.test.ts` 钉住 `turn_end(1, waiting)` →
  `agent_end(waiting)` → `turn_end(2, completed)` → `agent_end(completed)`
  序列（red→green）；events-inventory/CHANGELOG/CONTEXT 同步。
- focused `34/0/119`（9 files）；全仓 `454/0/1869`、77 files；
  `bun run pack:smoke` 通过。
- 下一候选：pausedBy/自动 pause（F3）、per-event 字节预算（E4）、
  窗口保护/手动 compact（需新合同）、自动注入 ADR（等真实消费者证据）。

### 第九十三轮规划：follow-up 自动 pause（2026-08-12）

- parity 对照 C 组 F3（P2）：自动 drain 失败只发 follow_up_error，队首
  坏 item 卡队列且无诊断；对齐 NB pausedBy（自动 pause + 原因，宿主
  cancel/reorder 后 resume）。

### 第九十三轮执行与当前验证（2026-08-12）

- `FollowUpQueueState.pausedBy` + ledger 投影（最后 paused 事实胜出、
  legacy 兼容）+ `truncateUtf8Bytes`；`watchFollowUps` catch 自动 pause
  （itemId/reason/message）；新增 auto-pause 测试 2 条 + host-error-events
  断言扩展（collector 改等 `follow_up_state(paused)` 消除竞态）。
- 绕道：`test` 脚本 Windows 包装器停滞（直接串行 5 连过 vs 包装器 ~50%
  停滞），默认 `test` 改直接 `bun test --parallel=1`，`test:bounded`
  保留包装器；verify/pack:smoke 恢复确定性。
- focused `59/0/264`（13 files）；全仓 `456/0/1888`、78 files；
  `bun run pack:smoke` 通过。
- 下一候选：per-event 字节预算（E4）、窗口保护/手动 compact（需新合同）、
  自动注入 ADR（等真实消费者证据）。

### 第九十四轮规划：per-event 字节预算边界钉住（2026-08-12）

- parity 对照 C 组最后的 P2（E4）：先核实第 58 轮「现有字节预算已覆盖超大
  事件」结论（live push 检查 + replay staged 越界），判定为等价实现，补
  直接钉住测试。

### 第九十四轮执行与当前验证（2026-08-12）

- `tests/events.test.ts` 新增 2 条（单事件超 live 字节预算 → queue_overflow；
  单事件超 replay 字节预算 → snapshotRequired）；CONTEXT 新增 EventHub
  字节预算条款。
- focused `23/0/73`（events.test.ts）；全仓 `458/0/1891`、78 files；
  无 `src/` 变更，不重复 `pack:smoke`。
- parity 审计（第八十八轮 A/B/C 三组）全部收口；下一候选（需新合同/ADR）：
  窗口保护（C10）、手动 compact（C11）、自动注入（等真实消费者证据）。

### 第九十五轮规划：手动 compact（2026-08-12）

- parity 审计 C11（需新合同）：先核查 settings 来源（仅 PreparedRun
  动态产物）与 compaction fact 守卫，再定 API 形态（宿主显式提供
  keepRecentTokens）与 ADR-0037。

### 第九十五轮执行与当前验证（2026-08-12）

- `compactSession` 公开 API + `CompactionRequest.instructions`；抽取
  `compactTranscript` 共享核心（自动路径薄封装，行为不变）；compaction
  fact 守卫放宽（entry/commit invocationId 一致，含皆 undefined）；
  ADR-0037 建立（Proposed）；新增 9 条测试；README/CHANGELOG/CONTEXT/
  ADR 索引同步。
- focused `59/0/259`（10 files）；全仓 `470/0/1920`、79 files；
  `bun run pack:smoke` 通过（公开合同变化）。
- 下一候选：窗口保护（C10，需 Model contextWindow 来源）、自动注入
  （等真实消费者证据）。

### 第九十六轮规划：Cosmos 消费切片 v3（2026-08-12）

- 第九十三/九十五轮新增公开 API 缺编排器组合验证；NeuroBook parity 刷新
  无新提交；ADR-0037 待消费者证据升格。

### 第九十六轮执行与当前验证（2026-08-12）

- 新增 `tests/cosmos-consumer-v3.test.ts` 2 条（压缩→fork→回写；
  压缩→坏项自愈→重启恢复，含 await resume handle 修正）；ADR-0037
  升格 Accepted。
- focused `19/0/116`（5 files）；全仓 `472/0/1938`、80 files；无 `src/`
  变更，不重复 `pack:smoke`。
- 下一候选：窗口保护（C10，证据不足暂缓）、自动注入（等真实消费者
  证据）；37 份 ADR 全部 Accepted。

### 第九十七轮规划：公开 API 面全面审计（2026-08-12）

- 第 61 轮后新增 8+ 公开 API，需交叉核对 root exports ↔ README ↔
  CHANGELOG ↔ pack consumer（AGENTS.md 公共合同同步要求）。

### 第九十七轮执行与当前验证（2026-08-12）

- 审计：README/CHANGELOG 覆盖完整；pack-smoke 缺 compactSession（双
  consumer 补类型 + prototype 检查）；README 开发节过时（默认 test 已改
  直接串行，进程级兜底移至 test:bounded）；follow-up 段补 pausedBy。
- verify 组件（typecheck/build/全量 `472/0/1940`、80 files）与
  `bun run pack:smoke`（含 compactSession 检查）通过；无 `src/` 变更。
- 下一候选：窗口保护（C10，证据不足暂缓）、自动注入（等真实消费者
  证据）。

### 第九十八轮规划：InvocationError.phase 的 stage 级归因（2026-08-13）

- parity 审计代理 A（Boole）的 D2（P2）落地：对齐 NeuroBook withRunKernelPhase 的 model/ingest/compaction/settleRun stage 归因；InvocationError.phase 是自由 string，加值不破坏公开类型。

### 第九十八轮执行与当前验证（2026-08-13）

- src/harness.ts 新增私有 RunStageError(stage, cause) 与 withRunStage 包装；toInvocationError 优先取 stage 为 phase，name/retryable 从 cause 继承；包装 model/ingest/compaction/settleRun（settleRun 用 settledOutput 局部变量避免闭包收窄）。
- 新增 tests/run-stage-phase.test.ts 6 条（model/compaction/settleRun/ingest 归因 + beforeTurn fallback + ingest 包装内 SessionConflictError 的 name/retryable 继承（审查 P2-6））；初版漏存 cause 导致 follow-up-consume-recovery 2 条失败，补 cause 后全绿。
- focused 60/0/243（8 files）；全量逐文件循环 81 files 全过、478/0/1954（工作区口径，含用户保护 tests/context.test.ts；提交范围口径 471/0/1903、80 files）；typecheck/build 通过；bun run pack:smoke 通过（Bun/Node consumer）。
- 下一候选：窗口保护（C10，证据不足暂缓）、自动注入（等真实消费者证据）、Boole D3（带内 terminal stopReason，ADR-0015 暂缓）。


### 第九十九轮规划：NB 黑盒终态语义吸收（2026-08-13）

- NB black-box 25 场景矩阵映射 SA 测试矩阵：21 场景等价覆盖，4 项缺口——终态 pause（#15/#17）、tool throw 分流（#13/#14）、settleRun 迟到写（#21）；NB pauseFollowUps 队列空则跳过、reason error/aborted。

### 第九十九轮执行与当前验证（2026-08-13）

- src/harness.ts watchFollowUps 终态分支 + pauseFollowUpsOnTerminal（CAS 写 paused 事实、发布 follow_up_state、失败吞掉不掩盖终态）；coordination.pausedBy 新增可选 invocationId；follow-up-ledger 投影透传。
- 新增 tests/nb-terminal-parity.test.ts 7 条（先 3 red 后全绿）：failed/aborted pause 精确载荷、空队列不写事实、JSONL 重启恢复 + resume、tool throw 恢复继续、终态 steer 不注入、settleRun 迟到写拒绝。
- focused 81/0/325（14 files）；全量逐文件循环 82 files、485/0/1986；typecheck/build 通过；bun run pack:smoke 通过（prepack 单命令 verify 485/0/1985、41.55s；tarball 113 files；Bun/Node consumer）。
- 下一候选：C10 窗口保护（证据不足暂缓）、自动注入（等真实消费者证据）、NB interrupted 终态暂停、图片/附件 durable 内容（需独立 ADR）。

### 第一百轮规划：Model contextWindow 窗口保护 + interrupted 候选否定（2026-08-13）

- interrupted 候选先核实：NB pauseFollowUps 的 "interrupted" 是签名死参数（全部调用点仅 aborted/error）→ 否定、不吸收，钉住 SA 现状即可。
- C10 证据成立：NB assertContextWithinWindow（请求前估计、超窗 fail closed）已被 NB 测试钉住；SA 用可选 ModelRuntime.contextWindow + compactor.estimate 吸收。

### 第一百轮执行与当前验证（2026-08-13）

- src/model.ts ModelRuntime 新增可选 contextWindow；src/harness.ts 构造校验 + run 循环请求前超窗守卫（phase run；未声明/无 compactor 跳过）。
- 新增 tests/model-context-window.test.ts 5 条 + nb-terminal-parity 第 8 条（interrupted 现状钉住）；先 2 红后全绿。
- focused 104/0/423（18 files）；全量逐文件循环 83 files、491/0/2007；typecheck/build 通过；bun run pack:smoke 通过（prepack verify 491/0；tarball 113 files / 147.2 kB；Bun/Node consumer）。
- 下一候选：自动注入（等真实消费者证据）、图片/附件 durable 内容（需独立 ADR）、NB percent-based compaction 合同（需真实消费者证据）。

### 第一百零一轮规划：多角度只读调查（2026-08-13）

- 三路只读代理：A（API 形态审计）、B（NB 附件语义吸收评估）、C（自动注入证据复核）；外部复核 NB/Cosmos 新证据。

### 第一百零一轮执行与当前验证（2026-08-13）

- 结论落盘 walkthrough：102 轮执行 A-C2（appendEntries + listSessionIds）+ 文档偏差修复 + 「实现自定义 SessionStore」README 文档节；103 轮自动注入 ADR（prepareWrites 限定）；104 轮 attachment 最小 Core seam。
- 纯文档轮：无 src/测试变更，不重跑 focused/全量/pack（上一轮 491/0/2007 证据仍为当前基线）。
- 下一候选：见综合决定（102/103/104 已排期）。

### 第一百零二轮规划：appendEntries 便捷 API（2026-08-13）

- 执行第一百零一轮规划代理 A 的 C2（appendEntries + listSessionIds，非破坏纯新增）与 (d) 文档偏差修复、C1 的 README 文档节。

### 第一百零二轮执行与当前验证（2026-08-13）

- src/harness.ts 新增 appendEntries（组装 appendEntries plan 走既有 writeOnce/commit 守卫）；src/storage/jsonl.ts 新增 listSessionIds（与 reconcile 同源扫描、排序正数 ID）。
- 新增 tests/append-entries-api.test.ts 5 条（追加+游标、空 drafts、Core-owned 拒绝、CAS 过期冲突、JSONL 枚举+跨实例恢复）；README/CHANGELOG/CONTEXT 同步。
- focused 84/0/384（10 files）；全量逐文件循环 84 files、498/0/2023；typecheck/build 通过；pack:smoke 通过（prepack verify 498/0；tarball 113 files / 149.0 kB）。
- 下一候选：第 103 轮自动注入 ADR（prepareWrites 限定吸收）；第 104 轮 attachment 最小 Core seam。

### 第一百零三轮规划：prepareWrites 自动注入（ADR-0039，2026-08-13）

- 执行第一百零一轮规划代理 C 的限定吸收：prepareWrites 同轮注入（NB 有测试钉住），Tool/hook writePlans 不吸收；双写消费方迁移为新单源合同。

### 第一百零三轮执行与当前验证（2026-08-13）

- src/harness.ts 新增 prepareContributionMessages + 非 resume 路径注入（commitWritePlans 之后、userMessage 之前，与 durable 顺序一致）。
- context-lifecycle test 2/4 改单源、test 5 改写新合同；新增 tests/auto-inject-prepare-writes.test.ts 2 条（custom 不注入；Tool writePlans 维持延迟合同）。
- 先 4 红后全绿；focused 77/0/417（15 files）；全量逐文件循环 85 files、500/0/2031；typecheck/build 通过；pack:smoke 通过（prepack verify 500/0；tarball 113 files / 150.0 kB）。
- 下一候选：第 104 轮 attachment 最小 Core seam；C3（retry 签名/错误面收敛）。

### 第一百零四轮规划：attachment 内容块 seam（ADR-0040，2026-08-13）

- 执行第一百零一轮规划代理 B 的最小 Core seam：attachment 引用块进类型合同，blob/授权/hydration 留宿主；toolResult/assistant 输出不扩（无证据）。

### 第一百零四轮执行与当前验证（2026-08-13）

- src/model.ts 类型扩展 + userMessageText marker 助手；机械收窄 9 处测试 string 假设（无行为变化）；新增 tests/attachment-content-blocks.test.ts 4 条。
- focused 79/0/418（13 files）；全量逐文件循环 86 files、504/0/2045；typecheck/build 通过；pack:smoke 通过（prepack verify 504/0；tarball 113 files / 151.1 kB）。
- 下一候选：C3（retry 签名/错误面收敛）；toolResult/assistant 块类型（待消费者证据）；Cosmos/NeuroBook 真实消费者接入证据。

### 第一百零五轮规划：retry options 与错误面收敛（C3，2026-08-13）

- 执行第一百零一轮规划代理 A 的 C3：retry options+signal（兼容旧重载）、导出 AbortBoundaryError/InvocationWriteFenceError、公共 admission 类型化、wait 选项类型名。

### 第一百零五轮执行与当前验证（2026-08-13）

- src/harness.ts 新增 RetryOptions/WaitForFollowUpQueueDrainOptions/HarnessAdmissionError 导出，retry signal 透传，9 处 admission 类型化（message 不变），两个错误类导出。
- 新增 tests/retry-api.test.ts 4 条；focused 85/0/294（14 files）；全量逐文件循环 87 files、508/0/2059；typecheck/build 通过；pack:smoke 通过（prepack verify 508/0；tarball 113 files / 152.0 kB）。
- 下一候选：规划 A/B/C 的排期全部收口——后续转向真实消费者证据获取（NeuroBook/Cosmos 接入）或按用户新方向。

### 第一百零六轮规划：公开 API 面再审计（2026-08-13）

- 第 97 轮审计后 8 轮新增公开 API，重做交叉审计并让 pack consumer 钉住新导出。

### 第一百零六轮执行与当前验证（2026-08-13）

- 19 模块导出枚举 + index 重导出面核对：第 98-105 轮新增全部有文档条目、无缺口；messageFromEntry 保持非公开（内部共享 helper）。
- scripts/pack-smoke.ts 双 consumer 扩展值/类型/运行检查；pack:smoke 通过（prepack verify 508/0；tarball 113 files / 152.1 kB）。
- 无 src/测试行为变更；focused/全量沿用第 105 轮基线。
- 下一候选：真实消费者接入证据（宿主侧动作）、toolResult/assistant 输出块类型（待消费者证据）。

### 第一百零七轮规划：ADR 升格评估（2026-08-13）

- 外部复核：NB/Cosmos 无新提交、无新吸收项；三份 Proposed ADR 的证据门禁均已过独立审查，执行升格。

### 第一百零七轮执行与当前验证（2026-08-13）

- ADR-0038/0039/0040 Status 升格 Accepted 并补录验证数字与审查结论；Task README/CHANGELOG 同步；40 份 ADR 全部 Accepted。
- 纯文档轮：无 src/测试行为变更（用户保护 tests/context.test.ts 的前序改动除外），不重跑测试（第 105/106 轮基线有效）。
- 下一候选：真实消费者接入证据（宿主侧动作）、toolResult/assistant 输出块类型（待消费者证据）。

### 第一百零八轮规划：SSE 帧序列化 + 覆盖收口（2026-08-13）

- 覆盖矩阵扫描确认公开入口无缺口；「SSE 能力」的最小形态落地（第一方帧序列化，HTTP 留宿主）。

### 第一百零八轮执行与当前验证（2026-08-13）

- src/sse.ts 三个序列化函数 + index 根导出；新增 4 条序列化测试；第 71 轮消费切片采用。
- focused 47/0/164（8 files）；全量逐文件循环 88 files、512/0/2074；typecheck/build 通过；pack:smoke 通过（prepack verify 512/0；tarball 117 files / 153.9 kB；首次停滞重试通过）。
- 下一候选：真实消费者接入证据（宿主侧动作）、toolResult/assistant 输出块类型（待消费者证据）。

### 第一百零九轮规划：真实 HTTP SSE 宿主边界（2026-08-13）

- 第一百零八轮已证明第一方 event-stream 帧格式，但 HTTP 服务、socket 连接和游标 header 仍没有真实网络边界证据。
- 采用最小宿主 fixture：Bun.serve 提供有限 SSE 响应，Node http 客户端执行首连和携带 Last-Event-ID/event-epoch 的续传；不把 HTTP DTO、鉴权、heartbeat、Job/Lease/Outbox 或连接管理下沉到 Core。
- 本机 Windows/Bun 对无限保持流和服务 graceful shutdown 存在不稳定行为，因此把本轮成功标准限定为可重复的有限响应、真实 HTTP 帧和 cursor 续传，并把无限流/断连/浏览器/产品验收明确列为未验证。

### 第一百零九轮执行与当前验证（2026-08-13）

- 新增 tests/fixtures/sse-http-worker.ts、tests/fixtures/sse-http-driver.ts 与 tests/sse-http-transport.test.ts；worker 使用既有 harness.subscribe() 和 serializeSseJsonEvent()，driver 使用 Node http.request 解析真实 text/event-stream。
- 首次实现发现 Windows Bun shim 的 worker 子进程在测试成功后残留，并导致 focused 收尾约 15 秒；已改为 driver try/finally 对精确 worker PID 使用 taskkill /PID /T /F，并以有界等待回收。最终 focused bun test tests/sse-http-transport.test.ts 为 1 pass / 0 fail / 3 expect、约 2.0s；bun run typecheck 通过；测试后未发现 sse-http-driver/sse-http-worker 残留进程。
- 最终 bun run verify 通过：89 files、513 pass / 0 fail / 2077 expect，包含 typecheck、build 和有界全量测试。最终 bun run pack:smoke 通过：prepack 同为 513/0/2077；tarball 117 files / 153.9 kB；Bun/Node package consumers 通过。独立 post-fix 静态审查（Carver）为 P0/P1=0；P2 仅为本 walkthrough 已列明的 Transport/fixture 未验证边界。
- 已证明有限 HTTP/SSE socket/frame/cursor 边界；未证明无限保持流、断连重试、取消、heartbeat、backpressure、graceful shutdown、浏览器 EventSource、真实 NeuroBook/Cosmos/provider/Store 或生产部署；这些不构成本轮 Core 合同。
- 用户既有 dirty docs/architecture.md、docs/pi-adapter-design.md、tests/context.test.ts 以及未归属本轮的 package.json 修改不纳入 checkpoint；本轮仅 stage 第 109 轮 fixture、测试和 Task 文档。

### 第一百一十轮规划：Context lifecycle settlement + Cosmos-style Agent Action conformance（2026-08-13）

- NeuroBook 最新 parity 证据：Profile 的动态 Appending 由宿主 History Adapter 读取未见变更，provider 成功 ingest 后才调用 `settleProfileTurnContexts()` 推进 History cursor；History handle、cursor、文件变化查询和权限都不属于 Harness Core。
- 现有 standalone seam 已有 `ContextProvider.resolve(snapshot)`、`modelContextAppending`、Invocation `result()`、`InvocationResult.persistence`、waiting/resume、`abort`、`invocationResultFromSnapshot` 和 JSONL recovery，但没有一个跨宿主 settlement API；先用 fake History/Workflow host 做 adapter-only tracer，验证宿主是否能在成功/失败/等待/取消路径安全结算，不预先扩展 Core。
- Cosmos 需求复核：Cosmos Phase 1 仍直接使用 `pi-ai`，源码/manifest 还没有真实 `neuro-agent-harness` 依赖；`agent.invoke@1` 是可选 ActionDefinition 目标，Cosmos 继续持有 Workflow/Job/Lease/Outbox durable truth。conformance 只模拟 `flowId`/`runId`/`sessionRef`，不声称真实 Cosmos 集成。
- 成功判据：fake History 的未见内容只在 model request 的 provider-neutral `modelContextAppending` 中出现一次；成功 completed 后宿主推进 cursor；failed/aborted/waiting 在可继续之前不推进；waiting 经公开 `resume()` 完成后可继续结算；JSONL 重启后公开投影保留 output/usage/status；Cosmos-style Action 可用现有 Session/Profile/Capability/Workflow seam 表达。
- 若上述 conformance 全部通过，本轮不新增 public API、durable shape、ADR 或依赖；只有证据表明 settlement 必须由 Core 统一持有、现有 adapter seam 无法表达且存在安全/重复消费风险时，才暂停执行并设计最小合同/ADR。

### 第一百一十轮执行、收尾与独立复核（2026-08-13）

- 新增 test-only adapter/consumer tracer：`tests/context-settlement-adapter.test.ts` 与 `tests/cosmos-agent-action-conformance.test.ts`；未修改 `src/`、根导出、durable shape、ADR 或依赖。
- Context tracer 用宿主自有 `FakeHistory` 验证：completed 且 `persistence === "confirmed"` 后才推进 cursor；failed、aborted、waiting 在可继续前不推进；公开 `resume()` 完成后才结算；JSONL restart 后 `invocationResultFromSnapshot()` 保留 output/status/persistence；`modelContextAppending` 在每次 request 中只出现一次。
- Cosmos tracer 用宿主自有 `CommitWorkflowScheduler`、typed Host Context、Capability、`invokeAt(anchor)`、`snapshot()`、`write()` 和 JSONL Store 表达 `action.requested → Agent Invocation → projection → action.completed`；验证 flow/run/sessionRef/workspace、Capability close、anchor、system caller、output/usage 和重启恢复。
- focused：`bun test tests/context-settlement-adapter.test.ts tests/cosmos-agent-action-conformance.test.ts` 为 `4 pass / 0 fail / 45 expect`；受影响面为 Context/projection `18/0/107`、Cosmos/Workflow `29/0/162`、Store/abort/recovery `71/0/331`；`bun run typecheck` 通过。
- 最终全量：`bun run verify` 为 `517 pass / 0 fail / 2122 expect`（`91 files`），typecheck/build 通过。详细证据见 [第一百一十轮 walkthrough](walkthroughs/2026-08-13-context-settlement-cosmos-action.md)。
- 结论：现有 provider-neutral seam 足够，不新增 settlement API、Cosmos-specific API、Job/Lease/Outbox/Run DTO、durable 字段或 ADR。真实 Cosmos package/provider/pi-ai/Node consumer、NeuroBook runtime、第三方 Store、浏览器/Product、生产 Transport 和部署仍未验证；本轮 fake-host conformance 不等同于真实集成验收。
- 独立复核：当前已运行的集成/静态复核未发现 P0/P1；用户既有 dirty `docs/architecture.md`、`docs/pi-adapter-design.md`、`tests/context.test.ts` 和未归属的 `package.json` 修改不纳入本轮 checkpoint。

### 第一百一十一轮规划：安装后真实消费者/API usability tracer（2026-08-13）

- 第 110 轮已证明源码测试中的 public seam 足够表达 Context settlement 和 Cosmos-style Workflow Action，但还没有证明“安装后的消费者”能从 tarball 只通过 package exports 完成同样组合；现有 `scripts/pack-smoke.ts` 更偏导出、类型和基础 consumer smoke。
- 规划代理 C 建议优先验证已安装包的真实组合，其次再补宿主 HTTP 断连/snapshot recovery；暂缓 `toolResult`/assistant output blocks，因为当前没有真实 Cosmos/Pi 信息损失证据。
- Cosmos 当前源码/manifest 仍没有真实 `neuro-agent-harness` 或 `agent.invoke@1` 实现；Phase 1 继续直接使用 `pi-ai`，因此本轮只做可逆 consumer conformance，不创建 Cosmos-specific API，也不下沉 Job/Lease/Outbox/Run durable truth。
- 采用 Bun/Node 双 consumer：从 `npm pack` 产物安装到隔离临时根，使用根入口与 `storage/jsonl` / `testing` 子路径，不引用 `src/`、dist 内部路径或私有字段；组合 `createSession → invoke → Capability-bound Tool → snapshot/result projection → invokeAt anchor/writeback → JSONL restart → subscribe cursor`。
- 成功判据：Bun 与 Node 均能安装并运行同一 public consumer；输出、usage、host context、caller、宿主 entry、Snapshot projection 和 cursor replay 在重启/回读后保持一致；若所有通过，不新增 `src/`、public API、durable shape、ADR 或依赖。
- 未纳入本轮：真实 Cosmos package/provider/pi-ai、NeuroBook runtime、浏览器 EventSource、无限 SSE、HTTP 鉴权/heartbeat/backpressure、生产部署；这些必须继续单独报告。

### 第一百一十一轮执行、收尾与独立复核（2026-08-13）

- 新增 test-only 安装后 consumer tracer：tests/package-consumer-usability.test.ts 与 tests/fixtures/package-consumer.ts。consumer 从 npm tarball 安装，在 Bun 与 Node 两条路径只使用根入口、storage/jsonl 和 testing package exports；没有引用 src/、dist 内部路径或私有字段。
- 公开组合已实测贯通：createSession → invokeAt(anchor) → Capability-bound Tool → InvocationResult / invocationResultFromSnapshot → host writeback → subscribe cursor replay → JSONL restart projection。
- 额外钉住 typed Host Context（flowId/sessionRef/workspaceKey）、system caller、output、usage、persistence: confirmed、宿主 entry、Capability close 以及 restart 后旧 epoch/cursor 的 snapshotRequired recovery。
- TDD 初始 red 来自缺失 fixture；随后 Node consumer typecheck 暴露 fixture 对 @types/node 和非 JSON TokenUsage payload 的不必要依赖，已将 fixture 改为最小外部 consumer。没有因此修改 src/ 或 public API。
- focused：bun test tests/package-consumer-usability.test.ts 为 1 pass / 0 fail / 2 expect。最终全量：bun run verify 为 518 pass / 0 fail / 2124 expect（92 files），typecheck/build 通过。
- 最终 bun run pack:smoke 通过：prepack 同为 518/0/2124，tarball 117 files / 153.9 kB，Bun/Node package consumers 通过。详细证据见 walkthroughs/2026-08-13-installed-package-consumer.md。
- 本地独立静态复核未发现 P0/P1；并行审查代理槽位已满，未新增代理审查。真实 Cosmos package/provider/pi-ai、NeuroBook runtime、第三方 Store、浏览器/Product、生产 Transport 和部署仍未验证，本轮不把 package conformance 报告为真实集成验收。
- 结论：安装后 public seam 足够支持当前 consumer 组合，不新增 public API、Cosmos-specific API、durable 字段、ADR 或依赖。

### 第一百一十二轮规划：动态 Profile context delivery parity（2026-08-13）

- NeuroBook 最新代码路径显示动态 Profile context 在成功 turn ingest 后推进 settlement，即使该 turn 随后进入 approval waiting；第 110 轮 standalone tracer 当前验证的是 waiting 在可继续前不推进。两者是未解决的行为合同差异，不能直接默认其中一方是 parity 正确答案。
- 先做 test-only tracer，不新增 History、cursor、Project 或产品 recovery API：覆盖多 turn materialization/ingest、waiting settlement、model failure、JSONL restart、重复/丢失和多 ContextProvider 顺序。
- 再做 waiting/restart 的 Capability generation tracer：确认 generation A 在 waiting 时关闭，resume 复用逻辑 Invocation ID 但重新打开 generation B；generation 类型继续由宿主 Capability 管理。
- 只有证据证明现有 ContextProvider + Runtime Hook + SessionWritePlan 闭包无法安全保证逐 turn delivery/settlement，才设计最小 provider-neutral 合同并记录 ADR；否则保持 Core 宿主无关，不扩展 API。

### 第一百一十二轮执行、收尾与独立复核（2026-08-13）

- 新增 test-only tracer：tests/profile-context-delivery-parity.test.ts。测试宿主用 FakeDynamicHistory、beforeTurn materialization write plan、request-only ContextProvider、SessionCommitObserver、Memory/JSONL Store 和 Capability generation A/B 表达动态 context delivery。
- NeuroBook-style policy 已实测：assistant transcript 成功 ingest 后即 settlement，即使本轮随后进入 approval waiting；waiting 后 resume 复用同一 logical Invocation ID，下一次只消费新的 History item，并重新打开新的 Capability generation。
- failure 边界已实测：ModelRuntime failure 或 assistant transcript ingest failure 都不 settlement；已有 durable materialization marker 不重复写入，后续成功 ingest 后才 settlement。
- request-only 边界已补断言：宿主自己的 durable-dynamic entry 出现在 Snapshot，但 modelContextAppending 的 dynamic-request 消息不会自动进入 Session transcript。
- focused：bun test tests/profile-context-delivery-parity.test.ts 为 3 pass / 0 fail / 43 expect。全量 bun run verify 为 521 pass / 0 fail / 2167 expect（93 files），typecheck/build 通过。
- 本轮没有修改 src/、根导出、durable shape、ADR、package.json 或依赖，因此没有重复运行 pack:smoke；第 111 轮 package boundary 证据仍有效。详细证据见 walkthroughs/2026-08-13-profile-context-delivery-parity.md。
- 本地静态复核未发现 P0/P1；规划代理与源码顺序复核一致。真实 NeuroBook Adapter、真实 provider/pi-ai、第三方 Store、浏览器/Product、生产 Transport 和 Cosmos 接入仍未验证。
- 结论：现有 ContextProvider + RuntimeHook + SessionWritePlan + SessionCommitObserver + resume + Capability seam 足够表达宿主侧逐 turn delivery/settlement，不新增 settlement API、History/cursor 类型、Project/NeuroBook DTO、Cosmos-specific API 或 ADR。

### 第一百一十三轮规划入口（2026-08-13）

- 第 112 轮确认了“宿主可以组合”但没有真实 NeuroBook Adapter 运行证据；下一轮优先寻找真实 consumer/provider/Transport 边界，而不是继续增加 fake context fixture。
- 若 NeuroBook 尚未开始真实 Harness 依赖，优先规划宿主断连后的 snapshotRequired DTO/recovery tracer；HTTP、heartbeat、backpressure 和浏览器仍留在 Adapter。
- 若出现真实 provider 或 consumer 的 output 信息损失，再规划 toolResult/assistant output blocks；没有证据时不扩展 Model/Core 合同。
- Cosmos 仍保持 revisit gate：只有 tracked Adapter、manifest/lockfile 依赖、可执行 agent.invoke@1 schema 或真实 Action Job test 出现，才重新规划 Cosmos integration。

### 第一百一十四轮执行、收尾与独立复核（2026-08-13）

- 对照 NeuroBook `turn-failure.ts`、`neuro-agent-harness.ts`、Session message types 和 partial/interruption tests：NeuroBook 将 partial 作为带 `status: partial/interrupted` 的普通 assistant transcript，并由 retry/tree/fork 的宿主消息树语义控制；standalone Harness 则将 partial 作为 `harness.invocation.partial` Invocation 终态事实。两者是职责差异，不能默认行为一致。
- 新增 test-only host projection tracer：`tests/model-turn-partial.test.ts` 使用 `defineSessionEntryCodec`、`appendEntries`、`activeSessionPath`、`projectSessionTranscript`、`invocationPartial`、JSONL restart 和 `retry`，验证宿主可保存可恢复展示 entry，而不污染 Core transcript、retry Provider request 或 Core partial fact。
- focused：`bun test tests/model-turn-partial.test.ts` 为 `14 pass / 0 fail / 65 expect calls`；`bun run typecheck` 通过；`git diff --check` 通过，仅有 Windows LF/CRLF 转换提示。
- 本轮没有修改 `src/`、根导出、durable Core shape、package.json、依赖或打包边界；`pack:smoke` 沿用第 111 轮已验证的 Bun/Node tarball consumer 证据，不重复运行。
- `bun run verify`：`522 pass / 0 fail / 2181 expect calls`，93 files；typecheck/build 通过。真实 NeuroBook/Cosmos Adapter、真实 provider/pi-ai、第三方 Store、浏览器/Product、生产 Transport 和部署验收仍分别未验证；本轮没有将 test-only tracer 报告为真实集成。
- 本地窄审查复核了 active-path/append-only 关系、host entry 与 Provider transcript 隔离和 restart/retry 断言，未发现 P0/P1；独立审查代理槽位已满，未新增代理。
- 结论：现有 `ModelTurnError.partial`、`invocationPartial`、host entry codec 和 append-only Session seam 足够表达“展示 partial 但不喂给 Provider”的宿主组合；不新增 Core partial continuation API 或 ADR。

### 第一百一十五轮规划入口（2026-08-13）

- 优先检查真实 Cosmos 需求和当前仓库状态是否已经出现 tracked Harness Adapter、manifest/lockfile 依赖或可执行 `agent.invoke@1` schema；在此之前 Cosmos 继续直接使用 `pi-ai`。
- 若没有真实消费者接线，选择一个更接近真实 Transport/Provider 边界的验证；不继续堆叠没有新问题来源的 fake parity fixture。
### 第一百一十五轮执行、收尾与独立复核（2026-08-13）

- 新增 public consumer tracer：`tests/profile-model-replacement-retry.test.ts`。Memory 与 JSONL restart 均通过 `ProfileRegistry.replace()` → `retry()` 观察 Profile prepare、Model request、durable Invocation projection 和 runtime-only `modelConfig`。
- Public red 初始把 retry 当作旧执行的 exact replay，`bun test tests/profile-model-replacement-retry.test.ts` 得到 `0 pass / 2 fail / 6 expect calls`；实际观察到 replacement 后的 B Profile/Model 与新 Invocation `profileVersion: 2`，JSONL restart 同样如此。
- Green contract 改为明确 retry 是新 Invocation：复用旧 Parsed input，绑定 retry 时当前 Profile/Model，记录 `retryOf` 与当前 `profileVersion`，不把 `PreparedRun.modelConfig` 写入 durable record。focused `bun test tests/profile-model-replacement-retry.test.ts tests/retry-api.test.ts tests/canonical-schema-value-admission.test.ts` 为 `23 pass / 0 fail / 53 expect calls`。
- 结论是 Adapter 约定，不新增 Core API/ADR/依赖/durable model snapshot：消费者不得把 retry 当 exact replay；需要 exact replay 时由 Adapter 使用不可变 Profile/Model binding（版本化 key 或固定 Runtime）保证。Profile Version 是兼容声明，不是 retry pin。
- `bun run typecheck` 与 `bun run build` 通过；`bun run verify` 的 typecheck/build 阶段通过，但因接手前已 dirty 的 `package.json` 指向 bounded wrapper，300 秒后以 exit 124 超时。直接 `bun test --parallel=1` 通过：`524 pass / 0 fail / 2187 expect calls`，`94 files`；`git diff --check` 通过（仅有 Windows LF/CRLF 转换提示）。没有修改该 protected package.json，也没有 public export、package manifest 或依赖变化，因此不重复运行 `bun run pack:smoke`，第 111 轮 package boundary 证据仍有效。
- 独立静态复核检查了 public seam、Memory/JSONL 对照、durable/runtime 分界和 protected dirty 文件边界，未发现 P0/P1/P2。真实 NeuroBook/Cosmos Adapter、真实 provider/pi-ai、第三方 Store、浏览器/Product、生产 Transport 和部署仍未验证。

### 第一百一十六轮执行、收尾与独立复核（2026-08-14）

- 按第 115 轮规划转向真实 consumer 证据：确认同级 `llmlint` 的 manifest 精确依赖 `@notnotype/neuro-agent-harness: 0.1.0`，入口为 `dist/index.js`；`bun import.meta.resolve('@notnotype/neuro-agent-harness')` 实际返回当前 Harness `dist/index.js`，该文件与当前 `dist/index.js` 的 SHA-256 均为 `068c21002fec94031ddb0e537105912412b52664686e1d82a664aa5cc43e8b73`。
- 当前 Harness 前置 `bun run build` 通过；根仓初始与构建后均只保留既有 dirty 文件 `docs/architecture.md`、`docs/pi-adapter-design.md`、`package.json`、`tests/context.test.ts`。llmlint 工作树观察到既有 `?? .worktree/`，本轮未写入或清理。
- 真实消费者聚焦命令：`bun node_modules/vitest/vitest.mjs run tests/neuro-agent-harness-adapter.test.ts tests/neuro-agent-harness-analysis-capability.test.ts tests/neuro-agent-harness-pi-runtime.test.ts tests/neuro-agent-harness-prisma-store.test.ts tests/neuro-agent-harness-profile.test.ts tests/neuro-agent-harness-review-projector.test.ts tests/agent-session-rebuild.test.ts`；结果 `7 passed`、`47 passed`、`0 failed`。llmlint `bun run typecheck` 通过。
- 组合根由 llmlint 宿主创建 `NeuroAgentHarness<string, LlmlintHostContext, LlmlintModelConfig>`，注入 `ProfileRegistry`、`PrismaSessionStore`、`LlmlintPiModelRuntime`、两个 Capability Provider 与 `MachineLlmReviewProjector`。Adapter 负责 Session/Invocation 公开投影、权限、Revision/HTTP 409、`invoke`/`advanceRevision` 的同 Session 命令串行化、retry/abort、Snapshot 与 SSE DTO；`toolcall_end` 的完整参数映射留在 Pi Adapter。
- 测试覆盖了新建/调用/编辑/完成/Snapshot/replay、abort/retry/Revision 推进、Capability/commit observer、Prisma reducer/CAS/reconcile、Pi message/tool 转换、`start`/`text_delta` 事件、thinking/text 结果、usage/token cap 和 Session rebuild；`AbortSignal` 透传及更完整 Pi event/error 矩阵属于宿主实现边界，但未被本轮 focused 断言。测试模型是 deterministic fixture，不是凭据驱动的网络 Provider。
- 未运行 `../llmlint/.agent/workspace/neuro-agent-real-smoke.ts`：它需要真实凭据/数据库并会写产品 Session/Revision。未运行 `pack:smoke`：本轮没有 public export、manifest、dependency 或包内容变化。真实 Cosmos、NeuroBook、浏览器/Product、无限流 HTTP/SSE 和部署仍未验证。
- Harness 回归按计划完成：先执行 `bun run typecheck` 通过，再执行 `bun run verify` 通过；verify 内部 typecheck/build 通过，完整测试为 `524 pass / 0 fail / 2187 expect calls`、`94 files`。
- 结论：当前 Harness public package 已被 llmlint 的真实宿主链以当前构建产物消费并通过 deterministic compatibility acceptance；没有发现需要修改 Core、公开合同、durable schema 或依赖的兼容缺口。

回到下一轮规划：只在出现新的真实 consumer/provider/Transport 问题来源时再评估 Core 增量。

### 第六十二轮执行与当前验证（2026-08-11）

- 初始 public red 为 `0 pass / 1 fail / 1 assertion`：旧 `harness.write()` 接受 shape-valid `agent.compaction`，使“应拒绝”断言 resolve。
- `src/harness.ts` 新增 private `allowCompactionFact` 与 exact-plan guard；generic `write()`、Profile Hook/Tool effect 的 shared `commitWritePlans()` 均在 durable commit 前拒绝，内部 `harness.compaction` 仍可提交。
- 新增 `tests/core-owned-entry-admission.test.ts` 三条回归；初始实现 focused 为 `32/0/124`，随后严格复现 reducer 已通过但 durable append 尚未开始的 abort race。
- 新增 runtime-only `SessionCommitOptions.signal`、`SessionCommitAbortedError` 与 `assertSessionCommitNotAborted()`；Memory/JSONL 在 Store 自己的锁/事务边界内于最终写入前检查 signal，Harness 的 aborted terminal 不受该 signal 阻挡。
- `requestAbort()` 先提交 `setStatus: "aborting"`；reducer 在 abort overlay 下拒绝普通迟到计划；重启协调将未完成的 aborting running/waiting owner 收口为 `aborted`。不改变 durable entry/Snapshot shape。
- focused：`bun test tests/core-owned-entry-admission.test.ts tests/compaction.test.ts tests/invocation-ownership.test.ts tests/abort-boundary.test.ts tests/recovery.test.ts tests/memory-store.test.ts tests/jsonl-store.test.ts tests/workflow-invocation-signal.test.ts` 为 `80/0/381`；Store contract + recovery + race 合并为 `42/0/253`。
- 初始 `bun run verify`（只含 durable overlay、未含 Store final-boundary 修复）为 `344/0/1480`；Store signal 修复后的最终 `bun run verify` 为 `345/0/1490`，typecheck/build 通过。
- `bun run pack:smoke` exit 0；prepack 同为 `345/0/1490`，113 files，package `124.6 kB`，unpacked `591.5 kB`；Bun/Node ESM package consumers 通过；`git diff --check` 仅有 Windows LF/CRLF warning。
- ADR-0034 已在 standalone Core、first-party Memory/JSONL final-write 范围 Accepted；真实第三方 Store/provider、NeuroBook/Cosmos consumer、Transport/Product 未运行；`parentId` 引用 P1 留待下一轮。

### 第六十二轮独立审查与修复（2026-08-11）

- Production correctness 首次审查确认 Core-owned admission 无 bypass，但发现 P1：abort marker 可能排在 JSONL reducer-after-append window 之后；并发现 `aborting + running` 重启会卡死。
- 修复采用 Store commit cancellation fence，而不是依赖 abort marker 抢先 CAS：active Invocation-owned commit 传递 runtime-only signal，first-party Adapter 在最终 durable write 前 fail closed；新增确定性同锁 gate regression。
- `reconcileInterruptedSession()` 对 durable `status: "aborting"` 的 active running/waiting owner 改为完成 `aborted`；普通 running owner 仍保持 `interrupted` 恢复语义。
- Production review 的 P2 测试 seam 建议已被严格 race gate 吸收；API/domain/Task contract 确认新增可选 runtime-only Store options 不改变 durable shape 或宿主边界；test-sensitivity 确认严格 race gate、Store signal contract 与 aborting recovery 均有回归，三路 post-fix 未发现新的 P0/P1。

### 第五十九轮规划：Opt-in Read Tool Adapter（2026-08-11）

- ADR-0006 的 A1 仍拒绝全局 token、默认 filesystem-backed `read` Tool；但当前 consumers 重复编写 `ReadCapability` lookup、基础参数 schema 与 `ReadResult → ToolResult.details` 映射。
- 领域术语收敛为 **Read Tool Adapter**：显式绑定调用方提供的 `CapabilityToken`，只做 host-neutral facts 到模型 ToolResult 的映射，不创建 token、不注册 Tool、不读取文件、不决定 path/offset 权限。
- 候选 API：`createReadTool({capability, name?, description?})`。先用 public red/consumer test 验证参数透传、provenance/truncated/nextOffset 细节映射与 provider failure；若成立，以 ADR-0033 记录并加入 root/package export。

### 第五十八轮规划与取证：EventHub 单事件大小与 Transport boundary（2026-08-11）

- NeuroBook `AgentJobEventHub.maxEventBytes` 测量完整 SSE frame，超限时以同 seq `snapshot_required` 替代；这是 Job/Transport 层语义。
- standalone 不编码 SSE frame，但已有 `replayByteLimit` 与 `subscriberQueueByteLimit`。探针证明：单事件超出 replay budget 时后续 cursor 得到 `snapshotRequired=true`；单事件超出 live queue budget 时订阅以 `queue_overflow` 关闭。
- 决定不把 `maxEventBytes` 下沉到 Core：HTTP/SSE frame 编码、网关限制和 reconnect recovery 仍由 Transport Adapter 负责；详细证据见 [第五十八轮 walkthrough](walkthroughs/2026-08-11-event-size-transport-boundary.md)。

### 第五十七轮规划：Event Cursor Epoch Admission（2026-08-11）

- NeuroBook `AgentJobEventHub` 的恢复规则明确：正数 `after` 缺少 `eventEpoch` 时只发送 `snapshot_required`，不 replay；这是为了避免把不同 Hub/epoch 的同一数字 seq 当作连续流。
- standalone `SessionEventHub.subscribe({after: 1})` 当前把省略 epoch 当作兼容当前 Hub，允许 replay 当前 epoch，形成 malformed/partial cursor 的恢复风险。
- 决定：`after > 0 && eventEpoch === undefined` 时 `connected.snapshotRequired` 为 true、无 replay；`after: 0` 与空 cursor 保持合法。新增 ADR-0032，先用 public red→green 锁定边界；不改变 EventCursor 类型、Event envelope、durable shape 或 Transport API。

### 第五十六轮规划：Streaming ModelRuntime partial consumer tracer（2026-08-11）

- NeuroBook 最新 Harness 修复在 provider stream 抛异常时保留最后一份 assistant partial，再把取消/失败交给下游 terminal commit；这是 provider Adapter 的流生命周期问题，不等于 Core 需要接管 provider iterator。
## TODO / Follow-ups

- [x] 完成第一百一十五轮 Profile/Model replacement → retry public consumer red→green；Memory/JSONL restart 一致，确认 retry 绑定当前 Profile/Model 的 Adapter 约定，不新增 Core API/ADR；第 116 轮已用真实 llmlint consumer 验收当前包并完成文档记录，本条随本轮本地 checkpoint 关闭。

- [x] 完成第五十五轮 Aborted Invocation Error Redaction 的 public red→green、focused/full/package/review acceptance；ADR-0031 已接受，承载本条记录的 git commit 构成本轮本地 checkpoint。
- [x] 完成第五十六轮 Streaming ModelRuntime partial consumer tracer 的 adapter-only spike、focused/full/package/review acceptance；确认现有 provider-neutral seam 足够，承载本条记录的 git commit 构成本轮本地 checkpoint。
- [x] 完成第五十七轮 Event Cursor Epoch Admission 的 public red→green、focused/full/package/review acceptance；ADR-0032 已接受，承载本条记录的 git commit 构成本轮本地 checkpoint。
- [x] 完成第五十八轮 EventHub 单事件大小与 Transport boundary audit；探针与合同对照未发现 Core 缺口，承载本条记录的 git commit 构成本轮本地 checkpoint。
- [x] 完成第五十九轮 Opt-in Read Tool Adapter 的 public red→green、focused/full/package/review acceptance；ADR-0033 已接受，承载本条记录的 git commit 构成本轮本地 checkpoint。
- [x] 完成第六十轮 Job history / Workflow feedback delivery boundary audit；确认 Job/Delivery durable truth 留在宿主，不新增 Core API/ADR/依赖，承载本条记录的 git commit 构成本轮本地 checkpoint。
- [x] 完成第六十一轮 Read Tool Adapter public surface audit；完成 root/package/文档/ADR 交叉审计，无代码或 public surface 修复，承载本条记录的 git commit 构成本轮本地 checkpoint。
- [x] 完成第六十二轮 Core-owned `agent.compaction` admission 与 Store commit cancellation fence；ADR-0034 Accepted，focused/full/package/post-fix review 已完成，待本地 checkpoint commit 后关闭本条记录。
- [x] 完成第六十三轮 Session Entry parent reference admission 与 abort unknown-result/waiting 结算收口；ADR-0035 保持 Proposed，focused/full/package/post-fix review 已完成，checkpoint `8142656`。
- [x] 完成第六十四轮大 Session 图校验成本探针与有界回归；确认图校验线性、不新增缓存/API，探针脚本与回归测试保留，待本地 checkpoint commit 后关闭本条记录。
- [x] 完成第六十五轮 JSONL 跨 record replay 图 admission 与 external-signal gate 补测；确认现有合同足够、signal 不持久化是既定边界，待本地 checkpoint commit 后关闭本条记录。
- [x] 完成第六十六轮 Session Invocation coherence admission；读侧 fail closed 与写侧 invariant 和 entry graph admission 对齐，focused/full/package 已通过，待独立审查与本地 checkpoint commit 后关闭本条记录。
- [x] 完成第六十七轮 Approval fact coherence admission；waiting 空/缺失 approvals 的审批绕过安全洞已在 read 边界封死，重复 toolCallId 与 turnCount 回退同轮收口，待独立审查与本地 checkpoint commit 后关闭本条记录。
- [x] 完成第六十八轮 `invocationResultFromSnapshot` 公开只读投影；public surface（root export/实现/声明/README/CHANGELOG/pack consumer）一致，待独立审查与本地 checkpoint commit 后关闭本条记录。
- [x] 完成第六十九轮 Session Fork API（`forkSession`）；ADR-0036 Proposed，focused/full/package 已通过，待独立审查与本地 checkpoint commit 后关闭本条记录。
- [x] 完成第七十轮 Cosmos 编排消费切片 v2；组合闭环全部由公开 API 表达、无 Core 缺口，待独立审查（含 ADR-0036 裁定）与本地 checkpoint commit 后关闭本条记录。
- [x] 完成第七十一轮 SSE Transport 消费切片；交付/恢复闭环全部由公开事件 seam 表达、无 Core 缺口，待独立审查与本地 checkpoint commit 后关闭本条记录。
- [x] 完成第七十二轮 `message_committed` 合同漂移修复；补发布点使公开合同「声明即实现」，待独立审查与本地 checkpoint commit 后关闭本条记录。
- [x] 完成第七十三轮事件发布点一致性审计；全部类型与发布点对应、`snapshot_required.reason` 收窄，待独立审查与本地 checkpoint commit 后关闭本条记录。
- [x] 完成第七十四轮 ADR-0035 acceptance 复审；唯一残留 Proposed 升格 Accepted，证据链回写 ADR 正文，待本地 checkpoint commit 后关闭本条记录。
- [x] 完成第七十五轮跨进程 fork/恢复证据；进程边界组合由真实 Node 子进程覆盖，待独立审查与本地 checkpoint commit 后关闭本条记录。
- [x] 完成第七十六轮跨进程 waiting 恢复与 resume 证据；waiting 态恢复路径由真实子进程覆盖，待独立审查与本地 checkpoint commit 后关闭本条记录。
- [x] 完成第七十七轮跨进程 waiting 控制面证据；abort 与 approval 拒绝由真实子进程覆盖，待独立审查与本地 checkpoint commit 后关闭本条记录。
- [x] 完成第七十八轮跨进程 follow-up 注入与自动启动证据；durable 队列跨进程消费闭环由真实子进程覆盖，待独立审查与本地 checkpoint commit 后关闭本条记录。
- [x] 完成第七十九轮 CHANGELOG 补录与对应审计；第六十三轮条目补录、feat/fix 全量对应，待独立审查与本地 checkpoint commit 后关闭本条记录。
- [x] 完成第八十轮 `waitForInvocation` 有界等待原语；纯读侧轮询消除宿主样板、覆盖跨进程等待，待独立审查与本地 checkpoint commit 后关闭本条记录。
- [x] 完成第八十一轮 `waitForFollowUpQueueDrain` 有界排空等待；等待族 API 闭环，待独立审查与本地 checkpoint commit 后关闭本条记录。
- [x] 完成第八十二轮 `model_event` 发布路径运行时 smoke；补齐第七十三轮审计覆盖缺口，待独立审查与本地 checkpoint commit 后关闭本条记录。
- [x] 完成第八十三轮 host 错误事件运行时覆盖；`abort_request_error` 发布与静默路径钉死，待独立审查与本地 checkpoint commit 后关闭本条记录。
- [x] 完成第八十四轮 `follow_up_error` 运行时覆盖；host 事件全部类型运行时闭环，待独立审查与本地 checkpoint commit 后关闭本条记录。
- [x] 完成第八十五轮 `tool_call_delta` 流式事件运行时覆盖；五种 `ModelRuntimeEvent` 全覆盖，待独立审查与本地 checkpoint commit 后关闭本条记录。
- [x] 完成第八十六轮 `compaction_start`/`compaction_end` 运行时事件覆盖；runtime 12 类型全部运行时闭环，待独立审查与本地 checkpoint commit 后关闭本条记录。
- [x] 完成第八十七轮 `follow_up_queued` 正向运行时覆盖；事件面全部类型覆盖闭环，待独立审查与本地 checkpoint commit 后关闭本条记录。
- [x] 完成第八十八轮悬挂 Tool Call 启动闭合 admission；NeuroBook parity 深度对照产出 3 个 P1 已吸收其一，待独立审查与本地 checkpoint commit 后关闭本条记录。
- [x] 完成第八十九轮 followUp 默认 caller 对齐；三个启动入口 caller 缺省一致为 user，待独立审查与本地 checkpoint commit 后关闭本条记录。
- [x] 完成第九十轮 compaction 切分与二次压缩合同收口；B 组零断言清单清空，待独立审查与本地 checkpoint commit 后关闭本条记录。
- [x] 完成第九十一轮 prepareWrites 可见性合同钉住；parity B 组全部收口，待独立审查与本地 checkpoint commit 后关闭本条记录。
- [x] 完成第九十二轮 turn_end waiting 事件语义对齐；parity C 组事件面收口，待独立审查与本地 checkpoint commit 后关闭本条记录。
- [x] 完成第九十三轮 follow-up 自动 pause（pausedBy）；parity C 组队列面收口，待独立审查与本地 checkpoint commit 后关闭本条记录。
- [x] 完成第九十四轮 per-event 字节预算边界钉住；第八十八轮 parity 审计全部收口，待独立审查与本地 checkpoint commit 后关闭本条记录。
- [x] 完成第九十五轮手动 compact（ADR-0037）；公开 API 落地，待独立审查与本地 checkpoint commit 后关闭本条记录。
- [x] 完成第九十六轮 Cosmos 消费切片 v3；新公开 API 组合验证 + ADR-0037 升格 Accepted，待独立审查与本地 checkpoint commit 后关闭本条记录。
- [x] 完成第九十七轮公开 API 面全面审计；pack consumer 防线补齐、README 同步，待独立审查与本地 checkpoint commit 后关闭本条记录。
- [x] 完成第九十八轮 InvocationError.phase 的 stage 级归因（D2 吸收）；focused/全量/package 与独立审查通过，待本地 checkpoint commit 后关闭本条记录。
- [x] 完成第九十九轮 NB 黑盒终态语义吸收；终态 pause + 三边界钉住，待独立审查与本地 checkpoint commit 后关闭本条记录。
- [x] 完成第一百轮 Model contextWindow 窗口保护（C10）+ interrupted 候选否定；ADR-0038 Accepted，待独立审查与本地 checkpoint commit 后关闭本条记录。
- [x] 完成第一百零一轮多角度规划；三路结论落盘并排期 102-104 轮，待独立审查与本地 checkpoint commit 后关闭本条记录。
- [x] 完成第一百零二轮 appendEntries 便捷 API；A-C2/C1 文档/(d) 偏差收口，待独立审查与本地 checkpoint commit 后关闭本条记录。
- [x] 完成第一百零三轮 prepareWrites 自动注入（ADR-0039）；双写消费方迁移收口，待独立审查与本地 checkpoint commit 后关闭本条记录。
- [x] 完成第一百零四轮 attachment 内容块 seam（ADR-0040）；类型合同 + marker 助手 + 4 条钉住测试，待独立审查与本地 checkpoint commit 后关闭本条记录。
- [x] 完成第一百零五轮 retry options 与错误面收敛；C3 收口，待独立审查与本地 checkpoint commit 后关闭本条记录。
- [x] 完成第一百零六轮公开 API 面再审计；pack consumer 新导出钉住收口，待独立审查与本地 checkpoint commit 后关闭本条记录。
- [x] 完成第一百零七轮 ADR-0038/0039/0040 升格 Accepted；40 份 ADR 全 Accepted，待独立审查与本地 checkpoint commit 后关闭本条记录。
- [x] 完成第一百零八轮 SSE 帧序列化（ADR-0041）+ 覆盖收口；待独立审查与本地 checkpoint commit 后关闭本条记录。
- [x] 完成第一百零九轮真实 HTTP SSE 宿主边界；独立 post-fix 审查、focused/verify/pack smoke 已通过，本地 checkpoint commit 承载本条记录。
- [x] 完成第一百一十轮 Context settlement adapter-only 与 Cosmos-style Agent Action conformance；现有 seam 足够，无新增 API/ADR/依赖；focused/full/静态复核已完成；本地 checkpoint 为 e7c0191，已回到规划。
- [x] 完成第五十四轮 JSONL delta + checkpoint 实验模式回归（11 条 public 测试、探针与稳定性验证、focused/full/package/review acceptance）；不新增 public API/ADR，承载本条记录的 git commit 构成本轮本地 checkpoint。
- [x] 完成第五十三轮 plan 数组批量 admission（prepareWrites / hook effects）的 public red→green、focused/full/package/review acceptance；不新增 public API/ADR，承载本条记录的 git commit 构成本轮本地 checkpoint。
- [x] 完成第五十二轮 Tool writePlans 批量 admission 的 public red→green、focused/full/package/review acceptance；不新增 public API/ADR，承载本条记录的 git commit 构成本轮本地 checkpoint。
- [x] 完成第五十一轮 Canonical Schema Value Admission 的 public red→green、focused/full/package/review acceptance；ADR-0030 已接受，承载本条记录的 git commit 构成本轮本地 checkpoint。
- [x] 完成第五十轮 Active Profile Steer Admission 的 public red→green、focused/full/package/review acceptance；ADR-0029 已接受，承载本条记录的 git commit 构成本轮本地 checkpoint。
- [x] 完成第四十九轮 Profile Version Approval Admission 的 public red→green、JSONL/legacy、full/package/review acceptance；承载本条记录的 git commit 构成本轮本地 checkpoint。
- [x] 完成第四十八轮 Prepared Tool Identity Admission 的 public red→green、ADR-0027 acceptance、full/package/review acceptance；承载本条记录的 git commit 构成本轮本地 checkpoint。
- [x] 完成第四十七轮 Public Mutation Shutdown Admission 的 public TDD、full/package/diff/review acceptance；ADR-0026 已接受，本提交构成本轮本地 checkpoint。
- [x] 完成第四十六轮 Harness Shutdown Barrier 的 public red→green、full/package/review acceptance。
- [x] 完成第四十五轮 Concurrent Interrupted Reconciliation 的 Memory/JSONL public red→green、full/package/review acceptance。
- [x] 完成第四十四轮 Session Status Ownership Invariant 的 Store contract red→green、full/review acceptance。
- [x] 完成 ADR-0025 Tool Call Identity Admission 的 red→green、legacy recovery、full/package/review acceptance。
- [x] 完成第四十二轮 JSONL recovery scan error preservation 的 red→green、full/package/review acceptance。
- [x] 完成 ADR-0024 Durable Event Causality Guard 的 red→green、full/package/review acceptance。
- [x] 完成 ADR-0023 Snapshot Replay Cut 的三类 producer red→green、full/package/review acceptance。
- [x] 完成 ADR-0022 durable approval resume admission 的 red→green、JSONL recovery、full/package/review acceptance。
- [x] 完成 ADR-0021 bounded Commit Workflow Scheduler shutdown 的 red→green、full/package/review acceptance。
- [x] 完成 ADR-0020 JSONL Session creation race 的 red→green、Bun/Node process、full/package/review acceptance。
- [x] 完成 ADR-0019 bounded Event Subscription lifecycle 的 red→green、full/package/review acceptance。
- [x] 完成 ADR-0018 reserved follow-up facts 的 full/package/review acceptance。
- [x] 为 follow-up cancel/reorder 增加 observed-version CAS，拒绝 admission 已先消费 item 后的 stale 控制假成功。
- [x] 修复 `followUp()` 依赖本进程 active Map 的跨 Harness admission 错误，并用 durable owner CAS 覆盖 running/waiting 与 terminal race。
- [x] 调研 NeuroBook TSX Profile context management，明确可复用的 host-neutral seam 和不应进入 Core 的部分。
- [x] 评估 Workflow 是否已完整覆盖 sidecar 迁移所需的旁路 Agent 组合与恢复证据；standalone 数据面已覆盖，ephemeral archive、linked relation、Workflow journal、Job/Lease/Outbox 继续留在宿主。
- [x] 评估通用 `read` Tool 和 SSE 能力的最小 Adapter 合同、权限/路径边界与测试策略。
- [x] 对照 NeuroBook 当前 Harness 行为，列出独立库落后的合同，不把差异误报为兼容。
- [x] 调研 Cosmos 需求文档，补齐 Cosmos consumer smoke 和 API 形态的事实依据。
- [x] 执行 Cosmos consumer compatibility slice，并根据测试暴露的合同缺口记录 ADR-0001。
- [x] 审查 consumer slice、ADR-0001 和未验证边界；确认 ADR-0001 升格为 `Accepted` 并回到规划阶段。
- [x] 规划阶段可派发多个只读代理，但执行阶段由集成负责人统一修改、审查、验证和回写。
- [x] 用户明确启动 goal 后，按本 Task 协作循环逐轮实现、测试、审查和回写。
- [x] 下一轮规划：选择 Workflow 旁路 Invocation 的显式 Snapshot/leaf 锚定切片。
- [x] 执行 `invokeAt(anchor)` 及其并发冲突测试。
- [x] 补齐读后写入竞态、过期 anchor 与本地 active Invocation 优先级的 focused 回归测试。
- [x] 补齐 CAS 失败后再次写入的 version/leaf 原子诊断回归测试。
- [x] 补齐当前 anchor 与持久化 active Invocation 冲突的 focused 回归测试。
- [x] 完成 ADR-0002 strict `invoke-if-current` 实现、公开导出、测试和 acceptance review；独立 JSONL Store/Harness anchor 竞争及获胜 Invocation 恢复测试通过。历史 inactive leaf 和更广泛的持久化 anchor 语义另行规划。
- [x] 执行 ADR-0003 的 context sections provisional vertical slice。
- [x] 补齐 ADR-0003 的多 turn、旧 runtimeMessages、approval resume lifecycle focused 测试。
- [x] 补齐 ADR-0003 的 JSONL waiting → 新 Harness resume、prepare Snapshot/provider Snapshot 和 waiting/afterTurn focused 回归。
- [x] 完成 ADR-0003 的独立 acceptance review，并接受 provider-neutral sections 与 approval resume 重建边界。
- [x] 复现 JSONL 跨 Store 实例/跨进程的重复 version 与恢复损坏窗口。
- [x] 建立 ADR-0004，记录 per-session commit lock 的范围、未决 stale/fencing 风险和接受条件。
- [x] 实现 ADR-0004 最小 lock helper，并补齐跨进程竞争、恢复和损坏 lock 回归。
- [x] 补齐 ADR-0004 的 Node 子进程、acquire 后 crash、owner 晚释放/fencing 和基础 lock busy/lost 回归。
- [x] 补齐 lock root、owner metadata/heartbeat、append 前后各阶段崩溃回归。
- [x] 补齐独立 `JsonlSessionStore` 实例竞争与 release `operationCompleted` 回归，并归一化 release 原始错误。
- [x] 补齐人工删除 lock 后的 ownership-loss 和正常 release 幂等回归，并冻结 stale 清理操作前提。
- [x] 完成 ADR-0004 最终 acceptance review；在 Windows local filesystem / commit-only 范围接受，不引入 stale takeover。
- [x] 对照 NeuroBook 当前 context 文档，建立 ADR-0005 的 A1 范围与生命周期边界。
- [x] 执行 ADR-0005 的最小 `contextProviders` 类型、Harness 集成和 focused 行为测试。
- [x] 补齐 ADR-0005 的 ContextProvider × Capability 成功/失败、Invocation close 和不持久化 focused 回归。
- [x] 完成 ADR-0005 A1 acceptance review，并接受 run-attempt-scoped ContextProvider/Capability 边界；跨 waiting/process Capability 复用另行规划。
- [x] 完成 ADR-0006 shape-only `ReadCapability` acceptance review；真实 NeuroBook/Cosmos file tool、权限和图片/二进制仍单独报告。
- [x] 建立 ADR-0007 Invocation ownership fence，并记录 start/跨进程/runtime event 边界。
- [x] 执行 ADR-0007 的 owner CAS、run-attempt fence、runtime event fence 和 Memory/JSONL reconcile focused slice。
- [x] 完成 ADR-0007 独立 acceptance review；owner/attempt fence 已在 standalone Core 范围接受，bounded completion 由 ADR-0008 单独负责。
- [x] 建立 ADR-0008 Proposed，并冻结第十三轮 bounded abort/terminal completion 计划。
- [x] 执行 ADR-0008 非合作式依赖、forced finish、terminal race、owner race 和 dispose focused slice。
- [x] 完成 ADR-0008 standalone Core acceptance review；跨进程 EventHub、真实 provider/tool 和 NeuroBook/Cosmos 接入仍不在本轮验收范围。
- [x] 完成第十四轮 ADR-0008 forced terminal owner-CAS、sealed write fence、settlement commit race 和 waiting event 顺序 hardening；waiting conflict retry 与 JSONL recovery 已补齐，独立 acceptance review 仍未完成。
- [x] 完成第十五轮 waiting conflict exhaustion 与固定 Invocation ID 生命周期回归；ADR-0008 已在限定范围内接受。
- [x] 建立 ADR-0009，冻结 Workflow anchor-guarded best-effort result writeback 边界。
- [x] 执行 ADR-0009 focused result writeback slice，并完成全仓/包 smoke 验证。
- [x] 完成 ADR-0009 standalone Core acceptance review；`writeAt()` 便利 API 暂不需要。
- [x] 建立并执行 ADR-0010 A0 `modelContextAppending` request-only slice。
- [x] 完成 ADR-0010 standalone Core acceptance review；NeuroBook durable/Reminder/Watch 语义不进入 Core。
- [x] 对照 NeuroBook 2026-08-07 recovery / durable Job 演进，确认关系投影、Job durable truth、delivery 和 SSE 不进入 Harness Core。
- [x] 第六轮规划：优先验证 ADR-0004 的 Node/crash/fencing 边界，再决定是否接受或拆分 lock 合同。
- [x] 审计 NeuroBook/Cosmos 的 read 边界，确认 A1 只抽出 host-neutral Capability 数据合同。
- [x] 执行 ADR-0006 的最小 `ReadCapability` 类型与 consumer focused slice。
- [x] 完成第十八轮多角度只读规划，选择 caller/message identity 去领域化切片。
- [x] 建立并执行 ADR-0011 message identity metadata slice。
- [x] 完成 ADR-0011 的 Memory/JSONL/旧记录兼容 acceptance review，并在 standalone Core 范围内接受。
- [x] 修复 follow-up consume/start 非原子断点，并保留其恢复回归测试。
- [x] 补齐 cancel/reorder 与 stale follow-up admission 的 focused CAS 回归测试。
- [x] 补齐独立 JsonlSessionStore/Harness 的 cancel/reorder admission 回归。
- [x] 补齐 raw legacy JSONL 的 invocation/message/queue identity 兼容与实际 resume 回归。
- [x] 完成第二十轮 Context lifecycle public-seam red→green spike，证明 stable History、Invocation-scoped Appending、latest Snapshot Provider 和 JSONL waiting/resume 生命周期。
- [x] 建立并接受 ADR-0012，公开 canonical `createAgentMessageEntryDraft()` 与 options type。
- [x] 完成 ADR-0012 focused/full/package smoke 与独立只读审查；真实消费者、prompt/continue ordering 和 settlement 另行规划。
- [x] 完成第二十一轮 Prompt/continue lifecycle 只读行为矩阵和临时 public red spike；证据不足以安全定义兼容 API，因此不建立 ADR。
- [x] 第二十二轮完成 ADR-0007 standalone ownership fence acceptance review；现有 `resume()` / `dispose()` 回归足够，没有重复补测。
- [x] 第二十三轮完成 ADR-0006 shape-only acceptance，修正 durable reference/provenance 安全边界并保留宿主分页/权限语义。
- [x] 第二十四轮修复 JSONL partial-tail 静默丢失与 Windows I/O taxonomy，并接受 ADR-0004 的限定范围。
- [x] 第二十五轮完成 dynamic structured output public consumer tracer；现有 Tool seam 足够，不新增 Core completion API。
- [x] 第二十六轮补齐 failed turn runtime boundary，并修复 durable terminal 未确认时伪造 `agent_end` 的既有 P1；ADR-0013 已接受。
- [x] 第二十七轮完成 partial assistant/provider throw public tracer；确认 partial 丢失与未闭合 Tool 不持久化的现状，因 durable/abort/retry 合同不足暂不扩展 Model API。
- [x] 第二十八轮完成 Invocation result persistence、terminal usage fact、Capability cleanup reconciliation 和 abort/resume race；ADR-0014 已接受。
- [x] 第二十九轮执行 typed `ModelTurnError` failure usage seam，验证 cooperative/forced abort winner，并完成 ADR-0015 审查。
- [x] 第三十轮验证宿主 Pi-like Adapter 的 event/result/error/abort 映射，不把 Pi 依赖或 partial DTO 加入 Core。
- [x] 第三十一轮实现并接受 text/thinking-only terminal partial fact；retry/compaction/abort/Store、status/turn、rewind 与 acknowledgement recovery 均有回归。
