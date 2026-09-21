# 工作区状态与命令规格

> 状态：Accepted（2026-08-16）。
> 目标：消除页面、编辑器、异步轮询和 Agent 之间的状态双源，让后续组件可以按稳定 API 重构。

## 1. 设计原则

工作区状态分为五类，每项事实只有一个 owner：

```text
Server Facts       已提交且可恢复的事实
Workspace Selection 当前用户在看什么
Draft Session      尚未提交的修改
Operations         在途 detector/LLM/Agent 工作
Display Preferences 纯 UI 偏好
```

组件不保存业务事实副本。派生值通过 selector 计算；命令由统一 command handler 执行。

## 2. 状态所有权矩阵

| 状态 | Owner | 是否持久化 | 示例 |
| --- | --- | --- | --- |
| Text/Revision/Judgment/Machine records | Web server | 是 | WorkspaceSnapshot |
| current head/activePanelId/focused hit/heatmap | route + WorkspaceStore | URL/会话 | 当前视图 |
| Draft body/edit provenance/generation | Web server DraftSession store | 是 | activeDraft |
| detector/LLM/Agent operation | Web server | 是 | queued/running/terminal |
| panel width/overlay/filter | DisplaySettingsStore | 浏览器偏好 | 热力层开关 |
| toast/dialog/open menu/selection | 组件局部 | 否 | 短时表现状态 |

## 3. Server Facts

### 3.1 WorkspaceSnapshot

服务器 wire payload 的唯一合同是 [`WorkspaceSnapshotDto`](workspace-api-contract.md#4-workspacesnapshotdto)。本状态层保存解析后的 server facts，不再定义第二份 `TextDto/RevisionDto/OperationDto` 结构。

```ts
type WorkspaceServerFacts = WorkspaceSnapshotDto;
```

server serializer、client parser、hidden/revealed machine union、operation source 和 capability 字段全部以 API 合同为准。

要求：

- revisions 按 ordinal 排序，但身份仍用 id。第一版每个 Text 只有一个线性 head，任何新 revision 都是当前 head 的直接子版。
- 每个 revision 的 machine records 按通道完整返回，未 reveal 时为空且不含隐藏 payload。
- operations 与 D5 projection 可单独随 revision-scoped response 刷新；snapshotVersion 用于拒绝旧响应覆盖新状态。
- Workspace adapter 负责 schema → query model，不把 Prisma 字段直接传入组件，也不在客户端重算 D5 信任断言。

现有 `GET /api/texts/:id/workspace` 可以演进为这个合同，无需为重构另造同义端点。

### 3.2 增量刷新

第一版允许 snapshot + revision-scoped refresh：

- `GET workspace`：首次进入、恢复和 D5 invalidation 后的完整刷新。
- `GET revision machine/operations`：异步通道刷新，并附带该 candidate 当前 D5 projection。
- judgment/reveal command response：附带受影响 candidate 的当前 D5 projection。
- Agent 使用 snapshot + SSE；SSE 的 D5 事件只做 invalidation，不携带部分结果。

所有响应必须包含目标 `textId/revisionId/operationId`；D5 额外核对 candidate revision、algorithmVersion、inputFingerprint 和 snapshotVersion。客户端只按 identity 合并，不按“当前选中项”写入。

## 4. Workspace Selection

```ts
type WorkspaceSelection = {
    textId: string;
    revisionId: string;
    panel: "overview" | "issues" | "agent";
    focusedHitId: string | null;
    selectedHeatmapId: string | null;
};
```

- 第一轮 `revisionId` 恒为唯一 head；新 Revision 创建后原子更新为返回的 revision id。
- `textId/revisionId/panel` 与 URL 同步。
- focused hit 和 heatmap 可以只在会话中保存；heatmap 选择按 revision 保存。
- 无效 revision query 回退到唯一 head，并替换 URL。
- 历史选择和 diff baseline 等待独立旅程 spec。
- 选择状态不修改 Server Facts。
## 5. DraftSession

### 5.1 为什么需要独立实体

当前 `RepairPlan` 与页面 `editDraft` 双源。目标状态中正文和 provenance 同属一个 DraftSession：

```ts
type DraftSession = DraftSessionDto;

type DraftWorkingState = {
    draftSessionId: string;
    authoritativeGeneration: number;
    authoritativeBodyFingerprint: Fingerprint;
    workingVersion: number;
    workingBody: string;
    pendingEdits: UserDraftEditIntent[];
    saveState: "saved" | "saving" | "unsaved" | "failed" | "offline";
};
```

`WorkspaceSnapshotDto.activeDraft` 是服务器已确认草稿的恢复真相源；`DraftWorkingState` 是按 user/text/draft 隔离的客户端工作副本，不是第二份 server fact。每个 owner、Text 和 head 最多一份 active DraftSession；重复 `open-draft` 返回同一实体。

组件输入立即更新 working body 并进入串行队列；只有服务器成功响应才能推进 authoritative generation。失败时保留队列、working body 和选区，提供重试、复制与显式放弃；浏览器恢复存储不得跨用户或退出登录残留。commit、Agent、static suggestion、undo/redo 只在队列为空且 saveState=saved 时可用。自动保存不创建 Revision，页面卸载和 panel 切换不得调用 discard。

### 5.2 修改来源

Draft edit 的 canonical wire 类型是 [`workspace-api-contract.md`](workspace-api-contract.md) 中的 `DraftEditDto` 与 `DraftEditSourceDto`，状态层不复制第二份简化 union。

Agent proposal 合入时，source 复制冻结的 invocation/session/model/prompt、DraftSession generation 和 body fingerprint；static edit 复制 suggestion/hit/rule/engine identity。服务器把已验证来源写入同一 DraftSession ledger，commit 时映射为 `RevisionProvenanceDto` v2。critic source 等待独立 candidate/权限合同，首轮不暴露 apply command。

### 5.3 乐观并发

保存 DraftSession 为 Revision 时，命令必须带：

- `textId`。
- `baseRevisionId`。
- `draftSessionId`。
- `draftGeneration`。
- body fingerprint。

客户端不得提交 `transitionKind`、provenance 或 edit source。服务器核对 edit ledger 中每个 static hit、Agent invocation 和 critic candidate 的 Text/revision/draft 归属；任一引用失配则拒绝整次提交。base 不是当前唯一 head、generation 过期或 body fingerprint 不匹配时，服务器返回 409/412，不创建部分 revision。分支能力必须另立 Accepted spec 后才能放宽。

## 6. Operation Registry

```ts
type OperationSource =
    | {kind: "machine-scan"; scanId: string}
    | {kind: "external-detector"; detectorRunId: string}
    | {kind: "llm-review"; invocationId: string; sessionId: string}
    | {kind: "agent-invocation"; invocationId: string; sessionId: string}
    | {kind: "classification"; classificationRunId: string};

type Operation = {
    id: string;
    source: OperationSource;
    textId: string;
    revisionId: string;
    draftSessionId: string | null;
    version: number;
    status: "queued" | "running" | "succeeded" | "failed" | "cancelled" | "interrupted";
    attempt: number;
    retryOfOperationId: string | null;
    supersededByOperationId: string | null;
    startedAt: string | null;
    finishedAt: string | null;
    errorCode: string | null;
};
```

规则：

- Agent operation 的 `source.invocationId` 必须等于持久化 `AgentInvocation.id`，`sessionId` 只用于对话归组。
- operation version 从 1 单调递增；reducer 只接受同 identity 的更高 version，terminal 状态不能回退到 queued/running。
- retry 创建新 operation，并版本化更新新旧两端的 `retryOfOperationId` / `supersededByOperationId`；不覆盖历史事实。
- cancel 命令只更新目标 operation；refresh 返回当前完整 operation。
- 结果 reducer 检查 operation、text、revision、draft 和 Agent invocation identity，再按 version 投影。
- 组件卸载、tab/panel 切换和 revision 切换不改变 operation；hidden revision 不接收 operation SSE。
- transport epoch 可以存在于 adapter，但不能替代领域 version。客户端超时不自动把服务器 operation 标成失败。

## 7. Command Bus

### 7.1 命令分类

```ts
type WorkspaceCommand =
    | NavigationCommand
    | JudgmentCommand
    | OperationCommand
    | AnnotationCommand
    | DraftCommand
    | AgentCommand;
```

#### Navigation

- `select-panel`
- `close-work-panel-sheet`
- `focus-rule-hit`
- `select-heatmap`

这些命令只修改客户端选择，不请求服务器。关闭窄屏 sheet 不清空选中的 panel id；`select-revision` 和 `select-diff-baseline` 等待历史旅程 spec。

#### Judgment

- `submit-blind-judgment(revisionId, fields)`
- `skip-blind-judgment(revisionId)`
- `reveal-revision(revisionId)`

每个 revision 都使用同一 blind judgment command。合法顺序为 judgment 或 skip 成功后 reveal；不存在 `submit-post-judgment`。流程 orchestrator 可以串行执行两条命令，但服务器事实仍分开审计。

#### Operation

- `retry-operation(operationId)`：成功返回新 operation 和已更新的旧 operation。
- `cancel-operation(operationId)`：返回目标 operation 的更高 version。
- `refresh-operation(operationId)`：返回当前完整 operation，不启动新工作。

#### Annotation

- `create-annotation(revisionId, span, note)`
- 后续的 resolve/edit/delete 另立生命周期合同。

#### Draft

- `open-draft(baseRevisionId)`：幂等返回当前 head 的 active draft。
- `apply-user-draft-edit(draftSessionId, expectedGeneration, splice)`：服务器原子保存下一 generation。
- `apply-static-suggestions(draftSessionId, expectedGeneration, suggestionIds)`：整批验证，原子应用或全拒绝。
- `undo-draft/redo-draft(draftSessionId, expectedGeneration)`：服务器返回完整下一 generation。
- `discard-draft(draftSessionId)`：只响应显式用户动作，返回 snapshotVersion 与 activeDraft=null。
- `commit-draft(draftSessionId, generation, bodyFingerprint)`：仅在无待确认 edit 时创建 hidden Revision。

#### Agent

- `invoke-agent(revisionId, draftTarget?, intent, selection?)`
- `abort-agent(invocationId)`
- `retry-agent(invocationId, target)`
- `apply-agent-proposal(draftSessionId, expectedGeneration, invocationId, proposalId)`

draftTarget 必须包含 authoritative generation 与 body fingerprint；proposal target stale 时拒绝应用，不自动 rebase。

### 7.2 命令结果

```ts
type CommandResult<T> =
    | {ok: true; data: T; snapshotVersion?: number}
    | {ok: false; code: string; retryable: boolean; fieldErrors?: Record<string, string>};
```

UI 根据结构化 code 显示文案，不解析异常字符串。认证、owner、reveal、stale 和 capability 仍由服务器强制。

## 8. 组件边界

建议组件树：

```text
AssessmentWorkspacePage
  WorkspaceProvider
    WorkspaceHeader
    BlindReviewStage
      DocumentEditorSurface(revision)
      BlindJudgmentDrawer
    InspectEditStage
      DocumentEditorSurface(revision | draft)
      WorkPanelHost
        OverviewPanel
        RuleHitsPanel
        AgentPanel
```

- Page 只解析 route 和加载 provider。
- Provider 暴露 query selectors 和 `dispatch(command)`。
- 阶段由 head revision reveal 状态派生，不由组件局部步骤控制。
- `DocumentEditorSurface` 只接收受控 model 并发出 intent；它不拥有 DraftSession 或 API。
- BlindJudgmentDrawer 持有本地评分草稿；提交、skip 和 reveal 经过 command bus。
- 第一轮不渲染 RevisionsPanel。
- 不保留 `TextPanel.defineExpose` 作为跨层 API；迁移 adapter 可以临时包裹旧组件，新组件不依赖它。

## 9. Selector

至少定义并测试：

- `currentHeadRevision(query)`。
- `workspaceStage(query)`。
- `machineChannelsForHead(query)`。
- `ruleHitsForHead(query)`。
- `heatmapsForHead(query)`。
- `draftForHead(query)`。
- `operationsForHead(query)`。
- `canSubmitBlindJudgment/canReveal/canRunAgent/canCommitDraft(query)`。

Selector 是纯函数。页面模板中不得复制相同业务条件。

## 10. 迁移纪律

1. 用现有 API 建 Workspace adapter、阶段 selector 和 command orchestrator。
2. 将盲评卡移出 ReportPanel，建立整页 BlindReviewStage。
3. 把页面异步逻辑迁进 operation registry。
4. 把 RepairPlan 提升为 DraftSession owner，保留现有编辑器作为 adapter。
5. 让 DocumentEditorSurface 和三个首轮 Panel 只依赖 query/command。
6. 最后拆路由并替换旧页面宿主。

迁移期间必须保持每版 D2、Revision 不可变、Agent invocation revision identity 和历史恢复不启动工作。

## 11. 验收

- 同一业务事实只有一个 owner。
- 每个 hidden head 派生为 blind-review；judgment 或 skip 成功前不能 reveal。
- 页面或组件卸载不会丢失 server facts、DraftSession 或在途 operation。
- 正文与 edit provenance 在同一个 Draft generation 提交。
- 新 Revision 返回后成为当前 head，并进入 blind-review。
- 旧响应无法覆盖较新 snapshot、generation 或错误 revision。
- Agent/detector 命令明确绑定 identity。
- DocumentEditorSurface 和 Panel 无直接 API 或兄弟组件 ref。
- 核心业务条件只存在于 selector。