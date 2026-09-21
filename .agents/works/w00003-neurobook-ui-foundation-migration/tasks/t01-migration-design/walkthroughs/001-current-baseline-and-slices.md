---
schema: nbook.walkthrough/v1
taskId: t01-migration-design
sequence: 1
role: tasker
status: completed
createdAt: 2026-08-29T13:32:22+08:00
---

# t01：当前基线与迁移切片设计

## 结论

本 Task 只完成设计基线，不实现产品代码、依赖、Nuxt 接线、主题切换、Component Lab 或 preview 清退。基线以本轮 `master` 的 `HEAD=73f37b4d3095aa9072de76fe0d4bdff240862deb` 为准：

- NeuroBook 当前有 **232** 个已跟踪非页面 Vue SFC；`packages/nb-ui` 当前有 **72** 个组件 SFC。可复核计数、路径集合摘要与同名比较见 [`../evidences/component-baseline.json`](../evidences/component-baseline.json)。
- 当前 preview 源集合精确为 **14** 页；页面内冻结 **31** 个稳定 scenario（`product-behavior` 5 个、`demo-only` 26 个），见 [`../evidences/preview-scenario-baseline.json`](../evidences/preview-scenario-baseline.json)。
- 主应用现在**没有**声明 `@notnotype/nb-ui`，仍使用自己的 common SFC、theme store、36 个主题变量、UnoCSS 和 `theme-vars.css`。nb-ui 的 workspace lock 记录不等于消费者已接入。
- 迁移顺序固定为 **A → B → C → D → E–O → P**。A 只冻结组件合同/catalog 与 14 页 scenario baseline；它不实现 B 的包接入、C 的主题 clean cutover 或 D 的 Lab。
- `ui.component-contracts` 与 `ui.component-lab` 两份 `planned` Spec 必须在本 Task 闭合后由 Leader 创建并通过文档门禁，随后才创建 A 实现 Task。本轮没有创建或修改 Spec、Proposal、Work/Task README。

文中标记含义：`[CURRENT]` 为当前 master 可观察事实；`[STATIC INFERENCE]` 为从当前代码接口/调用方推断；`[ACCEPTED TARGET]` 为本轮已明确接受的 p-006 目标，不表示已落地；`[OLD REFERENCE]` 为旧 worktree 仅供对照；`[UNVERIFIED]` 为本轮未运行或不能由静态读取证明的内容。

## 1. 本轮范围、身份与证据方法

### 1.1 当前 checkout

- [CURRENT] checkout 为仓库主工作区，branch 为 `master`，`HEAD=73f37b4d3095aa9072de76fe0d4bdff240862deb`；本轮实际命令输出中的完整 revision 为 `73f37b4d3095aa9072de76fe0d4bdff240862deb`，证据 JSON 已使用完整值。
- [CURRENT] 开始读取时主工作区已有其它 Work/用户 staged、unstaged 与 untracked 改动；本 Task 只新增自己的 walkthrough/evidence，不覆盖、stash、reset 或删除其它改动。
- [CURRENT] Issue #191 为 OPEN，标签为 `type: maintenance`、`status: needs-design`，目标是主应用 UI 底座迁移；Issue 原始文字提到 Workbench/View，但 PM 分流和本轮接受目标已把 Workbench/View Host、插件运行时排除在本 Issue 外（来源：`issue://191?comments=0`）。

### 1.2 静态复核命令与实际结果

以下命令均以当前 master 工作树执行；没有把旧 worktree 的结果当作当前实现验证：

```text
git rev-parse HEAD && git branch --show-current
→ 73f37b4d3095aa9072de76fe0d4bdff240862deb / master

git ls-files 'packages/neuro-book/app/components/**/*.vue' | wc -l
→ 232

git ls-files 'packages/nb-ui/src/components/**/*.vue' | wc -l
→ 72

git ls-files 'packages/neuro-book/app/pages/*preview.vue' | wc -l
→ 14
```

路径集合的换行输出 SHA-256 为：

- `packages/neuro-book/app/components/**/*.vue`：`de84516842d968c231b5e6513ef402c0a43aa3493fc1786c1ba7f874d17e7629`。
- `packages/nb-ui/src/components/**/*.vue`：`558cd13441a1b6e995320825099704da046184a13cf386590208b9302167cc63`。
- `packages/neuro-book/app/pages/*preview.vue`：`b9a25c416823f0b1079ca4a0e2c71c87e5786b161b21ea1fac21838d6b11530a`。

[CURRENT] 用当前页面与旧 t163 页面逐一计算 SHA-256，14/14 相同、0/14 不同；当前组件路径集合与旧 t163 inventory 的 232 条路径集合也相等。这只证明本轮静态源集合没有漂移，不把旧 Task 的 owner/tier 或完成状态升级为 current。

本轮只对两个新 JSON 运行了：

```text
jq empty .agents/works/w00003-neurobook-ui-foundation-migration/tasks/t01-migration-design/evidences/component-baseline.json && jq empty .agents/works/w00003-neurobook-ui-foundation-migration/tasks/t01-migration-design/evidences/preview-scenario-baseline.json
→ 无输出，退出码 0
```

[UNVERIFIED] 未运行 `docs:check`、`governance:check`、formatter、lint、NeuroBook 产品测试、nb-ui 测试、typecheck、Product build、浏览器、真实 Provider/Model、真实 API、Desktop smoke、PR 或远端写入。

## 2. 当前 master 的 nb-ui 公开表面

### 2.1 包元数据与入口

来源：`packages/nb-ui/package.json`、`packages/nb-ui/src/index.ts`、`packages/nb-ui/src/components/index.ts`、`packages/nb-ui/src/composables/index.ts`、`packages/nb-ui/src/colorway/index.ts`、`packages/nb-ui/src/theme/index.ts`、`packages/nb-ui/src/module.ts`。

| 项目 | [CURRENT] 当前值 | 迁移含义 |
|---|---|---|
| 包名/版本 | `@notnotype/nb-ui` / `0.2.0-alpha.0` | 版本保持不变；本轮不发布 |
| 包形态 | `private: true`，`type: module` | 只能按 workspace/源码合同接入 |
| 当前许可证 | `PolyForm-Noncommercial-1.0.0` | [ACCEPTED TARGET] B 才切换为 `AGPL-3.0-only` 并补 Product 分发说明 |
| exports | `.`, `./nuxt`, `./components`, `./composables`, `./colorway`, `./theme`, `./themes/*`, `./testing`, `./utils`, `./styles.css` | 消费者只能使用这些公开入口；不深 import 私有文件 |
| peer | `nuxt ^4.3.1`、`vue ^3.5.24` | 接线前由 B 核验版本与构建 |
| 依赖信号 | `@nuxt/kit`、`@vueuse/core`、CVA、clsx、Reka UI、tailwind-merge | 浮层/表单行为不能按名称猜兼容 |
| CSS 入口 | `./dist/nb-ui.css`，由 `./src/tailwind.css` 构建 | B 负责与 UnoCSS/reset 做 CSS 会合 |

`src/index.ts` 当前重导出 colorway、version、composables、theme、utils；组件必须从 `@notnotype/nb-ui/components` 入口消费。`src/components/index.ts` 当前导出 72 个 SFC、配套 props/types、分页工具和 TimePicker 合同；分类计数为 controls 13、display 9、feedback 10、form 29、layout 7、navigation 4。

公开 composable 为 `useAnchoredPopup`、`useFloatingScrollbar`、`useNotification`、`useResizablePanel`。公开 utils 为 `resolveApiErrorMessage` 与 focus-trap 工具。theme 入口同时公开 tokens、z-index、manifest/loader/contracts、store、component registry、SVG defs；`src/theme/contracts.ts` 当前只登记 `time-picker@1`，不是主应用组件覆盖清单。

### 2.2 Nuxt module 与主题包

`packages/nb-ui/src/module.ts` 的当前行为是：默认无前缀自动注册组件和 composables，向 `build.transpile` 加入 `@notnotype/nb-ui`，扩展 Vite fs allow，并把 `dist/nb-ui.css` 推入 Nuxt CSS。主应用当前没有启用该 module；本轮目标明确选择显式 exports + 显式 CSS/转译，不把无前缀自动注册引入现有 common 自动注册碰撞。

当前主题目录有 `packages/nb-ui/themes/nbook/`、`macos/`、`editorial/`、`aurora/`。`themes/nbook/index.ts` 引入 `vars.css`（有 CSS side effect），并导出 `nbookTheme`；`themes/nbook/colorways.ts` 当前数据为 `nbook-light` 与 `nbook-dark` 两个 ID，各自 33 个配色变量。相对地，`src/colorway/presets.ts` 的库内置 `NbColorwayId` 当前只有 `dark`；它明确写有旧 id alias，且没有亮色内置配色。

[STATIC INFERENCE] 因为当前 package exports 没有 `./themes/nbook/colorways` 纯数据子路径，C 的 pre-hydration 首帧脚本不能在当前 master 直接安全导入该数据；[ACCEPTED TARGET] B 必须先提供不引 CSS 的纯数据入口，C 才能消费 `nbook-light`/`nbook-dark` 并保持运行时主题入口唯一。

## 3. NeuroBook 当前接入、组件与主题事实

### 3.1 包与 Nuxt/CSS

来源：`packages/neuro-book/package.json`、`packages/neuro-book/nuxt.config.ts`、`packages/neuro-book/uno.config.ts`、`bun.lock`、`packages/neuro-book/AGENTS.md`。

- [CURRENT] `packages/neuro-book/package.json` 没有 `@notnotype/nb-ui` dependency；`bun.lock` 的 workspace 记录只表明 monorepo 已解析 `packages/nb-ui`，不表明 NeuroBook 已声明消费。
- [CURRENT] Nuxt components 目录按顺序自动注册 `~/components/common`、`~/components/markdown-studio`、`~/components`，存在无前缀同名碰撞风险；modules 是 auth、Pinia、persistedstate、i18n、UnoCSS、color-mode、VueUse，无 nb-ui module。
- [CURRENT] CSS 顺序为 `the-new-css-reset/css/reset.css`、`nbook/app/styles/theme-vars.css`、`nbook/app/styles/reference-chips.css`、Vue Flow 的四份样式；无 nb-ui styles.css。
- [CURRENT] UnoCSS 使用 presetUno + presetIcons，并 safelist 全量 Lucide；不能把 nb-ui Tailwind 产物和主应用 UnoCSS 的 cascade 当成已经会合。
- [ACCEPTED TARGET] B 在获得依赖安装授权后添加精确 workspace dependency，把唯一 `@notnotype/nb-ui/styles.css` 放在 reset 后、领域样式前，补 transpile；不启用 nb-ui Nuxt module；lockfile 只由安装命令更新。

### 3.2 主应用 SFC 计数

当前扫描的 232 个 SFC 按顶层目录为：

| 目录/领域 | 数量 | [ACCEPTED TARGET] 最终批次 |
|---|---:|---|
| `common` | 42 | E/F，按子目录分批 |
| `dnd-test` | 2 | E（experimental） |
| `markdown-studio` | 10 | G |
| `novel-ide` | 158 | I–O，按领域路径拆分 |
| `profile-template-editor` | 14 | H |
| `workflow-preview` | 6 | O |

可复核的子目录分解：`common` = 顶层 14 + `form` 13 + `low-code-form` 11 + `diff` 4；`novel-ide` = 顶层 7 + `agent` 38（含 context-inspector 4、tiptap 1、trace-viewer 3）+ `ai` 1 + `history` 1 + `jobs` 2 + `plot` 45（含 chapter-panel 1、planning 8、thread-panel 6、timeline 5、tree 6、workbench 11）+ `profile` 2 + `rag` 5 + `settings` 21（含 theme 4）+ `workspace` 11 + `world-engine` 25（含 workbench-preview 7）。证据文件保留顶层统计与路径集合摘要，避免复制 232 条源码路径。

### 3.3 同名组件与直接消费边界

当前 `common` 与 nb-ui basename 重叠 **16** 个：`Combobox`、`ContextMenu`、`Dialog`、`DialogWindow`、`Dropdown`、`FormCheckbox`、`FormField`、`FormInput`、`FormNumberInput`、`FormSelect`、`FormTextarea`、`IconButton`、`NotificationViewport`、`SegmentedControl`、`TagInput`、`Tooltip`。这只是名字重叠，不是兼容证明。

静态接口差异要求以下 clean cutover 顺序：

- [CURRENT] `app/components/common/Dialog.vue` 的 `DialogSize` 有 `xl`=`min(960px, calc(100vw - 48px))`/`min(600px, calc(100dvh - 80px))`，`full`=`min(1120px, calc(100vw - 48px))`/`min(640px, calc(100dvh - 80px))`；默认 `closable: true`、Teleport 目标为 `.novel-ide-theme`，并可由产品监听 `request-close`。
- [CURRENT] nb-ui `feedback/Dialog.vue` 的 `xl`/`full` 几何为约 `1080px`/`calc(100vw - 24px)`，默认 `closable: false`、Teleport 到 `body`，增加 focus trap、取消/确认/关闭 label 与 `blur` overlay 选项。不能直接替换而不先固定行为合同。
- [CURRENT] 本地 `common/Dropdown.vue` 是原地 absolute div、`onClickOutside`、只有 `select` emit，没有 Reka 的 portal、碰撞、方向键/Home/End/Escape 和浮层滚动条；nb-ui `controls/Dropdown.vue` 使用 Reka、portal、collision、keyboard、`useFloatingScrollbar` 和 `focus` emit。E 迁移前必须按完整调用方与真实页面验证。
- [CURRENT] 本地 `common/IconButton.vue` 只有 `default|danger`、`sm|md`（24/28px），仅 title；nb-ui `IconButton.vue` 有 `default|danger|accent|secondary`、`sm|md|lg`（26/32/38px）、`ariaLabel`、`iconClass`、focus ring、零 Layout Shift 和 disabled 动效约束。不能用别名把两个合同混在一起。
- [CURRENT] `common` 仅有、且应保留产品语义的组件包括 `ReferenceChip`、`StructuredTextEditor`、`JsonViewer`、`FormColorField`、`SideDetailPanel`、`ReferencePlainTextEditor`、`ReferenceSelectorPopover`、`SkillChip`、Diff/Low-code 全部组件、`DesktopTitleBar`、图片预览和 Lucide picker 等 26 个 common-only 名称（完整集合见 evidence）。它们可以消费 nb-ui token/primitive，但不因此抽成公共库。
- [CURRENT] nb-ui-only 的 56 个名称是可候选的公共能力（如 `Button`、`Badge`、`Spinner`、`Tabs`、`Panel`、`Splitter`、`Listbox`、`Tree`、日期/时间/范围字段等），当前没有证明每个都已有 NeuroBook 消费者；实施时按实际调用方和契约测试启用，不能为了“覆盖 72 个”虚构迁移。

B 的第一个 nb-ui 消费者固定为 `packages/neuro-book/app/components/common/JsonViewer.vue` 的 6 个图标按钮（3 个 mode + 复制/展开/折叠 3 个 action）：逐项保持 title、disabled、click、iconClass 和 JSON 编辑行为，补 `aria-label`，切完删除该组件的旧按钮样式；JsonViewer 本身仍是产品 composite，不迁为通用库组件。

### 3.4 本地 composable/util 与 nb-ui 映射

- [CURRENT] `app/composables/useNotification.ts` 的输入支持 `html`、`position`、`offsetX/Y`、按 tone 的 duration、`autoClose`，并返回 `notify/remove/clear/success/warning/info/error`；nb-ui `useNotification` 是共享 ref，支持 `action`、`pause/resume`、`clearAll`，没有本地位置/HTML 契约。保留本地能力直到所有消费者完成 E 的合同切换，禁止 adapter/双队列。
- [CURRENT] `app/composables/useResizablePanel.ts` 与 nb-ui 版本的 `size/minSize/maxSize/edge/enabled/syncDuringResize/onResize/onResizeEnd` 近似，但本地有自己的调用方（`index.vue` 三处、`NovelIdeToolPanel`、`AgentModeSessionSidebar`、World Engine preview 面板等）。E–O 完整迁移调用方并验证宿主尺寸持有后，才能删除本地入口；不得同时保留两份可选实现。
- [CURRENT] 本地 `app/utils/api-error.ts` 除 message 外还解析 `statusMessage`、response `_data`、稳定 `code` 和 HTTP status，并有 i18n 默认 fallback；nb-ui utils 的公开 message 签名是 `(error, fallback)`，只取较窄的 message/data。涉及 agent/session/config 的调用方必须先固定 code/status 语义，不能直接批量替换。
- [CURRENT] 本地 `useFloatingPanelLayout.ts` 会计算最近 overflow 裁剪祖先、up/down/auto、宽度和 maxHeight；nb-ui `useAnchoredPopup.ts` 是另一种 Teleport 固定定位合同。FormSelect、ReferenceSelectorPopover、low-code dropdown、RefEditorPopover 仍依赖本地版本，不能以同名/近似用途替代。
- [CURRENT] 本地 `useDialog.ts` 还被 `app.vue` 装到 `window.$dialog/$notify`，提供 alert/confirm/prompt；它是跨入口的产品 authority，不可用 nb-ui Dialog 或 alias 隐藏差异。

### 3.5 当前主题 authority

来源：`packages/neuro-book/shared/theme/theme-vars.ts`、`packages/neuro-book/app/utils/theme/*`、`packages/neuro-book/app/stores/novel-ide.ts`、`packages/neuro-book/app/styles/theme-vars.css`、`docs/specs/theme/system.md`、`packages/neuro-book/app/utils/theme/README.md`。

- [CURRENT] shared 契约有 8 个内置 ID：`sepia`、`light`、`dark`、`catppuccin`、`dracula`、`monokai`、`one-dark-pro`、`tokyo-night`；有 36 个无 `--` 前缀变量名和 `CustomThemeDto`。
- [CURRENT] `theme-tokens.ts` 是 8 套字面值事实源；`resolve-theme.ts` 未知 ID 回退 `sepia`；`apply-theme.ts`、`derive.ts`、`theme-editor.ts`、`theme-io.ts`、`notification-tone.ts` 共同服务旧主题流程。
- [CURRENT] `app/styles/theme-vars.css` 提供 `:root,.novel-ide-theme` 的 Sepia fallback，并在 `.world-engine-workbench-theme` 里把 `--we-*` 映射到 IDE 变量。`IDE_THEME_HOST_CLASS` 的字面值为 `novel-ide-theme`，被 Dialog/Tooltip/ContextMenu/Monaco 等 closest/Teleport 结构使用。
- [CURRENT] `novel-ide` store 持有 `activeThemeId`、`customThemes`、`activeThemeAppearance`、`themeVarsSnapshot` 与旧 apply 方法；`NotificationViewport` 读取 store snapshot，不能在 C 前自行改变颜色 authority。
- [CURRENT] `docs/specs/theme/system.md` status 为 `implemented`、capability 为 `theme.system`，描述的正是上述 8 套/自定义主题流程；当前 master 没有 `ui.component-contracts` 或 `ui.component-lab` planned Spec。
- [ACCEPTED TARGET] B 先完成 nb-ui AGPL、nbook 两套 33 变量及纯数据 colorways。B 闭合后、Leader 创建/派发 C Task 之前，必须把同一个 `docs/specs/theme/system.md` 从当前 `status: implemented` 原地改为已批准目标的 `status: planned`，并通过 `docs:check` 与语义门禁；不得创建平行 theme Spec。C 代码与测试闭合、行为证据满足目标后，才把该同一文件从 `planned` 原地恢复为 `implemented`。C 的目标是把唯一持久化配置改为 `ui.colorway` 的 `system|nbook-light|nbook-dark`，删旧 `ui.theme`/`ui.customThemes`/8 套主题 editor 与 snapshot authority，保留 `.novel-ide-theme` 作为 overlay host class（改名为 `IDE_OVERLAY_HOST_CLASS`，值仍相同），并把 `--we-*` 作为派生别名而非第二颜色源；本轮不修改该 Spec 或源码。

## 4. 14 个 preview 页面与 31 个稳定 scenario

### 4.1 精确源集合

当前使用 `packages/neuro-book/app/pages/*preview.vue`，集合为：

1. `diff-workbench.preview.vue`
2. `dnd.preview.vue`
3. `model-settings.preview.vue`
4. `plot-thread.preview.vue`
5. `plot-timeline.preview.vue`
6. `plot-tree.preview.vue`
7. `plot-workbench.preview.vue`
8. `plot.preview.vue`
9. `structured-text-editor.preview.vue`
10. `subject-state-viewer.preview.vue`
11. `tsx-profile-editor.preview.vue`
12. `workflow.preview.vue`
13. `world-engine.preview.vue`
14. `world-engine.workbench-preview.vue`

[CURRENT] expected/actual 14 条精确相等、无 missing/unexpected；`*.preview.vue` 只会得到 13 条并漏掉 `world-engine.workbench-preview.vue`，因此 A 必须冻结 `*preview.vue` 而非窄 glob。14 个当前源文件 SHA-256 与旧 t163 worktree 逐字一致，但这是静态源复核，不是浏览器行为复核。

### 4.2 scenario 统计与唯一 destination 方向

完整 31 条 `id/page/kind/ownerTask/fixture/observable/sourceEvidence`，以及适用时的 `currentTrigger`、`targetFormalSurface`、`labFixture`，在 `evidences/preview-scenario-baseline.json`，不复制用户数据或大段源码。每个 `product-behavior` 都必须同时保留可由 current source 证明的 `currentTrigger` 与已接受目标 `targetFormalSurface`；目标字段不表示当前正式入口已迁移或已验证。

| 页面 | scenario 数量 | kind | [ACCEPTED TARGET] owner/destination |
|---|---:|---|---|
| `workflow.preview.vue` | 6 | product 2 / demo 4 | O；两条 product 分别由当前正式 `/api/agent/workflow/runs` 与真实副作用 `/api/agent/workflow-demo/runs` 触发，`targetFormalSurface` 是 Agent Composer Dialog（目标，未验证）；4 条 demo 归 O-owned Lab |
| `world-engine.workbench-preview.vue` | 1 | demo | N；M 提供 mock/data，N 收口 workbench destination |
| `world-engine.preview.vue` | 1 | product | N；当前页面选择 ready Project 后直接调用 schema/subjects/slices/state API；目标为正式 World Engine Workbench/editor host |
| `tsx-profile-editor.preview.vue` | 1 | product | H；当前页面直接挂载 user-profile Visual Editor 并调用 profiles source/compile API；目标为 Profile Template Editor 正式 surface |
| `subject-state-viewer.preview.vue` | 1 | demo | M；确定性 Subject State Viewer Lab |
| `structured-text-editor.preview.vue` | 1 | demo | F；确定性 Structured Text Lab |
| `plot.preview.vue` | 4 | demo | K；locator/thread/chapter/tree 对应 Plot 正式 view + Lab fixture |
| `plot-workbench.preview.vue` | 1 | demo | L；PlotWorkbenchDialog 正式 surface + Lab fixture |
| `plot-tree.preview.vue` | 1 | demo | K；PlotTreeView 正式 view + Lab fixture |
| `plot-timeline.preview.vue` | 3 | demo | K；三个 phase 各有确定性 timeline fixture |
| `model-settings.preview.vue` | 1 | product | J；当前页面直接挂载真实 Model Settings 并调用 config/discovery/check API；目标为 Settings/Account 正式 surface |
| `plot-thread.preview.vue` | 1 | demo | K；Plot thread panel 正式 view + Lab fixture |
| `dnd.preview.vue` | 2 | demo | E；experimental dnd-test Lab fixture |
| `diff-workbench.preview.vue` | 7 | demo | F；markdown/profile/json/deleted/markers/long/binary Lab fixtures |
| **合计** | **31** | **5 product / 26 demo** | owner 计数 O6/N2/H1/M1/F8/K9/L1/J1/E2 |

特别说明 `preview.workflow.real-fanout`：它保持 `product-behavior`，当前触发器是 `/api/agent/workflow-demo/runs`；分类依据是该 trigger 执行真实 Provider/Model 与 NeuroBook session 的副作用，不能降为 deterministic Lab。`Agent Composer` 只是 `targetFormalSurface`，截至本 Task 没有真实迁移 evidence，不能称为当前正式入口。
其余四条 `product-behavior` 也保留 current/target 分离：formal catalog 当前由 `startFormalRun()` 调用 `POST /api/agent/workflow/runs`；World Engine 当前由 preview 页的 ready Project 和 schema/subjects/slices/state API 驱动；Profile Editor 当前由 preview 页挂载的 `ProfileTemplateVisualEditor mode="user-profile"` 及 profiles API 驱动；Model Settings 当前由 preview 页挂载的 `NovelIdeModelSettingsPanel` 及 config/discovery/check API 驱动。四条目标 surface 都是迁移 destination，不冒充当前入口已迁移或经过浏览器验收。

稳定粒度已冻结：workflow 的 6 个稳定场景 key、plot 的 4 个 view key、timeline 的 3 个 phase key、diff 的 7 个 document id、dnd 的 volume/chapter 两种独立行为；不因 theme、viewport、readonly、side-by-side、size 或普通参数变体拆分。后续 E–O 只能为这些 ID 填 destination/evidence，不得增删或改 kind；确需改变必须回 Proposal/Spec 审查。

关键 ownership 约束：World Engine `world-engine.preview.vue` 的 product 场景和 `world-engine.workbench-preview.vue` 的 demo 场景最终都归 N；M 可串行提供 mock/data/deterministic fixture，但不能产生 M/N 双 owner。K 的关闭边界是上述 4 个 source 页/9 个 scenario；L 只接收 `plot-workbench.preview.vue` 的 1 页/1 场景。Workbench/View Host 不因场景表进入本 Work。

## 5. 最少纵向切片与依赖顺序

下表是本轮接受的最小顺序，不把旧 worktree 的完成状态写成当前代码：

| 顺序 | 子 Issue/切片 | 允许范围 | 依赖 | 关闭前必须删除/清理 |
|---|---|---|---|---|
| A | `ui: component contracts and catalog baseline` | 两份 planned Spec 后，frontend standard 组件合同、232 SFC pending catalog、31 scenario baseline 与静态测试 | 开发者已接受目标；两份 planned Spec 已登记并通过 docs/语义门禁 | 不删除产品入口；只关闭设计基线与静态合同 |
| B | `ui: adopt nb-ui package and license decision` | AGPL 元数据、nbook 数值/纯数据 colorways、workspace dependency/CSS/transpile、JsonViewer 六按钮 | A | 所有消费者切完才删旧按钮样式；不改 catalog |
| C | `ui: cut over to nbook theme and nbook colorways` | config DTO/normalizer/store/settings/client variables clean cutover，删除旧主题 editor/authority | B 闭合；创建/派发 C Task 前 `theme.system` 原地 `implemented → planned` 并通过 docs/语义门禁 | 全部旧 theme/custom snapshot/alias/旧入口与调用方归零；C 代码/测试闭合后同一 Spec 原地 `planned → implemented` |
| D | `ui: add dev-only NeuroBook component lab` | Source Dev-only module、catalog/registry aggregate 消费、Lab chrome/query/inspector、Product client+Nitro exclusion 证据、ReferenceChip | A/B/C | 旧 preview 仍保留；Product 构建不得带 Lab 路由/fixture |
| E | common primitives + product chips | common 顶层、`dnd-test/**`、notification/resizable、ReferenceChip/JsonViewer 后续 composite | D | E-owned pending 全 ready；完整调用方与旧入口归零 |
| F | forms/low-code/diff | `common/form/**`、`common/low-code-form/**`、`common/diff/**` | E | 表单/编辑器/diff consumer 与测试、窄屏 evidence 闭合 |
| G | Markdown Studio | `components/markdown-studio/**` | F | Studio 正式 surface 行为不降级 |
| H | Profile Template Editor | `profile-template-editor/**` | F | Profile editor 正式 surface + fixture 闭合 |
| I | shell/workspace/project/rag/history/jobs | Novel IDE shell、`workspace/**`、`rag/**`、`history/**`、`jobs/**`、`ai/**`、`profile/**` | E、G | 数据 owner 留在 host/controller |
| J | settings/account | settings、`NovelIdeSettingsDialog.vue`、账户/Admin；C 后不再维护旧 theme editor | C、E | Settings/Account 正式 surface 闭合 |
| K | Plot views | 顶层 Plot、`tree/**`、`timeline/**`、`thread-panel/**` | D、E | 关闭条件为 4 个 source 页（`plot.preview.vue`、`plot-tree.preview.vue`、`plot-timeline.preview.vue`、`plot-thread.preview.vue`）/9 个 scenario 各有唯一 fixture/formal evidence |
| L | Plot workbench/planning | `plot/workbench/**`、`planning/**`、`chapter-panel/**`、`NovelPlotPanel.vue` | K | 关闭条件为 1 个 source 页（`plot-workbench.preview.vue`）/1 个 scenario 有唯一 fixture/formal evidence；PlotWorkbenchDialog 与 planning authority 不变 |
| M | World Engine editors/inspectors | World Engine 叶子 editor/view、workbench-preview mock/data 解耦；N-owned SFC 仍由 N 关闭 | D、E | M 只交 fixture/data，不改派 N owner |
| N | World Engine workbench host | host/API ports/正式入口、workbench-preview rename、两页 scenario destination/import | M、I | project ready revision、脏草稿、保存互斥和 alias 语义有真实证据 |
| O | Agent/Workflow surfaces | agent、workflow-preview、Composer 正式 Workflow Dialog/API ports；不新增 `/workflow` | D、E、I | durable Job/Session truth 不迁入组件；6 个 workflow scenario 闭合 |
| P | retire preview routes and close catalog | 删除 14 preview 路由/链接/专属 mock，解析全部 scenario，pending=0 | F–O | 全部产品/Source Dev/桌面/窄屏与 Product build 门禁闭合 |

纵向协议固定为：先以 LSP references 找完页面/父组件/动态组件/测试调用方；分类为 presentational/composite/workspace；把 API/Pinia/storage/Project/Session/轮询/持久化移到 host/controller/typed port；SFC 只保留 view model、受控值和 action callback；切换全部消费者；focused test + 真实 surface smoke；最后删除旧 import、旧样式、旧 controller 片段和不再使用的 mock。不能用 adapter、alias、双入口或静默 fallback 延长迁移期。

## 6. 首个 A 切片设计

### 6.1 依赖与职责

A 的前置门禁不是“恢复旧 worktree 文件”，而是：

1. 开发者本轮指令明确接受 p-006 的目标；本 t01 current evidence 固定 232 个 SFC、14 个 preview 源和 31 个 scenario。旧 worktree p-006 只作非 canonical 目标参考，不要求先合入或恢复 Proposal，也不把它当当前 accepted 文件；当前 master 没有 canonical p-006 Proposal。
2. Leader 在 t01 闭合后创建并登记两个 `status: planned`、`owners: [ui]` 的 Spec：capability 精确为 `ui.component-contracts` 与 `ui.component-lab`；它们的批准依据是“开发者本轮明确接受目标 + t01 current evidence”。
3. 两份 Spec 通过 docs check 与语义门禁后，Leader 才创建唯一 A 实现 Task；A Task 只消费合同，不自行创建自己的行为合同。

`theme.system` 是同一个已实现能力的原地迁移：B 完成后、Leader 创建或派发 C Task 之前，必须先把 `docs/specs/theme/system.md` 从 `implemented` 原地改为已批准目标的 `planned`，并通过 docs check 与语义门禁；C 的代码、测试和行为证据闭合后，才可把该文件原地恢复为 `implemented`。本轮仅记录此门禁，不修改该 Spec。

A 只做四件事：

- 在 `docs/standards/code/frontend.md` 增补可机器稳定理解的组件合同要求（props、emits、slots、a11y、状态边界、390px/零布局位移等），不改产品组件行为。
- 建立 A-owned catalog types，并按最终 owner 建立互不重叠的 slice 文件；232 个 entry 每条只出现于一个 slice。aggregate 只 import/concat 各 slice，再做 exact coverage、唯一性、层级与状态校验，不复制第二份 entry 记录；页面、`app.vue`、`dev/lab` 不进 catalog。
- 冻结 14 个 preview 源路径以及 evidence JSON 的 31 个 scenario ID/kind/page/粒度；后续任务只填 destination/evidence。
- 增加静态合同测试，证明物理 repo path 经 source normalization 与 catalog 虚拟 path 无损双射、slice 并集 exact 覆盖、id 唯一、parent 存在且无环、pending/blockingReason、scenario source exact match 与 scenario ID 唯一；A 不创建可运行 Lab fixture，不把任何条目标成 ready。

A 的 catalog 类型基线为：

```ts
type NeuroBookComponentTier = "presentational" | "composite" | "workspace";
type NeuroBookComponentMaturity = "experimental" | "supported";
type NeuroBookComponentStatus = "pending" | "ready";
type NeuroBookComponentDependency = "api" | "pinia" | "storage";

type NeuroBookComponentCatalogEntry = {
  id: string;
  source: `nbook/app/components/${string}.vue`;
  label: string;
  group: "common" | "editor" | "workspace" | "settings" | "plot" | "world-engine" | "agent" | "workflow" | "profile" | "experimental";
  parentId: string | null;
  tier: NeuroBookComponentTier;
  maturity: NeuroBookComponentMaturity;
  status: NeuroBookComponentStatus;
  description: string;
  dependencies: readonly NeuroBookComponentDependency[];
  blockingReason?: string;
};
```

初始 232 条全部 `pending`，且每条都要有具体 `blockingReason`；pending 不渲染，ready 必须有 deterministic fixture；parentId 只能指向另一个 catalog entry，禁止环。catalog 的 `source` 保持虚拟格式 `nbook/app/components/<relative-path>.vue`，不能把物理 `packages/neuro-book/...` 路径直接写入公共合同。A 建立按最终 owner 划分的唯一 slice 集合；E–O 以后各自只修改自己的 slice，A-owned types/aggregate 保持唯一索引，aggregate 仅 import/concat，不形成第二真相源。tier/maturity/owner 是静态候选，不可伪装成运行验证。
物理路径双射合同为：`physicalToCatalog` 只精确移除一次 `packages/neuro-book/app/components/` 前缀，`catalogToPhysical` 只精确添加一次该前缀，relative path 原样保留；两种 round-trip 必须逐字相等。越界、绝对路径、空 relative path、包含 `..` 段以及非 `.vue` 输入均拒绝。A 的静态测试以当前 `git ls-files` 232 条物理路径逐条验证双射、拒绝集合和 slice 并集，不以文本替换或 basename 推断覆盖。

### 6.2 A 不做什么

A 不修改 `packages/neuro-book/package.json`、`bun.lock`、`nuxt.config.ts`、UnoCSS、任何产品 SFC/composable/store/theme、任何 preview 页面、服务器/API、`packages/nb-ui` license/colorway/CSS、Lab module、Product builder 或 Workbench/View Host。A 不删除旧 route，不实现 ReferenceChip fixture，不切 JsonViewer，不改变 `theme.system`。

### 6.3 A 的验证矩阵

| 层级 | A 应运行/记录的验证 | 预期 | 本 t01 状态 |
|---|---|---|---|
| 路径 | `git ls-files packages/neuro-book/app/components/**/*.vue` 与 preview `*preview.vue`，比较 aggregate/14 source | 232 路径各一次；14/14 exact；31 ID 唯一 | [CURRENT] 已静态运行计数；A 测试未运行 |
| 合同 | `bun --cwd packages/neuro-book run test -- dev/lab/component-catalog.test.ts dev/lab/preview-scenario-baseline.test.ts` | pending 全带 blockingReason；parent 无环；scenario kind 不漂移 | [UNVERIFIED] |
| 类型 | `bun --cwd packages/neuro-book run typecheck` | A 新增类型/测试可编译 | [UNVERIFIED] |
| 治理/差异 | 根 `bun run docs:check`、`bun run governance:check`、`git diff --check` | Task/Spec/路径治理闭合、无 whitespace error | [UNVERIFIED] |
| 真实桌面 | 后续 B–O 在真实 NeuroBook surface 使用约定 `1440×900`（必要时现有任务使用的 `1440×1000` 也须记录实际值）验证行为、主题、焦点、键盘和 overflow | 不把 nb-ui playground 当主应用验收 | [UNVERIFIED]；A 没有 ready Lab surface，不能宣称通过 |
| 真实窄屏 | 后续 B–O/P 在真实 surface 使用 `390×844`，验证核心操作仍可完成、`scrollWidth===clientWidth` 或无页面级横溢出、浮层/按钮不重叠 | 390 是 phone 固定视口；不是只拍截图 | [UNVERIFIED]；A 只冻结要求 |
| Source Dev Lab | D 才创建 `/lab` 与 `responsive/phone/tablet`（phone=390×844、tablet=768×1024）；A 不提前挂 route | Lab 不读取真实 API/Pinia/storage | [UNVERIFIED] |
| Product | D/P 才获 Product build/browser 授权后运行真实 Builder，断言 client 与 Nitro 图/文本不含 `dev/lab`、fixture、path/sentinel | Product 无 `/lab`，不把开发态入口打入产品 | [UNVERIFIED]；本 Task 明确排除 |

因此，“A 有桌面/390px surface”在合同上的准确含义是：A 冻结 downstream 必须验收的真实 surface 和尺寸，而不是凭静态 catalog 宣称视觉通过。若没有真实页面、浏览器授权或实际运行结果，必须写 `unverified`，不能转为 `notRun` 后关闭 required 门禁。

### 6.4 A 的回滚边界

A 是 additive、可独立回滚的设计切片：回滚只移除 A 新增的 frontend contract/catalog/types/static tests/baseline evidence，不改变任何产品运行代码、依赖、lockfile、CSS、主题、route 或数据。之后 B/C/D 不得依赖未冻结的第二份清单；若 A 回滚，后续切片必须停止，不得从旧 t163 文件偷偷恢复第二真相源。

## 7. 旧入口删除、Product 排除与停止条件

### 7.1 14 个旧 preview route 的删除条件

P 之前不得删除任一 preview 页面或链接。全部条件同时满足才可清退：

1. 232 个 catalog entry 全部 `ready`，每条有唯一 fixture/真实 surface evidence，旧 import/动态引用为零；
2. 31 个冻结 scenario 全部有合法唯一 destination：`demo-only` 有确定性 Lab component/scene/test，`product-behavior` 有正式 surface 与真实 evidence；不能用 `pending=0` 替代场景证据；
3. 14 个源文件、导航链接、preview 专属样式/mock 和 route-only controller 已删除，并由 P 对 A 的 exact source list 逐项断言不存在；普通业务词 `preview` 不作为归零条件；
4. Product Builder 的 client Vite 图、Nitro Rollup 图和文本/manifest 均证明没有 `dev/lab`、fixture 名、绝对 path 或 sentinel；Source Dev `/lab` 仍只在 dev 分支注册；
5. B–O 的 focused tests、typecheck、真实 Product surface browser smoke、`390×844` 与桌面验收均有当前 revision 证据；Product build、Desktop smoke、Source Dev browser、Product browser 的授权分别齐全；
6. 没有 alias、adapter、双入口、旧主题/颜色 snapshot 或静默 fallback；旧实现只有在所有消费者切换后才删除。

### 7.2 Product 与 Workbench 排除

- 本 Work 不建立 Workbench/View Host、View Registry、Editor Split、插件运行时、第三方扩展 API 或新的 `/workflow` 页面；Workflow 正式运行迁到既有 Agent Composer Dialog，demo 才进入 Lab。
- Source Dev Lab 不是 Product 功能；`/lab` 在 Product 构建中必须无 route，client/Nitro 图也不能含 dev/lab。不能用运行时 env/middleware 把 Product route 隐藏来规避构建证据。
- A/t01 不运行真实 API、真实 Provider/Model、真实 Project/session、Product Builder、Desktop app 或人工浏览器。后续受限动作必须逐项授权，不能因 Spec/Task planned 或静态测试通过而推导授权。

### 7.3 必须停止并回报的情况

任一条件出现，保留 pending/blocked 证据并停止扩大实现：

- current master 的 232 路径或 14 source 集合发生变化，且无法由路径/合同唯一解释；
- scenario kind、stable ID、formalSurface 或 owner 需要产品取舍，尤其 World Engine 出现 M/N 双 owner；
- 组件解耦必须改变数据 owner、权限、持久化、并发/取消、错误/恢复或可观察交互，现有 Proposal/Spec 不能推出唯一行为；
- nb-ui 公开 props/emits/keyboard/ARIA/SSR/CSS 合同不足，直接替换只能靠 adapter、alias 或静默 fallback；先回 B/公共 API 合同，不在 NeuroBook 偷补第二套 primitive；
- planned Spec 尚未登记、治理 root/Task identity 冲突、required test/browser/Product build 授权缺失；
- 任何人试图把旧 t162/p-006/t163 的 `accepted/completed`、旧 revision 或旧浏览器截图写成 current master 已落地事实。

## 8. 与旧 p-006/t163 参考的差异

### 8.1 仍成立的候选内容

- [OLD REFERENCE] `.worktree/t162-ui-foundation-proposal` 中的 p-006 方案和本轮开发者接受的 A–P 顺序、AGPL/Product 分发目标、nbook-light/nbook-dark 目标、唯一 authority、无 alias/adapter、Source Dev-only Lab、14 页清退边界，仍是本轮可消费的目标参考。
- [OLD REFERENCE] `.worktree/t163-ui-migration-baseline` 的组件路径集合 232、14 页路径集合、31 scenario ID/kind、domain/task 计数与当前 master 静态复核一致；因此它们可作为候选 destination/fixture 线索。
- [CURRENT] 本轮重新计算确认 14 个 preview 文件内容与 t163 对应文件 14/14 字节相同；但 owner/tier/destination 仍要由 A 在 current master 合同中重生成和锁定。

### 8.2 不能写成 current accepted/implemented 的内容

- 当前 master 没有 `docs/proposals/p-006-neurobook-ui-foundation.md`；不能把旧 worktree Proposal 的 `accepted` frontmatter 当作 canonical Proposal 状态。
- 当前 `docs/specs/README.md` 的“待实现规范”仍为空，没有 `ui.component-contracts` 或 `ui.component-lab`；两份 planned Spec 尚未创建。
- 当前 nb-ui 仍是 `PolyForm-Noncommercial-1.0.0`，主应用仍无 `@notnotype/nb-ui` dependency，仍无 nb-ui CSS/transpile/module 接线；AGPL、纯数据 colorways export、JsonViewer consumer、主题切换与 Lab 都尚未落地。
- 当前 `docs/specs/theme/system.md` 仍是 `status: implemented` 的旧 8 套主题/自定义主题合同；C 的 colorway clean cutover 尚未发生，不能写成 `ui.colorway` 已实现。
- t163 evidence 的旧 `sourceGlob` 是 `packages/neuro-book/app/pages/*.preview.vue`，会漏掉 `world-engine.workbench-preview.vue`；本交付改用 `*preview.vue` 并把 exact 14 集合写入新 evidence。旧 t163 Task status `completed` 只属于旧 worktree，不是当前 t01 状态或产品实现证据。

## 9. 交接与未验证项

### 9.1 本 Task 实际文件

本轮只新增 t01 直属产物：

- `.agents/works/w00003-neurobook-ui-foundation-migration/tasks/t01-migration-design/evidences/component-baseline.json`
- `.agents/works/w00003-neurobook-ui-foundation-migration/tasks/t01-migration-design/evidences/preview-scenario-baseline.json`
- `.agents/works/w00003-neurobook-ui-foundation-migration/tasks/t01-migration-design/walkthroughs/001-current-baseline-and-slices.md`

未修改 Proposal、Spec、Work/Task README、产品源码、依赖、lockfile、其它 Work，也未 commit/push/创建 PR。

### 9.2 给 Leader 的下一安全动作

无需开发者重新决定已明确的目标。Leader 下一步应在获准的交付环境中：

1. 依据本交付重新核对 Proposal/Git/Issue/Task 门禁；
2. 创建并登记 `ui.component-contracts`、`ui.component-lab` 两份 `planned` Spec，运行 docs check；
3. Spec 闭合后创建唯一 A 实现 Task，明确它只消费本 walkthrough/evidence，随后由 A 实现者运行静态合同测试；
4. A 完成且验证闭合后才按依赖顺序派发 B，再由 B→C→D 逐步建立真实 surface 证据。

[UNVERIFIED] 需要后续授权/实现才能回答的事项包括：nb-ui 与 UnoCSS 的真实 cascade、Dialog/Dropdown/Form/Notification 的行为兼容、nbook 首帧无 FOUC、Lab URL/inspector、Product 图排除、1440/390 真实页面交互以及 14 页最终清退。它们已在 A/P 验证矩阵和停止条件中保留，未被本设计交付伪装成通过。
