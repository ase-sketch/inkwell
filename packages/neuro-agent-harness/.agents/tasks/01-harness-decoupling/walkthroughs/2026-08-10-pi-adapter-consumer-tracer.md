# 第三十轮：Pi Adapter consumer tracer

## 结论

当前 Core API 已足够让宿主实现 Pi Adapter，本轮不新增公开合同、不引入 Pi dependency，也不建立 ADR。

consumer tracer 证明：

```text
Pi-like cumulative stream
  ├─ success
  │    → ModelRuntimeEvent deltas
  │    → ModelTurnResult assistant + usage
  └─ error / abort
       → keep last cumulative partial inside Adapter
       → ModelTurnError(error, {usage})
       → existing Harness failure/abort terminal pipeline
```

partial 正文仍只属于 runtime replay，不进入 standalone durable transcript。

## 为什么不直接安装 Pi

当前本地 NeuroBook 使用 `@earendil-works/pi-ai@0.80.6`。npm package metadata：

```text
unpacked size: 6,040,038 bytes
files: 594
license: MIT
```

依赖包含 Anthropic、OpenAI、Google、Mistral、Bedrock、OpenTelemetry 和代理 SDK。只为验证一个宿主 Adapter 的事件映射，把整套 Provider runtime 放进 standalone Core 或 devDependency 会：

- 扩大安装、lockfile 和供应链面；
- 把 Harness 测试绑定到一个 Pi 版本；
- 与 Cosmos/llmlint 暂时保留各自 provider 版本的可逆策略冲突；
- 模糊 Core 与未来可选 `@notnotype/neuro-agent-harness-pi` package 的边界。

因此本轮使用根据 Pi 0.80.6 公开类型与源码构造的 structural fixture。它不导入 sibling NeuroBook 或 Pi runtime。

## 对照的真实 Pi 形态

只读检查确认：

- `AssistantMessageEvent` 每个 start/delta event 都带 cumulative `partial`；
- error event 带最终 error assistant，随后 `stream.result()` reject；
- Provider 也可能在 async iterator 内直接 throw；
- Anthropic 可在 `message_start` 先更新 input/cache usage；
- OpenAI-compatible usage 可能只在后续 chunk 或 terminal response 出现；
- abort 普遍由 `AbortSignal` 导致 stream error/reject；
- Pi partial 还包含 provider/model/cost/cache/signature/stopReason/errorMessage 等宿主私有字段。

NeuroBook Task 07/139 的 `streamAssistant()` 正是保存最后 partial 并处理 result reject；但它同时持有 message status、UI 和 branch projection，不能原样搬入 Core。

## Consumer Adapter

`tests/pi-adapter-consumer.test.ts` 内实现 `HostPiLikeModelRuntime`：

1. 接收 Core `ModelTurnRequest`，把同一个 `AbortSignal` 交给 stream factory；
2. for-await 期间保存最后一份 cumulative partial；
3. 只投影 `message_start`、text/thinking/tool delta；
4. 成功 `result()` 转成 provider-neutral assistant；
5. iterator 或 `result()` 失败时，用最后 partial 的 usage 构造 `ModelTurnError`；
6. provider、model、cost、cache、signature、stopReason 和 errorMessage 不进入 Core message。

Pi usage 映射为：

```text
Core.input  = Pi.input
Core.output = Pi.output
Core.total  = Pi.totalTokens
```

cache 数已经包含在 Pi `totalTokens`，但 standalone Core 不尝试把它重新分类。ADR-0014/0015 明确允许 total 不等于 input + output。

## 行为矩阵

### 1. Multi-turn success

- 第一 turn 返回 Tool call，并投影 `tool_call_delta`；
- Harness 执行 Tool 并把 ToolResult 放入第二次 Provider request；
- 第二 turn 投影 thinking/text delta，返回自然完成；
- 两 turn usage 各累计一次；
- provider thinking signature、cost 和 provider/model identity 不持久化。

### 2. Error event + rejected result

- runtime replay 可见 `text_delta("half generated")`；
- error event 保存最后 partial；
- `result()` reject `"gateway dropped"`；
- Adapter 抛 typed error，Harness 返回 failed/confirmed；
- JSONL restart 恢复 usage；
- durable transcript 不包含 `"half generated"`。

### 3. Iterator throw

- start/thinking delta 后 async iterator 直接 throw；
- `result()` 没有被调用；
- Adapter 仍使用最后 partial usage；
- failed terminal 持久化 usage，unfinished thinking 不落盘。

### 4. Cooperative abort

- stream 等待 Core 传入的 signal；
- `handle.abort()` 触发 error event 与 rejected result；
- Adapter 抛 `ModelTurnError`，Harness 根据 signal 判定 aborted；
- grace 内提交 aborted/confirmed + usage；
- partial text 仅在 runtime replay。

## 验证

Consumer focused：

```text
bun test tests/pi-adapter-consumer.test.ts

4 pass
0 fail
31 expect() calls
```

初次 typecheck 发现测试 replay helper 把 Harness `TModelConfig` 写死为 `JsonObject`；行为测试虽绿，但严格类型不接受通用 `JsonValue` Profile。helper 泛化为 `<TModelConfig extends JsonValue>` 后 typecheck 通过，没有修改 Core。

相关 focused：

```text
bun test \
  tests/pi-adapter-consumer.test.ts \
  tests/model-turn-error.test.ts \
  tests/invocation-result-durability.test.ts \
  tests/abort-boundary.test.ts \
  tests/events.test.ts

38 pass
0 fail
199 expect() calls
```

全仓：

```text
bun run verify

158 pass
0 fail
805 expect() calls
Ran 158 tests across 36 files.
typecheck passed
build passed
```

本轮没有生产源码、公共导出、README/CONTEXT/CHANGELOG 或 package 内容变化，因此没有重复 `bun run pack:smoke`。当前 package baseline 仍是第二十九轮已通过的 Bun/Node tarball smoke。

## 审查

第一轮独立 reviewer 在 55 秒窗口超时，没有修改文件，也没有形成可采用结论。测试和文档暂存后，最终窄审查结论：

```text
No P0/P1
```

reviewer 确认 fixture 明确是 structural Pi-like，没有冒充真实 Pi；error event + result reject、iterator throw、AbortSignal、usage 和 provider 私有 metadata 边界合理。

reviewer 在 read-only sandbox 内尝试复跑 Bun 时被 Windows `EPERM` 拒绝。该失败只说明审查环境不允许执行，不是代码失败，也不作为验证证据；focused/full 结果来自主流程的可写测试环境。

## 未验证

- 没有安装或运行真实 Pi package；
- 没有真实 Provider、网络、credential、proxy、timeout 或 Provider retry；
- structural fixture 不证明每个 Pi Provider 都在相同时点提供 usage；
- 没有验证 cache/cost 的产品投影；
- 没有 partial assistant durable status、retry/branch 或 Tool completeness；
- 没有真实 NeuroBook/Cosmos 接入；
- 没有 HTTP/SSE、浏览器、发布或生产验收。

## 下一步

回到第三十一轮规划。可重新比较：

1. partial assistant 的 durable status/branch/retry ADR 是否已有足够证据；
2. Workflow 是否完整覆盖 sidecar 迁移所需的旁路 Agent 取消、结果合并和恢复；
3. SSE Transport 是否存在 Core event cursor 之外、多个宿主都需要的最小可选 Adapter。

真实 Pi package 或网络 smoke 只有在用户提供/已有安全凭据和明确接入目标时才升级优先级；当前 tracer 不能替代它。
