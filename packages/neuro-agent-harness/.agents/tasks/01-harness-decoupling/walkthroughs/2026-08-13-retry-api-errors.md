# 第一百零五轮：retry options+signal 与错误面收敛（规划 A 的 C3）

## 状态

第一百零一轮规划代理 A 的 C3 落地：retry 接受 RetryOptions（含 runtime-only signal），公共 admission 失败统一抛根导出的 HarnessAdmissionError，AbortBoundaryError/InvocationWriteFenceError 导出，waitForFollowUpQueueDrain 独立选项类型名。API 轮，无控制流/durable 形状变化（message 原文不变；err.name 从 Error 变 HarnessAdmissionError 属可观察变化）。

## 规划依据（规划代理 A）

- retry 第 3/4 参判别联合 + 游离参数、无 signal（与 invoke 不对称，Workflow 场景无法把父取消连到重试）；abort() 抛未导出的 AbortBoundaryError；公共 admission 大量裸 Error（消费者只能 parse message）；waitForFollowUpQueueDrain 借名 WaitForInvocationOptions。

## 变更

- `src/harness.ts`：新增导出 `RetryOptions {caller?, messageIdentity?, signal?}`、`WaitForFollowUpQueueDrainOptions`（= WaitForInvocationOptions 别名）、`HarnessAdmissionError`；导出 `AbortBoundaryError`/`InvocationWriteFenceError`；retry 接受 RetryOptions 并把 signal 透传到 InvokeRequest（旧 AgentCaller + messageIdentity 重载不变）；waitForFollowUpQueueDrain 改用新类型名。

## 变更（错误面）

- - steer（3 处）/followUp/cancelFollowUp/reorder 置换/resume 审批门禁与非 waiting/retry 不存在/未配置 ContextCompactor/悬挂 Tool Call 启动拒绝/appendEntries 空 drafts 共 12 处裸 Error 改抛 HarnessAdmissionError，message 原文不变。

## 变更（测试）

- 新增 `tests/retry-api.test.ts` 4 条：旧重载兼容（含 messageIdentity "system" 落盘断言）、options.signal 运行中取消复用 bounded abort、pre-aborted 不创建 durable Invocation、HarnessAdmissionError 类型与导出类断言。
- CHANGELOG/CONTEXT/README 同步。

## 门禁

- 新文件 4/0/12；typecheck 通过。
- focused：85 pass / 0 fail / 294 expect（14 files）。
- 全量逐文件循环：87 files、508 pass / 0 fail / 2059 expect。
- pack:smoke 通过（prepack 单命令 verify 508/0；tarball 113 files / 152.0 kB；Bun/Node consumer）。

## 未验证与保留边界

- 真实 NeuroBook/Cosmos consumer、真实 provider/tool、HTTP/SSE、浏览器/产品和生产验收仍未运行。

## 独立审查

- - 独立审查（Godel，只读）：无 P0/P1。3 条 P2 全部吸收：P2-1 同族剩余 3 处（resume 非 waiting、reorder 置换校验、appendEntries 空 drafts）也转为 HarnessAdmissionError（合计 12 处），文档枚举同步；P2-2 walkthrough 措辞改为「无控制流/durable 变化（err.name 变化属可观察）」；P2-3 RetryOptions 注释写明顶层 kind 判别规则。focused 实测 85/0/294（吸收前后一致）。
