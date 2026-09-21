---
schema: nbook.walkthrough/v1
taskId: t01-proper-lockfile-exfat
sequence: 2
role: reviewer
status: completed
createdAt: 2026-09-07T14:45:00Z
---

# proper-lockfile 补丁独立代码审查

## 结论

**未完成验证。** 当前补丁的核心算法、错误分类和回归场景未发现已证实的 P0/P1 运行时缺陷；但交付合同仍有明确整改项，且 Task 要求的 Product/Portable 与真实 exFAT 验收没有完成。因此不能建议合并，也不能把 `agent/session-store-lease.md` 从 `planned` 晋升为 `implemented`。

## Required

1. **planned Spec 泄漏实现细节。** `docs/specs/agent/session-store-lease.md:65-69` 直接规定 `proper-lockfile@4.1.2`、root hoisted dependency、Product vendor 和 Manager inline。`docs/specs/README.md:35` 要求 `planned` Spec 以黑盒合同为主，不能指定具体依赖、算法、目录或框架。应把这些实现/载荷细节移到 Task 或 ADR；Spec 只保留可观察的 Windows 兼容、版本兼容和 Product/Manager 载荷结果。
2. **bun.lock 存在未闭合的非补丁漂移。** 生成差异除 patch 映射外还包含 workspace 版本 `0.9.5... -> 0.10.0...`、Manager `.55 -> .58`、`@types/bun@1.4.1`、`@types/node@26.2.0` 和 Windows 路径解析条目（`bun.lock` diff hunks around 230, 367, 415, 3671-4529）。当前 `package.json` 没有对应的版本变更；虽然该锁文件由 Bun 生成且当前 frozen install 成功，但证据没有证明这些漂移属于本 Task 的必要范围。应从与 manifest 对齐的干净基线重新生成并仅保留本 Task 需要的差异，或在交付说明中明确取得该既有 manifest/lock 同步的范围接受。
3. **Task 对 ENOTSUP 的描述过宽。** `.agents/works/w00009-issue-123-proper-lockfile/tasks/t01-proper-lockfile-exfat/README.md:15` 写成 lockfile 对 `ENOTSUP` 直接终止；实际实现只对 `err.precisionUnsupported` 跳过 retries，普通 I/O `ENOTSUP` 仍重试（patch `lockfile.js` hunk lines 5-15；测试 lines 244-262）。应把 Task 目标改成“精度探测耗尽产生的带 `precisionUnsupported` 标记的 ENOTSUP 不重试”，避免合同误导。
4. **健康 heartbeat 测试可空通过。** `scripts/build/proper-lockfile-patch.test.ts:20-39,41-60,62-81,178-201` 只断言没有 `ECOMPROMISED`；`heartbeatRounds:299-304` 没有记录任何 lock-dir `utimes`/mtime 更新次数。若 heartbeat 没有运行，测试仍可能通过。应增加至少三次有效更新的可观察断言，覆盖 async 和 sync 健康场景。

## Optional / Nit

- `scripts/build/proper-lockfile-patch.test.ts:225-243` 的精度耗尽场景使用 `preserveUtimes: false`，依赖宿主真实 mtime 与伪造时间不相等；用确定性 `stat` 返回值触发不匹配会更稳定。
- `scripts/build/proper-lockfile-patch.test.ts:244-262` 的普通 I/O `ENOTSUP` 场景依赖异步 `rmdir` 与零延迟 retries 的调度顺序；可观察清理完成后再断言重试次数，减少平台时序脆弱性。
- `scripts/build/proper-lockfile-patch.test.ts:264-291` 可在外部 `utimes` 前后用未包装的 `node:fs.stat` 断言 lock directory mtime 确实改变；当前错误回调断言有效，但外部变化观察仍是间接的。

## 五轴审查

- **Correctness：** 补丁限制候选精度为 `1/1000/2000`，使用两次 `utimes -> stat` 往返，并在候选耗尽时返回 `precisionUnsupported`；`lockfile.js` 只对该标记跳过 retries。静态代码与已运行的 11 项聚焦测试一致，未发现确定性算法缺陷。
- **Readability：** 补丁新增 `probePrecision` 和显式 `PRECISIONS`，控制流直线，名称可读；测试场景名称覆盖合同边界。上列测试可观测性缺口需要补强。
- **Architecture：** 依赖补丁登记在根 `package.json`，未修改 Session Store 或 Project Lock 公共 API；但 planned Spec 的实现细节和锁文件非补丁漂移违反边界，见 Required。
- **Security：** 未发现新增秘密、外部输入注入或权限扩大；`ELOCKED`、`ECOMPROMISED`、stale 接管和 advisory lock 的 dual-owner 限制仍被保留并记录。该锁仍不是 fencing 强互斥，不能扩大安全承诺。
- **Performance：** 精度探测最多尝试三个有界候选，仅发生在获取锁时；未引入 heartbeat 热路径上的无界循环或全局缓存。每把锁不共享未经验证的精度，代价符合本 Task 的正确性取舍。

## 当前验证

已实际运行并通过：

- `bun install --frozen-lockfile --ignore-scripts --linker hoisted`：通过，Bun `1.3.14`。
- `bun x vitest run --config scripts/vitest.config.ts scripts/build/proper-lockfile-patch.test.ts`：1 file passed，11 tests passed。
- Session Store 租约三文件：3 files passed，14 tests passed。
- Project Lock：1 file passed，9 tests passed。
- `bun x tsc --noEmit -p scripts/tsconfig.json`：通过，无输出。
- `bun run docs:check`：通过，`failures: []`，`checkedFiles: 5400`（写入本审查记录后需重新运行）。
- `git diff --check`：通过；仅有 `package.json` CRLF 转换提示。

未通过或未完成：

- `bun run governance:check`：失败，报告既有无关缺口 `.agents/works/w00003-neurobook-ui-foundation-migration/tasks/t14-agent-profile-nav-lab-migration/README.md` 缺失；不是本 Work 新增的失败。
- Product stage：被 GitHub [#226](https://github.com/notnotype/neuro-book/issues/226) 的 `ProductRuntimeImageBuilder is not defined` 阻塞。
- Product/Portable 载荷、实际 Product 运行 smoke、真实 NTFS 120 秒观察和真实 exFAT 观察：未完成；当前主机无 exFAT 卷。

## 证据边界

上述结论针对 Worktree `fix/w00009-issue-123-proper-lockfile`、HEAD `64efeb9` 加当前未提交差异；不改变 Work `issueId: i123`，不执行代码修改、远端写入、push、PR、合并、发布或部署。
