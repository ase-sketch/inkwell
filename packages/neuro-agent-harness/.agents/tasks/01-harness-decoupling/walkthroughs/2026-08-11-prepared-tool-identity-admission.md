# 第四十八轮：Prepared Tool Identity Admission

## 状态

已收口。上一轮 checkpoint 为 `cadd9c1`；本轮只修改 `neuro-agent-harness`，继续保护 `docs/architecture.md`、`docs/pi-adapter-design.md` 与 `tests/context.test.ts`。

## 规划取证

本轮并行检查了五个角度：

1. **Core correctness**：发现不合作 `SessionCommitObserver`、Store cleanup 和 shared closable Store 的生命周期候选，但它们分别要求新的 callback/ownership 合同；当前没有第一方 consumer red，暂不抢跑。
2. **Storage/lifecycle**：确认 `ToolResult.writePlans` 会逐项 commit，第一项 durable 后第二项 conflict 可留下 partial success；这是已知 P2 API footgun，但本轮先不引入 transaction、compensation、Outbox 或 exactly-once。
3. **NeuroBook parity**：当前 Context lifecycle、approval/recovery、Tool ID、partial/usage、cursor 和 shutdown 已有 standalone 对等 provider-neutral 合同；Prompt 中更细的 CurrentUserInput 位置仍是 Adapter 语义。
4. **Cosmos consumer**：Cosmos 当前没有真实 Harness import/call path；Phase 1 继续直接使用 `pi-ai`。未来 Agent Adapter、Workflow/Run/Step/Job/Lease/Outbox 和领域事实继续由 Cosmos 持有。
5. **Package/API**：根包 ESM 与 `storage/memory`、`storage/jsonl`、`testing` subpath 可达；CJS、read Tool recipe、structured output narrowing 和 SSE cursor framing 需要真实消费者证据，当前不扩 Core。

## 问题与影响

`PreparedRun.tools` 是动态数组。Model request 以 Tool `name` 作为 provider-visible identity，而 Harness 在 dispatch、approval 和 execution mode 判断中使用 `tools.find(candidate => candidate.name === call.name)`。

因此，Profile 可以返回两个同名但参数 schema、approval 或 execute handler 不同的 Tool：

- Model 收到两份同名声明，Provider 的选择行为不稳定；
- Harness 本地静默选择第一份；
- 调用方可能看到一个 Tool 的 schema，却执行另一个 Tool 的副作用；
- 若 Tool 返回 `writePlans`，错误选择还可能在错误能力上产生 durable Session mutation。

NeuroBook 的对照实现把 Profile tools 作为 object binding，并在定义阶段保证 key 唯一；standalone 的结构化数组没有同等 admission。

## 计划的 public TDD

1. **Red A：普通 invoke**
   Profile 返回两个合法、同名的 Tool；Scripted Model 发出该 name 的 call。当前实现应证明会调用第一份 handler/继续执行，目标行为是 Model call 前 fail closed，Tool/Model side effect 为 0。
2. **Red B：approval resume**
   首次使用唯一 Tool 进入 waiting；Profile 在 resume 前切换为同名 Tool 数组。当前实现应证明 resume 可能继续进入 dispatch，目标行为是在 Tool/approval side effect 前失败。
3. **Green**
   在每次 `Profile.prepare()` 返回后验证 Tool names 精确唯一；普通运行和 approval resume 共用同一 seam。失败沿现有 Invocation terminal failure 与异步 rejection 边界收口。
4. **回归**
   保持不同名 Tool、parallel/sequential、approval、Tool Call ID、JSONL restart 和现有 package consumer 行为；不改变 Provider-visible Tool schema 之外的 API。

## 决策门

- 如果 Red A/B 不能稳定证明错误 dispatch 或副作用窗口，则撤销 API/ADR 方案，仅记录“数组顺序为未指定行为”并回到规划。
- 如果 Red 稳定，接受 ADR-0027 的 standalone Tool identity scope；不新增 namespace、自动 rename 或 Provider-specific naming rule。

## Red → Green

旧实现运行两个 public tracer：

```text
Expected: 0
Received: 1

0 pass
2 fail
4 assertions
```

普通 invoke 实际执行第一份同名 Tool，approval resume 在 Profile replacement 后也执行第一份同名 Tool；两条路径随后继续调用 Model 并返回 completed。这证明 standalone Harness 的公开 seam 会稳定发生错误能力选择；真实 Provider 是否接受同名声明不在本轮验证范围。

实现只增加内部 `assertPreparedToolIdentities()`，并在 `Profile.prepare()` 返回后、读取 `prepared.tools` 时调用。它在以下行为前统一 fail closed：

- `prepareWrites` durable commit；
- 普通 Model request；
- approval collection；
- waiting resume 的 Tool dispatch；
- Tool execute 与 Tool result `writePlans`。

普通 invoke 测试带有一个可观察 `prepareWrites` entry，green 后确认未提交；两个 handler 计数、普通 Model call 和 resume 后续 Model call 保持 0。approval waiting 的初始 Model call保留为 1，Profile replacement 后 resume 不执行任何重复 Tool。

当前结果：

```text
bun test tests/tool-definition-admission.test.ts
2 pass / 0 fail / 12 assertions

bun test tests/tool-definition-admission.test.ts tests/parallel-tools.test.ts tests/approval.test.ts tests/tool-call-identity.test.ts
17 pass / 0 fail / 84 assertions
```

实现没有新增 public export、持久格式或 dependency；`ToolDefinition.name` 与 `PreparedRun.tools` 的类型注释、README、CONTEXT 和 CHANGELOG 已同步。

## 验证与边界

当前验证：

- 单文件：2 pass / 0 fail / 12 assertions；
- approval/parallel Tool/Tool Call identity focused：17/0/84；
- `bun run verify`：277/0/1333，42 files，typecheck + build 通过；
- `bun run pack:smoke`：exit 0，prepack 同为 277/0/1333，109-file tarball 为 114.1 kB / 545.9 kB unpacked，Bun/Node 安装与 consumer 通过。

独立审查结果：

- implementation reviewer：`No P0/P1/P2 findings.`
- test-sensitivity reviewer：`No P0/P1/P2 findings.`
- contracts reviewer 首轮发现 2 个 P1、1 个 P2：identity scope 被误写为整个 Invocation、approval resume gate 没有排除初始 waiting Model call、以及文档对未验证 Provider 行为表述过强；
- 三项文档修正后，post-fix contracts reviewer：`No P0/P1/P2 findings.`

ADR-0027 已在 standalone PreparedRun Tool identity scope 接受。

本轮不验证真实 Provider duplicate-name 行为、NeuroBook/Cosmos 真实 Adapter、HTTP/SSE、外部 Tool side effect、Store ownership、Workflow Job/Lease/Outbox 或发布。

## 下一步

承载本 walkthrough 的 git commit 构成本轮精确本地 checkpoint；下一步回到第四十九轮规划。真实 Provider duplicate-name 行为、NeuroBook/Cosmos Adapter、HTTP/SSE 与外部副作用仍未验证。
