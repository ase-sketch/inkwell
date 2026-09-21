# 第八十三轮：host 错误事件运行时覆盖（abort_request_error）

## 状态

第八十二轮审查记录的边界候选落地：host 错误事件（`abort_request_error`）
此前无运行时断言（触发需失败注入 Store）。本轮用失败注入 Store 触发
abort.request 持久化失败，验证 host 错误事件发布与「发布后强制收口仍完成」，
并补 CAS 类失败静默路径。纯测试轮（无 `src/` 变更）；用户保护文件未纳入
范围。

## 规划依据

- 第八十二轮审查（Noether）P2：`abort_request_error`/`follow_up_error` 全仓
  零运行时断言，仅信封级/负向覆盖，记录为边界候选。
- 发布点核对：`requestAbort` 的 `persistAbortRequest().catch` 对非 CAS 类
  错误发布 `abort_request_error`（harness.ts:1151），随后
  `active.controller.abort()` + `forceAbort` 正常推进（abortGraceMs 0）。

## 变更

- 新增 `tests/host-error-events.test.ts` 2 条：
  1. **非 CAS 类失败发布 abort_request_error**：失败注入 Store 对
     `harness.invocation.abort.request` commit 抛普通 Error → 订阅收到
     `{kind: "host", event: {type: "host", name: "abort_request_error",
     payload: "abort request commit unavailable"}}`；强制收口不受影响
     （snapshot idle + invocation aborted）；
  2. **CAS 类失败静默**：同一 cause 抛 `SessionConflictError` → 不发布任何
     host 事件（catch 吞掉分支），强制收口仍完成。
- `docs/events-inventory.md` host 行更新：`abort_request_error` 已覆盖
  （含静默路径），`follow_up_error` 仍为代码引用审计。

## 门禁

- focused：`bun test tests/host-error-events.test.ts
  tests/abort-boundary.test.ts tests/events.test.ts
  tests/event-publisher-coverage.test.ts` → 实跑
  `38 pass / 0 fail / 148 assertions`（4 files，含 P2 吸收后的形状断言）。
- `bun run verify`：`438 pass / 0 fail / 1794 assertions`，71 test files；
  typecheck/build 通过。
- `bun run pack:smoke`：未运行——本轮无 `src/` 变更，包内容与第八十一轮已
  验证状态一致。
- `git diff --check` 仅 Windows LF/CRLF warning。

## 结论

- host 错误事件面补全：`abort_request_error`（发布 + 静默两条路径）有运行时
  覆盖；`follow_up_error` 保留代码引用审计（触发需 follow-up 消费失败注入）。
- 失败注入 Store 模式与 abort-boundary 既有 FlakyAbortFinishStore 同款。

## 未验证与保留边界

- 真实 NeuroBook/Cosmos consumer、真实 provider/tool、第三方 Store、
  HTTP/SSE 连接、浏览器/产品和生产验收仍未运行。
- `follow_up_error` 的运行时覆盖仍为候选（需要 follow-up 启动失败的注入
  Store）；`tool_call_delta` 流式类型同留候选。

## 独立审查

- 只读独立审查（Hypatia）：失败注入真实触发 `persistAbortRequest().catch`
  路径、override 签名正确、静默清单核对（SessionInvariantError 不在清单，
  测试未误用）、时序确定性（微任务 FIFO：host 事件先于 forceAbort 终态，
  collector 在 agent_end break 不漏）、数字实测一致。**No P0/P1 findings。**
- P2 已吸收：host 事件改精确形状断言（filter + objectContaining 恰好一条，
  且位于 agent_end 之前）；两个测试的阻塞模型改为清理时 resolve 的 gated
  promise（消除永不 settle 的隐患，未来 dispose 语义收紧也不挂起）。
