# llmlint 架构与产品规格

> 状态：Accepted（第二轮前端旅程与组件合同，2026-08-16）。现状文件保持 `Snapshot`。

## 1. 目的

`docs/specs/` 保存跨任务、可供后续代码直接执行的规格。它回答“系统必须如何工作”，不记录某一轮任务的施工过程。

- 术语与领域不变量仍以 [`CONTEXT.md`](../../CONTEXT.md) 为真相源。
- `evals` 的统计方法与实验纪律仍以 [`evals/METHODOLOGY.md`](../../evals/METHODOLOGY.md) 为真相源。
- 已实施代码现状记录在 [`current-state/web-workbench.md`](current-state/web-workbench.md)，不能反向覆盖目标规格。
- 实施过程、计划出入和验证结果仍进入 `.agents/tasks/`。

## 2. 规范状态

| 状态 | 含义 | 对代码的约束 |
| --- | --- | --- |
| `Draft` | 正在讨论，允许重写 | 不约束实现 |
| `Snapshot` | 某一日期的实现事实基线 | 不约束目标；用于迁移盘点 |
| `Accepted` | 已拍板的目标合同 | 新代码必须遵守；旧代码需记录迁移差距 |
| `Implemented` | 已拍板且主要路径已验收 | 代码与规范冲突视为缺陷 |
| `Superseded` | 已被新规范取代 | 只作历史参考，必须链接替代文档 |

规范使用以下约束词：

- **必须 / 不得**：合同要求，违反即不符合规范。
- **应该 / 不应该**：推荐要求；偏离时必须在任务 walkthrough 记录理由。
- **可以**：允许但不要求。

只有标为 `Accepted` 或 `Implemented` 的“必须 / 不得”约束代码。

## 3. 文档地图

- [`open-decisions.md`](open-decisions.md)：第一轮已接受决策及第二轮前端旅程补充。

### 总体架构

1. [`architecture/system-boundaries.md`](architecture/system-boundaries.md)：规则运行时、Web、evals、进化实验室的边界和依赖方向。
2. [`architecture/artifact-contracts.md`](architecture/artifact-contracts.md)：跨边界制品、版本、指纹和导入导出纪律。
3. [`evals/evaluation-lab-boundary.md`](evals/evaluation-lab-boundary.md)：evals 的职责、输入输出和不可污染边界。
4. [`evolution/evolution-lab-boundary.md`](evolution/evolution-lab-boundary.md)：作者池、评委池和人工校准的系统边界。

### Web 检测工作台

1. [`web/detection-workbench-journey.md`](web/detection-workbench-journey.md)：上传后进入每版 blind-review 与 inspect-edit 的主旅程。
2. [`web/assessment-workspace.md`](web/assessment-workspace.md)：两阶段工作区外壳、布局、head 和 DraftSession 合同。
3. [`web/document-editor-surface.md`](web/document-editor-surface.md)：正文阅读、选区、批注、overlay 和编辑输入的 Draft 组件合同。
4. [`web/workspace-api-contract.md`](web/workspace-api-contract.md)：Workspace wire DTO、每版 reveal 闸门、operation 和主要端点合同。
5. [`web/d5-evaluation-contract.md`](web/d5-evaluation-contract.md)：`d5-owner-v2` 双盲人类腿、primary detector 和不可判状态。
6. [`web/work-panels.md`](web/work-panels.md)：inspect-edit 首轮总览、规则和 Agent 三个面板。
7. [`web/workspace-state-and-commands.md`](web/workspace-state-and-commands.md)：阶段、状态所有权、查询、命令和异步状态机。
8. [`testing/detection-workbench-e2e.md`](testing/detection-workbench-e2e.md)：两阶段端到端验收和测试边界。
9. [`web/revision-reader.md`](web/revision-reader.md)：已被统一正文编辑器表面取代的首轮历史规格。

### 现状基线

- [`current-state/web-workbench.md`](current-state/web-workbench.md)：目标规格制定时的现有功能、缺口和主要耦合。

## 4. 实施顺序

第二轮前端旅程与 `DocumentEditorSurface` 组件合同已接受。后续实现顺序：

1. Workspace adapter、stage selector 和每版 reveal API 闸门。
2. `blind-review` 外壳、评分抽屉和只读可评价正文。
3. `inspect-edit` 外壳与 Overview、Rules、Agent 三个面板。
4. 实现统一 `DocumentEditorSurface` 正文表面。
5. DraftSession 自动保存、proposal 和 commit 后回到 blind-review。
6. Chromium E2E 合并门槛。
7. 在真实消费者出现时抽取 `contracts/`/model runtime，并接入 evals/evolution artifact。

实现任务必须先读取对应 `Accepted` spec；迁移中的旧代码可暂时不符合，但任务 walkthrough 必须列出迁移差距和收口门槛。

## 5. 本轮术语约定

- **检测工作台入口**：用户上传正文和恢复历史 Text 的入口页面。
- **评判工作区**（`Assessment Workspace`）：owner 对每个 revision 完成 blind-review 和 inspect-edit 的主界面。
- **`blind-review`**：每个 revision 揭示机器结果前的首次阅读与盲评阶段；正文只读但可选区评价。
- **`inspect-edit`**：揭示后的查看与修改阶段；查看机器报告并通过 DraftSession 修改。
- **人类判定**（`Human Judgment`）：用户提交的评分或选择；AI reviewer 只能输出 prediction。
- **评测实验室**：`evals/` 中离线测量规则、模型和 guide 的程序，不是 Web 页面或阶段名。
- **进化实验室**：目标 `evolution/`，负责作者候选、评委候选和交替实验。
- **study assignment**：evals/evolution 通过 Web 发起人类评价的 assignment-scoped 流程；与 owner reveal 隔离。

`critic` 的早期“评分员”旧义必须在实现新系统前清理；新规范不得让一个名字同时代表修订者和评委。