# ADR-0036: Session Fork API

- Status: Accepted
- Date: 2026-08-12
- Task: [`01-harness-decoupling`](../tasks/01-harness-decoupling/README.md)

## Context

ADR-0002 explicitly deferred a fork/branch API（"历史 inactive leaf 和更广泛的持久化
anchor 语义另行规划"），Workflow 组合旁路 Agent 的文档化 fork 方式是手工
`createSession` + 复制 active path 的 `{kind, payload}`。第六十七轮只读调查
（Workflow 组合缺口）确认该手工路径有三个真实陷阱：

1. Core-owned kinds 被公开 `write()` admission 拒绝：`harness.invocation.usage`、
   `harness.invocation.partial`、`agent.compaction`、`harness.followUp.*` 都是
   Harness 保留事实，任何有 usage/partial/compaction/followUp 队列的 Session
   都无法按文档方式复制；
2. 绕过 Harness 直接向 Store 复制会产生幽灵投影：`projectFollowUps` 从 entries
   投影队列，`resumeFollowUps` 会把幽灵队列真的启动成新 Invocation；
3. 原样复制 `agent.compaction` 时 `firstKeptEntryId` 指向已丢弃 entry，
   `projectSessionTranscript` 直接抛错。

## Decision

- 新增 `NeuroAgentHarness.forkSession(sourceSessionId, options?)`：从源 Session
  的 active path 派生一个持久 fork，经与 `createSession` + `write` 相同的
  commit seam 落盘（admission、事件发布与恢复语义与普通宿主写入一致）。
- 复制规则：只复制 active path 上的 `agent.message` 与宿主 kinds 条目（保留
  payload，不复制 invocationId 归属——fork 无 Invocation，避免
  `invocationUsage(fork, 旧id)` 的 fallback 幽灵投影）；丢弃 Core-owned 内部
  事实（`harness.invocation.usage`、`harness.invocation.partial`、
  `agent.compaction`、`harness.followUp.*`——与公开 write admission 的保留集
  对齐）；其它 `harness.*` 宿主扩展事实（如 `harness.custom`，ADR-0018 未锁死
  的 namespace）按宿主事实复制。
- 新 Session：profileKey/initial/hostContext 默认继承源（可覆盖），
  `parentSessionId` 记录源；无 Invocation、无 approval、无 follow-up 队列；
  active path 首条成为 root（parentId null），后续按原顺序成链。
- 源不被修改；fork 是某一观察时刻的快照副本，不建立后续同步/merge 关系；
  历史 inactive branch 不复制。
- 幽灵投影防护：由于 follow-up fact 被丢弃，fork 的 `followUpState` 恒为空，
  `resumeFollowUps` 不会启动任何 Invocation。
- 两阶段（create + write）不承诺原子性：write 失败会留下一个空的 fork Session
  （无事件发布、调用方拿不到 sessionId），不提供失败清理或重试幂等；宿主按
  空 Session 自行处理。
- compacted 源的 fork transcript 是丢弃 marker 后的全量历史（无 summary），
  与源的「summary + kept」投影不一致；这是有意语义——fork 从原始事实重建，
  宿主可自行决定是否重新压缩。

## Alternatives

- **保持手工复制并文档化陷阱**：拒绝；陷阱 1/3 直接使文档方式不可用，陷阱 2
  会静默启动幽灵 Invocation，属于安全面问题。
- **复制全部条目并在 Core 内重写引用**：拒绝；compaction 重写与 usage/partial
  重新归属会产生不可验证的语义，且这些事实在 fork 中没有消费者。
- **保留 invocationId 归属**：拒绝；`invocationUsage(fork, 旧id)` 的 fallback
  会对不存在的 Invocation 返回非零 usage（实证），剥离归属后该投影返回零。
- **把 fork 建成 Store 层操作**：拒绝；复制规则依赖 Core-owned kinds 语义与
  Harness 投影，放 Store 会把领域策略下沉到 Adapter。
- **自动建立源与 fork 的后续同步**：拒绝；属于宿主 Workflow 政策，Core 只提供
  一次性派生原语。

## Acceptance gate

- fork 复制 agent.message/宿主条目并丢弃全部 Core-owned 内部事实；
- fork 新 Session idle、无 Invocation、无 follow-up 队列、parentSessionId 溯源；
- 真实运行、JSONL 重启读取、覆盖参数与空 Session 均通过 focused 测试；
- 源不被修改；未知源 fail closed；root/package Bun 与 Node consumer 可用；
- focused/full/package gate 与独立审查通过后升格或撤回。

## Evidence and acceptance

- `tests/fork-session.test.ts`（6 条）：富事实源复制边界/链重根/幽灵队列防护/
  源不变、真实运行副本、覆盖参数、JSONL 重启读取、空 Session、未知源 fail
  closed——全部通过（第六十九轮）。
- `tests/cosmos-orchestration-consumer.test.ts`（2 条）：fork 探索 → 结果投影
  → 锚定回写 → 跨 Store 实例恢复的编排闭环全部由公开 API 表达（第七十轮）。
- focused/full/package：第六十九轮 `17/0/96` + `402/0/1639` + pack smoke
  exit 0（Bun/Node consumer 含 `forkSession` prototype 断言）；第七十轮
  `18/0/104` + `404/0/1655`，typecheck/build 通过。
- 独立审查：第六十九轮（Meitner）与第七十轮（Sagan）均 No P0/P1，P2/P3 已
  吸收；Sagan 按 ADR-0033 接受口径裁定升格 Accepted（standalone Core scope）。

## 2026-08-14 审计整改补充：Parsed initial

默认 fork 继承的是源 Session 已通过 profile admission 的 durable initial，因此只执行 `validateParsed`，不再次调用 raw `parseInitial`；显式 `options.initial` 仍按 raw input 解析一次。非幂等 initial parser 的回归测试钉住该边界，未扩大 `forkSession` public API 或改变覆盖参数语义。
- 未验证保留：真实 NeuroBook/Cosmos consumer、真实 provider/tool、第三方
  Store、HTTP/SSE Transport、浏览器/产品和生产验收继续单独报告。
