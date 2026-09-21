---
schema: nbook.task/v1
taskId: 00149-monorepo-workspace-consolidation
actionIssueId: null
worktreeId: .worktree/monorepo-main-app-migration
branchId: chore/t149-monorepo-workspace
status: blocked
createdAt: 2026-08-16T14:59:07Z
updatedAt: 2026-08-19T10:35:00Z
---

# NeuroBook Workspace 收敛与主应用迁移

## 目标

按已批准的 `local://monorepo-main-app-migration-plan.md`，把 NeuroBook 收敛为单一 monorepo：主应用迁入 `packages/neuro-book`，六个独立项目收编为 workspace，跨宿主合同和测试基础设施拆成私有包，root 只保留 workspace、产品编排、发布和治理入口。

## 执行范围

- S0–S8 全部阶段、检查点和恢复规则。
- 原六个 checkout 只读取并导入快照；不修改、推送、归档、重命名或发布原仓。
- 根用户工作树现有改动作为输入保留；实现只在迁移分支/worktree进行。
- 浏览器、Docker、Windows runner、真实 provider/model、私有 corpus、远端部署和发布按计划的可执行/未验收边界记录。

## 权威来源

- 批准计划：`local://monorepo-main-app-migration-plan.md`
- 当前治理规则：根 `AGENTS.md`、`.agents/tasks/README.md`、`.agents/tasks/AGENTS.md`、相关作用域 `AGENTS.md`
- 当前产品规范：[Monorepo Module 边界与迁移规范](../../../docs/modules/monorepo-boundaries.md)
- 本任务只改变仓库物理边界、开发入口和治理方式；产品行为合同未变。

## 检查点

`S0-baseline-and-import-manifests`、`S1-common-governance-and-test-support`、`S2-import-independent-projects`、`S3-single-source-integrations`、`S4-cross-host-boundaries`、`S5-application-identity-roots-source-dev-prisma`、`S6-main-app-physical-cutover`、`S7-build-release-ci`、`S8-final-monorepo-workspace`。

## 完成标准

每个阶段聚焦验证、共同安装/治理门禁和阶段新增行为检查通过后才进入下一个阶段；失败保留现场并按计划从上一绿色检查点恢复。交付报告逐项列出实际命令、结果、未运行项、阻塞和数据不变性证据；不自行 push、merge、发布或删除用户数据。

S0 已完成基线提交、annotated tag 与专用迁移 worktree；S1 测试支持、治理门禁、显式 workspace 清单和冻结安装已完成；S2 已按 S0 manifest 将六个自治项目收编到 `packages/*`，保留 llmlint 的 `web`/`skill` 独立安装岛，完成逐文件摘要复核、自治治理资产、根忽略和 workspace lock 更新；S3 已删除 History/Workflow vendor、同步脚本和 llmlint tracked mirror，主应用切换正式 workspace 包入口，`packages/llmlint/skill` 成为唯一 Skill source 并接入 system assets projection，History/Workflow/llmlint/Product closure 与 root 全量回归通过；S4 已完成 Desktop 聚合 depot/卸载回执纯合同抽取、Shared/Manager 宿主适配器切换、Portable packager Manager 正式子路径入口和 scripts 可承载项迁移，并由 clean worktree 确认 checkpoint `00dacf89`；S5 已完成应用 identity-only manifest、repository/application 双根 resolver、平台用户级 Source Dev State/Cache 默认、Prisma application-root 路径和 Manager fixture 解耦，并由 clean worktree 确认 checkpoint `b3d202ff`。S6 workflow 侧道已完成：nb-workflow 按 T02/0.2.0 canonical 线和当前 monorepo 参数演化收敛；S7 已完成 master 治理编程、编码规范路由、文档治理和临时根合同的语义迁入；S8 已完成六包对账证据、根 workspace 导航、唯一 monorepo 边界正文、旧入口清零和 CI 硬门禁。整合提交为 `da42cc20`，双父为 `09844e2b` 与 `e9a1a9b6`。

本任务只改变仓库物理边界、开发入口和治理方式；产品行为合同未变。对账 verifier 固定要求六包及逐包 `allowlist/exact/classified`：`nb-history 28/25/3`、`nb-workflow 78/17/61`、`nb-ui 156/153/3`、`llmlint 739/720/19`、`neuro-agent-harness 296/292/4`、`nb-memory 35/32/3`；总计固定为 `1332/1239/93`，未分类、缺失、删除候选和复制动作均为 `0`。负回归覆盖空项目集、单包计数漂移和输入 hash 漂移，治理组合为 `5 files / 41 tests passed`。

## S6 证据

- `evidences/s6-workflow-params-summary.json` 记录 fingerprint/params 合同、实际命令结果、已批准 T02 计划外例外和未验收边界。
- `walkthroughs/010-leader-2026-08-18-workflow-params-side-channel.md` 记录本轮实现、验证、合并后门禁与 T02 处置更新。
- 用户已选择“批准并继续”：允许承认已发生的 `0fdec90bac0456b67045185c99cb8b829e75bd6c` 计划外源仓提交，并仅使用其等价内容作为迁移输入；不允许新的原仓写操作。
- 原仓 T02 immutability gate 不宣称 clean-green，作为用户批准的计划外例外保留；主仓本地迁移提交 `ba694892a21fec57cfc176f43819f84fef3fdbc1` 已完成，随后显式 merge `origin/master` 生成 `da3343919b52a482d562140517f8e4cd6229b9e3`；Task 继续保持 `blocked`，不创建最终 tag、不宣称绿色验收。
- S6 当时记录的 docs dead links、llmlint verdict fixture、Profile SDK 依赖边界和 worker error 已在后续修复并由 S7 evidence 复核；当前未解决项已收敛为 sibling allowlist 对账、根外 worktree、dirty clean-checkout 限制和未授权 runtime/platform 门禁。
- `bun run governance:check` 返回 `failures=[]`、`warnings=[]`；`bun run test:desktop-contract` 为 11 files / 37 tests passed。

## S7 证据

- `evidences/s7-build-release-ci-summary.json` 记录 workflow cwd 迁移、六包 matrix、llmlint Web island、Docker/Git-less 数据边界、文档 canonical link 修复和本地验证结果。
- 本轮已验证 `bun scripts/ci/validate-community-files.ts`（31 个标签、5 个 Issue Form、16 个 YAML）、`bun run docs:build`（构建完成，仅既有 chunk size warning）、九 workflow 结构合同（1 file / 7 tests）、Product/Docker/Git-less 合同（4 files / 28 tests）、Manager release 合同（1 file / 1 test）、release assets 合同（4 files / 32 tests）、Desktop 合同（11 files / 37 tests）、scripts typecheck、`bun run governance:check`（failures=[]、warnings=[]）和 `git diff --check`（退出码 0，保留预期 CRLF 警告）。
- S7 只证明迁移后的本地可执行合同；未执行或未接受项仍见 evidence 的 `notAccepted`，不把静态 CI 合同等同于远端 runner、真实 Docker、Windows portable、浏览器人工验收或发布成功。

## 最终洁净验证与主应用文档切换

- `evidences/final-verification-clean-runner-repair-summary.json` 记录 clean-runner 复现、前置缺陷修复、主应用 docs 切换与最终全量重跑结果；过程见 `walkthroughs/011-leader-2026-08-19-final-clean-runner-repair-and-docs-cutover.md`。
- 迁移 worktree 自身复现出：Manager 14 个类型诊断；llmlint 根 `typecheck` 缺 gitignored registry.json 前置；`testHostPath` 的 `test-paths` 父目录无创建者；Desktop 原诊断不成立。另发现应用包 17 个重复导入及 3 个迁移后测试缺陷，均已修复。
- 修复提交：`8bbf5296`（Manager/llmlint）、`fefbc81b`（test-support 父目录）、`5ac495a6`（主应用 docs）、`2ec6e5be`（应用测试漂移）。
- 最终验证（真实退出码）：Manager typecheck/test/build、Manager fresh-host、llmlint verify、Desktop build/audit、test-support、`docs:check`（5047 files，当前最终运行）、`governance:check`、治理/发布合同、scripts tsc、`docs:build` 全部通过；主应用 `bun run test -- --reporter=dot` 退出码 0，416 files passed / 1 skipped，3084 tests passed / 3 skipped。
- 早期文档切换运行曾记录 `docs:check` 为 5046 files；后续资源审计新增最终证据记录后，当前重跑实际为 5047 files。最终收口统一以 5047 files 为准。
- Task 继续保持 `blocked`：真实 Docker 镜像构建、Windows runner、浏览器人工验收、真实 Provider、Windows portable 和最终绿色 tag 仍未执行或未授权。
- 目录边界复核：`packages/neuro-book/assets/` 是主应用系统资产 canonical root；`desktop/` 保持根级 Desktop Envelope（Electron/Tauri）宿主；根 `assets/` 当前无 tracked 文件，观察到内容为被忽略的本机生成/运行残留；根 `reference/` 是仓库级 Reference Bookshelf；根 `patches/` 是 workspace patched dependency 输入。上述目录均非遗漏的主应用源码目录。
