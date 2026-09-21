# 第一百一十二轮：动态 Profile context delivery parity

## 状态

本轮完成了一个 test-only 动态 context delivery vertical slice。结果证明宿主可以使用现有 beforeTurn RuntimeHook、SessionWritePlan、ContextProvider、SessionCommitObserver、JSONL Store、resume 和 CapabilityProvider，表达 NeuroBook 风格的“动态消息物化 → 成功 transcript ingest → settlement”生命周期；不需要新增 Core public API、durable shape、ADR 或依赖。

本轮没有修改 src/、根导出或生产配置；没有修改 NeuroBook/Cosmos，没有 push、发布、部署或真实付费 provider 调用。

## 规划依据

- NeuroBook 当前动态 Profile context 在 prepare 或后续 turn 中 materialize 消息，并保存宿主自己的 settlement 信息；成功 turn transcript ingest 后调用 settleProfileTurnContexts，即使该 turn 随后进入 approval waiting。
- standalone 第 110 轮 tracer 采用的是更保守的宿主 policy：只有 Invocation completed 且 persistence confirmed 才 settlement。两者不是同一条 Core 合同，因此本轮先验证宿主能否显式选择 NeuroBook-style policy，而不是直接修改 Core。
- 现有 ADR-0005/0010 明确把 ContextProvider 和 modelContextAppending 限定为 provider-neutral、request-only seam；History、cursor、AppendingSet settlement、Project generation 和产品恢复 DTO 继续由宿主拥有。

## 实现形态

tests/profile-context-delivery-parity.test.ts 定义了测试宿主自己的 FakeDynamicHistory 和 DynamicContextAdapter：

- FakeDynamicHistory 保存 h1/h2 等历史项、settled 集合和 settlement log；重复 settlement 会失败；
- beforeTurn Hook 读取当前 Snapshot，物化尚未进入 Session 的 dynamic delivery marker 和 durable-dynamic message；
- ContextProvider 从最新 Snapshot 读取尚未 settlement 的 delivery，返回 request-only dynamic-request message，同时返回当前 Capability generation；
- SessionCommitObserver 在宿主 materialization commit 后记录 delivery，在包含 assistant transcript 的成功 commit 后推进 FakeDynamicHistory；
- CapabilityProvider 为每个 run attempt 生成 A/B generation，记录 open/close；resume 后必须得到新 generation；
- FailingTranscriptStore 只在 assistant transcript commit 边界注入一次失败，用来区分“消息已经进入 request”与“transcript ingest 已成功”。

测试只使用公开接口和类型：NeuroAgentHarness、defineProfile、ContextProvider、RuntimeHook、SessionWritePlan、SessionCommitObserver、defineSessionEntryCodec、Memory/JSONL Store、resume、CapabilityProvider 和 ScriptedModelRuntime。没有导入 Harness 私有实现，也没有使用 NeuroBook 类型。

## 覆盖场景

### 1. Successful ingest 后进入 waiting

流程：

    history h1
      -> beforeTurn materialize durable delivery
      -> ContextProvider 注入 dynamic-request:h1
      -> Model 返回 gated Tool Call
      -> assistant transcript 成功 ingest
      -> approval waiting
      -> host settlement(h1)
      -> dispose / JSONL restart / resume
      -> materialize h2
      -> new Capability generation B

断言确认：

- waiting 返回时 h1 已 settlement，符合 NeuroBook 当前 successful-ingest policy；
- h1 的 durable materialization entry 保留在 Snapshot，但 request-only dynamic-request:h1 不进入 Session transcript；
- resume 复用同一 logical Invocation ID，只看到 h2，不重复看到 h1；
- 首次 attempt 使用 generation A，waiting 后 A close；resume 使用 generation B，最终 B close；ContextProvider 和批准后的 Tool 都只使用 B；
- waiting/completed 的 invocationResultFromSnapshot projection 保持可恢复。

### 2. Model failure

流程：

    history h3
      -> materialize h3
      -> request 注入 h3
      -> ModelRuntime failure
      -> retry

断言确认：

- 没有成功 transcript ingest 时不 settlement h3；
- durable materialization marker 只有一份；
- retry 仍能看到 h3，之后成功 ingest 才 settlement；
- 这是宿主可明确管理的 at-least-once delivery 边界，不由 Core 伪造 exactly-once。

### 3. Transcript ingest failure

assistant message 已经由 ModelRuntime 返回，但 FailingTranscriptStore 在 assistant transcript commit 前失败。断言确认：

- request 曾看到 h4，但没有成功 ingest 证据时不 settlement；
- 后续 invoke 可以复用已有 durable materialization，不重复写 marker；
- 下一次 assistant transcript 成功提交后才 settlement h4。

## 关键结论

本轮没有证明 Core 内置了“dynamic context settlement”；恰恰相反，测试证明了这个策略可以由宿主组合：

    beforeTurn write plan
      -> latest Snapshot
      -> request-only ContextProvider result
      -> public commit observer sees successful transcript commit
      -> host-owned settlement

因此：

- ContextProvider 不需要返回 History handle、cursor、delivery token 或 callback；
- SessionCommitObserver 可以作为宿主观察 durable commit 的边界，但它不是 ContextProvider settlement API；
- modelContextAppending 继续保持 request-only，不自动写入 Session；
- Host materialization 若需要 durable，应由宿主自己的 SessionWritePlan/entry codec 显式写入；
- Capability 是 run-attempt scoped，waiting 与 restart 不复用旧资源；
- NeuroBook 的 successful-ingest settlement policy 不应升级为所有 Harness consumer 的强制合同。

## TDD 与修正

先实现最小 test-only tracer，focused 三条均通过；随后审查补充了两条边界断言：

- Snapshot 必须包含宿主自己的 durable-dynamic:h1 materialization；
- Snapshot 不得包含 request-only dynamic-request:h1。
- waiting/restart 场景的两个 Harness 都在 finally 中幂等 dispose，断言失败路径也不遗留活跃资源。

补强后 focused 仍全绿，没有生产代码变更。

## 验证证据

最终 focused：

    bun test tests/profile-context-delivery-parity.test.ts
    3 pass / 0 fail / 43 expect

全仓：

    bun run typecheck
    通过

    bun run verify
    521 pass / 0 fail / 2167 expect
    93 files
    typecheck/build 通过

本轮没有重复运行 pack:smoke：没有修改 src、public exports、package.json、依赖或打包内容；第 111 轮已对 tarball Bun/Node consumer 完成 package boundary 验证。

git diff --check 没有发现本轮新增测试的 whitespace error；Windows LF/CRLF warning 只涉及已有 dirty 文件。

## 独立审查与边界

本地静态复核检查了：

- dynamic delivery marker 的重复 admission；
- successful assistant transcript commit 与失败边界；
- waiting/resume 的同一 Invocation ID；
- Capability generation A/B open/close；
- request-only message 与 durable materialization 的区分；
- Memory/JSONL 两类 Store；
- 测试临时目录清理与用户 dirty 文件隔离。

没有发现 P0/P1。并行规划复核与源码证据一致：现有 seam 足够，不需要新增 API 或 ADR。

仍未验证：

- 真实 NeuroBook runtime 的实际 Harness Adapter 接入；
- 真实 History/Project generation、真实 provider、pi-ai、第三方 Store；
- 多个动态 ContextProvider 的真实 settlement 顺序；
- 浏览器、无限 SSE、HTTP 断连/heartbeat/backpressure、生产 Transport/Product；
- 真实 Cosmos package、agent.invoke@1、Job/Lease/Outbox 或 Node Worker 接入。

本轮不把 fake host tracer 报告为 NeuroBook 或 Cosmos 产品验收。

## 决定与下一步

- 不新增 dynamic context settlement API、History/cursor 类型、Project/NeuroBook DTO、Cosmos-specific API 或 ADR。
- 保持 Core 的 provider-neutral request-only context boundary；宿主自行决定 successful-ingest settlement 或 terminal settlement policy。
- 后续优先选择真实 NeuroBook Adapter 或宿主 Transport recovery 作为证据来源；只有真实消费者暴露公开 seam 无法表达的稳定缺口，才重新规划最小 API。
