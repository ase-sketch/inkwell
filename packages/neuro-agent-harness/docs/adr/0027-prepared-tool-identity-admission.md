# ADR-0027: Prepared Tool Identity Admission

- Status: Accepted (standalone PreparedRun Tool identity scope)
- Date: 2026-08-11
- Task: [`01-harness-decoupling`](../tasks/01-harness-decoupling/README.md)

## Context

`PreparedRun.tools` 是 Profile 每次准备运行时提供给 Model Runtime 和 Harness 的 Tool 定义数组。Model request 按 `name` 暴露 Tool，Tool dispatch 也按同一个 `name` 查找；因此 `name` 是该次 `Profile.prepare()` 结果内的 provider-visible Tool identity。approval resume 会重新 prepare，并获得一组新的 prepare 结果定义。

当前数组类型可以合法地携带两个同名 Tool。Model 会收到两份同名声明，而 Harness 的 `tools.find(...)` 会静默选择第一份；两个声明的参数 schema、approval、execution mode 或 execute handler 可能不同。NeuroBook 的 Profile tool binding 使用 object key，已在 Profile 定义阶段保证稳定 key，不允许这种歧义。

真实 Provider 如何处理同名声明不在本轮验证范围；standalone Harness 仍需在自己的 Model declaration 与本地 dispatch 之间给出唯一、可预测的宿主执行语义。

## Decision

每次 `Profile.prepare()` 返回后，Harness 在任何 `prepareWrites`、Model request、approval request 或 Tool execution 前检查本次 `PreparedRun.tools`：

- 每个 Tool `name` 必须在本次数组中精确唯一；
- 发现重复时，Invocation 在 Model/approval/Tool 副作用前 fail closed；
- approval resume 重新执行 `Profile.prepare()` 后重复检查，不能因为 waiting transcript 已存在而绕过；
- 保留既有异步错误边界和 Invocation terminal failure projection；不执行任何 Tool，也不提交 Tool 返回的 SessionWritePlan；
- 不按 trim、大小写或 Provider 私有规则重写名称；名称命名空间仍由宿主/Provider-neutral Profile 合同负责。

本 ADR 不改变 `Tool Call ID` 的唯一性合同（见 ADR-0025），也不提供跨 Tool 或跨 Session transaction、compensation、Outbox 或 exactly-once。

## Alternatives

- **第一份优先或最后一份优先**：拒绝。会把模型声明与实际副作用绑定到隐式数组顺序，错误可能静默发生。
- **自动给 Tool 改名或加 namespace**：拒绝。模型可见名称会改变，approval、transcript 和宿主引用无法无损推导。
- **把唯一性完全委托给 Provider**：拒绝。真实 Provider 行为未在本轮验证，且 standalone Harness 的本地 dispatch 合同不能依赖未规定的外部拒绝行为。
- **只在 `defineTool()` helper 校验**：不足。动态 Profile 可以直接返回结构兼容的 ToolDefinition 数组，Harness 不能把 helper 调用当作运行时前提。

## Acceptance gate

- 普通 invoke 的同名 Tool public tracer 在 Model call 前稳定失败，本次 prepare 的 `prepareWrites`、Model、approval、Tool execute 和 Tool write plan 均为 0；
- approval resume tracer 在初始唯一 Tool 已产生 waiting 后加载同名 Tool prepare 结果；该次 resume 不新增 Model/approval/Tool/write-plan 副作用。产生 waiting 的初始 Model/approval 不计入该 gate；
- 不同名 Tool、现有 parallel/sequential、approval、JSONL restart 路径保持通过；
- `bun run verify`、适用的 focused/package gate 和独立审查通过；
- 文档明确该合同只约束 standalone PreparedRun Tool identity，不扩展到 Provider SDK 或 Cosmos 产品 DTO。

## Out of scope

- Tool 参数 schema 的跨 Provider 兼容；
- 外部副作用幂等、Workflow Job/Lease/Outbox/delivery；
- HTTP/SSE、文件系统 read policy、Cosmos Agent Adapter；
- Tool Call ID、Session entry ID 或外部 API idempotency key 的重新定义。
