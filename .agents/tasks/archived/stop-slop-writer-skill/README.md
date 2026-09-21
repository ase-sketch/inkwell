# Stop Slop Writer Skill

## Relative documents refs

- [Writer Profile Input Contract](../08-writer-profile-input-contract/README.md)
- [Profile Import Node](../29-agent-profile-import-node/README.md)
- [Agent Prompt Engineering Simulation Director](../36-agent-prompt-engineering-simulation-director/README.md)

## User Request / Topic

- 将 `hardikpandya/stop-slop` 加入 NeuroBook 系统 skill。
- 参考相关 profile，让普通 `writer` profile 默认加载这个 skill。
- 默认通过 `Import` 标签加载，不依赖用户手动 `$stop-slop` 激活。

## Goal

让 `stop-slop` 成为系统可发现 skill，并让 `writer` profile 的首轮 HistorySet 默认导入该 skill，验证面包括：

- `SkillCatalog` 能发现 `stop-slop`。
- `Import` 允许读取系统 skill 文档。
- `writer` profile prompt 中包含 `stop-slop` 导入内容。
- builtin profile source 改动后刷新 `.compiled` 与 `.system-profile-metadata.json`。

## Current State

- 当前 skill catalog 读取 `assets/workspace/.nbook/agent/skills`，用户侧 `workspace/.nbook/agent/skills` 同名目录整体覆盖系统目录。
- `Import` DSL 已可导入 `AGENTS.md`、`reference/**`、`docs/**` 和系统 skill 文档。
- `writer.profile.tsx` 已在 `HistorySet` 中导入 Project Workspace、Markdown dialect、profile context memory 和 `stop-slop`。

## Decisions / Discussion

- 保留上游 `stop-slop` 的 `SKILL.md` 与 `references/` 结构，便于后续按原 skill 维护。
- 只允许 `Import` 加载 `assets/workspace/.nbook/agent/skills/**` 里的系统 skill，不开放整个 `assets/**`。
- `writer` 默认导入系统 skill 文档；用户若需要覆盖 skill catalog，仍可通过 `workspace/.nbook/agent/skills/stop-slop/` 覆盖 catalog 可见条目。
- 本次不把 `stop-slop` 内容内联进 writer system prompt，避免重复维护。
- 不同步写 `workspace/.nbook/agent/skills/stop-slop/`，因为当前没有同名用户目录覆盖，runtime catalog 会直接看到 system skill；user-assets 同步可在产品/运行时流程中处理用户侧复制。

## Verification / Test

- `bunx vitest run server/agent/profiles/profile-dsl.test.ts server/agent/skills/skill-catalog.test.ts server/agent/profiles/leader-assets-profile.test.ts`：通过，3 个测试文件、40 个测试通过。
- `bun scripts/build/profile.ts check builtin/writer.profile.tsx --system`：通过。
- `bun scripts/build/profile.ts compile --all --system`：通过，重建 12 个系统 profile artifact。
- `bun run profile:metadata`：通过，刷新系统 assets metadata，编译 0 个 stale profile。

## Implementation Walkthrough

- 2026-06-09：创建任务 walkthrough，准备新增系统 skill、扩展 `Import` allowlist，并将 `writer` 默认导入 `stop-slop`。
- 2026-06-09：新增 `assets/workspace/.nbook/agent/skills/stop-slop/SKILL.md` 和 `references/{phrases,structures,examples}.md`，保留上游 skill 的入口与参考文件结构，并在 frontmatter 中记录 source。
- 2026-06-09：扩展 `server/agent/profiles/profile-dsl.ts` 的 `Import` allowlist，允许导入 `assets/workspace/.nbook/agent/skills/**`，并更新错误文案和注释。
- 2026-06-09：在 `assets/workspace/.nbook/agent/profiles/builtin/writer.profile.tsx` 的 `HistorySet` 中新增 `<Import path="assets/workspace/.nbook/agent/skills/stop-slop/SKILL.md" />`。
- 2026-06-09：补充 `profile-dsl.test.ts`、`skill-catalog.test.ts`、`leader-assets-profile.test.ts`，分别覆盖系统 skill import、catalog discoverability 和 writer prompt 默认加载。
- 2026-06-09：第一轮窄测试中 `leader-assets-profile.test.ts` 的 catalog profile 因 `profile-dsl.ts` 依赖变化报告 stale，这是预期；执行 `compile --all --system` 后恢复。writer 测试原有 `not.toContain("retrieval")` 断言扫到了共享导入文档中的合法 `retrieval` 文案，已收窄到 `<writer_input_context>`，继续验证 lorebook frontmatter 清洗边界。
- 2026-06-09：更新 `PROJECT-STATUS.md` 的 Skills 状态，记录 `stop-slop`、系统 skill Import allowlist 与 writer 默认导入合同。

## TODO / Follow-ups

- 无。
