# 第三十六轮：Bounded Event Subscription lifecycle

## 结论

ADR-0019 已在 standalone Core 范围接受。实现、P1 red→green、focused/full/package gate 与 post-fix 独立审查均已完成。

## 规划结论

下一切片修复 `SessionEventHub` 自己持有的 subscriber/replay 资源与关闭语义，不实现 HTTP/SSE Transport。

NeuroBook 最新的 relation recovery 与 durable Job history 继续属于产品层；Cosmos 仍持有 Workflow/Run/Step/Job、Lease、Outbox、DomainEvent 和公共 HTTP/SSE。当前可由 standalone public seam 证明的缺口是：

- 慢 subscriber 的 live queue 无界；
- Async Iterator 提前退出不注销 subscriber；
- replay 没有 serialized-byte hard limit；
- publish 后调用方可修改嵌套 event，从而改变 replay 内容。

## 决策边界

详见 [ADR-0019](../../../adr/0019-bounded-event-subscription-lifecycle.md)。

- Core 负责自己持有的 replay/live references、关闭信号和资源 hard limit；
- pending replay 与 live queue 分离；
- overflow fail closed 单个 subscription，不反向阻塞 publish；
- Transport 继续负责 SSE framing、socket backpressure、heartbeat、鉴权、query validation 和 reconnect；
- 不下沉 Job/Lease/Outbox、产品 DTO、跨进程 EventHub 或 durable domain event。

## TDD seam

只通过 `SessionEventHub.publish()`、`subscribe()`、`close()`、`metrics()` 与公开 `EventSubscription` 观察；测试不读取私有 Map、queue 或 resolver。

第一条 tracer 最初把 explicit close 定义为“立即 discard queued events”，单文件曾得到 2/0/7；扩大 focused 后，abort/ownership/turn-failure 的 12 个终态审计回归全部变为空事件。源码与既有测试确认 `close()` 的兼容合同是停止新事件后 graceful drain。

最终关闭语义：

- explicit `close()`：注销 subscriber、停止新 live event、保留已排队事件供 drain；
- `return()` / `throw()` / overflow / Hub close：消费者不再 drain，立即释放 pending replay/live references。

## 验证

### Red → green

主要 tracer：

```text
initial close tracer
1 pass / 1 fail / 7 assertions

Expected done
Received queued session_status
```

随后逐个 vertical slice 固定 iterator return、immutable publish、recursive freeze、live count/bytes、replay bytes、metrics、Hub close、Harness ownership 与公开 subscription iterator。

最终 EventHub 单文件：

```text
21 pass
0 fail
70 assertions
```

### Graceful-close 绕道

初始实现把 public `close()` 收紧为立即丢弃 queued events。扩大 focused 后：

```text
43 pass
12 fail
196 assertions
```

失败全部来自 abort、ownership 和 turn-failure 测试在 close 后 drain 不到 terminal runtime events。该结果证明旧 close 行为不是偶然实现细节，而是现有审计合同。

修订后：

- `close()` 停止接收新 live event并 graceful drain；
- `return()` / `throw()` / overflow / Hub close 立即 discard；
- 同一 focused 为 55 pass / 0 fail / 215 assertions。

### 独立审查 P1 与修复

首次独立 pre-acceptance 审查通过公开探针复现：

```text
first next: timeout
second next: received seq 1
```

旧 `EventQueue` 只保留一个 pending resolver；第二次并发 `next()` 会覆盖第一次，且 close 只能结算最后一个 waiter。新增公开 `EventSubscription` seam 回归后为 19 pass / 1 fail / 68 assertions。

修复只调整内部等待队列，不改变公开 API：

- pending `next()` 使用 FIFO waiter；
- 每个 live event 只结算最早 waiter；
- explicit/forced close 都结算全部 pending waiter；
- 初始测试用固定两次 microtask 观察 `.then()`，受 `async next()` 的 Promise 展开层数影响，在正确实现上仍可能误红；改用有界等待两个公开 Promise 后，旧问题仍会 timeout，FIFO 实现稳定转绿。

最终 EventHub 为 21/0/70；events、turn failure、abort、ownership 与 Cosmos consumer focused 为 59/0/225，typecheck 通过。

### 实现结果

- publish 在 seq commit 前 JSON serialize 一次，detach/freeze 后同时用于 return、replay 和 live；
- replay 每 Session 默认 500 events / 4 MiB；
- live queue 每 subscription 默认 128 events / 1 MiB；
- limits 只接受正整数；
- slow subscriber overflow 为 `queue_overflow`，不影响快速 subscriber；
- pending replay 不计入较小 live queue limit，仍受 replay hard limits；
- metrics 只包含 Hub 当前持有的 replay/active-subscription count 与 serialized bytes，不暴露 payload；graceful-close 待 drain 队列由调用方持有；
- Event Subscription 自身实现 Async Iterator；for-await break、return、throw 均注销；
- 同一 subscription 的并发 pending `next()` 按调用顺序接收事件，所有关闭路径都会结算全部 waiter；
- Harness dispose 关闭 owned Hub，injected Hub 保持宿主所有权。

### Full/package

P1 修复前的首次主流程门禁为 201/0/967，package smoke 也通过；独立审查随后发现并发 `next()` P1，因此这些旧绿灯没有作为最终 acceptance 证据。

P1 修复后重新运行：

```text
bun run verify

203 pass
0 fail
970 assertions
39 test files
```

typecheck 与 build 同时通过。

```text
bun run pack:smoke

exit code 0
prepack: 203 pass / 0 fail / 970 assertions
tarball: 101 files / 99.5 kB / 482.7 kB unpacked
```

Bun 与 Node ESM tarball consumer 均编译/运行 `SessionEventHubOptions`、`SessionEventHubMetrics`、`EventSubscriptionCloseReason` 和 Hub close。

## 审查

首次独立审查发现 1 个 P1、无 P0/P2；P1 已由公开红测复现并修复，修复后的 full/package gate 已通过。

Post-fix 独立只读审查复核当前源码、测试、公开 API、Harness ownership、package exports 和宿主 Transport 边界，独立复跑 EventHub 21/0/70 与 typecheck，结论：

```text
No P0/P1/P2 findings.
```

Reviewer 的只读 sandbox 无法让 Bun 读取 `package.json`，因此其 full verify 未执行；这是环境限制，不是产品 finding，也不替代主流程已通过的 203/0/970 和 package smoke。

ADR-0019 已在 standalone Core 范围接受。

## 未验证

- HTTP/SSE、真实 socket backpressure、heartbeat、鉴权和浏览器 reconnect；
- 跨进程 EventHub 与 durable DomainEvent/Outbox；
- 真实 NeuroBook/Cosmos consumer、Provider/Tool；
- 发布与生产。
