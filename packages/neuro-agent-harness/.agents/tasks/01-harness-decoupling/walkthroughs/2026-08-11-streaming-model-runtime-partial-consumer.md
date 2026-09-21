# 第五十六轮：Streaming ModelRuntime partial consumer tracer

## 状态

provider-neutral streaming Adapter consumer tracer、focused/full/package gate 与 production / API-domain / test-sensitivity 三路窄复审均已完成；没有发现 Core API 缺口，不新增 public API、ADR、依赖或生产代码，第五十六轮收口。本轮只修改 `neuro-agent-harness`，继续保护 `docs/architecture.md`、`docs/pi-adapter-design.md` 与 `tests/context.test.ts`。

## 规划取证

1. NeuroBook 提交 `4179f736` 修复了 provider stream 抛异常时丢失最后 partial 的问题：Adapter 保存最后一份 assistant partial，取消/失败时再向下游提交 interrupted/partial 事实。
2. 该问题发生在 provider SDK iterator 生命周期，不应让 Core 接管 provider stream、SDK exception 或产品取消文案。
3. standalone 已有完整 provider-neutral seam：
   - `ModelTurnRequest.onEvent` 接收 provisional `message_start` / delta；
   - `ModelTurnError({partial})` 让 ModelRuntime 在 turn 失败时交付安全的 text/thinking partial；
   - Harness 把 partial 与 usage、failed/aborted terminal 原子持久化为 `harness.invocation.partial`；
   - `invocationPartial(snapshot, invocationId)` 恢复确认事实，partial 不进入 `agent.message` transcript。
4. 既有 `tests/model-turn-partial.test.ts` 已覆盖直接抛 `ModelTurnError`，但没有接近真实 streaming Adapter 的 consumer tracer。本轮用测试证明 Adapter 自己捕获 provider abort exception 并转换为已有合同即可。

## 决定

- 不新增 Core stream API、provider-specific exception adapter、SDK dependency 或 ADR。
- 新增 test-only `AbortAwareStreamingRuntime`：发出 `message_start`/`text_delta` provisional events，等待 abort，捕获 provider-style `"Request was aborted"` exception，转换为 `ModelTurnError.partial`。
- 验证 Harness 恢复 partial、保留本地 aborted result、写入 durable partial fact，同时不把 partial 写成 `agent.message` transcript。
- 真实 provider/browser/Transport 验收仍不由本轮 tracer 代替。

## Public consumer tracer

新增 `tests/streaming-model-runtime-partial-consumer.test.ts`，1 条测试：

- Runtime 通过公开 `ModelRuntime.runTurn(request)` 和 `request.onEvent` 发出 `message_start`、`text_delta`；
- abort 发生在 delta 之后（`ready` gate）；
- Adapter 捕获 abort exception 后抛 `ModelTurnError("provider stream aborted", {partial, cause})`；
- Invocation 结果为 `aborted`；
- `invocationPartial(snapshot, invocationId)` 与本地 partial 一致；
- `observedEvents` 保留 provisional event 顺序；
- durable `agent.message` transcript 不包含 partial 文本。

## 审查与绕道

三路窄复审均返回 `No P0/P1/P2 findings.`：

- production/API seam：确认测试走公开 ModelRuntime/ModelTurnError/onEvent 合同，没有 monkey-patch Core 或宣称真实 provider 已验收；
- API/domain：确认 Task 只记录“现有 seam 足够”的结论，不把 test-only tracer 写成生产 Adapter；
- test-sensitivity：确认 ready gate、partial/event/transcript 三类断言足够区分，未发现 flaky 或 private implementation 依赖。

## 全仓门禁

```text
bun test tests/streaming-model-runtime-partial-consumer.test.ts \
  tests/model-turn-partial.test.ts tests/abort-boundary.test.ts \
  tests/harness.test.ts tests/recovery.test.ts

41 pass / 0 fail / 177 assertions

bun run verify
336 pass / 0 fail / 1453 assertions
50 test files
typecheck + build passed

bun run pack:smoke
prepack: 336 / 0 / 1453
109 files
120.4 kB package / 570.8 kB unpacked
Bun + Node ESM consumers passed
```

## 当前未验证

真实 NeuroBook/Cosmos Adapter、真实 provider SDK iterator、跨进程 EventHub、HTTP/SSE Transport、浏览器/产品取消 projection 与跨平台 provider stream 行为仍未验证。本轮不修改 NeuroBook/Cosmos，不 push、发布或部署。
