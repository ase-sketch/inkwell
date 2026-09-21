# 第五十二轮：Tool writePlans 批量 admission

## 状态

public red→green、focused/full gate、production / API-domain / test-sensitivity 三路窄复审均已完成；不新增 public API、durable shape、ADR 或依赖，第五十二轮收口。本轮只修改 `neuro-agent-harness`，继续保护 `docs/architecture.md`、`docs/pi-adapter-design.md` 与 `tests/context.test.ts`。

## 规划取证

1. `ToolResult.writePlans` 是公开数组合同；普通 sequential Tool 路径与 approval resume 路径都逐 plan 调用 `commit()`。
2. 多 plan 时，若 plan2 的 `expectedVersion` 相对 Tool 执行时捕获的 Snapshot 版本已经过期，plan1 会先持久化、plan2 的 CAS 才失败——产生没有 toolResult 解释的孤儿 durable 写入。
3. plan 内部非法操作（例如 `moveLeaf` 指向不存在的 leaf）同理：plan1 写入后 plan2 才在 reducer 边界失败。
4. NeuroBook 对照：其 harness 测试均为单 plan；`neuro-agent-harness.ts` 的 hook 批量路径把 writePlans 数组交给 `writeExecutor.execute`（等价批量语义）。没有真实 multi-plan 消费者，但 standalone Core 的数组合同应自行收敛，不能依赖宿主逐个补救。
5. `commit()` 的守卫包括 usage/partial fact、follow-up fact 与 Invocation target；批量路径必须先用同一守卫，再做纯 reducer 投影校验，全部通过后才允许逐 plan CAS 提交。

## 决定

- 所有 plan 先通过与 `commit()` 相同的守卫 + `reduceSessionWritePlan` 纯投影校验（project 前一个 plan 的结果），全部合法后才逐 plan CAS 提交。
- plan 内部非法 → 整批零 durable 写入；Tool 已执行但没有任何 plan 落盘，失败原因通过 Invocation result 暴露。
- 并发外部 CAS 冲突仍可能让较早 plan 在冲突前已持久化，属固有边界：不承诺原子批或 exactly-once，宿主继续负责幂等/查询/补偿。
- 不新增 public API、durable shape、ADR 或依赖；公共类型、导出和 SessionWritePlan 合同不变。

## 实现

`src/harness.ts` 新增 private `commitToolWritePlans(plans, snapshot, invocationId)`：

- 每个 plan 先执行 `assertInvocationUsageFact` / `assertInvocationPartialFact` / `assertFollowUpFact` / `assertInvocationTarget`；
- 无 `expectedActiveInvocationId` 的 plan 自动注入 invocation id（与 `commit()` 单 plan 路径一致）；
- 用 `reduceSessionWritePlan(projected, plan, {now, entryId: () => randomUUID()})` 从当前 Snapshot 逐步投影；
- 全部通过后逐 plan 调用 `this.commit(plan, invocationId)` 并返回最终 Snapshot。

普通 sequential Tool 路径与 approval resume 路径的两个 `for (const plan of toolResult.writePlans ?? [])` 循环改为：数组非空时调用 `commitToolWritePlans`，随后 `assertAttemptActive`。

> 注：第五十三轮将该 private helper 更名为 `commitWritePlans`，并复用于 Profile `prepareWrites` 与 hook effect `writePlans` 路径。

## Public TDD 与回归矩阵

新增 `tests/tool-write-plan-batch-admission.test.ts`，6 条 public 测试：

1. plan1（无 expectedVersion）成功后 plan2 使用初始 Snapshot 的旧 version → `result.error.name === SessionConflictError.name`，`firstCommitted=false`、`secondCommitted=false`、`toolResults=0`；
2. 合法两 plan 全部提交且恰好 1 条 toolResult message 持久化，result completed；
3. plan2 `moveLeaf leafId:"missing-leaf"` → `SessionInvariantError`，plan1 不写入、无 toolResult；
4. 首个 plan 的 `expectedVersion` 已过期 → 投影阶段整批零写入拒绝，`SessionConflictError`（CAS 冲突发生在批首位置时不存在任何先行写入）；
5. 空 `writePlans` 数组视为无写入，toolResult 正常持久化，Invocation completed；
6. approval resume 场景在 durable claim 后同样零写入拒绝（旧 version CAS 冲突）。

Red 阶段：3 条失败均命中 `firstCommitted: true`（孤儿写入），合法序列通过。修复后扩大 focused：

```text
bun test tests/tool-write-plan-batch-admission.test.ts \
  tests/harness.test.ts tests/invocation-ownership.test.ts \
  tests/context-lifecycle.test.ts tests/context.test.ts \
  tests/follow-up-reserved-facts.test.ts tests/parallel-tools.test.ts

49 pass / 0 fail / 206 assertions
7 test files
```

## 审查发现与返修

production reviewer 首次提出 1 个 P1 + 3 个 P2，全部经 adjudication 撤销：

- P1（投影遗漏 sealed fence / 跨 Session owner 检查）：不成立——`commitToolWritePlans` 的 map 阶段已对每个 plan 调用全部四个守卫（含 `assertInvocationTarget`），fence 与 owner 检查都在投影前完成；投影只负责 Snapshot 级检查（expectedVersion / expectedActiveInvocationId / cause / operation 合法性）。adjudication 回送后确认 `No P0/P1/P2 findings.`。
- P2（失败时返回 stale snapshot）：不成立——逐 plan commit 中任何失败都会使方法 throw，不存在返回路径；CAS 部分持久化已在 JSDoc 写明。
- P2（JSDoc 未提 CAS 部分写入）：不成立——JSDoc 第二句已写明"Commit-time CAS conflicts caused by concurrent writers can still leave earlier plans durable"。
- P2（双重守卫冗余）：不成立但触发一处注释改进——`reduceSessionWritePlan` 不检查 usage/partial/followUp/target 守卫，pre-guard 正是把 guard 级拒绝提前到任何 durable 写入之前的机制，`commit()` 内守卫是单 plan 安全网；JSDoc 已补两层守卫原因。

API/domain reviewer 对 README/CHANGELOG/CONTEXT/Task README 合同表述的首次审查即返回 `No P0/P1/P2 findings.`（首次调用曾因 reviewer 尝试自行读文件而回传 tool-call 标记，未计结论；禁用工具后重跑）。

test-sensitivity reviewer 提出 3 个 P2：

- `toolResultMessageCount` 依赖 `agent.message` kind 与 `message.role === "toolResult"`：不成立——这是全仓 16 个测试文件共用的既有 durable SessionEntry/AgentMessage 公开合同，不是内部实现细节。
- test 3 缺 `secondCommitted: false` 断言：有效，已补。
- 缺空数组与顺序敏感等价场景：有效，已补空 `writePlans: []`（no-op + toolResult 持久化）与批首 `expectedVersion` 过期（整批零写入）两条；并发 writer 属已记录的固有 CAS 边界，不要求 stress 测试。

post-fix 复审返回 `No P0/P1/P2 findings.`，并确认新增用例与既有断言风格一致、无 flaky 风险。

## 全仓门禁

```text
bun run verify
311 pass / 0 fail / 1402 assertions
46 test files
typecheck + build passed

bun run pack:smoke
prepack: 311 / 0 / 1402
109 files
119.8 kB package / 568.9 kB unpacked
Bun + Node ESM consumers passed
```

## 当前未验证

真实 NeuroBook/Cosmos Adapter、真实 Provider/外部 Tool、第三方 Store、HTTP/SSE Transport、跨进程 EventHub、并发外部 writer 的 CAS 早退现场与产品验收仍未验证。本轮不修改 NeuroBook/Cosmos，不 push、发布或部署。
