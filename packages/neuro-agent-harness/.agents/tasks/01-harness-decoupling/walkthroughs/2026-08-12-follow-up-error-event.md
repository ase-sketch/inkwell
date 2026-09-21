# 第八十四轮：follow_up_error 运行时覆盖

## 状态

第八十三轮收尾记录的候选落地：`follow_up_error` 运行时覆盖。手工 JSONL
会话含 `harness.followUp.queued` 项（payload 被当前 Profile 的 payloadSchema
拒绝），主运行完成后 `watchFollowUps` 自动启动失败 → `follow_up_error` 发布、
队列项保留、不启动新 Invocation。纯测试轮（无 `src/` 变更）；用户保护文件
未纳入范围。

## 规划依据

- 第八十三轮审查与 walkthrough 记录：`follow_up_error` 无运行时断言（触发
  需要 follow-up 启动失败场景）。
- 发布点核对：`watchFollowUps` 的 `result.then(...).catch` 在
  `startNextFollowUp` 抛错时发布 `follow_up_error`（harness.ts:1751）；
  `start()` 在 admission 处 `profile.parsePayload(request.payload)`
  （harness.ts:957）——队列项 payload 被当前 Profile 拒绝即可触发。
- 绕过 followUp() 的入队时校验（它会在入队前 parsePayload），用手工 JSONL
  直接构造队列项。

## 变更

- `tests/host-error-events.test.ts` 新增第 3 条：手工 JSONL（idle session +
  `harness.followUp.queued` 项，payload `{bad: true}`）→ 当前 Profile 的
  payloadSchema 只接受含 `text` 的对象 → 主运行（`{text: "ok"}`）完成后
  watcher 自动启动失败 → 断言：
  - 恰好一条 `follow_up_error` host 事件（payload 精确匹配）；
  - 队列项保留（`followUpState` 1 项）、invocations 仍只有主运行 1 条
    （不启动新 Invocation）。
- collector 改为等 `follow_up_error` 事件 + 5s 有界 race（不能在主运行的
  `agent_end` 提前 break，否则漏掉之后发布的 host 事件）。
- `docs/events-inventory.md` host 行更新：`abort_request_error` 与
  `follow_up_error` 均已覆盖（含静默路径与队列保留断言）。

## 门禁

- focused：`bun test tests/host-error-events.test.ts
  tests/abort-boundary.test.ts tests/events.test.ts
  tests/event-publisher-coverage.test.ts` → 实跑
  `39 pass / 0 fail / 151 assertions`（4 files）。
- `bun run verify`：`439 pass / 0 fail / 1797 assertions`，71 test files；
  typecheck/build 通过。
- `bun run pack:smoke`：未运行——本轮无 `src/` 变更，包内容与第八十一轮已
  验证状态一致。
- `git diff --check` 仅 Windows LF/CRLF warning。

## 结论

- host 事件全部类型（`abort_request_error` 发布/静默、`follow_up_error`
  自动启动失败）完成运行时闭环；事件发布双层防线仅剩 `compaction_*` 与
  `tool_call_delta` 为代码引用审计（前者需 compactor 配置，后者为流式 Tool
  场景）。

## 未验证与保留边界

- 真实 NeuroBook/Cosmos consumer、真实 provider/tool、第三方 Store、
  HTTP/SSE 连接、浏览器/产品和生产验收仍未运行。
- `tool_call_delta` 流式类型仍为候选；compaction 事件需 compactor 配置。

## 独立审查

- 只读独立审查（Copernicus）：场景真实触发 `watchFollowUps` 的 catch 路径
  （active 已删除、早退条件全不成立、`startOnce` 的 parsed payload 校验抛错
  原样传播）、手工 JSONL 通过全部 admission、断言无假绿（假红是有界等待的
  预期语义）；focused/全仓数字实测一致。**No P0/P1 findings。**
- P2 已吸收：5s race 定时器在 finally 清理，超时失败路径同样保证
  `harness.dispose()` 与订阅收尾（try/finally 包裹）。
- 观察项（不计入）：`watchFollowUps` 的 catch 语义略宽（run result 拒绝与
  启动失败共用），属既有设计，非本轮引入。
