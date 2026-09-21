# 第五十四轮：JSONL delta + checkpoint 实验模式回归

## 状态

对 `JsonlSessionStore.checkpointEvery > 1` 的 delta + checkpoint 实验模式补齐公开回归套件；探针与正式测试均未发现生产代码缺口，本轮为测试 + 文档增量。focused/full gate、production / API-domain / test-sensitivity 三路窄复审均已完成，第五十四轮收口。本轮只修改 `neuro-agent-harness`，继续保护 `docs/architecture.md`、`docs/pi-adapter-design.md` 与 `tests/context.test.ts`。

## 规划取证

1. `checkpointEvery` 已实现但没有任何专属测试：`src/storage/jsonl.ts` 在 `checkpointEvery > 1` 时按 `version % checkpointEvery === 0` 写完整 `snapshot` record，其余写 `commit`（delta）record；读取时逐条投影（delta 追加 entries、checkpoint 整体替换），版本必须连续，entry ID 不得重复，尾残片在下次 commit 时截断修复。
2. README 宣称"也可启用 delta + checkpoint 实验模式"，但没有测试锁定该合同，任何回归都不会被发现。
3. NeuroBook 最新 harness 修复（linked relations unavailable、Job history、SSE 客户端 connection generation）均为宿主/产品侧，无可移植 Core 缺口；本轮转向 standalone 自身的测试缺口。

## 决定

- 不改生产代码：探针（roundtrip、torn delta/checkpoint 尾、中段损坏、reconcile clean/torn、跨模式读取、跨实例竞争）全部通过，没有发现缺口。
- 新增 `tests/jsonl-checkpoint-delta.test.ts` 11 条公开回归，把实验模式的恢复、修复与 fail-closed 合同锁定为可验证行为。
- 不新增 public API、durable shape、ADR、依赖；`checkpointEvery` 合同不变。

## 实现

新增测试套件，覆盖：

1. `checkpointEvery=2` 交替写 `[snapshot, commit, snapshot, commit, snapshot]`，读取恢复完整状态（create v0 + 4 commits）；
2. torn delta 尾残片由下一次 commit 截断修复，已确认 entry 不丢；
3. torn checkpoint 尾残片同样修复；
4. 中段损坏 fail closed（不把损坏前缀当真相）；
5. delta 模式 `reconcileInterrupted()` 把 running Invocation 收口为 interrupted；
6. running Invocation + torn delta 尾仍可 reconcile；
7. 写入模式与读取模式解耦：`checkpointEvery=2` 写入可由 `checkpointEvery=1` 实例读取（格式驱动）；
8. 同一目录两个 Store 实例竞争提交由 per-session lock 串行化（赢家顺序不确定，断言按 kind 集合）；
9. delta replay 发现 entry ID 重复时 `SessionInvariantError` fail closed（手写损坏文件）；
10. checkpoint version 跳跃（+2）时 `SessionInvariantError` fail closed（手写损坏文件）；
11. 非法 `checkpointEvery`（0 / -1 / 1.5 / NaN）构造时拒绝。

## 测试中的绕道

- 首版 entry ID 重复用例只写了 2 条 commit（v2 是 checkpoint，只有 1 条 delta），损坏目标落空、读取正常返回；补第 3 条 commit 后才有两条 delta 可篡改。
- 跨实例竞争用例初版断言了固定提交顺序，per-session lock 只串行化、不承诺赢家顺序，偶发失败；改为按 kind 集合断言。
- `bun run verify` 的 typecheck 阶段暴露测试自身合同形状错误：`store.create` 需要 `profileKey`，`startInvocation` 的 invocation 字面量使用 `caller + createdAt`（不是 `startedAt`）；已按既有测试约定修正，`bun test` 不做 typecheck 所以此前未发现。
- 中段损坏用例初版用泛化 `toThrow()`；该路径抛的是 JSON.parse 的原始 `SyntaxError`（非尾损坏按既有语义原样上抛），已改为精确断言 `toThrow(SyntaxError)`，与 entry ID / version 守卫的 `SessionInvariantError` 区分开。

## 审查发现与返修

production reviewer 与 API/domain reviewer 首次审查均返回 `No P0/P1/P2 findings.`。

test-sensitivity reviewer 提出 1 个 P1 + 4 个 P2：

- P1（中段损坏用例未指定错误类型）：有效，已改为精确断言 `SyntaxError`（JSON.parse 原始错误按既有 fail-closed 语义原样上抛，与守卫类 `SessionInvariantError` 区分）。
- P2（torn 片段硬编码 JSON 形状）：不成立——不完整尾记录就是该合同的被测输入，任何格式演进都应当同步更新测试。
- P2（并发测试未观察锁机制）：有效但已通过改名收敛断言范围——测试只证明结果正确性；锁串行化机制本身由既有 `checkpointEvery=1` 进程级测试覆盖。
- P2（损坏注入未验证落盘）：不成立——若注入失败，`read()` 会正常返回，`rejects.toThrow` 断言会使测试失败，不会漏报。
- P2（无 `checkpointEvery=1` 基线）：不成立——既有 jsonl-store / jsonl-lock / crash-phases 套件已充分覆盖默认模式，跨模式读取用例（写入 every=2、读取 every=1）额外做了交叉验证。

post-fix 复审返回 `No P0/P1/P2 findings.`。

## 全仓门禁

```text
bun run verify
330 pass / 0 fail / 1445 assertions
48 test files
typecheck + build passed

bun run pack:smoke
prepack: 330 / 0 / 1445
109 files
120.1 kB package / 569.7 kB unpacked
Bun + Node ESM consumers passed
```

## 当前未验证

Bun/Node 子进程级跨进程竞争在 delta 模式下的专门压测未做（同进程双实例已覆盖 lock 串行化；子进程竞争在 `checkpointEvery=1` 下已有既有测试）。真实 NeuroBook/Cosmos Adapter、第三方 Store、HTTP/SSE Transport、跨进程 EventHub 与产品验收仍未验证。本轮不修改 NeuroBook/Cosmos，不 push、发布或部署。
