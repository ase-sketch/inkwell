# AGPL-3.0-only 许可证迁移

## Relative documents refs

- `../../../LICENSE`
- `../../../README.md`
- `../../../README.en.md`
- `../../../.gitignore`
- `../../../scripts/cli/sync-llmlint-skill.ts`
- sibling `../../../../llmlint/docs/tasks/20-agpl-license-migration/README.md`

## User Request / Topic

- 将 NeuroBook 从 PolyForm Noncommercial 1.0.0 改为 AGPLv3。
- 第三方文风、写作参考和旧 `ACKNOWLEDGEMENTS.md` 不再进入 Git，但开发机本地继续保留。
- llmlint 独立仓及其可安装 `skill/` package 同步采用同一许可证。
- 用户确认版权归属、外部贡献、商业使用、网络服务源码提供等迁移注意事项已经处理。

## Goal

- NeuroBook 与 llmlint 的当前源码、manifest 和对外文案统一使用 `AGPL-3.0-only`。
- Product source snapshot 只携带 Git tracked 源码，不重新带入本地第三方文风或写作参考。
- llmlint 继续保持 sibling `skill/` 为真相源，NeuroBook vendored snapshot 和真实 user runtime 由既有同步链刷新。

## Current State

- 根项目与 llmlint 原许可证均为 PolyForm Noncommercial 1.0.0。
- `assets/workspace/.nbook/agent/writing-presets/references` 和 `styles` 当前没有 Git tracked 文件；实际开发素材只存在于已忽略的 `workspace/`。
- `ACKNOWLEDGEMENTS.md` 仍被 Git 跟踪。

## Decisions / Discussion

- SPDX 固定为 `AGPL-3.0-only`，不使用 `or-later`，不附加非商业或竞品限制。
- GNU 官方 AGPLv3 完整原文作为 `LICENSE`，README 只提供用户可读摘要。
- 用户原创作品不会仅因使用 NeuroBook 自动适用 AGPL；另有许可证声明的独立第三方组件继续按各自许可证分发。
- 对本地第三方写作素材采用明确 `.gitignore` 路径约束，防止未来误进入公开仓库和 Product source snapshot。

## Verification / Test

- `bun run sync:neuro-book`：成功，初次输出 `copied=10, unchanged=86, removed=0`。
- `bun scripts/cli/sync-user-assets.ts`：成功，输出 `copied=2, skipped=279, updatedProfiles=0, updatedAssets=8`。
- `bun vitest run server/workspace-files/workspace-files.test.ts -t "同步系统 assets 会管理 Agent skills、模板和 CLI 辅助文件"`：1 passed，83 skipped。
- NeuroBook、llmlint 根、llmlint `skill/`、vendored snapshot 与真实 user runtime 共 5 份 `LICENSE` 内容完全一致，均为 GNU 官方 AGPLv3 661 行原文。
- 五份 package manifest 的许可证字段均为 `AGPL-3.0-only`。
- `ACKNOWLEDGEMENTS.md`：Git tracked 数为 0，本地文件仍存在；references/styles tracked 数均为 0，显式 ignore 命中。

## Implementation Walkthrough

- 已替换 NeuroBook 与 llmlint 的许可证原文，并更新第一轮 manifest、README 和宣传口径。
- 计划与实际的差异：文风和写作参考在开始本轮前已不受 Git 跟踪，因此不执行文件删除，只增加长期忽略规则；仅 `ACKNOWLEDGEMENTS.md` 需要从索引移除并保留本地。
- 同步偏差与处置：完整 llmlint 镜像首次带入 sibling `skill/` 中既有、非本任务的未提交功能改动；这些改动在 sibling 保持原样，NeuroBook tracked vendored snapshot 已收窄为本轮许可证相关的 `LICENSE`、中英文 README 和 `package.json`，避免夹带功能变更。真实 user runtime 属本地忽略资产，保持同步后的当前状态。

## TODO / Follow-ups

- 后续发布时由 `product:stage` 基于 Git tracked 文件重建 Product source snapshot；旧本地 `product/` 生成物不作为许可证真相源。
