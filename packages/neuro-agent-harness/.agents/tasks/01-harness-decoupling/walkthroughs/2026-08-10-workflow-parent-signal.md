# 第三十二轮：Workflow parent signal

## 结论

ADR-0017 已在 standalone Core 范围接受。实现、focused/full/package smoke 与 post-fix 独立审查均已完成。

本轮没有恢复 sidecar API。现有 Workflow 原语已经覆盖旁路 Agent 的数据面；新增的唯一公共字段是：

```ts
interface InvokeRequest<TSessionId extends SessionId> {
    // existing fields...
    readonly signal?: AbortSignal;
}
```

`InvokeAtRequest` 继承该字段。它把 Workflow/宿主的运行期取消连接到当前 Invocation handle 的 existing bounded abort，不进入 durable Session。

## 规划比较

### Standalone 已有的数据面

现有 public tests 已证明：

- `snapshot → moveLeaf → invoke` 可以 rewind/branch；
- `createSession(parentSessionId)` 可以建立旁路参与者；
- strict `invokeAt(anchor)` 在 stale/concurrent/cross-Harness 场景 fail closed；
- `SessionEntryCodec + write(expectedVersion/expectedActiveLeafId)` 可以把结果 CAS 回写父 Session；
- Memory/JSONL 可以恢复获胜 Invocation 和已回写结果；
- duplicate result delivery 没有 exactly-once，宿主按 source identity 去重。

这些能力足以组合 sidecar 的分支、参与者和结果写回，不需要 Core `SidecarProfilePass` 或 sidecar lifecycle。

### NeuroBook 对照

当前 NeuroBook Workflow sidecar 场景：

```text
caller Session mainline
  ├─ excursion branch probe（留树上，不进入主线）
  │    └─ ephemeral retrieval participant
  └─ facts append 回 caller mainline
```

`excursion`、ephemeral archive、linked relation 和 Workflow journal 都是宿主政策。真正影响 standalone Invocation correctness 的差异是 `HarnessAgentPort` 会把 Workflow Run 的 `AbortSignal` 在 invoke admission 时直接传入 Harness。

standalone 原来只能：

```text
await harness.invokeAt(...)
  → receive handle
  → signal listener calls handle.abort()
```

Store read/start commit 期间尚无 handle，父 Run 已取消也无法关联。

### Cosmos 对照

Cosmos 明确由自己的 Workflow Runtime 持有 Run/Step/Job、lease、heartbeat、cancel、checkpoint、Outbox 和 durable SSE。Harness 只能作为 Agent Invocation Adapter，不能复制这些事实。

因此本轮只关闭 request-level admission window，不增加 durable Workflow cancel。

### SSE 候选

没有发现新的 Core 缺口。`SessionEventHub` 已提供 epoch/seq、replay、snapshot-required 和 async subscription；HTTP framing、keepalive、auth、byte budget、slow consumer 与 durable domain event 继续属于宿主 Transport。

## API 与生命周期

### Durable start 前

- already-aborted signal 直接 reject；
- Store read 完成后再次检查；
- 两种情况都不创建 Invocation。

### Start commit 期间

Store commit 本身不接受 signal：

- commit 失败：原 Store/CAS error 保留；
- commit 成功：durable Invocation 已存在，注册 active handle 后立即调用 existing `requestAbort()`。

因此不会把已提交的 start 当作“从未发生”，也不会用取消掩盖精确 Store error。

### Active handle

signal listener 只调用 `requestAbort(sessionId, invocationId)`，继续复用：

- Harness 内部 `AbortController`；
- attempt invalidation；
- `abortGraceMs`；
- owner CAS；
- sealed terminal；
- late result/event fence。

handle settle 后 listener 被移除。signal 不替换 Model/Tool/Hook 的内部 signal，也不持久化。

### Waiting

waiting result 会 settle 当前 handle并移除 listener。以后 approval resume 或进程重启不会继续持有该运行期对象；取消 durable waiting Invocation 仍调用 `harness.abort(sessionId)`。

## Red → green

初始 public red：

```text
bun test tests/workflow-invocation-signal.test.ts

0 pass
4 fail
5 expect() calls
```

四个红灯分别是：

- already-aborted signal 仍创建并完成 Invocation；
- start commit 期间 abort 后仍 completed；
- active Model 期间 abort 后仍 completed；
- Harness 从未注册/移除 external listener。

TypeScript 同时给出四个 `TS2353`：

```text
'signal' does not exist in type 'InvokeRequest<number>'
'signal' does not exist in type 'InvokeAtRequest<number>'
```

加入 request 字段、pre-start checks 和 active listener 后四项全绿；随后追加 start commit failure winner：

```text
5 pass
0 fail
17 expect() calls
```

实现后自审又发现一个更窄的 admission window：signal 在 start commit 期间已经 aborted，但 external listener 尚未连接时，required Capability 的 `open()` 仍会先执行。新增 `capabilityOpens === 0` 断言后先得到：

```text
Expected: 0
Received: 1
```

修复方式是让 start commit 返回后创建的内部 controller 立即继承已发生的 abort，并在 Run Kernel 打开任何 Capability 前检查内部 signal。最终 signal 文件为：

```text
5 pass
0 fail
18 expect() calls
```

最终矩阵：

1. pre-aborted 不产生 Invocation/Model call；
2. start commit 成功后 external abort 得到 aborted/confirmed，signal 不持久化，且不打开 required Capability；
3. start commit 失败时原错误获胜；
4. active Model 收到 Harness 内部 abort，迟到成功正文不落盘；
5. settled handle 移除 external listener。

## 验证

Focused：

```text
bun test \
  tests/workflow-invocation-signal.test.ts \
  tests/workflow-agent-invocation.test.ts \
  tests/workflow-result-writeback.test.ts \
  tests/workflow-extension.test.ts \
  tests/workflow-scheduler.test.ts \
  tests/abort-boundary.test.ts \
  tests/approval.test.ts

34 pass
0 fail
152 expect() calls
```

全仓：

```text
bun run verify

176 pass
0 fail
874 expect() calls
Ran 176 tests across 38 files.
typecheck passed
build passed
```

Package：

```text
bun run pack:smoke

exit code 0
prepack: 176 pass / 0 fail / 874 expect() calls
tarball: 101 files, 95.3 kB, 462.1 kB unpacked
```

Node ESM tarball consumer 编译 `InvokeAtRequest<number>` 的 `signal: new AbortController().signal`；Bun/Node 安装和运行均通过。

`git diff --check` 通过；只有 Windows 工作区的 LF/CRLF 转换警告。

## 审查

第一轮独立只读审查针对 Capability-open 修复前版本返回 `No P0/P1/P2`。自审随后发现并修复 start commit 后、external listener 连接前仍可能打开 Capability 的窗口，因此没有直接沿用该结论。

最终 post-fix 独立只读审查只检查 `src/harness.ts` 与 `tests/workflow-invocation-signal.test.ts`，重点覆盖：

- signal abort 与 start commit success/failure winner；
- listener 注册/清理窗口；
- waiting boundary 是否被误报为 durable cancel；
- 是否应该扩到 retry/resume/AgentCallRequest；
- 是否错误引入 sidecar、Workflow Job 或 Store cancellation 语义。

结论：

```text
No P0/P1/P2 findings.
```

审查确认已取消 signal 在 durable start 后不会打开 required Capability 或调用 Model；start commit 失败保留原 Store error；成功后的 external abort 只复用现有 `requestAbort()`、owner CAS、grace timer 与 sealed terminal。

## 未验证

- 真实 NeuroBook Workflow/Harness Adapter 接入；
- Cosmos Harness Adapter 与 durable Run/Job cancellation；
- signal 跨 waiting/resume、进程重启或 Workflow replay；
- 第三方 Store 的实际长 I/O/ambiguous commit；
- 真实 Provider/Tool/Capability 对 abort 的合作程度；
- ephemeral archive、linked relation、Workflow journal；
- HTTP/SSE cancellation transport、浏览器、发布与生产。

## 下一步

创建本地 checkpoint 后回到第三十三轮规划。Workflow/sidecar coverage 已在当前 standalone 数据面范围关闭；ephemeral archive、linked relation、Workflow journal 与 durable Job/Lease/Outbox 继续属于宿主。
