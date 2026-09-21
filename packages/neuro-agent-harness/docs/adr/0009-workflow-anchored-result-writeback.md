# ADR-0009: Workflow Anchored Result Writeback

- Status: Accepted (standalone Core scope)
- Date: 2026-08-09

## Context

Workflow 需要把旁路 Agent 的结果显式回写到目标 Session。NeuroBook 的旁路组合是多个独立 Session 操作，不能把 Job、Lease、delivery 或 sidecar 生命周期下沉到 Harness Core。

当前 Harness 已有 `snapshot()`、`createSession()`、`invokeAt()`、`write()`、`SessionEntryCodec` 和 `expectedVersion` / `expectedActiveLeafId` CAS。需要验证这些原语是否足以表达结果回写，以及明确失败、恢复和重复提交边界，避免为了方便提前新增领域 API。

## Decision

本轮采用现有公共原语完成显式、带锚点保护的 best-effort 回写：

1. Workflow 读取目标 Session 的 `Snapshot`，保存 `{version, activeLeafId}`；
2. 使用 `createSession(parentSessionId)` 创建旁路 Session；
3. 使用旁路 Session 自己的 Snapshot 作为 `invokeAt()` anchor，运行 Agent；
4. 使用宿主提供的 `SessionEntryCodec` 将结果编码为 custom entry；
5. 对目标 Session 调用 `write()`，同时传入目标 Snapshot 的 `expectedVersion`、`expectedActiveLeafId` 和 `appendEntries`。

本轮不新增 `writeAt()` 或 `writeInvocationResult()`。CAS 冲突直接返回 `SessionConflictError`，不自动 rebase、retry 或猜测结果是否已经写入。

`SessionEntryCodec` 只负责 payload 校验、draft 构造和读取投影，不负责幂等键或 dedupe。Workflow 宿主应在结果 payload 中保存 source Session/Invocation identity，并自行处理响应丢失后的重复回写。

单个 `SessionWritePlan` 的多个 operation 仍由 Store 作为一个 reducer/commit 边界处理；父 Session 回写与旁路 Session 完成属于不同 Session 的独立 commit，不提供跨 Session 事务。

## Consequences

- 旁路结果可以复用现有 Snapshot、Invocation、SessionWritePlan 和 entry codec 合同，不增加 Core 领域 API。
- 目标 Session 在旁路期间发生变化时，旧 anchor 被拒绝，且不会留下部分结果 entry。
- Memory 与 JSONL Store 都能恢复已写入的结果 entry；JSONL per-session lock 不扩展成跨 Session 事务。
- 同一结果不带 CAS 重复提交时会产生重复 entry；这是明确的宿主幂等责任，不宣称 exactly-once。

## Out of scope

- Job/Workflow Run durable journal、Lease、heartbeat、delivery status、dead-letter 或 exactly-once；
- 父子 Session 跨 Session transaction、distributed lock 或自动 retry/rebase；
- sidecar、HTTP/SSE DTO、Transport 鉴权和产品级结果投影；
- `writeAt()` 便利 API，除非后续 focused 证据证明现有 `write()` 样板会造成可复现的误用风险。

## Evidence and acceptance

接受前需要保留：

- Memory/JSONL 中创建父/旁路 Session、`invokeAt()`、codec 结果 entry 和目标 `write()` 的成功回归；
- 目标 version/active leaf 变化后的 `SessionConflictError`、冲突诊断和无部分写入回归；
- JSONL 新 Harness 恢复结果 entry；
- 无 CAS 重复提交会产生重复 entry，带 source identity 的去重责任保持在宿主；
- 独立审查确认没有把 Job、Lease、delivery 或 exactly-once 语义误报为 Core 能力。

## 2026-08-09 Implementation Walkthrough

- 新增 `tests/workflow-result-writeback.test.ts`，仅通过公开 Harness/Store/Codec 接口验证，不修改 `src/`。
- 当前 focused 证据：5 pass / 0 fail / 17 expect calls，覆盖 Memory 成功回写、JSONL 恢复、Memory stale version CAS、JSONL stale active leaf 诊断、无 CAS 重复 entry。
- 全仓 `bun run verify` 为 107 pass / 0 fail / 499 expect calls；`bun run pack:smoke` 通过，包含 tarball、Bun consumer 和 Node ESM consumer。

## 2026-08-09 Acceptance review

- 独立审查确认现有 `snapshot()`、`createSession()`、`invokeAt()`、`write()`、`SessionEntryCodec` 已足够支撑当前范围的 anchor-guarded best-effort result writeback，不需要新增 `writeAt()` 或领域化结果 API。
- 审查确认没有 P0/P1 缺陷或 scope overclaim；接受范围明确排除跨 Session 事务、Job/Lease/delivery、自动 retry/rebase、幂等键和 exactly-once。
- 未验证范围仍为真实 NeuroBook/Cosmos Workflow 接入、跨进程父子 Session 协调、Job journal/delivery 恢复、浏览器/产品和生产验收；这些不阻塞 standalone Core acceptance。
