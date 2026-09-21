# ADR-0012: Durable Context Contribution Entry Boundary

- Status: Accepted (standalone Core scope)
- Date: 2026-08-10
- Task: [`01-harness-decoupling`](../tasks/01-harness-decoupling/README.md)

## Context

ADR-0003、0005 和 0010 已提供 request-only Context sections 与 per-turn ContextProvider。一个宿主 Adapter 也可以通过 `PreparedRun.prepareWrites` 把 History/Appending contribution 持久化，并在同一个 `appendEntries` operation 中附带宿主 marker，从而获得原子关联和 JSONL 恢复。

但 durable contribution 必须成为 Core 可投影的 `agent.message` entry。当前 canonical payload `{turn, message, messageIdentity}` 只由内部 `messageEntryPayload()` 构造，包根没有公开 draft primitive。消费者只能复制私有 JSON envelope；字段演进、message identity 默认值和 transcript 投影因而可能漂移。自定义 host entry 虽然有 `SessionEntryCodec`，但不会进入 provider transcript，不能替代 canonical message entry。

第二十轮 public-seam 红测直接从包根导入 `createAgentMessageEntryDraft`，在加载阶段以 `Export named 'createAgentMessageEntryDraft' not found` 失败，证明缺口存在于公开合同。

## Decision

提出一个 additive、provider-neutral 的 canonical draft helper：

```ts
interface AgentMessageEntryDraftOptions {
    readonly turn: number;
    readonly invocationId?: string;
    readonly parentId?: string | null;
    readonly messageIdentity?: MessageIdentity;
}

function createAgentMessageEntryDraft(
    message: AgentMessage,
    options: AgentMessageEntryDraftOptions,
): SessionEntryDraft;
```

- helper 固定 `kind: "agent.message"`，复用 Core 的 canonical payload serializer；
- `turn` 必须是非负整数，非法值在产生 write plan 前失败；
- `invocationId`、`parentId` 和 `messageIdentity` 只在显式提供时写入；
- 宿主可以把 marker codec draft 与 message draft 放进同一个 `appendEntries` operation，原子提交由既有 `SessionWritePlan` / Store 合同保证；
- helper 从包根导出，并进入 tarball Bun/Node consumer compile smoke。

## Deliberate boundary

本 ADR 只公开“怎样安全构造一个 Core transcript message draft”，不定义：

- `HistorySet`、`AppendingSet`、Reminder、Watch 或 TSX DSL；
- contribution key、marker schema、去重、retry/rebase 或 settlement 策略；
- 当前用户输入、ModelContext 与 AppendingSet 的新 prompt 顺序；
- 跨 Session 事务、Job/Lease/Outbox、delivery、exactly-once、SSE 或 sidecar；
- Profile/Tool 直接访问 Store。

Adapter 仍根据 Snapshot 决定何时贡献消息，并通过 `prepareWrites` 或 hook `writePlans` 返回计划。Snapshot 继续是恢复真相源。

## 2026-08-12 provider 可见性边界（第九十一轮补充）

- durable contribution 的 provider 可见性分两层：
  - **ContextProvider / 后续 Invocation**：prepareWrites / hook writePlans /
    Tool writePlans 提交的 `agent.message` entry 立即对 ContextProvider
    （读最新 Snapshot）可见，并从下一个 Invocation 起进入 provider request
    的 transcript 分区（run 起点用最新 Snapshot 重建）；
  - **当前 Invocation 的模型调用**（2026-08-13 起，ADR-0039）：prepareWrites
    中的 agent.message 贡献在成功落盘后自动注入当前 Invocation 的
    work-copy，首个模型请求立即可见且恰好一次（单源合同；同时用 context
    sections 重复提供的消费方会看到两次，需迁移）；Tool writePlans 与
    hook writePlans 的同轮注入不吸收，仍维持「当前 Invocation 不可见、
    下一 Invocation 可见」。
- 与 NeuroBook「写入后重读 snapshot 自动注入」不同：自动注入会使双写消费方
  重复、并改变 provider-visible 消息顺序（贡献会插入到当前用户消息之前）。
  第一百零三轮在真实消费者证据（NB 测试钉住同轮可见且恰好一次）满足后，
  以 ADR-0039 立项吸收；本节保留第九十一轮的两层叙述作为历史记录，当前
  合同以 ADR-0039 为准。
- in-invocation compaction 边界（第九十一轮修复）：`compactIfNeeded` 使用
  最新 Snapshot 的对齐投影（`projectSessionTranscript` 的 messages，而非
  run 的 work-copy）做触发计数、walk-back、toolResult cut 与摘要窗口——
  prepareWrites 等已落盘贡献因此会进入摘要（或保留区）。修复前 work-copy/
  path 索引错位会使贡献被投影丢弃、且被摘要的旧消息在保留区重复出现；
  修复后 cut 点与 `firstKeptEntryId` 始终指向真实 entry。

## Alternatives

- **只导出 `messageEntryPayload()`**：拒绝；消费者仍需手工拼接 kind、invocation/parent metadata，容易形成半规范 draft。
- **让消费者复制 payload JSON**：拒绝；已经由 message identity 演进证明 envelope 会变化。
- **把 durable History/Appending 直接做成 Core 类型**：暂缓；生命周期、CurrentUserInput 顺序与 settlement 尚未由独立消费者充分证明。
- **只写自定义 host entry**：拒绝；Core transcript 不投影未知 entry kind，provider 看不到 contribution。

## Verification and acceptance gate

- focused red 必须先证明包根 primitive 缺失；
- Memory public consumer 证明 stable History 只写一次，每个 Invocation 的 Appending marker/message 原子写入且不重复注入；
- JSONL waiting/restart 证明同一 Invocation 重建 `Profile.prepare()` 时不重复 contribution；
- ContextProvider model-only 结果在恢复前后只属于对应 request，不写入 Session；
- helper 参数校验和 message identity envelope 有 focused 测试；
- `bun run verify`、`bun run pack:smoke`、`git diff --check`；
- 独立审查确认没有把 Adapter lifecycle 或 NeuroBook 产品语义误报成 Core 合同。

## 2026-08-10 implementation and acceptance

- 第一条 public-seam red 在测试加载阶段以 `Export named 'createAgentMessageEntryDraft' not found` 失败，证明消费者无法从包根构造 canonical message draft。
- `src/session-transcript.ts` 新增 `AgentMessageEntryDraftOptions` 与 `createAgentMessageEntryDraft()`；根导出只公开这两个声明，没有公开内部 transcript projector。
- Memory consumer 通过 commit observer 证明 marker/message 位于同一个 durable commit，且 Harness 注入精确 Invocation owner fence；stable History 只写一次，每个 Invocation 的 Appending 各写一次。
- JSONL waiting→dispose→新 Harness→resume 的第一轮红测得到 Appending 两份；Adapter 改为从 Snapshot marker 判断后转绿，同一 Invocation 的 contribution 恰好恢复一次。ContextProvider 的旧 model-only 文本不落盘，resume 后只生成最新 Snapshot 对应的一份。
- focused `bun test tests/context-lifecycle.test.ts`：4 pass / 0 fail / 39 expect calls。
- `bun run verify`：122 pass / 0 fail / 610 expect calls；包含 typecheck、build 和 32 个测试文件。
- `bun run pack:smoke`：通过；prepack 同为 122/610，tarball 的 Bun runtime consumer 与 Node ESM TypeScript consumer 均从包根导入 helper，Node 额外编译 `AgentMessageEntryDraftOptions`。
- `git diff --check`：通过，仅有 Windows LF/CRLF 转换警告。
- 独立只读审查未发现 P0/P1，也未发现 scope overclaim。

因此本 ADR 在 standalone Core 范围内接受。接受内容只有 canonical `agent.message` draft construction。helper 不验证 `invocationId` 是否属于当前 Session，也不验证 `parentId` 是否属于当前 branch；这些仍由调用方与既有 Harness/SessionWritePlan/Store 边界负责，不由本 ADR 扩张为新保证。

真实 NeuroBook/Cosmos consumer、History/Appending settlement、CurrentUserInput 尾置、跨进程 Profile state、第三方 Store、真实 provider/tool、HTTP/SSE Transport 和产品验收仍未验证。
