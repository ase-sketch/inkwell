# 任务上下文

生成时间：2026-08-19T08:29:41Z

## 基线快照

- 当前 checkout：仓库主工作区；分支 `master`。
- 当前 HEAD：`679621e5ff6a516b0a45873f21369d4913ea0567`。
- 分支状态：`master...origin/master [ahead 44]`；按批准约束不 fetch、不合并远端、不 push。
- tracked 文件：5047；精确路径清单见 `evidences/baseline-tracked-files.txt`，该文件 SHA-256 为 `5278b8c9791d23b956dadac63947387fc3397734492258c97dd43f15c9a3adf5`。

## 用户已有改动

以下 9 个文件是迁移输入，必须在最新内容上继续适配，不得覆盖、stash、reset 或还原：

- `.github/workflows/code-baseline.yml`
- `docs/standards/code/README.md`
- `docs/standards/code/agent-assets.md`
- `docs/standards/code/docs-site.md`
- `docs/standards/code/workspace-assets.md`
- `scripts/ci/validate-community-files.ts`
- `scripts/ci/workspace-workflows.test.ts`
- `scripts/smoke/smoke-agent.ts`
- `vitepress/.vitepress/config.ts`

基线 diff 统计：9 files，`+24/-15`。

## 授权与边界

- 权威执行计划：`local://monorepo-boundary-migration-plan.md`。
- 六个原仓只读；不 fetch、pull、checkout、reset、stash 或修改。
- 不执行远端写入、发布、部署、真实 Provider/Model、数据库 migration、Docker、Windows runner/portable、浏览器人工验收、最终绿色 tag 或旧 worktree 删除。
- 测试、fixture、staging scratch 和验收数据使用 `@notnotype/neuro-book-test-support` 分配的系统临时根；VitePress `.vitepress/staged` 是明确 gitignored 的开发生成目录。

## 迁移不变量

1. 公开文档 URL 保持中文 `/` 与英文 `/en/`；locale 按 staged 源路径判定。
2. 应用 `#scripts/*` 只保留 `source-dev.ts` 到根 `workspace-roots.ts` 的唯一 bridge。
3. 91 个应用 Task 共 855 个文件字节不变移动；旧 legacy ledger 原样保留。
4. Profile `Import path="reference/**"` 逻辑协议不改；Source/Product 物理 root 切到应用 owner。
5. Desktop 保持根级 Envelope；UAC 实现归 Manager，线协议归 contracts，Electron/packaging 只消费正式 subpath。
