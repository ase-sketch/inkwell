# D5 应用验收合同

> 状态：Accepted（2026-08-16，`d5-owner-v2`）。  
> 目标：把“AI 风险下降且人类想继续读不下降”定义成可复放、可解释的版本化判定。  
> 范围：owner 工作区的一次改稿验收；baseline 和 candidate 都先盲评再揭示。Arena 多评委研究另立 Study protocol。

## 1. 判定对象与可信输入

D5 v2 评估一个 Text 内的两个不可变 Revision。它与 v1 使用相同双条件公式，但新增 candidate judgment 必须为 blind 的准入条件；历史揭示后复评只能保留为旧版本证据，不能冒充 v2。公开的 `WorkspaceSnapshotDto` 已去除其他身份，不足以证明 owner、rev0 和同 Text 关系；D5 evaluator 不接受 `HumanJudgmentDto`、`MachineDetectDto` 或裸 revision id 拼成的输入。

```ts
type D5RevisionCheckpoint = {
    revisionId: string;
    textId: string;
    ordinal: number;
    parentRevisionId: string | null;
};

type D5DetectorInput = {
    recordId: string;
    revisionId: string;
    identity: DetectorIdentityDto;
} & (
    | {runStatus: "succeeded"; docPAi: number}
    | {runStatus: Exclude<ChannelStatus, "succeeded">; docPAi: null}
);

type D5OwnerJudgmentInput = {
    judgmentId: string;
    revisionId: string;
    ownerUserId: string;
    wantReadOn: number | null;
    blind: boolean;
};

type D5EvaluationInput = {
    algorithmVersion: "d5-owner-v2";
    textId: string;
    ownerUserId: string;
    baseline: D5RevisionCheckpoint;
    candidate: D5RevisionCheckpoint;
    primaryDetector: DetectorIdentityDto;
    baselineDetect: D5DetectorInput | null;
    candidateDetect: D5DetectorInput | null;
    baselineJudgment: D5OwnerJudgmentInput | null;
    candidateJudgment: D5OwnerJudgmentInput | null;
};

type VerifiedD5EvaluationInput = D5EvaluationInput & {
    readonly __brand: "verified-d5-owner-v2";
};
```

受信 server adapter 必须在同一一致性快照/事务中读取 Text owner、两条 Revision、MachineDetect 和 DocJudgment，核对后构造 branded internal input。它必须保证：

- Text id 等于输入 `textId`，Text owner 等于 `ownerUserId`。
- baseline 与 candidate 的 `textId` 都等于输入 `textId`。
- baseline 是 `ordinal=0,parentRevisionId=null` 的 rev0；candidate `ordinal>=1`。
- 两条 detector record 的 `revisionId` 分别锚定 baseline/candidate；identity、runStatus 和 docPAi 必须从原记录无损投影。evaluator 再判断 identity 是否等于 `primaryDetector` 以及运行是否成功。
- 两条 judgment 的 `revisionId` 分别锚定 baseline/candidate，`ownerUserId` 等于 Text owner。

adapter 对 Text owner、revision/text、judgment/owner、detector/revision 或 baseline checkpoint 的锚点校验失败时必须 hard fail：不构造 `VerifiedD5EvaluationInput`，不创建或返回 canonical D5，记录内部完整性诊断，对外只返回通用投影失败。只有锚点全部成立后，detector identity 不同、运行失败、业务输入缺失或历史 judgment 非 blind 才由纯 evaluator 返回 `indeterminate`。每次合法评估保存 `algorithmVersion`、输入 identity、input fingerprint 和生成时间；parent diff 只用于解释本轮修改，不改变固定 rev0 baseline。

## 2. 两条腿

### 2.1 机器腿

D5 v2 只认一个版本化的 primary external detector：

```text
machinePassed = candidate.docPAi < baseline.docPAi
```

前置条件：

- 两端 `DetectorIdentityDto` 的 detectorName、detectorVersion、chunkChars、aggregationVersion 全同。
- 两端运行均为 succeeded。
- 两端结果都锚定对应 revision。

其他 detector、MachineScan 命中和 MachineLlmReview 只进入诊断报告，不替代 primary detector。缺 primary detector 时正式 D5 为 indeterminate；不能用静态命中下降降级判定“通过”。

v2 的最小下降量为严格大于 0。未来若引入噪声阈值或置信区间，必须升 `algorithmVersion`，旧结果不重算成新版本。

### 2.2 人类腿

owner 工作台只比较同一 owner 对两个 revision 的 `wantReadOn`：

```text
humanPassed = candidate.wantReadOn >= baseline.wantReadOn
```

- 两条 owner-bound judgment 已由 server adapter 核对为 Text owner。
- baseline judgment 在 rev0 reveal 前写入，`blind=true`。
- candidate judgment 在 candidate reveal 前写入，`blind=true`。
- 两端 `wantReadOn` 均非空。

`aiFlavor`、`improvementScore` 和 comment 进入报告，不参与 D5 v2 的通过公式。用户在任一 revision 跳过盲评、任一 wantReadOn 缺失或任一 judgment 非 blind 时，人类腿为 indeterminate。

多评委平均值、中位数和 cohort 不是 owner D5。Arena 研究若要复用“双条件”思想，必须定义独立 `StudyEvaluation`，按同一 rater 的成对样本先聚合，并记录样本门槛和置信区间。

## 3. 结果状态

```ts
type D5Evaluation = {
    evaluationId: string;
    algorithmVersion: "d5-owner-v2";
    inputFingerprint: Fingerprint;
    textId: string;
    baseline: D5RevisionCheckpoint;
    candidate: D5RevisionCheckpoint;
    primaryDetector: DetectorIdentityDto;
    baselineDetectorRecordId: string | null;
    candidateDetectorRecordId: string | null;
    baselineJudgmentId: string | null;
    candidateJudgmentId: string | null;
    machine: D5LegResult;
    human: D5LegResult;
    status: "passed" | "failed" | "indeterminate";
    evaluatedAt: IsoUtc;
};
```

总状态：

- `passed`：两条腿都 passed。
- `failed`：两条腿都可判，且至少一条 failed。
- `indeterminate`：任一腿 indeterminate。即使另一腿 failed，也保留该已知失败证据，但总状态仍为 indeterminate，避免把缺数据伪装成完整验收。

建议原因枚举：

```text
missing-baseline-detector
missing-candidate-detector
detector-identity-mismatch
detector-run-not-succeeded
missing-baseline-want-read-on
missing-candidate-want-read-on
baseline-not-blind
candidate-not-blind
```

owner/text/revision/record 锚点失配不属于公开 reason 枚举；它们在 trusted adapter 边界 hard fail，不能固化为合法三态结果或进入研究导出。

## 4. 多 detector 展示

- Workspace policy 固定一个 primary detector identity。
- Overview 同时展示所有 detector，但 D5 卡明确标出 primary。
- 非 primary detector 的相同口径变化作为 secondary evidence 独立列出。
- 不同 identity 不计算差值。
- primary policy 变化必须产生新的评估配置/版本，不能静默替换旧 D5 卡。

本条执行已接受决策 12 的 A：owner D5 v2 固定版本化 primary DetectorIdentity；两端 owner judgment 都必须在各自 revision reveal 前提交。缺失、非盲或 detector identity 不匹配返回 `indeterminate`，其他 detector 和静态命中只作诊断。

## 5. 持久化与派生

第一版可以由受信 server adapter 从 machine records 和 judgments 构造输入，再用纯函数派生 D5，不急于建 `D5Evaluation` 表。浏览器不能从公开 Workspace DTO 自行构造可信输入。

canonical `D5Evaluation` 同时是 server 内部评估记录、导出记录和 owner Workspace 的去身份化 projection。它必须完整保留 input fingerprint、text/revision checkpoint、primary DetectorIdentity、两端 detector record id、两端 judgment id、两条腿原始值/原因和算法版本。公开形状不含 `ownerUserId`；owner 关系已由 server adapter 验证。缺失输入的 record/judgment id 显式为 null，不能省略后让 consumer 猜测。

若未来持久化 D5 结果，输入记录更新后不覆盖旧结果；以新 evaluation id/version 重算。

## 6. API 与 UI

- Workspace API 不在 machine payload 中塞一个裸 `d5Passed`。
- server evaluator 返回 canonical `D5Evaluation`；client 只展示或选择结果，不能从 `HumanJudgmentDto` 自行重建 owner 断言。
- Overview/Revisions 显示 passed/failed/indeterminate 和各腿理由。
- indeterminate 不能使用通过颜色或“降级通过”措辞。
- 机器腿失败不自动建议继续重写；报告仍以语义、角色声音和可读性为上限。

## 7. 合同测试

至少覆盖：

1. 同 identity、docPAi 下降、两端盲评 wantReadOn 不降 → passed。
2. 机器上升或人评下降 → failed。
3. 缺任一端 detector → indeterminate。
4. aggregationVersion 不同 → identity mismatch。
5. 缺 baseline/candidate wantReadOn → indeterminate。
6. baseline 或 candidate 非 blind → indeterminate。
7. judgment user 与 Text owner 不同 → adapter hard fail，不产生 D5，公开 DTO 不暴露关系细节。
8. baseline 非 rev0、两 revision 不属同一 Text 或 record 锚错 revision → adapter hard fail，不产生 D5。
9. 任意阅读比较不影响固定 rev0 D5 baseline。
10. 静态命中下降但 primary detector 缺失 → indeterminate，不降级通过。
11. v1 与 v2 结果按 algorithmVersion 分开，旧结果不被新 policy 静默覆盖。