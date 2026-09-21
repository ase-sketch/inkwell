# 第四十轮：Snapshot Replay Cut

## 规划结论

本轮优先验证 `HarnessSnapshot` 的 Session/Event Cursor 组合是否会在并发 commit 下形成恢复缺口。当前 `snapshot()` 是：

```text
Store read
→ Event cursor
```

若 commit 在两步之间完成并发布，返回值可能是旧 Session + 新 cursor，消费者从该 cursor 继续会同时错过 Snapshot 与 replay 中的 durable event。

NeuroBook 当前 Task 106 与 `session-query.test.ts` 已确认相同边界，采用：

```text
replay-safe cursor
→ Session read/projection
```

读取期间的 event 允许与 Snapshot 重叠，消费者按稳定 Entry ID 去重。该行为是 provider-neutral recovery contract，可吸收到独立 Harness；NeuroBook 的 History page、HTTP DTO、前端 store 和产品 Session projection 不移植。

## ADR / decision

详见 [ADR-0023](../../../adr/0023-snapshot-replay-cut.md)，当前为 `Proposed`。

本轮 canonical term 是 **Snapshot Replay Cut**：cursor 是 Snapshot 恢复的可重放下界，不承诺 Store/Event 原子 exactly-once cut。重复比无告警缺口安全。

## TDD seam

只通过以下公开边界观察：

- `harness.snapshot(sessionId)`；
- `harness.write(plan)`；
- `harness.subscribe(sessionId, cursor)`；
- 注入的公开 `SessionStore` / `SessionEventHub` Adapter seam。

测试不会读取 Harness 或 Event Hub 私有字段。第一条 tracer 在 Store `read()` 已捕获旧 Snapshot 后暂停，并发通过 `harness.write()` 持久化和发布；恢复订阅必须仍先看到这次 durable `session_entry`。

## Vertical slices

1. `snapshot()` 的 read/cursor 交错 red → green；
2. 审计 `write()` 在自身 commit 与并发 commit 间的返回 cut；
3. 审计 `createSession()` 在 Store 分配 ID 后才能读取 cursor 的窗口；
4. 扩大 Event/Snapshot/consumer focused，记录 overlap 消费规则；
5. full/package/review 后才接受 ADR。

## 边界

- Core 不引入跨进程 EventHub、Outbox、Job/Lease/delivery 或 exactly-once；
- 不修改 NeuroBook/Cosmos；
- HTTP/SSE Transport 与前端 dedupe 仍由宿主负责；
- 三处既有 dirty 文件继续保护，不纳入本轮 checkpoint。

## 当前状态

ADR-0023 已在 standalone `HarnessSnapshot` recovery-cut 范围接受；三类 public red→green、focused/full/package 与独立审查均完成。

## Red → green

### `snapshot()`

Gated Store 在 `read()` 已复制旧 Snapshot 后暂停；并发 `write()` 持久化并发布 `test.snapshot.during`，随后再发布 sentinel。旧实现返回晚 cursor，订阅首帧直接是 seq 3 的 sentinel：

```text
1 pass
1 fail
7 assertions

expected entry.kind: test.snapshot.during
received entry.kind: test.snapshot.after
```

改为 cursor → Store read 后单文件为 2/0/7。

### `write()`

第一个 Harness 的 commit 已写入 Store但尚未返回，第二个 Harness 先提交并发布更新 version；旧 write 返回较旧 Session 与已经越过较新 events 的 cursor：

```text
2 pass
1 fail
10 assertions

mergedKinds.has("test.write.concurrent")
expected true
received false
```

`write()` 改为 commit 前捕获 replay cut；自己的 events 允许与返回 Session overlap。单文件为 3/0/14。

### `createSession()`

Store 已建立显式 ID Session 后暂停返回，窗口内 `write()` 成功。旧 create 返回 bare Session + 晚 cursor：

```text
3 pass
1 fail
17 assertions

mergedKinds.has("test.create.during")
expected true
received false
```

create 成功后复用 `snapshot()`，不把 ID allocation 从 Store 上移。三条最终为：

```text
4 pass
0 fail
17 assertions
```

## 局部验证

```text
bun test tests/persistence-events.test.ts tests/events.test.ts tests/harness.test.ts \
  tests/cosmos-consumer-compatibility.test.ts tests/workflow-agent-invocation.test.ts \
  tests/workflow-extension.test.ts tests/workflow-result-writeback.test.ts tests/recovery.test.ts

55 pass
0 fail
254 assertions

bun run typecheck
exit 0
```

`git diff --check` exit 0，仅有工作区 LF → CRLF warnings。

## 执行中发现的后续候选

共享 Event Hub 的两个 Harness 可以在 Store commit 顺序之外发布 events：较新 version 的 status/entry 可能先于较旧 version。Snapshot Replay Cut 保证返回值不静默丢 event，但不自动把跨 Harness publication 重新排序。

- 本 ADR 的 overlap consumer 必须按 Entry ID 合并，并按 Session version 单调应用 status；
- 是否需要 EventHub-level commit batch/order seam 留给下一轮 public tracer；
- 跨进程 EventHub、Outbox 与 exactly-once 仍明确不属于该候选。

## Full / package

```text
bun run verify

226 pass
0 fail
1062 assertions
39 test files
```

typecheck 与 build 同时通过。

```text
bun run pack:smoke

exit 0
prepack: 226 pass / 0 fail / 1062 assertions
tarball: 101 files / 103.1 kB package / 498.2 kB unpacked
```

Bun 与 Node ESM tarball consumer 均通过。

## 独立审查

独立 read-only reviewer 只检查本轮 9 个变更文件，明确排除 `docs/architecture.md`、`docs/pi-adapter-design.md` 和 `tests/context.test.ts`。审查覆盖：

- 三种 producer 的并发 Store/Event cut；
- replay overlap、expiry / `snapshot_required`、epoch 与 injected/shared Hub；
- create 后额外 read 和自定义 Store 兼容边界；
- 测试是否会错误放过丢 event；
- 文档是否超出进程内恢复保证。

结论：

```text
No P0/P1/P2 findings.
```

reviewer 尝试复跑单文件时因 read-only sandbox 的 Bun `EPERM` 失败；这是 reviewer 环境限制，不替代主流程 4/0/17、226/0/1062 与 package smoke。

## 接受边界

ADR-0023 接受：

- cursor 不晚于返回的 durable Session projection；
- `snapshot()` / `write()` / `createSession()` 的返回窗口不静默丢 durable event；
- Snapshot + replay 允许 at-least-once overlap；
- consumer 按 Entry ID 合并 entry，按 version 单调应用 status。

仍未验证：

- 共享 Event Hub 的跨 Harness durable publication 顺序；
- 跨进程 EventHub、HTTP/SSE Transport、真实 reconnect；
- 真实 Provider/Tool、NeuroBook/Cosmos 产品接入、浏览器与生产；
- 第三方 Store/EventHub 的分布式线性一致性。
