# 第七十一轮：SSE Transport 消费切片

## 状态

用宿主侧 SSE 式交付循环验证事件 seam：游标续传、`snapshotRequired` 恢复循环、
慢消费者 overflow 重同步三条闭环全部由公开订阅 API 表达，SSE 帧编码留在测试内
的宿主侧（Transport 职责，不进入 Core）。纯测试轮（无 `src/` 变更），未暴露
Core 缺口；用户保护文件未纳入范围。

## 规划依据

- NeuroBook parity 扫描：`server/agent` 自 2026-08-08 起无代码提交（仅
  docs/release chore），无新候选可吸收。
- Goal 明确「SSE 能力」方向；第 36/58 轮已定边界：cursor/envelope 属于 Core，
  HTTP/SSE encoder、backpressure、reconnect、鉴权留在 Transport。事件 seam
  （`subscribe(sessionId, cursor)` + `EventConnected.snapshotRequired` +
  `queue_overflow` close）已有单元测试，但缺少宿主侧完整交付/恢复循环的消费
  证据。

## 变更

- 新增 `tests/sse-transport-consumer.test.ts` 3 条：
  1. **游标续传**：空游标连接收第一段事件 → 宿主侧 `toSseFrame` 序列化 →
     用 `{eventEpoch, after: lastSeq}` 续传 → 只收到 seq 递增的新事件（无
     重复/乱序，含 seq 集合唯一断言）；
  2. **snapshotRequired 恢复循环**：陈旧 epoch cursor 连接 →
     connected 握手声明 `snapshotRequired: true`（replay 语义由单元测试
     覆盖）→ 宿主 `snapshot()` 拿真相 + 新 cursor → 重新订阅
     `snapshotRequired: false`、epoch 与快照一致；
  3. **overflow 重同步**：`subscriberQueueLimit: 2` 下不迭代的订阅在第二次
     运行溢出 → `signal.aborted` + `closeReason: "queue_overflow"` → 宿主经
     `snapshot()` 重同步后继续接收。
- `toSseFrame` 与 `collectUntil` 是测试内宿主侧辅助，明确演示
  「Core 提供 envelope，Transport 提供编码/投递」的边界。

## 门禁

- focused：`bun test tests/sse-transport-consumer.test.ts
  tests/events.test.ts tests/persistence-events.test.ts
  tests/event-cursor-epoch-admission.test.ts` → `38 pass / 0 fail /
  149 assertions`（4 files，含既有事件套件回归与 P2 加固断言）。
- `bun run verify`：`407 pass / 0 fail / 1672 assertions`，61 test files；
  typecheck/build 通过。
- `bun run pack:smoke`：未运行——本轮无 `src/` 变更，包内容与第六十九轮已
  验证状态一致。
- `git diff --check` 仅 Windows LF/CRLF warning。

## 结论

- 现有事件 seam 足以表达宿主侧 SSE 交付闭环：续传、epoch 恢复、overflow
  重同步全部由公开 API 组合完成，无需新增 Core API 或 Transport 原语。
- **已知合同漂移**：公开类型 `HarnessRuntimeEvent.message_committed` 声明但
  全仓无发布点（第七十一轮独立审查发现，预存问题）。宿主消息流式投递必须消费
  `session_entry` 事件（消息载荷在其中），不能依赖 `message_committed`；
  补发布点或从公开类型移除并记录 ADR 排入下一轮。
- 边界确认：`snapshotRequired` 是 Core 明确要求宿主重同步的信号，
  `queue_overflow` 关闭是慢消费者的 fail-closed 兜底，两者都导向
  `snapshot()` 恢复路径；宿主按 closeReason 决策 reconnect/重同步。

## 未验证与保留边界

- 真实 NeuroBook/Cosmos consumer、真实 provider/tool、第三方 Store、真实
  HTTP/SSE 连接、多 Session 扇出、浏览器/产品和生产验收仍未运行。
- 未实现/不下沉：SSE 编码器、socket backpressure、HTTP 鉴权、reconnect
  退避、多 Session 聚合订阅——全部保留 Transport/宿主（第 36/58 轮边界）。
- 慢消费者测试用本地 Memory + ScriptedModelRuntime，未覆盖真实网络往返。

## 独立审查

- 只读独立审查（Hilbert）逐条核对公开 seam、事件序列与门禁数字：
  **No P0/P1 findings**；三条测试无 flaky 风险（agent_end 是 run 的最后一个
  发布、overflow 事件数 ≥4 条、无游标捕获竞态）；恢复循环宿主可原样实现。
- P2 已吸收：walkthrough 注明 `message_committed` 声明但未发布的合同漂移
  （修复排入下一轮）并修正「不 replay」措辞；测试补 seq 集合唯一断言与
  cursor 单次捕获。
