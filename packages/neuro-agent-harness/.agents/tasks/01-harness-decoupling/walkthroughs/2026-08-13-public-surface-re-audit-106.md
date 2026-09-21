# 第一百零六轮：公开 API 面再审计 + pack consumer 新导出钉住

## 状态

第 97 轮审计后第 98-105 轮新增 8 轮公开 API，本轮重做 root exports ↔ README ↔ CHANGELOG ↔ CONTEXT ↔ pack consumer 交叉审计，并让打包消费者钉住新导出。审计/脚本轮，无 src/测试行为变更（工作区口径，含用户保护 tests/context.test.ts 的前序未提交改动，未纳入本轮）。

## 审计矩阵

- 枚举 19 个 src 模块全部 `export` 声明与 index.ts 重导出面；index 对 session-transcript 只重导出 5 个具名符号（createAgentMessageEntryDraft/invocationPartial/invocationUsage/AgentMessageEntryDraftOptions/InvocationPartial），其余（projectSessionTranscript/sessionMessages/messageFromEntry/addTokenUsage 等）为模块内共享 helper，不构成根导出面。
- 第 98-105 轮新增公开面逐项核对：phase stage 归因、FollowUpQueueState.pausedBy.invocationId、ModelRuntime.contextWindow、appendEntries/listSessionIds、ADR-0039 单源注入、AgentAttachmentRef/AgentUserContentBlock/userMessageText（ADR-0040）、RetryOptions/WaitForFollowUpQueueDrainOptions/HarnessAdmissionError/AbortBoundaryError/InvocationWriteFenceError（C3）——README/CHANGELOG/CONTEXT 均有对应条目，无缺口。
- 缺口确认项：messageFromEntry 从 session-transcript 模块导出但未进 index——保持非公开（内部共享 helper，第 103 轮 P2-1 复用点）。

## 变更（pack consumer）

- - `scripts/pack-smoke.ts` Bun 与 Node 双 consumer 扩展：值导入（AbortBoundaryError/HarnessAdmissionError/InvocationWriteFenceError/userMessageText）+ 类型导入（AgentAttachmentRef/AgentUserContentBlock/RetryOptions/WaitForFollowUpQueueDrainOptions）。值导出经双 consumer 运行断言钉住（admissionError instanceof Error 且 name、userMessageText marker 含 attachment omitted、两个错误类为 function）；类型形状经 Node consumer 的 tsc（skipLibCheck:false）钉住（Bun consumer 不做类型检查）。

## 门禁

- pack:smoke 通过：prepack 单命令 verify 508/0；tarball 113 files / 152.1 kB；Bun/Node ESM consumer 新检查全过。
- - 无 src/测试行为变更（用户保护 tests/context.test.ts 的前序改动除外），focused/全量沿用第 105 轮基线（87 files、508/0/2059，工作区口径）。

## 未验证与保留边界

- 真实 NeuroBook/Cosmos consumer、真实 provider/tool、HTTP/SSE、浏览器/产品和生产验收仍未运行。
- 后续候选：真实消费者接入证据（宿主侧动作）、toolResult/assistant 输出块类型（待消费者证据）。

## 独立审查

- 待独立审查代理复核（只读）：审计矩阵与导出事实一致、pack consumer 新检查真实钉住、无 src/测试行为变更、台账回写一致。
