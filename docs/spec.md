# Inkwell — 项目规格书（spec）

> 这份文档解决什么问题：Inkwell 是什么、给谁用、做什么、不做什么、在什么约束下做。
> 当前状态：全部章节**已确认**（2026-09-20，阶段 0–1.5 门禁全部通过）

## 项目一句话

Inkwell 是一个本地部署的 Web 应用形态的 agent：**专注小说创作，辅助作者写文**。核心交互理念是**苏格拉底式拷问**——agent 不直接代写，而是通过连续追问帮作者把设定、人物、剧情想清楚（2026-09-20 用户明确，取代最初泛泛的「阅读与辅助写文」定位）。

**阅读侧范围（2026-09-20 已确认）**：保留「读参考资料/范文」——agent 帮收集、消化公开资料与参考文本，为写作服务；阅读是写作的输入侧。

## 目标用户

- 首要：作者本人（业余长篇创作者）
- 次要：朋友（各自本地部署，Windows 环境）

## 核心场景（2026-09-20 已确认，按重要性排序）

1. **开新书引导**：作者有个模糊点子，agent 通过一轮苏格拉底式追问（对话访谈式，一问一答、agent 主导），帮作者把核心设定、主角、核心冲突聊清楚，答案沉淀为设定文档。
2. **卡文追问**：写到一半卡住，agent 追问（「这场戏里谁最难受？」「读者此刻最想知道什么？」），帮作者自己找到出路。
3. **审稿式质疑**：写完一章，agent 挑刺——动机是否成立、伏笔是否回收、是否有 AI 味。

~~暂缓：「日常码字陪伴」（侧边栏随时问答）~~ —— **已落地**（2026-09-21，M1b）：码字态对话以右侧伴随栏常驻，可自由收起。

## 功能清单（按优先级，基于 neuro-book fork 的增量视角）

neuro-book 已有（保留）：世界状态推算、伏笔账本、llmlint（AI 味检查）、编辑器（TipTap/Milkdown 双轨）、Windows 便携打包链、BYOK 多渠道模型接入（pi-ai，约 24 家 provider 模板，含 OpenAI 兼容与 DeepSeek）。

**架构调研关键结论**（2026-09-20，证据见 E:\projects\neuro-book，HEAD=4590627）：
- 「苏格拉底式追问」**不需要新建模块**：上游已有 request_user_input 工具与前端追问气泡，但 leader profile 的 prompt 明确压制追问频率（leader.default.profile.tsx L343/L362）。改造 = 三处：① profile prompt 层；② 会话闸门 server/agent/session/ + harness/prepare-next-turn.ts（追问变阻塞轮次）；③ 聊天面板 AgentChatSurface.vue 等。
- 风险 1：harness 会话协议与 profile 编译产物耦合重，改 agent 行为不能只改 prompt（有编译缓存 GC/新鲜度检查）。
- 风险 2：上游是快速变化的 canary，模型层被钉在 pi-ai 0.80.6；fork 策略应先冻结模型层或编排层之一。
- ~~风险 3：nb-ui PolyForm-Noncommercial~~ —— **已解除**（2026-09-20 用户确认）：Inkwell 将来开源（随 fork 义务采用 AGPL-3.0）、不做商业用途，该许可不构成障碍。
- 风险 4：State Root 双根路径模型 + App/Project 两套 Prisma schema，fork 需改默认数据目录避免与上游已装版本抢数据。

以下是需要**新增/改造**的部分：

- **P0 苏格拉底访谈引擎**：对话访谈式追问框架，支持「开新书引导」与「卡文追问」两种模式；访谈答案自动沉淀为设定文档，写入 workspace。
- **P1 审稿式质疑**：结合 llmlint 与伏笔账本，对章节做动机/伏笔/AI 味审查，输出质疑清单供作者回应。
- **P1 参考资料阅读**：收集公开资料/范文（联网搜索+抓取），消化为摘要与笔记，挂到作品 workspace 供写作引用。
- **P2 访谈归档与设定演进**：访谈记录可回溯，设定随访谈演进有版本痕迹。

## 非目标（2026-09-20 已确认）

- ❌ 不做代写正文：agent 只追问、挑刺、整理，不替作者产出正文
- ❌ 不做发布/投稿：不对接起点、番茄等平台，导出文件即可
- ❌ 不做多人协作：单人作者工具，无实时协同
- ❌ 不做短篇/散文/论文：只服务长篇小说创作

## 约束（阶段 0 · 待用户确认）

| # | 约束 | 类型 |
|---|------|------|
| C1 | 形态为本地 Web 应用：本地起服务、浏览器访问；不是桌面 App、不是手机 App | 硬约束 |
| C2 | 自己 + 朋友使用，**各自在自己电脑上部署**，不做账号系统、不做服务端多租户 | 硬约束 |
| C3 | 模型接入走 **BYOK（自带 key）**：必须支持多渠道与兼容协议（OpenAI 兼容协议等），不绑定单一厂商 | 硬约束 |
| C4 | 不新增付费服务：优先复用各人已有的云端 API key（如 DeepSeek） | 偏好 |
| C5 | 业余零散时间开发，无 deadline；里程碑按小步可验收切 | 约束 |
| C6 | 数据本地存储，不抓取需登录的数据源；联网搜索仅用于收集公开资料供人参考 | 硬约束 |
| C7 | 内容场景为个人阅读写作，低风险；不涉及支付、未成年人内容 | 前提 |
| C8 | 朋友为 **Windows** 环境，应用必须跨平台——Web 形态天然满足；部署/安装说明需覆盖 Windows | 硬约束 |

## UI 设计参考（2026-09-20 用户提供截图，两次澄清后定稿）

- **参考对象**：Codex 桌面版（左侧窄栏：新对话/项目/最近 + 中间大画布 + 底部输入框）。
- **定调**（用户原话精神）：**风格与布局都倾向直接沿用 Codex**——这布局经久不衰、被大量用户验证，说明它够开箱即用、风格舒适；自己发明布局不如抄经过验证的。
- **例外原则**：只有与「阅读+写作」场景真实冲突时才做调整（如正文编辑器、世界书等读写专属元素如何安置），调整在 M1 交互稿时逐条与用户确认。
- **落地**：I3 聊天面板与整体布局以 Codex 为蓝本；上游 IDE 三栏元素（文件树/世界书）默认收拢为可展开侧栏。
- **视觉身份定稿（2026-09-21，取代「风格也直接沿用 Codex」）**：布局骨架仍借 Codex，但配色与字体走 Inkwell 自己的**暖色编辑风**——赤陶橙 accent + 米白底 + 全局衬线（打包 Noto Serif SC Variable，不赌系统字体）。

## 技术偏好（用户提出，待阶段 3 评估）

- 倾向用 **Electron** 把 Web 应用打包为桌面应用分发（朋友 Windows 环境；核心仍是 Web 技术栈）——记入 `tech-stack.md` 候选，阶段 3 评估

## 可复用资产

- DeepSeek 等云端 API key（已有）
- 本地浏览器即可访问，无需额外客户端

## 已知风险 / 待议

- 「联网搜索收集资料」涉及搜索 API 的来源与配额（渠道待选型阶段定）
- ~~朋友的部署环境未知~~ —— 已确认为 Windows（2026-09-20 开发机亦迁回原生 Windows）；portable zip 链覆盖


## 参考项目（阶段 1.5 · 2026-09-20 调研并拍板，**已确认**）

调研方式：GitHub MCP + Web 搜索（中英文多关键词）+ GitHub API 核实许可证与活跃度。数据为当日查询结果。

### 候选清单

| 项目 | 定位 | 技术栈 | ★ | 许可证 | 最近提交 | 与 Inkwell 的匹配点 |
|------|------|--------|---|--------|----------|---------------------|
| [swjybky/deepwrite](https://github.com/swjybky/deepwrite) | 长流程写作智能体工作台（仿写学习、Codex 式三栏 UI） | TypeScript | 435 | Apache-2.0 | 2026-09-18 | **写作侧最贴近**：agent 工作台形态、项目管理 |
| [wink-wink-wink555/MarkiNote](https://github.com/wink-wink-wink555/MarkiNote) | Markdown 文档管理+阅读系统，AI Agent 自主调用 11 种工具（读写文件、联网搜索、抓网页） | Python | 103 | MIT | 2026-09-18 | **阅读+agent 工具集最贴近**：联网搜资料、文档库操作 |
| [travsteward/openwriter](https://github.com/travsteward/openwriter) | Markdown 编辑器 + agent 改动待审（accept/reject） | TypeScript | 30 | MIT | 2026-09-08 | 「agent 写、人审」的交互模式 |
| [steven-tey/novel](https://github.com/steven-tey/novel) | Notion 式所见即所得编辑器 + AI 自动补全 | TypeScript | 16.4k | Apache-2.0 | 2025-01（停更） | 编辑器组件参考（Tiptap 生态） |
| [danny-avila/LibreChat](https://github.com/danny-avila/LibreChat) | 多模型 BYOK 聊天平台（Agents/MCP/多渠道） | TypeScript | 44k | MIT | 活跃 | **多渠道模型接入层**参考；整体太重，不适合 fork |
| [Mintplex-Labs/anything-llm](https://github.com/Mintplex-Labs/anything-llm) | 本地优先 RAG + agent 平台 | JavaScript | 66k | MIT | 活跃 | 阅读问答/RAG 参考；太重 |
| [yilujian/easy-writing](https://github.com/yilujian/easy-writing) | 桌面网文写作软件，BYOK+自定义提示词 | Vue | 598 | AGPL-3.0 | 2026-09-13 | 写作功能清单参考；AGPL 传染性 + 桌面形态，**排除 fork** |
| [notnotype/neuro-book](https://github.com/notnotype/neuro-book) | 长篇小说写作 IDE：世界状态引擎推算、伏笔账本、AI 味 lint、人主导+Agent 协作；本地 Markdown+SQLite，有桌面打包（desktop/） | TypeScript (bun) | 674 | AGPL-3.0 | 2026-09-17 | **写作工程化最强参考**（用户提名）；但专注长篇、阅读侧空白、AGPL 传染、官方自述接口不稳定 |

### 现状回写（2026-09-21：大改后哪些还参考、哪些不参考了）

| 项目 | 当前状态 |
|------|----------|
| neuro-book | **fork 基座**，路线 D 执行中 |
| Codex 桌面版 | **布局骨架蓝本**（M1b 已落地）；视觉风格不再沿用，见「UI 设计参考」章节定稿 |
| easy-writing | **持续参考**：字数统计/排版/敏感词/专注模式已进缺口清单（docs/research/2026-09-21-feature-gap-analysis.md） |
| openwriter | 仍参考：「agent 写、人审」模式留给 proposal 卡确认流（M1c 池） |
| deepwrite | **不再参考**：其 Codex 式三栏 UI 已被「直接参考 Codex 桌面版」取代 |
| steven-tey/novel | **未参考**：基座自带 TipTap 编辑器，无需另找组件参考 |
| LibreChat | **未参考**：基座自带 pi-ai BYOK 多渠道接入 |
| MarkiNote | **不再参考**：阅读侧（M4）改由第一轮调研的资料方案覆盖（见下） |
| anything-llm | **未参考**：上下文/RAG 策略改由 SillyTavern World Info 等按需注入方案覆盖 |

**后续调研（真正的现行参考集，一事一处，内容不重复抄录）**：
- docs/research/2026-09-20-peer-projects-absorb.md —— 机制层（25 个同行：chinese-novelist-skill、screenwriting-skills、墨参、51mazi、NovelForge、SillyTavern 等）
- docs/research/2026-09-20-peer-layout-research.md —— 布局/IA 层
- docs/research/2026-09-20-lorebook-taxonomy.md —— 设定分类体系
- docs/research/2026-09-21-feature-gap-analysis.md —— 功能缺口分级清单 + Skill 双轨制（含 skill 机制专项调研结论）

### 调研结论

- **没有任何单一现成项目同时覆盖「阅读 + 写作一体」**：deepwrite 偏写作、MarkiNote 偏阅读/文档管理、LibreChat/anything-llm 是通用平台。
- 大项目（LibreChat / anything-llm / open-webui）功能全但与「读写一体工作台」目标形态差异大，fork 后改造量不低于重写，且拖着一个重型 codebase。
- 最接近的 deepwrite（435★）与 MarkiNote（103★）都是较新的个人项目，作为 fork 底座的质量未经广泛验证，但作为**设计参考**价值高。
- neuro-book（674★，用户提名）在「长篇写作工程化」上是所有候选里设计最完整的（世界状态推算、伏笔账本、AI 味 lint、人机共管 workspace），其理念对 Inkwell 写作侧架构参考价值最高；但 AGPL-3.0 意味着 fork 后 Inkwell 必须同许可证开源，且它专注长篇、无阅读侧、官方自述「快速开发阶段接口不稳定」。

### 路线候选（**已于 2026-09-20 拍板：D. Fork neuro-book 改造**）

- **A. 参考设计、自己实现**（推荐）：编辑器层直接复用 Tiptap/novel 生态，agent 工具集参考 MarkiNote，工作台交互参考 deepwrite，模型接入参考 LibreChat。最贴合「读写一体 + BYOK + Electron」目标，MVP 可切得很小；代价是全部代码自己写。
- **B. Fork deepwrite 改造**：写作侧起点高；代价是阅读侧要自建，且底座是个人新项目、质量未知，还要先读懂别人的架构。
- **C. Fork MarkiNote 改造**：阅读/agent 工具侧起点高，MIT 宽松；代价是写作侧（编辑器体验、长文写作流程）要自建，Python 栈与 Electron/TS 偏好不符。
- **D. Fork neuro-book 改造** ✅ **已选定**（2026-09-20）：写作工程化底座现成（世界状态、伏笔账本、llmlint），差异化精力投入「苏格拉底式追问」交互。已接受的代价：Inkwell 必须 AGPL-3.0 开源；~~neuro-book 接口不稳定需跟进上游~~（2026-09-21 拍板不跟进上游，此代价消除）；需先读懂其架构。阅读侧（参考资料/范文消化）在其上自建。
- ~~专注长篇的形态与「通用读写」有偏差~~ —— 该顾虑已随定位修正（专注小说创作）消除。

---

*后续章节（目标用户 / 核心场景 / 功能清单 / 非目标 / 参考项目）将在阶段 1 与 1.5 补齐。*