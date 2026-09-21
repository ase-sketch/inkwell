# 第三十九轮：durable approval resume admission

## 规划结论

三路规划证据：

- standalone 广审发现 `resume()` 的 `resumeInvocation` commit 位于获批 Tool 执行之后；两个 Harness 可重复执行副作用；
- NeuroBook 当前测试明确覆盖“waiting 后并发 resolution 只能一个 claim 成功”，实现通过产品 Session mutation 临界区 claim；standalone 应吸收行为，不移植产品 lock/DTO；
- Cosmos 仍没有真实 Agent 生产路径，并明确让自己持有 Workflow/Run/Step/Job、Lease、Outbox 和外部副作用；当前没有理由扩张 Harness durable Workflow API。

另两个候选暂后置：

- `snapshot()` 的 Store read 与进程内 cursor 读取存在竞态，可能返回旧 Snapshot + 新 cursor；
- JSONL `reconcileInterrupted()` 把 `sessions` 的非 ENOENT I/O 也吞成空目录。

两者都需要独立 public tracer，不能与 approval side-effect admission 混成一轮。

## Public red

测试使用：

- 一个共享 `MemorySessionStore`；
- 两个独立 `NeuroAgentHarness`；
- 同一个 waiting Invocation 和 resolution；
- 获批 Tool 在执行时递增外部计数并等待 gate。

两个 `resume()` 同时开始后：

```text
bun test tests/approval.test.ts
3 pass
1 fail
21 assertions

expected Tool executions: 1
actual Tool executions: 2
resume admissions fulfilled: 2
```

双方都在 Store claim 前执行 Tool；后续 transcript CAS 无法撤销重复副作用。

## Planned contract

详见 [ADR-0022](../../../adr/0022-durable-approval-resume-admission.md)。

1. observed waiting Snapshot 上校验 invocation/resolutions/Profile；
2. Tool 前提交 `expectedVersion + expectedActiveInvocationId + resumeInvocation`；
3. 只有 Store CAS winner 创建 attempt 并执行 resolution；
4. pending approval requests 作为 run-attempt-only 输入保留，durable Snapshot 在 claim 后清除；
5. Tool result commit 不再重复 resume transition；
6. crash-after-claim 恢复为 interrupted，不自动重放；
7. 不承诺外部 exactly-once，不引入 Job/Lease/Outbox。

## TDD order

1. 当前跨 Harness Memory red → pre-Tool durable claim；
2. 同 Harness并发与 loser no Capability/Tool/Provider；
3. JSONL 独立 Store/Harness竞争与恢复；
4. approval context、拒绝、Tool failure、abort/reconcile；
5. Context/recovery/ownership focused → full/package → 独立审查。

## 当前状态

ADR-0022 为 `Proposed`。正式 Memory public red 为 3 pass / 1 fail / 21 assertions：两个 resume 都 fulfilled，Tool 执行两次。

## Red → green

- `resume()` 在任何 Capability/Tool/Provider 前提交 observed version + durable owner + `resumeInvocation` claim；
- winner 从 admitted running Snapshot 写后续事实；pending approval requests/resolutions 作为 attempt-only 输入保留；
- Tool result commit 不再重复 resume transition；
- 同一 Harness 在 Store read 后复核本地 active；跨 Harness 仍由 Store CAS 决胜；
- Memory red 转绿，并增加两个独立 JSONL Store/Harness 竞争；loser 为 `SessionConflictError`，winner 结果和唯一 Tool result 可恢复。

第一次扩大 focused 为 48/1/238，唯一回归是 `profile.prepare()` 从 waiting version 变成 admitted running version。ADR-0003/0005 已接受“prepare 看 waiting、ContextProvider 看 resolution 后最新 Snapshot”；实现改为保留 observed waiting Snapshot 作为 prepare/Capability attempt input，Store current 仍从 admitted Snapshot 推进。

第二个 public P1 来自 resolution set 校验：

```text
pending: [a, b]
resolutions: [a, a]
```

旧逻辑只检查长度与 membership，错误接受并可能先执行 a。回归先为 4/1/26（expected rejected, actual accepted）；增加 pending/resolution ID 唯一性与 exact-set 校验后转绿。

durable claim 还使延迟 resume 变为 running；既有 cross-Harness abort 回归因此首次得到 failed 而不是 aborted。无本地 handle 的 `abort()` 扩展为对 durable running/waiting owner 做有限重试 CAS，恢复旧合同；它只 fence Session owner，不声称终止远端 raw side effect。

## 当前验证

```text
bun run typecheck
exit 0

bun test tests/approval.test.ts tests/recovery.test.ts tests/context.test.ts tests/context-lifecycle.test.ts tests/context-provider-capability.test.ts tests/invocation-ownership.test.ts tests/abort-boundary.test.ts tests/harness.test.ts tests/invocation-result-durability.test.ts
77 pass
0 fail
387 assertions

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

`git diff --check` 只有 Windows working tree 的 LF → CRLF 提示。Package prepack 同为 223/0/1050；Bun/Node tarball consumer 通过。

## Review 与收尾

- 独立 pre-acceptance review 重跑 approval/recovery 11/0/64，未发现代码 P0/P1；
- review 发现 README 的“不会重复放行同一副作用”可能被理解为外部 exactly-once 的 P2；
- README 改为“同一 observed transition 的并发 contender 至多一个进入 Tool”，并在同一句保留 crash-after-external-success 的 unknown/宿主幂等边界；
- post-fix 独立 review 返回 `No P0/P1/P2 findings.`；
- 未验证真实 provider、真实外部副作用、进程级 crash 注入、NeuroBook/Cosmos 接入、Transport、浏览器或产品验收；它们不由本 ADR 的 standalone admission 证据替代。

ADR-0022 已在 standalone Harness approval-admission 范围接受。三处既有 dirty 文件继续受保护，本轮未修改 NeuroBook 或 Cosmos。
