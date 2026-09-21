# 事件发布点清单（Event Publisher Inventory）

第七十三轮审计产物：`HarnessEvent` 公开类型的每个成员与它的发布点、触发
条件逐项对应，防止「声明但未发布」的合同漂移再次发生（第七十一轮发现的
`message_committed` 即此类，第七十二轮已修复）。行号以 2026-08-12
第九十二轮校准为准（第八十/八十一轮等待族、第九十一轮 compactIfNeeded
对齐投影与第九十二轮 turn_end waiting 后漂移）；后续新增方法后需重新校准。

## Runtime 事件（HarnessRuntimeEvent）

| 类型 | 发布点（src/harness.ts） | 触发条件 |
| --- | --- | --- |
| `agent_start` | 1356 | run 开始（attempt 建立后） |
| `agent_end` | 1488（waiting）；`publishTerminalEvent` 2582（调用点 832/1269/1621/1670） | waiting 或 terminal commit 确认后；只发一次 |
| `turn_start` | 1416 | 每 turn 开始 |
| `turn_end` | 1461/1599（completed）；1486（waiting，第九十二轮）；1631（failed） | turn 完成/进入 waiting/失败闭合 |
| `model_event` | 1440（`runTurn` 的 `onEvent`） | provider 流式事件（由 ModelRuntime Adapter 转发） |
| `message_committed` | 2011（approval resume）/2180（`commitMessages`） | Harness 发起且已 durable 的 transcript 消息提交（user/assistant/toolResult/steer）；宿主 write/prepareWrites/writePlans/forkSession 不发布 |
| `tool_execution_start` | 1501（parallel）/1550（sequential）/1957（approval resume） | Tool 执行前 |
| `tool_execution_end` | 1514/1576/1988 | Tool 结果产生后（parallel 在 batch 提交前逐个发） |
| `compaction_start` | 1855 | compaction 触发 |
| `compaction_end` | 1880 | compaction 摘要落盘后 |
| `approval_required` | 1482 | 进入 waiting 前 |
| `approval_resolved` | 2016 | resume 的 Tool 结果提交后 |

## Session 事件（HarnessSessionEvent）

| 类型 | 发布点 | 触发条件 |
| --- | --- | --- |
| `session_entry` | src/event-publication.ts:202 | 每次 durable commit 的每个 appended entry |
| `session_status` | src/event-publication.ts:210 | 每次 durable commit（version 单调） |
| `snapshot_required` | src/event-publication.ts:164/186/224（仅 `reason: "commit_order"`） | durable publication batch 的 identity/generation/version 异常或序列化失败；订阅期恢复（陈旧 epoch/cursor 越界/replay 过期）由 `EventConnected.snapshotRequired` 标志表达，不发布事件 |
| `steer_queued` | harness.ts:429 | steer 入队 |
| `steer_drained` | harness.ts:1756 | steer 注入 transcript |
| `follow_up_queued` | harness.ts:468 | follow-up 入队 |
| `follow_up_started` | harness.ts:1799 | follow-up 启动新 Invocation |
| `follow_up_state` | harness.ts:1805（经 `publishFollowUpState`，由 pause/cancel/reorder/resume 变更路径 494/514/537/555 触发） | 队列控制变更后发布；公开查询 `followUpState()` 不发布事件 |

## Host 事件（HarnessHostEvent）

| 类型 | 发布点 | 触发条件 |
| --- | --- | --- |
| `host`（`abort_request_error` 等） | harness.ts:1165/1768 | abort 请求持久化失败（非 CAS 类错误）、follow-up 自动启动失败等宿主可见错误；`abort_request_error` 与 `follow_up_error` 均已由 `tests/host-error-events.test.ts` 运行时覆盖（含 CAS 类失败静默路径与队列保留断言） |

## 审计结论（2026-08-12）

- 全部 12 个 runtime、8 个 session、1 个 host 类型都有发布点；
- 本轮收窄 `snapshot_required.reason` 联合类型为 `"commit_order"`（其余三个
  声明值从未发布；订阅期恢复由 `connected.snapshotRequired` 标志承担）；
- `model_event` 已由 `tests/model-event-publisher.test.ts` 运行时 smoke 覆盖
  （runTurn.onEvent 逐条转发、顺序、turn 与不进 durable transcript）；
  `compaction_start` / `compaction_end` 已由
  `tests/compaction-events.test.ts` 运行时 smoke 覆盖（触发载荷、发布顺序，
  2026-08-12 第八十六轮补齐）；
  `follow_up_queued` 已由 `tests/follow-up-events.test.ts` 正向覆盖（入队
  载荷与 durable 队列项一致、自动启动携带同一 item id，2026-08-12
  第八十七轮补齐）；
- 编译期无法保证「每个公开类型都有发布点」，本清单与
  `tests/event-publisher-coverage.test.ts` 提供人工与运行时双层防线。
