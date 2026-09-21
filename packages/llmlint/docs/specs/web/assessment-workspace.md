# 评判工作区规格

> 状态：Accepted（2026-08-16，第二轮前端旅程）。  
> 目标：定义每个 revision 的首次阅读与盲评、查看与修改两个阶段，以及正文与右侧工作面板的组合边界。  
> 非范围：登录、上传表单、历史 revision 浏览和跨版本比较。

## 1. 产品目标

用户对每个 revision 重复经历两个阶段：

```text
blind-review（首次阅读与盲评）
  → 提交人类判定或显式跳过
  → reveal
  → inspect-edit（查看与修改）
  → 打开或恢复 DraftSession
  → 保存为新 revision
  → 新 revision 的 blind-review
```

`blind-review` 和 `inspect-edit` 是稳定代码 key，中文展示名暂不固定。仓库中的“评测实验室”专指离线 `evals/`，不得用来命名 Web 阶段或页面。

工作区让用户回答：

1. 我正在阅读或修改哪一篇、哪一个 revision？
2. 未看到机器结果时，我自己如何评价正文，哪些位置值得标注？
3. 揭示后，这版的机器风险和检测覆盖如何，具体哪里出现问题？
4. 我可以如何人工修改、接受规则建议或与 Agent 协作？

## 2. 两阶段信息架构

### 2.1 `blind-review`

```text
┌─────────────────────────────────────────────────────────────────────┐
│ 作品名 │ rev N │ 首次阅读 │ 不显示任何后台检测状态               │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│                    DocumentEditorSurface                            │
│                    居中、只读、可选区评价                           │
│                                                                     │
├─────────────────────────────────────────────────────────────────────┤
│ 评分入口：隐藏右侧面板 / 抽屉；提交评价或明确跳过                   │
└─────────────────────────────────────────────────────────────────────┘
```

约束：

- 每个新 revision 都先进入此阶段，rev0 不享有特殊豁免。
- 正文表面居中，使用不可变 revision body，只读但可选择、复制和添加 span 评价。
- 用户可以填写 doc 级评分、总评和 span 评价；revision 有 parent 时可以填写 `improvementScore`。
- 机器扫描可以在后台运行，但 DOM、Workspace DTO、可访问性树、SSE、公开 `snapshotVersion` 和响应时序都不能暴露该 hidden revision 的机器或 operation 状态。queued、running、succeeded、failed 和尚未创建任务时，blind-review 的可观察投影必须相同。
- 评分表由阶段外壳持有，可以折叠为隐藏右侧面板；折叠不影响阅读和 span 评价。
- 提交至少一项有效人类判定，或执行显式 skip，才能发送 reveal 命令。
- skip 是持久事实，刷新后不重复拦截；该 revision 缺失的 D5 人类输入保持 `indeterminate`。
- judgment/skip 写入成功后才 reveal。失败时保留本地评分草稿和未提交 span 评价。

此阶段由两类流程适配器复用：

```ts
type BlindReviewContext =
    | {kind: "owner"; textId: string; revisionId: string}
    | {kind: "study-assignment"; studyId: string; assignmentId: string; revisionId: string};
```

- owner 工作区使用 revision 级 reveal、owner judgment 与 annotation API。
- evals/evolution 未来需要人类评价时，先建立独立 study assignment 授权/API 合同；Arena 可以成为 assignment-scoped 流程之一。
`owner` adapter 使用 owner Workspace API。`study-assignment` 只保留为未来复用 intent 的边界；独立 assignment API 合同 Accepted 前，不得实现、路由或暴露该 context。未来合同必须定义 participant membership、assignment/revision 绑定、撤回状态、per-user exposure 原子转换、逐命令 capability 和防枚举错误顺序；owner 端点不能接收 study identity。

已获对应研究许可的人类 judgment 可以通过版本化 artifact 供 reviewer 校准；span 评价可以进入规则整理、误报分析和动态/静态规则候选研究。uploaded 来源及其人类判定不满足 D1，不能直接进入规则 lift 或 AIGC 检测器 ground-truth 训练集。

### 2.2 `inspect-edit`

```text
┌───────────────────────────────────┬─────────────────────────────────┐
│ DocumentEditorSurface             │ Work Panel                      │
│                                   │ [总览][规则][Agent]             │
│ revision 只读 / draft 可编辑      │ 当前面板内容                    │
│ + 规则命中                        │                                 │
│ + 单个明确 detector 热力图        │                                 │
│ + 批注 / draft change             │                                 │
└───────────────────────────────────┴─────────────────────────────────┘
```

- reveal 成功后，居中的正文移动到左侧，右侧面板出现。
- 初始可以继续查看 immutable revision；用户发起修改时，外壳先创建或恢复 `DraftSession(baseRevisionId)`，再把正文表面切成 draft。
- DraftSession 是草稿正文与 edit provenance 的唯一 owner。人工、规则、Agent 和 critic 修改都写同一 edit ledger。
- 保存草稿原子创建新 Revision；服务器派生 body、transition 和 provenance v2。
- 保存成功后自动选中新 revision，并立即回到该 revision 的 `blind-review`。
- detector、LLM 和 Agent operation 可以继续在后台运行；切换 panel 或正文表面状态不会取消任务。

## 3. 正文组件

`DocumentEditorSurface` 是两个阶段共用的唯一正文表面。详细 Accepted 合同见 [`document-editor-surface.md`](document-editor-surface.md)。

外壳只向组件传入：

- immutable revision 或 DraftSession derived body。
- 与正文 identity 完全一致的 overlay。
- 选区、聚焦和显示设置。
- 当前允许的动作 capability。

组件不拥有阶段状态、不提交评分、不 reveal、不请求 API，也不保存 DraftSession。

## 4. 工作面板

首轮 panel id 以 [`work-panels.md`](work-panels.md) 的 canonical `InitialWorkPanelId` 为准：Overview、Rules 和 Agent。长期保留的 `revisions` id 等待历史旅程 spec；当前不能渲染空 tab、不可用按钮或临时版本列表。

标准桌面一次激活一个右侧面板。超宽屏 pin 第二面板仍是后续增强；窄屏使用 sheet 呈现相同活动面板。

## 5. 当前 revision 与草稿

- 第一轮只选择唯一 head，不提供历史 revision 选择器。
- `selectedRevisionId` 仍是工作区事实，初始值和新建 revision 后的值都是当前 head id。
- ordinal 只用于展示，任何命令都使用 id。
- Agent invocation 冻结 revision id；绑定草稿时同时冻结 DraftSession id、authoritative generation、body fingerprint 和选区 quote。用户切换 panel 不改变其归属。
- 每个 Text 的当前 head 最多有一个 active DraftSession；重复打开返回同一个草稿。
- 输入即时更新本地 working body；外层按顺序把 splice 自动保存到服务器。服务器成功响应才推进 authoritative generation，显式“保存新版本”只负责 commit。
- DraftSummary 必须区分 `saved | saving | unsaved | failed | offline`，显示 base revision、authoritative generation 和待确认 edit 数。存在待确认或失败 edit 时禁用 commit、Agent invoke、规则/critic proposal 和 undo/redo。
- autosave timeout、网络错误或 5xx 时，外层保留 working body、选区和待确认队列，提供重试、复制正文与显式放弃。刷新和离页前必须阻止无提示丢失；实现可以把队列按 user/text/draft 身份写入 browser-local 恢复存储，成功确认、显式放弃或退出登录后删除。
- revealed head 刷新后恢复服务器 DraftSession；如有同身份 browser-local 待确认队列，明确提示恢复并从 authoritative generation 串行重放。不得把本地 generation 伪装成服务器事实。
- write 只基于当前 head 创建 DraftSession。任意历史 base 请求继续返回 409。

盲评 annotation 请求也使用 browser-local pending intent：按 user/revision/target/quote 保存 note，显示未保存、重试和放弃；服务器成功返回 `AnnotationDto` 后才清除。target 或 quote 失配时禁止重放并要求重新选择。评分或 annotation 尚未确认时，刷新和离页必须提示，不能静默丢弃。

## 6. Workspace 查询模型

组件不直接消费 Prisma 或 wire DTO。页面 adapter 把 `WorkspaceSnapshotDto`、当前 head、DraftSession 和 DisplaySettings 投影为：

```ts
type WorkspaceStage = "blind-review" | "inspect-edit";

type WorkspaceQuery = {
    text: TextHeader;
    stage: WorkspaceStage;
    currentRevision: RevisionView;
    headRevisionId: string;
    draft: DraftSummary | null;
    operations: OperationSummary[];
    d5Evaluations: ReadonlyArray<D5Evaluation>;
    currentD5Evaluation: D5Evaluation | null;
    blindReviewSkips: ReadonlyArray<BlindReviewSkipDto>;
    capabilities: WorkspaceCapabilities;
};
```

`stage` 由当前 revision 的 reveal 状态派生：hidden 为 `blind-review`，revealed 为 `inspect-edit`。页面不得用本地步骤变量覆盖服务器 reveal 事实。

`RevisionView` 至少包含 immutable identity、ordinal、parent、body、createdAt、transition、reveal、当前用户 judgment/annotation、机器通道、Agent invocation 摘要和 canonical D5 projection。hidden projection 中机器字段为空且不泄露 operation。

缺失、不适用、运行中、失败和数值 0 是不同状态；任何面板不得把 `null` 渲染成 0。

## 7. 命令顺序

blind-review 的合法离开路径只有：

```text
submit-blind-judgment(revisionId, fields)
  → success
  → reveal-revision(revisionId)

skip-blind-judgment(revisionId)
  → success
  → reveal-revision(revisionId)
```

inspect-edit 的保存路径：

```text
open-draft(headRevisionId)
  → apply edits / proposals
  → commit-draft(draftSessionId, generation)
  → select returned revision
  → stage = blind-review
```

流程 orchestrator 可以串联命令，但每一步仍是可审计服务器事实。组件只能发语义命令，不能直接 `$fetch` 或调用兄弟组件 ref。

## 8. 多 detector

- Workspace 可以返回多个 detector/run；总览逐项显示 identity、状态和 docPAi。
- 正文一次只绘制一张明确选择的热力图。
- 没有 revision 级用户选择时，可以选择服务器 primary detector；禁止按数组第一项猜测。
- 切换热力图只改变显示，不重跑 detector，不改变 D5 primary policy。
- identity 不同的结果不混算、不叠图、不画同一趋势。

## 9. 加载、刷新与失败

- 首次加载根据 head reveal 直接恢复阶段，不重新播放过渡动画。
- hidden head 刷新后仍在 blind-review，不隐式 reveal、retry 或 invoke。
- revealed head 刷新后恢复 inspect-edit；有持久草稿时明确提示恢复。
- judgment、annotation、reveal、draft 和 operation 使用各自错误状态；单项失败不清空正文。autosave 或 pending annotation 失败必须保留本地工作副本并提供重试/复制/放弃。
- 新 Revision 创建成功后自动选择并进入 blind-review；不存在“保存成功但继续展示旧版检测结果”的中间态。
- 旧 snapshotVersion、旧 DraftSession generation、旧 Operation version 和错误 revision identity 都不能覆盖当前投影。

窄屏保留选中的 panel id，但 sheet 另有 session-local `open/closed` 状态和 `close-work-panel-sheet` 命令。sheet 必须有可访问名称和可见关闭按钮，支持 Escape；模态呈现时锁定背景滚动并约束焦点，关闭后把焦点还给触发控件，同时保持正文滚动位置、selection、revision、draft 和 overlay identity。backdrop 是否关闭必须与显式放弃等破坏性动作无关。

## 10. 明确延后

本轮不设计或实现：

- 历史 revision 浏览。
- revision 选择器。
- parent/rev0/任意 baseline 比较。
- Revisions 面板的具体内容。
- 左右双栏 diff。

未来版本比较采用正文内联 diff，具体交互另立 Draft spec。

## 11. 验收

1. 每个 revision 都从 blind-review 开始；提交评价或 skip 后才能 reveal。
2. blind-review 正文居中、只读、可选区评价；页面和网络无机器信息。
3. reveal 后同一正文表面移到左侧，右侧总览、规则和 Agent 面板可用。
4. 多 detector 全部可见，正文只显示明确选择的一张热力图。
5. 打开草稿后，人工、规则和 Agent 修改归属同一 DraftSession；自动保存成功后刷新可恢复，失败时 working body 和待确认队列不丢失。
6. 同一 head 不能产生两个互相竞争的 active draft；并发 generation 写入至多一个成功。
7. 保存新 revision 后自动选择新版本并回到 blind-review。
8. 第一轮界面没有历史选择器、Revisions 空 tab 或版本比较入口。
9. `study-assignment` 只保留复用边界；独立授权/API 合同 Accepted 前不实现 participant 路由。
10. 窄屏 sheet 可用键盘关闭，焦点和正文滚动位置可恢复。
11. uploaded 评价可以进入获许可的 reviewer/规则研究制品，但不能冒充 D1 ground truth。