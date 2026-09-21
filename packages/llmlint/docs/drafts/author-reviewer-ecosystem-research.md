# 作者与评委生态研究草案

> 状态：前置研究草案，未实施。2026-08-15。正式提案见 [`docs/proposed/author-reviewer-ecosystem.md`](../proposed/author-reviewer-ecosystem.md)。

## 结论

用户提出的方向可行，但不应直接实现成“两个群体互相淘汰的单一遗传算法”。更稳妥的模型是：

- **作者候选**：`writer + critic + 参数 + 版本化提示词`，共同产出一个或多个 `Revision`。
- **评委候选**：一个带版本、训练来源、校准集和适用人群声明的评分器。它模仿的是人类对某一评价轴的打分，不是 critic 的内部自检。
- **人类评分**：唯一的最终真值。AI 评委只负责降低人工覆盖量和发现冲突，不能反过来制造自己的训练标签。
- **作者适应度**：固定评测集上的人类平均偏好分，仍要同时报告分歧、最低分和题材分层。平均值用于排序，但不能抹掉少数口味或题材适配失败。
- **评委适应度**：与冻结人类评分的相似度，至少按 pair、题目和用户分层计算，不能只看总体相关系数。

## 现有系统能直接复用什么

llmlint 当前已经有三条基础：

1. `/contribute` 是检测与改文工作台，已有不可变 `Revision` 谱系、机器扫描、外部检测器、人类 blind/post judgment、span 批注和 D5 验收。
2. `/style-review` 已实现匿名四臂盲评，使用 `AI 味 0–5` 与 `想继续读 0–5` 两轴，并把 arm、模型和机器数据留在服务端，公开面只看到正文和匿名键。
3. 统一数据模型已经明确区分 `origin`、`revision`、`DocJudgment`、`SpanAnnotation`、机器断言和后置的 `PairJudgment`。因此不应另造一套“作者结果表”来绕过现有 Revision。

当前缺口：

- `/style-review` 是私有实验页，不是公开竞技场，题库固定且只能评分单篇正文。
- 生成管线目前是一次 LLM completion。尚无 writer/critic 两阶段合同，也没有作者版本的 prompt、模型、style、critic 和成本记录。
- `LlmJudgment` / PairJudgment 尚未建表，AI 评委没有稳定训练与回放接口。
- 任务 133 的正式人评只覆盖 5 组 pair，足以支持候选研究，不足以训练通用评委或宣称默认文风对所有题材有效。

## 领域模型

### Text 与来源

- `Text`：正文信封，记录来源类型和所有权。
- `Revision`：正文不可变版本。`rev0` 可来自用户、人类策展或系统生成；后续版本通过 `transitionKind` 记录 `static_fix`、`llm_fix`、`user_fix` 或未来的 `critic_fix`。
- `Brief`：只描述剧情、人物、节拍和信息顺序，不携带原文句子或文体。它是作者候选的共同输入。

### AuthorCandidate

作者候选不是单独的 LLM 名称，而是一份可复现配置：

```text
AuthorCandidate
  id / version
  writer: modelKey + promptVersion + runtimeParams
  critic: modelKey + promptVersion + runtimeParams
  stylePreset: key + fingerprint
  guide: tier + fingerprint
  pipeline: single-pass | writer-critic
  objective: 生成正文 / 受限修订
  provenance: briefVersion + sourceRef + createdAt
```

`writer` 负责从 brief 生成初稿。`critic` 接收正文、brief、style 和约束，输出结构化问题清单与建议修订，或直接输出完整修订稿。第一版建议让 critic 输出结构化 plan，再由 writer 或 repair executor 应用，避免 critic 既当裁判又悄悄改结果。

作者候选的产物仍然是 `Revision`，但需要新增不可变的生成 provenance：authorCandidateId、writer/critic invocation、style fingerprint、guide fingerprint、brief fingerprint、随机参数、token/cost、父版本。

### ReviewerCandidate

评委候选是打分器，不是 critic：

```text
ReviewerCandidate
  id / version
  modelKey + promptVersion
  targetAxes: aiFlavor | wantReadOn | pairChoice | spanQuality
  population: 训练者或目标读者群体
  calibrationSetFingerprint
  status: candidate | shadow | active | retired
```

Reviewer 接收正文，输出分数、置信度和可选理由。理由只能作为解释，不得覆盖结构化分数。若要模拟不同口味，应把“评委个体”保留为独立 candidate 或 profile，不把所有人压成一个平均模型。

### HumanJudgment

现有 `DocJudgment` 是主表。需要增加研究语义，而不是另造同义表：

- `studyId` / `roundId`：本次题库和评测轮次。
- `axisVersion`：评分尺版本。
- `source`: human 或 imported human，服务器写入。
- `blind`：继续由揭示状态推导。
- `raterProfile`：可选、自述且低信任；读者/作者/编辑不是事实标签。

AI 评委的预测进入独立 `LlmJudgment`，字段包括 model/prompt/version、对哪个 revision、预测分、置信度、运行状态和 evidence。它永远不写入 `DocJudgment`。

## 两个适应度函数

### 作者适应度

第一排序指标可以是人类 `wantReadOn` 的平均值，但必须配套以下报告：

```text
authorFitness = mean(human wantReadOn)
report:
  mean / median / stddev
  per-pair score
  per-genre score
  low-tail rate
  AI-flavor mean
  length delta
  cost and latency
```

平均值是排序规则，不是唯一观察结果。对少数口味独特的作者，不应把低平均值直接解释为“坏作者”。更合适的生态机制是按题材、受众群体和风格标签分池排名，让它在自己的 audience slice 中有生存空间。

### 评委适应度

不要只用 MSE。评分数据是有序离散量，且一个人类评委的绝对分数习惯可能整体偏高或偏低。评委适应度应分三层：

1. **校准误差**：按轴的 MAE/RMSE，检查分数距离。
2. **排序一致**：同一 pair 上 reviewer 是否和人类多数选择一致；用 pair accuracy、Kendall/Spearman 作为辅指标。
3. **群体覆盖**：按题材、pair、评分者分层，报告最差 slice，防止只学会平均口味。

主排名可采用归一化 MAE + pair accuracy 的加权分数。每次训练必须有冻结 holdout，不能在同一批人工数据上生成和验收。

## 为什么不能让 critic 兼任 reviewer

- critic 的任务是帮助作者修改，天然倾向于寻找可操作问题。
- reviewer 的任务是预测人类感受，允许“不改也能读”“我个人不喜欢但读者可能喜欢”。
- critic 如果看到自己的输出再评分，会产生自评循环，作者会优化到 critic 的偏好，而不是人类的偏好。
- 两者可共享规则和正文输入，但模型身份、版本、存储表和适应度必须分离。

## 双遗传算法的可行实现

更准确的说法是“两个交替更新的进化池”：

### 作者池

- 候选由 `writer + critic + style + guide` 组成。
- 变异只改变一个受控维度：style 规则、critic 规则、writer 模型、采样参数或流程阶段。
- 固定 brief/pair 评测，生成新 Revision。
- 用冻结人类评分排序，保留不同题材/受众 slice 的候选，不按全局平均值单独淘汰。

### 评委池

- 候选由模型、prompt、轴定义、少量示例和读者群体声明组成。
- 用已经冻结的人类判断训练或提示优化。
- 在 holdout 上按评分误差、pair 选择和分层最差表现验收。
- 评委候选只能进入 shadow，连续多个冻结轮次稳定后才降低对应人类抽样比例。

### 两池之间的关系

作者池的评测结果为评委池提供新分布样本。评委池只在达到可靠性门槛后，作为作者池的低成本预筛。不能让作者池直接用尚未校准的 AI 评委分数淘汰作者，也不能让评委池用自己预测的标签继续训练自己。

建议的循环：

```text
人类小批量盲评
  → 冻结人类集 + holdout
  → 训练/提示优化 reviewer
  → reviewer shadow 评估新作者候选
  → 按不确定性抽样给人类复核
  → 更新 reviewer 校准集
  → 人类评分达到门槛后，作者池扩大筛选
```

这是主动学习和进化搜索的组合，不是完全自动的遗传算法。

## 必须先锁的硬边界

1. 人类标签不可被 AI 评委覆盖。
2. 训练集、调参集、holdout 严格按 pair 或 brief 切分，不能按正文随机切分。
3. 同一作者候选在同一轮使用固定 brief、模型和评测协议，随机性通过多次生成或固定 seed 记录。
4. 作者适应度按受众 slice 报告，平均值用于总排序但不作为唯一产品解释。
5. AI 评委只能输出预测，不得写 `DocJudgment`。
6. critic 不能直接决定作者生存；它的结果是修订建议或候选修订。
7. 公开题库必须记录版权、consent、来源声明和是否允许训练。
8. 机器检测分数仍是仪表，不替代人类“想继续读”判断。

## 下一步最小实验

不先开放完整竞技场。先做离线小实验：

1. 选 10 个 brief，固定 3 个作者候选：single-pass、writer+critic-plan、writer+critic-rewrite。
2. 每个 brief 每候选生成 3 次，记录完整 provenance 和成本。
3. 让现有人工评测者盲评 AI 味、想继续读，并保留 pair 内比较。
4. 用其中 70% 的 pair 做 reviewer prompt/calibration，30% 做 holdout。
5. 比较一个简单 LLM reviewer 与人类平均分，按 MAE、pair accuracy、题材最差 slice 报告。
6. 只有 reviewer 在 holdout 上稳定，才接入 Web shadow，不直接替代人类。

## 不应现在做的事情

- 不先做全自动作者淘汰。
- 不把平均值写成“唯一真理”后删除分歧信息。
- 不把 critic 的自评结果当人类偏好。
- 不把一次 5 pair 的 Task 133 数据当通用 reviewer 训练集。
- 不在没有题库版权和 consent 合同前开放用户上传正文的公共训练池。
