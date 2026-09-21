---
schema: nbook.walkthrough/v1
taskId: 00154-project-agent-skills
sequence: 006
role: tasker
status: complete
createdAt: 2026-08-24T11:00:30Z
---

# Tasker：将实际入口更正为 load_role

## 用户更正

此前记录与实现使用了 `load_rule`；开发者明确说明这是笔误，实际调用名应为 `load_role`。

## 修正

- Skill 文件实际路径改为 `.agents/skills/load_role/SKILL.md`。
- frontmatter 使用 `name: load_role`。
- Skill 索引、Task/Tasker 入口、治理 contract/test、当前 Proposal 和 fixture 均同步为 `load_role`。
- `load_role` 仍只加载 `.agents/roles/<role>/AGENTS.md`，不创建 `.agents/rules`，不保留旧名入口或假映射。
- 既有 `load_rule` walkthrough 保留为历史记录；本 walkthrough 记录用户更正后的当前合同。
