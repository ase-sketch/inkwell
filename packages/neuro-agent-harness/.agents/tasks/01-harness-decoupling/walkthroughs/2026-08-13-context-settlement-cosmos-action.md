# 第一百一十轮：Context settlement adapter boundary + Cosmos-style Agent Action conformance

## 状态

本轮完成两个 test-only vertical slice。结果证明现有 provider-neutral Harness seam 足以让宿主管理 NeuroBook 风格的 History cursor settlement，并用 Workflow 组合 Cosmos-style Agent Action；没有发现需要扩展 Core public API、durable shape、ADR 或依赖的证据。

本轮没有修改 src/，没有修改 NeuroBook/Cosmos，没有 push、发布、部署或真实付费 provider 调用。

## 规划依据

- NeuroBook 的动态 Profile Appending 生命周期由宿主 History Adapter 管理：读取未见内容，作为本轮 model context 注入；provider 成功 ingest 后由宿主推进 History cursor。History handle、cursor、文件变化查询、权限和 settlement 不属于 Harness Core。
- 当前 Harness 已提供 ContextProvider.resolve(snapshot)、modelContextAppending、InvocationHandle.result()、公开 resume() / abort()、invocationResultFromSnapshot() 和 JSONL Snapshot recovery。
- Cosmos Phase 1 当前仍可直接使用 pi-ai；Cosmos 负责 Workflow Run/Journal、Job、Lease、Outbox 和领域 durable truth。Harness 只提供 Agent Invocation、Session、Profile、Model Runtime、Capability 和 Workflow seam。
- 本轮因此先做 adapter-only/consumer-only tracer；只有现有 seam 无法安全表达 settlement 或 Action lifecycle 时，才设计新的 Core 合同。

## 实现形态

### Context settlement tracer

tests/context-settlement-adapter.test.ts 定义了测试宿主自己的 FakeHistory，它拥有：

- readUnseen()：按宿主 cursor 返回未见 History；
- materializeUnseen()：把未见内容映射为 provider-neutral modelContextAppending；
- settle(invocationId)：仅由宿主在 InvocationResult.status === "completed" 且 persistence === "confirmed" 后调用。

三条场景验证：

1. completed 后 cursor 推进；下一次新增 History 在下一 Invocation 的 request 中只出现一次；failed 不推进 cursor。
2. waiting 及 JSONL restart 在可继续前不推进 cursor；公开 resume() 完成后才结算；两次 model request 都看到同一未结算 History 各一次；恢复 Snapshot 通过 invocationResultFromSnapshot() 保留 completed/output/persistence。
3. abort 后不结算；Model request 已看到的未见 History 不会因此变成已确认事实。

Harness 没有读取或修改 FakeHistory.cursor，也没有新增 settlement 专用 API。

### Cosmos-style Action tracer

tests/cosmos-agent-action-conformance.test.ts 用测试宿主表达以下 Workflow 组合：

    cosmos.action.requested
      -> CommitWorkflowScheduler.select/run
      -> invokeAt({version, activeLeafId})
      -> Invocation result + invocationResultFromSnapshot()
      -> cosmos.action.completed host write
      -> JsonlSessionStore restart projection

该 tracer 验证：

- flowId、runId、sessionRef、workspaceKey 通过 typed Host Context 进入 Profile；
- 宿主 Capability 可以按 Invocation 打开、使用并关闭；
- Workflow job 绑定 requested commit 的 Snapshot version/active leaf；
- Action 以 system caller 启动，结果和 usage 经公开 projection 读取；
- 宿主用 write() 回写自己的 cosmos.action.completed 事实；
- JSONL 新 Store 实例可恢复 Host Context、Invocation output/usage/status 和宿主 requested/completed entry。

Job payload、Action entry、Workflow scheduler 和 completed projection 都是测试宿主的形状，不是 Harness 新增的 Cosmos DTO，也不声称真实 Cosmos package 已接入。

## TDD 与验证

实现期间先运行过一个不完整的 settlement 初稿，发现测试自身错误：waiting 首次 request 本来应该看到未结算 History，错误断言为“不应出现”。随后删除占位实现，改为断言“出现一次且 cursor 仍为 0”，并补齐 waiting/resume、abort、JSONL restart 与 persistence 条件。

最终 focused：

    bun test tests/context-settlement-adapter.test.ts tests/cosmos-agent-action-conformance.test.ts
    4 pass / 0 fail / 45 expect

受影响面验证：

    Context / projection：18 pass / 0 fail / 107 expect（4 files）
    Cosmos / Workflow：29 pass / 0 fail / 162 expect（7 files）
    Store / abort / recovery：71 pass / 0 fail / 331 expect（4 files）

全量：

    bun run verify
    typecheck 通过
    build 通过
    517 pass / 0 fail / 2122 expect（91 files）

git diff --check 未发现本轮新增文件的 whitespace error；Windows CRLF warning 只涉及已有 dirty 文件。

## 独立审查

- 当前集成复核确认：本轮没有生产代码或 public export 变化；新增测试只使用 NeuroAgentHarness、ContextProvider、modelContextAppending、InvocationHandle.result()、resume()、abort()、snapshot()、invokeAt()、write()、CommitWorkflowScheduler 和 invocationResultFromSnapshot()。
- 规划代理复核了 Cosmos 真实状态：当前 Cosmos 源码/manifest 没有真实 neuro-agent-harness 依赖；现有 consumer tests 是 deterministic Memory/JSONL 形态，不是实际 Cosmos 集成。
- P0/P1：截至本轮已运行的静态复核未发现。
- P2 / 未验证边界：真实 Cosmos package/provider/pi-ai/Node consumer、真实 NeuroBook runtime、third-party Store、浏览器/Product、生产 Transport 和部署均未运行；本轮不把 fake-host conformance 报告为这些验收。

## 决定

- 不新增 settlement API；History cursor settlement 继续由宿主 Adapter 在确认成功后负责。
- 不新增 Cosmos-specific API、Job/Lease/Outbox/Run DTO 或持久化字段。
- 不强制 Cosmos 从 pi-ai 迁移。
- 不新增 ADR；本轮证据支持既有边界。

## 下一轮入口

回到规划阶段。优先重新评估一条更接近真实消费者的路径：

1. 若 Cosmos 仍未开始真实依赖 Harness，继续保持测试 conformance，不为未发生的集成预先扩展 API；
2. 选择一个真实 NeuroBook/Harness parity 差异或宿主 Transport 断线/snapshot DTO 边界做下一条 tracer；
3. 只有真实 consumer/provider 证据显示 toolResult 或 assistant output blocks 信息丢失时，才重评该公共合同。

真实 Cosmos/NeuroBook/provider/Product 验收继续明确列为未完成，不作为本轮完成条件的隐式替代。
