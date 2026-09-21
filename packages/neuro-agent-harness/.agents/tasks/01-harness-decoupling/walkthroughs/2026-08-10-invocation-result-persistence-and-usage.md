# 第二十八轮：Invocation result persistence 与 durable usage

## 结论

ADR-0014 已在 standalone Core 范围接受。本轮解决的不是“Provider 是否调用成功”，而是调用方如何区分本地观察到的 outcome 与 Store 已确认的恢复事实。

最终合同：

```text
run attempt outcome
  ├─ terminal + usage 已从 Store Snapshot 可恢复
  │    → persistence: confirmed
  │    → 可以发布 agent_end
  └─ terminal Store commit 未确认
       → persistence: unknown
       → Snapshot 仍是恢复真相源
       → 不发布伪造的 agent_end
```

同时，Provider 已报告的 usage 不再依赖 assistant transcript 恰好提交成功；Capability cleanup 也不再改写已经形成的 Invocation outcome。

## 初始 public tracer

临时 tracer 只使用公开 Harness、Store、Capability 和 ModelRuntime 合同：

```text
4 pass
0 fail
18 expect() calls
```

它确认了四个当前事实：

1. 已 durable 的 completed-turn usage 能穿过后续 Provider failure；
2. assistant 已返回但 transcript commit 失败时，本地 observed usage 与 Snapshot transcript 分叉；
3. terminal commit 失败时 handle 返回 failed，而 Snapshot 仍是 running，且没有 terminal `agent_end`；
4. Capability `close()` 在 durable completed 后抛错，会把 handle 改写为 failed/zero usage，和 Snapshot 的 completed/13 usage 相反。

第四项是明确 correctness bug；第三项则证明现有 `InvocationResult` 缺少 Store confirmation 维度。临时 tracer 随后转化为正式 public 回归测试。

## ADR 与兼容策略

### Result persistence

`InvocationResult` 新增必填字段：

```ts
readonly persistence: "confirmed" | "unknown";
```

- `confirmed` 表示 status、output/error 和 usage 可以从当前 Store Snapshot 恢复；
- `unknown` 表示本地 attempt 已结束，但 terminal Store state 未确认；
- 不增加新 status，也不把既有总是 resolve 的 `result()` 改成 reject；
- waiting 只有在 `waitInvocation` 已提交后才是 confirmed；
- terminal 未确认时不发布 `agent_end`，由 restart reconcile 处理仍 running 的 Invocation。

`confirmed` 只表示当前 Store Adapter 已接受 commit；不外推为磁盘 fsync、网络文件系统 fencing 或 exactly-once。

### Usage 与 transcript 解耦

最初候选是在 `finishInvocation` operation 上增加 optional usage。独立审查指出，严格校验 operation keys 的旧第三方 Store 仍可能拒绝这个 additive 字段，因此最终采用：

```text
非零 usage terminal plan
  1. 原形状 finishInvocation
  2. appendEntries(harness.invocation.usage)
```

两项在同一个 `SessionWritePlan` / Store commit 中提交。全零 usage 仍保持原来的单 `finishInvocation` plan，减少旧 Store 的不必要行为变化。

包根新增：

```ts
invocationUsage(snapshot, invocationId)
```

它优先读取 terminal usage fact；旧 Snapshot 或无 fact 时回退 active-path assistant transcript。这样既能恢复 assistant transcript commit 失败窗口中的真实 usage，也不破坏旧记录。

`harness.invocation.usage` 是 Harness 保留 kind：

- 公共 `write()`、Profile 和 Tool 不能写入；
- internal terminal plan 只能通过私有 admission 例外；
- forced-abort sealed fence 只允许原单 terminal plan，或精确的 terminal + 一条同 Invocation usage fact；
- malformed fact 会以 `SessionInvariantError` fail closed。

## Red → green

正式 `tests/invocation-result-durability.test.ts` 最终包含 13 个行为测试：

1. 非法 Provider usage 在 transcript 持久化前失败；
2. completed-turn usage 穿过后续 Provider failure；
3. assistant transcript commit 失败时，terminal fact 仍恢复 usage；
4. terminal commit 失败返回 `persistence: "unknown"`；
5. cleanup 与 terminal failure 同时发生时保留原始 Provider error；
6. cleanup failure 不覆盖 durable completed；
7. cleanup failure 不覆盖 waiting，resume 后 usage 只累加一次；
8. cleanup failure 不覆盖 durable failed；
9. forced abort 原子保存前序 durable turn usage；
10. 独立 Harness abort 与延迟 approval resume 的 CAS race 由 abort 获胜，双方恢复同一 aborted/confirmed，usage fact 恰好一条；
11. 严格旧 `finishInvocation` operation validator 仍兼容；
12. host write 不能伪造保留 usage fact；
13. JSONL 新 Store 重启后仍能恢复 terminal usage。

Provider usage 在进入 transcript 或 terminal fact 前必须满足：

```text
input/output/total 均为 number
Number.isFinite(value)
value >= 0
```

不强制 `total === input + output`，因为不同 Provider 对 total 的定义可能包含额外计量；Core 也没有引入 cost、cache、quota、provider/model ID 或 Pi metadata。

## Capability cleanup

`InvocationCapabilityScope.close()` 现在：

- 按逆序尝试关闭全部已打开 Capability；
- 单个失败继续关闭剩余资源；
- 一个 error 原样抛出，多个 error 使用 `AggregateError`；
- Run Kernel 把 cleanup 当作资源诊断，不用它覆盖已形成的 Invocation outcome。

如果 Capability Provider 需要让宿主观察 cleanup failure，当前必须自行报告；本轮没有新增 host diagnostics callback，也没有把 cleanup error 伪装成 durable Session failure。

## 独立审查

第一轮有效审查发现三个 P1：

1. 给 `finishInvocation` 增加 optional usage 可能破坏严格旧 Store；
2. terminal 未确认且 cleanup 同时失败时，cleanup 会掩盖原始 Provider/run error；
3. 缺少 abort 与 delayed approval resume 的确定性 CAS race。

三项分别通过 append-only usage fact、outcome reconciliation 和双 Harness race 回归关闭。最终独立审查未发现 P0/P1。

Reviewer 最后的 P2 指出 usage admission 只检查 `number`；随后已在 draft、projection、aggregation 和 internal admission 边界补为 finite/nonnegative 校验。

## 验证

Focused：

```text
bun test \
  tests/invocation-result-durability.test.ts \
  tests/persistence-events.test.ts \
  tests/abort-boundary.test.ts \
  tests/approval.test.ts \
  tests/invocation-ownership.test.ts

48 pass
0 fail
205 expect() calls
```

全仓：

```text
bun run verify

146 pass
0 fail
738 expect() calls
Ran 146 tests across 34 files.
typecheck passed
build passed
```

包边界：

```text
bun run pack:smoke

exit code 0
```

`npm pack`、tarball 安装、Bun consumer、Node ESM consumer 均通过；consumer 同时检查 `InvocationResult.persistence` 和根导出的 `invocationUsage()`。`git diff --check` 通过。

## 未验证

- 真实 Pi 或其它 Provider 的 usage/error/abort 行为；
- typed `ModelTurnError`、partial assistant、thinking persistence 和 retry transcript；
- 真实 NeuroBook/Cosmos 消费者接入；
- HTTP/SSE、跨进程 EventHub 和 Transport recovery；
- 第三方 Store 的真实产品实现；本轮只有严格旧 operation validator fixture；
- 网络文件系统、fsync、exactly-once、浏览器、发布和生产验收。

## 下一步

回到第二十九轮规划。ADR-0014 已提供 typed `ModelTurnError` 所需的 terminal usage/persistence 前置边界，但 partial assistant 仍缺：

- abort freeze 与 invalidated-attempt write 规则；
- retry transcript 是否包含 partial；
- thinking 的 durable projection；
- Tool call 完整性与未闭合 delta 剥离；
- 真实 Adapter 如何报告 failure usage。

下一轮应先重新对照 NeuroBook 当前实现、真实 Adapter seam 和这些并发矩阵；证据不足时继续保持普通 Provider throw 现状，不直接把 NeuroBook DTO 搬入 Core。
