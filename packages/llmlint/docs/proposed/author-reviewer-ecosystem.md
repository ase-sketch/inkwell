# 作者与评委生态提案

> 状态：提案，未实施。  
> 日期：2026-08-15。  
> 范围：llmlint 检测工作台、编辑部校样台、作者候选池、AI 评委候选池，以及它们与人类评测的关系。  
> 相关前置草案：[`docs/drafts/author-reviewer-ecosystem-research.md`](../drafts/author-reviewer-ecosystem-research.md)。本文是面向后续立项和实现的正式提案，前置草案保留为研究过程记录。

## 1. 一句话结论

llmlint 可以发展成一个由检测、生成、盲评和校准组成的写作实验场，但不应第一版就实现“作者和评委互相淘汰”的全自动双遗传算法。

建议采用以下模型：

```text
作者候选池 = writer + critic + style + guide + 生成参数
评委候选池 = 模仿特定人类评分分布的独立评分器
最终真值   = 冻结的人类判断
系统循环   = 人类小批量校准 → reviewer shadow → 不确定性抽样 → 人类复核
```

两个池可以交替更新，但不能互相制造真值：

- 作者候选的主适应度来自人类对“想继续读”的评分。
- 评委候选的适应度来自它与冻结人类评分的一致程度。
- critic 是作者内部的修订组件，不是外部评委。
- reviewer 只产生独立的 AI 预测，永远不能写入 `DocJudgment`。
- 平均值可以作为作者排序的主指标，但必须用题材、受众和风格生态位保护独特口味。

## 2. 为什么现在需要这项提案

llmlint 当前已经能检测文本、保存不可变修订谱系、采集机器断言和人类判断，也已经有匿名盲评的实验页面。下一步真正缺的不是再增加一个检测器，而是把以下问题连成一条可审计的证据链：

1. 一份正文由什么写作管线生成，是否可以复现。
2. 一次修订究竟改善了正文，还是只降低了某个机器检测分数。
3. 一个写作风格是否真的更受人类读者欢迎。
4. AI 评委能否稳定地近似人类判断，并且在新题材上不失控。
5. 当生态追求总体平均分时，独特但稳定的读者口味是否仍然有生存空间。

如果没有统一的领域边界，系统很容易出现四种错误：

- 把“检测概率低”误报成“文风更好”。
- 把 critic 的自我判断伪装成读者真值。
- 让 reviewer 通过反馈回路学会讨好自己。
- 让总体平均值淘汰所有非主流风格，最终生态只剩一种写法。

本提案先固定概念、数据边界、评估规则和分阶段路线，不代表立即实现全部功能。

## 3. 现有基础与边界

### 3.1 已有能力

以下能力已经存在，可以作为增量建设的基础：

- `/contribute`：检测与修订工作台。
- `Text`：文本信封，记录来源和所有权边界。
- `Revision`：不可变正文版本及其父子谱系。
- `DocJudgment`：人类对正文的文档级判断。
- `SpanAnnotation`：局部片段批注。
- `MachineScan` / `MachineDetect`：机器扫描和外部检测器结果。
- D5 类验收：改稿后机器检测下降且人评不下降，两个条件必须同时满足。
- `/style-review`：匿名盲评实验页，当前使用 `AI 味` 与 `想继续读` 两条 0 到 5 评分轴。
- `/style-review` 的服务端实现已经保存实验臂、模型和机器结果，客户端评分时不揭示这些信息。
- 统一数据模型已经把来源、正文版本、人类断言、局部批注和机器断言分开。

相关现有代码和规范入口：

- `web/app/pages/style-review.vue`
- `web/server/utils/style-review.ts`
- `web/prisma/schema.prisma`
- `CONTEXT.md`
- `evals/METHODOLOGY.md`
- `.agents/tasks/12-unified-data-model/README.md`

### 3.2 当前能力不能被误读成什么

现有 `/style-review` 仍是私有研究实验页，不是公开竞技场：

- 题库是固定的。
- 页面没有进入公开 AppHeader 导航。
- 当前实验协议不是通用的多研究项目模型。
- 现有匿名盲评主要验证实验流程，不等于已经完成公共作者排行榜。

Task 133 的数据可以支持文风候选和流程验证，但不能训练一个宣称适用于所有题材、所有读者的通用 reviewer。Task 133 的最终人评事实是 20 份正文、5 组 pair、78 条 judgment、owner-primary 20/20；样本量为方向性证据，不足以宣称统计意义上的通用胜者。

### 3.3 不变量

后续实现必须继续遵守以下边界：

1. 人类判断是最终真值，AI 预测不能覆盖或伪装成人类判断。
2. 来源和质量是两组正交属性。用户声称“人写的”不等于系统已经验证其为人写的。
3. 每个正文结果必须有可追溯的来源、版本和生成参数。
4. 训练集、调参集和 holdout 必须按 `brief`、`pair` 或题组切分，不能随机拆同一题的不同版本。
5. 盲评揭示前不能返回作者、模型、实验臂或机器结果。
6. 客户端不能提交服务端生成的 id、时间戳、字符数、来源类型、上传者、用户 id 或 blind 标记。
7. 同一用户对同一 revision 的判断继续遵守整行覆盖语义和唯一约束。
8. 机器检测是仪表和诊断信号，不是“好不好看”的真值。
9. 用户文本进入公共语料或训练集前必须有明确的 consent 和 provenance。

## 4. 目标与非目标

### 4.1 目标

本提案要建立一套可逐步落地的生态模型，使系统能够：

- 统一接纳用户文本、人类策展文本和系统生成文本。
- 用 `Revision` 保存作者生成、critic 修订和用户修改的谱系。
- 将 writer、critic、style、guide 和运行参数固化为可比较的作者候选。
- 将 reviewer 作为独立、版本化、可校准的评分器。
- 用人类盲评建立 calibration set 和冻结 holdout。
- 在 reviewer 达到稳定门槛后，让它承担低成本预筛和主动学习采样。
- 用题材、受众和风格生态位保留独特作者，而不是只保留总体平均分最高者。
- 为未来公开竞技场保留匿名、版权、撤回、揭示和管理员审计能力。

### 4.2 非目标

第一阶段不做：

- 全自动作者淘汰。
- 用 AI reviewer 取代人类终审。
- 把检测器分数直接当作作者适应度。
- 把 critic 的自评当作人类偏好。
- 用 Task 133 的 5 组 pair 训练通用 reviewer。
- 在没有版权和 consent 合同前开放公共训练池。
- 把所有读者压成一个不透明的“总分模型”。
- 为了生态研究重写现有 `Text`、`Revision` 和 `DocJudgment` 的核心语义。

## 5. 领域模型

本节区分已经确认的项目术语和本提案建议的新术语。新术语在方案批准前属于 proposed，不应被代码当作已经存在的 schema。

### 5.1 已确认术语

| 术语 | 语义 | 本提案中的作用 |
| --- | --- | --- |
| `Text` | 文本信封，拥有来源和所有权边界 | 作为正文根实体 |
| `Revision` | 不可变正文版本，带父版本和转换类型 | 承载作者产物和修订谱系 |
| `DocJudgment` | 人类对某个 revision 的文档级判断 | 唯一人类真值表 |
| `SpanAnnotation` | 针对正文片段的人工批注 | 诊断和 critic 研究信号 |
| `MachineScan` / `MachineDetect` | 机器扫描或外部检测器断言 | 独立诊断信号 |
| `Brief` | 生成正文所需的题目、人物、节拍和信息顺序 | 作者候选共同输入 |

### 5.2 提议术语

> 术语迁移说明：`CONTEXT.md` 早期术语表曾把 `critic` 暂记为未实现的“评分员”。本提案沿用用户当前方案，把 `critic` 固定为作者内部的“修订批评者”，把外部预测人类感受的角色固定为 `reviewer`。在实现前必须清理这两个语义，不能让历史别名继续进入新数据表。若后续发现 `critic` 仍会与旧语义冲突，再单独拍板改用 `reviser`，不得在代码中同时保留两个含义。

#### AuthorCandidate，作者候选

作者候选不是一个模型名称，而是一份完整、可复现、可变异的写作配置：

```text
AuthorCandidate
  id
  version
  writer model key + prompt version + runtime parameters
  critic model key + prompt version + runtime parameters
  style key + fingerprint
  guide tier + fingerprint
  pipeline mode
  target audience or niche declaration
  parent candidate and mutation description
  status
```

`status` 至少需要表达 `candidate`、`evaluated`、`shadow`、`active`、`retired`。状态变化必须留在谱系中，不能通过覆盖配置制造“候选从未改变”的假象。

#### Writer，写作者

writer 从 `Brief`、style、guide 和运行参数生成初稿。它只负责产生正文，不负责宣布正文成功。

#### Critic，修订批评者

critic 读取 brief、初稿、style 和约束，指出可操作的问题，并产生修订计划或修订稿。第一版建议同时保留两种实验臂：

1. `critic-plan`：critic 只输出结构化问题和修订计划，再由固定执行器或 writer 应用。
2. `critic-rewrite`：critic 直接输出完整修订稿。

两者必须分别记录父 revision 和子 revision，不能原地覆盖正文。critic 的输出是作者管线的一部分，不是人类 judgment。

#### ReviewerCandidate，评委候选

评委候选是一个独立的评分器：

```text
ReviewerCandidate
  id
  version
  model key
  prompt version
  target axes
  target audience or rater population
  calibration set fingerprint
  holdout set fingerprint
  status
  evaluation report version
```

它接收正文或正文 pair，返回结构化预测、置信度和可选解释。解释用于调试，不得替代结构化分数。

#### HumanJudgment，人类判断

运行时继续以 `DocJudgment` 作为人类判断主表。研究层面建议增加 `studyId`、`roundId`、`axisVersion` 等语义，使不同评测轮次和评分尺可以复放；具体字段需在 schema 设计任务中确认，不能在本提案阶段直接假定已落地。

#### ReviewerPrediction，评委预测

建议在数据库中使用独立的 `ReviewerPrediction` 表承载 reviewer 预测。它至少记录：

- reviewer candidate 和版本。
- 被评 revision 或 pair。
- 评分轴和评分尺版本。
- 预测分数、pair 选择和置信度。
- 运行状态、错误信息和模型调用 provenance。
- 生成时间和输入 fingerprint。

`ReviewerPrediction` 不得与 `DocJudgment` 共用写入路径，也不得成为 `DocJudgment` 的回填来源。

#### Calibration Set，校准集

校准集是带有人类判断、可用于 reviewer 调参或提示优化的数据集。它不是永久真值的唯一来源，必须版本化、可追踪，并记录纳入条件。

#### Holdout，冻结留出集

holdout 在 reviewer 选型前冻结，评估期间不得用于 prompt 调整、候选淘汰依据之外的再训练或示例补充。它是 reviewer 是否有资格进入 shadow 的主要证据。

（reviewer 的评论需要和人类真实评论做区分，不能用 reviewer 产生的评论去训练 reviewer）

#### Arena Study，竞技场研究

一个带有题库、评分轴、盲评规则、分配策略、consent 规则和揭示策略的研究协议。竞技场不是一张“公开提交表”，而是一组可复放的实验合同。

#### Niche，品味生态位

按题材、受众、风格或阅读目标划分的候选生存空间。生态位不是给低分候选发安慰奖，而是避免不同目标被错误地放入同一总体平均分竞争。

## 6. 产品边界：检测工作台与编辑部校样台

### 6.1 检测工作台

检测工作台回答：

> 这份正文有哪些机器可见的风险，修改前后有什么变化，哪些判断仍需要人类确认？

它可以展示：

- llmlint 规则命中。
- 外部检测器结果。
- 局部 span 命中和批注。
- revision 前后 diff。
- D5 所需的机器下降与人评不下降。

它不应直接展示一个未经盲评的“作者排名”。

### 6.2 编辑部校样台

校样台回答：

> 在不知道来源和作者的前提下，读者或编辑会选择哪一篇，为什么？

它的核心合同是：

- 盲评优先。
- 评分前隐藏来源、模型、实验臂和机器结果。
- 支持单篇双轴评分和 pair 选择。
- 记录评分尺、题组和分配策略版本。
- 评分后按权限揭示结果。
- 管理员可以看到 arm、model、machine 和审计信息，普通评委不能看到。

### 6.3 二者不能合并成一个页面语义

（二者有相似的地方，有些地方可以考组件复用，前端开发的时候需要注意抽象、解耦）

| 能力 | 检测工作台 | 编辑部校样台 |
| --- | --- | --- |
| 上传正文 | 核心能力 | 可作为题库来源 |
| 修改正文 | 核心能力 | 通常不在评分环节修改 |
| 展示机器检测 | 可以 | 盲评前禁止 |
| 盲评 | 可选 | 核心协议 |
| pair 比较 | 辅助 | 核心协议 |
| 作者和模型标签 | 可见或权限可见 | 评分前隐藏 |
| 主要产物 | 修订和检测报告 | 人类 judgment |
| 公共排行榜 | 不适合 | 后续研究能力 |

现有 `/style-review` 可以作为校样台原型复用，但应先抽象为 `ArenaStudy` 和 `ArenaAssignment`，再考虑公开入口。不能只把当前页面加入导航，就把私有固定题库误当成公共竞技场。

## 7. 统一数据和 provenance 设计

### 7.1 三类正文来源

所有正文都应进入同一条 `Text → Revision` 谱系，来源分为三类：

1. `uploaded`：用户上传的正文。用户声明的来源只记录为声明，不自动视为事实。
2. `curated`：人类或项目策展后纳入的参考正文。
3. `generated`：由作者候选和 brief 生成的正文。

来源和质量保持正交：人类来源不自动代表高质量，系统生成也不自动代表低质量。

### 7.2 系统生成的最低 provenance

每次系统生成至少要能回放以下信息：

```text
brief fingerprint
brief version
author candidate id and version
writer model and prompt version
critic model and prompt version
style key and fingerprint
guide tier and fingerprint
pipeline mode
runtime parameters
randomness or seed when provider supports it
parent revision id
model invocation status
token and cost accounting when available
created at
```

如果模型服务不提供稳定 seed，也必须记录“未提供 seed”，不能把同一配置标记成完全确定性。（似乎目前大部分模型服务都不会提供 seed 了，需要调研，例如 DeepSeek、OpenAI 是否支持？）

### 7.3 Revision 谱系

建议的生成和修订链：

```text
Brief
  ↓
AuthorCandidate
  ↓
writer invocation
  ↓
Revision A: 初稿
  ↓
critic invocation
  ↓
Revision B: critic 修订稿
  ↓
human or user fix
  ↓
Revision C: 人工修订稿
```

每一步都是新的不可变 revision。机器扫描、人类判断和 reviewer 预测挂在具体 revision 上，而不是挂在模糊的“作者”或“文档当前状态”上。

## 8. 作者生成管线提案

### 8.1 输入合同

作者候选的输入固定为：

```text
brief
style preset
writing guide
writer configuration
critic configuration
runtime parameters
```

`Brief` 只描述任务、人物、节拍、视角和信息顺序，不直接携带待模仿的原文句子。style 和 guide 的 fingerprint 必须记录，避免同名文件变化后无法解释旧实验。

（从正文提取 brief 的方法也值得后续开展实验）

### 8.2 writer 合同

writer 的输出应包括：

- 正文。
- 使用的 author candidate 版本。
- 调用状态。
- 可选的结构化章节或段落边界。
- token、耗时和成本。

writer 不输出“人类评分”，也不决定候选是否存活。

### 8.3 critic 合同

第一版优先让 critic 输出结构化计划：

```text
CriticPlan
  target revision
  issue code
  severity
  target span
  reason
  proposed action
  confidence
```

之后由固定执行器或 writer 产生子 revision。这样容易回答“critic 是否真的改善了正文”。直接 rewrite 可以作为独立实验臂，但不能把 plan 和 rewrite 混在同一个候选版本里。

critic 需要看到的上下文和不能看到的字段要固定。推荐它可以看到 brief、正文、style 和 guide；不能看到人类 judgment、reviewer 预测或作者排名，否则作者候选会间接优化到评委标签。

### 8.4 作者候选的变异

一次变异只修改一个主维度：

- style 规则或 style fingerprint。
- critic 规则或 critic prompt。
- writer 模型。
- critic 模型。
- pipeline mode。
- temperature、top-p、长度限制等运行参数。
- 受众或生态位声明。

变异记录必须指向父候选，并说明改变了什么。不能把多个变化打包后只留下一个新名字，否则评测结果没有因果解释。

## 9. Reviewer 设计提案

### 9.1 两种 reviewer 目标

“模仿人类”有两种不同含义，必须在数据模型中区分：

#### 共识 reviewer

预测同一正文在一组人类评委中的聚合结果，例如平均值或中位数。它适合：

- 作者候选低成本预筛。
- 研究面板展示。
- 发现与人类共识明显冲突的样本。

第一版推荐从共识 reviewer 开始，因为它需要的样本和模型结构更简单。

#### 品味 reviewer

预测某一类读者、某位编辑或某个受众切片的判断。它适合：

- 轻小说读者与严肃文学读者的区分。
- 题材和风格生态位保留。
- 个性化作者推荐。

它不能与共识 reviewer 共用一个不带 profile 的总分。若要支持品味 reviewer，必须记录目标人群和适用范围。

### 9.2 Reviewer 输出

最低输出协议：

```text
reviewer candidate id/version
revision or pair reference
axis version
predicted aiFlavor
predicted wantReadOn
predicted pair choice when applicable
confidence
optional rationale
model invocation provenance
```

结构化分数是可计算结果，rationale 只是解释材料。不能用自然语言理由反推一个未经版本化的分数。

### 9.3 Reviewer 校准

流程建议：

1. 收集一批带人类 judgment 的盲评数据。
2. 按 brief、pair 或题组切成 calibration 和 holdout。
3. 只在 calibration 上调 reviewer prompt、示例或模型参数。
4. 冻结 reviewer candidate。
5. 在 holdout 上评估。
6. 通过门槛后进入 shadow。
7. 对 reviewer 最不确定、与人类冲突最大或属于稀有 slice 的样本优先请求人工复核。

reviewer 永远不能用自己的预测继续训练自己。新的训练样本必须来自新的人类 judgment，或者明确标记为未验证的机器样本，不得混入真值集。

## 10. 两个进化池和适应度

### 10.1 为什么采用交替更新，而不是单一共进化

如果作者按 reviewer 分数进化，而 reviewer 又按作者产生的样本训练，两个群体会形成闭环：

```text
作者讨好 reviewer
  ↓
reviewer 在作者生成分布上看起来更准确
  ↓
作者继续讨好 reviewer
  ↓
双方偏离真实人类偏好
```

因此推荐：

- 作者池和 reviewer 池独立版本化。
- reviewer 的资格只由冻结人类 holdout 决定。
- 新作者候选先由 reviewer 预筛，再由不确定性抽样交给人类。
- 人类 judgment 定期重建 reviewer 校准集。
- reviewer 未达到门槛时，作者选择完全依赖人类。

这仍然是进化搜索，但不是无人监督的相互共生淘汰。

### 10.2 作者适应度

主排序指标建议为人类 `wantReadOn` 的 pair 加权聚合均值：

```text
authorFitness(A) = mean(aggregatedHumanWantReadOn(A, brief, slice))
```

具体聚合函数应在实验合同中版本化。若每份正文有多位评委，不能把所有评分行直接当作独立样本，至少要先形成正文级或 pair 级聚合，再计算候选均值。

同时必须报告：

- mean、median、stddev。
- 每个 brief 或 pair 的分数。
- 题材、受众和风格 slice。
- 低尾表现，例如低于某阈值的比例。
- `AI 味` 的独立结果。
- 长度变化、成本和延迟。
- writer 初稿到 critic 修订稿的增量。

`AI 味` 不应未经明确决策就和 `wantReadOn` 合并成一个神秘总分。检测器分数和人类的 AI 味评分都应作为独立轴、诊断项或明确的约束项。若未来确实要优化“低 AI 味且高想读”，必须单独建立版本化的多目标协议。

### 10.3 品味生态位保护

“平均值是主标准”与“独特口味也要生存”并不矛盾，但需要把排序和生存策略分开：

- 全局报告仍显示总体平均 `wantReadOn`。
- 候选池不只保留全局 top-k，还在每个有效 slice 保留 top-k。
- 每个 slice 的最低样本量不足时，不做强结论和自动淘汰。
- 可以维护少量 novelty 或风格多样性保留名额，但它是生存策略，不应悄悄改变主适应度的含义。
- 同一候选若只在一个小众 slice 表现好，应标记为“slice specialist”，而不是简单标记为失败。

第一版推荐“全局 top-k + 每个 slice top-k + 随机探索名额”，不建议一开始引入复杂的 novelty 公式。先让数据说明哪些 slice 稳定存在，再决定是否需要聚类或 Pareto 前沿。

### 10.4 Reviewer 适应度

reviewer 的目标不是“给作者更高分”，而是接近冻结的人类结果。至少报告三类指标：

1. **数值误差**：按轴计算 MAE 或 RMSE。评分是有序离散量，不能只报一个相关系数。
2. **排序一致**：pair accuracy，以及必要时的 Kendall 或 Spearman 相关。
3. **切片覆盖**：按 brief、题材、受众和作者 pipeline 报告最差 slice。

推荐使用门槛而不是不透明的单一加权分：

- 总体误差不超过预设阈值。
- pair 选择达到最低准确率。
- 最差关键 slice 不得低于安全线。
- 与人类分歧的高置信样本必须可回放。

如果必须产生候选排序，可以使用版本化的归一化误差和 pair accuracy 组合，但原始指标、权重和版本必须同时保存。一次调参不能同时改变评分尺、数据切分和通过门槛。

## 11. 人类数据、主动学习和冷启动

### 11.1 冷启动阶段

起步阶段人类数据少而贵，必须优先用于高信息量样本：

- 不同作者候选之间难以区分的 pair。
- reviewer 置信度低的正文。
- reviewer 与人类历史结果冲突的正文。
- 代表稀有题材、受众或风格 slice 的正文。
- critic 修订前后分数相反的正文。

Task 133 的 5 个 pair 可以作为流程 fixture 和初始 prompt 示例，但不能作为通用 reviewer 的充分训练集。

### 11.2 reviewer 成熟后的人工比例

reviewer 达到 holdout 门槛后，可以把人工从“全量评分”降为：

- 校准集持续补充。
- 新题材和新模型的覆盖。
- 高不确定性样本。
- 随机抽样复核。
- 对 reviewer 漂移的周期性审计。

人工比例可以下降，但不能归零。否则系统无法发现 reviewer 已经脱离真实读者。

### 11.3 漂移检测

每个 active reviewer 轮次都应保留：

- 固定基准集上的回归结果。
- 新题材 slice 的结果。
- 人类抽样复核结果。
- 高置信错误率。
- 与上一版本 reviewer 的预测差异。

出现以下任一情况时，reviewer 自动退回 shadow：

- holdout 指标跌破门槛。
- 某关键 slice 显著恶化。
- 高置信预测与人类判断持续冲突。
- 输入、模型或评分尺版本发生未登记变化。

## 12. 最小离线实验

不先开放完整竞技场，先用可复现的小实验验证数据和适应度是否成立。

### 12.1 实验矩阵

```text
10 个 brief
× 3 个作者候选
× 每个候选 3 次生成
= 90 篇系统生成正文
```

三个作者候选固定为：

1. single-pass writer。
2. writer + critic-plan。
3. writer + critic-rewrite。

每个候选在同一 brief 上使用相同的生成协议。若供应商不支持稳定 seed，则记录随机性并通过多次生成估计方差。

### 12.2 评分协议

- 评分者看不到作者、模型、pipeline 和机器检测结果。
- 继续使用 `AI 味` 与 `想继续读` 两条评分轴，轴版本固定。
- 尽量使用 pair 级比较，避免只依赖绝对分。
- 同一 brief 的不同版本不能跨 calibration 和 holdout 随机泄漏。
- 人类结果保存为 `DocJudgment`，reviewer 预测保存为独立表。

### 12.3 reviewer 实验

先比较一个简单的 LLM reviewer 与人类聚合结果：

- calibration：约 70% 的 brief 或 pair。
- holdout：约 30% 的 brief 或 pair。
- 评估 MAE、pair accuracy 和最差题材 slice。
- 记录置信度与错误的关系。
- 不达门槛时只保留离线报告。
- 达到门槛时先接入 Web shadow，不影响作者淘汰和人类结果。

这里的 70/30 是第一轮研究建议，不是已经批准的统计功效结论。正式比例应根据 brief 数量、题材分层和每篇可获得的 judgment 数量复核。

### 12.4 实验成功条件

第一轮不以“找出一个冠军文风”为成功标准，而以以下问题有可重复答案为成功：

1. writer + critic 是否在固定 brief 上产生可复现的 revision 谱系。
2. critic-plan 与 critic-rewrite 的收益是否可区分。
3. 人类 `wantReadOn` 的方差是否足以支持作者排序。
4. reviewer 是否能在未见过的 brief 上接近人类聚合结果。
5. 哪些题材或受众需要独立 reviewer。
6. 哪些候选只适合某个 niche，而不是全局失败。

## 13. 竞技场 MVP 提案

### 13.1 研究协议实体

建议新增以下概念实体，具体表结构另立实现任务：

```text
ArenaStudy
  scoring axes and versions
  corpus and consent policy
  blind and reveal policy
  assignment strategy
  aggregation version
  study status

ArenaAssignment
  study
  participant
  revision or pair
  assignment status
  submitted at

ReviewerPrediction
  reviewer candidate
  assignment or revision/pair
  predictions
  confidence
  provenance
```

现有 `DocJudgment` 继续保存人类评分。不要为竞技场再造一张含义重复但没有强约束的“评分总表”。

### 13.2 题库来源

题库可来自：

- 用户主动提供的文本。
- 用户明确同意进入研究的工作区文本。
- 系统生成的作者候选结果。
- 已获得许可的策展参考文。

每条题库记录需要独立记录：

- 来源类型。
- 版权或授权声明。
- 是否允许展示。
- 是否允许用于 reviewer 校准。
- 是否允许用于作者研究。
- 删除和撤回状态。
- brief、model、style、critic 的 fingerprint。

“可检测”不等于“可公开”；“可公开”也不等于“可训练”。

### 13.3 盲评和揭示

评分前：

- 只返回服务端生成的匿名引用和正文。
- 不返回 arm、model、machine、uploader、user、时间戳或内部 id。
- 不允许客户端自行声明 blind 状态。

评分后：

- 普通参与者只看到自己有权看到的汇总结果。
- 管理员可查看实验臂、模型、机器结果和审计信息。
- reveal 规则由 `ArenaStudy` 版本控制，不能由页面临时决定。

评分接口继续保持“每个用户对每个 revision 一条判断，重复提交覆盖整行”的明确语义；pair 级 judgment 需要另立唯一键，不用两次单篇提交模拟。

## 14. 实施路线

### 阶段 0：合同和离线 harness

产出：

- AuthorCandidate 配置 schema。
- writer、critic-plan、critic-rewrite 的输入输出 fixture。
- Generation provenance 序列化格式。
- ReviewerPrediction 的独立 DTO 和回放格式。
- calibration/holdout 切分脚本。
- 适应度报告，不改变现有生产流程。

门槛：所有结果可以根据保存的 fingerprint 和配置定位来源。

### 阶段 1：最小生成链

产出：

- brief 到 writer 初稿 Revision。
- critic 计划和修订子 Revision。
- 生成成本、耗时和父子谱系。
- 单次实验可重放。

门槛：critic 不能覆盖父 revision，失败调用不能伪装成生成成功。

### 阶段 2：私有竞技场研究协议

产出：

- `ArenaStudy` 和 assignment 语义。
- 固定评分轴和版本。
- 匿名单篇与 pair 评测。
- 题库 consent 和撤回状态。
- 管理员结果和盲评前 DTO 检查。

门槛：盲评前不能通过客户端或接口侧信道得知作者和机器信息。

### 阶段 3：reviewer shadow

产出：

- ReviewerCandidate 版本化。
- 独立 `ReviewerPrediction` 预测表。
- calibration 和 frozen holdout。
- 置信度、分歧和最差 slice 报告。
- 高不确定性样本的人类抽样队列。

门槛：reviewer 只读人类真值进行校准，任何预测都不能写入 `DocJudgment`。

### 阶段 4：作者候选筛选

产出：

- 人类评分驱动的作者候选报告。
- reviewer 只做低成本预筛。
- 全局 top-k、slice top-k 和探索名额。
- 作者谱系和变异报告。

门槛：未通过 reviewer holdout 门槛时，作者生存决策仍由人类数据完成。

### 阶段 5：交替进化和开放竞技场

只有阶段 0 至 4 稳定后才考虑：

- 作者池的自动变异和候选队列。
- reviewer 的周期性重校准。
- 风格生态位和 novelty 研究。
- 有 consent 的公共题库。
- 面向用户的排行榜或个性化推荐。

公共排行榜不是第一版目标。排行榜会改变参与者行为，必须在审计、隐私和对抗性测试之后再开放。

## 15. 风险与控制措施

### 15.1 Reviewer reward hacking

**风险**：作者只优化 reviewer 的偏好。  
**控制**：冻结人类 holdout、人工抽样、reviewer 版本回退、高置信错误审计，禁止未校准 reviewer 淘汰作者。

### 15.2 数据泄漏

**风险**：同一 brief 的多个生成版本进入不同数据集，reviewer 记住剧情而不是学会评价。  
**控制**：按 brief、pair 或题组切分；切分 fingerprint 固定并写入报告。

### 15.3 平均值同质化

**风险**：总体平均分压制小众风格。  
**控制**：slice top-k、生态位名额、探索名额和 slice 样本量门槛；报告分歧，不抹平分布。

### 15.4 机器指标替代人类质量

**风险**：低 AI 检测分数被误读成高质量。  
**控制**：检测器、AI 味和想继续读分开存储；D5 继续要求机器改善与人评不下降同时成立。

### 15.5 版权和 consent 越界

**风险**：用户上传文本被默认用于公共展示或训练。  
**控制**：来源、授权、展示许可、reviewer 训练许可和作者研究许可分别记录；默认不公开、不训练。

### 15.6 reviewer 漂移

**风险**：reviewer 在新题材、新模型或新写法上失效。  
**控制**：固定基准集、周期性人工抽样、按 slice 监测、阈值触发 shadow 回退。

### 15.7 生成成本失控

**风险**：双阶段生成和多次采样使成本按候选数和评测数快速增长。  
**控制**：先离线小矩阵；记录 token、耗时和成本；reviewer 只能在通过门槛后用于预筛；不在生产工作流中默认开启多代进化。

### 15.8 角色语义混淆

**风险**：critic、reviewer、detector 都被叫作“AI 评分”，导致错误的数据流。  
**控制**：领域术语固定；critic 只产出修订相关结果，reviewer 只产出预测，detector 只产出检测断言。

## 16. 需要在立项时拍板的事项

本提案推荐的默认答案如下：

| 决策项 | 推荐默认值 | 原因 |
| --- | --- | --- |
| Reviewer v1 目标 | 共识 reviewer | 数据需求较低，适合预筛和 shadow |
| Critic v1 输出 | 结构化 plan，rewrite 作为对照实验臂 | 更容易判断 critic 是否真的改善正文 |
| 作者主适应度 | 人类 `wantReadOn` 的 pair 加权均值 | 直接对应继续阅读意愿，含义清楚 |
| `AI 味` 的地位 | 独立诊断轴或明确约束，不隐式合并 | 避免把检测和质量混成一个分数 |
| 小众风格保护 | 全局 top-k + slice top-k + 探索名额 | 保留多样性且实现简单可审计 |
| AI 评委权限 | 先 shadow，再低成本预筛 | 防止 reviewer 自我强化和错误淘汰 |
| 人工参与 | 可降，不归零 | 持续发现 reviewer 漂移 |
| 公开范围 | 先私有研究，再 opt-in 公共题库 | 先验证协议和 consent |
| 预测存储 | 独立 `ReviewerPrediction` | 与 `DocJudgment` 做强语义隔离 |

以下事项不应在实现中隐式决定：

- reviewer 是预测人类均值、中位数还是个人分布。
- 作者 fitness 是否加入 AI 味约束。
- slice 的定义和最低样本量。
- reviewer 通过门槛及回退条件。
- 公共排行榜是否存在以及如何排序。

这些都要写入研究协议版本。

## 17. 提案验收标准

在进入正式实现任务前，本提案应满足：

- 作者候选、writer、critic、reviewer 和人类 judgment 的职责边界无歧义。
- 现有 `Text`、`Revision`、`DocJudgment`、机器断言的复用边界明确。
- 系统生成正文可以通过 provenance 回放。
- reviewer 的预测不会写入人类真值表。
- calibration 与 holdout 的切分单位明确为 brief、pair 或题组。
- 作者平均适应度与生态位保护机制分别定义。
- 检测工作台和竞技场的 UI/API 合同不再混为一谈。
- 版权、consent、盲评揭示、客户端 DTO 和 OAuth/secret 边界有落点。
- 最小离线实验和 reviewer 进入 shadow 的门槛可执行。
- 所有未决选择都有明确的默认建议或独立的拍板项。

## 18. 最终建议

先做证据链，不先做生态自动化：

```text
可复现的作者产出
  → 不可变 Revision 谱系
  → 可审计的人类盲评
  → 冻结的 reviewer holdout
  → reviewer shadow 与主动学习
  → 人类监督下的作者候选筛选
  → 最后才是交替进化池
```

双进化的价值在于扩大探索空间和降低重复评测成本，不在于消灭人类判断。只要人类真值、数据切分、provenance 和生态位保护这四条边界不稳定，自动进化越快，偏差扩散得越快。
