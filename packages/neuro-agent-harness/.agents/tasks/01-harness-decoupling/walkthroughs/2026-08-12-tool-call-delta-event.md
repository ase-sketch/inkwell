# 第八十五轮：tool_call_delta 流式事件运行时覆盖

## 状态

第八十二/八十四轮收尾记录的候选落地：`tool_call_delta`（`ModelRuntimeEvent`
最后未覆盖类型）运行时覆盖。纯测试轮（无 `src/` 变更）；用户保护文件未纳入
范围。

## 规划依据

- 第八十二轮 walkthrough 明示：「`tool_call_delta` 类型未在 smoke 中覆盖
  （本轮用文本流）；代码引用审计覆盖，若未来需要可补 Tool 流式用例」；
  第八十四轮结论再次列出。
- `src/model.ts` 的 `ModelRuntimeEvent` 共五种：message_start / text_delta /
  thinking_delta / tool_call_delta / message_end；第八十二轮覆盖四种，本轮
  补 `tool_call_delta`。

## 变更

- `tests/model-event-publisher.test.ts` 新增第 2 条：模型在 runTurn 内按序
  转发 message_start → tool_call_delta（toolCallId "call-1" / toolName
  "calc" / arguments {a:1}）→ message_end（最终消息为文本，无真实 Tool
  调用——流式事件是 provisional，不触发 Tool 副作用）；
  断言 3 条 `model_event` 类型序列与 tool_call_delta 载荷精确匹配。
- 审查 P2 吸收：新增 `tests/steer-events.test.ts`（steer 入队 → 阻塞 turn
  release → 下一 turn 注入），正向断言 `steer_queued`（payload 匹配）与
  `steer_drained`，并验证 steer 内容进入 durable transcript——
  `steer_drained` 此前无任何运行时断言、`steer_queued` 仅有负向断言。
- 五种 `ModelRuntimeEvent` 全部完成运行时覆盖。

## 门禁

- focused：`bun test tests/model-event-publisher.test.ts
  tests/event-publisher-coverage.test.ts tests/message-committed-event.test.ts
  tests/host-error-events.test.ts tests/steer-events.test.ts` → 实跑
  `13 pass / 0 fail / 59 assertions`（5 files）。
- `bun run verify`：`441 pass / 0 fail / 1804 assertions`，71 test files；
  typecheck/build 通过。
- `bun run pack:smoke`：未运行——本轮无 `src/` 变更，包内容与第八十一轮已
  验证状态一致。
- `git diff --check` 仅 Windows LF/CRLF warning。

## 结论

- 事件发布运行时覆盖完成：runtime 12 类型中 10 个有 smoke（含全部五种
  `ModelRuntimeEvent`）、`compaction_start/compaction_end` 保留代码引用审计
  （需 compactor 配置，合理例外）；session 类型中 entry/status/
  snapshot_required/follow_up_state/follow_up_started/steer_queued/
  steer_drained 有正向断言（steer 为本轮补齐），follow_up_queued 仅负向
  断言（拒绝路径）；host 类型（abort_request_error/follow_up_error 两个
  事件名）有运行时覆盖。

## 未验证与保留边界

- 真实 NeuroBook/Cosmos consumer、真实 provider/tool（含真实流式 SDK）、
  第三方 Store、HTTP/SSE 连接、浏览器/产品和生产验收仍未运行。
- `compaction_start/compaction_end` 的运行时覆盖需要 compactor 配置注入，
  仍为候选。

## 独立审查

- 只读独立审查（Kierkegaard）：tool_call_delta 走完整转发链、provisional
  语义与类型注释一致、断言无空转、两条测试隔离良好；focused/全仓数字实测
  一致。**No P0/P1 findings。**
- P2 已吸收：session 覆盖表述修正为如实口径，并新增 steer 正向 smoke
  （`steer_drained` 此前无任何断言）。
