# Codebase Cleanup

> Active task directory format: `NN-kebab-case-name/`. Archived tasks move to `docs/tasks/archived/<task-slug>/`.

## Relative documents refs

- [CONTEXT.md](../../CONTEXT.md)：NeuroBook 稳定领域术语，清理时优先使用 Project Workspace、Project Path、Project SQLite、IDE Mode、Agent Mode 等词。
- [PROJECT-STATUS.md](../../PROJECT-STATUS.md)：仓库级当前状态，重大清理后需要同步。
- [docs/tasks/56-world-engine/README.md](../56-world-engine/README.md)：World Engine 当前阶段收尾记录。
- [docs/tasks/59-world-engine-workbench-redesign/README.md](../59-world-engine-workbench-redesign/README.md)：三栏 Workbench 设计与后续体验打磨记录。
- [docs/tasks/61-world-engine-workbench-real-api/README.md](../61-world-engine-workbench-real-api/README.md)：真实 Workbench API 接入与 follow-up 记录。

## User Request / Topic

- 自主整理、清理代码，规范代码，清理屎山，整理文档。
- 新开一个 task。
- 工作流程：
  1. 从 git、tasks 等地方查看相关变更，或自由浏览项目。
  2. 分析、评估，列出一组问题。
  3. 如果问题复杂，对这些问题逐个深入评估，获取更多相关信息。
  4. 从系统角度制定计划。
  5. 修复。
  6. 回到第一条或者直接退出。
  7. 修改要注意功能不能和原有版本偏移；如果发现 bug 或复杂问题，不要顺手修，先记录下来；如果遇到难以决策的地方，也不要改，记录下来。
- 所有记录写入 walkthroughs。
- 符号命名问题先记录，不直接改名，后续等用户审批。
- 代码文件结构问题例如 utils 分层 / 拆分先记录，不直接移动文件或拆文件，后续等用户审批。

## Goal

对当前大规模 World Engine / 写作模式变更后的代码与文档做持续整理：识别浅 Module、过大的单文件、过时文档、重复逻辑和测试脆弱点，按风险从小到大逐轮修复，并把每轮证据、问题、决策、验证与后续 TODO 写入本 task walkthrough。

- Outcome：代码和文档更容易导航，关键 Module 的 Interface 更清晰，后续修改有更好的 Locality。
- Verification surface：每轮 walkthrough、相关静态搜索、必要的窄测试或类型检查。
- Constraints：不回滚用户已有变更；不做大补丁；不为清理而引入抽象；优先修当前证据证明的问题。
- Approval constraints：符号命名和文件结构规范化属于待审批事项；本 task 可以审计和提出方案，但不直接改名、移动文件或拆分 utils。
- Boundaries：优先整理 World Engine、主 IDE Workbench、Preview、写作模式入口和相关任务文档；其它模块只在证据强时进入。
- Iteration policy：每轮先审计，再选一个低风险、高收益问题修复；复杂问题先记录候选和设计，不直接拆大模块。
- Blocked stop condition：如果清理需要重写业务 Interface 或迁移大范围状态，但缺少产品决策，则停止在计划阶段并记录需要用户决策的问题。

## Continuation Status

- Status：Stage Complete。
- Round 8 曾按用户要求做阶段收尾；随后用户重新指定继续在 Task 66 内自主整理、清理、优化和重构代码，并推进到 Round 21 再次阶段收尾。
- 已完成成果：Workbench session / subject stats / review summary / empty state / world view filter / review queue focus / issue level / issue status label / review issue focus cleanup / latest slice by subject / saved edit filter preservation / unsaved draft labels / draft surface auto-open / saved slice subject filter visibility / Slice Composer subject selection / remaining draft selection 等纯规则下沉，并把一组 Workbench util 行为测试从入口源码字符串测试迁移到专用测试文件。
- 最新验证结果：2026-06-23 运行 `bunx vitest run app/utils/world-engine-ide-entry.test.ts app/utils/world-engine-workbench-real.test.ts app/utils/world-engine-workbench-preview.test.ts`，3 files / 20 tests passed。
- 最新只读核对：Round 22 确认 README / Round 21 / PROJECT-STATUS 的阶段完成状态一致，并校正收尾状态说明；Round 13 记录的 `world-engine-workbench-real.ts` 命名和文件结构候选仍等待用户审批。
- 当前策略：Round 21 按用户要求快速收尾；本 task 暂停继续抠边界，后续只在真实作者使用反馈、明确产品决策或用户重新开启清理任务时继续。

## Current State

- Worktree 当前有大量未提交变更，包含 World Engine、写作模式、Agent、Project Workspace 模板和任务文档；清理时必须避免误改无关用户变更。
- World Engine 阶段已在 [Round 425](../56-world-engine/walkthroughs/2026-06-23-round-425-stage-closeout-audit.md) 做主路径收尾审计。
- 代码体量热点：
  - `app/components/novel-ide/world-engine/WorldEngineWorkbenchDialog.vue`：约 2148 行。
  - `app/pages/world-engine.preview.vue`：约 1083 行。
  - `app/utils/world-engine-preview.ts`：约 782 行。
  - `app/utils/world-engine-workbench-real.ts`：约 899 行。
  - `app/utils/world-engine-workbench-preview-filter.ts`：约 107 行。
  - `app/utils/world-engine-ide-entry.test.ts`：约 1225 行，仍包含大量源码字符串断言。
  - `app/utils/world-engine-workbench-real.test.ts`：约 817 行，承接真实 Workbench util 行为测试。
  - `app/utils/world-engine-workbench-preview.test.ts`：约 1143 行，承接 preview / filter / 子组件静态与行为测试。
- 文档体量热点：
  - `docs/tasks/56-world-engine/README.md`：约 910 行，并且承担了大量历史 walkthrough 索引和 follow-up。
  - `docs/tasks/59-world-engine-workbench-redesign/README.md`：约 512 行。
  - `docs/tasks/61-world-engine-workbench-real-api/README.md`：约 468 行。

## Candidate Problems

1. **Workbench Dialog 是过深实现、过宽 Interface 的单文件 Module**
   - Files：`WorldEngineWorkbenchDialog.vue`、`world-engine-workbench-real.ts`、workbench-preview 子 Module。
   - Problem：真实 Workbench 的加载、筛选、草稿、确认、proposal、subject system sync、snapshot 和 slice composer 编排集中在一个 2000+ 行 Module；理解一个动作需要在大量 ref/computed/function/template 之间跳转。
   - Plan：先做只读切面分析，识别可稳定下沉的 session / API orchestration / draft state Module；不直接大拆。

2. **Preview 页面仍超过项目单文件约束**
   - Files：`app/pages/world-engine.preview.vue`、`WorldEnginePreview*` 子 Module、`world-engine-preview.ts`。
   - Problem：Preview 已拆一部分，但页面仍承担 Project/session/action 编排和 UI，继续扩展会降低 Locality。
   - Plan：优先评估是否能抽出 `useWorldEnginePreviewSession` 这类深 Module；如果只是一层 pass-through 就不抽。

3. **任务 README 仍混合“当前事实”和“历史流水账”**
   - Files：Task 56 / 59 / 61 README。
   - Problem：README 同时承担 current state、索引、旧 follow-up、历史结论，导致搜索结果噪音大，过时 line count / TODO 容易残留。
   - Plan：第一轮先校正明显过时状态；后续设计“README 放当前事实，walkthrough 放历史证据”的整理规则。

4. **Workbench 静态测试大量依赖源码字符串**
   - Files：`app/utils/world-engine-ide-entry.test.ts`、`app/utils/world-engine-workbench-preview.test.ts`。
   - Problem：测试对具体源码片段敏感，重构时容易因为无行为变化而失败，Interface 测试面不够深。
   - Plan：暂不大改测试；后续选 1-2 个 util 行为测试替代高噪声字符串断言。

5. **Project 删除 / old link 恢复语义分散在多个任务**
   - Files：Project Workspace delete 代码、Task 56 / 59 / 61、PROJECT-STATUS。
   - Problem：deleted marker、后台清理、旧链接 fallback 的当前合同分散在 walkthrough 中。
   - Plan：后续如继续整理，应沉淀到 `reference/workspace/` 或 Project Workspace reference，而不是继续堆 task README。

## Decisions / Discussion

- 第一轮不拆 `WorldEngineWorkbenchDialog.vue`。当前 worktree 很脏，直接大拆风险高，且会和已有未提交改动缠在一起。
- 第一轮先做文档规范化：把明显过时的 line count / follow-up 状态校正到当前事实，为后续真正拆 Module 留一个清晰起点。
- 第二轮和第三轮优先下沉 Workbench 内与 Vue 响应式状态无关的纯逻辑；只有删除测试证明复杂度会回流到调用方时才新增 util Module。
- 第三轮暂不抽请求编排 Module。`$fetch` pass-through 会是浅 Module，必须等 request token、busy/error/notice、状态回流规则能被同一个 Interface 收敛时再设计。
- 第四轮继续收拢 Workbench review issue 规则，把 overall / per-slice summary 下沉到 `world-engine-workbench-real.ts`，Dialog 只保留响应式组合。
- 第五轮把 Workbench 空时间线入口决策下沉到 `world-engine-workbench-real.ts`，因为它决定作者在无 slice / 待同步 / demo 不可用时看到的下一步动作。
- 第六轮把 `world-engine-ide-entry.test.ts` 中的 Workbench util 行为测试迁移到 `world-engine-workbench-real.test.ts`，入口测试继续只负责入口 wiring / 静态契约。
- 第七轮把 Workbench 当前视角过滤标签拼装下沉到 `world-engine-workbench-real.ts`；i18n 文案保留在 Dialog adapter，避免用户可见语言行为偏移。
- 收尾轮按用户要求停止继续抠边界，不新增代码重构；后续问题只作为 follow-up 记录，等待真实作者使用反馈或更明确的产品决策。
- 第九轮按用户重新开启的持续清理目标继续推进，把 Workbench review 队列当前焦点选择规则下沉到 `world-engine-workbench-real.ts`，避免 Dialog 持有 issueKey / subject attr / selected slice fallback 的优先级规则。
- 第十轮把保存后 slice 是否仍命中当前 subject 过滤的规则下沉到 `world-engine-workbench-real.ts`，避免 Dialog 持有 all/any subject filter 的可见性判断。
- 第十一轮把 Slice Composer 默认 subject 选择规则下沉到 `world-engine-workbench-real.ts`，保留未注册 subject 提示上下文，同时集中测试最终 fallback。
- 第十二轮按更新后的“bug / 复杂问题只记录不顺手修”约束继续推进，把删除 slice 后第一个剩余草稿选择规则下沉到 `world-engine-workbench-real.ts`。
- 第十三轮按更新后的“命名 / 文件结构问题先记录待审批”约束做只读审计，记录 `world-engine-workbench-real.ts` 的职责聚合和命名候选，不改代码。
- 第十四轮把 review issue 消失后是否需要清理高亮焦点的规则下沉到 `world-engine-workbench-real.ts`；`alignFocusedSubject` 属于复杂主体语境规则，只记录为后续候选。
- 第十五轮把 apply defaults 中“从 timeline 末尾找最新触及 preferred subject 的 slice”规则下沉到 `world-engine-workbench-real.ts`；复杂的 `alignFocusedSubject` 仍只记录不拆。
- 第十六轮把保存编辑后保持 slice 可见的过滤器清理规则下沉到现有 `world-engine-workbench-preview-filter.ts`，Dialog 只负责写回 Vue filter refs。
- 第十七轮把关闭 Workbench 时会丢弃的未保存草稿标签汇总规则下沉到 `world-engine-workbench-real.ts`，关闭确认流程不变。
- 第十八轮把 draft 时间线定位 slice 后自动打开 Inspector / Mutation Editor 的面板选择规则下沉到 `world-engine-workbench-real.ts`。
- 第十九轮把 issue code 到 A/E 等级的映射下沉到 `world-engine-workbench-real.ts`，Dialog / SliceCard / MutationEditor 继续保留本地 UI adapter。
- 第二十轮把 issue triage status 到短文案的映射下沉到 `world-engine-workbench-real.ts`，MutationEditor 的 manual 定位文案继续保留本地处理。
- 第二十一轮按用户要求做快速收尾：不新增代码重构，不继续追边界，只确认 Round 20 文档和验证记录齐备，并把 Task 66 标记为阶段完成。
- 第二十二轮做收尾后一致性核对：不新增代码重构，只校正 README 中仍暗示持续推进的旧状态句子。

## Verification / Test

- 第一轮以静态搜索和文档链接核查为主。
- 只有改业务代码或提取 util 时才跑窄测试。

## Implementation Walkthrough

- 2026-06-23：[Round 1 - Initial Cleanup Audit](walkthroughs/2026-06-23-round-1-initial-cleanup-audit.md)。
- 2026-06-23：[Round 2 - Workbench Session Utils](walkthroughs/2026-06-23-round-2-workbench-session-utils.md)。
- 2026-06-23：[Round 3 - Workbench Subject Stats Module](walkthroughs/2026-06-23-round-3-workbench-subject-stats-module.md)。
- 2026-06-23：[Round 4 - Workbench Review Summary Module](walkthroughs/2026-06-23-round-4-workbench-review-summary-module.md)。
- 2026-06-23：[Round 5 - Workbench Empty State Module](walkthroughs/2026-06-23-round-5-workbench-empty-state-module.md)。
- 2026-06-23：[Round 6 - Workbench Util Test Separation](walkthroughs/2026-06-23-round-6-workbench-util-test-separation.md)。
- 2026-06-23：[Round 7 - Workbench World View Filter Module](walkthroughs/2026-06-23-round-7-workbench-world-view-filter-module.md)。
- 2026-06-23：[Round 8 - Stage Closeout](walkthroughs/2026-06-23-round-8-stage-closeout.md)。
- 2026-06-23：[Round 9 - Workbench Review Queue Focus Module](walkthroughs/2026-06-23-round-9-workbench-review-queue-focus-module.md)。
- 2026-06-23：[Round 10 - Workbench Saved Slice Filter Visibility](walkthroughs/2026-06-23-round-10-workbench-saved-slice-filter-visibility.md)。
- 2026-06-23：[Round 11 - Workbench Slice Composer Subject Selection](walkthroughs/2026-06-23-round-11-workbench-slice-composer-subject-selection.md)。
- 2026-06-23：[Round 12 - Workbench Remaining Draft Selection](walkthroughs/2026-06-23-round-12-workbench-remaining-draft-selection.md)。
- 2026-06-23：[Round 13 - Workbench Util Naming And Structure Audit](walkthroughs/2026-06-23-round-13-workbench-util-naming-and-structure-audit.md)。
- 2026-06-23：[Round 14 - Workbench Review Issue Focus Cleanup](walkthroughs/2026-06-23-round-14-workbench-review-issue-focus-cleanup.md)。
- 2026-06-23：[Round 15 - Workbench Latest Slice By Subject](walkthroughs/2026-06-23-round-15-workbench-latest-slice-by-subject.md)。
- 2026-06-23：[Round 16 - Workbench Saved Edit Filter Preservation](walkthroughs/2026-06-23-round-16-workbench-saved-edit-filter-preservation.md)。
- 2026-06-23：[Round 17 - Workbench Unsaved Draft Labels](walkthroughs/2026-06-23-round-17-workbench-unsaved-draft-labels.md)。
- 2026-06-23：[Round 18 - Workbench Draft Surface Auto Open](walkthroughs/2026-06-23-round-18-workbench-draft-surface-auto-open.md)。
- 2026-06-23：[Round 19 - Workbench Issue Level Mapping](walkthroughs/2026-06-23-round-19-workbench-issue-level-mapping.md)。
- 2026-06-23：[Round 20 - Workbench Issue Status Label](walkthroughs/2026-06-23-round-20-workbench-issue-status-label.md)。
- 2026-06-23：[Round 21 - Quick Closeout](walkthroughs/2026-06-23-round-21-quick-closeout.md)。
- 2026-06-23：[Round 22 - Post Closeout Consistency Audit](walkthroughs/2026-06-23-round-22-post-closeout-consistency-audit.md)。

## TODO / Follow-ups

- 真实作者继续使用 Workbench 后，再根据第一个明显卡点决定下一轮体验修复，而不是继续纯边界清理。
- `WorldEngineWorkbenchDialog.vue` 仍是 2000+ 行大文件；下一轮如要拆，应优先围绕真实使用痛点拆，而不是为了行数拆。
- `world-engine.preview.vue` 是否抽 session composable 仍未决；只有当请求 token、busy/error/notice、状态回流能被一个深 Interface 收拢时再做。
- Task 56 / 59 / 61 的 README 仍混有历史索引和当前事实；后续可单独做文档整理，不和代码清理混跑。
- `world-engine-ide-entry.test.ts` 仍包含源码字符串断言；后续只在对应行为能落到 util / contract 时逐步替换。
- `world-engine-workbench-real.ts` 的 `real` 命名和职责范围需要用户审批后再改；候选方向见 Round 13。
- `app/utils` 下 World Engine Workbench util 的文件分层需要用户审批后再拆；候选方向见 Round 13。
