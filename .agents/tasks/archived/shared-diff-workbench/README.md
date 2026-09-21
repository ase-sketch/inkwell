# Shared Diff Workbench

## Summary

目标是把当前散落在 workspace 写入冲突里的 Monaco DiffEditor 能力抽成通用 diff/merge 组件，并提供一个独立 `.preview` 页面用于调试视觉、交互和不同冲突场景。

第一批落点：

- user-assets 同步系统 assets 时，如果用户覆盖 profile 或受管理 `.nbook` asset 已手改且系统也更新，前端要明确展示冲突/保留原因，并能查看系统版本与用户版本 diff。
- Markdown Studio 源码编辑器中，如果用户正在编辑文件，同时 Agent 或其他工具更新了磁盘文件，使用同一套 diff/merge UI 处理网页编辑、磁盘版本和共同基线。
- 现有 `WorkspaceFileConflictDialog.vue` 不再独占 Monaco diff 逻辑，改为复用通用组件。

## Current State

- 后端 `syncSystemAssetsToUserAssets()` 已检测用户覆盖冲突：
  - `profileWarnings[]` 会返回“系统 profile 已更新，但用户覆盖已手改，未自动覆盖”。
  - `assetWarnings[]` 会返回 managed `.nbook` asset 的类似 warning，覆盖 `agent/skills/**`、`templates/**`、`agent/profile-templates/**`、`agent/bin/**`、`agent/scripts/**`、`agent/config/**`、writing presets 等；本地状态、sessions、compiled artifact 和 profile metadata 被黑名单排除。
  - 当前 API 不会覆盖已手改用户文件，这是正确的。
- 前端 `NovelIdeToolPanel.vue` 的同步按钮只显示 copied/skipped success，不展示 `profileWarnings` / `assetWarnings`，所以用户看不到冲突。
- `server/workspace-files/workspace-file-conflict.ts` 已能生成三方冲突数据：
  - `baseContent`
  - `localContent`
  - `remoteContent`
  - `mergedContent`
  - `localDiff`
  - `remoteDiff`
- `app/components/novel-ide/workspace/WorkspaceFileConflictDialog.vue` 已有一个绑定 workspace 保存冲突的 Monaco DiffEditor + merge editor UI，但不是通用组件。
- `MarkdownSourceEditor.vue` 只负责源码编辑；冲突处理在 store / workspace write API 周边。

## Design Goals

1. 通用
   - diff 组件不依赖 workspace file DTO、profile sync DTO 或具体业务文案。
   - 支持二方 diff 和 IDE 风格三方 merge：原文 / incoming content / result。
   - 只读场景默认展示两列 diff；允许合并的场景展示三方 merge 与可编辑 result。
   - 调用方决定按钮、标题、冲突解决动作、是否允许覆盖文件和保存策略。

2. 可调试
   - 新增 `.preview` 页面，独立展示不同 diff 样例。
   - 不需要真实触发 Agent 或 sync API 才能调 UI。
   - preview 覆盖 Markdown、TSX、JSON、长文本、删除文件、冲突 marker、窄屏布局。

3. 可复用
   - workspace 保存冲突复用同一组件。
   - user-assets sync warning 复用同一组件。
   - 后续 Agent tool write preview、profile compile diff、设置覆盖 diff 都能复用。

4. 安全
   - 默认只读 diff。
   - 只有明确进入 merge/edit 模式才允许编辑合并结果。
   - 不自动覆盖用户文件；所有覆盖/保存动作必须由调用方显式确认。

## Decisions

- 三方 merge 方向固定为：
  - `baseContent`：共同基线。
  - `currentContent`：用户当前内容，例如网页未保存内容或用户覆盖文件。
  - `incomingContent`：外部进入的新内容，例如磁盘/Agent 新内容或系统新版。
  - `resultContent`：最终要保存/提交的合并结果。
- user-assets sync warning 不持久化；后端每次根据当前文件 hash、system metadata 和 sync state 重新计算。
- user-assets conflict detail API 不依赖前端 user-assets mode 作为安全边界；后端必须做路径白名单，只允许读取 `workspace/.nbook` 与 `assets/workspace/.nbook` 下的可 diff 文本文件。
- user-assets sync 采用黑名单式 managed asset：系统 `.nbook` 大多数文件默认进入 sync state，profile 源文件和 variable definitions 保留专用编译产物同步流程；系统删除传播第一版不自动删除用户旧文件。
- diff 组件不支持二进制正文 diff；二进制或超过阈值的大文件只展示文件名、大小、hash 和不可 diff 说明。
- 覆盖动作由业务决定：
  - workspace 保存冲突保留现有“覆盖真实文件”能力。
  - user-assets sync 第一版不提供“覆盖用户文件”动作，只做 warning 和只读 diff。
- preview 页面沿用现有 `*.preview.vue` 约定进入本地/开发路由；本任务不单独处理生产隐藏策略。
- 第一版不做块级“接受这一块 incoming/current”；只提供完整 diff、merge result 编辑和整体动作。

## Proposed Components

### `SharedDiffEditor.vue`

位置建议：

`app/components/common/diff/SharedDiffEditor.vue`

职责：

- 封装 Monaco DiffEditor。
- 用于只读或简单二方对比。
- 输入：
  - `originalContent`
  - `modifiedContent`
  - `originalLabel`
  - `modifiedLabel`
  - `language`
  - `theme`
  - `readonly`
  - `renderSideBySide`
  - `modelKey`
- 输出：
  - `ready`
  - `layout`
- 不显示业务按钮，不显示 Dialog。

### `SharedMergeEditor.vue`

位置建议：

`app/components/common/diff/SharedMergeEditor.vue`

职责：

- 展示 IDE 风格 merge/result 区域。
- 输入：
  - `modelValue`
  - `baseContent`
  - `incomingContent`
  - `language`
  - `theme`
  - `readonly`
  - `modelKey`
- 输出：
  - `update:modelValue`
  - `save-request`
- 用于 workspace 冲突和未来手动合并。
- 组件本身不写文件，不决定是否覆盖；业务页面通过 action 决定如何使用 result。

### `DiffWorkbench.vue`

位置建议：

`app/components/common/diff/DiffWorkbench.vue`

职责：

- 组合 diff / merge 的可复用工作台。
- 提供 tabs：
  - `Diff`
  - `Merge`
  - 可选 `Local vs Base`
  - 可选 `Remote vs Base`
- 输入一个通用 payload：

```ts
export type DiffWorkbenchDocument = {
    id: string;
    title: string;
    path?: string;
    language?: string;
    baseContent?: string;
    currentContent: string;
    incomingContent: string;
    resultContent?: string;
    currentLabel?: string;
    incomingLabel?: string;
    baseLabel?: string;
};
```

- 只处理展示和合并文本编辑，不直接写文件。
- 业务层可以把 `Merge` tab 配置为只读或可编辑。
- 通用命名使用 IDE 心智：`baseContent` / `currentContent` / `incomingContent` / `resultContent`。业务层自行映射 label，例如 workspace 冲突里的“网页编辑 / 真实文件”，或 user-assets 同步里的“用户覆盖 / 系统版本”。

### `DiffWorkbenchDialog.vue`

位置建议：

`app/components/common/diff/DiffWorkbenchDialog.vue`

职责：

- 通用 Dialog shell。
- 调用方传入 actions：
  - `cancel`
  - `use-local`
  - `use-remote`
  - `save-merged`
  - `open-file`
  - 自定义 action label。
- 旧 `WorkspaceFileConflictDialog.vue` 可变成薄适配层。

## Preview Page

新增：

`app/pages/diff-workbench.preview.vue`

项目现有 preview 页面使用 `*.preview.vue` 约定，例如 `tsx-profile-editor.preview.vue`、`plot-workbench.preview.vue`。本任务跟随该约定，路由为 `/diff-workbench.preview`。

页面内容：

- 左侧样例列表：
  - Markdown 章节冲突
  - TSX profile 系统更新 vs 用户覆盖
  - JSON config 冲突
  - 文件删除
  - 大文件 diff
  - 无冲突但双边都有修改
- 右侧 full-height diff workbench。
- 顶部 controls：
  - theme
  - side-by-side / inline
  - readonly / merge edit
  - language
  - show whitespace
- 显示当前 merge result，方便调试事件。

## User Assets Sync Integration

### Backend

当前 `syncSystemAssetsToUserAssets()` 已返回 warning，但 warning 只有 message，不含 diff 内容。

建议新增 detail API，而不是把大量文件内容塞进 sync response：

`GET /api/workspace-files/user-assets-sync-conflict`

参数：

- `kind=profile|asset`
- `fileName` 或 `assetPath`

返回：

```ts
type UserAssetsSyncConflictDetail = {
    kind: "profile" | "asset";
    fileName?: string;
    assetPath?: string;
    label: string;
    systemContent: string;
    userContent: string;
    baseContent?: string;
    language: string;
    systemSha256: string;
    userSha256: string;
    lastSyncedUserHash?: string;
    upstreamHash?: string;
    diffable: boolean;
    reason?: "missing" | "binary" | "too_large";
};
```

说明：

- `systemContent` 来自当前 system asset。
- `userContent` 来自用户覆盖文件。
- `baseContent` 第一版可以为空；如果 sync state 中能定位旧 upstream 内容，后续再补。
- 二进制或超过 512KB 的文件不返回正文，只返回不可 diff 的提示、大小和 hash。
- 后端必须限制读取路径，只允许 `workspace/.nbook` 与 `assets/workspace/.nbook` 下的系统/用户资产文件。

### Frontend

`NovelIdeToolPanel.vue`：

- sync 成功后统计：
  - copied
  - skipped
  - updatedProfiles
  - updatedAssets
  - profileWarnings.length
  - assetWarnings.length
- 如果 warnings 为空，显示 success。
- 如果 warnings 非空，显示 warning notification：
  - “有 N 个用户覆盖保留未覆盖”
  - 提供“查看详情”入口。
- 详情可以先用 Dialog 列表展示 warning。
- 点击某条 warning 调 detail API，打开只读 `DiffWorkbenchDialog`。是否提供“使用系统版本覆盖用户文件”由 user-assets 页面业务决定，不放进通用组件默认行为。

## Markdown Studio Conflict Integration

现有流程：

- `server/api/workspace-files/write.put.ts` 在 `expectedMtimeMs` 与真实文件不一致时返回 `WorkspaceWriteConflictDto`。
- store 中 `workspaceWriteConflict` 保存冲突。
- `WorkspaceFileConflictDialog.vue` 展示冲突并允许：
  - reload remote
  - overwrite local
  - save merged
  - cancel

改造：

- 保留 DTO 和 store resolution 行为。
- `WorkspaceFileConflictDialog.vue` 改为适配层：
  - 把 `WorkspaceWriteConflictDto` 映射为 `DiffWorkbenchDocument`。
  - 使用 `DiffWorkbenchDialog`。
  - 继续 emit `WorkspaceFileConflictResolution`。
- 后续可以把 Agent tool 写入导致的编辑器冲突也统一映射到同一 DTO。

## Implementation Plan

1. 梳理现有 diff / conflict 入口
   - 确认 `WorkspaceFileConflictDialog.vue` 的 Monaco 生命周期、主题、model dispose 行为。
   - 确认 `MarkdownSourceEditor.vue` 与 store 的冲突触发点。
   - 确认 `syncSystemAssetsToUserAssets()` warning payload 当前字段。

2. 抽通用 diff 组件
   - 新建 `app/components/common/diff/SharedDiffEditor.vue`。
   - 新建 `app/components/common/diff/SharedMergeEditor.vue`。
   - 新建 `app/components/common/diff/DiffWorkbench.vue`。
   - 新建 `app/components/common/diff/DiffWorkbenchDialog.vue`。
   - 复用 `loadMonacoEditor()` 和 `buildMonacoTheme()`。
   - 把 Monaco model URI 和 dispose 逻辑封装好，避免切换样例泄漏模型。

3. 新增 preview 页面
   - 新建 `app/pages/diff-workbench.preview.vue`。
   - 内置多组样例数据。
   - 支持切换 theme、布局、语言、只读/可编辑。
   - 用 Playwright 或浏览器手动验证 Monaco 非空渲染。

4. 改造 workspace 文件保存冲突
   - `WorkspaceFileConflictDialog.vue` 只保留业务 action 映射。
   - 使用 `DiffWorkbenchDialog` 展示 diff/merge。
   - 保持现有 store API 和用户流程不变。

5. 接入 user-assets sync warnings
   - 扩展前端 sync result 类型，如果当前 store 没有类型则补上。
   - `NovelIdeToolPanel.vue` 展示 warning summary。
   - 新增 warning 列表 dialog。
   - 新增 detail API，按 profile/asset 读取 system/user 内容。
   - 点击 warning 打开 diff dialog。

6. 测试与验证
   - 组件单测：基本 props 映射、事件、warning summary。
   - 后端 API 测试：profile conflict detail 返回 system/user 内容；缺文件、超大文件、二进制返回明确错误或不可 diff 状态。
   - 现有 workspace write conflict 测试保持通过。
   - 手动打开 preview 页面检查不同主题和布局。

## Open Questions

1. user-assets sync warning 的 diff 是否第一版只读？
   - 已决：通用 diff/merge 组件不决定是否允许覆盖文件；它只提供强参数和 result。
   - 第一版 user-assets sync 页面按只读接入，不提供覆盖用户文件动作。

2. 是否需要支持真正 Monaco MergeEditor？
   - 第一版先做 IDE 心智的三方 merge UI：原文 / incoming content / result。
   - 具体实现可先复用 DiffEditor + 普通 editor，也可以调研 Monaco MergeEditor；以可维护和可控为优先。

3. 大文件策略？
   - 已决：第一版对超过阈值的文件只展示摘要和“打开文件”入口，不直接加载 diff。
   - 阈值使用 512KB。

4. 块级 accept/reject 是否第一版支持？
   - 已决：第一版不做块级“接受这一块 incoming/current”；只支持整体 result 编辑和业务动作。

## Test Plan

- `bunx vitest run server/workspace-files/workspace-file-conflict.test.ts server/api/workspace-files/write.put.test.ts`
- 新增 user-assets sync conflict detail API 测试。
- 新增 diff workbench 轻量 Vue 测试，如果项目当前没有组件测试基础，则先用 preview 手动验证。
- 手动验证：
  - 打开 `/diff-workbench.preview` 页面。
  - 切换 Markdown/TSX/JSON 样例。
  - 切换 Diff/Merge。
  - 编辑 merge 内容并触发 save event。
  - 验证只读模式为两列 diff，可合并模式为原文 / incoming content / result。
  - 在 user-assets 同步中制造 profile warning，点击查看 diff。
  - 在 MarkdownSourceEditor 中制造磁盘冲突，确认旧流程行为不变。

## Notes

- 本 task 不改变后端 profile 覆盖策略：已手改用户文件仍保留，不自动覆盖。
- 本 task 只让冲突可见，并为后续手动处理提供 diff 基础。
- user-assets warning 当前已经返回，但 UI 没有展示，这是第一批接入的最小闭环。

## Implementation Walkthrough

### 2026-05-29

已实现第一版通用 diff workbench 闭环：

- 新增 `app/components/common/diff/`：
  - `SharedDiffEditor.vue` 封装 Monaco DiffEditor。
  - `SharedMergeEditor.vue` 提供 IDE 心智的三列 merge：当前内容 / incoming 内容 / 结果。
  - `DiffWorkbench.vue` 组合 Diff、Merge、Current vs Base、Incoming vs Base tabs。
  - `DiffWorkbenchDialog.vue` 只提供通用 Dialog shell 和 action 事件，不决定业务保存策略。
- 新增 `app/pages/diff-workbench.preview.vue`，路由 `/diff-workbench.preview`，使用 mock 样例调试 Markdown、TSX、JSON、删除文件和长文本。
- `WorkspaceFileConflictDialog.vue` 已改为薄适配层，继续 emit 原有 `reload-remote`、`overwrite-local`、`save-merged`、`cancel`，不改变 store resolution 流程。
- 新增 `shared/dto/user-assets-sync.dto.ts`，把 user-assets sync result、warning、conflict detail DTO 共享到前后端。
- 新增 `GET /api/workspace-files/user-assets-sync-conflict`，按 warning 读取系统版本与用户覆盖版本：
  - profile 读取 `assets/workspace/.nbook/agent/profiles` 与 `workspace/.nbook/agent/profiles`。
  - asset 读取 bundled `.nbook` 与 Workspace Root `.nbook`，并兼容 writing presets sync state 的相对路径。
  - 路径禁止绝对路径和 `..`，文本 diff 阈值为 512KB；二进制/大文件返回不可 diff 状态。
- `NovelIdeToolPanel.vue` 的同步按钮现在会展示 `profileWarnings` / `assetWarnings`：
  - warning 为空时显示普通成功摘要。
  - warning 非空时打开详情列表。
  - 关闭详情后，工具栏会保留一个冲突入口按钮，可重新打开 warning 列表。
  - 点击某条 warning 会打开只读 diff dialog，第一版不提供覆盖用户文件动作。
- preview 页面已补齐 conflict marker 样例、language override 控件和当前 merge result 展示。

计划偏差：

- 第一版没有新增 Vue 组件单测；项目当前没有现成的 diff 组件测试基础，先用 preview 页面承接视觉调试。
- 没有自动做浏览器验证，遵循项目 AGENTS 指令；需要时可再打开 `/diff-workbench.preview` 手动验 Monaco 渲染。
- `bunx nuxi typecheck --dotenv .env.typecheck --logLevel silent` 当前失败在无关既有改动：
  - `server/agent/session/session-repo.ts` 的 `origin` 类型收窄问题。
  - `server/agent/skills/silly-tavern-card-cli.test.ts` 的 possibly undefined 断言。

验证结果：

```powershell
bunx vitest run server/workspace-files/workspace-files.test.ts server/workspace-files/workspace-file-conflict.test.ts server/api/workspace-files/write.put.test.ts
```

结果：3 个测试文件通过，51 个测试通过。

补充验证：

```powershell
bunx nuxi typecheck --dotenv .env.typecheck --logLevel silent
```

结果：失败在本任务外的既有类型错误，当前已知为 `server/agent/session/session-repo.ts` 的 `origin` 字段收窄，以及 `server/agent/skills/silly-tavern-card-cli.test.ts` 的 possibly undefined 断言。

浏览器验证：

- `http://localhost:3000/diff-workbench.preview` 返回 200。
- 页面渲染出 `通用 Diff Workbench`、Markdown/TSX/JSON/删除文件/冲突 marker/长文本样例。
- Monaco 相关 DOM 已渲染：`.monaco-editor` / `.monaco-diff-editor` 共 4 个，`canvas` 共 8 个。
- Merge result 面板已渲染 `当前 Merge Result`。

### 2026-05-30

已完成第一轮组件合同优化：

- `DiffWorkbenchDocument` 新增 `diffable`、`unavailableReason`、`notice` 和 `metadata`，用于直接表达二进制、大文件、缺失文件等不可 diff 状态。
- `DiffWorkbench` 新增 `availableModes` 与 `initialMode`，调用方可以把工作台收口成只读二方 diff、完整 merge，或带 base tabs 的三方冲突视图。
- `DiffWorkbench` 在 `diffable=false` 时不再初始化 Monaco，而是展示统一不可 diff 状态、文件大小和 hash 摘要。
- `DiffWorkbenchDialog` 的 `use-current` / `use-incoming` / `save-result` 动作现在会返回正确的 `resultContent`；action 支持 `disabled` 与 `closeOnAction`。
- `SharedMergeEditor` 删除未使用的 `baseContent` prop，明确三列只表示 `current / incoming / result`；共同基线仍由 Workbench 的 base tabs 展示。
- `WorkspaceFileConflictDialog.vue` 显式启用完整 diff/merge/base tabs，保存冲突流程不变。
- `NovelIdeToolPanel.vue` 的 user-assets sync diff 收口为只读 `Diff` tab，并用结构化字段展示不可 diff 文件，不再把说明文案伪装成左右两份文本。
- `/diff-workbench.preview` 增加不可 diff 二进制样例。

验证结果：

```powershell
bunx vitest run server/workspace-files/workspace-file-conflict.test.ts server/api/workspace-files/write.put.test.ts
```

结果：2 个测试文件通过，2 个测试通过。

补充验证：

```powershell
bunx vue-tsc --noEmit --pretty false
```

结果：失败在本任务外的既有类型错误：

- `assets/workspace/.nbook/agent/skills/SillyTavern角色卡导入/scripts/silly-tavern-card.ts` 的 `inspection` 字段类型不匹配。
- `server/agent/session/session-repo.ts` 的 `origin` 字段收窄问题。
- `server/agent/skills/silly-tavern-card-cli.test.ts` 的 possibly undefined 断言。

### 2026-05-30 follow-up

已把 user-assets sync 从少数白名单扩展为 `.nbook` 黑名单式 managed sync：

- `syncSystemAssetsToUserAssets()` 现在遍历 `assets/workspace/.nbook`，除本地状态、session、compiled artifact、profile metadata 和专用 profile/variable 源外，默认纳入 `.profile-sync-state.json` 跟踪。
- `agent/skills/**`、`templates/**`、`agent/profile-templates/**`、`agent/bin/**`、`agent/scripts/**`、`agent/config/**` 和 writing presets 都支持未手改自动更新，已手改且系统也更新时返回 `assetWarnings[]`。
- profile 源文件仍走 `.system-profile-metadata.json` + compiled artifact 专用同步；`agent/variables/definitions.ts` 仍走 variable compiled artifact 专用同步。
- conflict detail 的 asset 路径改为直接按 `.nbook` 相对路径读取系统与用户文件；保留旧 writing preset sync state 的查找兼容，但新写入状态统一使用 `agent/writing-presets/...`。

计划偏差：

- 第一版不做系统删除传播；系统侧删除的资源不会自动删除用户覆盖层旧文件，也不会额外 warning。
- 未做浏览器验证；本次只改后端同步范围和 diff detail 路径。

验证结果：

```powershell
bun test server/workspace-files/workspace-files.test.ts --runInBand
```

结果：1 个测试文件通过，53 个测试通过。

补充验证：

```powershell
bunx tsc --noEmit --pretty false
```

结果：失败在本任务外既有类型错误，包括 SillyTavern skill 脚本的 `inspection` 字段、`server/agent/session/session-repo.ts` 的 `origin` 字段收窄，以及 `server/agent/skills/silly-tavern-card-cli.test.ts` 的 possibly undefined 断言。
