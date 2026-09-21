# ADR-0037: Manual Compact Session

- Status: Accepted (standalone Core scope)
- Date: 2026-08-12
- Task: [`01-harness-decoupling`](../tasks/01-harness-decoupling/README.md)

## 2026-08-12 acceptance（第九十五/九十六轮）

- 独立审查（Einstein，第九十五轮）：共享抽取后自动路径逐段等价、守卫放宽
  无伪造面（`allowCompactionFact` 仅内部可达；无 invocationId 伪造形态被
  core-owned admission 测试显式拒绝）、entry 无 invocationId 的投影/恢复
  无残留依赖；No P0/P1。P2 已吸收（signal 中止可见性、空 summary 双路径
  测试、docstring 修正）。
- Cosmos 消费切片 v3（第九十六轮，`tests/cosmos-consumer-v3.test.ts`）：
  长会话手动压缩 → fork（无 compaction 残留）→ 分支 invoke → 锚定回写；
  压缩后 follow-up 坏项自动 pause（pausedBy）→ cancel → 好项 resume →
  JSONL 重启后压缩投影、队列清空与 Invocation 链全部恢复。公开 API 在
  编排器真实流程中组合可用。
- 全仓 470/0/1920、79 files（第九十五轮）；`bun run verify` 与
  `bun run pack:smoke` 通过。

## Context

自动 compaction 由 Profile 的 `CompactionSettings` 驱动（触发阈值 + 保留窗口），
在每次模型调用前评估。宿主无法主动压缩：例如会话变长后想在任何下次
Invocation 之前先折叠历史，或用户显式要求「总结并继续」。

NeuroBook 有宿主驱动的 `compactSession`（neuro-agent-harness.ts:7516-7574，
带 instructions、错误以 invocation error 生命周期表达）。standalone Core
没有公开触发入口（第八十八轮 parity 审计 C11）。

`compaction` settings 只存在于每次 Invocation 动态返回的 `PreparedRun`
（profile.ts:79），`ResolvedProfile` 无静态声明——手动路径没有 prepared
run，因此保留窗口由调用方显式提供最合适（宿主知道自己想要的窗口），
Core 只提供切分/摘要/落盘语义。

## Decision

新增宿主驱动的公开入口：

```ts
interface CompactSessionOptions {
    /** 手动压缩的保留窗口（最近 N 个 token），必须为正整数。 */
    readonly keepRecentTokens: number;
    /** 可选摘要提示，原样传给 ContextCompactor.summarize。 */
    readonly instructions?: string;
    readonly signal?: AbortSignal;
}

harness.compactSession(sessionId, options): Promise<{compacted: boolean}>
```

- 只在 idle Session（`activeInvocationId === null`）上运行；有 active
  Invocation 时抛 `InvocationConflictError`（避免与运行中的 transcript
  写冲突）；
- 复用自动压缩同一套切分合同（对齐投影、pending Tool Call 拒绝、
  keepRecent walk-back、toolResult cut、空窗口 skip、悬挂
  `firstKeptEntryId` fail-closed），并写入同款 `agent.compaction` entry
  （`cause: "harness.compaction"`）；不触发阈值（宿主显式请求即执行）；
- `CompactionRequest` 增加可选 `instructions?: string`（additive，
  host-neutral；NeuroBook 的摘要提示等价物）；
- 不发布 invocation-scoped runtime 事件（`compaction_start/end` 绑定
  Invocation attempt，手动路径无 Invocation）；宿主经 `session_entry`
  与后续 `snapshot()` 观察结果；
- 摘要失败或返回空 summary 时抛错且不写 entry（与自动路径一致）；
- `signal` 覆盖 read 前后与 summarize 阶段（summarize 后再次
  `throwIfAborted` 让中止可见）；store commit 本身不绑定 signal（自动
  路径由 attempt fence + ADR-0034 承担，手动路径无 attempt）——signal
  在 summarize 与 commit 之间中止时，若已越过检查点，压缩仍可能落盘；
- 不创建 Invocation、不写 usage/partial、不触发 follow-up/steer。

## Deliberate boundary

- 不提供自动路径的 Profile settings 派生窗口（`PreparedRun.compaction`
  是 invocation-scoped 的）；宿主在手动调用时显式选择窗口；
- 不把手动压缩做成 Invocation 生命周期操作（NB 的 invocation error
  表达不下沉）；失败以 reject 表达；
- 不改自动触发语义：自动路径继续由 `triggerTokens` 驱动，`keepRecentTokens`
  校验保持 `0 < keepRecent < trigger`。

## Alternatives

- **从 ResolvedProfile 暴露静态 compaction settings**：拒绝——settings 是
  prepare 动态产物，静态化会改变 Profile 合同且与每次 Invocation 可变的
  语义冲突；
- **手动压缩复用 prepare() 拿 settings**：拒绝——prepare 需要完整
  Invocation context（payload/caller/capabilities），为一次压缩伪造
  Invocation 反而引入副作用面；
- **发布带合成 invocationId 的 runtime 事件**：拒绝——事件绑定真实
  attempt，伪造 ID 会污染宿主对事件流的理解。

## Verification and acceptance gate

- public 测试覆盖：正常压缩（投影更新、durable entry、无 Invocation）、
  instructions 传递、空窗口 skip（`compacted: false`）、active 冲突、
  未配置 compactor、非法 keepRecent、悬挂 Tool Call fail-closed、
  摘要失败不落盘、JSONL 重启后投影恢复；
- 自动路径回归：既有 compaction 测试全绿（共享切分抽取不改变行为）；
- `bun run verify`、`bun run pack:smoke`（公开合同变化）、`git diff
  --check`；独立审查。

## 2026-08-14 审计整改补充：自动 compaction 的受限 rebase

手动 `compactSession` 仍保持 idle-only 语义。本轮只修复自动 Invocation 路径：若并发新增尾部严格限定为 follow-up coordination entries，且 owner/attempt 与原 Invocation 一致，则 compaction commit 可在最新 Snapshot 上重基；其它并发修改仍 fail closed。该实现不把 compaction 扩展为通用 merge，也不改变手动压缩的 public API。
