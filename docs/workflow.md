# Inkwell — 执行记录工作流（workflow）

> 意图：非平凡决策必须沉淀，做到可回溯、不反复讨论已敲定事项；规则只保底线，避免繁琐流程。
> 规范全文见 [.agents/notes/README.md](../.agents/notes/README.md)。

## 怎么记（核心规则）

1. **写在哪**：`.agents/notes/{lifecycle}/{class}/YYYY-MM-DD-slug.md`
   - `lifecycle`：`proposed`（待评审）/ `implemented`（已落地）/ `rejected`（否决）/ `archived`（归档）
   - `class`（封闭六类）：`feature` / `bug-fix` / `simplification` / `architecture` / `process` / `testing`
2. **何时写**：改变行为、架构、跨文件契约、流程/工具、测试策略、配置/格式时必记；纯局部、机械、不改行为与契约的改动豁免。
3. **记什么（四段式骨架）**：
   - **Problem**：独立成立的动机。
   - **Decision**：现在时客观叙述实施细节。
   - **Alternatives considered**：强制必填每个真实被否方案及落败原因。
   - **Consequences**：收益、已知权衡与上下游影响。

## 底线与纪律

- **一事一处**：行为与功能写 docs/README，边界与数据流写 ARCHITECTURE.md，决策理由写笔记；互相引用，不重复抄录。
- **归属笔记**：修改既有功能前先看 `implemented/` 下对应的归属笔记；演进时直接更新归属笔记，不新建重复笔记。
- **同变更提交**：笔记与代码进同一提交；目录树即索引，不建全局索引文件。
- **里程碑收口门禁**：测试通过 + 架构边界审查无越界 + 决策笔记落盘。
- **最终验收**：用户手工试用始终是最终验收，AI 门禁只为减少问题。
