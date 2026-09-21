# System Assets Preflight

> Active task directory format: `NN-kebab-case-name/`. Archived tasks move to `docs/tasks/archived/<task-slug>/`.

## User Request

- `.compiled` 不再进入 Git，避免 generated runtime artifact 造成普通 feature diff 和合并冲突。
- 每次 app 启动前编译 system runtime artifacts，并跳过已 fresh 的 artifact。
- 每次 app 启动前同步最新 system assets；用户未修改的覆盖自动更新，用户已修改的覆盖保留并提示 diff。
- 删除独立的 `assets/workspace/.nbook/agent/profiles/.system-profile-metadata.json` 文件；profile sync metadata 应从 compiled manifest 派生。
- 本次硬切，不做 legacy 兼容。
- 明确 `workspace/.nbook/.system-assets-sync-state.json` 的作用。
- `server/agent/variables/generated-profile-variable-types.d.ts` 也按 generated authoring cache 处理，不进入 Git、不挂启动链路。
- 直接清理 Git 历史里的 `.compiled` / generated artifact 记录。

## Goal

把 system assets 准备流程收敛成启动前 preflight：系统 profile / variable artifacts 作为 ignored runtime cache 按需增量编译，user-assets 同步基于统一 sync state 做三方 hash 判断，干净 checkout、Product payload 和 Windows Launcher 启动都不再依赖 Git-tracked `.compiled` 或 `.system-profile-metadata.json`。

成功标准：

- Git 不再跟踪 system `.compiled/**` 和 `.system-profile-metadata.json`。
- Git 不再跟踪 `server/agent/variables/generated-profile-variable-types.d.ts`。
- `dev`、Product start、Windows Launcher start 在真正启动 app 前都运行 system assets preflight。
- 已 fresh 的 system profile / variable artifact 不被重复重写。
- `readSystemProfileMetadata()` 不再读取独立 metadata json，而是从 profile `.compiled/manifest.json` 派生。
- user-assets sync state 统一迁到 `workspace/.nbook/.system-assets-sync-state.json`，不再复用 profile 专用命名。
- skill / template / CLI assets 更新时，用户未手改自动覆盖，已手改只 warning。
- Git 历史不再保留本轮移除的 generated artifacts。

## Current State

- `assets/workspace/.nbook/agent/profiles/.compiled/**`、`assets/workspace/.nbook/agent/variables/.compiled/**` 和 `assets/workspace/.nbook/agent/profiles/.system-profile-metadata.json` 当前仍可成为 Git tracked generated artifact。
- `scripts/build/prepare-system-profile-metadata.ts` 会编译 system variable definitions、system profiles、写 `.system-profile-metadata.json`，并刷新 profile variable IDE types。
- `server/agent/variables/generated-profile-variable-types.d.ts` 当前是 IDE / TypeScript authoring aid：它通过 module augmentation 扩展 `ProfileVariableValueMap`，让 `ctx.vars.get/read(...)` 对已知变量 path 有补全和返回类型推导；运行时不读取它。
- `syncSystemAssetsToUserAssets()` 已能管理 `agent/skills/**`、templates、agent bin/scripts/config、writing presets 等大多数 `.nbook` assets。
- 当前普通 managed assets 通过扫描 `assets/workspace/.nbook` 即时计算 hash；profile source 通过 `.system-profile-metadata.json` 获取系统 profile 列表和源码 hash；variable definition 通过 `.compiled/manifest.json` 做 artifact sync。
- 用户侧 sync state 当前写在 `workspace/.nbook/agent/profiles/.profile-sync-state.json`，虽然已经同时保存 `profiles` 和普通 `assets`，但命名仍是 profile 专用。
- Product runtime 已要求 Product Root 内重新编译 system profiles，使 artifact 绑定 `.output/server/node_modules` vendor；Windows Launcher 启动当前只做 config、migration、admin 检查和启动 Nitro，还没有统一 system assets preflight。

## Walkthrough

### 1. Git generated artifact policy

- 更新 `.gitignore`，忽略：
  - `assets/workspace/.nbook/agent/profiles/.compiled/`
  - `assets/workspace/.nbook/agent/variables/.compiled/`
  - `assets/workspace/.nbook/agent/profiles/.system-profile-metadata.json`
  - `server/agent/variables/generated-profile-variable-types.d.ts`
- 从 Git index 移除已跟踪的 system profile `.compiled/**`、system variable `.compiled/**` 和 `.system-profile-metadata.json`。
- 从 Git index 移除已跟踪的 `generated-profile-variable-types.d.ts`，但不删除本地工作副本。
- 本任务内执行 Git history rewrite，清理历史中的 generated artifacts：
  - `assets/workspace/.nbook/agent/profiles/.compiled/**`
  - `assets/workspace/.nbook/agent/variables/.compiled/**`
  - `assets/workspace/.nbook/agent/profiles/.system-profile-metadata.json`
  - `server/agent/variables/generated-profile-variable-types.d.ts`
- history rewrite 执行前必须确保当前工作树处于明确状态：本轮实现已提交或另有明确保存点，避免把用户未提交变更卷入历史改写。

### 2. System assets preflight script

- 新增 `scripts/build/prepare-system-assets.ts`，作为 dev、build、Product 和 Launcher 的统一 preflight。
- preflight 默认执行：
  1. 增量编译 system variable definitions。
  2. 增量编译 system profiles。
  3. 从 profile `.compiled/manifest.json` 派生 system profile metadata。
- `--sync-user-assets` 额外执行 `syncSystemAssetsToUserAssets()`。
- 启动 preflight 不刷新 `server/agent/variables/generated-profile-variable-types.d.ts`；它是 ignored authoring cache，只由显式开发命令刷新。
- 新增显式 typegen 命令用于刷新 profile variable IDE types，供开发者在修改变量定义 / profile authoring types 后手动运行；CI / 本地 typecheck 如果需要最完整的变量 path 推导，可以在 typecheck 前运行该命令。

### 3. Incremental artifact compile

- `compileProfileArtifacts()` 增加 incremental / skip-fresh 能力。
- `compileVariableDefinitions()` 增加 incremental / skip-fresh 能力。
- fresh 判定至少包含：
  - compiler version 匹配。
  - source hash 匹配。
  - dependency hash 匹配。
  - artifact hash / bytes 匹配。
  - artifact 文件存在。
- full compile 时，fresh 条目复用旧 manifest entry 和旧 artifact；stale / missing 条目才重新 esbuild。
- manifest 内容不变时保留 `generatedAt`，避免无意义重写。

### 4. Remove `.system-profile-metadata.json`

- 删除 `scripts/build/prepare-system-profile-metadata.ts` 对 `.system-profile-metadata.json` 的写入职责。
- 保留 `readSystemProfileMetadata()` 这个内部 API 名称，但实现改为读取 `assets/workspace/.nbook/agent/profiles/.compiled/manifest.json`。
- 派生字段映射：
  - `fileName` <- manifest item `fileName`
  - `profileKey` <- manifest item `profileKey`
  - `sha256` <- manifest item `sourceSha256`
  - `bytes` <- manifest item `sourceBytes`
- 当前调用方继续可用：
  - profile source sync。
  - profile conflict detail。
  - catalog 的 `system_profile_shadowed` warning。
- 移除 deploy / product 常量中对 `.system-profile-metadata.json` 作为 release artifact 的要求。

### 5. User sync state hard cut

- 新 sync state 固定为 `workspace/.nbook/.system-assets-sync-state.json`。
- 不做 legacy 兼容：实现直接读写新路径，不再读取或迁移旧 `workspace/.nbook/agent/profiles/.profile-sync-state.json`。
- 旧 state 文件可以作为过期本地状态文件被忽略，不再参与同步判断。
- 新 state 的作用：
  - 记录每个系统资产上次同步时的系统 hash：`upstreamHash`。
  - 记录用户文件在上次同步完成后的 hash：`lastSyncedUserHash`。
  - 下次同步时用当前用户 hash 与这两个 hash 做三方判断。
  - 用户未手改时自动覆盖到最新系统版本。
  - 用户已手改且系统也更新时保留用户文件并产生 warning / diff。
- 这个文件不是系统 manifest，也不是 runtime truth；它只是 user-assets overlay 的同步基线和冲突判断状态。

### 6. Sync engine cleanup

- 将现有 `readUserProfileSyncState()` / `writeUserProfileSyncState()` 重命名或替换为 system-assets 语义的 state helpers。
- 普通 managed assets 与 profile source 尽量共享同一个三方 hash decision helper。
- profile / variable 仍保留专门 artifact sync：source 文件按 managed source 规则同步，`.compiled` artifact 只作为 runtime cache 复制。
- `.compiled/**`、session、本地 config、SQLite、sync state 等继续保持黑名单，不进入普通 managed source assets。
- v1 不自动传播系统删除；删除 / 重命名只作为后续 orphan / tombstone 设计问题。

### 7. Startup and Product integration

- `package.json`：
  - 新增 `system-assets:prepare`。
  - 新增显式 `system-assets:typegen` 或同等命令刷新 `generated-profile-variable-types.d.ts`。
  - 保留 `profile:metadata` 作为兼容脚本名，但指向新 preflight。
  - `dev` 改为先运行 `system-assets:prepare --sync-user-assets`。
  - `build` / `nuxt:build` 改为先运行 `system-assets:prepare`，不做 user sync。
- `product:stage` 在 Product Root 内运行新 preflight，生成 Product-local system artifacts。
- `product:start` 在启动 Nitro 前运行 Product-local preflight `--sync-user-assets`。
- Windows Launcher `start` 在 `ensurePortableConfig()` 后、migration 前运行同一 Product-local preflight。
- Nitro runtime context copy / Product runtime scripts copy 需要包含 `prepare-system-assets.ts`。

## Decisions

- 本次硬切，不读取旧 `.profile-sync-state.json`，也不迁移旧 state。
  - 副作用：旧用户的旧版未手改资产如果没有新 sync state，系统无法可靠判断它是“用户手改”还是“旧版系统副本”，会保守保留并 warning。
  - 接受该副作用；第一轮宁可多 warning，也不要误覆盖用户文件。
- `.compiled/**` 是 runtime cache，不进 Git。
- Product zip 携带 `.compiled` runtime artifacts；`product:stage` 生成，启动时 preflight 校验并跳过 fresh artifact。
- `.system-profile-metadata.json` 不再作为独立文件存在。
- Profile sync metadata 从 `.compiled/manifest.json` 派生。
- preflight 失败时阻止 app 启动；runtime catalog 依赖 `.compiled`，失败后继续启动只会把错误延后成更难懂的 profile load failure。
- 启动时 user-assets sync 发现冲突不阻止 app 启动；保留用户文件，记录 warning，并交给前端 diff / reminder 呈现。
- `server/agent/variables/generated-profile-variable-types.d.ts` 是 generated authoring aid，不是 runtime truth；它不进 Git、不进启动 preflight、不进 Product runtime 必需文件，只通过显式 typegen 命令生成。
- 启动范围覆盖 dev、Product start 和 Windows Launcher start。
- 不自动删除用户旧 assets；删除传播后续再设计。
- system `assets/workspace/.nbook/**` 默认纳入管理，采用黑名单模式排除 runtime / local state。
- `generated-profile-variable-types.d.ts` 可以由显式开发 / typecheck 命令生成，但 app 启动链路不生成它。
- 历史提交清理在本任务内直接做；需要明确 force-push / 协作者重拉成本。

## Files Changed

- `.gitignore`
  - 忽略 system `.compiled/**`、`.system-profile-metadata.json`、`generated-profile-variable-types.d.ts`。
- `package.json`
  - `dev` / `build` / `nuxt:build` 接入 `system-assets:prepare`。
  - 新增 `system-assets:prepare`、`system-assets:typegen`。
- `scripts/build/prepare-system-assets.ts`
  - 新增统一 system assets preflight。
- `scripts/build/generate-profile-variable-types.ts`
  - 新增显式 IDE authoring typegen。
- `scripts/build/prepare-system-profile-metadata.ts`
  - 旧入口改为转发到新 preflight。
- `server/agent/profiles/profile-artifact-compiler.ts`
  - 增加 `skipFresh`，fresh artifact 跳过重编译，manifest 内容不变时不重写。
- `server/agent/variables/definition-artifact.ts`
  - 增加 `skipFresh`，fresh definition artifact 跳过重编译，manifest 内容不变时不重写。
- `server/workspace-files/novel-workspace.ts`
  - profile metadata 改为从 `.compiled/manifest.json` 派生。
  - user sync state 硬切到 `workspace/.nbook/.system-assets-sync-state.json`。
  - 移除旧 Git HEAD 迁移推断。
  - 普通 managed assets 保持黑名单模式，排除 runtime/local state。
- `server/workspace-files/system-assets-preflight.ts`
  - 抽出统一 preflight helper，供 CLI 脚本和前端同步 API 复用。
- `scripts/deploy/product-runtime.mjs`
  - Product stage 复制并运行统一 preflight，stage 时 `--force` 生成 Product-local `.compiled`。
  - Product payload 清理旧 `.system-profile-metadata.json` 和 IDE type cache。
- `scripts/deploy/product-start.mjs`
  - Product start 启动 Nitro 前运行 preflight `--sync-user-assets`。
- `scripts/deploy/windows-portable/launcher/launcher.mjs`
  - Windows Launcher start 在 migration 前运行 preflight `--sync-user-assets`。
- `server/workspace-files/workspace-files.test.ts`
  - 测试启动时准备 ignored system artifacts。
  - sync state 断言更新到新路径。
- Git index
  - 已 `git rm --cached` 移除 tracked generated artifacts，保留本地工作副本。

## Verification

- 已执行：
  - `bun scripts/build/prepare-system-assets.ts`
    - 通过；system variables 1 个 definition file，system profiles 11 个 profile，fresh 状态下 compiled 0 个 stale profile。
  - `node --check scripts/deploy/product-runtime.mjs`
    - 通过。
  - `node --check scripts/deploy/product-start.mjs`
    - 通过。
  - `node --check scripts/deploy/windows-portable/launcher/launcher.mjs`
    - 通过。
  - `bunx vitest run server/agent/profiles/catalog.test.ts server/agent/variables/variables.test.ts server/workspace-files/workspace-files.test.ts`
    - 通过；3 files / 102 tests。
  - `bun scripts/build/prepare-system-assets.ts --sync-user-assets`
    - 通过；硬切后旧用户覆盖缺少新 state 的 profile / skill 按预期 warning 且不阻止命令。
  - `bun scripts/build/generate-profile-variable-types.ts`
    - 通过；生成 ignored `server/agent/variables/generated-profile-variable-types.d.ts`，不挂启动链路。
  - `bun run build`
    - preflight 阶段通过；`tsc` 阶段失败在当前工作区已有测试类型错误：
      - `server/agent/profiles/rp-profiles.test.ts` 多处 `TSchema.properties` 类型错误。
      - `server/agent/skills/silly-tavern-card-cli.test.ts` 多处 possibly `undefined` / `string | undefined` 类型错误。
- 待执行：
  - `bun run nuxt:build`
  - `bun run product:stage`
  - `bun run product:start` preflight 可在 Product Root 内运行。
  - history rewrite 后，`git log --all -- <generated artifact path>` 不再返回历史记录。
    - 已执行 `git filter-branch` 清理 generated artifact 历史，并删除 `refs/original/*` / 临时 stash refs 后运行 `git gc --prune=now`。
    - 已验证以下路径 `git log --all -- <path>` 为空：
      - `assets/workspace/.nbook/agent/profiles/.compiled/manifest.json`
      - `assets/workspace/.nbook/agent/variables/.compiled/manifest.json`
      - `assets/workspace/.nbook/agent/profiles/.system-profile-metadata.json`
      - `server/agent/variables/generated-profile-variable-types.d.ts`

### Follow-up Fix: Frontend sync refreshes system manifests

- 问题：`/api/workspace-files/sync-user-assets` 之前只调用 `syncSystemAssetsToUserAssets()`，不会先刷新 system profile / variable `.compiled/manifest.json`。因此开发者修改 system profile 源码但未手动编译时，前端同步按钮仍读取旧 manifest，无法感知系统 profile 更新。
- 修复：新增 `prepareSystemAssets()` helper；CLI `scripts/build/prepare-system-assets.ts` 和前端同步 API 共用该 helper。同步按钮现在会先执行增量 compile，再同步 user-assets。
- 验证：
  - `bunx vitest run server/workspace-files/workspace-files.test.ts --testNamePattern "前端同步 preflight|同步系统 assets 会更新仍跟随上游的 Agent skill"`
    - 通过；2 tests passed。
  - `bun scripts/build/prepare-system-assets.ts --sync-user-assets`
    - 通过；当前工作区 system profile 有未提交改动，因此同步更新了 1 个未手改用户 profile。

## TODO / Follow-ups

- 后续设计 system asset 删除 / 重命名的 tombstone 或 orphan warning。
- 后续再考虑是否引入显式 `.system-assets-manifest.json`；本轮先复用扫描系统文件树 + profile compiled manifest 派生 metadata。
