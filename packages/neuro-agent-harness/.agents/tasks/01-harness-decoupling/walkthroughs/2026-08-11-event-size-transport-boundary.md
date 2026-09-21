# 第五十八轮：EventHub 单事件大小与 Transport boundary audit

## 状态

完成 NeuroBook `AgentJobEventHub.maxEventBytes` 与 standalone `SessionEventHub` 的边界审计；探针结果与既有合同一致，没有发现需要下沉到 Core 的 API 缺口。本轮为规划/证据 walkthrough，不修改生产代码，不新增 public API、ADR、依赖或测试文件。

## 规划取证

1. NeuroBook `AgentJobEventHub` 的 `maxEventBytes` 测量的是完整 SSE frame（`event:` + `data:` + 分隔符），单帧超限时把同一 seq 降级为 `snapshot_required`。
2. standalone `SessionEventHub` 不编码 SSE frame，README/CONTEXT 已明确 HTTP/SSE encoder、socket backpressure、heartbeat、鉴权与 reconnect 由宿主 Transport Adapter 负责。
3. standalone 已对 Core 可观察的内存边界提供两层预算：
   - `replayByteLimit`：单 Session replay 窗口的 serialized bytes；
   - `subscriberQueueByteLimit`：单订阅 live queue 的 serialized bytes。
4. 单事件超出 replay budget 时，该事件被裁剪出 replay；后续 cursor 重新订阅时自然得到 `connected.snapshotRequired=true`。
5. 单事件超出 live queue budget 时，订阅关闭为 `queue_overflow`；Transport 应以 Snapshot/cursor recovery 重连。Core 不需要知道 SSE frame 大小，也不应把 host event 强行改写为 Session `snapshot_required`。

## 探针证据

临时只读探针使用 `SessionEventHub`：

```text
replayByteLimit=1000 + 5000-char event
=> {"snapshotRequired":true,"latestSeq":1}

subscriberQueueByteLimit=1000 + 5000-char live event
=> {"aborted":true,"closeReason":"queue_overflow"}
```

这与 standalone 的现有公开合同一致：replay 过期/不可回放要求 Snapshot，落后的 live subscriber 关闭并由宿主重连；没有出现 seq 静默跳过或无界队列。

## 决定

- 不复制 NeuroBook 的 `maxEventBytes` 到 Core；它依赖 SSE frame 编码和 Product/Job event 语义。
- 保留 `SessionEventHub` 的 provider/host-neutral serialized replay/live budgets。
- 若未来某 Transport 需要 public frame-size fallback，应在该 Transport/Adapter 记录独立合同，不修改 Core EventHub 的 `HarnessSessionEvent` union。

## 未验证边界

真实 HTTP/SSE encoder、浏览器重连、跨进程 EventHub、第三方 Transport、代理/网关 frame limit 与 NeuroBook/Cosmos 产品验收仍未验证。本轮不修改 NeuroBook/Cosmos，不 push、发布或部署。
