# ADR-0040: Attachment Reference Content Blocks

- Status: Accepted (standalone Core scope)
- Date: 2026-08-13
- Task: [`01-harness-decoupling`](../tasks/01-harness-decoupling/README.md)

## Context

NeuroBook 黑盒 #3/#6 钉住：durable user message 携带 attachment 引用块（id/mimeType/bytes/name，不存 base64），session reduce 降级为 marker 文本且不读 blob，Provider 侧由宿主 hydrate 回真实图片。规划代理 B（第一百零一轮）判定：SA 的 transcript/reduce/compaction 管线硬编码消费 `agent.message` 投影，宿主纯自持方案意味着 fork 整条管线；而 SA 存储层已能承载块内容（fork-session 测试先例），缺的只是类型合同。blob 存储、authority 索引、admission/预算、base64 hydration 与 marker 文案在 NB 全部是宿主态。

## Decision

- `AgentMessage` 的 user `content` 扩为 `string | readonly AgentUserContentBlock[]`；`AgentUserContentBlock = {type:"text", text} | {type:"attachment", attachment: AgentAttachmentRef, name?}`，`AgentAttachmentRef = {id, mimeType, bytes}`（provider-neutral 引用，不携带数据）。
- 根导出 `userMessageText(userMessage)`：字符串原样返回；块数组拼接 text 块并把 attachment 降级为 `[attachment omitted: mimeType, N bytes, name]` marker（不读 blob）——展示/估算路径的统一入口。
- Core 不定义 blob 存储、授权索引、大小/数量预算、base64 编解码、markdown 解析或 marker 文案策略；hydration 由宿主 ModelRuntime Adapter 负责，估算由宿主 ContextCompactor.estimate 负责。
 - 消费者源级影响仅此一处：此前直接对 user content 做字符串操作（如 `.includes`）的 TS 代码需加 `typeof content === "string"` 收窄。
- JSONL/codec 零格式变化、无版本迁移；旧 JSONL 原样可读；entry 形状不变（块骑在 message.content 上）。
- toolResult 与 assistant 输出不扩块类型（无 NB 已验证语义）；待真实消费者证据另立 ADR。

## Alternatives

- 宿主全自持 durable message 类型与 reduce：拒绝——等于 fork 运行核的 transcript/compaction/context 管线。
- Core 管理 blob 存取：拒绝——blob 是宿主域（NB 的 attachment-store/authority 都在宿主）。
- 一次性把块扩到 toolResult/assistant：暂缓——无消费者证据。

## Verification gate

- 块经 JSONL 往返与投影、userMessageText marker 降级、prepareWrites 块注入（ADR-0039 组合）、fork 复制；机械收窄的既有测试全绿。
- focused、全量、pack:smoke 与独立审查。

## Evidence and acceptance

- 新增 `tests/attachment-content-blocks.test.ts` 4 条；focused 79/0/420（13 files）；全量 504/0/2047、86 files（第一百零四轮口径）；pack:smoke 通过；独立审查（Cicero）无 P0/P1，5 条 P2 全部吸收。
- 2026-08-13 升格 Accepted：NB 黑盒 #3/#6 语义证据 + seam 测试 + 独立审查满足验收；真实图片 hydrate 的端到端行为仍待宿主 ModelRuntime Adapter 验收。
