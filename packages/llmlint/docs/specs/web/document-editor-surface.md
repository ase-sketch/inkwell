# 正文编辑器表面规格

> 状态：Accepted（2026-08-16，第二轮前端组件设计）。
> 稳定组件名：`DocumentEditorSurface`。中文展示名暂不固定。
> 本文读者：第一次接触评判工作区、需要实现或消费正文表面的开发者。
> 本文目的：定义组件能看到什么、用户能做什么、组件向外报告什么，以及哪些事情明确不属于组件。

## 0. 先看这里：组件在产品旅程中的位置

把一次完整使用想成下面这条链：

```text
服务器返回一个不可变 Revision
  → 外层工作区把它交给 DocumentEditorSurface
  → 用户阅读、选择一段正文、复制或提交 span 评价
  → 外层完成 blind judgment/skip 和 reveal
  → 外层把相同正文表面切换为 inspect-edit 的只读 revision
  → 用户请求打开 DraftSession
  → 外层返回受控 working body，组件允许输入并上报 splice
  → DraftSession controller 自动保存每个 splice
  → 用户接受建议、请求 Agent、undo/redo 或 commit
  → 服务器创建新的 immutable Revision
  → 外层选择新 Revision，组件回到 blind-review 只读状态
```

组件只负责中间的“正文表面”：把一段纯文本按当前身份显示出来，叠加合法的规则命中/热力图/批注/草稿改动，管理浏览器中的选择与输入法，并把用户意图以可序列化事件交给外层。它不负责决定当前处于哪一个产品阶段，也不负责把任何事实写进服务器。

共享术语的解释以 [`CONTEXT.md`](../../../CONTEXT.md) 为准；本文只定义 `DocumentEditorSurface` 自己拥有的概念，不复制 Workspace、Revision、DraftSession 或 Operation 的领域定义。

## 1. 组件定位

### 1.1 通用原则

#### 组件假设

- 组件假设外层 adapter 已按 canonical API 合同完成 schema 解析、权限结果投影和文档身份组装；组件仍必须对缺失字段、错误类型、越界坐标和身份不一致 fail closed。
- `body` 是唯一正文字符序列。组件可以建立 DOM 背板和选择镜像，但不得建立第二份 Markdown、HTML 或“可提交正文”。
- 外层是事件消费者和事实 owner。组件 emit 成功只表示 intent 交给父级，不表示命令成功、草稿已保存或权限已通过。
- 浏览器几何值只服务于菜单定位；它们不是正文坐标、持久字段或权限凭据。

#### 受控输入

- `DocumentEditorSurfaceModel` 是完整受控输入。父级改变 body、target、overlay、capability 或 display 时必须传入新 model；组件不得用 watcher 把旧 props 拼成隐藏业务状态。
- 用户输入先在组件的浏览器 working view 中反映，再以一次 `draft-input` intent 交给外层；外层更新 `DraftWorkingState` 后重新传回 body。
- 组件不得把 `v-model` 的当前字符串当成服务器确认正文，也不得在 emit handler 内直接提交或重试。

#### selector 派生

- `visibleOverlays`、`effectiveCapabilities`、`selectionAnchor`、`activeHeatmap`、`canOpenSelectionMenu` 和 `canApplySuggestion` 都必须由纯 selector/computed 从当前 model 与局部 UI 状态派生。
- 模板、事件处理器和面板不得各自复制“当前 revision / 已保存 / target 相同”的条件；业务条件只在 Workspace selector 或 surface selector 中定义一次。
- selector 只能读取输入，不写入 store、不发请求、不改变 DraftSession。需要共享 selector 的自包含实现时，可以使用 Pinia composition API 的 setup store（`defineStore(id, () => {})`）；store 必须仍由外层拥有，组件不能绕过受控 model 直接读取全局 store。

#### 事件不引入第二份逻辑

- 一个用户动作只产生一个语义事件；事件 handler 只收集当前 target、UTF-16 span、quote 和必要的 DOM anchor，不重复实现 command bus、API、重试、reducer 或 sibling panel 联动。
- `caret-click`、`overlay-click` 和 `source-format-command` 都是 intent，不得在组件内部同时修改 server-like state；父级收到事件后只 dispatch 一个对应 command 或更新一个 selector 输入。
- 面板关闭、最小化或 sheet 切换只改变 display/viewport 状态；不得因组件被隐藏而创建、销毁、discard 或重放 DraftSession。


### 1.2 单一职责

`DocumentEditorSurface` 是评判工作区唯一的正文交互表面。它有四项职责：

1. **显示正文**：以源文本为唯一字符序列，保留空格、换行、Unicode 和 JavaScript UTF-16 偏移，不把 Markdown 或 HTML 解析成第二个正文。
2. **显示叠加层**：在身份和坐标都验证通过后显示规则命中、一个明确的 detector 热力图、批注和 draft change。
3. **管理瞬时编辑交互**：管理原生 caret、selection、IME composition、菜单开关、焦点定位、滚动和短时强调。
4. **报告用户意图**：把选择、评价、编辑、Agent、建议、undo/redo、聚焦和显示开关转换成事件；外层再把事件转换成 Workspace command 或本地 UI 行为。

组件不拥有以下职责：

- 不决定 `blind-review` 或 `inspect-edit`；阶段由 [`assessment-workspace.md`](assessment-workspace.md) 的工作区外壳根据服务器 reveal 事实派生。
- 不提交 judgment、skip、reveal、Draft commit 或 study assignment；这些命令由 [`workspace-state-and-commands.md`](workspace-state-and-commands.md) 的 command bus 和 API adapter 拥有。
- 不运行扫描、检测器、LLM 或 Agent，不计算 D5，不修改机器结果。
- 不生成或修改 `Revision`、`DraftSession`、`Operation`、`HumanJudgmentDto` 或 `AnnotationDto` 的 durable truth。
- 不把 revision body 复制成内部可写字符串后自行提交；draft 必须由外层先取得或恢复 DraftSession。

### 1.3 消费者

目标组件有三个直接消费者：

| 消费者 | 传入的文档 | 允许的主要能力 | 组件向外发出的典型事件 |
| --- | --- | --- | --- |
| `BlindReviewStage` | hidden `revision` | 选择、复制、创建 span annotation | `selection-change`、`create-annotation` |
| `InspectEditStage` 的 revision 视图 | revealed `revision` | 查看机器 overlay、选择、定位、开始修改 | `request-open-draft`、`request-agent` |
| `InspectEditStage` 的 draft 视图 | `draft` | 输入、应用 suggestion、Agent、undo/redo、选择和批注 | `draft-input`、`request-apply-suggestion`、`request-agent`、`request-undo`、`request-redo` |

Rules、Overview、Agent 面板不是组件的子状态 owner。面板通过稳定 id 发出命令，再由外层更新 model；组件和面板之间不得互相持有 ref 或直接调用方法。面板边界见 [`work-panels.md`](work-panels.md)。

### 1.4 相邻组件边界

```text
AssessmentWorkspacePage
  └─ WorkspaceProvider / WorkspaceStore
       ├─ BlindReviewStage
       │    ├─ DocumentEditorSurface(revision)
       │    └─ BlindJudgmentDrawer
       └─ InspectEditStage
            ├─ DocumentEditorSurface(revision | draft)
            └─ WorkPanelHost(Overview | Rules | Agent)
```

- `AssessmentWorkspacePage`：解析路由、装载 Workspace、处理加载和离页，不进入正文坐标细节。
- `WorkspaceProvider`：拥有 server snapshot、DraftSession、Operation registry、capability 和 command bus。
- `BlindJudgmentDrawer`：拥有评分草稿、提交、skip 和 reveal 顺序；组件只提供选择和 annotation intent。
- `WorkPanelHost`：拥有筛选、detector 选择、Agent timeline 和命令入口；组件只消费已投影 overlay。
- `DocumentEditorSurface`：拥有浏览器交互，不拥有任何上述 durable 事实。

### 1.5 实现状态
本文是 Accepted **目标合同**，不是“当前代码已经完成”的声明。目标组件尚未作为单独生产组件落地。

下面六个旧表面单元必须分开理解；它们不是六个互相竞争的 `DocumentEditorSurface` 实现：

| 旧单元 | 当前职责 | 与其他单元的关系 | 迁移去向 |
| --- | --- | --- | --- |
| `ReviewEditor.vue` | 旧的组合式编辑器，编排 source/preview、diff、批注、规则菜单和选择菜单 | 包含 `HighlightedTextarea`，并把选择交给 `ReviewSelectionMenu` 等菜单 | 拆成受控正文表面和外层 panel/command；不得作为新合同本身 |
| `HighlightedTextarea.vue` | 纯文本 textarea、背板高亮、caret、selection、IME、UTF-16 偏移 | 被 `ReviewEditor` 使用；是低层输入原语，不拥有 revision/draft | 保留输入法、几何 anchor 和 selection 算法，改 emit 为本文事件 |
| `ReadOnlyHighlightedText.vue` | 只读分段、规则标记和热力底色 | 被旧只读视图和数据集视图复用，不知道 DraftSession | 作为只读 renderer 细节迁入 surface，不拥有 overlay identity |
| `AnnotatableRevisionText.vue` | 旧 revision 只读选区、标注表单和直接保存路径 | 内部使用 `ReadOnlyHighlightedText`；由 `contribute.vue` 宿主 | 只保留 revision selection/annotation adapter；禁止组件内 `$fetch` |
| `TextPanel.vue` | 旧 draft 宿主、`RepairPlan`、diff 队列、批注和 `defineExpose` 命令 | `contribute.vue → TextPanel → ReviewEditor`，并调用 `useRepairDraft` | DraftSession/Workspace controller 取代其事实 owner；旧 expose 只可暂时由 adapter 包装 |
| `useRepairDraft` | 旧 piece-table 组合式状态、splice、provenance/坐标派生和本地快照 | 被 `TextPanel` 持有；不是 server DraftSession | 保留可证明的纯算法；working state、ledger、undo/redo owner 迁到 DraftSession controller |

`contribute.vue` 是旧页面宿主，不计入上面六个表面单元：它同时持有 revision、草稿、检测、Agent、布局和旧 API 调用，是需要被 WorkspaceProvider/command bus 替换的第七个耦合点。迁移期间可以用 adapter 包裹旧单元，但新页面和新面板只能依赖本文的 model/event 合同；不得把旧 `defineExpose`、页面镜像或旧 API 响应重新写成目标合同。


## 2. 本组件拥有的概念与共享概念

### 2.1 本组件拥有的概念

以下概念只在本文定义：

- `RevisionSurfaceDocument`：组件消费的不可变正文投影。
- `DraftSurfaceDocument`：组件消费的 DraftSession working body 投影。
- `DocumentSurfaceDocument`：上面两个表面文档的 union。
- `DocumentSurfaceTarget`：正文、overlay、selection 和 Agent intent 使用的局部身份锚。
- `DocumentSurfaceOverlays`：组件可渲染的叠加层集合。
- `DocumentEditorSurfaceModel`：一次渲染所需的完整受控输入。
- `DocumentSurfaceCapabilities`：本次 model 允许的动作集合。
- `DocumentSurfaceDisplay`：只影响显示、不改变领域事实的开关。
- `DocumentSurfaceSelection`、`AnnotationIntent`、`UserDraftEditIntent`：组件向外报告的用户意图。
- `DocumentEditorSurfaceEvent`、`DocumentSurfaceDiagnostic`：组件的可序列化输出。

这些类型描述组件投影和 intent；数据库表与 HTTP DTO 由共享 owner 定义。组件不把它们反向导出为新的 server truth。

### 2.2 共享概念的 canonical owner

本文只链接共享概念，不重新定义它们：

| 共享概念 | 唯一 owner | 本组件如何消费 |
| --- | --- | --- |
| `Fingerprint`、`Span`、`DetectorIdentityDto`、`DraftSessionDto`、`DraftEditDto`、`DraftEditSourceDto` | [`workspace-api-contract.md`](workspace-api-contract.md) | 校验字符串、坐标和来源；不复制 wire DTO |
| `Revision`、`DraftSession`、`WorkspaceSnapshotDto`、`WorkspaceOperationDto` | [`workspace-api-contract.md`](workspace-api-contract.md) | 由 adapter 投影成本文的 surface document |
| `DraftWorkingState`、`WorkspaceCommand`、`CommandResult`、Operation version | [`workspace-state-and-commands.md`](workspace-state-and-commands.md) | 外层保存事实，组件只发 intent |
| `WorkspaceStage`、`RevisionView`、工作区 capability | [`assessment-workspace.md`](assessment-workspace.md) | 外层决定传 revision 还是 draft |
| judgment、skip、reveal、annotation 的持久语义 | [`workspace-api-contract.md`](workspace-api-contract.md) | 组件只发 annotation intent，不直接写入 |
| `revision`、`revision lineage`、`repair draft`、`invocation`、D2/D5 | [`CONTEXT.md`](../../../CONTEXT.md) | 遵守不变量，不在组件内重新裁决 |

如果共享 owner 改了字段，先更新共享 owner，再更新 adapter 和本文的引用；不得在组件里增加同名简化类型。

### 2.3 表面身份

```ts
type RevisionSurfaceDocument = {
    kind: "revision";
    documentId: string;
    revisionId: string;
    ordinal: number;
    body: string;
    bodyFingerprint: Fingerprint;
};

type DraftSurfaceDocument = {
    kind: "draft";
    documentId: string;
    draftSessionId: string;
    baseRevisionId: string;
    authoritativeGeneration: number;
    authoritativeBodyFingerprint: Fingerprint;
    workingVersion: number;
    body: string;
    bodyFingerprint: Fingerprint;
    pendingEditCount: number;
    saveState: "saved" | "saving" | "unsaved" | "failed" | "offline";
};

type DocumentSurfaceDocument = RevisionSurfaceDocument | DraftSurfaceDocument;

type RevisionSurfaceTarget = {
    kind: "revision";
    documentId: string;
    revisionId: string;
    bodyFingerprint: Fingerprint;
};

type DraftSurfaceTarget = {
    kind: "draft";
    documentId: string;
    draftSessionId: string;
    authoritativeGeneration: number;
    workingVersion: number;
    bodyFingerprint: Fingerprint;
};

type DocumentSurfaceTarget = RevisionSurfaceTarget | DraftSurfaceTarget;
```
`documentId` 是 adapter 为当前正文表面提供的 opaque surface identity：同一 revision 或 DraftSession 在同一恢复链中必须稳定，切换 revision、draft session 或工作版本时必须变化。组件不得从 id 前缀、URL、ordinal 或数组位置推断实体类型，也不得把 `documentId` 写入服务器事实。

`bodyFingerprint` 必须使用 [`workspace-api-contract.md`](workspace-api-contract.md) 的 canonical `Fingerprint` 运行时校验。Fingerprint 不只是缓存键：它决定 selection、overlay、Agent proposal 和 draft change 是否仍然属于当前 body；body 变了而 fingerprint 未变时，整份 document 必须拒绝。

身份规则：

- `revision.body` 是 immutable body，只读；`ordinal` 仅用于展示，不能作为命令目标。
- `draft.body` 是当前 working body，不等同于服务器已经确认的 body。
- `authoritativeGeneration` 和 `authoritativeBodyFingerprint` 只在服务器成功响应后推进。
- `workingVersion` 每次本地 working splice 后推进，不能冒充 server generation。
- 任何 selection、overlay、Agent proposal 或 annotation 都必须带与当前 body 相符的 target；“当前版本”“数组第一项”不是合法身份。

## 3. 外部行为：按一次正常调用顺序理解

### 3.1 装载和首次投影

1. 外层从 `WorkspaceSnapshotDto` 和 `DraftWorkingState` 生成 `DocumentEditorSurfaceModel`。
2. 外层先验证用户权限、阶段、reveal 和 DraftSession，再把 model 传入组件。组件不能用自身 capability 推断权限。
3. 组件校验 document、target、overlay 和 capability。合法输入显示源文本；非法 overlay 被隔离并发出诊断；非法 document 不进入可编辑或机器 overlay 投影。
4. `focusRequest` 非 null 时，组件在当前文本中定位一次。相同 `requestId` 的重复 model 不重复滚动或闪烁。
5. 组件不会因为 mount、刷新、panel 切换或 model 首次到达而调用 API、reveal、检测或 Agent。

### 3.2 `revision` 的首次阅读

1. `BlindReviewStage` 传入 hidden `RevisionSurfaceDocument`，并把 `canEdit`、`canApplySuggestion`、`canUndo`、`canRedo` 设为 false。
2. 组件居中显示纯文本，用户可以选择和复制；空 selection 不作为 annotation 或 Agent selection 发出。
3. 选择稳定后，组件发出带 `revisionId`、UTF-16 span 和 quote 的 `selection-change`。
4. 用户从选区菜单选择添加评价时，组件发出 `create-annotation`；外层负责保存、失败提示和 pending intent 恢复。
5. 用户提交 judgment、skip 或 reveal 时，操作发生在 `BlindReviewStage`，组件保持正文和选区，不显示机器结果或后台 operation 状态。

### 3.3 revealed `revision` 的查看

1. 外层收到 reveal 成功响应并重新投影 Workspace 后，把 revision model 和合法 overlay 传回组件。
2. 组件仍不修改正文；它只把规则命中显示为独立标记、把一个明确 `activeHeatmapId` 显示为热力背景、把批注和已持久化 draft change 显示为独立层。
3. 用户点击规则命中或 detector 时，组件只发稳定 id 事件；Rules/Overview 面板和外层负责联动。
4. 用户选择“开始修改”时，组件发 `request-open-draft`。外层执行幂等 `open-draft`，只有成功拿到 DraftSession 后才传 `draft` model。

### 3.4 `draft` 的输入与建议审阅

1. 外层传入 `DraftSurfaceDocument`，组件显示 working body 和保存状态；服务器已确认的 generation 以及本地待确认 edit 数必须可见。
2. 用户键入、粘贴、剪切或格式化时，组件先更新浏览器中的 working view；输入法 composition 期间不发送中间 splice。
3. `compositionend`、paste、cut 或普通 typing burst 结束时，组件发出一个 `draft-input` intent；格式化只发 `source-format-command`。外层立即更新受控 working body，再由 DraftSession controller 串行保存。
4. Rules 面板或正文菜单请求应用 suggestion 时，组件发 `request-apply-suggestion`，只携带稳定 `suggestionId` 和当前 draft target；replacement 由服务器 snapshot 决定，客户端不得提交替换正文。
5. Agent 菜单发 `request-agent`，携带当前 target 和可选 selection。外层冻结 generation、body fingerprint 和 quote，生成 invocation；组件不直接启动 Agent。

### 3.5 保存、提交和换代

1. 每个 user splice 由外层按 `expectedGeneration` 发送；服务器成功后返回完整 DraftSession，外层推进 authoritative identity，组件接收新 model。
2. 旧响应、错误 draft、错误 fingerprint 或较低 generation 不得覆盖当前 working body；组件对不匹配 model 只保留当前合法投影并发诊断。
3. 用户执行 undo/redo 或接受 Agent proposal 后，外层仍通过服务器 command 更新 generation；组件不维护一个可无限增长的本地业务历史。
4. 用户 commit 时，组件不参与 HTTP 调用。服务器创建新 immutable Revision 后，外层用新 revision model 替换旧 draft model，并清空旧 selection、菜单和 stale overlay。
5. 新 revision 的 stage 必须是 `blind-review`；组件因此重新变为居中、只读、无机器线索的表面。

## 4. 输入合同

### 4.1 顶层 model

```ts
type DocumentSurfaceInputPolicy = {
    readonly: boolean;
    capTextTo: number | null;
};

type DocumentEditorSurfaceModel = {
    document: DocumentSurfaceDocument;
    overlays: DocumentSurfaceOverlays;
    focusRequest: DocumentFocusRequest | null;
    capabilities: DocumentSurfaceCapabilities;
    display: DocumentSurfaceDisplay;
    inputPolicy: DocumentSurfaceInputPolicy;
};
```

这是受控输入：父级每次收到服务器响应或本地 working body 变化，都重新提供完整 model。组件不得只接收 `body` 字符串而从旧 props 拼出身份。

本文合同版本由文件状态和类型 union 共同定义；当前是 `DocumentEditorSurface` contract v1。没有独立的客户端递增 generation 字段。未来破坏性改变必须升级合同版本并拒绝未知 shape，不能静默把 v2 当 v1 解释。

`inputPolicy.readonly` 只锁定用户输入，不锁定滚动、复制、选择和定位；`capTextTo` 是浏览器渲染级的 UTF-16 code unit 上限，达到上限时必须拒绝新增输入，不得静默截断。两者都不能替代服务器鉴权、DTO 校验或 DraftSession generation。


### 4.2 document 字段、默认值和空值

| 字段 | 合法值与校验 | 空值/默认值 | 版本与幂等 |
| --- | --- | --- | --- |
| `kind` | 只能是 `revision` 或 `draft` | 无默认；缺失拒绝 | kind 改变视为一次新投影，清除局部 selection |
| `documentId` | 非空 opaque string；由 adapter 稳定提供 | 无空值 | 作为所有 surface event 的身份键；同表面重复 model 幂等 |
| `revisionId` / `draftSessionId` | 非空 opaque string；客户端不能解析前缀 | 无空值 | 作为领域 identity；同 id、同 fingerprint 的重复 model 幂等 |
| `baseRevisionId` | draft 必须非空，指向打开 draft 时的 head | 无空值 | 只展示和提交前校验，不替代当前 head id |
| `ordinal` | revision 内为 `>=0` 整数 | 无默认 | 仅展示；不进入任何事件目标 |
| `authoritativeGeneration` | draft 为 `>=0` 整数 | 无空值 | 服务器确认后单调；组件不自行增加 |
| `workingVersion` | draft 为 `>=0` 整数 | 初始 working view 使用 0 | 每个本地 splice 单调；identity 不同则拒绝旧 overlay |
| `body` | 字符串；revision 来自服务器且非空；draft 允许临时空串 | 不做 trim、换行归一化或 Unicode 归一化 | body 变化必须有对应 workingVersion 或 authoritative response |
| `bodyFingerprint` | 必须匹配 canonical `Fingerprint` | 无默认 | 必须等于该 body 的指纹；不一致拒绝整份 document |
| `pendingEditCount` | draft 为 `>=0` 整数 | 无默认 | 只显示，不由组件计数 |
| `saveState` | 五个固定值：`saved/saving/unsaved/failed/offline` | draft adapter 必须显式提供；不猜测 `saved` | 不是服务器错误码；由 DraftWorkingState owner 投影 |

revision 和 commit body 的服务端上限由 `web/server/utils/dto.ts` 的 `CreateTextDtoSchema` 与 `CreateRevisionDtoSchema` 执行，当前是 `60_000` 个 JavaScript 字符；组件的 `capTextTo` 不能放宽它。draft 可以在浏览器中暂时为空，但 commit 是否允许为空由 API adapter 按 [`workspace-api-contract.md`](workspace-api-contract.md) 校验。组件不 trim，也不把可见字符数和 UTF-16 长度混用。

### 4.3 capabilities 与 display

```ts
type DocumentSurfaceCapabilities = {
    canEdit: boolean;
    canAnnotate: boolean;
    canInvokeAgent: boolean;
    canApplySuggestion: boolean;
    canUndo: boolean;
    canRedo: boolean;
};

type DocumentSurfaceDisplay = {
    ruleHits: boolean;
    heatmap: boolean;
    annotations: boolean;
    draftChanges: boolean;
};
```

默认与校验：

- `focusRequest` 缺省等价于 `null`；所有 overlay 数组缺省等价于空数组；display 开关缺省由 adapter 物化为 false，组件不从“有数据”反推“允许显示”。
- `inputPolicy` 必须显式提供；revision 的有效值强制为 `readonly=true`，draft 才能使用 `readonly=false`。`capTextTo=null` 表示没有组件级上限，不表示服务器无限制。
- 有效可编辑条件是 `document.kind === "draft" && capabilities.canEdit && !inputPolicy.readonly`；任何一项不满足都不得产生 `draft-input` 或 `source-format-command`。
- revision 强制 `canEdit=false`、`canApplySuggestion=false`、`canUndo=false`、`canRedo=false`，即使父级错误地传 true 也必须 fail closed。
- draft 存在 `pendingEditCount > 0` 或 `saveState !== "saved"` 时，强制关闭 suggestion、Agent、undo、redo capability；输入、选择、复制和失败提示仍可用。
- `canAnnotate=true` 只表示外层已经提供合法 annotation command，不代表组件拥有网络权限。
- capability 不能用来遮住错误 machine data；hidden revision 的 machine overlay 必须根本不传入。

### 4.4 overlays、目标和坐标

```ts
type RuleHitOverlay = {
    id: string;
    span: Span | null;
    quote: string;
    ruleId: string;
    source: "machine-scan" | "machine-llm-review" | "draft-preview";
    severity: string;
    suggestionId: string | null;
    replacement: string | null;
};

type HeatmapOverlay = {
    id: string;
    detector: DetectorIdentityDto;
    chunks: Array<{start: number; end: number; pAi: number}>;
};

type AnnotationOverlay = {
    id: string;
    span: Span;
    quote: string;
    note: string;
};

type DraftChangeOverlay = {
    editId: string;
    span: Span;
    beforeText: string;
    afterText: string;
    source: DraftEditSourceDto;
    state: "applied" | "stale";
};

type DocumentSurfaceOverlays = {
    target: DocumentSurfaceTarget;
    ruleHits: RuleHitOverlay[];
    heatmaps: HeatmapOverlay[];
    activeHeatmapId: string | null;
    annotations: AnnotationOverlay[];
    draftChanges: DraftChangeOverlay[];
};
```

输入校验：

- 所有正文坐标是 UTF-16 半开区间 `[start, end)`；必须满足 `0 <= start <= end <= body.length`。
- 非 null `quote` 必须等于当前 `body.slice(start, end)`；无法核对的 hit 可以显示“无法可靠定位”的列表项，但不能在正文上伪造位置。
- heatmap chunk 的 `pAi` 必须是有限数且位于 `[0, 1]`；chunk 不得越界。不同 detector 的 chunk 不合并、不平均、不叠成同一概率场。
- 所有 overlay id 在各自集合内必须唯一；重复 id、越界 span、错误 quote、错误 target 或 stale generation 的单项隔离并发 diagnostic，不能整篇渲染。
- `activeHeatmapId=null` 表示不画热力图；非 null 必须命中当前 `heatmaps`，否则不画任何热力图并发 diagnostic。
- `overlays.target` 必须与 document target 完全相等：revision 比对 revision id 和 fingerprint；draft 比对 draft id、authoritative generation、working version 和 fingerprint。
- rule hit 的 `suggestionId/replacement` 只在服务器提供确定性 suggestion snapshot 时非 null；draft-preview 不得伪造 suggestion id。
- blind-review 的 revision model 必须传空 machine overlay；组件即使收到 hidden machine overlay 也必须隔离，不得依赖 CSS 或 DOM 隐藏。

### 4.5 focus request

```ts
type DocumentFocusRequest =
    | {requestId: string; kind: "offset"; offset: number}
    | {requestId: string; kind: "rule-hit"; hitId: string}
    | {requestId: string; kind: "annotation"; annotationId: string}
    | {requestId: string; kind: "draft-change"; editId: string};
```

`requestId` 是父级的幂等键：同一挂载周期只消费一次。offset 必须在正文范围内；未知 hit、annotation 或 edit 只发 diagnostic，不移动焦点。父级要再次定位必须生成新的 `requestId`。组件不把焦点请求持久化到数据库或 URL。

## 5. 输出合同

### 5.1 成功投影

成功的可见投影只有三层：

1. **正文层**：当前 document 的 `body`，按原始字符序列显示；不解析 Markdown/HTML，不执行 `innerHTML`。
2. **叠加层**：通过 target、span、quote 校验的 rule hit、一个 active heatmap、annotation 和 draft change。
3. **交互层**：由 capabilities 控制的按钮、菜单、选区操作和保存状态；按钮禁用不改变正文或服务器事实。

组件不输出 HTML 字符串、DOM 节点、Vue ref、函数、错误对象、服务器 token、数据库 id 的解析结果或完整内部 state。对外输出必须是下列 JSON 可序列化白名单。

### 5.2 selection 与 intent

```ts
type DocumentSurfaceDomAnchor = {
    left: number;
    top: number;
    height: number;
    containerWidth: number;
    containerHeight: number;
    absoluteTop: number;
};

type DocumentSurfaceSelection = {
    documentId: string;
    target: DocumentSurfaceTarget;
    start: number;
    end: number;
    quote: string;
    anchor: DocumentSurfaceDomAnchor;
};

type AnnotationIntent = {
    documentId: string;
    revisionId: string;
    span: Span;
    quote: string;
    note: string;
};

type UserDraftEditIntent = {
    documentId: string;
    draftSessionId: string;
    workingVersion: number;
    from: number;
    to: number;
    insertedText: string;
    inputKind: "typing" | "paste" | "cut";
};
```
约束：

- selection 只对非空、当前 body 内、quote 精确匹配的 span 发出；折叠 caret 不发 `DocumentSurfaceSelection`，而是清除 selection。
- `DocumentSurfaceDomAnchor` 的几何值只供 `ReviewSelectionMenu` 定位，必须来自当前 DOM、可序列化且有限；它不参与 Fingerprint、正文坐标或 durable state。
- `UserDraftEditIntent` 只表达当前 working body 的 UTF-16 splice，不提交 authoritative generation、provenance、replacement fingerprint 或服务器 edit id。
- `AnnotationIntent` 必须使用 revision target；draft-only comment 不能伪装成 revision annotation。外层要把 draft selection 锚回 immutable base，无法可靠映射时不得提交。
- selection change 的生命周期只覆盖短时 UI intent；durable truth 由父级保存，组件不能反向强行覆盖浏览器正在进行的 selection。

### 5.3 事件、顺序与游标

```ts
type SourceFormatCommand =
    | "paragraph"
    | "heading-1"
    | "heading-2"
    | "heading-3"
    | "blockquote"
    | "bullet-list"
    | "ordered-list"
    | "list-indent"
    | "list-outdent"
    | "code-block";

type DocumentSurfaceDiagnostic = {
    code:
        | "invalid-document"
        | "invalid-target"
        | "invalid-overlay"
        | "invalid-span"
        | "invalid-quote"
        | "unknown-focus-target"
        | "unsupported-capability"
        | "composition-error";
    target: DocumentSurfaceTarget | null;
    itemId: string | null;
    detail: string;
};

type DocumentEditorSurfaceEvent =
    // 五类正文交互事件：每一类都必须带 documentId。
    | {type: "draft-input"; documentId: string; target: DraftSurfaceTarget; intent: UserDraftEditIntent}
    | {type: "caret-click"; documentId: string; target: DocumentSurfaceTarget; offset: number; meta: {origin: "pointer" | "keyboard"; collapsed: boolean}}
    | {type: "selection-change"; documentId: string; target: DocumentSurfaceTarget; selection: DocumentSurfaceSelection | null}
    | {type: "overlay-click"; documentId: string; target: DocumentSurfaceTarget; overlayId: string; overlayKind: "rule-hit" | "heatmap" | "annotation" | "draft-change"; anchor: DocumentSurfaceDomAnchor | null}
    | {type: "source-format-command"; documentId: string; target: DraftSurfaceTarget; command: SourceFormatCommand; selection: DocumentSurfaceSelection; caretOffset: number}
    | {type: "create-annotation"; documentId: string; target: RevisionSurfaceTarget; intent: AnnotationIntent}
    | {type: "request-open-draft"; documentId: string; target: RevisionSurfaceTarget; revisionId: string}
    | {type: "request-apply-suggestion"; documentId: string; target: DraftSurfaceTarget; suggestionId: string}
    | {type: "request-undo"; documentId: string; target: DraftSurfaceTarget}
    | {type: "request-redo"; documentId: string; target: DraftSurfaceTarget}
    | {type: "request-agent"; documentId: string; target: DocumentSurfaceTarget; selection: DocumentSurfaceSelection | null}
    | {type: "focus-rule-hit"; documentId: string; target: DocumentSurfaceTarget; hitId: string}
    | {type: "select-heatmap"; documentId: string; target: DocumentSurfaceTarget; heatmapId: string}
    | {type: "toggle-overlay"; documentId: string; target: DocumentSurfaceTarget; overlay: "ruleHits" | "heatmap" | "annotations" | "draftChanges"; enabled: boolean}
    | {type: "web-surface-diagnostic"; documentId: string | null; target: DocumentSurfaceTarget | null; diagnostic: DocumentSurfaceDiagnostic};
```

事件规则：

- 五类正文交互事件必须带当前 `documentId`，且其 `target.documentId` 必须完全相等；缺失或错配时不得转发事件。
- `draft-input`、`source-format-command` 只表达用户修改意图；它们不直接修改 server fact，不自行调用 API，也不实现第二套 piece-table/command bus。
- `caret-click` 只报告偏移和来源；`overlay-click` 只报告稳定 overlay id 与菜单 anchor。它们不得直接打开兄弟面板、重跑 detector 或改变 display store。
- `selection-change` 可以高频产生，父级可以合并旧值；selection 中的 `anchor` 由 `ReviewSelectionMenu` 消费，不能写入 pending annotation 或 URL。
- 一次输入法 composition 最多产生一个 `draft-input`；composition 中的中间字符只留在浏览器输入控件。
- 同一次挂载中，事件按用户动作发生顺序同步交给父级；组件不提供 replay、SSE cursor 或断线恢复 cursor。其他命令事件不能被静默合并或跨用户动作重排。
- `request-open-draft`、`request-apply-suggestion`、undo/redo、Agent 和 annotation 事件只表达意图；命令结果、重试、HTTP 错误和 durable snapshot 由外层返回。
- 本合同不存在 `overlay-diagnostic-rejected` 事件；非法输入统一使用 `web-surface-diagnostic`，它不是领域事件，不请求服务器，也不得写入用户正文。

组件没有下载功能、导出文件、Blob 结果或公共文件 URL。若未来需要导出，必须由 Workspace/API 另立下载合同；不能把当前 body 通过隐藏链接或组件内部 Blob 导出。

## 6. 状态与持久化

### 6.1 状态集合

组件只拥有以下局部、非持久状态：

| 局部状态 | 取值 | 用途 | 组件卸载后的结果 |
| --- | --- | --- | --- |
| `surfaceLifecycle` | `unmounted`、`mounted`、`rejected`、`disposed` | 控制是否接受输入和事件 | `disposed` 不可逆；不保留业务事实 |
| 原生 selection/caret | 当前 DOM 范围或 null | 浏览、复制、菜单定位 | 丢失；外层只可恢复业务 intent，不可恢复原生 DOM selection |
| composition buffer | inactive 或浏览器 IME 中间值 | 合并一次 compositionend splice | 丢失；不得在中间态持久化 |
| 菜单状态 | closed/open + 当前 anchor | 规则菜单、选区菜单、annotation 输入 | 丢失 |
| `lastFocusRequestId` | string 或 null | focus request 幂等 | 丢失，重复 requestId 不跨挂载重放 |
| scroll/flash | 数值或短时 timer | 阅读位置和定位强调 | 丢失；工作区可由外层保存滚动意图但不属于领域事实 |

组件明确是**无持久状态组件**：不写数据库、IndexedDB、localStorage、sessionStorage、Blob、URL query 或 cookie。浏览器恢复队列、DraftSession body、edit ledger、annotation pending intent、operation timeline 和 display preference 的 owner 见下表。

### 6.2 durable truth 所有权

| 事实 | durable owner | 组件行为 |
| --- | --- | --- |
| Text/Revision/body/reveal/machine | Web server/API | 只消费 query 投影；不缓存成可写副本 |
| DraftSession body/generation/edit ledger | Web server DraftSession store | 发 splice/proposal/undo/redo intent |
| working body 与 pending edits | `DraftWorkingState` controller | 组件显示受控投影；失败时不自行恢复 |
| judgment/skip/AnnotationDto | Workspace/API | 组件只发 intent |
| Agent invocation/proposal/Operation | server harness + Workspace store | 组件显示已投影摘要，不启动工作 |
| pending annotation 与 autosave recovery | 外层 Workspace controller | 组件卸载不负责恢复 |
| panel/heatmap/overlay 显示偏好 | `DisplaySettingsStore` | 组件只消费 display flags |

服务器 Workspace 的完整恢复和 DraftSession 合同见 [`workspace-api-contract.md`](workspace-api-contract.md)；客户端状态所有权见 [`workspace-state-and-commands.md`](workspace-state-and-commands.md)。

### 6.3 生命周期与恢复

- mount：校验当前 model，建立必要 DOM listener/ResizeObserver/timer，接受输入。
- model 更新：相同 target 且 body 未改变时保留合法局部 selection；body、generation、workingVersion 或 fingerprint 改变时重新验证，失效 selection/overlay 立即清除并诊断。
- panel 切换、sheet 打开关闭和父级 `v-show`：不得创建或销毁 DraftSession，也不得改变 operation；允许保留局部 selection，前提是 target 仍相同。
- unmount：清理 DOM listener、ResizeObserver、timer 和 composition listener；不发 discard，不取消网络操作，不写恢复存储。
- 刷新/历史恢复：由 WorkspaceStore 恢复 server snapshot 和 outer pending state，再重新生成 model；组件不因为“恢复”自动 reveal、retry 或 invoke。

### 6.4 编辑记录与撤销/重做迁移

- 每次用户修改都先表示为 piece-table splice：`from`、`to` 和 `insertedText` 是最小变更，不把每次按键复制成一份完整正文。`body` 只是当前 piece-table 的 fold 结果。
- 本地 splice 只更新 `DraftWorkingState.workingBody` 和待确认队列，不写服务器、不推进 `authoritativeGeneration`、不创建 Revision。组件发出的 `draft-input` 不能携带服务器 edit id 或 provenance。
- 迁移期间可以复用 `useRepairDraft` 的纯 piece-table、坐标映射和 fold 算法；不得继续把 composable 的 `ref<RepairPlan>`、toast snapshot 或 `defineExpose` 当成 DraftSession owner。
- server DraftSession 的 `DraftEditDto`/edit ledger 是修改记录的 canonical durable truth。人工输入、static suggestion 和 Agent proposal 必须进入同一 generation ledger；来源快照由服务器验证并保存。
- undo/redo 的目标 owner 从 `TextPanel` 本地 `restoreSnapshot` 迁到 DraftSession command：`undo-draft(draftSessionId, expectedGeneration)` 和 `redo-draft(...)` 返回完整下一代 DraftSession，由外层 selector 更新 `canUndo/canRedo`。
- 待确认队列非空、`saving`、`failed` 或 `offline` 时，外层禁用 undo/redo；组件只展示 capability，不在浏览器里偷偷回滚 working body。
- 一次 user splice 或 suggestion 成功保存后，服务器推进 authoritative generation 并返回完整 ledger；新分支会清空 redo 栈，组件不自行维护或猜测 redo 栈。
- 旧实现的“通知里的撤销”只能在 adapter 内翻译成 `request-undo` intent。WorkspaceStore/DraftSession 接管后，删除本地快照恢复、页面镜像和跨层 `defineExpose` 撤销入口。

## 7. 状态转换

### 7.1 合法转换

```text
unmounted
  └─ mount(valid model) ──► mounted
                           ├─ document.kind=revision ──► revision-readonly
                           └─ document.kind=draft ──────► draft-presented

revision-readonly
  ├─ selection/annotation/focus ──► revision-readonly
  ├─ request-open-draft ──────────► revision-readonly（等待外层，不自行切换）
  └─ 外层返回 DraftSession model ─► draft-presented

draft-presented
  ├─ local splice ────────────────► draft-presented(saveState 由外层更新)
  ├─ server DraftSession response ─► draft-presented(new generation)
  └─ 外层 commit 返回新 Revision ─► revision-readonly(new revision, blind-review)

mounted / revision-readonly / draft-presented
  └─ invalid input ───────────────► rejected（fail closed，等待合法 model）

mounted / rejected
  └─ unmount ─────────────────────► disposed（不可逆终态）
```

### 7.2 转换条件和不可逆行为

- `unmounted → mounted` 只有在 model 结构通过校验后发生；非法 model 不产生正文可编辑投影。
- `revision-readonly → draft-presented` 只能由外层成功完成 `open-draft` 后传入新 model；组件不能因为 `canEdit=true` 自己把 revision 改成 draft。
- draft 内的 `saving/failed/offline` 状态由外层用新 model 投影；组件不自主转换。组件在这些状态下仍可以接收输入，但不得发起被 capability 禁止的命令。
- `draft-presented → revision-readonly` 只能由服务器成功 commit 创建新 Revision 后发生；组件不能把 draft 直接标成已提交。
- `rejected` 是 fail-closed 投影：不渲染不可信 overlay，不接受会改变业务事实的动作；收到合法新 model 后可回到 `mounted`，不自动采用被拒绝的数据。
- `disposed` 是不可逆终态；任何延迟 timer、旧 promise 或旧事件都不得在 disposed 后发出事件。

### 7.3 旧 owner 的行为

迁移前的 `TextPanel` 可能仍持有旧 `RepairPlan`，`contribute.vue` 也可能仍持有 `editDraft` 镜像。目标组件不得读取这些旧 owner。adapter 必须在边界上完成一次投影：

1. 从旧 source/plan 生成一个 draft model 和合法 target。
2. 将旧编辑转成 `DraftEditSourceDto` 兼容的显示数据；无法映射的旧 provenance 只显示为 legacy/stale，不伪造精确来源。
3. 新组件发出的 event 由 adapter 转给 Workspace command bus。
4. 一旦 WorkspaceStore/DraftSession 成为 owner，删除页面镜像和对旧 `defineExpose` 的新增依赖。

## 8. 副作用与事务边界

### 8.1 组件本身的副作用

组件允许的副作用仅限于浏览器进程内的短时 UI 资源：

- 创建/更新 textarea 或纯文本背板 DOM。
- 读取浏览器 selection 和 computed style，以计算 UTF-16 span 或菜单 anchor。
- 注册 pointer、keyboard、composition、resize、scroll listener。
- 使用 `ResizeObserver`、短时 focus flash timer 和 DOM scroll。
- 向父级 emit JSON-safe event。

卸载时必须移除 listener、断开 observer、清理 timer 和释放临时 mirror element。组件不得启动 worker、子进程、长连接、SSE、后台轮询或模型调用。

### 8.2 组件不触发的外部副作用

组件直接触发的以下副作用全部为“无”：

| 资源/事实 | 组件是否写入 | 真正 owner/边界 |
| --- | --- | --- |
| SQLite/Prisma/Text/Revision/DraftSession | 否 | Web API；命令事务见 `workspace-api-contract.md` |
| Blob、上传文件、下载文件 | 否 | 当前组件没有下载/文件 API |
| 外部网络、OAuth、detector、LLM、Agent | 否 | API adapter / Agent harness |
| 领域事件、SSE、operation | 否 | Workspace command bus / server operation store |
| 业务日志和正文遥测 | 否 | 宿主按 `web-surface-diagnostic` 白名单采集 |
| 浏览器恢复存储 | 否 | Workspace controller；组件无 durable state |

### 8.3 事务与幂等边界

- 组件事件没有数据库事务；emit 成功只表示“intent 已交给父级”，不表示服务器写入成功。
- `open-draft` 的幂等性由 API 的 `user × text × currentHead` 约束保证；重复点击不应创建第二个 active DraftSession。
- user splice、suggestion、undo、redo 和 Agent proposal 的原子 generation 更新由服务器负责；组件不得自行递增 authoritative generation。
- annotation、judgment、reveal、commit 的事务和幂等性由 API 合同负责；组件不在成功回调前清除外层 pending state。
- 同一 `focusRequest.requestId` 的定位操作幂等；同一 selection event 没有持久化重放语义。
- 请求超时后，组件不自行判断“服务器是否已写入”；外层必须刷新 authoritative snapshot，再决定是否重试。

## 9. 错误、降级与 fail-closed

### 9.1 组件可识别的错误类别

| 类别 | 例子 | 组件行为 |
| --- | --- | --- |
| `invalid-document` | body 非字符串、fingerprint 与 body 不符、revision 传编辑 capability | 拒绝该 document 投影，保留上一份合法投影或显示空安全壳，发 diagnostic |
| `invalid-target` | overlay 指向另一 revision/draft/generation | 隔离对应 item，不画，不把事件发到错误目标 |
| `invalid-span` | 越界、负数、start 大于 end、heat chunk 非法 | 隔离对应 item；正文和其他合法 item 继续显示 |
| `invalid-quote` | quote 不等于当前 body slice | 不显示可定位 mark；列表可以显示“无法可靠定位” |
| `unsupported-capability` | hidden revision 被要求编辑或 draft 未保存却请求 Agent | 禁止动作并发 diagnostic，不绕过 capability |
| `unknown-focus-target` | focus request 的 id 不在当前 overlay 集合 | 不滚动、不闪烁，只报告 diagnostic |
| `composition-error` | 浏览器 compositionend 缺少合法 range | 丢弃该次 splice，保留已显示 working body，等待下一次输入 |

组件不把异常字符串当 API 合同，也不把 null、空数组、0、运行中和失败混成同一状态。

### 9.2 外层 HTTP/命令错误映射

组件不发 HTTP，也不抛出 HTTP 异常；外层 command handler 按 [`CommandResult`](workspace-state-and-commands.md) 处理：

- `400`：请求结构、字段或 span 非法；保留当前正文和 selection，提示用户修正或重新选择。
- `401`：会话失效；停止需要授权的命令，不清除可恢复 working body，交给认证外壳处理。
- `403`：已认证用户拥有资源，但当前阶段或 capability 不允许动作，例如 hidden revision 不允许显示 machine overlay 或 draft 尚未保存；不通过 UI 强行显示或重试。
- `404`：revision、DraftSession、suggestion 或 owner 资源不存在，或调用者不是 owner。服务器对“无权”和“不存在”统一返回 404，不返回可用于资源枚举的 403；外层清除对应 stale item 并重新加载 Workspace。
- `409/412`：generation、head、target 或 fingerprint stale；禁止自动 rebase，刷新 authoritative snapshot，要求重新选择或由用户明确重试。
- `5xx`、网络断开、超时：working body、selection 和 pending intent 保留；显示 `failed/offline`，不得把失败当成已保存。
- 未知错误：fail closed，保留本地工作副本，记录脱敏 diagnostic，不显示服务器堆栈或 secret。

HTTP status 是 API/命令层错误码，`DocumentSurfaceDiagnostic.code` 是组件投影错误码；两者不得互相伪造。组件只产生 `invalid-*`、`unknown-focus-target`、`unsupported-capability` 和 `composition-error` 等本地诊断，外层按 [`CommandResult`](workspace-state-and-commands.md) 的 canonical `code` 显示错误和决定重试。

### 9.3 重试 allow-list

组件自身没有重试器。外层只允许以下策略：

1. `GET workspace`、`GET machine` 和 focus 所需的 query refresh 可以按网络/5xx 重试；GET 不创建业务事实。
2. `open-draft` 可以重试，因为 API 对同一 owner/head 幂等。
3. autosave timeout/网络/5xx 只能在刷新确认同一 `draftSessionId`、authoritative generation 和 body fingerprint 后重试原 splice；无法确认时先 refresh，不盲重放。
4. suggestion、undo、redo、Agent proposal 遇到 timeout 先 refresh；只有 expected generation 仍相同且 command handler 标记 retryable 才能再次发送。
5. Agent 失败可以由外层创建新 invocation；不能重复复活原 invocation。annotation pending intent 由外层保存并按 API 幂等合同重试，组件不直接重试 `$fetch`。

禁止自动重试 reveal、commit、discard、logout、删除或任何不可逆命令。任何重试都不得跨 text、revision、draft、user 或 invocation identity。

### 9.4 降级条件

- 没有合法 machine overlay：继续提供纯文本阅读，不显示 0 分或伪造空命中。
- 没有合法 heatmap：保留规则标记，关闭热力层；不把另一 detector 或旧 body 的 chunks 借来显示。
- overlay 部分失效：只隔离失效项，合法正文和其他合法 overlay 继续工作。
- Agent/draft 不可用：保持 revision 只读，选择和复制仍可用。
- model 整体不可信：不渲染不可信正文/overlay，不接受 edit/Agent/annotation command，等待外层提供新 model。

## 10. 依赖、端口与 durable truth

### 10.1 依赖方向

```text
Workspace API DTO / DraftSession store
        ↓ server/client adapter
Workspace query + command bus
        ↓ controlled model + event
DocumentEditorSurface
        ↓ browser DOM only
textarea / selection / overlay renderer
```

组件依赖的端口只有：

- `DocumentEditorSurfaceModel` 输入端口。
- `DocumentEditorSurfaceEvent` 输出端口。
- 浏览器 DOM selection、composition、focus、scroll 能力。

组件不得依赖 `$fetch`、Prisma client、Nuxt route、Agent composable、detector adapter、Rules panel ref 或 `contribute.vue` 的页面 ref。要接入这些能力，必须在外层建立 adapter/command handler。

### 10.2 谁拥有 durable truth

唯一 durable truth 归属如下：

- 正文与 revision lineage：server `Revision`，见 [`CONTEXT.md`](../../../CONTEXT.md) §2.6。
- DraftSession、generation、edit ledger：server DraftSession store，见 [`workspace-api-contract.md`](workspace-api-contract.md) §8.4。
- 人类 judgment 和 annotation：server owner API；annotation note 原样保存。
- Agent invocation 和 Operation：server harness/operation store；terminal 事实不可复活。
- 客户端 working queue 和恢复提示：Workspace controller；不是组件。

任何实现如果需要在组件里增加 `savedBody`、`serverDraft`、`provenance` 或“最近一次 revision”副本，先停止并修正所有权，而不是增加同步 watcher。

### 10.3 外部依赖期望

组件对外部 adapter 的最低期望是“全量、同身份、可判定”：

- query adapter 返回的 document、overlay 和 capability 必须来自同一 `documentId`/target；不得先画新 body，再异步补旧 overlay，也不得用部分 response 猜测 `saved`。
- command adapter 成功时必须返回完整 DraftSession 或完整 Workspace projection，包含 authoritative generation、body fingerprint、working version、pending edit count 和 `canUndo/canRedo`；组件不接受只返回“成功”的空响应。
- timeout、网络断开和 5xx 的结果未知时，adapter 必须保留 working body/selection/pending intent，先 refresh 同一身份 snapshot，再按 9.3 allow-list 决定是否重试；不得把 timeout 当作失败已写入或成功已写入。
- response 的 `documentId`、revision/draft id、generation 或 Fingerprint 任一不匹配时，adapter 必须丢弃该 response 并发起 refresh/diagnostic；不得自动 rebase、按数组位置替换或把旧 quote 套到新 body。
- detector、Agent 和 suggestion 的异步结果必须携带其冻结的 revision/draft/generation/Fingerprint；stale 结果只能显示为 stale/不可用，不能进入正文 overlay 或自动应用。
- 外部 adapter 负责把 canonical `CommandResult.code` 映射为 UI 状态；组件只消费受控 `saveState` 和 capability，不解析异常字符串、不直接重试 `$fetch`。

## 11. 配置、默认值与安全边界

### 11.1 组件配置

组件没有环境变量、运行时配置文件、数据库路径、Blob 根目录或外部 URL。它的唯一配置来自受控 model 的 `capabilities`/`display` 和宿主注入的主题 CSS 变量。

组件级默认值：

- `focusRequest=null`。
- `ruleHits/heatmaps/annotations/draftChanges=[]`。
- `activeHeatmapId=null`。
- 所有 display 开关在 adapter 未明确开启时为 false。
- 不对 body 做 trim、换行转换、大小写转换、Unicode normalization 或 Markdown 渲染。

没有任何组件配置可覆盖 D2、owner capability、Draft generation、fingerprint 或服务器错误。`display.heatmap=true` 不能创造 machine data，`canEdit=true` 不能把 revision 变成 draft。

### 11.2 Web 环境与启动守卫

Web 的 `DATABASE_URL`、OAuth、session、detector 和 Agent 配置不属于组件配置；它们的默认值、生产启动 fail-closed 守卫和 secret 边界见 [`web/README.md`](../../../web/README.md) 与 `web/server/plugins/production-config.ts`。组件不读取 `process.env`、`useRuntimeConfig()` 或 `.env`。

路径 containment 对本组件不适用，因为组件不能读写路径或文件。未来若增加下载、导入或 Blob 功能，必须另立 API/文件合同，定义绝对路径拒绝、根目录 containment、扩展名白名单、大小上限、临时文件回收和权限校验；不能通过本组件直接实现。

#### 配置与路径登记

- 上传和 revision body 的 60,000 字符限制在 `web/server/utils/dto.ts` 的 `CreateTextDtoSchema`/`CreateRevisionDtoSchema` 执行；不能用组件的 `capTextTo` 放宽，也不能用 `readonly` 代替服务器权限。
- owner、session、reveal 和 DraftSession 权限由 `web/server/api` 的 handler 根据服务端 session 校验；客户端 `capabilities`、`readonly`、URL 参数和 `documentId` 都不是授权凭据。owner 不存在和无权访问统一走 404。
- `DocumentEditorSurfaceModel` 没有 `path`、文件名、数据库路径、绝对路径或 Blob 根目录字段。组件不能读写文件；浏览器恢复队列若由外层启用，必须按 `user/text/draft` 身份隔离，且不得保存绝对文件路径。
- 生产环境配置和启动守卫位于 `web/server/plugins/production-config.ts`；组件不得读取 `process.env`、`useRuntimeConfig()`、`.env` 或任何 server path。

### 11.3 安全边界

- hidden revision 的 machine/D5/operation 信息不能进入 model；组件必须对意外传入 fail closed，但不能把“前端隐藏”当服务器安全边界。
- 正文和 quote 作为文本节点渲染，不通过 `innerHTML` 或未经清理的 HTML；规则解释、annotation note 和 Agent 文本不能注入 DOM。
- event 只允许白名单字段；不向事件加入 cookie、token、绝对路径、数据库连接串、完整 provider 响应或未脱敏异常。
- `suggestionId` 只能触发外层服务器验证；客户端提交 `replacement` 不属于本组件合法命令。
- owner 与未来 study-assignment 的权限不能由组件推断或复用；study participant API 未有独立 Accepted 合同前，不构造其 context。

## 12. 明确延后与不在范围

本组件本轮不设计或实现：

- 历史 revision 浏览器、任意 baseline 选择和跨 revision 比较。
- 左右双栏 diff；未来比较采用正文内联 diff，另立 Draft spec。
- 富文本协作编辑、多人同时编辑、Markdown DOM 作为正文真相源。
- 文件上传、Blob 下载、导出、打印和离线完整文档数据库。
- 多人/participant annotation、study assignment exposure 和公开 Arena 权限。
- 在组件内部运行 detector、LLM、Agent、lint fix 或数据库事务。

## 13. 重建验收

每条验收都必须能由浏览器、组件 harness 或 API/contract harness 判定。`DocumentEditorSurface` 的验收不能只看截图，也不能只断言按钮存在。

1. **给定 hidden revision**，观察正文可读、可选、可复制且不可编辑；断言 DOM、可访问性树、model 和组件事件中没有 rule hit、分数、detector、Agent、D5 或 operation 信息。
2. **给定 revision capability 被错误置为可编辑**，观察组件仍不产生 `draft-input`、`source-format-command`、suggestion、undo 或 redo 事件；断言 revision body 未改变。
3. **给定合法 revision body 和合法 revision target**，观察每个合法非空选择的 quote 等于 `body.slice(start,end)`；断言事件目标不是 ordinal 或数组位置。
4. **给定空选择或 Escape 清除选择**，观察 `selection-change` 为 null；断言不产生 annotation 或 Agent selection。
5. **给定选区和合法 annotation capability**，观察 `create-annotation` 只包含 revision id、UTF-16 span、精确 quote 和 note；断言组件不发 HTTP、不清除外层 pending intent。
6. **给定合法 revealed revision overlay**，观察规则标记、批注和明确 detector 热力图分别出现；断言不同 detector 不合并、不平均、不叠加。
7. **给定 overlay target 指向另一 revision**，观察该 overlay 不渲染并收到 `invalid-target` diagnostic；断言正文和同一 target 的合法 overlay 仍可见。
8. **给定越界 span、错误 quote 或非法 pAi**，观察对应 item 被隔离；断言不发生裁剪后伪造定位、不抛出未处理异常。
9. **给定 `activeHeatmapId` 不存在**，观察不显示热力层并发 diagnostic；断言不会按数组第一项偷偷选择 detector。
10. **给定相同 `focusRequest.requestId` 两次**，观察只发生一次滚动/闪烁；给定新 requestId，观察只定位到新目标。
11. **给定 inspect-edit 的 revision**，点击“开始修改”后观察只有 `request-open-draft`；断言组件没有本地把 revision body 变成 draft。
12. **给定外层返回 draft generation 7**，观察 draft body 可编辑、target 带 generation 7 和 fingerprint；断言 authoritative generation 不由组件自行递增。
13. **给定一次普通输入**，观察 working view 更新并产生一个 splice intent；断言 intent 只含 draft id、working version、UTF-16 from/to、insertedText 和 inputKind。
14. **给定中文 IME composition**，观察 composition 中不产生 splice，`compositionend` 最多产生一个 splice；断言没有重复字符或中间态写入。
15. **给定 emoji、换行、粘贴和剪切**，观察 start/end 与 JavaScript UTF-16 `slice` 一致；断言按 Unicode code point 重新计数不会造成错位。
16. **给定 pendingEditCount>0、saving、failed 或 offline**，观察正文、复制和选择仍可用而 Agent/suggestion/undo/redo 禁用；断言组件不丢 working body。
17. **给定父级返回较低 generation、错误 draft id 或错误 fingerprint**，观察旧响应不覆盖当前投影并产生 diagnostic；断言组件不自动 rebase。
18. **给定合法 suggestion overlay 和 saved draft**，点击应用观察事件只包含 suggestionId 和当前 draft target；断言客户端没有提交 replacement。
19. **给定 Agent invocation 绑定 generation/fingerprint**，观察组件事件带当前 target/selection；草稿身份变化后断言旧 proposal 不会在组件内自动应用。
20. **给定 commit 成功返回新 revision**，观察旧 draft selection、菜单和 stale overlay 清除，新正文进入只读 blind-review；断言组件不直接创建 Revision。
21. **给定 panel/sheet 切换但 target 不变**，观察正文、selection、working body 和 operation 不因组件事件而重置；断言切换不发 discard 或 retry。
22. **给定组件 unmount**，观察 listener、observer 和 timer 被释放；断言不发 discard、cancel、网络请求或延迟业务事件。
23. **给定网络/5xx autosave 失败**，观察外层显示 `failed/offline` 并保留 working body/pending queue；断言组件不把失败渲染为 saved。
24. **给定 autosave timeout 且无法确认服务器结果**，观察外层先 refresh 再决定是否重试；断言同一 splice 不被盲目重复提交。
25. **给定未知字段、未知 overlay source 或隐藏机器字段**，观察输入 fail closed 并产生可脱敏 diagnostic；断言未知数据不进入 DOM、事件或日志正文。
26. **给定同一组件事件序列**，观察事件按用户动作 FIFO 到达，selection-change 可以被父级合并；断言组件不提供虚假的 SSE cursor 或 replay。
27. **给定任意组件输入和事件**，序列化后只能出现本文列明的 string/number/boolean/null/array/object 字段；断言不包含 DOM 节点、函数、Vue ref、token、绝对路径或 Error stack。
28. **给定目标仓库现有实现**，观察生产代码仍标记为迁移差距而非 Implemented；断言本文件的 Accepted 合同不会被 `TextPanel` 旧 expose 或现状行为反向改写。

## 14. 实现与测试锚点

### 14.1 分层测试合同

实现目标组件时，测试必须按行为边界分层；不能用一组页面快照替代所有层：

| 层级 | 测试对象 | 必须覆盖 | 不应覆盖 |
| --- | --- | --- | --- |
| 单元测试 | Fingerprint/span 校验、UTF-16 slice、piece-table splice/fold、selector、capability 派生、重试 allow-list reducer | 代理对、换行、空 selection、越界、错误 quote、stale target、redo 清空和 generation 单调 | DOM、真实网络、组件 mount |
| 组合测试 | `DocumentEditorSurface` harness、受控 model/event adapter、textarea 背板、overlay 隔离、IME、菜单 anchor | `documentId`/target 匹配、五类正文事件、compositionend 单 splice、`readonly`/`capTextTo`、ReviewSelectionMenu anchor、非法 overlay 单项隔离 | 真实数据库、真实 OAuth、外部 detector/LLM |
| 集成测试 | Workspace adapter、selector、command handler、DraftSession API 与浏览器工作区 | owner 404、hidden D2、60,000 字符 DTO、autosave timeout/500/offline、刷新恢复、undo/redo、commit 新 Revision、旧响应阻挡和新 revision 回到 blind-review | 仅断言按钮存在；访问生产服务或真实外部模型 |

单元测试证明纯算法，组合测试证明组件不越过端口，集成测试证明 server/API/Workspace 的身份和权限不被前端假设替代。每个失败场景必须断言正文、事件、保存状态和 durable owner 的变化；不得只断言异常字符串。

测试入口沿用 [`detection-workbench-e2e.md`](../testing/detection-workbench-e2e.md) 的四层定义：本组件的“组合测试”是其中纯函数与浏览器 harness 之间的组件层；API/contract 与 Chromium E2E 共同构成本节的集成层。当前仓库尚无 `DocumentEditorSurface` 生产测试和 Accepted E2E runner，新增测试前必须保持这一现状声明准确。

### 14.2 生产源码锚点（不等同于目标组件覆盖）

以下是迁移时必须核对的现有源码行为。它们是生产代码锚点，不代表目标组件已经存在：

| 文件 | 符号/行为区间 | 当前事实与迁移要求 |
| --- | --- | --- |
| `web/app/components/HighlightedTextarea.vue` | `defineModel`、`defineEmits`、`emitSelection`、`composition/keydown`，约 `#L7-L27`、`#L165-L234` | 最接近目标的受控纯文本输入；保留 UTF-16/IME/selection，改由 surface event 输出 |
| `web/app/components/ReadOnlyHighlightedText.vue` | `segments`、`heatMode`、`segmentClass`，`#L18-L110` | 现有只读规则/热力分段；迁移时加入严格 target/quote/span 校验 |
| `web/app/components/AnnotatableRevisionText.vue` | `captureSelection`、`submitAnnotation`，`#L39-L121` | 现状直接 `$fetch /api/annotations`；目标必须只 emit `AnnotationIntent` |
| `web/app/components/ReviewEditor.vue` | props/events、selection menu、diff、annotation，`#L31-L92`、`#L123-L165` | 当前交互功能丰富但含旧 preview/Tiptap 债务；拆为受控 surface + 外层命令 |
| `web/app/components/TextPanel.vue` | `useRepairDraft`、`updateText`、`acceptReplacement`、`mapDraftSpanToSource`、`defineExpose`，约 `#L27-L80`、`#L186-L250`、`#L331-L400`、`#L451-L568`、`#L633-L690` | 当前仍是 draft/provenance owner；迁移后 server DraftSession/Workspace controller 才是 owner |
| `web/app/pages/contribute.vue` | `editDraft`/revision 状态、annotation、polling、commit 和 TextPanel 宿主，约 `#L91-L125`、`#L159-L225`、`#L331-L415`、`#L534-L604`、`#L1008-L1061` | 当前页面仍是状态总线；目标只保留 route/provider/command orchestration |
| `web/app/utils/repair-draft.ts` | `RepairPlan`、`foldDraft`、`applyDraftSplice`、坐标映射，`#L15-L34`、`#L97-L223` | 现有 piece-table 纯算法可迁移；不把 `RepairPlan` 当 server DraftSession |
| `web/app/composables/useRepairDraft.ts` | `useRepairDraft`、`setDraft`、`spliceDraft`、`sealDraft`，`#L16-L27`、`#L54-L74`、`#L94` | 当前 Vue piece-table 状态 owner；迁移只保留纯算法，不保留其 server/undo 所有权 |
| `web/app/utils/review-ranges.ts` | `ReviewTextSelection`、`utf16LineStarts`、`columnToOffset`、`buildReviewIssueMarks`，`#L56-L137` | 现有 scanner code point column → UTF-16 offset 转换；目标 contract 统一使用 UTF-16 span |
| `web/app/utils/contribute-workspace.ts` | `WorkspaceRevision`、`HeatChunk`、`hydrateWorkspace`，`#L38-L110`、`#L182-L225` | 当前旧 workspace projection；目标改由 canonical API DTO adapter 生成 surface model |
| `web/server/utils/dto.ts` | `CreateTextDtoSchema`、`CreateRevisionDtoSchema`、`CreateAnnotationDtoSchema`、`validateBody`，`#L18-L35`、`#L50-L75` | 当前 API 的上传、revision、body/span/note 基础校验；组件不复制 Zod schema |
| `web/server/api/annotations.post.ts` | handler、owner 校验和 Prisma create，`#L14-L31` | 当前 annotation 写入副作用；目标由外层 command/API 负责幂等和 pending 恢复 |
| `web/server/api/revisions.post.ts` | revision create、同步 scan、异步 detect，`#L17-L49` | 当前 commit 旧路径；目标 DraftSession commit 必须由 workspace API contract 接管 |
| `web/server/api/revisions/[id]/reveal.post.ts` | reveal 闸门和幂等，`#L18-L36` | 组件不调用；stage/reveal 仍由外层控制 |
| `web/server/plugins/production-config.ts` | production SSO startup guard，`#L13-L47` | 组件无配置；生产安全守卫留在 Web 启动层 |

### 14.3 对应测试锚点（测试不纳入生产覆盖表）

下表只记录应复用或迁移的测试证据，不把测试文件当生产源码覆盖率，也不宣称目标组件已经有浏览器 E2E：

| 测试文件 | 测试区间/行为 | 覆盖事实 |
| --- | --- | --- |
| `tests/repair-draft.test.ts` | `#L36-L148` | piece-table fold、splice、重叠合并、纯插入、UTF-16 坐标边界 |
| `tests/repair-draft.test.ts` | `#L150-L217` | 源锚定 annotation、左/右侧编辑投影、stale、draft selection 反锚 |
| `tests/llm-merge.test.ts` | UTF-16/emoji 与 hunk apply，约 `#L83-L123` | 多 hunk 逆序应用、代理对、草稿 provenance |
| `tests/contribute-workspace.test.ts` | `#L42-L103` | hidden/revealed hydrate、revision 自身 reveal 状态、历史恢复不偷跑 |
| `tests/contribute-workspace.test.ts` | `#L126-L161` | scan hit 汇总、未知 rule、缺 verdict 和空值区分 |
| `tests/neuro-agent-harness-profile.test.ts` | `#L159-L173` | 失效 selection snapshot 被拒绝，不把旧 quote 应用到新 body |
| `web/tests/nuxt/use-agent-chat.test.ts` | `#L24-L87` | Agent 全文/选区请求、宿主 draft 和 selection 绑定；目标迁移后改为 surface event/command 测试 |
| `tests/revision-text-workspace.test.ts` | 文件内 `RevisionTextWorkspace`、heatmap stale 和 UTF-16 coverage 测试 | Agent 读取 revision/draft、detector identity 和 stale 投影边界 |

当前没有名为 `DocumentEditorSurface` 的生产组件测试，也没有 Accepted E2E runner；浏览器跨层场景以 [`detection-workbench-e2e.md`](../testing/detection-workbench-e2e.md) 的 E2E-03、E2E-04、E2E-05、E2E-08、E2E-09、E2E-11、E2E-13、E2E-14、E2E-15 为目标验收入口。实现任务必须先补 component harness 和 API/浏览器测试，再将本节的“待迁移”锚点改为实际符号；不能因为现有 `TextPanel` 测试通过就宣称目标组件已实现。

## 15. 合同收口

以下句子是实现时最短的判断标准：

- **组件是受控、无持久状态的正文表面；外层拥有事实，服务器拥有 durable truth。**
- **revision 只读；draft 只在外层成功打开 DraftSession 后可编辑。**
- **所有正文位置都是当前 body 的 UTF-16 半开区间，并由 quote 和 fingerprint 保护。**
- **所有机器 overlay 先验证 identity，再渲染；验证失败就隔离，不猜测、不裁剪、不降级成伪数据。**
- **所有写入、重试、恢复、权限和事务都不在组件内；组件只发 JSON-safe intent。**
- **输入法、autosave、Agent proposal、undo/redo 和 commit 的版本事实由 DraftSession controller/API 处理，组件不能伪造 generation。**
- **组件卸载不会 discard、cancel、retry 或启动任何工作。**
*** End of File