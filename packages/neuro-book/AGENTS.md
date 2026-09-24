# packages/neuro-book 规则

## 包定位
Inkwell 主应用（基于 Nuxt 4 + Vue 3 的小说创作辅助工作台）。

## 包内文档位置
主应用专属文档均位于包内 [`docs/`](docs/)：
- `docs/adr/`：架构决策记录
- `docs/runbooks/`：操作与运行手册
- `docs/migrations/`：数据迁移说明
- `docs/specs/`：包级能力与术语规范
- `docs/proposals/`：产品与功能提案
- `docs/research/` 与 `docs/archived/`：研究与归档资料

## 交付与运行时配置归属
- **容器与环境配置**：主应用交付配置归本包管理，包括 `Dockerfile*`、`docker-compose*.yml`、`.env.docker.example`、`.env.example`、`.env.product`、`.env.typecheck`、`config.example.yaml` 与包级 `.gitignore`。
- **运行时隔离**：`.env` 与 `config.yaml` 为本机运行配置，严禁提交到仓库；运行时 Workspace 位于 State Root 下的 `workspace/`，根目录的 `assets/` 与 `workspace/` 仅为历史/隔离区，不得作为源码或启动 fallback 依赖。

## 前端规范底线
- **通用组件复用**：通用交互组件优先复用 `app/components/common/`（如 `NotificationViewport`、`Dialog`、`DialogWindow`、`Tooltip`、`form/FormColorField` 等）。
- **主题色彩约束**：普通界面颜色只消费 `app/utils/theme/README.md` 登记的主题变量，严禁新增未登记的 Tailwind 调色板或局部 `dark:` 变体。
- **状态色口径**：语义状态色统一为 `warning`（草稿/待审/未保存）、`success`（完成/已同步）、`danger`（错误/删除/冲突）、`info`（运行中/引用/说明）和 `accent`（选中/当前/主操作）。内容与编辑器分类色除外。
- **错误与反馈**：前端 API 错误统一使用 `resolveApiErrorMessage(error, fallback)` 解析；跨入口、后台动作和关闭对话框的反馈统一使用 `useNotification()`；当前表单内可就地恢复的错误使用局部状态。
- **可调整面板**：面板尺寸伸缩统一使用 `app/composables/useResizablePanel.ts`，尺寸状态由宿主持久化，组件通过事件回传。
- **用户可见文案**：所有界面文案面向普通小说作者，说人话，严禁出现内部类名、文件名、Task、Phase 等工程术语与编号。
