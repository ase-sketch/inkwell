# 跨系统制品合同

> 状态：Accepted（2026-08-16）。
> 目标：让 Web、evals 和 evolution 在不共享数据库、不引用对方内部模块的前提下交换可验证数据。

## 1. 通用 envelope

每个跨边界 JSON 制品必须有同一外壳：

```ts
type ArtifactEnvelope<T> = {
    schema: string;              // 例："llmlint.rule-evaluation-report/1"
    artifactId: string;          // 制品实例的稳定 id，不承担内容校验
    createdAt: string;           // ISO 8601 UTC
    producer: {
        system: "web" | "evals" | "evolution";
        version: string;
    };
    payloadFingerprint: string;  // sha256:<64 lowercase hex>
    payload: T;
};
```

`payloadFingerprint` 对规范化后的 `payload` 计算，不包含 envelope 自己。规范化算法必须由未来根级 `contracts/` 提供唯一实现：对象键排序、数组保序、字符串按原值、禁止 `undefined`、时间先转 ISO 8601。各系统不得各写一套“差不多”的 JSON hash。

未知 major schema 必须拒绝；已知 schema 中未知可选字段可以忽略。任何迁移都保留原 artifact，不原地改写历史 payload。

## 2. 稳定键

- `ruleId`：由 `skill/` 定义，全局稳定；改名按破坏性迁移处理。
- `modelKey`：`<providerId>/<modelId>`；展示名不能代替稳定键。
- `genre`、`textType`、`pov`：来自统一 taxonomy，key 只增不改。
- `revisionId`：仅在所属 Web 数据域内有意义；跨导出必须携带匿名 subject key。
- `briefId` / `pairKey`：同一生成任务或同源比较的稳定键；holdout 按这些键切分。
- `authorCandidateId`、`reviewerCandidateId`：必须与各自 `version` 一起引用。
- 所有内容指纹统一为 `sha256:<64 lowercase hex>`。

## 3. 版本和覆盖口径

### 3.1 engine identity

只写一个 `engineVersion` 不足以证明两个扫描可比。制品必须同时记录：

```ts
type EngineIdentity = {
    packageVersion: string;
    ruleSetFingerprint: string;
    capabilities: Array<"regex" | "density" | "handler" | "semantic">;
    scanScope: string;
    scoringVersion: string;
};
```

当前 Web、evals 和 CLI 的能力覆盖不同；只有 `capabilities`、`ruleSetFingerprint`、scanScope 和 scoringVersion 全同的扫描结果才能直接比较。`scoringVersion` 标识 raw hits、span 去重、可见字计数和 docScore 聚合口径；其中任一算法变化都必须升版本。`packageVersion` 只描述发布包，不能替代 scoringVersion。Web 的 regex+handler、evals 的 regex-only、CLI 的完整能力不得混算。目标持久层、Web API 和 artifact 都必须保存完整 EngineIdentity；当前记录缺 scoringVersion 属于 schema 迁移差距，只能显式映射到已核实的 legacy scoring version。

### 3.2 prompt 和生成 identity

每次生成至少记录：

- brief id、version、fingerprint。
- writer/critic model key。
- writer/critic prompt version。
- style key 和 fingerprint。
- guide tier、profile 和 fingerprint。
- pipeline mode、runtime params、seed 或“不支持稳定 seed”。
- 输入、输出正文 fingerprint。
- token、成本、开始/结束时间和调用结果。

修改 prompt 内容必须产生新版本 key；不得在相同 key 下静默改文案。

### 3.3 detector identity

外部 AI 检测至少由以下组合确定可比口径：

```text
detectorName + detectorVersion + chunkChars + aggregationVersion
```

任何字段不同都必须显示为不同检测序列，不得画成同一趋势线。

## 4. 坐标和计数

- 跨 Web API 和 artifact 的正文 span 统一使用 JavaScript UTF-16 半开区间 `[start, end)`。
- evals 内部若使用码点坐标，必须在导出边界显式转换并记录 coordinate system。
- `charCount` 的默认口径是去空白 Unicode 码点数；若某指标使用 UTF-16 长度或可见字数，字段名或 metadata 必须明确。
- 热力块、规则命中、批注和 revision diff 必须声明锚定的 `revisionId` 或匿名 revision key。
- 草稿坐标不得持久化成 revision span；必须先映射回基线 revision，无法可靠映射则拒绝写入。

## 5. 核心制品

### 5.1 RuleEvaluationReport

生产者：evals。消费者：Web、evolution。

必须包含：

- corpus/split fingerprint。
- EngineIdentity。
- report 方法版本。
- render prompt 唯一版本。
- per-rule 原始统计、分层统计、verdict 和支持量。
- holdout 是否启用及关闭原因。
- 外部 detector 结果明确标为对照仪表。

### 5.2 RuleProfile

生产者：evals 构建步骤。消费者：Web、evolution。

必须包含 profile key/version、来源报告 fingerprint、included/excluded rule ids 及理由。它是规则超集的选择投影，不得写回 `skill` 规则记录。若需要生成 guide，由 Web/evolution/offline adapter 把 RuleProfile 映射为 `skill` 自己定义的公开 `GuideProfileInput`；`skill` 不 import `contracts`，也不直接解析 RuleProfile artifact。

### 5.3 RevisionCorpusExport

生产者：Web。消费者：evals/evolution。

必须包含匿名 Text/Revision 谱系、origin、classification、机器断言、许可矩阵和每个 revision 的研究准入标记。Revision provenance v2 导出保留匿名化后的 edit id、父/子 span、before/after fingerprint、rule/hit/engine、Agent invocation/model/prompt、critic candidate version/fingerprint；移除 owner、OAuth id、username、可反查内部 session 的 key 和 secret。v1 历史只能标记 legacy-unattributed，不能推测缺失身份。

### 5.4 HumanJudgmentExport

生产者：Web。消费者：evolution，必要时 evals。

必须区分人类 judgment 与机器预测，记录 study、round、axis version、blind 状态、匿名 rater key、revision/pair key。撤回后的 judgment 不得出现在新 artifact 中。

### 5.5 EvolutionRunReport

生产者：evolution。消费者：人类评审、Web 管理员导入流程。

必须包含候选谱系、生成 provenance、人工样本覆盖、calibration/holdout fingerprint、适应度原始指标和全部淘汰/保留理由。不得只输出一个冠军 id。

### 5.6 GeneratedCorpus

生产者：evolution。消费者：Web 管理员导入。

每篇正文必须包含 artifact item id、body fingerprint、author candidate provenance、`displayAllowed`、`reviewerCalibrationAllowed`、`authorResearchAllowed` 和 revoke/tombstone 状态。Web 导入映射固定为：

- 通过配置指向一个禁用交互登录的 system curator 用户作为 `uploaderId/owner`；不能归当前管理员，也不能伪造普通用户。
- `originKind=generated`，`modelKey` 与完整生成 provenance 来自 artifact；`declaredProvenance=null`。
- `visibility=private`，只有 `displayAllowed=true` 且管理员另行发布后才能公开。
- Web 的处理 `consent=true` 只表示系统有权保存该自产文本；三项研究/展示许可仍独立保存，不能从 consent 或 visibility 推导。
- 创建一个 `rev0(transitionKind=upload,parentId=null)`；artifact item id + payload fingerprint 建唯一导入 ledger，保证幂等。
- artifact 在导入前已 tombstone/revoked 时拒绝导入。导入后收到已验证 tombstone 时，立即隔离正文、撤下公开展示并停止新 reviewer calibration、author research、训练和再导出；不能静默保留为可训练样本。

每个可撤回 artifact producer 必须发布版本化 `ArtifactWithdrawalList`，至少含原 artifact fingerprint、item id、revokedAt、reason code 和撤回记录 fingerprint。consumer 以 append-only ledger 记录已处理撤回；每次导入、公开展示、校准、研究运行和再导出前都必须先同步撤回清单。已经完成的不可变实验报告保留输入 fingerprint 和“已撤回”标记用于审计，不再暴露正文，也不能成为新衍生运行的输入。

content fingerprint 相同但 artifact item id 不同的条目默认拒绝重复导入并进入人工冲突队列，不自动合并 provenance。system curator、retention、备份和历史接收方处理按已接受决策 13/14 执行；在 producer/consumer 都实现 withdrawal ledger 前，GeneratedCorpus 仍禁止公共发布、reviewer calibration、author research/训练和向第三方再导出，只允许管理员隔离区验证 schema。

### 5.7 ReviewerPredictionExport

生产者：实际执行 reviewer 的系统；离线运行是 evolution，在线 shadow 是 Web。消费者：研究报告或另一系统的只读镜像。

每条预测必须有全局稳定 `predictionId`、producer、reviewer candidate id/version、revision/pair 匿名 key、axis version、预测值、置信度、输入 fingerprint 和运行 provenance。预测不可变；下游按 `predictionId + payload fingerprint` 幂等导入，不能重新赋 id、覆盖内容或写入 `DocJudgment`。ReviewerCandidate 的定义仍由 evolution 拥有，Web 只能运行已经批准并带 fingerprint 的版本。

## 6. 命名决策

现有文档中的 `LlmJudgment` 同时可能指“LLM 判来源/规则”与“reviewer 预测人类偏好”，语义冲突。

已接受的命名合同：

- `MachineLlmReview`：LLM 对规则命中和风险的机器断言，现有 Web 名称保留。
- `ReviewerPrediction`：reviewer 对人类评分的预测，独立表和 artifact 使用此名称。
- `DocJudgment` / `PairJudgment`：只用于人类 judgment。

不得新增含义模糊的通用 `LlmJudgment`。历史文档中的旧名只作迁移搜索词。

## 7. Secret 与隐私

- OAuth client secret、session password、provider key、refresh/access token 不进入任何 artifact。
- user id、username 和可反查 owner 的字段默认不进入研究制品。
- `private` 文本只有在独立研究 consent 为真时才能进入匿名导出。
- “允许公开展示”“允许校准 reviewer”“允许作者研究”是三个不同权限，不得复用一个布尔值推导。
- artifact 的权限是导出时快照；用户撤回后必须阻止未来导出，并通过 tombstone 或撤回清单处理已分发数据。

## 8. 合同测试

未来每个 artifact schema 必须有：

1. producer 序列化测试。
2. consumer 解析测试。
3. fixture 往返测试。
4. 未知 major、损坏 fingerprint、非法 span、缺少许可的拒绝测试。
5. 一份最小合法 fixture 和一份包含全部可选字段的 fixture。

这些测试验证边界合同，不验证某个页面的实现细节。