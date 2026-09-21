# 仓库重建：删库同名重建 + git 历史重置为单提交

## Problem

Inkwell 大改后已明确不跟进上游（2026-09-21 拍板），但仓库仍背着完整的 neuro-book fork 历史（.git 85MB）与上游门面：README/徽章/QQ 群指向 notnotype，社区治理文件（ISSUE_TEMPLATE、labels、9 条上游 CI 流水线）、vitepress 文档站（245 文件）、desktop 桌面壳（决策 4 已明确不碰）都在仓库里。同时本地历史因 Linux 时代的 alternates 指向失效路径 /home/li/nb-full-mirror/objects 而断裂，4590627 基座之前的对象本地不可读。

## Decision

2026-09-22 重建仓库：

1. 全量备份到 E:\projects\inkwell-backup-2026-09-22\（含旧 .git，5926 文件 236MB）。
2. 删除 GitHub ase-sketch/inkwell 并同名 public 重建；本地 .git 重置为单个初始提交，不再保留上游 fork 历史与本 fork 的 34 个提交（决策史由 .agents/notes/ 文件承载，不进 git 历史）。
3. 删除上游门面：CONTRIBUTING(.en).md、PROJECT-STATUS.md、RELEASE.md、WATCHDOG.md、.omp/、.github/ 社区文件与 9 条上游流水线（仅留 windows-portable.yml）、vitepress/、desktop/，及配套失效脚本（docs:* / desktop:* / github:labels / stage-docs-locales / tutorial-assets / baseline-change-scope / community-labels / validate-community-files / workspace-workflows.test）。
4. 上游基座参考文档（docs/standards、specs、testing、modules、proposals、archived + 旧 docs/README、docs/AGENTS）隔离到 docs/upstream/，加归档横幅；docs/README.md 重写为 Inkwell 文档索引。
5. README.md/README.en.md 重写为 Inkwell 简洁版；package.json repository 改指 ase-sketch/inkwell；HANDOFF.md、docs/architecture.md、packages 内两处 AGENTS.md 的失效引用同步回写；scripts/release/AGENTS.md 改写为 Inkwell 便携 zip 发布口径。

## Alternatives considered

- **保留 Inkwell 自己的 34 个提交（graft 斩断上游）**：技术上要做 replace/graft，保留 fork 痕迹与断裂修复成本，与「一次性取材、重新出发」的意图不符，被否。
- **完整保留全部历史**：85MB 上游包袱留存，且本地对象已断裂需从 GitHub 重克隆修复——那删库重建就失去意义，被否。
- **docs 上游参考文档全删**：基座代码还在仓库里，这些文档仍是基座行为的参考；隔离保留成本很低，被否（选择移入 docs/upstream/）。
- **docs-tsx-examples.test.ts 整体删除**：该测试还守护 packages/neuro-book/assets/reference/agent 真相源，只删 vitepress 两个扫描目录即可，整体删除会丢守护，被否。

## Consequences

- 旧提交历史不可在线回溯；恢复手段 = 本地备份目录（含旧 .git）。
- 上游 community/docs/desktop 流水线能力随删除失去；若未来需要文档站或桌面壳需重建（上游源码仍可在 notnotype/neuro-book 查阅）。
- **已知预存问题**：scripts/ci/agent-governance.test.ts 17 条失败（Task ownership 解析、symlink/junction 门禁等），在重建前的备份树中同样失败，与本次清理无关，待独立排查。

## Confirmation

- bun install 绿（vitepress 依赖移除、lockfile 刷新、postinstall 构建通过）。
- docs-tsx-examples.test.ts 3/3 通过（去掉 vitepress 扫描目录后）。
- scripts/ci 其余测试 159 条通过；失败 17 条经备份树对照证实为预存问题。
- 远端验证：gh repo view ase-sketch/inkwell 确认重建后仓库存在且为新建。
