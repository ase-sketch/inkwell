# ADR-0017: External Invocation Abort Signal

- Status: Accepted (standalone Core scope)
- Date: 2026-08-10
- Task: [`01-harness-decoupling`](../tasks/01-harness-decoupling/README.md)

## Context

第三十二轮对照 NeuroBook Workflow sidecar、standalone Workflow tests 和 Cosmos durable Workflow 合同后确认：

- standalone 已能用 `snapshot → createSession/invokeAt → write` 组合 branch/fork、旁路 Agent 和 anchor-guarded result writeback；
- Memory/JSONL 已覆盖 stale target、重启恢复和重复 delivery 边界；
- NeuroBook `HarnessAgentPort` 还会把 Workflow Run 的 `AbortSignal` 在 Invocation 启动时直接传给 Harness；
- standalone 只能在 `invoke()` / `invokeAt()` 返回 handle 后调用 `handle.abort()`。

最后一项在异步 Store read/start commit 期间存在 admission window。Workflow 父 Run 可能已经取消，但调用方尚未取得 handle，不能请求 bounded abort。把 Job、Run、Lease 或 sidecar API 下沉 Core 会扩大职责；一个 request-scoped signal 足以关闭该运行期窗口。

## Decision

### 1. Additive request signal

`InvokeRequest` 新增：

```ts
readonly signal?: AbortSignal;
```

`InvokeAtRequest` 继承同一字段。signal 只控制这次新 Invocation 的当前 handle lifecycle：

- 不写入 Session、Invocation input、Host Context 或 event payload；
- 不改变 caller/message identity；
- 不增加 Job/Run/Step/cancel DTO；
- `InvocationHandle.abort()` 保持兼容。

### 2. Admission semantics

- signal 在 durable start 前已经 aborted：`invoke()` / `invokeAt()` reject，不创建 Invocation；
- Store read 完成后、start commit 前再次检查，避免等待 I/O 期间的取消继续 admission；
- signal 在不可取消的 start commit 期间 aborted：
  - commit 失败时保留原 Store/CAS 错误；
  - commit 成功时 Invocation 已是 durable fact，Harness 注册 handle 后立即进入现有 bounded abort pipeline；
- Core 不宣称能中断任意第三方 Store I/O；start admission 仍不把 signal 传给 Store Adapter。active Invocation 的后续 Invocation-owned commit 使用 ADR-0034 的 runtime-only Store commit signal。

### 3. Active run linkage

Harness 在 active Invocation 注册后：

- 监听外部 signal；
- abort 时复用 `requestAbort()`，因此仍使用内部 `AbortController`、attempt invalidation、grace timer、owner CAS 和 sealed terminal；
- handle settle 后移除 listener；
- external abort reason 不新增 durable schema；Invocation error 继续使用现有 abort 语义。

signal 不直接替换 Model/Tool/Hook 收到的内部 signal，避免绕过 Harness 的 completion boundary。

### 4. Waiting boundary

当前 handle 在 `waiting` 时已经 settle。外部 signal listener 随该 handle 一起结束，不承诺在未来 approval `resume()` 期间继续存活。

需要取消 durable waiting Invocation 时，Workflow/宿主继续调用 `harness.abort(sessionId)`；若未来要求一个 signal 跨 waiting/restart 持续生效，必须由 durable Workflow cancellation fact 驱动，而不是保存运行期 `AbortSignal`。

## Alternatives

- **Workflow 取得 handle 后自行监听 signal**：不足。无法覆盖 Store admission window，每个 Adapter 还会复制 already-aborted/race/listener cleanup。
- **把外部 signal 直接传给 ModelRuntime**：拒绝。会绕过 attempt invalidation、forced terminal、Tool/Hook/Capability 和唯一 completion boundary。
- **给 Harness 增加 Workflow Run/cancel API**：拒绝。Cosmos/NeuroBook 的 Run、Job、Lease 和 cancel state 属于宿主 durable truth。
- **把 signal 放进 `InvocationInputOptions`**：拒绝。该类型同时用于 steer/follow-up；运行期取消不应伪装成 durable queued-input metadata。

## Deliberate boundary

本 ADR 不定义：

- `resume()` / `retry()` / `AgentCallRequest` 的 signal；
- signal 跨 waiting、进程重启或 Workflow replay；
- Store I/O cancellation；
- child Workflow、Job、Lease、heartbeat、Outbox 或 exactly-once；
- ephemeral archive、linked agent relation ledger 或 sidecar DTO；
- HTTP/SSE cancellation transport；
- NeuroBook/Cosmos 修改。

## Verification gate

- already-aborted signal 在任何 Invocation fact 前拒绝；
- start commit 期间取消：commit 成功后进入 aborted/confirmed，Model 不产生成功消息；
- active Model 期间取消复用 bounded abort，forced winner 不写迟到结果；
- listener settle 后不影响后续 Invocation；
- 既有 strict `invokeAt` CAS、handle abort、approval waiting、dispose 和 Workflow writeback 回归；
- public type、README/CONTEXT/CHANGELOG、Bun/Node tarball consumer；
- focused、`bun run verify`、`bun run pack:smoke`；
- 独立审查确认没有把 request signal误报为 durable Workflow cancellation。

## Acceptance evidence

- signal focused matrix：5 pass / 0 fail / 18 expect calls；
- Workflow/signal/abort/approval focused：34 pass / 0 fail / 152 expect calls；
- `bun run verify`：176 pass / 0 fail / 874 expect calls，覆盖 38 个测试文件并通过 typecheck/build；
- `bun run pack:smoke`：通过；tarball 为 101 files / 95.3 kB / 462.1 kB unpacked，Bun 与 Node ESM consumer 均通过；
- post-fix 独立只读审查：`No P0/P1/P2 findings.`。

本接受结论只覆盖 standalone Core 的 request-scoped Invocation admission 与 bounded abort linkage；不覆盖 durable Workflow cancellation、waiting/restart、Store I/O cancellation、NeuroBook/Cosmos 真实接入或 HTTP/SSE Transport。
