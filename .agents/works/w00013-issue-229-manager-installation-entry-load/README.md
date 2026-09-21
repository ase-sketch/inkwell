---
schema: nbook.work/v1
workId: w00013-issue-229-manager-installation-entry-load
issueId: i229
---

# Issue 229 Manager installation entry 加载修复

修复 clean Manager build 生成的 `@notnotype/neuro-book-manager/installation` 入口在导入时因 minified bundle 失败的问题，使 Windows Portable provenance 验证和正式安装流程能够消费 Manager installation API。

## 交付边界

- 调查 `packages/neuro-book-manager/src/installation-entry.ts`、共享导出依赖、`scripts/build.mjs` 的 Bun.build/minify 产物与其它 Manager entry。
- 修复公开 `installation` entry 的真实加载失败，不绕过 minification、发布 identity、archive provenance 或 containment 校验。
- 恢复并运行 `scripts/release/windows-portable-manager.test.ts`，补充能够防止同类 clean-build 导入回归的行为验证。
- 在等价 clean archive/pack 验证中确认正式 Windows Portable 归档是否受影响。

## 非目标

- 不修改 Issue #228 的 Product Runtime stdout/stderr 隔离实现。
- 不修改 World Engine 业务逻辑、`proper-lockfile` 算法或真实 Provider/Model。
- 不执行远端 Issue/Project/PR 写入、push、合并、发布、部署或数据删除。
