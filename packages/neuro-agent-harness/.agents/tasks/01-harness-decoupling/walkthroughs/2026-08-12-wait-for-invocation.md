# 第八十轮：waitForInvocation 有界等待原语

## 状态

第八十轮规划的双路只读调查（Kant/Gauss）确认：宿主侧仍重复编写「等待
Invocation 到终态」的有界轮询循环（coordination 8 行 × 2 处、follow-up-process
13 行），且跨进程/重启后没有 handle、唯一真相源是 Snapshot——终止判定语义
（running/interrupted/waiting/terminal 区分）是 Core 的投影知识，宿主容易写错。
本轮新增 `waitForInvocation` 纯读侧有界等待原语；`waitForFollowUpQueueDrain`
记录为下一候选。用户保护文件未纳入范围。

## 规划依据

- Kant 调查（证据，行号可复核）：`invocationResultFromSnapshot` 对
  running/interrupted/缺失返回 undefined，宿主必须自写 deadline+interval+
  投影循环并区分 interrupted（需 retry）与 waiting（需审批）；
  `tests/coordination.test.ts:124-129`（50×5ms 有界轮询，调用点 72/118）、
  `tests/follow-up-process.test.ts`（本轮重构前 13 行 deadline 循环）与
  invocation-ownership 的 retry 循环 + 第七十五至七十八轮四轮跨进程用例。
  判定「值得 Core 提供」：纯读侧、无副作用、不新增 Job/Lease/Heartbeat/Retry
  语义（ADR-0001 允许的 recovery + Workflow 组合原语）；第六十八轮「不新增
  跨进程等待/轮询语义」是针对轮询与映射绑定的表述，映射公开后按 focused
  证据重新评估成立。
- Gauss 调查：63-79 轮无「应吸收而未吸收」的遗留项，本轮无并行动作。

## 变更

- `src/harness.ts` 新增：
  - `WaitForInvocationOptions`（`timeoutMs` 必填正有限数、`signal?`、
    `pollIntervalMs?` 默认 25ms）；
  - `InvocationWaitTimeoutError`（携带 invocationId/timeoutMs/lastStatus）；
  - `waitForInvocation(sessionId, invocationId, options)`：以
    `invocationResultFromSnapshot` 为判据轮询 store.read；terminal 或
    waiting 返回，running/interrupted 继续；signal 中止以 reason reject；
    Session 缺失/Store 错误立即传播；`assertUsable` 每轮检查（dispose 后
    拒绝）。
- 新增 `tests/wait-for-invocation.test.ts` 7 条：已完成直接返回、等待进行中
  完成（gate release）、waiting 返回 pendingApprovals、超时携带最后状态、
  signal 中止、非法 options/Session 缺失、跨进程等待另一进程完成
  （复用 fork-recovery-worker fixture）；P2 吸收后补 dispose 中止与
  interrupted 至超时两条（共 9 条）。
- `tests/follow-up-process.test.ts` 的 13 行 deadline 循环重构为「发现
  follow-up Invocation id + `waitForInvocation`」。
- `scripts/pack-smoke.ts` Bun/Node consumer 补 `waitForInvocation` prototype
  与 `InvocationWaitTimeoutError` import/断言（首次运行暴露 import 清单缺
  error 类型，已修正）。

## 门禁

- focused：`bun test tests/wait-for-invocation.test.ts
  tests/follow-up-process.test.ts tests/fork-recovery-process.test.ts
  tests/coordination.test.ts` → `14 pass / 0 fail / 54 assertions`
  （4 files）。
- `bun run verify`：`428 pass / 0 fail / 1761 assertions`，68 test files；
  typecheck/build 通过。
- `bun run pack:smoke`：exit 0；prepack `428/0/1761`，113 files，package
  `135.1 kB`，unpacked `631.4 kB`；Bun/Node ESM consumers 通过（含新符号
  断言）。
- `git diff --check` 仅 Windows LF/CRLF warning。

## 结论与边界

- 跨进程/重启后的「等待旁路 Invocation 收口」现在由公开 API 表达，宿主无需
  自写轮询；running/interrupted/waiting/terminal 判定只存在于 Core。
- 不越 ADR-0001：无 Job/Lease/Heartbeat/Retry 语义；timeout 必填保证有界
  （宿主按业务选择上限）；`interrupted` 视为未终态（宿主需 retry/abort，
  文档明示）。
- 下一候选：`waitForFollowUpQueueDrain`（follow-up 链排空等待，paused 视为
  稳定态返回，是否继续等由宿主决定）。

## 未验证与保留边界

- 真实 NeuroBook/Cosmos consumer、真实 provider/tool、第三方 Store、
  HTTP/SSE 连接、浏览器/产品和生产验收仍未运行。
- 轮询是快照真相源上的公开模式；未引入事件驱动等待（宿主可按
  subscribe + snapshotRequired 自行组合）。

## 独立审查

- 只读独立审查（Franklin）：轮询语义正确（read → 判结果 → 判 deadline，
  无「完成却被抛超时」漏洞）、ADR-0001 边界一致（第六十八轮重评估成立）、
  公开合同与 pack consumer 一致、测试无 flaky（60ms 超时测试首轮必见
  running）。**No P0/P1 findings。**
- P2 已吸收：证据引用补精确行号（coordination 轮询存在且可复核）；
  补 dispose 中止与 interrupted 至超时两条测试；docstring/README 明示宽松
  超时上界与 interrupted 稳定态提示；pack 体积按最终门禁更新。
