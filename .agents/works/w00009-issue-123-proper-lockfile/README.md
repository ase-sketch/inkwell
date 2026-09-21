---
schema: nbook.work/v1
workId: w00009-issue-123-proper-lockfile
issueId: i123
---

# Issue 123 proper-lockfile Windows exFAT 租约修复

修复 `proper-lockfile@4.1.2` 在 Windows exFAT 时间精度与心跳时序下误报运行租约失效的问题；保留锁竞争、stale 接管和失去所有权后的 fail-closed 关闭合同。实现与验证只在本 Work 的隔离 worktree 中进行，不包含 #225、Manager 缺包或远端 Issue/PR/发布动作。
