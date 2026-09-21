# ADR-0015: Typed Model Turn Failure Usage

- Status: Accepted (standalone Core scope)
- Date: 2026-08-10
- Task: [`01-harness-decoupling`](../tasks/01-harness-decoupling/README.md)

## Context

`ModelRuntime.runTurn()` 当前只有一条成功返回路径：

```ts
Promise<ModelTurnResult>
```

成功结果通过 assistant message 携带 `TokenUsage`；失败只能 throw，Harness 因而无法知道当前失败 provider turn 是否已经产生可计量 usage。

NeuroBook Task 07/139 与当前本地 Pi 0.80.6 源码提供了真实对照：

- provider stream error/abort 时会保留最后一份 partial assistant；
- Anthropic 可在 `message_start` 就填入 input/cache usage，其它 Provider 也可能在 terminal event 前更新 usage；
- stream 最终以 error event / rejected `result()` 表达失败，调用方仍可能已经观察到 provider-normalized usage；
- NeuroBook 当前用宿主私有 `AssistantMessage` 贯穿 partial、usage、stopReason、UI status 和 branch projection，这些 DTO 不能直接进入 standalone Core。

ADR-0014 已提供 append-only terminal usage fact、`InvocationResult.persistence` 和 forced terminal sealed fence。因此可以先解决失败 turn usage，而不同时决定 partial transcript 语义。

## Decision

### 1. Additive typed error

Core 新增：

```ts
interface ModelTurnErrorOptions {
    readonly usage?: TokenUsage;
    readonly cause?: unknown;
}

class ModelTurnError extends Error {
    readonly usage?: TokenUsage;
}
```

`usage` 的语义是：

- 只包含当前失败 `runTurn()` 已观察到的 provider-neutral usage；
- 不是整个 Invocation aggregate；
- Adapter 必须避免把此前成功 turn 的 usage 再次放入；
- input/output/total 必须是有限非负数；
- 不要求 `total === input + output`；
- 不携带 cost、cache、quota、provider/model ID 或原始 Provider response。

普通 Error 保持现有行为。Harness 不通过任意对象上的同名 `usage` 属性猜测语义；只有公开 typed error 进入该分支。

`ModelTurnError` 使用 `Symbol.for()` stable brand，根导出的 `isModelTurnError()` 通过该 brand 识别同一 JavaScript realm 中由另一份 package copy 构造的 error。这样独立 Adapter 与宿主依赖版本被 npm 分开解析时不会静默丢 usage；只给普通 Error 动态挂 `usage` 仍不会被识别。

### 2. Run Kernel aggregation

Harness 只在 `model.runTurn()` 调用边界捕获 `ModelTurnError`：

1. 先把 error usage 加入当前 Invocation 聚合一次；
2. 再原样 rethrow，复用既有 failed turn closure、`settleFailure`、terminal commit 和 `InvocationError` projection；
3. ADR-0014 的 terminal plan 原子保存最终 aggregate；
4. terminal commit 未确认时返回 `persistence: "unknown"`，不得发布伪造的 `agent_end`。

这样不会把 Hook、Tool、Compactor 或 Store error 上偶然存在的 `usage` 属性误算成 Provider usage。

### 3. Abort winner

`ModelTurnError` 不表达 Invocation 的取消身份；Run Kernel 仍只根据传入的 `AbortSignal` 判断 failed 或 aborted。

- cooperative abort：Provider/Adapter 在 grace 内抛 typed error，且正常 failure settlement 赢得 terminal commit时，当前 turn usage 可以与 aborted terminal 原子保存；
- forced abort：force-abort terminal 若先提交，迟到 typed error 不得突破 attempt invalidation 和 sealed write fence；handle 必须恢复 Store 中已经确认的 aborted result；
- Core 不为了等待迟到 usage 延长 `abortGraceMs`，也不在 terminal 之后追加修正账本。

这是可用性与计量完整性的明确取舍：有界 completion 和单一 durable terminal 优先于未知时限的迟到 Provider usage。

## Deliberate boundary

本 ADR 不定义：

- partial assistant、thinking 或 message status 的持久化；
- retry 是否看见 partial transcript，或取消后 branch anchor；
- 未闭合 Tool call delta 的重组/剥离；
- Provider 自动重试、timeout 分类或错误文案清洗；
- Pi Adapter package、真实 Provider DTO、HTTP/SSE 或 UI projection；
- NeuroBook/Cosmos 修改。

未来 partial error 合同可以给 `ModelTurnError` 增加独立字段，但必须先有 durable status、retry/branch 和 Tool completeness ADR；本轮不能把 runtime event delta 反推成 transcript。

## Alternatives

- **从 `ModelRuntimeEvent` delta 估算 usage**：拒绝。runtime event 是观察流，当前没有 usage event，也不能证明完整性。
- **给任意 Error 读取结构化 `usage` 属性**：拒绝。容易误收 Hook/SDK 私有对象，且没有可发现的公共合同。
- **让 `runTurn()` resolve completed/failed union**：暂缓。会改写所有 Adapter 的控制流，不是 additive 变更。
- **同时持久化 partial assistant**：暂缓。message status、retry/branch 和 Tool completeness 尚未定义。
- **forced abort 后补写迟到 usage**：拒绝。会突破 sealed terminal，并需要新的 after-terminal correction/fencing 合同。

## Verification gate

- typed failure usage 进入 failed/confirmed result、terminal fact 和 JSONL restart projection；
- 前序成功 turn 与当前失败 turn usage 各累计一次；
- terminal Store commit failure 返回 unknown 且不伪造 durable usage；
- cooperative abort 在 grace 内保存 typed failure usage；
- forced abort 先赢时迟到 usage 不修改已确认 terminal；
- 普通 Error 和带 ad-hoc `usage` 属性的 Error 不被识别；
- duplicate package copy 的 stable brand 仍被识别；
- 非有限或负数 fail closed；
- existing failure/abort/ownership tests、`bun run verify`、`bun run pack:smoke`；
- 独立审查确认没有把 typed error 当成取消身份、partial transcript 或 exactly-once billing 保证。

## 2026-08-10 implementation and acceptance

- 第一层 public red 因根包缺少 `ModelTurnError` 得到 0 pass / 1 fail / 1 load error；只加入 class/options/构造校验后，行为 red 为 3 pass / 4 fail / 23 expect calls，四个失败均精确指向 Run Kernel 未累计 typed failure usage。
- `ModelTurnError` 构造时验证并冻结当前 turn usage；`isModelTurnError()` 使用 `Symbol.for()` stable brand 识别同一 realm 的 duplicate package copy。普通 Error 即使动态挂同名 `usage` 也不进入 typed 分支。
- Run Kernel 只在 `model.runTurn()` catch 边界累计一次 typed usage，再原样 rethrow 到既有 failed turn、settlement 和 terminal pipeline。Hook、Tool、Compactor、Store error 没有被扩张。
- cooperative abort red 证明 abort request 先使 attempt invalidated 后，Provider 仍可在 grace 内报告最终 usage；该 observation 在 durable owner 存续时与 aborted terminal 原子提交。forced-abort winner red 证明 terminal 先提交后，迟到 typed error 不修改已确认 usage fact。
- JSONL restart、前序 completed turn 聚合、terminal persistence unknown、ad-hoc Error 隔离、duplicate package brand 和非法 usage 均有 public 回归。
- `tests/model-turn-error.test.ts` 最终为 8 pass / 0 fail / 36 expect calls；failure/abort/ownership/persistence focused 五文件为 52 pass / 0 fail / 217 expect calls。
- `bun run verify` 为 154 pass / 0 fail / 774 expect calls，覆盖 35 个测试文件并通过 typecheck/build。
- `bun run pack:smoke` exit code 0；prepack 同为 154/774，92.2 kB tarball 的 Bun 与 Node ESM consumer 均验证 class、options 和 guard 导出。
- 独立只读审查未发现 P0/P1。三个 P2 分别是 attempt invalidation 前累计、`Symbol.for()` realm 边界和 reviewer 未看到 untracked test；前两项是已记录并有 cooperative/forced race 的刻意合同。测试暂存后最终 reviewer 看到完整文件，再次结论 `No P0/P1`。

因此本 ADR 在 standalone Core 的 typed model failure usage 与 abort winner 范围接受。真实 Pi/其它 Provider Adapter、跨 Worker/VM 错误传输、partial assistant、NeuroBook/Cosmos 集成、HTTP/SSE、发布和生产计量验收仍未完成。
