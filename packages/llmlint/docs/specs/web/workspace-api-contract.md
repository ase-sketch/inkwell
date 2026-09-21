# 工作区 API 合同

> 状态：Accepted（2026-08-16，`llmlint.workspace/2`）。  
> 目标：定义检测工作台入口和评判工作区的 canonical wire DTO。  
> 非范围：Prisma 表结构、组件内部 query model、可写模式编辑交互。

## 1. 合同位置

本文件是 Workspace HTTP/SSE 载荷的唯一真相源：

- [`workspace-state-and-commands.md`](workspace-state-and-commands.md) 定义客户端状态所有权、reducer 和 command bus。
- [`assessment-workspace.md`](assessment-workspace.md) 定义组件消费的 query model。
- server adapter 负责把数据库事实投影成本文件 DTO。
- client adapter 负责把本文件 DTO 投影为组件 query model。

Prisma model、页面 ref 和组件 props 都不能反向定义 API。

## 2. 通用类型

```ts
type IsoUtc = string;
type Fingerprint = string & {readonly __brand: "sha256-lowercase-64"};
type Span = {start: number; end: number}; // UTF-16 半开区间

type OperationStatus =
    | "queued"
    | "running"
    | "succeeded"
    | "failed"
    | "cancelled"
    | "interrupted";

type ChannelStatus = "not-configured" | OperationStatus;
```

所有 id 是 opaque string。客户端不能解析 id 前缀推断实体类型。所有时间是 ISO 8601 UTC。所有 `Fingerprint` 在 wire parser 中必须匹配 `^sha256:[0-9a-f]{64}$`；TypeScript brand 不能替代运行时校验。

## 3. DetectorIdentity

外部 AI 检测结果只有以下四元组全部相同时才能直接比较：

```ts
type DetectorIdentityDto = {
    detectorName: string;
    detectorVersion: string;
    chunkChars: number;
    aggregationVersion: string;
};
```

`aggregationVersion` 标识 chunk 分数聚合为文档分数的算法版本。目标持久层、导出制品和 API 都必须保存它。当前 `MachineDetect` 缺少该字段，属于 schema 迁移差距；在迁移完成前，历史记录只能映射到显式 legacy version，不能默认为当前算法。

## 4. WorkspaceSnapshotDto

```ts
type WorkspaceSnapshotDto = {
    schema: "llmlint.workspace/2";
    snapshotVersion: number;
    text: WorkspaceTextDto;
    revisions: WorkspaceRevisionDto[];
    myJudgments: HumanJudgmentDto[];
    myAnnotations: AnnotationDto[];
    myBlindReviewSkips: BlindReviewSkipDto[];
    activeDraft: DraftSessionDto | null;
    operations: WorkspaceOperationDto[];
    d5Evaluations: D5Evaluation[];
    capabilities: WorkspaceCapabilitiesDto;
};
```

`llmlint.workspace/2` 增加 `activeDraft`、每版 blind-review capability 和 D5 v2 语义；`/1` 只作为旧实现迁移输入，不能由新 serializer 输出。`snapshotVersion` 是当前用户可见 Workspace 投影在同一 Text 内的单调版本，不是内部数据库变更计数；hidden machine/operation/D5 事实变化不得推进它。reveal 时才原子推进公开版本并投影已经完成的结果。`activeDraft` 只返回当前唯一 head 的当前用户草稿；hidden head 和非 owner Workspace 始终为 null。客户端只能用更高或相同版本的 payload 更新 server facts；低版本响应不得覆盖高版本状态。`operations` 只返回已 reveal revision 的 operation；hidden revision 上的 machine-scan、external-detector、llm-review、agent-invocation 和 classification operation 全部过滤。`d5Evaluations` 只返回 baseline 与 candidate 都已 reveal 的 canonical D5。

### 4.1 WorkspaceTextDto

```ts
type WorkspaceTextDto = {
    id: string;
    originKind: "uploaded" | "curated" | "generated";
    declaredProvenance: "human" | "ai" | "mixed" | "unknown" | null;
    sourceNote: string | null;
    visibility: "private" | "public";
    classification: {
        genre: ClassifiedValueDto | null;
        textType: ClassifiedValueDto | null;
        pov: ClassifiedValueDto | null;
    };
    createdAt: IsoUtc;
};

type ClassifiedValueDto = {
    value: string;
    source: "curator" | "user" | "llm";
};
```

`originKind` 和 classification source 由服务器设置。generated provenance 通过管理员研究接口查询，不把 provider secret 或内部路径放入 Workspace DTO。

### 4.2 WorkspaceRevisionDto

```ts
type WorkspaceRevisionDto = {
    id: string;
    textId: string;
    ordinal: number;
    parentRevisionId: string | null;
    body: string;
    charCount: number;
    transitionKind: "upload" | "static_fix" | "llm_fix" | "user_fix";
    provenance: RevisionProvenanceDto | null;
    createdAt: IsoUtc;
    machine: HiddenMachineDto | RevealedMachineDto;
    capabilities: RevisionCapabilitiesDto;
};
```

revision 按 ordinal 升序返回。ordinal 只用于同一 Text 内排序，不能替代 id。`body` 是不可变正文。

目标 wire contract 使用 provenance version 2。现有 `web/shared/revision-provenance.ts` version 1 只作为历史只读输入；新 Revision 不得再写 v1。

```ts
type LegacyRevisionProvenanceDto = {
    version: 1;
    attribution: "legacy-unattributed";
    edits: Array<{kind: "static" | "user" | "llm"; ruleId?: string; count?: number}>;
    summary?: string;
    model?: string;
    promptVersion?: string;
};

type RevisionProvenanceSourceDto =
    | {kind: "user"}
    | {kind: "static-rule"; suggestionId: string; ruleId: string; hitId: string; engine: EngineIdentityDto}
    | {kind: "agent"; invocationId: string; sessionId: string; modelKey: string; promptVersion: string; draftGeneration: number; draftBodyFingerprint: Fingerprint}
    | {kind: "critic"; candidateId: string; candidateVersion: number; candidateFingerprint: Fingerprint};

type RevisionProvenanceEditDto = {
    editId: string;
    draftEditId: string;
    parentSpan: Span;
    revisionSpan: Span;
    beforeFingerprint: Fingerprint;
    afterFingerprint: Fingerprint;
    source: RevisionProvenanceSourceDto;
};

type RevisionProvenanceV2Dto = {
    version: 2;
    draftSessionId: string;
    draftGeneration: number;
    parentRevisionId: string;
    edits: RevisionProvenanceEditDto[];
    summary: {
        user: number;
        static: Array<{ruleId: string; count: number}>;
        agents: Array<{invocationId: string; count: number}>;
        critics: Array<{candidateId: string; candidateVersion: number; count: number}>;
    };
};

type RevisionProvenanceDto = LegacyRevisionProvenanceDto | RevisionProvenanceV2Dto;
```

`editId` 在 Revision 内稳定，`draftEditId` 锚定 authoritative edit ledger。parent/revision span 均使用 UTF-16 半开区间；无法稳定映射时拒绝 commit。服务器必须从已验证关联记录复制 engine/suggestion、model/prompt/draft generation/body fingerprint 或 candidate version/fingerprint 快照，不能只保存可被删除后失效的外键。summary 由 edits 纯函数派生；计数不一致时 serializer 拒绝输出。

粗粒度 `transitionKind` 只用于兼容现有 Revision 列表：无 edit 仅用于 rev0 upload；全 user 为 `user_fix`；全 static-rule 为 `static_fix`；只要含 agent 或 critic 为 `llm_fix`；其他混合来源按 `user_fix`。真正来源以 v2 edits 为准，consumer 不得从 transitionKind 反推。v1 adapter 只能复制历史实际拥有的 static/user/llm 聚合并加固定 `attribution=legacy-unattributed`；缺失 invocation/hit/candidate identity 不能补造。

### 4.3 Machine projection

```ts
type HiddenMachineDto = {
    reveal: "hidden";
    revealedAt: null;
};

type RevealedMachineDto = {
    reveal: "revealed";
    revealedAt: IsoUtc;
    scans: MachineScanDto[];
    detects: MachineDetectDto[];
    llmReviews: MachineLlmReviewDto[];
};
```

`HiddenMachineDto` 不能包含 hits、score、detector identity、chunks、operation result 摘要或任何可反推出机器结论的字段。顶层 `operations` 也必须过滤该 hidden revision 的全部 operation。D2 由服务器构造 DTO 时强制，不依赖前端隐藏。

```ts
type EngineIdentityDto = {
    packageVersion: string;
    ruleSetFingerprint: Fingerprint;
    capabilities: Array<"regex" | "density" | "handler" | "semantic">;
    scanScope: string;
    scoringVersion: string;
};

type MachineScanDto = {
    id: string;
    revisionId: string;
    engine: EngineIdentityDto;
    docScore: number;
    scannedAt: IsoUtc;
    hits: RuleHitDto[];
};


type MachineDetectDto = {
    id: string;
    revisionId: string;
    identity: DetectorIdentityDto;
    docPAi: number;
    maxPAi: number | null;
    checkedAt: IsoUtc;
    chunks: Array<{span: Span; pAi: number}>;
};

type MachineLlmReviewDto = {
    id: string;
    revisionId: string;
    invocationId: string;
    sessionId: string;
    modelKey: string;
    promptVersion: string;
    score: number;
    confidence: number;
    judgedAt: IsoUtc;
    hits: RuleHitDto[];
    report: LlmReviewReportDto;
};
```
MachineScan 的 docScore 只有完整 EngineIdentityDto 全等时才能比较或画同一趋势。scoringVersion 任一端缺失时标记不可比较；不能用 packageVersion 猜测。当前持久记录没有显式 scoringVersion，属于迁移差距。

`LlmReviewReportDto` 与现有 `web/shared/agent-harness.ts` 的 `LlmAnalysisReport` 保持同形，并冻结为 wire contract：

```ts
type LlmReviewReportDto = {
    score: number;
    confidence: number;
    conclusion: string;
    evidence: Array<{quote: string; reason: string; ruleIds: string[]}>;
    suggestions: string[];
};
```

`report.score/confidence` 必须与 MachineLlmReview 顶层同名字段一致；serializer 发现不一致时拒绝输出，不能选择其中一份。evidence 只能引用该 review 的 rule hits。

`RuleHitDto` 使用稳定 hit id；只有服务器持久化的确定性 replacement 才暴露 suggestion identity：

```ts
type RuleSuggestionDto = {
    suggestionId: string;
    replacement: string;
    replacementFingerprint: Fingerprint;
};

type RuleHitDto = {
    hitId: string;
    revisionId: string;
    ruleId: string;
    source: "machine-scan" | "machine-llm-review";
    span: Span | null;
    quote: string;
    severity: string;
    explanation: string;
    suggestion: RuleSuggestionDto | null;
};
```

静态 `hitId` 由 revision、engine identity、rule id、span 和 match fingerprint 确定；`suggestionId` 再绑定 hit id、replacement fingerprint 和 engine identity。动态命中没有经过确定性 server snapshot 时 suggestion 为 null。列表重新排序不能改变 identity；客户端不能提交 replacement。

## 5. 人类判定与批注

```ts
type HumanJudgmentDto = {
    id: string;
    revisionId: string;
    aiFlavor: number | null;
    wantReadOn: number | null;
    improvementScore: number | null;
    comment: string | null;
    blind: boolean;
    createdAt: IsoUtc;
    updatedAt: IsoUtc;
};

type AnnotationDto = {
    id: string;
    revisionId: string;
    span: Span;
    note: string;
    createdAt: IsoUtc;
};
```
owner Workspace 只返回当前用户的 judgment 和 annotation。Arena/公共众评使用独立 assignment API，不扩展 owner Workspace 泄露其他评委身份。

```ts
type ArenaExposureDto = {
    assignmentId: string;
    revisionId: string;
    state: "hidden" | "revealed";
    revealedAt: IsoUtc | null;
};

type BlindReviewSkipDto = {
    id: string;
    revisionId: string;
    createdAt: IsoUtc;
};

type SkipBlindJudgmentRequest = {
    revisionId: string;
};
```

Arena/study exposure DTO 只记录未来合同所需的分离语义，不授权实现端点。独立 assignment API spec Accepted 前，server 不得注册 participant 路由；owner Workspace 也不得接收 assignment identity。未来 assignment 合同必须在写 exposure、judgment、annotation 或 reveal 前原子核对当前用户 membership、assignment 状态、revision 归属和 per-user exposure，并对不存在与无权统一 404。

`POST /api/judgments/skip` 使用 `SkipBlindJudgmentRequest`，只写显式 skip 事实，不创建全 null `HumanJudgment`。skip 与 judgment 一样先执行 owner/capability 过滤，不存在或无权统一返回 404。

## 6. Operation DTO

```ts
type OperationSourceDto =
    | {kind: "machine-scan"; scanId: string}
    | {kind: "external-detector"; detectorRunId: string}
    | {kind: "llm-review"; invocationId: string; sessionId: string}
    | {kind: "agent-invocation"; invocationId: string; sessionId: string}
    | {kind: "classification"; classificationRunId: string};

type WorkspaceOperationDto = {
    id: string;
    source: OperationSourceDto;
    textId: string;
    revisionId: string;
    draftSessionId: string | null;
    version: number;
    attempt: number;
    retryOfOperationId: string | null;
    supersededByOperationId: string | null;
    status: OperationStatus;
    startedAt: IsoUtc | null;
    finishedAt: IsoUtc | null;
    errorCode: string | null;
};
```

Operation id 是领域 identity，`version` 在单个 operation 内从 1 单调递增。`sessionId` 只归组对话；Agent 运行归属使用 invocation id、revision id 和可选 DraftSession identity。client 只接受 version 更高的同 identity payload；terminal status（succeeded/failed/cancelled/interrupted）不能被较低或相同 version 的 queued/running 覆盖。

## 7. Capability DTO

```ts
type WorkspaceCapabilitiesDto = {
    canView: boolean;
    canCreateRevision: boolean;
    canManageVisibility: boolean;
    canExport: boolean;
};

type RevisionCapabilitiesDto = {
    canSubmitBlindJudgment: boolean;
    canSkipBlindJudgment: boolean;
    canReveal: boolean;
    canAnnotate: boolean;
    canCreateDraft: boolean;
    canRunDetector: boolean;
    canRunAgent: boolean;
};
```

capability 控制 UI 入口，服务器仍逐命令验证 owner、reveal、judgment/skip、stale 和 assignment。hidden revision 在当前用户尚无 blind judgment 或显式 skip 时 `canReveal=false`；揭示后 blind judgment/skip 命令不可再次改变该 revision 的阶段事实。public visibility 不自动授予 owner capability。

## 8. 主要端点

### 8.1 创建 Text

```text
POST /api/texts
→ 201 {
    textId,
    revisionId,
    snapshotVersion,
    location: "/workbench/<textId>?revision=<revisionId>"
}
```

请求字段由 [`detection-workbench-journey.md`](detection-workbench-journey.md) 定义。响应不包含 machine projection。

### 8.2 读取 Workspace

```text
GET /api/texts/:textId/workspace
→ 200 WorkspaceSnapshotDto
```

不存在和无权统一 404。此端点不启动 reveal、detector、LLM 或 Agent。

### 8.3 Reveal 与 machine refresh

```text
POST /api/revisions/:revisionId/reveal
→ 200 {snapshotVersion, textId, revisionId, machine: RevealedMachineDto, operations, d5Evaluation: D5Evaluation | null}
→ 409 当前用户尚未提交该 revision 的 blind judgment 或显式 skip

GET /api/revisions/:revisionId/machine
→ 200 {snapshotVersion, textId, revisionId, machine: RevealedMachineDto, operations, d5Evaluation: D5Evaluation | null}
→ 403 revision 尚未 reveal
```

鉴权顺序固定：先解析当前用户并执行 owner/capability 过滤，revision 不存在或当前用户无权均返回 404。首次 `POST reveal` 在同一一致性快照中确认该用户已有该 revision 的 blind judgment 或 `BlindReviewSkip`；缺失返回 409，不写 `revealedAt`。已 reveal 时幂等返回当前 revealed projection，不修改 `revealedAt`、不重跑 detector/Agent、不创建新 operation。只有通过 owner/capability 校验后，`GET machine` 才因未 reveal 返回 403。Arena/public participant 不复用 owner 端点。
### 8.4 DraftSession 打开与自动保存

```ts
type DraftEditSourceDto =
    | {kind: "user"}
    | {kind: "static-rule"; suggestionId: string; ruleId: string; hitId: string; engine: EngineIdentityDto}
    | {kind: "agent"; invocationId: string; sessionId: string; modelKey: string; promptVersion: string; draftGeneration: number; draftBodyFingerprint: Fingerprint}
    | {kind: "critic"; candidateId: string; candidateVersion: number; candidateFingerprint: Fingerprint};

type DraftEditDto = {
    editId: string;
    baseSpan: Span;
    draftSpan: Span;
    replacement: string;
    beforeFingerprint: Fingerprint;
    afterFingerprint: Fingerprint;
    source: DraftEditSourceDto;
};

type DraftSessionDto = {
    id: string;
    textId: string;
    baseRevisionId: string;
    generation: number;
    body: string;
    bodyFingerprint: Fingerprint;
    edits: DraftEditDto[];
    canUndo: boolean;
    canRedo: boolean;
    dirty: boolean;
    createdAt: IsoUtc;
    updatedAt: IsoUtc;
};
type OpenDraftRequest = {
    textId: string;
    baseRevisionId: string;
};

type ApplyUserDraftEditRequest = {
    expectedGeneration: number;
    from: number;
    to: number;
    insertedText: string;
    inputKind: "typing" | "paste" | "cut" | "format";
};

type ApplyStaticSuggestionsRequest = {
    expectedGeneration: number;
    suggestionIds: string[];
};

type DraftHistoryRequest = {expectedGeneration: number};
```


```text
POST /api/drafts
request: OpenDraftRequest
→ 200/201 {snapshotVersion, draft: DraftSessionDto}

PATCH /api/drafts/:draftSessionId/user-edits
request: ApplyUserDraftEditRequest
→ 200 {snapshotVersion, draft: DraftSessionDto}

POST /api/drafts/:draftSessionId/static-suggestions
request: ApplyStaticSuggestionsRequest
→ 200 {snapshotVersion, draft: DraftSessionDto}

POST /api/drafts/:draftSessionId/undo | /redo
request: DraftHistoryRequest
→ 200 {snapshotVersion, draft: DraftSessionDto}

DELETE /api/drafts/:draftSessionId
→ 200 {snapshotVersion, textId, draftSessionId, activeDraft: null}

以上写命令发生 generation、head、fingerprint 或来源 stale 时返回 409/412 且不写入。
```

`POST /api/drafts` 对 `userId × textId × currentHeadRevisionId` 幂等：已有 active draft 时返回同一实体，没有时创建 generation 0。head 必须已 reveal；hidden head 返回 409。每个 owner、Text 和 head 最多一份 active draft。

用户编辑端点只接受 splice 和 expected generation。客户端不能提交 edit id、source、fingerprint、完整 body 或 provenance；服务器从当前 generation 派生新 body、稳定 edit id、坐标和 fingerprint，并原子递增 generation。同一 DraftSession 的请求按 generation 串行确认。

static suggestion 命令只接受非空、去重的 suggestion id 列表和 expected generation。服务器在同一事务中核对每项属于 base revision 的 active machine-scan hit、engine identity 和 replacement snapshot，并投影到当前 draft；任一 stale、冲突或不可投影时整批拒绝。undo/redo 也是单调递增 generation 的服务器变更：`canUndo/canRedo` 随完整 DraftSession 返回；客户端不能改写 ledger。Agent proposal 使用下一节的来源专用 command。critic apply 等待独立 candidate/权限合同。`DELETE` 只允许 owner 显式放弃；其版本化响应是清除 activeDraft 的唯一 reducer 事实。

### 8.5 提交 DraftSession 创建 Revision


提交使用上一节返回的 authoritative DraftSession：

```ts
type CommitDraftRequest = {
    textId: string;
    baseRevisionId: string;
    draftSessionId: string;
    draftGeneration: number;
    bodyFingerprint: Fingerprint;
};
```

```text
POST /api/revisions
request: CommitDraftRequest
→ 201 {snapshotVersion, revision: WorkspaceRevisionDto}
→ 409/412 stale 或 identity 不匹配
```

请求采用 exact-object 校验。客户端不得提交正文、`transitionKind`、provenance、edit source、owner、创建时间或 reveal 状态。服务器在同一事务中加载指定 DraftSession generation，核对 text/base/head/body fingerprint，依据该 generation 的 authoritative edit ledger 派生正文、`transitionKind` 和 `RevisionProvenanceDto`，再原子创建 `revealedAt=null` 的 Revision。DraftEdit 中的 `static-rule` 必须引用存在且属于 base/draft 的 hit；`agent` 必须引用绑定该 DraftSession 和 base revision 的 invocation；`critic` 必须引用允许写入该 DraftSession 的 candidate。引用缺失、跨 Text/revision/draft 或 operation 未完成时拒绝提交，不能降级成 unknown/user。

第一版 `baseRevisionId` 必须等于服务器当前唯一 head；任意历史 base 返回 409。创建成功后 DraftSession 关闭，且相同 head 不能再提交。commit 不调用 reveal，也不返回 machine、D5 或新 revision 的 operation；客户端选择新 revision 后进入 `blind-review`。后台 machine operation 可以继续，但在 reveal 前不改变公开 `snapshotVersion`，也不通过响应或 SSE 暴露。分支能力需要 branch identity、branch head 和 branch-scoped AgentSession 的独立 Accepted spec。

### 8.6 Judgment 与 annotation

```ts
type SubmitJudgmentRequest = {
    revisionId: string;
    aiFlavor?: number;
    wantReadOn?: number;
    improvementScore?: number;
    comment?: string;
};
```

`aiFlavor/wantReadOn/improvementScore` 必须是 `0..5` 整数，comment 长度为 `1..4000`，四项至少提供一项。rev0 禁止 `improvementScore`。请求采用 exact-object 校验：`blind`、`userId`、judgment id、时间戳、`revealedAt` 和任何未知字段一律返回 400，不能静默忽略。服务器从 session 写 userId，并在写入事务中按当时 `Revision.revealedAt` 计算 blind；`blind-review` 提交要求 revision 仍 hidden，已 reveal revision 返回 409。客户端不能覆盖 blind。

```text
POST /api/judgments
request: SubmitJudgmentRequest
→ 200 {snapshotVersion, textId, revisionId, judgment: HumanJudgmentDto, d5Evaluation: D5Evaluation | null}

POST /api/judgments/skip
request: SkipBlindJudgmentRequest
→ 200 {snapshotVersion, textId, revisionId, skip: BlindReviewSkipDto, d5Evaluation: D5Evaluation | null}

POST /api/annotations
→ 201 {snapshotVersion, annotation: AnnotationDto}
```

judgment 和 annotation 都先执行 owner/capability 过滤；不存在或无权统一 404。blind judgment 与 skip 只接受 hidden revision，写入后让 `canReveal=true`；二者互斥且不能在 reveal 后补写。annotation span 再按 revision body 校验，blind-review 与 inspect-edit 均可添加 revision annotation。

### 8.7 Operation 与 Agent

```ts
type AgentDraftTargetDto = {
    draftSessionId: string;
    generation: number;
    bodyFingerprint: Fingerprint;
};

type AgentSelectionTargetDto =
    | {kind: "revision"; revisionId: string; bodyFingerprint: Fingerprint}
    | {kind: "draft"; draftSessionId: string; generation: number; bodyFingerprint: Fingerprint};

type InvokeAgentRequest = {
    revisionId: string;
    draft: AgentDraftTargetDto | null;
    intent: "analyze" | "optimize" | "rewrite-selection" | "question";
    selection: {target: AgentSelectionTargetDto; start: number; end: number; quote: string} | null;
};

type ApplyAgentProposalRequest = {
    expectedGeneration: number;
    invocationId: string;
    proposalId: string;
};
```

可产生 edit proposal 的 invocation 必须绑定 authoritative DraftSession generation/body fingerprint；selection target 和 quote 必须在该冻结正文上复核。proposal 持久化同一 target identity。应用时服务器核对 invocation、proposal、Text、revision、draft、generation、fingerprint 和 terminal operation，任一失配返回 409/412 且不写入；成功返回 `{snapshotVersion, draft: DraftSessionDto}`。retry 创建绑定当前明确 target 的新 invocation，不能沿用旧 proposal。

```text
POST /api/drafts/:draftSessionId/agent-proposals
request: ApplyAgentProposalRequest
→ 200 {snapshotVersion, draft: DraftSessionDto}
→ 409/412 target、generation、fingerprint 或 proposal stale
```

Operation 命令合同：

```text
POST /api/operations/:operationId/retry
→ 202 {snapshotVersion, operation: newOperation, superseded: oldOperation}

POST /api/operations/:operationId/cancel
→ 200 {snapshotVersion, operation: WorkspaceOperationDto}

GET /api/operations/:operationId
→ 200 {snapshotVersion, operation: WorkspaceOperationDto}
```

retry 原子创建新 operation id/version=1，并更新旧 operation 的 `supersededByOperationId` 和 version；cancel 只更新目标 operation。Operation SSE 使用 `{type:"operation-updated", snapshotVersion, operation}`，每次状态变化递增 operation.version。client 同时核对 operation/text/revision/draft/Agent invocation identity 和 version。hidden revision 不发送这些事件。
### 8.8 D5 投影刷新

第一版不设第二个 D5 GET 端点。`GET workspace` 是完整真相源；reveal/machine/judgment 响应只附带该 revision 作为 candidate 时的当前 `d5Evaluation`，rev0、hidden candidate 或尚无后续 candidate 时为 null。已揭示 baseline/candidate 的 judgment、primary detector record、active detector policy、skip 或 reveal 投影变化会推进公开 `snapshotVersion`，并使所有受影响 candidate 的旧 D5 projection 失效。hidden machine/D5 更新只推进内部事实版本，不改变公开 `snapshotVersion`。

只有 baseline 与 candidate 均已 reveal，且当前连接通过 owner/capability 校验时，异步通道才能发送 `{type: "d5-invalidated", textId, candidateRevisionId, snapshotVersion}`。hidden candidate 不发送 D5/operation invalidation，也不能通过 heartbeat payload、事件频率或版本跳变暴露任务状态；reveal 后以完整 Workspace 或 machine response 对齐。client 按 text/candidate/algorithmVersion/inputFingerprint 合并，旧公开版本或旧 fingerprint 不得覆盖新结果。

## 9. Client query mapping

`WorkspaceQuery` 由 Snapshot + 当前 head + DraftSession + DisplaySettings 派生：

- `text` ← `WorkspaceTextDto`。
- `currentRevision` ← 唯一线性 head；第一轮不投影历史选择器。
- `stage` ← head machine reveal：hidden 为 `blind-review`，revealed 为 `inspect-edit`。
- `draft` ← `WorkspaceSnapshotDto.activeDraft`；hidden head 时必须为 null。
- `operations` ← 当前 head 的 `WorkspaceOperationDto[]`，不从 machine record 状态猜测。
- `d5Evaluations` ← snapshot 中的 canonical D5；`currentD5Evaluation` 按 head revision id 选择，不在 client 重算 owner/text/identity 断言。
- `blindReviewSkips` ← `WorkspaceSnapshotDto.myBlindReviewSkips`；skip 只改变流程状态，不伪造 judgment。
- `capabilities` ← workspace + head revision capabilities。

adapter 映射必须是纯函数并有 fixture 测试。

## 10. 合同验收

1. 同一 fixture 经 server serializer 和 client parser 往返后 identity 不变。
2. hidden revision 在 Workspace、命令响应、DOM、可访问性树和全部 SSE 中均不含 machine、D5 或 operation 状态；其后台事实变化不推进公开 `snapshotVersion`。
3. 所有已揭示 machine hit、detector、review 和 operation 都携带 revision identity。
4. 旧 snapshotVersion 无法覆盖新状态。
5. DetectorIdentity 四元组缺一项即解析失败。
6. 非法 UTF-16 span 被服务器拒绝或隔离，不破坏整份 Workspace。
7. public/non-owner 请求不能取得 owner Workspace DTO。
8. command response 的实体 id 和请求 identity 不一致时，client reducer 拒绝应用。
9. non-owner 对 hidden/revealed revision 的 machine/reveal 请求都返回 404；只有 owner 的 hidden machine 请求返回 403。
10. fingerprint 不匹配 `^sha256:[0-9a-f]{64}$` 时 parser 拒绝 payload。
11. hidden head 的 `activeDraft` 为 null，且 `POST /api/drafts` 返回 409。
12. 同一 owner/Text/head 重复 open draft 返回同一 id；两个并发 open 不能创建第二个 active draft。
13. 同 generation 的并发 draft 写入至多一个成功；user edit request 含 source/editId/body/fingerprint/provenance 时返回 400。
14. static suggestion 整批应用、undo、redo 和 Agent proposal 都验证 expected generation并返回完整下一代 DraftSession；任一来源 stale 不产生部分 edit。
15. discard 返回更高 snapshotVersion 和 `activeDraft:null`；旧 Workspace/edit 响应不能复活草稿。
16. judgment request 含 `blind/userId/id/timestamp/revealedAt` 或其他未知字段时返回 400 且不写库；合法 blind 和 userId 只来自服务器。
17. reveal 前没有同用户、同 revision 的 blind judgment 或 skip 时返回 409；重复 reveal 幂等且不创建 operation。
18. blind judgment 与 skip 互斥；已 reveal revision 不能补写二者。
19. 新 Revision 只写 provenance v2 且 `revealedAt=null`；commit 关闭 active draft且响应不含 machine、D5 或 operation。
20. v1 历史缺失 invocation/hit/candidate identity 时只读投影为 legacy-unattributed，不补造关联。
21. `WorkspaceOperationDto.status` 不接受 `not-configured`；Operation version 单调，terminal 不被延迟 queued/running 回退。
22. retry 创建新 operation identity 并版本化更新旧 operation；cancel/refresh 响应可按 operation version 合并。
23. EngineIdentity 缺 scoringVersion 或版本不同的 MachineScan 不计算 docScore 差值。
24. hidden baseline/candidate 不返回 D5、不发送 invalidation，且不推进公开 snapshotVersion。
25. D5 v2 两端 judgment 必须 blind；旧 post judgment 不能映射为 v2。
26. WorkspaceQuery 只从 canonical D5 array 选择 currentD5Evaluation，不在客户端重算。