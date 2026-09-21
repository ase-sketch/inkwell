# ADR-0031: Aborted Invocation Error Redaction

- Status: Accepted
- Date: 2026-08-11
- Task: [`01-harness-decoupling`](../tasks/01-harness-decoupling/README.md)

## Context

NeuroBook 最近的 Harness 修复把用户取消与 provider failure 分开投影：取消的 durable 状态只保存 `status: "aborted"`，不把 SDK 的英文 abort exception、forced-abort 说明或 waiting owner CAS 说明写入用户可恢复的错误正文。调用方本地结果和诊断日志仍可以保留技术细节。

standalone Harness 当前三条路径都把取消原因写入 durable `InvocationRecord.error`：

- cooperative `AbortSignal` 让 Model/Tool 抛错后，`run()` 将 `toInvocationError(error, "abort")` 传给 `finish()`；
- bounded forced abort 以 `AbortError` + `"Invocation 超过取消宽限期后被强制终止"` 完成；
- waiting Invocation 的 durable owner CAS abort 以 `"waiting Invocation 已由 durable owner CAS 取消"` 完成。

这会让恢复后的 `InvocationResult` 把取消实现细节伪装成失败正文，也让不同 provider 的 abort message 成为 durable 产品数据。

## Decision

- 对新的 terminal Invocation，`status === "aborted"` 时不持久化 `InvocationRecord.error`；`finish()`、forced abort 和 waiting abort 共用该规则。
- 本地运行 handle 的 `InvocationResult` 可以继续携带 cooperative abort 的原始 `error`，供调用方诊断；该字段不进入 durable Snapshot。
- 从 Snapshot 恢复 terminal Invocation 时，`resultFromSnapshot()` 对 `aborted` 一律不暴露 `error`，包括带有旧版 error 的 legacy record；旧数据不迁移、不重写。
- `failed` 保留现有 error persistence；`completed` 不改变。
- usage、partial、output、termination reason（如有）与 aborted status 的 durable 语义不变。

## Alternatives

- **保留所有 abort error**：拒绝；会把 provider/运行时实现细节稳定化为 durable 用户数据。
- **只过滤常见英文 abort message**：拒绝；错误分类依赖 provider 文本，无法覆盖 forced/waiting/自定义异常。
- **只在产品 projection 过滤**：拒绝；standalone Core 的 Snapshot/result contract 仍会泄露该语义，NeuroBook 之外的消费者无法得到一致边界。

## Acceptance gate

- cooperative abort：本地 result 可保留 error，但 Snapshot 的 aborted Invocation 没有 error；
- forced abort：Snapshot 与恢复结果都没有 error；
- waiting abort：durable owner CAS 后 Snapshot 没有 error；
- failed Invocation 仍持久化 error；
- legacy aborted record 的 `resultFromSnapshot` 不向恢复调用者暴露 error；
- focused/full/package gate 与 production/API-domain/test-sensitivity review 通过。

## Evidence and acceptance

- 新增 `tests/aborted-invocation-error-redaction.test.ts` 5 条 public regression，覆盖 cooperative、forced、waiting owner CAS、failed retention 与 legacy projection。
- 第五十五轮 focused 为 `64 pass / 0 fail / 238 assertions`，覆盖本测试、abort boundary、Harness、Invocation ownership、Model partial 与 recovery。
- 最终 `bun run verify` 为 `335 pass / 0 fail / 1452 assertions`，49 test files，typecheck/build 通过。
- 最终 `bun run pack:smoke` prepack 同为 `335/0/1452`；109-file tarball 为 120.4 kB / 570.8 kB unpacked，Bun 与 Node ESM consumer 通过。
- production、API/domain 与 test-sensitivity 三路 post-fix review 均返回 `No P0/P1/P2 findings.`。

该决定仅在 standalone Core 的 aborted terminal / Snapshot projection 范围接受；旧 durable error 不迁移，provider/UI/Transport 诊断投影仍由宿主决定。

## Out of scope

- 删除既有 JSONL 中已经写入的旧 `error` 字段；
- 统一 provider 的异常命名、国际化或 UI 文案；
- 修改 `InvocationResult` 的本地诊断结构；
- Job/Workflow/Transport/SSE/产品 projection 的额外语义。
