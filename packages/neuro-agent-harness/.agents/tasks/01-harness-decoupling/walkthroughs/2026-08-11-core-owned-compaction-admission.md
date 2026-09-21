# 第六十二轮：Core-owned `agent.compaction` admission

## 状态

Core-owned admission、Store commit cancellation fence 与 recovery 修复已实现；post-fix full/package/独立 acceptance review 已完成，准备创建本地 checkpoint。本轮只修改 `neuro-agent-harness`；用户已有的 `docs/architecture.md`、`docs/pi-adapter-design.md` 与 `tests/context.test.ts` 未纳入范围。

## 规划依据

- 测试缺口审查通过 public `harness.write()` 复现：shape-valid `agent.compaction` 可以被宿主追加；随后 transcript projection 会把旧 durable transcript 隐藏。
- `CONTEXT.md` 已声明 Core-owned Entry 不能由 public write/effect 伪造，但此前 admission 只覆盖 `harness.followUp.*`、`harness.invocation.usage` 与 `harness.invocation.partial`。
- `agent.compaction` 是 Core 解释的 transcript projection fact；它不是普通宿主扩展，也不应被泛化成整个 `harness.*` namespace。
- 不存在 `parentId` 的引用校验是同一审查发现的另一个 P1，本轮只记录并保留为下一候选，避免把两个持久化约束混成一个切片。

## 变更

- 新增 private `allowCompactionFact` commit option；只有 Harness 内部 `harness.compaction` 路径可以使用。
- 新增 exact-plan guard：只接受当前 Invocation、`cause: "harness.compaction"`、单一 `agent.compaction` append entry；generic `write()` 和 `commitWritePlans()` 均拒绝。
- abort 请求先 durable 写入 `SessionStatus: "aborting"`；Store reducer 在 overlay 下拒绝普通迟到计划，只允许显式 status transition 或当前 owner 的 aborted terminal。
- `SessionStore.commit()` 新增 runtime-only `SessionCommitOptions.signal`；Harness 把 active Invocation signal 传给 Invocation-owned commit，Memory/JSONL 在最终 durable write 前 fail closed。新增 `SessionCommitAbortedError` 与 `assertSessionCommitNotAborted()`。
- `reconcileInterruptedSession()` 对 `aborting + running/waiting` 的 active owner 收口为 `aborted`；普通 `running` owner 仍恢复为 `interrupted`。
- `CONTEXT.md` 补充 `agent.compaction` Core-owned 约束。
- 新增 `tests/core-owned-entry-admission.test.ts`：
  - public `write()` 不能伪造 compaction projection；
  - Profile `beforeTurn` effect 不能通过 shared write-plan path 伪造 compaction；
  - reducer 已通过、同 Session commit lock 保持、durable append 前 abort 时不落盘 compaction；
  - 既有 `tests/compaction.test.ts` 继续证明正常内部 compaction 可提交。
- 新增 ADR-0034；未修改 NeuroBook/Cosmos，未改变 durable Entry/Snapshot shape。

## TDD 证据

初始 public red：

```text
bun test tests/core-owned-entry-admission.test.ts
0 pass / 1 fail / 1 assertion
```

旧实现接受 forged `agent.compaction`，所以“promise 应 reject”断言实际 resolve。

第一阶段 focused：

```text
bun test tests/core-owned-entry-admission.test.ts tests/compaction.test.ts \
  tests/invocation-ownership.test.ts tests/context-lifecycle.test.ts \
  tests/turn-failure-events.test.ts
32 pass / 0 fail / 124 assertions
```

独立 Production review 随后以同一 Session lock 的 reducer-after-append 窗口复现 P1；修复后的 focused：

```text
bun test tests/core-owned-entry-admission.test.ts tests/compaction.test.ts \
  tests/invocation-ownership.test.ts tests/abort-boundary.test.ts \
  tests/recovery.test.ts tests/memory-store.test.ts tests/jsonl-store.test.ts \
  tests/workflow-invocation-signal.test.ts
80 pass / 0 fail / 381 assertions
```

Store contract + recovery + race 合并 focused：

```text
42 pass / 0 fail / 253 assertions
```

## 门禁

- 初始 durable overlay gate 的 `bun run verify`：`344 pass / 0 fail / 1480 assertions`，53 test files；typecheck/build 通过。
- Store final-boundary signal 与 recovery 修复后的 `bun run verify`：`345 pass / 0 fail / 1490 assertions`，typecheck/build 通过。
- `bun run pack:smoke`：exit 0；prepack `345/0/1490`，113 files，package `124.6 kB`，unpacked `591.5 kB`；Bun/Node ESM consumers 通过；`git diff --check` 仅有 Windows LF/CRLF warning。

## 未验证与保留边界

- 真实 NeuroBook/Cosmos consumer、真实 provider/tool、第三方 Store、HTTP/SSE Transport、浏览器/产品和生产验收仍未运行。
- `parentId` 指向不存在 Entry 时公开 write 仍是下一轮 P1 候选，本轮不处理。
- `SessionStore` contract 新增可选 runtime signal；忽略 signal 的第三方 Adapter 不获得 final-write fence 保证，真实第三方 Store 尚未验证。
- 不由本轮结果推导 generic transaction、Store ACL、Job/Lease/Outbox、delivery/exactly-once 或全量 `harness.*` namespace 保护。

## 独立审查

- Production correctness：首次审查发现两个 P1：真实 reducer-after-append abort/compaction race，以及 `aborting + running` restart recovery 卡死；已分别用 Store commit signal 与 aborting→aborted recovery 修复，post-fix 无新的本 ADR 范围 P0/P1。
- API/domain/Task contract：新增可选 runtime-only Store commit options，不改变 durable shape、Snapshot、Transport 或 Cosmos/NeuroBook 边界；第三方 Adapter 忽略 signal 的 limitation 已记录在 ADR-0034。
- Test sensitivity：严格同锁 race gate 位于 reducer 已通过、durable append 前；Store signal contract、Memory/JSONL recovery 与正常 compaction 均有回归，无新的 P0/P1。
