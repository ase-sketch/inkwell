# NeuroAgentHarness Context

## Language

**Session**：一个 append-only Agent 对话与运行事实集合。默认身份是正整数 `sessionId`。

**Session Status**：Session 对当前 active Invocation 生命周期或无 active owner 状态的投影；它不是可独立改写的第二份运行真相。

**Invocation**：在 Session 上执行的一次 Agent 运行。terminal Invocation 永不复活；retry 创建新的 Invocation。

**Interrupted Reconciliation**：启动恢复时把失去运行进程的 active running Invocation 收口为 interrupted 的 Store 操作。返回集合只表示本次调用实际提交的 transition。

**Harness Shutdown Barrier**：`NeuroAgentHarness.dispose()` 首次调用建立的终止生命周期 Promise；并发、重复或重入调用共享该 barrier。

**Shutdown Admission**：在 shutdown gate 关闭前已经进入、且可能产生 Harness-owned mutation 或 publication 的操作；Harness Shutdown Barrier 必须收口它的副作用边界。

**Tool Call Identity**：Model Runtime 为一个可见 Tool Call 提供的非空字符串关联 ID；在当前 active durable transcript 中只标识一次调用及其 Tool result / approval，不是外部副作用幂等键。

**Prepared Tool Identity**：`PreparedRun.tools` 中 provider-visible 的 Tool name；同一次 prepare 结果内必须精确唯一，Harness 用它关联 Model declaration、approval 与本地 Tool dispatch。

**Profile**：声明输入、输出、工具、运行策略与宿主扩展元数据的运行定义。

**Parsed Value**：`ValueSchema.parse()` 在外部输入边界产出的 canonical JSON。它可以被再次验证，但不得在 durable reuse 时继续转换。

**Durable Input**：Session initial、Invocation input 或 follow-up queue 中保存的 Parsed Value；它不是为以后重新解析而保留的 raw caller input。

**Profile Version**：Profile 对 Invocation 恢复兼容性的正整数声明；省略时有效版本为 `1`。同一版本表示宿主承诺 waiting approval 所依赖的 Tool、approval、Capability 与运行语义仍兼容，不是 Core 对任意函数闭包计算的内容哈希。

**Active Profile Binding**：一个 running attempt 在 start 或 resume admission 时捕获的精确 Profile 语义。Registry replacement 只影响之后的 Profile resolution，不局部替换该 attempt。

**Run Kernel**：执行模型 turn、工具调用、持久化 save point、终止和失败归并的核心 Module。

**Host Context**：宿主持久化到 Session metadata 的 JSON 数据。

**Capability**：宿主在运行期提供的类型化能力，例如 Skill Catalog、Variables、Profile Home 或 Project Workspace。

**Read Tool Adapter**：把宿主授权的 `ReadCapability` 事实映射为模型可见 ToolResult 的可选适配层；它不创建全局 token、不决定 reference/offset/path 权限语义，也不直接读取文件系统。

**Profile Facet**：库只保存和传递、不解释语义的 Profile 元数据，例如 Low-Code Form 或 Profile Home 声明。

**Session Store**：持久化 Session/Invocation/Entry 的 Adapter。JSONL 是第一方默认 Adapter，但不是唯一实现。

**Event Cursor**：由进程级 `eventEpoch` 与 Session 内单调 `seq` 组成的恢复位置。

**Snapshot Replay Cut**：`HarnessSnapshot.cursor` 表示 Snapshot 恢复的可重放下界。cursor 后发布的 durable event 可以已被返回的 Session 覆盖，但不能因 Snapshot 读取窗口被静默越过。

**Durable Event Causality Guard**：同一 Event Hub 中 Harness commit batch 的进程内 Store/generation/version guard。身份不一致、version 倒退/重复/跳跃或 batch 无法原子序列化时不发布误导性 entry/status，改为要求 Snapshot 恢复。

**Event Subscription**：进程内事件观察句柄，依次消费 bounded replay 与订阅后的 live events。它不是 durable fact、跨进程总线或 HTTP/SSE 连接。

**Event Replay Window**：Event Hub 为 cursor recovery 保留的有界进程内事件窗口。cursor 落在窗口之外时，消费者必须回到 Snapshot 恢复。

**Core-owned Entry**：由 Harness 状态机独占写入并由 Core 解释的 Session Entry。宿主扩展使用自己的 kind namespace，不能通过公开 write/effect 伪造 Core-owned fact。

**Entry Parent Reference**：Entry 在 Session tree 中指向直接上级的引用；`null` 表示 root branch，draft 省略该字段表示接在当前 active leaf 后。引用必须落在同一 Session 已经存在的 Entry 上。

**Active Leaf**：Session 当前选中 branch 的末端 Entry；`null` 表示当前没有选中的 Entry。

**Active Path**：从 Active Leaf 沿 Entry Parent Reference 回溯到 root 的有限链；悬挂引用和循环都使 Session 无效。

**Invocation Coherence**：Snapshot 中 Invocation 数组、`activeInvocationId` 与 Session Status 的结构一致性；重复 Invocation ID、悬挂或 terminal 的 active owner、非 active 的 running/waiting Invocation、以及无 active owner 的 `running`/`waiting`/`aborting` 组合都使 Session 无效。waiting Invocation 的 `pendingApprovals` 必须非空且 `toolCallId` 唯一，turnCount 不得低于其已提交 `agent.message` 最大 turn。

## Invariants

- Session ID 默认是正整数；JSONL Store 只接受正整数 Session ID。
- 同一 Store / Event Hub 生命周期内 Session ID 不得重用；同一 session event stream 只绑定一个 Store Adapter 对象与一个 Harness-observed opaque generation。Harness-mediated create 从开始到成功/失败持有 publication fence：pending 期间捕获的 commit 永远只要求 Snapshot，即使它在 create 结束后才返回；成功后绑定新 generation，失败则撤销 fence。即使 `metadata.createdAt` 相同也不复用旧 generation；绕过 Harness 直接替换 Store 中的同名 Session不可被 Event Hub 完整观察。更换 Store 实例、直接替换或重建同名 Session 必须使用新的 Event Hub / epoch。
- 第一方 JSONL `commit()` 在本地文件系统使用跨进程 per-session lock；malformed final record 只在 reducer/CAS 成功后修复。`reconcileInterrupted()` 只有在 `sessions` 目录不存在（`ENOENT`）时返回空恢复集，其它目录扫描错误 fail closed。默认不自动 stale takeover，也不宣称整个 Store process-safe。
- Session、Entry 和 Invocation 事实只追加；已有 terminal Invocation 不得修改为 running。
- Entry Parent Reference 只能指向同一 Session 中已经存在的 Entry；`null` 才能建立 root branch，不能持久化悬挂 parent、空 parent 或指向尚未生成的 Entry。Active Leaf 必须为 `null` 或已存在的 Entry，Active Path 必须可有限回溯到 root。
- `ValueSchema.parse(raw)` 产生 Parsed Value；Session initial、Invocation input、follow-up payload 和 codec draft 持久化该值，而不是 raw input。durable reuse 通过 `validateParsed` 验证并原样复用；缺少显式 validator 时只允许 parse 对自己的输出保持 JSON-equal。follow-up consume、retry、approval resume、Profile prepare 与 codec projection 不得继续转换 Parsed Value。
- 新 Invocation 持久化启动时的有效 Profile Version；旧 Invocation 缺失该字段时按版本 `1` 恢复，显式 `null` 或其它非法值不属于 legacy。waiting approval 只能由相同有效版本的当前 Profile 恢复，版本不匹配必须在 durable claim、Capability、Profile prepare、Tool 与 Provider 前失败并保持 waiting。一次 resume 已解析并通过版本校验后，本次 attempt 使用该 Profile；随后发生的 Registry replacement 不会把它重定向到新实现。宿主改变 Tool 参数解释、approval prompt/data、执行 handler、Capability 或其它影响已批准动作的语义时必须递增版本；同版本热替换声明恢复兼容。
- Active Profile Binding 包含该 attempt 的 steer payload parser；start 或 resume 后发生的 Registry replacement 不得让当前 attempt 混入 replacement parser。parser 失败仍在 queue mutation 与 event publication 前拒绝。
- 并发 Interrupted Reconciliation 必须收敛：竞争 loser 观察到同一 Invocation 已不再 active running 时跳过并继续扫描，不得再次完成它；无关的 Store、I/O、lock 或 invariant 错误仍然 fail closed。
- retry 必须创建新 Invocation，并记录 `retryOf`；它复用旧 Invocation 的 durable Parsed input，但按 retry admission 时的当前 Profile/Model 重新准备并记录当前 `profileVersion`，不是 exact replay。`PreparedRun.modelConfig` 是 runtime-only；exact replay 由宿主 Adapter 的不可变 Profile/Model binding 负责。
- 同一 Session 同一时刻最多一个 running Invocation。
- Session 存在 active Invocation 时，Session Status 必须匹配该 Invocation 的 `running` / `waiting`，或显式进入 `aborting`；没有 active owner 时不得伪造 `running` / `waiting` / `aborting`。`aborting` overlay 下普通迟到计划 fail closed，重启协调将未完成的 active owner 收口为 `aborted`。
- Snapshot 读取与恢复（`normalizeSessionSnapshot`，Memory/JSONL 共用）对 Invocation Coherence fail closed：Invocation ID 必须唯一，active owner 必须存在且处于 `running` / `waiting`，非 active Invocation 不得 `running` / `waiting`，Session Status 必须与 active owner 一致；写侧由 reducer 保证，读侧由该 admission 兜底，矛盾历史在 read/reconcile 前失败，不自动修复。
- waiting Invocation 的 approval fact 由同一读侧 admission 兜底：显式空或缺失 `pendingApprovals`、重复 `toolCallId`、或 turnCount 低于自身已提交最大 turn 的 Snapshot 在 read/reconcile 前 fail closed——空 approvals 会在 `resume()` 时绕过审批门禁直接执行 Tool，必须在恢复边界拒绝。
- aborted Invocation 的 durable terminal 只记录 `status: "aborted"` 及其它独立事实，不记录取消实现细节的 `error`；本地 cooperative result 可保留诊断，failed terminal 继续保存 error。恢复 projection 对 legacy aborted record 也不暴露 error，但不迁移既有记录。
- approval resolution 必须先以 observed version + durable Invocation owner CAS 将 waiting claim 为 running，再执行 Capability/Tool/Provider；竞争 loser 不得产生副作用。claim 后崩溃恢复为 interrupted，不自动重放；外部 exactly-once 仍不承诺。
- Model Runtime 的最终 assistant message 中，Tool Call ID 必须是非空字符串且在当前 active durable Session transcript 内唯一；Harness 在 transcript commit、approval waiting 和 Tool 副作用前拒绝冲突。被拒消息不进入 transcript，但 Provider 已返回的合法 usage 仍属于当前 Invocation。旧 durable transcript 的 pending/result 关联按出现次数顺序匹配，不能用全局 ID Set 把新的调用误判为旧结果。
- idle Session 的 durable transcript 存在未闭合 Tool Call 时，任何全新 Invocation 启动（invoke / invokeAt / retry / follow-up 自动启动）在 startInvocation 落盘前 fail closed（`存在未完成 Tool Call，不能启动新 Invocation`）；assistant 消息在 Tool 执行前提交，forced abort 或 Store 中途失败可能留下该状态，不得把悬挂 call 喂给 provider。只有 `resume()` 可以继续处理 waiting 的待批 approval call；悬挂状态需要宿主显式处理（如 fork 后继续）。
- `PreparedRun.tools` 的 Tool name 在本次 prepare 结果内必须精确唯一；Harness 在 prepare writes、Model request、approval request 与 Tool dispatch 前拒绝同名定义，approval resume 重新 prepare 后同样检查。Core 不自动 trim、改名或添加 namespace。
- Invocation-owned `SessionWritePlan` 可携带 `expectedActiveInvocationId`；Store 在 reducer 边界拒绝迟到 owner，active run 的 runtime commit 还可携带非持久化 `SessionCommitOptions.signal`，由 Adapter 在最终 durable write 前 fail closed。取消会先失效当前 run attempt，迟到 runtime event 不再发布；abort terminal 不受该 signal 拒绝。
- Tool `writePlans`、Profile `prepareWrites` 与 hook effect `writePlans` 数组按声明顺序整体 admission：所有 plan 先通过与 `commit()` 相同的守卫及纯投影校验，任一 plan 非法时整批在任何 durable 写入前 fail closed；全部合法后才逐 plan CAS 提交。并发外部 CAS 冲突仍可能留下较早 plan 的 durable 写入，exactly-once 由宿主负责。
- durable follow-up admission 以 Snapshot 的 `activeInvocationId` 为真相源，并在 queue commit 复核同一 owner；本进程 `active` Map 不是跨 Harness/重启事实。running/waiting owner 都可接收后续输入，owner 已 terminal 时不得留下孤立 queue item。cancel/reorder 依赖 observed pending item 集，必须用 Snapshot version 做 CAS，不能在 admission 已消费 item 后返回成功。
- `harness.followUp.*` 是 Core-owned Entry namespace；只有内部 admission/control/consume 路径可写。public `write()` 与 Profile/Tool effect 在 Store 前拒绝，已有 Store 记录继续读取。
- follow-up 自动 drain 失败（如队首 item 被当前 Profile 拒绝）时，Harness 发布 `follow_up_error` 并 durable 自动 pause：`harness.followUp.paused` 事实携带 `pausedBy {itemId, reason: "admission_failed", message ≤ 500 UTF-8 字节}`，`FollowUpQueueState.pausedBy` 投影该原因，`follow_up_state` 事件随之发布；宿主据 `pausedBy` cancel/reorder 队首后 `resumeFollowUps()` 恢复（resume 写入 `paused: false`，投影清除 pausedBy）。手动 `resumeFollowUps` 的失败仍原样抛出，不自动 pause。第九十三轮对齐 NeuroBook。
- Invocation 以 failed 或 aborted 终态结束时，follow-up 队列若非空且未暂停，Harness 在终态结果 resolve 后异步写入 durable 暂停事实 `pausedBy {itemId: 队首, reason: "error" | "aborted", invocationId}`（第九十九轮对齐 NeuroBook pauseFollowUps）；队列为空不写事实，completed 自动启动下一项。Tool 抛异常是普通可恢复 error toolResult（模型继续），显式 `ToolResult.terminate` 承载致命意图——与 NeuroBook 隐式 throw=fatal 的分流为既定设计。
- `agent.compaction` 是 Core-owned transcript projection fact；只有 Harness 内部的精确 compaction plan 可写。public `write()` 与 Profile/Tool effect 不得伪造它。
- 自动 compaction 的切分合同：触发后按 keepRecent 预算从消息末尾向前保留，keepRecent 恰好落在 `toolResult` 上时 cut 前移到匹配的 assistant toolCall（不出现半截 toolResult）；保留区为空（keepIndex ≤ 0）或待压缩窗口为空时不写 entry。previous summary 作为合成消息计入 keepRecent 预算与触发计数（与 NeuroBook 不计入的行为不同，SA 更保守，第九十轮测试钉住）；悬挂 `firstKeptEntryId` 在投影时 fail closed，不静默兜底。
- 手动压缩 `compactSession`（ADR-0037）：宿主在 idle Session 上显式折叠历史，复用同一切分合同；entry 不带 invocationId（`agent.compaction` 精确 plan 守卫允许「entry.invocationId 与 commit invocationId 一致」，两者皆 undefined 时通过）；有 active Invocation 抛 `InvocationConflictError`；不发布 invocation-scoped runtime 事件（`compaction_start/end` 绑定真实 attempt）。
- `InvokeRequest.signal` 只连接当前 handle 的运行期取消：durable start 前已取消则不创建 Invocation，start commit 成功后取消复用 bounded abort；signal 不持久化，也不跨 waiting/resume 或进程重启。active Invocation-owned Store commit 的 runtime-only signal 边界见 ADR-0034。
- Profile 和 Tool 不能直接操作 Session Store，只能返回 `SessionWritePlan` 或 Tool result。
- Read Tool Adapter 必须绑定调用方显式提供的 `CapabilityToken`；它只能映射 ReadCapability 的资源事实，不创建全局授权、不自动注册 Tool、不解释 path/offset 权限或读取文件系统。
- 宿主若需持久化 provider-visible context contribution，使用根导出的 `createAgentMessageEntryDraft()`；marker、去重和生命周期仍由 Adapter 管理。
- durable contribution（prepareWrites / hook writePlans / Tool writePlans 提交的 `agent.message` entry）对 ContextProvider 与下一 Invocation 的 provider request 立即可见；prepareWrites 中的 agent.message 贡献自第一百零三轮起（ADR-0039）在成功落盘后自动注入当前 Invocation 的 work-copy——首个模型请求立即可见且恰好一次、顺序先于当前用户消息（单源合同，双写消费方需迁移）；Tool writePlans 与 hook writePlans 的同轮注入不吸收（当前 Invocation 不可见、下一 Invocation 可见；ContextProvider 立即可见）。in-invocation compaction 使用最新 Snapshot 的对齐投影做触发/切分/摘要窗口，宿主贡献会进入摘要（或保留区）；第九十一轮修复了此前 work-copy/path 索引错位导致的「贡献被投影丢弃 + 摘要消息重复保留」缺陷。
- `PreparedRun.contextProviders` 只能基于当前 Snapshot 解析本轮 model-only context；不写 Session、不提供 History/settlement/Job 语义。
- Session commit 成功后才能发布对应持久事件。
- `snapshot()`、`createSession()` 和 `write()` 返回的 cursor 不晚于其 Session projection；Snapshot 与 replay 允许 overlap。消费者按 Event Cursor 去重同一 event、按 Entry ID 合并 `session_entry`，并只应用不低于当前 version 的 `session_status`。
- Event Cursor 的正数 `after` 必须与 `eventEpoch` 成对出现；缺 epoch 的非零 cursor 在 `SessionEventHub.subscribe()` 中 fail closed 为 Snapshot recovery，不 replay 当前 Hub 的 seq。`after: 0` 与空 cursor 保持初始订阅语义。
- EventHub 的序列化字节预算同时覆盖单事件与累积路径：单个事件超过 subscriber queue 字节预算（默认 1 MiB）即对慢消费者 fail closed（`queue_overflow`）；单个事件使 replay 字节预算（默认 4 MiB）越界时旧 cursor 立即要求 Snapshot。与 NeuroBook per-event 预算功能等价（第九十四轮钉住；第 58 轮审计结论成立）。等价性限定：介于 1 MiB 与 4 MiB 之间的事件对既有 live 消费者 fail closed，但新订阅者经 replay 原样收到（无 Snapshot 信号）；replay 驱逐后 cursor 恰在驱逐事件之后时可能静默跳过该事件而不要求 Snapshot——均为既有 ring 驱逐设计。
- Harness 将一次 commit 的 `session_entry` + `session_status(version)` 作为 durable publication batch；同一 package runtime 共享 Event Hub 时，Store identity、Session generation 与后续 version 必须一致/连续，否则整批替换为 `snapshot_required(commit_order)`。batch 在推进 seq/replay 前完成全量序列化；失败时不发布前缀，推进 durable baseline、发布 recovery signal 并向调用方保留错误。第一个 batch 建立进程基线；宿主直接 publish、跨进程 Hub 和 observer 派生 view 不由该 guard 排序。
- Runtime 流事件可以早于 transcript commit，但 Snapshot 始终是恢复真相源。Provider `model_event` 是 final-message admission 前的 provisional observation，可能包含最终被拒绝的 Tool Call Identity；订阅者不能据此授权 Tool/approval 副作用，必须以 Invocation result 与 Snapshot 对账。
- active attempt 发布 `turn_start` 后若在 turn 内失败，必须先发布一次 `turn_end(failed)`；已 completed/waiting 的 turn 不重复闭合。`agent_end` 只在 durable Invocation terminal 已确认后发布。
- 进入 approval waiting 的 turn 以 `turn_end(turn, waiting)` 闭合（工具待批而非完成）；resume 后从下一 turn 继续并以 `turn_end(completed)` 闭合，`agent_end` 序列为 `waiting → completed`。第九十二轮对齐 NeuroBook。
- `InvocationResult.persistence = "confirmed"` 表示 status、output/error 和 usage 能从当前 Snapshot 恢复；`"unknown"` 只表示本地 attempt 已结束，调用方必须回读 Snapshot，且 Core 不发布伪造的 terminal `agent_end`。
- terminal plan 用 append-only `harness.invocation.usage` entry 保存非零 aggregated `TokenUsage`，全零保持旧 plan 形状且不改变 `finishInvocation` operation keys；该 kind 由 Harness 保留。`invocationUsage()` 优先使用该事实，旧记录或非 terminal Invocation 回退到 active-path assistant transcript。Provider cost/cache/quota 元数据不进入 Core usage。
- `ModelTurnError.usage` 只表示当前失败 model turn 已观察到的 usage；Run Kernel 在 `model.runTurn()` 边界累加一次。普通 Error 的同名属性不被推断；取消身份仍由 `AbortSignal` 决定，forced terminal 先赢时迟到 usage 不突破 sealed fence。
- `ModelTurnError.partial` 只接受完整 text/thinking block；Run Kernel 以自己记录的 turn 将其作为 `harness.invocation.partial` 与 usage、failed/aborted terminal 原子提交。该保留事实不进入 `agent.message`、Provider retry 或 compaction；`InvocationResult.partial` 只有在 `persistence: "confirmed"` 时可由 `invocationPartial()` 从 Snapshot 恢复，forced terminal 先赢时不补写迟到 partial。
- Event cursor epoch 不一致、seq 超前或 replay 过期时必须要求 Snapshot。
- Event Hub publish 必须先 detach/freeze 可序列化事件再推进 seq；内部 batch publication 必须先完整 stage，再一次性推进 seq/replay，最后通知 live subscribers。Replay Window 与 subscription live queue 同时受 event count 和 serialized bytes 硬上限约束。explicit subscription close 保留 graceful drain；iterator return/throw、overflow 与 Hub close 立即释放未消费引用。
- Harness dispose 只关闭自己创建的 Event Hub；宿主注入的共享 Hub 生命周期仍由宿主管理。
- Harness Shutdown Barrier 只有在已进入的 shutdown admission、active Invocation completion boundaries、Harness background work、owned Event Hub 和 Store dispose 全部收口后才完成。shutdown admission 包含 Invocation start/resume，以及可能创建或修改 Session、写运行期协调队列或发布 Harness event 的 public mutation；已进入 create/commit 在 barrier 内完成，仍停在可取消 read/validation 的 mutation 在 shutdown recheck 后不得新增副作用。纯 `snapshot()` / `followUpState()` read 不承诺 drain。宿主必须等待所有使用 injected Event Hub 的 Harness barriers，再关闭共享 Hub。
- 正常 commit 在 durable publication 前等待 `SessionCommitObserver` 和错误报告器；若 callback 重入并等待 Harness shutdown，Core 在 shutdown 开始后脱离其剩余 Promise、完成 admitted durable publication，并继续观察迟到 rejection。派生 view 必须可从 Snapshot/entries 重建，不能把 callback completion 当作 durable truth。
- Host Context 必须是 JSON 可序列化数据；运行期对象通过 Capability 提供。
- Capability 运行期对象不持久化，但模型可见的 Tool arguments/result details 会进入 transcript；reference、provenance 等字段必须使用可持久化的非 secret 标识。
- Capability 在 run attempt 结束时逆序全部尝试关闭；cleanup 失败不覆盖 Store 已确认的 Invocation 结果，也不替换 persistence unknown 时的原始运行错误。
- Core 不依赖 NeuroBook、llmlint、Nuxt、Prisma、Vue 或具体 Project Workspace 布局。
- `InvocationError.phase` 对 Run Kernel 内部 stage 做细粒度归因（model/ingest/compaction/settleRun，对齐 NeuroBook）；内部 RunStageError 包装保留 cause 与 retryable 语义，未包装阶段保持粗粒度 run/abort/approval。
- ModelRuntime 可声明可选 `contextWindow`（正有限 token 数）；声明且 Harness 配置了 `ContextCompactor` 时，每轮模型调用前用 `compactor.estimate` 对请求消息求和，估计超过窗口即 fail closed（明确错误、不发送超窗请求、phase 归 run）；未声明或无 compactor 时守卫跳过（Core 不内置 tokenizer）。第一百轮对齐 NeuroBook assertContextWithinWindow。
- user 消息 content 可为字符串或引用块数组（ADR-0040）：attachment 块只携带 {id, mimeType, bytes, name?} 引用，不携带数据；展示/估算用根导出 `userMessageText` 的 marker 降级（不读 blob），hydrate 由宿主 ModelRuntime Adapter 负责；Core 不定义 blob 存储、授权、预算或 base64 策略。toolResult/assistant 输出暂不扩块类型。
- 宿主追加条目可用 `harness.appendEntries`（write 的便捷面，Core-owned kind 拒绝不变）；`JsonlSessionStore.listSessionIds()` 是 JSONL 特有恢复入口，通用 `SessionStore` 接口不承诺会话枚举。
- `retry` 支持 `RetryOptions.signal`（runtime-only，语义与 `InvokeRequest.signal` 一致：pre-aborted 不创建 Invocation，运行中取消复用 bounded abort）；公共 admission/用法失败统一抛根导出的 `HarnessAdmissionError`（12 处，message 原文是合同）；`AbortBoundaryError`/`InvocationWriteFenceError` 已从根导出。
- 第一方 SSE 帧序列化（ADR-0041）：`serializeSseEvent`/`serializeSseComment`/`serializeSseJsonEvent` 输出 WHATWG event-stream 帧；HTTP 服务、连接管理与 DTO 继续归宿主（事件 seam 不变）。
