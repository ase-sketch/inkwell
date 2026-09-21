# Workflow message-only invoke 诊断与修复

## 结论

根因不在 `AgentProfileCatalog.parsePayload()`。`packages/nb-workflow/src/agent-extension.ts` 把缺省 `InvokeOptions.input` 用 `?? null` 归一化为显式 JSON null，再传给 NeuroBook `HarnessAgentPort`；端口把 null 映射成 harness payload，因此无 PayloadSchema 的 adhoc profile 按既有严格合同拒绝调用。

真实失败记录 `job_034b8229` 确认 `parallel-brainstorm` 在 2026-09-03 启动后以 `profile adhoc 未声明 PayloadSchema，不能接收 invocation input。` 失败。代码链为 `SessionHandle.invoke({message})` → `input:null` → `HarnessAgentPort.payload:null` → `AgentProfileCatalog.parsePayload()`。

## 改动

- `packages/nb-workflow/src/agent-extension.ts`：activity params 与 AgentPort options 仅在调用方实际提供 input 时包含 input；显式 `input:null` 继续保留。
- `packages/nb-workflow/test/runner-backend.test.ts`：覆盖缺省 input、显式 null、未知字段过滤、activity params 与 fingerprint 区分。
- `packages/neuro-book/server/agent/workflow/workflow-agent-port.ts`：仅在 `opts.input !== undefined` 时生成 harness payload。
- `packages/neuro-book/server/agent/workflow/workflow-agent-port.test.ts`：覆盖适配边界不生成缺省 payload、保留显式 null。
- Reference 已明确 message 与 input 并列且 adhoc 任务走 message，无需修改；bundled workflow 写法正确，无需迁移。

## RED 证据

修改实现前，原测试把 message-only 的 AgentPort 输入锁定为 `input:null`。将预期改为 input 缺省并增加显式 null 区分后，当前实现会因实际对象仍含 `input:null` 而失败；该错误行为与 `packages/nb-workflow/src/agent-extension.ts` 原 `options.input ?? null` 一致。

## 验证

- `bun test test/runner-backend.test.ts --test-name-pattern "agents.invoke preserves missing versus explicit null input"`：1 passed，0 failed。
- `bun test test/runner-backend.test.ts`：32 passed，0 failed。
- `bunx tsc --noEmit -p tsconfig.json`（`packages/nb-workflow`）：退出码 0。
- `bun run test -- server/agent/workflow/workflow-agent-port.test.ts`（`packages/neuro-book`）：2 passed，0 failed。
- `bun run test -- server/agent/workflow/workflow-agent-port.test.ts server/agent/workflow/workflow-builtins.test.ts`：2 files passed，6 tests passed。
- `git diff --check -- <w00007 affected files>`：退出码 0。

未运行真实 Provider/Model 与已安装产品实例，因为本任务不含该授权。`workflow-builtins.test.ts` 使用真实 bundled workflow 源码和确定性 MockAgentPort，证明 `parallel-brainstorm` fanout/merge 控制流在修复后的 Workflow Kernel 路径通过。

## 收尾检查

- `bun run test`（`packages/nb-workflow`）：103 passed，0 failed。
- `bun run typecheck`（`packages/neuro-book`）：首次发现测试 mock 参数推断为零元组，修正 mock 签名后退出码 0。
- 修正后 `bun run test -- server/agent/workflow/workflow-agent-port.test.ts`：2 passed，0 failed。
- `bun run governance:check`：failures 与 warnings 均为空。
- `bun run docs:check`：检查 5389 个文件，failures 为空。
- 独立 Reviewer 任务因执行进程未及时返回而停止；Leader 按 correctness/readability/architecture/security/performance 五轴自审，未发现剩余 finding。外部 advisory 指向端口旧快照；最新源码第 30 行已条件展开，并由当前源码测试复核。
