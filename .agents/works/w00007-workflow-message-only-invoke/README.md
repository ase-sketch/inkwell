---
schema: nbook.work/v1
workId: w00007-workflow-message-only-invoke
issueId: null
---

# Workflow message-only invoke 修复

修复 Workflow Agent 扩展把未提供的 invocation input 归一化为 JSON null，导致无 PayloadSchema profile 的 message-only 调用被 NeuroBook Harness 拒绝的问题；保持显式结构化 input 与显式 JSON null 继续受 PayloadSchema 校验。
