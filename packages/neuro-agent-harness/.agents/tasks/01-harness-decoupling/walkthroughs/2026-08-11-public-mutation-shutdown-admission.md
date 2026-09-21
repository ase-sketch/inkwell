# 第四十七轮：Public Mutation Shutdown Admission

## 状态

已收口。public mutation、observer/reporter 和 follow-up rebase 实现、post-review focused、完整门禁与 package smoke 均已通过；最终 production/tests 与文档独立复审无 P0/P1/P2，ADR-0026 已接受，本提交构成本轮精确本地 checkpoint。

## 规划取证

第四六轮 Harness Shutdown Barrier 已等待：

- Invocation start / approval resume / public `resumeFollowUps()` admission；
- active Invocation completion；
- automatic follow-up background；
- owned Event Hub close；
- Store dispose。

它没有等待普通公开 Store mutation。三路只读规划从 lifecycle、API/ownership 和 NeuroBook/Cosmos consumer 边界得到同一高优先级候选；第四路 priority planner 因服务过载没有形成结论。

最小真实窗口是 public `write()`：

1. 调用已通过 `assertUsable()`，停在不可取消的 `store.commit()`；
2. `dispose()` 看不到该操作，关闭 owned Event Hub、释放 Store并完成；
3. commit 随后 durable；
4. `publishDurableCommit()` 才发现 Hub 已关闭，或在 injected Hub 上形成 barrier 后事件；
5. 调用者可能得到失败，但 Store 已经包含事实。

相同类别还包括 `createSession()`、durable follow-up admission/control、无本地 active owner 的 `abort()`，以及 read 后可能写入 active queue 的 `steer()`。`snapshot()` / `followUpState()` 是只读 residual；`subscribe()` 同步返回句柄且已有 owned/injected Hub 合同，本轮不机械纳入 drain。

NeuroBook Product shutdown 会先 drain HTTP lease，再 dispose Harness，降低真实请求撞上该窗口的概率，但不能替 standalone Harness 提供正确性。Cosmos Phase 1 仍直接使用 `pi-ai`，没有真实 Harness shutdown consumer；不据此扩张 Job/Lease/Workflow/Outbox/delivery。

## 决策

采用 operation admission，并以副作用边界区分“完成”与“停止”：

| Public 入口 | shutdown admission | shutdown 后行为 |
| --- | --- | --- |
| `createSession()` | 整个 create + replay-safe Snapshot | 已进入 Store create 则完成；validator 后尚未 create 则停止 |
| `write()` | commit + observer + durable publication | 已进入 commit 则在 barrier 内完成 |
| `steer()` | read + validation + active queue/event | read/validation 后 recheck；不向已终止 active queue 写入 |
| `followUp()` | read + validation + owner-CAS commit/event | mutation 前 recheck；已进入 commit 则完成 |
| pause/cancel/reorder | control commit/state publication | read 型 control 可停止；已进入 commit 的 pause 完成 |
| local/durable `abort()` | active completion 或 durable owner-CAS | read 后 shutdown 不新增 terminal fact |
| invoke/resume/resumeFollowUps | 延续第四六轮 admission | start/claim boundary 在 barrier 内收口 |
| `snapshot()` / `followUpState()` | 不纳入 | pure read 不承诺 drain |

async commit observer 若重入并等待 `dispose()`，Core 在 shutdown 开始后不再让该外部 Promise 阻塞 durable publication；迟到 rejection 仍被观察并交给 `onObserverError`。这避免：

```text
dispose waits operation
operation waits observer
observer waits dispose
```

普通无 shutdown 路径仍等待 observer，不改变 materialized-view / Workflow callback 的立即一致性。

最初计划把本轮视为第四六轮的内部扩展，不建立 ADR。独立 docs review 指出这已经冻结 `dispose()` 与多个 public mutation 的稳定跨 Task 生命周期行为；按 `docs/tasks/README.md` 的公共合同规则重新判断后，建立 [ADR-0026](../../../adr/0026-harness-shutdown-admission.md)。all-public read drain、Store ownership/lease 与 typed post-durable acknowledgement 仍需独立证据。

## Public TDD

测试只穿过 `NeuroAgentHarness` 公共 API，以及注入的 `SessionStore`、`SessionEventHub` 和 `SessionCommitObserver`；不读取 private admission 集合。

### Slice 1：delayed public write

可控 Store 让 `write()` 停在 `store.commit()`。旧 barrier 在 commit release 前完成：

```text
Expected: false
Received: true

0 pass
1 fail
1 assertion
```

public write 加入 shutdown admission 后，`session_entry` 位于 barrier sentinel 前：

```text
1 pass
0 fail
3 assertions
```

### Slice 2：async observer/reporter reentrant dispose

observer 先让出一个 microtask，再调用并等待 `harness.dispose()`。只增加 write admission 会形成：

```text
error: observer-admitted write 超时

0 pass
1 fail
```

Harness 现在用内部 shutdown-start signal 竞争外部 callback Promise。shutdown 赢时继续 durable publication、释放 operation admission，再完成 barrier；外部 observer 在 barrier 后自行结束。额外回归覆盖：

- 迟到 observer rejection 仍进入 `onObserverError`；
- `onObserverError` 自己重入并等待 shutdown 也不阻塞 publication；
- 没有 shutdown 时，public write 仍等待 async observer。

### Slice 3：delayed createSession 与 validator reentry

可控 Store 让 `createSession()` 停在 `store.create()`。旧实现 create durable 后调用 public `snapshot()`，得到：

```text
error: NeuroAgentHarness 已 dispose
at snapshot

0 pass
1 fail
```

create admission + internal `snapshotOnce()` 后为 1/0/3。initial validator 同步重入 shutdown 时，第二次 gate 拒绝后续 Store create，`createCalls = 0`。

### Slice 4：steer / follow-up / control / abort

- delayed `steer()` read 在 shutdown 后拒绝，不写 active queue、不发布 `steer_queued`；
- steer payload validator 重入 shutdown 后同样不写 queue；
- delayed `followUp()` read 在 owner-CAS commit 前停止，不追加 `harness.followUp.queued`；
- delayed pause commit 在 barrier 内完成并发布 `follow_up_state`；
- delayed cancel/reorder read 在 shutdown 后停止，不追加 cancelled/ordered fact；
- durable abort read 在 shutdown 后停止，不 terminalize 外部 active owner，也不发布 `agent_end`；
- `abort()` dispose 后仍保持 async rejected Promise 边界。

自动 follow-up read、payload validator、public `resumeFollowUps()` 和 approval `resume()` admission 延续第四六轮回归，均不越过 barrier。

## 诊断绕道：连续 follow-up rebase

首次完整门禁暴露：

```text
SessionConflictError:
Session 1 version 冲突：expected=2, actual=3
```

active transcript 第一次追上 queue ledger 后，`pauseFollowUps()` 在 terminal commit 前再次推进 version。旧 `commitMessages()` / `finish()` 只允许一次 follow-up rebase，因此纯 `harness.followUp.*` 连续写入会让本应 completed 的 Invocation 失败。

修复增加有界 `commitWithFollowUpRebase()`：

- transcript commit 与 terminal finish 共用同一算法；
- 最多尝试 3 次；
- 每次 conflict 后读取最新 Snapshot；
- 只允许相对当前 Snapshot 的纯 `harness.followUp.*` 追加，且 durable active owner 必须仍为同一 Invocation；
- 非 follow-up 变化、owner 变化或第三次仍冲突继续 fail closed。

首版回归在 model release 前连续完成 queue 与 pause；rebase reviewer 指出两次 ledger write 会被同一次 latest Snapshot 同时吸收，旧“一次 rebase”也可能通过。返修后的 Store gate 精确控制每一次 `harness.transcript.commit`：

```text
attempt 1 gated → public followUp queue → release → conflict
attempt 2 gated → public pause → release → conflict
attempt 3 → success
```

把 `MAX_FOLLOW_UP_REBASE_ATTEMPTS` 临时降为 2 的 mutation red：

```text
Expected: "completed"
Received: "failed"

0 pass
1 fail
1 assertion
```

恢复 3 后，单文件同时覆盖：

- 两次连续纯 follow-up conflict 后 completed；
- 第三次 conflict 时有界 failed，并保留 `SessionConflictError`；
- unrelated Session entry conflict 不 rebase，原事实保留且 assistant message 不提交；
- consume commit 后 start 失败仍可恢复 queue。

结果为 4/0/12；四测试反馈环 10 次为 40/0/120。

## 独立审查与返修

首轮与 post-fix review 输出：

- API reviewer：`No P0/P1/P2 findings.`
- lifecycle reviewer：报告一个 P1，认为 `*Once()` 在 admission 登记前同步触发 `dispose()` 会让 barrier 看见空集合并提前关闭资源。
- tests/docs reviewer：1 个测试 P1、3 个 P2。
- 首次 rebase reviewer 服务过载；最终重跑发现上述“首版连续 rebase 回归可 false-pass”的 P2，已按 attempt gate、exhaustion 和 unrelated mutation 三类 public regression 修复。
- 最终 lifecycle reviewer 基于同步 Store callback 回归和 live-Set 时序返回 `No P0/P1/P2 findings.`
- 最终 tests/docs reviewer 复跑相关 tests 10 次为 250/0/970，唯一 P2 是 ADR acceptance gate 文字可能被读成“审查已经完成”；现在显式区分 acceptance criteria 与当前状态。
- 最新 postfix 窄复审中 lifecycle 与 JSONL 返回 `No P0/P1/P2 findings.`；rebase reviewer 没有发现新的实现/测试错误，只指出 Task/Walkthrough 同时写“最终审查已绿”和“尚未完成最终审查”的文档 P2；contracts reviewer 只指出 tracked `git diff --check` 没有覆盖 untracked ADR-0026 与本 walkthrough 的证据 P2。
- 修正并暂存精确 checkpoint 后，最终 production/tests reviewer 返回 `No P0/P1/P2 findings.`。acceptance docs reviewer 只留下 3 个文档 P2：Task 与本 walkthrough 的 package 数字仍是前一次运行值，以及 ADR gate 没有显式要求 staged checkpoint 检查。三项现已修正。
- 修正后的最终文档窄复审返回 `No P0/P1/P2 findings.`；ADR-0026 已在 standalone Harness shutdown-admission scope 接受，本轮收口。

### Lifecycle P1 的公开复核

按 reviewer 指定 seam 增加 Store：其 `commit()` 在返回 Promise 前同步调用 `harness.dispose()`，宿主在 barrier 后关闭 injected Event Hub。当前实现直接得到：

```text
1 pass
0 fail
3 assertions
settlement order: write → shutdown
```

原因是 `disposeOnce()` 对 admission snapshot 的 `Promise.allSettled()` 必然让出当前 job，并在关闭资源前重新检查 live `shutdownAdmissions` Set；同步 callback 返回后 wrapper 已完成登记，barrier 会回环等待。该 finding 没有形成 production red，因此不按猜测改成 placeholder/thunk。保留公开回归并在 tracker 旁记录这条非显然时序；其后最终 lifecycle reviewer 已基于该证据返回 `No P0/P1/P2 findings.`

### 测试与文档 finding

固定 10ms `Promise.race` 确有 false-pass 风险，已全部替换为 event-loop task checkpoint；test gate 自身仍由 `bounded()` 提供 liveness timeout，但 correctness 不依赖经过毫秒数。临时让 `write()` 绕过 admission 的 mutation check 稳定得到：

```text
Expected: "checkpoint"
Received: "settled"

0 pass
1 fail
1 assertion
```

恢复 admission 后定向 green 为 1/0/3。`bounded()` 现在在 `finally` 清理 timer。

Task README 的过时“剩余 public TDD”状态已改写；ADR threshold finding 通过 ADR-0026 处理。

## 当前验证

- `bun test tests/harness-dispose.test.ts`：21 pass / 0 fail / 83 assertions。
- post-P2 `tests/follow-up-consume-recovery.test.ts`：4 pass / 0 fail / 12 assertions。
- post-P2 follow-up rebase feedback loop 10 次：40 pass / 0 fail / 120 assertions。
- post-P2 13-file shutdown/observer/follow-up/approval/ownership/publication focused：111 pass / 0 fail / 447 assertions。
- JSONL/Memory/recovery focused：38 pass / 0 fail / 232 assertions。
- `bun run typecheck`：exit 0。
- `bun run verify`：275 pass / 0 fail / 1321 assertions，41 files，typecheck + build 通过。
- `bun run pack:smoke`：exit 0；prepack 同为 275/0/1321，109-file tarball 为 113.7 kB / 544.1 kB unpacked，Bun/Node 安装与 consumer 通过。
- 精确 checkpoint 暂存集合为 14 个文件，包含 ADR-0026 与本 walkthrough；`git diff --cached --check`：exit 0。`docs/architecture.md`、`docs/pi-adapter-design.md` 与 `tests/context.test.ts` 三个受保护工作树文件与暂存集合交集为 0。

## Package gate 绕道：JSONL recovery test ordering

post-P2 首次 package smoke 的 prepack 第二次全仓运行出现：

```text
SessionConflictError:
Session 1 version 冲突：expected=1, actual=2

274 pass
1 fail
1314 assertions
```

失败测试想证明“reconciliation 已读 version 1 后，独立 Store 先写 version 2，reconciliation 再刷新重试”，但旧编排只是同时启动两个 Promise。若 reconciliation 先获得 lock 并 terminalize 到 version 2，随后失败的是仍要求 version 1 的 concurrent write；测试把竞争胜序误当成前提。

诊断反馈环：

- 单进程 targeted 50 次为 50/0，尚不足以复现；
- 四个独立进程各 200 次，在 contention 下分别出现 3、6、2、5 次相同 conflict；
- 测试 Store 现在只在首次 `store.reconcileInterrupted` commit 进入真实 JSONL Store 前 gate，确认独立 write 已 durable version 2 后再释放；
- 把 `MAX_RECONCILIATION_ATTEMPTS` 临时降为 1 时，确定性得到同一 conflict red；
- 恢复生产上限 3 后 targeted 100/0，原四路 contention 共 800/0；
- JSONL/Memory/recovery focused 38/0/232，最终 full/package 均通过。

没有修改 recovery 生产代码；修复的是 round 45 public test 的因果编排。未保留 debug instrumentation。

## 未验证边界

- pure read API 的 Store ownership/drain；
- shared closable Store ownership或 resource lease；
- 永不结束、或在自身 operation 内等待 Harness barrier 的 third-party Store；
- Host 违反合同提前关闭 injected Event Hub；
- typed post-durable acknowledgement；
- 真实 NeuroBook/Cosmos shutdown、HTTP/SSE、process signal 和产品退出；
- 跨进程 Event Hub、Outbox、delivery 与 exactly-once。

## 收尾结果

- production/tests 最终 reviewer：`No P0/P1/P2 findings.`
- 修正 package 数字与 staged-check gate 后的最终文档 reviewer：`No P0/P1/P2 findings.`
- ADR-0026、ADR index、Task/TODO 与本 walkthrough 已切到 Accepted/已收口状态；本提交构成本轮精确本地 checkpoint。
- 下一步回到第四十八轮规划；本轮未验证边界继续保留，不从 standalone acceptance 外推真实 NeuroBook/Cosmos 或 Transport/Product acceptance。
