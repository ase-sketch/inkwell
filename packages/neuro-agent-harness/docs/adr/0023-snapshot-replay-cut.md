# ADR-0023: Snapshot Replay Cut

- Status: Accepted (standalone HarnessSnapshot recovery-cut scope)
- Date: 2026-08-11
- Task: [`01-harness-decoupling`](../tasks/01-harness-decoupling/README.md)

## Context

`HarnessSnapshot` 同时返回 durable Session Snapshot 与进程内 Event Cursor。当前 `snapshot()` 先 `store.read()`，再读取 `SessionEventHub.cursor()`；如果另一个 commit 在两者之间持久化并发布，调用方会得到旧 Session 与已经越过该 commit events 的新 cursor。消费者从该 cursor 订阅时无法从 Snapshot 或 replay 看到这次变更。

Store 与 Event Hub 是两个可注入 Adapter，Core 无法用单一事务对它们做原子读取。必须在以下取舍中明确恢复合同：

- cursor 晚于 Snapshot，可能无重复，但会永久跳过并发 event；
- cursor 不晚于 Snapshot，可能 replay 已被 Snapshot 覆盖的 event，但不会因读取窗口形成缺口。

NeuroBook 当前 recovery 已选择第二种语义：先捕获 replay-safe cursor，再读 Session；读取期间 append/publish 的 entry 允许与 Snapshot 重叠，由稳定 entry ID 去重。独立 Harness 应吸收这一 provider-neutral correctness contract，不移植其 HTTP DTO、History projection 或前端状态。

## Decision

把 **Snapshot Replay Cut** 定义为 `HarnessSnapshot.cursor` 所表示的恢复下界：

- Core 在读取返回的 durable Session projection 之前捕获 cursor；
- cursor 捕获之后发布的 event 必须仍可 replay，或由既有 `snapshot_required` 合同要求重新读取；
- 返回的 Session 可以已经包含 cursor 之后的 durable event，因此 Snapshot + replay 是 at-least-once overlap，不是 exactly-once cut；
- 消费者按 Event Cursor 去重同一 event，并按稳定 Entry ID 合并 Snapshot 与 `session_entry` replay；`session_status` 只按单调递增的 version 应用；
- `snapshot()`、`createSession()` 与 `write()` 都返回 `HarnessSnapshot`，最终必须遵守同一不跳过合同，不能只修其中一个入口；
- injected Event Hub 仍是进程内观察源；跨进程 EventHub、Outbox 和 Store/Event 原子事务不在本决定范围。

第一条 vertical slice 只通过公开 `snapshot()` / `write()` / `subscribe()` 与可控 Store Adapter 复现旧 Snapshot + 新 cursor。正式 red 后再逐个审计另外两个 `HarnessSnapshot` producer，避免先按实现猜测测试。

## Implementation evidence

三个 public tracer 分别控制 Store `read()`、`commit()` 与 `create()` 的返回窗口，并在窗口内通过另一个公开 `write()` 持久化和发布：

- `snapshot()` 初始 red 为 1 pass / 1 fail / 7 assertions；返回 Session 没有 `test.snapshot.during`，从返回 cursor 订阅后的首个 `session_entry` 已是 seq 3 的 `test.snapshot.after`；
- `write()` 初始 red 为 2 pass / 1 fail / 10 assertions；较新的并发 commit 已持久化和发布，但较旧 write 返回值的 Session 与 replay 合并后仍没有 `test.write.concurrent`；
- `createSession()` 初始 red 为 3 pass / 1 fail / 17 assertions；Store 已创建 Session、Harness 尚未返回时写入的 `test.create.during` 同时逃出返回 Session 与 replay。

实现保持三个窄边界：

- `snapshot()` 先捕获 cursor，再 `store.read()`；
- `write()` 在 commit 前捕获 cursor，因此自己的 commit events 也允许 replay overlap；
- `createSession()` 仍由 Store 负责 ID allocation/create，成功后复用 `snapshot()` 获取最新 durable truth 与 replay cut，不改变 ADR-0020 的 Store creation 职责。

三条 green 后：

```text
bun test tests/persistence-events.test.ts
4 pass
0 fail
17 assertions

focused event/Harness/Cosmos/Workflow/recovery
55 pass
0 fail
254 assertions

bun run typecheck
exit 0
```

共享 Event Hub 的不同 Harness 仍可能按不同于 Store version 的顺序发布已成功 commit 的 events。Snapshot Replay Cut 只保证不因返回值窗口形成静默缺口；消费者必须按稳定 Entry ID 合并 entry，并按 version 单调应用 status。跨 Harness durable publication ordering 需要单独证据与决定，不由本 ADR 宣称完成。

最终门禁：

```text
bun run verify
226 pass
0 fail
1062 assertions

bun run pack:smoke
exit 0
101 files
103.1 kB package / 498.2 kB unpacked
```

Package smoke 的 prepack 同为 226/0/1062，tarball 安装后的 Bun 与 Node ESM consumer 通过。独立只读 review 检查三类 producer、replay overlap/expiry、injected/shared Hub、post-create read、自定义 Store 边界、测试敏感性和文档声明，返回 `No P0/P1/P2 findings.`；reviewer 的 read-only sandbox 因 Bun `EPERM` 未能复跑测试，不替代主流程门禁。

本决定在 standalone `HarnessSnapshot` recovery-cut 范围接受。它冻结“cursor 不晚于返回 Session projection、允许 overlap、不允许返回窗口静默缺口”的合同；不接受跨 Harness publication ordering、跨进程 EventHub 或 HTTP/SSE 产品行为。

## Alternatives

- **保持 read → cursor**：拒绝候选。它可以在无告警的情况下永久跳过 durable event。
- **反复读取 cursor，直到两次相等**：暂不采用。持续 publish 可能导致饥饿，而且“稳定片刻”仍不是 Store/Event 原子事务。
- **给 Store 与 Event Hub 加共享锁/事务**：拒绝。两者是独立可注入 Adapter，跨进程事件还需要宿主 Outbox 或 durable bus。
- **返回已经建立的 subscription 而不是 cursor**：暂缓。可以缩小窗口，但会扩大公共 API、生命周期和 Transport ownership，本缺口不要求它。

## Verification gate

- 公开 Memory Store tracer 稳定复现旧实现跳过 event，并在修复后 replay 该 event；
- `HarnessSnapshot` 的全部 producer 分别有并发交错证据或明确不受影响的证明；
- replay overlap、epoch/replay expiry、Hub ownership 和 subscription lifecycle 既有测试保持通过；
- focused、`bun run verify`、适用的 `bun run pack:smoke`、`git diff --check` 与独立审查完成；
- 文档明确“允许重复、不允许静默缺口”，不误报 exactly-once 或跨进程 SSE。

## Out of scope

- HTTP/SSE framing、heartbeat、鉴权、socket backpressure 和浏览器 reconnect；
- 跨进程 EventHub、durable DomainEvent、Outbox 或 delivery/exactly-once；
- NeuroBook/Cosmos 修改；
- 任意第三方 Store 与 Event Hub 组合的分布式线性一致性。
