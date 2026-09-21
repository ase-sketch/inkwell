# Round 1 - Initial Cleanup Audit

## 背景

用户要求自主整理代码、规范代码、清理屎山、整理文档，并新开 task。本轮是第一轮循环：从 git、tasks 和代码体量入手，列出问题、评估优先级，并选一个低风险修复方向。

## 输入证据

- `git status --short` 显示当前 worktree 有大量未提交变更，横跨 World Engine、写作模式、Agent、Project Workspace 模板、任务文档和 reference。清理时不能假设这些都是本轮可随意改写的代码。
- `git diff --stat` 的 World Engine 相关热点：
  - `WorldEngineWorkbenchDialog.vue`：继续大幅增长。
  - `world-engine.preview.vue`：继续大幅增长。
  - `world-engine-workbench-real.ts`：已成为真实 Workbench 公共逻辑的承载点。
  - Task 56 / 59 / 61 README：仍承担大量状态记录。
- 当前行数扫描：
  - `app/components/novel-ide/world-engine/WorldEngineWorkbenchDialog.vue`：2294 行。
  - `app/pages/world-engine.preview.vue`：1083 行。
  - `app/utils/world-engine-workbench-real.ts`：528 行。
  - `app/utils/world-engine-preview.ts`：782 行。
  - `docs/tasks/56-world-engine/README.md`：910 行。
  - `docs/tasks/59-world-engine-workbench-redesign/README.md`：512 行。
  - `docs/tasks/61-world-engine-workbench-real-api/README.md`：468 行。
- `PROJECT-STATUS.md` 已在 Round 425 后收敛到短状态，适合作为仓库级当前事实入口。

## 问题清单

1. `WorldEngineWorkbenchDialog.vue` 仍是最大风险 Module。
   - Interface：主 IDE 打开 World Engine 的真实工作台。
   - Implementation：加载 schema / subjects / slices / RAG overview、timeline 过滤、snapshot、draft、review queue、proposal、confirm、composer、Project 文件打开等都在同一个文件里。
   - Friction：理解一个作者操作需要跨很多 ref / computed / function / template 区块；Locality 差。

2. `world-engine.preview.vue` 仍超过单文件约束。
   - Interface：独立 World Engine API 调试台。
   - Implementation：Project 管理、subject 创建、slice 写入 / 编辑 / 删除、state query、Builder、示例世界、action feedback。
   - Friction：后续继续加控件时容易把 session 编排和 UI 混在一起。

3. Task README 混合当前事实与历史流水账。
   - Interface：任务入口文档。
   - Implementation：当前状态、决策、hundreds of walkthrough 索引、follow-up 和旧观察点混在一起。
   - Friction：搜索“后续 / TODO / 约 1021 行”会命中过时描述，降低文档导航可信度。

4. Workbench 静态测试过多检查源码字符串。
   - Interface：前端契约测试。
   - Implementation：大量 `expect(file).toContain(...)`。
   - Friction：对重构形状敏感，对行为证明偏弱；未来拆 Module 时会产生高维护成本。

5. Project 删除 / old link 恢复语义还缺稳定 reference。
   - Interface：Project Workspace 生命周期。
   - Implementation：deleted marker、后台物理清理、旧链接 fallback、`openPath` 丢弃分散在多个 walkthrough。
   - Friction：后续维护者要读多个 task 才知道当前合同。

## 系统计划

第一阶段不直接大拆 UI Module，先把“当前事实入口”整理干净：

1. 校正明显过时的文档状态，例如旧行数、已解决但仍以 TODO 口吻存在的风险。
2. 在 Task 66 里沉淀候选问题和后续拆分计划。
3. 后续每轮只选一个 Module 做深入评估，先证明 Interface 设计，再改代码。

建议的后续顺序：

1. `WorldEngineWorkbenchDialog.vue`：先抽真实 Workbench session 编排候选，不碰 template。
2. `world-engine.preview.vue`：评估 Preview session composable 是否能提高 Depth。
3. Task 56 / 59 / 61：设计 README 当前事实与 walkthrough 历史证据的分工。
4. 测试：挑一个源字符串断言密集区，替换为 util 行为测试。

## 本轮修复目标

只做低风险文档清理：

- 新建 Task 66。
- 校正 Task 56 / 61 中关于 `WorldEngineWorkbenchDialog.vue` 和 `world-engine.preview.vue` 的过时行数 / 风险描述。
- 不改业务代码，不跑浏览器。

## 实际修复

- 新增 `docs/tasks/66-codebase-cleanup/README.md`。
- 新增本 walkthrough。
- 更新 `PROJECT-STATUS.md` 的 Recent Tasks，加入 Task 66。
- 更新 `docs/tasks/61-world-engine-workbench-real-api/README.md`：
  - `WorldEngineWorkbenchDialog.vue` 风险描述从旧的“约 1021 行”改为当前约 2294 行。
  - 明确后续不应继续把真实 Workbench 编排堆回这个文件。
- 更新 `docs/tasks/56-world-engine/README.md`：
  - `world-engine.preview.vue` 风险描述从旧的“约 1026 行”改为当前约 1083 行。

## 验证

- 静态行数扫描确认当前热点体量：
  - `WorldEngineWorkbenchDialog.vue`：2294 行。
  - `world-engine.preview.vue`：1083 行。
  - `world-engine-workbench-real.ts`：528 行。
  - `world-engine-preview.ts`：782 行。
- 本轮只改文档，没有运行测试或浏览器验收。

## 与计划出入

- `CONTEXT.md` 已读，当前清理描述优先使用 Project Workspace、Project Path、Project SQLite、IDE Mode、Agent Mode 等稳定术语。
- 没有使用 subagent；当前工具环境没有专用 Explore subagent，改为本 agent 直接读取 git / tasks / 代码证据。
