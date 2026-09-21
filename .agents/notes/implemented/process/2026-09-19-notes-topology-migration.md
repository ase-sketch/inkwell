# Agent Note: 决策笔记体系迁移到 lifecycle/class 拓扑

Status: implemented

## Problem

项目前期沿用的是扁平笔记目录（`.agents/notes/YYYY-MM-DD-slug.md`），分类与模板靠 `agent-notes` 技能承载。2026-09-19 全局约定调整：工作流与纪律类约束不再住 skill（skill 触发才加载、约束太弱），改为随工作区自动注入的 md 文档；笔记目录同时升级为 `{lifecycle}/{class}/` 拓扑，以支持归属笔记检索与决策演进。

## Decision

- `agent-notes` 技能退役；笔记规范全文内联为项目文件 [`.agents/notes/README.md`](../../README.md)，所有 agent 写笔记前读该文件，不依赖 skill。
- 目录拓扑改为 `.agents/notes/{lifecycle}/{class}/YYYY-MM-DD-slug.md`：lifecycle 四选一（proposed / implemented / rejected / archived），class 封闭六类（feature / bug-fix / simplification / architecture / process / testing）。
- 既有笔记迁移：kickoff 立项决策 → `implemented/architecture/`；M0 执行决策 → `implemented/process/`；M1a 实施计划 → `proposed/feature/`。
- `docs/workflow.md` 与根 `AGENTS.md` 同步指向新规范，`AGENTS.md` 删除对 `docs/workflow.md` 的循环依赖表述。
- 新增两条纪律：**一事一处**（行为写 docs、边界写 ARCHITECTURE.md、理由写笔记，跨层链接不抄写）与**归属笔记**（改既有子系统前先搜 `implemented/` 找到归属笔记，演进时更新而非新建）。

## Alternatives considered

- **保持扁平目录 + 维持 skill 承载**：skill 只在触发时加载，而记笔记是高频纪律动作，靠触发不可靠——否决。
- **仅改文档不改目录**：无法支撑「归属笔记」检索（`implemented/` 前缀检索是归属定位的前提）——否决。
- **引入集中 INDEX.md**：与「目录树即索引」冲突，且索引必然腐化——否决。

## Consequences

- 新增笔记必须落在 `{lifecycle}/{class}/` 下；写前先读 `README.md`，检索归属笔记用 `implemented/` 前缀。
- 生命周期流转（如 proposed → implemented）时须同步更新笔记内的 `Status` 行。
- 历史笔记只做路径迁移，正文不动；迁移后旧路径不再存在（本仓库无外部引用，未做兼容层）。
