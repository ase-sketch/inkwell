---
schema: nbook.walkthrough/v1
taskId: 00154-project-agent-skills
sequence: 005
role: tasker
status: complete
createdAt: 2026-08-24T10:43:40Z
---

# Tasker：将用户指定的 load_rule 设为实际入口

## 问题

用户点名 `load_rule`，此前实现实际暴露的是 `.agents/skills/load-rule/SKILL.md`，存在调用名无法解析的契约风险。

## 修正

- 将 Skill 文件移动为 `.agents/skills/load_rule/SKILL.md`。
- frontmatter 改为 `name: load_rule`。
- Skill 索引、Task/Tasker 入口、治理 contract/test、当前 Task/Proposal 改为 `load_rule`。
- `load_rule` 仍只加载 `.agents/roles/<role>/AGENTS.md`；不创建 `.agents/rules`，不保留旧 `load-rule` 入口或假映射。
- 历史 walkthrough 中的 `load-rule` 保留为历史记录，不作为当前入口。

## 角色参数

`pm`、`leader`、`tasker`、`reviewer` 不变。
