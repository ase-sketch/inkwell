# Workspace 文件实时同步与保存冲突

## 背景

AI 或外部工具会直接修改小说 workspace 中的真实文件。此前前端文件树和已打开编辑器只依赖手动刷新，网页中存在未保存内容时也缺少保存时的版本检查，容易覆盖磁盘上的新内容。

目标是保持真实文件为唯一真相，同时让前端编辑器具备类似 Vim / Git 的冲突处理体验。

## 目标

- 真实文件变化后，前端自动刷新文件树和干净的已打开文件。
- 网页已有未保存内容时，磁盘同步只提示冲突，不覆盖网页内容。
- 保存时携带上次同步的 `mtimeMs`，真实文件已变化则返回 409。
- 冲突对话框展示 Git 风格差异，并允许使用真实文件、覆盖真实文件或保存人工合并结果。

## 实现

- `server/workspace-files/workspace-file-events.ts` 使用 `chokidar` 监听 workspace 文件变化，并通过 `/api/workspace-files/events` 以 SSE 推给前端。
- `app/composables/useWorkspaceFileEvents.ts` 复用现有 SSE 解析工具订阅文件事件。
- `app/stores/novel-ide.ts` 为 workspace buffer 增加 `lastSyncedMtimeMs`，并新增磁盘同步、冲突状态应用和保存版本检查参数。
- `server/api/workspace-files/write.put.ts` 在 `expectedMtimeMs` 与真实文件不一致时返回 `WorkspaceWriteConflictDto`。
- `server/workspace-files/workspace-file-conflict.ts` 优先调用 `git diff --no-index` 与 `git merge-file -p --diff3` 生成 diff 和三方合并文本，Git 不可用时退回到 `diff` 包和基础冲突标记。
- `app/components/novel-ide/workspace/WorkspaceFileConflictDialog.vue` 用 Monaco DiffEditor 展示网页编辑与真实文件，并提供可编辑的合并结果。

## 验证

- `bun run typecheck`
- `bun test server/api/workspace-files/write.put.test.ts server/workspace-files/workspace-file-events.test.ts server/workspace-files/workspace-file-conflict.test.ts`
- `git diff --check`

## 后续

- 接入后续版本控制能力后，可以把冲突对话框进一步扩展为基于真实 Git index / worktree 的版本视图。
- 当前只处理 workspace 文本文件保存冲突；二进制文件或非 editable 文件仍由文件树刷新表达。
