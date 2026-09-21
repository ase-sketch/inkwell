# 第四十六轮：Harness Shutdown Join Barrier

## 规划取证

本轮三路只读规划比较：

1. `ToolResult.writePlans` 多计划逐项提交；
2. concurrent/reentrant `NeuroAgentHarness.dispose()` 与 injected Event Hub 关闭顺序；
3. NeuroBook/Cosmos/package 与其它普通 public lifecycle gap。

### Tool multi-plan

`writePlans` 当前只表示按顺序提交的独立 `SessionWritePlan[]`；Store 只承诺单 plan 内 operations 原子。plan 1 成功、plan 2 冲突时，plan 1 保留、Tool result 尚未持久化、Invocation 进入 failed，retry 可能再次产生 plan 1。

这是高置信 P2 API footgun，但不是已违反的数组级事务合同。同 Session 原子需求应先合并为单 plan；跨 Session transaction、自动 rebase、compensation、Outbox 与 exactly-once 不进入 Core。先补文档/行为边界，只有真实消费者要求 batch 时再建立 ADR。

### Store ownership

替代审查指出多个 Harness 共用可关闭 Store 时，一个 Harness `dispose()` 会调用 `store.dispose()`，可能影响其它 Harness。当前构造器要求显式 Store，`dispose()` JSDoc 又明确“releases the Store Adapter”；改变默认 ownership 会破坏现有清理预期。仓库只有共享 Memory Store/同目录独立 JSONL Store 的并发证据，没有 shared closable Store 的真实 consumer red。

该候选需要先决定 borrowed/owned Store、`ownsStore` 兼容默认或宿主 refcount，属于独立 lifecycle ADR，不混入本轮。

### Concurrent Harness dispose

当前实现只缓存 boolean：

```ts
if (this.disposed) {
    return;
}
this.disposed = true;
```

第一次调用继续等待 active Invocation completion boundaries、background、owned Event Hub 与 Store dispose；第二次调用立即 resolve。

公开 spike 使用延迟 `SessionStore.dispose()`：

```json
{
  "samePromise": false,
  "firstSettled": false,
  "secondSettled": true
}
```

普通宿主若有两个 shutdown caller，await 第二个结果后关闭 injected Event Hub，第一次 shutdown 仍可能执行 abort/forced terminal 的 durable commit 与 publication，从而触发已复现的 `event_hub_closed` post-durable ambiguity。这使此前看似“宿主提前关闭 Hub”的问题存在一个由 Harness 误导 completion 直接造成的合法入口。

## 选中范围

Canonical term：

```text
Harness Shutdown Barrier
```

合同：

- 首次 `dispose()` 同步关闭新 admission，并建立唯一 completion Promise；
- concurrent、repeated 和 abort-listener reentrant `dispose()` 返回同一个 Promise；
- barrier 等待已进入的 Invocation admission、既有 active Invocation completion boundaries、Harness background work、owned Event Hub close 和 Store dispose；
- Store dispose rejection 由所有 caller 观察同一个 rejection，不伪造某个 caller 成功；
- injected Event Hub 仍由宿主管理，但必须 outlive 所有使用它的 Harness shutdown barriers；
- 不等待被 forced completion fence 隔离的永不结束 raw Model/Tool Promise；
- 不增加 Hub lease/refcount、typed post-commit error、Store ownership flag、Job/Lease/Outbox 或 exactly-once。

## 为什么不建立 ADR

该变更只让重复调用真正 join 已有 `dispose()` 生命周期，复用本仓 `CommitWorkflowScheduler` 已接受的 deferred shared-Promise 模式。没有新公共类型、持久格式或不可逆技术选择。Store ownership、typed post-commit acknowledgement 与 Hub lease 仍需独立 ADR。

## TDD 顺序

Public seam 为 `NeuroAgentHarness.dispose()` 与注入 Adapter：

1. 延迟 `SessionStore.dispose()`：两次调用必须返回同一 Promise，第二个不能早于真实 cleanup 完成；
2. active Model 的 abort listener 重入 `dispose()`：reentrant caller 必须取得首次 barrier，证明 cache 在 abort 副作用前安装；
3. injected Event Hub + non-cooperative active Model：await 任一 concurrent barrier 后再关闭 Hub，forced terminal Snapshot 已确认且不发生迟到 Harness publication；
4. Store dispose rejection：所有 caller 共享同一 rejected barrier；
5. 复跑 owned/injected Event Hub、bounded abort、Workflow scheduler 与 Harness focused 回归。

每条先建立 public red，再做最小 vertical green；不读取 private `disposed`/`active`，不调用内部 abort helper。

## 计划验证

- focused：新 Harness shutdown、abort boundary、events、Workflow scheduler；
- `bun run typecheck`；
- `bun run verify`；
- `bun run pack:smoke`；
- `git diff --check`；
- 独立只读审查并回写发现。

## 未验证边界

- shared closable Store 的 borrowed/owned 生命周期；
- typed post-durable publication acknowledgement；
- 宿主违反 barrier 后提前关闭 injected Hub；
- 永不 resolve 的 third-party `SessionStore.dispose()`；当前 Store dispose 没有 abort/grace seam；
- 真实 NeuroBook/Cosmos shutdown composition、HTTP/SSE server close、进程 signal 和产品退出；
- 多进程 Event Hub、Outbox、delivery 与 exactly-once。

## 执行记录

### Slice 1：concurrent Store cleanup join

延迟公开 `SessionStore.dispose()`，第一次 Harness shutdown 已进入 Store cleanup 后再调用第二次 `dispose()`。formal red：

```text
Expected: first pending Promise
Received: different Promise

0 pass
1 fail
1 assertion
```

规划 spike 还证明第二个 Promise 已 settled，而第一个仍 pending。最小实现先安装 deferred `disposePromise` cache，再调用 `disposeOnce()`；因此 concurrent/repeated caller 取得同一对象，Store cleanup 只执行一次。

单条 green：

```text
1 pass
0 fail
4 assertions
```

### Slice 2：abort-listener reentry 与 compliant injected Hub choreography

非合作式 Model 注册同步 abort listener，并从 listener 内重入 `harness.dispose()`。测试同时从外部发起两个 shutdown caller：

- reentrant、first、second 三者是同一 Promise；
- `abortGraceMs=0` forced terminal 后 barrier 才 resolve；
- durable Snapshot 为 `idle + activeInvocationId=null + Invocation=aborted`；
- injected Hub 在 barrier 完成前交付 `agent_end(aborted)`，随后由宿主关闭。

这证明 cache 在 `AbortController.abort()` 的同步副作用前已安装，也证明宿主遵守“await 任一并发 barrier 后再关闭共享 Hub”的前置条件时，terminal publication 已在关闭前完成。Core 没有 Hub lease，不能阻止宿主在 barrier 期间违规关闭 injected Hub；测试不作这种过度承诺。

### Slice 3：Store cleanup failure

可控 Store 的 `dispose()` 抛固定 Error。first、concurrent second 和 terminal repeated caller：

- 都返回同一 cached Promise；
- 都观察同一 rejection；
- Store cleanup 只调用一次。

Harness 不把某个 caller 伪装为成功，也不在失败后隐式重试可能非幂等的 Store cleanup。

三条 shutdown 测试：

```text
3 pass
0 fail
15 assertions
typecheck: exit 0
```

## 实现

`NeuroAgentHarness.dispose()` 从 `async` boolean early-return 改为与 Scheduler 相同的 deferred barrier：

1. 首次调用创建并缓存 Promise；
2. cache 安装完成后启动私有 `disposeOnce()`；
3. `disposeOnce()` 同步设置 admission gate，再 abort active work；
4. resolve/reject 统一结算 cached Promise；
5. 后续任意 caller 原样返回该 Promise。

公开返回类型仍为 `Promise<void>`，没有新增 export、配置字段或持久格式。

## 首轮验证（审查修复前）

Focused：

```text
bun test \
  tests/harness-dispose.test.ts \
  tests/abort-boundary.test.ts \
  tests/events.test.ts \
  tests/workflow-scheduler.test.ts \
  tests/invocation-ownership.test.ts

65 pass
0 fail
213 assertions
```

完整门禁：

```text
bun run verify
253 pass
0 fail
1240 assertions
```

Package：

```text
bun run pack:smoke
exit 0
109 files
111.0 kB package
530.7 kB unpacked
Bun and Node ESM consumers passed
```

`git diff --check` exit 0。

这些数字只证明 shared Promise 的首轮实现；后续 admission/follow-up hardening 修改了生产代码和测试，不能作为本轮最终 acceptance 证据。最终 focused/full/package 数字必须在 post-fix review 后重新生成。

## 独立审查

首轮 lifecycle review 发现 P1：public `invoke()` 已进入但停在异步 Store read/commit 时尚未注册到 `active`，旧 barrier 会快照空集合并提前完成。delayed-read formal red 在完整清理后得到：

```text
settledBeforeRelease:
Expected false
Received true

0 pass
1 fail
```

实现新增 invocation admission tracking。`start()` 在任何异步工作前把 Promise 加入集合；shutdown 循环先 abort 当前 active，并同时等待 active results 与 admissions。admission 若随后注册 active，下一轮再次捕获并 abort；只有 active/admission 清空后才等待 background，background 可能产生的新 work 会回到循环复核。

同一审查的 P2 指出 injected Hub 测试只证明 compliant host choreography，没有强制 Hub lease；walkthrough 的表述已收窄为宿主生命周期前置条件。

boundary review 另发现 P1：已进入 `startNextFollowUp()`、停在 `store.read()` 的 background task 可在 shutdown 后继续启动新 Invocation。下一 slice 建立独立 public red 后修复。

follow-up fixture 让首个 Invocation completed 后的 queue admission 停在 `store.read()`，随后开始 shutdown。invocation admission tracker 已阻止新 active，但 `start()` 的 disposed rejection 被 background catch 投影成 `follow_up_error`。formal red：

```text
Expected host events not to contain "follow_up_error"
Received ["follow_up_error", "test.sentinel"]

0 pass
1 fail
5 assertions
```

`startNextFollowUp()` 现在在异步 read 后复核 shutdown gate并正常返回 `null`。queue 保留 queued、没有 consumed、新 active 或伪造 host error；这条路径不依赖异常控制流。

### Post-review Slice 4：approval resume admission

同类审计继续追到 public `resume()`：调用已经通过入口的 `assertUsable()`，但可能在 claim 前的 `store.read()` 停住；此时它既不在 `active`，也没有被首版 invocation admission tracker 覆盖。shutdown 会提前完成并释放 Store，随后 resume 仍可能提交 durable running owner。

延迟公开 Store read 的 formal red：

```text
settledBeforeRelease:
Expected false
Received true

0 pass
1 fail
```

`resume()` 现在与 `start()` 共用 invocation admission tracker，并把既有实现拆为 `resumeOnce()`；tracker 在任何异步 Store 工作前注册，成功或失败后都释放。barrier 先等待该 admission；若它建立 active Invocation，下一轮 drain 会观察并 abort。

定向 green 与当前 shutdown 文件：

```text
bun test tests/harness-dispose.test.ts --test-name-pattern "approval resume admission"
1 pass
0 fail
4 assertions

bun test tests/harness-dispose.test.ts
6 pass
0 fail
27 assertions

bun run typecheck
exit 0
```

最终 focused、`bun run verify`、`bun run pack:smoke` 与 post-fix review 仍待执行。

### Post-review Slice 5：public resumeFollowUps admission

独立 post-fix reviewer 继续发现 P1：公开 `resumeFollowUps()` 通过入口 gate 后可能停在 `followUpState()` 的 Store read。首版 tracker 只覆盖 `start()` 与 approval `resume()`，因此 barrier 可先释放 Store/EventHub；迟到调用随后仍会提交 `harness.followUp.resume`，再在 publication 路径触发已关闭生命周期。

公开延迟 read 的 formal red 没有只停在 timing assertion，而是直接观察到迟到路径：

```text
error: NeuroAgentHarness 已 dispose
at followUpState
at publishFollowUpState
at resumeFollowUps

0 pass
1 fail
```

测试同时要求 barrier 在 read release 前保持 pending、调用正常返回 `null`、Session 仍无 active owner，并且最后一条 durable paused fact 仍为 `true`。

最小实现把 `resumeFollowUps()` 拆为同步 gate/tracker 与 `resumeFollowUpsOnce()`；generic invocation admission tracker 覆盖这个“可能启动 Invocation”的入口，并在首个异步 read 后复核 shutdown gate。已经开始 commit 的普通 public mutation 不在本轮扩展范围。

定向 green：

```text
bun test tests/harness-dispose.test.ts --test-name-pattern "public resumeFollowUps admission"
1 pass
0 fail
5 assertions

bun run typecheck
exit 0
```

同一 review 的 P2 指出 injected Hub 测试只能证明 compliant host choreography，不能强制宿主关闭顺序；Slice 2 和合同表述已同步收窄。shared Store ownership、typed acknowledgement 与故意提前关闭 Hub 继续是独立边界。

### Post-review Slice 6：reentrant follow-up payload validation

第二次独立复审确认没有 P0/P1，但指出一个 P2：`startNextFollowUp()` 的 shutdown recheck 与 tracked `start()` 之间还有一次冗余 Profile payload validation。普通 JavaScript 不会在同步语句之间被抢占；真正可复现的窗口是宿主 validator 自身同步重入 `dispose()`。

公开 Profile seam 的 formal red 让 follow-up payload validator 重入 shutdown，随后从 injected Hub 读取到：

```text
Expected host events not to contain "follow_up_error"
Received ["follow_up_error", "test.sentinel"]

0 pass
1 fail
2 assertions
```

`start()` 内本来就会在 durable start commit 前校验同一 payload。最小实现删除 `startNextFollowUp()` 外层的重复校验，使唯一 validator 调用发生在 tracked admission 内；非法 payload 仍在任何 durable consume/start 前失败，reentrant shutdown 则由 barrier 捕获并收口已进入的 admission。

定向 green：

```text
bun test tests/harness-dispose.test.ts --test-name-pattern "payload validation 重入 dispose"
1 pass
0 fail
2 assertions

bun run typecheck
exit 0
```

最终 focused/full/package 与窄 post-fix review 需在该生产变更后再次生成。

### Final review：admitted work 与 post-barrier work

final reviewer 一度把 validator 重入 shutdown 后继续完成 durable follow-up start 评为 P1。该判断与本轮已经由 delayed public `invoke()` 锁定的合同不一致：调用通过入口 gate 后属于已进入 admission，可以完成不可取消的 Store start commit，但必须在 barrier 内注册 active、被 abort，并在 barrier 完成前结束全部 Harness publication。

测试因此增加 gated follow-up start Store：

- validator 同步调用 `dispose()` 后，start commit 保持 pending；
- commit 未 release 时 shutdown barrier 仍 pending；
- release 后最终 Snapshot 为首个 Invocation completed、follow-up Invocation aborted、active owner 为 null；
- `harness.followUp.consumed` 已 durable，`follow_up_started` 在 barrier 后发布的 sentinel 之前已交付；
- 没有 `follow_up_error` 或 barrier 之后的 Harness mutation/publication。

这也证明 `disposeOnce()` 的首个 `await Promise.allSettled()` 会让出微任务，`start()` 在 barrier continuation 前把 admission 加入集合；后续循环捕获新 active。基于明确合同和该公开证据，独立 final review 返回：

```text
No P0/P1/P2 findings.
```

## 最终 acceptance

最终 focused：

```text
bun test \
  tests/harness-dispose.test.ts \
  tests/abort-boundary.test.ts \
  tests/events.test.ts \
  tests/workflow-scheduler.test.ts \
  tests/invocation-ownership.test.ts \
  tests/approval.test.ts \
  tests/coordination.test.ts

78 pass
0 fail
284 assertions
```

完整门禁：

```text
bun run verify
258 pass
0 fail
1264 assertions
41 test files
typecheck and build passed
```

Package：

```text
bun run pack:smoke
exit 0
109 files
111.5 kB package
533.3 kB unpacked
Bun and Node ESM consumers passed
```

`git diff --check` exit 0。第四十六轮在 standalone Harness shutdown lifecycle 范围接受；没有新增 public export、持久格式或 ADR。

仍未验证：

- shared closable Store 的 borrowed/owned 生命周期；
- 普通 public `createSession()` / `write()` / queue control / read API 的全量 in-flight drain；
- typed post-durable publication acknowledgement 与故意提前关闭 injected Hub；
- 永不 resolve 的 third-party `SessionStore.dispose()`；
- 真实 NeuroBook/Cosmos shutdown、HTTP/SSE server close、process signal 和产品退出；
- 跨进程 Event Hub、Outbox、delivery 与 exactly-once。
