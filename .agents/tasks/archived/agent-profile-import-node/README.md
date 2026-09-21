# Agent Profile Import Node

## User Request

- 不要继续把共用协议内容手工复制进各个 profile prompt。
- 新增一个更通用的 TSX Profile DSL 节点，例如 `<Import path="..." />`，用于加载任意文本文件；未来可以扩展到图片等多模态资源。
- 这个节点通常放在 `HistorySet` 里，让 profile 作者可以显式声明要加载的共享文档。
- `reference/` 和 `docs/` 可以给 agent 使用，构建产物应该包含这些目录。
- 后续整理 `reference/` 文档，让 profile 可以引用稳定参考，而不是在 prompt 中内嵌大量重复说明。

## Goal

新增 Profile DSL `Import` 节点，使 profile 作者可以显式加载共享文档上下文，减少 builtin profile prompt 中重复、易漂移的协议说明。第一版以 UTF-8 文本导入为目标，验证面包括 Profile DSL 渲染测试、profile workbench parser、profile check、system build 产物包含 `AGENTS.md`、`reference/` 与 `docs/`，并把 `leader.default` 中一部分共享项目协议迁移为 `<Import />` 引用。

成功标准：

- Profile DSL 支持类似 `<Import path="reference/content/directory-protocol.md" />` 的节点。
- `Import` 可以作为 string-like child 放入 `System`、`Message`、`HistorySet` / `ModelContext` / `AppendingSet` 中的消息内容。
- 第一版至少支持 UTF-8 文本文件，默认用于 Markdown。
- 路径安全边界明确，不允许绝对路径或 `..` 越界。
- 构建 / 发布产物包含 profile 可能引用的 `AGENTS.md`、`reference/`、`docs/`。
- 至少有一个 builtin profile 使用 `Import` 加载共享规范，并通过 profile check 与窄测试。

## Current State

- 当前 `server/agent/profiles/profile-dsl.ts` 已有 `StringFragment` 节点，支持异步渲染 string。
- `SkillCatalog`、`AgentCatalog`、`SystemReminder`、`MentionedSkillsReminder` 等节点已经通过 `StringFragment` 实现。
- `System` 只接受 string-like child；`Message` 内容也通过 `renderStringChildren()` 渲染。
- 因此 `Import` 第一版不需要新增完整复杂节点类型，可以实现为一个可复用的 string fragment helper。
- `leader.default` 已迁移为通过 `HistorySet > Message > Import` 加载三份共享规范：`reference/agent/leader-default.md`、`reference/content/markdown-dialect.md` 和 `reference/agent/project-workspace-guide.md`。
- 构建脚本已把 repo 根 `AGENTS.md`、`reference/`、`docs/` 明确纳入 compiled runtime 可引用资源。
- Profile Workbench 已能识别、展示和拖入 `Import` 节点。
- `reference/agent/README.md` 和 `reference/content/README.md` 已成为 Agent 阅读稳定参考的入口。
- 旧 active 文档 `docs/modules/agent/tools-reference.md` 已删除，避免继续暴露 v2 `read_file` / `execute_shell` / subagent 工具心智。

## Walkthrough

- 讨论确认不应直接把 `leader.default` 的 lorebook 段替换成另一段长 prompt。
- 讨论确认共用机制应该拆分成共享文档，由 profile 显式加载。
- 初步命名从 `ContextDoc` 收敛为更通用的 `Import`，因为未来不仅可能加载 Markdown 文本，也可能扩展到图片或其他资源。
- 初步判断 `Import` 最适合实现为 Profile DSL 的 string-like helper，可放在 `HistorySet` 中的 `<Message>` 内，或必要时放入 `System`。
- 已实现 `Import` DSL helper、path allowlist、Markdown heading 截取、UTF-8 字节截断和缺失文件可选降级；早期 `<imported-context>` 包裹输出已在后续调整中改为 Markdown fenced block。
- 已新增稳定参考 `reference/agent/profile-import.md`，并整理 `reference/agent/profile-guide.md`、`reference/agent/context.md` 和 `reference/agent/project-workspace-guide.md`。
- 已把 `leader.default` 的共享项目目录说明迁移为 `HistorySet > Message > Import`，避免在 profile prompt 中继续复制大段项目协议。
- 已补齐 Profile Workbench 的 `Import` 节点库、默认 props、叶子节点规则、inline string 规则和视觉样式。
- 已从 `leader.default` prompt 中继续抽出共享操作协议，新增 `reference/agent/leader-default.md`，覆盖工具使用、Task Management、多 Agent 协作、writer / retrieval / researcher / RP 调度、SQL、Plan Mode 和 Skills。
- 已从 `leader.default` 的 Markdown 扩展说明中抽出 `reference/content/markdown-dialect.md`，覆盖 workspace links、inline comment、mark、文本颜色、上下标和 align。
- 已新增 `reference/agent/README.md` 与 `reference/content/README.md`，让 Agent 先从稳定参考入口阅读，而不是优先读任务 walkthrough。
- 已同步系统 profile 与用户覆盖 profile：`assets/workspace/.nbook/agent/profiles/builtin/leader.default.profile.tsx` 和 `workspace/.nbook/agent/profiles/builtin/leader.default.profile.tsx` 都使用相同的三份 `Import`。
- 已刷新 `leader.default` compiled artifact 和 system profile metadata，避免用户覆盖层继续遮蔽旧 prompt。
- 已更新 `README.md`、`docs/README.md`、`docs/operator-bridge.md`、`docs/modules/README.md` 和 `PROJECT-STATUS.md` 的入口索引。
- 已删除 active 旧工具表 `docs/modules/agent/tools-reference.md`；它仍在描述 v2 工具名，当前合同改由 `reference/agent/leader-default.md` 和迁移任务记录承担。
- 已保留 `docs/archived/plan/`：它位于 archived 区且没有 active 入口引用，当前不作为 Agent 默认阅读源。
- 后续调整：`Import` 输出从 `<imported-context>` 改为 Markdown fenced block，opening fence 的 info string 是导入路径；缺失文件默认返回空字符串，依赖 `<Message>` 空内容过滤自动忽略。
- 后续调整：`leader.default`、`leader.assets`、`leader.rp` 都在 `HistorySet` 中显式导入仓库根 `AGENTS.md`，保证 leader 能稳定看到项目级协作规则。

## Decisions

- 节点名使用 `Import`，而不是 `AutoLoad`。
  - `AutoLoad` 暗示隐式自动加载；当前需求是 profile 作者显式声明。
  - `Import` 更通用，后续可以扩展文本、图片、二进制或 artifact import。
- 第一版只实现文本导入。
  - 目标文件按 UTF-8 读取。
  - Markdown 是主要使用场景，但不强制只允许 `.md`，具体白名单后续实现时再定。
- 第一版优先作为 string-like child。
  - 可以放进 `<System>`。
  - 可以放进 `<Message>`，再由 `HistorySet` / `ModelContext` / `AppendingSet` 承载。
  - 推荐稳定共享规范放 `HistorySet`，避免每轮重复注入。
- `reference/` 和 `docs/` 是 agent 可用的共享知识层。
  - `reference/` 放稳定参考和实现契约，适合被 profile 导入。
  - `docs/` 放任务、研究和草案，适合按需导入；不要把未稳定草案默认长期注入所有 profile。
- 构建产物必须包含 `AGENTS.md`、`reference/`、`docs/` 或至少包含 profile import 允许引用的子集。

## Proposed API

```tsx
<HistorySet>
    <Message>
        <Import path="reference/content/directory-protocol.md" />
    </Message>
</HistorySet>
```

可选参数建议：

```tsx
<Import
    path="reference/content/directory-protocol.md"
    heading="Information Layers"
    maxBytes={12000}
    required
/>
```

字段：

| Prop | Purpose |
| --- | --- |
| `path` | repo / app root 相对路径。第一版不接受绝对路径。 |
| `heading?` | 可选 Markdown 标题段，只加载该标题下内容。 |
| `maxBytes?` | 限制读取字节，避免 profile 上下文过大。 |
| `required?` | 缺失文件默认输出空字符串；true 时缺文件抛错。heading 缺失默认抛错；false 时输出空字符串。 |
| `label?` | 兼容保留字段；当前 fenced block 输出不显示它。 |
| `as?` | 未来扩展字段。第一版固定为 `text`。 |

渲染格式建议：

```text
```reference/content/directory-protocol.md
...
```
```

如果被截断：

```text
[Import truncated: reference/content/directory-protocol.md maxBytes=12000]
```reference/content/directory-protocol.md
...
```
```

## Implementation Notes

- 在 `server/agent/profiles/profile-dsl.ts` 新增 `Import(props)`。
- 复用 `ProfileStringFragmentNode`：

```ts
export function Import(props: ImportProps): ProfileStringFragmentNode {
    return {
        kind: "StringFragment",
        text: async () => renderImportedContext(props),
    };
}
```

- `renderImportedContext()` 负责：
  - 解析 app root 相对路径。
  - 拒绝绝对路径、空路径、`..` 越界。
  - 检查 allowlist。
  - 读取 UTF-8 文本。
  - 可选按 Markdown heading 截取。
  - 可选按 `maxBytes` 截断。
  - 输出以导入路径作为 info string 的 Markdown fenced block。
- 第一版 allowlist 建议：
  - `AGENTS.md`
  - `reference/**`
  - `docs/**`
  - 可选：`assets/workspace/.nbook/agent/**` 的特定 profile/skill reference 文件，后续再议。
- 不建议第一版允许 Project Workspace 文件，因为 Project Workspace 文件已有 `read` 工具和 runtime reminder；`Import` 目标是共享系统文档，不是替代文件工具。
- 缺失文件默认空输出；需要强制存在时由 profile 作者显式设置 `required={true}`。
- 需要确认 system build、portable package、local-git / source release zip 包含 import allowlist 中的文件。

## Spec / Docs Cleanup Direction

已完成第一轮整理：

- `reference/agent/profile-import.md`：`Import` 节点的 API、放置位置、安全边界和 build contract。
- `reference/agent/profile-guide.md`：active DSL 指南，包含 `Import` 的推荐写法和 checklist。
- `reference/agent/context.md`：active `ProfilePrompt` 拆分规则，说明 `Import` 作为 string fragment 的上下文位置。
- `reference/agent/README.md`：Agent 稳定参考入口。
- `reference/agent/leader-default.md`：默认 Leader 可共享的操作协议。
- `reference/agent/project-workspace-guide.md`：面向 agent profile 共享导入的 NeuroBook Project Workspace 操作指南。
- `reference/content/README.md`：内容规范入口。
- `reference/content/markdown-dialect.md`：NeuroBook Markdown 扩展格式。
- `reference/README.md`：补充 Agent / Content reference 入口与关键共享规范索引。

入口文档现已调整为：

- Agent prompt / profile / 工具协作 / workspace 文件语义：先读 `reference/agent/README.md`、`reference/agent/leader-default.md`、`reference/agent/project-workspace-guide.md`、`reference/agent/profile-import.md`。
- 内容节点 / lorebook / simulation / Markdown 扩展：先读 `reference/content/README.md`。
- `docs/tasks/**` 继续作为迁移过程和历史决策，不作为默认协议真相源。

`docs/tasks/01-agent-roleplay-mode/` 与 `docs/tasks/28-lorebook-information-control-protocol/` 继续作为过程记录，不作为 profile 默认导入源。

## Files Changed

- `docs/tasks/29-agent-profile-import-node/README.md`
- `PROJECT-STATUS.md`
- `README.md`
- `docs/README.md`
- `docs/operator-bridge.md`
- `docs/modules/README.md`
- `docs/tasks/11-portable-project-workspace/README.md`
- `docs/modules/agent/tools-reference.md`（删除）
- `server/agent/profiles/profile-dsl.ts`
- `server/agent/profiles/profile-dsl/jsx-runtime.ts`
- `server/agent/profiles/profile-dsl-source-parser.ts`
- `shared/dto/profile-template.dto.ts`
- `server/agent/profiles/profile-dsl.test.ts`
- `server/agent/profiles/workbench-service.test.ts`
- `server/agent/profiles/leader-assets-profile.test.ts`
- `assets/workspace/.nbook/agent/profiles/builtin/leader.default.profile.tsx`
- `workspace/.nbook/agent/profiles/builtin/leader.default.profile.tsx`
- `scripts/build/patch-nitro-runtime-deps.mjs`
- `reference/README.md`
- `reference/agent/README.md`
- `reference/agent/leader-default.md`
- `reference/agent/profile-import.md`
- `reference/agent/profile-guide.md`
- `reference/agent/context.md`
- `reference/agent/project-workspace-guide.md`
- `reference/content/README.md`
- `reference/content/markdown-dialect.md`
- `app/components/profile-template-editor/profile-template-editor-config.ts`
- `app/components/profile-template-editor/profile-template-tree-utils.ts`
- `app/components/profile-template-editor/ProfileTemplateNodeView.vue`
- `app/components/profile-template-editor/ProfileTemplateLibraryItem.vue`
- `app/components/profile-template-editor/ProfileTemplateVisualEditor.vue`

## Verification

- `bun run test server/agent/profiles/profile-dsl.test.ts server/agent/profiles/workbench-service.test.ts`：通过，31 tests passed。
- `bun scripts/build/profile.ts check builtin/leader.default.profile.tsx --system`：通过。
- `bun scripts/build/profile.ts check builtin/leader.default.profile.tsx`：通过。
- `bun run test server/agent/profiles/leader-assets-profile.test.ts`：通过，10 tests passed；断言已改为验证 `systemPrompt + HistorySet Import` 的模型可见文本。
- `bun scripts/build/prepare-system-profile-metadata.ts`：通过，prepared system profile metadata: 9 profiles；同时刷新 profile variable IDE types。
- 此前同轮还验证过：
  - `bun run test server/agent/profiles/leader-assets-profile.test.ts`
  - `bun run test server/agent/profiles/rp-profiles.test.ts`
  - `bun run test server/agent/profiles/profile-compile-worker.test.ts`
  - `bun scripts/build/profile.ts check builtin/leader.rp.profile.tsx --system`
  - `bun scripts/build/prepare-system-profile-metadata.ts`
- 文档引用审计：
  - `rg -n "tools-reference\\.md|docs/modules/agent/tools-reference|agent/tools-reference" README.md docs reference PROJECT-STATUS.md`：仅剩“旧文档已下线”的说明。
  - `rg -n "# 工具使用|# Task Management|# 多 Agent|# Markdown 扩展|## Anatomy Lorebook|## Anatomy Manuscript|## Anatomy Plot System|# Shell commands|read_file|write_file|execute_shell" assets/workspace/.nbook/agent/profiles/builtin/leader.default.profile.tsx workspace/.nbook/agent/profiles/builtin/leader.default.profile.tsx server/agent/profiles/leader-assets-profile.test.ts reference/agent/leader-default.md reference/content/markdown-dialect.md reference/agent/project-workspace-guide.md`：profile 源码中无旧长段落或 v2 工具名；仅 reference/test 中保留预期标题和负断言。
- 未做浏览器验证；Profile Workbench 的本轮补齐只做代码级接入和窄测试覆盖。
- 全量 `bun run typecheck` 此前仍受既有无关类型问题阻塞，本任务未修改那些问题。

## TODO / Follow-ups

- 继续观察 `leader.default` 中是否还有适合迁移到 `reference/agent/project-workspace-guide.md` 的共享项目协议段。
- 未来如果 `Import` 支持图片、多模态内容或 artifact 引用，需要扩展 `as`、渲染格式、Workbench 属性面板和 build allowlist。
- 后续可以给 Profile Workbench 增加更细的 `Import` 属性编辑器，例如 path picker、heading picker 和 maxBytes 输入。
