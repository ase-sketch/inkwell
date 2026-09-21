---
schema: nbook.walkthrough/v1
taskId: t01-migration-design
sequence: 4
role: tasker
status: verifying
createdAt: 2026-08-29T00:00:00Z
---

# t01：调用方映射与删除门禁证据

## 结论

本轮按 walkthrough003 的更正要求补齐了逐 surface 的调用方、合同差异、目标 owner 与删除门禁证据。t01 恢复为 `verifying`，尚未闭合；证据闭合前不创建 `ui.component-contracts`、`ui.component-lab` 或 A 实现 Task。本轮没有修改产品源码、Proposal、Spec、Work/Task README、依赖、lockfile 或远端内容。

新增产物为 [`../evidences/surface-caller-migration-map.json`](../evidences/surface-caller-migration-map.json) 与本 walkthrough004；此前 walkthrough001–003 的历史结论保持不变。

## 1. 覆盖与实际 artifact

证据文件 `schema=nbook.evidence/surface-caller-migration-map/v1`、`format=compact-v1`，以当前 revision `73f37b4d3095aa9072de76fe0d4bdff240862deb` 为基线，包含 **29** 条独立记录；文件 **179,932 bytes / 1 行**（小于 180 KB）。完整 caller path 没有因压缩丢弃：每个 surface 的 `directCallers.product` 与 `directCallers.test` 保留完整路径，refs 编码为 `line:kind;line:kind`，并由顶层 `sharedContracts.callerDiscovery.refKinds` 记录短 kind 的含义，仍保留每个必要行号和引用种类。
- **16/16** 个 local common 与 `@notnotype/nb-ui` 同名组件：`Combobox`、`ContextMenu`、`Dialog`、`DialogWindow`、`Dropdown`、`FormCheckbox`、`FormField`、`FormInput`、`FormNumberInput`、`FormSelect`、`FormTextarea`、`IconButton`、`NotificationViewport`、`SegmentedControl`、`TagInput`、`Tooltip`。
- 1 个独立 sidecar type surface：`DropdownItem`（local `dropdown.types.ts` → public `@notnotype/nb-ui/components#DropdownItem`），不由 `Dropdown` 组件记录代替；当前 **7** 个产品 type-only caller path 均逐项留痕。
- 5 个 local composable/util：`useNotification`、`useResizablePanel`、`useFloatingPanelLayout → useAnchoredPopup`、`useDialog`、`resolveApiErrorMessage`。
- package public exports/dependency、Nuxt auto-registration、Nuxt module/transpile、CSS entry、theme/colorway authority，以及单独的 dynamic component/string-path risk register。

调用方按 surface 去重并在 `directCallers` 内拆分 `product` 与 `test`，不再复制三份相同 caller 数组：

- 16 个组件合计 **178** 个 caller path entry（产品 **168**、测试 **10**）。测试中的 `new URL` 源路径、`toContain` 模板/导入字符串也保留在 test 数组中，不冒充产品运行时 caller；`IconButton` 当前显式 import、PascalCase/kebab-case tag 为 **0**，但 B 的首个目标消费者仍记录为 `JsonViewer.vue` 的 6 个语义图标按钮。
- 5 个 composable/util 按 identifier/path-string 搜索合计 **131** 个 caller path entry（产品 **120**、测试 **11**）；其中 `useNotification` 与 `resolveApiErrorMessage` 各纳入 `packages/neuro-book/plugins/api-fetch.client.ts`（分别为 `1:import;9:id`、`1:import;21:id`），插件目录与 app/tests 一并纳入 scope/search roots/所有 symbol commands。
- sidecar `DropdownItem` 有 **7** 个产品 type-only caller path entry（其中 `Dropdown.vue` 为组件内部依赖，另 6 个为业务 caller）；theme authority 合并登记 **92** 个直接 source/config consumer path。
- 4 个迁移 composable/util 另保留 `localModule`、`targetModule`、`currentName`、`targetName` 和共享 `symbolBindingProtocol`：同名 target identifier **不要求归零**，而是要求剩余调用所在 TS/Vue 文件显式从公开 target module 导入；`useFloatingPanelLayout` 明确改名为 `useAnchoredPopup`。
重复的 caller-discovery、dynamic-risk、通用 deletion/unverified/stop 规则统一放在顶层 `sharedContracts`；记录保留 surface-specific pattern、`currentContractSummary`/`targetContractSummary`、差异、owner/batch、gate override 与 zero command。

## 2. 复核方法与 current/target 边界

### 2.1 [CURRENT] 可观察事实

- 已读取 16 个 local SFC 与 16 个 nb-ui 对应 SFC 的 props/emits/types；同 basename 只作为候选索引，**不作为兼容证明**。
- 当前主应用仍通过 `nbook` alias、`~/components/common` 等目录自动注册 local 组件；`packages/neuro-book/package.json` 没有 `@notnotype/nb-ui` dependency；`nuxt.config.ts` 没有 nb-ui module、transpile 或 styles entry。
- 当前 local `useNotification`、`useFloatingPanelLayout`、`resolveApiErrorMessage`、`useDialog` 的合同与 nb-ui 对应入口不同；`useDialog` 在 `app.vue` 安装 `window.$dialog/$notify`，是必须保留的产品 authority。
- 当前主题 authority 仍是 8 个主题、36 个变量、`theme-tokens.ts`/`shared/theme/theme-vars.ts`/`novel-ide` store/`theme-vars.css`；nb-ui 目标入口分离 theme 与 colorway，并提供 `nbook-light`/`nbook-dark`。

### 2.2 [ACCEPTED TARGET] 设计映射，不代表已落地

- A → B → C → D → E–O → P 顺序保持不变。组件 owner/batch 已在 JSON 中逐条登记：B 负责 package adoption 与 JsonViewer 六按钮（`IconButton` 只依赖 A）；E 负责 common primitive、notification/resizable；F 负责 forms/low-code/diff；C 负责唯一 theme/colorway clean cutover；错误工具由 E 定义/保全合同、E–O 各 owner 随 caller 切换、P/Leader 最终 zero-reference；`useDialog` 保持 product-shell authority，不迁 caller、不删除 local entry。
- 目标组件只从 `@notnotype/nb-ui/components` 公开入口消费；目标 composable/util 只从公开 `@notnotype/nb-ui/composables`/`utils` 入口消费；不深 import `packages/nb-ui/src/**`，不新增 alias、adapter、兼容分支、双队列或静默 fallback。
- B 的 Nuxt 边界是保留 local auto-registration，显式导入 nb-ui 组件，并在 CSS/transpile 侧各保留一个 owner；不启用默认无前缀 nb-ui module，以免和 local common 同名组件碰撞。

## 3. 合同差异与停止边界

JSON 的 `contractDifference` 是每个 surface 的切片级停止依据，尤其包括：

- `Dialog`/`DialogWindow`：Teleport 默认目标、Dialog `closable` 默认值、xl/full 几何、focus trap、glass/token 与 close control 均不同；local `useDialog` 的 `h(Dialog)` 动态依赖必须在 Dialog 删除前明确处理。
- `ContextMenu`/`Dropdown`：local item 的 `danger` 与 nb-ui 的 `tone` 不同；Dropdown 的 Reka portal、collision、keyboard、disabled 与浮层滚动条不是 local absolute panel 的同名替换。
- `FormField`/`FormInput`/`FormSelect`/`FormTextarea`/`FormCheckbox`/`FormNumberInput`：nb-ui 新增 field context、id/name/required/aria、不同默认尺寸或 emits；FormSelect 的 local `useFloatingPanelLayout` 与目标 Reka portal 不同，所有 type-only `SelectOption` caller 也在清单中。
- `Combobox`/`TagInput`/`SegmentedControl`/`Tooltip`：options/type、`accentStyle → tone`、`wrap` 默认值、`showDelay/hideDelay → delay`、默认 placement 与定位/material 均需逐 caller 显式处理。
- `NotificationViewport`/`useNotification`：local 的六位置、offset、html、autoClose 与 nb-ui 的共享 ref、action、pause/resume 不是同一合同；不得保留双队列。
 - `resolveApiErrorMessage`：local 还解析 `statusMessage`、嵌套 response、code/status 并读取 i18n 默认文案；nb-ui 版本要求 fallback 且只提供较窄的 message 解析。未固定 code/status/fallback 语义前停止切换；`api-error.ts` 不能因 message 单项归零而误删，必须另以 named export gate 同时清理 `resolveApiErrorCode`/`resolveApiErrorStatus`。

因此记录状态主要为 `staticInference-blocked`：current 合同和静态 caller 已有证据，目标 runtime、构建、视觉、focus/portal 与 390px 行为仍不是本轮已验证事实。

## 4. 删除门禁与动态风险

- **组件 A/B**：A `localPathCommand` 只匹配带边界的 exact module token `nbook/app/components/common/(form/)?<Name>(.vue)?` 或 `components/common/(form/)?<Name>(.vue)?`，后续必须是引号、空白或结尾，并通过 pathspec/路径归一化排除 local 文件自身；因此 `Dialog` 不会误命中 `DialogWindow`。B `templateBindingCheck` 用 `@vue/compiler-sfc` 提取 template AST、用 TypeScript AST 解析同一 SFC 的单个 `ImportDeclaration`，要求任何剩余 PascalCase/kebab-case tag 由该声明从 `@notnotype/nb-ui/components` named-import 精确绑定同名目标；不会跨多个 import 声明拼接，local Name + 无关 nb-ui import 仍失败。停止条件只针对 A 命中 local import/path/source，或 B 发现同名 tag 未显式绑定/错误绑定目标；合法 target-bound 同名 tag 可以保留，裸 tag 本身不构成 local 引用。16 条独立字面 kebab 与 current app/tests 实际集合差分均为空。
- **Symbol A/B**：`useNotification`/`useResizablePanel`/`resolveApiErrorMessage` 的 A `localPathCommand` 只接受 local module 与该 named symbol 同行的 import/path/source evidence，并排除 local 定义文件；B `targetBindingCheck` 按 `importedName → localAlias → moduleSpecifier` 收集所有 named imports，扫描 alias 的真实 AST usage；使用 wrong-module alias 计入 `targetBad`，unused wrong-module alias 不阻止，正确 target alias 可以通过。`useFloatingPanelLayout` 的 target 是改名后的 `useAnchoredPopup`，同样不能只凭旧名归零；target identifier 不要求归零，裸 identifier 不算 target binding。所有 symbol command 扫描 app、`plugins/**` 与 tests。

动态风险集中登记在 `sharedContracts.dynamicRisk`，`dynamic-component-string-risk` 保留 register caller，相关组件/theme 记录只通过 `sharedRef` 指向并保留 surface-specific named hits：

- `Tooltip.vue:178` 的 `<component :is="node" />` 是 generic trigger VNode 重渲染；
- `AgentToolBubble.vue:41` 与 `AgentToolNode.vue:85` 的 `<component :is="renderConfig.component" />` 来自 tool render registry；
- `useDialog.ts:184,251,328` 的 `h(Dialog, ...)` 是 local Dialog 的真实动态依赖，另有 `.novel-ide-theme` host lookup。

这些动态命中不能被改写成 named direct caller 的零引用，也不能因为静态 import 归零就跳过每批 registry/host 复核。

## 5. 已执行的限定自检

本轮只运行证据与 binding gate 自检，不运行 docs/governance/product/nb-ui 测试、typecheck、formatter、lint、build、浏览器或远端动作。组件 template gate 使用 `@vue/compiler-sfc` template AST + TypeScript `ImportDeclaration` 绑定；组件 local gate 使用 escaped exact module boundary；symbol target/verifier 使用 TypeScript Program + TypeChecker 逐 Identifier 解析 lexical symbol declaration 与 ImportSpecifier alias/module；严格参数数为 local=3、target=3、verifier=5、fileDeletion=3。

`jq empty` 命令无输出、退出码 0。直接 Bun command smoke 与结构审计的最终记录如下；所有数字均从最终 JSON 重新读取，而非沿用旧摘要：

```text
syntaxParse.local.rc=0
syntaxParse.target.rc=0
syntaxParse.verifier.rc=0
syntaxParse.fileDeletion.rc=0
syntaxParse.stderr=""
componentLocal.dialogWindowOnly.rc=0
componentLocal.dialogWindowOnly.stderr=""
componentLocal.dialogExact.rc=1
componentLocal.dialogExact.fixtureOutput=true
componentLocal.dialogExact.stderr=""
componentTemplate.unboundTag.rc=1
componentTemplate.localNamePlusUnrelatedTarget.rc=1
componentTemplate.targetNamedImport.rc=0
componentTemplate.dialogWindowOnly.rc=0
componentTemplate.stderr=""
symbolScope.sameNameNormal.rc=0
symbolScope.sameNameNestedParameterShadow.rc=1
symbolScope.correctAliasPlusBareOriginal.rc=1
symbolScope.correctAliasOnly.rc=0
symbolScope.wrongModuleAliasUsed.rc=1
symbolScope.unusedWrongModuleAlias.rc=0
symbolScope.stderr=""
currentPreMigrationExpectedFailure.dialogTemplateBindingTarget.rc=1
currentPreMigrationExpectedFailure.dialogTemplateBindingTarget.templateRealCallerCount=40
currentPreMigrationExpectedFailure.dialogTemplateBindingTarget.dynamicHCallerCount=1
currentPreMigrationExpectedFailure.dialogTemplateBindingTarget.aggregateMappedCallerCount=41
currentPreMigrationExpectedFailure.dialogTemplateBindingTarget.dialogWindowOnlyFiles=0
currentPreMigrationExpectedFailure.dialogTemplateBindingTarget.stderr=""
unboundFixtureTarget.rc=1
unboundFixtureTarget.fixtureOutput=true
unboundFixtureTarget.stderr=""
threeState.targetBound.rc=0
threeState.negativeSourceMockKeyOnly.rc=0
currentPreMigrationExpectedFailure.useNotificationTarget.rc=1
currentPreMigrationExpectedFailure.useNotificationTarget.stdoutIncludesRealUsage=true
currentPreMigrationExpectedFailure.useNotificationTarget.stderr=""
currentVerifier.useNotification.rc=1
currentVerifier.useNotification.localBadLength=44
currentVerifier.useNotification.targetBadLength=39
currentVerifier.useNotification.stderr=""
jqEmpty=true
jsonParse=true
physicalBytes=179932
under180KB=true
recordCount=29
jsonLines=1
uniqueSurfaceIds=true
missingRequiredFields=[]
directCallerPathErrors=[]
callerRefEncodingErrors=[]
sharedRefDangling=[]
coverageErrors=[]
symbolBindingErrors=[]
componentCallerPathRecords=178
componentProductCallerPathRecords=168
componentTestCallerPathRecords=10
migrateSymbolRecords=4
sidecarTypeSurfaceRecords=1
typeCallerPathRecords=7
composableUtilitySurfaceRecords=5
composableUtilityCallerPathRecords=131
composableUtilityProductCallerPathRecords=120
composableUtilityTestCallerPathRecords=11
themeAuthorityCallerPathRecords=92
pluginProductCallerPathRecords=2
losslessCallerComparison=true
expectedKebabExact=true
actualKebabTagSetDifference=[]
badBackreferenceCount=0
oldBareTagZeroResidual=0
stopConditionBindingAware=true
componentBindingInvariant=true
componentCoverage=true
componentRecordCount=16
eOwnerSelfDependencies=[]
iconButtonGate=true
useDialogRetainGate=true
apiErrorNamedDeletion=true
nonEmptyDeletionAndZeroChecks=true
noDuplicateCallerArrays=true
walkthroughNumbersExact=true
status=verifying
currentRevision=73f37b4d3095aa9072de76fe0d4bdff240862deb
totalSurfaceRecords=29
```


## 6. 后续关闭条件

Leader 仍需审阅这份 compact JSON 的 caller completeness、contract stop conditions 与 current/target/old distinction。只有当该审阅、Task README 门禁及后续授权验证闭合后，才可创建 planned Spec 与 A Task；本轮不把 evidence 的静态完成升级为 Task completed，也不提前删除任何 local surface。

[UNVERIFIED] LSP references（项目状态为 `No language servers configured for this project`）、Nuxt prepare/build、UnoCSS 与 nb-ui CSS cascade、真实 Provider/Model/API、桌面/390px 浏览器行为、FOUC、Spec 状态转换与后续切片实现均未在本轮运行或证明。
