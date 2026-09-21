# 第七十八轮：跨进程 follow-up 注入与自动启动证据（真实子进程）

## 状态

第七十七轮收尾候选落地：跨进程 follow-up 注入组合。真实 Node ESM 子进程在
durable waiting 期间入队 follow-up 后退出，主进程 resume 同一 Invocation，
`watchFollowUps` 自动启动 follow-up Invocation 并完成。纯测试轮（无 `src/`
变更）；用户保护文件未纳入范围。

## 规划依据

- 第七十七轮 walkthrough 明示保留项：「跨进程 steer/follow-up 注入组合」。
  规划核对确认：steer 是内存态（`steerOnce` 检查本进程 active Map），跨进程
  注入按设计不可能也不应发生；follow-up 是 durable ledger，跨进程注入是
  round-33/34 已建立的合同（「独立 Harness 可以向 durable waiting Invocation
  queue follow-up」「当前 Invocation 完成后自动启动新 Invocation」），本轮补
  真实子进程证据。
- `resumeOnce` 注册 `watchFollowUps`（harness.ts:594），resume 完成后
  follow-up 自动启动路径可用。

## 变更

- 新增 `tests/fixtures/follow-up-worker.ts`：子进程进入 durable waiting 后，
  在 waiting 期间调用 `harness.followUp` 写入 durable 队列，输出 marker
  （sessionId/invocationId/toolCallId/followUpId）后退出。
- 新增 `tests/follow-up-process.test.ts`：
  1. 主进程先看到 worker 写入的 durable 队列（`followUpState` 1 项、
     id/payload/caller 匹配）；
  2. resume 第一个 Invocation（approved）→ "after approval"；
  3. `watchFollowUps` 自动启动 follow-up Invocation（10s 有界轮询等待
     completed）；
  4. 第二个 Invocation 投影 completed / "follow-up done"；transcript 含
     "cross-process follow-up" 用户消息；队列已排空。

## 门禁

- focused：`bun test tests/follow-up-process.test.ts
  tests/waiting-control-process.test.ts tests/waiting-resume-process.test.ts
  tests/fork-recovery-process.test.ts tests/coordination.test.ts
  tests/follow-up-admission-jsonl.test.ts` → 实跑
  `13 pass / 0 fail / 88 assertions`（6 files，含 P2 吸收后的元数据断言）。
- `bun run verify`：`419 pass / 0 fail / 1746 assertions`，67 test files；
  typecheck/build 通过。
- `bun run pack:smoke`：未运行——本轮无 `src/` 变更，包内容与第七十三轮已
  验证状态一致。
- `git diff --check` 仅 Windows LF/CRLF warning。

## 结论

- 跨进程 follow-up 闭环由公开 API 表达：一个进程写入 durable 队列，另一
  进程 resume 后自动消费并启动新 Invocation，全程无内存状态依赖。
- 进程边界证据完整闭合：完成态（75）、waiting 恢复 + resume（76）、
  abort/拒绝控制面（77）、follow-up 注入与自动启动（本轮）。

## 未验证与保留边界

- 真实 NeuroBook/Cosmos consumer、真实 provider/tool、第三方 Store、
  HTTP/SSE 连接、浏览器/产品和生产验收仍未运行。
- steer 跨进程注入按设计不适用（内存态）；跨进程双 Harness 并发消费同一
  follow-up 队列的竞争由 follow-up-admission-jsonl 套件（同进程 Store 实例）
  覆盖。
- 自动启动等待用 10s 有界轮询（snapshot 轮询是宿主编排的公开模式）。

## 独立审查

- 只读独立审查（Godel）：确认真实跨进程（marker 输出即 durable 写入完成
  信号）、自动启动走 `watchFollowUps`/`startNextFollowUp` 公开路径（原子
  consumed+start）、10s 轮询双向无假绿、复用与隔离正确；focused/全仓数字
  实测一致。**No P0/P1 findings。**
- P2 已吸收：去掉 `marker.toolCallId ?? "call-1"` 回退并显式断言 marker
  契约（follow-up-process / waiting-resume / waiting-control 三处统一，
  用本地 const 捕获避免 TS 属性窄化跨 await 失效）；补 follow-up 队列项的
  payload 与 caller 跨进程保真断言。
