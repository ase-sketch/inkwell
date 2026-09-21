# Agent Harness Black-Box Tests

## User Request

- 为 `docs/tasks/18-agent-runtime-pipeline-hooks/` 增加一组比较全面的 Harness 黑盒测试。
- 覆盖 `HARNESS-BLACK-BOX-CONTRACT.md` 操作矩阵和错误矩阵中的大部分核心情况。
- 使用真实 Harness API 模拟测试并观察，不需要监听前端 API；可以直接在测试脚本中获取 Harness SSE/session events。

## Goal

- 新增一组 Harness 黑盒集成测试，让 `NeuroAgentHarness` 的外部合同可以被稳定验证。
- 测试从用户 invocation 输入出发，观察四类结果：
  - invocation response
  - session writes / reduced session state
  - `AgentSessionEventHub` 事件流
  - final snapshot runtime state
- 使用真实 `NeuroAgentHarness`、真实 session JSONL repo、真实 `AgentSessionEventHub.subscribe()`；provider 使用 faux provider 控制成功、工具调用、waiting、错误和 partial error。
- 这组测试不走前端，不启动 HTTP/Nitro，不调用真实外部 provider。
- 第一版成功标准：能用一条测试命令稳定回答“某个 invocation 输入是否按黑盒合同改变了 session、事件流和 runtime snapshot”，并且失败时输出足够小的 trace，方便继续诊断。

## Scope Boundaries

- 本任务覆盖 Harness 黑盒集成层，不覆盖 Vue 组件、HTTP handler、浏览器 SSE reader。
- 本任务不引入真实 provider smoke。真实 provider 适合手动诊断，不适合进入这组自动化测试。
- 本任务不重构 Harness。测试先暴露合同偏差；偏差出现后另行决定改合同还是改实现。
- 本任务不把 Task 18 的所有矩阵格子一次性做完。第一批优先覆盖会阻塞 runtime 信心的路径。

## Current State

- Task 18 已经定义 Harness 黑盒合同，见 `docs/tasks/18-agent-runtime-pipeline-hooks/HARNESS-BLACK-BOX-CONTRACT.md`。
- 现有测试已经覆盖很多局部行为，但分散在 `neuro-agent-harness.test.ts`、event hub、前端 reducer、turn failure helper 等文件中。
- 当前缺少一组按黑盒矩阵组织的端到端 Harness 观测测试，用来回答：
  - 用户操作被接受、拒绝或入队后，session 和事件流是否一致。
  - provider/tool/waiting/error 的 terminal 行为是否符合合同。
  - 是否有工具或状态阶段会表现为事件流卡住。

## Walkthrough

- 2026-05-31：确认测试层级采用 Harness 集成层。测试直接调用 `createAgent()`、`invokeAgent()`、`getSessionSnapshot()`、`subscribeSessionEvents()` 和 session repo reducer，不走 HTTP endpoint，也不调用真实 provider。
- 2026-05-31：确认测试重点是黑盒观测，不是重测内部 helper。实现时应优先压缩事件和 session 结果为小型 trace，再按合同断言关键状态和顺序。
- 2026-06-01：落地 `server/agent/harness/neuro-agent-harness.black-box.test.ts`。测试使用真实 `NeuroAgentHarness`、真实 `JsonlSessionRepository`、真实 `AgentSessionEventHub.subscribe()` 和 faux provider，覆盖 14 个黑盒场景。
- 2026-06-01：测试实现过程中确认：精确 session role 断言不能依赖 `leader.default`，因为 builtin profile 会注入自身上下文；黑盒测试改用 `test.blackbox.*` 空 profile，避免 prompt/context 变化污染 Harness 合同断言。
- 2026-06-01：测试实现过程中确认：工具正常返回的 `{ isError: true }` 目前不会被 Harness 当成 fatal tool error；fatal error 由 tool throw / tool not found / not allowed 等执行链路错误产生。测试按当前协议区分“普通错误文本 toolResult 后模型继续”和“throw 后 terminal error”。
- 2026-06-01：补充 abort/stop 黑盒 slice。新增 WaitingUser + abort 和 Running + abort 两个场景，覆盖 abort resolution toolResult、`aborted` lifecycle、`invocation_aborted` event、active 释放、steer 清理、follow-up queue 按 aborted paused 且不自动消费。

## Decisions

- 测试文件已新建为 `server/agent/harness/neuro-agent-harness.black-box.test.ts`。
- 新增轻量测试夹具：
  - `beforeEach/afterEach`：创建临时 root、独立 faux provider、真实 Harness、真实 JSONL repo，并在结束后 drain background tasks / unregister provider / 删除临时目录。
  - `registerPlainProfile()`：注册 `test.blackbox.*` 空 profile，避免 builtin profile prompt/context 污染精确 session 断言。
  - `observeSession(sessionId)`：订阅 `harness.subscribeSessionEvents(sessionId)`，收集 `AgentSessionEventDto`，场景结束后关闭 subscription。
  - `runAndObserve()`：并发启动 observer 与 invocation，返回 `{ result, events, snapshot, sessionContext }`。
  - `eventTypes(events)` / `sessionRoles(context)` / `lifecycleStatuses(snapshot)` / `trace(events)`：把观测结果压成可读断言。
- 测试只断言黑盒语义和关键顺序，不断言私有函数或过细实现细节。
- 如果 faux provider 无法模拟 token 级 provider delta，Harness 黑盒层只验证事件顺序和最终语义；工具参数 delta 继续由前端 reducer 测试覆盖。
- 发现合同和实现不一致时，先让测试输出最小 trace，再决定改合同还是改 Harness。

## Test Harness Design

测试夹具需要把“真实 Harness 运行”包成可观察对象，而不是暴露一堆内部细节。

### Scenario Setup

- 每个 test 使用独立临时 root：`.agent/agent-harness-black-box-test/<uuid>`。
- 每个 test 创建独立 `registerFauxProvider()`，afterEach 必须 `unregister()` 并 `harness.drainBackgroundTasks()`。
- 默认 Harness 配置：
  - `repo: new JsonlSessionRepository(root)`
  - `modelResolver: () => faux.getModel()`
  - `enableSessionSummarizer: false`
- 测试 profile 优先在 test 内注册，名字使用 `test.blackbox.*` 前缀，避免依赖 builtin prompt 变化。

### Event Observer

- observer 直接订阅 `harness.subscribeSessionEvents(sessionId, { eventEpoch: harness.eventHub.eventEpoch, after: harness.eventHub.lastSeq(sessionId) })`。
- observer 不阻塞 invocation。实现上用后台 async collector 收集事件，场景结束后显式 `return()` 关闭 subscription。
- 需要等待特定 runtime event 的场景使用 `waitUntil()` 短轮询，超时时带 label 报错，避免测试无限挂住。
- 事件 trace 只保留必要字段：

```ts
type BlackBoxEventTrace = Array<{
    kind: "runtime" | "session";
    type: string;
    seq: number;
    invocationId?: string;
    messageRole?: string;
    entryType?: string;
    toolName?: string;
    status?: string;
}>;
```

### Snapshot And Session Trace

- 每个场景完成后读取：
  - `result`: invocation response。
  - `events`: observer 收集到的 session/runtime events。
  - `snapshot`: `harness.getSessionSnapshot(sessionId)`。
  - `context`: `harness.repo.reduce(await harness.repo.readSession(sessionId))`。
- 推荐断言 helper：
  - `expectSessionRoles(context, roles)`
  - `expectEventTypes(events, types)`
  - `expectNoDurableQueuedMessage(context, text)`
  - `expectFollowUpQueue(snapshot, status, count)`
  - `expectLifecycle(snapshot, statuses)`

## Implementation Slices

### Slice 1: P0 Happy Path And Observer

- 建立 test fixture 和 trace helper。
- 覆盖 Idle + `prompt`，包含一次 tool call。
- 覆盖 Idle + `continue`，确认不新增 user message。
- 覆盖 Idle + `steer/followup` admission reject。

验收：黑盒测试文件可以稳定运行，失败时能打印小型 trace。

### Slice 2: P0 Queue And Waiting

- 覆盖 Running + `steer`。
- 覆盖 Running + `followup`。
- 覆盖 WaitingUser + `continue(resolution)`。
- 覆盖 WaitingUser + `prompt/steer/followup` 入队但不写 durable history。

验收：queued message 在 drain 之前只是 runtime state，snapshot queue 与 session history 一致。

### Slice 3: P0 Error Semantics

- 覆盖 provider error before stream。
- 覆盖 provider partial error。
- 覆盖 tool recoverable error。
- 覆盖 tool fatal error。
- 覆盖 error 后 follow-up paused、steer 清理。

验收：terminal error 不留下未闭合 tool call；partial assistant 只保存可展示文本；queue 终态符合合同。

### Slice 4: P1 Recovery And Blocking Observation

- 覆盖 SSE same-epoch replay。
- 覆盖 `after > latestSeq` 返回 `snapshot_required`。
- 覆盖 old epoch cursor 不 replay 旧事件，只接收新 live event。HTTP/SSE connected handshake 与前端 snapshot hydration 仍由 reload recovery 相关测试覆盖。
- 覆盖慢工具阻塞观测：工具执行未结束前，已经能观察到 assistant/tool start 事件。

验收：事件恢复合同和“工具结果不流式但参数/开始事件不应卡住”这两个风险点有测试护栏。

### Slice 5: P1 Abort / Stop

- 覆盖 WaitingUser + `abort`：
  - waiting invocation 被 abort 后写 harness error toolResult 闭合 pending approval/user-input tool call。
  - 写 `aborted` lifecycle，发布 `invocation_aborted` / `session_state_changed`，释放 active invocation。
- 覆盖 Running + `abort`：
  - running invocation 被 abort 后清理 steer queue。
  - follow-up queue 在 `clearQueue: false` 时按 `aborted` reason 暂停，不自动消费。
  - 已入队但未被 drain 的 steer/followup 不进入 durable dialogue history。

验收：stop/abort 不留下 waiting pending、不会误消费 follow-up，也不会把 steer 带到下一个 invocation。

## Assertion Strategy

黑盒测试尽量断言“合同语义”，少断言实现噪音。

- 对事件流断言相对顺序：
  - `agent_start` 早于 `turn_start`。
  - assistant `message_end` 早于对应 turn 的 `session_entry` commit。
  - `turn_end` 后 session context 可见本轮 assistant/toolResult。
  - terminal `agent_end` 后 snapshot runtime 回到 idle 或 waiting。
- 对 session 断言 durable truth：
  - admission reject 不写 message / queue projection。
  - queued steer/followup 入队时不写 model-visible message。
  - drain 后才出现对应 user/harness message。
  - provider error before stream 不写空 assistant。
  - partial error 保存文本但剥离 tool call。
- 对 response 断言用户操作结果：
  - accepted completed: `status: "completed"`。
  - accepted waiting: `status: "waiting"`。
  - accepted queued: 返回 queued item。
  - runtime error: `status: "error"` 和 `errorInfo.phase`。
  - admission reject: Promise rejects，且 session/snapshot 不变。

## Planned Scenario Matrix

- Idle + `prompt`
  - 断言写入 user message、lifecycle start/end、assistant/toolResult turn entries。
  - 断言事件流包含 `agent_start`、`turn_start`、`message_*`、`tool_execution_*`、`turn_end`、`agent_end`、`session_entry`、`session_state_changed`。
- Idle + `continue`
  - 预置 user tail 后 continue，不新增 user message。
  - 断言从现有 dialogue tail 继续生成 assistant。
- Idle + `steer/followup`
  - 断言 admission reject，不写 session，不新增 queue。
- Running + `steer`
  - 用一个会进入第二轮的工具制造 safe point。
  - 在 running 中发 steer，断言入队事件先出现，drain 后才写成模型可见 user/harness message。
- Running + `followup`
  - 在 active run 中入队 followup。
  - 断言入队时不写 history，当前 run completed 后才消费一条 followup 并开启后续 run。
- WaitingUser + `continue(resolution)`
  - 用 `request_user_input` 进入 waiting。
  - 断言 snapshot 能看到 pending approval/input，continue 后写 resolution toolResult、lifecycle resumed，并复用 logical invocation。
- WaitingUser + `prompt/steer/followup`
  - 断言 prompt/followup 入 follow-up queue，steer 入 steer queue；waiting UI 状态保持。
  - resolution 后 steer 在下一次 model request 前生效。
- Provider error before stream
  - faux provider 返回空 content + `stopReason: "error"`。
  - 断言保留 user message，不写空 assistant，写 lifecycle error，response 为 `status: "error"`。
- Provider partial error
  - faux provider 返回 text + toolCall + `stopReason: "error"`。
  - 断言保存 partial assistant text，剥离 tool call，message status 为 partial/error，写 lifecycle error。
- Tool recoverable error
  - 注册一个正常返回失败文本的工具。
  - 断言 invocation 不失败，toolResult 作为普通工具结果提交，后续模型可继续处理。
- Tool fatal error
  - 注册一个 throw 的工具。
  - 断言本轮 tool call 被合法 error toolResult 闭合，invocation terminal error，事件流和 snapshot 不留下 pending tool call。
- Error 后 queue 语义
  - running 中入 followup，再让 provider/tool error。
  - 断言 follow-up queue paused，不自动消费；steer queue 清空或标 failed。
- SSE replay / snapshot recovery
  - 用 `eventEpoch + after` 订阅 replay。
  - 覆盖 same epoch replay、after ahead -> `snapshot_required`、old epoch 不 replay stale events 且只接收新 live event。
- WaitingUser + abort
  - 用 `request_user_input` 进入 waiting。
  - 断言 abort 写 error toolResult 闭合 pending tool call、写 `aborted` lifecycle、发 `invocation_aborted` 和 `session_state_changed`，并释放 active invocation。
- Running + abort
  - 在 active run 中入队 steer/followup 后 abort。
  - 断言 steer queue 清空，follow-up queue 以 `aborted` 暂停，不自动消费，queued 文本不进入 durable dialogue history。

## Deferred Scenarios

这些先不放进第一批，避免测试范围膨胀：

- HTTP endpoint / Nitro route / browser SSE reader。
- 真实 provider API smoke。
- abort endpoint 全矩阵。当前黑盒套件已覆盖 waiting/running 两条最高风险 abort 语义；idle abort、aborting admission busy、clearQueue 全组合仍可后续按需扩展。
- model / thinking / plan mode command。
- tree/fork/retry command 全流程。
- summarizer/background metadata job。它属于 Task 17/后续后台任务，不作为本任务第一批 Harness 黑盒测试目标。

## Tool Blocking Observation

- 增加一个慢工具 `slow_tool`，执行时等待一个 Promise。
- 测试触发 `slow_tool` 后，在 Promise resolve 前检查已收到事件：
  - 应已收到 assistant tool call 的 `message_end` 或对应 `tool_execution_start`。
  - 不要求工具结果流式输出，因为当前明确不做 Pi `onUpdate` / tool result streaming。
- 这个测试用来区分：
  - provider/tool 参数阶段是否卡住。
  - tool 执行结果阶段是否只是按设计等待最终 `tool_execution_end`。

## Tool Streaming Chain Audit

当前“工具看起来卡住”的链路已经拆成四层：

1. Harness runtime event：
   - `executeToolWithEvents()` 会先 emit `tool_execution_start`，再进入 `executeTool()`。
   - 黑盒 `slow_tool` 测试证明慢工具未 resolve 前已经能观察到 assistant toolcall delta 和 `tool_execution_start`。
2. HTTP/SSE transport：
   - `/api/agent/sessions/[sessionId]/events` 启动后台 subscription pump 后立即返回 `eventStream.send()`。
   - `pushAgentSessionEvent()` 每个 envelope 按 `payload.event.type` 推送 SSE frame。
3. Frontend stream reader：
   - `readSseStream()` 按 `\n\n` frame 增量解析，逐帧调用 `onEvent`。
   - 这里没有等待 invocation HTTP response 完成的逻辑。
4. Frontend projection：
   - `useAgentSession.applyEvent()` 只批处理 `message_update`，不会批处理 `tool_execution_start` / `tool_execution_end`。
   - 工具事件到来前会先 flush pending `message_update`，避免工具参数 delta 留在下一帧。
   - `applyRuntimeEventToMessages()` 会用 `tool_execution_start` 创建或更新 live 工具气泡；如果真实 assistant toolCall 稍后到达，会移除 fallback 气泡并合并状态。

因此，第一轮结论是：

- 已有证据不支持“SSE transport 整体卡住”。
- 已有证据支持“工具执行开始事件可以早于工具结果到达”。
- 如果某个具体工具仍然表现为卡住，下一步应定位该工具在 provider toolcall delta 阶段是否真的产生了 `message_update`，以及 `tool_execution_start` 是否在工具运行前被 emit。
- 目前不做工具结果流式输出；`tool_execution_update` 只作为未来工具主动 `onUpdate` 的通道，不应作为本轮完成标准。

## Files Changed

- `docs/tasks/25-agent-harness-black-box-tests/README.md`
- `docs/tasks/18-agent-runtime-pipeline-hooks/README.md`
- `server/agent/harness/neuro-agent-harness.black-box.test.ts`
- `PROJECT-STATUS.md`

## Verification

- 已通过：
  - `bunx vitest run server/agent/harness/neuro-agent-harness.black-box.test.ts --reporter=dot`
- 结果：
  - 1 个测试文件通过。
  - 16 个 Harness 黑盒场景通过。
- 已通过相关前端投影回归：
  - `bunx vitest run server/agent/harness/neuro-agent-harness.black-box.test.ts app/components/novel-ide/agent/useAgentSession.test.ts app/components/novel-ide/agent/agent-message.test.ts app/utils/agent-message-projection.test.ts --reporter=dot`
- 结果：
  - 4 个测试文件通过。
  - 58 个相关测试通过。

## TODO / Follow-ups

- 后续如继续发现工具卡住或恢复异常，优先把新现象补进本黑盒套件，再判断是合同偏差还是 Harness 实现偏差。
- 后续可按需补充 deferred 场景：abort endpoint 剩余组合、HTTP/Nitro SSE reader、tree/fork/retry command、真实 provider smoke、summarizer/background metadata job。
- 已把黑盒测试命令追加到 Task 18 Verification 记录；后续如要进入 CI，可直接使用同一命令作为 agent runtime smoke gate。
