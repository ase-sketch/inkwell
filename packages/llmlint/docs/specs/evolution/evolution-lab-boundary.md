# 进化实验室边界

> 状态：Accepted（2026-08-16；2026-08-24 修订：critic 管线收敛为建议制循环，移除 `critic-rewrite`）。
> 前置提案：[`docs/proposed/author-reviewer-ecosystem.md`](../../proposed/author-reviewer-ecosystem.md)。  
> 目标：把作者候选池、reviewer 候选池和人工校准建成独立离线系统，不污染 Web 真值和 evals 方法论。

## 1. 定位

拟新增根目录 `evolution/`，第一阶段是离线 CLI/harness，不是长驻服务。它回答：

- 哪种 `writer + critic + style + guide + params` 组合在固定 brief 上表现更好？
- reviewer 是否能在冻结 holdout 上近似人类 judgment？
- 哪些候选适合总体读者，哪些只适合特定题材/受众生态位？
- 下一批最值得人工评分的样本是什么？

它不负责在线用户体验、规则 verdict 或生产作者自动发布。

## 2. 两个独立候选池

### 2.1 AuthorPool

```ts
type AuthorCandidate = {
    id: string;
    version: number;
    parent: {id: string; version: number} | null;
    writer: ModelPromptConfig;
    critic: ModelPromptConfig | null;
    style: FingerprintedAsset;
    guide: FingerprintedAsset;
    pipelineMode: "single-pass" | "critic-plan";
    runtimeParams: RuntimeParams;
    niche: string[];
    status: "candidate" | "evaluated" | "shadow" | "active" | "retired";
};
```

候选产物是不可变 `GeneratedSample`，完整记录 brief、调用、正文、成本和 fingerprint。critic 只输出修订建议或放行判定，改稿由 writer 执行并循环直至放行；critic 不得直接产生修订稿，也不能给候选生存打最终分。

### 2.2 ReviewerPool

```ts
type ReviewerCandidate = {
    id: string;
    version: number;
    model: ModelPromptConfig;
    target: "human-consensus" | "audience-profile";
    targetAxes: string[];
    calibrationSetFingerprint: string;
    holdoutSetFingerprint: string;
    status: "candidate" | "shadow" | "active" | "retired";
};
```

Reviewer 输出 `ReviewerPrediction`，不写 `DocJudgment`。第一版只做 human-consensus reviewer；个性化 audience reviewer 后置。

## 3. Run 结构

```text
EvolutionRun
  protocol version
  brief set + fingerprint
  author candidate set
  generation repetitions
  generated samples
  human judgment artifact
  reviewer candidates
  calibration split
  frozen holdout split
  author fitness report
  reviewer fitness report
  selection decisions
```

Run 目录建议内容寻址并只追加：

```text
evolution/runs/<run-id>/
  manifest.json
  candidates/
  samples/
  judgments/
  reports/
```

是否将 runs 提交 git 按正文版权和体积决定；manifest 和小 fixture 应进入版本控制，受限正文不进入公开仓库。

## 4. 数据输入

### 4.1 BriefSet

- 每个 brief 有稳定 id/version/fingerprint。
- calibration/holdout 按 brief/pair/题组切分。
- 同一 brief 的多个候选和重复生成不能跨 split。
- brief 不携带人类 judgment 或 reviewer 预测。

### 4.2 HumanJudgmentExport

从 Web 导入时：

- 必须验证 artifact schema、许可和 payload fingerprint。
- 人类 judgment 与 reviewer prediction 分开。
- rater 只使用匿名 key。
- revoked 数据不进入新 run。
- Task 133 可以作 fixture，不足以训练通用 reviewer。

### 4.3 RuleProfile

RuleProfile 只是作者输入或诊断制品。规则 verdict 不能成为作者最终适应度，也不能替代人类可读性。

## 5. 生成执行器

生成执行器负责：

1. 固定 candidate 和 brief identity。
2. 调 writer 产生初稿。
3. 可选进入 critic-plan 循环：critic 输出修订建议或放行判定，writer 按建议改出新稿，循环直至放行；critic 不直接产生 rewrite。
4. 保存每个中间正文，不能原地覆盖。
5. 运行 skill 诊断和外部 detector，结果标 machine。
6. 输出 GeneratedCorpus artifact。

model runtime 提供 transport、重试、限流和 usage；evolution 负责领域 prompt、pipeline 和 provenance。secret 只来自本地 ignored config/部署环境。

## 6. 适应度

### 6.1 作者

主适应度：人类 `wantReadOn` 的正文级/pair 级聚合均值。先聚合同一正文的人类评分，再聚合 candidate，避免把判断行当独立样本。

必须同时报告：

- mean、median、stddev、低尾。
- per brief、genre、audience/niche。
- AI flavor 独立轴。
- parent→candidate 和 writer→critic 增量。
- 成本、耗时、长度。

生存策略：全局 top-k + 有足够样本的 slice top-k + 随机探索名额。小样本 slice 不自动淘汰。

### 6.2 Reviewer

资格由冻结人类 holdout 决定：

- MAE/RMSE。
- pair accuracy。
- 排序相关。
- 最差关键 slice。
- 高置信错误率。

具体阈值属于每个 Study protocol，不能硬编码成项目永恒常数。Reviewer 未达门槛只能是 candidate，达到门槛先进入 shadow。

## 7. 交替更新纪律

推荐循环：

```text
作者候选生成
  → 小批量人类盲评
  → 冻结 calibration/holdout
  → 调 reviewer
  → reviewer shadow 预测新样本
  → 按不确定性/稀有 slice/冲突抽样给人类
  → 新人类数据进入下一轮 calibration
```

禁止：

- reviewer 用自己的预测继续训练自己。
- 作者只靠未校准 reviewer 自动淘汰。
- critic 自评进入人类真值。
- holdout 样本进入 prompt 示例或调参。
- 一个 run 修改另一个 run 的历史报告。

## 8. 与 Web 的集成

第一阶段不直接连 Web DB：

- evolution 导出 GeneratedCorpus，管理员显式导入 Web。
- Web 将生成正文写成 `Text(origin=generated) + rev0`。
- evolution 可以发布版本化 Study manifest；独立 assignment API 合同 Accepted 前，Web 不创建 participant assignment、不注册路由。未来实现可以复用 `blind-review` 正文与评分 intent。
- 未来 assignment 必须使用自己的 membership、per-user exposure、judgment 和 annotation API，不复用 owner `Revision.revealedAt`。
- Web 导出 HumanJudgmentExport；evolution 验证许可、fingerprint 和 withdrawal ledger 后导入下一轮。

后续若建立队列，也必须保持同一 artifact、assignment 和权限合同；网络 API 只负责传输，不改变数据所有权。

## 9. 与 evals 的隔离

- evolution 不写 `evals/corpus` 和主 `report.json`。
- evals rule holdout 与 reviewer holdout 独立。
- evolution 可以运行 `skill`，不 import evals metrics。
- 如果需要规则统计，消费版本化 RuleEvaluationReport。
- 进化产生的新规则研究另开 evals experiment，不让作者池静默改变规则真相源。

## 10. 最小实现切片

阶段 0 只实现：

- AuthorCandidate/ReviewerCandidate schema。
- manifest 和 fingerprint。
- 10 brief × 3 author × 3 repetition 的本地生成 harness。
- HumanJudgmentExport 导入验证。
- frozen split 和两个 fitness report。
- 一个 reviewer candidate 的离线 shadow 报告。

不实现自动变异、公开排行榜、长期调度服务或生产发布。

## 11. 验收

- 任一样本能追溯到 brief、candidate、writer、critic、style、guide、params 和调用结果。
- 人类 judgment 和 reviewer prediction 物理/类型分离。
- split 以 brief/pair 为单位并有 fingerprint。
- reviewer 未通过 holdout 时不参与作者淘汰。
- Run 可离线复放，不需要 Web DB。
- evolution 的失败不会修改 skill、evals 主报告或 Web 生产数据。