# 第三十四轮：Follow-up control CAS

## 结论

`cancelFollowUp()` 与 `reorderFollowUps()` 现在把“item 仍 pending / IDs 仍是 exact permutation”从 read-time 检查提升为 Store commit CAS。队首 admission 若先提交，迟到控制请求会明确冲突，不再返回与事实相反的成功结果。

本轮没有新增公共类型、ledger kind 或 Store operation，只给既有 control plan 增加 observed `expectedVersion`。

## 缺口

第三十三轮已经保证 queue admission 使用 durable owner，但控制面仍是：

```text
read follow-up state
  → validate item/permutation
  → concurrent startInvocation + consumed may commit
  → append cancelled/ordered without CAS
  → projection filters consumed ID
  → API returns success
```

最终 queue projection 看似合理，却丢失了调用方最关心的事实：取消或重排是否在 item 启动前获胜。

### Cancel

旧实现确认 item 存在后，无条件追加 `harness.followUp.cancelled`。如果 admission 已先消费该 item，cancel entry 是 no-op，但返回值无法告诉调用方 Agent 已经启动。

### Reorder

旧实现只在 read 时检查 `itemIds` 是 exact permutation。admission 先消费队首后，projector 会过滤旧 ID 并保留剩余项；reorder 返回成功，却没有应用调用方观察到的那组 permutation。

## 边界选择

- cancel/reorder 依赖精确 pending item 集，使用 Snapshot `version` CAS；
- `pauseFollowUps()` / `resumeFollowUps()` 是最后命令优先的 boolean 状态，不依赖 item permutation，本轮不改；
- full Session version 可能因其它并发写入冲突，这是当前没有 queue-specific revision 时的 fail-closed 代价；调用方可以在新 Snapshot 上重试；
- 不增加 queue revision、自动 retry、delivery key、exactly-once 或 busy invoke 返回形态。

## TDD seam

测试只使用：

- 公开 `NeuroAgentHarness` queue/control/resume/snapshot API；
- 第一方 `MemorySessionStore` 的公开 Adapter contract；
- `ScriptedModelRuntime` 作为外部 Model 边界；
- 延迟 control commit 的 Store fixture。

测试不调用私有 `startNextFollowUp()`，也不直接编辑 queue ledger。

## Cancel red → green

顺序：

1. 初始 Invocation running 时 queue A 并暂停；
2. 初始 Invocation 完成；
3. `cancelFollowUp(A)` 读到 A 后冻结 commit；
4. `resumeFollowUps()` 先提交 `startInvocation(A) + consumed(A)`；
5. 释放 stale cancel。

基线：

```text
2 pass
1 fail
10 expect() calls

Expected promise that rejects
Received promise that resolved
```

实现让 cancel 从同一个 Snapshot 投影 queue，并提交：

```ts
{
    expectedVersion: snapshot.version,
    cause: "harness.followUp.cancel",
    // existing cancelled entry
}
```

green：

```text
3 pass
0 fail
11 expect() calls
```

## Reorder red → green

第二个 tracer queue A/B，并在 `reorderFollowUps([B, A])` read 后让 admission 先 consume A。基线：

```text
3 pass
1 fail
13 expect() calls

Expected promise that rejects
Received promise that resolved
```

reorder 使用同样的 Snapshot `expectedVersion` 后：

```text
4 pass
0 fail
14 expect() calls
```

冲突时剩余 queue 仍是 B；已启动 A 的 Invocation 不被迟到控制 entry 改写。

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

36 pass
0 fail
179 expect() calls
```

`bun run typecheck` 通过。全仓：

```text
bun run verify

181 pass
0 fail
894 expect() calls
Ran 181 tests across 38 files.
typecheck passed
build passed
```

`git diff --check` 通过，仅有 Windows LF/CRLF 转换提示。

本轮没有公共类型、导出、包入口或依赖变化，因此不重复 `pack:smoke`。

## 审查

post-fix 独立只读审查限定检查 `src/harness.ts`、`tests/follow-up-admission-race.test.ts` 与相关既有 follow-up 合同，重点核对：

- admission-first 时 stale cancel/reorder fail closed；
- control-first 时旧 admission 仍以 Snapshot CAS 失败；
- full Session `expectedVersion` 冲突不产生部分 entry；
- Memory/JSONL、identity、pause/resume 与 consume/start 不回退；
- 延迟 Store fixture 确实冻结 read 后、control commit 前的窗口；
- 不暗示 queue revision、自动重试、delivery/exactly-once 或 Job 语义。

结论：

```text
No P0/P1/P2 findings.
```

## 保持不变

- cancel 仍要求目标 item 在 observed queue 中存在；
- reorder 仍要求 IDs 是 observed queue 的 exact permutation；
- control commit 成功后的返回值仍是最新 durable projection；
- admission 的 `startInvocation + consumed` 原子提交不变；
- JSONL lock、message identity、pause/resume、follow-up owner CAS 与 recovery 不变；
- 不承诺宿主 delivery/exactly-once 或跨进程 EventHub。

## 未验证

- 高频 transcript 写入下用户是否需要自动重试 control conflict；
- queue-specific revision 是否比 full Session version 更合适；当前没有证据值得增加 durable schema；
- 第三方 Store Adapter、真实 NeuroBook/Cosmos consumer、真实 Provider/Tool；
- HTTP/SSE、浏览器、发布和生产。

## 下一步

创建本地 checkpoint并回到第三十五轮规划。
