# 第六十八轮：invocationResultFromSnapshot 公开只读投影

## 状态

第六十七轮规划记录的第一候选：把 private 的 `resultFromSnapshot` /
`confirmedResult` 映射公开化为根导出纯函数 `invocationResultFromSnapshot`，
让宿主编排器在进程重启后无需复制样板即可重建 `InvocationResult` 视图。
本轮为 additive public API 轮：新增根导出 + 内部实现委托去重，行为不变；
用户保护文件未纳入范围。

## 规划依据

- 第六十七轮三路调查的 Workflow 缺口结论（Confucius）：`handle.result()` 只绑定
  本进程 active Map，进程重启后宿主只能轮询 `snapshot()` 并自行把
  `InvocationRecord` 映射回结果视图；该映射 Core 内部已有但 private
  （`resultFromSnapshot` / `confirmedResult`），现有测试重启后也只读裸字段
  `invocations[0]?.output`。候选定位为与 `invocationUsage` /
  `invocationPartial` 同级的纯读侧 helper。
- 边界复核：不新增跨进程等待原语、不新增轮询/Job 语义（ADR-0001 宿主）；
  函数只做 Snapshot → `InvocationResult` 投影，不读 Store、不启动运行；
  与 round-28/31 的 helper 相同级别，不需要新 ADR。

## 变更

- `src/harness.ts` 新增根导出纯函数 `invocationResultFromSnapshot(snapshot,
  invocationId)`：
  - terminal（completed/failed/aborted）→ 完整 `InvocationResult`，含
    terminationReason/output/usage/partial，aborted 按第五十五轮 redaction
    规则排除 error；
  - waiting → `persistence: "confirmed"` + `pendingApprovals` + usage；
  - running / interrupted / 缺失 → `undefined`。
- private `resultFromSnapshot` 与 `confirmedResult` 改为委托该函数（行为
  逐字段核对一致：confirmedResult 的 waiting 分支、resultFromSnapshot 的
  terminal 过滤与 error redaction 全部覆盖）。
- 根导出经既有 `export * from "./harness.js"` 生效；README 功能与包结构节、
  CHANGELOG Unreleased 同步。
- 新增 `tests/invocation-result-projection.test.ts` 8 条：纯投影（completed/
  failed/aborted/waiting/running/interrupted/缺失、usage+partial fact、
  aborted error redaction）+ 恢复场景（Memory 真实运行、JSONL 重启后新 Store
  read 投影、waiting 投影 pendingApprovals）。

## TDD 证据

初始 red：`SyntaxError: Export named 'invocationResultFromSnapshot' not found`
（测试文件先于实现）。实现后 focused：

```text
bun test tests/invocation-result-projection.test.ts
8 pass / 0 fail / 22 assertions
```

## 门禁

- focused 8 文件（projection + harness + recovery + abort-boundary +
  invocation-result-durability + model-turn-partial + redaction + workflow
  writeback）：`74 pass / 0 fail / 308 assertions`——refactor 触及 abort/retry/
  result 恢复路径，全部绿。
- `bun run verify`：`396 pass / 0 fail / 1608 assertions`，58 test files；
  typecheck/build 通过。
- `bun run pack:smoke`：exit 0；prepack `396/0/1608`，113 files，package
  `129.7 kB`，unpacked `613.3 kB`；Bun/Node ESM consumers 通过（P2 吸收后两个
  consumer 都新增 `invocationResultFromSnapshot` 导入与 runtime 断言，public
  surface 变更按第六十一轮审计口径验证）。
- `git diff --check` 仅 Windows LF/CRLF warning。

## 未验证与保留边界

- 真实 NeuroBook/Cosmos consumer、真实 provider/tool、第三方 Store、HTTP/SSE
  Transport、浏览器/产品和生产验收仍未运行。
- 不提供跨进程终态等待/轮询原语（宿主按 Job 语义组合 snapshot + 本投影）；
  interrupted 按 Core 语义不投影为结果（宿主先用 Store 合同
  `reconcileInterrupted()` 收口再投影）。
- 下一轮候选：`forkSession` 原语（ADR-0002 预告的 defer，需定义 Core-owned
  kinds 复制/重写规则），或继续 Workflow/SSE/工具组合切片。

## 独立审查

- 只读独立审查（Ramanujan）逐字段比对公开函数与旧 private 实现：**No P0/P1
  findings**；terminal/waiting 分支与 `resultFromSnapshot`/`confirmedResult`
  等价（`sessionId` 改从 `snapshot.metadata` 取，Memory/JSONL 强制二者相等，
  无可观测漂移），refactor 对 abort/retry/result 调用方无影响，实跑 focused
  `74/0/308` 一致。
- P2 已吸收：README 措辞改为「与 durable 恢复结果同规则」（本地 handle 的
  aborted 结果按 ADR-0031 保留 cooperative error，durable 投影才 redact）；
  pack-smoke 的 Bun/Node consumer 补 `invocationResultFromSnapshot` 导入 +
  runtime 断言；公开 docstring 补 fail-closed 抛错路径声明；pack 尺寸按最终
  门禁更新。
