# 第一百轮：Model contextWindow 窗口保护（C10 收口）+ interrupted 候选否定

## 状态

Parity C10 落地：`ModelRuntime` 新增可选 `contextWindow`，超窗请求 fail closed；同时否定 interrupted 终态暂停候选（NB 签名声明但无调用点）并以测试钉住 SA 现状。`src/` 变更 + 测试 + 文档 + ADR-0038（Proposed）；用户保护文件未纳入范围。

## 规划依据

- 第九十九轮候选清单：C10（需 Model contextWindow 来源）、自动注入、NB interrupted 暂停、图片/附件 durable 内容。
- - interrupted 否定证据（NB commit 844abc2）：NB `pauseFollowUps` 签名含 "interrupted"（neuro-agent-harness.ts:6428）但全部调用点只传 aborted/error（3531/6460/6554；pauseReason 类型也仅 aborted|error）——死参数，无可吸收的已验证语义。
- interrupted 否定证据（NB commit 844abc2）：NB `pauseFollowUps` 签名含 "interrupted"（neuro-agent-harness.ts:6428）但全部调用点只传 aborted/error（3531/6460/6554；pauseReason 类型也仅 aborted|error）——死参数，无可吸收的已验证语义。
- C10 吸收证据：NB `assertContextWithinWindow`（neuro-agent-harness.ts:5062-5071）用请求前 `estimateStoredContextTokens` 阻止超窗 provider 请求，fail closed；NB 测试已钉住该语义。

## 变更

- `src/model.ts`：`ModelRuntime` 新增可选 `contextWindow`（正有限数）。
- `src/harness.ts`：构造时校验窗口值；run 循环在 beforeTurn/context providers 之后、model 调用之前，用 `compactor.estimate` 对请求消息求和，超窗抛明确错误（phase 归 run，不进入 model stage）；未声明 `contextWindow` 或未配置 compactor 时守卫跳过。
- 新增 `tests/model-context-window.test.ts` 5 条：超窗 fail closed（模型零调用）、窗口内通过、未声明跳过、无 compactor 跳过、构造拒绝非法值。
- - `tests/nb-terminal-parity.test.ts` 新增第 8 条：新 Store 实例显式 `store.reconcileInterrupted()` 把 running 收口为 interrupted 后，队列未暂停且宿主可 resume（钉住 SA 现状与 NB 死参数否定；审查 P1 指出初版未真正触发收口，已重写并断言 interrupted 状态）。
- `tests/nb-terminal-parity.test.ts` 新增第 8 条：新 Store 实例显式 `store.reconcileInterrupted()` 把 running 收口为 interrupted 后，队列未暂停且宿主可 resume（钉住 SA 现状与 NB 死参数否定；审查 P1 指出初版未真正触发收口，已重写并断言 interrupted 状态）。
- `CHANGELOG.md`/`CONTEXT.md`/根 `README.md`/新 `docs/adr/0038-model-context-window-protection.md`（Proposed）同步。

## 设计边界（记录）

- 守卫需要 token 估计源：SA 无内置 tokenizer，仅在配置 ContextCompactor 时启用；NB 自带 estimator 恒可用。Core 不内置 estimator 是 provider-neutral 边界。
- 超窗错误 phase 归 run（守卫在 model stage 包装外）；NB 无 phase 契约可对齐。
- - interrupted 收口由 store 层显式 `reconcileInterrupted()`（重启方调用）承担，`read` 不自动收口；队列保持未暂停，宿主 resume/cancel 自决——与第九十九轮 error/aborted 自动 pause 不同，因为 NB 没有 interrupted pause 行为可吸收（死参数）。
- interrupted 收口由 store 层显式 `reconcileInterrupted()`（重启方调用）承担，`read` 不自动收口；队列保持未暂停，宿主 resume/cancel 自决——与第九十九轮 error/aborted 自动 pause 不同，因为 NB 没有 interrupted pause 行为可吸收（死参数）。

## 门禁

- red→green：2 红（守卫缺失、构造校验缺失）→ 实现后 13/0/50（两个文件域）。
- focused：104 pass / 0 fail / 423 expect（18 files）。
- 全量逐文件循环：83 files、491 pass / 0 fail / 2007 expect。
- typecheck/build 通过；`bun run pack:smoke` 通过（prepack 单命令 verify 491/0；tarball 113 files / 147.2 kB；Bun/Node consumer）。

## 未验证与保留边界

- 真实 NeuroBook/Cosmos consumer、真实 provider/tool、HTTP/SSE、浏览器/产品和生产验收仍未运行。
- 仍为候选：自动注入 ADR（等真实消费者迁移证据）、图片/附件 durable 内容（需独立 ADR）、NB percent-based compaction trigger/reserve 合同（需真实消费者证据）。

## 独立审查

- - 独立审查（McClintock，只读）：无 P0。P1（第 8 条假阳性钉子——`read` 不触发 reconcile，测试从未进入 interrupted 态）已修复：改用新 Store 实例显式 `reconcileInterrupted()` 并断言 reconciled 状态与快照 status=interrupted。P2 全部吸收：超窗错误文案去掉「Compaction 未把上下文降到窗口内」失实归因（守卫与 compaction 配置无关，纯 backstop）；NB 行号锚定 commit 844abc2；CHANGELOG 对上一轮 follow-up 条目的去重为有意收编（第九十九轮 P2-2 替换误写成新增）。focused 实测 104/0/420（修复前）。
- 独立审查（McClintock，只读）：无 P0。P1（第 8 条假阳性钉子——`read` 不触发 reconcile，测试从未进入 interrupted 态）已修复：改用新 Store 实例显式 `reconcileInterrupted()` 并断言 reconciled 状态与快照 status=interrupted。P2 全部吸收：超窗错误文案去掉「Compaction 未把上下文降到窗口内」失实归因（守卫与 compaction 配置无关，纯 backstop）；NB 行号锚定 commit 844abc2；CHANGELOG 对上一轮 follow-up 条目的去重为有意收编（第九十九轮 P2-2 替换误写成新增）。focused 实测 104/0/420（修复前）。
