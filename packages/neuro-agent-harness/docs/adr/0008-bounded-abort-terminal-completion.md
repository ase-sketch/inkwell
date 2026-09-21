# ADR-0008: Bounded Abort and Terminal Completion

- Status: Accepted (standalone Core scope)
- Date: 2026-08-09

## Context

ADR-0007 让取消后的迟到结果不能再污染 Session，但当前 `InvocationHandle.result()`、`harness.abort()` 和 `dispose()` 仍等待 Run Kernel 返回。非合作式 Model、Tool、Capability 或 Hook 如果永不 settle，调用方和 Harness 生命周期就会永久悬挂。

NeuroBook 的对照合同使用取消宽限期、completion boundary、强制 `aborted` durable finish 和一次终态 `agent_end`。这部分可以去领域化，但不能把 Job、HTTP、SSE、partial assistant 或 provider-specific timeout 一起搬入 standalone Core。

## Decision

### Completion boundary

每个 Invocation attempt 建立一次性 completion boundary：

- `abort()` 先失效 attempt 并触发 `AbortController.abort()`；
- 在可配置的 `abortGraceMs` 内，合作式 Run 继续走现有取消清理和 partial-output 兼容路径；
- 宽限期到期后，如果 durable owner 仍是该 Invocation，Harness 在 owner CAS 内强制提交 `finishInvocation(status: "aborted")`，resolve 公共 `result()`，并释放本地 active admission；
- 强制完成是幂等的；正常完成、失败、waiting abort 和 forced abort 之间以第一个 durable terminal commit 为准；
- 如果正常 terminal commit 先于 forced abort 落盘，即使 attempt 已被 abort 失效，也必须以 durable 状态完成公共结果和唯一 terminal event；forced abort 不得把 `completed` 改写为 `aborted`；
- `InvocationHandle.abort(): void` 保持兼容；`harness.abort()` 在 durable terminal 已完成后才 resolve。

初步默认 `abortGraceMs = 150`，允许 Harness options 覆盖；实现与 focused 测试必须验证非正数、重复 abort 和 timer race。这个默认值是对 NeuroBook 的可逆 parity 选择，不是 provider timeout。

### Late run lifecycle

强制完成后，仍未返回的 raw Model/Tool/Hook/Capability Promise 可以在后台继续，但：

- attempt 保持 invalidated/closed；
- 不得进入 Session transcript、Tool write plan、Hook effect、普通 runtime event 或第二次 terminal event；
- Invocation-owned `SessionWritePlan` 不能跨越当前 Invocation 所属 Session；显式 `expectedActiveInvocationId: null` 也不能绕过此边界；
- `settleFailure` 在进入、await 返回和写入前后都要重新确认 durable owner；reconcile 后的旧 owner 不得落盘迟到 effect；
- 不强杀外部进程，不撤销已经发生的宿主副作用；
- completion boundary 不等待 `settleFailure` 或其它可能永久挂起的外部 Hook。

`dispose()` 只等待 completion boundary 和 Harness 自己可收口的后台协调，不等待永不结束的 provider/tool raw Promise；Store Adapter 仍必须在强制 terminal commit 后保持可安全释放。

### Terminal event

每个 Invocation 最多发布一次终态 `agent_end`。合作式路径在 durable terminal commit 后发布；强制路径在 durable aborted commit 后发布一次不受失效 attempt 阻挡的 terminal event。迟到 Run Loop 的 event fence 继续丢弃其 `agent_end`。若 completion boundary 无法确认 durable terminal，则只结束公共 Promise，不伪造 terminal event。

本 ADR 不新增 HTTP/DTO 字段。现有 `InvocationResult.status = "aborted"` 继续表达取消；provider 原始错误不成为用户层取消合同。

## Consequences

- 调用方不再因非合作式依赖永久等待取消结果。
- 强制取消和真实 provider failure 的 durable lifecycle 仍保持不同；强制路径不运行不可控的 settlement hook。
- 取消宽限期只限制 Harness 的 completion boundary，不限制外部 provider/tool 的实际资源消耗；宿主仍需自行提供进程/网络 timeout。
- 需要为 active admission、retry、follow-up 和 `dispose()` 增加 race 证据；不能只测试 `AbortController` 被调用。

## Out of scope

- partial assistant / `stopReason` / `messageStatus` 新合同；
- provider 请求 timeout、retry、费用或 quota；
- HTTP/SSE/前端 DTO、父 Workflow signal 传播；
- Job、Lease、Outbox、sidecar、跨进程 EventHub fencing；
- 强杀外部进程或撤销工具的外部副作用；
- SQLite、Prisma 或其它基础设施替换。

## Evidence and acceptance

接受前需要保留以下 focused 证据：

- 永不 resolve 的 Model 和 Tool 在 grace 后使 `result()` 有界返回，Session 为 `aborted` 且 `activeInvocationId === null`；
- grace 内迟到成功与正常完成 race 只保留一个 terminal；
- 强制完成后迟到 transcript/write/effect/runtime event 被丢弃；
- waiting abort、重复 abort、无 active abort、retry 和 `dispose()` 生命周期；
- owner 跨 Session、组合 `startInvocation` CAS、finish-first terminal race 和 `settleFailure` await 期间 reconcile 的回归；
- waiting Invocation 在连续 Store conflict 耗尽时返回 `AbortBoundaryError`，不伪造 `agent_end(aborted)`，并保留 durable waiting owner；
- 固定 Invocation ID 在 raw run 结束前拒绝 sealed 重入和跨 Session 绑定，raw run 结束后可在新 Session 复用并发布该 Session 的 terminal event；
- Memory/JSONL 恢复和现有 ADR-0007/partial-output 回归不退化。

## 2026-08-09 Implementation Walkthrough

本轮已完成 Proposed slice，但尚未将 ADR 升格为 Accepted：

- `NeuroAgentHarnessOptions.abortGraceMs` 默认 150ms，拒绝负数和非有限值；每个 `start()`/`resume()` 建立一次 completion boundary，forced abort 后释放本地 active admission。
- forced path 使用当前 Snapshot 和 Invocation owner CAS；正常 finish 先落盘时保留 `completed`，terminal `agent_end` 通过 per-attempt gate 只发布一次。
- late Model/Tool/Hook/ContextProvider/Compactor/Approval/Capability 结果继续由 ADR-0007 attempt fence 隔离；Invocation-owned Tool write 增加跨 Session 防护。
- reducer 只对“恰好一个 `startInvocation` operation”保留空 owner 的启动特例；组合 plan 必须先经过 owner CAS。
- settlement failure path 在 Hook 前后及 effect 写入后重新读取 durable owner，reconcile 期间不应用迟到 effect。

本轮证据：`bun test tests/abort-boundary.test.ts tests/invocation-ownership.test.ts` 为 23 pass / 0 fail / 62 expect calls；`bun run verify` 为 93 pass / 0 fail / 433 expect calls；跨进程 EventHub fencing、真实 provider/tool、Store dispose 失败路径和完整 NeuroBook/Cosmos acceptance 仍未验证。

## 2026-08-09 Hardening plan

上一轮实现的独立审查发现 forced path 仍复用带 `expectedVersion` 的普通 `finish()`；虽然已有 `expectedActiveInvocationId` 和 `invocationWriteFences` 数据结构，但 sealed fence 尚未在 Harness `commit()` admission 中生效。下一轮保持本 ADR 的公开合同不变，补齐以下实现与证据：

- forced abort 使用专用的 versionless owner-CAS `finishInvocation(status: "aborted")`，cause 与普通 terminal finish 区分，有限次处理冲突；不能确认 durable terminal 时返回 `AbortBoundaryError`，不伪造 aborted event；
- forced abort 入口 seal Invocation write fence；普通 late plan 在本地被拒绝，唯一内部例外是该 Invocation 的单一 forced-abort terminal plan；
- 覆盖 owner check 到 effect commit 之间的 late `settleFailure` 竞态；
- 覆盖 `agent_end(waiting) → agent_end(aborted)` 顺序与重复 abort 的唯一终态事件。

本轮继续不引入 partial assistant、provider timeout/retry、跨进程 EventHub fencing、Job/Lease/Outbox、sidecar 或 Transport DTO；实现完成后仍需独立 acceptance review，ADR 状态保持 `Proposed`。

## 2026-08-09 Hardening implementation walkthrough

- `finishInvocationOwnerCas()` 为 forced abort 建立无 `expectedVersion` 的精确 owner-CAS；`forceAbort()` 在 sealed fence 下只允许该单一 terminal plan，冲突最多重试 3 次，耗尽抛出 `AbortBoundaryError`，不发布伪造 terminal event。
- `assertInvocationTarget()`/`commit()` 已接入 sealed fence；普通 late Model/Tool/Hook/settlement plan 在本地 admission 被拒绝，Invocation binding 持续到 raw run 完成。`harness.abort()` 对 durable waiting 也使用 owner-CAS 并有限重试，waiting→aborted 终态事件只发布一次。
- 终态 event gate 使用 Session+Invocation key，避免无 active waiting abort 重复发布，也保留可控的 Invocation ID 复用边界；sealed binding 在 raw run 结束前拒绝重入。
- 证据：`bun test tests/abort-boundary.test.ts tests/invocation-ownership.test.ts tests/recovery.test.ts` 为 34 pass / 0 fail / 115 expect calls；`bun run verify` 为 100 pass / 0 fail / 462 expect calls；`bun run pack:smoke` 通过；`git diff --check` 通过（仅 LF/CRLF 工作树警告）。
- 独立 review 发现的 waiting conflict retry 和 JSONL forced-abort recovery 缺口已修复并重新验证。本 ADR 仍保持 `Proposed`；未验证范围为跨进程 EventHub fencing、真实 provider/tool、Store dispose 失败路径、真实 NeuroBook/Cosmos 接入、浏览器/产品和生产验收。

## 2026-08-09 Standalone Core acceptance review

- 独立审查确认本 ADR 的实现已覆盖 standalone Core 当前接受范围：forced abort 的 versionless owner-CAS、sealed write fence、有限冲突重试、waiting abort 终态顺序、迟到 effect/runtime event 隔离、Memory/JSONL recovery 和固定 Invocation ID 生命周期。
- 新增 focused 回归覆盖 waiting abort 连续 3 次 Store conflict 耗尽，以及 raw run 结束前后的固定 Invocation ID 绑定边界；没有发现本轮范围内的 P0/P1 代码缺陷。
- 最终验证：focused 三文件套件 `36 pass / 0 fail / 135 expect calls`；`bun run verify` `102 pass / 0 fail / 482 expect calls`；`bun run pack:smoke` 通过，包含 tarball、Bun consumer 和 Node ESM consumer；`git diff --check` 通过。
- 接受范围不包含跨进程 EventHub 终态唯一性、真实 provider/tool、Store `dispose()` 失败路径、真实 NeuroBook/Cosmos 接入、浏览器/产品验收和生产部署；这些继续由 Adapter/消费者任务单独验证，不阻塞本 ADR 的 standalone Core acceptance。

## 2026-08-10 ADR-0014 additive amendment

ADR-0014 在 forced terminal 存在非零 usage 时，于同一个 owner-CAS plan 的原形状 `finishInvocation(status: "aborted")` 后追加一条 `harness.invocation.usage` fact；全零时仍保持单一 operation。sealed fence 只接受这两个精确形状；它仍是一个原子的 forced-abort terminal plan，不允许普通 late write，也不改变本 ADR 的 owner、冲突重试或唯一 terminal event 合同。
