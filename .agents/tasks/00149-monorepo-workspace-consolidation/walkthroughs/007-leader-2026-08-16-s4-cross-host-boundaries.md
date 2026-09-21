---
schema: nbook.walkthrough/v1
taskId: 00149-monorepo-workspace-consolidation
sequence: 007
role: leader
status: complete
createdAt: 2026-08-16T20:05:00Z
---

# Leader：S4 跨宿主合同边界

## 实施

- `@notnotype/neuro-book-contracts` 新增 Desktop 聚合 depot 合同与 Windows 卸载回执合同；`desktop.ts` 和包根索引均导出，package exports 增加 `./desktop-aggregate-depot` 与 `./desktop-uninstall`。
- 聚合 depot 的 schema、固定文件名、五项顶层载荷、manifest 类型和严格纯 parser 归 contracts；Desktop shared 与 Manager 仅保留目录扫描、ZIP 摘要、sidecar 文件读写和 archive 校验宿主适配。
- Windows 卸载回执的 value 类型、完成事件 parser 和 timeout 常量归 contracts；Manager/Desktop shared 仅保留 `LOCALAPPDATA` 路径约束、结果文件等待、身份校验和 launcher 清理。contracts parser 使用内联对象边界检查，不新增本地 `isRecord` 守卫。
- `desktop/packaging/package-portable.mjs` 不再深导入 Manager `src/desktop-installation`，改消费 Manager `./desktop-installation` 正式入口。Manager build 产出 `desktop-installation-entry.mjs`，package exports 注册对应子路径。
- scripts 的 contracts 可承载项已切换到 contracts；I/O、安装器、runtime/tools wrapper、完整 Product verifier 和 restart verifier 的 Manager 深导入保留在临时清单中，没有伪造 contracts 出口或为单次调用增加 wrapper。

## 证据

- scripts Manager 深导入复核仍仅命中以下宿主 I/O/适配器：`scripts/deploy/windows-portable-manager.ts` 的 state/manifest/launcher/runtime/tools/version-info；`scripts/release/verify-windows-portable-restart.ts` 的 manifest-store/paths；`scripts/release/verify-windows-portable.ts` 与 `scripts/release/verify-windows-product.ts` 的完整 Product verifier；`scripts/release/windows-portable-manager.test.ts` 的 manifest-store 写入。另有 `nbook/server/agent/session/agent-session-store`，按既有 server 临时清单保留。
- Manager/Desktop 的 app/src 深导入复核未发现本轮新增残留；Desktop packaging 的 Manager 深导入已替换为正式 package subpath。

## 验证

| 命令/场景 | 结果 |
| --- | --- |
| contracts typecheck | `bun x tsc --noEmit -p packages/neuro-book-contracts/tsconfig.json`：通过 |
| Manager typecheck | `bun x tsc --noEmit -p packages/neuro-book-manager/tsconfig.json`：通过 |
| scripts typecheck | `bun x tsc --noEmit -p scripts/tsconfig.json`：通过 |
| Desktop contract suite | `bun x vitest run --config scripts/release/desktop-contract-vitest.config.ts`：13 files passed；41 tests passed |
| Windows uninstall focused test | `bun x vitest run --config scripts/release/desktop-contract-vitest.config.ts desktop/shared/src/windows-uninstall-result.test.ts`：1 file passed；3 tests passed |
| release focused tests | `bun x vitest run scripts/release/windows-portable-manager.test.ts scripts/release/verify-extracted-product.test.ts scripts/release/release-assets.test.ts`：3 files passed；29 tests passed |
| Manager build/pack | `bun run manager:build`、`bun run manager:pack`：通过；pack tarball 含 7 files，安装 smoke 通过 |
| Electron 门禁 | `bun run --cwd desktop/electron typecheck`、`build`、`audit`：通过 |
| Desktop 安全审计 | `bun desktop/packaging/security-audit.mjs`：全部 22 checks 为 `true` |
| frozen 安装 | root、`desktop/electron`、`packages/llmlint/web`、`packages/llmlint/skill` frozen install：均通过 |
| governance | `bun run governance:check`：`failures=[]`、`warnings=[]` |
| diff whitespace | `git diff --check`：目标范围通过；Windows LF/CRLF 转换提示保留 |
| S4 clean worktree | 从 `00dacf89` 新建 `.worktree/s4-clean-verify`；四份 lock SHA-256 前后不变；最终 `git status --short` 为空 |
| S4 clean 阶段测试 | contracts `6 files / 32 tests`、Desktop `13 files / 41 tests`、Manager `41 files / 330 passed / 3 skipped`：通过 |

## 未验收边界

- 未运行 S4 阶段要求之外的全量 workspace 回归、真实 Product/Provider、Docker、Windows runner、远端部署或发布；这些按计划在后续阶段执行。
- 真实生产 Product measurement、真实 provider/model、私有 corpus 和签名发行链仍未验收。

## 检查点

S4 `cross-host-boundaries` checkpoint 已由 `00dacf89` 的 clean worktree 验证确认绿色；S5 从应用 identity-only manifest 与双根解析器开始。