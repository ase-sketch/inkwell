# 第六十九轮：Session Fork API（forkSession）

## 状态

第 68 轮记录的第二候选落地：`NeuroAgentHarness.forkSession(sourceSessionId,
options?)` 从源 Session 的 active path 派生持久 fork，替代 Workflow 组合中
不可用的手工复制路径。新增公共 API + ADR-0036（Proposed）+ 6 条 focused 测试；
用户保护文件未纳入范围。

## 规划依据

- 第六十七轮 Workflow 缺口调查（Confucius）证据：手工 `createSession` + 复制
  `{kind, payload}` 有三处直接陷阱——
  1. Core-owned kinds 被公开 `write()` admission 拒绝（usage/partial/
     compaction/followUp），有这些事实的 Session 无法按文档方式复制；
  2. 绕过 Harness 直接向 Store 复制会产生幽灵队列，`resumeFollowUps` 会把幽灵
     队列真的启动成新 Invocation；
  3. 原样复制 `agent.compaction` 时 `firstKeptEntryId` 指向已丢弃 entry，
     `projectSessionTranscript` 抛错。
- ADR-0002 原文预告 fork API defer；本 API 为 additive 组合原语，不建立
  源/fork 同步、不复制历史 inactive branch、不新增 merge。

## 变更

- `src/harness.ts` 新增公开 `forkSession(sourceSessionId, options?)` 与
  `ForkSessionOptions`：
  - 经既有 public seam 落盘：`createSessionOnce`（profile 解析 + durable
    creation + publication fence）+ `writeOnce`（单批 appendEntries）；
  - 复制规则：active path 条目中丢弃 Core-owned 内部事实
    （`harness.invocation.usage`/`harness.invocation.partial`/
    `agent.compaction`/`harness.followUp.*`，`isCoreOwnedForkFact` 与公开
    write admission 保留集对齐），保留 `agent.message`/宿主 kinds 的 payload
    （其它 `harness.*` 宿主扩展事实按宿主事实复制），不复制 invocationId
    归属（避免 `invocationUsage(fork, 旧id)` 幽灵投影）；首条成为 root，后续
    按原顺序成链（省略 parentId 由 reducer 继承 active leaf）；
  - 新 Session：profileKey/initial/hostContext 默认继承源（options 可覆盖）、
    `parentSessionId` 溯源；无 Invocation/approval/follow-up 队列；
  - 空 active path 返回干净副本；未知源经 `store.read` fail closed。
- 新增 `tests/fork-session.test.ts` 6 条：富事实源（usage/partial/compaction/
  followUp 全在 active path，另含宿主扩展 harness.custom）fork 后只留
  agent.message + host.custom + harness.custom、链重根、队列为空且
  `resumeFollowUps` 不启动幽灵 Invocation、源不被修改；真实运行后 fork 干净
  副本（transcript 与源一致）；覆盖参数；JSONL 持久化 + 新 Store 实例读取；
  空 Session；未知源 fail closed。
- ADR-0036（Proposed）：Context（三个陷阱证据）/Decision（复制规则、seam、
  parentSessionId）/Alternatives（手工复制、全量复制重写、Store 层、自动同步）/
  Acceptance gate。

## TDD 证据

初始 red：`harness.forkSession is not a function`（6 fail）。实现后 focused：

```text
bun test tests/fork-session.test.ts tests/workflow-extension.test.ts \
  tests/cosmos-consumer-compatibility.test.ts tests/invocation-result-projection.test.ts
17 pass / 0 fail / 96 assertions
```

（fork 6 条 + workflow-extension 1 条 + cosmos consumer 2 条 + projection 8 条）

## 门禁

- `bun run verify`：`402 pass / 0 fail / 1639 assertions`，59 test files；
  typecheck/build 通过。
- `bun run pack:smoke`：exit 0；prepack `402/0/1639`，113 files，package
  `131.2 kB`，unpacked `618.9 kB`；Bun/Node ESM consumers 均含
  `forkSession` prototype 断言（按第 68 轮 P2-2 教训提前纳入）。
- `git diff --check` 仅 Windows LF/CRLF warning。

## 未验证与保留边界

- 真实 NeuroBook/Cosmos consumer、真实 provider/tool、第三方 Store、HTTP/SSE
  Transport、浏览器/产品和生产验收仍未运行。
- fork 是观察时刻快照副本：源后续变更不回流，fork 后续变更不回溯；宿主需要
  持续同步时自行组合 Workflow（merge/rebase 是宿主政策）。
- 历史 inactive branch、waiting approval、follow-up 队列、usage/partial/
  compaction 事实均不复制（语义已在 ADR-0036 明示）；`invocationId` 归属不
  复制，fork 中不存在对旧 Invocation 的任何引用。
- ADR-0036 保持 Proposed，待独立审查后决定升格/撤回。

## 独立审查

- 只读独立审查（Meitner）对照全部 Core-owned kind 写入点与投影路径：
  **No P0/P1 findings**；followUp 幽灵防护经代码+测试双重确认，shutdown
  admission 无竞态，reducer 成链与 round-63 语义一致。
- P2 已吸收：剥离 invocationId 归属（消除 `invocationUsage(fork, 旧id)` 的
  fallback 幽灵投影，新增断言）；复制边界收敛为 write admission 保留集
  （`harness.custom` 宿主扩展事实保留，测试覆盖）；ADR 明示两阶段非原子性与
  compacted 源的全量历史 transcript 语义；walkthrough 原「transcript 与源
  一致」表述限定为未 compacted 会话。
- P3 已吸收：ADR 措辞改为「同一 commit seam」；pack 体积按最终门禁更新。
