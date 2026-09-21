# 第五十轮：Active Profile Steer Admission

## 状态

public red→green、反例 mutation check、三个 test-sensitivity P2 返修、最终 focused/full/package 与三路独立复审均已完成；ADR-0029 已在 standalone Active Profile steer-admission 范围接受，第五十轮收口。本轮只修改 `neuro-agent-harness`，继续保护 `docs/architecture.md`、`docs/pi-adapter-design.md` 与 `tests/context.test.ts`。

## 规划取证

1. **standalone Core**：`invoke()` / `resume()` 解析一个 `ResolvedProfile` 并把同一对象传入整个 `run()`；Capability、prepare、hooks、Tools、limits 与 output parser 均来自它。
2. **当前 steer 断点**：active state 只保存队列与 attempt，不保存 Profile parser；`steer()` 在 Store read 后按 Session `profileKey` 重新调用可变 Registry。drain 直接把该 parsed payload 包进 `<user_steer>` 并提交，不再经过 active Profile。
3. **replacement seam**：`ProfileRegistry.replace()` 明确服务文件 watcher。同 key 的 v1 active attempt 与 v2 Registry 可以合法同时存在，因此不是测试伪造的不可能状态。
4. **NeuroBook 对照**：NeuroBook 当前也在 enqueue steer 前从当前 catalog 解析 payload，运行 frame 则保存 prepare 阶段的 Profile；catalog watcher/runtime registry 会翻转当前视图，Project generation capture 不等于 Profile object pin。这是同类风险证据，不是要移植的产品实现。
5. **Cosmos 边界**：Cosmos Phase 1 继续直接使用 `pi-ai`，只预留 ModelRuntime、SessionStore、Profile 与 Capability Adapter；没有当前 steer consumer，也没有理由把 Job/Run/Lease/Outbox 或产品 DTO 移入 Core。

三路并行只读规划中，test-sensitivity planner 返回了完整 public tracer 与防假绿建议；Core planner 和 consumer/parity planner 分别在生成 final 时遇到服务过载与 429，只保留了可复核的只读工具证据，不把缺失的 final 当作审查结论。集成负责人随后按上述源码位置手工复核。

## 决定

- **Active Profile binding**：一个 running attempt 使用启动或 resume admission 时捕获的精确 Profile；steer payload parser 属于该 binding。
- `steer()` 继续执行现有 Store read、shutdown 和 active identity recheck，只把 parser 来源从 mutable Registry 改为 active binding。
- 不新增公开 API、错误类型、持久字段或依赖；不让 Profile 直接操作 Store。
- Registry replacement 只影响之后的 Profile resolution。same-version replacement 也不局部热替换当前 attempt。
- durable follow-up 是未来新 Invocation 的 admission，存在独立的重解析问题；本轮只记录为下一候选，不和 process-local steer 混改。

稳定取舍记录在 [ADR-0029（Accepted）](../../../adr/0029-active-profile-steer-admission.md)。

## Public TDD 顺序

公开 seam 已由 Task 确认：`NeuroAgentHarness.invoke()/steer()`、`ProfileRegistry.replace()`、`MemorySessionStore` 与注入的 `ModelRuntime` request；不读取 private active state。

1. **Transformation red**：v1/v2 parser 接受相同 raw payload，但分别写入 `parsedBy: "v1" | "v2"`。v1 first turn gated 后 replace v2，再 steer；同时观察 caller-visible queued payload 与 provider-visible第二轮 `<user_steer>`。
2. **Minimal green**：active state 捕获精确 parser；start 与 approval resume 两个 register 入口都显式传入已解析 Profile，不改 public shape。
3. **Sensitivity slice**：same-version replacement parser 改为拒绝该 raw payload；active v1 steer 仍应接受，用于防止实现退化为“版本相同后调用 current parser”。
4. **Regression matrix**：扩大到 coordination、message identity、shutdown/reentrant steer、approval resume 与 Profile Version tests。
5. **Acceptance**：focused → `bun run verify` → public Core 行为变化时 `bun run pack:smoke` → 三路窄审查 → protected-file audit。

## 决策门

- 如果 public tracer 不能同时证明 queued payload 来自 v2、provider 仍由 v1 驱动，则撤回 ADR，不按代码形状推断缺口。
- 如果修复需要持久化 Profile closure、改变 follow-up durable truth 或导入 NeuroBook catalog generation，则停止并重新规划。
- 只有 exact active parser 能在不扩大职责的前提下转绿，才接受 ADR-0029。

## Red → Green

首条 transformation red 精确得到：

```text
0 pass / 1 fail / 1 assertion
queued payload: parsedBy=v2
provider systemPrompt: system-v1
provider steer content: parsedBy=v2
v1 prepare=1 / v2 prepare=0
```

这同时证明 active run 仍由 v1 驱动、只有 steer admission 泄漏到 v2。最小实现只在 private active state 保存捕获的 `parsePayload`，start 与 approval resume 的 `registerActive()` 都显式传入已解析 Profile；`steer()` 保留原 Store read 与两次 lifecycle recheck。单文件转为 1/0/1。

第二条反例让 same-version replacement parser 直接拒绝 raw steer；正式实现为 2/0/2。它证明 exact binding 不是简单的 version mismatch 分支：即使 replacement 仍声明版本 1，也不能局部替换当前 attempt 的 parser。

第三条从 waiting approval resume 出发，在恢复后的 Model turn 期间 replace v2 再 steer；正式实现为 3/0/3。只把 resume 注册入口临时改为动态 Registry parser 时，结果为 2 pass / 1 fail，queued/provider payload 都变成 v2；还原后重新 3/0/3。

三条合并后再次临时恢复旧 `steer()` Registry parser，mutation check 为 0/3/3：跨版本 start、same-version rejection 与 resume 三个场景分别以 normalization 泄漏或错误拒绝变红。mutation 随即还原，不进入正式 diff。

手工兼容审查进一步指出 `ResolvedProfile.parsePayload` 在类型上是方法，直接摘出函数会假设它不依赖 receiver。`registerActive()` 因此改为接收精确 `ResolvedProfile`，active parser 用闭包调用该对象的方法；第一方 Registry 的闭包行为不变，自定义子类也不会因丢失 `this` 失败。调整后单文件 3/0/3、typecheck 通过。

首次扩大 focused 覆盖 active admission、coordination、message identity、shutdown/reentrant steer、approval、Profile Version 与 Prepared Tool：

```text
45 pass / 0 fail / 197 assertions
7 test files
```

`bun run typecheck` 与 `git diff --check` 均通过；后者只有 Windows LF→CRLF 提示。

pre-review 全仓与 package gate：

```text
bun run verify
287 pass / 0 fail / 1359 assertions
44 test files
typecheck + build passed

bun run pack:smoke
prepack: 287 / 0 / 1359
109 files
115.9 kB package / 553.1 kB unpacked
Bun + Node ESM consumers passed
```

## 独立审查与返修

首次 reviewer runtime 没有形成代码结论：默认 deepseek 在工具回传时触发 `reasoning_text` 400，显式 luna 遇到 429，`gpt-5.4` 不支持当前账户。最终把冻结 diff 与三份新文件全文放进 prompt，并禁止工具调用，使用 deepseek 单次完成三路独立审查；这些 runtime 绕道不作为 acceptance finding。

- production-correctness：`No P0/P1/P2 findings.`，明确核对 start/resume binding、receiver、shutdown/reentrancy、same-version 与内存生命周期；
- API/domain-contract：`No P0/P1/P2 findings.`；
- test-sensitivity：无 P0/P1，提出三个 P2：
  1. active parser 自身拒绝路径没有证明 queue/event/durable message 都不产生；
  2. same-version rejection 只检查 caller-visible payload，没有检查 provider-visible message；
  3. resume fixture 在 start 与 resume 时使用同一 Profile，不能区分原 start binding 与 resume admission binding。

返修内容：

1. 新增 captured active parser rejection：同时断言 rejected error、无 `steer_queued`、无 durable `<user_steer>`、result completed 且 Model calls=1。临时吞掉 parser error 并 queue raw payload 时，结果为 3 pass / 1 fail，第四条同时观察到 fulfilled、event、durable message 与第二次 Model call；随后还原。
2. same-version replacement test 的第二轮 Model request 现在直接校验 `system-v1` 与 provider-visible `parsedBy:v1`。
3. resume test 在 waiting 后先装载同版本 `resume-v1` Profile，再 resume；运行中再装载 v2。queued/provider payload 与 system prompt 必须来自 `resume-v1`，不能来自原 `start-v1` 或 current v2。

返修后单文件为 4/0/4；扩大 focused 为 47/0/199，覆盖 7 files；typecheck 通过。

## 最终验证与门禁绕道

状态复核期间，完整 `bun run verify` 连续出现两个不同的一次性失败：

1. `Windows heartbeat sharing violation 保留 JsonlLockIoError taxonomy` 在 15 秒超时；单条复跑为 1/0/3，约 1.48 秒。
2. 下一次完整运行中 heartbeat 已通过，但 `system follow-up keeps queue caller and identity across JSONL restart and drain` 的 `resumeFollowUps()` 偶发返回 null；单条复跑为 1/0/9，约 63 毫秒。

两者都不是本轮 Active Profile 测试。为避免把偶发绿误当成结论，也避免无证据放宽 timeout，建立了以下反馈环：

```text
restart-follow-up 顺序循环：100 / 0
heartbeat sharing 顺序循环：10 / 0
crash/lock/store/legacy/message-identity 六文件前置链：47 / 0 / 287

并行压力：
restart-follow-up：500 / 0 / 4500
heartbeat sharing：20 / 0 / 60
crash phases：2 / 0 / 50
```

在压力条件下仍无法复现；没有形成稳定 red，也没有发现与本轮 `parsePayload` binding 的因果链。因此没有修改 JSONL、follow-up、timeout 或测试基础设施，只把这次绕道保留为验证证据。随后三个完整门禁连续通过：

```text
bun test
288 pass / 0 fail / 1360 assertions
44 test files

bun run verify
288 pass / 0 fail / 1360 assertions
44 test files
typecheck + build passed

bun run pack:smoke
prepack: 288 / 0 / 1360
109 files
115.9 kB package / 553.1 kB unpacked
Bun + Node ESM consumers passed
```

## 最终独立复审与收口

返修后的冻结 tracked diff 与 ADR、walkthrough、public test 全文再次以 no-tool bundle 交给三个独立 reviewer：

- production-correctness：`No P0/P1/P2 findings.`
- test-sensitivity：`No P0/P1/P2 findings.`
- API/domain-contract：`No P0/P1/P2 findings.`

最终 checkpoint 审计确认工作树严格由 8 个本轮文件与 3 个受保护既有文件组成，没有其它路径；精确暂存后 `CachedCount=8`、`ProtectedIntersection=0`、`MissingExpected=0`、`UnexpectedCached=0`，`git diff --cached --check` 通过。

ADR-0029 因而只在 process-local running attempt 的 Active Profile steer-admission 范围接受。durable follow-up 重解析仍是第五十一轮规划候选，不由本轮结论覆盖。

## 当前未验证

真实 NeuroBook/Cosmos Adapter、真实 Provider、Profile watcher 竞态、HTTP/SSE、第三方 Store、跨进程 steer、外部副作用 exactly-once 与产品 UI 均未验证。本轮不修改 NeuroBook/Cosmos，不 push、发布或部署。
