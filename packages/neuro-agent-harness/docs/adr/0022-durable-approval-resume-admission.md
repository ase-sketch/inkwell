# ADR-0022: Durable Approval Resume Admission

- Status: Accepted (standalone Harness approval-admission scope)
- Date: 2026-08-11
- Task: [`01-harness-decoupling`](../tasks/01-harness-decoupling/README.md)

## Context

waiting Invocation 的 approval resolution 可能放行具有外部副作用的 Tool。当前 `resume()` 只读取 waiting Snapshot 并检查本进程 `active` Map；真正的 `resumeInvocation` Store commit 发生在所有获批 Tool 已执行之后。

两个独立 Harness 连接同一 Store 时可以同时读取同一个 waiting Snapshot、都执行 Tool，再由后置 commit 让其中一个失败。公开 Memory Store tracer 得到：

```text
3 pass
1 fail
21 assertions

expected Tool executions: 1
actual Tool executions: 2
resume admissions fulfilled: 2
```

此时 CAS 只保护 Tool result 写入，没有保护 Tool side effect。NeuroBook 当前回归也明确要求 waiting 后并发 resolution 只有一个 claim 成功；其产品 Session mutation lock 不能直接移植，但行为边界是 provider-neutral 的。

## Decision

在第一方 Harness approval-resume 路径增加 durable admission：

- `resume()` 基于 observed waiting Snapshot 校验 Invocation、完整 resolution set 和 Profile；
- 在创建 run attempt、打开 Capability 或执行 Tool 前，提交一个带 `expectedVersion` 与 `expectedActiveInvocationId` 的 `resumeInvocation` plan；
- Store CAS 获胜者把 Invocation 从 waiting 转为 running，并取得本次 resolution 的唯一执行权；竞争者在任何 Tool/Hook/Provider 工作前失败；
- waiting Snapshot 中的 pending approval requests 作为本次 run-attempt-only 输入传给 resolution 阶段；admission 后的 durable Snapshot 已清除 pending approvals；
- Tool result commit 只追加结果，不再重复执行 `resumeInvocation`；
- claim 后的普通运行失败沿现有 terminal persistence 收口；进程在 claim 后中断时由 `reconcileInterrupted()` 把 running Invocation 标记为 interrupted，不自动回到 waiting 重放同一 side effect；
- 同一 Harness 在 Store read 后再次复核 active admission，避免旧 observed Snapshot 覆盖本地 active handle；跨 Harness 正确性仍以 Store CAS 为准。

本决定只保证一次 waiting resolution 的 Harness admission 最多一个执行者，不保证外部副作用 exactly-once。Tool 在外部成功、结果 commit 前进程崩溃时，结果仍可能 unknown；宿主应使用幂等键、查询或补偿处理。

## Implementation evidence

- `resume()` 对 pending approval requests 与 resolutions 做 exact-set 校验，重复 pending/resolution ID、缺失或额外 ID 均在 Store claim 前失败；
- 校验后提交 `harness.invocation.resumeApproval.admit`，包含 observed `expectedVersion`、`expectedActiveInvocationId` 和单一 `resumeInvocation`；
- claim winner 的 admitted running Snapshot 作为后续 Store 真相；observed waiting Snapshot 只作为本次 attempt 的 `profile.prepare()` / Capability open 输入，保持 ADR-0003/0005 的既有生命周期；
- pending requests 与 resolutions 作为 attempt-only `ApprovalResume` 输入传给 Tool；后置 `harness.invocation.resumeApproval` commit 只追加 Tool result；
- 无本地 handle 的 `abort()` 现在对 durable running/waiting owner 使用同一有限重试 CAS，保留“跨 Harness abort 赢过延迟 resume”的既有 terminal usage 合同；
- Memory 与 JSONL 分别覆盖两个独立 Harness 竞争；JSONL winner 的 completed Invocation 与唯一 Tool result 可由新 Store 恢复。

正式 public red：

```text
bun test tests/approval.test.ts
3 pass
1 fail
21 assertions

expected Tool executions: 1
actual Tool executions: 2
resume admissions fulfilled: 2
```

实现后扩大 focused 首次为 48 pass / 1 fail / 238 assertions：durable claim 让 `profile.prepare()` 看到了 running version，违反 waiting-Snapshot 合同。保留 observed prepare Snapshot 后转绿。

同路径审查又发现重复 resolution ID P1：pending `{a,b}` 配 resolutions `[a,a]` 通过旧长度/membership 校验，先执行 a 再因 b 缺失失败。public red 为 4/1/26（resume 错误 accepted）；exact-set 校验后：

```text
bun test tests/approval.test.ts tests/recovery.test.ts tests/context.test.ts tests/context-lifecycle.test.ts tests/context-provider-capability.test.ts tests/invocation-ownership.test.ts tests/abort-boundary.test.ts tests/harness.test.ts tests/invocation-result-durability.test.ts
77 pass
0 fail
387 assertions

bun run typecheck
exit 0

bun run verify
223 pass
0 fail
1050 assertions

bun run pack:smoke
exit 0
101 files
102.6 kB package / 497.0 kB unpacked

git diff --check
exit 0
```

Package smoke 的 prepack 同为 223/0/1050，tarball 安装后的 Bun 与 Node ESM consumer 通过。独立 pre-acceptance review 重跑 approval/recovery 11/0/64，没有代码 P0/P1，但发现 README 将 admission 描述得近似外部 exactly-once 的 P2；改为“同一 observed transition 至多一个 contender 进入 Tool”，并明确 crash-after-external-success 仍可能 unknown。Post-fix review 返回 `No P0/P1/P2 findings.`。

本决定在 standalone Harness approval-admission 范围接受。它冻结 resolution exact-set、pre-Tool durable claim、prepare/current Snapshot 双边界和 durable running/waiting owner abort；不扩大为外部副作用 exactly-once 或 durable Job Runtime。

## 2026-08-14 审计整改：claim→run reservation fence

workflowz 审查发现一个本地 observer 重入窗口：若 `resumeInvocation` claim 成功后才登记 active，`SessionCommitObserver` 可同步重入 `abort()`，使新 attempt 在 Capability/prepare/Tool 前失效而旧路径仍继续执行。实现已将 approval `resumeOnce()` 的 active reservation、AbortController 与不可复用 attempt 提前到 durable claim 前建立；claim 失败会回收 reservation，observer/abort 会立即 invalidation，后续 run 阶段与 Invocation-owned 写入继续受 attempt/owner fence 保护。普通 `startOnce()` 不采用该预注册路径，保留既有 shutdown barrier 生命周期。

新增 `tests/commit-observer.test.ts` 重入回归；整改后 approval/ownership/abort 相关聚焦与全量门禁通过。该扩展仍只保证同一 observed transition 至多一个 contender 进入 Tool，不承诺外部副作用 exactly-once。

## Alternatives

- **只依赖本进程 `active` Map**：拒绝。独立 Harness、重启和多 Worker 不共享该 Map。
- **继续在 Tool 后 CAS**：拒绝。只能防止重复 transcript，不能撤销已发生的外部副作用。
- **新增 durable approval claim Entry/Lease**：暂缓。waiting → running 的现有 reducer transition 已能提供 CAS admission；不为本轮引入新持久事实和 stale claim 协议。
- **把 resolution 去重交给每个 Tool**：拒绝作为 Harness 修复。宿主幂等仍必要，但 Core 不应主动并发放行同一个 durable approval。
- **承诺 exactly-once Tool**：拒绝。跨外部系统原子性不属于 Harness Session commit。

## Verification gate

- 同一 Harness 并发 resume 至多一个 admission；
- 两个独立 Harness 共享 Memory Store 时，恰好一个 claim 成功、Tool 只执行一次；
- 两个独立 JSONL Store/Harness 竞争同一 waiting Invocation 时行为相同，获胜 Invocation 可恢复；
- losing claim 在 Capability、Tool、Hook、Provider 和 runtime approval-resolved event 前失败；
- approval request/data 仍传入获胜 Tool，拒绝 resolution 仍不执行 Tool；
- claim 后 Tool failure、terminal failure、abort 和 `reconcileInterrupted()` 保持可恢复；
- waiting Snapshot 的 pending approvals 在 claim 后清除，tool result 与后续 model turn 不重复；
- usage、message identity、ContextProvider/approval-resume Snapshot 边界保持通过；
- focused、`bun run verify`、`bun run pack:smoke`、`git diff --check` 与独立审查。

## Out of scope

- 外部 Tool exactly-once、幂等键生成、Outbox、补偿或副作用账本；
- Job、Lease、retry、delivery、durable Workflow cancellation；
- 自动重放 claim 后 interrupted Invocation；
- NeuroBook/Cosmos 修改、产品 approval UI 或 HTTP DTO。

claim 后远端 raw Capability/Tool/Provider 的实际终止仍由持有它的进程和宿主负责。
