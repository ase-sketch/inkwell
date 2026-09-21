# Web 检测工作台现状基线

> 状态：Snapshot。记录 2026-08-15 的代码事实，不是目标规格。  
> 用途：重构时判断哪些能力必须迁移、哪些偶然行为不应继续。

## 1. 当前流程

当前 `/contribute` 同时承担入口、上传、盲评、工作区、完成页和历史恢复：

```text
NeuroBook OAuth
  → /contribute draft
  → POST /api/texts
  → Text + rev0 + 同步 MachineScan，机器数据先藏
  → workspace 盲评或跳过
  → POST /api/revisions/:id/reveal
  → 报告、命中、AI 改写、revision 切换
  → 保存草稿为新 Revision
  → 新 Revision 揭示、复评、D5
  → done
```

历史记录经 `GET /api/texts/:id/workspace` 一次恢复全部 revision、当前用户 judgment、annotation 和已揭示机器数据。历史恢复本身不启动新的 Agent 或 detector，符合 I20。

## 2. 已实现能力

| 用户能力 | 状态 | 当前实现 |
| --- | --- | --- |
| OAuth 登录 | 已实现 | `app/middleware/auth.global.ts` + server auth |
| 粘贴正文 | 已实现 | `/contribute` textarea，最多 60000 字符 |
| 自述来源 | 已实现 | `declaredProvenance` |
| 可见性 | 已实现 | `private/public` |
| 题材、体裁、作品名 | 已实现 | `genre/textType/sourceNote`；尚无上传 UI 的 POV |
| 上传并创建 rev0 | 已实现 | `POST /api/texts` |
| 先算后藏 | 已实现 | `revealedAt` + reveal/machine 服务器闸门 |
| revision 切换 | 已实现 | 线性 revision 条；旧版只读，head 可编辑 |
| 检测总览 | 已实现 | `ReportPanel.vue` |
| 静态命中 | 部分实现 | Web `MachineScan` 只含 regex+handler；CLI 完整能力更多 |
| 外部 AI 率和热力图 | 已实现但单源 | UI 默认取 `detects[0]`，多 detector 选择未定义 |
| LLM 动态规则检测 | 已实现 | `MachineLlmReview` + Agent session |
| 修订差异 | 已实现 | `RepairPlan`、diff、`provenanceJson` |
| Agent 对话 | 已实现 | snapshot 真相源 + SSE 增量 + retry/abort |
| Span 标注 | 已实现 | revision UTF-16 坐标；草稿先反映射到 head |
| 历史恢复 | 已实现 | workspace 全量 payload + hydrate |
| 公开竞技场 | 未实现 | `/style-review` 仍是私有固定题库 |
| 作者/评委进化 | 未实现 | 只有 proposed 文档 |

## 3. 当前页面和数据边界

### 页面宿主

`web/app/pages/contribute.vue` 约 1205 行，持有：

- `draft | workspace | done` 页面状态。
- revision 数组和 `activeOrdinal`。
- 全局 `revealed`。
- 上传表单。
- 本地扫描、过滤和规则选择。
- detector 轮询和重试/取消。
- Agent session、SSE、草稿应用和 stale 处理。
- 分栏宽度、右 tab、通知和完成态。

### 编辑器链

```text
contribute.vue
  → TextPanel.vue（约 20 个 defineExpose 命令）
      → ReviewEditor.vue
```

`TextPanel` 内部 `RepairPlan` 是草稿和 edit provenance 的真正状态；页面的 `editDraft` 是镜像。提交 revision 时页面同时读取镜像正文和 `TextPanel.getRepairEdits()`。如果编辑器实例不可用，正文仍可能提交，但 `provenanceJson` 会缺失。

图中的 `TextPanel.vue（约 20 个 defineExpose 命令）` 是 2026-08-15 的现状盘点数字，不是目标 API。它说明宿主与编辑器之间存在高耦合；Accepted 目标是由 DraftSession、Workspace query 和 command bus 承担跨组件通信，迁移期 adapter 可以暂时包裹旧 expose，但新面板不得依赖这些命令式入口。

### 服务器事实

- `Text`：所有权、来源、分类、可见性和 consent。
- `Revision`：不可变正文、ordinal、parent、transition、provenance 和 reveal。
- `DocJudgment`：当前用户对 revision 的整行覆盖式人类判断。
- `MachineScan`、`MachineDetect`、`MachineLlmReview`：三种独立机器断言。
- `AgentInvocation.revisionId`：每次 Agent 运行的 revision 归属真相。

## 4. 重构必须保留的不变量

1. rev0 创建时服务器计算机器结果，但 reveal 前 API 不返回机器结果。
2. `blind` 由 judgment 写入时的 `revealedAt` 派生，客户端不提交。
3. 机器断言只由服务器写。
4. Revision 正文不可变；草稿保存后产生新 revision。
5. ordinal 在 Text 内单调增加；revision 选择使用 id，不把 ordinal 当全局 id。
6. 历史恢复不隐式启动 detector 或 Agent。
7. 每次 Agent invocation 的 revision 归属以 invocation 记录为准，不以 session 当前指针倒推。
8. Span 持久化使用对应 revision 的 UTF-16 半开区间。
9. rev_k 的 D5 与固定 rev0 比较。目标合同要求外部 detector 的 name、version、chunkChars、aggregationVersion 全同才可比；当前 `MachineDetect` 尚无 aggregationVersion，这是迁移缺口，不能把历史三元组当成完整 identity。
10. reviewer 预测不得混入 `DocJudgment`。

## 5. 当前结构风险

### 5.1 页面是业务状态总线

上传、选择、检测、草稿、Agent 和布局状态都由 `contribute.vue` 协调。一个异步结果到达时，页面必须同时判断当前 Text、revision、tab、草稿和 epoch，容易出现跨文档或跨版本写错投影。

### 5.2 草稿有两个可观察表示

`RepairPlan` 是真相，`editDraft` 是镜像；父页面却需要通过 expose 读取 plan。组件是否挂载会影响 provenance 完整性，这是错误的状态所有权。

### 5.3 revision 与 Agent session 关系容易倒推错

服务器已经用 `AgentInvocation.revisionId` 固定每次运行归属，但前端仍有从 revision 数组查最后 session 的逻辑。切版本、恢复历史和运行中返回结果时需要多层防御。

### 5.4 异步代数分散

Detector 使用 `detectEpoch`，Agent 使用另一套 refresh generation，部分刷新只靠 revisionId 查找防御。没有统一的 operation identity 和 stale result 处理合同。

### 5.5 组件通过命令式 expose 耦合

宿主必须知道编辑器内部几十个动作；报告、命中和 Agent 无法只依赖稳定命令总线。编辑器替换会迫使整个页面重写。

### 5.6 人类判断语义开始碰撞

工作台 judgment 依据 reveal 派生 blind；私有 `/style-review` 强制写 blind。两条通路复用 `DocJudgment` 时可能被 hydrate 误认成同一类基线。未来 Arena 需要显式 study/assignment/pair 语义，不能继续靠隐含调用路径区分。

## 6. 目标规格的迁移方向

- `/contribute` 只保留检测工作台入口和历史 Text 列表。
- `/workbench/:textId` 成为可深链、可恢复的评判工作区。
- 每个 head revision 先进入 `blind-review`，完成 judgment 或 skip 后 reveal，再进入 `inspect-edit`。
- `DocumentEditorSurface` 统一承载 immutable revision 的只读评价和 DraftSession 的修改；阶段状态留在外层。
- WorkspaceStore 持有服务器快照、head、stage、panel 和 operation registry。
- 未提交草稿由唯一 active DraftSession 持有并自动保存；正文与 edit provenance 原子 commit。
- 第一轮只渲染 Overview、Rules 和 Agent；历史 revision 浏览与比较延后。
- Web API 返回 revision 级、来源明确的 machine records；多 detector 逐项显示，正文不再用数组第一项决定热力图。
- E2E 验证每版盲评、每版 reveal、DraftSession、commit 后回到 blind-review 和异步归属。

目标规格见：

- [`../web/detection-workbench-journey.md`](../web/detection-workbench-journey.md)
- [`../web/assessment-workspace.md`](../web/assessment-workspace.md)
- [`../web/document-editor-surface.md`](../web/document-editor-surface.md)
- [`../web/work-panels.md`](../web/work-panels.md)
- [`../web/workspace-state-and-commands.md`](../web/workspace-state-and-commands.md)

[旧 `revision-reader.md`](../web/revision-reader.md) 已被统一正文组件草案取代，仅作历史参考。