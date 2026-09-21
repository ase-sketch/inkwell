# NeuroBook Extension Study

本文记录独立库 spike 对 NeuroBook 现有 Agent 系统的只读架构对照。目标是验证扩展 seam，不是制定迁移补丁。

## 2026-08-11 最近演进对照

基于当前本地 NeuroBook checkout 的最新相关提交，独立库不能把 NeuroBook Harness 行为当作已经兼容：

- `1c0a13d0`（2026-08-07）强化 Session recovery：主 Session 缺失仍返回明确 `SESSION_NOT_FOUND`，关联 Session 缺失则保留主 Session recovery，并分别投影 `linkedAgents`、`linkedByAgents` 和 `unavailableLinkedAgents`。这是 NeuroBook 的关系/DTO 投影合同，不应搬入 Harness Core；Core 只需保证 Store recovery 和宿主可组合的 Snapshot/Capability seam。
- `2e0c94a6`（2026-08-07）把 Agent Job 结果、delivery 身份、重启恢复和原子文件写入收敛到 NeuroBook 的 `AgentJobManager`。这进一步支持 ADR-0001：Job durable truth、delivery、SSE 和宿主回流继续留在 NeuroBook/Cosmos，不进入 Harness Core。
- `b1bc9feb`（2026-08-04）修复 adhoc 动态 `outputSchema` 的 `report_result` binding 漏判：动态或显式空 schema 要求 `data`，校验错误作为 Tool error 回灌，模型可以下一 turn 修正；无 schema 继续允许 text-only。standalone Core 不需要移植 `report_result`、TypeBox 或 binding DTO；同一 Profile 已可在 `prepare(initial)` 中生成动态 `defineTool()`，由 Tool 的 `ValueSchema` 同时驱动 provider schema 和执行校验，再用 `ToolResult.output + terminate` 收口 Invocation。
- `4179f736`（2026-08-04）把取消、provider failure、partial assistant 和 terminal projection 分层，并修复真实 Pi stream throw 时半截正文丢失。standalone ADR-0013 只吸收其中可独立证明的 failed turn runtime boundary；partial assistant、`stopReason`、message status、Pi stream catch 和 UI error projection 仍未进入 Core。
- 当前 Context 文档仍区分 `HistorySet` 首次稳定写入、`ModelContext` 本轮只读上下文、`AppendingSet` 持久化/settlement 和独立的 CurrentUserInput；本仓 ADR-0005 只实现了其中的 model-only `ContextProvider` seam。
- NeuroBook 的 Session SSE 合同与本仓 `SessionEventHub` 已能对应到 `EventCursor`、`EventSubscription`、`HarnessEvent` 和 `snapshot_required`。进一步复核确认：Core 必须约束自己持有的 replay/live count、serialized bytes 与 subscription close/overflow；SSE frame、socket backpressure、heartbeat、HTTP 鉴权、snapshot GET 和前端 reconnect 仍属于宿主 Transport。
- NeuroBook Task 106 已证明 recovery 必须先捕获 replay-safe cursor 再读 Session，期间 durable event 允许与 Snapshot 重叠并按稳定 Entry ID 去重。本仓 ADR-0023 已吸收这一 Core recovery cut；NeuroBook 的 History projection、HTTP DTO 和前端 merge state 仍不进入独立 Harness。

## 当前耦合现状

NeuroBook 的 `NeuroAgentHarness` 同时承担了多个不同层次的职责：

1. **Core Run Kernel**：provider turn、Tool、ingest、失败与 Invocation 生命周期。
2. **Session 控制面**：create、fork、rewind、tree、archive、relation、snapshot 和列表投影。
3. **宿主组合根**：注册内置 Profile、Tool、Skill Catalog、Profile watcher 和 build coordinator。
4. **NeuroBook 运行环境**：Project Workspace open/presence、Profile Home、Variables 和 Effective Config。
5. **Pi Adapter**：模型解析、Models runtime、request options、trace 和 provider 错误清洗。
6. **交互协调**：approval、waiting/resume、steer、follow-up 和 abort。
7. **后台 Workflow**：summarizer、relation index 和会话元数据投影。
8. **Transport projection**：公开 DTO、SSE event projection 和 replay anchor。

删除当前 Harness 后，上述复杂度会散落到 HTTP route、Profile、Tool 和 Project Workspace 模块中，因此 Harness 本身确实需要保留为深 Module；需要改变的是 Interface 和 seam 的位置，而不是简单拆成许多转发文件。

## 推荐模块划分

| Module | 应保留的职责 | 不应知道 |
| --- | --- | --- |
| NeuroAgentHarness | Invocation admission、Run Kernel、durable commit 顺序、abort/retry、runtime events | Nuxt、Project Workspace 路径、Pi、Profile 文件 watcher |
| Session Store Adapter | Session ID、Snapshot、append-only commit、recovery | Profile、Tool、HTTP DTO |
| Model Runtime Adapter | provider turn 和 provider-neutral stream event | Session Store、NeuroBook config 文件 |
| Profile Registry | 已加载 Profile 的注册与强类型 schema | 文件编译、watcher、Profile Home 物理路径 |
| Capability Provider | Invocation 期宿主能力 | 完整 Harness 和 Store |
| Workflow | fork、rewind、summarize、关系维护、旁路 Agent 编排 | Run Kernel 内部状态 |
| Transport Adapter | SSE/HTTP/DTO/鉴权/heartbeat | provider 和 Store 实现 |

## NeuroBook 概念映射

### NeuroSessionContext

`NeuroSessionContext` 不是 Session metadata。它是 Snapshot active path 的运行投影，包含 transcript、profile/model 覆盖、custom state、relations 和 agent mode。

独立库提供两层能力：

- `activeSessionPath(snapshot)` 和 Core transcript 恢复，保证 rewind 后下一次 Invocation 使用正确分支。
- NeuroBook 定义 `neuroSessionContext` Capability Provider，根据 Snapshot 和 NeuroBook entry kinds 生成完整投影。

这样 Core 不需要认识 `variable_patch`、`profile_change`、`agentMode` 等产品 entry。

### SessionWritePlan

`SessionWritePlan` 是 Core 一等合同。Harness 的公开 `write(plan)` 允许 Workflow 执行 rewind 和宿主状态写入；Profile 和 Tool 只能返回 plan，不能获取 Store。

当前 spike 使用 optimistic `expectedVersion`。这适合 rewind、metadata 更新等控制操作，但未来并行 Tool 对纯 append plan 的处理仍需单独设计，不能直接让多个 Tool 使用同一版本提交。

### Skill Catalog

Skill Catalog 是 Invocation-scoped Capability。NeuroBook Adapter 负责：

- 从当前 Workspace Root 加载 catalog；
- 应用 Profile include 过滤；
- 返回稳定只读快照。

Profile 文件 watcher 和 Skill 文件系统布局不进入 Core。

### Variables

Variables 分为两个部分：

- 可恢复状态：通过 host entry kind 和 SessionWritePlan 记录，例如 `variable_patch`。
- registry、schema resolver、client acknowledgement：通过 typed Capability 提供。

用户允许简单 Variables 进入 Host Context，但动态 accessor、客户端状态和文件系统对象不能持久化到 Host Context。

### Profile Home

- `ProfileFacet` 描述 Profile 是否有 Home、版本和宿主展示信息。
- `profileHome` Capability 提供 layered read/write facade。
- init/upgrade/reset 生命周期由 NeuroBook 的 Profile 管理模块执行，不放进 Run Kernel。

### Low-Code Form

Low-Code Form 是 Profile Facet。独立库只保存、查询和传递 JSON 声明；TypeBox 到 Low-Code Form DTO 的转换属于 NeuroBook Profile Adapter。

### Project Workspace

- `Host Context` 持久化 Project Workspace 身份，例如 `projectPath`、`workspaceKey`。
- `projectWorkspace` Capability 提供文件、数据库、World Engine 和 Project open 等运行能力。
- presence probe、managed project guard 和 State Root 路径解析属于 NeuroBook Adapter。

### sessionId

- Core 默认 `number`，允许自定义 Adapter 使用 `string`。
- JSONL Adapter 只接受正整数 `number`。
- ID allocator 是 Store 职责。

### Agent caller

- `AgentCaller` 持久化调用来源。
- `AgentInvoker` 是受限 Capability，只允许发起另一个 Invocation。
- Tool 不获得完整 Harness，因此不能顺带调用 archive、rewind 或直接读写 Store。

### Workflow 与原 Sidecar 用例

Sidecar 已从独立库删除。未来旁路任务由 Workflow 使用以下公开原语组合：

1. `snapshot()` 读取恢复真相源；
2. `write(moveLeaf)` rewind；
3. `createSession(parentSessionId)` 创建 fork；
4. `write(appendEntries)` 复制选定 branch 上下文；
5. `invoke()` 执行旁路 Agent；
6. `write()` 将结果显式合并回目标 Session。

这种方式比 Run Kernel 内嵌 Sidecar 更容易观察、恢复和重试。

## Profile 动态上下文

NeuroBook 的 Profile Turn Context 每个 provider turn 都可能变化，不能只用 `Profile.prepare()`。

独立库使用 `beforeTurn` hook：

- runtime messages 只加入当前 provider request；
- 不自动持久化；
- 不残留到下一 turn；
- durable state 必须显式返回 SessionWritePlan。

`afterTurn` 可用于 settlement，但不能绕过 transcript commit 顺序。

## Approval

Approval 属于 Harness Invocation 状态机：

- Tool 声明 approval request policy；
- Harness 在执行整个 Tool batch 前持久化 `pendingApprovals` 并进入 waiting；
- resolution 必须完整匹配 durable request；
- resume 使用原 Invocation ID；
- 获批 Tool 才执行，拒绝转换为标准 Tool error result；
- Tool results 与 `resumeInvocation` 在同一个 Session commit 中落盘；
- JSONL 重启后可以由新 Harness 实例继续 resume；
- waiting Invocation 可以直接 abort。

获批 Tool 的外部副作用仍必须以 `toolCallId` 做幂等：进程可能在外部副作用成功、Tool result commit 之前崩溃。

## Compaction

Compaction 的职责拆分如下：

- Harness：token threshold、keep recent cut、未完成 Tool Call 防护、Tool Call/Result 边界、`agent.compaction` entry 和恢复投影。
- `ContextCompactor` Adapter：估算 provider-neutral message token，并生成摘要文本。
- Profile：声明 `triggerTokens` 和 `keepRecentTokens`。

摘要失败时不写 compaction entry，Invocation 明确失败。JSONL 重启后 Snapshot 中的 compaction entry 继续作为 transcript 恢复真相源。

## Parallel Tools

- Profile 选择 sequential 或 parallel。
- Tool 可以强制 `executionMode: "sequential"`。
- 任一 Tool 强制 sequential 时，整个 provider Tool batch 串行执行。
- parallel batch 等待全部 Tool settle，避免 Invocation 结束后残留后台 Tool。
- Tool result 按 provider call 顺序一次 commit，不按完成时间排序。
- parallel Tool 不得返回 SessionWritePlan；需要 Session 写入时必须声明 sequential。

该约束避免多个 Tool 基于同一个 Snapshot version 生成互相冲突的计划。

## Invocation Coordination

Steer 与 follow-up 属于 Harness Coordinator，但语义不同：

- steer：只在当前进程中的 active Invocation 接受，在下一安全 turn 转成持久 user message。进程在 drain 前崩溃时 steer 丢失，但原 Invocation 同样会变成 interrupted。
- follow-up：立即写入 session-level durable ledger；当前 Invocation completed 后自动创建新 Invocation。失败、aborted 或进程重启后，宿主可以调用 `resumeFollowUps()` 继续队列。

follow-up ledger 使用全量 Session entries 归约，不跟随 active branch rewind，和 NeuroBook relation ledger 的 session-level 语义一致。

follow-up 控制面已经覆盖 pause、resume、cancel 和 exact-permutation reorder；所有控制操作也是 append-only ledger entry，JSONL 重启后可以重新投影。

## Materialized Views

`SessionCommitObserver` 用于 relation index、搜索索引和 Workflow 调度：

- 只在 Store durable commit 成功后调用；
- 正常路径在 Harness commit 返回前等待 observer，保证立即一致性；
- shutdown 开始后，等待 `dispose()` 的 observer/error reporter 会与 admitted commit 脱离，避免 observer → dispose → commit 环；Core 仍完成 durable publication并观察迟到 rejection；
- observer 失败会通过错误出口报告，但不会把已持久化的 commit 伪装成失败；
- view 必须支持从 Session Snapshot/entries 重建。

Summarizer 不应直接阻塞 observer。Observer 只负责把幂等 Workflow 调度入队。

`CommitWorkflowScheduler` 已验证 NeuroBook summarizer 所需的调度语义：

- commit observer 本身非阻塞；
- Workflow 使用稳定 key（通常是 Session ID）标识幂等任务；
- running 期间发生多次 commit，只保留最新 payload 并追加一次 dirty rerun；
- Workflow 错误不影响原始 Session commit；
- Workflow handler 通过闭包持有受限 Harness Interface，Core 不认识 summarizer Profile。

## JSONL Checkpoint Spike

JSONL Adapter 默认 `checkpointEvery: 1`，保持每次完整 Snapshot 的已确认行为。实验配置大于 1 时：

- 创建记录与 checkpoint 使用完整 Snapshot；
- 中间 commit 只记录 metadata、状态、Invocation projection 和 appended entries；
- 读取时验证 version 连续、Session ID 和重复 entry ID；
- 损坏尾行仍可忽略，中间损坏继续明确失败；
- 测试证明恢复 Snapshot 等价，并减少重复历史文本。

当前读取仍顺序扫描整个文件，只是在 checkpoint 处重置内存 Snapshot。未来可增加 checkpoint offset index 或安全文件轮转优化启动时间。

## Typed Host Entries

`SessionEntryCodec` 为 Variables patch、relation link/detach、profile/model override 等宿主 entry 提供：

- 稳定 kind；
- typed draft；
- runtime payload validation；
- 投影时重新验证。

Core 仍只解释 `agent.message`、`agent.compaction` 和 Invocation lifecycle。

## 仍需后置的设计问题

以下能力尚未由 spike 证明，不应在接入时临时拼接：

1. NeuroBook profile/model/thinking entry codec 的具体 payload；
2. Pi 0.80.6 Model Runtime Adapter 实现；
3. JSONL checkpoint offset index、轮转和 crash-safe compact；
4. approval Tool 外部副作用的通用幂等协议；
5. compaction 的 provider-specific 精确 token estimator；
6. 多进程 Coordinator、Workflow lease 和 materialized view 一致性；
7. Workflow job 的跨进程 durable lease/retry/dead-letter；
8. 将 1000+ 行 Run Kernel 实现拆成深内部 Module，而不暴露浅接口。

这些属于接入前设计门禁，不属于第一版 standalone Core 的完成条件。
