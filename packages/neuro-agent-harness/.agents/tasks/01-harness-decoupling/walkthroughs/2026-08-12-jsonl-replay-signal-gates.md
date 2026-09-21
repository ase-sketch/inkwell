# 第六十五轮：JSONL 跨 record replay 图 admission 与 external-signal gate 补测

## 状态

本轮补齐第六十三/六十四轮收尾记录的 P2 测试缺口：JSONL 跨 record replay 的图
admission 边界与 `linkInvocationSignal` 的 waiting 路径。全部为 gate 回归测试，
不修改任何 `src/` 生产代码、公共 API、ADR 或依赖；用户已有的
`docs/architecture.md`、`docs/pi-adapter-design.md` 与 `tests/context.test.ts`
未纳入范围。

## 规划依据

- 第六十三轮收尾候选：「JSONL 跨 record 重复 ID/环 replay 与 external-signal
  gate 的 P2 测试缺口」；第六十四轮收尾再次列出。
- 只读调查确认实现现状：`JsonlSessionStore.readSnapshotState()` 在逐 record
  replay 时只检查 version 连续与跨 record 重复 ID（`JSONL commit entry ID
  重复`）；环、悬挂 parent 与同批重复 ID 由最终 `normalizeSessionSnapshot()`
  的 `assertSessionEntryGraph()` 兜底。两个层级都已有实现但缺专门回归。
- 只读调查确认 `linkInvocationSignal` 语义：listener 在 `active.result` 结算
  时移除；waiting 结算后 signal abort 不再生效，durable cancel 由 Workflow
  调用 `harness.abort(sessionId)`（第三十二轮 ADR-0017 记录的既定设计边界：
  「external signal 只链接当前 handle；waiting 后的 durable cancel 仍由
  Workflow 调用 harness.abort，不保存 signal」）。

## 变更

- 新增 `tests/jsonl-replay-graph-admission.test.ts`（4 条 gate）：
  - 跨 record 重复 Entry ID 在 replay 边界 fail closed（checkpoint + delta 两
    条 record 各含 entry-a → `JSONL commit entry ID 重复`）；
  - 同一 commit record 内重复 Entry ID 由全图校验 fail closed；
  - 跨 record 组成的 Entry 环由全图校验 fail closed；
  - 跨 record 引入的悬挂 parent 由全图校验 fail closed。
  测试用手工构造的 JSONL 文件（沿用既有 malformed-graph 测试模式），锁定
  entry-graph 维度的「损坏历史必须 read fail closed」恢复边界；invocation
  数组一致性（重复 invocation ID、idle session 配 waiting invocation 等）
  不在本轮范围，保留为后续候选。
- `tests/workflow-invocation-signal.test.ts` 新增 2 条 gate：
  - signal 在 durable waiting 结算前（approval_required 到达时）abort →
    bounded abort 收口：终态 aborted、事件序列 `["waiting", "aborted"]`、
    durable status idle + invocation aborted；
  - waiting 结算后 signal abort 不持久化（listener 已解除、`requestAbort`
    因 completionSettled no-op），invocation 保持 waiting；随后
    `harness.abort(sessionId)` 完成 durable cancel——把「不保存 signal」的
    设计边界显式钉死。
- 测试过程中发现的观察点：首版 waiting gate 在 `approval_required` 处 break
  for-await，漏收后续 `agent_end`；改为 collector 持续收集 + close 后排空，
  与第六十三轮 waiting-abort 测试同构。

## 门禁

- focused：JSONL replay（4）+ signal（7）+ parent admission（12）+ abort
  boundary（14）+ JSONL store/delta/recovery 相关 = `80 pass / 0 fail /
  338 assertions`（7 files，含 P2 吸收后的 session status 断言）。
- `bun run verify`：`366 pass / 0 fail / 1549 assertions`，56 test files；
  typecheck/build 通过。
- `bun run pack:smoke`：未运行——本轮无 `src/` 变更，`package.json` 的
  `files` 只含 `dist` 与文档，包内容与第六十三轮已验证状态一致。
- `git diff --check` 仅 Windows LF/CRLF warning。

## 结论与边界

- 现有 provider-neutral 合同足够：JSONL replay 的两级 fail-closed 与
  external-signal 的 handle 生命周期边界都不需要 Core 变更。
- JSONL read admission 只覆盖 entry 图（重复/环/悬挂 parent）；invocation
  数组的 coherence 校验（重复 invocation ID、status 与 session 状态一致性）
  是预存边界，未在本轮钉死。
- signal 不持久化是既定设计：waiting/跨进程恢复后的取消由宿主通过
  `harness.abort()` 表达；若未来要求 signal 语义覆盖 waiting，需要单独
  ADR 讨论持久化 signal 的恢复契约，本轮无证据支持。
- 真实 NeuroBook/Cosmos consumer、真实 provider/tool、第三方 Store、
  HTTP/SSE Transport、浏览器/产品和生产验收仍未运行。

## 独立审查

- 只读独立审查（Bacon）逐条对照 `jsonl.ts` replay 逻辑与
  `linkInvocationSignal`/`requestAbort`/`forceAbort` 语义：**No P0/P1
  findings**；4 条 JSONL gate 与两级 fail-closed 路径精确对应、手工 record
  形状合规、无误报/漏报；2 条 signal gate 时序确定性成立（approval_required
  同步发布先于 completion settle；listener 随 handle 结算移除）。
- P2 已吸收：waiting 结算后中间 snapshot 补 `session.status === "waiting"`
  断言，把「signal 不持久化」钉死到 session 层；walkthrough 结论收窄为
  entry-graph admission，invocation 数组 coherence 列为后续候选。
