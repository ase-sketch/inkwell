---
lifecycle: implemented
class: process
date: 2026-09-24
---

# 文档体系重组：清除上游治理遗产，全仓切换到新文档哲学

## Problem
fork 后仓库同时背着两套文档体系：上游 neuro-book 的 OMP 治理（.agents/works|tasks|roles|issues|skills、docs/upstream、治理 CI 脚本）与 Inkwell 自己的轻量体系（docs 五件套 + .agents/notes）。上游体系已随「一次性取材、不跟进上游」拍板而失效，但尸体仍在仓库里：新人/新会话 agent 会被误导去遵守已死的流程，死链遍布，HANDOFF 膨胀到 17.9KB 无人读得完。

## Decision
按更新后的全局文档哲学（只写意图/底线/验收，不写战术 how；说人话、结论先行、先讲怎么用）重组全仓文档：物理删除 docs/upstream/ 与根 .agents/ 下 works/tasks/roles/issues/skills 五目录；删除失效的迁移/上下文脚本并精简治理 CI 到仅剩 monorepo 边界门禁；重写根 AGENTS.md、HANDOFF.md 与 9 份包级 AGENTS.md；修订 docs 五件套并同步里程碑状态；全仓死链清零（失效引用转纯文本标注「已于 fork 后清理」）。保留 .agents/notes/ 决策史与各包 .agents/tasks/ 包级任务档案（其中的链接仍为活链接）。

## Alternatives considered
- 保留 docs/upstream 作只读参考：被否。内容滞后于改造，存在即误导；仍活跃的底线（Prisma/server 规范）已内化进包级 AGENTS.md，一事一处。
- 死链整段删除而非转纯文本：被否。ADR 的「关联任务」行是历史决策的组成部分，抹掉任务编号会损失考古线索；转纯文本 + 一句标注既保历史又不断链。
- 保留治理脚本空桩防 break：被否。对象已死，桩只会制造假相；经核查 agent-context.ts 无隐藏消费方，直接删除。

## Consequences
仓库减少约 8.1 万行死文档（commit bf00369，498 文件）；文档入口收敛为根三件套（AGENTS.md / ARCHITECTURE.md / .agents/notes/）+ docs 五件套 + HANDOFF.md。代价：上游任务记录的原文不再可查（GitHub 上游仓库与本地备份 E:\projects\inkwell-backup-2026-09-22\ 仍可考古）。

## Confirmation
治理门禁 bun scripts/ci/agent-governance.ts EXIT=0 且 failures 为空；scripts/ci vitest 22/22 通过；typecheck EXIT=0；全仓 grep 确认 docs/upstream 与根 .agents 五目录的链接残留为零（包级活链接与 notes 历史叙述除外）。持续验证方式：governance:check 留在 package.json，后续 PR 自然经过。
