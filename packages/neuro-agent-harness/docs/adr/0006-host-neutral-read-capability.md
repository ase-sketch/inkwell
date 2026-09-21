# ADR-0006: Host-Neutral Read Capability Contract

- Status: Accepted (standalone Core scope)
- Date: 2026-08-08
- Task: [`01-harness-decoupling`](../tasks/01-harness-decoupling/README.md)

## Context

当前 Cosmos consumer fixture 已经通过 Capability 注入一个宿主授权的 `read(reference)`，但合同是消费者自定义的。NeuroBook 的最新 `read` 工具还绑定了 workspace cwd、offset/limit、行号、截断、图片和宿主文件策略；这些语义不能直接搬进 Harness Core。

如果 Core 直接实现 `fs.readFile`、Workspace Root 或路径归一化，Harness 就会从“可组合的宿主能力”变成带有文件系统权限假设的产品运行时。另一方面，只有一个裸 `read(reference: string): string` 又无法表达大文件分页、宿主 provenance 和明确的截断状态。

## Decision

定义一个只提供数据形状、不提供文件系统实现的 `ReadCapability`：

- `ReadRequest.reference` 是 opaque reference；Core 不判断它是相对路径、绝对路径、URI、数据库 key 还是其它宿主资源标识；
- `ReadRequest.offset` 和 `ReadRequest.limit` 是可选的 numeric 分页提示；单位、起点、整数/范围约束和最大值由 Capability Provider 与 Tool schema 定义并校验，Core 不把它们固定为行号、字节位置或 0/1-based；
- `ReadResult.content` 是文本结果；`provenance` 可选，用于宿主返回来源标识；
- `ReadResult.truncated` 和 `nextOffset` 可选；Provider 省略资源内容时必须显式返回 `truncated: true`，有 numeric continuation 时可以附带 `nextOffset`。`truncated: true` 不保证一定存在 continuation，Core 也不从 `nextOffset` 反推权限、完整性或更多内容；
- Profile/Tool 通过现有 `CapabilityToken` 请求该能力，仍由宿主决定哪些 Profile 可见、是否需要 approval，以及 reference 的解析/授权；
- Core 不导出全局 read token；定义 Profile/Tool 的集成模块创建 token，并把同一 token instance 交给宿主 Provider，避免不同 read authority 意外碰撞；
- Capability Provider 失败继续沿用现有 Invocation/Tool error 归并，不新增 Core 文件错误类型；
- A1 不提供默认 `read` Tool，不读取本地文件，不实现 Workspace Root、symlink、绝对路径、图片附件、bash 或编辑能力。

这使 Cosmos 可以把 reference 解释为自己的资源地址，NeuroBook 可以继续保留绑定 cwd 和更丰富的 file tool；两者共享请求/结果的最小可复用 seam，而不是共享权限策略。

## Security and lifecycle boundary

- `ReadCapability` 是 Invocation-scoped Capability，Provider 可在 `open()` 时根据 caller、Host Context 和 Snapshot 建立授权视图；
- Capability 对象与授权视图不跨 Invocation 缓存或持久化；但 Tool call arguments 和 ToolResult details 遵循普通 transcript 合同，`reference` / `provenance` 可能进入 Session、replay、export 或日志。它们必须是可持久化的非 secret 标识，不能携带 credential、签名 URL 或其它 bearer secret；
- 输出大小、行数、二进制/图片和敏感路径策略全部由宿主负责；Core 只传递 Provider 返回的结构化结果；
- `ReadCapability` 只读；写入、编辑、bash 和 Job 由独立 Tool/Workflow/Capability 合同处理。

## Alternatives

- **在 Harness 中内置 `read` Tool + `fs`**：拒绝；会固化 Workspace、路径和安全策略。
- **只保留 `read(reference: string)`**：暂缓；无法表达 offset/limit、截断和 provenance，难以复用 NeuroBook/Cosmos。
- **把 NeuroBook file-tools 全部搬入 Core**：拒绝；图片、cwd、输出存储、Project identity 和产品权限不属于 Core。
- **让 ReadCapability 直接返回 `AgentMessage`**：拒绝；Capability 应返回宿主资源事实，模型可见文本由 Tool Adapter 决定。

## Scope

A1 只允许修改：

- `src/capability.ts`：`ReadRequest`、`ReadResult`、`ReadCapability` 类型；
- 一个 deterministic consumer focused test，证明 Capability 注入、分页参数、provenance/truncated 透传和 Provider error；
- `src/index.ts` 通过已有导出保持公开类型可见；
- README、Task walkthrough、本 ADR 和 pack smoke 合同。

不修改 Store、Session record、Harness Run Kernel、NeuroBook、Cosmos、Pi、SSE、Workspace 或默认 Tool 注册。

## Verification plan

- consumer 通过 Capability 传递 opaque reference、offset/limit；
- Provider 返回 content/provenance/truncated/nextOffset 后，Tool 结果完整保留这些事实；
- Provider 拒绝或失败时，Invocation 得到可识别 Tool error，不写入伪造的 read 内容；
- focused、`bun run verify`、`bun run pack:smoke`、`git diff --check`；
- 真实 NeuroBook/Cosmos file tool 接入、权限策略和图片/二进制读取仍单独报告；
- 独立审查完成后才决定是否把 ADR 升格为 `Accepted`。

## Implementation and acceptance

2026-08-08 已完成 NeuroBook `read` 工具和当前 Cosmos fixture 的只读对照，并实现 provisional `ReadRequest`、`ReadResult`、`ReadCapability` 类型与 deterministic consumer slice。2026-08-10 的 standalone acceptance review 重新核对：

- opaque reference、offset/limit、provenance、truncated/nextOffset 的透传；
- Provider 直接抛错时由 Harness 通用 Tool error path 产生 error result，不伪造 read 内容；
- Tool Adapter 暴露给模型的 reference/provenance 会按普通 transcript 合同持久化，公开 Snapshot 回归已冻结该安全边界；
- generic Capability tests 覆盖每 Invocation 一次 open、多 turn 复用、结束 close、缺失 Provider、失败与 abort/late-open cleanup；
- 根导出和 Bun/Node package consumer 的类型编译检查；
- focused 三文件套件为 13 pass / 0 fail / 63 expect calls；
- `bun run verify` 为 122 pass / 0 fail / 613 expect calls；
- `bun run pack:smoke` 通过，包含 prepack、tarball 安装、Bun consumer 与 Node ESM TypeScript consumer。

独立只读 reviewer 未发现 P0 或 Core 实现层 P1。Reviewer 发现原 ADR 将 reference 错误描述为“不写 Session”，以及 continuation 组合和 fixture offset 起点容易误读；本次已按实际 transcript 合同修正，并保留类型形状的宿主可解释性。第二次 post-fix 只读复核确认三项 finding 均已关闭，没有新增 P0/P1 或 scope overclaim。

因此本 ADR 在 standalone Core shape-only 范围内接受。`ReadResult` 仍是结构化 host contract，Core 不运行时验证 `truncated` / `nextOffset` 的组合；Tool Adapter/Provider 必须保证自身结果一致。真实 NeuroBook/Cosmos file tool、Workspace/cwd、权限策略、图片/二进制、输出预算/存储和生产接入仍未验证。现有 Cosmos compatibility test 仍使用自定义 `AuthorizedRead`，不能报告为 Cosmos 已迁移；当前没有默认 `read` Tool。
