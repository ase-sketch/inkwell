---
schema: nbook.work/v1
workId: w00015-editor-workbench-spec-and-docs
issueId: null
---

# 编辑工作台规范迁移与组件文档补齐

承接 w00014（Issue #227 Inline AI 发送修复）留下的两类文档/规范缺口：① `docs/specs/README.md`「规范缺口」把「Markdown Studio 与编辑工作台」登记为 P1 待迁移域，但该域没有内部 `implemented` 规范，Inline AI Prompt Bar 的行为合同目前只存在于用户文档；② `docs/standards/code/components.md` 要求 `app/**` 每个 Vue 组件有同名 Markdown 与能力标签，而本次修复触及的 `AgentChatSurface.vue` 没有。两者的共同性质是"当前代码已成立、但缺少可判断当前行为的内部规范/文档"。

## 交付边界

- 按 `docs/specs/README.md` 的「Reference 迁移合同」把编辑工作台域转成内部 `implemented` behavior Spec（落在 `docs/specs/`），其中必须包含 Inline AI Prompt Bar 的可观察行为与失败语义；同步「已实现规范」注册表与该域在「规范缺口」中的状态；`bun run docs:check` 通过。
- 按 `docs/standards/code/components.md` 的宿主/流式宿主配方，为 `AgentChatSurface.vue` 补齐同名文档（布局/交互/数据/状态/不支持/隐藏通道理由）与能力标签 frontmatter。
- 关闭 w00014/t01 的缺口 8（该缺口当前阻塞 Task 关闭）与缺口 9。

## 非目标

- 不改变产品行为；若规范核对发现实现与规范不一致，按 `docs/specs/README.md` 的 Bug 流记录并单独立项，不顺手改代码。
- 不在本 Work 内收敛 `AgentChatSurface` 自带的孤儿 inline 实现（w00014/t01 缺口 5，属行为重构）。
- 不处理 `app/**` 其余组件缺失同名文档的整体缺口（本 Work 只覆盖本次触及的组件；整体缺口另案评估）。
- 不调用真实 Provider/Model；不执行远端 Issue/Project/PR 写入、push、合并或发布（登记提交本身由开发者单独授权）。

本 Work 为纯规划/文档工作，按 `.agents/works/README.md`「纯规划或跨任务协调 Work 可继续在主工作区维护」，不创建实现 worktree。
