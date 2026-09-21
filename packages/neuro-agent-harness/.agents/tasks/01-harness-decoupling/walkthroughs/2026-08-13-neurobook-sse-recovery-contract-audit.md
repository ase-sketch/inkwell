# 第一百一十三轮：NeuroBook SSE/EventHub/recovery 合同审计

## 状态

本轮完成真实 NeuroBook SSE、Session EventHub、Snapshot recovery 和前端重连状态机的只读审计，并与 standalone Harness 的公开事件 seam 对照。结论是：当前没有证据表明 Core 缺少新的公共 API；NeuroBook 的公开事件 projection、Recovery DTO、Project revision 和 HTTP 生命周期仍应由宿主 Adapter 持有。

本轮没有修改 NeuroBook 或 Cosmos，没有修改 Harness 的 `src/`、根导出、`package.json`、durable shape、ADR 或依赖；只新增本 walkthrough 并同步 Task README。既有 dirty 文件继续保护：`docs/architecture.md`、`docs/pi-adapter-design.md`、`package.json`、`tests/context.test.ts`。

## 规划依据

- 第 112 轮已经证明动态 Profile context delivery/settlement 可以由宿主组合，但没有真实 NeuroBook Adapter 运行证据；本轮因此转向真实 SSE/recovery 调用链，而不是继续增加 fake context fixture。
- NeuroBook 当前独立拥有公开事件 projection 和 UI recovery 状态；standalone Harness 的职责应限于 provider-neutral event envelope、cursor、Snapshot 和 bounded subscription。
- Goal 明确要求保持 Core 去领域化，不下沉 NeuroBook DTO、Project generation、HTTP 鉴权/heartbeat、Job/Lease/Outbox 或浏览器状态。

## NeuroBook 真实合同证据

### 服务端事件中心

`server/agent/events/session-event-hub.ts` 的真实行为包括：

- 每个进程一个 `eventEpoch`，每个 Session 独立递增 `seq`；
- `connected` handshake 暴露当前 epoch 和 latest sequence；
- replay 同时受事件数量和序列化字节预算限制；
- 每个 live subscriber 另有数量/字节队列预算，溢出立即关闭订阅；
- 缺少 epoch、epoch 不一致、cursor 超前或 replay 已过期时，订阅返回 `snapshot_required` 控制事件，而不是冒险 replay 不连续窗口；
- 公开事件在进入 replay 和 subscriber 前先完成 detach/序列化，避免 provider 可变对象泄漏到 Transport。

### HTTP/SSE 边界

`server/api/agent/sessions/[sessionId]/events.get.ts` 只负责解析 query、调用 `subscribeAgentSessionEvents()`，再交给 `writeAgentEventStream()`。`server/agent/events/agent-sse-writer.ts` 负责：

- `text/event-stream`、keep-alive 和代理缓冲控制 header；
- 一次只写一个 frame；`write()` 返回 false 时等待 `drain`；
- response close/error、subscription abort 和 queue overflow 的相互取消；
- writer 结束时清理全部监听器和 subscription 引用。

这说明 HTTP response、socket backpressure、连接关闭和鉴权不是 NeuroBook 的 Core session 合同，也不应因为 SSE 支持而进入 standalone Core。

### Snapshot 真相与客户端 recovery

NeuroBook 的 `AgentSessionRecoveryDto` 通过 `GET /api/agent/sessions/:sessionId?view=recovery` 返回：

- `eventCursor`；
- Session summary、active leaf 和 `activePathRevision`；
- history、tree、pending user inputs、steer/follow-up queue、active invocation、model 等产品 projection。

`useAgentSession.ts` 收到事件时会校验 epoch、latest sequence、重复 seq 和 seq gap；遇到 `snapshot_required`、epoch 变化、seq gap、active path 变化或 pending input 信息缺失时请求 recovery。`useAgentSessionStream.ts` 为 recovery 建立 single-flight 和 connection generation：读取 recovery、替换客户端 projection、取消旧 stream，再从 recovery cursor 建立新连接；旧连接的异步回调不能污染新 generation。

因此 NeuroBook 的恢复循环可抽象为：

~~~text
SSE disconnect / stale cursor / invalid projection
  -> host detects snapshotRequired or local recovery reason
  -> GET host-owned recovery snapshot
  -> replace host projection
  -> subscribe from recovery eventCursor
~~~

其中只有最后一步使用 Harness 的通用 `subscribe(sessionId, cursor)` seam；recovery payload 和 projection 替换均属于宿主。

## 与 Harness 公开 seam 对照

standalone `src/events.ts` 已提供：

- `EventCursor {eventEpoch?, after?}`；
- `EventConnected {eventEpoch, latestSeq, snapshotRequired}`；
- `EventSubscription` 的 async iteration、AbortSignal、close reason 和 bounded replay/live queue；
- epoch/seq admission、serialized-byte budget 和 Snapshot recovery signal。

`NeuroAgentHarness.snapshot()` 返回 `{session, cursor}`，并保证 cursor 不晚于对应 durable projection；`NeuroAgentHarness.subscribe()` 接受该 cursor。现有 focused tests 已经覆盖 cursor replay、旧 epoch、缺 epoch、replay 过期、慢消费者 overflow 和真实 HTTP fixture。

两边的差异是职责边界，不是已证明的 Core 缺口：

| 关注点 | NeuroBook | standalone Harness | 结论 |
| --- | --- | --- | --- |
| 公开事件正文 | 产品 DTO + runtime/tool projection | provider-neutral runtime/session/host envelope | projection 留宿主 |
| recovery 信号 | `snapshot_required` 公开控制事件 | `connected.snapshotRequired`；`snapshot_required` 仅用于 durable commit-order 异常 | Adapter 可映射，不新增产品事件 |
| Snapshot | Recovery DTO，含 Project/history/UI projection | `snapshot()` 的 Session + cursor | Core 不持有产品 projection |
| HTTP/SSE | route、frame writer、backpressure、重连 | `subscribe()` + SSE frame serializer | Transport 留宿主 |
| 长期真相 | NeuroBook Session/Project/Job projection | Harness Session Snapshot/Store | 不合并两个 durable truth |

尤其不能因为 NeuroBook 把 stale cursor 映射为公开 `snapshot_required` 事件，就把这个产品事件强制加入 Harness 的 `HarnessSessionEvent`。Harness 当前 `snapshotRequired` handshake 已能让宿主选择 HTTP 409、控制事件或重新拉取 recovery 的方式。

## 执行与验证

### 只读审计命令

对 NeuroBook 分段读取并核对了：

- `server/agent/events/session-event-hub.ts`；
- `server/agent/events/agent-sse-writer.ts`；
- `server/agent/events/public-control-event-projection.ts`、`public-event-projection.ts`；
- `server/api/agent/sessions/[sessionId]/events.get.ts`、`index.get.ts`；
- `server/agent/http.ts`；
- `app/components/novel-ide/agent/useAgentSession.ts`；
- `app/components/novel-ide/agent/useAgentSessionStream.ts`；
- `app/composables/useAgentSessionApi.ts`；
- `shared/dto/agent-session.dto.ts`。

对 Harness 对照了：

- `src/events.ts`、`src/harness.ts`、`src/sse.ts`；
- `tests/sse-transport-consumer.test.ts`；
- `tests/sse-http-transport.test.ts`；
- `tests/event-cursor-epoch-admission.test.ts`。

### focused 验证

~~~text
bun test tests/sse-transport-consumer.test.ts tests/sse-http-transport.test.ts tests/event-cursor-epoch-admission.test.ts
6 pass / 0 fail / 20 expect calls
~~~

覆盖：宿主侧 SSE cursor 续传、旧 epoch 要求 Snapshot、慢消费者 overflow 后重同步、真实 HTTP fixture 首连/续传以及缺 epoch 的 fail-closed admission。

本轮文档落盘后还应运行 `git diff --check` 和 `bun run verify`；由于没有修改 `src/`、exports、`package.json`、依赖或打包内容，不重复运行 `bun run pack:smoke`。第 111 轮的安装后 Bun/Node tarball consumer 证据仍是最近一次 package boundary 验收，但不把它扩展成真实 NeuroBook/Cosmos 集成证据。

实际执行结果：

~~~text
git diff --check：通过；仅有 Windows LF/CRLF 转换提示
bun run verify：521 pass / 0 fail / 2167 expect calls，93 files；typecheck/build 通过
~~~

本轮新增的 focused 组合在全仓门禁中再次通过；本轮没有修改 package/export/build 边界，因此没有运行 pack:smoke。

## 结论与审查

- 已验证：NeuroBook 当前真实 SSE/recovery 流程可以由“宿主 recovery projection + Harness cursor/Snapshot subscription”组合表达。
- 已验证：Harness 现有公开 `snapshot()`、`subscribe()`、epoch/seq admission 和 bounded subscription 足以承载该 Adapter 的底层恢复切口。
- 未验证：真实 NeuroBook 运行时依赖 standalone Harness；当前 NeuroBook 仍有自己的 Harness，未进行跨仓库接线。
- 未验证：浏览器 EventSource、无限 SSE、heartbeat、真实代理、生产 backpressure、真实 provider、第三方 Store、Cosmos package 和部署。
- 未验证：多进程共享 EventHub；Harness 当前仍只对 in-process EventHub 提供合同。

本地 diff 审查没有发现 P0/P1；没有新增 API，也没有扩大 Core 的领域职责。审查边界是本轮读取的真实源文件和已有 Harness focused tests，不能据此声称产品 Transport 或跨仓库 parity 已完成。

## 下一轮规划入口

NeuroBook SSE/recovery 没有暴露新的 Core 缺口。下一轮优先审计 NeuroBook 最新 partial assistant/provider interruption 语义，对照 Harness 的 `ModelTurnError.partial`、`InvocationResult.partial`、`harness.invocation.partial` 和 JSONL recovery：

1. 判断产品是否需要把 partial 当作可展示 transcript，还是只需要 Invocation 诊断事实；
2. 验证 retry、continue、abort、waiting/resume 和重启时的重复/丢失边界；
3. 只有真实消费者需要而现有 provider-neutral seam 无法表达时，才设计最小 API/ADR；否则保持当前 Core 合同。

Cosmos 继续保持直接使用 `pi-ai` 的 revisit gate；不新增 `agent.invoke@1`、Job/Lease/Outbox 或 Cosmos-specific API。
