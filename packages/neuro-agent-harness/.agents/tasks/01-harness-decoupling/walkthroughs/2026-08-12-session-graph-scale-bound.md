# 第六十四轮：大 Session 图校验成本探针与有界回归

## 状态

第六十三轮引入的 `assertSessionEntryGraph()` 是 O(N) 全图校验，进入每个
`normalizeSessionSnapshot()` / `activeSessionPath()` / `reduceSessionWritePlan()`
调用路径。本轮用独立探针量化 1000/10000 条 Entry 的成本，确认无严重回归后，
新增一条「大 Session 有界」回归把线性边界固定下来，并保留探针脚本供后续复用。
本轮不修改任何 `src/` 生产代码；用户已有的 `docs/architecture.md`、
`docs/pi-adapter-design.md` 与 `tests/context.test.ts` 未纳入范围。

## 规划依据

- 第六十三轮 walkthrough 明示「超大历史 Session 的单次全图遍历成本未做基准测量」，
  本轮即为该未验证项的补齐。
- 数据（Memory Store，Windows/Bun 1.3.14）：

  ```text
  {"size":1000,"tSeedMs":3,"readMs":1.37,"pathMs":0.34,"commitMs":1.25}
  {"size":10000,"tSeedMs":74.6,"readMs":13.29,"pathMs":2.79,"commitMs":12.96}
  {"jsonlRead10000Ms":24.81}
  ```

- 10k 对比 1k 近似线性（read ~10x、path ~8x、commit ~10x），没有发现图校验本身
  的 O(N²) 退化。此前 304s 超时来自逐条 commit 时 Memory Store 每次
  `structuredClone` 全量 Snapshot（O(N²)），是既有 append-only 快照特性，不是
  本轮校验引入；按每 1000 条一个 commit 批量写入后 10k 播种仅 74.6ms。
- 结论：不新增缓存状态、不改变公共 API；把「图校验线性」记录为有界回归，防未来
  重构把全图遍历改回平方复杂度。

## 变更

- 新增 `scripts/bench-parent-graph.ts`（探针）：批量 commit 播种 1000/10000 条
  链式 Entry，测量 seed/read/`activeSessionPath`/commit 平均耗时，并单独测 JSONL
  10000 条单批提交后的 read 耗时；附用途头注与运行命令。
- 新增 `tests/session-graph-scale-bounded.test.ts`：10000 条链式 Entry 下断言
  read/`activeSessionPath`/commit 的正确性（路径长度、root parent、commit 后
  version 与 leaf 推进），并以测量值 ~13ms 的百倍余量（read/path < 2s、
  commit < 5s）拦截 O(N²) 级别退化；不做精确计时断言，避免 CI 抖动误报。
- 探针初版 bug 与修复：seed 循环误用 `expectedVersion: offset`（版本按 commit
  次数 +1，不是按批长度），第一轮 10k 段抛出 `SessionConflictError`；去掉
  expectedVersion（乐观提交语义）后跑通。该 bug 仅存在于探针脚本，与生产
  reducer 无关。

## TDD 证据

有界回归先按正确性断言红（version 断言写成 `ENTRY_COUNT + 1`，实际是
`ENTRY_COUNT / BATCH_SIZE + 1 = 11`），修正后通过：

```text
bun test tests/session-graph-scale-bounded.test.ts
1 pass / 0 fail / 8 assertions [114.89ms]
```

## 门禁

- focused：`bun test tests/session-graph-scale-bounded.test.ts
  tests/session-entry-parent-admission.test.ts tests/abort-boundary.test.ts`
  → `27 pass / 0 fail / 95 assertions`（第六十三轮 87 + 本轮 8）。
- `bun run verify`：`360 pass / 0 fail / 1533 assertions`，55 test files；
  typecheck/build 通过。
- `bun run pack:smoke`：未运行——本轮无 `src/` 变更，`package.json` 的
  `files` 只含 `dist` 与文档，脚本/测试不进包，包内容与第六十三轮已验证状态
  一致。
- `git diff --check` 仅 Windows LF/CRLF warning。

## 未验证与保留边界

- 10000 条为探针上限；百万级 Session 的绝对成本（含 JSONL 尾部追加）仍未测量，
  但线性前提下可由本数据外推。
- 图校验仍是无缓存的全量 O(N) 遍历；若未来出现十万级以上高频读场景，可再评估
  Snapshot 内联索引或增量维护，本轮无证据支持提前引入。
- 真实 NeuroBook/Cosmos consumer、真实 provider/tool、第三方 Store、HTTP/SSE
  Transport、浏览器/产品和生产验收仍未运行。
- 探针脚本保留在 `scripts/` 下作为 perf 工具；测试只覆盖 Memory Store 的
  commit 路径，JSONL 的批量播种成本只由探针记录，未转成断言。

## 独立审查

- 只读独立审查（Banach）复跑单测/全仓/typecheck 并交叉核对数字：**No P0/P1
  findings**；确认断言自洽（version 按 commit 次数 +1、`entries.at(-1)` 为
  appended 批尾、root-first path）、探针无逻辑错误、保护文件未触碰。
- P2 已吸收：focused 计数修正为 `27/0/95`（87 + 8）；leaf 断言改用
  `result.entries.at(-1)?.id` 避免「终 commit 恰好追加一条」的隐式依赖；
  探针 JSONL 段临时目录清理移入 `try/finally`。
- P2 接受项：时序上限 155–700x 余量只拦截分钟级 O(N²) 退化，属文档声明的
  设计意图，不改；README 中第六十三轮进度/checklist 行在本轮 checkpoint
  一并补齐归因。
