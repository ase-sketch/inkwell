# 仓库目录结构优化（长期任务）

> Active task directory format: `NN-kebab-case-name/`. Archived tasks move to `docs/tasks/archived/<task-slug>/`.

这是一个**长期任务**，不追求一轮做完。每轮只推进一个批次，结果回写到本文件的「Implementation Walkthrough」。

## Relative documents refs

- `PROJECT-STATUS.md`：仓库级现状与 TODO。
- `docs/tasks/README.md`：任务目录与归档规则（含「LastWriteTime 早于三天移入 archived」的治理规则）。
- `reference/workspace/TERMS.md`：workspace 相关术语的唯一真相源（与本任务 S6 命名问题直接相关）。
- `server/plot/`：全仓分层最好的模块，作为其他 server 模块的内部样板。

## User Request / Topic

- 用户要求：对当前项目的目录结构进行分析，并进行初步的优化规划。
- 用户后续拍板（2026-07-26）：
  1. `docs/tasks` 可以归档一些。
  2. `NeuroAgentHarness` 拆分已在另行考虑，**本任务不动**。
  3. 预览页（`app/pages/*.preview.vue`）**不动**。
  4. 本轮把报告落成长期任务；**本轮不做 800 行以上的代码拆分**。
  5. OpenAPI 元数据：**放弃 `defineRouteMeta`**（第一轮决策 1 选 B）。
  6. 着重检查 `server/` 目录结构问题。

## Goal

把仓库结构从「靠文档兜底」推进到「靠目录自解释」，验证面是：新 Agent 在不读 `AGENTS.md` 的情况下，也能从目录名和模块入口正确定位代码。

- **Outcome**：server/ 模块有统一的分层与入口约定；生成物不再混进源码；根目录与文档层无重复真相源。
- **Verification surface**：`bun run typecheck` + `vitest run` 全绿；`git ls-files` 统计的源码行数下降；每个改动批次在本文件留一条 walkthrough。
- **Constraints**：不改变任何运行时行为；不动 `NeuroAgentHarness`；不动预览页；不做 800 行以上组件的拆分。
- **Boundaries**：只动 `server/`、根目录杂物、`docs/`、`package.json`。`product/`、`workspace/`、`node_modules/` 是生成物/运行时数据，不在范围内。
- **Iteration policy**：每轮先做「零逻辑风险」的批次，跑通验证后再进入需要改代码结构的批次。
- **Blocked stop condition**：若某批次需要改动运行时行为才能完成，停下来报告，不要用 hack 绕过。

## Current State

### 盘点数据（2026-07-26）

入 git 的源码分布（`product/`、`workspace/`、`node_modules/` 已 gitignore，不计入）：

| 目录 | 文件数 | 说明 |
|---|---|---|
| `docs/` | 1067 | 归档前 `docs/tasks/` 887 文件 / 122 个 active 任务目录 |
| `server/` | 686 | agent 243 / api 153 / plot 48 / workspace-files 47 |
| `app/` | 437 | components/novel-ide 219（agent 66 / plot 58 / settings 33 / world-engine 27） |
| `assets/` | 285 | 几乎全是 `assets/workspace/.nbook`（Bundled Workspace Template） |
| `scripts/` 87 / `packages/` 81 / `reference/` 60 / `shared/` 49 | | |

测试：330 个 `.test.ts`，约 74,310 行，与源码同目录并置。

### 结构上已经做得好的部分（不要动）

1. **导入别名纪律好**：`nbook/server` 2624 处、`nbook/app` 1259 处、`nbook/shared` 562 处，全仓只有 55 处 `../` 相对导入。
2. **前后端边界干净**：`app/` 对 `server/` 的引用共 27 处，生产代码里**全是 `import type`**，没有一处值级导入。
3. **`server/plot/` 分层清晰**：`contracts / core / services / repositories / assemblers / facade / http` 七层。
4. **`packages/` 三个独立包**各带 `tsconfig` + `vitest.config`，边界清楚。
5. **路由层很薄很健康**：127 个路由的真实逻辑约 2578 行，平均每个路由 20 行；只有 7 个生产路由直连 prisma（admin/auth 域）；没有任何模块反向 import `server/api`。

## server/ 目录结构问题清单（本轮重点）

### S1 · 分层约定不统一，模块没有统一入口

27 个 server 子模块中，只有 `plot/`（七层）、`world-engine/`（calendars）、`runtime/`（paths）有子结构；`agent/` 有 15 个子目录但是**按功能名平铺**（attachments / context-access / events / harness / messages / observability / profiles / session / skills / tools / variables / workflow / workspace / test / test-utils），不是分层；其余 20 个模块完全扁平。

全 server 只有 7 个 `index.ts`（`agent`、`agent/tools`、`low-code-form`、`plot`、`world-engine`、`vendor/nb-history`、`vendor/nb-workflow`）。**没有 index 的模块，调用方一律直接深入内部文件**，模块边界形同虚设——这是后续任何模块内部重构都会被大范围 import 卡住的根因。

### S2 · `server/utils/novel-chapter.ts` 是全 server 最大的隐性耦合枢纽

895 行，**被 79 个文件引用**，至少混装 5 种互不相干的职责：

| 职责 | 导出 |
|---|---|
| 小说列表缓存 | `listNovels`、`invalidateNovelListCache`、`prewarmNovelListCache`、`NovelListDiagnostics` |
| 实体 ID 编解码 | `stringifyEntityId`、`parseEntityId`、`parseNullableEntityId` |
| HTTP 参数校验 | `requireProjectPath`、`requireProjectPathQuery`、`validateBody` |
| 项目断言 | `assertNovel` |
| 工具写入 | `updateNovelByTool` |

文件名叫 "novel-chapter"，但里面**没有任何和章节有关的东西**。大量路由是为了拿 `validateBody` 才 import 它，顺带把小说列表缓存拖进依赖图。

### S3 · `server/utils/` 是杂物抽屉

16 个源文件横跨至少 6 个域：认证（auth / password / login-security）、计费（exchange-rate-service / pi-model-cost）、数据库（prisma）、配置（app-config / model-settings / env-template）、内容（frontmatter-document / novel-chapter）、可观测（server-timing / event-stream）、运行时产物（runtime-artifact-import / runtime-artifact-compiler-context）、安全（sensitive-text）。

### S4 · Prisma client 有两个导入口径

`server/utils/prisma.ts` 是 `server/database/prisma.ts` 的 4 行纯 re-export 壳。17 个文件走 `utils/prisma`，其余走 `database/prisma`，同一个 client 两条路径。

### S5 · "models" 一词三种含义

- `server/models/` = LLM 供应商模型库（model-library / discovery / provider-credential / provider-template-library）
- `shared/models/` = 供应商配置契约
- `server/generated/project-prisma/models/` = Prisma 生成的数据模型

### S6 · `server/workspace/` 是长在源码树里的运行时数据目录

该目录下只有 `.nbook`（已 gitignore），**零源码**。且与 `server/workspace-files/` 名字只差一个后缀，与 `server/workspace-history/`、`assets/workspace/`、根 `/workspace/` 共同构成 workspace 一词的五处指代。目前靠 `reference/workspace/TERMS.md` 兜底——这是文档在替目录结构还债。

### S7 · 孤儿测试与测试命名无约定

- `server/deploy/` 里**只有一个测试文件** `prisma-runtime-preflight.test.ts`，被测源码不在本模块。
- `server/database/sqlite-location.test.ts` 的被测源码在 `server/runtime/app-sqlite-location.ts`。
- server 全域 224 个测试里 **43 个没有同名源文件**。其中一部分是合理的契约/黑盒/冒烟测试（`*-contract.test.ts`、`*.black-box.test.ts`、`*-smoke.test.ts`），但**没有命名约定把它们和「孤儿单测」区分开**，导致无法机械判断哪些是遗留垃圾。

### S8 · `server/workspace-files/` 是第二大枢纽却完全扁平

fan-in 629（仅次于 agent 的 1141），24 个源文件全平铺，含 `workspace-files.ts` 1994 行 + `novel-workspace.ts` 1692 行。文件名前缀其实已经天然分成三组：`project-*`（10 个）、`workspace-*`（10 个）、`content-node-*`（2 个），只是没有落成目录。

### S9 · server/api 的臃肿 100% 来自生成物

127 个路由文件共 26,837 行，其中 **24,259 行（90.4%）是 `AUTO-GENERATED by generate-openapi-meta` 的 JSON**，分布在 41 个文件里。最重的四个：

```
server/api/config/global.put.ts              5156 行
server/api/config/project.put.ts             4299 行
server/api/config/profile-home/reset.post.ts 3453 行
server/api/config/editor-snapshot.get.ts     3429 行   ← 四个文件占 16,337 行
```

`global.put.ts` 的真实业务逻辑只有开头的 import 和文件末尾的 handler，中间 5000 多行全是内联 JSON。

## 当前 master 架构复核（2026-08-07）

本轮只做结构与架构审查，不改变业务代码、公共 API、数据库结构、Manager 包结构或 Desktop 实现。结论是：核心生命周期、Job 终态持久化、Project Module Registry 和 Desktop Contract 方向基本成立；没有发现新的运行时 P0/P1。下面的项目属于维护边界风险或架构债务，不应直接写成当前用户已经遇到的运行时故障。

### 已确认的正向结构

- `server/workspace-files/project-module.ts` 已提供 Project Module Registry，并明确了模块注册、关闭和生命周期顺序。
- `server/agent/jobs/agent-job-durable-store.ts` 使用单 Job 文件进行原子持久化；`server/agent/jobs/agent-job-manager.ts` 在发布终态 SSE 前先完成 durable commit，用户可见的 Job 终态不会先于持久化结果公开。
- State Root、Cache Root、Installation Root 的边界已经在 ADR 0010、`reference/workspace/TERMS.md`、Task 142 和 Task 143 中写清楚。
- vendor snapshot 有 `VENDOR.json` 和同步脚本，当前没有发现需要在本轮重新设计的快照边界。

### 结构风险与置信度

1. **P1 候选：shared 与 Manager 形成真实运行时依赖环。** `shared/product-runtime-image-verifier.ts:14-16` 运行时导入 `packages/neuro-book-manager/src/types.ts` 中的 `PRODUCT_PLATFORMS`，并从同一文件导入 `ProductPlatform` 类型；Manager 的 `packages/neuro-book-manager/src/product.ts:15` 又导入该 verifier。当前构建可以通过，但这说明“共享合同”和“可独立发布的 Manager”边界并不真实：以后若 Manager 需要脱离仓库独立打包，可能把宿主源码依赖一起带入或在独立构建时失败。**置信度：已从代码确认，影响级别为架构 P1 候选，不是已复现的运行时故障。**
2. **P2：shared 与 `server/agent` 存在循环类型依赖。** `shared/dto/agent-session.dto.ts:2-4` 依赖 `server/agent/messages`、`session`、`variables` 的类型，而 `server/agent/session/types.ts:5` 又反向依赖该 DTO。当前是 `import type`，没有观察到运行时环；但 shared DTO 无法真正独立编译和复用。**置信度：已从代码确认，运行时影响未发现。**
3. **P2：核心单体文件把维护风险集中在少数入口。** 当前 master 实测：`server/agent/harness/neuro-agent-harness.ts` 8,213 行、`server/workspace-files/project-lifecycle.ts` 2,759 行、`server/workspace-files/workspace-files.ts` 1,997 行、`app/pages/index.vue` 2,837 行、`app/stores/novel-ide.ts` 2,032 行、`app/components/novel-ide/agent/AgentChatSurface.vue` 2,978 行。它们仍可作为领域 Facade 使用，但跨模块修改时更容易产生回归；行数本身不是立即拆分的理由。**置信度：已测量文件规模，回归风险为结构推断。**
4. **P2：OpenAPI 生成物仍大量写回路由源码。** `server/api/config/global.put.ts:7` 开始的自动生成 JSON 与业务 handler 混在同一个路由文件中；该问题已在本任务的 D1 记录，本轮不与可靠性修复混合处理。**置信度：已从代码确认。**

### 本轮明确接受的边界

- 文件系统、Project SQLite、History SQLite、Session JSONL 和 Job JSON 各自维护自己的生命周期与一致性；当前不建设跨存储全局事务或分布式事务框架。需要跨边界恢复时，继续使用已有的顺序、幂等和可诊断失败合同。
- Electron/Tauri 目前仍是 Desktop spike。两套宿主重复处理配置、端口、Supervisor、关闭和窗口状态，是 Rust/TypeScript 双实现的现实成本；当前不提前抽象复杂的跨语言运行时。
- 不因为单体文件超过某个行数就机械拆分。只有出现明确的运行时边界、发布边界或持续回归证据时，才单独开轮次处理。

### 本轮验证边界

- 直接运行 `node node_modules/nuxt/bin/nuxt.mjs typecheck --dotenv .env.typecheck --logLevel silent`：通过，退出码 0。
- `bun run typecheck` 未进入 TypeScript，Bun 报告 `Bun failed to remap this bin to its proper location within node_modules.`，并提示 `corrupted node_modules directory`，退出码 255；这是本地依赖环境问题，不能归因于本轮架构结论。
- 本轮未运行全仓测试、浏览器验收、真实 provider 或发布流程；这些结论不会替代相应的产品和发布门禁。

## 仓库其他层面的问题（非 server，长期 backlog）

### R1 · 13 个僵尸依赖

全仓扫描（所有入 git 的 ts/vue/mjs/js/json/yml）确认以下依赖**只出现在 `package.json`，源码零引用**：

```
@nestjs/common、@nestjs/core、@nestjs/platform-express、@nestjs/swagger
swagger-ui-express、rxjs、class-transformer、class-validator
tsyringe、reflect-metadata、global-agent、croner
```

外加 `"i": "^0.3.7"`（典型的 `bun add i` 手滑误装包，零引用）。

**注意**：`mermaid`、`turndown`、`@mozilla/readability` 初看像死依赖，复查后确认都在用（mermaid 在 `app/utils/workflow-preview/render-mermaid.ts`，后两个在 `server/agent/tools/web-tools.ts` 经 `web-extraction-modules.d.ts` 声明），**不要删**。

### R2 · 根目录杂物与双份 Agent 指令

- **`CLAUDE.md`（105 行）与 `AGENTS.md`（146 行）已经分叉**：CLAUDE.md 第一行就写着 `# AGENTS.md`，是旧副本，两者 diff 达 253 行。两份 Agent 指令并存必然继续漂移。
- `architecture.md`（16 行）只是索引，内容与 `docs/README.md` + `reference/README.md` 重复。
- `.traces/` 的 10 个 trace 文件（html/jsonl/log）**被 git 追踪**，属调试产物。
- 4 个根级 shim：`bun-sqlite.d.ts`、`proper-lockfile.d.ts`、`yazl.d.ts`、`vue-shim.d.ts`。
- 工作区残留：`bash.exe.stackdump`、`t16-editor-heat.png`、`coverage/`、`test-results/`。
- `server/api/agent/_removed.ts` 是纯墓碑文件（只抛 501）。

### R3 · 前端单体入口（本任务不处理，仅登记）

`app/pages/index.vue` 2433 行 + `app/stores/novel-ide.ts` 2465 行（全仓唯一 pinia store，承载整个 IDE 状态）。组件层已按域拆到 219 个文件，但 store 层没跟着拆。

超 800 行的组件：`AgentChatSurface.vue` 3264、`ProfileTemplateVisualEditor.vue` 2603、`WorldEngineWorkbenchDialog.vue` 2203、`NovelPlotPanel.vue` 1951、`TipTapMarkdownEditor.vue` 1793。**用户已明确本任务不做这些拆分。**

### R4 · 任务文档层膨胀

归档前 `docs/tasks/` 有 122 个 active 目录 / 887 文件，archived 仅 14 个。编号撞过两次（`08-sqlite-first-database` vs `08-writer-profile-input-contract`；`120-agent-skill-package-contract` vs `120-runtime-artifact-storage-lifecycle`）。

`PROJECT-STATUS.md` 75 KB、`RELEASE.md` 71 KB，已到「每次读都很贵」的量级。

## ADR / Decisions / Discussion

- **D1 · OpenAPI 元数据放弃 `defineRouteMeta`（用户拍板）**。
  背景约束：Nitro 的 `defineRouteMeta` 是编译期宏，参数必须是字面量，**不能 import 外部常量**，所以无法简单地把 JSON 抽到同名 `.openapi.ts` 再引入——这正是当初内联的原因。
  决策：改由 `generate-openapi-meta` 直接从 zod/typebox schema 产出独立的 openapi spec 文件，路由源码不再承载 meta。
  代价：失去 Nitro 的路由 meta 自动发现，spec 与路由的对应关系需要生成脚本自己维护；`server/routes/_openapi.json.get.ts` 的供给方式要改。
  收益：`server/api` 减重约 24,259 行（90.4%）。

- **D2 · 本轮不动 `NeuroAgentHarness`（用户拍板）**。已在另行考虑拆分，避免与本任务冲突。

- **D3 · 本轮不动 `app/pages/*.preview.vue`（用户拍板）**。13 个预览页保持现状。

- **D4 · 本轮不做 800 行以上的代码拆分（用户拍板）**。R3 只登记不执行。

- **D6 · server/ 的结构改动本轮全部延后（用户拍板，2026-07-26）**。
  S1–S9 只做分析登记，**不落任何代码改动**。批次 C（server 结构收敛）与批次 D 里的 S5/S6 两项保持未开始状态，等用户另行开轮次。
  理由：`server/agent` 与 workflow 接入（Task 110/111）正在大面积改动中，此时动 server 结构会与在途功能开发互相踩；且 S2 拆 `novel-chapter.ts`（79 个依赖方）本身就需要独占一轮。
  本轮可动的只剩：批次 A（根目录与依赖清理，不碰 server 内部结构）、批次 B（OpenAPI 生成物脱离源码）、批次 D 里的文档治理项。

- **D5 · 归档采用「零外链优先」策略**。`docs/tasks/README.md` 里的机械规则（LastWriteTime 早于三天即归档）会一次性归档 110/122，过于激进（会把正在推进的 110/111 工作流任务也归掉）。本轮改用两条更保守的判据的交集：**LastWriteTime 早于 2026-07-01（约 26 天未动）且无任何外部文档反向链接**，得到 26 个可零成本归档的任务，不产生任何断链维护。

## Verification / Test

- 归档批次：`grep -rn "tasks/<slug>"` 确认无断链残留。
- 依赖清理批次：`bun run typecheck` + `vitest run` 全绿。
- OpenAPI 批次：`server/routes/_openapi.json.get.ts` 产出的 spec 与改造前逐路由 diff 一致。

## Implementation Walkthrough

### 轮次 1（2026-07-26）· 结构分析 + 任务文档 + 任务归档

**做了什么**

1. 完成全仓目录结构分析，产出上文 S1–S9（server 层）与 R1–R4（其他层）问题清单。
2. 建立本任务目录。
3. 按 D5 归档 26 个陈旧且无外链的任务目录：active **122 → 96**，archived **14 → 40**。
   顺带副作用：`08-writer-profile-input-contract` 移入 archived 后不再占用编号，**`08` 号编号冲突自动消解**（`120` 的冲突仍在）。
4. 修正 `docs/tasks/archived/homepage-api-performance/README.md` 里指向旧路径的一处自引用。
5. 修正 `docs/tasks/README.md` 的归档规则（三天 → 一个月 + 无外链），并补充「不要用 git 提交日期判断陈旧度」的说明。
6. 在 `PROJECT-STATUS.md` 的 Recent Tasks 登记本任务。

**与计划的出入**

- 原计划按 `docs/tasks/README.md` 的三天规则归档，实际发现该规则会一次性归掉 110/122 个（含正在推进的任务），故改用 D5 的保守判据。**这说明 README 里那条三天规则本身是失效的**，见下方 TODO。
- 用 git 提交日期判断陈旧度**不可用**：所有已跟踪任务目录的最后提交日期都是 2026-07-20（存在一次批量提交），只能用文件系统 LastWriteTime。

**已归档的 26 个任务**

```
agent-session-management            agent-steer-followup-composer
agent-web-research                  writer-profile-input-contract
homepage-api-performance            shared-diff-workbench
agent-harness-black-box-tests       agent-mode-layout
user-onboarding-tutorials           profile-compaction-config-and-history-reinjection
agent-profile-import-node           reference-bookshelf-reorg
silly-tavern-import-skill-hardening simulator-leader-invoke-policy
agent-compaction-visible-context-contract  rag-visualization
stop-slop-writer-skill              system-assets-preflight
lorebook-context-memory             markdown-studio-welcome-agent-onboarding
rp-manual-directory-and-rp-leader-naming   writer-payload-context-injection
frontend-i18n                       subject-state-viewer
agent-profile-routing               agent-composer-plain-text-input
```

### 轮次 2（2026-07-26）· 批次 A 零逻辑风险清理

**做了什么**

1. **A1** 删除 14 行僵尸依赖（13 个 + `@types/global-agent`）：`@nestjs/common`、`@nestjs/core`、`@nestjs/platform-express`、`@nestjs/swagger`、`@types/global-agent`、`class-transformer`、`class-validator`、`croner`、`global-agent`、`i`、`reflect-metadata`、`rxjs`、`swagger-ui-express`、`tsyringe`。同时删除 `tsconfig.json` 的 `experimentalDecorators` / `emitDecoratorMetadata`（全仓装饰器用量为 0）。`bun install` 报告 **14 packages removed**，与删除行数精确对应。
2. **A2** `CLAUDE.md` 全文替换为 `@AGENTS.md`，`AGENTS.md` 成为唯一真相源。
3. **A3** `.traces/` 10 个文件 `git rm --cached`，`.gitignore` 新增 `.traces/`。
4. **A4** 删除 `architecture.md`；其独有的三条 reference 链接（editor / plot / theme）并入 `docs/README.md` 的「关键入口」段。
5. **A5** 清理 `bash.exe.stackdump`、`t16-editor-heat.png`、`coverage/`、`test-results/`（均已 gitignore，不产生 git 变更）。

**验证结果**

- `bun run typecheck`：**26 个错误，全部在 `server/agent/skills/llmlint.test.ts`**，与 Task 118/120 记录的既有基线逐项一致，零新增。这同时证明关闭装饰器选项没有触发任何隐藏依赖。
- `bun run test`：见下方「关键发现」。
- 变更面只落在 `package.json`、`bun.lock`、`tsconfig.json`、`CLAUDE.md`、`.gitignore`、`docs/README.md`，加 `architecture.md` 与 `.traces/` 的删除。

**关键发现 · 测试基线远比 `PROJECT-STATUS.md` 记录的糟（与计划预期不符）**

计划里写的验证基线是「workflow 目录下 12 个既有失败」（来自 Task 122 记录）。实测远不止：

| 组 | 依赖状态 | 失败文件 | 失败用例 | 用例总数 |
|---|---|---|---|---|
| 处理组 | 已删 14 个 | 41 | 169 | 2547 |
| 对照组 | 全部临时还原 | 53 | 192 | 2380 |

**对照组反而更差**，且两次运行的用例总数相差 167（2547 vs 2380）、skipped 相差 4。结论：

1. 批次 A 没有引入任何失败，方向与「删依赖导致破坏」完全相反。
2. 测试套件当前处于**高度不稳定状态**，有测试文件在不同运行中以不同方式提前中止（大量 5000ms 超时）。
3. 真实基线是 41–53 个文件失败，缺口 150+ 用例主要落在 `server/api/` 路由测试，典型症状是 `validateBody` 收到的 mock event 缺 `node` 字段（`readBody` 抛 `Cannot read properties of undefined (reading 'req')`）。这属于**当前工作区在途改动（Task 111/118 面）造成的漂移**，不在批次 A 范围内，但 `PROJECT-STATUS.md` 的「12 个失败」记录严重低估了实际情况，需要在相应任务里更正。

另有两条独立证据支持批次 A 无害：

- `bun.lock` 的移除项全部是 NestJS / class-validator / global-agent 的传递闭包（`cors`、`file-type`、`argparse`、`concat-stream`、`@microsoft/tsdoc` 等），逐个核实源码零引用；`h3` 版本未变（1.15.11）。
- 单个失败用例在依赖还原后**以完全相同的方式失败**（1.5 秒内失败、非超时）。

**过程避坑**

- **`bun install` 不修剪 node_modules 里的外来目录，`bun install --force` 同样不修剪。** A/B 对照实验后已删的包在本地仍能解析，会掩盖真实断裂。唯一可靠做法是 `rm -rf node_modules && bun install`。所幸处理组的全量测试是在 bun 报告「14 packages removed」之后立刻跑的，当时 node_modules 是干净的，测量有效。
- 在 Git Bash 里给 `node -e` 传 `/tmp/...` 路径会被解析成 `C:\tmp\...` 而非 Git Bash 的 `/tmp`，必须用绝对路径。

**与计划的出入**

- 计划里写「`docs/adr/` 目录实际不存在，可顺带删掉 `docs/README.md` 的该行」——**核实后该目录是存在的**（含 2 份 ADR，只是未入 git），故未改动那一行。之前判断失误的原因是用 `git ls-files` 统计目录，未入 git 的目录不会出现。
- A6（根级 `.d.ts` 移进 `types/`）与 A7（删 `server/api/agent/_removed.ts`）按拍板跳过，未执行。

**收尾审查发现的两处真实遗漏（均已修复）**

1. **`CLAUDE.md` 收敛丢了两条规则。** 旧 `CLAUDE.md` 有而 `AGENTS.md` 没有的内容并非全部重复：`- 当前是沙盒环境，执行 bun 命令时，提权在沙盒外执行` 和整个 `## subagents` 段（`不要使用 fable 作为模型`）在 `AGENTS.md` 中零命中，替换成指针后直接丢失。已补回 `AGENTS.md` 的 Core Rules 与新建的 `## subagents` 段。其余三条（激进修改老代码、类型覆盖、前端错误展示归属）经逐条核实在 `AGENTS.md:52 / 68 / 91-93` 有更详细的版本，属真重复。
   **教训**：合并两份分叉文档前必须做 `grep -vxFf` 双向差集并逐条判定语义覆盖，不能只看行数和 diff 规模。
2. **`architecture.md` 的 `reference/editor/` 是失效链接，被我原样搬进了 `docs/README.md`。** 该目录不存在（Markdown Studio 参考实际在 `reference/content/markdown-dialect.md`），应是 Task 30 reference bookshelf 重组后遗留的死链。已改为链接真实存在的 `reference/plot/`、`reference/world-engine/`、`reference/workspace/TERMS.md`、`reference/theme/system.md`，并逐条验证 `docs/README.md` 全部 18 条相对链接均可解析。
   **教训**：迁移文档内容时必须验证被迁移链接的目标存在，不能假定源文档是正确的。

**收尾审查已验证通过的链路**

- 26 个归档任务在全仓（含 `.ts` / `.mjs` / `.json`）零断链引用。
- `.gitignore` 对 `.traces/` 实际生效（`git check-ignore` 确认命中第 39 行）。
- `package.json` 相对 HEAD 的净变更正好是 14 行删除，无重排、无重格式化（A/B 实验中 node 脚本的重排未泄漏，因为最终状态由备份还原）。
- `PROJECT-STATUS.md` 的表格行结构完好（3 列，无裸竖线）。
- `bun.lock` 中残留的 `croner` 条目**是合法的**：`nitropack@2.13.4` 依赖 `croner@^10.0.1`，已正确嵌套在 `node_modules/.bun/nitropack@2.13.4+<hash>/node_modules/croner`。根级 `node_modules/croner` 消失正是预期——它已从直接依赖降为传递依赖。
- `nuxt.config.ts` / `Dockerfile` / `Dockerfile.runner` / `docker-compose.yml` / `bunfig.toml` 均不引用任何被删包。
- **`bun run nuxt:prepare` 通过**（补上了计划验证面的缺口：typecheck 与 vitest 都不走 Nitro 构建链）。

**顺带修复的 `docs/tasks/README.md` 既有缺陷**

审查中发现该文件有四处问题，已一并修掉：

1. 「归档」段末尾的 `每一轮的实现报告都需要记录在这个 58 号任务目录下的 walkthourghs/ 子文件夹中`——Task 58 的专属指令泄漏进了通用规则文档，对其他任务是错误指引。已删除，并在「命名」段改写为通用规则。
2. `walkthourghs` / `walkthourgh` 两处拼写错误——实际目录名是 `walkthroughs`（全仓 12 处均为此拼写）。已统一。
3. 「`order` 使用两位数字」已与现实脱节（当前最大编号 123）。已改为「不足两位补零，超过 99 后自然使用三位」。
4. 缺少防撞号机制。已加入硬性要求：**新建任务目录前必须先 `ls docs/tasks/` 确认编号未被占用，不要凭记忆推断**，并写明历史上已发生 `08`、`96`、`120` 三次撞号。

### 轮次 3（2026-08-07）· 当前 master 代码结构与架构复核

**做了什么**

1. 以当前 `master` 为基线复核生命周期、Job durable history、Project Module Registry、Desktop Contract，以及 State/Cache/Installation Root 的边界。
2. 记录 shared/Manager 的真实运行时依赖环、shared/`server/agent` 的循环类型依赖、核心单体文件规模和 OpenAPI 生成物回写路由源码四项结构风险。
3. 将跨存储全局事务和 Electron/Tauri 跨语言统一运行时列为明确接受的边界，不把它们升级成当前技术债修复目标。
4. 新增 [ADR 0015](../../adr/0015-architecture-boundaries-and-deferred-structure.md)，把本轮“不重构”的原因、后果和重新评估条件固定下来。

**与计划的出入**

- 没有代码、API、数据库或 Manager/Desktop 实现改动。
- 没有运行全仓测试、浏览器、真实 provider 或发布流程；Nuxt 直接 typecheck 通过，root `bun run typecheck` 只因本地 `node_modules` bin metadata 损坏而未进入 TypeScript。

**结论**

本轮不关闭原有结构优化项，也不宣称仓库已经完成解环或完成单体拆分。后续只有在 ADR 0015 规定的触发条件出现时，才为单项问题另开任务和验证批次。

## TODO / Follow-ups

按批次推进，每批完成后回写 walkthrough。

### 批次 A · 零逻辑风险清理（**已完成**，轮次 2）

- [x] 删除 R1 的 13 个僵尸依赖（实际 14 行，含 `@types/global-agent`）+ 关闭 `experimentalDecorators` / `emitDecoratorMetadata`，typecheck 零新增错误。
- [x] `git rm --cached .traces/`，把 `.traces/` 写进 `.gitignore`。
- [x] 清理 `bash.exe.stackdump`、`t16-editor-heat.png`、`coverage/`、`test-results/`。
- [x] `CLAUDE.md` 改为 `@AGENTS.md` 导入，消灭双份 Agent 指令漂移。
- [x] 删除 `architecture.md`，独有的三条 reference 链接并入 `docs/README.md`。
- [ ] ~~删除 `server/api/agent/_removed.ts` 并清理引用它的路由~~ —— 落在 `server/` 内，按 D6 一并延后。
- [ ] ~~4 个根级 `.d.ts` shim 收进 `types/`~~ —— **已拍板跳过**：`Dockerfile:60` 硬编码了这四个路径，移动必须同步改 Dockerfile 与 tsconfig include glob，会给这批零风险改动引入唯一的构建风险，收益不值。

### 由轮次 2 新发现引出的待办

- [ ] 更正 `PROJECT-STATUS.md` / Task 122 里「workflow 目录 12 个失败」的基线记录——实测为 41–53 个文件失败、150+ 用例缺口，主要在 `server/api/` 路由测试（`validateBody` 的 mock event 缺 `node`）。
- [ ] 排查测试套件的不稳定性：两次全量运行的用例总数相差 167，大量 5000ms 超时，说明有测试文件在不同运行中提前中止。**这会让后续所有批次都失去可靠的验证面，建议优先于批次 B/C 处理。**

### 批次 B · OpenAPI 生成物脱离源码（未开始，D1）

- [ ] 改造 `scripts/build/generate-openapi-meta.ts`，产出独立 spec 而非回写路由源码。
- [ ] 移除 41 个路由文件里的 `defineRouteMeta` 内联块（约 24,259 行）。
- [ ] 改造 `server/routes/_openapi.json.get.ts` 的 spec 供给方式。
- [ ] 逐路由 diff 验证改造前后 spec 一致。
- [ ] **单独成批提交**，不要与其他改动混在同一个 commit。

### 批次 C · server/ 结构收敛（**已延后，见 D6**；本轮不动）

- [ ] S4：删除 `server/utils/prisma.ts` 转发壳，17 处 import 统一改指 `server/database/prisma`。
- [ ] S7：`server/deploy/prisma-runtime-preflight.test.ts` 与 `server/database/sqlite-location.test.ts` 移到被测源码所在模块；为契约/黑盒/冒烟测试确立命名约定，把剩余 43 个孤儿测试逐个判定去留。
- [ ] S2：拆 `server/utils/novel-chapter.ts`（895 行 / 79 依赖）。建议切法：HTTP 参数校验 → `server/utils/http-validation.ts`；实体 ID 编解码 → `server/utils/entity-id.ts`；小说列表缓存 + assertNovel + updateNovelByTool → `server/workspace-files/` 下的 novel 服务。**这是本任务改动面最大的一项，需单独一轮。**
- [ ] S3：`server/utils/` 按域拆分，认证类归 `server/auth/`、计费类归 `server/billing/` 或并入 `server/models/`。
- [ ] S8：`server/workspace-files/` 按现有文件名前缀落成 `project/`、`workspace/`、`content-node/` 三个子目录。
- [ ] S1：为 fan-in 高的模块补 `index.ts` 作为唯一入口，逐步收回直接深入内部文件的 import。

### 批次 D · 命名与文档治理（未开始）

- [ ] S5（**已延后，见 D6**）：`server/models/` 更名以消除 "models" 三义（建议 `server/model-providers/`）。
- [ ] S6（**已延后，见 D6**）：`server/workspace/` 运行时数据目录迁出源码树。**这一项会改运行时路径，需先确认对 `reference/workspace/TERMS.md` 与安装/打包脚本的影响，风险最高，放最后。**
- [x] R4：修正 `docs/tasks/README.md` 里失效的三天归档规则，改成本任务 D5 的判据（轮次 1 已做）。
- [x] R4：消解剩余的 `120` 号编号冲突。2026-07-26 由 Task 125 自行改号解决：`120-runtime-artifact-storage-lifecycle` → `125-runtime-artifact-storage-lifecycle`（`124` 已被写作产品线第三批占用），`120-agent-skill-package-contract` 保持原号不动（它被 `reference/agent/skill-package.md` 和 Task 84 引用）。ADR 0002、Task 79、`PROJECT-STATUS.md` 的反向链接已同步。防撞号规则已在轮次 2 写进 `docs/tasks/README.md`「命名」段（建目录前必须 `ls` 确认），若仍不够可再补脚本校验。
- [ ] R4：处理剩余 31 个「陈旧但有外链」的任务目录——归档时必须同步改写反向链接。
- [x] R4：`RELEASE.md` 按发布线切分（2026-07-27）。79 KB / 29 个版本块 → 只保留当前待发布版本；历史全部按新语言风格重写并迁到 `docs/changelog/`（`index.md` 说明与索引 + `v0.8.md` / `v0.7.md` / `v0.5.md`），英文镜像 `docs/en/changelog/` 同步建立。VitePress 中英 nav + sidebar 已接入（未加 `srcExclude`，故真正上站），`docs:build` 85 页通过、锚点在双语两侧都生成。`docs/deployment.md` 与 `docs/en/deployment.md` 原本指向 `RELEASE.md#旧agent-session模型引用` 的 GitHub 绝对链接改为站内相对链接 + 固定锚点 `{#session-model-refs}`，该段迁移操作步骤已完整保留在 `docs/changelog/v0.8.md` 的 0.8.9 小节。`docs/README.md`、`docs/index.md`、`docs/en/index.md` 的目录清单已同步。配套在 `AGENTS.md` 新增「面向用户的语言风格」小节（读者假设 + 八条写法 + RELEASE.md 固定四段结构），把这次的口径固定成长期约束。
- [ ] R4：`PROJECT-STATUS.md`（93 KB）按时间切分——本轮未做。

### 已登记但暂不执行

- server/ 全部结构改动 S1–S9，本轮延后（D6）——分析结论已完整保留，等另行开轮次。
- R3 前端单体入口与 800 行以上组件拆分（D4）。
- `NeuroAgentHarness` 拆分（D2）。
- `app/pages/*.preview.vue` 归位（D3）。
- shared/Manager 依赖环与 shared/`server/agent` 循环类型依赖：本轮只记录，不新建 `runtime-contract` 包，也不做无证据的解环重构。
- 跨存储全局事务与 Electron/Tauri 跨语言统一运行时：按 ADR 0015 保持接受边界，不作为结构优化 backlog 推进。
