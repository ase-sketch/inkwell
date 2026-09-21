# .agents/notes 规范（Inkwell）

> 本文件是 Inkwell 决策笔记的规范全文。所有 Agent 写笔记前读本文件，不依赖任何 skill。

## 何时写

非平凡变更 = 改变行为、架构、跨文件契约、流程/工具、测试策略、配置/格式，或维护者可能重新审视的决策。纯机械、局部、不改变行为与契约的编辑豁免。

## 目录拓扑

```text
.agents/notes/{lifecycle}/{class}/YYYY-MM-DD-slug.md
```

- lifecycle 四选一：`proposed`（待评审）/ `implemented`（已落地）/ `rejected`（被否决）/ `archived`（冻结历史）
- class 封闭六类，严禁扩充：`feature` / `bug-fix` / `simplification` / `architecture` / `process` / `testing`
- slug 用英文短横线；文件名日期用变更当天

## 模板骨架

```markdown
# Agent Note: <简要标题>

Status: <proposed | implemented | rejected | archived>

## Problem
<动机——写到脱离解决方案也能独立成立>

## Decision
<设计决定与实施细节；交付态用现在时客观叙述>

## Alternatives considered
<强制：每个真实备选方案一段，说明落败原因>

## Consequences
<直接收益、对上下游影响、后续约束与已知权衡>
```

## 核心纪律

1. 同变更提交：笔记与代码进同一提交，不脱节补录
2. 禁止全局 INDEX.md / TABLE_OF_CONTENTS.md：目录树即索引
3. Alternatives considered 强制必填，不编造
4. implemented 用现在时客观事实，不用未来时或计划式口吻
5. 标题与正文用简体中文（代码符号、配置项、API 名、路径、slug 除外）
6. 生命周期移动时必须更新 Status 行
7. 覆盖既有决策前先搜索旧记录：全取代保留旧文独有理由并修复引用，部分取代互相链接
