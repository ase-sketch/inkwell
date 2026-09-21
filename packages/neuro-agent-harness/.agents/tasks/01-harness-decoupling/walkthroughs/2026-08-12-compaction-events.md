# 第八十六轮：compaction_start / compaction_end 运行时事件覆盖

## 状态

第八十五轮结论列出的最后两个未覆盖 runtime 事件类型：
`compaction_start` / `compaction_end` 的运行时覆盖。纯测试轮（无 `src/`
变更）；用户保护文件未纳入范围。

## 规划依据

- 第八十五轮 walkthrough 结论：「runtime 12 类型中 10 个有 smoke、
  `compaction_start/compaction_end` 保留代码引用审计（需 compactor 配置，
  合理例外）」；本轮把该例外收口。
- `docs/events-inventory.md` 明确两个发布点：`compaction_start` 在
  `src/harness.ts:1832`（compaction 触发）、`compaction_end` 在
  `src/harness.ts:1857`（摘要落盘后）；第七十三轮审计后唯一剩余
  runtime 覆盖缺口。

## 变更

- 新增 `tests/compaction-events.test.ts`：
  - Profile 配置 `compaction: {triggerTokens: 3, keepRecentTokens: 1}`，
    compactor `estimate: () => 1`（每条消息 1 token）与返回非空 summary；
  - 第一次 invoke 写入 2 条消息不触发；第二次 invoke 达到 3 条消息触发
    compaction；
  - subscribe 收集到两次 `agent_end` 为止，断言：恰好各发布 1 条
    `compaction_start` / `compaction_end`；两条事件的 `tokensBefore` 均为
    3；`compaction_end.keptMessages > 0`；发布顺序为
    `compaction_start → compaction_end → 第二次 invoke 的 agent_end`。
- 初版顺序断言用 `indexOf("agent_end")` 误匹配第一次 invoke 的
  `agent_end`（失败断言输出 `Expected: < 7, Received: 12`，即第一次 invoke
  的 `agent_end` 索引小于 compaction 事件索引），改为
  `lastIndexOf("agent_end")` 后通过；该失败说明两次 invoke 的事件流都进入
  同一订阅，断言本身有效。审查 P2 吸收：不把未打印的具体事件索引写进文档，
  只保留断言输出的真实证据。
- `docs/events-inventory.md` 审计结论更新：`compaction_*` 已由运行时 smoke
  覆盖，不再只是代码引用审计。

## 门禁

- focused：`bun test tests/compaction-events.test.ts
  tests/compaction.test.ts tests/model-event-publisher.test.ts
  tests/steer-events.test.ts tests/harness-dispose.test.ts
  tests/active-profile-steer-admission.test.ts` → 实跑
  `31 pass / 0 fail / 123 assertions`（6 files）。
- `bun run verify`：`442 pass / 0 fail / 1812 assertions`，73 test files；
  typecheck/build 通过（两次独立实跑均为同一数字：40.13s / 38.66s；
  中途一次被 300s 兜底杀掉的运行是环境负载所致，重试即通过）。
- `bun run pack:smoke`：未运行——本轮无 `src/` 变更，包内容与第八十一轮已
  验证状态一致。
- `git diff --check` 仅 Windows LF/CRLF warning。

## 结论

- runtime 事件 12 类型全部完成运行时覆盖：agent_start/agent_end/
  turn_start/turn_end/model_event（五种 ModelRuntimeEvent）/
  message_committed/tool_execution_start/tool_execution_end/
  compaction_start/compaction_end/approval_required/approval_resolved。
- session 类型：entry/status/snapshot_required/follow_up_state/
  follow_up_started/steer_queued/steer_drained 有正向断言，
  follow_up_queued 仅负向断言（拒绝路径）；host 类型
  （abort_request_error/follow_up_error）有运行时覆盖。
- 事件面运行时覆盖闭环：第七十一至八十六轮逐项补齐合同漂移与审计缺口，
  事件发布点清单不再有「仅代码引用审计」的公开事件类型。

## 未验证与保留边界

- 真实 NeuroBook/Cosmos consumer、真实 provider/tool（含真实流式 SDK）、
  第三方 Store、HTTP/SSE 连接、浏览器/产品和生产验收仍未运行。
- `follow_up_queued` 的正向运行时 smoke 仍未补（拒绝路径已有断言）；
  该事件由 follow-up 入队路径发布，低风险，保留为下一候选。

## 独立审查

- 只读独立审查（Turing）：断言非空转（`toHaveLength(1)` 硬断言、三元表达式
  在 `starts[0]` 为 undefined 时以 `undefined` 对比失败）、载荷与发布顺序和
  `compactIfNeeded` 实现逐项一致（`tokensBefore: 3`、`keptMessages: 1`）、
  订阅时序无挂起/漏事件（空 cursor 无 replay、`publishTerminalEvent` 恰好 2
  次、break 自动关闭订阅）、focused `31/0/123` 实跑一致。
  **No P0/P1 findings。**
- P2 已吸收：walkthrough 的 verify 数字以主代理实跑为准（审查环境命中
  300s 超时兜底被杀，已知环境问题；主代理用 `TEST_TIMEOUT_MS=600000`
  重跑确认同一数字）；索引数字改写为失败断言的原始输出。
