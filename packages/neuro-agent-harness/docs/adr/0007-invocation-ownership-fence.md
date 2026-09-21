# ADR-0007: Invocation Ownership Fence

- Status: Accepted (standalone Core scope)
- Date: 2026-08-09

## Context

`AbortController` 只能通知合作式的 Model、Tool 或 Hook。非合作式外部 await 在取消后仍可能返回结果；如果 Run Kernel 继续提交这些结果，旧 Invocation 会把迟到的 assistant message、Tool result、Tool write plan 或 Hook effect 写入 Session。进程重启后的 `reconcileInterrupted()` 也需要让旧进程持有的写入计划失效。

当前 `SessionWritePlan` 只有 version/leaf CAS，没有对 `activeInvocationId` 的 durable ownership 条件。仅依赖内存中的 `active` Map 不能覆盖另一个 Harness 实例或进程已经完成 reconcile 的情况。

## Decision

### Durable owner CAS

为 `SessionWritePlan` 增加可选字段：

```ts
readonly expectedActiveInvocationId?: string | null;
```

语义如下：

- 字段省略：不检查，保留 `harness.write()` 和 Workflow 显式写入的兼容性；
- `null`：要求当前 Session 没有 active Invocation；
- 字符串：要求当前 `activeInvocationId` 精确匹配；
- Store Adapter 在自己的锁或事务边界内，由 reducer 在执行任何 operation 前检查；
- 不匹配抛出 `InvocationOwnershipError`，不复用 `SessionConflictError`、`InvocationConflictError` 或 `JsonlLockError`。

Harness 通过内部 `invocationId` 提交的 Invocation-owned plan 自动携带 owner 条件；Invocation start 明确要求 `null`，但 `startInvocation` 仍保留既有的 `InvocationConflictError` 诊断。`MemorySessionStore` 与 `JsonlSessionStore` 的 `reconcileInterrupted()` 携带它观察到的 active owner，避免旧进程在恢复后继续写入。

### Run-attempt fence

每次 `start()` 或 `resume()` 建立一个内部、不可复用的 run attempt：

- `abort()` 和 `dispose()` 先同步使 attempt 失效，再触发 `AbortController.abort()`；
- Model、Tool、Approval、Hook、ContextProvider 和 Compactor 的外部 await 返回后检查 attempt；
- 失效 attempt 的迟到结果不得进入 transcript、Tool write plan、Tool result、Hook effect 或普通 `settleRun`；
- `settleFailure` 保留为取消清理例外，以兼容现有 partial-output 行为，并仍受 durable owner CAS 保护；
- 同一 Harness 使用的 `SessionEventHub` 丢弃失效或已 terminal attempt 产生的 runtime event。

本 ADR 只承诺同一 Harness / EventHub 内的 attempt fence。它不宣称跨进程 EventHub fencing，也不解决一个永不结束的 provider/tool 所需的 bounded abort。

## Consequences

- 旧 Invocation 的迟到 durable write 会在 Store 的原子边界失败，即使失效原因来自另一个 Harness 的恢复操作。
- 省略 owner 条件的公开 `harness.write()` 仍可作为 Workflow 或宿主组合原语使用；Invocation-owned 跨 Session 副作用不由本 ADR 扩展，旁路 Agent 继续通过 Workflow 显式组合。
- 取消后的终端收尾仍可能等待合作式外部依赖；`abortGraceMs`、强制 completion boundary、retry admission 和 terminal `agent_end` 唯一性另立 ADR-0008。
- 公开 DTO、HTTP/SSE transport、父 Workflow signal 传播和 system-origin message identity 不在本轮范围。

## Evidence and acceptance

2026-08-10 的 standalone acceptance review 核对了以下证据：

- reducer 精确区分 owner 字符串、`null` 和字段省略；Harness 自动为 Invocation-owned plan 注入 owner 条件，Invocation start 继续保留独立 admission 诊断；
- abort 先使 run attempt 失效；非合作式 Model、sequential/parallel Tool、Hook、ContextProvider、Compactor、Approval 和 Capability 的迟到结果均不能继续提交 transcript、Tool result/write plan 或 effect；
- `settleFailure` race、terminal callback/runtime event、组合 start 和跨 Session write 均受对应 owner/attempt fence 约束；
- Memory/JSONL reconcile 后旧 Harness 的迟到 plan 被拒绝，新 Harness 可以恢复或 retry；
- waiting 后的 `resume()` 创建新 attempt；`dispose()` 的非合作式依赖和迟到返回已由 bounded-abort 回归覆盖，没有发现需要重复补测的独立写入窗口。

Focused 验证：

```text
bun test tests/invocation-ownership.test.ts tests/abort-boundary.test.ts tests/recovery.test.ts tests/commit-observer.test.ts
37 pass / 0 fail / 141 expect calls
```

独立只读 reviewer 未发现 P0/P1，并单独复跑 `tests/invocation-ownership.test.ts`：19 pass / 0 fail / 55 expect calls。最终 `bun run verify` 为 122 pass / 0 fail / 610 expect calls，包含 typecheck、build 和 32 个测试文件。本轮没有公共 API 或包内容变化，因此未重复 `bun run pack:smoke`。


## 2026-08-14 审计整改补充：approval reservation

本轮将 run-attempt fence 的建立点明确扩展到 approval durable claim 之前：`resume()` 在 `resumeInvocation` CAS 进入 observer 重入窗口前登记本地 active reservation；claim 失败释放 reservation，claim 后的 observer/abort 先使 attempt 失效。普通 start 仍保持 durable start commit 后登记 active 的原有生命周期。新增 commit-observer 重入回归证明失效 attempt 不会越过 Capability、prepare 或 Tool 副作用边界。

这只是既有 owner/attempt fence 的 admission-window 收口，不改变跨进程 owner CAS、外部副作用 exactly-once 或 bounded abort 的边界。
因此本 ADR 在 standalone Core 范围内接受。接受内容不包含跨进程 EventHub fencing 或 terminal event 唯一性、真实 provider/tool、第三方 Store Adapter、父 Workflow signal、HTTP/SSE Transport、真实 NeuroBook/Cosmos consumer、浏览器/产品验收或生产部署。公开 `harness.write()` 省略 owner 条件仍是兼容设计；bounded completion 由 ADR-0008 单独负责。
