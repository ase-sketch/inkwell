# 第一百一十一轮：安装后真实消费者与 API usability

## 状态

本轮完成了一个安装后 package consumer vertical slice。它证明发布 tarball 安装到隔离目录后，Bun 与 Node 消费者可以只通过公开 package exports 组合一次完整的 Agent Action，并在 JSONL 重启后恢复结果与宿主投影。

本轮没有修改 src/、根导出、durable shape、ADR 或依赖；没有修改 NeuroBook/Cosmos，没有 push、发布、部署或真实付费 provider 调用。

## 规划依据

- 第一百一十轮只在仓库源码测试中证明 Context settlement 与 Cosmos-style Action 可以由 provider-neutral seam 表达，还没有证明安装后的消费者不需要引用 src/、dist 内部文件或私有字段。
- 现有 scripts/pack-smoke.ts 已覆盖导出、声明类型和基础 Bun/Node consumer，但没有把 Session、Invocation、Capability Tool、宿主回写、重启恢复和 cursor replay 串成一个外部消费者行为。
- Cosmos 当前 checkout 仍没有真实 neuro-agent-harness 或 pi-ai 依赖，agent.invoke@1 仍是未来 ActionDefinition 目标；本轮因此只验证可逆 package consumer conformance，不创建 Cosmos-specific API。

## 实现形态

### 测试入口

tests/package-consumer-usability.test.ts 创建隔离临时根，并执行：

1. 构建当前发布产物；
2. 用 npm pack --ignore-scripts 生成 tarball；
3. 在独立 Bun 与 Node consumer 目录安装同一个 tarball；
4. Bun 直接运行同一份 TypeScript consumer；
5. Node 用仓库 TypeScript 编译同一份 consumer，再运行编译后的 ESM；
6. 父测试在成功、失败和超时路径都递归删除自己的临时根。

### 外部 consumer

tests/fixtures/package-consumer.ts 只导入以下公开入口：

- @notnotype/neuro-agent-harness
- @notnotype/neuro-agent-harness/storage/jsonl
- @notnotype/neuro-agent-harness/testing

它没有引用仓库 src/、dist 内部路径、私有字段或测试内部 helper。consumer 通过以下链路验证公开合同：

    createSession
      -> invokeAt(anchor)
      -> Invocation-scoped Capability
      -> Capability-bound Tool
      -> InvocationResult(output/usage/persistence)
      -> invocationResultFromSnapshot()
      -> host writeback entry
      -> subscribe(cursor replay)
      -> dispose / new Harness
      -> JSONL restart projection

具体断言包括：

- typed Host Context 的 flowId、sessionRef、workspaceKey 在 Profile、Capability、Snapshot 和 JSONL restart 后保持一致；
- system caller 在 Invocation Snapshot 与 restart projection 中保持一致；
- Capability 读取 opaque reference，Tool 输出 answer/provenance 并通过 terminate 完成 Invocation；
- InvocationResult 与 invocationResultFromSnapshot() 都保留 output、usage 和 persistence: confirmed；
- 宿主使用公开 write() 追加自己的 package-consumer.action.completed entry；
- 从 write 前 Snapshot cursor 订阅能收到 host entry 与 status replay；
- 关闭第一个 Event Hub 后，新的 Harness 使用新的 epoch，旧 cursor 要求 Snapshot recovery；
- Invocation-scoped Capability 在 terminal 后关闭一次。

## TDD 与环境绕道

先加入测试入口并运行，初始 red 是 fixture 文件尚不存在；这确认测试确实从安装后 consumer 边界读取 fixture，而不是绕过测试直接调用源码。

补上最小 fixture 后，Node consumer 首次 typecheck 暴露两类真实可移植性问题：

- fixture 不应要求外部 consumer 安装仓库的 @types/node 才能编译；因此将 JSONL 临时目录改为 consumer 当前工作目录下的隔离相对路径，并移除 fixture 对 node:fs、node:os、node:path 的依赖；
- TokenUsage 是 provider-neutral 类型而不是 JSON object，需要在宿主 writeback payload 中显式投影为 JSON 值。

这两项都是测试 consumer 自身的边界问题，没有扩展 Harness API。

## 验证证据

最终 focused：

    bun test tests/package-consumer-usability.test.ts
    1 pass / 0 fail / 2 expect

全仓：

    bun run verify
    518 pass / 0 fail / 2124 expect
    92 files
    typecheck 通过
    build 通过

打包边界：

    bun run pack:smoke
    exit code 0
    prepack verify: 518 pass / 0 fail / 2124 expect
    tarball: 117 files / 153.9 kB
    Bun/Node package consumers 通过

git diff --check 没有发现本轮新增文件的 whitespace error；输出中的 Windows LF/CRLF warning 只涉及已有 dirty 文件。

## 独立复核与边界

本地静态复核逐项检查了：公开 import、没有 src/ 或 dist 内部引用、Bun/Node 两条执行路径、临时目录 cleanup、Capability close、host writeback、cursor replay 和 restart recovery；没有发现 P0/P1。并行审查代理槽位已满，未能新增一轮独立代理审查，因此这里不把未运行的代理审查写成已完成。

本轮已证明：

- npm tarball 的公开入口足以支持一个外部 Bun consumer；
- npm tarball 的声明类型足以支持一个不依赖仓库 Node 类型配置的 Node ESM consumer；
- Session、Invocation、Capability、Tool、Snapshot projection、宿主 writeback、JSONL recovery 和 Event cursor 可以在安装后组合。

本轮仍未证明：

- 真实 Cosmos package、agent.invoke@1 ActionDefinition、Job/Attempt/Lease/Outbox 或真实 Node Worker 接入；
- 真实 NeuroBook runtime 或其真实 History/Project Adapter；
- 真实 provider、pi-ai、第三方 Store、浏览器 EventSource、无限 SSE、断连/heartbeat/backpressure、生产 Transport 和 Product 验收。

因此本轮结论是“安装后 public seam 可消费”，不是“Cosmos 已接入”或“NeuroBook parity 已完成”。

## 决定

- 不新增 public API、Cosmos-specific API、durable 字段、ADR 或依赖。
- 保持 Job、Lease、Outbox、Workflow Run durable truth 在 Cosmos/宿主侧；不恢复 sidecar 核心语义。
- 暂缓 toolResult / assistant output blocks 扩展，除非真实 provider 或消费者先暴露信息损失。

## 下一轮规划入口

安装后 consumer 已通过，下一轮回到规划阶段。规划审查发现一个需要优先澄清的 parity 合同差异：NeuroBook 当前实现是在成功 turn ingest 后推进动态 Profile context settlement，即使该 turn 随后进入 waiting；standalone 第一百一十轮 tracer 当前要求 waiting 在可继续前不推进 History cursor。两者不能同时作为同一行为合同。

下一轮先做 test-only 动态 context delivery parity tracer，覆盖：

1. 多 turn materialization、逐 turn ingest 后的可见性与重复消费；
2. waiting settlement 的目标合同；
3. model failure / JSONL restart 后的 durable materialization、重复与 cursor 推进；
4. 多 ContextProvider / 多 appending 的顺序与宿主闭包关联。

随后再做 generation-bound waiting/restart tracer，验证 waiting 时 Capability generation A 关闭、resume 使用新 generation B，而不把 Project/History generation 类型放进 Core。只有 tracer 证明现有闭包式 Adapter 无法安全避免重复或丢失时，才设计最小 provider-neutral API/ADR。
