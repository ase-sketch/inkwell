# Writer Profile Input Contract

## User Request

- 收窄 `writer.profile.tsx` 的输入参数，降低 Leader 创建 writer agent 时的负担。
- 参考 `leader.default.profile.tsx` 的组织格式，尽量复用已有 helper。
- `lorebookEntries` 改为只传内容节点 path，不再传 `reason`、`priority`、`writingTip`。
- retrieval 仍需要向调用方 Leader 输出详细检索信息；只是 writer 输入不再接收这些详细字段。
- `plotPoints` 改为章节维度输入：传章节路径，writer 自动加载本章 Scene 和 Scene 下的 Plots。
- `novelId` 不再作为 writer 输入参数。
- `outputPath` 与章节路径语义重复，本次一并删除。
- writer 调用模型锁定为“一章节一 agent”：调用方先创建章节文件和 Plot 章节挂载，再创建 writer 写这一章。
- `writingStylePreset` 和 `writingReferencePreset` 的 description 要说明预设目录，并把预设目录从 profile 源码目录中移出。
- 需要同步修改的提示词必须记录在任务文件中。

## Goal

- 将 writer 输入合同从旧的 `plotPoints + novelId + outputPath + lorebookEntries object[]` 硬切到更直观的 `chapterPaths + lorebookEntries string[]`。
- 让 `writer` 可以根据章节内容节点路径自动展开该章的 Plot System 上下文。
- 让 `chapterPaths` 成为 writer 写入目标和章节剧情上下文的唯一来源。
- 将 writing preset 资源归入独立 Agent 资产目录，避免混在 `agent/profiles/builtin` 源码目录下。
- 同步所有会教模型调用 writer 的提示词，避免 Leader 继续生成旧参数。
- 保留 retrieval 给 Leader 的可解释检索结果，Leader 再将结果中的 path 列表整理给 writer。

## Current State

- 已实现。系统 writer profile 位于 `assets/workspace/.nbook/agent/profiles/builtin/writer.profile.tsx`。
- 2026-05-30 更新：`create_agent` 工具 description 已从“如果不确定则查询 get_agent_profile”收紧为“每次 create_agent 前必须先调用 get_agent_profile({ profileKey }) 查看目标 schema”；`get_agent_profile` description 也同步说明它是 create_agent 前的必需 schema-discovery 步骤。
- `WriterInputSchema` 已硬切为：
  - `prompt: string`
  - `chapterPaths: string[]`，`minItems: 1`、`maxItems: 1`
  - `lorebookEntries?: string[]`
  - `constraints?: string[]`
  - `writingStylePreset?: string`
  - `writingReferencePreset?: string`
- writer 已删除旧输入字段：`plotPoints`、`novelId`、`outputPath` 和 object-shaped `lorebookEntries`。
- `chapterPaths` 现在同时决定章节剧情上下文和写入目标。writer 只接受 Agent cwd-relative Project 路径，例如 `silver-dragon-hime/manuscript/001-第一章/`，不接受裸 `manuscript/...` 或 `workspace/silver-dragon-hime/...`；writer 会解析出 `{projectPath, chapterPath, indexPath}`，再调用 `plotFacade.getChapterPlotDetailDto(projectPath, chapterPath)` 展开 `<chapter_plots>`。
- v3 writer 已重新对照 v2 “小猫之神”提示词补齐写作流程、思考顺序、内容节点规则、视角边界、文风约束、Markdown 扩展、润色流程和输出协议；旧 `plot_points`、`read_file`、`write_file`、`edit_file` 心智已替换为 v3 `chapterPaths`、`chapter_plots`、`read`、`write`、`edit` 和唯一章节落点。
- `writingReference` 文本很大，系统提示词中保持放在最前面的 `<writing_reference>`，让模型先接收参考文档再进入 persona/contract。
- `chapter_target`、`chapter_plots`、`lorebook_entries`、`constraints` 属于 create_agent 输入 schema 初始化时确定的稳定上下文，已放入 `HistorySet` 的 `<writer_input_context>`；不再放入 `ModelContext` 这类每轮动态上下文。
- 普通 Project agent 的文件工具 cwd 是 Workspace Root。writer 输出给模型的 `indexPath` 必须是 `silver-dragon-hime/manuscript/.../index.md` 这种 cwd-relative 路径，不能是 `workspace/silver-dragon-hime/...`，否则 file tool alias 逻辑会剥掉 `workspace/silver-dragon-hime` 前缀并误写到 `workspace/manuscript/...`。
- writing presets 已从 profile 源码目录移到：
  - `assets/workspace/.nbook/agent/writing-presets/references`
  - `assets/workspace/.nbook/agent/writing-presets/styles`
- user-assets 覆盖目录为：
  - `workspace/.nbook/agent/writing-presets/references`
  - `workspace/.nbook/agent/writing-presets/styles`
- 2026-05-30 更新：writer 系统提示词的 `<context_mapping>` 已显式说明 `writer.writingStylePreset` 和 `writer.writingReferencePreset` 都传 preset key、不是文件路径，并列出系统目录与用户覆盖目录，避免调用方只从 schema description 里隐式推断。
- `leader.default.profile.tsx` 已改为教 “一章节一 agent”、`chapterPaths`、章节已存在、Scene 已挂章、retrieval 详细结果只提取 path 给 writer。
- `retrieval.profile.tsx` 已继续精简为 prompt-only 输入，并输出面向 Leader 的 `{ entries, note? }` 候选判断对象；writer 仍只消费 path 字符串数组。

## Implementation Plan

1. 更新 writer 输入 schema
   - 修改 `server/agent/profiles/builtin-contracts.ts` 的 `WriterInputSchema`。
   - 删除 `novelId`。
   - 删除 `outputPath`。
   - 删除旧 `plotPoints`，新增 `chapterPaths?: string[]`。
   - 将 `lorebookEntries` 改为 `string[]`。
   - 更新 `writingStylePreset` / `writingReferencePreset` description，指向新 preset 目录。

2. 改造 writer profile
   - 参考 `leader.default.profile.tsx`，将主系统提示词收口到更清晰的常量和少量 render helper。
   - `buildLorebookText()` 改为消费 `string[]`，按输入顺序读取，不再排序。
   - 调用模型锁定为“一章节一 agent”：
     - 调用方负责先创建章节内容节点文件或空模板。
     - 调用方负责在 Plot System 中把需要写入的 Scene 挂载到该章。
     - Scene 挂载变更后，应重新创建 writer agent；已存在 writer 可以继续按当前 chapterPaths 做后续润色，但这不是主路径。
   - 新增章节剧情展开逻辑：
     - 输入为 `chapterPaths`。
     - 第一版只允许一个章节路径；`chapterPaths` schema 使用 `minItems: 1`、`maxItems: 1`。
     - 章节必须已存在，并且必须是 cwd-relative Project 章节内容节点目录，例如 `silver-dragon-hime/manuscript/001-第一章/`。
     - 不适配裸 `manuscript/...` 或 `manuscript/.../index.md`，避免和 Agent cwd 混淆。
     - 不接受 `workspace/<project>/manuscript/...` 作为 writer 输入，避免 file tool alias 逻辑误剥 project 前缀。
     - 每个 path 解析出 Project Workspace 的 `projectPath` 和 Project 内 `chapterPath`。
     - 调用 `plotFacade.getChapterPlotDetailDto(projectPath, chapterPath)`。
     - 渲染该章 Scene、Thread title、Scene purpose/writingTip、Scene 下 Plots、Plot effect/writingTip/note。
   - `HistorySet` 的 `<writer_input_context>` 中使用 `<chapter_plots>` 替代旧 `<plot_points>`，因为这些上下文来自 create_agent 输入，属于静态初始化上下文。
   - 写入目标由 `chapterPaths` 唯一决定：
     - 普通章节写作写入对应章节内容节点的 `index.md`。
     - 不再从独立 `outputPath` 推导或覆盖写入位置。
     - writer 拥有文件编辑权限，可以按 prompt 和现有正文状态选择 `edit` / `apply_patch` / `write`。
     - 默认按 prompt 执行；普通“写这一章”可重写正文，“润色/修改”则局部修改。无需在 prompt 中额外强调协作模式，writer 最终通过 `report_result` 报告实际动作。
   - 跨 Project Workspace 隐患：
     - `manuscript/.../` 不再表示当前 Project Workspace；调用方必须显式传 `project-slug/manuscript/.../`。
     - `workspace/<project>/manuscript/...` 不作为 writer 输入格式；它对人类看起来完整，但 file tool 会把它当作 Project alias 并剥掉前缀。
     - 允许跨 Project Workspace：显式传另一个 `project-slug/manuscript/.../` 时，writer 仍可写该章节，但必须只写显式传入的章节路径。
     - 不允许根据当前 UI active novel 或自然语言“第三章”猜测 project。

3. 移动 writing preset 资源
   - 新系统路径：
     - `assets/workspace/.nbook/agent/writing-presets/references`
     - `assets/workspace/.nbook/agent/writing-presets/styles`
   - 新用户覆盖路径：
     - `workspace/.nbook/agent/writing-presets/references`
     - `workspace/.nbook/agent/writing-presets/styles`
   - 更新 `server/agent/profiles/writer-writing-reference.ts` 和 `server/agent/profiles/writer-writing-style.ts` 的目录候选。
   - 旧 `agent/profiles/builtin/writing-*` 目录直接删除，不做 legacy fallback。
   - `writingStylePreset` / `writingReferencePreset` 的值继续使用 Markdown frontmatter 中的 `key`，不是文件路径。schema description 里写新目录只是告诉用户去哪里查看和编辑 preset。
   - preset 文件是运行时数据，不纳入 writer profile `.compiled` dependency hash；用户修改 preset 后不需要重新编译 writer profile，下一次 prepare 直接读取新 preset。

4. 扩展 system assets 同步
   - 将 `agent/writing-presets/**` 纳入 Bundled Workspace Template 到 Workspace Root `.nbook` 的同步范围。
   - 用户文件缺失时复制系统 preset。
   - 用户文件未手改且系统 preset 更新时覆盖。
   - 用户文件已手改时保留用户文件。
   - 扩展现有 sync state，不再只记录 profiles；sync state 需要能记录 preset 文件的系统 hash 与用户 hash。
   - 如果 preset 被用户手改而遮蔽系统更新，允许返回 warning；具体是否在 UI 显示由同步接口现有 warning 通路决定。

5. 同步提示词
   - `assets/workspace/.nbook/agent/profiles/builtin/writer.profile.tsx`
     - `neurobook_writer_contract`
     - 工作边界
     - 写作流程
     - 小猫之神思考要求
     - 稳定上下文 reminder
     - 输入上下文渲染标签名
   - `assets/workspace/.nbook/agent/profiles/builtin/leader.default.profile.tsx`
     - 多 Agent 协作中 writer 说明。
     - 创建或调用 writer 前查询 `get_agent_profile` 的建议保留，但示例字段改成新合同。
     - 删除 “plotPoints 传 Scene ID / 必须包含 novelId / outputPath / lorebookEntries 可带 priority、reason、writingTip”。
     - 增加 “一章节一 writer agent；chapterPaths 传 Agent cwd-relative Project 章节路径，例如 project-slug/manuscript/.../，writer 会展开本章 Scene 与 Plots，并写入对应章节 index.md”。
     - 增加调用前置条件：章节文件或空模板已经存在，Plot System 已把该章需要写的 Scene 挂载到章节。
   - `assets/workspace/.nbook/agent/profiles/builtin/retrieval.profile.tsx`
     - retrieval 输入只保留自然语言 `prompt`。
     - retrieval 仍输出给 Leader 使用的候选判断结果，而不是只输出 string[]。
     - `report_result.data` 为 `{ entries, note? }`；`entries` 按推荐优先级排序。
     - 结果项包含必填 `path`、`reason`，可选 `use`、`risk`；不再使用 `summary`、`priority`、`writingTip` 字段。
     - Leader 调 writer 时只把 retrieval 结果中的 `entries[].path` 列表传给 `writer.lorebookEntries`。
     - 删除“writer.lorebookEntries 接收对象数组”的旧暗示，改成“retrieval 输出候选判断结果；writer 只消费 path 数组”。
   - `assets/workspace/.nbook/agent/profiles/builtin/leader.assets.profile.tsx`
     - 只同步 profile 系统通用说明中的 writing preset 新路径。
     - 不增加 writer 调用教学，因为 `leader.assets` 面向 user-assets/profile 编辑，不负责小说写作调度。
   - `assets/workspace/.nbook/agent/skills/profile-system-guide/**`
     - 如果提到 writer 输入、profile schema 示例或 preset 路径，改为新合同和新目录。
   - `assets/workspace/.nbook/agent/skills/tsx-profile-editing/**`
     - 如果示例包含 writer schema 或旧 preset 路径，同步新合同。
   - `docs/tasks/06-leader-default-prompt-parity/README.md`
     - 更新历史任务的当前状态段，说明 writer 合同已从 Scene ID 切到 chapterPaths。
   - `docs/tasks/02-pi-agent-harness-migration/README.md`
     - 更新 agent/profile 状态摘要和 active 验证命令中的 writer 合同描述。

6. 更新编译产物与同步元数据
   - 系统 profile 修改后运行 `scripts/prepare-system-profile-metadata.ts`。
   - 确认系统 `.compiled` artifact 和 `.system-profile-metadata.json` 更新。
   - 如果用户覆盖未手改，后续同步流程应能同步新 writer profile 和 preset 资源。
   - 用户覆盖的 `workspace/.nbook/agent/profiles/builtin/writer.profile.tsx` 如果未手改，应由同步流程自动覆盖到新合同；如果已手改，则保留用户覆盖并返回遮蔽 warning。

7. 更新测试和仓库状态
   - 不单独修改 `AgentCatalog` 节点实现；它会自然使用 profile manifest 和 `WriterInputSchema` schema summary。
   - 测试需要覆盖旧字段不再出现在 writer schema summary / writer 调用教学中：
     - `plotPoints`
     - writer 语义下的 `novelId`
     - `outputPath`
     - writer schema 中的 `reason`
     - writer schema 中的 `priority`
     - writer schema 中的 `writingTip`
   - 注意 `novelId` 在 Plot/SQL 工具说明中仍然合法存在；`reason` 在 retrieval 输出中仍然合法存在；`priority`、`writingTip` 已从 retrieval 当前合同中删除。测试不能全局禁用普通剧情/内容节点里的同名文字，只能针对 writer 段落、writer schema summary 或 retrieval schema/prompt。
   - 任务完成后更新 `PROJECT-STATUS.md`，记录 builtin writer contract 和 Agent 资产结构变化。

## Decisions

- “章节 id”在当前系统内按 `chapterPath` 处理。字段命名使用 `chapterPaths`，避免模型误传旧 DB Chapter 数字 id。
- writer 调用模型锁定为“一章节一 agent”。调用方修改该章 Scene 挂载后，应重新创建 writer agent；同一个 writer 可以继续做后续润色，但不是主路径。
- `chapterPaths` 同时承担章节剧情上下文和写入目标；删除 `outputPath`。
- `chapterPaths` 第一版只允许一个元素；多章节写作应创建多个 writer agent。
- writer 要求章节内容节点已经存在，不负责创建章节文件或空模板。
- writer 默认根据 prompt 决定重写或修改；普通写作可重写章节正文，润色/修改任务可局部编辑。
- 跨 Project Workspace 写作允许，但只能以显式 `project-slug/manuscript/.../` cwd-relative 路径触发，不允许猜测；不接受 `workspace/<project>/...`。
- `lorebookEntries` 直接使用 `string[]`，数组顺序即调用方给出的优先级。
- 不保留旧 `plotPoints` / `novelId` / `outputPath` / object-shaped `lorebookEntries` 兼容。
- writing presets 新目录使用 `agent/writing-presets/{styles,references}`。
- 旧 `agent/profiles/builtin/writing-*` 目录删除，不做 legacy fallback。
- preset 调用值继续使用 frontmatter `key`，不改成文件路径。
- preset 是运行时数据，不纳入 profile `.compiled` dependency hash；改 preset 不要求重新编译 writer。
- `agent/writing-presets/**` 纳入 system assets 同步，并扩展 sync state 记录 profile 之外的 agent assets。
- `leader.assets` 只同步 writing preset 路径说明，不加入 writer 小说写作调度教学。
- `AgentCatalog` 不做专门改造；writer schema summary 和 manifest 改对后自然更新。
- retrieval 输入已精简为 prompt-only；输出 `{ entries, note? }` 给 Leader 判断；Leader 调用 writer 时只提取 `entries[].path` 列表作为 `writer.lorebookEntries`。
- 任务完成后更新 `PROJECT-STATUS.md`。
- 不允许 writer 根据当前 UI active novel、自然语言章节名或旧 active scene 猜测写入目标。

## Files Changed

- `server/agent/profiles/builtin-contracts.ts`
  - 硬切 `WriterInputSchema`。
  - 将 `RetrievalInputSchema` 改为只接收 `prompt`。
  - 将 `RetrievalOutputSchema` 改为面向 Leader 的 `{ entries, note? }` 候选判断对象。
- `assets/workspace/.nbook/agent/profiles/builtin/writer.profile.tsx`
  - 用 `chapterPaths` 解析和 `<chapter_plots>` 替代旧 `plotPoints`。
  - `lorebookEntries` 改为 string[] 并按输入顺序读取。
  - 写作提示词改为“一章节一 agent”。
- `assets/workspace/.nbook/agent/profiles/builtin/leader.default.profile.tsx`
  - 更新 writer/retrieval 协作说明。
- `assets/workspace/.nbook/agent/profiles/builtin/retrieval.profile.tsx`
  - 使用 `WorkdirReminder` / `ProjectWorkspaceReminder` 替代旧多字段 run context。
  - 更新 prompt-only 输入和 report_result 输出合同说明。
- `assets/workspace/.nbook/agent/profiles/builtin/leader.assets.profile.tsx`
  - 增加 writing preset 新路径说明。
- `server/agent/profiles/writer-writing-reference.ts`
- `server/agent/profiles/writer-writing-style.ts`
  - 只读取新 preset 目录，不做 legacy fallback。
- `assets/workspace/.nbook/agent/writing-presets/references/**`
- `assets/workspace/.nbook/agent/writing-presets/styles/**`
  - 从旧 `agent/profiles/builtin/writing-*` 迁移。
- `server/workspace-files/novel-workspace.ts`
  - 扩展 user-assets sync state，支持 writing presets 缺失复制、未手改更新、手改保留 warning。
- `server/agent/profiles/leader-assets-profile.test.ts`
- `server/workspace-files/workspace-files.test.ts`
  - 更新 schema、prompt、writer lorebook 和 preset sync 测试。
- `assets/workspace/.nbook/agent/profiles/.compiled/**`
- `assets/workspace/.nbook/agent/profiles/.system-profile-metadata.json`
  - 重新生成系统 profile 编译产物和 metadata。

## Verification

已运行：

```powershell
bun scripts/prepare-system-profile-metadata.ts
bunx vitest run server/agent/profiles/leader-assets-profile.test.ts server/workspace-files/workspace-files.test.ts
```

2026-05-30 本轮补充验证：

```powershell
bun scripts/build/prepare-system-profile-metadata.ts
bun scripts/build/profile.ts check builtin/writer.profile.tsx --system
bunx vitest run server/agent/harness/neuro-agent-harness.test.ts server/agent/profiles/leader-assets-profile.test.ts
```

结果：系统 profile metadata 生成成功，`profile check passed`；`2 passed` test files，`86 passed` tests。

已额外搜索旧合同：

```powershell
rg -n "plotPoints|必须同时提供 novelId|outputPath|profiles/builtin/writing|lorebookEntries.*reason|priority|writingTip" assets/workspace/.nbook/agent server/agent/profiles server/workspace-files docs/tasks/08-writer-profile-input-contract/README.md PROJECT-STATUS.md
```

残留说明：
- `outputPath` 仍存在于 `WriterOutputSchema`，表示 report_result 的实际写入路径，不是 writer input。
- `reason`、`use`、`risk`、`note` 仍存在于 `RetrievalOutputSchema` 和 retrieval prompt，面向 Leader 使用；`summary`、`priority`、`writingTip` 已从 retrieval 当前输出合同删除。
- `plotPoints` 等旧字段只保留在本任务文档的历史背景和决策记录中。

本轮 retrieval schema 精简后新增验证范围：

```powershell
bun scripts/prepare-system-profile-metadata.ts
bunx vitest run server/agent/profiles/leader-assets-profile.test.ts
bun scripts/profile.ts status --all --system
```

预期：
- `RetrievalInputSchema` 只包含 `prompt`。
- `RetrievalOutputSchema` 顶层为 `{ entries, note? }`。
- `entries[].path` 是唯一传给 writer 的字段；`reason/use/risk/note` 只给 Leader 判断。

## TODO / Follow-ups

- 如用户已有手改的 `workspace/.nbook/agent/profiles/builtin/writer.profile.tsx`，同步流程会保留用户文件并返回 warning，需要用户决定是否恢复系统版本。
- 当前 writer 单元测试用 TSX 源码 profile + mocked Prisma/plotFacade 验证 prompt 逻辑；catalog 路径仍通过系统 `.compiled` 测试覆盖。
