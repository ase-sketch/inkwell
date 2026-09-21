# ADR-0039: Prepare Write Auto-Injection

- Status: Accepted (standalone Core scope)
- Date: 2026-08-13
- Task: [`01-harness-decoupling`](../tasks/01-harness-decoupling/README.md)

## Context

第九十一轮把「prepareWrites/hook/Tool writePlans 的 durable 贡献对当前 Invocation 的模型调用不可见、宿主须用 context sections 重复提供」判为合同并钉住，自动注入候选推迟到「真实消费者证据」出现。第一百零一轮规划代理 C 复核 NeuroBook：NB 有产品级测试钉住「写入后同 Invocation 对模型立即可见且恰好一次」（neuro-agent-harness.test.ts:6685 与 :6726-6767；代码路径为 prepareRun 写后重读 snapshot + appendingCount 结构性去重），但只覆盖 prepare 阶段 plan 消息（SA prepareWrites 类比）——NB 的 hook writePlans 只允许 custom 条目、Tool 无 writePlans，同轮注入在 Tool/hook 路径无 NB 对应物。证据门槛满足，吸收范围按此限定。

## Decision

- Profile `prepareWrites` 中 kind 为 `agent.message` 的条目，在计划成功落盘后，其 message 会被注入当前 Invocation 的 transcript work-copy——同一 Invocation 的首个模型请求立即可见且恰好一次；注入位置在 work-copy 尾部（先于随后提交的当前用户消息），与 durable transcript 顺序一致（History → Appending → CurrentUserInput）。
- 单源合同：durable transcript 本身即 provider 内容；同时用 context sections 重复提供同一贡献的消费方将看到两次，需迁移为单写。
- 重启/resume 不重复注入：resume 路径 messages 从 prepareSnapshot 重建（贡献已在 transcript 中），本路径不提交 prepareWrites、不注入。
- Tool writePlans 与 hook writePlans 的同轮注入明确不吸收（无 NB 证据）；它们维持第九十一轮合同（当前 Invocation 不可见，下一 Invocation 可见；ContextProvider 立即可见）。
- 非 `agent.message` 的 prepareWrites 条目（宿主 custom 事实）不注入，仍是普通 durable 事实。
- Compaction 交互不变：第九十一轮对齐投影修复保证贡献进入摘要窗口；注入发生在循环开始前，与 compactIfNeeded 的 work-copy 重建一致。

## Alternatives

- 写后重读 snapshot 重建 work-copy：拒绝——与 Tool 结果、steer 等运行时消息的合并复杂化，且需要重放顺序逻辑；提交时直接注入与 durable 顺序天然一致。
- 继续维持双写合同：拒绝——NB 证据显示产品路径是单源 durable 写入，双写是对宿主的不必要负担且与 NB 语义分歧。
- 连 Tool/hook writePlans 一并吸收：拒绝——NB 无对应已验证行为，属过度吸收。

## Verification gate

- 单源 prepareWrites 同轮可见且恰好一次、顺序先于当前用户消息；重启/resume 不重复；custom 事实不注入；Tool writePlans 仍延迟到下一 Invocation。
- 迁移后 context-lifecycle 消费方测试全绿；focused、全量、pack:smoke 与独立审查。

## Evidence and acceptance

- 消费方迁移：tests/context-lifecycle.test.ts test 2/4 改单写、test 5 从「延迟可见」改写为「同轮可见」；新增 tests/auto-inject-prepare-writes.test.ts。
- ADR-0012 provider 可见性边界小节按本 ADR 更新。
- 先 4 红后全绿；focused 77/0/417（15 files）；全量 500/0/2031、85 files（第一百零三轮口径）；pack:smoke 通过；独立审查（Boyle）无 P0/P1，3 条 P2 全部吸收（注入口径与 durable 投影共用 messageFromEntry）。
- 2026-08-13 升格 Accepted：NB 产品测试证据 + 本仓消费方迁移 + 独立审查满足验收；真实宿主双写消费者的迁移仍待宿主侧动作。
