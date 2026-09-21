# NeuroAgentHarness

一个面向多宿主的 Agent Harness：提供 Profile、Run Kernel、append-only Session、Invocation 生命周期、approval、compaction、顺序/并行工具循环、事件恢复，以及可替换的 Session Store 与 Model Runtime。

当前阶段是独立库开发与合同验证；llmlint 已通过宿主侧 Pi ModelRuntime、Prisma SessionStore、Profile/Capability、commit observer 和 SSE Adapter 消费公开包；Cosmos 风格覆盖仍是 deterministic compatibility test，NeuroBook 与 Cosmos 均未接入，测试不等同于真实网络 Provider 或生产集成。

## 安装

```bash
bun add @notnotype/neuro-agent-harness@0.1.0
```

Node.js 22 ESM 项目也可以使用 npm 安装；包内只包含编译后的 ESM、类型声明、README、CONTEXT、CHANGELOG 和许可证。

## 设计目标

- 默认保留 `sessionId: number` 与 JSONL Session 存储。
- JSONL 只是第一方 Adapter；测试使用 Memory Store，未来可接 Prisma。
- NeuroBook 的 `NeuroSessionContext`、Skill Catalog、Variables、Profile Home、Low-Code Form、Project Workspace 通过 Session projection、Host Context、Capability 和 Profile Facet 承载，Core 不硬依赖这些产品概念。
- Snapshot 是恢复真相源；事件使用 `(eventEpoch, seq)` cursor。`HarnessSnapshot.cursor` 是先于返回 Session projection 的 replay-safe cut，读取/写入窗口内的 durable event 允许与 Snapshot 重叠但不能被静默跳过；消费者按 seq、稳定 Entry ID 和 Session version 单调合并。
- Event cursor admission 要求任何正数 `after` 都带同一 `eventEpoch`；缺少 epoch 的非零 cursor 只返回 `snapshotRequired` 而不 replay。`after: 0` 与空 cursor 仍可作为初始订阅边界。
- `SessionEventHub` 在 publish 时 detach/freeze event，并用 event count + serialized bytes 限制每个 Session replay 与每个 subscription live queue。共享 Hub 的同名 Session 绑定一个 Store Adapter 对象与一个 Harness-observed opaque creation generation；identity/generation 变化、durable batch version 倒退/重复/跳跃或 batch 序列化失败会在发布 entry/status 前 fail closed 为 `snapshot_required(commit_order)`，换 Store或复用 ID 必须换 Hub/epoch。overflow 只关闭落后的订阅；`return()`/`throw()`/Hub close 立即释放，explicit `close()` 保留 graceful drain。HTTP/SSE frame、socket backpressure、heartbeat、鉴权与 reconnect 仍由宿主 Adapter 负责。
- `dispose()` 首次调用建立共享 shutdown barrier并关闭新 admission；barrier 等待已进入的 Invocation/mutating operation、active completion、后台协调和 Harness-owned resource。已经开始的 Store create/commit 会在 barrier 内完成 publication，read/validation 后尚未开始 mutation 的操作会停止。纯 Snapshot/queue-state read 不承诺 drain；injected Event Hub 仍由宿主在所有相关 Harness barrier 完成后关闭。
- Tool 和 Profile 不获得完整 Harness 或 Store，避免穿透 Module。
- `ValueSchema.parse(raw)` 只在外部边界产生 Parsed Value；Session initial、Invocation input、durable follow-up payload 和 codec draft 保存该 canonical JSON。后续使用 `validateParsed` 验证并原样复用，不重新转换；未提供 validator 时，`parse(parsed)` 必须返回 JSON-equal 值。schema callback 必须是纯函数且确定；Tool transcript/approval 保留的 provider raw arguments 可在恢复后再次 decode。非幂等 decoder 使用 `defineSchema({parse, validateParsed, jsonSchema})`，identity validator 与幂等 normalizer 可继续使用原 `defineSchema(parse, jsonSchema)`。
- `ProfileManifest.version ?? 1` 是 Profile 对 durable Invocation 的 approval-resume 兼容声明；新 Invocation 持久化有效版本，legacy 缺字段按 1，显式 `null`/非法值 fail closed。版本不匹配会在 durable claim、Capability、prepare、Tool 和 Provider 前拒绝并保持 waiting；通过校验的 resume attempt 固定使用该次解析的 Profile，不被 claim 等待期间的 replacement 重定向。改变已批准动作的参数解释、approval、handler 或相关运行语义时宿主必须 bump，同版本 replacement 表示兼容。自定义 Store 必须保留 additive `InvocationRecord.profileVersion`。
- `PreparedRun.tools` 中的 Tool name 是每次 prepare 结果内的 provider-visible identity，必须精确唯一；重复定义在 prepare writes、Model、approval 与 Tool 副作用前失败，Core 不自动改名或添加宿主 namespace。
- Session Status 是 durable active Invocation 的 projection；低层 `setStatus` 不能把 running/waiting owner 伪装成 idle/archived，也不能在无 owner 时伪造 active 状态。`aborting` 是 active owner 唯一允许的 overlay。
- active Invocation 的 Store commit 可携带 runtime-only `SessionCommitOptions.signal`；Memory/JSONL Adapter 在最终 durable write 前响应 abort，普通迟到计划不会在 `aborting` overlay 下落盘。该 signal 不进入 Session/JSONL/Event，abort terminal 明确绕过它；第三方 Store Adapter 需复用 `assertSessionCommitNotAborted()` 才能提供同等保证。
- aborted Invocation 的 durable terminal 只保存取消事实，不保存 provider、forced-abort 或 waiting owner CAS 的错误正文；本地 cooperative `InvocationResult` 仍可携带原始诊断，failed Invocation 的 error persistence 不变。旧 Snapshot 中已有的 aborted error 也不会在恢复 projection 中继续暴露，但不会改写历史记录。
- Model Runtime 最终 assistant message 的 Tool Call ID 必须是非空字符串，并在当前 active durable transcript 内唯一；Harness 在 assistant commit、approval waiting 与 Tool 调度前拒绝冲突。无效 message 不持久化，已发生的 Model usage 仍进入 terminal fact；旧 waiting transcript 的 call/result 关联按 occurrence 恢复。该 ID 不是外部副作用幂等键。
- Model Runtime 的 `model_event` 是 final-message admission 前的 provisional stream，`tool_call_delta` / `message_end` 可能携带最终被拒绝的 ID。它只用于实时展示，不能授权 Tool 或 approval 副作用；宿主以 Invocation result 与 Snapshot 对账。
- approval waiting/resume、compaction 切分与并行 Tool commit 顺序由 Harness 统一维护；approval resolution 会先以 durable owner/version CAS claim waiting Invocation，同一 observed transition 的并发 contender 至多一个进入获批 Tool。这只约束 Harness admission：Tool 外部成功后若进程在结果 commit 前崩溃，结果仍可能 unknown，exactly-once 继续由宿主幂等/查询/补偿负责。
- Tool `writePlans`、Profile `prepareWrites` 与 hook effect `writePlans` 数组在各自路径先整批通过 commit 守卫与纯投影校验，再逐 plan CAS 提交；任一 plan 内部不合法时整批在任何 durable 写入前失败。并发外部 CAS 冲突仍可能留下较早 plan 的写入，不承诺原子批或 exactly-once。
- steer/follow-up 由 Invocation Coordinator 管理；running attempt 的 steer payload 使用 start/resume 时捕获的 Active Profile Binding，Registry replacement 不会把 v2 parser 混入仍由 v1 驱动的 run。durable follow-up 以 Store 中的 active owner 做 CAS admission，因此可从独立 Harness 向同一 Session 排队；cancel/reorder 在 observed queue 已变化时 fail closed。自动 drain 失败会 durable 自动 pause 并携带 `pausedBy {itemId, reason, message}`；failed/aborted 终态同样自动暂停并携带 `{itemId, reason: "error" | "aborted", invocationId}`（宿主 cancel/reorder 队首后 `resumeFollowUps()` 恢复；手动 resume 失败仍原样抛出）。summarizer 等后台任务通过 commit Workflow Scheduler 扩展。
- `harness.followUp.*` 是 Core-owned entry namespace；宿主通过 `harness.write()` 或 Profile/Tool effect 扩展 Session 时使用自己的 kind，不能绕过 Coordinator 伪造 queue/control/consume facts。
- Workflow 可组合 `forkSession()`、rewind、SessionWritePlan、`invoke()` 与 strict `invokeAt(anchor)`；`forkSession` 从源 Session 的 active path 派生持久副本（复制 `agent.message` 与宿主条目，丢弃 usage/partial/compaction/followUp 内部事实与 Invocation/approval/queue，`parentSessionId` 溯源，不修改源）。两种 Invocation request 都可用 runtime-only `signal` 把父取消连接到当前 handle 的 bounded abort。Core 不内置 sidecar 或 durable Workflow cancel。
- `CommitWorkflowScheduler` 为 commit 后的 best-effort handler 提供 same-key dirty rerun 合并；`dispose()` 默认给合作式 `run` / `onError` 150ms abort grace，随后只收口 Scheduler 自己的 admission/queue。它不会终止 handler 持有的网络、进程或外部副作用，也不是 durable Job Runtime。
- `ContextMessageSections` 提供 provider-neutral 的 `history → transcript → modelContext → modelContextAppending → appending` 请求组装；`PreparedRun.contextProviders` 可按每轮最新 Snapshot 解析只读的当前-request context；approval-resume 使用可重建的 Snapshot 边界。
- `prepareWrites` 中的 `agent.message` 贡献自第一百零三轮起（ADR-0039）在落盘后自动注入当前 Invocation 的模型请求（单源合同：同轮立即可见且恰好一次，顺序先于当前用户消息；双写 context sections 的消费方会重复，需迁移）；Tool/hook writePlans 的同轮注入不吸收。
- 宿主需要把 History/Appending contribution 写入 canonical transcript 时，可用根导出的 `createAgentMessageEntryDraft(message, {turn, invocationId, messageIdentity, parentId?})`；它只构造 draft，marker、去重和生命周期仍由 Adapter 通过同一 appendEntries plan 管理。
- `ReadCapability` 提供 opaque reference 的宿主授权文本读取 seam；offset/limit、provenance、截断和路径/权限策略由宿主 Adapter 决定，Core 不直接读取文件系统。根导出的 `createReadTool({capability})` 是显式 opt-in 的 Capability-bound Tool Adapter，只映射 content/details，不创建 token、注册 Tool 或决定路径权限。Tool arguments/details 会按普通 transcript 合同持久化，因此 reference/provenance 不能携带 credential。
- JSONL 默认保持完整 Snapshot record，也可启用 delta + checkpoint 实验模式；本地文件系统上的 Session ID 分配使用目录级跨进程 lock，初始文件以 per-session lock + exclusive create 防止重复成功或覆盖，损坏的 sequence 会 fail closed。commit 继续在 CAS 通过后修复 crash 尾残片。默认不自动接管 stale lock，也不承诺无锁 read 线性一致或网络文件系统语义。
- 宿主可以在 `settleFailure` Hook 返回结构化 output；Harness 会在 abort/failed terminal commit 前持久化它，支持改写类 Profile 保留部分结果。
- `InvocationResult.persistence` 区分 Store 已确认的结果与本地 attempt 已结束但持久状态未知的结果；terminal plan 会原子追加非零的 `harness.invocation.usage` fact。根导出的 `invocationUsage(snapshot, invocationId)` 对新记录读取该保留 fact，对旧记录回退到 transcript。
- Model Runtime 在失败 turn 已观察到 token 用量或可安全保留的半截输出时，可抛根导出的 `ModelTurnError(message, {usage, partial})`。`partial` 只接受完整 text/thinking block，不接受 Tool call；Harness 将它与 usage、failed/aborted terminal 原子提交为 `harness.invocation.partial` fact。
- Model Runtime 可声明可选 `contextWindow`（token）：声明且 Harness 配置了 `ContextCompactor` 时，每轮模型调用前用 `compactor.estimate` 估计请求消息，估计超过窗口即 fail closed（明确错误、不发送超窗请求）；未声明或无 compactor 时守卫跳过（Core 无内置 tokenizer）。
- user 消息 content 可为字符串或引用块数组（ADR-0040）：attachment 块只携带 `{id, mimeType, bytes, name?}` 引用（provider-neutral、不携带数据），blob 存储/授权/hydration 留宿主；展示与估算用根导出 `userMessageText` 的 marker 降级（不读 blob）。
- 宿主实现 SSE Transport 可用根导出的 `serializeSseEvent`/`serializeSseComment`/`serializeSseJsonEvent` 生成 WHATWG event-stream 帧（ADR-0041）；HTTP 服务与连接管理留宿主。
- 宿主追加条目可用 `harness.appendEntries(sessionId, drafts, {cause?, expectedVersion?, expectedActiveInvocationId?})`，不必手拼五层 SessionWritePlan；Core-owned kind 仍被写 admission 拒绝，空 drafts 拒绝。
- `retry` 接受 `RetryOptions {caller?, messageIdentity?, signal?}`（旧 caller + messageIdentity 重载兼容）；它创建新的 Invocation，复用旧 Invocation 的 durable Parsed input，在 retry admission 时解析当前 Profile/Model，并记录 `retryOf` 与当前 `profileVersion`；它不是旧 Invocation 的 exact replay，`PreparedRun.modelConfig` 仍是 runtime-only，不写入 Invocation record。需要 exact replay 的宿主必须在 Adapter 层使用不可变的 Profile/Model binding。公共 admission 失败统一抛根导出的 `HarnessAdmissionError`（message 是合同），`AbortBoundaryError`/`InvocationWriteFenceError` 已导出。
- `JsonlSessionStore.listSessionIds()` 枚举当前目录下的正数 Session ID（重启恢复入口）；通用 `SessionStore` 接口不承诺枚举。
- `InvocationResult.partial` 暴露本地观察，根导出的 `invocationPartial(snapshot, invocationId)` 恢复已确认事实。partial 不属于完整 `agent.message`，不会进入 Provider retry 或 compaction；`persistence: "unknown"` 时调用方仍须回读 Snapshot。取消身份由 `AbortSignal` 决定，forced-abort 先完成时不会等待或补写迟到 usage/partial。
- 宿主编排器在进程重启后可用根导出的 `invocationResultFromSnapshot(snapshot, invocationId)` 重建 Invocation 结果视图：terminal（completed/failed/aborted）与 waiting（含 `pendingApprovals`）都返回 `persistence: "confirmed"` 的完整 `InvocationResult`（usage/partial/terminationReason/output/error 与 durable 恢复结果同规则，aborted 不暴露 error）；running、interrupted 或不存在的 Invocation 返回 `undefined`。它不读取 Store、不启动运行；Snapshot 含非法 usage/partial fact 时按 fail-closed 抛 `SessionInvariantError`。
- `NeuroAgentHarness.waitForInvocation(sessionId, invocationId, {timeoutMs, signal?, pollIntervalMs?})` 以公开投影为判据有界等待 durable 结果：terminal 与 waiting 都返回 `InvocationResult`（waiting 由宿主决定 resume），running/interrupted 视为未终态继续轮询——interrupted 是稳定态、不会自行终态化，宿主需先 retry 或 abort；超时抛 `InvocationWaitTimeoutError`（携带最后状态，上界约为 timeoutMs + 一轮 read + 一个轮询间隔），signal 中止以 reason reject。纯读侧、不启动运行、不新增 Job/Lease 语义；跨进程/重启后无需 handle 即可等待旁路 Invocation 收口。
- `NeuroAgentHarness.waitForFollowUpQueueDrain(sessionId, {timeoutMs, signal?, pollIntervalMs?})` 有界等待 follow-up 链排空：队列为空且无 active Invocation 时返回；队列已暂停或 active Invocation 处于 waiting（审批待决）视为稳定态直接返回（由宿主决定后续）；超时抛 `FollowUpDrainTimeoutError`（携带剩余项数与 active 状态，interrupted 视为未终态）。纯读侧；宿主入队 N 个 follow-up 后可等整条链跑完再回写汇总。
- `NeuroAgentHarness.compactSession(sessionId, {keepRecentTokens, instructions?, signal?})` 宿主驱动的历史折叠：在 idle Session 上复用自动压缩的切分/摘要/落盘语义（对齐投影、pending Tool Call 拒绝、keepRecent walk-back、toolResult cut、空窗口 skip、悬挂 firstKeptEntryId fail-closed），写入不带 invocationId 的 `agent.compaction` entry，返回 `{compacted}`；有 active Invocation 抛 `InvocationConflictError`，未配置 ContextCompactor 时明确失败，摘要失败抛错且不落盘，不创建 Invocation、不发布 invocation-scoped runtime 事件（ADR-0037）。`CompactionRequest.instructions` 可选摘要提示。

## 开发

```bash
bun install
bun run verify
bun run pack:smoke
```

`bun run test` 直接以 `bun test --parallel=1` 串行运行（Windows 上默认
并行 worker 曾间歇性停滞，第九十三轮起改为串行，约 40s 完成全量）；单个
用例默认 5 秒超时（见 `bunfig.toml`）。需要进程级总时限兜底时用
`bun run test:bounded`（`TEST_TIMEOUT_MS` 可覆盖）——bun 的用例级超时对
永不 resolve 的挂死不保证生效，进程级强制终止是 CI 场景的最终防线。

## 包结构

- 根导出：Harness、Profile、Tool、Capability、Session/Event/Model 合同，包括 `ValueSchema.validateParsed`、`parseSchemaValue()` / `validateParsedSchemaValue()`、bounded `SessionEventHub` options/metrics/subscription lifecycle、typed `ModelTurnError`、`InvocationResult.partial` 与 `invocationPartial()`。
- 根导出还包含 Workflow、`invokeAt` anchor 合同、Context sections helper、`ContextProvider`、`createAgentMessageEntryDraft`、`ReadCapability` 合同、opt-in `createReadTool`、`invocationResultFromSnapshot`、`defineAgentInvokerCapability`/AgentInvoker（宿主间受限调用）、`defineSessionEntryCodec`（类型化宿主条目）与错误族（SessionConflictError/SessionNotFoundError/SessionInvariantError/InvocationConflictError/InvocationOwnershipError 等）。
- `storage/memory`：测试与本地原型 Adapter。
- `storage/jsonl`：正式 JSONL Adapter，默认正整数 Session ID；同时导出 Busy/Corrupt/Lost/I/O lock error taxonomy。

## 实现自定义 SessionStore

- 通用 `SessionStore` 六方法：`allocateId()`（会话 ID 分配）、`create(input)` 与 `read(sessionId)`（结果必须经 `normalizeSessionSnapshot` 归一，损坏状态 fail closed）、`commit(plan, options?)`（以 expectedVersion/expectedActiveInvocationId 做 CAS，并尊重 `SessionCommitOptions.signal` 的运行时取消）、`reconcileInterrupted()`（把残留 running owner 收口）与可选 `dispose()`。
- 复用点：纯投影 `reduceSessionWritePlan`/校验与 `normalizeSessionSnapshot` 从根导出，Memory/JSONL 是第一方实现参考；宿主导出自己 store 时保持 append-only 事实与事件发布顺序。
- `tests/store-contract.ts` 的契约套件是第一方 Store 的行为基线（暂不随包分发）。
- `testing`：Scripted Model Runtime 等黑盒测试工具。

## 许可证

AGPL-3.0-only。
