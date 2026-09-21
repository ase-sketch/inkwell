# ADR-0019: Bounded Event Subscription Lifecycle

- Status: Accepted (standalone Core scope)
- Date: 2026-08-11
- Task: [`01-harness-decoupling`](../tasks/01-harness-decoupling/README.md)

## Context

`SessionEventHub` 是 provider-neutral 的进程内事件源，但当前每个 subscriber 的 live queue 无上限；Async Iterator 没有 `return()`，`for await` 提前退出不会注销 subscriber。Replay 虽有条数上限，却没有 serialized-byte 上限，且 publish 只做浅复制，调用方随后修改嵌套 payload 会改变 replay truth。

这些引用实际由 Core `SessionEventHub` 持有。HTTP writer 可以处理 socket backpressure，却无法约束或释放 Core 内部队列，因此此前把所有 byte budget 与 slow-consumer 行为留给 Transport 的边界过宽。

现有 `EventSubscription.close()` 还有一项已被 Harness 终态审计测试依赖的兼容语义：停止接收新事件后，消费者可以继续 drain 已排队事件。资源收紧不能把 graceful close 偷换成 discard。

## Decision

- publish boundary 把 `HarnessEvent` 脱离调用方可变对象，并计算一次 provider-neutral serialized byte size；
- Event Replay Window 同时受 event count 与 serialized bytes 硬上限约束；
- 每个 Event Subscription 的 live queue 同时受 count 与 serialized bytes 硬上限约束，pending replay 与 live queue 分离，合法大 replay 不被较小 live limit 误杀；
- overflow 只关闭落后的 subscription，设置 `closeReason = "queue_overflow"`、abort signal 并立即释放 pending replay/live references；不阻塞 Agent publish，不静默 drop 后继续，也不创建新的 durable event/seq；
- explicit `close()` 注销 subscriber、停止接收新 live event，并保留已排队 replay/live 供 graceful drain；
- Async Iterator `return()` / `throw()`、queue overflow 与 Hub close 表示消费者不再 drain，立即清空队列并结束 pending `next()`；
- 同一 Event Subscription 的并发 pending `next()` 按调用顺序等待 live event；任何关闭路径都结算全部 pending `next()`，不遗留不可观察的悬挂 Promise；
- Hub 提供不含 payload 的 metrics，统计 replay 与仍由 Hub 持有的 active subscriptions；graceful close 后待 drain 队列由 subscription 调用方持有；
- Harness 只关闭自己创建的 Event Hub；注入的 Hub 仍由宿主管理。

本 ADR 不引入 SSE frame、Node `ServerResponse`、HTTP route、heartbeat、鉴权、前端 reconnect、产品 DTO、跨进程 EventHub 或 durable domain event。

## Alternatives

- **全部留给 HTTP/SSE Adapter**：拒绝。无界引用保存在 Core queue，Transport 无法回收。
- **队满后丢最旧 event 并继续**：拒绝。消费者会在没有明确信号时形成 seq gap。
- **让 `publish()` 等待最慢消费者**：拒绝。观察流不能反向阻塞 Agent/Store 主流程。
- **同时移植 NeuroBook SSE frame/writer**：拒绝。Buffer、socket backpressure、header、heartbeat、鉴权和产品 DTO 属于宿主 Transport。

## Verification gate

- explicit close 停止新事件并按原顺序 graceful drain 已排队事件；
- `for await` break、iterator `return()` / `throw()` 和 Hub close 都注销 subscriber并立即释放未消费引用；
- 多个并发 pending `next()` 依调用顺序接收 live event，并在 close 时全部完成；
- count overflow 与 byte overflow fail closed 为 `queue_overflow`，不影响其它 subscriber；
- replay count/byte hard limits 保持 cursor-expired recovery，replay/live 交界不丢失、不重复、不乱序；
- publish 后修改原对象不改变返回值、replay 或 live event；
- Harness dispose 关闭 owned Hub，但不关闭 injected Hub；
- focused、`bun run verify`、`bun run pack:smoke` 与独立审查。

## Evidence so far

- 独立 pre-acceptance 审查发现 1 个 P1：旧 `EventQueue` 的单一 resolver 会被第二个并发 `next()` 覆盖；公开探针得到“第一个 timeout、第二个收到 event”，且 close 不能结算全部 waiter。
- 并发 `next()` 回归先以 19 pass / 1 fail / 68 assertions 复现；改为 FIFO pending waiter 并让 close 结算全部 waiter 后，EventHub 单文件为 21 pass / 0 fail / 70 assertions。
- events + turn failure + abort + ownership + Cosmos consumer focused 为 59 pass / 0 fail / 225 assertions，typecheck 通过。
- 第一次扩大 focused 曾为 43 pass / 12 fail / 196 assertions：初始“explicit close 立即 discard”破坏既有 terminal-event graceful drain；修订关闭语义后同一矩阵全绿。
- P1 修复后的 `bun run verify` 为 203 pass / 0 fail / 970 assertions，覆盖 39 个测试文件并通过 typecheck/build。
- P1 修复后的 `bun run pack:smoke` exit code 0；prepack 同为 203/970，101-file tarball 为 99.5 kB / 482.7 kB unpacked，Bun 与 Node ESM consumer 均编译/运行新 EventHub API。
- Post-fix 独立只读审查复跑 EventHub 21/0/70 与 typecheck，并返回 `No P0/P1/P2 findings.`；只读 sandbox 中的 full verify 因 Bun 无法读取 `package.json` 而未执行，不替代主流程门禁。

本决定在 standalone Core 范围接受；宿主 Transport 和 durable delivery 边界保持不变。

## 2026-08-14 审计整改补充：重入 dispatch 顺序

现有 batch atomic staging 之外，EventHub dispatch 增加 process-local FIFO pending queue：subscriber 的 AbortSignal listener 或其它同步回调重入 `publish()` 时，嵌套 batch 延后到当前 batch 完成通知后再交付。seq、replay 和 live queue 仍在 stage 阶段先安装，因此嵌套事件不能插入当前 batch，也不改变 graceful close、overflow 或 snapshot recovery 合同。
