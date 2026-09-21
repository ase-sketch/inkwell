# 第九十五轮：手动 compact（ADR-0037）

## 状态

第八十八轮 parity 审计 C11（手动 compact，需新合同）落地：公开
`compactSession` API + `CompactionRequest.instructions`，ADR-0037 建立。
`src/` 变更（新 API + 共享切分抽取 + compaction fact 守卫放宽）+ 测试 +
文档；用户保护文件未纳入范围。

## 规划依据（Hume C11 + 本轮设计核查）

- Hume 证据：NB 有宿主驱动 `compactSession`（neuro-agent-harness.ts:
  7516-7574，带 instructions、错误以 invocation 生命周期表达）；
  appendCompaction 的 plan+summarize+write 核心可移植，invocation/UI
  生命周期 host-specific。
- 本轮设计核查：
  - `compaction` settings 只存在于 PreparedRun（每次 Invocation 动态
    返回，profile.ts:79），ResolvedProfile 无静态声明——手动路径没有
    prepared run，保留窗口由调用方显式提供（`keepRecentTokens`）；
  - `agent.compaction` 精确 plan 守卫（round 62）要求
    `entry.invocationId === commit invocationId`；手动路径两者皆
    undefined，守卫放宽为「一致即可」（allowed 标志只由 Harness 内部
    commit 传入，宿主 write 永远不设，无伪造面）；
  - runtime `compaction_start/end` 绑定 Invocation attempt，手动路径
    不发布（不伪造 invocationId）。

## 变更

- `src/compaction.ts`：`CompactionRequest` 新增可选 `instructions`。
- `src/harness.ts`：
  - 新增公开 `compactSession(sessionId, {keepRecentTokens, instructions?,
    signal?}): Promise<{compacted}>`：idle-only（active 抛
    `InvocationConflictError`）、keepRecent 正整数校验、compactor 存在
    校验、摘要失败抛错不落盘、不创建 Invocation；
  - 抽取私有 `compactTranscript` 共享切分/摘要/落盘核心（对齐投影、
    pending Tool Call 拒绝、keepRecent walk-back、toolResult cut、空窗口
    skip、summary 校验、commit）；自动路径（compactIfNeeded）改为薄封装
    （trigger 检查 + 事件 + splice），行为不变；
  - `assertCompactionFact`/`isCompactionFactPlan` 放宽为「entry 与 commit
    invocationId 一致」（含皆 undefined）。
- 新增 `tests/compact-session.test.ts` 9 条：正常折叠（entry 无
  invocationId、投影更新、无 Invocation、无 runtime 事件）、instructions
  传递、空窗口 skip、active 冲突、未配置 compactor、非法 keepRecent、
  悬挂 Tool Call fail-closed、摘要失败不落盘、JSONL 重启恢复。
- 文档：ADR-0037（Proposed）、README/CHANGELOG/CONTEXT、ADR 索引
  （task README）。
- 开发过程修正：守卫初版拒绝手动 entry（`invocationId === undefined`
  早退），放宽后通过；空窗口测试初版 keepRecent=1 实际会压缩
  （[user,assistant] 两条消息），改为 2 触发 keepIndex=0 skip。

## 门禁

- focused：`bun test tests/compact-session.test.ts
  tests/core-owned-entry-admission.test.ts tests/compaction-splitting.test.ts
  tests/compaction.test.ts tests/compaction-events.test.ts tests/recovery.test.ts
  tests/fork-session.test.ts tests/context-lifecycle.test.ts
  tests/model-turn-partial.test.ts tests/closed-tool-call-admission.test.ts`
  → `59 pass / 0 fail / 259 assertions`（10 files；P2 吸收后
  compact-session 增至 11 条、compaction.test 增至 3 条）。
- `bun run verify`：`470 pass / 0 fail / 1920 assertions`，79 test files；
  typecheck/build 通过（41.72s；两次 960s 无输出超时为瞬态负载，重试即
  通过，非代码问题）。
- `bun run pack:smoke`：通过（公开合同变化，prepack 470/0/1920，Bun/Node
   consumer 均通过）。
- `git diff --check` 仅 Windows LF/CRLF warning。

## 结论

- 宿主现在可以显式折叠历史（如长会话开始前或用户要求「总结并继续」），
  复用自动压缩的全部切分合同；手动 entry 无 invocationId、不发布
  invocation-scoped 事件，语义诚实。
- 共享切分抽取后自动路径行为不变（compaction 族 + admission + recovery
  全绿）；守卫放宽面仅限 Harness 内部 `allowCompactionFact` commit。

## 未验证与保留边界

- 真实 NeuroBook/Cosmos consumer、真实 provider/tool、第三方 Store、
  HTTP/SSE、浏览器/产品和生产验收仍未运行。
- 仍为候选：窗口保护（C10，需 Model contextWindow 来源）、自动注入
  （等真实消费者证据）。

## 独立审查

- 只读独立审查（Einstein）：共享抽取后自动路径逐段等价（事件顺序、attempt
  fence、空 summary 抛错位置、keepRecent/cut/skip）、守卫放宽无伪造面
  （`allowCompactionFact` 全仓唯一内部调用点；公开 write/writePlans 以
  allowed=false 调用；无 invocationId 的伪造形态已被 core-owned admission
  测试显式拒绝）、entry 无 invocationId 的投影/恢复无残留依赖；focused
  `55/0/253` 实测一致。**No P0/P1 findings。**
- P2 已吸收：
  - signal 边界：summarize 后补 `signal.throwIfAborted()`（手动路径中止
    可见），ADR-0037 明确「signal 覆盖 read/summarize 阶段，commit 不绑定
    signal（自动路径由 attempt fence + ADR-0034 承担）」；新增 signal
    中止测试；
  - 空 summary 抛错分支双路径测试（手动 + 自动，各 1 条）；
  - compactSession docstring「自动」笔误改为「手动」。
