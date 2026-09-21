# 内容节点状态与信息差

## User Request

- 清理内容节点 refs：`visibility` 从 refs 删除，`lorebook://`、`thread://` 等旧体系标记后续清理。
- 内容节点系统需要承载人物、环境、主题、叙事角度、语言风格，并具备世界演化能力。
- 本阶段不做状态变更记录，只记录当前状态。
- 使用内容节点目录同级 `state.md` 存储当前状态。
- 角色间信息差放内容节点状态；读者信息差放叙事模块。
- Agent 自助更新 `state.md` 的 prompt 设计最后处理。

## Goal

- 让 `index.md` 专注稳定设定与关系。
- 让 `state.md` 承载当前世界状态和角色间信息差。
- 为后续 Agent 自助维护世界状态提供明确文件约定和基础校验。

## Current State

- 内容节点 refs 已移除 `visibility` 写入路径，保留 `relation`、`target`、`note`。
- `relation` 本阶段只通过 prompt / 文档推荐收敛，不做 schema 枚举；普通出现、提及、场景位置优先使用正文 inline ref。
- 内容节点目录可选同级 `state.md`。
- `state.md` 支持轻量 frontmatter 与正文状态说明。
- `knowledge[]` 已改为自然语言字符串数组，字符串内 Markdown 内容节点链接会参与断链校验。
- `bun scripts/workspace.ts node validate` 支持 `--recursive` 递归校验目标目录下的内容节点。
- 内容节点模板已迁移为 `{type}/index.md`，并为 `character`、`item`、`location` 提供 `{type}/state.md`。
- `bun scripts/workspace.ts node new --state` 可创建带状态文件的新节点，`bun scripts/workspace.ts node state TARGET` 可为已有节点补建状态文件。
- 内容节点通用 frontmatter 字段 `writingTip` 已停止生成和编辑；剧情系统的 `writingTip` 不受影响。
- Plot refs 已迁到内容节点路径：设定/角色/地点引用使用 `lorebook/.../`，不再写入数据库 Lorebook 外键，也不再支持 `pending://`。

## Walkthrough

- 根据实际代码确认内容节点 schema、workspace 扫描、CLI parse/validate、前端 profile 编辑入口和 Agent prompt 入口。
- 将 `refs` 从叙事可见性中解耦，只保留关系表达。
- 进一步收敛 Agent prompt：inline ref 用于自然提及，structured refs 只用于定义、约束、依赖、父子归属、伏笔/回收、直接因果等稳定系统关系。
- 增加 `state.md` 读取、parse JSON 输出和 validate 校验。
- 将信息差建模为 `knowledge: string[]`：自然语言负责表达复杂状态，Markdown 链接负责给系统可校验的内容节点关联。
- 给 CLI validate 增加 `--recursive` 参数，便于批量检查目录下所有内容节点。
- 删除 `state.md` 的 `scope` 标准字段，章节适用范围交给剧情系统处理。
- 将内容节点模板目录从单文件 `{type}.md` 调整为 `{type}/index.md` 与可选 `{type}/state.md`。
- 给 CLI 增加创建 state 模板的入口。
- 更新 reference/content spec、Agent leader prompt、PROJECT-STATUS 和本 walkthrough。
- 清理 Plot refs 的旧数据库 Lorebook 主存储残留，将 story thread / scene refs 中的设定目标改为 content-node path。

## Decisions

- v1 不做状态变更记录、历史回放或自动模拟。
- `state.md` 是可选文件；缺失不报错。
- `knowledge[]` 直接使用字符串；主题默认是本条目自身，不再写 `subject`。
- 知识的真假、来源、偷学、误解等细节写进自然语言，不再建 `status` 枚举。
- `inventory`、`goal` 等专属状态字段不作为标准 frontmatter 字段，优先写入正文；frontmatter 仍保持 loose，允许用户自由扩展。
- `scope` 不再作为 state 标准字段；剧情系统章节绑定内容节点后，再由剧情系统表达章节范围。
- 首批 state 模板只覆盖 `character`、`item`、`location`。
- `bun scripts/workspace.ts node validate` 默认非递归；显式传 `--recursive` 时递归校验目标目录。
- 剧情系统仍负责情节与冲突；读者信息差留给叙事模块。
- `writingTip` 不再是内容节点标准字段；写作建议如果是长期创作约束，应作为 note 内容节点或剧情系统字段表达。
- 未落地目标不再用 `pending://`；应先创建 `status: pending` 的内容节点，再在 Plot refs 中引用其路径。

## Files Changed

- `server/workspace-files/content-node-schema.ts`
- `server/workspace-files/workspace-files.ts`
- `server/workspace-files/workspace-files.test.ts`
- `scripts/workspace.ts`
- `app/stores/novel-ide.ts`
- `app/components/novel-ide/workspace/*`
- `server/agent/profiles/builtin/leader-default.profile.tsx`
- `reference/reference/system.md`
- `reference/content/state.md`
- `PROJECT-STATUS.md`
- `prisma/schema.prisma`
- `server/plot/*`
- `server/agent/tools/plot/*`
- `app/composables/useStructuredReferenceMenu.ts`

## Verification

- `bun run test server/workspace-files/workspace-files.test.ts`
- `bun run typecheck`

## TODO / Follow-ups

- 继续清理非 Plot 链路中的旧 `lorebook://` 引用入口。
- 后续如需要历史回放，再设计状态变更记录。
- 后续可为 `state.md` 增加专门编辑 UI 或 Agent 更新工具。
