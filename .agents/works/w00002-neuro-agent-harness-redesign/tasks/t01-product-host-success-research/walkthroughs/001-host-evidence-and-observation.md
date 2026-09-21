# R1：三类候选宿主证据与开发者观察

## 材料状态

- Task：`02-product-host-success-research`
- 决策范围：`D-PRODUCT-01`（第一版首先服务哪类宿主）与 `D-PRODUCT-02`（第一版怎样才算成功）。
- 阶段：来源证据与宿主画像；等待开发者独立观察。
- 材料生成者：Leader。
- 生成日期：2026-08-27。
- 本材料不选择首要宿主，不定义成功标准，不决定 Runtime、Session、Store、API 或包拓扑。
- 外部文档只证明其各自产品公开支持的能力；不能直接证明 NeuroAgentHarness 的需求。
- 一次多 URL 合并读取曾返回 HTTP `404`；该响应没有被当作证据。以下来源均以单独的 canonical URL 读取。
- 前次 Research Tasker 失败且没有产物；本材料不消费失败作业的潜在输出。

## 读取方法与证据分层

每个来源都在同目录的 `evidences/host-evidence-manifest.json` 中以稳定 ID 登记。画像中的内容分为三层：

- **来源事实**：官方文档明确写出的产品行为或能力，使用 `[事实，S-...]` 标记。
- **研究推论**：把来源事实映射到候选宿主时得到的风险、职责或可观察结果，不是产品决定，使用 `[推论]` 标记。
- **开发者观察**：必须由开发者独立阅读、运行或推演后填写，集中放在本文最后的空白模板；本材料不代填。

“宿主”指实际组合 Agent、工具、权限、状态、外部副作用和用户界面的产品或进程。它不是模型、Provider 或某个具体 Runtime 的同义词。

## 候选宿主 A：CLI coding agent

### 画像边界

这里的宿主是一个由开发者在终端或脚本中启动的 coding agent。一次任务通常以工作目录和自然语言请求开始，Agent 读取代码、修改文件、运行命令，再把结果返回终端或脚本。它可以是交互式会话，也可以是一次性的非交互命令；本画像不假设必须使用 Claude Code 或某个 Provider。

### 真实任务旅程素材

1. **提出任务**：开发者在项目目录启动 Agent，描述修复、实现、解释或审查请求。
   - `[事实，S-CLAUDE-OVERVIEW]` Claude Code 官方总览把它描述为能读取代码库、编辑文件、运行命令并与开发工具集成的 coding tool，并列出 Terminal、IDE、桌面和 Web 等使用面。
2. **执行工具循环**：Agent 读取相关文件，选择工具，可能多次调用 shell、文件读写、搜索或外部工具，直到形成答案或遇到阻塞。
   - `[事实，S-CLAUDE-SDK]` Claude Agent SDK 说明 Agent loop 会规划步骤并调用读取文件、运行命令、编辑代码的工具；SDK 复用 Claude Code 的 tools、agent loop 和 context management。
   - `[事实，S-CLAUDE-HEADLESS]` `claude -p` 支持非交互运行；`--allowedTools` 可预先允许工具；`--output-format` 可选择 text、json 或 stream-json。
3. **审批与边界**：宿主需要决定哪些工具可自动执行、哪些操作必须由人批准，以及工作目录、凭据和额外目录怎样暴露。
   - `[事实，S-CLAUDE-HEADLESS]` 文档区分 `--allowedTools` 与 permission mode，并说明非交互调用可以使用工具许可配置。
   - `[事实，S-CLAUDE-SDK]` SDK 能力表包含 permissions、hooks、MCP、sessions 和 human in the loop。
4. **观察运行结果**：开发者看到最终文本、结构化结果或实时事件，并检查文件差异、命令输出和验证结果。
   - `[事实，S-CLAUDE-HEADLESS]` `-p` 成功时以成功状态退出；运行内部失败时会把失败作为结果输出，脚本可以依据退出状态分支；JSON/stream-json 提供结构化或流式输出。
   - `[事实，S-OPENAI-RESULTS]` OpenAI Agents SDK 的结果表面包括 `finalOutput`、`newItems`、`interruptions` 和可序列化的 `state`。
5. **继续或恢复**：任务可能被中断、进程退出或需要下一轮追问。
   - `[事实，S-CLAUDE-CLI]` CLI 提供 `-c/--continue` 继续当前目录最近会话，以及 `-r/--resume` 按会话 ID 或名称恢复。
   - `[事实，S-CLAUDE-HEADLESS]` SIGTERM 会使当前 turn 未完成且不记录结果；文档说明恢复会继续该未完成 turn。该行为属于 Claude Code，不是本项目已接受的合同。

### 失败成本素材

- `[推论]` **误修改或误执行**：如果工具许可、工作目录或审批边界表达错误，代价可能是修改错误文件、执行不应执行的命令或把未经验证的结果当作成功。
- `[推论]` **任务上下文丢失**：一次长任务在进程退出后不能继续，会迫使开发者重述背景、重复读取和重复付费；若 Agent 已产生外部副作用，重跑还可能重复副作用。
- `[推论]` **结果不可判断**：脚本若只读取 stdout 而忽略退出状态、结构化错误或流结束状态，可能把失败、截断或未完成 turn 当作成功。
- `[推论]` **交互体验退化**：实时输出、审批、取消和最终结果的边界不清，会令开发者无法知道 Agent 当前是否仍在运行、是否可以安全重试。

这些是待开发者确认的失败成本，不是已经批准的验收阈值。

### 宿主本来就应负责什么（研究推论）

- 工作目录、项目选择、用户身份、凭据和环境变量管理。
- 文件系统与 shell 权限、工具 allowlist、人工审批和本地进程信号。
- 终端/脚本输出、stdout/stderr、退出码、实时流与最终结果的展示和采集。
- 是否自动重试、是否允许继续/恢复、重试前怎样检查工作树和外部副作用。
- 用户可见的 diff、测试结果、成本和错误解释。

### Harness 可能负责什么（候选职责，不是决定）

- 对 Provider 中立的 turn、tool call、approval、waiting、completed/failed/aborted 生命周期。
- 将工具结果、最终输出、usage、错误和可恢复状态以稳定结果表面交给 CLI 宿主。
- 在宿主选择持久化时提供可恢复的 Invocation/Session 边界；不替宿主决定工作目录、权限策略或外部副作用语义。
- 统一迟到结果隔离、取消边界和重试 admission，避免 CLI 宿主各自重新实现相同的运行内核。

以上只列出值得研究的责任候选；没有因此决定 Core 必须承担其中任何一项。

### 反例

- 一个只做一次文本解释、没有工具、没有修改文件、没有审批和没有后续追问的命令，可以直接调用模型并检查一个最终文本。为它引入完整的持久会话、事件回放或跨进程恢复，可能增加启动和维护成本而不改善任务结果。
- `[推论]` 该反例用于防止把“coding agent”扩大成所有 CLI 模型调用；它不能证明完整 CLI coding agent 不需要恢复或工具边界。

### 可观察结果素材（不构成 D-PRODUCT-02）

开发者可在独立观察时判断以下结果是否重要、是否可测量：

- 一次任务是否能明确区分正在运行、等待审批、成功、失败、取消和未完成。
- 工具是否只在宿主允许的边界内执行，结果是否能追溯到对应调用。
- 终端结果是否同时保留用户需要的最终答案与判断成功所需的错误/退出信息。
- 进程中断后，开发者能否继续同一任务，且不会静默重复已发生的外部副作用。
- 文件修改和验证结果是否能被宿主直接观察，而不是只看到“完成”文字。

## 候选宿主 B：嵌入式后端服务

### 画像边界

这里的宿主是一个长期运行的 API、worker 或业务服务，把 Agent 作为请求处理、后台任务或业务流程中的一个组件。它可能为多个用户/租户服务，可能需要流式交付，也可能把运行结果写入自己的业务数据库。它不等同于 CLI 的 HTTP 包装器：服务需要自己处理身份、并发、超时、作业生命周期和外部副作用。

### 真实任务旅程素材

1. **接收业务请求**：客户端发送任务、会话引用和业务上下文；服务鉴权并决定是否接受。
   - `[事实，S-OPENAI-OVERVIEW]` OpenAI Agents SDK 以 Agent、tools、handoffs、guardrails、sessions 和 tracing 作为可组合原语，目标是构建 agentic applications，而不是只提供终端命令。
   - `[事实，S-LANGGRAPH-PERSISTENCE]` LangGraph 文档把 persistence 与继续对话、从中断恢复、失败恢复和跨交互记忆直接关联，并区分 thread-scoped checkpointer 与跨 thread 的 Store。
2. **组合并运行 Agent**：服务注入模型、工具、guardrail、上下文和业务 capability，执行多轮 tool loop。
   - `[事实，S-OPENAI-OVERVIEW]` SDK 的 Agent loop 负责工具调用、把结果返回模型并继续，function tools 可以由 TypeScript 函数生成并按 schema 校验。
   - `[事实，S-CLAUDE-SDK]` Agent SDK 允许在自己的 Python/TypeScript 进程中运行同一 agent loop、工具和上下文管理；它把 CLI、SDK、Client SDK 与 Managed Agents 区分为不同部署选择。
3. **处理中断、失败和交付**：服务可能在等待人工审批、Provider 响应、工具副作用或客户端连接期间继续存活或失去进程。
   - `[事实，S-OPENAI-RESULTS]` 运行结果可暴露 `interruptions` 与 `state`；审批解决后把同一 state 传回以继续运行。
   - `[事实，S-TEMPORAL-WORKFLOWS]` Temporal 说明 Workflow 会记录 Event History，基础设施失败后可重建状态；与 API、数据库、LLM、文件 I/O 等外界交互的工作放在 Activity 中，Activity 结果在 replay 时复用。
4. **持久化业务结果**：服务把 Agent 的结果与自身的订单、工单、审计、通知或 Job 状态关联，随后通过响应、轮询、推送或流式通道交付。
   - `[事实，S-OPENAI-SESSIONS]` Agents SDK 的 Session 在每次 run 前读取历史，在 run 完成后保存输入和输出，并允许替换为自定义 Redis、DynamoDB、SQLite 等实现。
   - `[事实，S-LANGGRAPH-PERSISTENCE]` Agent Server 可以自动处理 persistence；使用自管理 graph 时，checkpointer 保存 thread 状态，Store 保存应用定义的跨 thread 数据。

### 失败成本素材

- `[推论]` **请求与运行脱钩**：HTTP 请求超时或客户端断开而 Agent 仍在运行时，服务若没有明确的 Job/Invocation owner，可能丢失结果、重复启动或无法向客户端说明状态。
- `[推论]` **外部副作用重复**：数据库写入、通知、支付、文件修改或第三方 API 调用可能已经成功，但结果回写前进程崩溃；无幂等键、查询或补偿时，重试可能重复副作用。
- `[推论]` **租户边界错误**：Session、工具 capability 或缓存若跨请求/跨租户泄漏，会造成数据暴露或以错误身份执行动作。
- `[推论]` **恢复不确定**：只恢复内存状态而不保存足够的 durable facts，服务重启后可能重新调用模型或工具，产生不同路径或不一致结果。
- `[推论]` **交付与事实分离**：数据库已经记录完成但 SSE/队列消息未送达，或消息已送达但业务状态未提交，都会让客户端看到错误的终态。

### 宿主本来就应负责什么（研究推论）

- 认证、授权、租户隔离、请求限流、Provider 凭据和模型选择策略。
- Job/Workflow/队列/Lease/Outbox 等跨进程 durable truth，以及业务结果、通知和交付语义。
- HTTP/SSE/WebSocket/消息队列的连接、断开、重连、heartbeat、backpressure 和客户端协议。
- 外部副作用的幂等、事务、查询、补偿与人工运营；不能把“工具调用已返回”误当成业务副作用 exactly-once。
- 部署扩缩容、超时、进程信号、可观测性、成本预算和数据保留/删除策略。

### Harness 可能负责什么（候选职责，不是决定）

- 在单个宿主进程内提供 provider-neutral 的 Agent turn、Tool、Approval、Invocation 状态和结果/事件边界。
- 把可恢复的运行状态与宿主自己的 Job/业务记录组合，而不是取代宿主的跨进程 Job、Lease、Outbox 或交付系统。
- 为 waiting/resume、取消、失败和迟到结果提供一致的 admission/fence，减少服务端各路由重复实现。
- 通过公开接口让宿主决定如何持久化 Session、如何映射业务 DTO，以及哪些 capability 可以被 Agent 使用。

### 反例

- 一个内部同步 API 只接受短提示，调用一个无工具模型并在请求内返回文本；它没有人工审批、长期 Session、外部副作用或断线后的继续需求。为该 API 默认引入 durable workflow、跨进程事件总线和复杂 replay，可能扩大故障面。
- `[推论]` 反例说明“嵌入式后端服务”内部也有低状态和高状态两端；不能仅凭部署形态决定 Harness 的所有职责。

### 可观察结果素材（不构成 D-PRODUCT-02）

- 请求、运行、业务提交和交付是否有可区分的状态，并且客户端能得到最终可判断的结果。
- 服务重启、连接断开或 worker 迁移后，是否能继续/查询同一运行，而不是无提示地丢失或重复。
- 工具或外部副作用发生一次后重试是否可安全处理，未知结果是否显式暴露给业务层。
- 不同租户、会话和请求之间的上下文与 capability 是否隔离。
- 运行指标、错误、成本和交付延迟是否足够让服务运营者诊断失败。

## 候选宿主 C：需要持久 Session 的产品宿主

### 画像边界

这里的宿主是面向最终用户的产品：用户在多个交互轮次、页面、设备或工作时段之间继续同一个 Agent Session。产品可能展示消息、工具调用、审批、部分输出、错误和恢复入口；它通常把 Session 与账户、项目、工作区或业务对象关联。该画像关注“用户把它当成持续会话”这一产品事实，不预设某种数据库或 UI。

### 真实任务旅程素材

1. **创建或选择会话**：用户打开产品、创建会话或选择已有会话，产品加载可用的历史与当前上下文。
   - `[事实，S-OPENAI-SESSIONS]` Agents SDK 的 Session 是持久记忆层；Runner 会在每次 run 前取回历史并把新输入与历史合并。
   - `[事实，S-OPENAI-CONVERSATION]` OpenAI 文档说明单次 text generation request 本身是独立且无状态的；多轮对话需要手动提供先前消息/输出，或使用服务管理的状态机制。
2. **进行多轮交互**：用户提出问题，Agent 可能调用工具、交接给另一个 Agent、返回文本或要求审批。
   - `[事实，S-OPENAI-RESULTS]` 结果表面区分最终输出、运行产生的新 items、富 metadata、interruptions 和可恢复 state。
   - `[事实，S-OPENAI-SESSIONS]` 同一个 Session 可跨多次 `run` 自动取得历史并保存新输入/输出；Session 接口可由宿主自定义存储实现。
3. **暂停与回到产品**：用户暂不批准、关闭页面、网络中断或进程重启，稍后从同一会话继续。
   - `[事实，S-OPENAI-RESULTS]` 审批中断时使用 `result.state`，解决后把同一 state 传回 `run()`；流式运行被取消时，文档区分已完成清理与尚未形成 final output 的状态。
   - `[事实，S-LANGGRAPH-PERSISTENCE]` Checkpointer 的用途包括 thread 内会话连续性、人机协作、time travel 和故障容错；内存型 saver 在进程重启后丢失，需要持久 checkpointer 才能跨重启。
   - `[事实，S-OPENAI-SANDBOX]` Sandbox Agent 支持持久 workspace、sandbox session state、snapshot，以及后续 run 重新连接既有 session 的组合方式。
4. **查看、纠正或审计历史**：产品可能提供清除、撤销、导出、审计或从某个历史点继续的能力。
   - `[事实，S-OPENAI-SESSIONS]` Session 暴露 `getItems`、`addItems`、`popItem` 和 `clearSession` 等历史操作；自定义 Session 只需实现约定的异步接口即可替换存储后端。
   - `[事实，S-OPENAI-RESULTS]` `history` 可用于下一轮 replay-ready input，`newItems` 可用于日志、UI、审计和调试；这些表面用途不同。
5. **完成或分支**：用户看到最终输出、工具结果和产品状态；产品可让用户继续原会话、创建分支或开始新会话。
   - `[事实，S-CLAUDE-SDK]` Claude Agent SDK 的能力表包含 sessions，并明确支持跨 exchange 维护 context、resume 或 fork。
   - `[事实，S-LANGGRAPH-PERSISTENCE]` LangGraph 把短期 thread state 与跨 thread 的长期 store 分开，说明“当前会话”与“跨会话记忆”是不同的数据边界。

### 失败成本素材

- `[推论]` **历史丢失或错序**：用户会重复说明背景，无法理解上一轮为何得出结果；跨设备或重启恢复若错序，后续模型输入可能改变。
- `[推论]` **错误归属**：Session、工具结果或审批状态串到另一个用户/项目，会造成隐私泄漏或以错误权限执行动作。
- `[推论]` **重复副作用**：用户点击重试、刷新或恢复时，产品若不能区分已提交、进行中和未知的工具效果，可能重复发送通知、修改文件或写入业务数据。
- `[推论]` **审批无法继续**：产品只保存展示文本而没有足够的可恢复状态，用户返回后只能重新开始，或在无法确认原请求时错误执行。
- `[推论]` **展示与真相不一致**：UI 显示了部分输出或“完成”，但 durable Session 没有相同事实；用户刷新或审计时看到另一种结果。

### 宿主本来就应负责什么（研究推论）

- 用户身份、租户/项目授权、Session 可见性、数据保留、删除、导出和隐私策略。
- 产品定义的消息/附件/工作区/记忆语义，以及历史搜索、撤销、分支和 UI 投影。
- 数据库、对象存储、缓存、跨设备同步和迁移；决定哪些 provider 原始内容可以保存、脱敏或丢弃。
- HTTP/SSE/WebSocket 连接与重连、客户端 cursor/快照同步、通知和最终用户错误文案。
- 外部工具副作用的幂等与业务确认；向用户明确展示“已完成”“失败”与“结果未知”的区别。

### Harness 可能负责什么（候选职责，不是决定）

- 提供与产品 DTO 无关的 Session/Invocation/Tool/Approval 运行边界，使宿主能把持久会话与当前运行组合。
- 为等待、恢复、取消、失败和重试提供稳定的 provider-neutral 状态与结果投影；宿主仍负责用户授权和业务投影。
- 在宿主选择 Store 时维护 append-only 运行事实、版本/CAS 或等价 admission，避免两个产品入口同时推进同一运行。
- 让宿主注入 capability、模型 Runtime 和持久化实现，避免 Core 直接拥有账户、项目、UI 或产品数据库。

### 反例

- 一个匿名、单轮、只返回文本的 FAQ 端点不需要用户可见的持久 Session；把它强制建模为跨设备可恢复产品会话可能增加存储、隐私和迁移负担。
- `[推论]` 反例不否认产品未来可升级为持久会话，只说明该升级必须由真实用户旅程和失败成本驱动，而不是由“Agent 产品”标签自动推出。

### 可观察结果素材（不构成 D-PRODUCT-02）

- 用户刷新、换设备或进程重启后，是否能回到同一 Session 并看到一致的历史与状态。
- 多轮输入是否只使用正确 Session 的上下文，且用户/项目边界可审计。
- approval、取消、失败和 retry 后，用户是否能知道下一步动作以及是否会重复副作用。
- 展示的消息、工具结果、部分输出和最终状态是否与持久事实一致。
- 产品是否能区分当前会话内短期上下文、跨会话记忆和业务数据，并按各自策略处理。

## 三类画像横向对照（不排序）

| 候选宿主 | 主要用户动作 | 主要失败成本素材 | 宿主明显职责 | Harness 研究切入点 | 反例方向 |
|---|---|---|---|---|---|
| CLI coding agent | 在工作目录发起、观察、继续 coding task | 误操作、上下文丢失、错误判断完成、重复副作用 | 工作区、权限、进程、终端/脚本结果 | 单进程运行边界、工具/审批、恢复与结果 | 无工具的一次性文本命令 |
| 嵌入式后端服务 | 通过 API/worker 把 Agent 放进业务流程 | 超时脱钩、跨进程丢失、重复副作用、交付不一致、租户泄漏 | auth、Job、业务提交、Transport、运营 | Invocation 与宿主 Job 的组合边界 | 短同步、无工具、无状态 API |
| 持久 Session 产品宿主 | 多轮、跨页面/设备继续同一会话 | 历史丢失/错序、错误归属、审批无法恢复、展示与真相不一致 | 用户/数据/隐私、产品投影、同步、外部效果 | Session/Invocation 恢复事实与宿主产品投影 | 匿名单轮 FAQ |

表格只整理证据，不表示三类宿主的优先级，也不替开发者选择“组合宿主”。

## 空白开发者独立观察模板

> 开发者请在阅读上面的三类画像和 `host-evidence-manifest.json` 后独立填写。填写前不要依据 Agent 的后续推荐；本材料没有提供推荐。每个“未检查”都应明确写出，不能用推测补齐。Leader/Agent 不代填本节。

### 观察元数据

- 观察者：`[开发者填写]`
- 观察时间：`[开发者填写]`
- 观察方式（阅读、运行、推演、已有产品旅程）：`[开发者填写]`
- 实际检查的来源 ID：`[开发者填写]`
- 未检查的来源或旅程：`[开发者填写]`
- 观察是否独立于 Agent 推荐：`[开发者填写]`

### 候选宿主 A：CLI coding agent

- 真实需要：`[开发者填写]`
- 假想需要：`[开发者填写]`
- 明确不服务：`[开发者填写]`
- 不可接受的失败：`[开发者填写]`
- 最值得实际观察的任务旅程：`[开发者填写]`
- 可接受的失败/未知状态：`[开发者填写]`
- 需要补充的证据：`[开发者填写]`
- 观察来源、命令、产品或案例：`[开发者填写]`
- 未检查项：`[开发者填写]`

### 候选宿主 B：嵌入式后端服务

- 真实需要：`[开发者填写]`
- 假想需要：`[开发者填写]`
- 明确不服务：`[开发者填写]`
- 不可接受的失败：`[开发者填写]`
- 最值得实际观察的任务旅程：`[开发者填写]`
- 可接受的失败/未知状态：`[开发者填写]`
- 需要补充的证据：`[开发者填写]`
- 观察来源、命令、产品或案例：`[开发者填写]`
- 未检查项：`[开发者填写]`

### 候选宿主 C：需要持久 Session 的产品宿主

- 真实需要：`[开发者填写]`
- 假想需要：`[开发者填写]`
- 明确不服务：`[开发者填写]`
- 不可接受的失败：`[开发者填写]`
- 最值得实际观察的任务旅程：`[开发者填写]`
- 可接受的失败/未知状态：`[开发者填写]`
- 需要补充的证据：`[开发者填写]`
- 观察来源、命令、产品或案例：`[开发者填写]`
- 未检查项：`[开发者填写]`

### 两项决策前的独立记录

- `D-PRODUCT-01` 当前观察：`[开发者填写；此处不要只写“所有人”]`
- `D-PRODUCT-02` 当前观察：`[开发者填写；必须包含可观察结果与不可接受失败]`
- 仍然合理的候选结论：`[开发者填写]`
- 需要 Leader 暂停而不是继续推断的缺口：`[开发者填写]`
- 开发者尚未决定的内容：`[开发者填写]`

## 阶段停止点

本材料到此停止。开发者完成上述独立观察前，不写 `002-product-decision-brief.md`、不写 `003-product-decision-record.md`，不生成产品推荐或决定，也不启动下游 Task。

治理状态、README/context revision 或后台作业状态如出现不一致，不在本材料中擅自修正；该类矛盾交回 Leader 维护。本文件只记录来源证据、候选画像和空白观察入口。

## 来源索引

- `[S-CLAUDE-OVERVIEW]` Anthropic Claude Code Overview。
- `[S-CLAUDE-HEADLESS]` Anthropic Run Claude Code programmatically。
- `[S-CLAUDE-CLI]` Anthropic CLI reference。
- `[S-CLAUDE-SDK]` Anthropic Agent SDK overview。
- `[S-OPENAI-OVERVIEW]` OpenAI Agents SDK TypeScript overview。
- `[S-OPENAI-SESSIONS]` OpenAI Agents SDK Sessions。
- `[S-OPENAI-RESULTS]` OpenAI Agents SDK Results。
- `[S-OPENAI-SANDBOX]` OpenAI Agents SDK Sandbox agents。
- `[S-OPENAI-CONVERSATION]` OpenAI Conversation state。
- `[S-LANGGRAPH-PERSISTENCE]` LangGraph Persistence。
- `[S-TEMPORAL-WORKFLOWS]` Temporal Workflow。
