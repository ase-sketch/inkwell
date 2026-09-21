---
schema: nbook.walkthrough/v1
taskId: t01-proper-lockfile-exfat
sequence: 3
role: reviewer
status: completed
createdAt: 2026-09-07T14:50:00Z
---

# 最终审查结论

## 结论

**未完成验证。** 当前实现的核心 mtime 探测算法、精度候选、错误分类和锁竞争边界与 Task 目标一致；但正式交付门禁未闭合，不能建议合并或宣称 Issue #123 已修复。

## 已验证

- 最终安装使用 `bun install --frozen-lockfile --ignore-scripts --linker hoisted`，Bun `1.3.14`，通过。
- 安装产物包含当前补丁的 `mtime-precision.js` 与 `lockfile.js` 修改。
- proper-lockfile 聚焦回归：1 file passed，11 tests passed。
- Session Store 租约回归：3 files passed，14 tests passed。
- Project Lock 回归：1 file passed，9 tests passed。
- 脚本 TypeScript 检查：`bun x tsc --noEmit -p scripts/tsconfig.json` 通过。
- `bun run docs:check`：`failures: []`，`checkedFiles: 5401`。
- `git diff --check` 通过；仅报告 `package.json` 的 CRLF 转换提示。
- `bun run governance:check` 未通过，但失败项是既有无关 Task 缺失：`.agents/works/w00003-neurobook-ui-foundation-migration/tasks/t14-agent-profile-nav-lab-migration/README.md`。

## Required

1. `docs/specs/agent/session-store-lease.md:65-69` 的 `planned` Spec 写入了 `proper-lockfile@4.1.2`、root hoisted dependency、Product vendor、Manager inline 等实现/载荷细节，违反 `docs/specs/README.md:35` 的 planned 黑盒合同。应移到 Task 或 ADR，只在 Spec 保留可观察兼容边界。
2. `bun.lock` 除 patch 登记外包含 workspace 版本和 `@types` 解析漂移；当前 `package.json` 没有对应版本变更。应从与 manifest 对齐的干净基线重新生成并只保留 Task 必要差异，或由开发者明确接受该既有 manifest/lock 同步范围；禁止手工编辑 lockfile。
3. Task README 第 15 行把 `ENOTSUP` 描述成统一直接终止；实际行为只对带 `precisionUnsupported` 标记的精度探测耗尽错误跳过 retries，普通 I/O `ENOTSUP` 仍重试。应修正 Task 合同文字。
4. 健康 heartbeat 测试（`scripts/build/proper-lockfile-patch.test.ts:20-39,41-81,178-201,299-304`）没有断言实际完成至少三次 lock-dir mtime/utimes 更新；只断言未收到 `ECOMPROMISED`，存在可空通过风险。

## Optional / Nit

- 精度耗尽场景依赖宿主真实 mtime，建议改为确定性 `stat` 返回值。
- 普通 I/O `ENOTSUP` 的零延迟 retries 计数依赖异步清理调度，建议使清理完成后再断言。
- `ECOMPROMISED` 场景可在外部 utimes 前后用未包装 `node:fs.stat` 断言真实 mtime 变化。

## 未完成验证与阻塞

- `product:stage` 被既有 `ReferenceError: ProductRuntimeImageBuilder is not defined` 阻塞，已记录 GitHub [#226](https://github.com/notnotype/neuro-book/issues/226)。
- Product/Portable 载荷重建与 `product:start` smoke 未完成。
- 真实 Windows NTFS 120 秒 Product/Portable 观察未完成。
- 当前主机无 exFAT 卷，真实 exFAT 验收未完成。
- Spec 保持 `status: planned`。

详见 `evidences/review-2026-09-07.json`。
