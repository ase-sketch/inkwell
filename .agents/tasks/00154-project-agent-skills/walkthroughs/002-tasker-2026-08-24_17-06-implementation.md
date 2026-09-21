---
schema: nbook.walkthrough/v1
taskId: 00154-project-agent-skills
sequence: 002
role: tasker
status: complete
createdAt: 2026-08-24T17:06:53Z
---

# Tasker implementation

## 改动

- 新增 `.agents/skills/report/SKILL.md`：model-invoked；支持 `$ARGUMENTS` 指定报告对象、文件、审查请求或待决定事项；固定状态、证据、开发者动作和下一步格式。
- 新增 `.agents/skills/load-rule/SKILL.md`：user-invoked；严格接受 `pm`、`leader`、`tasker`、`reviewer`；加载 `.agents/roles/<role>/AGENTS.md`，明确不存在 `.agents/rules` 且禁止 fallback。
- 删除 `.agents/skills/agent-workflow-router/SKILL.md`，更新 Skill 索引、Task 执行动作入口、Tasker 合同和 Agent 治理目录说明。
- 更新治理 contract/test：校验两个 Skill frontmatter、`$ARGUMENTS`、四个角色参数、旧 router 删除和 Task verification 入口。
- 更新 accepted Agent Skills Proposal 与 P-005 Proposal 当前真相源/决策记录。

## 验证

- focused governance test：`bun x vitest run --config scripts/vitest.config.ts --testTimeout=15000 scripts/ci/agent-governance.test.ts`；38/38 passed。
- scripts typecheck：`bun x tsc --noEmit -p scripts/tsconfig.json`；exit code 0。
- docs check：`bun run docs:check`；`failures: []`，5233 files。
- diff check：`git diff --check`；exit code 0，无输出。
- governance check：exit code 1；仅有两条既有 Task 135 hash 基线失败，原文保留；未新增 00154 失败。

## 未执行

未执行 push、PR、合并、发布、部署、数据库迁移、真实 Provider/Model、浏览器人工验收或数据删除。
