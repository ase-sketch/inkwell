# M4 参考资料阅读：公开资料 → 摘要笔记（双层存放 + leader 编排）

Status: implemented
Date: 2026-09-25
相关：docs/milestones.md（M4 节）、.agents/notes/implemented/feature/2026-09-22-m2a-context-injection.md（检索注入骨架）、.agents/notes/implemented/feature/2026-09-24-m2.7-knowledge-presentation.md（知识库视图）、.agents/notes/implemented/feature/2026-09-25-m3-chapter-critique.md（内置 skill 交付形态）

## Problem

作者开书前/卡文时需要联网查公开资料（题材惯例、历史背景、职业细节等），消化成能反复引用的笔记。基座已有 researcher 子代理（web_search/web_fetch）与 reference/ 目录约定（外部素材、低置信、验证后毕业进 lorebook/），但三者之间没有通路：researcher 的回答只活在对话里，reference/ 作者界面不可见，lorebook 检索够不到外部资料。M4 要把「搜 → 读 → 消化 → 落笔记 → 可见可引用」打通。

## Decision

2026-09-25 两轮访谈、六题全选推荐拍板：

1. **双层存放**：原始摘录与完整笔记存 `reference/research/{主题}/`（低置信区，符合基座目录约定）；消化结论**经作者确认后**写 `lorebook/note/` 摘要条目（毕业）。沿用 novel-genre-research skill 的「结论落地」既有路径，不新造约定。
2. **执行角色 = leader.default 编排现有 researcher 子代理**，对话自然触发（「帮我查一下…」），零新 profile；流程纪律（≥3 来源、笔记格式、来源 URL 清单、确认后毕业）固化成**内置 research skill**（assets 种子区，shen-gao/ka-wen 同款形态，作者可同名覆写）。
3. **范围只做公开资料 → 摘要笔记**；范文/对标书路径已由 novel-genre-research skill 覆盖，不重复建设。
4. **可见性 = 知识库视图加「参考资料」独立分组**：lorebook/note 下的调研摘要条目（按 category=note + 约定口径识别）单独成组，与阵营 tab 并列，不落「未分组」桶。投影层 + 视图小扩展。
5. **可引用 = 双通道**：① lorebook/note 摘要条目被 mentioned-entities 对话提及自动命中（检索层零改动，M2.7a 徽标可见）；② reference/ 完整笔记用聊天输入 @引用 chip 手动带（已支持 reference/ 前缀）。
6. **不拆子里程碑**，一次收口。
7. **顺手修正写域白名单错别字**：profile-write-scope.ts 的 `references/` 与 leader.default prompt 同款错字 → `reference/`。该缺陷此前未爆是因为番茄导入走 bash 脚本绕开文件写工具；M4 要求 leader 用文件写工具落笔记，必须修。
8. **红线（直接定为约束，不经访谈）**：研究查询词不得携带正文原文或未公开设定细节外发（题材级关键词允许）；笔记必须带来源 URL 清单（researcher prompt 已强制 Markdown link 来源）。

## Alternatives considered

- **仅 reference/ 文件存放**：最贴基座目录语义，但「workspace 可见」需新开 UI 面（reference/ 当前被作者界面刻意隐藏），工作量最大——被否（Q1）。
- **仅 lorebook/note 条目**：零新 UI 最小工作量，但外部未验证资料直接进设定库，违背基座低置信→毕业约定，检索噪声风险——被否（Q1）。
- **新专用薄 profile research.topic**（M3 review.chapter 模式）：链路易控，但新增 profile 的三处登记与维护面；现有 researcher + leader 写文件已能覆盖——被否（Q2）。
- **扩展自动检索扫 reference/research/**：提到主题词自动带完整笔记，更省心；但引入噪声与每轮扫描成本，且低置信原文自动进上下文违背毕业约定——被否（Q5）。
- **知识库不加分组、落未分组桶**：零 UI 开发，但笔记一多可发现性差——被否（Q4）。
- **顺带打磨范文路径**：范围变大且既有 skill 已覆盖——被否（Q3）。

## Consequences

- 收益：研究链路全通且不新造约定（双层存放沿用基座、skill 形态沿用 M2c/M3、检索引用复用 M2a）；写域错别字修正让 reference/ 首次可被交互 profile 文件工具写入。
- 影响：知识库投影层契约扩一条分组口径（测试同步）；leader.default 写域从「名义上有 references/」变为「实际可写 reference/」——写域变宽，属有意的缺陷修正。
- 已知限制：reference/ 全文仍不进作者界面（@引用 chip 可达即满足本期口径）；自动检索命中依赖条目标题/别名与作者措辞匹配，措辞偏离时不命中（M2a 既有口径）；研究质量取决于 web_search provider 配置（无 key 时 researcher 如实报不可用）。

### 实现与验收记录（2026-09-25 收口）

按 Decision 八条落地：

- **写域错别字修正**：profile-write-scope.ts 与 leader.default prompt 各一处 references/ → reference/（全仓无 references/ 调用方，收窄零破坏）；回归测试钉住 reference/research/ 放行、references/ 不再放行、manuscript/ 仍拒；编译后 prompt 声明由 redline 测试断言。
- **research skill**：assets 种子区新建（144 行），含来源纪律（≥3 来源、URL 清单、单源引文 ≤125 字符）、查询红线（禁带正文原文/未公开设定，题材级关键词允许）、双层落盘契约与毕业契约（governance.source: imported——generated 强制正文锚点、研究资料填不出会踩门禁；毕业不改来源，确认只体现为 review: reviewed + status: active）。8 个静态断言常驻。
- **知识库「参考资料」分组**：投影层三档优先级（参考资料 > 阵营 > 未分组），视图层只消费 reference 标志（契约测试反向钉死）；knowledge 94 用例全绿。
- **全量套件**：3829 通过 / 4 失败全为既有基线（profile-compile-worker-preview 与 world-engine-profile 缺 NEURO_BOOK_REPOSITORY_ROOT、file-tools bash ×2 抖动）。
- **真实 LLM 验收（m4-yan-shou 项目，deepseek-v4-flash + tavily）5/5 通过**：① leader 经 invoke_agent 起 researcher（会话 23→24），web_search ×7 + web_fetch ×4，reference/research/清代漕运/ 落盘（source: imported、retrieval.enabled: false、来源清单 15 条真实 URL）；② 作者确认后毕业 lorebook/note/research/清代漕运/（aliases 6 条、refs 指回、review: reviewed）；③ 下一轮提及「漕运」mentioned-entities 注入命中毕业条目（session 23 JSONL custom_message 实证，promptSource labels + retrieval 元数据）；④ 7 条查询词全部题材级、零泄漏；⑤ UI 截图实证「参考资料」分组 tab/卡片/详情（截图呈阅后按纪律删除未入仓）。

**修正轮（验收抓到的真实缺陷）**：leader 毕业时把路径写成 lorebook/note/research/**shi**/清代漕运/（多嵌一层），误建重复目录，导致检索命中两条同名条目、UI 显示重复卡片。归因：模型遵循 skill 路径口径打滑，分组逻辑本身正确。处置：删除重复目录；SKILL.md「常见跑偏」表补一行钉死毕业路径形态（恰好 lorebook/note/research/{主题}/，一层不多）。

**复盘（隐性假设沉淀）**：① 提示词层路径契约无法被 schema 机械强制，模型会打滑——高风险路径形态要写进「常见跑偏」负例表，正例不如负例管用；② 「写域白名单里的目录名」属于编译期查不出的静默失效（references/ 存在了一年无人发现，因为既有消费者都走 bash 绕过文件工具）——写域登记宜配「白名单前缀都有真实目录对应」的静态核对；③ 验收驱动 SSE 保活 + 阻塞式 invocation 即可，无需轮询。

## Confirmation

- 验收标准（拟写回 docs/milestones.md M4 节）：
  ① 对话里给定一个资料主题，leader 经 researcher 收集 ≥3 个公开来源并在 reference/research/{主题}/ 落摘要笔记（带来源 URL 清单）；
  ② 经作者确认后结论毕业进 lorebook/note/，知识库视图「参考资料」分组可见；
  ③ 后续对话提及该主题时摘要条目被自动检索注入（M2.7a 徽标可见）；
  ④ 红线：查询词不携带正文原文/未公开设定细节；
  ⑤ 测试不劣于基线。
- 测试策略：research skill 静态断言（frontmatter/流程纪律）+ 写域修正回归测试（reference/ 可写、manuscript/ 仍拒）+ 知识库投影分组测试（vitest）；真实 LLM 验收走 ①-④。
