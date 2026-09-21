# 第二十七轮：Partial assistant/provider throw contract audit

## 结论

本轮确认了真实缺口，但没有足够安全的 durable contract，因此不修改生产代码、不建立 ADR-0014。

当前事实：

```text
provider text/tool delta
  → runtime event replay 可见
  → provider throw / abort throw
  → Invocation failed / aborted
  → Snapshot 不保留 partial assistant
  → retry request 不包含 partial
```

这与 NeuroBook Task 07/139 的真实证据一致：provider 已生成内容，但 SDK throw 使完整 result 路径被短路。与此同时，standalone 当前也没有把未闭合 Tool call 错误写进 durable transcript；这个安全属性必须保留。

## 并行规划

三个只读规划角度得到以下共识：

- Core 应拥有 durable partial transcript、retry/recovery 和 ownership 规则；Adapter 只负责把 provider stream 归一化；
- `ModelRuntimeEvent` 是观察流，不应由 Harness 直接反推 durable AgentMessage；
- 当前 `tool_call_delta.arguments: JsonValue` 没有 fragment/replacement、closure、sequence 或完整性合同，不能安全重组；
- `ModelTurnResult` 直接改成 success/failure 判别联合会改写所有 Provider 的 reject 控制流，当前切片过大；
- 若未来实现，最窄候选是 additive typed `ModelTurnError`，携带只含完整 text/thinking block 的 provider-neutral partial draft；普通 `Error` 保持现状。

规划对“现在是否实现”有分歧：

- API 角度认为 typed error 可以作为最小 seam；
- concurrency/durability 角度认为 abort freeze、invalidated write、retry transcript 和 atomic terminal 尚未定义；
- consumer 角度认为价值高于 usage/compaction，但应先做 tracer 和矩阵。

本轮采用保守交集：先证明事实，不提前固化公共 API。

## 临时 public tracer

临时创建、运行后移除 `tests/partial-assistant-spike.test.ts`。它只使用公开 ModelRuntime/Harness/Event/Snapshot 合同，覆盖：

1. text delta 后普通 provider throw；
2. text delta 后用户 abort，Provider 响应 signal 后 throw；
3. 未闭合 tool-call delta 后 throw；
4. 第一种失败后的 retry request。

结果：

```text
bun test tests/partial-assistant-spike.test.ts

3 pass
0 fail
12 expect() calls
```

`bun run typecheck` 同时通过。

行为矩阵：

| 场景 | Runtime replay | Snapshot partial | Retry context | Terminal |
| --- | --- | --- | --- | --- |
| text delta → throw | 可见 text delta | 无 | 不包含 partial | failed |
| text delta → abort throw | abort 前 delta 可见 | 无 | 未在本 tracer 执行 retry | aborted |
| incomplete Tool delta → throw | 可见 Tool delta | 无 pending Tool | 不适用 | failed |

临时测试已删除，避免把“partial 永久丢失”写成期望回归。

## 为什么暂不实现

### 1. Abort freeze 与 ownership

`requestAbort()` 会先 invalidate attempt，再触发 Provider signal；普通迟到 transcript write 必须被 ADR-0007 fence 拒绝。若要保留 abort 前 partial，需要定义：

- freeze 是发生在 abort 请求、Provider catch 还是 grace deadline；
- Provider 如何证明内容只来自 freeze 前；
- cooperative catch 是否允许 invalidated attempt 写 partial；
- forceAbort 是否把 frozen partial 与 terminal 放在一个 owner-CAS plan；
- seal 后任何 late partial 都必须丢弃。

### 2. Tool call 完整性

现有 delta 不能说明 Tool arguments 是否完整。第一版 partial 若包含 Tool call，会制造 pending Tool、approval 或 compaction 破坏。typed partial 至少必须从类型上排除 Tool call；不能只靠运行时“尽量剥离”。

### 3. Retry transcript

将 partial 写成普通 assistant message 会让 retry Provider 把截断文本当成完整历史；排除 partial 又需要 durable status/projection 规则。当前没有决定 retry 应：

- 继续 partial；
- 忽略 partial；
- 把 partial 作为非 assistant 诊断上下文。

### 4. Terminal durability

partial commit、failure settlement 和 terminal finish 之间存在 crash window。ADR-0013 已保证未确认 terminal 不发布 `agent_end`，但公共 `InvocationResult` 仍未显式区分 execution failure 与 durable terminal unknown。partial 不应在这个问题上再增加第二个含混状态。

## 候选 API（未接受）

未来可重新评估：

```ts
type ModelTurnPartialContent =
    | {type: "text"; text: string}
    | {type: "thinking"; thinking: string};

interface ModelTurnPartial {
    readonly content: readonly ModelTurnPartialContent[];
    readonly usage?: TokenUsage;
}

class ModelTurnError extends Error {
    readonly partial?: ModelTurnPartial;
}
```

该候选不表达 Harness 的 aborted 身份，不携带 Provider DTO，不允许 Tool call。它仍需真实 Adapter、abort/force/retry/Store matrix 后才能成为 ADR。

## 验证边界

- 本轮没有保留源码或测试修改，只有 Task/walkthrough 文档；
- 临时 tracer 3/12 和 typecheck 通过；
- 第二十六轮 checkpoint 的全仓基线仍是 133 pass / 0 fail / 664 expect calls；
- 本轮未重复 full/pack smoke，因为删除临时测试后生产树未变化；
- 第一次独立只读 reviewer 超时且未修改文件；缩窄审查范围后，第二次 reviewer 未发现 P0/P1。该审查没有重新验证 NeuroBook Task 07/139 或第二十六轮全仓基线；
- 未运行真实 Pi/Cosmos/NeuroBook provider、浏览器、HTTP/SSE、发布或生产验收。

## 下一步

第二十八轮先审计 provider failure usage 与 terminal durability unknown：

- 已完成 turn 的 usage 是否在后续 failure 中保持；
- Provider throw 携带 usage 的最小 seam 是否必须与 partial 一起设计；
- terminal Store 未确认时公共 result 应如何表达，避免调用方把本地 failed 当成 durable terminal；
- 不把 Pi cost/cache/provider metadata搬进 Core。

这个切片可以决定 typed `ModelTurnError` 是否应同时拥有 partial 与 usage，也能先解决 partial 实现依赖的 terminal uncertainty。
