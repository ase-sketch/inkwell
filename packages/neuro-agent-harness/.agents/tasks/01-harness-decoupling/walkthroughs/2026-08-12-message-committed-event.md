# 第七十二轮：message_committed 合同漂移修复

## 状态

第七十一轮独立审查发现的预存合同漂移：`HarnessRuntimeEvent.message_committed`
公开类型声明但全仓无发布点，按公开类型实现消息流式投递的宿主会永久等待。
本轮选择**补发布点**（而非移除类型）：在消息 durable 提交后统一发布
`{turn, message}`，使公开合同诚实且直接服务 SSE/UI 流式投递。用户保护文件
未纳入范围。

## 规划依据

- 第七十一轮审查（Hilbert）P2-1：`message_committed` 自 0.1.0 初始提交
  （07d1ae8）声明后从未发布，也无测试依赖；消息载荷目前只经 durable
  `session_entry` 事件投递，宿主需要解析 entry payload。
- 修复方向裁定：**补发布点**优于移除类型——类型从 0.1.0 起就是公开合同的
  一部分，`{turn, message}` 正是 live UI 流式投递需要的类型化事件；移除会
  破坏任何已按类型实现的消费者（预 1.0 版本仍以补发布为更小破坏面）。
- 发布点设计：`commitMessages` 是所有 run 路径（user/assistant/parallel
  toolResults/sequential toolResult）的统一消息提交入口，在 durable commit
  成功后逐条发布；`resolveApprovals`（approval resume）直接用 `commit`
  提交 toolResult 消息，补同款发布。`publishRuntime` 的 attempt fence 自动
  丢弃 abort 后的迟到发布。

## 变更

- `src/harness.ts`：
  - `commitMessages` 在 `commitWithFollowUpRebase` 成功后对每条消息发布
    `message_committed {turn, message}`（同 turn 批量消息按序发布）；
  - `resolveApprovals` 在 resumeApproval commit 成功后对 toolMessages 发布
    同款事件（approval_resolved 之前）。
- 新增 `tests/message-committed-event.test.ts` 5 条：
  1. 正常运行按序发布 user（turn 0）与 assistant（turn N），且 assistant
     事件位于 turn_start 与 turn_end 之间；
  2. 事件可见时 Snapshot 已含该消息（durable commit 之后发布）；
  3. 宿主 write 的非消息条目不发布（只发 session_entry）；
  4. sequential Tool 结果发布 `role: "toolResult"` 消息；
  5. approval resume 恢复的 Tool 结果也发布（collector 需忽略 waiting 的
     `agent_end` 继续收集到 terminal）。
- 测试绕道：`profile()` helper 的条件 tools 展开破坏泛型推断，改为简单
  profile + 工具测试内联 defineProfile（与既有模式一致）；collector 的
  TS 窄化在闭包内失效，先捕获 committedMessage 再入闭包。

## TDD 证据

初始 red：`0 pass / 5 fail`（无 message_committed 发布）。实现后 focused：

```text
bun test tests/message-committed-event.test.ts
6 pass / 0 fail / 19 assertions（含 P2 吸收后的宿主消息边界测试）
```

## 门禁

- focused 9 文件（message-committed + turn-failure-events + approval +
  parallel-tools + model-turn-partial + abort-boundary + invocation-ownership +
  sse-transport + cosmos-orchestration）：`69 pass / 0 fail / 264 assertions`
  ——新增 runtime 事件未破坏任何事件顺序/计数断言。
- `bun run verify`：`413 pass / 0 fail / 1691 assertions`，62 test files；
  typecheck/build 通过。
- `bun run pack:smoke`：exit 0；prepack `413/0/1691`，113 files，package
  `131.7 kB`，unpacked `620.6 kB`；Bun/Node ESM consumers 通过。
- `git diff --check` 仅 Windows LF/CRLF warning。

## 结论与边界

- 公开合同现在诚实：任何 `message_committed` 事件都保证消息已 durable
  提交（事件在 commit 之后发布）；宿主可同时消费 `session_entry`（durable
  replay）与 `message_committed`（live 类型化消息）而不重复显示——按事件
  类型分工，由 Transport 层决定。
- 发布受 attempt fence 约束：abort 后迟到提交不发布 runtime event（与
  既有「迟到 runtime event 不进 Session」语义一致）；该路径由既有
  invocation-ownership 套件覆盖。
- 未移除类型、未新增 ADR：这是把既有公开合同从「声明未实现」修复为
  「声明即实现」，不属于新架构决策。

## 未验证与保留边界

- 真实 NeuroBook/Cosmos consumer、真实 provider/tool、第三方 Store、
  HTTP/SSE 连接、浏览器/产品和生产验收仍未运行。
- `message_committed` 与 `session_entry` 的重复载荷问题由 Transport 层按
  事件类型分工解决；Core 不提供去重或合并视图。
- 编译期仍无法保证「每个公开事件类型都有发布点」；本轮修复的是已发现的
  唯一漂移，后续可在审查中继续核对类型与发布点的一致性。

## 独立审查

- 只读独立审查（Euler）逐路径核对发布点覆盖与语义：**No P0/P1 findings**；
  Harness 内部全部消息提交路径收口（commitMessages 5 个调用点 +
  resolveApprovals），compaction/follow-up/retry/recovery 无遗漏路径；
  durable 后置、无重复发布、turn 一致、attempt fence 无误丢；「补发布点」
  决策与 ADR-0036 Accepted 引用均成立。
- P2 已吸收：合同明确为「仅 Harness 发起的 transcript 提交发布」并补测试钉死
  （宿主 write 的 agent.message 只经 `session_entry` 投递）；`message_committed`
  类型注释补充边界与「跨事件类型相对顺序不作承诺」（sequential 与
  parallel/resume 的 end/committed 顺序不同，不违反合同但已注明）。
