# ADR-0014: Invocation Result Persistence and Durable Usage

- Status: Accepted (standalone Core scope)
- Date: 2026-08-10
- Task: [`01-harness-decoupling`](../tasks/01-harness-decoupling/README.md)

## Context

`InvocationHandle.result()` 当前总是 resolve `InvocationResult`，其注释称为 terminal result，但 Store 未确认 terminal commit 时仍会返回 `status: "failed"`。调用方无法只看结果判断这个 failure 是否已经成为 durable Session 事实。

第二十八轮 public tracer 同时确认：

1. 已 durable commit 的 assistant usage 会在后续 Provider failure 中保留；
2. assistant 已返回、其 transcript commit 失败时，进程内结果和 `agent_end` 带 usage，但 Snapshot 尚无可恢复的 usage fact；
3. terminal finish commit 失败时，结果为 failed，而 Snapshot 仍是 running，且正确地没有 `agent_end`；
4. Capability `close()` 在 durable completed 之后抛错时，会由 `observeRunResult()` 把结果错误改写成 failed/zero usage，Snapshot 却是 completed。

因此必须区分三个概念：

- 本次 run attempt 观察到的 execution outcome；
- Store 已确认的 Invocation state；
- Provider 已报告、需要跨重启保留的 token usage。

## Decision

### 1. Result persistence marker

`InvocationResult` 新增必填字段：

```ts
readonly persistence: "confirmed" | "unknown";
```

- `confirmed`：结果中的 Invocation status、termination/output/error 和 usage 已能从当前 Store Snapshot 恢复；
- `unknown`：Run Kernel 已结束本地 attempt，但没有确认对应 Invocation state 已持久化；Snapshot 仍是唯一恢复真相源；
- waiting 只有在 `waitInvocation` 已提交后才返回 `confirmed`；
- `unknown` 不触发 terminal `agent_end`，restart 可以把仍 running 的 Invocation reconcile 为 interrupted。

不新增 `persistence_error` status，也不让 `result()` 在既有 resolve 合同上改成 reject。

### 2. Terminal usage fact

Harness 在 terminal commit 的同一个 `SessionWritePlan` 中提交：

- 原有形状的 `finishInvocation` operation；
- observed usage 非零时追加一条 `harness.invocation.usage` append-only entry，payload 为 aggregated provider-neutral `TokenUsage`；全零保持旧的单一 `finishInvocation` plan 形状。

具体规则：

- completed/failed/aborted terminal commit 原子写入 terminal state 与非零 usage fact；
- waiting/forced abort 从已 durable assistant transcript 计算 usage；
- 旧 Snapshot 或没有 usage fact 的记录继续从 active path 的 assistant messages 推导；
- canonical `invocationUsage(snapshot, invocationId)` 优先读取该 Invocation 的 usage entry，再回退 transcript，并从包根导出。

`finishInvocation` 不增加字段；严格校验旧 operation keys 的第三方 Store 仍只需支持既有 multi-operation plan 与开放式 custom entry kind。`harness.invocation.usage` 是 Harness 保留 kind，公共 `write()`、Profile 和 Tool 不能伪造。Core 不增加 cost、cache、quota、provider/model ID 或 Pi metadata。

### 3. Post-terminal cleanup reconciliation

Capability 按逆序全部尝试关闭，一个 close 失败不得跳过其余资源。若 cleanup 在 run 已形成结果后抛错：

- `observeRunResult()` 读取 Store；
- 已确认的 completed/waiting/failed/aborted Snapshot 结果优先于 cleanup exception；
- Store 没有确认结果或读取失败时，返回 `failed + persistence: "unknown"`；
- cleanup exception 本轮不写入 Session，也不覆盖原始 Invocation error，即使 terminal commit 同时失败。

未来可以另行设计 host diagnostics callback；本 ADR 不把 cleanup error 伪装成 durable Invocation failure。

## Alternatives

- **只把 usage 累加移动到 transcript commit 后**：拒绝。Provider 已完成调用并报告消耗，Store 暂时失败不应把真实 usage 归零。
- **只从 transcript 统计 usage**：拒绝。assistant commit failure 已证明 transcript 与 Provider observation 存在窗口。
- **给 `finishInvocation` 增加 optional usage 字段**：拒绝。旧的严格 Store runtime 可能拒绝未知 operation key；开放式 append-only entry 保持 operation 形状兼容。
- **给结果增加新的 failure status**：拒绝。会扩大所有消费者的状态机，并把 execution failure 与 Store confirmation 混在一个枚举。
- **terminal commit 失败时等待到 Store 恢复**：暂缓。SessionStore 没有通用重试/幂等确认时限，可能使 `result()` 永久悬挂。
- **Capability close error 覆盖 durable result**：拒绝。它会让同一个 Invocation 在 handle 与 Snapshot 中拥有相反终态。

## Deliberate boundary

本 ADR 不定义：

- provider throw 如何携带 partial assistant 或 usage；
- abort 后迟到 Model result 的计费归属；
- partial retry transcript、message status 或 Tool delta 重组；
- Pi cache/cost/provider metadata；
- HTTP/SSE DTO、跨进程 EventHub、Job/Lease/Outbox、NeuroBook/Cosmos 修改。

未来 typed `ModelTurnError` 若要保留失败调用 usage，必须使用这里的 terminal usage/persistence 边界，但需要独立 ADR。

## Verification gate

- completed turn usage 在后续 Provider failure 后，result、terminal usage entry 和 canonical helper 一致；
- assistant transcript commit failure 后，terminal usage 仍可从 Snapshot 恢复；
- terminal commit failure 返回 `persistence: "unknown"`，Snapshot 保持 running 且无 terminal `agent_end`；
- Capability close failure不覆盖 durable completed/waiting/failed 结果或 unknown result 的原始 error，且其余 capability 仍执行 close；
- forced abort、approval resume 和严格旧 `finishInvocation` operation validator 通过 focused 回归；
- Memory/JSONL/旧记录兼容、focused tests、`bun run verify`、`bun run pack:smoke`；
- 独立审查确认没有把 `confirmed` 扩张为 fsync、网络文件系统或 exactly-once 保证。

## 2026-08-10 implementation and acceptance

- 初始 public tracer 为 4 pass / 0 fail / 18 expect calls，确认 durable turn usage 可以穿过后续 Provider failure，同时复现 transcript commit、terminal commit 和 Capability cleanup 三个分叉窗口。
- `InvocationResult.persistence` 已成为必填公共合同。completed、waiting、failed、aborted 只有在对应 Snapshot 可恢复时返回 `confirmed`；terminal 未确认时返回 `unknown`，且不发布伪造的 `agent_end`。
- 非零 usage 由原形状 `finishInvocation` 与一条 `harness.invocation.usage` entry 在同一 Store commit 中原子提交。全零 usage 保持旧的单 operation plan；旧 Snapshot 继续回退 active-path assistant transcript。
- `invocationUsage(snapshot, invocationId)` 已从包根导出。保留 usage kind 只能由 Harness 的精确 terminal plan 写入，公共 `write()`、Profile 和 Tool 不能伪造；forced-abort sealed fence 只接受原 terminal plan 或精确的 terminal + usage fact 组合。
- Provider usage 在进入 transcript 或 terminal fact 前必须为有限非负数；没有强制 `total === input + output`，也没有引入 cost、cache、quota 或 provider metadata。
- Capability 按逆序全部尝试关闭；一个 cleanup error 不再跳过其它资源，也不覆盖 durable completed/waiting/failed/aborted 或 terminal 未确认时的原始 run error。
- 第一次独立审查发现三个 P1：修改 `finishInvocation` shape 会破坏严格旧 Store、cleanup 可能掩盖原始 terminal failure、缺少 abort/resume CAS race。实现分别改为 append-only usage fact、保留原始 outcome，并增加两个 Harness 的确定性 race 回归。Post-fix 审查未发现 P0/P1；随后指出的 usage admission P2 已补为 finite/nonnegative 校验。
- Focused 五文件套件为 48 pass / 0 fail / 205 expect calls；`bun run verify` 为 146 pass / 0 fail / 738 expect calls，覆盖 34 个测试文件并通过 typecheck/build。
- `bun run pack:smoke` 最终 exit code 0；prepack 全仓门禁、tarball 安装、Bun consumer、Node ESM consumer 和新类型/导出检查均通过。`git diff --check` 通过。

因此本 ADR 在 standalone Core 的 Invocation result、terminal usage 和 Capability cleanup reconciliation 范围接受。真实 Provider、NeuroBook/Cosmos、HTTP/SSE、第三方 Store 产品实现、网络文件系统以及 exactly-once/fsync 仍未验收。
