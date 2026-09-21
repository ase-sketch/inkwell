# 第一百零三轮：prepareWrites 自动注入（ADR-0039）+ 双写消费方迁移

## 状态

规划代理 C 的升级吸收落地：Profile `prepareWrites` 中的 `agent.message` 贡献在成功落盘后自动注入当前 Invocation 的模型请求（同轮可见、恰好一次、先于当前用户消息）；Tool/hook writePlans 同轮注入明确不吸收。合同变更 + 消费方迁移 + ADR-0039（Proposed）。

## 规划依据（规划代理 C）

- NB 有产品级测试钉住：neuro-agent-harness.test.ts:6685（AppendingSet 写入后本轮 provider context 恰好一次）与 :6726-6767（首轮数到 2 个 user 消息）；代码路径为 prepareRun 写后重读 snapshot + appendingCount 结构性去重。
- 范围不对称：NB hook writePlans 只允许 custom 条目、Tool 无 writePlans——同轮注入只覆盖 prepare 阶段 plan 消息，Tool/hook 路径不吸收。
- SA 现状：prepareWrites 在 userMessage 提交前落盘，durable 顺序天然是 History → Appending → CurrentUserInput；第九十一轮的「延迟可见」钉住测试与双写消费方需按新合同迁移。

## 变更

- `src/harness.ts`：新增模块级 `prepareContributionMessages`（从已落盘的 prepareWrites 计划提取 kind=agent.message 且形状合法的 message）；非 resume 路径在 commitWritePlans 之后、userMessage push 之前把贡献注入 work-copy。resume 路径不提交 prepareWrites、不注入（贡献已在 prepareSnapshot 的 transcript 中）。
- 消费方迁移：context-lifecycle test 2/4 移除双写 context sections（改单源 prepareWrites）；test 5 从「延迟到下一 Invocation」改写为「同轮可见 + 顺序先于当前用户消息 + 下一轮双方可见」。
- 新增 `tests/auto-inject-prepare-writes.test.ts` 2 条：custom 事实不注入而 agent.message 注入；Tool writePlans 同轮不注入、下一 Invocation 可见（维持第九十一轮合同）。
- `docs/adr/0039-prepare-write-auto-injection.md`（Proposed）；ADR-0012 provider 可见性边界小节与 CONTEXT 更新为 ADR-0039 合同（保留第九十一轮叙述为历史记录）；CHANGELOG 顶部标注合同变更；README context 段补单源合同说明。

## 门禁

- red→green：迁移 + 新测试先 4 红，实现后 7/0/50。
- focused：77 pass / 0 fail / 417 expect（15 files）。
- 全量逐文件循环：85 files、500 pass / 0 fail / 2031 expect。
- - typecheck/build 通过；pack:smoke 通过（prepack 单命令 verify 500/0；tarball 113 files / 149.8 kB；Bun/Node consumer。首次运行撞上已知 Windows 间歇停滞后重试通过）。

## 未验证与保留边界

- 真实 NeuroBook/Cosmos consumer、真实 provider/tool、HTTP/SSE、浏览器/产品和生产验收仍未运行；双写消费方的真实迁移（NeuroBook/Cosmos 侧）不在本仓库范围。
- 仍为候选：第 104 轮 attachment 最小 Core seam；C3（retry 签名/错误面收敛）。

## 独立审查

- - 独立审查（Boyle，只读）：无 P0/P1。3 条 P2 全部吸收：P2-1 注入口径改为复用 durable 投影的同一提取函数（messageFromEntry 导出，消除「注入口径 vs transcript 投影口径」不对称）；P2-2 ADR-0012 的嵌套列表结构修复（历史叙述保留为顶格 bullet）；P2-3 CHANGELOG 条目行首缩进修复。focused 实测 77/0/417（吸收前后一致）。
