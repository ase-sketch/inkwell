# 第三十三轮：Cross-Harness follow-up admission

## 结论

本轮修复一个跨 Harness 的 durable truth 错位：`followUp()` 原来先检查当前进程的 `active` Map，因此只有持有 Model run 的 Harness 能排队。另一个 Harness 即使从同一 JSONL Session 读到明确的 active Invocation，也会错误拒绝。

实现没有增加公共 API 或 durable schema。admission 改为：

```text
read Session Snapshot
  → require activeInvocationId
  → validate payload
  → commit harness.followUp.queued
       expectedActiveInvocationId = observed owner
```

这样 running/waiting owner 都能从独立 Harness 接收 durable follow-up；owner 在 read 与 commit 之间 terminal 时，Store CAS 拒绝写入，不留下无法自动消费的孤立 queue item。

## 规划依据

### NeuroBook parity

只读对照发现：

- NeuroBook 已把 durable follow-up 作为 Session mutation/queue truth 处理，而不是只相信当前进程 run state；
- Task 111 仍记录更广的 busy `invoke()` admission TODO，但该问题需要新的 queue/result API，不应与本轮 bug fix 混合；
- NeuroBook 的 `deliveryId` 解决宿主交付幂等，但 delivery/exactly-once 明确不属于 standalone Core。

standalone 的具体缺口位于 `followUp()`：

```ts
if (!this.active.has(sessionId)) {
    throw new Error(...);
}
const snapshot = await this.store.read(sessionId);
```

`this.active` 只描述本 Harness 进程持有的运行态；`snapshot.activeInvocationId` 才是 Memory/JSONL/第三方 Store 的 durable owner。

### Cosmos 边界

Cosmos 只读审查没有证明需要新的 Harness Core API。当前 Profile、ModelRuntime、Capability、SessionStore、Invocation result 与 EventSubscription 已足够作为未来 Agent Action Adapter seam。Run/Step/Job/Lease/Outbox/idempotency、领域提交和 durable SSE 继续由 Cosmos 收口。

### 候选取舍

- **选择：Store-owner-based follow-up admission**。已有公开方法，能形成确定性跨 Harness red，不新增 schema。
- **拒绝：`queueIfBusy` invoke API**。会改变 `invoke()` 返回形态，并与现有 `followUp()` 重叠，需要单独公共合同。
- **拒绝：stable delivery key**。属于宿主 at-least-once delivery/idempotency，Goal 明确不把 delivery/exactly-once 下沉 Core。
- 一个 standalone 广审在时限内没有返回结论，不作为选型证据。

## TDD seam

本轮只通过以下公开边界观察：

- 两个 `NeuroAgentHarness` 实例；
- 两个指向同一 directory 的 `JsonlSessionStore`；
- `invoke()` / `followUp()` / `followUpState()` / `resumeFollowUps()` / `snapshot()` / `abort()`；
- Invocation handle result。

测试不读取私有 `active` Map，不调用 reducer、lock helper 或 `startNextFollowUp()`。延迟 Store 只作为公开 SessionStore 边界上的确定性竞态夹具。

## Red → green

初始 tracer：

1. Harness A 创建 Session 并启动阻塞 Model；
2. follow-up 自动 admission 先暂停，避免测试依赖后台时序；
3. Harness B 使用同一 JSONL directory 调用 `followUp()`；
4. 两端读取同一 queue，A 完成后由 B 恢复并消费。

基线：

```text
2 pass
1 fail
12 expect() calls

error: Session 1 没有 active Invocation
at followUp (.../src/harness.ts:271:52)
```

这排除了 payload、Profile、JSONL lock 或 queue projection 问题：失败精确发生在 Harness B 的本地 Map 检查。

最小实现：

```ts
const snapshot = await this.store.read(sessionId);
const activeInvocationId = snapshot.activeInvocationId;
if (activeInvocationId === null) {
    throw new Error(...);
}

await this.commit({
    target: sessionId,
    expectedActiveInvocationId: activeInvocationId,
    // existing queue entry
});
```

初始 green：

```text
3 pass
0 fail
19 expect() calls
```

## Post-green hardening

### Durable waiting owner

approval waiting 会 settle 当前 handle并移除本地 active run，但 Invocation 仍由 Store 的 `activeInvocationId` 持有。第二个 Harness 现在可以排队；测试随后取消 queue 并通过公开 `abort()` 终止 waiting owner。

### Read → commit terminal race

延迟 Harness B 的 `harness.followUp.queue` commit，期间让 Harness A 完成 Invocation。释放 commit 后：

- `expectedActiveInvocationId` 与当前 `null` 不匹配；
- `followUp()` 以 `InvocationOwnershipError` 失败；
- queue projection 保持空；
- Session 只有原 completed Invocation。

最终单文件：

```text
5 pass
0 fail
26 expect() calls
```

## Focused 验证

```text
bun test \
  tests/coordination.test.ts \
  tests/follow-up-admission-jsonl.test.ts \
  tests/follow-up-admission-race.test.ts \
  tests/follow-up-consume-recovery.test.ts \
  tests/message-identity.test.ts \
  tests/message-identity-legacy-jsonl.test.ts \
  tests/recovery.test.ts \
  tests/abort-boundary.test.ts

34 pass
0 fail
173 expect() calls
```

`bun run typecheck` 通过。全仓：

```text
bun run verify

179 pass
0 fail
888 expect() calls
Ran 179 tests across 38 files.
typecheck passed
build passed
```

`git diff --check` 通过，仅有受保护工作树文件和本轮文件的 LF/CRLF 转换提示。

本轮没有新增公开类型、导出、包入口或运行时依赖，因此没有重复 `pack:smoke`；最近一次第 32 轮 tarball smoke 不能替代本轮全仓证据，也不被记录成本轮运行。

## 审查

post-fix 独立只读审查限定检查 `src/harness.ts` 与 `tests/follow-up-admission-jsonl.test.ts`，覆盖：

- 本地 active Map 与 durable owner 的职责；
- running/waiting owner；
- read→commit terminal/owner-change race；
- transcript commit 与 follow-up ledger rebase；
- no-active、payload、identity、pause/cancel/reorder 与 consume/start 回归；
- Job/delivery/exactly-once 和跨进程 EventHub 边界。

结论：

```text
No P0/P1/P2 findings.
```

## 保持不变

- 无 active owner 时 `followUp()` 仍拒绝；
- payload 仍由 Session Profile 解析；
- caller/message identity 与旧 JSONL 默认值不变；
- queue ledger、pause/cancel/reorder、consume/start 原子 CAS 不变；
- running Invocation 对 follow-up ledger write 的 rebase 规则不变；
- 不引入 queue-if-busy `invoke()`、delivery key、exactly-once、跨 Session 事务、Job/Lease/Outbox、sidecar 或 SSE Transport。

## 未验证

- 两个真实 OS 进程同时调用 `followUp()`；当前证据是两个独立 Harness/JsonlSessionStore，共用第一方跨进程锁实现；
- 第三方 Store Adapter 对 `expectedActiveInvocationId` 的真实实现；
- 真实 NeuroBook/Cosmos consumer、真实 Provider/Tool；
- HTTP/SSE、浏览器、发布与生产；
- 宿主 delivery/idempotency 和 busy `invoke()` 的产品策略。

## 下一步

创建任务范围内本地 checkpoint，然后回到第三十四轮规划。
