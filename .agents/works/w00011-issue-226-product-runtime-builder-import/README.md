---
schema: nbook.work/v1
workId: w00011-issue-226-product-runtime-builder-import
issueId: i226
---

# Issue 226 Product Runtime stage Builder 导入修复

修复 `product:stage` 在 `openVerifiedImage()` 中调用 `ProductRuntimeImageBuilder` 却缺少模块导入的问题；保留现有 Runtime Image 完整验证、acceptance lease、owner、pointer、containment 与清理边界，并完成 stage/start 的受控验证。不包含 proper-lockfile 算法、Issue #123/#225、远端写入、发布或部署。
