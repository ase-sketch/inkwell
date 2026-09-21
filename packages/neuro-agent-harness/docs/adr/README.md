# Architecture Decision Records

ADR 记录跨 Task 仍需有效的公开 API、模块边界、持久化、恢复、Transport 和外部副作用决定。

- 仍在验证的方案先写在对应 Task 的 `ADR / Decisions / Discussion`，状态标为 `Proposed`。
- 只有经过实现或实验验证、并完成 Task 审查的决定才标为 `Accepted`。
- `Rejected` 和 `Superseded` 保留原因与替代记录，不删除历史。

## Index

- [ADR-0001: Cosmos consumer boundary and Workflow ownership](0001-cosmos-consumer-workflow-boundary.md) — Accepted
- [ADR-0002: Strict Workflow Invocation Anchor](0002-workflow-invocation-anchor.md) — Accepted
- [ADR-0003: Provider-Neutral Context Sections](0003-provider-neutral-context-sections.md) — Accepted
- [ADR-0004: JSONL Cross-process Per-session Commit Lock](0004-jsonl-cross-process-commit-lock.md) — Accepted (Windows local filesystem, commit-only scope)
- [ADR-0005: Per-turn Context Provider Resolution](0005-per-turn-context-provider.md) — Accepted (A1)
- [ADR-0006: Host-Neutral Read Capability Contract](0006-host-neutral-read-capability.md) — Accepted (standalone Core scope)
- [ADR-0007: Invocation Ownership Fence](0007-invocation-ownership-fence.md) — Accepted (standalone Core scope)
- [ADR-0008: Bounded Abort and Terminal Completion](0008-bounded-abort-terminal-completion.md) — Accepted (standalone Core scope)
- [ADR-0009: Workflow Anchored Result Writeback](0009-workflow-anchored-result-writeback.md) — Accepted (standalone Core scope)
- [ADR-0010: Provider-Neutral Model Context Appending](0010-provider-neutral-model-context-appending.md) — Accepted (standalone Core scope)
- [ADR-0011: Caller and Durable Message Identity](0011-caller-message-identity.md) — Accepted (standalone Core scope)
- [ADR-0012: Durable Context Contribution Entry Boundary](0012-durable-context-contribution-entry.md) — Accepted (standalone Core scope)
- [ADR-0013: Failed Turn Runtime Event Boundary](0013-failed-turn-runtime-event-boundary.md) — Accepted (standalone Core scope)
- [ADR-0014: Invocation Result Persistence and Durable Usage](0014-invocation-result-persistence-and-usage.md) — Accepted (standalone Core scope)
- [ADR-0015: Typed Model Turn Failure Usage](0015-typed-model-turn-failure-usage.md) — Accepted (standalone Core scope)
- [ADR-0016: Terminal Partial Model Output Fact](0016-terminal-partial-model-output.md) — Accepted (standalone Core scope)
- [ADR-0017: External Invocation Abort Signal](0017-external-invocation-abort-signal.md) — Accepted (standalone Core scope)
- [ADR-0018: Reserved Follow-up Coordination Entries](0018-reserved-follow-up-coordination-entries.md) — Accepted (standalone Core scope)
- [ADR-0019: Bounded Event Subscription Lifecycle](0019-bounded-event-subscription-lifecycle.md) — Accepted (standalone Core scope)
- [ADR-0020: JSONL Cross-process Session Creation](0020-jsonl-cross-process-session-creation.md) — Accepted (Windows local filesystem, first-party allocate/create scope)
- [ADR-0021: Bounded Commit Workflow Scheduler Shutdown](0021-bounded-commit-workflow-scheduler-shutdown.md) — Accepted (standalone Scheduler lifecycle scope)
- [ADR-0022: Durable Approval Resume Admission](0022-durable-approval-resume-admission.md) — Accepted (standalone Harness approval-admission scope)
- [ADR-0023: Snapshot Replay Cut](0023-snapshot-replay-cut.md) — Accepted (standalone HarnessSnapshot recovery-cut scope)
- [ADR-0024: Durable Event Causality Guard](0024-durable-event-causality-guard.md) — Accepted (standalone in-process Harness durable-publication scope)
- [ADR-0025: Tool Call Identity Admission](0025-tool-call-identity-admission.md) — Accepted (standalone Harness Tool Call identity scope)
- [ADR-0026: Harness Shutdown Admission](0026-harness-shutdown-admission.md) — Accepted (standalone Harness shutdown-admission scope)
- [ADR-0027: Prepared Tool Identity Admission](0027-prepared-tool-identity-admission.md) — Accepted (standalone PreparedRun Tool identity scope)
- [ADR-0028: Profile Version Approval Admission](0028-profile-version-approval-admission.md) — Accepted (standalone Profile Version approval-admission scope)
- [ADR-0029: Active Profile Steer Admission](0029-active-profile-steer-admission.md) — Accepted (standalone Active Profile steer-admission scope)
- [ADR-0030: Canonical Schema Value Admission](0030-canonical-schema-value-admission.md) — Accepted (standalone Core canonical-value admission scope)
- [ADR-0031: Aborted Invocation Error Redaction](0031-aborted-invocation-error-redaction.md) — Accepted
- [ADR-0032: Event Cursor Epoch Admission](0032-event-cursor-epoch-admission.md) — Accepted
- [ADR-0033: Opt-in Read Tool Adapter](0033-opt-in-read-tool-adapter.md) — Accepted
- [ADR-0034: Store Commit Cancellation Fence](0034-session-commit-cancellation-fence.md) — Accepted (standalone Core, first-party Memory/JSONL final-write scope)
- [ADR-0035: Session Entry Parent Reference Admission](0035-session-entry-parent-reference-admission.md) — Accepted (standalone Core, first-party Memory/JSONL scope)
- [ADR-0036: Session Fork API](0036-session-fork-api.md) — Accepted (standalone Core scope)
 - [ADR-0037: Manual Compact Session](0037-manual-compact-session.md) — Accepted (standalone Core scope)
 - [ADR-0038: Model Context Window Protection](0038-model-context-window-protection.md) — Accepted (standalone Core scope)
 - [ADR-0039: Prepare Write Auto-Injection](0039-prepare-write-auto-injection.md) — Accepted (standalone Core scope)
 - [ADR-0040: Attachment Reference Content Blocks](0040-attachment-reference-content-blocks.md) — Accepted (standalone Core scope)
