# 第九十九轮：NB 黑盒终态语义吸收（pausedBy 终态原因 + 三边界钉住）

## 状态

NeuroBook 黑盒验收套件（server/agent/harness/neuro-agent-harness.black-box.test.ts，26 场景）映射 SA 能力矩阵后的真实缺口吸收：failed/aborted 终态自动暂停 follow-up（对齐 NB pauseFollowUps）+ 3 条设计分流/守卫边界钉住。`src/` 变更（watchFollowUps 终态分支 + pausedBy invocationId 投影扩展）+ 测试 + 文档；用户保护文件未纳入范围。
NeuroBook 黑盒验收套件（server/agent/harness/neuro-agent-harness.black-box.test.ts，25 场景）映射 SA 能力矩阵后的真实缺口吸收：failed/aborted 终态自动暂停 follow-up（对齐 NB pauseFollowUps）+ 3 条设计分流/守卫边界钉住。`src/` 变更（watchFollowUps 终态分支 + pausedBy invocationId 投影扩展）+ 测试 + 文档；用户保护文件未纳入范围。

## 规划依据（NB black-box 26 场景矩阵）
## 规划依据（NB black-box 25 场景矩阵）

- 26 场景逐一映射 SA 测试矩阵：22 场景已有等价覆盖（事件/admission/abort/approval/partial/SSE replay 等），4 项为真实缺口或未钉边界：#15 terminal error 后清理 steer 并暂停 followup queue、#17 Running+abort 按 aborted 暂停 followup、#13/#14 tool throw=fatal 与返回 isError 恢复的分流、#21 settleRun 迟到写 guard（行为已成立、无测试钉住）。
- 25 场景逐一映射 SA 测试矩阵：21 场景已有等价覆盖（事件/admission/abort/approval/partial/SSE replay 等），4 项为真实缺口或未钉边界：#15 terminal error 后清理 steer 并暂停 followup queue、#17 Running+abort 按 aborted 暂停 followup、#13/#14 tool throw=fatal 与返回 isError 恢复的分流、#21 settleRun 迟到写 guard（行为已成立、无测试钉住）。
- NB 证据：pauseFollowUps（neuro-agent-harness.ts:6429-6441）队列空则跳过；terminal error 用 reason "error"、强制取消 "aborted"；forceAbortInvocation 在 lifecycle 前先 pause。
- parity 源确认穷尽：NB server/agent 自 2026-08-08 无新提交；NB 会话 JSONL 为 header/entry/batch schema，与 SA snapshot/commit schema 不同，属宿主自有资产（不承诺互读）。

## 变更

- `src/harness.ts`：watchFollowUps 终态分支——completed 照旧 startNextFollowUp；failed/aborted 调 `pauseFollowUpsOnTerminal(sessionId, invocationId, reason)`。helper 读最新 Snapshot，队列非空且未暂停时 CAS 写入 `harness.followUp.paused {paused: true, itemId: 队首, reason, invocationId}`（cause `harness.followUp.autoPauseTerminal`）并发布 `follow_up_state`；失败吞掉、不掩盖终态。
- `src/coordination.ts`：`FollowUpQueueState.pausedBy` 新增可选 `invocationId`（仅终态暂停携带；admission_failed 形状不变）。
- `src/follow-up-ledger.ts`：投影透传字符串 `invocationId`。
- 新增 `tests/nb-terminal-parity.test.ts` 7 条：failed/aborted 终态 pause（pausedBy 精确载荷 + pause 事实）、空队列不写事实、JSONL 重启恢复 + resume 完成、tool throw 可恢复继续（显式 terminate 致命）、终态未消费 steer 不注入模型/transcript、强制取消后 settleRun 迟到 writePlans 拒绝。
- `CHANGELOG.md`/`CONTEXT.md`/根 `README.md` follow-up 段/`ADR-0018` 2026-08-13 扩展节同步。

## 设计分流（记录）

- SA Tool 抛异常 = 可恢复 error toolResult（模型继续）；致命意图 = 显式 `ToolResult.terminate`（tool_terminate）。NB 为隐式 throw=fatal，不照搬（显式 terminate 更贴合 API 可预期性，意外抛错不会杀死 Invocation）；测试钉住。
- 终态 pause 晚于终态结果 resolve 异步落盘（与第九十三轮 admission pause 同模式）；宿主用 `follow_up_state` 事件或轮询 `followUpState` 观测。NB 在 terminal mutation 内同步 pause；SA 保持既有 post-settle 模式，队列不丢项、resume/cancel 语义一致。
- 终态 pause 晚于终态结果 resolve 异步落盘（与第九十三轮 admission pause 同模式）；宿主用 `follow_up_state` 事件或轮询 `followUpState` 观测。NB 在 terminal mutation 内同步 pause；SA 保持既有 post-settle 模式，队列不丢项、resume/cancel 语义一致。终态 pause 为单次 best-effort：宿主并发写（cancel/reorder/resume/新 invoke）使 CAS 冲突时 pause 事实静默丢失（不重试、不重发 follow_up_state），队列可能保持未暂停悬置，需宿主据 follow_up_state/轮询干预（审查 P2-2 记录）。
- 终态原因值：failed → "error"、aborted → "aborted"（对齐 NB）；admission 路径保持 SA 既有 "admission_failed"（与 NB "admission_error" 的分流为第九十三轮既有合同）。
- NB steerQueue 是 durable 产品 DTO；SA steer 为 runtime-only（终态即弃），测试钉住「不注入模型或 transcript」。

## 门禁

- red→green：新文件先 3 red（failed/aborted/JSONL pause 缺失）4 green；实现后 7/0/31。
- focused：81 pass / 0 fail / 324 expect（14 files）。typecheck/build 通过。
- focused：81 pass / 0 fail / 325 expect（14 files）。typecheck/build 通过。
- 全量逐文件循环：82 files、485 pass / 0 fail / 1985 expect。
- 全量逐文件循环：82 files、485 pass / 0 fail / 1986 expect。
- `bun run pack:smoke` 通过：prepack 单命令 verify 485/0/1985（41.55s，本次未复现停滞）、tarball 113 files / 146.2 kB / 670.9 kB unpacked、Bun/Node consumer 均通过。

## 未验证与保留边界

- 真实 NeuroBook/Cosmos consumer、真实 provider/tool、HTTP/SSE、浏览器/产品和生产验收仍未运行；NB 无新 harness 变更可吸收（08-08 后无 server/agent 提交）。
- 仍为候选：C10 窗口保护（需 Model contextWindow 来源）、自动注入 ADR（等真实消费者迁移证据）、NB reason "interrupted" 终态暂停（SA 无对应进程内路径，恢复由 reconcile-interrupted 承担）、图片/附件 durable 内容（NB 附件为宿主域，SA transcript 目前 text-only，需独立 ADR 才扩）。

## 独立审查

- 待独立审查代理复核（只读）：watchFollowUps 终态分支、pauseFollowUpsOnTerminal 的 CAS/幂等与失败吞掉、投影 invocationId 透传、7 条测试与实现一致、focused/全量数字。
- 独立审查（Epicurus，只读）：无 P0/P1。focused 实测 81/0/324（14 files）。3 条 P2 全部吸收：P2-1 场景数 26→25（等价覆盖 22→21）修正；P2-2 终态 pause 的 CAS 冲突静默丢 pause 已写入 walkthrough/ADR-0018/CHANGELOG；P2-3 两条固定 20ms 缺席断言改为 dispose 后排空背景后读 Store（A3）与 3×10ms 稳定采样 + dispose 后复检（D1），并修掉 D1 二次 invoke 同名 entry 的误判（第二次 invoke 的 settleRun 钩子合法写同一 kind，终态断言只对第一次迟到写成立）。
- 独立审查（Epicurus，只读）：无 P0/P1。focused 实测 81/0/324（14 files，吸收 P2-3 后最终 81/0/325）。3 条 P2 全部吸收：P2-1 场景数 26→25（等价覆盖 22→21）修正；P2-2 终态 pause 的 CAS 冲突静默丢 pause 已写入 walkthrough/ADR-0018/CHANGELOG；P2-3 两条固定 20ms 缺席断言改为 dispose 后排空背景后读 Store（A3）与 3×10ms 稳定采样 + dispose 后复检（D1），并修掉 D1 二次 invoke 同名 entry 的误判（第二次 invoke 的 settleRun 钩子合法写同一 kind，终态断言只对第一次迟到写成立）。
