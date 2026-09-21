# 第九十八轮：InvocationError.phase 的 stage 级归因（D2 吸收）

## 状态

第八十八轮 parity 审计代理 A（Boole）的 D2（P2）落地：Run Kernel 内部
stage 失败在 `InvocationError.phase` 上细粒度归因（对齐 NeuroBook
RunKernelStageError）。`src/` 变更 + 测试 + 文档；用户保护文件未纳入范围。

## 规划依据（Boole D2 + NB run-kernel-error.ts）

- Boole 证据：NB 用 `withRunKernelPhase`（run-kernel-error.ts:25-35）在
  model/ingest/compaction/settleRun 边界做 stage 归因；SA 只有
  `"run"/"abort"/"approval"` 粗粒度 phase（harness.ts toInvocationError
  fallback），测试几乎不覆盖 phase。
- `InvocationError.phase` 是自由 string（session.ts:21），加值不破坏
  公开类型；canonical-schema-value-admission.test.ts:913 钉住 harness 产出的 phase:"run"（抛点在四个包装之外），细化不破坏该断言。

## 变更

- `src/harness.ts`：
  - 新增私有 `RunStageError(stage, cause)`（保留 cause 属性）与
    `withRunStage(stage, action)` 包装；
  - `toInvocationError` 优先提取 `RunStageError.stage` 为 phase，name/
    retryable 从 cause 继承（`SessionConflictError` 的 retryable 语义
    不变）；
  - 包装 4 个 stage：`model`（runTurn，ModelTurnError 的 usage/partial
    捕获保留在包装内）、`ingest`（user/assistant/toolResult/steer 的
    transcript 提交）、`compaction`（compactIfNeeded）、`settleRun`
    （settleRun hooks + parseOutput + terminal finish，settledOutput
    局部变量避免闭包收窄丢失）；未包装阶段保持 `run` fallback。
- 新增 `tests/run-stage-phase.test.ts` 6 条：model/compaction/settleRun/
  ingest 归因 + beforeTurn fallback 保持 run + ingest 包装内
  SessionConflictError 的 name/retryable 继承（审查 P2-6）；ingest 用
  FailingIngestStore 子类注入失败。
- 回归修复：初版 `RunStageError` 未存 cause → `follow-up-consume-recovery`
  两条 `SessionConflictError` name 断言变 "Error"（2 fail）；补 cause 属性
  后全绿。
- `CHANGELOG.md` / `CONTEXT.md` 新增 phase 归因条目。

## 绕道：apply_patch 工具故障

- 本轮开始后 `apply_patch` 连续多次返回 aborted（包括最小占位 patch），
  测试文件与 src 编辑全部改用 PowerShell 精确行级手术（自底向上
  SwapRange）完成；期间一次 InsertRange 类型转换失败导致类块被删未插，
  已按行号定位并修复；settleRun 块替换的结束行匹配曾误中 runHooks 内部
  `});`，残留 4 行旧尾已清理。最终 typecheck + 全部测试通过。

## 门禁

- focused：`bun test tests/run-stage-phase.test.ts tests/turn-failure-events.test.ts
  tests/model-turn-partial.test.ts tests/model-turn-error.test.ts
  tests/compaction.test.ts tests/compaction-splitting.test.ts
  tests/abort-boundary.test.ts tests/approval.test.ts` →
  `60 pass / 0 fail / 243 assertions`（8 files）。
- 全量：逐文件循环全部通过（81 files，478 pass / 0 fail / 1954
  expectations，工作区口径含用户保护 tests/context.test.ts 本地改动；本
  Task 提交范围口径 80 files、471/0/1903）；typecheck/build 通过。全量单次
  命令两次 25 分钟停滞为环境问题（同日上午已多次），分块为同一测试集合。
- `bun run pack:smoke`：通过（60s；公开错误字段行为变化，prepack +
  Bun/Node consumer 均通过）。
- `git diff --check` 通过：审查 P2-4 发现的 4 处空行尾随空格与若干前导空格已修复。
- 默认 test 脚本保持 `bun test --parallel=1`（第 89/93 轮结论）：本轮曾把 test 临时换成 timeout 包装器以应对两次 25 分钟全量停滞，但该改动与已提交文档口径矛盾、且包装器曾在第 93 轮被判定为尾部停滞诱因之一，最终恢复 HEAD 状态；本机全量口径保持逐文件循环 + 分块汇总。

## 结论

- `InvocationError.phase` 现在能定位失败发生在哪个 Run Kernel stage
  （model/ingest/compaction/settleRun），宿主诊断不再只有 run/abort/
  approval；`SessionConflictError` 的 retryable 语义与 ModelTurnError 的
  usage/partial 捕获均保持不变。

## 未验证与保留边界

- 真实 NeuroBook/Cosmos consumer、真实 provider/tool、第三方 Store、
  HTTP/SSE、浏览器/产品和生产验收仍未运行。
- abort×stage 组合语义（审查 P2-1）：错误发生在包装内时 phase 优先取
  stage（aborted 状态下可能为 model/compaction/ingest 而非 abort），仓库内
  无测试钉住该组合；stage 优先是设计意图，留待真实消费者验收确认。
- 仍为候选：窗口保护（C10，需 Model contextWindow 来源，证据不足暂缓）、
  自动注入（等真实消费者证据）、Boole D3（带内 terminal stopReason，
  ADR-0015 暂缓）。

## 独立审查

- 独立审查（Franklin，只读）：无 P0/P1。focused 实测 59/0/239（修复前）。6 条 P2 全部吸收：
  P2-1 abort×stage 语义落保留边界；P2-2 修正「无测试钉住 phase」陈述；
  P2-3 全量口径注明工作区 vs 提交范围；P2-4 修复文档空格；P2-5 审查落定后勾选 checklist；P2-6 补 ingest 内冲突 name/retryable 直断言（focused 60/0/243、全量 478/0/1954）。
