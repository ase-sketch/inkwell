# 架构规范体系与评判工作区设计

> 状态：第二轮前端旅程与 `DocumentEditorSurface` 组件合同已 Accepted；实现尚未开始。  
> 日期：2026-08-16。  
> 规范入口：[`docs/specs/README.md`](../../docs/specs/README.md)。

## User Request / Topic

本任务停止作者/评委生态的继续实现，转入 spec-first 架构设计。用户要求：

1. 规范先存入 `docs/`，后续代码按已拍板规范执行。
2. 设计 Web、llmlint evals 规则评测程序和新遗传/进化系统的总体架构。
3. 优先重构最影响体验的检测工作台“评判界面”。
4. 用户旅程从登录、上传正文和自述字段开始，进入正文阅读器 + revision + 检测/修订/Agent 工作面板。
5. 阅读器 read mode 支持规则命中、AI 率热力图和人类改稿式修订；write mode 等后续设计。
6. 拆分多个 spec，先确定组件 API 和状态边界，再实现。
7. 并行阅读现有代码和文档，形成当前状态功能文档。

## Goal

建立状态清楚、可以直接约束实现的规范体系，并继续推进第二轮前端设计：

- 四个系统边界和跨系统 artifact 合同。
- 检测工作台入口与稳定工作区路由。
- 每个 revision 的 `blind-review → inspect-edit` 两阶段旅程。
- owner 与 study assignment 的盲评 UI 复用和数据隔离。
- Workspace state、DraftSession、operation 和 command bus。
- 总览、规则、Agent 三个首轮面板与多 detector 选择。
- `DocumentEditorSurface` 组件 API Accepted 合同。
- 浏览器 E2E 验收。
- evals 和 evolution 的独立边界。
- 集中式架构决策记录。

本任务不改业务代码、不实现编辑器、不创建数据库 migration、不运行真实模型。

## Current State / 调查事实

### Web

- `/contribute` 已实现上传、盲评/reveal、版本化工作台、历史恢复、报告、命中、热力图、Agent 改写和复评。
- `web/app/pages/contribute.vue` 约 1205 行，持有上传、revision、selection、异步 detector、Agent、草稿和布局状态。
- `TextPanel` 内 `RepairPlan` 是草稿真相，页面 `editDraft` 是镜像；提交时页面通过命令式 expose 再取 edit provenance。
- 当前热力图默认消费 `detects[0]`，多 detector 选择无合同。
- 当前 `/style-review` 只服务私有固定题库；公开 Arena 尚未实现。

详见 [`docs/specs/current-state/web-workbench.md`](../../docs/specs/current-state/web-workbench.md)。

### evals

- `evals/METHODOLOGY.md` 是方法论真相源；evals 负责规则判别、holdout、guide/profile 实验，不负责 reviewer 或作者淘汰。
- evals 单向消费 `skill` 扫描 API；`skill` 不依赖 evals。
- Web 当前通过 Nuxt alias 反向 import evals 的 taxonomy、model client 和 detector helper，是目标架构需要清理的依赖。
- Web、evals、CLI 的扫描 capabilities 不同，不能只按 `engineVersion` 比较。

### 测试

- 现有测试主要是纯函数、Agent adapter 和少量 composable；Web HTTP handler 大面积无测试。
- 仓库没有 `@playwright/test`、Playwright config 或浏览器 E2E。
- CI 只 typecheck/build，不运行工作区用户旅程。
- OAuth、外部 detector 和 LLM 适合本地 fake；Nuxt、SQLite、session、API 和浏览器交互必须真实。

## Architecture Decision / 当前基线

第一轮 14 项架构决策继续有效。2026-08-16 第二轮前端旅程增加以下 Accepted 合同：

1. 每个 revision 都先 `blind-review`，提交 blind judgment 或显式 skip 后才 reveal。
2. blind-review 正文居中、只读、可选区评价；评分入口可以折叠为隐藏右侧面板。
3. reveal 后进入 `inspect-edit`：正文移到左侧，右侧首轮显示 Overview、Rules、Agent。
4. 多 detector 全部列出，正文一次只显示一个明确 run 的热力图。
5. owner 与 study assignment 复用正文和评分 intent，exposure、权限和 API 分开。
6. 历史浏览、Revisions 面板和跨版本比较延后；未来比较采用正文内联 diff。
7. D5 升为 `d5-owner-v2`，baseline 和 candidate 的 owner judgment 都要求 blind。
8. `DocumentEditorSurface` 统一 revision 只读与 DraftSession 编辑；模式、选区菜单、编辑输入、suggestion 交互和热力图选择已确认。

Accepted 基线的后续变更必须新增版本或将受影响 spec 标为 `Superseded`。

## Spec Files

- `docs/specs/README.md`
- `docs/specs/open-decisions.md`
- `docs/specs/current-state/web-workbench.md`
- `docs/specs/architecture/system-boundaries.md`
- `docs/specs/architecture/artifact-contracts.md`
- `docs/specs/web/detection-workbench-journey.md`
- `docs/specs/web/assessment-workspace.md`
- `docs/specs/web/workspace-api-contract.md`
- `docs/specs/web/d5-evaluation-contract.md`
- `docs/specs/web/revision-reader.md`
- `docs/specs/web/document-editor-surface.md`
- `docs/specs/web/work-panels.md`
- `docs/specs/web/workspace-state-and-commands.md`
- `docs/specs/evals/evaluation-lab-boundary.md`
- `docs/specs/evolution/evolution-lab-boundary.md`
- `docs/specs/testing/detection-workbench-e2e.md`

## Verification

本任务只有文档变更，不运行代码测试。第二轮定版后并行派发状态/API、编辑器、盲评安全、验收覆盖和体验交互五个审查视角；其中四份形成可证报告，一份因仓库路径切换中断、未取得正文证据，未计为通过。

审查后修正 D2 DOM/SSE/公开版本侧信道、D5 trusted-anchor hard failure、Draft working body 与 autosave 失败恢复、static suggestion/undo/redo/Agent proposal 命令、Agent generation/fingerprint 锚定、Operation 单调 version、discard/reveal 幂等、窄屏 sheet 可访问性和 study-assignment 实现门禁。E2E 从 12 个场景扩展到 15 个，覆盖并发 Draft、乱序响应、UTF-16/IME、proposal 反串和 overlay 隔离。

- 扫描 `docs/specs/**/*.md` 与本文件，共 17 份 Markdown；相对链接、目标锚点、代码 fence 和重复标题均为零错误，E2E-01 至 E2E-15 编号连续。
- `WorkspaceQuery`、`WorkspaceStage`、`WorkspaceCommand`、`InitialWorkPanelId`、`WorkspaceSnapshotDto`、`DraftSessionDto`、`DraftWorkingState`、Operation 和正文组件核心类型均只有一个 canonical 定义位置。
- `llmlint check docs/specs .agents/tasks/25-architecture-specs/README.md --format json` 返回零 diagnostics、零命中。
- 业务代码尚未按第二轮合同迁移，因此不标 `Implemented`，不运行业务测试。

## Plan vs Result

- 原请求把项目描述为 Web、evals、遗传算法三块；调查后补出 `skill/` 规则运行时作为第四个共享内核。忽略它会让规则和扫描真相源继续被 Web/evals 复制。
- 用户称主界面“评判界面”；决策 3 已接受：正式术语是“评判工作区”，入口是“检测工作台入口”。
- 用户描述工作面板“分为多列”；决策 2 已接受：第一版是四个固定 tab，标准桌面一次激活一个面板，超宽屏 pin 是后续布局增强。
- write mode 按用户要求只锁定 DraftSession 边界，没有设计具体编辑器；决策 4 已接受第一版线性 head。
- 现状盘点暴露了 wire shape、D2 侧信道和异步竞态风险，因此新增 canonical Workspace API：hidden/revealed union、owner-first 鉴权、snapshotVersion、D5 transport 与 Operation identity。
- D5 第一轮建立 `d5-owner-v1` 的 server-only verified input、rev0 baseline、primary DetectorIdentity、canonical evaluation 和 `indeterminate` 原因；第二轮因 candidate 改为 reveal 前盲评，目标算法升级到 `d5-owner-v2`。
- 现有 provenance v1 无法追踪哪次 Agent/critic/static hit；目标合同升级为 v2 逐 edit ledger。v1 只读显示 `legacy-unattributed`，新 Revision 必须由服务器从 DraftSession generation 派生 v2。
- EngineIdentity 增加 scoringVersion，DetectorIdentity 增加 aggregationVersion；缺字段的现有记录都明确列为 schema 迁移差距。
- GeneratedCorpus 增加 system curator、三许可、withdrawal list/ledger；决策 14 已接受，但两端实现前只允许管理员隔离区验证，不得公开、校准、训练或再导出。

## 中文括号标注的规范化补充

- evals 中 `brief（无句子级文体）`、`render（同 brief 配对）`、`repair（单独角色）` 已展开到 `evaluation-lab-boundary.md §2.1`，分别约束输入内容、配对键和 lift/AUC 隔离。
- 架构盘点中的 `TextPanel.vue（约 20 个 defineExpose 命令）`记录的是 Snapshot 数字；迁移目标已写入 `current-state/web-workbench.md`，由 DraftSession/query/command bus 替代跨层 expose。
- Arena 的 `per（用户 × assignment/revision）` 已落为未来 `ArenaExposureDto` 的数据边界；独立 assignment 授权/API 合同 Accepted 前不实现 participant 路由，owner 的 `Revision.revealedAt` 不承担公共众评语义。
- E2E 的 `node-server（随机端口）` 已展开为每 worker 独立端口、数据库、cookie、缓存和 artifact 目录。

## 第二轮前端旅程 / Plan vs Result

- 原 spec 把 blind judgment 当 rev0 的 reveal 小闸门；用户确认每个 revision 都要完整经历首次阅读与盲评，可以 skip。
- 原 spec 把 Revision Reader 与 Draft Editor 分开；新方向复用一个 `DocumentEditorSurface`，外层按 immutable revision 或 DraftSession 控制能力。
- 原 spec 第一轮提供四个 panel 和历史选择；用户要求历史浏览与比较先不设计、不实现。首轮只显示 Overview、Rules 和 Agent。
- 用户确认未来比较采用正文内联 diff，左右双栏不进入目标。
- 候选 revision 改为 reveal 前盲评后，D5 输入语义发生变化；目标算法从 `d5-owner-v1` 升为 `d5-owner-v2`，旧 post judgment 不能冒充新证据。
- 现有 `HighlightedTextarea` 已有 UTF-16 选择和 overlay 背板，Tiptap preview 已停用。Accepted 组件合同选择受控纯文本底层，避免 Markdown DOM 与服务器 span 失配。
- owner 与未来 study assignment 只复用正文和评分 intent；独立 exposure/权限/API 合同 Accepted 前不实现 participant 路由。uploaded 评价可进入获许可的研究制品，但不能进入 D1 lift 真值。

## Next Implementation

按 stage/API → blind-review → inspect-edit panels → editor surface → DraftSession → E2E 的顺序实施。