# 第七十七轮：跨进程 waiting 控制面证据（abort / approval 拒绝）

## 状态

第七十六轮收尾候选落地：跨进程 abort waiting 与 approval 拒绝的 worker 组合。
真实 Node ESM 子进程进入 durable waiting 后退出，主进程分别执行
`harness.abort` 与 `resume(approved: false)`，验证两条控制路径在进程边界外
正确收口。纯测试轮（无 `src/` 变更）；用户保护文件未纳入范围。

## 规划依据

- 第七十六轮 walkthrough 明示保留项：「未覆盖跨进程 abort waiting 与跨进程
  approval 拒绝（resolutions approved=false）的 worker 组合；两者由既有
  同进程套件覆盖」；本轮补齐。
- 复用 `tests/fixtures/waiting-resume-worker.ts`（子进程进入 durable waiting
  并输出 marker）与 `process-test-utils.ts` 公共工具，主进程侧驱动不同控制面。

## 变更

- 新增 `tests/waiting-control-process.test.ts` 2 条：
  1. **新进程 abort 另一进程的 durable waiting**：worker 进入 waiting 后
     退出 → 主进程 `harness.abort`（durable owner CAS 路径，模型不应运行，
     用 throw-model 钉死）→ snapshot idle、activeInvocationId null、
     invocation aborted、投影无 error（redaction）；
  2. **新进程拒绝 approval**：`resume(approved: false)` → Tool 不执行、
     以 isError "Rejected." 结果继续 → 模型回复 "after rejection" →
     completed；transcript 含 Rejected. 的 toolResult、不含 "approved run"
     （证明门控 Tool 未执行）。
- 本地 helper `runWaitingWorker` 复用 bundle/spawn/marker 公共工具，失败
  路径带 stdout/stderr 诊断。

## 门禁

- focused：`bun test tests/waiting-control-process.test.ts
  tests/waiting-resume-process.test.ts tests/fork-recovery-process.test.ts
  tests/approval.test.ts tests/abort-boundary.test.ts` → 实跑
  `23 pass / 0 fail / 120 assertions`（5 files）。
- `bun run verify`：`418 pass / 0 fail / 1735 assertions`，66 test files；
  typecheck/build 通过。
- `bun run pack:smoke`：未运行——本轮无 `src/` 变更，包内容与第七十三轮已
  验证状态一致。
- `git diff --check` 仅 Windows LF/CRLF warning。

## 结论

- 跨进程 waiting 恢复与控制面证据闭合：投影/resume（第七十六轮）、abort、
  approval 拒绝（本轮）全部由公开 API 表达，进程边界外无内存状态依赖。
- 与第七十五/七十六轮合并，完成态 + waiting 态 + 控制面三条进程边界证据。

## 未验证与保留边界

- 真实 NeuroBook/Cosmos consumer、真实 provider/tool、第三方 Store、
  HTTP/SSE 连接、浏览器/产品和生产验收仍未运行。
- 未覆盖跨进程 steer/follow-up 注入、跨进程双 Harness 并发 resume 竞争
  （后者由 recovery 套件同进程覆盖）；超时路径沿用 30s 兜底。

## 独立审查

- 只读独立审查（Averroes）：确认真实跨进程、abort 走 abortOnce durable 分支
  并被断言反向钉死（空转则 status 仍 waiting）、拒绝分支与
  `resolveApprovals` 三元短路一一对应、复用与隔离正确；focused/全仓数字实测
  一致。**No P0/P1 findings。**
- P2 已吸收：`runWorkerWithTimeout` 改为缓冲式收集 stdout/stderr，超时
  reject 附带已收集的部分输出（定位 worker 卡点）；resume 使用
  `marker.toolCallId`（测试自包含）；三轮重复的 bundle/spawn/marker 组装
  收敛为 `runWorkerFixture` 公共 helper（fork-recovery / waiting-resume /
  waiting-control 三个测试文件同步重构复用）。
