# Revision 阅读器规格

> 状态：Superseded（2026-08-16）。  
> 替代旅程：[`assessment-workspace.md`](assessment-workspace.md)。  
> 替代组件草案：[`document-editor-surface.md`](document-editor-surface.md)。

首轮规范把 immutable Revision Reader 与后续 Draft Editor 设计成两个表面。第二轮前端旅程决定让每个 revision 都经历 `blind-review → inspect-edit`，并让只读 revision 与可写 DraftSession 复用同一个 `DocumentEditorSurface`。

以下合同已迁入替代文档：

- revision body 不可变，draft body 属于 DraftSession。
- overlay 必须与 revision 或 DraftSession identity、generation 和 fingerprint 一致。
- 坐标使用 JavaScript UTF-16 半开区间。
- hidden revision 不包含机器 overlay。
- 多 detector 每次只显示一个明确 run，禁止默认消费数组第一项。
- Rules、Agent 与正文通过稳定 id 和 command bus 联动。

本文件只保留为第一轮架构记录，不再约束新组件实现。历史 revision 浏览和跨版本内联 diff 尚未设计，不能从本文件恢复为首轮功能。