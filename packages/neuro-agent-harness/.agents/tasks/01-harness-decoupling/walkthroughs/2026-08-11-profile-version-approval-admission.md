# 第四十九轮：Profile Version Approval Admission

## 状态

最终 focused/full/package 与合并后的 production、test-sensitivity、contract 三路窄复审均已通过，ADR-0028 已在 standalone Profile Version approval-admission 范围接受，第四十九轮收口。上一轮 checkpoint 为 `cc30e5f`；本轮只修改 `neuro-agent-harness`，继续保护 `docs/architecture.md`、`docs/pi-adapter-design.md` 与 `tests/context.test.ts`。

## 规划取证

本轮并行检查了四个角度：

1. **Approval public red**：确认 waiting Invocation 只持久化 `profileKey`，`resume()` 会用当前 Registry 的 Profile 重新 prepare；同名且 schema 兼容时，旧批准会执行新 handler。
2. **NeuroBook 对照**：NeuroBook 当前也按当前 catalog 解析下一轮和 approval resume；compiled artifact、watcher generation 与 catalog freshness 不是 durable Invocation pin，因此不能把产品 DTO 或编译产物移入 Core。
3. **版本合同**：内存 pin 和 prompt 比较都不能覆盖重启或 handler 变化；`manifest.version` 是现有最窄的宿主声明 seam，但必须从展示元数据提升为恢复兼容身份。
4. **存储兼容**：Memory/JSONL 都完整保存 Invocation record；新增 optional 字段是最小第一方方案。严格拒绝未知字段的第三方 Store 需要升级 decoder，不能被误报为已兼容。

已有 approval/recovery focused 分别得到 12/0/68、13/0/76 与 59/0/298 的只读基线；它们覆盖 durable claim、重复 resolution、JSONL restart 和 Profile replace，但没有“waiting 后跨版本 replacement”回归。

## 决定与术语

- **Profile Version** 是 waiting approval 的恢复兼容声明；`manifest.version ?? 1` 为有效版本。
- 新 Invocation 持久化有效版本；legacy 缺字段按版本 1。
- Tool 参数解释、approval prompt/data、handler、Capability 或相关 hook 语义不兼容时，宿主必须 bump version。
- same-version replacement 明确表示兼容；Core 不尝试哈希 JavaScript closure。
- version mismatch 在 durable claim、Capability、prepare、Tool 和 Provider 前拒绝，原 Invocation 保持 waiting。
- retry 是新的 Invocation，绑定 retry 时的当前版本。

稳定取舍记录在 [ADR-0028（Accepted，standalone Profile Version approval-admission scope）](../../../adr/0028-profile-version-approval-admission.md)。

## Public TDD 顺序

公开 seam 已由本 Task 约定：`NeuroAgentHarness.invoke()/resume()`、`ProfileRegistry.replace()`、Memory/JSONL Store 与 `snapshot()`；不测试私有 helper。

1. **Memory red**：v1 Tool 产生 waiting，Registry 替换为 v2 同名 Tool；旧实现应实际执行 v2 handler 并 completed。目标是 resume promise 在 claim 前拒绝，v2 prepare/Tool/后续 Model 为 0，Snapshot 仍 waiting。
2. **最小 green**：Resolved Profile 暴露 effective version，新 Invocation 保存版本，resume 比较并抛 typed conflict。
3. **JSONL restart**：v1 waiting 后关闭旧 Harness，以 v2 Registry 和同一目录恢复；保持相同 fail-closed 行为。
4. **Compatibility slices**：legacy missing field + v1 成功、legacy + v2 拒绝、same-version replacement 成功、retry 绑定当前版本、invalid durable value 拒绝。
5. **合同同步**：公开类型、README、CHANGELOG、CONTEXT、ADR 和 Task 一致；明确第三方严格 Store 与真实消费者仍未验证。

## 决策门

- 如果 Memory red 不能证明新版 Tool 副作用，撤回持久格式与 ADR，仅补当前语义文档。
- 如果只比较版本无法在重启后稳定拒绝，停止并评估 host-supplied opaque revision，不用内存 generation 伪装 durable 安全。
- 如果新增字段破坏第一方 JSONL legacy recovery，优先修复 additive normalization；不静默丢弃旧 waiting approval。

## Red → Green

Memory public tracer 在旧实现上得到：

```text
0 pass
1 fail
4 assertions

Expected:
outcome=rejected
versionTwoPrepares=0
versionTwoExecutions=0
modelCalls=1
invocationStatus=waiting

Received:
outcome=accepted
resultStatus=completed
versionTwoPrepares=1
versionTwoExecutions=1
modelCalls=2
invocationStatus=completed
```

这证明旧批准不是只“可能”读取新定义，而是实际执行 v2 Tool 并把同一 Invocation 完成。

最小实现：

- `ResolvedProfile.version` 保存 `manifest.version ?? 1`；
- Harness start 在 `InvocationRecord.profileVersion` 持久化有效版本；
- `invocationProfileVersion()` 为 legacy 缺字段提供 canonical 版本 1，并拒绝非法 durable 值；
- `resume()` 在 Store claim 前比较 durable/current version，mismatch 抛根导出的 `ProfileVersionConflictError`；
- retry 沿普通 start 路径创建新 Invocation，因此捕获 retry 时的当前版本。

第一条 Memory green 为 1/0/4，typecheck 通过。随后逐个增加 JSONL restart、legacy、same-version replacement、retry 和 invalid durable version，首次单文件为：

```text
6 pass
0 fail
16 assertions
```

扩大到 approval、recovery、Profile Registry、Prepared Tool identity、Invocation result durability、Context Capability 和 message identity：

```text
40 pass
0 fail
215 assertions
```

JSONL 使用 `checkpointEvery: 2` 同时经过 delta 与 checkpoint；重启后可见 `profileVersion: 1`，v2 mismatch 不改变 Session version。legacy fixture 从每条 snapshot/commit record 删除字段：当前 v1 可以完成，当前 v2 在 prepare/Tool 前拒绝。same-version replacement 明确执行 replacement Tool；retry 的两个 Invocation 分别保存 `[1, 2]`。

## 独立审查与返修

三路首次 review：

- implementation：`No P0/P1/P2 findings.`
- test-sensitivity：2 P1 + 2 P2；
- contracts：复现其中 `null` durable version 的 P1，无额外 finding。

返修内容：

1. `invocationProfileVersion()` 从 `value ?? 1` 改为只在 `value === undefined` 时使用 legacy 默认；JSONL fixture 同时证明 `null` 与 `0` 都抛 `SessionInvariantError`。
2. JSONL restart 从默认 1→2 改为非默认 7→8，并直接读取原始 JSONL，证明带 Invocation 的 `commit` 与 `snapshot` record 都保存 7；字段丢失不再因 legacy default 假绿。
3. Memory/JSONL mismatch 都比较完整前后 Session，并校验 `ProfileVersionConflictError` 的 `profileKey`、`invocationId`、expected/actual version。
4. reviewer 把 resolve→claim 期间 replacement 视为 TOCTOU；代码实际持有已通过校验的旧 Profile，不会转为 v2。新增 delayed resume Store gate：版本检查后、claim 完成前替换为 v2，最终只执行 v1 Tool，v2 prepare/Tool 均为 0。合同明确该 attempt pin 语义。

返修后单文件与扩大 focused：

```text
7 pass / 0 fail / 23 assertions
41 pass / 0 fail / 222 assertions
```

上文首次 JSONL 数字中的 `profileVersion: 1` 只描述 pre-review tracer；返修后的持久字段证据为非默认版本 7。

post-fix gates：

```text
bun run verify
284 pass / 0 fail / 1356 assertions
43 test files
typecheck + build passed

bun run pack:smoke
prepack: 284 / 0 / 1356
109 files
115.7 kB package / 552.2 kB unpacked
Bun + Node ESM consumers passed
```

第二轮窄复审继续发现并收口：

- test reviewer 发现 raw JSONL 把 commit/snapshot 的 version 合并成一个 Set，仍可单类丢字段假绿；现已分别要求 `commitProfileVersions=[7]` 与 `snapshotProfileVersions=[7]`。
- legacy mismatch 现校验完整 error identity 与完整 Session 相等。
- invalid fixture 与两个 JSONL producer 均有失败路径 dispose：invalid 使用 `finally`，producer 由 afterEach fallback tracker 在删临时目录前收口。
- contract reviewer 的唯一 P2 是 CHANGELOG 未明确 `null` 非 legacy；已同步。
- production reviewer 发现公开 reducer 只在 read/resume 校验坏值，自定义 Store 的 existing invalid Invocation 仍可先提交其它 mutation。新增 reducer public red 为 0/1/3，实际返回带 `profileVersion:null` 的成功 append；现在 reducer 复制每个现有 Invocation 时统一调用 `invocationProfileVersion()`，随后单文件转绿。
- 一次 contract review 恰好运行在 reducer red 期间，正确报告 283/1/1355；该输出没有被当作 acceptance。修复后的最终主流程证据是上面的 284/0/1356。
- 合并后的 production、test-sensitivity 与 contract 三路最终窄复审均返回 `No P0/P1/P2 findings.`，没有遗留 acceptance finding。

## 当前实现边界

- Core 不检测同版本 handler 是否真的等价；same-version 是宿主声明，不是 closure hash。
- resolve/version check 已开始的 resume attempt 使用捕获的兼容 Profile；Registry replacement 只影响之后解析 Profile 的调用。
- optional 字段只保证旧记录可读；严格拒绝未知 startInvocation 字段的第三方 Store 必须升级。
- mismatch 不自动迁移 approval，也不取消 waiting Invocation；宿主可继续展示、取消或显式重新创建。

## 当前未验证

真实 NeuroBook/Cosmos Adapter、真实 Provider、HTTP/SSE、第三方严格 Store、外部副作用 exactly-once 与产品 approval UI 均未验证。本轮不修改 NeuroBook/Cosmos，不 push、发布或部署。

## 下一步

本轮建立本地 checkpoint 后回到第五十轮规划。优先调查 active v1 Invocation 运行期间 Registry 切换到 v2 时，`steer()` 是否会使用 v2 parser 解释将注入仍由 v1 Profile 驱动 attempt 的输入；先做多角度只读取证与 public tracer，不预设需要扩展 Core API。
