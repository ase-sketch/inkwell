# 第八十七轮：follow_up_queued 正向运行时事件覆盖

## 状态

第八十六轮结论列出的 session 事件覆盖缺口：`follow_up_queued` 仅有
`tests/harness-dispose.test.ts:811` 的拒绝路径负向断言，无正向运行时覆盖。
本轮补齐，并顺带做 NeuroBook parity 扫描作为规划证据。纯测试轮（无
`src/` 变更）；用户保护文件未纳入范围。

## 规划依据

- 第八十六轮 walkthrough 未验证节：「`follow_up_queued` 的正向运行时 smoke
  仍未补（拒绝路径已有断言）；该事件由 follow-up 入队路径发布，低风险」。
- `docs/events-inventory.md`：`follow_up_queued` 发布点 `src/harness.ts:468`
  （follow-up 入队，durable commit 之后）。
- NeuroBook parity 扫描：自 08-08（第七十一轮扫描）以来共 7 个提交，其中
  6 个 README 文档提交；唯一非文档提交 `0fe36034`（08-08）只改桌面安装
  test 与 `turn-transaction.test.ts` 的 fake frame（为消息补显式
  timestamp），无生产 Harness 行为变化，无需吸收。

## 变更

- 新增 `tests/follow-up-events.test.ts`：门控模型阻塞第一次 invoke 期间调用
  `harness.followUp()`，断言：
  - 发布 `follow_up_queued`（本场景实际恰好 1 条；断言为至少 1 条且载荷
    匹配），`item.id` 与返回的 `QueuedInvocationInput.id` 一致，
    `payload` 等于入队载荷、`caller` 默认
    `{kind: "system", name: "followUp"}`、`messageIdentity` 默认 `"user"`；
  - 当前 Invocation 完成后自动启动 follow-up，`follow_up_started` 携带同一
    `item.id`（与 coordination/process 测试的自动启动行为一致）；
  - 收尾后 `followUpState().items` 为空（item 已被消费），证明事件对应
    durable 队列项而非内存态。
- 初版在 `followUpState` 断言前调用了 `harness.dispose()`，报
  `NeuroAgentHarness 已 dispose`；把 `dispose` 移到断言之后修正。

## 门禁

- focused：`bun test tests/follow-up-events.test.ts tests/steer-events.test.ts
  tests/coordination.test.ts tests/follow-up-process.test.ts
  tests/harness-dispose.test.ts` → 实跑
  `27 pass / 0 fail / 127 assertions`（5 files）。
- `bun run verify`：`443 pass / 0 fail / 1820 assertions`，74 test files；
  typecheck/build 通过（39.51s；本轮一次被 600s 兜底杀掉的运行是用户其它
  并发 Codex 会话负载所致，进程审计确认无本仓孤儿进程后重试即通过）。
- `bun run pack:smoke`：未运行——本轮无 `src/` 变更，包内容与第八十一轮已
  验证状态一致。
- `git diff --check` 仅 Windows LF/CRLF warning。

## 结论

- session 事件全部类型完成正向或负向运行时覆盖：
  entry/status/snapshot_required/follow_up_state/follow_up_started/
  steer_queued/steer_drained 与 follow_up_queued（本轮）有正向断言；
  runtime 12 类型与 host 2 类型此前已闭环。事件面运行时覆盖全部完成。
- NeuroBook parity：08-08 后无生产 Harness 变更可吸收；独立库仍领先
  对照消费者（master 领先 origin 89 个提交）。

## 未验证与保留边界

- 真实 NeuroBook/Cosmos consumer、真实 provider/tool（含真实流式 SDK）、
  第三方 Store、HTTP/SSE 连接、浏览器/产品和生产验收仍未运行。
- 事件面覆盖已闭环；下一候选：NeuroBook parity 深度对照（生产代码差异逐项
  核对）、Tool/API 组合切片（多轮 approval + follow-up 便利）、或既有
  ADR acceptance 收尾审计。

## 独立审查

- 只读独立审查（Chandrasekhar）：断言与 `followUpOnce` 实现（443-468 行）
  及事件类型定义逐项一致、无空转断言（`toBeDefined` 先行）、订阅终止条件
  经代码链验证（agent_end #1 → completeActive → watchFollowUps →
  follow_up_started → agent_end #2）不会挂起、`followUpState` 为空对应
  durable `harness.followUp.consumed` fact；focused `27/0/127` 实跑一致。
  **No P0/P1 findings。**
- P2 已吸收：master 领先数改为 89（`git rev-list --count
  origin/master..master`）；「恰好 1 条」改为「至少 1 条且载荷匹配（本场景
  实际恰好 1 条）」；host 计数口径改为「1 个类型含 2 个 name」。
