# ADR-0024: Durable Event Causality Guard

- Status: Accepted (standalone in-process Harness durable-publication scope)
- Date: 2026-08-11
- Task: [`01-harness-decoupling`](../tasks/01-harness-decoupling/README.md)

## Context

Harness 在 Store commit 成功并执行 commit observers 后，逐条发布 `session_entry`，最后发布带 Session version 的 `session_status`。两个 Harness 共享同一 Store 与 `SessionEventHub` 时，较早 commit 可以已经落盘但延迟返回；较晚 commit 先返回并发布后，EventHub 会得到：

```text
version 2 entries/status
→ version 1 entries/status
```

Event seq 仍连续，因此普通 gap detection 无法识别因果倒置。`session_entry` 本身没有 commit version；消费者既不能安全忽略随后到达的旧 batch，也不能知道 version 2 entry 是否依赖尚未发布的 version 1 parent。

NeuroBook 用 per-session `SessionWriteExecutor` queue 把写入与发布放在同一临界区。独立 Harness 的 Store 与 Event Hub 都可注入，Core 不能假设跨进程共享锁或把 Cosmos 的 DomainEvent/Outbox 下沉进来，但进程内 EventHub 不能把已检测到的 durable causality violation 伪装成正常连续 stream。

## Decision

增加 **Durable Event Causality Guard**：

- Harness 将一次成功 commit 的全部 `session_entry` 与最终 `session_status(version)` 视为不可拆分的 durable publication batch；EventHub 在推进任何 seq/replay 前先 stage 整批序列化；
- 每个 `SessionEventHub + sessionId` 绑定一个 Store Adapter 对象、一个 Store-local opaque generation token、一个 `metadata.createdAt` fingerprint，并跟踪最近一次由 Harness 正常发布的 Session version；
- Harness-mediated create 在调用 Store 前建立 pending generation fence；匹配 Session 在 pending 期间捕获的 commit 永久标记为 recovery-only，不因 create 后来成功而获得新 generation 身份。create 成功后绑定新的 opaque generation，失败则移除 fence而不改变原 generation；
- 第一个观察到的 batch 建立本进程基线；后续只有 `version === previous + 1` 才发布完整 batch；
- Store identity 或 generation 变化、version 倒退、重复或向前跳跃时，不发布该 batch 的任何 entry/status，改为发布一次 `snapshot_required(reason: "commit_order")`；
- forward gap 后把 guard 基线推进到已落盘 version，stale/duplicate 则保留较新基线，使后续 commit 可继续提供增量；消费者收到 signal 后以 Snapshot Replay Cut 恢复；
- identity/generation mismatch 不切换基线；更换 Store Adapter 对象或重用 Session ID 必须建立新的 Event Hub / epoch。指向同一后端的多个 Store Adapter 实例也不能为同一 Hub/session 轮流发布；
- batch staging 失败时不发布任何 entry/status，先把 baseline 推进到已落盘 version，再发布可 replay 的 `snapshot_required(commit_order)`，同时保留原 publication error 给调用方；Snapshot 恢复后的下一连续 version 可继续增量；
- runtime event、host event 与直接调用 `SessionEventHub.publish()` 的宿主 event 不参与 durable version guard；
- guard 只覆盖同一 package runtime 内 Harness 通过同一 EventHub 发布的 commit batch，不声称跨进程排序、durable delivery 或 exactly-once。

该方案选择 fail-closed recovery，而不是给可注入 Store 强加一把 EventHub mutation lock。第一个到达的 out-of-order batch 在更早 version 抵达前无法被识别；一旦发现倒置，`snapshot_required` 明确终止增量可信度。

## Implementation evidence

正式 public red 使用两个 Harness、shared Memory Store/EventHub 与 Store return gate。version 1 已落盘但暂停返回，version 2 先发布；drain 到 host sentinel 得到：

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

实现未增加公共 coordinator 或 Store lock：

- internal `event-publication.ts` 用 process-local `WeakMap<EventHub, Map<SessionId, baseline>>` 让共享同一 Hub 的 Harness 共用 guard；
- baseline 保存弱 Store identity token、opaque generation token、Session `createdAt` 与 version，不强引用 Store；`SessionEventHub.close()` 删除整个 Hub guard state；
- Store-local generation 使用 WeakMap key、opaque token 与 pending-creation set；commit 在 await Store 前捕获 token，并在 publication 时重新核对当前 pending/generation，较旧 commit 即使被 recreation 超越也不能发布旧事实；
- private symbol-keyed EventHub batch 先 detach/序列化全部 drafts，再一次性安装 seq/replay，最后通知 subscribers；它不从 package root 导出；
- stale/duplicate batch 保留较新 baseline；forward gap 发 signal 后把 baseline 推进到已落盘 version；
- `HarnessSessionEvent.snapshot_required.reason` 增加 `commit_order`；
- 第一个观察到的 version（包括新 Hub 上的非 1 version）建立 baseline，不把重启误判为 gap。

初始 inversion 转绿后，第二条 public tracer 覆盖：

- 正常 version 1 publication；
- raw Store version 2（模拟没有向该 Hub 发布的 writer）；
- Harness version 3 forward gap 整批降级；
- live subscriber 不存在时，后建 subscription 仍从 replay 收到唯一 `snapshot_required(commit_order)`；
- Snapshot 恢复包含 versions 1–3 全部 entries；
- version 4 恢复连续增量；
- 新 EventHub/epoch 首次观察 version 5 正常交付 entry/status。

首次修复后的证据：

```text
bun test tests/persistence-events.test.ts
6 pass
0 fail
29 assertions

focused events/observer/terminal/Cosmos/Workflow
83 pass
0 fail
313 assertions

bun run typecheck
exit 0
```

### Independent review findings and fixes

首次独立 review 返回 2 个 P1 与 1 个 P2：

1. **P1，不同 Store 同名 Session**：只按 Hub/session/version 时，Store A version 1 与 Store B version 2 会被静默拼成连续流。正式 red 为 6/1/35；baseline 加 Store identity 后为 7/0/34。
2. **P1，同一 Store 对象重用 Session ID**：新 generation 若恰好发布旧 baseline + 1，会被误认为旧流连续。switchable Store red 为 7/1/40；baseline 加 `metadata.createdAt` 后为 8/0/39。
3. **P2，guard lifecycle**：Harness module WeakMap 的 per-Hub map 没有随 Hub close 清理，并强引用 Store。guard 已移入 internal module，Store 使用弱 identity token，Hub close 显式删除 guard state。

identity/generation mismatch 都保持原 baseline并持续 fail closed，直到宿主换用新 Hub/epoch；这避免两个持久化世界在一个 replay/seq namespace 中来回接管。

第二次独立 review 又发现 2 个 P1：

1. **P1，`createdAt` 碰撞**：毫秒时间戳或固定 clock 不是唯一 generation；旧 generation version 1 与同 timestamp 的新 generation version 2 仍可混流。把既有 switchable Store 的两代 timestamp 都设为 `1` 后稳定复现。Store-local opaque generation + create handshake 后转绿。
2. **P1，partial publication failure**：逐条 `events.publish()` 时，第二条不可序列化 event 会在第一条 entry 已发布后抛错；baseline/status/signal 均缺失。hostile Store result tracer 稳定复现。EventHub atomic staging 后，失败 batch 只发布一个 recovery signal，Snapshot 包含已落盘事实，下一 version 恢复增量。

两条 regression 同时加入旧实现时的正式 red 为 `7 pass / 2 fail / 42 assertions`。

第二次修复后的证据：

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

第三次独立 post-fix review 继续发现 1 个 P1：

1. **P1，recreation 超越旧 commit return**：旧 generation commit 在 Store 成功后暂停返回，新 Session 随后完成 Store create；若旧 commit 在 create handshake 完成前恢复，它仍可按旧 token/version 发布，但新 Snapshot 不含该事实。精确 filtered red 为 `0 pass / 1 fail / 6 assertions`，实际输出为旧 entry + status version 2、无 recovery signal。

修复把 generation handshake 改为 pending fence：

- explicit Session ID 的 create 开始即注册新 token；unknown ID create pending 时保守 fence 同 Store publication；
- publication 时不仅检查 captured token，还重新检查当前 pending/generation；pending 期间不发布 entry/status；
- create 成功后将 pending token 绑定为新 generation；失败时仅删除 pending token；
- 新 regression 证明旧 delayed commit 只产生 `snapshot_required(commit_order)`；补充失败 duplicate create tracer，证明 fence 撤销后原 Session 可 Snapshot 恢复并继续下一 version。

第三次修复后的当前证据：

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

第四次独立 post-fix review 继续发现 1 个 P1：

1. **P1，pending-captured commit 冒充新 generation**：recreation 已注册 pending token但 Store 尚未替换旧 Session 时，commit 会捕获 pending token却写入旧 Session；若它在 create 成功后返回，pending token 已成为 current generation且没有旧 baseline 时，旧 entry/status 会进入新流。精确 filtered red 为 `0 pass / 1 fail / 6 assertions`，实际输出为旧 entry + status version 1、无 recovery signal。

修复让 publication attempt 持久记录 `capturedDuringCreation`：

- commit capture 与 publication 两端都检查 creation fence；
- 只要 capture 时存在 matching explicit create 或 unknown-ID create，该 attempt 永远 recovery-only；
- create 成功只影响完成之后新捕获的 commit，不能追认 pending 期间捕获的旧事实；
- 新 tracer 先让 pending commit 写入旧 delegate，再完成 replacement create，最后释放 commit return；公开流只收到 `snapshot_required(commit_order)`。

第四次修复后的当前证据：

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

第五次独立 reviewer 按 commit capture 在 create 前/中/后、publication 在 success/failure 前/后、unknown ID、并发 create、baseline、atomic batch、Hub lifecycle 与 package boundary 重审，返回：

```text
No P0/P1/P2 findings.
```

因此本 ADR 在 **standalone in-process Harness durable-publication scope** 接受。它不把进程内 guard 扩张为跨进程排序、durable delivery、exactly-once 或宿主 mutation lock。


## 2026-08-14 审计整改补充：staged batch 的重入边界

ADR-0024 的 staged-before-dispatch 边界现由 EventHub 的 FIFO pending dispatch 完整落实：当前 durable batch 的 seq/replay 安装和所有 subscriber 通知完成前，observer/AbortSignal 同步重入产生的 publish 不会开始通知。该实现只收口同一进程内的交付顺序，不扩展 durable version guard 为跨进程排序或 delivery/exactly-once。
## Alternatives

- **按 EventHub seq 接受 publication order**：拒绝。seq 连续会掩盖 Store version 倒退，消费者可能形成永久错误 projection。
- **给所有 Harness commit 加共享 per-session mutex**：暂不采用。它把 Store mutation liveness 绑定到 EventHub，并可能让不合作或重入 commit observer 阻塞其它 durable writes。
- **给 `session_entry` 增加 version 后让消费者自行排序**：拒绝当前形态。entry parent/branch 与多 entry batch 仍需原子边界，单字段不能恢复缺失 batch。
- **缓冲 batch 等待缺失 version**：暂缓。EventHub 无法区分“同进程 pending”与“外部 Store writer 没有向该 Hub 发布”，无界等待会破坏进程内 SSE liveness。
- **允许同一 Hub/session 在多个 Store Adapter 实例间切换**：拒绝。Core 没有稳定 backend identity；即使实例指向同一文件/数据库，也必须共享一个 Adapter 对象或换 Hub/epoch。
- **允许同一 Hub 内重用 Session ID**：拒绝。Event seq/replay 本身也只按 sessionId 分区，没有 generation；重建同名 Session 必须开始新 epoch。
- **只用 `metadata.createdAt` 区分 generation**：拒绝。时间戳允许碰撞；opaque process-local token 承载 Harness-observed creation identity，`createdAt` 只保留为额外 fingerprint。
- **逐条预检后仍逐条发布**：拒绝。即使普通 JSON draft 预检通过，subscriber lifecycle 的同步重入也可能发生在通知阶段；EventHub 必须先安装完整 batch replay，再通知 live subscriber。
- **搬入 Cosmos DomainEvent/Outbox**：拒绝。其 durable truth、consumer cursor 和 delivery 继续属于宿主。

## Verification gate

- 两个 Harness + shared Memory Store/EventHub 的公开 tracer 稳定复现 version 2 → version 1；
- 发现倒置时不交付旧 batch，且 live/replay consumer 都收到一次 `snapshot_required(commit_order)`；
- Store forward gap、duplicate/stale publication、first observed nonzero version 与后续 contiguous version 行为明确；
- 不同 Store 的同名 Session、同一 Store 对象重用 Session ID 都 fail closed；Hub close 释放 guard state且不强引用 Store；
- 同 timestamp 的 Harness-mediated Session recreation 仍 fail closed；create-return overlap 不误报新 generation；
- recreation 超越旧 commit return 时不发布旧事实；失败 create 撤销 fence且不永久污染原 generation；
- creation pending 期间捕获、但在成功后返回的 commit 仍不得冒充新 generation；
- 不可序列化的第二条 event 不留下已发布前缀，replay recovery signal 与后续连续增量可验证；
- 单 Harness正常 commit、runtime events、commit observer、Snapshot Replay Cut 与 EventHub lifecycle 保持；
- focused、`bun run verify`、`bun run pack:smoke`、`git diff --check` 与独立审查完成。

## Out of scope

- 跨进程 EventHub、durable bus、Outbox、delivery/exactly-once；
- HTTP/SSE DTO、前端 single-flight recovery 和浏览器 reconnect；
- Store commit 的全局线性化或第三方 Store correctness；
- 绕过 Harness 直接删除/重建同名 Session 的 generation discovery；
- SessionCommitObserver 派生数据本身的跨 Harness ordering；
- NeuroBook/Cosmos 修改。
