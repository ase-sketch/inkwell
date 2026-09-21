# 第五十五轮：Aborted Invocation Error Redaction

## 状态

public red→green、focused/full/package gate、production / API-domain / test-sensitivity 三路窄复审均已完成；ADR-0031 已在 standalone Core aborted terminal / Snapshot projection 范围接受，第五十五轮收口。本轮只修改 `neuro-agent-harness`，继续保护 `docs/architecture.md`、`docs/pi-adapter-design.md` 与 `tests/context.test.ts`。

## 规划取证

1. NeuroBook 最近的 Harness 修复（`4179f736`）把取消与失败分开投影：取消的 durable 状态只表达 `aborted`，不保存 SDK 的英文 abort exception、forced-abort 说明或等待态 owner CAS 说明；调用方本地结果与日志仍可保留诊断。
2. standalone 取证确认 cooperative abort、forced abort、waiting owner CAS abort 三条路径都会把取消原因写入 durable `InvocationRecord.error`：
   - cooperative Model 抛 `"Request was aborted"` 后 `run()` 将 `toInvocationError(error, "abort")` 传给 `finish()`；
   - forced abort 写入 `"Invocation 超过取消宽限期后被强制终止"`；
   - waiting abort 写入 `"waiting Invocation 已由 durable owner CAS 取消"`。
3. 只读 public runtime 探针实际观察到三条路径的 Snapshot 均包含 error；failed provider error 则正常保留。该差异是 standalone Core durable contract，不是 NeuroBook UI 细节。

## 决定

- 新的 aborted terminal 不持久化 `InvocationRecord.error`；`terminalInvocationOperations()` 统一按 status 过滤，覆盖 finish、forced abort、waiting abort。
- cooperative 本地 `InvocationResult` 继续携带原始 error，保持调用方诊断能力；forced abort 的 confirmed result 不再伪造内部 AbortError。
- `resultFromSnapshot()` 对 `aborted` 一律隐藏 error，兼容 legacy record 的恢复 projection；不修改、不迁移既有 JSONL。
- failed/completed 的 error、usage、partial、output、termination reason 语义不变。

ADR-0031 已接受：[Aborted Invocation Error Redaction](../../../adr/0031-aborted-invocation-error-redaction.md)。

## Public TDD 与实现

新增 `tests/aborted-invocation-error-redaction.test.ts`，5 条回归：

1. cooperative abort：本地 result 保留 `"Request was aborted"`，durable Snapshot 无 error；
2. forced abort：强制终止说明不进入 Snapshot 或 confirmed result；
3. waiting Invocation 的 durable owner CAS abort：approval 取消说明不进入 Snapshot；
4. failed Invocation 仍持久化 `"provider failed"`；
5. legacy aborted Snapshot 的恢复 projection 隐藏旧 error。

生产改动仅两处合同边界：

- `resultFromSnapshot()` 只在非 aborted terminal 暴露 `invocation.error`；
- `terminalInvocationOperations()` 只在非 aborted status 写入 error。

## Red → Green、审查与绕道

Red 阶段 cooperative/forced/waiting 三条测试均观察到 durable error；failed retention 测试通过。过滤后新测试 5/0/7。

三路窄复审均无 finding：

- production：无 P0/P1/P2，确认所有 aborted terminal builder 共用过滤边界，local result 与 Snapshot projection 未混淆；
- API/domain：无 P0/P1/P2，确认文档明确区分 durable redaction 与本地诊断，ADR 为 Accepted 且 legacy/no-migration 边界清楚；
- test-sensitivity：无 P0/P1/P2，确认 cooperative/forced timing 有 start gate，waiting 路径先等待 durable waiting，legacy cast 只测试恢复 projection。

## 全仓门禁

```text
bun test tests/aborted-invocation-error-redaction.test.ts \
  tests/abort-boundary.test.ts tests/harness.test.ts \
  tests/invocation-ownership.test.ts tests/model-turn-partial.test.ts \
  tests/recovery.test.ts

64 pass / 0 fail / 238 assertions

bun run verify
335 pass / 0 fail / 1452 assertions
49 test files
typecheck + build passed

bun run pack:smoke
prepack: 335 / 0 / 1452
109 files
120.4 kB package / 570.8 kB unpacked
Bun + Node ESM consumers passed
```

## 当前未验证

真实 NeuroBook/Cosmos Adapter、真实 Provider abort exception 分类、第三方 Store、HTTP/SSE Transport、跨进程 EventHub、浏览器/产品取消 projection 与既有 legacy JSONL 的批量迁移仍未验证。本轮不修改 NeuroBook/Cosmos，不 push、发布或部署。
