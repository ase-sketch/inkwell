# M3 审稿式质疑细化设计：review.chapter 薄 profile + llmlint 窄工具 + 质疑卡 + 双入口

Status: implemented（2026-09-25 收口）
Date: 2026-09-25
相关：docs/milestones.md（M3 节）、docs/research/2026-09-20-peer-projects-absorb.md（审稿机制吸收点）、docs/research/2026-09-21-feature-gap-analysis.md（划词挑刺交互）、.agents/notes/implemented/feature/2026-09-22-m2c-skill-dual-track.md（skill 双轨）、.agents/notes/implemented/feature/2026-09-22-m2.5b-inline-proposal-cards.md（提案卡蓝本）

## Problem

作者写完一章后缺少「被挑刺」的环节：动机是否成立、伏笔是否按计划推进、文字有没有 AI 味，靠自己回看很难发现。llmlint（266 条中文 AI 味规则）与伏笔账本都在，但没有任何链路把它们变成作者可处置的质疑。侦察实证：llmlint 只覆盖 AI 味一轴（动机/伏笔零覆盖）且无 server 集成；销项持久化无现成实体；行号锚不稳定（源码行 ≠ ProseMirror 块计数，编辑即漂移）；detect 命令会把正文外发第三方。

## Decision

2026-09-25 两轮访谈（6 题，用户全选推荐项）拍板：

1. **不拆子里程碑**：质疑卡是验收形态本身，部件互为前提。
2. **专用薄 profile review.chapter**：照抄 interview.stuck 骨架（红线置顶+核心契约+阻塞式逐条回应闸门）；三处登记——profile-write-scope 写域白名单（最严口径：无 manuscript 写入）、前端会话白名单（AgentChatSurface/AgentSessionDialog）、i18n + agent-profile-display 契约测试。
3. **llmlint 窄工具**：server 侧 profile 自定义工具（只跑 check --format json，参数=目标+review 桶），审稿 profile 不开 bash；detect 禁用（正文不出机）。实现先例：llmlint.test.ts 的 in-process runCli / execFileAsync 两路。
4. **质疑卡**：agent 经自定义工具 submit_critiques 提交结构化质疑（契约 shared/ 新建，字段：category ∈ motivation/foreshadowing/ai-flavor、question、evidence{quote, line?}、severity、llmLintRuleId?/promiseId?）；聊天流渲染卡片（M2.5b 提案卡机制蓝本），逐条「认可/驳回/记下」，处置随会话历史落盘可回看。跨会话问题单跟踪（Plot Decision 实体化）为非目标。
5. **双入口**：编辑态「审这一章」按钮（IdeDocumentTabs 区域）+ 划词「发给顾问挑刺」（照抄 M2b 六段链路）；$skill 手动唤起兜底（M2c 自带）。
6. **审稿量表内置 skill**：assets 种子区 assets/workspace/.nbook/agent/skills/ 下新建（ka-wen 同款形态），承载动机/伏笔/AI 味三轴的追问量表方法论；作者可在 <项目>/.nbook/skills/ 同名遮蔽覆写。
7. **证据锚点**：每条质疑必带原文 quote（对齐 M2a 锚点精神）；行号只作跳转加速（敏感词 jump 先例），不作持久锚。

### 实现期修正轮记录（2026-09-25）

真实 LLM 验收 8 项：7 项通过（三轴质疑卡、llmlint 规则脚注、处置刷新保持、划词复用同章会话、红线拒写），1 项缺陷——
**证据原文跳转失败**：模型按工具参数描述「章节名或章节文件路径」传了完整相对路径 manuscript/001-vol/001-ch/index.md，而卡片只认纯章名（resolveManuscriptChapterNode），反查落空 → toast「找不到这一章的正文」。
修复：新增 resolveCritiqueChapterNode（三种形态全认——路径形态归一化后按 manuscript 相对路径等值匹配、纯章名走既有反查、不存在的章节返回 null 不猜；路径形态匹配不上绝不退化成猜章名，避免落到同名另一卷那一章），卡头与 toast 标题用 critiqueChapterLabel 收敛成短名；契约注释改写为「三种合法形态」并点明「消费端只认前两种就是缺陷」。26 条直测绿、typecheck 0，复验项④通过。

**教训（隐性假设沉淀）**：契约字段的工具参数描述与消费端解析能力必须同轮对齐——生产端（模型）会按参数描述的最宽口径传值，消费端窄于它就是缺陷；本次把教训写回了契约注释，不只写在报告里。

**另一条工程约束（profile 编译面）**：profile-sdk 的 barrel **不得 re-export 契约模块**——曾把 shared/chapter-critique 从 profile-sdk 导出，导致 zod 依赖被拖进全部 11 个 profile 的编译图（profile-sdk-contract.test.ts 红）。修法：SDK 保留字面量常量 + 一条钉死与 shared 取值一致的断言。日后新增契约类模块一律照此。

## Alternatives considered

- **审稿塞进 leader.default**：审稿需要清单化输出+逐条闸门的强制契约，混入日常对话主入口会污染——被否（侦察建议 Q 采纳）。
- **给审稿 profile 开 bash 跑 llmlint**：实现最省但红线面扩大（任意命令执行）——被否（Q2）。
- **不集成 llmlint（AI 味靠模型+量表）**：损失 266 条规则的稳定证据生产，质疑可核实性下降——被否（Q2）。
- **对话闸门式逐条回应（request_user_input）**：零新 UI 但清单不可勾选、回看差——被否（Q3）。
- **质疑卡+Decision 实体跨会话跟踪**：Decision 的 status 四态+anchor 语义契合，但 Plot 工作台新壳不可达需自建面板，范围明显变大——列为非目标留后续（Q3）。
- **保留 detect 为可选**：正文外发第三方 HF Space 且 sharing.off 关不掉，违背本地优先底线——被否（Q4）。
- **复活 Comment 旁注卡做审稿呈现**：能力是活的、复活成本低，但批注存原文锚无状态字段，销项语义要新做，且与质疑卡形态重复——本轮不做，留作后续候选。

## Consequences

- 收益：三章轴（动机/伏笔/AI 味）的质疑产出有了完整链路；llmlint 从「$llmlint 手动唤起」升级为审稿流的证据生产者；质疑卡机制为后续「跨会话问题单」留好契约口。
- 影响：profile 编译链多一个 profile；server 多一个窄工具（进程内跑 llmlint）；assets 多一个内置 skill。
- 已知限制：① 处置状态只在会话历史内（跨会话跟踪是非目标）；② llmlint 的 8 条 semantic 规则仍需模型读全文判断，窄工具只覆盖静态规则命中；③ 行号跳转在文档编辑后会漂移（已知口径：锚 quote 不锚行号）。
- 风险登记：profile-write-scope 未登记即 fail-open（M2c 已知缺口）——review.chapter 必须登记且测试钉住；profile 单文件编译会重写共享 .compiled/manifest.json，验证统一用 prepare-system-assets.ts --force（M2c 运维坑）。

## Confirmation

- 验收标准六条已回写 milestones.md M3 节（2026-09-25），真实环境 8/8 通过（含修正轮复验）。
- 已知限制：① 处置状态存本机浏览器 localStorage（换机器/清浏览器数据即丢；跨会话问题单跟踪是非目标）；② llmlint 8 条 semantic 规则仍需模型读全文判断，窄工具只覆盖静态命中；③ 行号跳转在编辑后漂移（锚 quote 不锚行号）；④ 工具参数超公开投影预算（256 节点）时会投影成 "[unsupported]"，卡片静默不渲染——已被 items≤20 上限挡在门外，根治需改 server 侧 public-tool-projection（后续候选）；⑤ 全量套件里 file-tools 的 bash 用例存在环境抖动（dev server 运行时争用，同树结果浮动），与本次无关。

- 机器门禁：review.chapter 的工具清单静态断言（无 write/edit/applyPatch 到 manuscript、无 bash）；窄工具只暴露 check 的契约测试；质疑卡渲染/处置的前端纯 TS 直测；profile 编译 EXIT=0。
- 真实验收：一章真实文稿（m2a-yan-shou-2 或新验收项目）跑「审这一章」，三轴各至少一条可核实质疑 + 逐条处置回看。
- 最终验收：用户手工试用。