# Writer Payload Context Tools

## Relative documents refs

- [Writer profile doc](../../profile/writer.md)
- [Leader collaboration protocol](../../../reference/agent/leader-default.md)
- [Novel Writing Workflow](../../../reference/agent/novel-writing-workflow.md)
- [Profile guide](../../../reference/agent/profile-guide.md)
- [Initial / Payload Schema task](../53-agent-initial-payload-schema/README.md)

## User Request / Topic

- 将普通 `writer` 从“一章节一 agent / 创建期绑定任务输入”改成可连续写作的长期 writer session。
- `create_agent` 时不再把章节、prompt、lorebook entries 等任务数据塞进 `InitialSchema`。
- `invoke_agent.message` 直接承载本轮写作指令，不再引入 “writer brief” 这个概念。
- `invoke_agent.input` 通过 `PayloadSchema` 传结构化上下文引用：目标 `path`、`threadIds`、`sceneIds`、`plotIds`、`lorebookEntries`、`readablePaths`。
- profile 不在 prepare 阶段自动读取上下文；writer 应获得必要只读工具，并在本轮写作中主动读取 Thread / Scene / Plot / chapter plot / lorebook / readable file。

## Goal

将 `writer` 改造成可复用的正式正文写作 agent：创建时 `initial` 为空；每轮 invoke 由自然语言 `message` 表达写作意图，由 `payload.path` 指定唯一写入目标，由 `payload.context` 提供建议读取的结构化引用。实现后，writer profile 会把目标 path 和读取清单呈现给模型，并提供必要只读工具让 writer 主动读取上下文，而不是在 prepare 阶段预先注入所有内容。

验收证据：

- `get_agent_profile({profileKey: "writer"})` 返回非空 `PayloadSchema`。
- `create_agent({profileKey: "writer", initial: {}})` 可创建长期 writer session。
- `invoke_agent` 传 `message + input` 时，writer 的 prepare prompt 包含目标 path 和 context 引用清单，writer root tools 包含必要只读读取工具。
- writer 能按需主动读取 Thread / Scene / Plot / chapter plot / lorebook / readable file，并只写 `payload.path`。
- 缺失 path、非法 path、越界 path、无效 id 时有明确错误。
- 相关 profile contract / harness payload 测试通过，并补 writer profile 针对性测试。

## Current State

- `writer` 已切换为 `InitialSchema = {}`，并新增 `PayloadSchema` 承载每轮 `path + context`。
- `writer.profile.tsx` 已通过 `ctx.invocation.message` 和 `ctx.invocation.payload` 构造 prompt，不再读取旧 `ctx.initial.prompt/chapterPaths/lorebookEntries`。
- `writer` prepare 阶段只注入目标 path、Project 信息、可选 chapterPath 和建议读取清单，不再自动读取章节 Plot 或 lorebook 正文。
- `writer` root tools 已包含 `get_story_thread`、`get_story_scene_context`、`get_story_plot_context`、`get_chapter_plot` 四个 Plot 只读工具。
- `rp.writer` 已经是空 initial、每轮 message 驱动，但它只消费上级已整理好的 RP prose 指令，不读取完整 lorebook / Plot，也不写正式章节。
- `PayloadSchema` 运行时能力已经接入 harness / HTTP / agent tool，但生产 profile 暂未使用。

## Decisions / Discussion

- `message` 是本轮自然语言写作指令：写什么、怎么写、续写/润色/重写边界、重点与禁忌。
- 不使用 “writer brief” 这个术语，避免和 `rp.writer` 的 Writer Brief 混淆。
- `payload.path` 是唯一目标文件路径。writer 只能写这个 path，不从 UI active chapter、章节名、历史消息或旧 initial 猜落点。
- `payload.path` 允许 Project Workspace 内任意 Markdown 文件，不限于 `manuscript/**/index.md`。
- `payload.context` 是读取清单和建议上下文，不承载自然语言任务正文，也不是硬授权边界。
- `threadIds`、`sceneIds`、`plotIds` 保留在 `PayloadSchema`，作为建议读取的结构化 Plot 引用。
- `lorebookEntries` 是建议读的高相关内容节点路径，不是硬授权边界；writer 可按本轮任务决定是否读取 `index.md` 和同级可选 `state.md`。
- `readablePaths` 是普通文件建议读取清单，不是硬授权边界；writer 可按需读取，不在 prepare 阶段自动注入文件内容。
- 第一版不保留 style 字段，writer 使用默认 writing style / writing reference。
- 第一版不做 profile-aware file read guard，只在 writer prompt 中限制读取和写入边界。
- `get_chapter_plot` 保留，不删除；它适合写整章、续写整章或检查章节 Plot 覆盖度。
- `get_story_thread`、`get_story_scene_context`、`get_chapter_plot` 三个现有 Plot 只读工具都可给 writer 使用，但 writer 不应机械读取所有 context。
- 为 `plotIds` 新增 `get_story_plot_context`，返回 Plot 本体、所属 Scene 和所属 Thread。
- `message` 必须写清写作任务本身。payload 中的 id 和路径不能替代任务指令，writer 不应只靠 id 自己规划剧情。
- 最新 invoke 的 payload/message 是任务真相；历史消息只提供协作上下文，不能要求 writer 拼接历史才能理解本轮任务。

## Proposed PayloadSchema

```ts
export const WriterPayloadSchema = Type.Object({
    path: Type.String({
        minLength: 1,
        description: "本轮写入或修改的目标文件路径，必须是 Workspace Root cwd-relative Project 路径，例如 project-slug/manuscript/001-volume/001-chapter/index.md。writer 只能写这个路径。",
    }),
    context: Type.Optional(Type.Object({
        threadIds: Type.Optional(Type.Array(Type.String({
            minLength: 1,
            description: "调用方建议 writer 按需读取的 Thread id。writer 可使用 get_story_thread 主动读取详情。",
        }))),
        sceneIds: Type.Optional(Type.Array(Type.String({
            minLength: 1,
            description: "调用方建议 writer 按需读取的 Scene id。writer 可使用 get_story_scene_context 主动读取 Scene、所属 Thread 与章节 Plot 上下文。",
        }))),
        plotIds: Type.Optional(Type.Array(Type.String({
            minLength: 1,
            description: "调用方建议 writer 按需读取的 Plot id。writer 可使用 get_story_plot_context 主动读取 Plot 及所属 Scene / Thread 上下文。",
        }))),
        lorebookEntries: Type.Optional(Type.Array(Type.String({
            minLength: 1,
            description: "调用方建议 writer 按需读取的内容节点路径，必须是 Workspace Root cwd-relative Project 路径。writer 可按需读取 index.md 与同级 state.md。",
        }))),
        readablePaths: Type.Optional(Type.Array(Type.String({
            minLength: 1,
            description: "除 path 和 lorebookEntries 外，本轮建议 writer 按需读取的普通文件路径，必须是 Workspace Root cwd-relative Project 路径。",
        }))),
    }, {additionalProperties: false})),
}, {additionalProperties: false});
```

## Leader Invoke Contract

leader 调用 `writer` 时：

- `create_agent`：`initial: {}`，可以长期复用同一个 writer session。
- `invoke_agent.message`：直接写普通人类可读的写作指令，不叫 Writer Brief，不使用 XML 包装。
- `invoke_agent.input.path`：唯一写入目标。
- `invoke_agent.input.context`：传建议读取清单。writer 根据 message 判断要读取哪些上下文。

示例：

```json
{
  "sessionId": 123,
  "mode": "prompt",
  "message": "请续写这一章，从主角推开档案室门开始，到她发现账册缺页并决定隐瞒为止。重点落实 sceneIds 中的账册缺页和管家试探；主角不能立刻理解真相，只能察觉有人提前来过。结尾停在她把缺页痕迹拍照保存，听见走廊脚步声。第三人称，长自然段，不要标题、总结或选项。写完后润色一次并 report_result 汇报实际修改路径和约 100 字剧情摘要。",
  "input": {
    "path": "my-novel/manuscript/001-volume/003-chapter/index.md",
    "context": {
      "threadIds": ["thread-main-missing-ledger"],
      "sceneIds": ["scene-ledger-missing-page", "scene-butler-probe"],
      "plotIds": ["plot-account-book-clue"],
      "lorebookEntries": [
        "my-novel/lorebook/character/protagonist/",
        "my-novel/lorebook/location/archive-room/"
      ],
      "readablePaths": [
        "my-novel/manuscript/001-volume/002-chapter/index.md"
      ]
    }
  }
}
```

## Plot Read Tools

- `get_story_thread`：按 `threadId` 读取剧情线详情。适合 writer 需要理解长期线索、主线目标、该 thread 下有哪些 scene 时使用。返回 Thread 标题、summary、status、writingTip、note 以及 scenes 概览。
- `get_story_scene_context`：按 `sceneId` 读取具体 Scene 上下文。它通常比 thread 更贴近正文写作，因为正文往往围绕 scene 落地。返回 `{thread, scene, chapterPlot}`，包含 Scene 本体、所属 Thread、以及该 Scene 所在章节的 chapter plot view。
- `get_chapter_plot`：按 `chapterPath` 读取整章挂载的所有 scenes / plots。保留，不删除。它适合“写整章 / 续写整章 / 检查本章 Plot 覆盖度”这类任务；但 writer 不应默认读取整章，只有 message 要求整章视角、sceneIds 不足以完成任务，或需要检查章节覆盖度时才用。
- `get_story_plot_context`：本任务新增建议工具。按 `plotId` 读取单个 Plot 及所属 Scene / Thread，返回 `{thread, scene, plot}`。它补足 `plotIds` 精准读取场景。

## Implementation Plan

1. 更新 schema 合同
   - 在 `server/agent/profiles/builtin-contracts.ts` 新增 `WriterPayloadSchema`。
   - 将 `WriterInitialSchema` 改为空对象 `{}`，保留 `WriterOutputSchema`。
   - 更新 `writer.profile.tsx` 导出 `PayloadSchema` / `Payload` 类型并传入 `payloadSchema`。

2. 改造 writer prepare 输入
   - `buildWriterPrompt(ctx)` 改成 `ProfilePrepareContext<Initial, Payload>`。
   - `renderInputContext(ctx)` 从 `ctx.invocation?.payload` 读取 `path` 与 `context`，只渲染目标路径和读取清单，不读取并注入文件正文。
   - `ctx.invocation?.message` 注入到 AppendingSet，作为本轮写作指令。
   - 没有 payload 或缺少 `path` 时，明确阻止写入并要求调用方通过 `invoke_agent.input` 提供目标路径。

3. 目标文件与读取清单
   - 解析 `payload.path` 为 Workspace Root cwd-relative Project 路径。
   - 校验路径不越过 workspace，且必须带 Project slug 前缀。
   - 允许 Project Workspace 内任意 Markdown 文件，例如 `project-slug/manuscript/.../index.md`、`project-slug/notes/foo.md`、`project-slug/drafts/bar.md`。
   - 注入 `<target_file>`，包含 `path`、`projectPath` 和“writer 需要时先用 read 读取现有内容”的指令。
   - 如果目标文件不存在，writer 可以按 message 指令创建；不要静默猜其它路径。

4. 提供 Plot 只读工具
   - writer root tools 增加 `builtin.plot.getThread`、`builtin.plot.getSceneContext`、`builtin.plot.getChapter`。
   - 新增 `builtin.plot.getPlotContext` 或等价 binding，绑定运行时工具 `get_story_plot_context`。
   - 新增 `get_story_plot_context` 运行时只读工具；入参 `{projectPath, plotId}`，返回 `{thread, scene, plot}`。
   - 保留 `get_chapter_plot`，不删除。
   - Prompt 中要求 writer 按本轮 message 判断是否需要读取，不要机械读取所有 id / chapter plot。
   - 对不存在或跨 Project 的 id，由工具返回明确错误。

5. 内容节点读取方式
   - 不再由 prepare 自动调用 `buildLorebookText`。
   - Prompt 中列出 `payload.context.lorebookEntries`，作为 leader 推荐的高相关节点。writer 需要设定时先 read 节点 `index.md`，必要时 read 同级 `state.md`；不要求机械读取所有节点。
   - 保留 writer-facing frontmatter 白名单语义：writer 只把 title/type/status/summary/aliases/tags/refs 与 state statusNote/updatedAt/knowledge 当作可见元数据。
   - 路径必须是 cwd-relative Project 路径，禁止裸 `lorebook/...` 和 `workspace/project/...`。

6. readablePaths 读取方式
   - 不再由 prepare 自动读取普通文件。
   - Prompt 中列出 `payload.context.readablePaths`，作为本轮建议 writer 主动读取的普通文件清单。
   - writer 需要前情、草稿、提纲或参考片段时用 read 主动读取。
   - 第一版只用 prompt 约束读取范围，不设计 profile-aware file read guard。

7. 更新 writer prompt 规则
   - 删除“一章节一 agent / writer.initial.chapterPaths”口径。
   - 明确 writer 是长期写作工位：每轮只写 `payload.path`。
   - 明确 `message` 是写作指令，必须包含任务动作、正文范围、关键约束和结束条件。
   - 明确 `payload.context` 是读取清单，不是任务正文；id 和路径不能替代写作任务。
   - 明确 writer 先按需读取，再写作，不要求每轮机械读取所有 context。
   - 明确 `path` 虽允许任意 Project Markdown，但 writer 不维护 Plot、simulation state、agent-context 规则文件、subject/memory/state 等结构性状态；message 若要求写这些内容，writer 应拒绝或转给 leader / 对应 profile。
   - 保留 stop-slop、长自然段、视角边界、report_result、文件写入和润色流程。

8. 更新 leader / docs 口径
   - 更新 `reference/agent/leader-default.md`：创建 writer 使用 `initial: {}`，复用已有 writer；每轮 `invoke_agent.message + input`。
   - 更新 `docs/profile/writer.md` 和 `reference/agent/novel-writing-workflow.md`。
   - 清理旧 `writer.initial.chapterPaths/lorebookEntries/constraints` 说明。

9. 系统 profile artifact 同步
   - 运行 profile check / compile / prepare system assets 的既有流程，确保 builtin 源码和系统同步产物一致。
   - 检查 `workspace/.nbook/agent/profiles/builtin/writer.profile.tsx` 是否需要同步。

## Verification / Test

- 新增 writer profile contract test：确认 `writer.payloadSchema` 存在、`writer.initialSchema` 为空、root tools 包含 file read/write/edit/bash、不包含 apply_patch，包含 Plot 只读工具和 report_result。
- 新增 writer payload prepare 测试：
  - `payload.path + message` 注入 `<target_file>`、读取清单与自然语言写作指令。
  - `threadIds` / `sceneIds` / `plotIds` / `lorebookEntries` / `readablePaths` 出现在读取清单中。
  - prepare 不读取文件正文，也不读取 Plot 摘要。
- 新增 `get_story_plot_context` 工具 / facade 测试。
- 更新 agent collaboration tool 测试：`get_agent_profile("writer")` 返回 `PayloadSchema` 摘要。
- 运行目标测试：
  - `bun test server/agent/profiles/rp-profiles.test.ts server/agent/profiles/simulation-director-profiles.test.ts server/agent/profiles/leader-assets-profile.test.ts server/agent/harness/neuro-agent-harness-payload.test.ts server/agent/tools/agent-collaboration-tools.test.ts shared/dto/agent-session.dto.test.ts`
- 如 profile artifact 变化，运行对应 profile compile / system assets 准备命令。

已执行：

- `bun scripts/build/prepare-system-assets.ts`：完成，编译 stale profile artifact。
- `bun scripts/build/prepare-system-assets.ts --sync-user-assets`：完成，正式系统 profile 与 `workspace/.nbook` 用户侧副本已同步；后续模板修复后再次同步，updated assets 2；更新 `tsx-profile-editing` skill 旧合同口径后再次同步，updated assets 1。
- `bun scripts/build/prepare-system-assets.ts --sync-user-assets`：review fix 后再次完成，编译 stale profile 1，updated profiles 1。
- `bun test ./server/agent/tools/plot-tools.test.ts ./server/agent/tools/agent-collaboration-tools.test.ts ./server/agent/profiles/leader-assets-profile.test.ts ./server/agent/harness/neuro-agent-harness-payload.test.ts`：31 pass。
- `bun test ./server/agent/profiles/leader-assets-profile.test.ts ./server/agent/harness/neuro-agent-harness-payload.test.ts ./server/agent/tools/agent-collaboration-tools.test.ts`：27 pass。
- `bun test ./server/agent/profiles/rp-profiles.test.ts ./server/agent/profiles/simulation-director-profiles.test.ts ./server/agent/profiles/profile-dsl.test.ts`：38 pass。
- `bun scripts/db/migrate-writer-session-initial.ts --dry-run`：scanned=198, migrated=0, skipped=198, failed=0。
- `bun test ./server/agent/profiles/catalog.test.ts ./server/agent/profiles/report-result-schema.test.ts ./server/agent/profiles/workbench-service.test.ts`：36 pass。顺手修复了 profile workbench 模板中的旧 `defineProfileTools/tools` 残留，并把测试断言同步为当前 `rootToolKeys` 字段。

## Implementation Walkthrough

- 2026-06-16：创建 task。根据用户决策记录：普通 writer 不再使用 “writer brief” 概念；message 是写作指令，payload 是 `path + context refs`；最初计划由 profile 自动读取并注入上下文。
- 2026-06-16：根据用户决策调整：`path` 允许 Project Workspace 内任意 Markdown 文件；`message` 必须承担写作任务本身；payload context 只提供读取清单和结构化引用；不在 prepare 阶段自动注入上下文正文，改为给 writer 提供工具让它主动读取。
- 2026-06-16：进一步确认：第一版不做硬性 file read guard；`lorebookEntries` / `readablePaths` 是建议读，不是授权边界；保留 `get_story_thread`、`get_story_scene_context`、`get_chapter_plot`；新增 `get_story_plot_context` 支持 `plotIds`；任意 Markdown 的职责边界只写入提示词，不做硬性路径拦截。
- 2026-06-16：实施 `WriterInitialSchema` 空 initial 与 `WriterPayloadSchema`；改造 writer profile 使用 `ctx.invocation.message/payload`；新增 `get_story_plot_context` 工具和 builtin binding；新增 writer session initial 专用迁移脚本；更新 writer / leader / workflow / content reference 文档。
- 2026-06-16：补充同步 `workspace/.nbook` 用户侧 writer profile，确保实际运行副本也使用长期 writer + payload 合同；修复 `basic-agent` / `report-agent` profile template 的旧工具 DSL import 和 `inputSchema` 残留，并同步更新 `tsx-profile-editing` skill 的 `InitialSchema/PayloadSchema/toolset/ctx.initial` 口径。
- 2026-06-16：根据 review 修复 writer prompt 残留：删除“没有文件路径时直接输出润色正文”的旧口径，改为缺少 `input.path` 时通过 `report_result.result` 要求调用方补 `invoke_agent.input.path`。

## TODO / Follow-ups

- 第一版不做 profile-aware file read guard；未来若 writer 误读隐藏信息，再评估工具层约束。
- 后续可考虑把 `writer` 与 `rp.writer` 的 stop-slop / 文风公共提示抽取复用，但本任务不做抽象重构。
