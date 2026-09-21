# Inkwell — 执行记录工作流（workflow）

> 这份文档解决什么问题：决策与执行日志怎么写、写在哪、什么时候写。
> 当前状态：**已确认**（2026-09-20，对齐全局约定）。

## 约定

- **什么值得记**：改变行为、架构、跨文件契约、流程/工具、测试策略、配置/格式的变更；纯机械、局部、不改行为的编辑豁免。
- **记在哪**：`.agents/notes/{lifecycle}/{class}/YYYY-MM-DD-slug.md`。规范全文见 [.agents/notes/README.md](../.agents/notes/README.md)（**刻意内联为 md，不依赖 skill**：skill 触发才加载，约束太弱）。
- **分类**：
  - lifecycle（四选一）：`proposed`（待评审）/ `implemented`（已落地）/ `rejected`（否决）/ `archived`（归档）
  - class（封闭六类，严禁扩充）：`feature` / `bug-fix` / `simplification` / `architecture` / `process` / `testing`
- **格式**：四段式——Problem（动机）/ Decision（决定）/ Alternatives considered（被否方案，必填）/ Consequences（影响与权衡）。
- **核心纪律**：
  - **一事一处**：行为功能写 docs、边界数据流写 ARCHITECTURE.md、决策理由写笔记；跨层用链接引用，不重复抄写。
  - **归属笔记**：改既有子系统前先搜 `implemented/` 找到归属笔记，读完约束与被否方案；决策演进时更新归属笔记而非新建重复笔记。
  - **同变更提交**：笔记与代码同一次提交，禁止集中索引文件。
- **里程碑收口三件套**：① 测试全绿或验收命令通过；② 对照 ARCHITECTURE.md 审查模块边界未被突破；③ 决策笔记已记（状态回写 `implemented`）。不齐不进下一个里程碑。
- **最终验收**：用户手工试用始终是最终验收，AI 门禁只为减少问题。
