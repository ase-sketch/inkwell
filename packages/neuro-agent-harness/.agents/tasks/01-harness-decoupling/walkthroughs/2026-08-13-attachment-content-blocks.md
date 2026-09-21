# 第一百零四轮：attachment 引用内容块最小 Core seam（ADR-0040）

## 状态

规划代理 B 的方案落地：user 消息 content 扩为 `string | readonly AgentUserContentBlock[]`，attachment 块只携带 provider-neutral 引用（id/mimeType/bytes/name?）；blob/授权/hydration 留宿主。类型合同 + marker 助手 + 4 条 seam 钉住测试 + ADR-0040（Proposed）。

## 规划依据（规划代理 B）

- NB 黑盒 #3/#6：durable user message 携带 attachment 引用块，reduce 降级 marker 不读 blob，Provider 由宿主 hydrate 真实图片；blob store/authority/admission/预算/marker 全是宿主态。
- SA 证据：agent.message payload 直接 JSON 往返无内容校验；fork-session 测试已在 Core 写入块数组——存储层能承载块，缺类型合同；宿主纯自持方案需 fork transcript/reduce 管线。

## 变更

- `src/model.ts`：`AgentAttachmentRef {id, mimeType, bytes}`、`AgentUserContentBlock = text | attachment(+name?)`；user `content: string | readonly AgentUserContentBlock[]`；根导出 `userMessageText`（字符串原样 / 块拼接 + attachment 降级 `[attachment omitted: mimeType, N bytes, name]`，不读 blob）。
- 机械收窄：active-profile-steer-admission（3 处 steerContent/content 提取加 typeof 收窄）、message-identity（4 处）、context-lifecycle（2 处 toEqual 期望改 JSON round-trip 等价对象）。src 无 user content 字符串假设（只构造字符串）。
- 新增 `tests/attachment-content-blocks.test.ts` 4 条：userMessageText marker、JSONL 往返投影、prepareWrites 块注入（ADR-0039 组合）、fork 复制 + estimate 收到块消息。
- `docs/adr/0040-attachment-reference-content-blocks.md`（Proposed）；CHANGELOG/CONTEXT/README 同步。

## 门禁

- - 新文件 4/0/14；typecheck 通过。
- - focused：79 pass / 0 fail / 418 expect（13 files）。
- focused：79 pass / 0 fail / 420 expect（13 files，含审查 P2 补的投影与 estimate 断言）。
- - 全量逐文件循环：86 files、504 pass / 0 fail / 2045 expect。
- 全量逐文件循环：86 files、504 pass / 0 fail / 2047 expect。
- - pack:smoke 通过（prepack 单命令 verify 504/0；tarball 113 files / 151.1 kB；Bun/Node consumer）。

## 未验证与保留边界

- 真实 NeuroBook/Cosmos consumer、真实 provider/tool、HTTP/SSE、浏览器/产品和生产验收仍未运行；真实图片 hydrate 需要宿主 ModelRuntime Adapter，不在本仓库验证。
- toolResult/assistant 输出块类型未扩（无 NB 证据）；C3（retry 签名/错误面收敛）仍为候选。

## 独立审查

- 待独立审查代理复核（只读）：类型联合与投影/注入/压缩路径兼容、userMessageText marker 口径、机械收窄无行为变化、4 条测试一致性、focused/全量数字。
- 独立审查（Cicero，只读）：无 P0/P1。5 条 P2 全部吸收：P2-1 删除 message-identity 两处重复收窄行；P2-2 fork 测试的 estimate 断言改为真实窗口守卫调用（contextWindow + 捕获块消息断言）；P2-3 台账把 9 处归类修正为「7 处 typeof 收窄 + 2 处等价对象改写」；P2-4 测试名兑现「并投影」（补 sessionMessages 投影断言）；P2-5 类型拼写补 readonly + ADR/CHANGELOG 补消费者 typeof 收窄提示。focused 实测 79/0/418（吸收前）。
