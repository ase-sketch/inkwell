# evals 评测实验室边界

> 状态：Accepted（2026-08-16）。
> 权威方法论：[`evals/METHODOLOGY.md`](../../../evals/METHODOLOGY.md)。  
> 目标：规定 evals 与规则运行时、Web、进化实验室的关系。

## 1. 定位

`evals/` 只承担离线测量。线上服务和进化调度属于其他系统。它回答：

- 哪些规则对给定任务和语料有判别力？
- 某个 guide/profile 对某个模型是否有效？
- 规则、模型和题材分层下的结果是否稳定？
- repair 是否降低机器风险且不混入 lift？

它不回答“哪个作者候选应该存活”或“AI reviewer 是否像人类”。这些属于 evolution。

## 2. 数据流

```text
授权语料
  → acquire / curate
  → reference
  → brief（无句子级文体）
  → render（同 brief 配对）
  → 可选 repair（单独角色）
  → skill 公开扫描 API
  → metrics / holdout / verdict
  → RuleEvaluationReport
  → RuleProfile artifact
```

### 2.1 数据流标注的正式含义

- `brief（无句子级文体）`：brief 只描述任务、题组、剧情和必要的题材/体裁约束；不得携带可直接复制的句子级文风范本、参考正文片段或作者身份提示。
- `render（同 brief 配对）`：同一题组内的 reference 与 render 必须使用同一 brief、同一核心任务和可比元数据；pair key 进入 split fingerprint，不能生成后再凭内容相似度补配对。
- `repair（单独角色）`：repair 是独立实验角色和输出阶段，结果可以测 docScore 或规则变化，但不得回写 reference/render 的 lift、AUC 或人类基线。


主消费路径直接 import `skill` 公开 API，不 spawn CLI。生成侧可以调用模型 CLI/HTTP transport，但不能让 transport 语义泄漏进 metrics。

## 3. 资产边界

- `skill/`：规则真相源，evals 只读。
- `evals/corpus/`：受许可的本地评测语料；不自动公开。
- `evals/experiments/`：版本化实验及其 validity，不混入主 corpus。
- `evals/report/`：派生报告，可重建。
- Web DB：不直接连接。
- evolution run store：不直接连接。

## 4. 方法论硬边界

继续以 `METHODOLOGY.md` 和 CONTEXT I1–I28/D1–D5 为准，尤其：

- brief 不带句子级文体。
- baseline render 不喂文风范本。
- reference/render 同 brief 配对。
- per-rule 原始命中与 docScore 去重 span 分开。
- repair 单独统计，不进入 lift/AUC。
- holdout 按题组切分，不能按正文随机切。
- prompt 内容变化必须升版本。
- uploaded 和 rev_k 不进入 lift。
- 机器断言不是人类真值。

本 spec 不复制统计公式；统计公式只维护在 METHODOLOGY 和 evals 实现中。

## 5. 对外制品

### 5.1 RuleEvaluationReport

唯一报告制品必须携带：

- schema/version。
- corpus 和 split fingerprint。
- 完整 EngineIdentity：rule set、capabilities、scanScope 和 scoringVersion。
- prompt versions。
- per-rule/per-model/per-genre 原始统计。
- verdict、支持量、holdout 状态。
- 外部 detector 对照结果。

### 5.2 RuleProfile

profile 是报告的产品投影，记录 included/excluded rule id 和理由。它可以被 Web 或 evolution 消费，但不得写回 `skill` 规则本体。

### 5.3 Web 研究导入

Web 导出的 `RevisionCorpusExport` 若进入 evals，必须经过显式 ETL：

- 校验 schema、许可、origin 和 revision ordinal。
- 只允许 D1 准入条目进入 lift。
- 保存来源 artifact fingerprint。
- 不能把用户自述 human 当 curated ground truth。
- 不能直接把 Web UTF-16 span 当 evals 内部码点 span。

evals 若需要人类判断某个规则实验样本，必须输出版本化 Study manifest，由 Web 创建 assignment 并使用 `blind-review` 表面采集。evals 只读取带许可、匿名化的 judgment/annotation artifact，不直接连接 Web DB，也不拥有 participant exposure。

uploaded 文本的 judgment 和 span annotation 可以用于误报分析、规则整理或独立 experiment；它们不满足 D1，不能进入主 lift 的 human ground truth。规则候选经整理后仍需在 curated/generated 配对语料上重新验收。

## 6. 扫描覆盖口径

当前 evals 主要测 regex，而 Web 和 CLI 覆盖能力不同。目标规则：

- 每个报告必须记录 capabilities，不以单独 `engineVersion` 宣称全量等价。
- regex-only 报告只能给 regex 规则 verdict。
- handler/density/semantic 未测时明确 `unmeasured`，不得继承其他 detector 的 verdict。
- Web 只能把与当前能力匹配的 report/profile 用于展示和选择。

## 7. 与进化实验室的关系

允许：

- evolution 消费版本化 RuleProfile 作为 writer/critic 的 guide 输入。
- evolution 运行 skill 扫描，将结果作为候选诊断。
- 某个进化实验复制一份明确的 evals fixture 作为基准，但记录来源 fingerprint。

禁止：

- evolution 修改 evals 主 corpus 或 report。
- reviewer holdout 复用 evals rule holdout 并宣称同一验证。
- 作者适应度使用 evals lift 代替人类 `wantReadOn`。
- evolution 生成的新正文静默进入规则 verdict 训练集。

若未来需要“作者候选对规则分布的影响”研究，应在 `evals/experiments/` 建独立、带 validity 的实验，不改主报告。

## 8. 与 Web 的关系

Web 可以：

- 构建时消费 RuleEvaluationReport/RuleProfile artifact。
- 在线使用 `skill` 运行时做扫描。
- 导出匿名研究数据供 evals ETL。

Web 不应该：

- 运行 evals score/corpus loader。
- 在生产请求中读取 `evals/report/report.json`。
- 通过 alias import evals 的内部 model client、taxonomy 或 detector helper。

目标迁移：taxonomy 和 schema 进入 `contracts`；model transport 进入共享 runtime；evals metrics 保持私有。

## 9. 验收

- evals 能在没有 Web DB 和 evolution run store 的环境运行。
- skill 包能在没有 evals 的环境发布和运行。
- 每个报告可由 corpus、config、prompt 和 engine fingerprints 复放。
- capability 不同的报告不会被误认为可比。
- Web/evolution 只通过公开 API或制品消费 evals 结果。
- reviewer、人类 judgment 和作者适应度不进入 evals 规则判别口径。