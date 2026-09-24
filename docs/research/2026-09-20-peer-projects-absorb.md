# 同类项目调研汇总：可吸收机制（2026-09-20）

> **2026-09 调研档案，决策已落地，仅存档。**
> 来源：4 路子代理并行调研（独立应用 / 写作 Skill / DSH 插件 / 剧本·追问·文风）。
> 视角统一为「能吸收进 Inkwell 哪个模块/里程碑」。**本文是调研素材，不是决策**；凡与已拍板决策冲突处见文末「张力点」，改动需用户确认并回写旧文档。

## 一、按里程碑归类的可吸收机制

### M1 访谈引擎（进行中）

| 机制 | 来源 | 内容 |
|---|---|---|
| 三层漏斗问答 | chinese-novelist-skill | 必答层只锁 3 个不可逆决策（主角想要什么/最大阻力/核心冲突），次级设定可跳过后置——与已拍板的「核心设定→主角→核心冲突逐层不跳层」方向一致，可强化「必答层极小化」 |
| 三问聚焦法（Socratic Extraction） | ringofai/storyteller | 作者卡壳时不逼终案，抛 3 个连珠炮小切口问题，顺着回答替作者提炼骨架（仍不代写） |
| 伤疤与代价打捞 | writing-agent | 追问定向逼问「这个选择的最大代价是什么」「最狼狈无法挽回的细节是什么」，逼出高张力设定 |
| 双层意图文件 | InkOS | 访谈产物分层：author_intent（长远主旨）+ current_focus（近期焦点），供卡文时对照追问 |
| 双轨互校 | screenwriting-skills | 外在主线事件 × 主角内在错误信念（False Belief）并排校验动机是否脱节 |
| Agent 提示词防腐 | avoid-ai-writing | profile 负面清单：严禁「让我们一起探索…」式 AI 废话与空洞对仗 |

### I2 会话闸门 / 防跑偏

| 机制 | 来源 | 内容 |
|---|---|---|
| 代码强制 > 提示词自觉 | dsh-novel-forge | 前置决策未拍板，代码层直接拒绝进入下一阶段（与 Inkwell 已有的 harness 兜底思路同宗） |
| Refactor Loop | storyteller | 发现因果硬伤即卡住流程：「漏洞未修复，不准推进」 |
| 熔断保护 | dsh-novel-forge | 同一分歧点反复拉扯 3 轮 → 熔断，停下请作者明确裁决 |

### M2 卡文追问

- **对照追问**（InkOS）：拿 author_intent × current_focus 对照，问「当前情节是否偏离阶段矛盾」
- **伤疤打捞题库**（writing-agent）：围绕隐秘代价/最坏结果/致命软肋发问
- **Fix Plan 待办化**（dsh-novel-writer）：只给方向不代写，输出「问题定位 + 思考方向」待办清单

### M3 审稿质疑

| 机制 | 来源 | 内容 |
|---|---|---|
| 挑剔读者模拟 | storyteller | Agent 化身尖酸老书虫当面发难，「不代写」的最佳产品形态 |
| 六域审稿 DAG | Openwrite | 连贯逻辑/角色关系/情节承诺/节奏场景/文风/正典 六域证据链，质疑必带行号与引用 |
| 硬门禁与质量分分离 | Openwrite | 逻辑硬伤（死人复活等）一票否决，与审美建议分流 |
| 多视角对抗审稿 | oh-story-claudecode / writing-agent | 架构师/人设师/文风师并行挑刺，汇总为质疑清单；修订权全留作者 |
| 12 类变更检查清单 | 天命 | 秘密知情范围/誓约倒计时/物品归属等维度抽象为审稿 Checklist |
| 三级质疑干预 | 墨参 | L1 建议 / L2 质询 / L3 否决按严重度分级 |
| 对白与信息差诊断 | screenwriting-skills | 扫「on the nose 直白解说」与悬念/惊奇/反讽的信息释放 |
| 0 Token 风格基线 | dsh-novel-writer | 本地算法算六维风格基线带（μ±1.5σ），超带才报警，不耗模型 |

### M4 资料阅读

| 机制 | 来源 | 内容 |
|---|---|---|
| 黄金三章停靠点 | oh-story-claudecode | 拆书流水线在黄金三章后强制挂起，人工确认再继续 |
| 原文哈希冻结 + 锚点双链 | dsh-nexttavern | 资料切片只读冻结，追问永远带「第 X 节第 Y 段」锚点，杜绝虚空质询 |
| 分层蒸馏 | writing-dna-skill | 不产大段摘要，按 L2 结构套路 / L5 认知假设抽高密度卡片进 lorebook |

### M5 归档 / 设定与记忆组织

| 机制 | 来源 | 内容 |
|---|---|---|
| 提案卡确认制 | 墨参 / dsh-novel-forge / NovelForge | 设定不静默写入，以提案卡（Schema 字段化）出示，作者确认才落盘 |
| 来源分层标注 | 墨参 / AI-Novel-Writer | frontmatter 区分「作者确凿事实」vs「AI 推理衍生」 |
| 增量文档生命周期 | oh-story-dsh | 聊到哪建到哪，不预建空模板铺满 lorebook |
| 分层记忆四支柱 | dsh-nexttavern | 核心设定恒定注入 + 滑窗 + 导演笔记 + BM25/向量混合召回 |
| 作者习惯 × 单书设定隔离 | oh-story-claudecode | 偏好入用户 profile，本书事实入 lorebook，物理隔离防多书污染 |
| 权威 JSON + Markdown 投影 | InkOS | 核心关系（伏笔/势力网）由 schema 守护，Markdown 只读投影 |

### 码字体验（编辑器/写作流，用户明确定位补充）

| 机制 | 来源 | 内容 |
|---|---|---|
| 三栏联动 + 文件跟随 | oh-story-dsh | Agent 写 lorebook 时编辑器联动展开对应词条；人工未保存内容防 Agent 覆写 |
| 审稿意见卡片化 | NovelForge | 审稿结论沉淀为可勾选的待办问题卡，跨会话跟踪 |

## 二、跨报告共识（≥2 路独立提到，优先级最高）

1. **提案卡确认制 + 来源分层**（墨参、dsh-novel-forge、NovelForge、AI-Novel-Writer、chinese-novelist-skill 五处）——设定落盘必须经作者确认，且标注来源
2. **结构化质疑、带证据锚点**（Openwrite、storyteller、screenwriting、writing-agent）——审稿/追问都要指到具体行/段，不泛泛
3. **代码层硬闸门**（dsh-novel-forge、storyteller、天命）——关键决策未过，代码直接拒走下一步
4. **卡壳降级策略**（storyteller、chinese-novelist-skill）——大问题答不上来就拆成小切口连珠问

## 三、与已拍板决策的张力点（需用户裁决，勿擅改）

1. **M1a 决策 5「三块齐备后写 lorebook 并收尾」是 Agent 直接落盘**；调研共识是「提案卡 → 作者确认 → 落盘」。当前 M1a 可按原决策收口，是否在 M1b/M2 前升级为提案制待用户定。
2. **M1a 决策 6「逐层追问不跳层」**与「三层漏斗的次级层可跳过」方向一致但严格度不同：现状是严格不跳层，漏斗允许次级设定后置。维持现状即可，M2 再议。
3. 熔断、三级质疑、双层意图文件等均为**新增机制**，不影响 M1a 收口，建议分别记入对应里程碑的备选池。

## 附：调研覆盖的主要项目

独立应用：inkos、AI-Novel-Writing-Assistant、NovelForge、AI-Novel-Writer、tianming-novel-ai-writer（天命）、moshen（墨参）、WenShape、vela
写作 Skill：oh-story-claudecode、chinese-novelist-skill、writing-agent、WriteHERE
DSH 插件：oh-story-dsh、Openwrite、dsh-nexttavern、dsh-novel-writer、dsh-novel-forge、dsh-novel
旁支：storyteller、screenwriting-skills、screen-creative-skills、avoid-ai-writing、writing-dna-skill
