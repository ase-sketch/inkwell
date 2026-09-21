# Agent Role Skills

这里保存开发 Agent 的仓库内 Skill 适配层，不是产品运行时资产。

角色规则以 `.agents/roles/<role>/AGENTS.md` 为准，current Work/Task 以 `.agents/works/AGENTS.md` 为准，legacy provenance 以 `.agents/tasks/AGENTS.md` 为准。Skill 按当前任务指向所需合同，不复制正文。

- [report](report/SKILL.md)：长任务交接、阻塞或当前交付证据。
- [load_role](load_role/SKILL.md)：按 pm、leader、tasker 或 reviewer 加载角色。
- [doc-review](doc-review/SKILL.md)：目标读者视角的可理解性、歧义与链接审查，按需独立复核。
- [diagnosing-bugs](diagnosing-bugs/SKILL.md)：复杂故障或性能回退诊断。
- [writing-for-agents](writing-for-agents/SKILL.md)：规则与 Skill 写作；Skill 调用说明见 [SKILL-MECHANICS.md](writing-for-agents/SKILL-MECHANICS.md)。

通用 Skill 在宿主允许范围内服务当前请求，服从根规则、当前合同和授权，不另立审批或完成门禁。项目不依赖特定 Code Agent 宿主。

产品 Skill 的 canonical 路径为 `packages/neuro-book/assets/workspace/.nbook/agent/skills/`，不要把开发角色混入产品资产。
