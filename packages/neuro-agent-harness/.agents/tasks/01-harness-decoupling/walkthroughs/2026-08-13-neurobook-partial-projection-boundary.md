# 第一百一十四轮：NeuroBook partial/interruption 与宿主展示投影边界

## 状态

本轮完成 NeuroBook provider interruption / partial assistant 的真实合同审计，并新增一个仅测试用的宿主展示投影 tracer。结论是：standalone Harness 当前的 ModelTurnError.partial / harness.invocation.partial 合同足够让宿主自行保存可展示的 partial；没有证据需要把 NeuroBook 的普通 assistant status、UI projection、retry/continue 产品语义下沉到 Harness Core。

本轮只修改了 tests/model-turn-partial.test.ts 和 Task 文档；没有修改 Harness src、根导出、依赖、durable Core shape、NeuroBook 或 Cosmos。既有 dirty 文件继续保护：docs/architecture.md、docs/pi-adapter-design.md、package.json、tests/context.test.ts。

## 规划依据

- 第 113 轮已确认 NeuroBook SSE/recovery 的 Recovery DTO、Project revision、HTTP route、SSE writer 和 UI projection 仍属于宿主；本轮转向最新 partial/interruption 合同。
- Goal 要求吸收 NeuroBook 的已验证修复，但不假设独立 Harness 与 NeuroBook 行为完全一致；只有 provider-neutral 缺口被真实证据证明时才扩展 Core。
- ADR-0016 已明确 standalone partial 是 Invocation 终态恢复事实，不是普通 provider transcript；本轮验证宿主能否在不破坏这条边界的情况下保留自己的展示投影。

## NeuroBook 真实行为

审计了以下 NeuroBook 代码和测试：

- server/agent/harness/turn-failure.ts
- server/agent/harness/neuro-agent-harness.ts
- server/agent/harness/neuro-agent-harness.test.ts
- server/agent/session/types.ts
- server/agent/messages/stored-types.ts

关键合同：

1. provider 返回 stopReason: error 或 aborted 且已有正文时，executeTurn() 生成 partialAssistant；sanitizePartialAssistant() 删除未闭合 Tool Call，只保留正文。
2. commitTurn() 把该 assistant 作为普通 message entry 持久化，并附 status: partial 或 status: interrupted。
3. retry 通过 moveLeafForPosition(..., before) 把失败消息从下一次 active path 中排除；tree/fork/continue 依赖宿主自己的消息树和 projection。
4. 因此 NeuroBook 的 partial 是可展示、可作为产品分支锚点的 transcript message；这不是 standalone Harness 当前的默认语义。

## standalone 合同对照

standalone 当前明确提供：

- ModelTurnError.partial：只接受非空 text/thinking block，拒绝 Tool Call；
- harness.invocation.partial：与 failed/aborted terminal、usage 同一 durable commit；
- invocationPartial(snapshot, invocationId)：按 Invocation ID 恢复，不随 active branch projection 消失；
- projectSessionTranscript() / sessionMessages()：只投影 active path 上的 agent.message，忽略 harness.invocation.partial；
- retry 和 compaction：不把 partial fact 送入 Provider context；
- cooperative abort / forced abort：分别保存 partial 或让 sealed forced terminal 先赢；
- JSONL restart：从 Snapshot 恢复已确认 partial，未确认 persistence 不伪造 durable fact。

这形成了有意的职责分离：

Provider Adapter -> ModelTurnError({partial}) -> Harness terminal Invocation fact -> invocationPartial(snapshot, invocationId)
Host Adapter -> 自有 host entry 保存 UI/产品展示投影 -> 自己决定 status、branch、retry/continue 行为
Core transcript / retry / compaction -> 不消费 partial fact

## 执行：host projection tracer

在 tests/model-turn-partial.test.ts 新增 test-only host.agent.partial codec，完全通过公开 seam 组合：

- defineSessionEntryCodec()：为宿主 entry 提供 schema 和恢复解析；
- harness.appendEntries()：追加宿主自己的 partial 展示事实；
- activeSessionPath() / projectSessionTranscript()：区分 active transcript 与宿主 entry；
- invocationPartial()：对账 Core-owned terminal fact；
- JsonlSessionStore：跨实例恢复；
- retry()：验证展示事实不进入下一次 Provider request。

测试覆盖的行为链：

ModelTurnError.partial -> confirmed harness.invocation.partial -> host.agent.partial（宿主展示 entry） -> active transcript 不包含 partial 文本 -> rewind 后 host entry 不在 active path，但 append-only entries 仍可恢复 -> JSONL restart 后 host entry + Invocation partial 仍可解析 -> retry Provider request 不包含 partial 文本

这里没有把 host.agent.partial 加入 src，也没有建议 Core 认识这个 kind；它只是证明公开 host-entry seam 足以承载产品投影。

## 验证

### focused

    bun test tests/model-turn-partial.test.ts
    14 pass / 0 fail / 65 expect calls

覆盖原有 partial 矩阵以及本轮宿主展示投影、active branch rewind、JSONL restart 和 retry 隔离。

### typecheck / diff

    bun run typecheck
    通过

    git diff --check
    通过；仅有 Windows LF/CRLF 转换提示

### 验证结果

- bun run verify：已完成，`522 pass / 0 fail / 2181 expect calls`，93 files；typecheck/build 通过。
- bun run pack:smoke：本轮没有修改 src、exports、package.json、依赖或打包边界，沿用第 111 轮 package boundary 证据，不重复运行。

## 审查与结论

### 已验证

- 宿主可以用自有 typed entry 保存 partial 展示事实；
- Core 的 transcript projection 不会把该 host entry 当成 provider message；
- Core-owned Invocation partial 仍按 Invocation ID 可恢复，且不随 active branch rewind 消失；
- JSONL restart 后宿主 entry 和 Core partial fact 都能恢复；
- retry Provider request 不包含 partial 展示文本；
- 没有新增 Core API、ADR、依赖或领域 DTO。

### 未验证

- 真实 NeuroBook Adapter 是否已经或将要消费 standalone Harness；
- 真实 Pi/provider stream、真实 Cosmos consumer、浏览器/UI partial rendering；
- NeuroBook 产品层 continue/retry 的完整端到端运行时行为；
- 第三方 Store、跨进程共享 EventHub、生产 Transport 和部署。

### 审查边界

独立审查代理槽位在本轮已满，未能新增审查代理；本地窄审查复核了新增测试的断言强度、公开 API 使用和 active-path/append-only 关系，并修正为显式检查：

- active path 中确实出现 host entry；
- rewind 后 active path 隐藏该 entry，但 append-only entries 保留；
- provider transcript 以序列化消息整体排除 partial 文本。

未发现 P0/P1，也没有证据支持新增 Core partial continuation API。

## 下一轮规划入口

第 115 轮优先寻找真实消费者/Adapter 边界，而不是继续堆叠 fake parity：

1. 检查 standalone tarball consumer 和 Cosmos 需求是否出现真实 tracked Adapter、manifest/lockfile 依赖或可执行 agent.invoke@1 schema；在此之前 Cosmos 继续直接使用 pi-ai。
2. 若没有真实消费者接线，优先做一个更接近真实 Transport/Provider 的边界验证；不把 package fixture、fake host 或 Pi-like tracer 报告为真实集成。
3. 只有真实消费者证明“展示 partial + 不进入 Provider context + retry/branch/restart 可恢复”无法由 host entry + Invocation fact 组合表达时，才重新设计 provider-neutral branch/continuation API 或 ADR。
