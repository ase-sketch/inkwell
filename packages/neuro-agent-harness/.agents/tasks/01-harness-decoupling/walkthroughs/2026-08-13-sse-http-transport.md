# 第一百零九轮：真实 HTTP SSE Transport 边界

## 状态

本轮完成一个宿主 Adapter 形状的真实 HTTP/SSE vertical slice：独立 Bun worker 暴露有限 SSE 响应，Node http 客户端驱动两次连接和两次 Harness invocation，验证首连全量、SSE 帧字段、(eventEpoch, seq) 游标以及 Last-Event-ID 续传只接收新事件。

本轮没有新增 Core API、durable shape、依赖或 HTTP/SSE 服务实现。HTTP 路由、连接管理和进程生命周期仍是宿主/fixture 的职责；Harness 只提供既有 subscribe() 事件 seam 和第一百零八轮的 serializeSseJsonEvent()。

## 规划依据

- 第一百零八轮只证明了第一方 WHATWG event-stream 帧序列化，明确保留 HTTP 服务和连接管理在宿主层。
- 第七十一轮已用宿主侧 SSE 消费切片验证游标恢复与 snapshotRequired 分支，但此前没有真实 HTTP socket 边界。
- 本轮只补一条可运行、可回退的宿主验证路径，避免把 NeuroBook 的 Job/Lease/Outbox、鉴权、heartbeat 或产品 DTO 下沉进 Harness Core。

## 实现形态

- tests/fixtures/sse-http-worker.ts：用 Bun.serve({port: 0}) 启动临时 HTTP 服务，创建 NeuroAgentHarness + MemorySessionStore + ScriptedModelRuntime，提供 /invoke 与 /events。/events 读取 Last-Event-ID 和 event-epoch，调用既有 harness.subscribe()，用 serializeSseJsonEvent() 输出 event、id=seq、JSON data，到 agent_end 后结束有限响应并关闭订阅。
- tests/fixtures/sse-http-driver.ts：通过 Node http.request 而不是 Harness 内部 helper 发起真实 HTTP 请求；解析 event-stream 帧，检查 HTTP 状态、text/event-stream、event/id/data 字段、序号递增和 epoch 一致性。第二次 invocation 在第二次连接前完成，第二次请求发送上一次最后 seq 与 epoch，并断言回放序列精确等于 lastSeq + 1 ... afterSeq；错误 epoch 必须得到 409 recovery 响应。
- tests/sse-http-transport.test.ts：只负责启动 driver、检查成功标记，并对 driver 增加有界超时；fixture driver 使用 try/finally 取消 pending HTTP 请求并回收 worker。Windows 下针对精确 worker PID 使用 taskkill /PID /T /F，避免 Bun shim 的子 runtime 残留；不会扫描或终止其它 Bun 进程。

## 环境绕道

本机 Windows/Bun 组合下，Bun.serve 的无限保持流在请求侧会挂起；在有限 ReadableStream 完成后，调用服务端 /stop 或让服务自行 graceful shutdown 也会触发延迟 listener/收尾不稳定。为了把本轮问题限制在 HTTP/SSE 数据路径，fixture 采用“每次连接到首个 agent_end 就关闭”的有限 SSE 响应，并由 driver 在断言结束后定向回收它自己启动的 worker 进程树。

这不是对生产 Transport shutdown 的结论，也不是把有限响应当作 NeuroBook Job SSE 的完整替代。它只是本环境下可重复运行的 socket/frame/cursor 边界绕道；未来应在真实宿主 Transport 或稳定的跨平台测试环境补充无限流、断连、取消、heartbeat、backpressure 和 graceful shutdown。

## 证明与证据

最近一次 focused 运行：

~~~text
测试：bun test tests/sse-http-transport.test.ts
1 pass / 0 fail / 3 expect，约 2.0s
~~~

同一轮 bun run typecheck 通过；测试结束后的 Windows 进程审计没有发现命令行包含 sse-http-driver 或 sse-http-worker 的残留 Bun 进程。

已证明：

1. Bun.serve 可以把 Harness 的真实订阅事件编码成可由 Node http 接收的 text/event-stream 响应。
2. 首连和续传帧中的 event、id、JSON data、事件 seq 区间递增、event epoch 可由真实 HTTP 客户端解析并相互校验；首连/续传最后一帧均为对应 Invocation 的 agent_end。
3. 客户端在断线期间完成第二次 invocation，再以首连最后 seq + epoch 发起第二次连接，续传响应精确等于该 invocation 产生的连续 seq 区间；错误 epoch 被宿主映射为 409 recovery 响应。没有把 HTTP DTO 或 Transport server 代码放入 Core。
4. 成功路径已实测可在 Windows Bun shim 进程树下回收精确 worker，且 focused 测试后没有本轮 worker 残留；driver 对异常路径提供 pending HTTP abort、stream subscription finally 和精确 tree cleanup 结构，但没有做完整的异常注入/跨平台 shutdown 验收。

## 未验证与边界

- 没有验证无限保持 SSE 流、真实浏览器 EventSource、HTTP 代理/网关、heartbeat、socket backpressure、断连重试、取消或 graceful server shutdown。
- 没有验证 NeuroBook、Cosmos、真实 provider、第三方 Store 或生产部署；没有修改这些仓库。
- 本轮只验证错误 epoch 到 409 的最小 recovery 响应；没有验证生产级 snapshotRequired DTO、Snapshot payload 或客户端重同步循环。
- 没有把 Last-Event-ID 解析、鉴权、Origin/CORS、限流或重放策略声明为 Harness Core 合同。

## 审查

- 独立 post-fix 静态审查（Carver）：P0/P1 均为 0。审查确认第二次连接无法用忽略 Last-Event-ID 的 live-tail 实现伪造通过，首连/续传连续 seq、HTTP/frame/epoch、错误 epoch 409、stream subscription close 和 pending request abort 均已钉住；审查未编辑或提交文件。
- 成功路径 focused 已从约 15 秒收尾降到约 2 秒；异常注入、真实浏览器和跨平台 Transport shutdown 仍未运行。

## 下一步

回到规划阶段，优先从真实消费者需求中选择下一条可逆 vertical slice：继续补 Transport 宿主边界（断连/snapshotRequired DTO）还是转向 toolResult/assistant 输出块类型的消费者证据；在没有跨宿主证据前不扩展 Core API。
