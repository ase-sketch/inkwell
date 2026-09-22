# M2a 长篇上下文策略三件套：恒定注入 + 按需注入 + 锚点规范

Status: implemented
Date: 2026-09-22
相关：docs/milestones.md（M2a 节）、.agents/notes/proposed/feature/2026-09-21-m2-design-refinement.md（范围拍板）、docs/research/2026-09-21-knowledge-base-taxonomy.md（朋友需求实证）

## Problem

长篇连载场景下，agent 每轮对话看不到未决伏笔与设定条目：伏笔账本（promise.service.ts）只有 UI 与按需工具读，lorebook 条目正文没有任何自动注入路径，aliases/governance 字段定义了但无人读。全文盲喂不可行（上下文窗口）。朋友实证需求要求「AI 维护 + 人工纠偏」，其地基是条目带来源标注与可核验锚点——此前不存在任何锚点机制。M2 细化拍板（2026-09-21）把这三件定为 M2a，知识库检索层并入。

## Decision

三件套全部落在 Profile Turn Context 机制（每轮动态注入、custom_message 落盘）上，只挂 leader.default 一个 profile：

1. **promise-ledger 恒定注入**：新 turn context kind；每轮经 Plot 模块取 listStoryPromises() 过滤 status==='open'，渲染结构化清单注入。上限 10 条 / 1500 字符，零 open 跳过不注入。
2. **mentioned-entities 按需注入**：新 kind；触发源 = 本轮用户输入 + 当前章节正文；扫描 lorebook/**/index.md，按 title/aliases/目录 slug 子串匹配（中文直接包含、纯 ASCII 词边界），命中 top-5 注入条目正文（单条截断 800 字符），零命中跳过。取数/读取异常逐 kind 记 warn 跳过，不让整轮失败。
3. **锚点规范**：content-node-schema 加可选 anchors 数组（{chapter, quote, note?}，向后兼容；新节点默认 anchors: []）；规范全文 assets/reference/content/lorebook-anchors.md——分来源口径：访谈期 source=interview、anchors 留空合法、角色类条目 aliases 必填（非角色类可空）；正文后 AI 沉淀 source=generated、强制 chapter+quote；人工 source=manual。interview.new-book 与 leader.default 的沉淀 prompt 同步按规范改写；模板补注释式骨架。

机制面配套改动：

- validateProfileTurnPlan 上限从「每 plan 最多 1 个 turnContext」放开为「按 kind 去重」（profile-dsl.ts）；profile-sdk 新增 PromiseLedger/MentionedEntities 组件。
- **基座层接线**（2026-09-21 已拍板基座可改走笔记）：neuro-agent-harness.ts +23 行，两处 materialize 调用补 pendingUserMessage/selectedFilePath 入参 + 生命周期释放，无业务逻辑。
- 当前章节口径服务 server/agent/context/current-chapter-context.ts：selectedFilePath 反解 manuscript 路径，frontmatter.chapter 优先、目录名兜底匹配 StoryChapter.name，未命中返回 null。
- 章节就绪门按保守口径：selectedFilePath 指向章节 **且** Plot 关联成功才把章节正文纳入触发，否则降级只用用户输入（可一处开关放宽，测试两口径均覆盖）。

## Alternatives considered

- **注入塞 ModelContext**：profile 侧拿不到 Plot DB 句柄（ProfilePrepareContext 无 project module 通道），要新开跨层契约——被否，turn context 物化器在 server 侧天然有句柄。
- **Import 注入当前项目文件**：isAllowedImportPath 白名单不允许读项目 workspace 文件——此路不通，非选型。
- **锚点塞 ext 自由对象**：验收要机器抽查「5 条均有锚点」，自由对象不可校验——被否，立正式可选 schema 字段。
- **全量引入 SillyTavern keyword/secondary_keys/priority 机制**：字段多、语义重，当前只有 title/aliases 两个匹配源的真实需求——被否，列远期备选（docs/research/2026-09-20-lorebook-taxonomy.md）。
- **嵌入向量召回替代精准匹配**：成本与复杂度远超当前 30 条目级规模的需求，且朋友需求实证是「可核验、可感知」的检索——被否。
- **interview.new-book 同步挂注入**：访谈期没有伏笔与成规模条目，注入纯噪声——被否（访谈拍板 Q2）。
- **M2a 顺带做注入可见 UI**：与 M2.7 呈现层重叠——被否，可观测性=落盘回查+测试断言（访谈拍板 Q4）。

## Consequences

- 收益：对话轮次具备长篇记忆（未决伏笔恒定在场、提及实体自动带上设定）；锚点规范为 M2.7 呈现层与 M3 审稿引用打好数据地基；骨架（turn context 多 kind）为后续注入类型开路。
- 影响：基座 harness +23 行（登记在此）；leader.default 每轮多两条注入（有字符上限，token 成本可控）；assets/workspace/ 下 profile 源与模板受 .gitignore 的 workspace/ 规则通配忽略，提交需 git add -f。
- 已知限制：① 章节就绪门保守（Plot 未关联的章节只按用户输入触发）；② followup/continue/steer 轮次无 pendingUserMessage，mentioned-entities 仅靠章节触发；③ mentioned-entities 每轮全量扫描 lorebook（无缓存），条目规模大后是常驻成本；④ 提示词层契约（显式写 anchors/aliases）无法被 schema 机械强制，门禁靠静态断言测试 + 人工 reviewed。
- 测试框架纪律：仓内 345 个测试文件用 vitest 导入，bun test 可兼容跑但 vitest 不能跑 bun:test——新测试一律 vitest 导入（本次两个文件曾误用 bun:test，已修正）。

## Confirmation

- 服务端测试：注入 16 条（profile-turn-context-injection.test.ts，真实 fs 夹具）+ 落盘回归 13 条（interview-anchor-writeback.test.ts，真实 YAML+Zod 解析链 + 编译后 prompt 静态断言）+ schema 8 条 + turn-context/dsl/章节口径 既有与新增全绿；变异测试证明测试绑定行为（去 open 过滤 → 2 红；关 alias/预算/截断 → 6 红，均还原）。
- 编译：两个改动 profile 编译 EXIT=0。
- 里程碑验收（docs/milestones.md M2a 节）：**2026-09-22 真实 LLM 实证通过**——新项目 m2a-yan-shou-2（32 条目含 24 干扰项、7 伏笔=5 open+1 fulfilled+1 abandoned、章节正文），leader.default 四轮真实对话：6/6 次 promise-ledger 注入精确（5 open 全覆盖、0 已闭泄漏）；6/6 次 mentioned-entities 精确（别名「云哥/楼主」与 title 全命中、章节正文命中黑鸦堡、零无关泄漏）；模型实际引用注入内容作答，并主动引用锚点规范拒绝在无正文依据时编造 quote（正确区分 interview/generated 口径）。锚点机器门禁由 m2a-context-acceptance.test.ts 常驻。
- 已知小问题（后续抛光，不阻塞）：用户输入含「lorebook」一词时目录 slug 会命中 lorebook 根节点（世界书说明文件）造成轻度过命中。
- API 驱动教训：Nitro 路由后缀不进 URL——/api/projects/open.post 会被 SPA fallback 吃掉返回 200 HTML，正确路径是 /api/projects/open；项目数据面需要先 open + presence SSE 保活（presence 归零进 grace 后数据面 409）。
