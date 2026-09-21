# 第五十三轮：plan 数组批量 admission（prepareWrites / hook effects）

## 状态

public red→green、focused/full gate、production / API-domain / test-sensitivity 三路窄复审均已完成；不新增 public API、durable shape、ADR 或依赖，第五十三轮收口。本轮只修改 `neuro-agent-harness`，继续保护 `docs/architecture.md`、`docs/pi-adapter-design.md` 与 `tests/context.test.ts`。

## 规划取证

1. 第五十二轮只覆盖了 `ToolResult.writePlans`；全仓扫描发现同一"逐 plan 顺序提交"模式还存在于另外两个公开 plan 数组入口：
   - `PreparedRun.prepareWrites`（`src/harness.ts` prepare 路径，Profile `prepare()` 返回）；
   - `RuntimeEffect.writePlans`（`applyEffect`，被 `prepareRun` / `beforeTurn` / `afterTurn` / `settleRun` / `settleFailure` 全部 hook 阶段复用）。
2. 两处与 Tool 路径同构：plan2 的 `expectedVersion` 相对 plan1 过期或操作非法时，plan1 先持久化、plan2 才失败，产生没有后续解释的孤儿 durable 写入。
3. parallel Tool 路径已显式拒绝 writePlans，不受影响；follow-up rebase 循环是单 plan 重试语义，不是数组批量，不并入本轮。
4. `prepare(context)` 与 hook `run(context)` 都暴露 `sessionId` 与 `snapshot`，因此 stale version 场景与 Tool 路径一样可以在公开边界构造。

## 决定

- 第五十二轮的 private 批量入口更名为 `commitWritePlans`，并复用到所有公开 plan 数组：Tool writePlans、Profile prepareWrites、hook/effect writePlans。
- 语义与第五十二轮一致：全部 plan 先通过与 `commit()` 相同的守卫 + `reduceSessionWritePlan` 纯投影校验，全部合法后才逐 plan CAS 提交；plan 内部非法 → 整批零 durable 写入；并发外部 CAS / abort 仍可能早退，属固有边界。
- 调用点的 per-plan `assertAttemptActive` 统一为批次后的单次检查（与第五十二轮 Tool 路径一致）；`applyEffect` 的 `allowInvalidated` 语义保持不变（settleFailure 的 abort settlement 路径仍跳过 attempt 断言，由调用方在 effect 后重读 Store 复核 owner）。
- 不新增 public API、durable shape、ADR 或依赖；`PreparedRun.prepareWrites` / `RuntimeEffect.writePlans` 类型合同不变。

## 实现

`src/harness.ts`：

- private `commitToolWritePlans` 更名为 `commitWritePlans`，JSDoc 泛化为三种 plan 数组来源；
- prepare 路径的 `for (const plan of prepared.prepareWrites ?? [])` 循环改为：数组非空时调用 `commitWritePlans`，随后一次 `assertAttemptActive`；
- `applyEffect` 的逐 plan 循环改为：数组非空时调用 `commitWritePlans`，随后在 `!allowInvalidated` 时一次 `assertAttemptActive`；
- 两个 Tool writePlans 调用点改用新名字。

## Public TDD 与回归矩阵

新增 `tests/write-plan-array-admission.test.ts`，8 条 public 测试：

1. `prepareWrites` 批尾 `expectedVersion` 过期（以 prepare 时 Snapshot 为基准）→ `SessionConflictError`，两个 plan 均未持久化；
2. `prepareWrites` 批内 `moveLeaf` 指向缺失 leaf → `SessionInvariantError`，零写入；
3. `prepareWrites` 批首 `expectedVersion` 过期 → 投影阶段整批零写入拒绝（CAS 冲突发生在批首位置时不存在任何先行写入）；
4. `beforeTurn` effect 批尾 version 过期 → `SessionConflictError`，零写入；
5. `beforeTurn` effect 批内非法操作 → `SessionInvariantError`，零写入；
6. `settleFailure` effect 批尾 version 过期 → `SessionConflictError`，零写入（覆盖失败路径的 applyEffect；hook 运行计数与原始错误保留断言区分"hook 未运行"基线）；
7. abort settlement（`allowInvalidated=true`）批尾 stale → 零写入且 abort terminal 不被破坏（writeFence 在该路径仍为 open，真实命中 stale version 投影，而非 fence 拒绝）；
8. 合法多 plan 数组全部提交，批量 entry 的 payload 顺序为 `[1, 2]`，Invocation completed。

Red 阶段：5 条失败均命中 `firstCommitted: true`（孤儿写入），合法序列通过。修复后扩大 focused：

```text
bun test tests/write-plan-array-admission.test.ts \
  tests/tool-write-plan-batch-admission.test.ts \
  tests/context.test.ts tests/context-lifecycle.test.ts \
  tests/extensions.test.ts tests/tool-definition-admission.test.ts \
  tests/follow-up-reserved-facts.test.ts tests/harness.test.ts

51 pass / 0 fail / 223 assertions
9 test files
```

## 审查发现与返修

production reviewer 与 API/domain reviewer 首次审查均返回 `No P0/P1/P2 findings.`。

test-sensitivity reviewer 提出 1 个 P1 + 6 个 P2：

- P1（settleFailure 用例无法区分"hook 未运行"与"批次被拒绝"）：有效。settlement 错误会被吞掉、原始 model 错误上抛，`result.error.name` 在该路径不可用；已补 `settleFailureRuns` 运行计数与 `originalErrorPreserved`（"boom" 保留）断言。
- P2（缺批首 stale 场景）：有效，已补 `prepareWrites` 批首 stale 用例（与第五十二轮 Tool 批首用例互补，覆盖"批首 CAS 冲突 → 零写入"边界）。
- P2（合法序列缺 payload/顺序断言）：有效，已补批量 entry 的 payload 顺序 `[1, 2]` 断言。
- P2（缺 abort settlement 的 allowInvalidated 路径）：有效，已补专门用例；writeFence 在 settlement 时仍为 open，用例真实命中 stale version 投影路径，同时证明批次拒绝不破坏 abort terminal。
- P2（afterTurn/settleRun 未直测）：不成立——两阶段与 beforeTurn/settleFailure 共用同一 `applyEffect` 代码路径，不增加分支覆盖。
- P2（空数组未测）：不成立——同一 `length > 0` 守卫已由第五十二轮 Tool 空数组用例覆盖。

post-fix 复审返回 `No P0/P1/P2 findings.`。

## 全仓门禁

```text
bun run verify
319 pass / 0 fail / 1410 assertions
47 test files
typecheck + build passed

bun run pack:smoke
prepack: 319 / 0 / 1410
109 files
119.9 kB package / 569.3 kB unpacked
Bun + Node ESM consumers passed
```

## 当前未验证

真实 NeuroBook/Cosmos Adapter、真实 Provider/外部 Tool、第三方 Store、HTTP/SSE Transport、跨进程 EventHub、并发外部 writer / abort 的批次中途早退现场与产品验收仍未验证。settleFailure 的 abort settlement（`allowInvalidated`）多 plan 场景未直测。本轮不修改 NeuroBook/Cosmos，不 push、发布或部署。
