# 第八十一轮：waitForFollowUpQueueDrain 有界排空等待

## 状态

第八十轮记录的下一个候选落地：follow-up 链排空等待。宿主入队 N 个
follow-up 后需要等整条链跑完再回写汇总；现有 API 只能自写
「activeInvocationId === null && items.length === 0」轮询。本轮新增纯读侧
`waitForFollowUpQueueDrain`，并把跨进程 follow-up-process 测试重构为直接使用
该 API。用户保护文件未纳入范围。

## 规划依据

- 第八十轮 Kant 调查候选 B：与 waitForInvocation 同机制的 follow-up 链排空
  等待，覆盖 coordination/follow-up-process 两处已有循环；paused 视为稳定态
  返回，是否继续等由宿主决定。
- 设计细化（实现前核对 watchFollowUps 时序）：链处理中 active null + 队列非空
  是瞬时态（完成后原子 start 下一项），若「active null 即返回」会假排空；
  因此返回条件限定为「active null 且队列为空」；paused 与 active waiting
  （审批待决）视为稳定态返回。

## 变更

- `src/harness.ts` 新增：
  - `FollowUpDrainTimeoutError`（sessionId/timeoutMs/lastItems/
    lastActiveStatus——P2 吸收后移除恒 false 的 lastPaused，改携带 active
    状态以说明阻塞原因）；
  - `waitForFollowUpQueueDrain(sessionId, options)`：每轮读 Snapshot +
    `projectFollowUps` 投影；返回条件（a）active null 且队列空（已排空）、
    （b）paused、（c）active waiting；否则轮询至超时/中止；signal/dispose/
    options 校验与 waitForInvocation 同款。
- 新增 `tests/wait-follow-up-drain.test.ts` 7 条：链完成后返回空队列
  （gate release 证明轮询）、paused 返回、waiting 返回（含 snapshot 断言
  active waiting + pendingApprovals）、超时携带 lastItems/lastActiveStatus、
  signal 中止、非法 options、dispose 拒绝 + Session 缺失传播。
- `tests/follow-up-process.test.ts` 重构：发现循环 + waitForInvocation 替换为
  `waitForFollowUpQueueDrain`（跨进程链排空等待），随后 snapshot 断言第二个
  Invocation 完成与结果投影。
- `scripts/pack-smoke.ts` Bun/Node consumer 补 `waitForFollowUpQueueDrain`
  prototype 与 `FollowUpDrainTimeoutError` 断言。

## 门禁

- focused：`bun test tests/wait-follow-up-drain.test.ts
  tests/follow-up-process.test.ts tests/wait-for-invocation.test.ts
  tests/coordination.test.ts` → `20 pass / 0 fail / 60 assertions`
  （4 files）。
- `bun run verify`：`435 pass / 0 fail / 1776 assertions`，69 test files；
  typecheck/build 通过。
- `bun run pack:smoke`：exit 0（首跑因环境负载触发 300s 测试上限被杀，重试
  通过）；prepack `435/0/1776`，113 files，package `136.5 kB`，unpacked
  `638.2 kB`；Bun/Node ESM consumers 通过。
- `git diff --check` 仅 Windows LF/CRLF warning。

## 结论与边界

- 等待族 API 闭环：`waitForInvocation`（单 Invocation）+ 
  `waitForFollowUpQueueDrain`（整条 follow-up 链），均为纯读侧、有界、
  不越 ADR-0001。
- 返回条件语义：paused/waiting 是稳定态（不会自行推进），helper 返回由宿主
  决策；瞬时态（active null + 队列非空）不返回，避免假排空。

## 未验证与保留边界

- 真实 NeuroBook/Cosmos consumer、真实 provider/tool、第三方 Store、
  HTTP/SSE 连接、浏览器/产品和生产验收仍未运行。
- 多轮 approval + follow-up 混合链未做端到端 worker 组合（由单元层覆盖）。

## 独立审查

- 只读独立审查（Plato）：返回条件语义正确（「active null + 队列非空」瞬时
  窗口确实存在且条件 (a) 正确避开假排空；waiting 提前返回是设计选择）、
  follow-up-process 重构断言等价且略强（drain 成功隐含第二次 start+consumed
  原子提交）、测试无 flaky。**No P0/P1 findings。**
- P2 已吸收：`FollowUpDrainTimeoutError` 移除恒 false 的 lastPaused 字段、
  改携带 lastActiveStatus（说明阻塞原因）；waiting 测试补 snapshot 断言；
  补 dispose 中止与 Session 缺失传播测试；doc comment 补超时宽松上界与
  interrupted 行为（P3）；pack 体积按最终门禁更新。
