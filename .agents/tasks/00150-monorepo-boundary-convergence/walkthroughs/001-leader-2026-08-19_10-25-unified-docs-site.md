---
schema: nbook.walkthrough/v1
taskId: 00150-monorepo-boundary-convergence
sequence: 001
role: leader
status: complete
createdAt: 2026-08-19T10:25:57Z
---

# 001-leader-2026-08-19_10-25-unified-docs-site.md

## 范围

完成批准计划第 2 阶段：VitePress tracked 正文收敛到 `vitepress/locales/{zh-Hans,en-US}/`，运行时通过 gitignored `.vitepress/staged/` 保持中文 `/`、英文 `/en/`；共享截图进入 `vitepress/public/images/`；新增六个自治项目、Desktop 与 monorepo 的双语用户入口。

## 物理迁移

- 原有中文 42 个 Markdown 整树迁入 `locales/zh-Hans/`，英文 42 个 Markdown 从 `en/` 迁入 `locales/en-US/`。
- 22 个共享图片从 `vitepress/images/` 迁入 `vitepress/public/images/`；正文图片统一使用 `/images/<file>`。
- 新增 9 对页面：`projects/` 总览、六个自治项目、`desktop.md`、`monorepo.md`。最终文件系统实计为中文 51 页、英文 51 页，集合完全对等。
- 导航和 sidebar 拆到 `.vitepress/locales/{zh-Hans,en-US}.ts`；删除即将失效的根 Reference 导航。

## Staging 与开发监听

`scripts/ci/stage-docs-locales.ts` 每次清空 staged，再复制中文到根、英文到 `en/`、public 到 `public/`，最后写 `.staging-complete.json`。`docs:dev` 与 `docs:build` 均先执行 `docs:stage`；`docs:preview` 只预览既有 dist。

第一版 watcher 让 Vite 同时观察 staged，clean rebuild 的删除窗口在诊断轮 PID `46464` 触发了真实错误：`Failed to resolve import "/images/tutorial-api-config-step-01-provider.png"`，HTTP 出现 500。最终实现让 Vite watcher 永久忽略 `**/.vitepress/staged/**`；canonical watcher 串行防抖执行完整 staging，完成后调用 `server.moduleGraph.invalidateAll()` 并发送 `full-reload`。不再暂停/恢复 Chokidar watcher。

真实 watcher smoke 使用当前 checkout：

- 最终验证轮 `hub describe docs-dev`：PID `33300`，command `bun run docs:dev`，cwd 为当前仓库根；PID `46464` 仅为修复前诊断轮，未作为通过证据。
- 新增 `vitepress/locales/zh-Hans/watcher-smoke.md` 后，staged 文件逐字出现，`GET /neuro-book/watcher-smoke.md` 返回唯一正文 `watcher isolated evidence 2026-08-19`。
- 删除 canonical 文件后，staged 文件不存在；VitePress dev 对不存在 URL 使用 HTTP 200 SPA shell，不能用状态码判定。自动化 Chromium 渲染后标题为 `404 | NeuroBook`，正文含 `PAGE NOT FOUND` 且不含 smoke 标识。
- 新增/删除全过程日志均未出现 `Internal server error`、`Failed to resolve` 或 `Docs locale staging failed`。临时 smoke 文件已删除，服务与自动化浏览器均已关闭。

## 治理与调用方

- `docs:check` 拒绝旧根正文、`vitepress/en/**`、`vitepress/images/**`、locale 内 `public/`、tracked staged、双语单边缺页和缺失 `/images/*`。
- 根 README、RELEASE、AGENTS、PROJECT-STATUS、Spec 注册表、manual-eval、release 治理、Profile TSX 示例扫描、system-assets projection、community/docs workflows 和教程图片治理均切到 canonical 路径。
- workflow trigger 与社区配置合同增加 `scripts/ci/stage-docs-locales*`。

## 实际验证

- `bun run docs:check`：`failures: []`，`checkedFiles: 5073`。
- `bun run docs:build`：VitePress `2.0.0-alpha.18` 构建成功，最终一轮 `7.18s`；仅有既有 chunk > 500 kB warning。
- dist 实物：中文/英文首页 `lang` 分别为 `zh-Hans` / `en-US`；六个自治项目页、项目总览、Desktop、monorepo 均有中英文 HTML；`official/index.html`、`official/en/index.html` 存在；`dist/images/` 恰有 22 个共享图片文件。
- `bun x vitest run --config scripts/vitest.config.ts scripts/ci/check-documentation.test.ts scripts/ci/tutorial-assets.test.ts scripts/ci/stage-docs-locales.test.ts scripts/ci/workspace-workflows.test.ts`：4 files / 29 tests passed。
- 应用包 cwd 下 `bun run test -- server/workspace-files/system-assets-projection.test.ts server/agent/profiles/docs-tsx-examples.test.ts`：2 files / 8 tests passed。此前从仓库根直接启动 Vitest 会因 artifact 依赖按进程 cwd 解析而误报 stale，不是产品缺陷。
- `bun scripts/ci/validate-community-files.ts`：31 个标签、5 个 Issue Form、16 个 YAML 通过。
- `git diff --check`：通过，仅输出既有 Windows LF/CRLF warning。

## 未执行

- 未执行浏览器人工验收；上述 Chromium 是无人值守 DOM 验证，只证明删除态渲染为 404，不宣称视觉、语言菜单、样式或 console 已人工通过。
- 未执行部署、发布、push、Docker、Windows runner/portable、真实 Provider/Model、数据库 migration 或最终 tag。
