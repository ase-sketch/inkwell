# 第一轮架构决策清单

> 状态：Accepted（2026-08-16）。14 项决策全部接受推荐选项；本文件保留选项、理由和后续迁移约束，作为决策记录。

## 接受结果

2026-08-16，用户接受全部推荐选项。以下结果是目标合同的唯一决策状态；本文件中的其他选项和“选错代价”保留为决策记录：

| 决策 | 接受选项 | 直接落点 |
| --- | --- | --- |
| 1 | A：入口与长期工作区拆路由 | `detection-workbench-journey.md` |
| 2 | A：四个固定 tab，超宽屏再 pin | `assessment-workspace.md` |
| 3 | A：评判工作区 / 检测工作台入口 | `README.md`、`assessment-workspace.md` |
| 4 | A：第一版单一线性 head | `assessment-workspace.md`、`workspace-api-contract.md` |
| 5 | A：版本化 AI 风险参考分，不等同质量 | `work-panels.md` |
| 6 | A：持久化显式 skip，不造空 judgment | `workspace-api-contract.md`、E2E |
| 7 | A：`ReviewerPrediction` 独立于人类 judgment | `artifact-contracts.md`、`evolution-lab-boundary.md` |
| 8 | A：窄 `contracts/` + 无领域语义 model runtime | `system-boundaries.md` |
| 9 | A：一次选择一个明确 detector run | `work-panels.md`、`document-editor-surface.md` |
| 10 | A：Chromium E2E 作为重构合并门槛 | `detection-workbench-e2e.md` |
| 11 | A：按用户 × assignment/revision 记录 Arena exposure | `workspace-api-contract.md`、独立 Arena API |
| 12 | A：固定版本化 primary detector，缺失为 indeterminate | `d5-evaluation-contract.md` |
| 13 | A：system curator、private、三许可独立 | `artifact-contracts.md` |
| 14 | A：版本化 withdrawal list + consumer ledger | `artifact-contracts.md` |

## 第二轮前端旅程补充（2026-08-16）

用户确认以下决定，它们覆盖第一轮中与之冲突的首版 UI 范围，但不推翻四系统边界和 14 项架构决策：

1. 每个 revision 都经历 `blind-review → inspect-edit`；候选版也在机器揭示前盲评。
2. blind-review 是整页阶段：正文居中、只读、可选区评价；评分入口可以是隐藏右侧面板。
3. blind-review 可被 owner 工作区和未来 study assignment 复用，但 exposure、权限和 API 分开。
4. inspect-edit 中正文移到左侧，右侧显示 Overview、Rules 和 Agent。
5. 多 detector 全部列出，正文一次只显示一个明确 run 的热力图。
6. 历史浏览、Revisions 面板和跨版本比较延后；未来比较使用正文内联 diff。
7. immutable revision 与 DraftSession draft 复用 `DocumentEditorSurface`；组件合同已确认并标为 Accepted。
8. D5 升为 `d5-owner-v2`：baseline 和 candidate 的 owner judgment 都必须 blind。

## 决策 1：上传入口和长期工作区是否拆成两个路由

**背景**：当前 `/contribute` 同时承担上传、盲评、工作区、完成和历史恢复，页面状态过多；刷新恢复依赖同一个巨型宿主。

**选项**：

- **A. `/contribute` + `/workbench/:textId`**：上传后进入稳定 Text URL；入口和工作区生命周期分开。
- B. 继续单路由：实现变动小，但页面仍要承担所有状态和恢复。

**建议**：A。稳定 URL 是 revision 深链、刷新恢复、四面板解耦和 E2E 的共同前提。

**选错代价**：中。后续再拆会同时改路由、状态恢复和 E2E；现在拍板成本最低。

## 决策 2：四个工作面板是同时并排，还是同一侧栏切换

**背景**：用户描述“分为多列”，但常规桌面同时放阅读器和四列会让正文失去可读宽度。

**选项**：

- **A. 一个工作面板区域，四个固定 tab；超宽屏后续允许 pin 第二面板**：正文稳定，组件 API 仍完全解耦。
- B. 四列同时并排：信息同时可见，但 1440px 甚至 1920px 下都容易拥挤。
- C. 用户自由拼接任意布局：最灵活，但第一版布局、持久化和响应式成本最高。

**建议**：A。这里把“多列”解释成四个职责列，而不是强制四列同时出现。

**选错代价**：低。只要 panel API 不依赖布局，后续可增加 pin 或自由布局。

## 决策 3：主界面的正式名称

**背景**：“评判界面”容易与人类 judgment 混淆；“检测工作台”又同时指上传入口和主界面。

**选项**：

- **A. 产品中文名使用“评判工作区”，入口叫“检测工作台入口”**：区分入口和长期工作区。
- B. 主界面也叫“检测工作台”：用户容易理解，但文档中入口/工作区需要额外限定。
- C. “校样工作区”：更像编辑部，但可能让人误以为只做人工校对。

**建议**：A。展示文案可以在不改变代码 key 的前提下调整；代码 key 使用 `assessment-workspace`。

**选错代价**：低。展示名易改；代码 key 一旦扩散后改名成本中等。

## 决策 4：是否允许从历史 revision 创建分支

**背景**：当前 Web、I19 和 AgentSession 都按单一线性 lineage 工作。`parentId` 在存储上能指向任意版本，但这不等于系统已经定义了 branch、多个 head、分支选择和跨分支 Agent session。进化候选可以留在 evolution，或作为独立 generated Text 导入，不要求 Web revision 分支。

**选项**：

- **A. 第一版维持线性 lineage**：新 revision 必须是当前 head 的直接子版；每个 Text 只有一个 head，AgentSession 沿直接子版串行推进。
- B. 引入完整 branch 模型：新增稳定 `branchId`、每个 branch 的 head、当前 branch 选择、branch-scoped AgentSession；D5 仍按 rev0 与明确候选 revision 计算。
- C. 只放宽 `parentId` 而不建 branch identity：实现最少，但“head”会变成按 ordinal 猜测，禁止采用。

**建议**：A。当前用户旅程、评判工作区和 writer→critic 顺序链都不需要分支；等出现真实的 Web 并行改稿需求后，再用 B 的完整模型迁移。

**选错代价**：高。C 会立刻破坏 head、AgentSession 推进和历史恢复；B 可逆但会显著增加 UI、API 和 E2E 范围。

## 决策 5：总览是否显示综合 AI 风险参考分

**背景**：用户希望第一眼知道文章打分；但规则密度、外部 P(AI)、LLM 风险和人类可读性不是同一指标。

**选项**：

- **A. 显示版本化“AI 风险参考分”，同时同屏展示三个原始通道和覆盖状态**：直观但不伪装成文章质量。
- B. 完全不显示综合分，只显示原始通道：最严谨，但用户第一眼需要自己解释多条指标。
- C. 合成“文章质量总分”：最直观，但统计语义错误，不采用。

**建议**：A。固定方向为“越高风险越大”，携带 `algorithmVersion` 和“风险不是质量”说明；`wantReadOn` 永远单列。

**选错代价**：中。综合分一旦成为排行榜或长期用户心智，公式改动会造成历史不可比。

## 决策 6：跳过 rev0 盲评是否持久化

**背景**：当前跳过只保存在前端流程内；刷新后无法知道用户是尚未选择还是已明确跳过。

**选项**：

- **A. 持久化显式 skip 事实，但不创建伪造的零分 judgment**：刷新后流程稳定，数据语义清楚。
- B. 不持久化：schema 不变，但刷新可能反复显示盲评门。
- C. 写一条全 null `DocJudgment` 代表跳过：查询方便，但与“judgment 至少一轴”合同冲突。

**建议**：A。wire contract 使用 `BlindReviewSkipDto` 和 `SkipBlindJudgmentRequest`；不得用零分或全 null judgment 代替。

**选错代价**：中。跳过语义以后会影响竞技场分配和 completion 统计。

## 决策 7：AI reviewer 预测的正式名称

**背景**：历史文档把 `LlmJudgment` 用作广义 LLM 机器断言；新生态又想用它表达预测人类评分，含义冲突。

**选项**：

- **A. 使用 `ReviewerPrediction`；`MachineLlmReview` 保留规则风险断言；`DocJudgment/PairJudgment` 只给人类**。
- B. 所有 LLM 输出共用 `LlmJudgment`，靠 type 字段区分：表少，但非法状态和误用空间更大。

**建议**：A。类型即边界，能直接防止 reviewer 预测混入人类真值。

**选错代价**：高。建表和 artifact 发布后再拆名需要迁移历史数据和所有消费者。

## 决策 8：是否建立根级 `contracts/` 和共享 model runtime

**背景**：Web 现在通过 alias 反向 import evals 的 taxonomy、model client 和 detector helper，目标边界不干净。

**选项**：

- **A. 建两个窄共享层**：`contracts/` 只含 schema、稳定键、指纹；model runtime 只含 transport、重试、限流和 usage。
- B. Web 继续 import evals 内部模块：短期少迁移，但 evals 无法独立演进。
- C. 全部复制到 Web/evolution：边界清楚，但关键指纹和 taxonomy 会漂移。

**建议**：A。只在实现任务有真实消费者时抽取，不先造大型平台包。

**选错代价**：中高。继续反向依赖会让进化系统成为第三个复制/alias 消费者。

## 决策 9：多 detector 热力图如何展示

**背景**：当前阅读器只拿 `detects[0]`，数据模型实际允许同 revision 多个 detector/version/chunk 口径。

**选项**：

- **A. 一次选择一个明确 detector run；总览列出全部通道**：没有伪合并，交互清楚。
- B. 多 detector 热力叠加：信息密度高，但颜色和概率含义难解释。
- C. 固定一个“官方 detector”：简单，但隐藏了历史和未来 detector。

**建议**：A。选择按 revision 保存；不同 identity 不计算趋势差。

**选错代价**：中。若先把第一项当默认真相，之后的数据顺序变化会改变用户看到的结果。

## 决策 10：浏览器 E2E 是否成为重构合并门槛

**背景**：现仓没有 Playwright runner，OAuth、HTTP API、D2 和整个浏览器工作区都没有端到端自动化；CI 只 typecheck/build。

**选项**：

- **A. 引入 `@playwright/test`，Chromium 主流程成为工作区重构合并门槛**。
- B. 继续一次性浏览器脚本和手工验收：前期快，但 bug 会继续集中在跨层交互。
- C. 只补组件/纯函数测试：定位快，但无法证明真实 session、API、数据库和页面协同。

**建议**：A。外部 OAuth、LLM、detector 使用本地 fake；Nuxt、SQLite、session、API 和浏览器行为真实运行。

**选错代价**：高。没有 E2E 时，大规模编辑器/工作区重构没有可交付证明。

## 决策 11：众评和 Arena 如何记录每位评委的揭示状态

**背景**：owner 工作台的 `Revision.revealedAt` 只表示机器结果是否已经向正文所有者揭示。公共正文可能由多人分别盲评，不能共用一个 revision 级时间戳判定所有人的 blind。

**选项**：

- **A. 在 `ArenaAssignment` 或独立 exposure 表记录 per（用户 × assignment/revision）揭示状态**；owner 工作台继续使用 `Revision.revealedAt`。
- B. 公共正文首次被任何人 reveal 后，所有后续评分都算非盲：实现简单，但会错误污染其他参与者的盲评。
- C. 所有竞技场评分强制写 `blind=true`：无法审计实际揭示，也不能支持评分后查看报告。

**建议**：A。两条流程的受众不同，类型上分开才能保证 blind 语义。

**选错代价**：高。盲评数据一旦混入训练集，事后无法从单个 revision 时间戳恢复每位参与者是否已看过机器结果。

## 决策 12：D5 使用哪个 primary detector 和缺失规则

**背景**：D5 需要一个稳定机器腿。若多 detector 任取最好结果、把静态命中当降级替代，或把缺数据当通过，同一改稿会得到不同结论。

**选项**：

- **A. owner D5 v1 固定一个版本化 primary DetectorIdentity**：四元组相同才比较，缺失即 `indeterminate`；其他 detector 和静态命中只作诊断。
- B. 任一 detector 下降就通过：容易选择性报告，且 detector 数量变化会改变历史结论。
- C. 所有 detector 都下降才通过：更保守，但新接一个不稳定 detector 会让全部历史不可验收。

**建议**：A。primary policy 单独版本化；更严格的多检测器协议以后升 D5 algorithm version。

**选错代价**：高。D5 是产品验收结果，算法漂移会直接破坏历史可比性。

## 决策 13：GeneratedCorpus 的 system owner 与撤回策略

**背景**：evolution 生成稿导入 Web 后必须有 owner、默认可见性和许可记录。若直接归管理员或复用一个 consent，用户权限和研究导出都会失真。

**选项**：

- **A. 使用专用 system curator owner，默认 private，三项许可独立保存；tombstone 立即停止展示和新导出，物理删除按 retention policy 执行**。
- B. 归执行导入的管理员：操作简单，但管理员离职/禁用会改变系统资产语义，也会把人类行为和系统 provenance 混在一起。
- C. 无 owner 的特殊 Text：需要大量 nullable 外键和权限分支，非法状态增多。

**建议**：A。system curator 不能交互登录；每次导入和撤回都写 append-only ledger。

**选错代价**：高。数据一旦公开或进入 reviewer 校准，缺失许可来源和撤回链无法事后可靠补齐。

## 决策 14：已分发 artifact 撤回后如何停止继续使用

**背景**：撤回只能阻止未来使用，无法让已经下载的副本凭空消失。若 Web 与 evolution 不共享撤回清单和处理回执，同一正文会在一处已撤回、另一处仍进入校准或训练。

**选项**：

- **A. producer 发布版本化撤回清单；所有 consumer 保存处理 ledger，并在每次展示、校准、研究、训练和再导出前同步。历史报告只保留 fingerprint 与撤回标记，正文隔离；物理删除期限和备份例外由部署级 retention policy 明确配置。**
- B. producer 只发一次通知，由 consumer 尽力处理：实现较轻，但无法证明哪份数据仍在被使用。
- C. artifact 一经导出不可撤回：最简单，但不符合当前三项许可可撤回的产品语义。

**建议**：A。在此合同 Accepted 且两端实现前，GeneratedCorpus 只进入管理员隔离区，不得公开、校准、训练或再导出。

**选错代价**：高且部分不可逆。已经进入模型训练或第三方副本的正文通常无法可靠删除，只能停止未来使用并保留审计证据。

## 已接受决策顺序

以下顺序用于实施优先级；14 项决策均已接受：

1. 决策 7：ReviewerPrediction 命名和人类真值边界。
2. 决策 11：众评/Arena 的 per-user exposure。
3. 决策 13、14：GeneratedCorpus 的 owner、许可和撤回传播。
4. 决策 4：revision 保持线性或引入完整 branch。
5. 决策 8：跨系统共享层。
6. 决策 1：路由拆分。
7. 决策 6：盲评 skip 持久化。
8. 决策 5、9、12：报告、热力图和 D5 primary detector。
9. 决策 2、3：布局和产品命名。
10. 决策 10：E2E 合并门槛。

接受结果已记录；实现任务不得重新选择 B/C，除非新增决策并把受影响 spec 标为 `Superseded` 或新版本。