# 第一百零一轮：多角度规划（API 形态 / 附件吸收 / 自动注入证据复核）

## 状态

纯规划轮：三路只读代理 + 外部证据复核，确定第 102-104 轮方向。无 src 变更。

## 外部证据复核

- NB：server/agent 自 2026-08-08 仍无新提交（HEAD 844abc2）——parity 吸收源继续穷尽。
- Cosmos：Task 06/07 走 nb-workflow 收敛路线（Deferred Activity 稳定 → Cosmos Activity Job/Durable Host），不产生新的 SA Core 消费缺口；SA 保持 ADR-0001 边界（Harness 提供 provider-neutral ports，Cosmos 持有 Run/Job/Lease/Outbox）。

## 规划代理 A（API 形态，Gibbs）：值得执行

覆盖一致性无回归（第九十七轮已修），但按消费者视角有三个易用性缺口：

- C1：自定义 SessionStore 合同零文档（SessionStore 六方法 + normalize/reduce 复用点），现成合同套件 tests/store-contract.ts 不随包分发；README 只承诺「未来可接 Prisma」。建议 README 加「实现自定义 SessionStore」节 + verifyNumericStore 泛化后经 testing 导出（非破坏）。
- C2：高频样板缺原语——追加宿主条目需手拼五层 SessionWritePlan；JSONL 无会话枚举（重启后宿主自维护 sessionId 索引）。建议 harness.appendEntries(sessionId, drafts, options?) 与 JsonlSessionStore.listSessionIds()（非破坏、纯新增）。
- C3：retry 第 3/4 参判别联合+游离参数、无 signal；AbortBoundaryError 未导出；公共 admission 大量抛裸 Error；waitForFollowUpQueueDrain 借名 WaitForInvocationOptions。建议统一 retry(options) + 导出错误类型（retry 改 options-only 需兼容重载）。
- 文档偏差（(d)）：README compactSession 未写 ContextCompactor 前置条件；createAgentMessageEntryDraft 选项漏 parentId；根导出清单漏 caller/coordination/entry-codec/profile-registry 模块与错误族。

## 规划代理 B（附件吸收，Mill）：建议最小 Core seam

- NB 黑盒 #3/#6 合同：durable user message 携带 attachment 引用块（id/mimeType/bytes/name，不存 base64），reduce 降级为 marker 文本且 marker 绝不进 Provider，Provider 侧由宿主 hydrate 回真实图片。
- 宿主态（不进 Core）：blob Store、authority 索引、admission/预算、hydration、marker 文案、markdown 解析。进入 transcript 的只有引用块与 projection entry。
- SA 证据：agent.message payload 直接 JSON 往返无内容校验，fork-session.test.ts 已在 Core 测试写入块数组——存储层能承载块，缺的是类型合同；纯宿主方案意味着消费者 fork 整个 transcript/reduce 管线。
- 建议形状：AgentContentBlock = {type:"text"} | {type:"attachment", attachment:{id,mimeType,bytes}, name?}；user.content: string | readonly blocks；entry 形状不变；JSONL 零迁移。连锁成本：model.ts 联合、用户消息入口、约 8+ 测试文件机械收窄 + 新用例；tests/context.test.ts 属用户保护文件需特别小心。

## 规划代理 C（自动注入，Pauli）：升级吸收（限定范围）

- NB 有测试钉住的「写入后同 Invocation 对模型立即可见」：neuro-agent-harness.test.ts:6685（AppendingSet 写入后本轮 provider context 出现恰好一次）与 :6726-6767（首轮数到 2 个 user 消息）；代码路径为 prepareRun 写后重读 snapshot（neuro-agent-harness.ts:1970/2011/2039-2056）+ appendingCount 结构性去重。
- 边界：NB hook writePlans 只允许 custom 条目、Tool 无 writePlans——同轮注入只覆盖 prepare 阶段 plan 消息（SA prepareWrites 类比），Tool/hook writePlans 无 NB 对应物，明确不吸收。
- - SA 破坏面：现存写后可见性消费方（context-lifecycle test 2-4：双写与 hook 单写混合）与第九十一轮钉住测试需按新合同迁移（改单写/显式去重），顺序变化（贡献插到当前用户消息前）与 NB 固定分区一致；需要单独 ADR（迁移、去重、排序、compaction 交互）。

## 综合决定

- 第 102 轮：执行 A-C2（appendEntries + listSessionIds，非破坏纯新增）+ A-(d) 文档偏差修复 + C1 的 README 文档节。
- 第 103 轮候选：自动注入 ADR（prepareWrites 限定吸收，含消费方迁移）——证据门槛已满足。
- 第 104 轮候选：attachment 最小 Core seam（ADR 先行）。
- C3 留待第 103 轮后按消费者反馈排期。

## 独立审查

- 待独立审查代理复核（只读）：三份代理结论的关键 file:line 与本轮 walkthrough 转述一致、无过度声明；Task 台账回写一致。
