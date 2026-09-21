# Agent TSX Prompt Context

## 背景

Agent v2 的 profile prompt 已经迁移到 TSX 组件树，但旧文档仍停留在 `buildSystemPrompt` / `buildDynamicPrompt` / `buildWatchedVariables` 时代。`leader-default.profile.tsx` 中的 `planModeReminder` 与 `SkillCatalog` 也放在 `DynamicSet`，位置早于最新用户输入，不符合“靠近本轮输入”的上下文语义。

## 目标

- 固定直接 prompt 模式下 `HistorySet -> DynamicSet -> AppendingSet` 的模型消息顺序。
- 在 leader UI continue 主路径下，把 history 尾部当前用户输入移动到模型消息最后。
- 将需要贴近当前输入的 reminder 放入 `AppendingSet`，位于当前用户输入之前；将需要首轮持久化的 skill catalog 放入 `HistorySet`。
- 修复 `Watch` 首次观察到有效值时不触发 render 的问题。
- 为 TSX prompt 节点的合法位置、拼接顺序和持久化行为补测试。
- 更新 `reference/agent/context.md` 与 `reference/agent/profile-guide.md`，以当前 TSX prompt 合同为准。

## 关键决策

- 新增 `Reminder` TSX 节点，用于控制运行时提示何时追加；支持 `watchPath` 变化触发和 `repeatEveryTurns` 周期性补注入。
- `AppendingSet` 是贴近当前输入的上下文区域；continue 主路径下当前用户输入仍是最后一条；`AppendingSet` 产物会写入当前历史光标。
- `SkillCatalog` 返回 string，进入首轮历史上下文时由 `<Message role="system">` 包裹，使用 `<system-reminder>` 包裹 `- <name>: <description> - <whenToUse>` 列表，并随 `HistorySet` 写入历史。
- prompt runtime 支持三类节点：返回 `Message` 的节点、处理逻辑节点（如 `If` / `Reminder` / `Watch`）、直接返回 string 的节点（如 `SkillCatalog` / `ActivatedSkills`）。
- `origin` 已从 AgentMessage/DTO 中移除；system prompt 去重看历史首条 `SystemMessage`，continue 当前输入识别与 turn 统计看 `HumanMessage`。
- `Watch` 首次观察到非 `undefined` 的值时触发 render；首次值为 `undefined` 时只记录 baseline。
- `DynamicSet` 不放异地 TSX 节点；workspace、Plan Mode、任务状态等需要贴近输入的内容改用 `Reminder`，且 `Reminder` 内部组合普通 `<Message>`。

## 变更文件

- `server/agent/profiles/simple-profile.ts`
- `server/agent/profiles/context-prompt.tsx`
- `server/agent/prompts/types.ts`
- `server/agent/prompts/index.ts`
- `server/agent/index.ts`
- `server/agent/profiles/builtin/leader-default.profile.tsx`
- `server/agent/profiles/builtin/writer.profile.tsx`
- `server/agent/profiles/builtin/retrieval.profile.tsx`
- `server/agent/types.ts`
- `server/agent/profiles/simple-profile.test.ts`
- `server/agent/profiles/builtin/skill-catalog.prompt.test.ts`
- `reference/agent/context.md`
- `reference/agent/profile-guide.md`

## 验证

- `bun run test server/agent/profiles/simple-profile.test.ts server/agent/profiles/builtin/skill-catalog.prompt.test.ts`
- `bun run typecheck`
- `bun run test server/agent/messages/codec.test.ts server/agent/profiles/simple-profile.test.ts server/agent/profiles/builtin/skill-catalog.prompt.test.ts server/agent/services/thread-message.service.test.ts server/agent/services/thread-mutation.service.test.ts server/agent/services/thread-run-coordinator.service.test.ts server/agent/http.test.ts`
