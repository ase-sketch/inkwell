# 第七十五轮：跨进程 fork/恢复证据（真实子进程）

## 状态

第七十轮消费切片的 P2-2 保留项：fork + 恢复路径的进程边界组合未被真实子进程
覆盖（第七十轮只有同进程新 Store 实例证据）。本轮补真实 Node ESM 子进程测试：
worker 进程完成运行 → 主进程仅靠公开 API 投影终态、fork 会话并继续跑。
纯测试轮（无 `src/` 变更）；用户保护文件未纳入范围。

## 规划依据

- NeuroBook parity 扫描：`server/agent` 自 08-12 无新提交，无候选。
- 第七十轮审查（Sagan）P2-2（证据精度）：「test (b) 的标题『跨进程恢复投影与
  fork』与证据（同进程新 Store 实例）存在措辞差……fork+恢复路径的进程边界
  组合本身未被真进程覆盖」；Store 层已有真实 worker 进程测试（jsonl-store 的
  Bun/Node ESM worker），本轮把同一证据级别扩展到 fork/投影组合。
- 复用既有 fixture 模式：Bun.build(target: node) bundle 临时 ESM 文件，
  `node <bundle>` 子进程执行，stdout 输出结构化 marker。

## 变更

- 新增 `tests/fixtures/fork-recovery-worker.ts`：子进程用 JsonlSessionStore +
  NeuroAgentHarness + ScriptedModelRuntime 完成一次运行，输出
  `{"status":"worker-done",sessionId,invocationId,output}` 后 dispose 退出。
- 新增 `tests/fork-recovery-process.test.ts`：
  1. bundle + spawn Node 子进程，30s 有界等待退出；
  2. 主进程新 Store 实例 `read` + `invocationResultFromSnapshot` 投影 worker
     终态（completed / "worker done" / confirmed）；
  3. 主进程 `forkSession` 派生恢复分支（`parentSessionId` 溯源）→ 分支上
     继续跑旁路 Invocation → 再次投影成功；
  4. 源会话 entries 不被 fork 修改。

## 门禁

- focused：`bun test tests/fork-recovery-process.test.ts
  tests/cosmos-orchestration-consumer.test.ts tests/fork-session.test.ts
  tests/invocation-result-projection.test.ts tests/jsonl-store.test.ts`
  → 实跑 `42 pass / 0 fail / 224 assertions`（5 files，含 worker 套件回归）。
- `bun run verify`：`415 pass / 0 fail / 1712 assertions`，64 test files；
  typecheck/build 通过（fixture 也过 tsc）。
- `bun run pack:smoke`：未运行——本轮无 `src/` 变更，包内容与第七十三轮已
  验证状态一致。
- `git diff --check` 仅 Windows LF/CRLF warning。

## 结论

- fork/投影/恢复组合的进程边界证据补齐：worker 进程写入的 durable 状态可由
  独立进程仅凭公开 API 投影并派生 fork 继续，无需 handle/内存状态。
- 与第七十轮结论一致：现有 provider-neutral 合同足以表达跨进程编排闭环。

## 未验证与保留边界

- 真实 NeuroBook/Cosmos consumer、真实 provider/tool、第三方 Store、
  HTTP/SSE 连接、浏览器/产品和生产验收仍未运行。
- 子进程场景覆盖「完成→恢复」；「waiting 跨进程恢复 + resume」仍由既有
  recovery/approval 套件（同进程 Store 实例）覆盖，未做 worker 组合。
- 超时路径（worker 挂死）由 30s 兜底拒绝，未做 kill 恢复断言。

## 独立审查

- 只读独立审查（Carver）：确认测试真实跨进程（worker 独立 Node 进程、主进程
  数据只能来自 worker 写入的 durable 记录）、marker 解析健壮、超时路径确定、
  断言无空转无内存偷用；focused/全仓数字实测一致。**No P0/P1 findings。**
- P2 已吸收：超时兜底改为对整体 `Promise.all` 单一时限 race 并在 finally
  clearTimeout（消除悬空定时器与 29.9s 边界误判）；失败诊断直接抛带
  stdout/stderr 的错误（消除死代码）；fork 补 transcript 继承（含
  agent.message 条目）与零 Invocation 断言；README 追溯措辞明确
  「第七十轮审查 P2-2（证据精度）」。
