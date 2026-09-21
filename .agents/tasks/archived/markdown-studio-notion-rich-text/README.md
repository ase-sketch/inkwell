# Markdown Studio Notion-like 富文本

## User Request

- 删除当前 TipTap 编辑器中类 Obsidian Live Preview 的 mixed / 源码弱显实现。
- Markdown Studio 主编辑器只支持 Notion-like 富文本模式和源码模式。
- Markdown 原文仍然是唯一真相，ProseMirror 与 Markdown 文本之间互相转换。
- 表格仍要支持。

## Goal

- `rich` 模式使用真实 ProseMirror node / mark 展示图片、inline code、workspace reference 和表格。
- `source` 模式继续由 Monaco 编辑 Markdown 原文。
- 移除 Markdown Studio 主链路里的 mixed view mode 和 live-preview decoration 扩展。

## Current State

- `@tiptap/markdown` 负责 Markdown 与 ProseMirror 之间转换。
- `@tiptap/extension-table` 已在主编辑器扩展组中注册。
- `StructuredTextEditor` 已收敛为表单包装层，底层复用 `TipTapMarkdownEditor` / `MarkdownSourceEditor`，不再维护独立 mixed/schema 逻辑。

## Walkthrough

- 将 workspace view mode 收敛为 `rich | source`，旧持久化中的 `split/mixed` 迁移到 `rich`。
- 删除 Markdown Studio 工具栏里的混合模式入口。
- 将 inline code 切回 TipTap Code mark，并保留选中文本输入反引号的快捷输入。
- 将图片切换为官方 Image node。
- 将 workspace reference 从源码文本 + decoration widget 改为 inline atom node，保存时序列化回 Markdown link。
- 清理 TipTap 主编辑器里的 live-preview 样式和 mixed prop。
- 更新 Tiptap 调研文档和稳定规范，明确主路线不再是 Obsidian Live Preview。
- 将表单 Markdown 编辑器改为 `TipTapMarkdownEditor` 包装层，并新增 `/structured-text-editor.preview` 独立预览页验证表单场景。

## Decisions

- Markdown 字符串仍是持久化真相；TipTap JSON 不落盘。
- 富文本模式不再显示 token 源码弱显态；源码编辑统一切换到 `source`。
- 表格保留 `TableKit`，并继续使用 Markdown table round-trip。
- 表单场景只提供 `rich` / `source`，工具栏和紧凑尺寸属于包装层职责，Markdown 语法能力只来自 `TipTapMarkdownEditor`。

## Files Changed

- `shared/editor-workbench.ts`
- `app/stores/novel-ide.ts`
- `app/composables/useMarkdownStudioController.ts`
- `app/pages/index.vue`
- `app/components/markdown-studio/*`
- `app/components/markdown-studio/tiptap/*`
- `app/components/common/form/StructuredTextEditor.vue`
- `app/pages/structured-text-editor.preview.vue`
- `docs/research/tiptap/*`
- `reference/editor/rich-text-live-preview.md`

## Verification

- `bun run typecheck` 通过。
- 使用 `MarkdownManager` 验证 inline code、workspace reference、image、table 可解析为对应 ProseMirror mark/node，并可序列化回 Markdown。
- 残留搜索确认 Markdown Studio 与表单编辑器主链路不再引用旧 live-preview 扩展、独立 structured schema 或 `mixed` 模式。

## TODO / Follow-ups

- 后续补更完整的表格插入/编辑菜单。
- 后续考虑 CodeBlockLowlight，提升 fenced code block 体验。
