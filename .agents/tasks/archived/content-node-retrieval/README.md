# Content Node Retrieval Walkthrough

## 背景

用户希望把内容节点上下文拆成两类：

- `inject`：写作风格、叙事视角、系统提示等稳定上下文，按 profile 直接注入。
- `retrieval`：需要 AI 根据任务、章节大纲、最近正文和场景判断的内容节点召回。

同时，writer 等 profile 后续不一定只作为 subagent 使用，也可能用于行内写作协助和自动填表。为了节省 token，这些 profile 不应承担完整 workspace 管理和多轮搜索职责。

## 目标

- 内容节点 frontmatter 改为 `retrieval.enabled/trigger` 与 `inject.profiles/always`。
- 新增 `subagent.retrieval` profile，允许使用 shell 搜索和 read_file。
- retrieval 使用通用完成工具 `report_result` 返回结构化路径数组。
- writer 不读取全局 `RetrievedContentNodes` 组件，而是通过 `lorebookEntries` 参数接收内容节点路径。
- 前端内容节点表单不再编辑旧 `retrieval.keywords/tip`。

## 实现记录

- `server/workspace-files/content-node-schema.ts` 定义 `WorkspaceRetrievalSchema` 与 `WorkspaceInjectSchema`。
- `assets/server/workspace/content-node-templates/*/index.md` 写入新的 `retrieval` 与 `inject` 默认字段。
- `server/agent/profiles/builtin/retrieval.profile.tsx` 新增内容节点召回 profile。
- `report_result` 根据 profile 校验结构化输出；`subagent.retrieval` 的 `data` 为内容节点路径 `string[]`。
- `server/agent/agent-system.ts` 注册 retrieval profile 和 report tool。
- `server/agent/tools/builtin/create-subagent.tool.ts` 与 `invoke-subagent.tool.ts` 支持 `subagent.retrieval`。
- `server/agent/profiles/builtin/writer.profile.tsx` 按 `priority` 读取 `lorebookEntries` 指向的 `index.md` 与同级可选 `state.md`，并注入 prompt。
- workspace 内容节点表单改为编辑 `retrieval.enabled/trigger` 与 `inject.profiles/always`。
- `scripts/manual-retrieval-e2e.ts` 提供真实 Agent E2E 手动验证脚本，会创建临时 workspace fixture 或使用 `--workspace` 指定已有 workspace，调用 `subagent.retrieval` 并输出可复制给 writer 的 `lorebookEntries` JSON。
- retrieval 输出已进一步收窄为路径数组 `string[]`；不再由 retriever 输出 reason/notes/summary/type/status/writingTip/state。

## 当前边界

- `inject` 的自动运行时注入策略只完成 schema、模板和 UI；具体 profile prompt 自动注入链路仍待后续实现。
- retrieval profile 的端到端模型效果可通过 `bun scripts/manual-retrieval-e2e.ts` 手动 smoke；该脚本依赖真实模型配置和数据库连接。
- 旧文档 `docs/modules/character/requirements.md` 中仍保留历史 `retrieval.keywords/tip` 记录，属于需求归档，不作为当前实现契约。

## 验证

- 更新 tool schema 测试注册数量。
- 增加内容节点 schema/template 断言，确认 `retrieval` 与 `inject` 字段进入 JSON schema 和模板。
- 新增手动验证命令：`bun scripts/manual-retrieval-e2e.ts`，可追加 `--workspace workspace/silver-dragon-hime` 使用真实小说 workspace，或追加 `--leader-only` 创建并保留一个协助测试的 leader thread。
- 已运行 `bun run typecheck`。
- 已运行 `bun run test server/agent/tools/tool-schema.test.ts server/workspace-files/workspace-files.test.ts`。
