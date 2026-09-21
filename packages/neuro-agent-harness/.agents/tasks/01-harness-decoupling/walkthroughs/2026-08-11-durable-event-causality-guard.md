# 第四十一轮：Durable Event Causality Guard

## 规划结论

第四十轮 gated write 证明：共享 Store/EventHub 的两个 Harness 可以按 Store version 之外的顺序发布 durable events。较早 commit 已落盘但暂停返回时，较晚 commit 会先发布：

```text
session_entry(version 2 fact)
session_status(version 2)
session_entry(version 1 fact)
session_status(version 1)
```

Event seq 完全连续，消费者不能把它识别为普通 cursor gap；而 `session_entry` 没有 commit version，盲目按 seq 应用会破坏 append-only parent/branch projection。

## 三路对照

### NeuroBook

NeuroBook 的 `SessionWriteExecutor` 持有 per-session write queue，repo append、`session_entry`、after-write observer 和 live-state publication 在同一执行器临界区内。产品还用 `withSessionMutation()` 线性化更宽的 admission/policy 边界。

### Cosmos

Cosmos 把 DomainEvent、consumer cursor、Outbox、lease 与 delivery 放在宿主 Workflow Runtime。Harness 不能复制这套 durable truth，也不应要求 Cosmos 现在迁移。

### Standalone

Store/EventHub 都可注入，Core 无法证明跨进程总序。可移植的最小修复是在进程内发现 Session version 不连续或倒退时 fail closed：整批 durable increment 不再发布，改发 `snapshot_required`。

## ADR / decision

详见 [ADR-0024](../../../adr/0024-durable-event-causality-guard.md)，现已在 standalone in-process Harness durable-publication scope 接受。

Canonical term 是 **Durable Event Causality Guard**：它不承诺重排所有 writer，只防止 Harness 把已识别的非因果 durable batch 当成正常连续增量交付。

## TDD seam

测试只通过：

- 两个公开 `NeuroAgentHarness`；
- shared public `MemorySessionStore` / `SessionEventHub`；
- `write()`、`subscribe()` 与公开 event envelope；
- Store Adapter return gate。

第一条 tracer 复用第四十轮 gated commit，在两个 write 都完成后发布 host sentinel 并 drain 公开 subscription。可接受结果只有：

1. durable entry/status batch 按 Store version 因果顺序交付；或
2. 在误导性旧 batch 交付前出现 `snapshot_required(commit_order)`。

当前实现预计两者都不满足。

## 边界

- 不修改 NeuroBook/Cosmos；
- 不引入 Job/Lease/Outbox/delivery/exactly-once；
- 不把 EventHub 变成 Store mutation lock；
- 不处理 SessionCommitObserver 派生 view 的 ordering；
- 三处既有 dirty 文件继续保护。

## 当前状态

ADR-0024 已接受；public red→green、forward-gap/replay/restart、四轮 review 修复、最终 full/package gate与第五次独立 acceptance review 均已完成。

## Red → green

两个 Harness 共享 Memory Store/EventHub。第一个 write 的 version 1 已落盘但 Store Adapter 暂停返回，第二个 write 以 version 2 成功并先发布。旧实现 drain 到 host sentinel：

```text
4 pass
1 fail
23 assertions

entryKinds:
  test.eventCausality.concurrent
  test.eventCausality.first
versions: 2, 1
snapshotReasons: []
```

Event seq 连续，但 durable causality 倒置。

初始实现：

- process-local WeakMap 按 shared EventHub + Session ID 保存最近 Harness-published version；
- commit 的 entries/status 在同一同步 helper 中整批发布；
- `version !== previous + 1` 时不发布该 batch，改发 `snapshot_required(commit_order)`；
- forward gap 推进 baseline，stale/duplicate 保留较新 baseline；
- 首个观察 version 建立 baseline，允许新 Hub 从已有 Session 接续。

第一条转绿后单文件为 5/0/21。

## 扩展矩阵

第二条 tracer 在正常 version 1 后直接向 Store 写 version 2，再由 Harness 写 version 3：

- version 3 entries/status 未发布；
- 无 live subscriber 时，后建 subscription 从 replay 收到唯一 `snapshot_required(commit_order)`；
- Snapshot 恢复包含 version 1、raw version 2 与 dropped-publication version 3 的全部 durable entries；
- guard baseline 已推进，version 4 恢复正常 entry/status；
- 新 EventHub/epoch 首次观察已有 Session 的 version 5，不误报 gap。

最终单文件：

```text
6 pass
0 fail
29 assertions
```

## 局部验证

```text
bun test tests/persistence-events.test.ts tests/events.test.ts \
  tests/commit-observer.test.ts tests/turn-failure-events.test.ts \
  tests/abort-boundary.test.ts tests/invocation-ownership.test.ts \
  tests/cosmos-consumer-compatibility.test.ts \
  tests/workflow-agent-invocation.test.ts tests/workflow-scheduler.test.ts

83 pass
0 fail
313 assertions

bun run typecheck
exit 0
```

## 当前边界

- guard 只观察 Harness private commit publication，不拦宿主直接 `EventHub.publish()`；
- 同一 EventHub 被不同 package copy 驱动、跨进程 EventHub 与第三方 durable bus 未验证；
- 同一 Hub/session 只能绑定同一个 Store Adapter 对象与同一 creation generation；即使两个 Adapter 指向同一后端也必须共享对象，换 Store或复用 ID 必须换 Hub/epoch；
- `SessionCommitObserver` 在 event 前执行的现有合同不变，其派生 view ordering 不由本 guard修复；
- 第一个抵达的 batch 无前序基线，只有更早 version 随后抵达时才能检测倒置；
- signal 后是否在 HTTP/前端 single-flight recovery 属于 Transport/宿主验收。

## 首次独立审查 findings

首次独立 reviewer 复跑 persistence-events 6/0/29 后发现：

- **P1：不同 Store identity**。Store A version 1 + Store B version 2 在同一 Hub/session 中会被误认连续；
- **P1：Session generation**。同一 Store wrapper 重建同名 Session 后，version 恰好连续时会混入旧 stream；
- **P2：guard lifecycle**。Harness module WeakMap 的 per-Hub map 不随 Hub close 清理，并强引用 Store。

修复按 public red 逐项完成：

```text
different Store identity red
6 pass / 1 fail / 35 assertions

after Store identity guard
7 pass / 0 fail / 34 assertions

reused Session generation red
7 pass / 1 fail / 40 assertions

after createdAt generation guard
8 pass / 0 fail / 39 assertions
```

随后把 guard 移入未从 package root 导出的 `event-publication.ts`：

- Store 对象只作为 WeakMap key，baseline 保存 identity token；
- Hub close 显式删除整个 per-session baseline map；
- active Hub 的 baseline 与 Hub 自身 seq/replay 一样按 Session 数量增长，关闭时统一释放。

Post-fix events + persistence 为 29/0/109，typecheck 通过。

## 第二次独立审查 findings

修复后 reviewer 继续发现两个 P1：

- **P1：`createdAt` generation 会碰撞**。Memory/第三方 Store 可使用固定 clock，同一毫秒重建也很常见；两代 `createdAt = 1` 且 version 1 → 2 时仍会混流。
- **P1：逐条 publish 不是 atomic batch**。第二条 event 序列化失败时，第一条 entry 已获得 seq/replay；随后 status、baseline 和 recovery signal 都缺失。

正式 red：

```text
7 pass
2 fail
42 assertions

same-createdAt generation:
entryKinds = [first, replacement]
versions = [1, 2]
snapshotReasons = []

partial publication:
first durable entry 已作为 seq 1 交付
预期 snapshot_required(commit_order)
```

## 第二次修复

- Store WeakMap state 当时为每个 Session 保存 opaque generation token 与 monotonic revision，不再把时间戳当唯一身份。
- `createSession()` 在 Store create 前捕获 revision，成功后轮换 generation；若首个 commit 已在 create return gate 内建立 token，则复用该 token。第三次审查随后证明这一判断仍有旧 commit return 歧义。
- commit 在 await Store 前捕获 Store/generation token，避免较旧 commit 延迟返回时被后来 create 的 token 冒充。
- EventHub 的 internal symbol-keyed batch 先 detach/序列化所有 drafts；只有整批可用时才一次性安装 seq/replay，随后通知 live subscribers。
- staging 失败时 baseline 推进到已落盘 version，只发布可 replay 的 `snapshot_required(commit_order)` 并向调用方重抛原错；Snapshot 后的下一连续 version 可恢复正常增量。
- Hub baseline 只保存 identity token，不保存 Store；Hub close 继续删除全部 guard state。

新增两条 regression 后：

```text
bun test tests/persistence-events.test.ts
9 pass
0 fail
46 assertions

focused events/observer/terminal/Cosmos/Workflow
86 pass
0 fail
332 assertions

bun run typecheck
exit 0
```

当时尚未完成：重新执行 `bun run verify`、`bun run pack:smoke`、`git diff --check` 与第三次独立 post-fix review。

## 第三次独立审查 finding

第三次 reviewer 发现 1 个 P1：旧 generation commit 可以在 Store 成功后暂停返回，新 Session 随后完成底层 create；旧 commit 若在 create handshake 完成前恢复，仍会发布旧 entry/status，而新 Snapshot 已经不含该事实。

正式 filtered red：

```text
0 pass
1 fail
6 assertions

entryKinds = [test.generationFence.oldDelayed]
versions = [2]
snapshotReasons = []
```

## 第三次修复

- create begin 现在立即注册 pending generation token；commit 在 Store await 前捕获 token，在 publication 时再次检查当前 pending/generation。
- 任意相关 create pending 时，commit publication 不发布 entry/status，只发 `snapshot_required(commit_order)`；因此旧 delayed commit 不能穿过 recreation fence。
- create 成功将 pending token 绑定为新 generation；create 失败只移除 fence，不改写原 generation。
- 新 public tracer 证明 recreation 超越旧 commit return 时只交付 recovery signal，新 Session Snapshot 为 version 0 且不含旧 entry。
- 另一个 tracer 证明失败 duplicate create pending 期间的 durable write可由 Snapshot 找回，fence 撤销后 version 2 正常恢复 entry/status。

当前证据：

```text
bun test tests/persistence-events.test.ts
11 pass
0 fail
57 assertions

focused events/observer/terminal/Cosmos/Workflow
88 pass
0 fail
343 assertions

bun run typecheck
exit 0

bun run verify
233 pass
0 fail
1102 assertions

bun run pack:smoke
exit 0
105 files
107.6 kB package
518.8 kB unpacked

git diff --check
no whitespace errors (CRLF warnings only)
```

当时尚未完成：第四次独立 post-fix review。

## 第四次独立审查 finding

第四次 reviewer 发现 1 个 P1：recreation pending 已注册新 token、但底层 Store 尚未替换旧 Session 时，commit 会捕获 pending token却把事实写入旧 Session。若 create 先成功、commit 后返回，pending token 已成为 current generation；在没有旧 publication baseline 时，旧事实会被当作新 generation 的首个 batch。

正式 filtered red：

```text
0 pass
1 fail
6 assertions

entryKinds = [test.pendingGenerationFence.old]
versions = [1]
snapshotReasons = []
```

## 第四次修复

- `DurablePublicationAttempt` 新增不可变的 `capturedDuringCreation` 事实。
- commit capture 时只要存在 matching explicit create 或 unknown-ID create，即永久标记 recovery-only；create 后来成功不能追认这次 commit。
- publication 时先检查该事实，再检查当前 pending set 与 generation token；因此 fence 与 commit 的所有“capture 前/中/后、return 前/后”组合都 fail closed。
- 新 tracer 在 pending 期间让 commit 写入旧 delegate，随后完成 replacement create，最后释放旧 commit return；结果只有 `snapshot_required(commit_order)`。

当前证据：

```text
bun test tests/persistence-events.test.ts
12 pass
0 fail
62 assertions

focused events/observer/terminal/Cosmos/Workflow
89 pass
0 fail
348 assertions

bun run typecheck
exit 0

bun run verify
234 pass
0 fail
1107 assertions

bun run pack:smoke
exit 0
105 files
107.8 kB package
519.5 kB unpacked

git diff --check
no whitespace errors (CRLF warnings only)
```

## 第五次独立 acceptance review

第五次 reviewer 按完整时间线矩阵复核：

- commit capture 在相关 create 前、pending 期间和完成后；
- publication 在 create pending、success 后与 failure 后；
- explicit/unknown ID、并发 create、无 baseline/有 baseline；
- Store/generation WeakMap 生命周期、atomic batch、Hub close/reentrancy、声明与 package exports；
- 文档和 12 条 persistence-event regression 的证据对应。

最终返回：

```text
No P0/P1/P2 findings.
```

ADR-0024 因此在 standalone in-process Harness durable-publication scope 接受。跨进程 EventHub、HTTP/SSE 产品恢复、observer 派生 view ordering、真实 NeuroBook/Cosmos 接入与 exactly-once 仍不在本轮验收范围。
