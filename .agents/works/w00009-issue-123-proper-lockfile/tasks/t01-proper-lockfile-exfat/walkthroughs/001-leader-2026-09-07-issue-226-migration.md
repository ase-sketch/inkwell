---
schema: nbook.walkthrough/v1
taskId: t01-proper-lockfile-exfat
sequence: 1
role: leader
status: completed
createdAt: 2026-09-07T13:54:25Z
---

# Product stage blocker Issue 迁移

## 结论
已将 Product acceptance stage 的既有入口缺陷记录为 GitHub Issue [#226](https://github.com/notnotype/neuro-book/issues/226)。该 Issue 独立追踪 `ProductRuntimeImageBuilder` 缺失导入，不改变 Issue #123 或 Work `w00009` 的身份。

## 迁移证据

- Draft-Key：`product-runtime-stage-builder-import`。
- 创建前精确搜索：`repo:notnotype/neuro-book "Draft-Key: product-runtime-stage-builder-import"`，API 返回 `total_count: 0`。
- 创建结果：Issue `#226`，URL `https://github.com/notnotype/neuro-book/issues/226`，状态 `OPEN`。
- 回读确认正文包含 Draft-Key，实际标签为：`type: bug`、`status: needs-triage`、`area: install-release`、`platform: windows`、`source: agent`。
- 授权来源：开发者本轮明确要求“issue 也记录到 github”；仅执行精确去重、Issue 创建和回读。
- 未执行：Project 写入、PR、评论、push、合并、发布、部署。
- 本地草稿已在远端回读成功后删除；未保留第二份 Issue 正文。

## 关联边界

- 证据归属：Work `w00009-issue-123-proper-lockfile` / Task `t01-proper-lockfile-exfat`。
- Work 的既有 front matter `issueId: i123` 保持不变。
- #226 仅记录 `scripts/deploy/product-runtime.mjs:159` 的 `ReferenceError: ProductRuntimeImageBuilder is not defined` 阻塞；不纳入 proper-lockfile 补丁算法、不替代 #123，也不自动创建下一 Task。

## 证据文件

- `evidences/issue-226-migration.json`
