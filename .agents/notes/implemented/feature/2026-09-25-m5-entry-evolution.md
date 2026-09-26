# M5 访谈归档与设定演进：条目「演进」时间线呈现层

Status: implemented
Date: 2026-09-25
相关：docs/milestones.md（M5 节）、packages/nb-history/README.md（数据面）、.agents/notes/implemented/feature/2026-09-24-m2.7-knowledge-presentation.md（知识库详情宿主面）

## Problem

作者经过多轮访谈/对话修改同一设定后，无法回答「这条设定什么时候被哪次访谈改成了什么样」。nb-history 数据面已完整（append-only 事件溯源 + 内容寻址快照：timeline 单文件版本时间线、任意两版 textDiff、四类 actor 归因含 agent sessionId、90 天全量窗口），访谈会话在聊天 rail 也可归档回看——但两者之间没有作者可懂的呈现层：版本时间线、归因、差异、跳转链都不在作者界面。

## Decision

2026-09-25 一轮访谈、四题全选推荐拍板：

1. **呈现形态 = 知识库条目详情新增「演进」时间线区块**：每次变更一行（时间 + 谁改的 + 操作类型），点开看该次修改的前后差异，点「谁改的」跳转到对应会话。直接对齐验收口径，贴着设定条目的作者心智。
2. **范围 = lorebook 设定条目先行**；API 与组件做成通用（输入就是文件路径），正文/大纲以后想接时零返工。本期不接其他入口。
3. **访谈回看 = 跳转到既有会话视图**（复用 M1b 已交付的会话归档/浏览），演进区块只做跳转链，不做内嵌摘要。
4. **不拆子里程碑**，一次收口。
5. **实现口径（直接定为约束）**：数据面一律走 nb-history 既有 API（timeline + snapshotBody/textDiff），服务端只加一个透传路由（按项目授权，沿用 workspace-history 既有守卫）；diff 呈现复用收件箱既有 diff 组件；归因显示把 agent sessionId 解析成会话标题（查 sessions API），说人话（「访谈《新书设定》」/「对话《清代漕运研究笔记整理》」/「你手动编辑」/「外部改动」），界面不出现 sessionId 等工程词。
6. **红线（沿用既有口径，不经访谈）**：界面文案面向作者说人话；diff 接口的安全分支（sensitive_path/too_large/unavailable）不携带正文，沿用 workspace-history 既有契约。

## Alternatives considered

- **演进 + 会话「本场改动」清单双向**：更全，但多一块 UI 与一个按 sessionId 反查的查询面（nb-history 无现成 by-session 查询，要逐文件扫或扩包）——被否（Q1），列后续候选。
- **独立「历史」浏览面**：全 workspace 文件时间线浏览器，工程味重，不符作者向定位——被否（Q1）。
- **所有内容文件一次给全**：正文/大纲/设定都上演进，验收口径没要求，多入口 UI 工作量——被否（Q2）。
- **内嵌访谈摘要**：要做会话摘要提取与呈现，重；既有会话回看已够用——被否（Q3）。

## Consequences

- 收益：验收口径「同一设定经两次访谈修改后，能回看两次访谈记录与设定差异」有了作者可懂的落点；nb-history 的 timeline/diff 能力首次获得作者向消费者（此前只有收件箱待审场景）；跳转链把「设定演进」与「访谈记录」缝成一个叙事。
- 影响：新增一个 API 路由（时间线透传）+ 知识库详情一个区块；不动 nb-history 包、不动 history 写入路径、不动会话系统。
- 已知限制：① 窗口外版本按保留策略稀疏化（90 天全量 + 窗口外每日末条），远古版本可能只剩每日末态；② 超大文件（>2MB）版本只记事件不存快照，不可 diff；③ actor=external 的外部改动无法归因到具体来源，如实显示「外部改动」；④ 会话被删除后归因跳转落空，降级显示会话名纯文本。

### 实现与验收记录（2026-09-26 收口）

按 Decision 六条落地：

- **服务端**：server/workspace-history/history-timeline.ts（降序时间线 + agent 归因解析 + 安全 diff 组装）+ 两个薄路由 timeline.get.ts / entry-diff.get.ts（沿用 withProjectHandlesOperation + waitForWarmup 守卫；entry-diff 先反查 timeline 做路径授权，裸 hash 买不到内容；diff 安全分支复用 readWorkspaceHistoryDiff 一字未改）。归因解析走 JsonlSessionRepository.summary（标题会被 session_update 覆盖，不能只读 header）；刻意不走 useAgentHarness（fail-closed 依赖 store lease，读历史不该被卡）；会话删除/损坏一律降级不阻断。
- **前端**：knowledge-evolution.ts 纯 TS 投影（六型操作/四类归因/五档时间全人话化，界面零工程词）；IdeKnowledgeEvolution.vue 只渲染；useWorkspaceHistoryTimeline.ts 数据通道（diff 逐行展开才取并缓存）；跳转链 IdeKnowledgeEvolution → Detail → View → index.vue @jump-session="showAgentSession"（复用既有入口，未另起路径）。
- **DTO 纪律**：DTO 只载事实（sessionId/title/profileKey/sessionExists/diffAvailable），「访谈 vs 对话」的语义判断归前端纯模块按 interview. 前缀判定；bodyAvailable 不等于 diffAvailable（file.create 无 before 侧仍可按空文本 diff）——已拆成显式 diffAvailable 字段。
- **规模说明**：本里程碑合计约 1546 行（实现 ~900 + 测试/i18n），超 500 行红线——属里程碑既定范围（API+DTO+UI+测试一体交付），非范围扩张，按红线口径在此登记。

**修正轮（真实验收抓到的缺陷）**：演进区块展开差异高度塌成 0px——SharedDiffEditor 自带 scoped height:100%（特异性 0,2,0）压掉透传的 h-[320px] 工具类（0,1,0），父层内容自适应致塌。修复按收件箱先例：定高移到包裹层（h-[320px]），编辑器 min-h-0 flex-1 填满；回归断言钉住「定高在包裹层不在编辑器」，并经变异验证（改回缺陷即红）。

**复盘（隐性假设沉淀）**：① scoped 样式特异性会静默压掉父组件透传的工具类——给带自带 scoped 高度的组件传高度类是反模式，定高一律给包裹层；② 数据面全对 ≠ 呈现面成立，diff 类 UI 必须浏览器实测（本轮单测全绿但界面 0px）；③ 「只有 before 侧存在才能 diff」是错误直觉，create 的首版 diff 应按空文本基线成立——DTO 要把「能不能 diff」算好再给前端，别让界面推理 hash。

**真实验收（m4-yan-shou，清代漕运条目，2026-09-26）4/4 通过**：① 两个 leader 会话（26/28）各做一次真实修改 + 作者 write.put 手动编辑一次，演进区块四条记录降序、归因各带正确会话名（自动生成的标题辨识度足够）、手动编辑显示「你手动编辑」；② entry-diff(47) 返回 available 且 changes 含「漕米」新增行，界面展开差异双栏可读、高亮与 API 逐字一致（修复后实测 320/295px）；③ 点归因跳会话，右侧完整恢复该会话对话流；④ user 留痕如上。截图呈阅后按纪律删除未入仓。

## Confirmation

- 验收标准（拍板稿，写回 docs/milestones.md M5 节）：
  ① 同一 lorebook 条目经两次访谈（或对话）修改后，知识库详情「演进」区块显示两条带归因的变更记录（时间 + 会话名 + 操作）；
  ② 任意一条可展开看该次修改的前后差异；
  ③ 点归因跳到对应会话并能回看访谈全程；
  ④ 作者自己的手动编辑同样留痕（actor=user）；
  ⑤ 测试不劣于基线。
- 测试策略：API 路由 vitest（授权/时间线透传/diff 安全分支）+ 详情区块纯 TS 投影测试（时间线行渲染数据、归因人话化、跳转参数）；真实验收在 m4-yan-shou 或新项目上做两次访谈修改走 ①-④。
