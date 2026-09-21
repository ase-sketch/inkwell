# 第六十三轮：Session Entry Parent Reference Admission

## 状态

parent reference admission 与 abort unknown-result 收口已实现；focused/full/package 门禁与独立审查已完成，准备创建本地 checkpoint。本轮只修改 `neuro-agent-harness`；用户已有的 `docs/architecture.md`、`docs/pi-adapter-design.md` 与 `tests/context.test.ts` 未纳入范围。

## 规划依据

- 第六十二轮独立审查保留 P1：public `harness.write()` 可以 append 指向不存在 Entry 的 `parentId`，成功后 `activeSessionPath()` 才失败，导致 durable Snapshot 已落盘但 transcript/恢复不可用。
- 领域术语收敛：`parentId` 是同一 Session 内的 Entry Parent Reference；`null` 建立 root branch，draft 省略该字段继承当前 Active Leaf，显式非空必须指向当前 projection 已存在的 Entry。
- 共享 reducer 是 Memory/JSONL、public write、Profile/Tool/hook plan-array 共用的唯一投影边界，因此把结构校验放在 reducer，而不是 Harness facade。
- ADR-0035 保持 Proposed；不新增 generic branch/fork API，不处理跨 Session parent、merge 或历史损坏自动修复。

## 变更

- `src/session.ts` 新增 `assertSessionEntryGraph()`：
  - Entry ID 非空字符串且同 Snapshot 内唯一；
  - parent 非空（`null` 或非空字符串）；
  - Active Leaf 必须为 `null` 或已存在 Entry；
  - 所有 parent 引用必须命中同 Session 已存在 Entry；
  - 从每个 Entry 回溯 parent 链，环 fail closed，路径有限。
- `normalizeSessionSnapshot()`、`activeSessionPath()` 与 `reduceSessionWritePlan()` 共用该校验；`activeSessionPath()` 不再可能无限回溯。
- reducer 内 append 逐项解析 parent：省略继承当前 active leaf，显式 `null` 建 root，显式非空必须存在；新生成的 Entry ID 若与已有/同批前序 ID 冲突也 fail closed。
- `tests/session-entry-parent-admission.test.ts` 新增 10 条回归：public write 拒绝悬挂 parent、既有 parent 建 branch、`null` 建 root、省略跟随 active leaf、悬挂 active leaf 拒绝、`prepareWrites` 整批零写入、Memory/JSONL contract 与重启读取、环/重复历史 ID、JSONL malformed graph 读取、同批重复生成 ID。
- pack smoke 暴露的既有 abort restart flaky 被确定性复现：`run()` 的 `persistence:"unknown"` 在 forced abort terminal 尚未 durable 前结算 active，dispose/重启后留下 `aborting + running` 未收口事实。`src/harness.ts` 在 abort 请求后不再提前结算 unknown result；forced abort 路径仍以 `allowUnconfirmedAbort` 收口（terminal 已确认、boundary 耗尽或失败）。新增 `tests/abort-boundary.test.ts` gate 证明 forced abort commit 被 Store 门住时 handle 不提前 settle。
- 独立审查进一步发现同生命周期 P1：`waitInvocation` durable 后宿主在同步事件回调中 abort，waiting confirmed 结果会绕过 gate 提前结算，durable 停在 `aborting + waiting`。gate 扩展为 abortRequested 下也拦截 `status:"waiting"` 结果，由 forced abort boundary 以 aborted 收口；新增同步 abort 回归。
- 收尾按审查吸收 P2：`forceAbort` 的 fence seal/attempt close 移入 try 防未来抛错吞 rejection；`assertSessionEntryGraph` 去掉冗余 parent 预检；补 inactive-branch 显式 parent、空白 parent/空白生成 ID 拒绝测试。
- `CONTEXT.md` 增加 Entry Parent Reference、Active Leaf、Active Path 术语与不变式；`docs/adr/0035-session-entry-parent-reference-admission.md` 建立（Proposed）。

## TDD 证据

初始 public red（悬挂 parent 被旧实现接受）：

```text
bun test tests/session-entry-parent-admission.test.ts
0 pass / 1 fail / 1 assertion
```

最终 focused（parent admission 12 条 + abort-boundary 14 条）：

```text
bun test tests/session-entry-parent-admission.test.ts tests/abort-boundary.test.ts
26 pass / 0 fail / 87 assertions
```

abort unknown-result / waiting-sync-abort 修复的确定性 gate：

```text
bun test tests/abort-boundary.test.ts \
  --test-name-pattern='forced abort terminal commit 未完成前|waitInvocation durable 后同步 abort'
两条均先 red 后 green
```

复现后的原 flaky（30 次重复）由 `20 pass / 10 fail` 变为 `30 pass / 0 fail`。

## 门禁

- `bun run verify`：`359 pass / 0 fail / 1525 assertions`，54 test files；typecheck/build 通过。
- `bun run pack:smoke`：exit 0；prepack `359/0/1525`，113 files，package `125.8 kB`，unpacked `597.7 kB`；Bun/Node ESM consumers 通过。
- `git diff --check` 仅有 Windows LF/CRLF warning。

## 未验证与保留边界

- 真实 NeuroBook/Cosmos consumer、真实 provider/tool、第三方 Store、HTTP/SSE Transport、浏览器/产品和生产验收仍未运行。
- 第三方 Store Adapter 若绕过 shared reducer 直接写坏 parent graph，只有其自身读取路径 fail closed；本契约不宣称所有 Store 都自动修复或迁移历史数据。
- 未实现历史损坏自动修复、merge 语义、跨 Session parent 或 generic fork/branch API；`moveLeaf` 到已存在 Entry 的既有行为不变。
- `activeSessionPath()` 与 `projectSessionTranscript()` 现在都会先校验全图；超大历史 Session 的单次全图遍历成本未做基准测量。

## 独立审查

- 只读领域审查：确认 `parentId` 精确父引用、`null` root、省略跟随 active leaf 的语义；要求自环/任意环/重复 ID/悬挂 parent/悬挂 active leaf 全部 fail closed；确认 ADR-0035 值得保留但只能维持 Proposed，并指出 `activeSessionPath()` 无限回溯、历史重复 ID 与 JSONL 读取校验三个缺口（本轮均已补齐）。
- Production 边界：abort 竞态是第六十二轮 Store signal 修复后暴露的相邻生命周期缺口；修复只延迟 unknown result 的结算，不改变 confirmed terminal、forced abort 重试与 AbortBoundaryError 语义。
- Test sensitivity：断言走 public seam；时序注入点（`GatedForceAbortStore`、`FlakyAbortFinishStore` 等）依赖内部 cause 字符串契约，cause 改名会静默失效，已在 walkthrough 明示。原 flaky test 30 次重复通过，pack smoke 连续通过。
