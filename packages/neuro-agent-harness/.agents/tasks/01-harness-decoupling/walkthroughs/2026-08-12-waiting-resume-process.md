# 第七十六轮：跨进程 waiting 恢复与 resume 证据（真实子进程）

## 状态

第七十五轮收尾候选落地：waiting 跨进程恢复 + resume 的 worker 组合。真实
Node ESM 子进程进入 durable waiting 后退出，主进程仅凭公开 API 投影
waiting（含 `pendingApprovals`）、以 owner CAS resume 同一 Invocation 并完成，
再 fork 恢复后的会话继续。纯测试轮（无 `src/` 变更）；用户保护文件未纳入
范围。

## 规划依据

- 第七十五轮审查保留项与 walkthrough 明示：「waiting 跨进程恢复 + resume
  仍由既有 recovery/approval 套件（同进程 Store 实例）覆盖，未做 worker
  组合」；本轮补齐。
- 复用第七十五轮的 fixture/bundle/spawn 模式与超时/诊断加固经验。

## 变更

- 新增 `tests/fixtures/waiting-resume-worker.ts`：子进程用审批门控 Tool +
  ScriptedModelRuntime（toolCall）进入 waiting，stdout 输出
  `{"status":"worker-waiting",sessionId,invocationId,toolCallId}` 后 dispose
  退出。
- 新增 `tests/fixtures/process-test-utils.ts`（审查 P2-2 吸收）：抽出
  `bundleWorker` / `runWorkerWithTimeout`（单一时限 race、finally
  clearTimeout、超时 kill 后 await 退出再 reject，防 Windows 清理掩盖）/
  `parseWorkerMarker`，第七十五轮 fork 测试同步重构复用。
- 新增 `tests/waiting-resume-process.test.ts`：
  1. bundle + spawn Node 子进程，30s 单一时限 race（finally clearTimeout）；
  2. 主进程新 Store 实例 read + `invocationResultFromSnapshot` 投影 waiting
     （confirmed + durable `pendingApprovals[0].toolCallId === "call-1"`）；
  3. 主进程 `resume` 同一 Invocation（owner CAS claim）→ completed /
     "after approval"；终态投影、invocation id 与 toolResult 消息
     （"approved run" 实际执行）一致（审查 P2-1 吸收）；
  4. `forkSession` 派生恢复分支（parentSessionId 溯源、transcript 继承、
     零 Invocation）。

## 门禁

- focused：`bun test tests/waiting-resume-process.test.ts
  tests/fork-recovery-process.test.ts tests/recovery.test.ts
  tests/approval.test.ts tests/profile-version-approval-admission.test.ts`
  → 实跑 `21 pass / 0 fail / 111 assertions`（5 files）。
- `bun run verify`：`416 pass / 0 fail / 1725 assertions`，65 test files；
  typecheck/build 通过（fixture 过 tsc）。
- `bun run pack:smoke`：未运行——本轮无 `src/` 变更，包内容与第七十三轮已
  验证状态一致。
- `git diff --check` 仅 Windows LF/CRLF warning。

## 结论

- 跨进程 waiting 恢复闭环由公开 API 完整表达：durable waiting 状态跨进程
  存活、新进程投影 + owner CAS resume + 完成 + fork 继续，全程无 handle/
  内存状态依赖。
- 与第七十五轮合并后，进程边界证据覆盖完成态与 waiting 态两条恢复路径。

## 未验证与保留边界

- 真实 NeuroBook/Cosmos consumer、真实 provider/tool、第三方 Store、
  HTTP/SSE 连接、浏览器/产品和生产验收仍未运行。
- 未覆盖跨进程 abort waiting（`harness.abort` 在另一进程执行）与跨进程
  approval 拒绝（resolutions approved=false）的 worker 组合；两者由既有
  同进程套件覆盖。
- 超时路径沿用 30s 兜底，未做 kill 恢复断言。

## 独立审查

- 只读独立审查（Heisenberg）：确认真实跨进程、waiting 由 worker 物理落盘、
  resume 走 durable owner CAS（expectedVersion + expectedActiveInvocationId）、
  断言无空转无偷用、超时/诊断路径健壮；focused/全仓数字实测一致。
  **No P0/P1 findings。**
- P2 已吸收：终态补 toolResult "approved run" 实际执行断言与 invocation id
  核对；两轮 process 测试的 bundle/spawn/marker 公共逻辑抽取为
  `process-test-utils.ts`（含超时 kill 后 await 退出，防 Windows 上临时目录
  清理掩盖原始错误）。
