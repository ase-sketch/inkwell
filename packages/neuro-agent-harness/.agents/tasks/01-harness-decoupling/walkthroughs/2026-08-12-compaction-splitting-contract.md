# 第九十轮：compaction 切分与二次压缩合同收口

## 状态

第八十八轮 parity 深度对照代理 B（Hume）的 B 组缺口：`compactIfNeeded`
的切分行为存在但零断言，其中 C2（previous summary 是否计入 keepRecent
预算）与 NeuroBook 有真实语义分歧。本轮用 5 条测试钉住合同 + C2 语义决策
落盘。纯测试 + 文档轮（无 `src/` 变更）；用户保护文件未纳入范围。

## 规划依据（Hume B 组）

- C2（P1）：NB 按 path entry 累计 keepRecent（previous summary 不计）；
  SA 按投影 messages 累计（summary 合成消息计入预算）——连续压缩时的真实
  语义分歧，行为零断言。
- C3（P2）：空压缩窗口守卫（SA 明确 skip，NB 会写误导性 "No prior
  history." entry）——skip 分支无测试。
- C4（P1）：toolResult cut 前移分支（保留区不从 toolResult 半截开始）——
  SA 无任何测试（NB compaction.test.ts:135 有）。
- 另：非法 settings 校验（harness.ts:1802-1804）无测试；悬挂
  firstKeptEntryId fail-closed（session-transcript.ts:91）无测试。

## 变更

- 新增 `tests/compaction-splitting.test.ts` 5 条：
  1. **二次压缩**：4 次 invoke（trigger 4 / keepRecent 1）触发两次压缩；
     断言第二次 `CompactionRequest.previousSummary === "summary-1"`、
     `toSummarize` 从 boundary 之后开始（u3/a3）、新 entry 的
     `firstKeptEntryId` 指向真实 entry、投影 `[summary-2, u4, a4]`；
     C2 语义可观测：若 summary 不计入预算，第二次触发点只有 3 条消息 <
     trigger 4，不会发生第二次压缩；`tokensBefore === 4` 钉住计数口径。
  2. **toolResult cut**：trigger 4 / keepRecent 3，walk-back 落在
     toolResult 上 → cut 前移到匹配 assistant toolCall；断言第一次压缩
     只折叠 u1、`firstKeptEntryId` 指向带 cut-1 的 assistant entry、
     投影保持 pair 完整（toolCall + ok 相邻，无半截 toolResult）。
  3. **skip 分支**：estimate 3、trigger 3 / keepRecent 1，单条消息即触发
     但 walk-back 停在 index 0（keepIndex <= 0）→ 不写 entry、不调
     summarize。
  4. **非法 settings**：`keepRecentTokens >= triggerTokens` → Invocation
     failed，错误包含 `compaction 要求 0 < keepRecentTokens < triggerTokens`。
  5. **悬挂 firstKeptEntryId**：Store 直写 `agent.compaction`（firstKept
     指向不存在的 entry）→ `harness.invoke` 投影时 fail closed
     （`compaction firstKeptEntryId 不存在`）。
- `CONTEXT.md` 新增切分合同条款：toolResult cut、空窗口 skip、previous
  summary 计入预算（与 NB 不同，SA 更保守）、悬挂 firstKeptEntryId
  fail-closed。
- 开发过程中的修正（探针驱动）：初版测试 2 用 keepRecent 2，walk-back
  落在文本 assistant 上未触发 cut 分支（`tokensBefore: 5` 显示 invoke2 的
  用户消息已入列）；改为 keepRecent 3 后正确落在 toolResult 上。测试 1 的
  content 断言形状修正（user 为序列化 payload 字符串、assistant 为 block
  数组）。

## 门禁

- focused：`bun test tests/compaction-splitting.test.ts
  tests/compaction.test.ts tests/compaction-events.test.ts
  tests/context-lifecycle.test.ts tests/core-owned-entry-admission.test.ts
  tests/model-turn-partial.test.ts tests/recovery.test.ts
  tests/fork-session.test.ts` → `41 pass / 0 fail / 214 assertions`
  （8 files）。
- `bun run verify`：`451 pass / 0 fail / 1856 assertions`，76 test files；
  typecheck/build 通过（42.21s，串行模式）。
- `bun run pack:smoke`：未运行——本轮无 `src/` 变更，包内容与第八十九轮
  已验证状态一致。
- `git diff --check` 仅 Windows LF/CRLF warning。

## 结论

- 切分合同全部钉住：二次压缩（previousSummary + boundary 后切分 +
  firstKeptEntryId 真实）、toolResult cut 前移、空窗口 skip、非法 settings
  拒绝、悬挂 firstKeptEntryId fail-closed。
- C2 语义决策：按 SA 现状钉住「previous summary 计入预算」（更保守，
  避免 NB 的误导性空摘要 entry），差异记录在 CONTEXT.md，防止宿主移植
  NB 行为时漂移。
- 第 88 轮记录的「行为存在零断言」清单（B 组）清空。

## 未验证与保留边界

- 真实 NeuroBook/Cosmos consumer、真实 provider/tool、第三方 Store、
  HTTP/SSE、浏览器/产品和生产验收仍未运行。
- 仍为候选：prepareWrites 当前 invocation 可见性陷阱（Hume P3，文档 +
  红测钉住）；`turn_end waiting` 语义、pausedBy/自动 pause、per-event
  字节预算（P2）；窗口保护（C10）与手动 compact（C11）需要新合同，单独
  立项。

## 独立审查

- 只读独立审查（Gibbs）：5 条测试与 `compactIfNeeded` /
  `projectSessionTranscript` 逐条一致、无空转；C2 可观测性成立（tokensBefore
  === 4 即 summary 计入触发计数）；toolResult cut 分支有真实区分度（若无
  cut，三条断言都会失败）；「与 NeuroBook 不同」已对照 neuro-book
  compaction.ts 源码核实（NB walk-back 只遍历 path entries，summary 仅传入
  摘要 prompt）。focused `41/0/214` 实测一致。**No P0/P1/P2 findings。**
- P3（参考，接受为记录边界）：keepRecent 预算半边无直接断言（测试 1 的
  keepRecent=1 使 walk 在 summary 前停止；tokensBefore===4 钉住触发半边，
  keepRecent 半边由「同一 messages 数组驱动两个循环」结构性成立）。评估后
  不强行构造混合 estimate 夹具——该场景需要刻意扭曲的 estimate 才能触发
  summaryOffset 空窗口，价值低于夹具复杂度；skip 分支本身由测试 3
  （keepIndex <= 0）覆盖。
