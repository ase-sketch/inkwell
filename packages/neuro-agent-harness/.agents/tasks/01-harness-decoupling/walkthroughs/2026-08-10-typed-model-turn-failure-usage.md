# 第二十九轮：Typed Model turn failure usage

## 结论

ADR-0015 已在 standalone Core 范围接受。Model Runtime 现在可以明确报告“本次失败 turn 已观察到的 token usage”，无需伪造 completed assistant message，也不必把 Pi 的 partial/stopReason DTO 搬进 Core。

```text
ModelRuntime
  ├─ resolve ModelTurnResult
  │    → assistant.usage
  └─ throw ModelTurnError
       → error.usage
       → Run Kernel aggregate once
       → existing failed/aborted settlement
       → ADR-0014 terminal usage fact
```

取消身份不由 error 类型决定，仍只由 Harness 传入的 `AbortSignal` 决定。

## 规划证据

### NeuroBook 与 Pi 对照

NeuroBook Task 07/139 证明真实 provider SDK 的失败语义不能由宽松 faux runtime 代替。当前本地 Pi 0.80.6 进一步确认：

- stream error/abort 时保留最后一份 `AssistantMessage` partial；
- Anthropic 在 `message_start` 即可填入 input/cache usage，之后的 `message_delta` 再补 output；
- OpenAI-compatible Provider 可能只在后续 chunk 或 terminal response 更新 usage；
- error event 携带 partial，但 `stream.result()` 会 reject；
- NeuroBook 用宿主 `AssistantMessage` 同时承载 usage、partial、stopReason、message status、UI 和 branch projection。

standalone Core 不能复制最后一项。它当前已有 provider-neutral `TokenUsage`，且 ADR-0014 已定义 terminal fact、persistence unknown 和 sealed terminal，所以先抽 usage 是最窄可验证切片。

### 为什么仍不做 partial assistant

partial 正文还缺五项合同：

- durable `partial` / `interrupted` message status；
- retry 是否把 partial 放回 Provider context；
- 取消后的 branch anchor；
- thinking 是否持久化；
- 未闭合 Tool call delta 如何证明完整并安全剥离。

本轮继续把 runtime delta 当观察流，不从事件反推 durable transcript。

## API

根包新增：

```ts
interface ModelTurnErrorOptions {
    readonly usage?: TokenUsage;
    readonly cause?: unknown;
}

class ModelTurnError extends Error {
    readonly usage?: TokenUsage;
}

function isModelTurnError(error: unknown): error is ModelTurnError;
```

`usage` 只表示当前失败 `runTurn()` 调用已观察到的 usage，不是 Invocation aggregate。Adapter 如果内部重试，可以报告本次 `runTurn()` 内实际观察到的总量，但不能重复包含此前已成功 turn。

构造函数要求 input/output/total 都是有限非负数，并冻结 clone；仍不强制 `total === input + output`。

### Duplicate package copy

只用 `instanceof` 会在独立 Adapter 与宿主解析到不同 package copy 时静默失效。`ModelTurnError` 因而使用：

```text
Symbol.for("@notnotype/neuro-agent-harness/ModelTurnError")
```

`isModelTurnError()` 在同一个 JavaScript realm 内通过 stable brand 识别另一份 package copy。普通 Error 即使动态挂 `usage` 也不会被识别。

Worker/VM structured clone 不保证保留 Error 自定义 symbol；这不是本轮承诺。跨进程/realm Adapter 必须在本地边界重新构造 typed error。

## Red → green

第一层 red：

```text
bun test tests/model-turn-error.test.ts

0 pass
1 fail
1 load error
Export named 'ModelTurnError' not found
```

只加入 class/options 与构造校验、尚未修改 Run Kernel 后：

```text
3 pass
4 fail
23 expect() calls
```

当时已经通过：

- forced abort winner 保留既有 durable usage；
- ad-hoc Error property 不被识别；
- 非法 usage 在构造时拒绝。

四个红灯分别是：

- JSONL failed result usage 仍为 zero；
- 前序成功 + 当前失败只保留前序 usage；
- terminal commit unknown 的本地结果丢失 observed usage；
- cooperative abort 在 grace 内仍丢失 usage。

Run Kernel 随后只在 `model.runTurn()` catch 增加：

```text
isModelTurnError(error)
  → addTokenUsage(current, error.usage)
  → rethrow original error
```

Hook、Tool、Compactor、Store error 不进入该分支；既有 turn closure、settleFailure、InvocationError 和 terminal commit 顺序不变。

## Abort winner

### Cooperative abort

`requestAbort()` 会先 invalidate attempt，再触发 signal。Provider 可以在 grace 内因 signal 结束并抛 typed error；因此 usage aggregation 刻意发生在 ordinary `assertAttemptActive()` 前。

这不绕过 durable fence：

- Store 仍有相同 active Invocation owner时，现有 abort settlement 可以提交；
- usage 与 aborted terminal 在同一个 plan 中原子保存；
- handle 返回 aborted/confirmed。

### Forced abort

Provider 不合作时，grace 到期由 forced abort 先提交：

- terminal usage 只包含此前 durable turn；
- attempt/write fence sealed；
- 迟到 typed error 即使带 usage，也不能再修改 Store；
- handle 恢复已经确认的 aborted winner。

Core 不为等待未知时限的计量延长 completion boundary，也不引入 after-terminal correction ledger。

## 正式回归

`tests/model-turn-error.test.ts` 最终 8 个测试：

1. typed failure usage 穿过 JSONL restart；
2. completed turn 与 failed turn 各累计一次；
3. terminal commit failure 返回 local usage + unknown；
4. cooperative abort 在 grace 内保存 usage；
5. forced abort winner 忽略迟到 usage；
6. plain Error 的 ad-hoc usage 被忽略；
7. duplicate package stable brand 被识别；
8. negative / NaN / Infinity 在构造时拒绝。

结果：

```text
8 pass
0 fail
36 expect() calls
```

相关 focused：

```text
bun test \
  tests/model-turn-error.test.ts \
  tests/invocation-result-durability.test.ts \
  tests/persistence-events.test.ts \
  tests/abort-boundary.test.ts \
  tests/invocation-ownership.test.ts

52 pass
0 fail
217 expect() calls
```

## 全仓与包验证

```text
bun run verify

154 pass
0 fail
774 expect() calls
Ran 154 tests across 35 files.
typecheck passed
build passed
```

```text
bun run pack:smoke

exit code 0
prepack: 154 pass / 0 fail / 774 expect calls
package: 92.2 kB, 101 files
```

Bun 与 Node ESM tarball consumer 都实际实例化 `ModelTurnError`，并编译/运行检查 `ModelTurnErrorOptions` 与 `isModelTurnError()`。

## 独立审查

第一次宽范围 reviewer 在 55 秒内超时，没有修改文件，也没有形成证据。缩窄到源码和测试后，独立 reviewer 结论为：

```text
No P0/P1
```

三个 P2：

1. usage 在 `assertAttemptActive()` 前累计；
2. `Symbol.for()` 只跨同 realm package copy；
3. reviewer 的 `git diff` 没看到 untracked test。

第一项是 cooperative abort 所需的刻意顺序，最终 commit 仍受 owner/sealed fence，且 cooperative/forced 两个 race 都有回归。第二项已写入 API 边界。第三项是审查命令可见性问题，最终 8-test 文件、focused 和 full 证据均已确认。

测试与文档暂存后的全量 post-fix reviewer 再次在 55 秒窗口超时；最终把 staged 范围缩到 `src/model.ts`、`src/harness.ts` 和完整 `tests/model-turn-error.test.ts` 后，reviewer 在 23 秒内返回：

```text
No P0/P1
```

两次超时均未留下进程或文件修改，也没有被当成审查结论。

## 未验证

- 真实 Pi 或其它 Provider Adapter 是否正确从 partial/error event 映射 usage；
- Provider 内部自动 retry 的计量聚合；
- 跨 Worker/VM/进程传递 typed error；
- partial assistant、thinking、message status、retry/branch 和 Tool delta completeness；
- 真实 NeuroBook/Cosmos 接入；
- HTTP/SSE、浏览器、发布、生产计费或 exactly-once billing。

## 下一步

回到第三十轮规划。优先级需要在两条路之间重新评估：

1. 做一个仓内、可丢弃的 Pi Adapter consumer spike，验证 Pi error event → `ModelTurnError` 的真实映射和 Provider 差异，但不把 Pi 依赖加入 Core；
2. 回到 partial assistant durable status/branch/retry 矩阵，只有能同时定义 Tool completeness 和 abort freeze 才建立新 ADR。

若没有真实 Provider 凭据，第一条也可以用 Pi 的底层 event stream fixture验证 Adapter 形态，但必须明确不等同于真实网络验收。
